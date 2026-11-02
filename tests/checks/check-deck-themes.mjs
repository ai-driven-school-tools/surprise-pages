import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {createDeckEditHarness} from './deck-edit-harness.mjs';
const h=await createDeckEditHarness();let failures=0;
async function test(label,fn){try{await fn();console.log('OK  '+label);}catch(error){failures++;console.log('NG  '+label+': '+error.stack);}}
const other={...h.owner,email:'other@example.test'},admin={...h.owner,email:'admin@example.test'};
const request=body=>new Request('http://localhost/api/deck-themes',{method:'POST',headers:{origin:'http://localhost','Content-Type':'application/json'},body:JSON.stringify(body)});
const mutate=(body,viewer=h.owner)=>h.as(viewer,()=>h.api.mutateTheme(request(body)));
const list=(viewer=h.owner)=>h.as(viewer,()=>h.api.listThemes(new Request('http://localhost/api/deck-themes')));
const logoRef={path:'_deck/logo-11111111-1111-4111-8111-111111111111.svg',contentType:'image/svg+xml',intrinsicWidth:200,intrinsicHeight:80};
const svg=Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="200" height="80"><path fill="#123456" d="M0 0H200V80H0Z"/></svg>');
let version,theme,saveRequest,original,createdUrl,createPayload;
try{
 const initial=await h.api.newDeckDocument({firstSlide:null});
 const doc=new JSDOM(initial);const setting=doc.window.document.querySelector('[data-deck-logo]');const logo=JSON.parse(setting.textContent);logo.asset=logoRef;logo.document.size=8;logo.document.opacity=75;setting.textContent=JSON.stringify(logo);
 original=doc.serialize();doc.window.close();
 globalThis.__deckAssets.set('internal/check/theme-original/'+logoRef.path,{bytes:svg,options:{access:'private',contentType:'image/svg+xml'},uploadedAt:new Date()});
 const seed=await h.api.commitRevision({organization:h.organization,pageSlug:'internal/check/theme-original',html:original,message:'テーマの元資料',author:h.owner});version=seed.versionId;
 saveRequest={action:'save',requestId:crypto.randomUUID(),page:'internal/check/theme-original',baseVersionId:version,name:'会社のテーマ'};
 await test('資料全体の設定とロゴを独立した非公開テーマに保存する',async()=>{
  const response=await mutate(saveRequest);assert.equal(response.status,201);theme=(await response.json()).theme;
  assert.equal(theme.name,'会社のテーマ');assert.equal(theme.snapshot.logo.presentation.size,8);assert.equal(theme.snapshot.logo.presentation.opacity,75);
  assert.match(theme.snapshot.logo.asset.path,/^api\/deck-themes\//);assert.equal((await (await list()).json()).themes.length,1);
  const stored=[...globalThis.__deckAssets].filter(([key])=>key.startsWith('internal/_deck-themes/'));assert.equal(stored.length,1);assert.equal(stored[0][1].options.access,'private');assert.deepEqual(stored[0][1].bytes,svg);
 });
 await test('同じ保存依頼は一度だけ保存し、内容を変えた同じ依頼は断る',async()=>{
  assert.equal((await mutate(saveRequest)).status,200);assert.equal((await (await list()).json()).themes.length,1);
  assert.equal((await mutate({...saveRequest,name:'違う名前'})).status,409);
 });
 await test('他人と管理者は一覧・ロゴ・更新・削除にアクセスできない',async()=>{
  await h.pg.query(`insert into organization_members(organization_id,email,role,added_by) values ('00000000-0000-4000-8000-000000000001',$1,'admin',$2) on conflict (organization_id,email) do update set role='admin'`,[admin.email,h.owner.email]);
  for(const person of [other,admin]){
   assert.deepEqual((await (await list(person)).json()).themes,[]);
   assert.equal((await h.as(person,()=>h.api.themeLogo(new Request('http://localhost'),{params:Promise.resolve({id:theme.id,version:theme.version})}))).status,404);
   for(const action of ['rename','delete'])assert.equal((await mutate({action,requestId:crypto.randomUUID(),theme:{id:theme.id,version:theme.version},...(action==='rename'?{name:'変更'}:{})},person)).status,404);
  }
  assert.equal((await list(null)).status,401);assert.equal((await list({kind:'guest',guestId:'guest',name:'guest'})).status,401);
 });
 await test('他人の資料と古い版からのテーマ保存を拒否する',async()=>{
  assert.equal((await mutate({...saveRequest,requestId:crypto.randomUUID()},other)).status,404);
  assert.equal((await mutate({...saveRequest,requestId:crypto.randomUUID(),baseVersionId:'old'})).status,409);
  assert.equal((await mutate({...saveRequest,requestId:crypto.randomUUID(),snapshot:{}})).status,400);
 });
 await test('本人のロゴだけを実行禁止・共有キャッシュ禁止で配信する',async()=>{
  const response=await h.as(h.owner,()=>h.api.themeLogo(new Request('http://localhost'),{params:Promise.resolve({id:theme.id,version:theme.version})}));
  assert.equal(response.status,200);assert.match(response.headers.get('cache-control'),/private, no-store/);assert.match(response.headers.get('content-security-policy'),/sandbox/);assert.deepEqual(Buffer.from(await response.arrayBuffer()),svg);
 });
 await test('名前変更は版を進め、古い版への同時更新を拒否する',async()=>{
  const payload={action:'rename',requestId:crypto.randomUUID(),theme:{id:theme.id,version:theme.version},name:'更新した会社テーマ'};
  const response=await mutate(payload);assert.equal(response.status,200);const next=(await response.json()).theme;
  assert.equal((await mutate({...payload,requestId:crypto.randomUUID(),name:'競合'})).status,409);
  assert.equal((await mutate(payload)).status,200);theme=next;
 });
 await test('元資料とロゴを削除しても0枚の資料を作成でき、同じ依頼は同じ資料に戻る',async()=>{
  globalThis.__deckAssets.delete('internal/check/theme-original/'+logoRef.path);
  await h.pg.query('update pages set deleted_at=now() where page_slug=$1',['internal/check/theme-original']);
  const payload={requestId:crypto.randomUUID(),title:'会社資料',firstSlide:null,myTheme:{id:theme.id,version:theme.version}};createPayload=payload;
  const create=()=>h.as(h.owner,()=>h.api.createDeck(new Request('http://localhost/api/pages/deck-edit/create',{method:'POST',headers:{origin:'http://localhost'},body:JSON.stringify(payload)})));
  const response=await create();assert.equal(response.status,201);createdUrl=(await response.json()).url;
  assert.deepEqual(await (await create()).json(),{url:createdUrl});
  const rows=await h.pg.query('select html from page_revisions where html like $1',['%<title>会社資料</title>%']);
  const html=rows.rows[0].html;const doc=new JSDOM(html);assert.equal(doc.window.document.querySelectorAll('section').length,0);doc.window.close();
  const selected=h.api.documentTheme(html);assert.equal(selected.logo.presentation.size,8);assert.notEqual(selected.logo.asset.path,logoRef.path);
  assert.equal(h.api.documentThemeName(html),'更新した会社テーマ');
  assert.ok([...globalThis.__deckAssets.keys()].some(key=>key.startsWith('internal/decks/')&&key.endsWith(selected.logo.asset.path)));
 });
 await test('文書への適用は個別設定を保持し、ロゴなしを含め一度で取り消せる',async()=>{
  const {build}=await import('esbuild');const {root,dir}=await import('./paths.mjs');await build({stdin:{contents:`export * from './src/lib/deck/edit/source';export * from './src/lib/deck/design/design';`,resolveDir:root},outfile:dir+'/theme-source.mjs',bundle:true,format:'esm',platform:'node'});const m=await import(dir+'/theme-source.mjs');
  let source=await h.api.newDeckDocument();source=m.applyDeckEditOperations(source,[{kind:'setting',target:'deck-document',name:'appearance',before:null,after:JSON.stringify({version:1,document:{},slides:{opening:{background:'#123456'}}})}]).html;
  const ops=h.api.themeOperations(source,{...theme.snapshot,logo:null},{id:theme.id,version:theme.version,name:theme.name});const result=m.applyDeckEditOperations(source,ops);
  assert.equal(JSON.parse(m.deckSourceSetting(result.html,'appearance')).slides.opening.background,'#123456');assert.equal(h.api.documentTheme(result.html).logo,null);assert.equal(m.applyDeckEditOperations(result.html,result.inverse).html,source);
 });
 await test('受け付け済みの依頼は削除後も同じ版を使い、未受付の旧版は拒否する',async()=>{
  const id=crypto.randomUUID();const pinned=await h.api.pinTheme(h.owner.email,id,'fixed',theme);
  assert.equal(pinned.version,theme.version);
  assert.equal((await mutate({action:'delete',requestId:crypto.randomUUID(),theme:{id:theme.id,version:theme.version}})).status,200);
  assert.deepEqual((await (await list()).json()).themes,[]);
  const existing=await h.as(h.owner,()=>h.api.createDeck(new Request('http://localhost/api/pages/deck-edit/create',{method:'POST',headers:{origin:'http://localhost'},body:JSON.stringify(createPayload)})));assert.equal(existing.status,200);assert.deepEqual(await existing.json(),{url:createdUrl});
  assert.equal((await h.api.pinTheme(h.owner.email,id,'fixed',theme)).version,theme.version);
  await assert.rejects(()=>h.api.pinTheme(h.owner.email,crypto.randomUUID(),'new',theme),/更新または削除/);
  await h.pg.query('update deck_theme_requests set expires_at=now()-interval \'1 second\' where request_id=$1',[id]);
  await assert.rejects(()=>h.api.pinTheme(h.owner.email,id,'fixed',theme),/更新または削除/);
  assert.ok([...globalThis.__deckAssets.keys()].some(key=>key.startsWith('internal/decks/')));
 });
 await test('ロゴ追加と明示的な削除を分割せず、完全に取り消せる',async()=>{
  const source=await h.api.newDeckDocument();
  const op={kind:'setting',target:'deck-document',name:'logo',before:null,after:JSON.stringify({version:1,asset:logoRef,document:{},slides:{}})};
  const refined=h.api.refineDeckOperations(source,[op]);assert.equal(refined.length,1);assert.equal(refined[0].kind,'setting');
  const added=h.api.applyDeckEditOperations(source,refined);assert.equal(h.api.documentTheme(added.html).logo.asset.path,logoRef.path);
  const removed=h.api.applyDeckEditOperations(added.html,h.api.refineDeckOperations(added.html,[{...op,before:op.after,after:JSON.stringify({version:1,asset:null,document:{},slides:{}})}]));
  assert.equal(h.api.documentTheme(removed.html).logo,null);assert.equal(h.api.applyDeckEditOperations(removed.html,removed.inverse).html,added.html);
  assert.equal(h.api.applyDeckEditOperations(added.html,added.inverse).html,source);
 });
 await test('同じ複製先の異なるロゴを成功扱いせず拒否する',async()=>{
  const row=await h.api.readTheme(h.organization,h.owner.email,{id:theme.id,version:theme.version});const id=crypto.randomUUID();
  await h.api.copyThemeToPage(h.organization,row,'internal/check/copy',id);
  const changed={...row,logo_key:'internal/check/different.svg'};
  globalThis.__deckAssets.set(changed.logo_key,{bytes:Buffer.from(svg.toString().replace('#123456','#abcdef')),options:{access:'private',contentType:'image/svg+xml'},uploadedAt:new Date()});
  await assert.rejects(()=>h.api.copyThemeToPage(h.organization,changed,'internal/check/copy',id),/異なるロゴ/);
 });
 await test('ブラウザからデータベースを直接読めず、関数も実行できない',async()=>{
  await h.pg.exec('set role anon');
  await assert.rejects(()=>h.pg.query('select * from deck_my_themes'),/permission denied/);
  await assert.rejects(()=>h.pg.query("select * from pin_deck_my_theme('owner@example.test',gen_random_uuid(),'x',gen_random_uuid(),gen_random_uuid())"),/permission denied/);
  await h.pg.exec('reset role');
 });
}finally{await h.close();}
if(failures)process.exitCode=1;
