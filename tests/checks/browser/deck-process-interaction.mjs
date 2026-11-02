// New image sequences: actual edit entry, input, exit, focus and print geometry.
import {mkdir,writeFile} from 'node:fs/promises';
const {chromium,webkit}=await import(process.env.PLAYWRIGHT_MODULE??'playwright');
const url=process.env.DECK_QA_URL,out=process.env.DECK_QA_OUTPUT??'/tmp/deck-process';
if(!url?.startsWith('http://127.0.0.1:'))throw Error('Specify a local editor preview');
await mkdir(out,{recursive:true});const results=[];
const ids=['process-images','process-rows','process-feature'];
function measure(s){const b=s.getBoundingClientRect(),k=b.width/1280;return [...s.querySelectorAll('h2,h3,p,figure')].map(el=>{const r=el.getBoundingClientRect(),c=getComputedStyle(el);return{x:(r.x-b.x)/k,y:(r.y-b.y)/k,w:r.width/k,h:r.height/k,font:c.fontSize,line:c.lineHeight,weight:c.fontWeight}});}
const stable=(a,b)=>a.length===b.length&&a.every((r,i)=>r.font===b[i].font&&r.line===b[i].line&&r.weight===b[i].weight&&['x','y','w','h'].every(k=>Math.abs(r[k]-b[i][k])<.1));
for(const[name,engine]of[['chromium',chromium],['webkit',webkit]]){
 const browser=await engine.launch({headless:true});
 for(const id of ids){
  const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'}),page=await context.newPage();
  await page.route('**/api/pages/deck-edit',r=>r.request().method()==='PATCH'?r.abort('internetdisconnected'):r.continue());
  await page.goto(url);await page.getByRole('button',{name:'この資料を編集'}).click();
  const frame=await(await page.locator('iframe').elementHandle()).contentFrame();const slide=frame.locator(`[data-deck-id="${id}"]`);await slide.waitFor();await frame.evaluate(()=>document.fonts.ready);await frame.evaluate(async()=>Promise.all([...document.images].map(i=>i.decode().catch(()=>{}))));
  const cdp=name==='chromium'?await context.newCDPSession(page):null;
  for(const target of await slide.locator('h2,h3,.dd-process-detail').all()){
   await target.scrollIntoViewIfNeeded();const original=await target.textContent(),before=await slide.evaluate(measure);await target.dblclick();const entered=await slide.evaluate(measure),editable=await target.evaluate(n=>n.isContentEditable);
   await target.evaluate(el=>{const range=document.createRange();range.selectNodeContents(el);range.collapse(false);const s=document.getSelection();s.removeAllRanges();s.addRange(range);});
   if(cdp)await cdp.send('Input.imeSetComposition',{text:'改',selectionStart:1,selectionEnd:1});else await page.keyboard.insertText('改');
   const during=await slide.evaluate(measure);if(cdp)await page.keyboard.insertText('改');
   const inserted=await target.textContent()===original+'改';await page.keyboard.press('Escape');const after=await slide.evaluate(measure);
   results.push({name,id,kind:cdp?'ime':'typing',field:original,pass:editable&&inserted&&stable(before,entered)&&stable(before,during)&&stable(before,after),before,entered,during,after});
  }
  await context.close();
 }
 for(const width of [1328,390]){
  const p=await browser.newPage({viewport:{width,height:1000},reducedMotion:'reduce'});await p.goto(url+'/reader');await p.evaluate(()=>document.fonts.ready);await p.evaluate(async()=>Promise.all([...document.images].map(i=>i.decode().catch(()=>{}))));
  for(const id of ids){
   const number=await p.evaluate(id=>[...document.querySelectorAll('section[data-deck-slide]')].findIndex(s=>s.dataset.deckId===id)+1,id);
   await p.getByRole('button',{name:new RegExp('^'+number+'枚目を順に見る')}).click();const slide=p.locator(`[data-deck-id="${id}"]`),before=await slide.evaluate(measure),states=[];
   for(const item of ['capture','organize','share']){
    await p.getByRole('button',{name:'次へ',exact:true}).click();await p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
    const state=await slide.evaluate(s=>({active:[...s.querySelectorAll('.dd-process-step[data-dd-focus-state="active"]')].map(n=>n.dataset.ddElementId),dim:s.querySelectorAll('.dd-process-step[data-dd-focus-state="dim"]').length,childOpacity:[...s.querySelectorAll('.dd-process-step h3,.dd-process-step p,.dd-process-step img')].map(n=>getComputedStyle(n).opacity)}));
    states.push({item,...state,stable:stable(before,await slide.evaluate(measure))});
   }
   results.push({name,width,id,kind:'focus',states,pass:states.every(s=>s.stable&&s.active.join()==='step-'+s.item&&s.dim===2&&s.childOpacity.every(o=>o==='1'))});await p.keyboard.press('Escape');
   await slide.evaluate(s=>s.scrollIntoView({block:'center',behavior:'instant'}));await p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
   const visible=await slide.evaluate(s=>{const b=s.getBoundingClientRect();return [...s.querySelectorAll('h2,h3,p,img')].every(n=>{const r=n.getBoundingClientRect();return r.left>=b.left-.1&&r.top>=b.top-.1&&r.right<=b.right+.1&&r.bottom<=b.bottom+.1;})&&[...s.querySelectorAll('.dd-process-step')].every(n=>getComputedStyle(n).opacity==='1');});
   results.push({name,width,id,kind:'reading',pass:visible});await slide.screenshot({path:`${out}/${name}-${width}-${id}.png`});
  }
  await p.emulateMedia({media:'print'});
  results.push({name,width,kind:'print',pass:await p.locator('.dd-process-step').evaluateAll(nodes=>nodes.length===9&&nodes.every(n=>getComputedStyle(n).opacity==='1'))});await p.close();
 }
 await browser.close();
}
await writeFile(out+'/interaction.json',JSON.stringify(results,null,2));const bad=results.filter(r=>!r.pass);console.log(JSON.stringify({cases:results.length,failures:bad.map(({name,id,kind,field,states})=>({name,id,kind,field,states}))}));if(bad.length)process.exitCode=1;
