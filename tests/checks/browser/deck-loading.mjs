/** Offline regression: first paint, deep links, fonts and deferred companions. */
import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium, webkit } from 'playwright';
import { build } from 'esbuild';
import sharp from 'sharp';
const root = fileURLToPath(new URL('../../../', import.meta.url));
const bundle = await build({stdin:{contents:"export {authorSlide} from './src/lib/deck/authoring';export {DEFAULT_APPEARANCE} from './src/lib/deck/design/design';",resolveDir:root},bundle:true,write:false,format:'esm',platform:'node'});
const {authorSlide,DEFAULT_APPEARANCE} = await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const kit = await readFile(root+'src/templates/deck-design.html','utf8');
const nav = await readFile(root+'src/templates/deck.html','utf8');
const html = (chart=false, dark=false) => `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><script type="application/json" data-deck-design>${JSON.stringify({version:1,document:{...DEFAULT_APPEARANCE,background:dark?'#151719':'#ffffff',typography:'modern'},slides:{}})}</script>${kit}${nav}</head><body data-deck><main data-deck-slides>${Array.from({length:7},(_,i)=>chart&&i===3?authorSlide('chart','paper-4'):`<section data-deck-slide data-deck-id="paper-${i+1}"><h1>資料 ${i+1}</h1><p>準備できた同じ場所で読む本文</p>${i<3?'<aside data-deck-notes><p>前の枚のノート。位置計算に含める文章。</p></aside>':''}</section>`).join('')}</main></body></html>`;
const isWebkit = process.env.PAGES_TEST_BROWSER === 'webkit';
const browser = await (isWebkit?webkit:chromium).launch({headless:true,...(isWebkit?(process.env.PAGES_TEST_WEBKIT_EXECUTABLE?{executablePath:process.env.PAGES_TEST_WEBKIT_EXECUTABLE}:{}):(process.env.PAGES_TEST_CHROMIUM_EXECUTABLE?{executablePath:process.env.PAGES_TEST_CHROMIUM_EXECUTABLE}:process.env.PAGES_TEST_CHROME_CHANNEL?{channel:process.env.PAGES_TEST_CHROME_CHANNEL}:{}))});
const results=[];
try {
 for (const test of [
  {name:'desktop',width:1440,fontDelay:400},
  {name:'mobile',width:390,fontDelay:400},
  {name:'dark',width:1440,fontDelay:400,dark:true},
  {name:'font-timeout',width:1440,fontDelay:2400},
  {name:'unrelated-chart',width:1440,fontDelay:50,chartDelay:2600},
  {name:'selected-chart',width:1440,fontDelay:50,chartDelay:500,chart:true},
  {name:'chart-timeout',width:1440,fontDelay:50,chartDelay:2600,chart:true},
  {name:'scroll-resize',width:1440,fontDelay:1200,interact:true},
 ]) {
  const page=await browser.newPage({viewport:{width:test.width,height:900},reducedMotion:'reduce'});
  // Start the artificial font delay after an actual loading frame. Otherwise
  // a slow WebKit startup can consume the whole delay before its first paint,
  // leaving only ready frames and making this regression test nondeterministic.
  let releaseFonts;
  const loadingFrameObserved=new Promise(resolve=>{releaseFonts=resolve;});
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/*',async route=>{
   const url=new URL(route.request().url());
   if(url.pathname==='/loading')return route.fulfill({contentType:'text/html; charset=utf-8',body:html(test.chart,test.dark)});
   if(url.pathname.startsWith('/vendor/deck-fonts/')){
    const body=await readFile(root+url.pathname.slice(1));
    await loadingFrameObserved;
    await new Promise(resolve=>setTimeout(resolve,test.fontDelay));
    return route.fulfill({contentType:'font/woff2',body}).catch(()=>{});
   }
   if(url.pathname.endsWith('/echarts.min.js')){
    const body=await readFile(root+'vendor/echarts/echarts.js');
    await new Promise(resolve=>setTimeout(resolve,test.chartDelay??0));
    return route.fulfill({contentType:'text/javascript',body}).catch(()=>{});
   }
   return route.abort();
  });
  await page.addInitScript(()=>{
   window.loadingSamples=[];
   window.resizeDeliveryWrites=0;
   const NativeResizeObserver=window.ResizeObserver;
   window.ResizeObserver=class extends NativeResizeObserver {
    constructor(callback){super((entries,observer)=>{
     const main=document.querySelector('main[data-deck-slides]');
     const before=main?.getAttribute('style');
     callback(entries,observer);
     if(entries.some(entry=>entry.target===main)&&before!==main?.getAttribute('style'))window.resizeDeliveryWrites++;
    });}
   };
   const sample=()=>{
    const paper=document.querySelectorAll('[data-deck-stage]')[3];
    if(paper){const rect=paper.getBoundingClientRect();const pending=document.documentElement.hasAttribute('data-deck-loading');
     const slide=paper.querySelector('section');
     window.loadingSamples.push({pending,x:rect.x,y:rect.y,w:rect.width,h:rect.height,scrollY,visible:getComputedStyle(slide).opacity,skeletonColor:getComputedStyle(paper,'::before').backgroundColor,paperColor:getComputedStyle(slide).backgroundColor,font:getComputedStyle(slide).fontFamily,chart:Boolean(slide.querySelector('[data-dd-rendered="true"]')),fallback:slide.querySelector('[data-dd-chart]')?.hasAttribute('data-dd-chart-error')??false});}
    requestAnimationFrame(sample);
   };requestAnimationFrame(sample);
  });
  await page.goto('http://127.0.0.1/loading#4',{waitUntil:'commit'});
  await page.waitForFunction(()=>document.querySelectorAll('[data-deck-stage]').length===7);
  await page.waitForFunction(()=>window.loadingSamples.length>0);
  const pending=await page.evaluate(()=>window.loadingSamples.find(sample=>sample.pending));
  // The interaction must land while the deck is still loading. Releasing the fonts first let a slow runner reveal
  // before the resize (one CI run saw x move after reveal), so this case holds them until the interaction is done.
  if(!test.interact)releaseFonts();
  assert.ok(pending,test.name+': a loading frame was observable');
  assert.equal(pending.visible,'0');
  // Browser automation can resume after the deferred script has already arrived.
  // Judge the actual painted frames, not the later tool round-trip timing.
  assert.equal(pending.skeletonColor,pending.paperColor,test.name+': skeleton paper matches appearance');
  let interactedScroll;
  if(test.interact){
   await page.mouse.wheel(0,120);await page.setViewportSize({width:800,height:900});await page.waitForTimeout(150);
   const during=await page.evaluate(()=>({scrollY,loading:document.documentElement.hasAttribute('data-deck-loading')}));
   assert.ok(during.loading,test.name+': the scroll and resize happened while still loading');
   interactedScroll=during.scrollY;releaseFonts();
  }
  await page.waitForFunction(()=>!document.documentElement.hasAttribute('data-deck-loading'));
  await page.waitForFunction(()=>window.loadingSamples.some(sample=>!sample.pending));
  await page.waitForTimeout(test.fontDelay>2000||test.chartDelay>2000?1000:250);
  const samples=await page.evaluate(()=>window.loadingSamples);
  const visible=samples.filter(s=>!s.pending);
  assert.ok(visible.length);
  const first=visible[0];
  for(const item of visible)for(const field of ['x','y','w','h','scrollY'])assert.ok(Math.abs(item[field]-first[field])<=1,`${test.name}: ${field} moved after reveal`);
  if(!test.interact)for(const field of ['x','y','w','h'])assert.ok(Math.abs(pending[field]-first[field])<=1,`${test.name}: ${field} differs from skeleton`);
  else assert.equal(first.scrollY,interactedScroll,'user scroll is not reset');
  if(test.chart)assert.ok(first.chart||first.fallback,'selected chart is ready or has settled fallback on reveal');
  if(test.fontDelay>2000)assert.ok(visible.every(item=>item.font===first.font&&!item.font.includes('SP Deck')),'late fonts never replace fallback');
  assert.deepEqual(errors,[]);
  if(test.name==='mobile'){
   const present=page.getByRole('button',{name:'プレゼンを始める',exact:true});
   const notes=page.getByRole('button',{name:'ノートを隠す',exact:true});
   const [presentBox,notesBox,toolbarBox]=await Promise.all([present.boundingBox(),notes.boundingBox(),page.locator('main [data-deck-toolbar]').first().boundingBox()]);
   assert.ok(presentBox && notesBox && toolbarBox,'mobile toolbar buttons are visible');
   const overlap=!(presentBox.x+presentBox.width<=notesBox.x || notesBox.x+notesBox.width<=presentBox.x || presentBox.y+presentBox.height<=notesBox.y || notesBox.y+notesBox.height<=presentBox.y);
   assert.equal(overlap,false,'mobile toolbar buttons overlap');
   const bg=await page.locator('main [data-deck-toolbar]').first().evaluate(el=>getComputedStyle(el).backgroundColor);
   assert.ok(bg && bg!=='rgba(0, 0, 0, 0)' && bg!=='transparent','mobile toolbar keeps the desk color');
   const fade=await page.locator('main [data-deck-toolbar]').first().evaluate(el=>{
    const after=getComputedStyle(el,'::after');
    return {height:after.height,image:after.backgroundImage,events:after.pointerEvents};
   });
   assert.equal(fade.height,'24px','mobile toolbar dissolves 24px onto the paper');
   assert.ok(fade.image.includes('linear-gradient'),'mobile toolbar fade uses a gradient, not a band');
   assert.equal(fade.events,'none','mobile toolbar fade does not steal taps');
   await page.locator('[data-deck-slide]').nth(3).scrollIntoViewIfNeeded();
   const stuck=await page.locator('main [data-deck-toolbar]').first().boundingBox();
   assert.ok(stuck && stuck.y<=8,'mobile toolbar stays at the top while reading');
   const [presentAfter,notesAfter]=await Promise.all([present.boundingBox(),page.getByRole('button',{name:/^ノートを(?:隠す|表示)$/}).boundingBox()]);
   assert.ok(presentAfter && notesAfter,'mobile toolbar buttons stay visible while scrolling');
   const stillOverlap=!(presentAfter.x+presentAfter.width<=notesAfter.x || notesAfter.x+notesAfter.width<=presentAfter.x || presentAfter.y+presentAfter.height<=notesAfter.y || notesAfter.y+notesAfter.height<=presentAfter.y);
   assert.equal(stillOverlap,false,'mobile toolbar buttons overlap while scrolling');
   const bgAfter=await page.locator('main [data-deck-toolbar]').first().evaluate(el=>getComputedStyle(el).backgroundColor);
   assert.ok(bgAfter && bgAfter!=='rgba(0, 0, 0, 0)' && bgAfter!=='transparent','mobile toolbar keeps the desk color while scrolling');
  }
  for(const at of [3,6]){
   const paper=page.locator('[data-deck-slide]').nth(at);
   await paper.scrollIntoViewIfNeeded();
   const pixels=await sharp(await paper.screenshot()).stats();
   assert.ok(pixels.channels.some(channel=>channel.stdev>1),test.name+': offscreen paper actually paints its content');
  }
  if(test.name==='desktop'){
   await page.locator('[data-deck-slide]').first().scrollIntoViewIfNeeded();
   await page.locator('[data-deck-slide]').last().evaluate(section=>{const tall=document.createElement('div');tall.style.cssText='height:1000px;min-height:1000px;flex:none';section.append(tall);});
   await page.locator('[data-deck-slide]').last().scrollIntoViewIfNeeded();
   await page.waitForFunction(()=>document.querySelectorAll('[data-deck-frame]')[6].hasAttribute('data-deck-overflow'));
  }
  await page.emulateMedia({media:'print'});
  assert.equal(await page.locator('[data-deck-slide]').nth(3).evaluate(el=>getComputedStyle(el).visibility),'visible');
  results.push({name:test.name,frames:samples.length,firstVisible:first});
  if(process.env.DECK_QA_OUT){await mkdir(process.env.DECK_QA_OUT,{recursive:true});await page.emulateMedia({media:'screen'});await page.screenshot({path:`${process.env.DECK_QA_OUT}/${test.name}.png`});}
  if(test.name==='desktop'){
   await page.evaluate(()=>{document.querySelector('main[data-deck-slides]').style.width='700px';});
   await page.waitForFunction(()=>document.querySelector('main[data-deck-slides]').style.getPropertyValue('--deck-k')===String(700/1280));
   assert.equal(await page.evaluate(()=>window.resizeDeliveryWrites),0,'resize callbacks never mutate measured layout during delivery');
   await page.evaluate(()=>{document.querySelector('main[data-deck-slides]').style.removeProperty('width');});
   await page.waitForTimeout(100);
   await page.route('**/other',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><p>Other page</p>'}));
   await page.evaluate(()=>scrollTo(0,1800));
   const savedScroll=await page.evaluate(()=>scrollY);
   await page.goto('http://127.0.0.1/other');
   await page.goBack();
   await page.waitForFunction(()=>!document.documentElement.hasAttribute('data-deck-loading'));
   assert.ok(Math.abs(await page.evaluate(()=>scrollY)-savedScroll)<=1,'back restores the reading position instead of the hash');
   console.log('OK  history-restoration');
  }
  console.log('OK  '+test.name);
  await page.close();
 }
} finally {await browser.close();}
if(process.env.DECK_QA_OUT)await writeFile(`${process.env.DECK_QA_OUT}/results.json`,JSON.stringify(results,null,2));
