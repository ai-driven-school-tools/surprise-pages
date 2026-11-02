// Complete style -> save -> reload -> direct Japanese input, against a local preview.
import {mkdir,writeFile} from 'node:fs/promises';
const {chromium,webkit}=await import(process.env.PLAYWRIGHT_MODULE??'playwright');
const url=process.env.DECK_QA_URL,out=process.env.DECK_QA_OUTPUT??'/tmp/deck-style-workflow';
if(!url?.startsWith('http://127.0.0.1:'))throw Error('Use a local preview with the image-sequence examples');
await mkdir(out,{recursive:true});const results=[];
function geometry(n){const r=n.getBoundingClientRect(),s=n.closest('section').getBoundingClientRect(),k=s.width/1280,c=getComputedStyle(n);return {x:(r.x-s.x)/k,y:(r.y-s.y)/k,w:r.width/k,h:r.height/k,font:c.fontFamily,size:c.fontSize,line:c.lineHeight,weight:c.fontWeight};}
const stable=(a,b)=>['font','size','line','weight'].every(k=>a[k]===b[k])&&['x','y','w','h'].every(k=>Math.abs(a[k]-b[k])<.1);
for(const[name,engine]of[['chromium',chromium],['webkit',webkit]]){
 const browser=await engine.launch({headless:true});
 for(const [label,type]of[['藍','modern'],['霞','soft'],['パール','editorial']]){
  const context=await browser.newContext({viewport:{width:1500,height:1000},reducedMotion:'reduce'}),p=await context.newPage();let fontRequests=0;
  p.on('request',r=>{if(r.url().includes('/vendor/deck-fonts/'))fontRequests++;});
  await p.goto(url);await p.getByRole('button',{name:'この資料を編集'}).click();await p.getByRole('button',{name:'デザイン',exact:true}).first().click();await p.getByRole('button',{name:'配色 '+label,exact:true}).click();await p.locator('.deck-design-preset:not([disabled])').first().waitFor();
  await p.getByRole('button',{name:'保存する',exact:true}).click();await p.locator('.edit-screen').waitFor({state:'detached'});await p.goto(url+'/reader');await p.waitForFunction(()=>document.body.hasAttribute('data-deck-design-ready'));
  const saved=await p.evaluate(()=>JSON.parse(document.querySelector('[data-deck-appearance]').textContent).document.typography);
  await p.goto(url);await p.getByRole('button',{name:'この資料を編集'}).click();const frame=await(await p.locator('iframe').elementHandle()).contentFrame();await frame.waitForFunction(()=>document.body.hasAttribute('data-deck-design-ready'));await frame.evaluate(()=>document.fonts.ready);
  await p.route('**/api/pages/deck-edit',r=>r.request().method()==='PATCH'?r.abort('internetdisconnected'):r.continue());
  for(const selector of ['h2','.dd-process-step h3']) {
  const target=frame.locator(selector).first();await target.scrollIntoViewIfNeeded();const original=await target.textContent(),before=await target.evaluate(geometry),requestsBefore=fontRequests;
  await target.dblclick();const entered=await target.evaluate(geometry);await target.evaluate(el=>{const range=document.createRange();range.selectNodeContents(el);range.collapse(false);const s=document.getSelection();s.removeAllRanges();s.addRange(range);});
  const cdp=name==='chromium'?await context.newCDPSession(p):null;
  if(cdp)await cdp.send('Input.imeSetComposition',{text:'邊',selectionStart:1,selectionEnd:1});else await p.keyboard.insertText('邊');
  const during=await target.evaluate(geometry);if(cdp)await p.keyboard.insertText('邊');await p.keyboard.press('Escape');const after=await target.evaluate(geometry),text=await target.textContent();
  results.push({name,type,selector,saved,pass:saved===type&&text===original+'邊'&&fontRequests===requestsBefore&&stable(before,entered)&&stable(before,during)&&stable(before,after),extraFontRequests:fontRequests-requestsBefore,before,entered,during,after});
  }
  await p.screenshot({path:`${out}/${name}-${type}.png`});await context.close();
 }
 await browser.close();
}
await writeFile(out+'/results.json',JSON.stringify(results,null,2));console.log(JSON.stringify(results));if(results.some(r=>!r.pass))process.exitCode=1;
