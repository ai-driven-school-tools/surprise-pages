import {test,after} from 'node:test';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
const dir=await mkdtemp(path.join(tmpdir(),'deck-local-test-'));after(()=>rm(dir,{recursive:true,force:true}));
const file=path.join(dir,'local.mjs');
await build({stdin:{contents:"export {createDeckLocalEdits} from './src/lib/deck/edit/local';export {prepareDeckEdit,applyDeckEditOperations} from './src/lib/deck/edit/source';",resolveDir:process.cwd()},bundle:true,outfile:file,platform:'node',format:'esm'});
const {createDeckLocalEdits,prepareDeckEdit,applyDeckEditOperations}=await import(pathToFileURL(file).href);
const html=prepareDeckEdit('<!doctype html><html><head><style>.a{color:red}</style></head><body data-deck><main data-deck-slides><section data-deck-slide data-deck-node="a"><p data-deck-node="text-a">短い文 &amp; A</p><aside data-deck-notes>非公開</aside></section><section data-deck-slide data-deck-node="b"><p data-deck-node="text-b">二枚目</p></section></main></body></html>').html;
test('local edits match canonical bytes and inverses across slides and shifted offsets',()=>{
 const local=createDeckLocalEdits();local.prepare(html);let source=html;
 for(const operation of [
  {kind:'text',target:'text-a',run:0,before:'短い文 & A',after:'長い文 < & > " 日本語を加える'},
  {kind:'style',target:'text-b',property:'color',before:null,after:'#123456'},
  {kind:'text',target:'text-b',run:0,before:'二枚目',after:'短'},
 ]){
  const expected=applyDeckEditOperations(source,[operation]),actual=local.apply(source,[operation]);
  assert.equal(actual.html,expected.html);assert.deepEqual(actual.inverse,expected.inverse);
  assert.equal(local.apply(actual.html,actual.inverse).html,source);source=actual.html;
 }
 local.dispose();
});
test('remote changes invalidate indexes; structural batches and conflicts retain canonical rules',()=>{
 const local=createDeckLocalEdits();local.prepare(html);
 const remote=applyDeckEditOperations(html,[{kind:'text',target:'text-a',run:0,before:'短い文 & A',after:'遠隔変更で位置が変わる'}]).html;
 const op={kind:'text',target:'text-b',run:0,before:'二枚目',after:'次'};
 assert.equal(local.apply(remote,[op]).html,applyDeckEditOperations(remote,[op]).html);
 const insertion={kind:'insert',target:'b',node:{id:'new',tag:'p',text:'新しい文章'}};
 assert.equal(local.apply(remote,[insertion]).html,applyDeckEditOperations(remote,[insertion]).html);
 assert.throws(()=>local.apply(remote,[{...insertion,node:{...insertion.node,id:'text-a'}}]));
 assert.throws(()=>local.apply(remote,[{...op,target:'missing'}]));
});
test('local structural edits preserve canonical inverses and support subsequent typing',()=>{
 const local=createDeckLocalEdits();let current=html;
 const batches=[
  [{kind:'insert',target:'a',node:{id:'added',tag:'p',text:'追加'}}],
  [{kind:'text',target:'added',run:0,before:'追加',after:'追加した文字を編集'}],
  [{kind:'notes',target:'a',before:'非公開',after:'長い非公開のノート'}],
  [{kind:'style',target:'text-b',property:'translate',before:null,after:'10px 20px'}],
 ];
 for(const ops of batches){const actual=local.apply(current,ops),expected=applyDeckEditOperations(current,ops);assert.equal(actual.html,expected.html);assert.deepEqual(actual.inverse,expected.inverse);assert.equal(local.apply(actual.html,actual.inverse).html,current);current=actual.html;}
});
test('independent slide insertions retain sequential ordering, inverse and idempotency',()=>{
 const operations=Array.from({length:12},(_,i)=>({kind:'fragment',target:`copy-${i}`,parentId:'deck-root',beforeId:'b',before:null,after:`<section data-deck-slide data-deck-id="copy-${i}" data-deck-node="copy-${i}"><p data-deck-node="copy-text-${i}">資料${i}</p></section>`}));
 let sequential=html;const inverse=[];
 for(const op of operations){const result=applyDeckEditOperations(sequential,[op]);sequential=result.html;inverse.unshift(...result.inverse);}
 const batch=applyDeckEditOperations(html,operations);assert.equal(batch.html,sequential);assert.deepEqual(batch.inverse,inverse);assert.equal(applyDeckEditOperations(batch.html,batch.inverse).html,html);
 assert.equal(applyDeckEditOperations(html,[operations[0],operations[0]]).html,applyDeckEditOperations(html,[operations[0]]).html);
 const collision={...operations[1],after:operations[1].after.replace('copy-text-1','copy-text-0')};assert.throws(()=>applyDeckEditOperations(html,[operations[0],collision]));
});
test('settings batches preserve every body byte and inverse across script body literals',()=>{
 const original=html.replace('</head>','<script>const example="<body>literal</body>";</script></head>');
 const operations=[{kind:'setting-field',target:'deck-document',name:'appearance',path:['document','background'],before:null,after:'#eeeeee'},{kind:'setting-field',target:'deck-document',name:'appearance',path:['document','accent'],before:null,after:'#123456'},{kind:'setting',target:'deck-document',name:'title',before:null,after:'新しい題名'}];
 const updated=applyDeckEditOperations(original,operations);
 assert.equal(updated.html.slice(updated.html.indexOf('<body data-deck>')),original.slice(original.indexOf('<body data-deck>')));
 assert.ok(updated.html.includes('const example="<body>literal</body>";'));
 assert.deepEqual(updated.nodes,applyDeckEditOperations(original,[]).nodes);
 assert.equal(applyDeckEditOperations(updated.html,updated.inverse).html,original);
 assert.throws(()=>applyDeckEditOperations(original,[{...operations[0],before:'#abcdef'}]));
});
test('legacy settings in the body retain sequential behavior when an earlier head setting is removed',()=>{
 const original=html.replace('<head>','<head><title>head</title>').replace('<body data-deck>','<body data-deck><title>body</title>');
 const operations=[{kind:'setting',target:'deck-document',name:'title',before:'head',after:null},{kind:'setting',target:'deck-document',name:'title',before:'body',after:'new'}];
 const batch=applyDeckEditOperations(original,operations),sequential=operations.reduce((source,op)=>applyDeckEditOperations(source,[op]).html,original);
 assert.equal(batch.html,sequential);assert.ok(batch.html.includes('<body data-deck><title>new</title>'));
});
test('head settings retain a correct local slide index for the next edit and undo',()=>{
 const local=createDeckLocalEdits();local.prepare(html);
 const settings=[{kind:'setting-field',target:'deck-document',name:'appearance',path:['document','background'],before:null,after:'#eeeeee'},{kind:'setting',target:'deck-document',name:'title',before:null,after:'長い題名'}];
 const changed=local.apply(html,settings);assert.equal(changed.html,applyDeckEditOperations(html,settings).html);
 const op={kind:'text',target:'text-b',run:0,before:'二枚目',after:'配色の後でも正しい編集対象'};
 const typed=local.apply(changed.html,[op]);assert.equal(typed.html,applyDeckEditOperations(changed.html,[op]).html);
 assert.equal(local.apply(typed.html,typed.inverse).html,changed.html);
 assert.equal(local.apply(changed.html,changed.inverse).html,html);
});
test('pending typing before structural changes preserves canonical bytes and inverse order',()=>{
 const local=createDeckLocalEdits();local.prepare(html);
 const operations=[{kind:'text',target:'text-a',run:0,before:'短い文 & A',after:'途中'}, {kind:'text',target:'text-a',run:0,before:'途中',after:'続けて入力'}, {kind:'setting',target:'deck-document',name:'title',before:null,after:'題名'}, {kind:'fragment',target:'copied',parentId:'deck-root',beforeId:null,before:null,after:'<section data-deck-slide data-deck-node="copied"><p data-deck-node="copied-text">複製</p></section>'}];
 const expected=applyDeckEditOperations(html,operations),actual=local.apply(html,operations);
 assert.equal(actual.html,expected.html);assert.deepEqual(actual.inverse,expected.inverse);assert.equal(local.apply(actual.html,actual.inverse).html,html);
});

test('reserved IDs outside the edited island remain protected',()=>{
 for(const source of [html.replace('<style>','<script data-deck-node="reserved">void 0</script><style>'),html.replace('<aside data-deck-notes>','<script data-deck-node="reserved">void 0</script><aside data-deck-notes>')]){
  const local=createDeckLocalEdits();local.prepare(source);
  const conflict={kind:'insert',target:'b',node:{id:'reserved',tag:'p',text:'duplicate'}};
  assert.throws(()=>applyDeckEditOperations(source,[conflict]));assert.throws(()=>local.apply(source,[conflict]));
  const insertion={kind:'insert',target:'a',node:{id:'safe-new',tag:'p',text:'new'}};
  const actual=local.apply(source,[insertion]),expected=applyDeckEditOperations(source,[insertion]);assert.equal(actual.html,expected.html);assert.deepEqual(actual.inverse,expected.inverse);assert.equal(local.inspect(actual.html,'reserved'),undefined);
 }

});
