// Covers and list items retain geometry through editing and guided presentation.
import {mkdir,writeFile} from 'node:fs/promises';
const {chromium,webkit}=await import(process.env.PLAYWRIGHT_MODULE??'playwright');
const base=process.env.DECK_QA_URL??'http://127.0.0.1:60723',out=process.env.DECK_QA_OUTPUT??'/tmp/deck-editorial';
if(!['localhost','127.0.0.1','[::1]'].includes(new URL(base).hostname))throw Error('Use a local preview');await mkdir(out,{recursive:true});const results=[];
function measure(s){const b=s.getBoundingClientRect(),k=b.width/1280;return [...s.querySelectorAll('h1,h2,h3,p,figure')].map(el=>{const r=el.getBoundingClientRect(),css=getComputedStyle(el);return{id:el.dataset.ddElementId??el.className,x:(r.x-b.x)/k,y:(r.y-b.y)/k,w:r.width/k,h:r.height/k,font:css.fontSize,line:css.lineHeight}});}
const stable=(a,b)=>a.length===b.length&&a.every((r,i)=>r.font===b[i].font&&r.line===b[i].line&&['x','y','w','h'].every(key=>Math.abs(r[key]-b[i][key])<.6));
for(const[name,engine]of[['chromium',chromium],['webkit',webkit]]){
 const browser=await engine.launch({headless:true}),page=await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
 await page.route('**/api/pages/deck-edit',r=>r.request().method()==='PATCH'?r.abort('internetdisconnected'):r.continue());await page.goto(base);await page.getByRole('button',{name:'この資料を編集'}).click();const frame=await(await page.locator('iframe').elementHandle()).contentFrame();await frame.locator('.dd-editorial').first().waitFor();await frame.evaluate(()=>document.fonts.ready);
 for(const slide of await frame.locator('section.dd-editorial').all())for(const target of await slide.locator('h1,h2,h3,p:not([aria-hidden])').all()){
  await target.scrollIntoViewIfNeeded();const before=await slide.evaluate(measure),original=await target.textContent();await target.dblclick();const entered=await slide.evaluate(measure);const editable=await target.evaluate(n=>n.isContentEditable);
  await target.evaluate(el=>{const r=document.createRange();r.selectNodeContents(el);r.collapse(false);const s=document.getSelection();s.removeAllRanges();s.addRange(r)});await page.keyboard.insertText('改');const during=await slide.evaluate(measure),inserted=await target.textContent()===original+'改';await page.keyboard.press('Escape');const after=await slide.evaluate(measure);
  results.push({engine:name,kind:'typing',id:await slide.getAttribute('data-deck-id'),field:await target.evaluate(n=>n.dataset.ddElementId??n.tagName+':'+n.textContent.slice(0,20)),pass:editable&&inserted&&stable(before,entered)&&stable(before,during)&&stable(before,after),before,entered,during,after});
 }
 await page.goto(base+'/reader');await page.waitForFunction(()=>document.body.hasAttribute('data-deck-design-ready'));await page.evaluate(()=>document.fonts.ready);
 for(let i=10;i<=18;i++){
  await page.getByRole('button',{name:new RegExp('^'+i+'枚目を順に見る')}).click();const slide=page.locator('[data-deck-current] section');const before=await slide.evaluate(measure),states=[];
  for(let j=0;j<3;j++){await page.getByRole('button',{name:'次へ',exact:true}).click();await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));states.push(await slide.evaluate(s=>({active:[...s.querySelectorAll('.dd-point[data-dd-focus-state="active"]')].map(n=>n.dataset.ddElementId),dim:s.querySelectorAll('.dd-point[data-dd-focus-state="dim"]').length,childOpacity:[...s.querySelectorAll('.dd-point h3,.dd-point p')].map(n=>getComputedStyle(n).opacity)})));const current=await slide.evaluate(measure);states.at(-1).stable=stable(before,current);}
  results.push({engine:name,kind:'focus',id:await slide.getAttribute('data-deck-id'),states,pass:states.every((s,j)=>s.stable&&s.childOpacity.every(o=>o==='1')&&s.dim===2&&s.active.join()==='point-'+['capture','organize','share'][j])});await page.keyboard.press('Escape');
 }
 await browser.close();
}
await writeFile(out+'/interaction.json',JSON.stringify(results,null,2));const bad=results.filter(r=>!r.pass);console.log(JSON.stringify({cases:results.length,failures:bad.map(({engine,kind,id,field,states})=>({engine,kind,id,field,states}))}));if(bad.length)process.exitCode=1;
