import {test} from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import path from 'node:path';
// 既にあるスライドを原稿から丸ごと送り直すとき、ブラウザや AI が直した分を黙って巻き戻さない（src/lib/deck/edit/republish-guard.ts）。
// S = 最後に原稿から投稿した版、L = いまの版（その後の直しを含む）、P = 送られてきた原稿
const bundle=await build({stdin:{contents:"export {republishReverts} from './src/lib/deck/edit/republish-guard';export {prepareDeckEdit} from './src/lib/deck/edit/source';",resolveDir:path.resolve(import.meta.dirname,'../..'),loader:'ts'},bundle:true,write:false,platform:'node',format:'esm'});
const {republishReverts,prepareDeckEdit}=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));

const deck=(slides)=>`<!doctype html><html lang="ja"><head><title>試し</title></head><body data-deck><main data-deck-slides>${slides.map((texts,i)=>`<section data-deck-slide data-deck-id="s${i}">${texts.map(text=>`<p>${text}</p>`).join('')}</section>`).join('')}</main></body></html>`;
const S=deck([['見出し','本文'],['二枚目']]);
// L は S に ID を付けたもの（ブラウザで開いたときと同じ手順）を、人が直した形
const edited=(replace)=>{let html=prepareDeckEdit(S).html;for(const [from,to] of replace)html=html.replace(`>${from}<`,`>${to}<`);return html;};

test('原稿が古いままなら、人の直しを巻き戻す箇所として返す',()=>{
  const L=edited([['見出し','見出し（B）']]);
  const result=republishReverts({source:S,current:L,proposed:S});
  assert.deepEqual(result.conflicts.map(c=>[c.source,c.current,c.proposed]),[['見出し','見出し（B）','見出し']]);
});

test('最新の版を取り寄せて直した原稿は通す',()=>{
  const L=edited([['見出し','見出し（B）']]);
  const P=L.replace('>本文<','>本文（AI）<');
  assert.deepEqual(republishReverts({source:S,current:L,proposed:P}),{conflicts:[]});
});

test('人と原稿が別の箇所を直しても、人の直しを含まない原稿は巻き戻しとして返す（丸ごと送ると消えるため）',()=>{
  const L=edited([['見出し','見出し（B）']]);
  const P=S.replace('>本文<','>本文（AI）<');
  assert.deepEqual(republishReverts({source:S,current:L,proposed:P}).conflicts.map(c=>[c.current,c.proposed]),[['見出し（B）','見出し']]);
});

test('人と原稿が同じ箇所を別々に直したなら重なりとして返す',()=>{
  const L=edited([['見出し','見出し（B）']]);
  const P=S.replace('>見出し<','>見出し（AI）<');
  assert.deepEqual(republishReverts({source:S,current:L,proposed:P}).conflicts.map(c=>[c.current,c.proposed]),[['見出し（B）','見出し（AI）']]);
});

test('原稿から投稿したあとに誰も直していなければ、何を送っても止めない',()=>{
  const P=deck([['まったく別の資料']]);
  assert.deepEqual(republishReverts({source:S,current:prepareDeckEdit(S).html,proposed:P}),{conflicts:[]});
});

test('原稿の組み立てが変わっていても、人の直しを含まなければ巻き戻しとして返す',()=>{
  const L=edited([['見出し','見出し（B）']]);
  const P=deck([['見出し','本文'],['二枚目'],['足した三枚目']]);
  assert.deepEqual(republishReverts({source:S,current:L,proposed:P}).conflicts.map(c=>[c.source,c.current]),[['見出し','見出し（B）']]);
});

test('人が消した文を、古い原稿が持ち込むなら巻き戻しとして返す',()=>{
  const L=prepareDeckEdit(S).html.replace(/<p data-deck-node="[^"]+">本文<\/p>/,'');
  assert.deepEqual(republishReverts({source:S,current:L,proposed:S}).conflicts.map(c=>[c.source,c.current,c.proposed]),[['本文',null,'本文']]);
});

test('復元で要素の ID の系統が切れていても、人の直しの巻き戻しを見つける',()=>{
  // いまの版は、原稿から投稿した S とは別の ID を持つ（古い版からの復元を経た形）
  const L=prepareDeckEdit(S.replace('<title>試し</title>','<title>試し（別の系統）</title>')).html.replace('>見出し<','>見出し（B）<');
  assert.deepEqual(republishReverts({source:S,current:L,proposed:S}).conflicts.map(c=>c.current),['見出し（B）']);
});

test('人が足した文を、古い原稿が落とすなら巻き戻しとして返す',()=>{
  const prepared=prepareDeckEdit(S).html;
  const L=prepared.replace('</section>','<p data-deck-node="node-added-1">人が足した文</p></section>');
  const result=republishReverts({source:S,current:L,proposed:S});
  assert.deepEqual(result.conflicts.map(c=>[c.current,c.proposed]),[['人が足した文',null]]);
});

test('原稿から投稿した版が無いときは、いまの文を落とす原稿だけを止める（足した文は止めない）',()=>{
  const L=prepareDeckEdit(S).html;
  assert.deepEqual(republishReverts({source:null,current:L,proposed:S.replace('</main>','<section data-deck-slide><p>足した枚</p></section></main>')}),{conflicts:[]});
  assert.deepEqual(republishReverts({source:null,current:L,proposed:deck([['見出し']])}).conflicts.map(c=>c.current),['本文','二枚目']);
});
