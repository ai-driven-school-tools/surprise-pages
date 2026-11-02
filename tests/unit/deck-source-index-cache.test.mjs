import assert from 'node:assert/strict';
import {build} from 'esbuild';
const built=await build({stdin:{contents:"export * from './src/lib/deck/edit/source';",resolveDir:process.cwd()},bundle:true,write:false,format:'esm',platform:'node'});
const api=await import('data:text/javascript;base64,'+Buffer.from(built.outputFiles[0].text).toString('base64'));
const raw='<!doctype html><html><body data-deck><main data-deck-slides><section data-deck-slide><p>最初の本文</p></section></main></body></html>';
const prepared=api.prepareDeckSource(raw);
assert.notEqual(prepared,raw);assert.throws(()=>api.inspectDeckEdit(raw),/開き直してください/);
assert.equal(api.prepareDeckSource(prepared),prepared);assert.equal(api.prepareDeckEdit(raw).html,prepared);
console.log('OK  目印不足を許した索引でも必須の再取得は拒否し、追加後の本文と混ぜない');
const original=api.inspectDeckEdit(prepared).nodes,target=original.find(node=>node.tag==='p');
const changed=api.applyDeckEditOperations(prepared,[{kind:'text',target:target.id,run:0,before:'最初の本文',after:'変更した本文と長い追記'}]);
assert.equal(api.inspectDeckEdit(prepared).nodes.find(node=>node.id===target.id).textRuns[0].text,'最初の本文');
assert.equal(api.inspectDeckEdit(changed.html).nodes.find(node=>node.id===target.id).textRuns[0].text,'変更した本文と長い追記');
target.textRuns[0].text='表示モデルだけの変更';assert.equal(api.inspectDeckEdit(prepared).nodes.find(node=>node.id===target.id).textRuns[0].text,'最初の本文');
console.log('OK  部分更新した木と過去の木の索引は独立し、外へ返す表示モデルも共有しない');
for(const duplicate of ['<aside data-deck-notes data-deck-node="same">ノート</aside>','<svg data-deck-node="same"></svg>','<script data-deck-node="same"></script>']){
 const html=`<html><body data-deck><main data-deck-slides><section data-deck-slide data-deck-node="slide"><p data-deck-node="same">本文</p>${duplicate}</section></main></body></html>`;
 assert.throws(()=>api.prepareDeckSource(html),/重複/);assert.throws(()=>api.inspectDeckEdit(html),/重複/);
}
console.log('OK  編集対象外の領域との目印重複も拒否し、検査途中の索引を再利用しない');
