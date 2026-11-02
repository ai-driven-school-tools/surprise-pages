/** Explicit QA dependency directory; screenshots remain outside the repository. */
import {mkdir,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
const modules=process.env.DECK_QA_MODULES??'/private/tmp/deck-editor-qa/node_modules';
const {chromium,webkit}=await import(pathToFileURL(`${modules}/playwright/index.mjs`));
const {PNG}=await import(pathToFileURL(`${modules}/pngjs/lib/png.js`));
const {default:pixelmatch}=await import(pathToFileURL(`${modules}/pixelmatch/index.js`));
const out=process.env.DECK_QA_OUT??'/private/tmp/deck-editor-qa/parity';
const base=process.env.DECK_QA_URL??'http://127.0.0.1:4179';
const results=[];
for(const [name,engine] of [['chromium',chromium],['webkit',webkit]]){
  const browser=await engine.launch({headless:true});
  for(const width of [1390,390]){
    const context=await browser.newContext({viewport:{width,height:1000},deviceScaleFactor:1,reducedMotion:'reduce'});
    const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(base);await ready(page);
    if(width===1390){
      for(let fit=0;fit<4;fit++){
        const renderedWidth=await page.locator('[data-deck-slide]').first().evaluate(e=>e.getBoundingClientRect().width);
        if(Math.abs(renderedWidth-1280)<0.01)break;
        await page.setViewportSize({width:Math.round(page.viewportSize().width+1280-renderedWidth),height:1000});
        await page.waitForTimeout(300);
      }
      await page.reload();await ready(page);
    }
    const dir=`${out}/${name}-${width}`;await mkdir(dir,{recursive:true});
    const launcher=page.getByRole('button',{name:'この資料を編集',exact:true,includeHidden:true});
    await launcher.evaluate(el=>el.style.visibility='hidden');
    const before=await capture(page,dir,'before');
    if(width===1390 && before.some(slide=>slide.png.width!==1280||slide.png.height<720||slide.png.height>721))throw new Error('Full-size captures must be 1280px wide at scale 1');
    await launcher.evaluate(el=>el.style.visibility='visible');
    await page.getByRole('button',{name:'この資料を編集',exact:true}).click();
    const element=await page.waitForSelector('iframe[title="スライドの編集画面"]');const frame=await element.contentFrame();
    await ready(frame);const after=await capture(frame,dir,'after');
    if(before.length!==15||after.length!==15)throw new Error(`Expected exactly 15 slides, got ${before.length}/${after.length}`);
    const slides=[];
    for(let i=0;i<before.length;i++){
      const a=before[i],b=after[i];if(a.id!==b.id)throw new Error('Slide order mismatch');
      let changedPixels=null;
      if(a.png.width===b.png.width && a.png.height===b.png.height){
        const diff=new PNG({width:a.png.width,height:a.png.height});changedPixels=pixelmatch(a.png.data,b.png.data,diff.data,a.png.width,a.png.height,{threshold:0.05});
        if(changedPixels)await writeFile(`${dir}/${a.id}-diff.png`,PNG.sync.write(diff));
      }
      let maxGeometryDelta=0;
      const geometryEqual=a.geometry.length===b.geometry.length && a.geometry.every((left,j)=>{
        const right=b.geometry[j];
        const delta=Math.max(...['x','y','w','h'].map(k=>Math.abs(left[k]-right[k])));
        maxGeometryDelta=Math.max(maxGeometryDelta,delta);
        return left.text===right.text&&left.font===right.font&&left.line===right.line&&delta<=0.02;
      });
      slides.push({id:a.id,widthBefore:a.png.width,widthAfter:b.png.width,changedPixels,geometryEqual,maxGeometryDelta});
    }
    results.push({browser:name,width,slides,errors});
    await writeFile(`${out}/results.json`,JSON.stringify(results,null,2));
    console.log(name,width,slides.map(s=>`${s.id}:${s.changedPixels}/${s.geometryEqual}`).join(' '),errors);
    await context.close();
  }
  await browser.close();
}
async function ready(frame){
  await frame.waitForSelector('[data-deck-slide]');
  const canvas=await frame.locator('[data-deck-slide]').first().evaluate(e=>({width:e.offsetWidth,height:e.offsetHeight}));
  if(canvas.width!==1280||canvas.height!==720)throw new Error(`Slide renderer missing or invalid: ${JSON.stringify(canvas)}`);
  await frame.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.images].map(i=>i.complete?Promise.resolve():new Promise(r=>{i.onload=r;i.onerror=r;})));});
  const missing=await frame.evaluate(()=>[...document.images].filter(i=>i.naturalWidth===0).map(i=>i.getAttribute('src')));
  if(missing.length)throw new Error(`Missing sample images: ${JSON.stringify(missing)}`);
  await frame.waitForFunction(()=>[...document.querySelectorAll('[data-dd-chart]')].every(e=>e.getAttribute('data-dd-rendered')==='true'&&e.querySelector('svg')) && [...document.querySelectorAll('.mermaid')].every(e=>e.querySelector('svg')));
  await frame.waitForTimeout(300);
}
async function capture(frame,dir,phase){
  const slides=frame.locator('[data-deck-slide]');const found=[];
  for(let i=0;i<await slides.count();i++){
    const slide=slides.nth(i);await slide.scrollIntoViewIfNeeded();
    const id=await slide.getAttribute('data-deck-id');
    if(!id)throw new Error('Missing stable slide ID');
    const geometry=await slide.evaluate(el=>{
      const root=el.getBoundingClientRect();
      return [...el.querySelectorAll('h1,h2,h3,p,img,svg text,td,th')].map(n=>{const r=n.getBoundingClientRect();const s=getComputedStyle(n);return {text:n.textContent,x:Math.round((r.x-root.x)*100)/100,y:Math.round((r.y-root.y)*100)/100,w:Math.round(r.width*100)/100,h:Math.round(r.height*100)/100,font:s.font,line:s.lineHeight};});
    });
    const buffer=await slide.screenshot({path:`${dir}/${phase}-${String(i+1).padStart(2,'0')}-${id}.png`,animations:'disabled'});
    found.push({id,geometry,png:PNG.sync.read(buffer)});
  }
  return found;
}
if(results.some(r=>r.errors.length||r.slides.some(s=>s.changedPixels!==0||!s.geometryEqual)))process.exitCode=1;
