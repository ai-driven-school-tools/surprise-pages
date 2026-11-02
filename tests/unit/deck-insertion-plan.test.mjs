/** 複数枚の複製で「反映後の原稿」を先に求める関数が、実際の反映と 1 字も違わないことを確かめる。
 * 違っていても反映の側で読み直すだけで結果は変わらないが、同じでなければ先に読んでおく意味が無い。 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';

const temp=await mkdtemp(path.join(tmpdir(),'pages-insertion-plan-'));
const out=path.join(temp,'source.mjs');
await build({stdin:{resolveDir:process.cwd(),loader:'ts',contents:"export {applyDeckEditOperations,cloneDeckFragment,deckSourceAfterInsertions,deckSourceFragment,deckSourceIndexed,deckSourceOutline,prepareDeckEdit} from './src/lib/deck/edit/source';export {updateDeckSourceDocument} from './src/widget/deck/edit/source-document';"},bundle:true,platform:'node',format:'esm',outfile:out,logLevel:'silent'});
const source=await import(pathToFileURL(out).href);
await rm(temp,{recursive:true,force:true});

const deck=source.prepareDeckEdit('<!doctype html><html><head><title>検査</title></head><body data-deck><main data-deck-slides>'
 +['一','二','三','四'].map((text,index)=>`<section data-deck-slide data-deck-id="s${index}"><h1>${text}</h1><p>本文${index}</p></section>`).join('\n')
 +'<aside data-deck-notes>ノート</aside></main></body></html>').html;
const slides=source.deckSourceOutline(deck).map(entry=>entry.id);
function duplicates(ids){
 return ids.map((id,index)=>{
  const part=source.deckSourceFragment(deck,id),cloned=source.cloneDeckFragment(part.html,`copy${index}`);
  return {kind:'fragment',target:cloned.ids[id],parentId:'deck-root',beforeId:part.beforeId,before:null,after:cloned.html};
 });
}

test('複数枚の複製では、先に求めた原稿が実際の反映の結果と一致する',()=>{
 for(const ids of [slides.slice(0,2),slides.slice(1),slides,[slides[3],slides[0]]]){
  const ops=duplicates(ids),planned=source.deckSourceAfterInsertions(deck,ops);
  assert.equal(typeof planned,'string');
  assert.equal(planned,source.applyDeckEditOperations(deck,ops).html);
  // 反映で読み取った結果は手元に残る（次の段で読み直さない）。
  assert.equal(source.deckSourceIndexed(planned),true);
 }
});

test('1 枚だけ・独立していない変更・壊れた断片では求めない（反映の側の通常の検証に任せる）',()=>{
 const ops=duplicates(slides.slice(0,2));
 assert.equal(source.deckSourceAfterInsertions(deck,ops.slice(0,1)),null);
 assert.equal(source.deckSourceAfterInsertions(deck,[ops[0],{...ops[1],before:'<section></section>'}]),null);
 assert.equal(source.deckSourceAfterInsertions(deck,[ops[0],{...ops[1],after:'<section data-deck-slide><h1>目印が合わない</h1></section>'}]),null);
 assert.equal(source.deckSourceAfterInsertions(deck,[ops[0],{...ops[1],target:ops[0].target,after:ops[0].after}]),null);
});

test('枚を差し込んだだけの変更では、資料全体を読み直さずに、通常の読み取りと同じ DOM になる',()=>{
 const {DOMParser}=new JSDOM('').window,parse=html=>new DOMParser().parseFromString(html,'text/html');
 for(const ids of [slides.slice(0,2),[slides[3]],slides,[slides[3],slides[0]]]){
  const ops=duplicates(ids),after=source.applyDeckEditOperations(deck,ops).html,doc=parse(deck);
  const updated=source.updateDeckSourceDocument(deck,after,doc,parse);
  assert.equal(updated,doc,'全体を読み直しています');
  assert.equal(updated.documentElement.outerHTML,parse(after).documentElement.outerHTML);
 }
 // 差し込み以外の変更（枚の中身の直し）が混ざれば、この近道は使わない（結果は同じ DOM）。
 const ops=duplicates(slides.slice(0,2)),inserted=source.applyDeckEditOperations(deck,ops).html,edited=inserted.replace('>一</h1>','>一改</h1>');
 assert.notEqual(edited,inserted);
 source.deckSourceOutline(edited);
 const doc=parse(deck),updated=source.updateDeckSourceDocument(deck,edited,doc,parse);
 assert.notEqual(updated,doc);assert.equal(updated.documentElement.outerHTML,parse(edited).documentElement.outerHTML);
});
