import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {parse,parseFragment} from 'parse5';
const built=await build({stdin:{contents:"export {parseStockHtml,parseStockHtmlInSlices} from './src/lib/html/stock-parser';export {navigationRuntime,designRuntime,designStyle} from './src/lib/deck/preview.generated';export {withVendorScripts} from './src/lib/html/vendor-scripts';",resolveDir:process.cwd()},bundle:true,write:false,platform:'node',format:'esm'});
const api=await import('data:text/javascript;base64,'+Buffer.from(built.outputFiles[0].text).toString('base64'));
const blocks=[api.navigationRuntime,api.designRuntime,api.designStyle].flatMap(block=>[block,api.withVendorScripts(block)]);
for(const block of blocks){
 const node=parseFragment(block,{sourceCodeLocationInfo:true}).childNodes[0],start=block.indexOf('>')+1,end=block.lastIndexOf('</');
 assert.ok(['script','style'].includes(node.tagName));assert.equal(node.childNodes.length,1);assert.equal(node.childNodes[0].value,block.slice(start,end));
 assert.equal(node.sourceCodeLocation.endTag.startOffset,end);assert.equal(node.sourceCodeLocation.endOffset,block.length);
}
console.log('OK  固定部品は開始から終了まで単一のrawtext要素で、途中の閉じタグや正規化がない');
const wrap=body=>`<!doctype html>\n<html lang="ja"><head><title>日本語の題</title></head>\n<body data-deck><main data-deck-slides><section data-deck-slide>\n<p title="引用 &amp; 値">文章</p>${body}<p style="color:red">後の文章\n次の行</p></section></main></body></html>`;
let count=0;
for(const block of blocks){
 for(const content of [block,block+block,`<!--${block}-->`,`<textarea>${block}</textarea>`,`<svg>${block}</svg>`,`<math>${block}</math>`,`<template><template>${block}</template></template>`,`<noscript>${block}</noscript>`,`<div title='${block}'>属性</div>`,`<div title="${block}">属性</div>`,`<script>const text='${block}';</script>`,`<table><b>壊れた並び${block}<tr><td>値</table>続き`]){
  const html=wrap(content);assert.deepEqual(api.parseStockHtml(html),parse(html,{sourceCodeLocationInfo:true}));count++;
 }
}
const complete=wrap(blocks.join('\n'));
for(const html of [complete,complete.replace(/\n/g,'\r\n'),complete.replace('文章','絵文字😀'),complete.replace('文章','\0文字'),complete.replace('use strict','custom strict')]){
 assert.deepEqual(api.parseStockHtml(html),parse(html,{sourceCodeLocationInfo:true}));count++;
}
console.log(`OK  ${count}条件で木・本文・全位置情報が通常のHTML解析と一致（除外領域・属性・テンプレート・不正HTMLを含む）`);
// 小分けに読む版も、切れ目の位置によらず同じ木になる（切れ目をタグ・属性・文字参照・rawtext の途中に落とすため小さく刻む）。
const pause=()=>Promise.resolve();
let sliced=0;
for(const block of blocks.slice(0,2))for(const content of [block,`<!--${block}-->`,`<div title="${block}">属性</div>`,`<table><b>壊れた並び${block}<tr><td>値</table>続き`]){
 const html=wrap(content),expected=parse(html,{sourceCodeLocationInfo:true});
 for(const slice of [1,7,97,4096])assert.deepEqual(await api.parseStockHtmlInSlices(html,pause,{slice,budgetMs:0}),expected);sliced++;
}
for(const html of [complete,complete.replace(/\n/g,'\r\n'),complete.replace('文章','絵文字😀'),complete.replace('文章','\0文字'),wrap('<p>&amp;&lt;&#x3042;&notanentity;</p>'.repeat(50))]){
 for(const slice of [3,61,1024])assert.deepEqual(await api.parseStockHtmlInSlices(html,pause,{slice,budgetMs:0}),parse(html,{sourceCodeLocationInfo:true}));sliced++;
}
let paused=0;await api.parseStockHtmlInSlices(complete,async()=>{paused++;},{slice:1024,budgetMs:0});assert.ok(paused>1,'小分けの間に処理を譲っていません');
console.log(`OK  ${sliced}条件で小分けに読んだ木も通常のHTML解析と一致し、途中で処理を譲る`);
// Cold-tree timing is evidence only, not an environment-dependent pass gate.
const measure=fn=>{const times=[];for(let i=0;i<6;i++){const start=performance.now();fn(complete);times.push(performance.now()-start);}return times.slice(1).sort((a,b)=>a-b)[2];};
console.log(JSON.stringify({coldParseMedianMs:measure(html=>parse(html,{sourceCodeLocationInfo:true})),stockParseMedianMs:measure(api.parseStockHtml)}));
