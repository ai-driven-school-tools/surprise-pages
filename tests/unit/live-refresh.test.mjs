import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';

const dir=await mkdtemp(path.join(tmpdir(),'live-refresh-'));
const out=path.join(dir,'live-refresh.mjs');
await build({entryPoints:['src/lib/comments/live-refresh.ts'],bundle:true,platform:'node',format:'esm',outfile:out});
const {LIVE_REFRESH,nextLiveRefreshDelay}=await import(pathToFileURL(out).href);
test.after(()=>rm(dir,{recursive:true,force:true}));

const awake={visible:true,editing:false,idleForMs:0,failures:0};

test('見えていて操作があれば、決めた間隔で読み直す',()=>{
 assert.equal(nextLiveRefreshDelay(awake),LIVE_REFRESH.intervalMs);
 assert.equal(nextLiveRefreshDelay({...awake,idleForMs:LIVE_REFRESH.idleAfterMs-1}),LIVE_REFRESH.intervalMs);
});

test('隠れたタブと編集中は止まる（保存先を起こし続けない）',()=>{
 assert.equal(nextLiveRefreshDelay({...awake,visible:false}),null);
 assert.equal(nextLiveRefreshDelay({...awake,editing:true}),null);
});

test('決めた時間だけ操作が無ければ止まる',()=>{
 assert.equal(nextLiveRefreshDelay({...awake,idleForMs:LIVE_REFRESH.idleAfterMs}),null);
 assert.equal(nextLiveRefreshDelay({...awake,idleForMs:LIVE_REFRESH.idleAfterMs*3}),null);
});

test('失敗が続くと 2 倍ずつ伸び、上限で止まり、成功で元に戻る',()=>{
 const delays=[1,2,3,4,5,9].map(failures=>nextLiveRefreshDelay({...awake,failures}));
 assert.deepEqual(delays,[10_000,20_000,40_000,60_000,60_000,60_000]);
 assert.equal(nextLiveRefreshDelay({...awake,failures:0}),LIVE_REFRESH.intervalMs);
});

test('数は 1 か所の定数で、放置の判定は間隔より長く、失敗の上限は間隔より長い',()=>{
 assert.ok(LIVE_REFRESH.idleAfterMs>LIVE_REFRESH.intervalMs);
 assert.ok(LIVE_REFRESH.failureMaxMs>LIVE_REFRESH.intervalMs);
});
