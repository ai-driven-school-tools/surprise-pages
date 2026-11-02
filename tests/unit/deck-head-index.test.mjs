/** 設定（head の中）だけを変えたとき、本文を読み直さずに作った木が、通常の読み取りと位置情報まで一致することを確かめる。 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';
import {parse} from 'parse5';

const temp=await mkdtemp(path.join(tmpdir(),'pages-head-index-'));
const out=path.join(temp,'source.mjs');
await build({stdin:{resolveDir:process.cwd(),loader:'ts',contents:"export {applyDeckEditOperations,deckSourceSetting,prepareDeckEdit} from './src/lib/deck/edit/source';export {sourceTreeEntry} from './src/lib/html/source-index';"},bundle:true,platform:'node',format:'esm',outfile:out,logLevel:'silent'});
const source=await import(pathToFileURL(out).href);
await rm(temp,{recursive:true,force:true});

const body='<body data-deck><main data-deck-slides><section data-deck-slide data-deck-id="s1"><h1>見出し</h1>\n<p>本文 &amp; 記号</p></section>\n<section data-deck-slide data-deck-id="s2"><p>二枚目</p></section></main></body></html>';
const decks=[
 '<!doctype html><html><head><style>.a{color:red}</style></head>'+body,
 '<!doctype html>\n<html lang="ja">\n<head>\n<title>元の題</title>\n<script>const example="<body>literal</body>";</script>\n</head>\n'+body,
 '<!doctype html><html><head><title>題</title></head>\n\n'+body,
].map(html=>source.prepareDeckEdit(html).html);
const settings=[
 [{kind:'setting-field',target:'deck-document',name:'appearance',path:['document','background'],before:null,after:'#eeeeee'}],
 [{kind:'setting-field',target:'deck-document',name:'appearance',path:['document','background'],before:null,after:'#eeeeee'},{kind:'setting-field',target:'deck-document',name:'appearance',path:['document','accent'],before:null,after:'#123456'},{kind:'setting',target:'deck-document',name:'title',before:'@current',after:'複数行の\n新しい題名'}],
];

test('設定だけの変更で手元に残す木は、通常の読み取りと位置情報まで一致する',()=>{
 let reused=0;
 const check=html=>{const entry=source.sourceTreeEntry(html);if(!entry)return;reused++;assert.deepEqual(entry.tree,parse(html,{sourceCodeLocationInfo:true}));};
 for(const deck of decks)for(const template of settings){
  const operations=template.map(op=>op.before==='@current'?{...op,before:source.deckSourceSetting(deck,op.name)??null}:op);
  // 変更 → 取り消し → もう一度、と木を続けて差し替えても、毎回通常の読み取りと一致する。
  const changed=source.applyDeckEditOperations(deck,operations);assert.notEqual(changed.html,deck);assert.ok(source.sourceTreeEntry(changed.html),'設定だけの変更で木が手元に残っていません');check(changed.html);
  const restored=source.applyDeckEditOperations(changed.html,changed.inverse);assert.equal(restored.html,deck);check(restored.html);
  const again=source.applyDeckEditOperations(restored.html,operations);assert.equal(again.html,changed.html);check(again.html);
 }
 assert.ok(reused>=decks.length*settings.length*2);
});
