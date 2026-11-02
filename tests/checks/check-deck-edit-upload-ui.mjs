import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
import {readFile} from 'node:fs/promises';
import {webcrypto} from 'node:crypto';
import {root,dir} from './paths.mjs';
await build({stdin:{contents:`export * from './src/widget/deck/edit/session';export {applyDeckEditOperations} from './src/lib/deck/edit/source';`,resolveDir:root},outfile:`${dir}/deck-upload-ui.js`,bundle:true,format:'iife',globalName:'Session'});
let html='<html><body data-deck><main data-deck-slides><section data-deck-slide data-deck-node="slide"><p data-deck-node="title">Example</p></section></main></body></html>',version=1;
const dom=new JSDOM('<body><div id="host"></div></body>',{url:'https://example.test/internal/test',runScripts:'outside-only',pretendToBeVisual:true});
// Install the preview document before appending the iframe: jsdom may emit its
// native blank-document load before the next timer on Linux.
const inner=new JSDOM(html,{url:'https://example.test/internal/test',pretendToBeVisual:true});
const createElement=dom.window.document.createElement.bind(dom.window.document);
dom.window.document.createElement=(name,...options)=>{
 const element=createElement(name,...options);
 if(name.toLowerCase()==='iframe'){
  Object.defineProperty(element,'contentDocument',{value:inner.window.document});
  let source='';
  Object.defineProperty(element,'srcdoc',{get:()=>source,set:value=>{source=value;queueMicrotask(()=>{if(element.isConnected)element.dispatchEvent(new dom.window.Event('load'));});}});
 }
 return element;
};
const wait=async test=>{for(let n=0;n<100;n++){if(test())return;await new Promise(resolve=>setTimeout(resolve,50));}throw Error('UI condition timed out');};
Object.defineProperty(dom.window.crypto,'subtle',{value:{digest:(algorithm,data)=>webcrypto.subtle.digest(algorithm,new Uint8Array(data))}});
dom.window.Blob.prototype.arrayBuffer=function(){return new Promise((resolve,reject)=>{const reader=new dom.window.FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsArrayBuffer(this);});};
const pending=[];let posted=0;
const response=(value,status=200)=>({ok:status<400,status,json:async()=>value});
dom.window.fetch=async(url,options={})=>{
 if(url.includes('/media/jobs'))return response({jobs:[]});
 if(url.includes('/media/upload')){
  if(options.method==='POST'){posted++;return new Promise(resolve=>pending.push(()=>resolve(response({upload:'lease',chunkBytes:2*1024*1024}))));}
  if(options.method==='PUT')return response({received:0});
  if(options.method==='PATCH')return response({src:'_deck/media-test.png',intrinsicWidth:100,intrinsicHeight:100,bytes:5,originalBytes:5});
  return response({cancelled:true});
 }
 let inverse=[];
 if(options.method==='PATCH'){const body=JSON.parse(options.body),changed=dom.window.Session.applyDeckEditOperations(html,body.operations);html=changed.html;inverse=changed.inverse;version++;}
 return response({html,previewHtml:html,versionId:`v${version}`,versionNumber:version,presence:[],inverse});
};
dom.window.eval((await readFile(`${dir}/deck-upload-ui.js`,'utf8'))+'\nwindow.Session=Session;');
const host=dom.window.document.querySelector('#host').attachShadow({mode:'open'});
await dom.window.Session.openDeckEditSession({pageSlug:'internal/test',host,notify:()=>{},fail:()=>{}});
await wait(()=>host.querySelector('iframe.edit-frame')?.contentDocument===inner.window.document && inner.window.document.querySelector('[data-studio-active]'));
inner.window.document.querySelector('section').dispatchEvent(new inner.window.MouseEvent('pointerdown',{bubbles:true,button:0}));
const input=host.querySelector('input[type="file"]');
const add=name=>{Object.defineProperty(input,'files',{configurable:true,value:[new dom.window.File(['image'],name,{type:'image/png'})]});input.dispatchEvent(new dom.window.Event('change'));};
add('first.png');await wait(()=>posted===1);assert.ok(!host.querySelector('.deck-edit-status').textContent.includes('保存済み'));console.log('OK  画像の送信中は保存済みと表示しない');
const done=[...host.querySelectorAll('button')].find(b=>b.textContent==='完了');assert.equal(done.disabled,true);done.click();assert.equal(dom.window.Session.deckEditSessionActive(),true);console.log('OK  画像の追加を完了操作で途中中断しない');
const leaving=new dom.window.Event('beforeunload',{cancelable:true});dom.window.dispatchEvent(leaving);assert.equal(leaving.defaultPrevented,true);console.log('OK  画像の追加中にページを離れるときも未完了を伝える');
add('second.png');await wait(()=>posted===2);assert.equal(host.querySelectorAll('.ds-media-item').length,2);console.log('OK  送信中の追加を捨てず個別の進捗を表示する');
for(const resolve of pending)resolve();await wait(()=>!done.disabled);assert.equal((html.match(/<img/g)||[]).length,2,[...host.querySelectorAll('.ds-media-item')].map(row=>row.textContent).join(' / '));console.log('OK  複数画像を送信し配置の保存まで完了してから閉じられる');
assert.ok([...host.querySelectorAll('.ds-media-item')].every(row=>row.dataset.state==='saved'));console.log('OK  ファイルごとに保存完了を確認できる');
done.click();inner.window.close();dom.window.close();
