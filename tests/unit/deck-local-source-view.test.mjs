import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
const dir=await mkdtemp(path.join(tmpdir(),'deck-local-view-'));
try {
 const out=path.join(dir,'local.mjs');await build({stdin:{contents:"export {createDeckLocalEdits} from './src/lib/deck/edit/local';export {prepareDeckEdit,inspectDeckNode,applyDeckEditOperations} from './src/lib/deck/edit/source';export {applyDeckLocalSourcePatch} from './src/widget/deck/edit/source-document';",resolveDir:process.cwd()},bundle:true,platform:'node',format:'esm',outfile:out});
 const m=await import(pathToFileURL(out).href),parse=html=>new JSDOM(html).window.document;
 let html=m.prepareDeckEdit('<!doctype html><html><head><title>test</title></head><body data-deck><main data-deck-slides><section data-deck-slide data-deck-id="one" data-deck-node="one"><p data-deck-node="text">before</p><img data-deck-node="image" src="a.png" style="object-fit:contain"><script data-deck-node="script">void 0</script></section><section data-deck-slide data-deck-id="two" data-deck-node="two"><p data-deck-node="stable">unchanged</p></section></main></body></html>').html;
 const local=m.createDeckLocalEdits(),doc=parse(html),stable=doc.querySelector('[data-deck-node=two]');local.prepare(html);
 assert.equal(local.inspect(html,'script'),undefined);
 for(const op of [{kind:'style',target:'image',property:'object-fit',before:'contain',after:'cover'},{kind:'style',target:'image',property:'clip-path',before:null,after:'inset(5%)'},{kind:'text',target:'text',run:0,before:'before',after:'new<&文字'},{kind:'style',target:'image',property:'clip-path',before:'inset(5%)',after:null}]) {
  const before=html,result=local.apply(before,[op]),patch=local.takePatch();assert.ok(patch);assert.equal(local.takePatch(),null);assert.equal(result.html,m.applyDeckEditOperations(before,[op]).html);assert.ok(m.applyDeckLocalSourcePatch(patch,doc,parse));html=result.html;
  assert.deepEqual(local.inspect(html,op.target),m.inspectDeckNode(html,op.target));assert.equal(doc.documentElement.outerHTML,parse(html).documentElement.outerHTML);assert.equal(doc.querySelector('[data-deck-node=two]'),stable);
 }
 const change=local.apply(html,[{kind:'text',target:'text',run:0,before:'new<&文字',after:'last'}]),patch=local.takePatch();assert.ok(patch);const stale=parse(html);stale.querySelector('[data-deck-node=text]').textContent='different';assert.equal(m.applyDeckLocalSourcePatch(patch,stale,parse),false);assert.equal(stale.querySelector('[data-deck-node=text]').textContent,'different');
 assert.equal(change.html,m.applyDeckEditOperations(html,[{kind:'text',target:'text',run:0,before:'new<&文字',after:'last'}]).html);local.dispose();assert.equal(local.takePatch(),null);
 const legacy=html.replace('<!doctype html>',''),legacyEditor=m.createDeckLocalEdits();legacyEditor.prepare(legacy);assert.deepEqual(legacyEditor.inspect(legacy,'image'),m.inspectDeckNode(legacy,'image'));legacyEditor.apply(legacy,[{kind:'style',target:'image',property:'object-fit',before:'cover',after:'contain'}]);assert.equal(legacyEditor.takePatch(),null);
 console.log('OK  local text/style views retain canonical metadata, inverse bytes, sibling nodes and stale-source rejection');
} finally {await rm(dir,{recursive:true,force:true});}
