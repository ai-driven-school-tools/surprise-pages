// Real-browser release check. Only an explicit local preview may be exercised.
import {mkdir,writeFile} from 'node:fs/promises';
const {chromium,webkit}=await import(process.env.PLAYWRIGHT_MODULE??'playwright');
const url=process.env.DECK_QA_URL;
if(!url?.startsWith('http://127.0.0.1:'))throw Error('Specify the local catalogue preview');
const output=process.env.DECK_QA_OUTPUT??'/tmp/deck-catalog-quality';
const results=[];
for(const [name,engine] of [['chromium',chromium],['webkit',webkit]].filter(([name])=>!process.env.DECK_BROWSER||process.env.DECK_BROWSER===name))for(const width of [1328,390]){
 const browser=await engine.launch({headless:true});const page=await browser.newPage({viewport:{width,height:1000},reducedMotion:'reduce'});
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.goto(url);await page.evaluate(()=>document.fonts.ready);
 await page.waitForFunction(()=>document.querySelectorAll('[data-dd-chart][data-dd-rendered],[data-dd-chart][data-dd-chart-error]').length===13&&document.querySelectorAll('[data-dd-flow-scene]').length===14);
 await page.evaluate(async()=>Promise.all([...document.images].map(image=>image.decode().catch(()=>{}))));
 const folder=`${output}/${name}-${width}`;await mkdir(folder,{recursive:true});
 const slides=page.locator('section[data-deck-slide]');const frames=[];
 for(const [index,slide] of (await slides.all()).entries()){
  await slide.scrollIntoViewIfNeeded();
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  const state=await slide.evaluate(node=>{
   const box=node.getBoundingClientRect(),scale=box.width/1280,body=node.querySelector(':scope > .dd-body'),footer=node.querySelector(':scope > .dd-footer');
   const outer=body?.getBoundingClientRect();
   const escaped=outer?[...body.children].filter(child=>{const r=child.getBoundingClientRect();return r.bottom>outer.bottom+scale||r.top<outer.top-scale||r.right>outer.right+scale||r.left<outer.left-scale;}).map(child=>child.className):[];
   const plot=node.querySelector('.dd-chart-canvas'),plotBox=plot?.getBoundingClientRect();
   const clippedChartLabels=plotBox?[...plot.querySelectorAll('svg text')].filter(text=>{const r=text.getBoundingClientRect();return r.width>0&&(r.left<plotBox.left-scale||r.top<plotBox.top-scale||r.right>plotBox.right+scale||r.bottom>plotBox.bottom+scale);}).map(text=>text.textContent):[];
   const source=node.querySelector('.dd-chart-source');const sourceBottom=source?.getBoundingClientRect().bottom;
   return {id:node.getAttribute('data-deck-id'),width:box.width,escaped,clippedChartLabels,sourceOverlapsFooter:sourceBottom!==undefined&&footer!==null&&sourceBottom>footer.getBoundingClientRect().top+scale,missingImages:[...node.querySelectorAll('img')].filter(image=>!image.complete||!image.naturalWidth).length,invalidPaths:[...node.querySelectorAll('svg path')].filter(path=>/NaN|Infinity/.test(path.getAttribute('d')??'')).length,renderErrors:node.querySelectorAll('[data-dd-chart-error],[data-dd-diagram-error],[data-dd-flow-fallback]').length};
  });
  await slide.screenshot({path:`${folder}/${String(index+1).padStart(3,'0')}-${state.id}.png`,animations:'disabled'});frames.push(state);
 }
 // Exercise every authored step through the actual controls. Geometry is sampled
 // in the same presentation session so a title/supplement cannot shrink the paper.
 const steps=[];
 for(let index=0;index<frames.length;index++){
  const entry=page.getByRole('button',{name:new RegExp(`^${index+1}枚目を順に見る`)});
  if(await entry.count()!==1){steps.push({id:frames[index].id,pass:false,reason:'missing entry'});continue;}
  await entry.click();
  const count=await page.evaluate(()=>{const id=document.querySelector('[data-deck-current] section')?.getAttribute('data-deck-id');const source=JSON.parse(document.querySelector('[data-deck-focus]').textContent);return source.slides[id].steps.length;});
  const states=[];
  for(let at=0;at<count;at++){
   await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
   states.push(await page.evaluate(()=>{const paper=document.querySelector('[data-deck-current] [data-deck-stage]').getBoundingClientRect(),controls=document.querySelector('.deck-step-controls').getBoundingClientRect();return {paper:[paper.x,paper.y,paper.width,paper.height],gap:controls.top-paper.bottom,inside:controls.bottom<=innerHeight+.1,status:document.querySelector('.deck-step-status').textContent};}));
   if(at<count-1)await page.getByRole('button',{name:'次へ',exact:true}).click();
  }
  const pass=states.every(state=>JSON.stringify(state.paper)===JSON.stringify(states[0].paper)&&Math.abs(state.gap-12)<.2&&state.inside);
  await page.getByRole('button',{name:'全体',exact:true}).click();await page.keyboard.press('Escape');
  await page.waitForFunction(()=>!document.documentElement.hasAttribute('data-deck-mode'));
  steps.push({id:frames[index].id,pass,count,states});
 }
 const pass=frames.length===63&&new Set(frames.map(frame=>frame.id)).size===63&&frames.every(frame=>!frame.escaped.length&&!frame.clippedChartLabels.length&&!frame.sourceOverlapsFooter&&!frame.missingImages&&!frame.invalidPaths&&!frame.renderErrors)&&steps.every(step=>step.pass)&&!errors.length;
 results.push({browser:name,width,pass,frames,steps,errors});console.log(pass?'PASS':'FAIL',name,width,{slides:frames.length,steps:steps.reduce((sum,step)=>sum+(step.count??0),0),badSlides:frames.filter(frame=>frame.escaped.length||frame.clippedChartLabels.length||frame.sourceOverlapsFooter||frame.renderErrors),badSteps:steps.filter(step=>!step.pass).map(step=>step.id),errors});await browser.close();
}
await writeFile(`${output}/results.json`,JSON.stringify(results,null,2));if(results.some(result=>!result.pass))process.exitCode=1;
