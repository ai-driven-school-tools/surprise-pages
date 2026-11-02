// WebKit must not resize a flex table when its following caption gains focus.
import {mkdir,writeFile} from 'node:fs/promises';
const {chromium,webkit}=await import(process.env.PLAYWRIGHT_MODULE??'playwright');
const url=process.env.DECK_QA_URL,out=process.env.DECK_QA_OUTPUT??'/tmp/deck-table-editing';
if(!url?.startsWith('http://127.0.0.1:'))throw Error('Specify a local editor preview');await mkdir(out,{recursive:true});const results=[];
function measure(s){const paper=s.getBoundingClientRect(),scale=paper.width/1280;return [...s.querySelectorAll('h2,table,.dd-body>p')].map(n=>{const r=n.getBoundingClientRect(),css=getComputedStyle(n);return{x:(r.x-paper.x)/scale,y:(r.y-paper.y)/scale,w:r.width/scale,h:r.height/scale,font:css.fontSize,line:css.lineHeight}});}
const stable=(a,b)=>a.length===b.length&&a.every((r,i)=>r.font===b[i].font&&r.line===b[i].line&&['x','y','w','h'].every(k=>Math.abs(r[k]-b[i][k])<.1));
for(const[name,engine]of[['chromium',chromium],['webkit',webkit]]){
 const b=await engine.launch({headless:true}),p=await b.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce'});await p.route('**/api/pages/deck-edit',r=>r.request().method()==='PATCH'?r.abort('internetdisconnected'):r.continue());await p.goto(url);await p.getByRole('button',{name:'この資料を編集'}).click();const f=await(await p.locator('iframe').elementHandle()).contentFrame();await f.locator('section[data-dd-format^="table-"]').first().waitFor();await f.evaluate(()=>document.fonts.ready);
 for(const slide of await f.locator('section[data-dd-format^="table-"]').all()){
  const note=slide.locator('.dd-body>p').first();await note.scrollIntoViewIfNeeded();const before=await slide.evaluate(measure),original=await note.textContent();await note.dblclick();const entered=await slide.evaluate(measure),editable=await note.evaluate(n=>n.isContentEditable);await note.evaluate(n=>{const r=document.createRange();r.selectNodeContents(n);r.collapse(false);const s=document.getSelection();s.removeAllRanges();s.addRange(r)});await p.keyboard.insertText('改');const typed=await slide.evaluate(measure),inserted=await note.textContent()===original+'改';await p.keyboard.press('Escape');const after=await slide.evaluate(measure);results.push({engine:name,id:await slide.getAttribute('data-deck-id'),pass:editable&&inserted&&stable(before,entered)&&stable(before,typed)&&stable(before,after),before,entered,typed,after});
 }
 await b.close();
}
await writeFile(out+'/results.json',JSON.stringify(results,null,2));console.log(JSON.stringify({cases:results.length,failures:results.filter(r=>!r.pass).map(r=>({engine:r.engine,id:r.id}))}));if(results.length!==20||results.some(r=>!r.pass))process.exitCode=1;
