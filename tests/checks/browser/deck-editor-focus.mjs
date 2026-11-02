import {mkdir,writeFile} from 'node:fs/promises';
const {chromium,webkit}=await import(process.env.PLAYWRIGHT_MODULE??'playwright');
const base=process.env.DECK_QA_URL;
const output=process.env.DECK_QA_OUTPUT??'/tmp/deck-editor-focus';
if(!base)throw new Error('Set DECK_QA_URL to the local 15-slide showcase');
const report=[];
for(const [name,engine] of [['chromium',chromium],['webkit',webkit]]){
  const browser=await engine.launch({headless:true});
  const page=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:1,reducedMotion:'reduce'});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base);await page.getByRole('button',{name:'この資料を編集'}).click();
  const frame=await (await page.waitForSelector('iframe')).contentFrame();
  await frame.waitForSelector('[data-deck-node]');
  await frame.evaluate(async()=>{await document.fonts.ready;await Promise.allSettled([...document.images].map(i=>i.decode()));});
  await frame.waitForFunction(()=>[...document.querySelectorAll('[data-dd-chart]')].every(e=>e.getAttribute('data-dd-rendered')==='true'&&e.querySelector('svg'))&&[...document.querySelectorAll('.mermaid')].every(e=>e.querySelector('svg')));
  const focus=await frame.locator('script[data-deck-focus]').evaluate(e=>JSON.parse(e.textContent));
  const dir=`${output}/${name}`;await mkdir(dir,{recursive:true});let states=0,steps=0;
  for(const [slideId,slide] of Object.entries(focus.slides)){
    for(const [index,step] of [...slide.steps,null].entries()){
      const detail={slideId,stepId:step?.id??null,actions:step?.actions??[],supplement:step?.supplement,progress:{index:index+1,total:slide.steps.length}};
      if(step)steps++;
      await frame.evaluate(detail=>document.dispatchEvent(new CustomEvent('surprise:deck-focus-apply',{detail})),detail);
      await frame.waitForTimeout(180);
      const node=frame.locator(`[data-deck-id="${slideId}"]`);
      const state=await node.evaluate(e=>({active:e.querySelectorAll('[data-dd-focus-state="active"]').length,dim:e.querySelectorAll('[data-dd-focus-state="dim"]').length,step:e.getAttribute('data-dd-focus-step')}));
      const overview=!step||step.actions.every(a=>a.kind==='overview');
      if(overview && (state.active||state.dim))throw new Error(`Focus did not clear ${slideId}`);
      if(!overview && !state.active)throw new Error(`Focus target missing ${slideId}/${step.id}`);
      const file=`${String(++states).padStart(2,'0')}-${slideId}-${step?.id??'clear'}.png`;
      await node.screenshot({path:`${dir}/${file}`,animations:'disabled'});
      report.push({browser:name,slideId,stepId:step?.id??null,file,...state});
    }
  }
  if(steps!==18||states!==25||errors.length)throw new Error(`${name}: expected 18 steps and 7 clear states, got ${steps}/${states}; ${errors}`);
  console.log(`PASS ${name}: 18 focus steps + 7 clear states, 0 missing targets, 0 page errors`);
  await browser.close();
}
await writeFile(`${output}/results.json`,JSON.stringify(report,null,2));
