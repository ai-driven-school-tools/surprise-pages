/** Real Next image optimizer + real delivery HTML/runtime, with local-only original files. */
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, writeFile, readFile, symlink, rm} from 'node:fs/promises';
import {createServer} from 'node:net';
import {spawn} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {build} from 'esbuild';
import sharp from 'sharp';
import {chromium, webkit} from 'playwright';
import {testEnvironment} from '../../support/environment.mjs';
const root=fileURLToPath(new URL('../../../',import.meta.url));
const require=createRequire(import.meta.url);
const temp=await mkdtemp(join(tmpdir(),'page-image-browser-'));
const app=join(temp,'app');
await mkdir(app,{recursive:true});
await symlink(join(root,'node_modules'),join(app,'node_modules'),'dir');
const compiled=join(temp,'api.cjs');
await build({stdin:{contents:"export {withPageImages} from './src/lib/page-images/html';export * from './src/lib/page-images/contract';",resolveDir:root},bundle:true,format:'cjs',platform:'node',outfile:compiled});
const api=require(compiled);
const config=await require('next/dist/server/config').default('phase-development-server',root);
await writeFile(join(app,'next.config.mjs'),'export default '+JSON.stringify({images:config.images,devIndicators:false})+';');
await writeFile(join(app,'package.json'),JSON.stringify({type:'module'}));
const reserve=createServer();await new Promise(resolve=>reserve.listen(0,'127.0.0.1',resolve));
const port=reserve.address().port;await new Promise(resolve=>reserve.close(resolve));
const origin=`http://127.0.0.1:${port}`;
const pixels=Buffer.alloc(1600*1000*3);
for(let y=0;y<1000;y++)for(let x=0;x<1600;x++){const at=(y*1600+x)*3;pixels[at]=(x%128)*2;pixels[at+1]=(y%128)*2;pixels[at+2]=((x+y)%128)*2;}
const original=await sharp(pixels,{raw:{width:1600,height:1000,channels:3}}).png().toBuffer();
await writeFile(join(app,'photo.png'),original);
await writeFile(join(app,'intrinsic.png'),await sharp(original).resize(640,360).png().toBuffer());
await writeFile(join(app,'runtime.js'),await readFile(join(root,'src/widget/dist/page-images.js')));
const pageHtml=(image)=>api.withPageImages(`<!doctype html><html><head><meta charset="utf-8"><base href="/public/test/"><style>body{margin:20px}img.fitted{width:480px;height:300px;object-fit:cover}</style></head><body><h1>読み込み確認</h1>${image}</body></html>`,{publicImages:true,version:'a'.repeat(40),origin});
await writeFile(join(app,'normal.html'),pageHtml('<img class="fitted" width="1600" height="1000" src="photo.png" alt="写真">'));
await writeFile(join(app,'intrinsic.html'),pageHtml('<img src="intrinsic.png" alt="寸法指定のない画像">'));
await writeFile(join(app,'failed.html'),pageHtml('<img class="fitted" width="1600" height="1000" src="failed.png" alt="元画像への復帰">'));
async function route(path,source){const directory=join(app,'app',path);await mkdir(directory,{recursive:true});await writeFile(join(directory,'route.js'),source);}
await route('public/test',`import {readFile} from 'node:fs/promises';export async function GET(request){const kind=new URL(request.url).searchParams.get('kind');const name=['intrinsic','failed'].includes(kind)?kind:'normal';return new Response(await readFile(process.cwd()+'/'+name+'.html'),{headers:{'content-type':'text/html; charset=utf-8'}});}`);
await route('page-image-source/[...slug]',`import {readFile} from 'node:fs/promises';export async function GET(request){if(request.url.includes('failed.png'))return new Response(null,{status:404});return new Response(await readFile(process.cwd()+'/photo.png'),{headers:{'content-type':'image/png','cache-control':'public,max-age=60'}});}`);
await route('public/test/[name]',`import {readFile} from 'node:fs/promises';import sharp from 'sharp';export async function GET(request,{params}){const {name}=await params;if(name==='failed.png'&&new URL(request.url).searchParams.has('sp-image'))return new Response(null,{status:404});const input=await readFile(process.cwd()+'/'+(name==='intrinsic.png'?'intrinsic.png':'photo.png'));const width=Number(new URL(request.url).searchParams.get('sp-image'));const image=sharp(input);if(width>0)image.resize({width,withoutEnlargement:true});return new Response(await image.webp({quality:80}).toBuffer(),{headers:{'content-type':'image/webp'}});}`);
await route('page-images.js/[stamp]',`import {readFile} from 'node:fs/promises';export async function GET(){return new Response(await readFile(process.cwd()+'/runtime.js'),{headers:{'content-type':'text/javascript'}});}`);
let log='';const server=spawn(process.execPath,[join(root,'node_modules/next/dist/bin/next'),'dev','--webpack','--hostname','127.0.0.1','--port',String(port)],{cwd:app,env:testEnvironment({NODE_ENV:'development',NEXT_TELEMETRY_DISABLED:'1'}),stdio:['ignore','pipe','pipe']});
server.stdout.on('data',chunk=>{log+=chunk});server.stderr.on('data',chunk=>{log+=chunk});
let browser, page;
try{
 for(let attempt=0;attempt<120;attempt++){try{if((await fetch(origin+'/public/test')).ok)break;}catch{}if(attempt===119)throw Error('Next startup failed: '+log.slice(-4000));await new Promise(resolve=>setTimeout(resolve,500));}
 const safari=process.env.PAGES_TEST_BROWSER==='webkit';
 browser=await (safari?webkit:chromium).launch({headless:true,...(safari&&process.env.PAGES_TEST_WEBKIT_EXECUTABLE?{executablePath:process.env.PAGES_TEST_WEBKIT_EXECUTABLE}:!safari&&process.env.PAGES_TEST_CHROME_CHANNEL?{channel:process.env.PAGES_TEST_CHROME_CHANNEL}:{})});
 page=await browser.newPage({viewport:{width:900,height:700}});
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 let releaseFull;const previewObserved=new Promise(resolve=>{releaseFull=resolve;});
 // この版は画像を自前の口（?sp-image=<幅>）で配る。小さな下絵（32）だけ先に通し、本物の幅は下絵を見終えるまで止める
 await page.route(url=>url.searchParams.has('sp-image'),async route=>{const response=await route.fetch();if(Number(new URL(route.request().url()).searchParams.get('sp-image'))>32)await previewObserved;await route.fulfill({response});});
 await page.goto(origin+'/public/test',{waitUntil:'domcontentloaded'});
 await page.waitForSelector('img[data-sp-image-placeholder]');
 const before=await page.locator('img').boundingBox();
 await page.waitForFunction(()=>performance.getEntriesByType('resource').some(r=>r.name.includes('sp-image=32&')&&r.responseEnd>0));
 assert.match(await page.locator('img').evaluate(i=>getComputedStyle(i).backgroundImage),/sp-image=32/,'the tiny preview is visible while the full image waits');
 releaseFull();
 await page.waitForSelector('img[data-sp-image-ready]');
 assert.deepEqual(await page.locator('img').boundingBox(),before,'image arrival does not move or resize the layout');
 const image=await page.locator('img').evaluate(i=>({url:i.currentSrc,width:i.naturalWidth}));
 // 配布版は公開ページの画像も自分の画像の口で軽くする（docs/design/page-images.md。標準の最適化は会社版の公開画像だけ）
 assert.ok(image.url.includes('sp-image='),'the site served the image through its own image route');
 const optimized=await page.request.get(image.url);assert.equal(optimized.status(),200);assert.ok((await optimized.body()).length<original.length);
 for(const blocked of ['/internal/private/photo.png','https://outside.test/image.png']){const res=await page.request.get(origin+'/_next/image?url='+encodeURIComponent(blocked)+'&w=640&q=80');assert.equal(res.status(),400);}
 await page.goto(origin+'/public/test?kind=intrinsic',{waitUntil:'networkidle'});
 await page.waitForSelector('img[data-sp-image-ready]');
 const natural=await page.locator('img').boundingBox();assert.equal(natural.width,640);assert.equal(natural.height,360,'an unsized article image keeps its original aspect ratio');
 // The optimizer fails before the deferred reader script runs.
 let releaseScript;const errorObserved=new Promise(resolve=>{releaseScript=resolve;});
 await page.route('**/page-images.js/**',async route=>{const response=await route.fetch();await errorObserved;await route.fulfill({response});});
 await page.goto(origin+'/public/test?kind=failed',{waitUntil:'commit'});
 await page.waitForFunction(()=>{const image=document.querySelector('img');return image?.complete&&!image.naturalWidth;});
 releaseScript();
 await page.waitForLoadState('networkidle');
 await page.waitForSelector('img[data-sp-image-ready]');
 assert.ok((await page.locator('img').evaluate(i=>i.currentSrc)).includes('/public/test/failed.png'),'early failure restores the original');
 assert.deepEqual(errors,[]);
 console.log('PASS: real Next optimization, bounded URLs, blur preview, stable layout, intrinsic dimensions and early-error recovery');
}catch(error){
 console.error(log.slice(-4000));
 if(page){console.error(await page.evaluate(()=>({images:[...document.images].map(i=>({src:i.currentSrc,complete:i.complete,width:i.naturalWidth,placeholder:i.hasAttribute('data-sp-image-placeholder')})),scripts:[...document.scripts].map(s=>s.src)})).catch(()=>null));await mkdir(join(root,'test-results'),{recursive:true});await page.screenshot({path:join(root,'test-results/page-images-'+(process.env.PAGES_TEST_BROWSER??'chromium')+'.png')}).catch(()=>{});}
 throw error;
}finally{await browser?.close();server.kill('SIGTERM');if(server.exitCode===null)await new Promise(resolve=>server.once('exit',resolve));await rm(temp,{recursive:true,force:true});}
