import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';
const temp=await mkdtemp(path.join(tmpdir(),'pages-source-index-'));
try{
 const out=path.join(temp,'source.mjs');
 await build({stdin:{resolveDir:process.cwd(),loader:'ts',contents:`export * from './src/lib/deck/edit/source';export {emptyOverrides} from './src/lib/deck/design/design';`},bundle:true,platform:'node',format:'esm',outfile:out,plugins:[{name:'inspect-private-source-index',setup(b){b.onLoad({filter:/deck\/edit\/source\.ts$/},async args=>({contents:(await readFile(args.path,'utf8'))+'\nexport {sourceTree as inspectSourceTreeForTest};',loader:'ts'}));}}]});
 const warm=await import(pathToFileURL(out).href),cold=await import(pathToFileURL(out).href+'?cold');
 const fixtures=[
  '<!doctype html>\n<html><head><title>元のタイトル</title><script type="application/json" data-deck-overrides>{"version":1,"document":{},"slides":{}}</script></head><body data-deck><main data-deck-slides><section data-deck-slide><h1>見出し</h1>\n<p>文章<strong>強調</strong>続き</p><table><tbody><tr><td>セル</td></tr></tbody></table><pre>コード\n次</pre><div><p style="color:red">末尾</p></div></section></main></body></html>',
  '<html><head></head><body data-deck><main data-deck-slides><section data-deck-slide><p>閉じ方が古い<div><span>次の文章</span></div></section></main></body></html>',
 ];
 let serial=0;
 for(const fixture of fixtures){
  let html=warm.prepareDeckEdit(fixture).html;
  const targets=warm.inspectDeckEdit(html).nodes.filter(node=>node.textRuns.some(run=>run.text.trim()));
  for(let round=0;round<10;round++)for(const target of targets){
   const current=warm.inspectDeckEdit(html).nodes.find(node=>node.id===target.id),run=current.textRuns[0];
   const value=['\n改行\nあいう','<タグ>&引用"😀','短い','', '\r\n正規化', '\u0000文字'][serial++%6]+String(serial);
   const op={kind:'text',target:target.id,run:run.run,before:run.text,after:value};
   warm.deckEditStructureFingerprint(html);
   const result=warm.applyDeckEditOperations(html,[op]);html=result.html;
   try{assert.deepEqual(warm.inspectSourceTreeForTest(html),cold.inspectSourceTreeForTest(html));}catch(error){console.error({serial,target:target.id,tag:target.tag,before:op.before,after:op.after,html});throw error;}
   assert.deepEqual(result.nodes,cold.inspectDeckEdit(html).nodes);
   assert.equal(warm.deckEditStructureFingerprint(html),cold.deckEditStructureFingerprint(html));
   for(const node of targets)assert.deepEqual(warm.deckSourceFragment(html,node.id),cold.deckSourceFragment(html,node.id));
  }
 }
 for(const value of [' ','改行\n次']){
  const raw='<html><head></head><body data-deck><main data-deck-slides><section data-deck-slide><div><b>前</b><table>x<tr><td>セル</td></tr></table></div></section></main></body></html>';
  const prepared=warm.prepareDeckEdit(raw),parent=prepared.nodes.find(node=>node.tag==='div'&&node.textRuns.some(run=>run.text==='x'));
  warm.deckEditStructureFingerprint(prepared.html);
  const result=warm.applyDeckEditOperations(prepared.html,[{kind:'text',target:parent.id,run:0,before:'x',after:value}]);
  assert.deepEqual(warm.inspectSourceTreeForTest(result.html),cold.inspectSourceTreeForTest(result.html));
  assert.deepEqual(result.nodes,cold.inspectDeckEdit(result.html).nodes);assert.equal(warm.deckEditStructureFingerprint(result.html),cold.deckEditStructureFingerprint(result.html));
 }
 for(const style of ['style="color:red"',"STYLE='color:red;--custom:x&amp;y'",'style=color:red','style="color:red" style="color:blue"','']){
  let html=warm.prepareDeckEdit(`<html><head></head><body data-deck><main data-deck-slides><section data-deck-slide><h1 ${style}>先頭</h1><p>次の文章</p></section></main></body></html>`).html;
  const id=warm.inspectDeckEdit(html).nodes.find(node=>node.tag==='h1').id;
  for(let round=0;round<6;round++){
    const op={kind:'style',target:id,property:['width','height','min-width','max-width','min-height','max-height'][round],before:null,after:`${round+100}px`};
    warm.deckEditStructureFingerprint(html);
    const result=warm.applyDeckEditOperations(html,[op]);html=result.html;
    assert.deepEqual(warm.inspectSourceTreeForTest(html),cold.inspectSourceTreeForTest(html));
    assert.deepEqual(result.nodes,cold.inspectDeckEdit(html).nodes);assert.equal(warm.deckEditStructureFingerprint(html),cold.deckEditStructureFingerprint(html));
  }
 }
 {
  const html=warm.prepareDeckEdit('<html><head></head><body data-deck><main data-deck-slides><section data-deck-slide><p data-deck-created style="width:url(x)">本文</p></section></main></body></html>').html;
  const node=warm.inspectDeckEdit(html).nodes.find(n=>n.tag==='p');warm.deckEditStructureFingerprint(html);
  const changed=warm.applyDeckEditOperations(html,[{kind:'style',target:node.id,property:'width',before:'url(x)',after:'100px'}]);
  assert.equal(warm.deckEditStructureFingerprint(changed.html),cold.deckEditStructureFingerprint(changed.html));
  assert.deepEqual(warm.inspectSourceTreeForTest(changed.html),cold.inspectSourceTreeForTest(changed.html));
 }
 console.log('OK  文章・改行・実体参照・古いHTMLの位置情報が毎回の完全解析と一致');
 let html=warm.prepareDeckEdit(fixtures[0]).html;
 // Use the actual setting marker produced by the source contract.
 const before=warm.deckSourceSetting(html,'appearance'),initial=warm.emptyOverrides();
 html=warm.applyDeckEditOperations(html,[{kind:'setting',target:'deck-document',name:'appearance',before,after:JSON.stringify(initial)}]).html;
 for(let i=0;i<40;i++){
  const value=warm.emptyOverrides();value.document.accent=i%2?'#123456':'#654321';
  const op={kind:'setting',target:'deck-document',name:'appearance',before:warm.deckSourceSetting(html,'appearance'),after:JSON.stringify(value,null,i%3?0:2)};
  const result=warm.applyDeckEditOperations(html,[op]);html=result.html;
  assert.deepEqual(warm.inspectSourceTreeForTest(html),cold.inspectSourceTreeForTest(html));
  assert.deepEqual(result.nodes,cold.inspectDeckEdit(html).nodes);assert.equal(warm.deckEditStructureFingerprint(html),cold.deckEditStructureFingerprint(html));
  for(const node of result.nodes)assert.deepEqual(warm.deckSourceFragment(html,node.id),cold.deckSourceFragment(html,node.id));
  assert.equal(warm.deckSourceSetting(html,'appearance'),cold.deckSourceSetting(html,'appearance'));
 }
 console.log('OK  設定の部分更新後も本文・設定・後続要素の位置が完全解析と一致');
 let attributes=warm.prepareDeckEdit('<!doctype html><html><body data-deck><main data-deck-slides><section data-deck-slide data-deck-node="first"><img data-deck-node="image" src="a.png"></section><section data-deck-slide data-deck-node="second"><p data-deck-node="label">text</p></section></main></body></html>').html;
 let alt=null,parent=null;
 for(const value of ['caption','改行\n😀 &"quote"','',null,'next']) {
  const op={kind:'attribute',target:'image',name:'alt',before:alt,after:value};attributes=warm.applyDeckEditOperations(attributes,[op]).html;alt=value;
  assert.deepEqual(warm.inspectSourceTreeForTest(attributes),cold.inspectSourceTreeForTest(attributes));assert.deepEqual(warm.inspectDeckEdit(attributes),cold.inspectDeckEdit(attributes));
 }
 for(const value of ['first',null,'first',null]) {
  const op={kind:'attribute',target:'second',name:'data-deck-parent',before:parent,after:value};attributes=warm.applyDeckEditOperations(attributes,[op]).html;parent=value;
  assert.deepEqual(warm.inspectSourceTreeForTest(attributes),cold.inspectSourceTreeForTest(attributes));assert.deepEqual(warm.deckSourceOutline(attributes),cold.deckSourceOutline(attributes));
 }
 console.log('OK  属性の追加・削除・親子関係の変更も完全解析と一致');
}finally{await rm(temp,{recursive:true,force:true});}
