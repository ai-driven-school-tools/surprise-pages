import assert from 'node:assert/strict';
import {companyDeployment} from '../checks/paths.mjs';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createServer} from 'node:net';
import {randomBytes,randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import {build} from 'esbuild';
import postgres from 'postgres';
import EmbeddedPostgres from 'embedded-postgres';
import {initializeDatabase} from '../../scripts/setup/database.mjs';

// 既にあるスライドを原稿から丸ごと送り直すときの巻き戻しの確かめ（src/lib/deck/edit/republish-source.ts）を、本物の PostgreSQL に積んだ版で見る。
// 判定そのもの（src/lib/deck/edit/republish-guard.ts）は deck-republish-guard.test.mjs が見る。ここで見るのは「最後に原稿から投稿した版」を
// 保存先から引く部分——ブラウザの共同編集（受領は deck_edit_receipts）と、AI の直し（page-agent と同じ 1 件ずつの保存・
// 共同編集の前の資料では版の edit_operation_id だけ）のあとに、直しを含まない原稿を送り直したら巻き戻しとして返し、直しを含めた原稿なら通すこと。
const SURPRISE=Object.freeze({id:'00000000-0000-4000-8000-000000000001',assetPrefix:''});
const root=path.resolve(import.meta.dirname,'../..');
const temp=await mkdtemp(path.join(tmpdir(),'deck-republish-pg-'));
const reserve=createServer();await new Promise(resolve=>reserve.listen(0,'127.0.0.1',resolve));
const {port}=reserve.address();await new Promise(resolve=>reserve.close(resolve));
const password=randomBytes(24).toString('hex');
const cluster=new EmbeddedPostgres({databaseDir:path.join(temp,'db'),user:'test_admin',password,port,persistent:false,
 postgresFlags:['-h','127.0.0.1','-k',temp],initdbFlags:['--encoding=UTF8','--no-locale'],onLog:()=>{},onError:()=>{}});
let started=false,sql,api;
const check=async(name,run)=>{await run();console.log('OK  '+name);};
try{
 await cluster.initialise();await cluster.start();started=true;
 const admin=`postgres://test_admin:${password}@127.0.0.1:${port}/postgres`;
 process.env.DATABASE_URL=await initializeDatabase(admin,'owner@example.com');
 process.env.PAGES_EDITION='company';sql=postgres(admin,{max:2});
 const stub=path.join(temp,'stub.mjs');
 await writeFile(stub,`export const ALLOWED_DOMAIN='example.com';export const auth=async()=>null;export const headers=async()=>({get:()=>null});export const cookies=async()=>({get:()=>undefined});export const warmPageHtml=async()=>{};export const dropPageDelivery=async()=>{};export const expirePageAssets=async()=>{};`);
 const outfile=path.join(temp,'api.cjs');
 await build({stdin:{contents:`export * from './src/lib/pages/store';export * from './src/lib/deck/edit/store';export * from './src/lib/deck/edit/service';export * from './src/lib/deck/edit/text-sync';export * from './src/lib/deck/edit/source';export * from './src/lib/deck/edit/republish-source';export * from './src/lib/db/database';`,resolveDir:root},bundle:true,platform:'node',format:'cjs',outfile,
  plugins:[companyDeployment,{name:'framework-boundary',setup(b){b.onResolve({filter:/^@\/auth$|^next\/headers$|page-cache$/},()=>({path:stub}));}}]});
 api=createRequire(import.meta.url)(outfile);
 const owner={kind:'member',email:'owner@example.com',name:'試験用',image:null,organization:{id:SURPRISE.id,assetPrefix:'',role:'admin'}};

 const SUBTITLE='手元で動かすまで',BROWSER=SUBTITLE+'（ブラウザで直した）';
 const STATEMENT='困ったら、まず doctor。',AGENT='困ったら、まず doctor を走らせる。';
 const original='<!doctype html><html lang="ja"><head><title>送り直し</title></head><body data-deck><main data-deck-slides>'
  +`<section data-deck-slide><h1>手元で動かす</h1><p>${SUBTITLE}</p></section>`
  +`<section data-deck-slide><p>${STATEMENT}</p></section></main></body></html>`;
 // 投稿の入口（src/app/api/pages/route.ts）と同じ積み方で、原稿から版を積む
 const publish=(slug,html,expectedHead)=>api.commitRevision({organization:SURPRISE,pageSlug:slug,html,author:owner,message:'原稿から投稿',preserveDeckAppearance:true,...(expectedHead?{expectedHead}:{})});
 const nodeWith=(html,text)=>{const node=api.prepareDeckEdit(html).nodes.find(item=>item.textRuns.map(run=>run.text).join('')===text);assert.ok(node,`「${text}」の要素が無い`);return node.id;};
 const pairs=conflicts=>conflicts.map(item=>[item.current,item.proposed]);
 const firstVersion=async page=>(await sql`select version_id from public.page_revisions where page_id=${page.id} and version_number=1`)[0].version_id;
 // 編集画面を開いたとき（共同編集を始める）と、打った文の保存
 const openInBrowser=store=>api.saveDeckOperations(store,{id:randomUUID(),author:owner.email,client:'browser',protocol:2,activate:true,operations:[]});
 const typeInBrowser=async(store,head,before,after)=>{
  const target=nodeWith(head.html,before);
  const replica=new api.DeckTextReplica(head.collaboration.fields[`${target}/0`]);
  try{
   return await api.saveDeckOperations(store,{id:randomUUID(),author:owner.email,client:'browser',protocol:2,epoch:head.collaboration.epoch,baseVersionId:head.versionId,
    operations:[{kind:'text',target,run:0,before,after,sync:replica.replace(after)}]});
  }finally{replica.destroy();}
 };
 // 手元の AI の口（src/lib/page-agent/service.ts）と同じ形の 1 件の保存
 const applyByAgent=(store,head,before,after)=>api.saveDeckOperations(store,{id:randomUUID(),author:owner.email,client:'agent',summary:'AI の直し',strictTargets:true,
  baseVersionId:head.versionId,operations:[{kind:'text',target:nodeWith(head.html,before),run:0,before,after}]});

 await check('ブラウザの共同編集のあと、直しを含まない原稿の送り直しを巻き戻しとして返し、直しを含めた原稿は通す',async()=>{
  const {page}=await publish('internal/test/republish-browser',original);
  const store=api.deckEditStore(page,owner);
  const opened=await openInBrowser(store);
  await typeInBrowser(store,opened,SUBTITLE,BROWSER);
  const head=await store.read();
  assert.match(head.html,/ブラウザで直した/);
  assert.equal(await api.lastSourcePublishOf(page),await firstVersion(page));
  assert.deepEqual(pairs(await api.deckRepublishConflicts(page,head.html,original)),[[BROWSER,SUBTITLE]]);
  assert.deepEqual(await api.deckRepublishConflicts(page,head.html,original.replace(SUBTITLE,BROWSER)),[]);
 });

 await check('ブラウザの直しに AI の直しが続いても、両方を巻き戻す原稿を返し、両方を含めた原稿は通す',async()=>{
  const {page}=await publish('internal/test/republish-browser-agent',original);
  const store=api.deckEditStore(page,owner);
  const typed=await typeInBrowser(store,await openInBrowser(store),SUBTITLE,BROWSER);
  await applyByAgent(store,typed,STATEMENT,AGENT);
  const head=await store.read();
  assert.equal(await api.lastSourcePublishOf(page),await firstVersion(page));
  assert.deepEqual(pairs(await api.deckRepublishConflicts(page,head.html,original)),[[BROWSER,SUBTITLE],[AGENT,STATEMENT]]);
  assert.deepEqual(await api.deckRepublishConflicts(page,head.html,original.replace(SUBTITLE,BROWSER).replace(STATEMENT,AGENT)),[]);
 });

 await check('共同編集を始める前の資料への AI の直しも、巻き戻す原稿を返す',async()=>{
  const {page}=await publish('internal/test/republish-agent',original);
  const store=api.deckEditStore(page,owner);
  await applyByAgent(store,await store.read(),STATEMENT,AGENT);
  const head=await store.read();
  assert.equal(head.collaboration,undefined);
  assert.equal(await api.lastSourcePublishOf(page),await firstVersion(page));
  assert.deepEqual(pairs(await api.deckRepublishConflicts(page,head.html,original)),[[AGENT,STATEMENT]]);
 });

 await check('直しを含めて送り直したあとは、その版が新しい元になり、同じ原稿の送り直しを止めない',async()=>{
  const {page}=await publish('internal/test/republish-again',original);
  const store=api.deckEditStore(page,owner);
  const typed=await typeInBrowser(store,await openInBrowser(store),SUBTITLE,BROWSER);
  const merged=original.replace(SUBTITLE,BROWSER);
  const again=await publish(page.pageSlug,merged,typed.versionId);
  assert.equal(await api.lastSourcePublishOf(page),again.versionId);
  const head=await store.read();
  assert.deepEqual(await api.deckRepublishConflicts(page,head.html,merged),[]);
  // 新しい元のあとに直していなければ、何を送っても止めない
  assert.deepEqual(await api.deckRepublishConflicts(page,head.html,original),[]);
 });
}finally{
 await api?.closeDatabase();await sql?.end();if(started)await cluster.stop();await rm(temp,{recursive:true,force:true});
}
