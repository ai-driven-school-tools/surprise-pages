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

/** 最初の組織（最初の組織）。移行が既存の行をこの組織へ写す。lib の関数へ直に渡す組織はこれを使う */
const SURPRISE=Object.freeze({id:'00000000-0000-4000-8000-000000000001',assetPrefix:''});
const root=path.resolve(import.meta.dirname,'../..');
const temp=await mkdtemp(path.join(tmpdir(),'deck-collaboration-pg-'));
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
 // 会社の人かは組織への所属で決まる。移行の会社の行（最初の組織・admins → admin）を入れる
 process.env.PAGES_EDITION='company';sql=postgres(admin,{max:2});
 const stub=path.join(temp,'stub.mjs');
 await writeFile(stub,`export const ALLOWED_DOMAIN='example.com';export const auth=async()=>null;export const headers=async()=>({get:()=>null});export const cookies=async()=>({get:()=>undefined});export const warmPageHtml=async()=>{};export const dropPageDelivery=async()=>{};export const expirePageAssets=async()=>{};`);
 const outfile=path.join(temp,'api.cjs');
 await build({stdin:{contents:`export * from './src/lib/pages/store';export * from './src/lib/deck/edit/store';export * from './src/lib/deck/edit/service';export * from './src/lib/deck/edit/text-sync';export * from './src/lib/deck/edit/collaboration';export * from './src/lib/db/database';`,resolveDir:root},bundle:true,platform:'node',format:'cjs',outfile,
  plugins:[companyDeployment,{name:'framework-boundary',setup(b){b.onResolve({filter:/^@\/auth$|^next\/headers$|page-cache$/},()=>({path:stub}));}}]});
 api=createRequire(import.meta.url)(outfile);
 // 所属の役割つき（初期化で admins に入った人は、会社の行を当てると admin）
 const owner={kind:'member',email:'owner@example.com',name:'試験用',image:null,organization:{id:'00000000-0000-4000-8000-000000000001',assetPrefix:'',role:'admin'}};
 const html='<!doctype html><html><head><title>共同編集</title></head><body data-deck><main data-deck-slides><section data-deck-slide data-deck-node="slide"><p data-deck-node="paragraph">始終</p></section></main></body></html>';
 const page=(await api.commitRevision({organization:SURPRISE,pageSlug:'internal/test/collaboration',html,author:owner,message:'試験'})).page;
 const store=api.deckEditStore(page,owner);
 // Exercise separate server instances: bypass only the in-process queue.
 delete store.key;
 const active=await api.saveDeckOperations(store,{id:randomUUID(),author:owner.email,client:'browser',protocol:2,activate:true,operations:[]});
 assert.ok(active.collaboration);const base=active.versionId;
 const request=(operations)=>({id:randomUUID(),author:owner.email,client:'browser',protocol:2,epoch:active.collaboration.epoch,baseVersionId:base,operations});
 const a=new api.DeckTextReplica(active.collaboration.fields['paragraph/0']),b=new api.DeckTextReplica(active.collaboration.fields['paragraph/0']);
 const first=request([{kind:'text',target:'paragraph',run:0,before:'始終',after:'始甲終',sync:a.replace('始甲終')}]);
 const second=request([{kind:'text',target:'paragraph',run:0,before:'始終',after:'始乙終',sync:b.replace('始乙終')}]);
 let savedA;
 await check('実PostgreSQLで同じ位置の同時保存が両方残る',async()=>{
  [savedA]=await Promise.all([api.saveDeckOperations(store,first),api.saveDeckOperations(store,second)]);
  const head=await store.read();assert.match(head.html,/甲/);assert.match(head.html,/乙/);
  const replica=new api.DeckTextReplica(head.collaboration.fields['paragraph/0']);assert.ok(head.html.includes(replica.value));replica.destroy();
 });
 await check('返事を失って同じ操作を再送しても後続の編集と版番号を保つ',async()=>{
  const before=await store.read(),replayed=await api.saveDeckOperations(store,first);
  assert.equal(replayed.replayed,true);assert.equal(replayed.versionId,before.versionId);
  const rows=await sql`select count(*)::integer as count from page_revisions where page_id=${page.id} and edit_operation_id=${first.id}`;assert.equal(rows[0].count,1);
 });
 await check('変更・文章の状態・参加者を同じ読み取りで取得し、別資料と古い対象を混ぜない',async()=>{
  const sessionId=randomUUID();await api.touchDeckPresence(page,owner,sessionId,'paragraph');
  const head=await store.read(),packet=await api.readDeckUpdate(page,base);
  assert.equal(packet.versionId,head.versionId);assert.equal(packet.batches.length,2);
  assert.deepEqual(packet.collaboration,head.collaboration);assert.equal(packet.presence[0].sessionId,sessionId);
  const unchanged=await api.readDeckUpdate(page,head.versionId);assert.equal(unchanged.versionId,head.versionId);assert.equal('batches' in unchanged,false);
  assert.equal(await api.readDeckUpdate(page,'missing-base'),null);
  const another=(await api.commitRevision({organization:SURPRISE,pageSlug:'internal/test/another',html,author:owner,message:'別資料'})).page;
  assert.equal(await api.readDeckUpdate(another,base,head.versionId),null);
  await sql.unsafe('create role anon nologin;create role authenticated nologin');
  const privilege=await sql`select has_function_privilege('anon','public.read_deck_update(uuid,text,text)','execute') as anon,has_function_privilege('authenticated','public.read_deck_update(uuid,text,text)','execute') as authenticated`;
  assert.deepEqual({...privilege[0]},{anon:false,authenticated:false});
 });
 await check('既存の制限付き接続に新しい取得権限が無くても以前の取得経路を維持する',async()=>{
  const role=new URL(process.env.DATABASE_URL).username;assert.match(role,/^pages_runtime_[a-f0-9]{12}$/);
  await sql.unsafe(`revoke execute on function public.read_deck_update(uuid,text,text) from "${role}"`);
  try{assert.equal(await api.readDeckUpdate(page,base),null);assert.equal((await api.deckRevisionDelta(page,base,(await store.read()).versionId)).length,2);}
  finally{await sql.unsafe(`grant execute on function public.read_deck_update(uuid,text,text) to "${role}"`);}
 });
 await check('操作の受領を版と別に記録しても作者・逆操作・再送照合を維持する',async()=>{
  const receipt=await store.receipt(first.id);assert.equal(receipt.authorEmail,owner.email);assert.deepEqual(receipt.inverse,savedA.inverse);
  const rows=await sql`select operation_id,version_id,owner_email from public.deck_edit_receipts where page_id=${page.id} and operation_id in (${first.id},${second.id})`;
  assert.equal(rows.length,2);assert.ok(rows.every(row=>row.owner_email===owner.email));
  const {data,error}=await api.getDb().rpc('read_deck_edit_history',{p_page:page.id,p_operation:first.id,p_offset:0,p_limit:1});
  assert.equal(error,null);assert.equal(data[0].edit_operation_id,first.id);assert.equal(data[0].version_id,receipt.versionId);
  for(const role of ['anon','authenticated'])await assert.rejects(sql.begin(async tx=>{await tx.unsafe(`set local role ${role}`);await tx`select * from public.deck_edit_receipts`;}),/permission denied/);
 });
 await check('受領表の記録が失敗したら本文・最新番号・通知も確定せず同じ番号を再送できる',async()=>{
  const before=await store.read(),edit={...request([{kind:'style',target:'paragraph',property:'color',before:null,after:'pink'}]),baseVersionId:before.versionId};
  await sql.unsafe("create function public.receipt_test_abort() returns trigger language plpgsql as $$ begin raise exception 'injected receipt stop'; end $$;create trigger receipt_test_abort before insert on public.deck_edit_receipts for each row execute function public.receipt_test_abort()");
  try{await assert.rejects(api.saveDeckOperations(store,edit));assert.equal((await store.read()).versionId,before.versionId);assert.equal(await store.receipt(edit.id),null);assert.equal((await sql`select count(*)::integer as count from public.deck_collaboration_events where page_id=${page.id} and version_number>${before.versionNumber}`)[0].count,0);}
  finally{await sql.unsafe('drop trigger receipt_test_abort on public.deck_edit_receipts;drop function public.receipt_test_abort()');}
  const accepted=await api.saveDeckOperations(store,edit);assert.equal((await api.saveDeckOperations(store,edit)).replayed,true);
  await api.saveDeckOperations(store,{...request(accepted.inverse),baseVersionId:accepted.versionId});
 });
 await check('古い接続に受領表の参照権限がなくても単独保存の照会を維持する',async()=>{
  const role=new URL(process.env.DATABASE_URL).username;assert.match(role,/^pages_runtime_[a-f0-9]{12}$/);
  await sql.unsafe(`revoke select on public.deck_edit_receipts from "${role}"`);
  try{assert.equal((await store.receipt(first.id)).fingerprint,(await sql`select edit_receipt from public.page_revisions where page_id=${page.id} and edit_operation_id=${first.id}`)[0].edit_receipt.fingerprint);}
  finally{await sql.unsafe(`grant select on public.deck_edit_receipts to "${role}"`);}
 });
 await check('共同編集の確定と同時に一覧の分類を記録する',async()=>{
  const head=await store.read();
  const rows=await sql`select kind,classifier_version from public.page_catalog where page_id=${page.id} and version_id=${head.versionId}`;
  assert.deepEqual(rows.map(row=>({...row})),[{kind:'deck',classifier_version:1}]);
 });
 await check('他人の後続編集を残して自分の操作だけ取り消せる',async()=>{
  const head=await store.read();const undone=await api.saveDeckOperations(store,{...request(savedA.inverse),baseVersionId:head.versionId});
  assert.match(undone.html,/始乙終/);
 });
 await check('通知の記録で処理を中断しても本文と最新番号が一切進まない',async()=>{
  const before=await store.read();await sql.unsafe("create function public.collab_test_abort() returns trigger language plpgsql as $$ begin raise exception 'injected interruption'; end $$; create trigger collab_test_abort before insert on public.deck_collaboration_events for each row execute function public.collab_test_abort()");
  const edit={...request([{kind:'text',target:'paragraph',run:0,before:'始乙終',after:'始乙終追加'}]),baseVersionId:before.versionId};
  await assert.rejects(api.saveDeckOperations(store,edit));assert.equal((await store.read()).versionId,before.versionId);
  assert.equal((await sql`select current_version_id from pages where id=${page.id}`)[0].current_version_id,before.versionId);
  await sql.unsafe('drop trigger collab_test_abort on public.deck_collaboration_events; drop function public.collab_test_abort()');
  await api.saveDeckOperations(store,edit);assert.match((await store.read()).html,/追加/);
 });
 await check('既存のDB保護で古い処理による最新版の巻き戻しを防ぐ',async()=>{
  const before=await store.read();
  await sql`update public.pages set current_version_id=${base} where id=${page.id}`;
  assert.equal((await sql`select current_version_id from public.pages where id=${page.id}`)[0].current_version_id,before.versionId);
 });
 await check('一覧の分類だけが失敗しても本文と受領記録と通知は一緒に確定する',async()=>{
  const before=await store.read();
  await sql.unsafe("create function public.collab_catalog_abort() returns trigger language plpgsql as $$ begin raise exception 'injected index failure'; end $$; create trigger collab_catalog_abort before insert on public.page_catalog for each row execute function public.collab_catalog_abort()");
  const edit={...request([{kind:'text',target:'paragraph',run:0,before:'始乙終追加',after:'始乙終追加分類'}]),baseVersionId:before.versionId};
  try{
   const saved=await api.saveDeckOperations(store,edit),head=await store.read();
   assert.equal(saved.versionId,head.versionId);assert.match(head.html,/追加分類/);
   assert.equal((await sql`select current_version_id from public.pages where id=${page.id}`)[0].current_version_id,head.versionId);
   assert.equal((await sql`select count(*)::integer as count from public.page_revisions where page_id=${page.id} and edit_operation_id=${edit.id}`)[0].count,1);
   assert.equal((await sql`select version_id from public.deck_collaboration_events where page_id=${page.id} order by version_number desc limit 1`)[0].version_id,head.versionId);
   assert.equal((await sql`select count(*)::integer as count from public.page_catalog where page_id=${page.id} and version_id=${head.versionId}`)[0].count,0);
   const replayed=await api.saveDeckOperations(store,edit);assert.equal(replayed.replayed,true);assert.equal(replayed.versionId,head.versionId);
  }finally{await sql.unsafe('drop trigger collab_catalog_abort on public.page_catalog; drop function public.collab_catalog_abort()');}
 });
 await check('既存の制限付き接続は新しい内部表の権限がなくても通常の保存を続けられる',async()=>{
  const role='legacy_deck_guard_test';
  await sql.unsafe(`create role ${role} nosuperuser nobypassrls;grant usage on schema public to ${role};grant select,insert,update on public.pages,public.page_revisions to ${role};create policy legacy_guard_pages on public.pages to ${role} using(true) with check(true);create policy legacy_guard_revisions on public.page_revisions to ${role} using(true) with check(true);`);
  const id=randomUUID();
  try{
   await sql.begin(async tx=>{
    await tx.unsafe(`set local role ${role}`);
    await tx`insert into public.pages(id,page_slug,visibility,title,created_by) values(${id},'internal/test/legacy-guard','internal','旧接続',${owner.email})`;
    await tx`insert into public.page_revisions(page_id,version_number,version_id,html,author_email) values(${id},1,${'e'.repeat(40)},'通常の記事',${owner.email})`;
    await tx`update public.pages set current_version_id=${'e'.repeat(40)},visibility='public' where id=${id}`;
   });
   assert.equal((await sql`select current_version_id from public.pages where id=${id}`)[0].current_version_id,'e'.repeat(40));
  }finally{await sql.unsafe(`drop policy legacy_guard_pages on public.pages;drop policy legacy_guard_revisions on public.page_revisions;drop owned by ${role};drop role ${role};`);}
 });
 await check('旧方式の直接書込みと旧ブラウザを拒否する',async()=>{
  await assert.rejects(api.saveDeckOperations(store,{...request([]),protocol:undefined}));
  await assert.rejects(sql`insert into page_revisions(page_id,version_number,version_id,html,author_email) values(${page.id},999,${'f'.repeat(40)},'旧方式',${owner.email})`,/deck_collaboration_protocol_required/);
 });
 await check('文章箱の追加と入力を一緒に保存し初期の文字IDを画面と共有する',async()=>{
  const head=await store.read();const add={kind:'insert',target:'slide',textSeed:randomUUID(),node:{id:'new-text',tag:'p',text:'追加'}};
  const optimistic=api.applyCollaborativeOperations(head.html,head.collaboration,[add]);
  const replica=new api.DeckTextReplica(optimistic.collaboration.fields['new-text/0']);
  const typing={kind:'text',target:'new-text',run:0,before:'追加',after:'追加した本文',sync:replica.replace('追加した本文')};
  const saved=await api.saveDeckOperations(store,{...request([add,typing]),baseVersionId:head.versionId});
  assert.match(saved.html,/追加した本文/);assert.equal(saved.collaboration.fields['new-text/0'].epoch,optimistic.collaboration.fields['new-text/0'].epoch);replica.destroy();
 });
 await check('追加の保存応答前に作った入力も次の保存で受け付ける',async()=>{
  const head=await store.read();const add={kind:'insert',target:'slide',textSeed:randomUUID(),node:{id:'pending-text',tag:'p',text:'初期'}};
  const preview=api.applyCollaborativeOperations(head.html,head.collaboration,[add]);
  const replica=new api.DeckTextReplica(preview.collaboration.fields['pending-text/0']);
  const typing={kind:'text',target:'pending-text',run:0,before:'初期',after:'初期から入力',sync:replica.replace('初期から入力')};
  const added=await api.saveDeckOperations(store,{...request([add]),baseVersionId:head.versionId});
  assert.deepEqual(added.collaboration.fields['pending-text/0'],preview.collaboration.fields['pending-text/0']);
  const saved=await api.saveDeckOperations(store,{...request([typing]),baseVersionId:added.versionId});assert.match(saved.html,/初期から入力/);replica.destroy();
 });
 await check('原稿の全面更新は新しい同期世代になり古い下書きを受け付けない',async()=>{
  const before=await store.read();await api.commitRevision({organization:SURPRISE,pageSlug:page.pageSlug,html:html.replace('始終','新しい原稿'),expectedHead:before.versionId,author:owner,message:'原稿更新'});
  const after=await store.read();assert.notEqual(after.collaboration.epoch,before.collaboration.epoch);
  await assert.rejects(api.saveDeckOperations(store,{...first,id:randomUUID()}),/構成/);
 });
 await check('権限確認後に資料の保存先が変わっても古い保存先へ書き込まない',async()=>{
  const before=await store.read();
  await sql`update public.pages set page_slug=${page.pageSlug+'/moved'} where id=${page.id}`;
  try{
   await assert.rejects(api.saveDeckOperations(store,{...request([{kind:'style',target:'paragraph',property:'color',before:null,after:'red'}]),epoch:before.collaboration.epoch,baseVersionId:before.versionId}),api.DeckEditBusyError);
   assert.equal((await store.read()).versionId,before.versionId);
   assert.equal((await sql`select count(*)::integer as count from public.pages where page_slug=${page.pageSlug}`)[0].count,0);
  }finally{await sql`update public.pages set page_slug=${page.pageSlug} where id=${page.id}`;}
 });
 a.destroy();b.destroy();
 // 個人配布版は共同保存のまとめ（PAGES_DECK_BATCHING・受付の調整役）を外したので、まとめて確定する試験は無い
 await check('取得が50件を超える時と原稿の全面更新時は安全に全文取得へ戻す',async()=>{
  const target=(await api.commitRevision({organization:SURPRISE,pageSlug:'internal/test/delta-limit',html,author:owner,message:'試験'})).page,edits=api.deckEditStore(target,owner);
  let head=await api.saveDeckOperations(edits,{id:randomUUID(),author:owner.email,client:'browser',protocol:2,activate:true,operations:[]});const initial=head.versionId;
  for(let i=0;i<51;i++){
   head=await api.saveDeckOperations(edits,{id:randomUUID(),author:owner.email,client:'browser',protocol:2,epoch:head.collaboration.epoch,baseVersionId:head.versionId,operations:[{kind:'text',target:'paragraph',run:0,before:i?'変更'+(i-1):'始終',after:'変更'+i}]});
   if(i===49)assert.equal((await api.readDeckUpdate(target,initial)).batches.length,50);
  }
  assert.equal(await api.readDeckUpdate(target,initial),null);
  const before=head.versionId;await api.commitRevision({organization:SURPRISE,pageSlug:target.pageSlug,html:html.replace('始終','原稿の再作成'),expectedHead:before,author:owner,message:'原稿更新'});
  assert.equal(await api.readDeckUpdate(target,before),null);
 });
}finally{
 await api?.closeDatabase();await sql?.end();if(started)await cluster.stop();await rm(temp,{recursive:true,force:true});
}
