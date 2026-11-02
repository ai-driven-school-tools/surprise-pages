/** Reproducible local-only baseline and regression budget. No production data. */
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {build} from 'esbuild';
const {chromium,webkit}=await import(process.env.PLAYWRIGHT_MODULE??'playwright');
const compiled=await build({stdin:{contents:"export {newDeckDocument} from './src/lib/deck/new-document'; export {authorSlide} from './src/lib/deck/authoring';",resolveDir:process.cwd()},bundle:true,write:false,platform:'node',format:'esm'});
const {newDeckDocument,authorSlide}=await import('data:text/javascript;base64,'+Buffer.from(compiled.outputFiles[0].text).toString('base64'));
const directory=await mkdtemp(join(tmpdir(),'deck-performance-'));
const results=[],baseline=process.env.DECK_PERF_BASELINE==='1';
const browser=await(process.env.DECK_BROWSER==='webkit'?webkit:chromium).launch({headless:true});
try {
for(const count of (process.env.DECK_PERF_COUNTS??'10,30,100').split(',').map(Number)) {
  const raw=await newDeckDocument();
  const slides=Array.from({length:count},(_,i)=>authorSlide(['title','text','chart','table','image'][i%5],`sample-${i}`));
  for(let i=4;i<count;i+=5)slides[i]=slides[i].replace('<div class="dd-body" data-deck-image-slot style="min-height:380px"></div>',`<div class="dd-body"><img data-deck-node="image-${i}" alt="検証用の画像" width="640" height="360" src="data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22640%22 height=%22360%22%3E%3Crect width=%22640%22 height=%22360%22 fill=%22%2397a6bb%22/%3E%3C/svg%3E"></div>`);
  slides[1]=slides[1].replace('<aside data-deck-notes>','<video data-deck-node="sample-video" preload="none" controls playsinline poster="data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22320%22 height=%22180%22%3E%3Crect width=%22320%22 height=%22180%22 fill=%22%23ccc%22/%3E%3C/svg%3E" src="/sample.mp4"></video><aside data-deck-notes>');
  const sample=join(directory,`${count}.html`);
  await writeFile(sample,raw.slice(0,raw.lastIndexOf('<main data-deck-slides>'))+`<main data-deck-slides>${slides.join('')}</main></body></html>`);
  const server=spawn(process.execPath,['scripts/dev/preview-deck-editor.mjs'],{env:{...process.env,PORT:'0',DECK_EDIT_SAMPLE:sample},stdio:['ignore','pipe','pipe']});
  let logs='';server.stderr.on('data',d=>logs+=d);
  try {
    const url=await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(Error(logs||'Preview timed out')),30000);server.stdout.on('data',d=>{const match=String(d).match(/http:\/\/127\.0\.0\.1:\d+/);if(match){clearTimeout(timeout);resolve(match[0]);}});server.once('exit',()=>{clearTimeout(timeout);reject(Error(logs));});});
    const page=await browser.newPage({viewport:{width:1440,height:900},reducedMotion:'reduce'});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(url+'/?edit=1');
    await page.waitForFunction(()=>document.querySelector('surprise-comments')?.shadowRoot?.querySelector('iframe.edit-frame')?.contentDocument?.querySelector('[data-studio-active]'));
    await page.locator('.ds-slide').first().waitFor();
    const switches=await page.evaluate(async()=>{
      const root=document.querySelector('surprise-comments').shadowRoot;
      const frame=root.querySelector('iframe.edit-frame'),doc=frame.contentDocument;
      const first=root.querySelector('.ds-slide');let replaced=0;
      const times=[];
      for(let i=0;i<20;i++){
        const start=performance.now();root.querySelectorAll('.ds-slide')[i%5].click();
        await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
        times.push(performance.now()-start);if(root.querySelector('.ds-slide')!==first)replaced++;
      }
      return {times,replaced,documentChanged:frame.contentDocument!==doc};
    });
    await page.getByRole('button',{name:'デザイン',exact:true}).first().click();
    const changes=[];
    for(let i=0;i<8;i++){
      changes.push(await page.evaluate(async()=>{
        const root=document.querySelector('surprise-comments').shadowRoot,previous=root.querySelector('iframe.edit-frame').contentDocument,input=root.querySelector('.ds-inspector input[type=color]');
        const color=input.value==='#ffffff'?'#eeeeee':'#ffffff',start=performance.now();
        input.value=color;input.dispatchEvent(new Event('change',{bubbles:true}));
        // Both endpoints are measured inside the page. Browser-control round trips
        // are not part of the user's input-to-paint latency.
        for(let tick=0;tick<1200;tick++){
          await new Promise(resolve=>requestAnimationFrame(resolve));
          const doc=root.querySelector('iframe.edit-frame').contentDocument,slide=doc?.querySelector('section[data-studio-active]');
          if(slide&&doc.defaultView.getComputedStyle(slide).getPropertyValue('--dd-bg').trim()===color){
            // A task queued from rAF runs after this rendering opportunity; a
            // second rAF would add an entire refresh interval (40ms in headless WebKit).
            await new Promise(resolve=>setTimeout(resolve,0));
            return {ms:performance.now()-start,reloaded:doc!==previous};
          }
        }
        throw Error('Appearance never reached the requested color');
      }));
    }
    const p95=a=>[...a].sort((a,b)=>a-b)[Math.ceil(a.length*.95)-1];
    const result={count,switchP95:p95(switches.times),appearanceP95:p95(changes.map(x=>x.ms)),navReplacements:switches.replaced,selectionReloads:Number(switches.documentChanged),appearanceReloads:changes.filter(x=>x.reloaded).length,errors};results.push(result);console.log(JSON.stringify(result));
    if(!baseline){assert.equal(result.navReplacements,0);assert.equal(result.selectionReloads,0);assert.equal(result.appearanceReloads,0);assert.deepEqual(errors,[]);if(count===30){assert.ok(result.switchP95<100,JSON.stringify(result));assert.ok(result.appearanceP95<100,JSON.stringify(result));}}
    await page.close();
  } finally {server.kill();}
}
} finally {await browser.close();await writeFile(process.env.DECK_PERF_OUTPUT??join(directory,'results.json'),JSON.stringify(results,null,2));}
