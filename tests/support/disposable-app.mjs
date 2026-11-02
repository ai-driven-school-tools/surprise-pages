/**
 * 手元で「使い捨ての保存先 ＋ 本番と同じ組み立てのアプリ」を起こす部品。
 * 自動の検査（serve-app.mjs）と、人が画面で確かめる検証環境（scripts/local-verify.mjs）が共有する。
 *
 * ログインを飛ばす口は作らない。名乗りは Auth.js の正規のセッション（next-auth/jwt の encode）を、
 * 毎回作る使い捨ての署名の鍵で作るだけ。本番の署名の鍵とは別物なので、本番では無効。
 */
import {createServer} from 'node:net';
import {execFileSync, spawn} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import path from 'node:path';
import {appendFileSync} from 'node:fs';
import {encode} from 'next-auth/jwt';
import {prepareTestApp,buildTestApp,restoreTestBuild} from './test-app-build.mjs';
import {mkdir,realpath} from 'node:fs/promises';

/** Auth.js が http の宛先で使うセッションの cookie の名前（署名の salt も同じ名前）。 */
export const SESSION_COOKIE = 'authjs.session-token';

/** 127.0.0.1 で空いているポートを 1 つ取る。 */
export async function freeLocalPort() {
  const reserve = createServer();
  await new Promise(resolve => reserve.listen(0, '127.0.0.1', resolve));
  const address = reserve.address();
  if (!address || typeof address === 'string') throw new Error('検査用の接続先を用意できません');
  await new Promise(resolve => reserve.close(resolve));
  return address.port;
}

/** 指定のポートが 127.0.0.1 で空いているか（組み立てに数分かける前に確かめる）。 */
export async function portIsFree(port) {
  const probe = createServer();
  const free = await new Promise(resolve => { probe.once('error', () => resolve(false)); probe.listen(port, '127.0.0.1', () => resolve(true)); });
  if (free) await new Promise(resolve => probe.close(resolve));
  return free;
}

/**
 * 使い捨ての PostgreSQL（embedded-postgres）。temp の中にだけ作り、127.0.0.1 でだけ待ち受ける。
 * adminUrl は初期設定用の接続（アプリへは渡さず、initializeDatabase が作る制限付きの接続を渡す）。
 *
 * 部品は使う時にだけ読み込む。embedded-postgres は読み込んだ時点で終了の仕掛け（async-exit-hook）を
 * 張り、終わり際に終了コードを 0 で上書きするため。起動前に断るだけの実行では読み込まない。
 */
export async function disposableDatabase(temp, {log} = {}) {
  const {default: EmbeddedPostgres} = await import('embedded-postgres');
  const port = await freeLocalPort();
  const password = randomBytes(24).toString('hex');
  const cluster = new EmbeddedPostgres({databaseDir:path.join(temp,'db'), user:'test_admin', password,
    port, persistent:false, postgresFlags:['-h','127.0.0.1','-k',temp],
    initdbFlags:['--encoding=UTF8','--no-locale'], onLog:log ? message=>appendFileSync(log,message) : ()=>{}, onError:()=>{}});
  let running = false;
  return {
    adminUrl: `postgres://test_admin:${password}@127.0.0.1:${port}/postgres`,
    async start() { await cluster.initialise(); await cluster.start(); running = true; },
    async stop() { if (running) { running = false; await cluster.stop(); } },
  };
}

/**
 * 子プロセス（組み立て・next start）を 1 本ずつ走らせる。stop() 以降は新しく走らせない。
 * output は子の標準出力・標準エラーの行き先（'inherit' か開いたファイルの番号）。
 */
export function childProcesses({output = 'inherit'} = {}) {
  let child;
  let stopping = false;
  return {
    run(args, cwd, env) {
      if (stopping) throw new Error('検査を終了しました');
      return new Promise((resolve, reject) => {
        child = spawn(process.execPath, args, {cwd, env, stdio:['ignore', output, output]});
        child.once('error', reject);
        child.once('exit', code => code === 0 ? resolve() : reject(new Error('検査用アプリの実行に失敗しました')));
      });
    },
    stop(signal = 'SIGTERM') { stopping = true; child?.kill(signal); },
    get stopping() { return stopping; },
  };
}

