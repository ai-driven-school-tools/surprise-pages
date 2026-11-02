import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {chromium,webkit} from 'playwright';
import sharp from 'sharp';
const inspector=(await build({entryPoints:['src/lib/deck/render-inspection.ts'],bundle:true,write:false,format:'iife',globalName:'QA',platform:'browser'})).outputFiles[0].text;
const runtime=(await build({entryPoints:['src/widget/reading/page-images.ts'],bundle:true,write:false,format:'iife',platform:'browser'})).outputFiles[0].text;
const browser=await (process.env.PAGES_TEST_BROWSER==='webkit'?webkit:chromium).launch({headless:true});
test.after(()=>browser.close());
const image=async(w,h)=>'data:image/png;base64,'+(await sharp({create:{width:w,height:h,channels:3,background:'#42685f'}}).png().toBuffer()).toString('base64');
test('render gate rejects an undersized cover, including a crop whose box width alone passes',async()=>{
 const page=await browser.newPage();
 await page.setContent(`<section data-deck-slide data-deck-node="one" style="width:1280px;height:720px"><img data-deck-node="picture" src="${await image(800,400)}" style="width:300px;height:400px;object-fit:cover"></section>`);
 await page.addScriptTag({content:inspector});await page.evaluate(()=>QA.waitDeckRender(document));
 const result=await page.evaluate(()=>QA.inspectDeckLayout(['one']));
 assert.ok(result[0].issues.some(i=>i.kind==='asset'&&i.message.includes('画素')),'800px is insufficient: portrait crop needs 1600px for 2x');
 await page.close();
});
test('image delivery upgrades the chosen source when a small reading view becomes a presentation',async()=>{
 const page=await browser.newPage({viewport:{width:1400,height:900},deviceScaleFactor:1});
 await page.route('https://images.test/**',async route=>{const w=Number(new URL(route.request().url()).pathname.slice(1))||1600;await route.fulfill({contentType:'image/png',body:await sharp({create:{width:w,height:w/2,channels:3,background:'#42685f'}}).png().toBuffer()})});
 await page.setContent('<section style="width:1280px;transform:scale(.25);transform-origin:top left"><img data-sp-image src="https://images.test/320" data-sp-image-original="https://images.test/1600" data-sp-image-candidates="https://images.test/320 320w, https://images.test/640 640w, https://images.test/1280 1280w, https://images.test/2560 2560w" style="width:1000px;height:500px;object-fit:cover"></section>');
 await page.addScriptTag({content:runtime});await page.waitForFunction(()=>document.images[0].complete&&document.images[0].naturalWidth>0);
 await page.evaluate(()=>{document.querySelector('section').style.transform='scale(1)';document.documentElement.setAttribute('data-deck-mode','present')});
 await page.waitForFunction(()=>document.images[0].currentSrc&&Number(new URL(document.images[0].currentSrc).pathname.slice(1))>=1000,{},{timeout:10000});
 assert.ok(Number(new URL(await page.locator('img').evaluate(i=>i.currentSrc)).pathname.slice(1))>=1000);
 await page.close();
});
test('quality uses encoded pixels with srcset and the unscaled slide canvas; sharp contain images pass',async()=>{
 const page=await browser.newPage();const src=await image(1600,800);
 await page.setContent(`<section data-deck-slide data-deck-node="one" style="width:1280px;height:720px;transform:scale(.3);transform-origin:top left"><img data-deck-node="picture" srcset="${src} 2x" style="width:400px;height:400px;object-fit:contain"></section>`);
 await page.addScriptTag({content:inspector});await page.evaluate(()=>QA.waitDeckRender(document));
 assert.equal((await page.evaluate(()=>QA.inspectDeckLayout(['one'])))[0].issues.filter(i=>i.kind==='asset').length,0);
 await page.close();
});
test('original intrinsic article size does not change after delivery or viewport resize',async()=>{
 const page=await browser.newPage();const src=await image(640,360);
 await page.setContent(`<img data-sp-image src="${src}" data-sp-image-candidates="${src} 1280w">`);await page.waitForFunction(()=>document.images[0].naturalWidth===640);
 await page.addScriptTag({content:runtime});await page.setViewportSize({width:1200,height:800});await page.waitForTimeout(100);
 assert.deepEqual(await page.locator('img').evaluate(i=>[i.offsetWidth,i.offsetHeight]),[640,360]);await page.close();
});
test('unverified background photos fail closed, while vector images stay resolution-independent',async()=>{
 const page=await browser.newPage();const src=await image(800,400);
 await page.setContent(`<section data-deck-slide data-deck-node="one" style="width:1280px;height:720px;background-image:url('${src}')"><img src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10'%3E%3C/svg%3E" style="width:400px;height:400px"></section>`);
 await page.addScriptTag({content:inspector});await page.evaluate(()=>QA.waitDeckRender(document));
 const result=await page.evaluate(()=>QA.inspectDeckLayout(['one']));assert.equal(result[0].issues.filter(i=>i.kind==='asset').length,1);assert.match(result[0].issues.find(i=>i.kind==='asset').message,/背景画像/);await page.close();
});
test('publication automatically blocks bad photographs before any upload, and accepts sufficient pixels', {skip:process.env.PAGES_TEST_BROWSER==='webkit'}, async()=>{
 const {createServer}=await import('node:http');const {mkdtemp,writeFile,rm,symlink}=await import('node:fs/promises');const {tmpdir}=await import('node:os');const {join,resolve}=await import('node:path');const {execFile}=await import('node:child_process');const {promisify}=await import('node:util');
 const directory=await mkdtemp(join(tmpdir(),'deck-publication-quality-'));const bundle=await mkdtemp(join(tmpdir(),'deck-publication-runtime-'));const calls=[];
 const server=createServer(async(req,res)=>{for await(const _ of req)void _;calls.push({path:new URL(req.url,'http://localhost').pathname,method:req.method});res.setHeader('content-type','application/json');res.end(JSON.stringify({versionId:'a'.repeat(40),versionNumber:1,frozen:0}));});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const origin=`http://127.0.0.1:${server.address().port}`;const env={...process.env,PAGES_HOST:origin,PAGES_TOKEN_ORIGIN:origin,PAGES_TOKEN:'local-test-only',PAGES_NO_UPDATE_CHECK:'1'};
 const cli=resolve('bin/pages-publish.mjs');
 const run=(entry=cli)=>promisify(execFile)(process.execPath,[entry,'--dir',directory,'--slug','quality-test'],{env,timeout:45000});
 try{
  await writeFile(join(directory,'index.html'),'<html><head><title>画質</title></head><body data-deck><main data-deck-slides><section data-deck-slide data-deck-node=\'one\' data-deck-id=\'one\' style="width:1280px;height:720px"><img src="photo.png" style="width:200px;height:100px;object-fit:contain"></section></main></body></html>');
  await writeFile(join(directory,'photo.png'),await sharp({create:{width:100,height:50,channels:3,background:'#42685f'}}).png().toBuffer());
  await assert.rejects(run(),error=>error.stderr.includes('画素が不足'));assert.equal(calls.filter(c=>c.method==='POST').length,0);
  await writeFile(join(directory,'photo.png'),await sharp({create:{width:800,height:400,channels:3,background:'#42685f'}}).png().toBuffer());
  const success=await run();assert.match(success.stdout,/画素不足 0 件/);assert.ok(calls.some(c=>c.path==='/api/pages'));
  await promisify(execFile)(process.execPath,['scripts/build/agent-tools.mjs','--out',bundle],{timeout:45000});
  await symlink(resolve('node_modules'),join(bundle,'node_modules'),'dir');
  assert.match((await run(join(bundle,'pages-publish.mjs'))).stdout,/画素不足 0 件/);
  await rm(join(bundle,'deck-image-check.mjs'));calls.length=0;
  await assert.rejects(run(join(bundle,'pages-publish.mjs')),error=>error.stderr.includes('検査道具がありません'));
  assert.equal(calls.filter(c=>c.method==='POST').length,0,'missing tools cannot bypass the publication gate');
 } finally {server.closeAllConnections();await new Promise(r=>server.close(r));await rm(directory,{recursive:true,force:true});await rm(bundle,{recursive:true,force:true});}
});
test('an unsized missing image cannot disappear from the quality gate',async()=>{
 const page=await browser.newPage();await page.route('https://images.test/missing.png',r=>r.fulfill({status:404,body:''}));
 await page.setContent('<section data-deck-slide data-deck-node="one" style="width:1280px;height:720px"><img src="https://images.test/missing.png" alt=""></section>');
 await page.addScriptTag({content:inspector});await page.evaluate(()=>QA.waitDeckRender(document));
 assert.ok((await page.evaluate(()=>QA.inspectDeckLayout(['one'])))[0].issues.some(i=>i.kind==='asset'));
 await page.close();
});
test('alternate raster paint paths cannot pass the image gate',async()=>{
 const page=await browser.newPage();const tiny=await image(32,18);
 const wrapped='data:image/svg+xml,'+encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720"><image href="${tiny}" width="1280" height="720"/></svg>`);
 await page.route('https://images.test/wrapped.svg',route=>route.fulfill({contentType:'image/svg+xml',body:`<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720"><image href="${tiny}" width="1280" height="720"/></svg>`}));
 const variants=[
  '<img src="https://images.test/wrapped.svg" width="1280" height="720">',
  `<svg width="1280" height="720"><image href="${tiny}" width="1280" height="720"/></svg>`,
  `<style>.cover:before{content:url('${tiny}');display:block;width:1280px;height:720px}</style><div class="cover"></div>`,
  `<img src="${wrapped}" width="1280" height="720">`,
 ];
 for(const markup of variants){
  await page.setContent(`<section data-deck-slide data-deck-node="one" style="width:1280px;height:720px">${markup}</section>`);
  await page.addScriptTag({content:inspector});await page.evaluate(()=>QA.waitDeckRender(document));
  assert.ok((await page.evaluate(()=>QA.inspectDeckLayout(['one'])))[0].issues.some(i=>i.kind==='asset'),markup.slice(0,90));
 }
 await page.close();
});
test('publication inspects background image-set even without img or url spelling', {skip:process.env.PAGES_TEST_BROWSER==='webkit'},async()=>{
 const {createServer}=await import('node:http');const {mkdtemp,writeFile,rm}=await import('node:fs/promises');const {tmpdir}=await import('node:os');const {join,resolve}=await import('node:path');const {execFile}=await import('node:child_process');const {promisify}=await import('node:util');
 const directory=await mkdtemp(join(tmpdir(),'deck-alternate-paint-'));const calls=[];
 const server=createServer(async(req,res)=>{for await(const _ of req)void _;calls.push(req.method);res.setHeader('content-type','application/json');res.end(JSON.stringify({versionId:'a'.repeat(40),versionNumber:1,frozen:0}));});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const origin=`http://127.0.0.1:${server.address().port}`;
 try{
  await writeFile(join(directory,'index.html'),`<html><head></head><body data-deck><section data-deck-slide style='width:1280px;height:720px;background-image:image-set("photo.png" 1x)'></section></body></html>`);
  await writeFile(join(directory,'photo.png'),await sharp({create:{width:32,height:18,channels:3,background:'#42685f'}}).png().toBuffer());
  await assert.rejects(promisify(execFile)(process.execPath,[resolve('bin/pages-publish.mjs'),'--dir',directory,'--slug','quality-test'],{env:{...process.env,PAGES_HOST:origin,PAGES_TOKEN_ORIGIN:origin,PAGES_TOKEN:'local-test-only',PAGES_NO_UPDATE_CHECK:'1'},timeout:45000}),error=>error.stderr.includes('背景画像'));
  assert.equal(calls.filter(method=>method==='POST').length,0);
 }finally{server.closeAllConnections();await new Promise(r=>server.close(r));await rm(directory,{recursive:true,force:true});}
});
test('Mermaid HTML labels pass while photographs inside foreignObject still undergo inspection',async()=>{
 const page=await browser.newPage();
 await page.setContent('<section data-deck-slide data-deck-node="one" style="width:1280px;height:720px"><div class="mermaid">flowchart LR\nA[開始] --> B[完了]</div></section>');
 await page.addScriptTag({path:'vendor/mermaid/mermaid.js'});
 await page.evaluate(async()=>{mermaid.initialize({startOnLoad:false,flowchart:{htmlLabels:true}});await mermaid.run();});
 assert.ok(await page.locator('foreignObject').count(),'exercise actual Mermaid HTML labels');
 await page.addScriptTag({content:inspector});await page.evaluate(()=>QA.waitDeckRender(document));
 assert.deepEqual((await page.evaluate(()=>QA.inspectDeckLayout(['one'])))[0].issues.filter(i=>i.kind==='asset'),[],'text labels are not unverified images');
 const tiny=await image(32,18);
 for(const markup of [`<img src="${tiny}" style="width:640px;height:360px">`,`<div style="width:640px;height:360px;background-image:url('${tiny}')"></div>`]){
  await page.setContent(`<section data-deck-slide data-deck-node="one" style="width:1280px;height:720px"><svg width="1280" height="720"><foreignObject width="640" height="360"><div xmlns="http://www.w3.org/1999/xhtml">${markup}</div></foreignObject></svg></section>`);
  await page.addScriptTag({content:inspector});await page.evaluate(()=>QA.waitDeckRender(document));
  const issues=(await page.evaluate(()=>QA.inspectDeckLayout(['one'])))[0].issues.filter(i=>i.kind==='asset');
  assert.ok(issues.some(issue=>/画素が不足|背景画像/.test(issue.message)),'descendant image measurements must still reject the photograph');
 }
 await page.close();
});
