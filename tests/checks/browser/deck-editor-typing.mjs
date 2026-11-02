// First-key checks measure glyphs, not just the outside of a text box.
import {mkdir,writeFile} from 'node:fs/promises';
const {chromium,webkit}=await import(process.env.PLAYWRIGHT_MODULE??'playwright');
const out=process.env.DECK_QA_OUTPUT??'/tmp/deck-editor-typing';
const base=process.env.DECK_QA_URL??'http://127.0.0.1:53001';
await mkdir(out,{recursive:true});
const scenarios=[
 ['float-wrap','[data-deck-id="opening"] h1'],
 ['heading','[data-deck-id="opening"] h1'],
 ['padded-caption','[data-deck-id="product-hero"] .dd-media-copy'],
 ['badge','[data-deck-id="before-after"] .dd-before-after-label'],
 ['footer','[data-deck-id="opening"] footer span'],
 ['strong','[data-deck-id="before-after"] figcaption strong'],
 ['content-box-border','[data-deck-id="product-hero"] .dd-media-copy'],
];
function measure(n){const rect=n.getBoundingClientRect(),slide=n.closest('[data-deck-slide]').getBoundingClientRect(),style=getComputedStyle(n),glyphs=[],walk=document.createTreeWalker(n,NodeFilter.SHOW_TEXT);let text;while(text=walk.nextNode()){for(let i=0;i<text.data.length;i++){const r=document.createRange();r.setStart(text,i);r.setEnd(text,i+1);const b=r.getBoundingClientRect();glyphs.push({letter:text.data[i],x:b.x-rect.x,y:b.y-rect.y,width:b.width,height:b.height});}}const s=document.getSelection();const caret=s?.rangeCount?s.getRangeAt(0).getBoundingClientRect().toJSON():null;return {text:n.textContent,inlineStyle:n.getAttribute('style'),editable:n.isContentEditable,neighbours:[...n.closest('[data-deck-slide]').querySelectorAll('[data-deck-node]')].filter(e=>e!==n&&!e.contains(n)&&!n.contains(e)).map(e=>{const r=e.getBoundingClientRect();return {id:e.getAttribute('data-deck-node'),x:r.x-slide.x,y:r.y-slide.y,width:r.width,height:r.height};}),box:{x:rect.x-slide.x,y:rect.y-slide.y,width:rect.width,height:rect.height},font:{size:style.fontSize,family:style.fontFamily,weight:style.fontWeight,lineHeight:style.lineHeight,letterSpacing:style.letterSpacing,whiteSpace:style.whiteSpace,align:style.textAlign,display:style.display,boxSizing:style.boxSizing,padding:style.padding,border:style.borderWidth},scroll:{top:n.scrollTop,left:n.scrollLeft,clientWidth:n.clientWidth,scrollWidth:n.scrollWidth,clientHeight:n.clientHeight,scrollHeight:n.scrollHeight},glyphs,caret};}
const results=[];
const boxDelta=(a,b)=>Math.max(...['x','y','width','height'].map(k=>Math.abs(a[k]-b[k])));
const neighboursDelta=(a,b)=>a.neighbours.length!==b.neighbours.length?Infinity:Math.max(0,...a.neighbours.map((n,i)=>n.id===b.neighbours[i].id?boxDelta(n,b.neighbours[i]):Infinity));
const sameFont=(a,b)=>JSON.stringify(a.font)===JSON.stringify(b.font);
const delta=(a,b,keys=['x','y','width','height'])=>Math.max(0,...a.glyphs.map((g,i)=>{const next=b.glyphs[i];return !next||g.letter!==next.letter?Infinity:Math.max(...keys.map(k=>Math.abs(g[k]-next[k])));}));
for(const [engineName,engine] of [['chromium',chromium],['webkit',webkit]]){
 const browser=await engine.launch({headless:true});
 for(const width of [1390,390])for(const [name,selector] of scenarios){
  const context=await browser.newContext({viewport:{width,height:1000},reducedMotion:'reduce'});
  // Keep this visual test independent of other editors and production persistence.
  await context.route('**/api/pages/deck-edit',route=>route.request().method()==='PATCH'?route.abort('internetdisconnected'):route.continue());
  const page=await context.newPage();
  try{
   await page.goto(base);await page.getByRole('button',{name:'この資料を編集'}).click();
   const frame=await(await page.waitForSelector('iframe')).contentFrame();
   const node=frame.locator(selector).first();await node.waitFor();await frame.evaluate(()=>document.fonts.ready);
   if(name==='content-box-border')await node.evaluate(n=>{const css=document.createElement('style');css.textContent=`[data-deck-node="${n.getAttribute('data-deck-node')}"]{box-sizing:content-box!important;border:3px solid currentColor!important;padding:16px 24px!important}`;document.head.append(css);});
   if(name==='float-wrap')await node.evaluate(n=>{n.parentElement.style.display='block';const floater=document.createElement('div');floater.style.cssText='float:left;width:100px;height:300px';n.before(floater);});
   await node.scrollIntoViewIfNeeded();const before=await node.evaluate(measure);
   await node.dblclick();const entered=await node.evaluate(measure);
   if(name==='float-wrap'){const pass=!(await node.evaluate(n=>n.isContentEditable))&&delta(before,entered)<0.05;results.push({engine:engineName,width,name,pass,unsupported:true});console.log(pass?'PASS':'FAIL',engineName,width,name);await context.close();continue;}
   const lastCharacter=await node.evaluate(n=>{const w=document.createTreeWalker(n,NodeFilter.SHOW_TEXT);let t,last;while(t=w.nextNode())if(t.length)last=t;const r=document.createRange();r.setStart(last,last.length-1);r.setEnd(last,last.length);const s=document.getSelection();s.removeAllRanges();s.addRange(r);return last.data.at(-1);});
   await page.keyboard.insertText(lastCharacter);const identical=await node.evaluate(measure);
   await page.keyboard.insertText('追');const firstKey=await node.evaluate(measure);
   await frame.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
   const during=await node.evaluate(measure);await node.screenshot({path:`${out}/${engineName}-${width}-${name}-typing.png`});
   await page.keyboard.press('Escape');const exited=await node.evaluate(measure);
   await node.dblclick();await node.evaluate(n=>{const r=document.createRange();r.selectNodeContents(n);const selection=document.getSelection();selection.removeAllRanges();selection.addRange(r);});
   await page.keyboard.press('Backspace');const emptied=await node.evaluate(measure);
   await page.keyboard.insertText('再');const retyped=await node.evaluate(measure);
   const deletionStable=emptied.text===''&&retyped.text==='再'&&neighboursDelta(during,emptied)<0.05&&neighboursDelta(during,retyped)<0.05;
   const fontStable=[entered,identical,firstKey,during,exited,emptied,retyped].every(v=>sameFont(before,v));
   const entryDelta=delta(before,entered),noopDelta=delta(before,identical),firstGlyphDelta=delta(before,firstKey,['x','y','height']),duringOnlyDelta=delta(exited,during);
   const contentCorrect=entered.editable&&identical.text===before.text&&during.text===before.text+'追'&&before.glyphs.length>0;
   const entryBoxDelta=boxDelta(before.box,entered.box),readbackBoxDelta=boxDelta(during.box,exited.box),neighbourDelta=neighboursDelta(before,during);
   const pass=deletionStable&&contentCorrect&&entryBoxDelta<0.05&&readbackBoxDelta<0.05&&neighbourDelta<0.05&&before.inlineStyle===identical.inlineStyle&&fontStable&&entryDelta<0.05&&noopDelta<0.05&&firstGlyphDelta<0.05&&duringOnlyDelta<0.05&&during.scroll.top===0;
   results.push({engine:engineName,width,name,pass,deletionStable,contentCorrect,entryBoxDelta,readbackBoxDelta,neighbourDelta,fontStable,entryDelta,noopDelta,firstGlyphDelta,duringOnlyDelta,scrollTop:during.scroll.top,before,entered,identical,firstKey,during,exited,emptied,retyped});
   console.log(pass?'PASS':'FAIL',engineName,width,name,{contentCorrect,fontStable,firstGlyphDelta,duringOnlyDelta,readbackBoxDelta,neighbourDelta,scrollTop:during.scroll.top});
  }catch(error){results.push({engine:engineName,width,name,pass:false,error:error.stack});console.error(error.message);}
  await context.close();
 }
 await browser.close();
}
await writeFile(`${out}/results.json`,JSON.stringify(results,null,2));
if(results.length!==28||results.some(x=>!x.pass))process.exitCode=1;
