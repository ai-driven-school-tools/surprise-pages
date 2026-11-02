import {test} from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
import {fileURLToPath} from 'node:url';
const built=await build({entryPoints:[fileURLToPath(new URL('../../src/widget/shared/deferred-resize.ts',import.meta.url))],bundle:true,write:false,format:'esm',platform:'browser'});
const {observeDeferredSize}=await import('data:text/javascript;base64,'+Buffer.from(built.outputFiles[0].text).toString('base64'));
function harness(){
 const dom=new JSDOM('<body><div></div><div></div></body>');const view=dom.window;
 const frames=new Map();let sequence=0,deliver;
 view.requestAnimationFrame=run=>{const id=++sequence;frames.set(id,run);return id;};
 view.cancelAnimationFrame=id=>frames.delete(id);
 view.ResizeObserver=class {constructor(callback){deliver=callback;}observe(){}unobserve(){}disconnect(){}};
 const calls=[];const observer=observeDeferredSize(view.document,targets=>calls.push(targets));
 const targets=[...view.document.querySelectorAll('div')];targets.forEach(target=>observer.observe(target));
 return {dom,observer,targets,calls,frames,notify:(...items)=>deliver(items.map(target=>({target}))),flush:()=>{const queued=[...frames.values()];frames.clear();queued.forEach(run=>run());}};
}
test('resize delivery does not write layout and batches duplicate notifications in one owner frame',()=>{
 const h=harness();h.notify(h.targets[0]);h.notify(...h.targets);assert.equal(h.calls.length,0);assert.equal(h.frames.size,1);h.flush();assert.deepEqual(h.calls,[h.targets]);h.dom.window.close();
});
test('clearing a preview cancels queued work without losing future size notifications',()=>{
 const h=harness();h.notify(h.targets[0]);h.observer.cancel(h.targets[0]);assert.equal(h.frames.size,0);h.flush();assert.equal(h.calls.length,0);h.notify(h.targets[0]);h.flush();assert.deepEqual(h.calls,[[h.targets[0]]]);h.dom.window.close();
});
test('unobserved and detached previews cannot receive a stale resize',()=>{
 const h=harness();h.notify(...h.targets);h.observer.unobserve(h.targets[0]);h.targets[1].remove();h.flush();assert.equal(h.calls.length,0);h.dom.window.close();
});
test('disposing cancels queued frames and ignores a late native notification',()=>{
 const h=harness();h.notify(...h.targets);h.observer.disconnect();assert.equal(h.frames.size,0);h.notify(...h.targets);h.flush();assert.equal(h.calls.length,0);h.dom.window.close();
});
