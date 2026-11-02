import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createDeckEditHarness } from './deck-edit-harness.mjs';
import { root } from './paths.mjs';

const h=await createDeckEditHarness({migration:false});
const html='<!doctype html><html><head><title>共同編集</title></head><body data-deck><main data-deck-slides><section data-deck-slide data-deck-id="one"><h1>原稿</h1><p>文章A</p><p>文章B</p><aside data-deck-notes>非公開ノート</aside></section></main></body></html>';
const first=await h.seed(html);
const second=await h.api.commitRevision({organization:h.organization,pageSlug:'internal/example/design',html:html.replace('原稿','次の原稿'),message:'次',author:h.owner});
const pageId=first.page.id;
const point=async id=>h.pg.query('update pages set current_version_id=$1 where id=$2',[id,pageId]);
await point(first.versionId);
assert.equal((await h.pg.query('select current_version_id from pages')).rows[0].current_version_id,first.versionId);
console.log('RED 再現: 以前の保存処理が新しい版の目印を巻き戻す');
await h.pg.exec(await readFile(`${root}/db/migrations/20260913222224_deck_edit_sessions.sql`,'utf8'));
let count=0;
const test=async(label,fn)=>{await fn();count++;console.log(`OK  ${label}`);};
await test('古い保存処理が後から終わっても公開中の版が戻らない',async()=>{
  await point(second.versionId); await point(first.versionId);
  assert.equal((await h.pg.query('select current_version_id from pages')).rows[0].current_version_id,second.versionId);
});
const sessionId=crypto.randomUUID();
const request=(method,body,viewer=h.owner)=>h.as(viewer,()=>h.api[method](new Request('http://localhost/api/pages/deck-edit'+(method==='GET'?`?page=internal/example/design&sessionId=${sessionId}`:''),{method,...(body?{headers:{'content-type':'application/json'},body:JSON.stringify(body)}:{})})));
const common={page:'internal/example/design',sessionId};
let source;
await test('編集開始は原本を保存せず表示用の目印を返す',async()=>{
  const response=await request('POST',{...common,action:'open'});assert.equal(response.status,200,await response.clone().text());source=await response.json();
  assert.ok(source.nodes.length>0);assert.ok(source.previewHtml.includes('<base'));assert.ok(!source.html.includes('<base'));
  assert.match(source.html,/非公開ノート/);assert.equal(source.presence.length,1);
  assert.ok(!JSON.stringify(source.presence).includes('@'));
});
await test('閲覧者・未ログイン・別資料は編集にも参加者取得にも入れない',async()=>{
  assert.equal((await request('GET',null,null)).status,401);
  const reader={...h.owner,email:'reader@example.test'};
  assert.equal((await request('GET',null,reader)).status,404);
  assert.equal((await request('POST',{...common,action:'open'},reader)).status,404);
  assert.equal((await request('POST',{...common,page:'internal/absent',action:'open'})).status,404);
});
const paragraphs=source.nodes.filter(n=>n.tag==='p');
const edit=(id,after)=>({kind:'text',target:paragraphs[id].id,run:0,before:id===0?'文章A':'文章B',after});
const save=(operations,operationId=crypto.randomUUID())=>({...common,baseVersionId:source.versionId,operationId,operations});
await test('同じ土台から2つの文章を同時保存しても両方残る',async()=>{
  const results=await Promise.all([request('PATCH',save([edit(0,'Aを直した')])),request('PATCH',save([edit(1,'Bを直した')]))]);
  for(const r of results)assert.equal(r.status,200,await r.clone().text());
  const latest=await (await request('GET')).json(); assert.match(latest.html,/Aを直した/);assert.match(latest.html,/Bを直した/);source=latest;
});
await test('実データベースで重複保存は版を増やさず、操作番号の使い回しを断る',async()=>{
  const batch=save([{...edit(0,'Aの確定版'),before:'Aを直した'}]);
  const first=await request('PATCH',batch);assert.equal(first.status,200);
  const one=await first.json();const second=await (await request('PATCH',batch)).json();
  assert.equal(one.versionId,second.versionId);assert.equal(second.replayed,true);source=second;
  assert.equal((await request('PATCH',{...batch,operations:[edit(0,'別の内容')]})).status,409);
});
await test('版だけ保存できて配信先更新が失敗しても、再送で閲覧が最新へ復旧する',async()=>{
  await h.pg.exec(`create function fail_pointer() returns trigger language plpgsql as $$ begin raise exception 'simulated delivery failure'; end; $$;
    create trigger fail_pointer before update on pages for each row execute function fail_pointer();`);
  const batch=save([{...edit(1,'Bの復旧確認'),before:'Bを直した'}]);
  const failed=await request('PATCH',batch);assert.equal(failed.status,500);
  const head=(await h.pg.query('select version_id from page_revisions order by version_number desc limit 1')).rows[0].version_id;
  assert.notEqual((await h.pg.query('select current_version_id from pages')).rows[0].current_version_id,head);
  await h.pg.exec('drop trigger fail_pointer on pages; drop function fail_pointer();');
  const retried=await request('PATCH',batch);assert.equal(retried.status,200);
  assert.equal((await retried.json()).replayed,true);
  assert.equal((await h.pg.query('select current_version_id from pages')).rows[0].current_version_id,head);source=await (await request('GET')).json();
});
await test('衝突時は本文も履歴も変えず、相手の変更を残す',async()=>{
  const before=await (await request('GET')).json();
  const r=await request('PATCH',save([edit(0,'衝突する') ]));assert.equal(r.status,409);
  const after=await (await request('GET')).json();assert.equal(after.versionId,before.versionId);
});
await test('参加者の期限切れと他人の参加番号の乗っ取りを防ぐ',async()=>{
  const other={...h.owner,email:'second@example.test',name:'共同編集者'};
  await h.pg.query(`insert into organization_members(organization_id,email,role,added_by) values ('00000000-0000-4000-8000-000000000001',$1,'admin',$2) on conflict (organization_id,email) do update set role='admin'`,[other.email,h.owner.email]);
  const stolen=await request('POST',{...common,action:'heartbeat'},other);assert.equal(stolen.status,500);
  const sessions=await h.pg.query('select owner_email from deck_edit_sessions');assert.equal(sessions.rows[0].owner_email,h.owner.email);
  await h.pg.exec("update deck_edit_sessions set expires_at=now()-interval '1 second'");
  const latest=await (await request('GET')).json();assert.deepEqual(latest.presence,[]);
});
await test('画像は編集できる人だけがサーバー経由で非公開保管する',async()=>{
  const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADUlEQVQImWP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==','base64');
  const req=()=>new Request('http://localhost/api/pages/deck-edit/assets?page=internal/example/design&name=one.png',{method:'POST',body:png});
  assert.equal((await h.as({...h.owner,email:'reader@example.test'},()=>h.api.upload(req()))).status,404);
  const r=await h.as(h.owner,()=>h.api.upload(req()));assert.equal(r.status,201);const value=await r.json();assert.match(value.src,/^_deck\/media-/);
  const stored=[...globalThis.__deckAssets.values()][0];assert.equal(stored.options.access,'private');assert.equal(stored.options.allowOverwrite,false);
});
await test('匿名・通常ログイン用の保管庫入口から参加者を読めない',async()=>{
  await h.pg.exec('set role anon');await assert.rejects(h.pg.query('select * from deck_edit_sessions'),/permission denied/);await h.pg.exec('reset role');
  await h.pg.exec('set role authenticated');await assert.rejects(h.pg.query('select * from deck_edit_sessions'),/permission denied/);await h.pg.exec('reset role');
});
await test('変更がない確認では資料の全文をデータベースから取り直さない',async()=>{
  const latest=await (await request('GET')).json();
  globalThis.__deckQueries=[];
  const result=await h.as(h.owner,()=>h.api.GET(new Request(`http://localhost/api/pages/deck-edit?page=internal/example/design&sessionId=${sessionId}&versionId=${latest.versionId}`)));
  assert.equal(result.status,200);assert.equal((await result.json()).html,undefined);
  assert.ok(!globalThis.__deckQueries.some(q=>q.action==='select'&&q.columns.split(/,\s*/).includes('html')));
  delete globalThis.__deckQueries;
});
await test('操作番号だけを持つ不完全な版をデータベースが断る',async()=>{
  await assert.rejects(h.pg.query(`insert into page_revisions(page_id,version_number,version_id,html,author_email,edit_operation_id)
    values($1,999,$2,'<p>incomplete</p>',$3,$4)`,[pageId,'f'.repeat(40),h.owner.email,crypto.randomUUID()]),/check constraint/);
});
assert.equal(count,12);await h.close();
