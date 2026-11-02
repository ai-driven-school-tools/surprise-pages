import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';
const temp=await mkdtemp(path.join(tmpdir(),'deck-revision-update-'));
try{
 const outfile=path.join(temp,'update.mjs');
 await build({stdin:{resolveDir:process.cwd(),contents:"export * from './src/widget/deck/edit/revision-update';export * from './src/lib/deck/edit/source';export * from './src/lib/pages/preview';export {withVendorScripts} from './src/lib/html/vendor-scripts';"},bundle:true,platform:'node',format:'esm',outfile});
 const api=await import(pathToFileURL(outfile).href);
 const source='<html><head><title>原稿</title><script src="https://cdn.tailwindcss.com"></script></head><body data-deck id="ads-top"><main data-deck-slides><section data-deck-slide data-deck-node="one"><h1 data-deck-node="title">前の文章</h1><p data-deck-node="text">二つ目</p><img data-deck-node="image" src="_deck/media-example.png"></section></main></body></html>';
 const batches=[{operations:[{kind:'text',target:'title',run:0,before:'前の文章',after:'日本語・ads-top'}]},{operations:[{kind:'style',target:'title',property:'color',before:null,after:'red'}]},{operations:[{kind:'insert',target:'one',node:{id:'added',tag:'p',text:'追加',style:{left:'10px'}}}]},{operations:[{kind:'text',target:'text',run:0,before:'二つ目',after:'<記号>&次の文章'}]}];
 for(const raw of [source,source.replace('<head>','<head><base href="/authored/">')])for(const previewHref of ['/internal/test/preview',null]){
  const html=api.prepareDeckEdit(raw).html,snapshot={html,previewHtml:api.deckSourcePreview(html,previewHref),previewHref};
  let expected=html;const undo=[];
  for(const batch of batches){const applied=api.applyDeckEditOperations(expected,batch.operations);expected=applied.html;undo.unshift({operations:applied.inverse});}
  const result=api.applyDeckRevisionBatches(snapshot,batches);
  assert.equal(result.html,expected);assert.equal(result.previewHtml,api.deckSourcePreview(expected,previewHref));
  assert.ok(result.html.includes('日本語・ads-top'));assert.ok(result.previewHtml.includes('日本語・sp-top'));
  assert.equal(snapshot.html,html);assert.ok(result.html.includes('src="_deck/media-example.png"'));
  const restored=api.applyDeckRevisionBatches({...result,previewHref},undo);
  assert.equal(restored.html,html);assert.equal(restored.previewHtml,snapshot.previewHtml);
 }
 console.log('OK  canonical text, geometry, insertion and undo match the shared preview transformation including source bases, relative images, vendor URLs and safe anchors');
 const html=api.prepareDeckEdit(source).html,preview=api.deckSourcePreview(html,'/internal/test/old').replace('</head>','<meta name="legacy-preview" content="keep"></head>');
 const oldSnapshot={html,previewHtml:preview};let expectedSource=html,expectedPreview=preview;
 for(const batch of batches){expectedSource=api.applyDeckEditOperations(expectedSource,batch.operations).html;expectedPreview=api.withVendorScripts(api.applyDeckEditOperations(expectedPreview,batch.operations).html);}
 const legacy=api.applyDeckRevisionBatches(oldSnapshot,batches);
 assert.deepEqual(legacy,{html:expectedSource,previewHtml:expectedPreview});assert.ok(legacy.previewHtml.includes('legacy-preview'));
 assert.throws(()=>api.applyDeckRevisionBatches({html,previewHtml:preview,previewHref:null},[{operations:[{kind:'text',target:'deleted',run:0,before:'',after:'残す'}]}]));
 assert.equal(oldSnapshot.html,html);assert.equal(oldSnapshot.previewHtml,preview);
 console.log('OK  older custom previews retain their behavior; missing targets fail without changing the snapshot');
}finally{await rm(temp,{recursive:true,force:true});}
