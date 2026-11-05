import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { root } from './paths.mjs';

const run = promisify(execFile);
const directory = await mkdtemp(join(tmpdir(), 'publish-update-'));
const first = 'a'.repeat(40), next = 'b'.repeat(40);
let head = first, calls = [], sourceStatus = 200, race = false, reverts = false;
const server = createServer(async (request, response) => {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  const data = Buffer.concat(chunks);
  const url = new URL(request.url, 'http://localhost');
  calls.push({path: url.pathname, method: request.method, data});
  const reply = (status, body) => { response.writeHead(status, {'content-type': 'application/json'}); response.end(JSON.stringify(body)); };
  if (url.pathname === '/api/pages/source') return reply(sourceStatus, sourceStatus === 200 ? {html: '<body data-deck>現在の本文</body>', versionId: head} : {error: '読めません'});
  if (url.pathname === '/api/pages/deck-edit/assets') return reply(201, {src: '_deck/media-test.png'});
  if (url.pathname === '/api/pages/prepare') { if (race) head = next; return reply(200, {versionId: head, frozen: 0}); }
  if (url.pathname === '/api/pages') {
    const payload = JSON.parse(data);
    if (reverts) return reply(409, {error: 'このまま送ると、ブラウザやAIが直した 1 か所が消えるため止めました'});
    return payload.baseVersionId === head ? reply(200, {versionNumber: 2}) : reply(409, {error: '競合しました'});
  }
  reply(404, {});
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const env = {...process.env, PAGES_HOST: origin, PAGES_TOKEN_ORIGIN: origin, PAGES_TOKEN: 'local-test-only', PAGES_NO_UPDATE_CHECK: '1'};
const cli = (...args) => run(process.execPath, [`${root}/bin/pages-publish.mjs`, ...args], {env, cwd: directory});
const test = async (name, fn) => { calls = []; head = first; sourceStatus = 200; race = false; reverts = false; await fn(); console.log(`OK  ${name}`); };
try {
  await writeFile(join(directory, 'image.png'), Buffer.from([1, 2, 3]));
  await writeFile(join(directory, 'index.html'), '<body data-deck>更新した本文</body>');
  await test('現在の本文と完全な版を機械用に取得できる', async () => {
    const result = JSON.parse((await cli('get', '--slug', 'test', '--json')).stdout);
    assert.equal(result.versionId, first); assert.match(result.html, /現在の本文/);
  });
  await test('見つからないページだけ新規扱いにできる', async () => {
    sourceStatus = 404;
    assert.equal(JSON.parse((await cli('get', '--slug', 'test', '--json', '--allow-missing')).stdout), null);
    sourceStatus = 401;
    await assert.rejects(cli('get', '--slug', 'test', '--json', '--allow-missing'));
  });
  await test('画像は既存の編集用窓口に中身を送る', async () => {
    const result = JSON.parse((await cli('upload-image', '--slug', 'test', '--file', 'image.png', '--base-version', first)).stdout);
    assert.equal(result.src, '_deck/media-test.png');
    assert.deepEqual(calls.map(c => c.path), ['/api/pages/source', '/api/pages/deck-edit/assets']);
    assert.deepEqual(calls[1].data, Buffer.from([1, 2, 3]));
  });
  await test('古い版や版の省略では画像を送らない', async () => {
    await assert.rejects(cli('upload-image', '--slug', 'test', '--file', 'image.png', '--base-version', next));
    await assert.rejects(cli('upload-image', '--slug', 'test', '--file', 'image.png'));
    assert.ok(calls.every(c => c.method === 'GET'));
  });
  await test('本文だけの更新は素材削除一覧を送らない', async () => {
    await cli('--file', 'index.html', '--slug', 'test', '--base-version', first);
    const body = JSON.parse(calls.find(c => c.path === '/api/pages').data);
    assert.equal(body.baseVersionId, first); assert.equal('keep' in body, false);
  });
  await test('送信直前と保存時の競合は強制上書きせず停止する', async () => {
    await assert.rejects(cli('--file', 'index.html', '--slug', 'test', '--base-version', next));
    assert.ok(calls.every(c => c.method === 'GET'));
    calls = []; race = true;
    await assert.rejects(cli('--file', 'index.html', '--slug', 'test', '--base-version', first));
    assert.equal(calls.filter(c => c.path === '/api/pages').length, 1);
  });
  await test('古い原稿で直しを巻き戻す送り直しは、サーバーの断りに取り寄せ直しの手順を添えて止まる', async () => {
    reverts = true;
    const failed = await cli('--file', 'index.html', '--slug', 'test', '--base-version', first).then(() => null, error => error);
    assert.ok(failed, '止まらなかった');
    assert.match(failed.stderr, /直した 1 か所が消える/);
    assert.match(failed.stderr, /pages-publish get --slug test --out/);
    assert.equal(calls.filter(c => c.path === '/api/pages').length, 1);
  });
} finally {
  await new Promise(resolve => server.close(resolve));
  await rm(directory, {recursive: true, force: true});
}