/** リポジトリを一時の写しへ移して、本番と同じ組み立てを行う（prebuilt があればそれを戻す）。 */
export async function buildDisposableApp({root, app, env, run, prebuilt}) {
  await prepareTestApp(root, app);
  if (prebuilt) await restoreTestBuild(root, app, path.resolve(prebuilt));
  else await buildTestApp(root, app, env, run);
}

/**
 * 直しをすぐ映す開発の起こし方（next dev）の下ごしらえ。組み立ては省き、pnpm dev と同じく
 * 道具箱と自前で配る道具だけを先に作る。写しは prepareTestApp と同じ（画像の置き場は検査用）。
 */
export async function prepareDisposableDevApp({root, app, env, run}) {
  await prepareTestApp(root, app);
  await mkdir(path.join(app,'src/widget/dist'),{recursive:true});
  // 本当の道で呼ぶ（近道のままだと脚本が黙って何もしない。test-app-build.mjs の buildTestApp と同じ理由）
  const real = await realpath(app);
  await run([path.join(real,'scripts/build/widget.mjs')],real,env);
  await run([path.join(real,'scripts/build/vendor.mjs')],real,env);
}

/** 写しの上で next dev を 127.0.0.1 に起こす。止まるまで戻らない。NODE_ENV は next dev が決める。 */
export function startDisposableDevApp({root, app, env, port, run}) {
  const devEnv = {...env};
  delete devEnv.NODE_ENV;
  return run([path.join(root,'node_modules/next/dist/bin/next'),'dev','--webpack','--hostname','127.0.0.1','--port',String(port)], app, devEnv);
}

/**
 * 作業フォルダが写しの中にあるプロセスの番号。next dev は本体（next-server）を自分と切り離して起こすので、
 * 起こした子を止めても本体が残り、保存先への接続を握ったままになる。写しの中で動いているものは全部こちらが起こしたもの。
 * 終了の間際でも呼べるよう同期で調べる。
 */
export function processesInside(app) {
  let listing = '';
  try { listing = execFileSync('lsof', ['-a', '-d', 'cwd', '-Fpn'], {encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 * 1024 * 1024}); }
  catch (error) { listing = typeof error?.stdout === 'string' ? error.stdout : ''; }
  const inside = [];
  let pid = 0;
  for (const line of listing.split('\n')) {
    if (line.startsWith('p')) pid = Number(line.slice(1));
    else if (line.startsWith('n') && pid > 1 && pid !== process.pid) {
      const cwd = line.slice(1);
      if (cwd === app || cwd.startsWith(`${app}${path.sep}`)) inside.push(pid);
    }
  }
  return inside;
}

/** 写しの中で動いているプロセスへ合図を送る。戻り値は送った数。 */
export function signalProcessesInside(app, signal) {
  const pids = processesInside(app);
  for (const pid of pids) { try { process.kill(pid, signal); } catch { /* 既に止まっている */ } }
  return pids.length;
}

/** 写しの中のプロセスを止め、決めた時間を過ぎても残っていれば強制的に止める。 */
export async function stopProcessesInside(app, graceMs = 3000) {
  if (!signalProcessesInside(app, 'SIGTERM')) return;
  for (let waited = 0; waited < graceMs; waited += 200) {
    await new Promise(resolve => setTimeout(resolve, 200));
    if (!processesInside(app).length) return;
  }
  signalProcessesInside(app, 'SIGKILL');
}

/** 組み立てたアプリを 127.0.0.1 で起こす。止まるまで戻らない。 */
export function startDisposableApp({root, app, env, port, run}) {
  return run([path.join(root,'node_modules/next/dist/bin/next'),'start','--hostname','127.0.0.1','--port',String(port)], app, env);
}

/**
 * Auth.js の正規のセッション（JWT）を、使い捨ての署名の鍵で作る。
 * org は手形を作った宛先の組織の目印。無ければ印の無い手形（最初の組織 の宛先で作ったものとして読まれる）。
 */
export function sessionToken(secret, {email, name, sub, org}, maxAge = 3600) {
  return encode({secret, salt:SESSION_COOKIE, token:{email, name, sub, ...(org ? {org} : {})}, maxAge});
}
