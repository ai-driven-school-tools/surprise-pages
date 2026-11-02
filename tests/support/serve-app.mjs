/** Real production-build app + throwaway PostgreSQL. No login bypass, no .env copies. */
import {readFile, mkdtemp, mkdir, realpath, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomBytes} from 'node:crypto';
import {createRequire} from 'node:module';
import {build} from 'esbuild';
import {initializeDatabase} from '../../scripts/setup/database.mjs';
import {appEnvironment} from './environment.mjs';
import {buildDisposableApp,childProcesses,disposableDatabase,sessionToken,startDisposableApp} from './disposable-app.mjs';
import {deckStressSample} from './deck-stress.mjs';
import {put as putTestAsset} from './blob-store.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const temp = await realpath(await mkdtemp(path.join(tmpdir(), 'pages-e2e-')));
const app = path.join(temp, 'app');
const runtime = path.resolve(process.env.PAGES_TEST_RUNTIME ?? path.join(root, '.test-runtime'));
const port = Number(process.env.PAGES_TEST_PORT ?? 3129);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('検査用ポートが正しくありません');
const secret = randomBytes(32).toString('hex');
const cluster = await disposableDatabase(temp);
let store;
const children = childProcesses();
const run = children.run;
const stop = () => { children.stop(); };
process.once('SIGTERM',stop);
process.once('SIGINT',stop);

/**
 * 検査の人。設置した本人（owner）と、招いた人（reader）。管理画面を開けるのは本人だけなので、admin は本人と同じ人。
 * アドレスはどれも架空（example.com）。
 */
const OWNER = 'owner@example.com';
const PEOPLE = {owner: OWNER, admin: OWNER, reader: 'reader@example.com'};

try {
  await cluster.start();
  const databaseEnvironment={DATABASE_URL:await initializeDatabase(cluster.adminUrl, OWNER)};
  const origin = `http://127.0.0.1:${port}`;
  delete process.env.DATABASE_URL;
  // 画像の置き場は検査用の置き場（PAGES_TEST_ASSETS）。設置の不足の案内に引っかからないよう、鍵は形だけの値を入れる
  const siteEnvironment={PAGES_EDITION:'personal',PAGES_OWNER_EMAIL:OWNER,PAGES_SITE_URL:origin,BLOB_READ_WRITE_TOKEN:'vercel_blob_rw_test_notreal'};
  Object.assign(process.env,{...databaseEnvironment,...siteEnvironment,PAGES_TEST_ASSETS:path.join(temp,'assets')});
  const stub = path.join(temp,'stub.mjs');
  await writeFile(stub, `export const auth=async()=>null;
export const headers=async()=>({get:()=>null}); export const cookies=async()=>({get:()=>undefined});
export const dangerouslyDeleteByTag=async()=>{}; export const waitUntil=()=>{}; export const getCache=()=>({get:async()=>null,set:async()=>{},delete:async()=>{},expireTag:async()=>{}});`);
  const out = path.join(temp,'seed.cjs');
  await build({stdin:{contents:`export * from './src/lib/db/database'; export * from './src/lib/pages/store'; export {newDeckDocument} from './src/lib/deck/new-document';export {authorSlide} from './src/lib/deck/authoring'; export {issueToken} from './src/lib/identity/publish-tokens'; export {currentOrganization} from './src/lib/organization/scope'; export {grantToMember} from './src/lib/access/roster';`,resolveDir:root,loader:'ts'},
    bundle:true,platform:'node',format:'cjs',outfile:out,alias:{'@/auth':stub,'next/headers':stub,'@vercel/functions':stub}});
  store = createRequire(import.meta.url)(out);
  const organization = await store.currentOrganization();
  const author = {email:OWNER,name:'検査用の作成者'};
  const article = '<!doctype html><html lang="ja"><head><meta charset="utf-8"><title>検査用の記事</title></head><body><h1>検査用の記事</h1><p>最初の本文</p><p><strong>装飾を残す</strong></p></body></html>';
  const heavy = await deckStressSample(path.join(temp,'heavy'),300);
  for(let i=0;i<8;i++)await putTestAsset(`internal/performance/large-deck/stress-image-${i}.png`,await readFile(path.join(temp,'heavy',`stress-image-${i}.png`)),{access:'private',contentType:'image/png'});
  const pages = {};
  for (const [name,html] of [['article',article],['private',article],['public',article],['deck',await store.newDeckDocument()]]) {
    pages[name] = await store.commitRevision({organization,pageSlug:`internal/test/${name}`,html,author,message:'人工データ'});
  }
  pages['large-deck']=await store.commitRevision({organization,pageSlug:"internal/performance/large-deck",html:await readFile(heavy.file,"utf8"),author,message:"人工の負荷検査資料"});
  // サイドバーの幅（15rem）を超える長い題の資料。星を付けるとサイドバーに名前が並ぶので、省略されてはみ出さないことを見る
  // （呼び名は `/test/` の検索に掛からない場所に置き、ほかの検査が数える件数を動かさない）
  const longTitle='サイドバーの幅を超える長い題の検査用の記事 — 請求・実測・削減案・採算の完全版';
  pages['long-title']=await store.commitRevision({organization,pageSlug:'internal/sidebar/long-title',html:article.replaceAll('検査用の記事',longTitle),author,message:'人工データ'});
  for (const [name,visibility] of [['private','restricted'],['public','public']]) {
    const result = await store.orgDb(organization).from('pages').update({visibility}).eq('id',pages[name].page.id);
    if (result.error) throw new Error('検査データの準備に失敗しました');
  }
  // 招いた人（reader）に、本人だけに閉じていない資料を見せる（資料は招待するまで本人だけが開ける）
  for (const name of ['article','public','deck','large-deck','long-title']) await store.grantToMember(organization, pages[name].page.id, PEOPLE.reader, OWNER);
  // 投稿コマンドと窓口を鍵で名乗って叩くための、使い捨ての保存先にだけある鍵
  const tokens = {owner:(await store.issueToken(organization,author,'検査用')).token};
  await store.closeDatabase(); store = undefined;
  const env = appEnvironment({origin,secret,extra:{...databaseEnvironment,...siteEnvironment,PAGES_TEST_ASSETS:path.join(temp,'assets')}});
  await buildDisposableApp({root,app,env,run,prebuilt:process.env.PAGES_TEST_BUILD});
  const sessions = {};
  for (const [role,email] of Object.entries(PEOPLE)) sessions[role] = await sessionToken(secret,{email,name:`検査用${role}`,sub:role});
  await mkdir(runtime,{recursive:true,mode:0o700});
  await writeFile(path.join(runtime,'session.json'),JSON.stringify({origin,sessions,tokens,
    pages:Object.fromEntries(Object.entries(pages).map(([name,value])=>[name,{versionId:value.versionId}]))}),{mode:0o600});
  await startDisposableApp({root,app,env,port,run});
} finally {
  stop();
  await store?.closeDatabase();
  await cluster.stop();
  await rm(temp,{recursive:true,force:true});
  await rm(path.join(runtime,'session.json'),{force:true});
}
