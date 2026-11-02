import {test} from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
const bundle=await build({stdin:{contents:"export {createDeckCanvas} from './src/widget/deck/canvas';export {isMediaFile} from './src/lib/deck/media/media';",resolveDir:process.cwd()},bundle:true,write:false,platform:'node',format:'esm'});
const {createDeckCanvas,isMediaFile}=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
function setup(text){
 const dom=new JSDOM(`<style>p{width:300px;height:40px}</style><body><section data-deck-slide data-deck-node="s"><p data-deck-node="p">${text}</p></section></body>`,{pretendToBeVisual:true});dom.window.focus=()=>{};
 const doc=dom.window.document;
 const nodes=[{id:'s',tag:'section',textRuns:[]},{id:'p',tag:'p',textRuns:[{run:0,text}]}].map(node=>({...node,slideId:'s',style:{},created:false}));
 const canvas=createDeckCanvas({document:doc,nodes,onOperations:()=>{}});
 return {dom,doc,canvas,close(){canvas.dispose();dom.window.close();}};
}
test('direct updates preserve the caret during undo and do not accept stale text',()=>{
 const {dom,doc,canvas,close}=setup('ABC123');try{
  const p=doc.querySelector('p');p.dispatchEvent(new dom.window.MouseEvent('dblclick',{bubbles:true}));
  doc.getSelection().setBaseAndExtent(p.firstChild,3,p.firstChild,3);
  const operation={kind:'text',target:'p',run:0,before:'ABC123',after:'ABC12'};
  assert.equal(canvas.canApplyDirect([operation]),true);canvas.applyRemote([operation]);
  assert.equal(doc.getSelection().anchorOffset,3);assert.equal(p.textContent,'ABC12');
  assert.equal(canvas.canApplyDirect([{...operation,before:'ABC',after:'AXBC'}]),false);
 }finally{close();}
});
test('a stale dialog that requires merging never bypasses the source renderer',()=>{
 const {canvas,close}=setup('ABC remote');try{
  assert.equal(canvas.canApplyDirect([{kind:'text',target:'p',run:0,before:'ABC',after:'AXBC'}]),false);
  assert.equal(canvas.canApplyDirect([{kind:'text',target:'p',run:0,before:'ABC remote',after:'AXBC remote'},{kind:'text',target:'p',run:0,before:'AXBC remote',after:'AXBC remote!'}]),true);
 }finally{close();}
});
test('files from the slide window remain files without copying their contents',()=>{
 const outer=new JSDOM(''),inner=new JSDOM('');try{
  const file=new inner.window.File(['image'],'image.png',{type:'image/png'});
  inner.window.Blob.prototype.arrayBuffer=async()=>new ArrayBuffer(0);
  assert.equal(file instanceof outer.window.File,false);assert.equal(isMediaFile(file),true);assert.equal(isMediaFile({name:'not-a-file',type:'image/png',size:0}),false);
 }finally{outer.window.close();inner.window.close();}
});
