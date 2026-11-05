/** 資料をまたぐコピー・貼り付けの決まり（src/lib/deck/edit/clipboard.ts）。素材の参照の拾い方・書き換え・枚の貼り付けの操作を確かめる。 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';

const temp=await mkdtemp(path.join(tmpdir(),'pages-clipboard-'));
const out=path.join(temp,'clipboard.mjs');
await build({stdin:{resolveDir:process.cwd(),loader:'ts',contents:"export * from './src/lib/deck/edit/clipboard';export {applyDeckEditOperations,deckSourceOutline,prepareDeckEdit} from './src/lib/deck/edit/source';"},bundle:true,platform:'node',format:'esm',outfile:out,logLevel:'silent'});
const lib=await import(pathToFileURL(out).href);
await rm(temp,{recursive:true,force:true});

const deck=lib.prepareDeckEdit('<!doctype html><html><head><title>検査</title></head><body data-deck><main data-deck-slides>'
 +'<section data-deck-slide data-deck-id="a"><h1>一</h1><img src="images/a%20b.png" alt=""></section>'
 +'<section data-deck-slide data-deck-id="b"><h1>二</h1><video src="_deck/media-11111111-2222-3333-4444-555555555555.mp4" poster="_deck/media-11111111-2222-3333-4444-555555555556.jpg"></video></section>'
 +'<section data-deck-slide data-deck-id="c"><h1>三</h1><div style="background-image:url(&quot;bg.png&quot;)">背景</div><img src="https://example.com/x.png" alt=""></section>'
 +'</main></body></html>').html;
const ids=lib.deckSourceOutline(deck).map(entry=>entry.id);

test('写しが指すページの中の素材だけを拾い、外の URL は拾わない',()=>{
  const slides=lib.deckSlideClips(deck,ids);
  assert.deepEqual(lib.deckClipReferences({page:'internal/a',slides}).sort(),['_deck/media-11111111-2222-3333-4444-555555555555.mp4','_deck/media-11111111-2222-3333-4444-555555555556.jpg','bg.png','images/a%20b.png'].sort());
});

test('素材の参照を貼り先の在り処へ書き換え、表に無い参照は残す',()=>{
  const html='<img src="images/a%20b.png" alt=""><div style="background:url(&quot;bg.png&quot;)"></div><img src="keep.png">';
  const next=lib.rewriteDeckAssetReferences(html,{'images/a%20b.png':'_deck/media-aaaaaaaa-0000-0000-0000-000000000000.png','bg.png':'_deck/media-bbbbbbbb-0000-0000-0000-000000000000.png'});
  assert.match(next,/src="_deck\/media-aaaaaaaa-0000-0000-0000-000000000000\.png"/);
  assert.match(next,/url\(&quot;_deck\/media-bbbbbbbb-0000-0000-0000-000000000000\.png&quot;\)/);
  assert.match(next,/src="keep\.png"/);
});

test('枚を貼ると、選んだ枚の後ろに新しい ID で並び、1 回の反映で入る',()=>{
  const clips=lib.deckSlideClips(deck,[ids[2]]);
  let n=0;
  const pasted=lib.deckSlidePasteOperations(deck,clips,ids[0],()=>`paste${n++}`);
  assert.equal(pasted.ids.length,1);
  const after=lib.applyDeckEditOperations(deck,pasted.operations).html;
  const order=lib.deckSourceOutline(after).map(entry=>entry.id);
  assert.deepEqual(order,[ids[0],pasted.ids[0],ids[1],ids[2]]);
  assert.match(after,/三[\s\S]*二[\s\S]*三/);
});

test('写しの中の親子は保ち、写しの外の親は外して、貼り先の枚と同じ親に置く',()=>{
  // b を a の子にした資料
  const nested=lib.applyDeckEditOperations(deck,[{kind:'outline',target:'deck-root',before:lib.deckSourceOutline(deck),after:[{id:ids[0],parent:null},{id:ids[1],parent:ids[0]},{id:ids[2],parent:null}]}]).html;
  const both=lib.deckSlideClips(nested,[ids[0],ids[1]]),child=lib.deckSlideClips(nested,[ids[1]]);
  assert.equal(both[1].parent,ids[0]);
  assert.equal(child[0].parent,null);
  assert.doesNotMatch(child[0].html,/data-deck-parent/);
  let n=0;
  const pasted=lib.deckSlidePasteOperations(nested,both,ids[2],()=>`p${n++}`);
  const outline=lib.deckSourceOutline(lib.applyDeckEditOperations(nested,pasted.operations).html);
  assert.deepEqual(outline.slice(-2),[{id:pasted.ids[0],parent:null},{id:pasted.ids[1],parent:pasted.ids[0]}]);
  // 枝の途中（a）の後ろに貼ると、a の子（b）の後ろに入る
  const into=lib.deckSlidePasteOperations(nested,child,ids[0],()=>`q${n++}`);
  assert.deepEqual(lib.deckSourceOutline(lib.applyDeckEditOperations(nested,into.operations).html).map(entry=>entry.id),[ids[0],ids[1],into.ids[0],ids[2]]);
});

test('目印（data-deck-id）の無い資料の枚を貼ると、目印を付けて入る（見た目を持つ資料は全部の枚に目印が要る）',()=>{
  const plain=lib.prepareDeckEdit('<!doctype html><html><head><title>素</title></head><body data-deck><main data-deck-slides><section data-deck-slide><h1>素の枚</h1></section></main></body></html>').html;
  const clips=lib.deckSlideClips(plain,lib.deckSourceOutline(plain).map(entry=>entry.id));
  assert.doesNotMatch(clips[0].html,/data-deck-id/);
  const pasted=lib.deckSlidePasteOperations(deck,clips,null,()=>'plain');
  const after=lib.applyDeckEditOperations(deck,pasted.operations).html;
  assert.match(after,new RegExp(`<section data-deck-id="${pasted.ids[0]}" data-deck-slide`));
  assert.equal(lib.deckSourceOutline(after).at(-1).id,pasted.ids[0],'選んでいなければ末尾');
});

test('要素を貼ると、新しい ID で枚の末尾に入る',()=>{
  const slideNode=lib.deckSourceOutline(deck)[0].id;
  const after=lib.applyDeckEditOperations(deck,[]).html;
  const match=/<img[^>]*data-deck-node="([^"]+)"/.exec(after);
  assert.ok(match);
  const clips=lib.deckElementClips(deck,[match[1]]);
  const pasted=lib.deckElementPasteOperations(clips,slideNode,()=>'el');
  assert.equal(pasted.ids.length,1);
  assert.notEqual(pasted.ids[0],match[1]);
  const next=lib.applyDeckEditOperations(deck,pasted.operations).html;
  assert.equal((next.match(/images\/a%20b\.png/g)??[]).length,2);
});

test('保存領域から読んだ写しの形を確かめる',()=>{
  assert.equal(lib.deckClipboardSchema.safeParse({page:'internal/a',slides:[{id:'x',parent:null,html:'<section></section>'}]}).success,true);
  assert.equal(lib.deckClipboardSchema.safeParse({page:'internal/a',slides:[]}).success,false);
  assert.equal(lib.deckClipboardSchema.safeParse({page:'internal/a',elements:[{id:'x',html:'<p></p>',extra:1}]}).success,false);
});
