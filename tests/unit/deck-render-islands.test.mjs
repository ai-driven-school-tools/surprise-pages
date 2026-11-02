import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
const dir=await mkdtemp(path.join(tmpdir(),'deck-render-islands-'));
try {
 const out=path.join(dir,'render.mjs');await build({stdin:{contents:"export {planDeckPaint} from './src/widget/deck/render';export {inspectDeckEdit,inspectDeckSlideNodes} from './src/lib/deck/edit/source';export {updateDeckSourceDocument} from './src/widget/deck/edit/source-document';",resolveDir:process.cwd()},bundle:true,platform:'node',format:'esm',outfile:out});
 const {planDeckPaint,updateDeckSourceDocument,inspectDeckEdit,inspectDeckSlideNodes}=await import(pathToFileURL(out).href);
 const wrap=(body,doctype='<!doctype html>')=>`${doctype}<html><head><title>test</title></head><body data-deck><main data-deck-slides>${body}</main></body></html>`;
 const slide=(id,body)=>`<section data-deck-slide data-deck-id="visual-${id}" data-deck-node="${id}">${body}</section>`;
 function environment(html){const dom=new JSDOM(html),sizes=[],Parser=dom.window.DOMParser;for(const key of ['Element','HTMLElement'])globalThis[key]=dom.window[key];globalThis.CSS={escape:value=>value};globalThis.DOMParser=class extends Parser{parseFromString(value,type){sizes.push(value.length);return super.parseFromString(value,type);}};const doc=dom.window.document;doc.deckLayout={refresh(){}};doc.deckRenderer={release(){},async update(){}};return {dom,doc,sizes,parse:html=>new globalThis.DOMParser().parseFromString(html,'text/html')};}
 const before=wrap(Array.from({length:300},(_,i)=>slide('s'+i,`<h1 data-deck-node="h${i}">old${i}</h1><p data-deck-node="p${i}">${'x'.repeat(6300)}</p>`)).join('')),after=before.replace('>old0<','>new0<');
 const env=environment(before),stable=env.doc.querySelector('[data-deck-node=s200]');
 const plan=planDeckPaint(env.doc,before,after);assert.ok(plan);assert.deepEqual(plan.nodeSlides,['s0']);assert.deepEqual(plan.change.slides,['visual-s0']);assert.deepEqual(inspectDeckSlideNodes(after,plan.nodeSlides),inspectDeckEdit(after).nodes.filter(node=>node.slideId==='s0'));await plan.apply();assert.equal(env.doc.querySelector('[data-deck-node=h0]').textContent,'new0');assert.equal(env.doc.querySelector('[data-deck-node=s200]'),stable);assert.ok(env.sizes.length>=2);assert.ok(Math.max(...env.sizes)<100000,'unchanged slide bodies must never enter DOMParser');
 const source=env.parse(before),sourceStable=source.querySelector('[data-deck-node=s200]');env.sizes.length=0;assert.equal(updateDeckSourceDocument(before,after,source,env.parse),source);assert.equal(source.querySelector('[data-deck-node=s200]'),sourceStable);assert.ok(Math.max(...env.sizes)<100000);env.dom.window.close();
 for(const doctype of ['', '<!doctype html>']) {
  const malformed=wrap(slide('s','<p data-deck-node="p"><table data-deck-node="t"><tbody><tr data-deck-node="r"><td data-deck-node="c">old</td></tr></tbody></table></p>'),doctype),next=malformed.replace('>old<','>new<'),e=environment(malformed);
  const result=updateDeckSourceDocument(malformed,next,e.doc,e.parse);assert.equal(result.documentElement.outerHTML,e.parse(next).documentElement.outerHTML);e.dom.window.close();
 }
 const inherited=wrap('<p><b>before</p>'+slide('s','<p data-deck-node="p">old</p>')),next=inherited.replace('>old<','>new<'),e=environment(inherited);
 const inheritedPlan=planDeckPaint(e.doc,inherited,next);if(inheritedPlan){await inheritedPlan.apply();assert.equal(e.doc.querySelector('[data-deck-node=s]').outerHTML,e.parse(next).querySelector('[data-deck-node=s]').outerHTML);}const originalDoc=e.parse(inherited),updated=updateDeckSourceDocument(inherited,next,originalDoc,e.parse);assert.notEqual(updated,originalDoc);assert.equal(updated.documentElement.outerHTML,e.parse(next).documentElement.outerHTML);e.dom.window.close();
 const crossing=wrap(slide('s1','<p data-deck-node="p1"><b>first</p>')+slide('s2','<p data-deck-node="p2">second</p>')),fixed=crossing.replace('first</p>','first</b></p>'),cross=environment(crossing);
 const repaired=updateDeckSourceDocument(crossing,fixed,cross.doc,cross.parse);assert.notEqual(repaired,cross.doc);assert.equal(repaired.documentElement.outerHTML,cross.parse(fixed).documentElement.outerHTML);
 const repaint=planDeckPaint(cross.doc,crossing,fixed);if(repaint){await repaint.apply();assert.equal(cross.doc.querySelector('[data-deck-node=s2]').outerHTML,cross.parse(fixed).querySelector('[data-deck-node=s2]').outerHTML);}cross.dom.window.close();
 const two=wrap(slide('remove','<p data-deck-node="removed-text">first</p>')+slide('keep','<p data-deck-node="kept-text">second</p>')),one=wrap(slide('keep','<p data-deck-node="kept-text">second</p>')),deletion=environment(two),deletePlan=planDeckPaint(deletion.doc,two,one);assert.ok(deletePlan);assert.deepEqual(deletePlan.nodeSlides,['remove']);assert.deepEqual(inspectDeckSlideNodes(one,deletePlan.nodeSlides),[]);await deletePlan.apply();assert.equal(deletion.doc.querySelector('[data-deck-node=remove]'),null);deletion.dom.window.close();
 assert.throws(()=>inspectDeckSlideNodes(two.replace('data-deck-node="kept-text"','data-deck-node="removed-text"'),['remove']));
 console.log('OK  300-slide island rendering preserves other nodes and falls back for cross-boundary HTML context');
} finally {await rm(dir,{recursive:true,force:true});}
