import {test} from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
const result=await build({stdin:{contents:"export {planDeckPaint} from './src/widget/deck/render';export {authoredMediaSource,activateDeckVideo} from './src/lib/deck/media/video-source';",resolveDir:process.cwd()},bundle:true,write:false,format:'esm',platform:'node'});
const {planDeckPaint,authoredMediaSource,activateDeckVideo}=await import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].text).toString('base64'));
test('a completed conversion updates the suspended source without downloading or reviving playback',async()=>{
 const before='<html><body data-deck><main data-deck-slides><section data-deck-slide data-deck-id="s" data-deck-node="s"><video data-deck-node="v" src="_deck/media-original.mp4" preload="none"></video></section></main></body></html>';
 const dom=new JSDOM(before),doc=dom.window.document;
 for(const key of ['Element','HTMLElement','DOMParser'])globalThis[key]=dom.window[key];globalThis.CSS={escape:value=>value};
 try{
  doc.deckLayout={refresh(){}};doc.deckRenderer={release(){},async update(){}};
  const video=doc.querySelector('video');video.setAttribute('data-deck-video-src',video.getAttribute('src'));video.removeAttribute('src');
  const plan=planDeckPaint(doc,before,before.replace('media-original.mp4','media-converted.mp4'));assert.ok(plan);await plan.apply();
  assert.equal(authoredMediaSource(video),'_deck/media-converted.mp4');assert.equal(video.getAttribute('src'),null);
  activateDeckVideo(video);assert.equal(video.getAttribute('src'),'_deck/media-converted.mp4');
 }finally{dom.window.close();for(const key of ['Element','HTMLElement','DOMParser','CSS'])delete globalThis[key];}
});
