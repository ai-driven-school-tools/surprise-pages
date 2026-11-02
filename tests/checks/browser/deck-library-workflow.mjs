/** Template picker and real save/read/print round trips on an explicitly local harness. */
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {build} from 'esbuild';
import {root,dir} from '../paths.mjs';
const {chromium,webkit}=await import(process.env.PLAYWRIGHT_MODULE??'playwright');
const url=process.env.DECK_QA_URL;
if(!url?.startsWith('http://127.0.0.1:'))throw Error('Specify an isolated local editor harness');
const out=process.env.DECK_QA_OUTPUT??'/tmp/deck-library-qa';await mkdir(out,{recursive:true});
await build({stdin:{contents:`export * from './src/lib/deck/design/library';export * from './src/lib/deck/design/browser-templates';export * from './src/lib/deck/edit/source';`,resolveDir:root},outfile:`${dir}/deck-library-browser.mjs`,bundle:true,platform:'node',format:'esm'});
const m=await import(`${dir}/deck-library-browser.mjs`);
const results=[];
for(const [name,engine] of [['chromium',chromium],['webkit',webkit]].filter(([name])=>!process.env.DECK_BROWSER||process.env.DECK_BROWSER===name)){
 const browser=await engine.launch({headless:true,...(name==='chromium'&&process.env.PAGES_TEST_CHROME_CHANNEL?{channel:process.env.PAGES_TEST_CHROME_CHANNEL}:{}),...(name==='webkit'&&process.env.PAGES_TEST_WEBKIT_EXECUTABLE?{executablePath:process.env.PAGES_TEST_WEBKIT_EXECUTABLE}:{})});const page=await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const frame=()=>page.frameLocator('iframe.edit-frame');
 const saved=()=>page.waitForFunction(()=>document.querySelector('surprise-comments')?.shadowRoot?.querySelector('.deck-edit-status')?.getAttribute('data-state')==='saved');
 const openPicker=async()=>{await page.getByRole('button',{name:'スライドを追加',exact:true}).click();await page.getByRole('searchbox',{name:'見本を検索'}).waitFor();};
 const choose=async id=>{
  await openPicker();const item=m.DECK_LIBRARY.templates.find(t=>t.id===id);
  await page.getByRole('navigation',{name:'見本の分類'}).getByRole('button',{name:m.BROWSER_TEMPLATE_CATEGORIES.find(c=>c.id===item.category).name,exact:true}).click();
  const holder=page.locator(`[data-choice="library:${id}"]`);
  await holder.scrollIntoViewIfNeeded();
  await holder.locator('iframe').waitFor();
  const preview=holder.frameLocator('iframe');
  await preview.locator('body[data-deck-design-ready]').waitFor();
  if(item.html.includes('data-dd-chart'))await preview.locator('.dd-chart-canvas svg').waitFor();
  if(item.html.includes('data-dd-mermaid-diagram'))await preview.locator('.dd-flow-diagram svg').waitFor();
  await holder.click();await page.getByRole('button',{name:'このスライドを追加',exact:true}).click();await saved();
  await frame().locator(`section[data-studio-active][data-deck-template="${id}"]`).waitFor();
 };
 const sessionId=crypto.randomUUID(),common={page:'internal/example/design',sessionId};
 const read=async()=>{const r=await page.request.get(`${url}/api/pages/deck-edit?${new URLSearchParams(common)}`);assert.ok(r.ok());return r.json();};
 try{
  await page.goto(url+'/?edit=1');await page.getByRole('button',{name:'型を変更',exact:true}).waitFor();await saved();
  await openPicker();assert.equal(await page.locator('[data-choice^="library:"]').count(),m.BROWSER_TEMPLATES.filter(t=>t.kind==='library').length);
  assert.equal(await page.locator('[data-choice^="basic:"]').count(),8);
  assert.ok(await page.locator('.dp-results iframe').count()<30,'Previews must load lazily');
  for(const category of m.BROWSER_TEMPLATE_CATEGORIES){
   await page.getByRole('navigation',{name:'見本の分類'}).getByRole('button',{name:category.name,exact:true}).click();
   assert.equal(await page.locator('[data-choice^="library:"]').count(),m.BROWSER_TEMPLATES.filter(t=>t.kind==='library'&&t.category===category.id).length);
  }
  await page.getByRole('navigation',{name:'見本の分類'}).getByRole('button',{name:'すべて',exact:true}).click();
  await page.getByRole('searchbox',{name:'見本を検索'}).fill('箇条書き');assert.ok(await page.locator('[data-choice^="library:"]').count()>0);
  await page.getByRole('searchbox',{name:'見本を検索'}).fill('見つからない見本XYZ');assert.equal(await page.locator('.dp-card').count(),0);
  await page.getByRole('searchbox',{name:'見本を検索'}).fill('');
  await page.setViewportSize({width:390,height:844});
  const fit=await page.locator('.ds-library-dialog').evaluate(n=>{const r=n.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.bottom<=innerHeight;});assert.ok(fit);
  await page.screenshot({path:`${out}/${name}-picker-mobile.png`});
  await page.keyboard.press('Escape');assert.equal(await page.locator('.ds-library-dialog').count(),0);
  await page.setViewportSize({width:1440,height:1000});
  await choose('editorial-list-columns');
  await page.getByRole('button',{name:'元に戻す',exact:true}).click();await saved();
  await page.getByRole('button',{name:'やり直す',exact:true}).click();await saved();
  await choose('table-plain');
  await choose('process-images');
  await choose('composition-split-right');
  const slot=frame().locator('section[data-studio-active] [data-deck-media-slot="image"]');
  await slot.click();await page.getByRole('button',{name:'画像を追加',exact:true}).waitFor();
  const png=await page.screenshot();
  const chooser=page.waitForEvent('filechooser');await page.getByRole('button',{name:'画像を追加',exact:true}).click();await page.getByRole('complementary',{name:'画像パレット'}).getByRole('button',{name:'アップロード',exact:true}).click();
  await (await chooser).setFiles({name:'sample.png',mimeType:'image/png',buffer:png});await saved();
  await frame().locator('section[data-studio-active] .dd-message-image-visual img').waitFor();
  await page.screenshot({path:`${out}/${name}-inserted.png`});
  await page.getByRole('button',{name:'完了',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('surprise-comments')?.shadowRoot?.querySelector('.deck-studio'));
  console.log('OK',name,'picker / categories / search / mobile / undo / table / process / image upload');
  // Save each template through the real API, in bounded requests. No database or storage writes outside the isolated harness.
  let state=await read();
  if(!m.DECK_LIBRARY.templates.every(t=>state.html.includes(`data-deck-id="qa-${t.id}"`))){
   for(const item of m.DECK_LIBRARY.templates){
    const operations=m.librarySlideOperations(state.html,item.id,`qa-${item.id}`,null);
    const r=await page.request.patch(`${url}/api/pages/deck-edit`,{data:{...common,operationId:crypto.randomUUID(),baseVersionId:state.versionId,operations}});
    assert.ok(r.ok(),`${item.id}: ${await r.text()}`);state=await r.json();
   }
  }
  await page.goto(url+'/reader');
  await page.waitForFunction(()=>document.body.hasAttribute('data-deck-design-ready'));
  await page.waitForFunction(()=>[...document.querySelectorAll('section[id^="qa-"] [data-dd-chart],section[id^="qa-"] [data-dd-mermaid-diagram],section[id^="qa-"] [data-dd-native-diagram]')].every(n=>n.querySelector('svg')),{},{timeout:60000});
  for(const width of [1440,390]){
   await page.setViewportSize({width,height:1000});await page.evaluate(()=>document.fonts.ready);
   const metrics=[];
   for(const item of m.DECK_LIBRARY.templates){
    const slide=page.locator(`#qa-${item.id}`);await slide.scrollIntoViewIfNeeded();
    const metric=await slide.evaluate(node=>{
     const box=node.getBoundingClientRect(),k=box.width/1280;
     const escaped=[...node.querySelectorAll('h1,h2,h3,p,table,[data-deck-media-slot]')].filter(n=>{
      if(n.closest('aside,.dd-chart-fallback,.dd-flow-targets,svg'))return false;
      const style=getComputedStyle(n),r=n.getBoundingClientRect();
      if(style.display==='none'||r.width===0||r.height===0)return false;
      return r.left<box.left-2*k||r.right>box.right+2*k||r.top<box.top-2*k||r.bottom>box.bottom+2*k;
     }).map(n=>({tag:n.tagName,cls:n.className,text:n.textContent.slice(0,60)}));
     return {id:node.id,escaped,renderErrors:node.querySelectorAll('[data-dd-chart-error],[data-dd-diagram-error]').length,missingImages:[...node.querySelectorAll('img')].filter(n=>!n.complete||!n.naturalWidth).length};
    });metrics.push(metric);
   }
   results.push({name,width,metrics,errors:[...errors]});
   const bad=metrics.filter(m=>m.escaped.length||m.renderErrors||m.missingImages);
   console.log(bad.length?'NG':'OK',name,width,'94 saved templates',JSON.stringify(bad));
  }
  await page.emulateMedia({media:'print'});
  assert.equal(await page.locator('section[id^="qa-"]').count(),94);
  assert.equal(await page.locator('section[id^="qa-"]').evaluateAll(nodes=>nodes.filter(n=>getComputedStyle(n).display==='none').length),0);
  await page.emulateMedia({media:'screen'});
  const entry=page.getByRole('button',{name:/枚目を順に見る/}).first();await entry.click();
  await page.getByRole('button',{name:'次へ',exact:true}).click();await page.keyboard.press('Escape');
  await page.waitForFunction(()=>!document.documentElement.hasAttribute('data-deck-mode'));
  await page.setViewportSize({width:1440,height:1000});
  await page.goto(url+'/?edit=1');await page.getByRole('button',{name:'型を変更',exact:true}).waitFor();await openPicker();
  await page.getByRole('navigation',{name:'見本の分類'}).getByRole('button',{name:'表紙・人物紹介',exact:true}).click();
  await page.screenshot({path:`${out}/${name}-picker.png`});
  console.log('OK',name,'print / presentation / reopen');
 }catch(e){results.push({name,error:e.stack,errors});console.error(e);await page.screenshot({path:`${out}/${name}-failure.png`}).catch(()=>{});}
 finally{await browser.close();}
}
await writeFile(`${out}/results.json`,JSON.stringify(results,null,2));
if(results.some(r=>r.error||r.errors.length||r.metrics?.some(m=>m.escaped.length||m.renderErrors||m.missingImages)))process.exitCode=1;
