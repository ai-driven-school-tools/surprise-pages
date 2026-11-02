import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
import {root,dir} from './paths.mjs';
import {createDeckEditHarness} from './deck-edit-harness.mjs';
await build({stdin:{contents:`export * from './src/lib/deck/design/browser-templates';export * from './src/lib/deck/create-model';export * from './src/lib/deck/create-draft';export * from './src/lib/deck/design/dom';export * from './src/lib/deck/edit/customization-dom';export * from './src/lib/deck/edit/source';export * from './src/lib/deck/design/design';`,resolveDir:root},outfile:`${dir}/create.mjs`,bundle:true,platform:'node',format:'esm'});
const m=await import(`${dir}/create.mjs`);
let fails=0;
async function test(label,fn){try{await fn();console.log('OK  '+label);}catch(e){fails++;console.log('NG  '+label+': '+e.stack);}}
const h=await createDeckEditHarness();
const request=data=>new Request('http://localhost/api/pages/deck-edit/create',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
try {
 await test('未指定の作成は従来の白い表紙・無題になる',async()=>{
  const doc=new JSDOM(await h.api.newDeckDocument()).window.document;
  assert.equal(doc.title,'無題の資料');assert.equal(doc.querySelectorAll('section[data-deck-slide]').length,1);
  assert.equal(doc.querySelector('section').getAttribute('data-deck-authoring-layout'),'title');
 });
 await test('テーマと名前と最初の見本を保存し、同じ依頼は同じ資料へ戻る',async()=>{
  const payload={requestId:crypto.randomUUID(),themeId:'ink',title:'開発 <計画> & 提案',firstSlide:{kind:'library',id:'editorial-cover-left'}};
  const first=await h.as(h.owner,()=>h.api.createDeck(request(payload)));assert.equal(first.status,201);
  const result=await first.json();
  const second=await h.as(h.owner,()=>h.api.createDeck(request(payload)));assert.equal(second.status,200);assert.deepEqual(await second.json(),result);
  const rows=await h.pg.query('select html from page_revisions');assert.equal(rows.rows.length,1);
  const doc=new JSDOM(rows.rows[0].html).window.document;
  assert.equal(doc.title,payload.title);assert.equal(doc.querySelector('section').getAttribute('data-deck-template'),payload.firstSlide.id);
  assert.equal(m.readDeckDesign(doc).design.document.background,m.DECK_PRESETS.find(p=>p.id==='ink').appearance.background);
  const custom=m.readDeckCustomization(doc);assert.ok(custom.focus);assert.equal(custom.focus.effective.invalidTargets.length,0);
 });
 await test('最初の一枚なしを明示すると0枚の資料にテーマと名前を保持する',async()=>{
  const html=await h.api.newDeckDocument({themeId:'forest',title:'空から作る',firstSlide:null});
  const doc=new JSDOM(html).window.document;
  assert.equal(doc.querySelectorAll('section[data-deck-slide]').length,0);assert.equal(doc.title,'空から作る');
  const design=m.readDeckDesign(doc);assert.ok(design);assert.deepEqual(design.ids,[]);assert.equal(design.design.document.background,'#f5f8f2');
  const source=m.prepareDeckEdit(html).html;
  const added=m.applyDeckEditOperations(source,m.browserSlideOperations(source,{kind:'basic',id:'title'},'first',null));
  assert.equal(m.deckSourceChildren(added.html,'deck-root').length,1);assert.equal(m.applyDeckEditOperations(added.html,added.inverse).html,source);
  const response=await h.as(h.owner,()=>h.api.createDeck(request({requestId:crypto.randomUUID(),themeId:'forest',firstSlide:null})));assert.equal(response.status,201);
 });
 await test('ブラウザで直せない見本と未知のテーマを作成口で拒否する',async()=>{
  for(const extra of [{themeId:'unknown'},{firstSlide:{kind:'library',id:'chart-size'}},{firstSlide:{kind:'library',id:'audio'}},{firstSlide:{kind:'library',id:'table-comparison'}},{firstSlide:{kind:'library',id:'not-found'}},{html:'<p>任意</p>'}]) {
   const response=await h.as(h.owner,()=>h.api.createDeck(request({requestId:crypto.randomUUID(),...extra})));assert.equal(response.status,400);
  }
 });
 await test('配信側の内部名とブラウザの接続先が違っても同一サイトなら作成できる',async()=>{
  const req=new Request('http://localhost/api/pages/deck-edit/create',{method:'POST',headers:{origin:'http://127.0.0.1:3129',host:'127.0.0.1:3129','sec-fetch-site':'same-origin','Content-Type':'application/json'},body:JSON.stringify({requestId:crypto.randomUUID()})});
  assert.equal((await h.as(h.owner,()=>h.api.createDeck(req))).status,201);
 });
 await test('長すぎる名前を拒否し、空白だけの名前は無題にする',()=>{
  assert.equal(m.deckCreateRequestSchema.safeParse({requestId:crypto.randomUUID(),title:'あ'.repeat(101)}).success,false);
  assert.equal(m.deckCreateRequestSchema.parse({requestId:crypto.randomUUID(),title:'   '}).title,'無題の資料');
 });
 const source=await h.api.newDeckDocument({firstSlide:{kind:'basic',id:'blank'}});
 for(const choice of m.BROWSER_TEMPLATES) await test(`${choice.kind}/${choice.id}: 主な内容を編集して保存し、追加を完全に取り消せる`,async()=>{
  const ops=m.browserSlideOperations(source,choice,'sample',null);
  const added=m.applyDeckEditOperations(source,ops);const doc=new JSDOM(added.html).window.document;
  const slide=doc.querySelector('section[data-deck-id="sample"]');assert.ok(slide);
  assert.equal(slide.querySelector('[data-deck-media-slot="audio"],[data-dd-mermaid-diagram],[data-dd-native-source]'),null);
  assert.equal(slide.querySelector('[data-dd-chart]:not([data-deck-basic-chart])'),null);
  assert.ok([...slide.querySelectorAll('td,th')].every(cell=>cell.children.length===0));
  const nodes=added.nodes.filter(n=>n.id=== 'sample' || slide.querySelector(`[data-deck-node="${n.id}"]`));
  const changes=nodes.flatMap(node=>node.textRuns.filter(run=>run.text.trim()).map(run=>({kind:'text',target:node.id,run:run.run,before:run.text,after:run.text+' 検査'})));
  const edited=m.applyDeckEditOperations(added.html,changes);
  assert.equal(m.applyDeckEditOperations(edited.html,edited.inverse).html,added.html);
  const saved=await h.api.commitRevision({organization:h.organization,pageSlug:`internal/check/${choice.kind}-${choice.id}`,html:edited.html,message:'編集の検証',author:h.owner});assert.ok(saved.versionId);
  assert.equal(m.applyDeckEditOperations(added.html,added.inverse).html,source);
 });
 await test('送信控えはアカウント別に復帰し、目的の編集画面を開いたときだけ消える',()=>{
  const storage=new JSDOM('',{url:'https://example.test'}).window.sessionStorage;
  const record={createdAt:Date.now(),request:m.deckCreateRequestSchema.parse({requestId:crypto.randomUUID(),themeId:'forest',title:'控え',firstSlide:{kind:'basic',id:'comparison'}})};
  m.writePendingDeckCreation(storage,'A@EXAMPLE.TEST',record);
  assert.deepEqual(m.readPendingDeckCreation(storage,'a@example.test'),record);assert.equal(m.readPendingDeckCreation(storage,'b@example.test'),null);
  m.completeDeckCreation(storage,'/internal/unrelated');assert.equal(storage.length,1);
  const complete={...record,url:'/internal/decks/'+'a'.repeat(32)+'?edit=1'};m.writePendingDeckCreation(storage,'a@example.test',complete);
  m.completeDeckCreation(storage,complete.url.split('?')[0]);assert.equal(storage.length,0);
  m.writePendingDeckCreation(storage,'a@example.test',{...record,createdAt:Date.now()-4*24*60*60*1000});assert.equal(m.readPendingDeckCreation(storage,'a@example.test'),null);
 });
}finally{await h.close();}
if(fails)process.exitCode=1;
