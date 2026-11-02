// Opt-in browser check. Uses local fixture files and actual routes; no production access.
// MEDIA_QA_ASSETS: folder containing sample.mp4/sample.mp3. PLAYWRIGHT_MODULE: installed Playwright.
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import http from 'node:http';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { mediaDeliveryHarness } from '../media-delivery-harness.mjs';
if(!process.env.MEDIA_QA_ASSETS)throw Error('MEDIA_QA_ASSETS is required');
const {chromium,webkit}=await import(process.env.PLAYWRIGHT_MODULE??'playwright');
const {state,routes}=await mediaDeliveryHarness();
for(const [file,type]of[['sample.mp4','video/mp4'],['sample.mp3','audio/mpeg']])state.files.set(`internal/deck/${file}`,{bytes:await readFile(`${process.env.MEDIA_QA_ASSETS}/${file}`),type,etag:`"${file}"`});
state.files.set('internal/deck/captions.vtt',{bytes:Buffer.from('WEBVTT\n\n00:00:00.000 --> 00:00:03.000\n日本語字幕の確認\n'),type:'text/vtt; charset=utf-8',etag:'"caption"'});
const server=http.createServer(async(req,res)=>{
 try{
  if(req.url==='/'){res.writeHead(200,{'content-type':'text/html'});res.end('<!doctype html><html lang="ja"><meta charset="utf-8"><title>非公開メディアの配信確認</title><video controls muted playsinline width="640" src="/internal/deck/sample.mp4"><track kind="captions" src="/internal/deck/captions.vtt" srclang="ja" label="日本語" default></video><audio controls src="/internal/deck/sample.mp3"></audio></html>');return;}
  const url=new URL(req.url,'http://127.0.0.1');const slug=url.pathname.split('/').slice(2);
  const headers=new Headers();for(const [name,value]of Object.entries(req.headers))if(value!==undefined)headers.set(name,Array.isArray(value)?value.join(','):value);
  const abort=new AbortController();res.on('close',()=>{if(!res.writableEnded)abort.abort();});
  const request=new Request(url,{method:req.method,headers,signal:abort.signal});
  const response=await (req.method==='HEAD'?routes.internalHEAD:routes.internalGET)(request,{params:Promise.resolve({slug})});
  response.headers.forEach((value,name)=>res.setHeader(name,value));res.writeHead(response.status);
  if(response.body)await pipeline(Readable.fromWeb(response.body),res);else res.end();
 }catch{if(!res.headersSent)res.writeHead(500);res.end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const address=server.address();
const output=process.env.MEDIA_QA_OUTPUT??'/tmp/media-delivery-browser';await mkdir(output,{recursive:true});
const results=[];
try{
 for(const [name,engine]of[['chromium',chromium],['webkit',webkit]]){
  const browser=await engine.launch({headless:true});const page=await browser.newPage();const responses=[];page.on('response',r=>{if(/\.(mp4|mp3|vtt)$/.test(r.url()))responses.push({status:r.status(),file:new URL(r.url()).pathname.split('/').at(-1),range:r.headers()['content-range']??null,length:r.headers()['content-length']??null});});
  await page.goto(`http://127.0.0.1:${address.port}/`);
  for(const tag of['video','audio']){
   const outcome=await page.locator(tag).evaluate(async n=>{n.muted=true;n.load();try{await Promise.race([n.play(),new Promise((_,reject)=>setTimeout(()=>reject(Error('timeout')),5000))]);await new Promise(resolve=>setTimeout(resolve,300));const duration=n.duration;const playing=!n.paused&&n.currentTime>0;const seek=Math.max(0,duration-.8);n.currentTime=seek;await new Promise(resolve=>setTimeout(resolve,300));const sought=n.currentTime>=seek; n.pause();return {duration,finite:Number.isFinite(duration),playing,sought,error:n.error?.code??null};}catch(e){return {playing:false,error:e.name};}});
   results.push({browser:name,tag,...outcome});console.log(name,tag,JSON.stringify(outcome));
  }
  const captions=await page.locator('video').evaluate(n=>n.textTracks[0]?.cues?.[0]?.text??null);results.push({browser:name,tag:'captions',text:captions});console.log(name,'captions',captions);
  await page.screenshot({path:`${output}/${name}.png`});await writeFile(`${output}/${name}-responses.json`,JSON.stringify(responses,null,2));await browser.close();
 }
}finally{await new Promise(resolve=>server.close(resolve));}
await writeFile(`${output}/results.json`,JSON.stringify(results,null,2));
if(results.some(result=>result.tag==='captions'?result.text!=='日本語字幕の確認':!result.playing||!result.finite||!result.sought||result.error))process.exitCode=1;
