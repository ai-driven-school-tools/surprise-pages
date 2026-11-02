// Real rendering QA. Explicit URL is required so tests never touch production.
import {mkdir,writeFile} from 'node:fs/promises';
const {chromium,webkit}=await import(process.env.PLAYWRIGHT_MODULE??'playwright');
const url=process.env.DECK_QA_URL;
if(!url?.startsWith('http://127.0.0.1:'))throw new Error('Use the local flow preview');
const output=process.env.DECK_QA_OUTPUT??'/tmp/deck-flow-visual';
const expected=Number(process.env.DECK_FLOW_COUNT??14);
const report=[];
for(const [name,engine] of [['chromium',chromium],['webkit',webkit]]){
 const browser=await engine.launch({headless:true});
 for(const width of [1390,390]){
  const page=await browser.newPage({viewport:{width,height:1000},deviceScaleFactor:1,reducedMotion:'reduce'});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(url);await page.evaluate(()=>document.fonts.ready);
  await page.waitForFunction(n=>document.querySelectorAll('[data-dd-flow-scene]').length===n,expected);
  const slides=page.locator('section[data-dd-format^="flow-"]');
  if(await slides.count()!==expected)throw new Error('Missing flow slides');
  const folder=`${output}/${name}-${width}`;await mkdir(folder,{recursive:true});
  const cases=[];
  for(const slide of await slides.all()){
   const id=await slide.getAttribute('data-deck-id');
   const metrics=await slide.evaluate(n=>{
    const svg=n.querySelector('[data-dd-flow-scene]');const vb=svg.viewBox.baseVal;
    const texts=[...svg.querySelectorAll('text')].map(t=>{const r=t.getBBox(),s=getComputedStyle(t);return {text:t.textContent,kind:t.hasAttribute('data-dd-flow-node-title')?'title':t.hasAttribute('data-dd-flow-node-detail')?'detail':'label',size:parseFloat(s.fontSize),weight:s.fontWeight,x:r.x,y:r.y,width:r.width,height:r.height};});
    const outside=texts.filter(t=>t.width>0&&(t.x<-.1||t.y<-.1||t.x+t.width>vb.width+.1||t.y+t.height>vb.height+.1));
    const overlaps=[];
    for(let i=0;i<texts.length;i++)for(let j=i+1;j<texts.length;j++){
     const a=texts[i],b=texts[j];if(Math.min(a.x+a.width,b.x+b.width)>Math.max(a.x,b.x)+1&&Math.min(a.y+a.height,b.y+b.height)>Math.max(a.y,b.y)+1)overlaps.push([a.text,b.text]);
    }
    const crossed=[];
    for(const path of svg.querySelectorAll('[data-dd-flow-wire]')){
     const length=path.getTotalLength();
     for(let at=0;at<=length;at+=2){const p=path.getPointAtLength(at);const text=texts.find(t=>p.x>t.x&&p.x<t.x+t.width&&p.y>t.y&&p.y<t.y+t.height);if(text){crossed.push(text.text);break;}}
    }
    const ids=[...n.querySelectorAll('[data-dd-node-id],[data-dd-edge-id]')].map(e=>e.hasAttribute('data-dd-node-id')?'node:'+e.getAttribute('data-dd-node-id'):'edge:'+e.getAttribute('data-dd-edge-id'));
    return {id:n.getAttribute('data-deck-id'),format:n.getAttribute('data-dd-format'),viewBox:[vb.width,vb.height],rendered:[svg.clientWidth,svg.clientHeight],texts,outside,overlaps,crossed,duplicateIds:ids.length-new Set(ids).size,fallback:!!n.querySelector('[data-dd-flow-fallback]')};
   });
   const titleSize=metrics.format==='flow-time'?28:32;
   metrics.pass=!metrics.fallback&&!metrics.duplicateIds&&!metrics.outside.length&&!metrics.overlaps.length&&!metrics.crossed.length&&metrics.texts.length>0&&metrics.texts.every(t=>t.size===(t.kind==='title'?titleSize:20));
   await slide.screenshot({path:`${folder}/${id}.png`,animations:'disabled'});
   cases.push(metrics);console.log(metrics.pass?'PASS':'FAIL',name,width,id,JSON.stringify({outside:metrics.outside.map(t=>t.text),overlaps:metrics.overlaps,crossed:metrics.crossed}));
  }
  report.push({browser:name,width,cases,errors});await page.close();
 }
 await browser.close();
}
await writeFile(`${output}/results.json`,JSON.stringify(report,null,2));
if(report.some(r=>r.errors.length||r.cases.some(c=>!c.pass)))process.exitCode=1;
