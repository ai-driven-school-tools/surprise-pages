import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
import {root,dir} from './paths.mjs';
await build({stdin:{contents:"export {planDeckPaint} from './src/widget/deck/render'; export {prepareDeckFonts} from './src/lib/deck/design/typography';",resolveDir:root},outfile:`${dir}/deck-render.mjs`,bundle:true,format:'esm',platform:'node'});
const {planDeckPaint,prepareDeckFonts}=await import(`${dir}/deck-render.mjs`);
const html=content=>`<!doctype html><html><head><title>検査</title></head><body data-deck><main data-deck-slides>${content}</main></body></html>`;
const slide=(id,content)=>`<section data-deck-slide data-deck-id="${id}" data-deck-node="${id}">${content}</section>`;
const original=html(slide('first','<p data-deck-node="text">元の文章</p><figure data-deck-node="chart"><div class="chart"></div></figure><aside data-deck-notes>ノート</aside>')+slide('second','<p data-deck-node="other">別の枚</p>'));
function environment(source){
  const dom=new JSDOM(source,{pretendToBeVisual:true});
  for(const name of ['Element','HTMLElement','DOMParser'])globalThis[name]=dom.window[name];
  globalThis.CSS={escape:value=>value};
  const doc=dom.window.document,released=[],updates=[];
  doc.deckLayout={refresh(){}};
  doc.deckRenderer={async update(change){updates.push(change);},release(roots){released.push(...roots);}};
  // Match the actual runtime's relocated notes.
  for(const section of doc.querySelectorAll('section')){const frame=doc.createElement('div');frame.setAttribute('data-deck-frame','');section.before(frame);frame.append(section);const note=section.querySelector('aside');if(note)frame.append(note);}
  const chart=doc.querySelector('.chart');if(chart)chart.innerHTML='<svg><text>生成された図</text></svg>';
  return {dom,doc,released,updates};
}
async function check(label,action){await action();console.log('OK '+label);}
await check('文章変更で無関係な図表・枚の実物を保つ',async()=>{
  const {dom,doc,updates}=environment(original),chart=doc.querySelector('figure'),other=doc.querySelector('[data-deck-node=second]');
  const plan=planDeckPaint(doc,original,original.replace('元の文章','更新した文章'));assert.ok(plan);await plan.prepare();await plan.apply();
  assert.equal(doc.querySelector('[data-deck-node=text]').textContent,'更新した文章');assert.equal(doc.querySelector('figure'),chart);assert.equal(doc.querySelector('[data-deck-node=second]'),other);assert.ok(chart.querySelector('svg'));assert.deepEqual(updates[0].slides,['first']);dom.window.close();
});
await check('追加・削除・順序だけを変え、残る要素と生成図を保つ',async()=>{
  const {dom,doc}=environment(original),chart=doc.querySelector('figure');
  const after=original.replace('<p data-deck-node="text">元の文章</p>','').replace('</figure>','</figure><p data-deck-node="new">追加</p>');
  const plan=planDeckPaint(doc,original,after);assert.ok(plan);await plan.apply();assert.equal(doc.querySelector('figure'),chart);assert.equal(doc.querySelector('[data-deck-node=text]'),null);assert.equal(doc.querySelector('[data-deck-node=new]').textContent,'追加');dom.window.close();
});
await check('配置変更で実行時の色指定を消さない',async()=>{
  const {dom,doc}=environment(original),node=doc.querySelector('[data-deck-node=text]');node.style.setProperty('--dd-text','black');
  const plan=planDeckPaint(doc,original,original.replace('data-deck-node="text"','data-deck-node="text" style="translate:10px 0px"'));assert.ok(plan);await plan.apply();assert.equal(doc.querySelector('[data-deck-node=text]'),node);assert.equal(node.style.getPropertyValue('--dd-text'),'black');assert.equal(node.style.translate,'10px 0px');dom.window.close();
});
await check('ノートだけの変更で本文を作り直さない',async()=>{
  const {dom,doc}=environment(original),node=doc.querySelector('section');const plan=planDeckPaint(doc,original,original.replace('>ノート<','>新しいノート<'));assert.ok(plan);await plan.apply();assert.equal(doc.querySelector('section'),node);assert.equal(doc.querySelector('[data-deck-frame]>aside').textContent,'新しいノート');dom.window.close();
});
await check('独自の実行処理や外側の構成変更は触る前に読み直しへ回す',async()=>{
  const {dom,doc}=environment(original);assert.equal(planDeckPaint(doc,original,original.replace('</head>','<script>window.custom=true</script></head>')),null);assert.equal(planDeckPaint(doc,original,original.replace('<body data-deck>','<body data-deck class="custom">')),null);assert.equal(doc.querySelector('script'),null);dom.window.close();
});
await check('対応しない旧実行部を部分更新で壊さない',async()=>{
  const {dom,doc}=environment(original);delete doc.deckLayout;assert.equal(planDeckPaint(doc,original,original.replace('元の文章','変更')),null);dom.window.close();
});
await check('読込済みの引用符付き書体を再取得しない',async()=>{
  const {dom,doc}=environment(original);
  Object.defineProperty(doc,'fonts',{value:new Set([{family:'"SP Deck Inter"',weight:'100 900',status:'loaded'},{family:'"SP Deck Noto Sans JP"',weight:'100 900',status:'loaded'}])});
  globalThis.FontFace=class {constructor(){throw Error('Loaded fonts must not be requested again');}};
  await prepareDeckFonts(doc,['modern']);delete globalThis.FontFace;dom.window.close();
});
