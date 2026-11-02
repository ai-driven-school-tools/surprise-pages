import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
import {root,dir} from './paths.mjs';
import {CATALOG_CHAPTERS} from '../../scripts/generate/deck-catalog/chapters.mjs';
await build({stdin:{contents:`export * from './src/lib/deck/design/library';export * from './src/lib/deck/edit/source';export {readDeckCustomization} from './src/lib/deck/edit/customization-dom';export {withVendorScripts} from './src/lib/pages/content';`,resolveDir:root},outfile:`${dir}/deck-library.mjs`,bundle:true,format:'esm',platform:'node'});
const m=await import(`${dir}/deck-library.mjs`);
let fails=0;
async function test(label,fn){try{await fn();console.log('OK  '+label);}catch(e){fails++;console.log('NG  '+label+': '+e.stack);}}
const source=m.prepareDeckEdit('<!doctype html><html><head><title>資料</title><script type="application/json" data-deck-design>{"version":1,"document":{},"slides":{}}</script></head><body data-deck><main data-deck-slides><section data-deck-slide data-deck-id="opening"><h1>元の一枚</h1></section></main></body></html>').html;
await test('見本集と編集画面の94例・9分類が一対一で一致する',()=>{
  const expected=CATALOG_CHAPTERS.flatMap(c=>c.slides.map(s=>s[0]));
  assert.equal(expected.length,94);assert.equal(m.DECK_LIBRARY.categories.length,9);
  assert.deepEqual(m.DECK_LIBRARY.templates.map(t=>t.id),expected);assert.equal(new Set(expected).size,94);
  execFileSync(process.execPath,[`${root}/scripts/build/deck-library.mjs`,'--check']);
});
for(const template of m.DECK_LIBRARY.templates)await test(`${template.name}：追加・二重追加・段階表示・完全な取り消し`,()=>{
  const a=m.librarySlideOperations(source,template.id,'library-first',null);
  const first=m.applyDeckEditOperations(source,a);
  const b=m.librarySlideOperations(first.html,template.id,'library-second',null);
  const second=m.applyDeckEditOperations(first.html,b);
  assert.equal(m.deckSourceChildren(second.html,'deck-root').length,3);
  assert.equal(new Set(second.nodes.map(n=>n.id)).size,second.nodes.length);
  const dom=new JSDOM(second.html);
  const custom=m.readDeckCustomization(dom.window.document);
  assert.ok(custom?.focus);
  assert.deepEqual(custom.focus.effective.invalidTargets,[]);
  for(const id of ['library-first','library-second']) assert.ok(custom.focus.effective.slides.get(id)?.length);
  assert.equal(dom.window.document.querySelectorAll('img,video,audio').length,0);
  assert.equal(dom.window.document.querySelectorAll('[src^="assets/"],[poster]').length,0);
  assert.equal(m.deckSourceSetting(second.html,'design-source'),m.deckSourceSetting(source,'design-source'));
  assert.equal(m.applyDeckEditOperations(second.html,second.inverse).html,first.html);
  assert.equal(m.applyDeckEditOperations(first.html,first.inverse).html,source);
  dom.window.close();
});
await test('画像見本は外部通信なしで完結し、元の画像欄を差し替えて取り消せる',()=>{
  let count=0, bytes=0;
  const scenes=new Set();
  for(const template of m.DECK_LIBRARY.templates){
    const added=m.applyDeckEditOperations(source,m.librarySlideOperations(source,template.id,'picture-slide',null));
    const dom=new JSDOM(added.html);
    for(const slot of dom.window.document.querySelectorAll('[data-deck-media-slot="image"]')){
      count++;
      const svg=slot.querySelector('svg');assert.ok(svg);bytes+=Buffer.byteLength(svg.outerHTML);
      assert.ok(slot.hasAttribute('data-deck-sample-image'));assert.ok(slot.getAttribute('aria-label').includes('サンプル画像'));
      assert.equal(svg.querySelector('style,script,foreignObject,image,use,filter,[id],[href],[src]'),null);
      if(template.id.startsWith('composition-'))scenes.add(svg.outerHTML);
      const id=slot.getAttribute('data-deck-node');const part=m.deckSourceFragment(added.html,id);
      const replacement=`<img data-deck-node="${id}" src="_deck/media-example.png" alt="利用者の画像">`;
      const edited=m.applyDeckEditOperations(added.html,[{kind:'fragment',target:id,parentId:part.parentId,beforeId:part.beforeId,before:part.html,after:replacement}]);
      assert.ok(edited.html.includes(replacement));assert.equal(m.applyDeckEditOperations(edited.html,edited.inverse).html,added.html);
    }
    dom.window.close();
  }
  assert.ok(count>=40);assert.equal(scenes.size,10);assert.ok(bytes<250000,'見本の画像全体は250KB以内');
});
await test('図の追加は決められた道具だけを追加し、逆操作で元へ戻る',()=>{
  assert.throws(()=>m.applyDeckEditOperations(source,[{kind:'setting',target:'deck-document',name:'diagram-library',before:null,after:'https://invalid.example/script.js'}]));
  const first=m.applyDeckEditOperations(source,m.librarySlideOperations(source,'flow-state','state-slide',null));
  assert.equal(m.deckSourceSetting(first.html,'diagram-library'),'mermaid');
  const second=m.applyDeckEditOperations(first.html,m.librarySlideOperations(first.html,'flow-state','state-two',null));
  assert.equal((second.html.match(/DECK_LIBRARY_DIAGRAM_START/g)??[]).length,1);
});
await test('自由な実行コードと壊れた図のデータは追加できない',()=>{
  const ops=m.librarySlideOperations(source,'flow-quadrant','invalid-slide',null);
  for(const replacement of ['<script>alert(1)</script>','<script type="application/json" data-dd-native-source>{"kind":"quadrant","points":[]}</script>']){
    const op={...ops[0],after:ops[0].after.replace('</section>',replacement+'</section>')};
    assert.throws(()=>m.applyDeckEditOperations(source,[op]));
  }
});
await test('図を追加した直後の編集表示も配信時と同じ道具を使う',()=>{
  const ops=m.librarySlideOperations(source,'flow-state','preview-state',null);
  const original=m.applyDeckEditOperations(source,ops).html;
  const preview=m.withVendorScripts(m.applyDeckEditOperations(m.withVendorScripts(source),ops).html);
  assert.ok(original.includes('https://cdn.jsdelivr.net/npm/mermaid/dist/mermaid.min.js'));
  assert.ok(preview.includes('/vendor/mermaid.js/'));
  assert.ok(!preview.includes('src="https://cdn.jsdelivr.net/npm/mermaid'));
  assert.equal(m.applyDeckEditOperations(preview,m.applyDeckEditOperations(source,ops).inverse).html,m.withVendorScripts(source));
});
await test('既に共通の図の道具を持つ資料へ重複して追加しない',()=>{
  const existing=source.replace('</head>',m.DECK_LIBRARY.diagramKit+'</head>');
  assert.ok(!m.librarySlideOperations(existing,'flow-state','existing-state',null).some(op=>op.kind==='setting'&&op.name==='diagram-library'));
});
if(fails)process.exitCode=1;
