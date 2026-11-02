// Regression: editing one cover field must not resize its copy group or neighbours.
const {chromium,webkit}=await import(process.env.PLAYWRIGHT_MODULE??'playwright');
import {mkdir,writeFile} from 'node:fs/promises';
const base=process.env.DECK_QA_URL??'http://127.0.0.1:60713';
if(!['localhost','127.0.0.1','[::1]'].includes(new URL(base).hostname))throw Error('Use the local editor harness for editing checks');
const output=process.env.DECK_QA_OUTPUT??'/tmp/deck-message-image';
await mkdir(output,{recursive:true});
const results=[];
for(const [engineName,engine]of[['chromium',chromium],['webkit',webkit]]){
 const browser=await engine.launch({headless:true});const page=await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce'});await page.route('**/api/pages/deck-edit',route=>route.request().method()==='PATCH'?route.abort('internetdisconnected'):route.continue());await page.goto(base);await page.getByRole('button',{name:'この資料を編集'}).click();const frame=await(await page.locator('iframe').elementHandle()).contentFrame();await frame.locator('.dd-message-image-copy').first().waitFor();
 const slides=frame.locator('.dd-message-image:not([data-dd-format="image-one"])');
 for(const slide of await slides.all())for(const target of await slide.locator('h1,p').all()){
  await target.scrollIntoViewIfNeeded();
  const sample=()=>slide.evaluate(s=>{const paper=s.getBoundingClientRect(),scale=paper.width/1280;return [...s.querySelectorAll('h1,p,figure')].map(el=>{const r=el.getBoundingClientRect(),style=getComputedStyle(el);return {id:el.dataset.ddElementId,x:(r.x-paper.x)/scale,y:(r.y-paper.y)/scale,w:r.width/scale,h:r.height/scale,font:style.fontSize,line:style.lineHeight}})});
  const originalText=await target.textContent();const before=await sample();await target.dblclick();if(!await target.evaluate(el=>el.isContentEditable))throw Error('Cover field did not enter text editing');const entering=await sample();await target.evaluate(el=>{const range=document.createRange();range.selectNodeContents(el);range.collapse(false);const selection=document.getSelection();selection.removeAllRanges();selection.addRange(range)});await page.keyboard.insertText('改');if(await target.textContent()!==originalText+'改')throw Error('Inserted character was not retained');const typing=await sample();await page.keyboard.press('Escape');const after=await sample();
  const stable=state=>state.every((r,i)=>r.font===before[i].font&&r.line===before[i].line&&['x','y','w','h'].every(key=>Math.abs(r[key]-before[i][key])<.6));
  results.push({engine:engineName,layout:await slide.getAttribute('data-dd-layout'),field:await target.getAttribute('data-dd-element-id'),enter:stable(entering),typing:stable(typing),exit:stable(after),before,entering,typingState:typing,after});
 }
 await browser.close();
}
await writeFile(`${output}/editing.json`,JSON.stringify(results,null,2));const failures=results.filter(r=>!r.enter||!r.typing||!r.exit);console.log(JSON.stringify({cases:results.length,failures:failures.map(({engine,layout,field,enter,typing,exit})=>({engine,layout,field,enter,typing,exit}))}));if(failures.length||results.length!==48)process.exitCode=1;
