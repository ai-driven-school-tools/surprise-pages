import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {createRequire} from 'node:module';
import {mkdtemp, readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {JSDOM} from 'jsdom';
import sharp from 'sharp';
import {mediaDeliveryHarness} from '../checks/media-delivery-harness.mjs';
const require=createRequire(import.meta.url);
const temp=await mkdtemp(join(tmpdir(),'page-images-'));
await build({stdin:{contents:"export * from './src/lib/page-images/html';export * from './src/lib/page-images/transform';export * from './src/lib/html/check';",resolveDir:process.cwd()},bundle:true,platform:'node',format:'cjs',outfile:temp+'/api.cjs',plugins:[{name:'native',setup(b){b.onResolve({filter:/^sharp$/},()=>({path:require.resolve('sharp'),external:true}));b.onResolve({filter:/^@vercel\/functions$/},()=>({path:'cache',namespace:'memory'}));b.onLoad({filter:/.*/,namespace:'memory'},()=>({contents:'const store=new Map();export const getCache=()=>({get:async k=>store.get(k)??null,set:async(k,v)=>{store.set(k,v);},delete:async k=>{store.delete(k);},expireTag:async()=>{}});export const waitUntil=()=>{};export const dangerouslyDeleteByTag=async()=>{};'}));}}]});
const api=require(temp+'/api.cjs');
// 最初の組織（最初の組織・置き場の頭は空）と、2 つ目の組織
const ORG={id:'00000000-0000-4000-8000-000000000001',assetPrefix:''};
const OTHER={id:'00000000-0000-4000-8000-0000000000b2',assetPrefix:'o/00000000-0000-4000-8000-0000000000b2/'};
const source=`<!doctype html><html><head><base href="/public/deck/"><style>.cover{background-image:url('photo.png')}</style><script>const untouched='<img src="fake.png">';</script></head><body><h1>元の文章</h1><img class="portrait" width="1600" height="1000" src="photo.png" alt="写真"><img src="other.jpg" width="600"><img src="logo.svg"><img src="animated.gif"><img src="https://outside.test/photo.png"><picture><source media="(max-width:600px)" srcset="mobile.png 640w"><img src="large.png" srcset="large.png 1200w, huge.png 2400w" sizes="50vw"></picture></body></html>`;

test('delivery optimizes local photographs, backgrounds and responsive pictures without touching stored content',()=>{
 // 個人配布版は Next の画像最適化（/_next/image）を使わない。公開ページの画像も自前の変換（sp-image）を通る
 const html=api.withPageImages(source,{version:'a'.repeat(40)});
 const doc=new JSDOM(html).window.document;
 assert.equal(doc.querySelectorAll('img[data-sp-image]').length,3);
 assert.ok(!doc.querySelector('img').src.includes('/_next/image'));
 assert.match(doc.querySelector('img').src,/sp-image=1280/);
 assert.match(doc.querySelector('img').getAttribute('srcset'),/2560w/);
 assert.equal(doc.querySelectorAll('img')[1].loading??doc.querySelectorAll('img')[1].getAttribute('loading'),'lazy');
 assert.equal(doc.querySelector('picture img').getAttribute('sizes'),'50vw');
 assert.match(doc.querySelector('source').getAttribute('srcset'),/640w/);
 assert.equal(doc.querySelector('source').getAttribute('media'),'(max-width:600px)');
 assert.match(doc.querySelector('style').textContent,/sp-image=0/);
 assert.equal(doc.querySelector('script:not([src])').textContent,"const untouched='<img src=\"fake.png\">';");
 for(const raw of ['logo.svg','animated.gif','https://outside.test/photo.png'])assert.ok([...doc.images].some(i=>i.getAttribute('src')===raw));
 assert.equal(api.withPageImages(html),html,'delivery is idempotent');
 assert.ok(api.findHtmlIssues(html).some(issue=>issue.kind==='artifact'&&issue.detail==='imageDelivery'));
 assert.ok(source.includes('src="photo.png"'),'original input stays the original');
});
test('private and historical images never use the public optimizer',()=>{
 for(const prefix of ['/internal/deck/','/history/public/deck/@v/'+ 'b'.repeat(40)+'/','/public/deck/']) {
  const html=api.withPageImages(source.replace('/public/deck/',prefix),{publicImages:false});
  const doc=new JSDOM(html).window.document;
  assert.ok(!doc.querySelector('img').src.includes('/_next/image'));
  assert.match(doc.querySelector('img').src,/sp-image=1280/);
  assert.match(doc.querySelector('img').getAttribute('data-sp-image-blur'),/sp-image=32/);
 }
 assert.equal(api.withPageImages('<img src="image.png">'),'<img src="image.png">','no page base means no rewrite');
 const malformed='<base href="http://[invalid"><img src="photo.png">';
 assert.equal(api.withPageImages(malformed),malformed,'an invalid legacy base cannot break the whole page');
});
test('private transformation is bounded, preserves transparency, and invalidates when original bytes change',async()=>{
 let opens=0;
 const bytes=await sharp({create:{width:1600,height:1000,channels:4,background:{r:40,g:100,b:150,alpha:0.5}}}).png().toBuffer();
 const original={contentType:'image/png',size:bytes.length,etag:'"original"',uploadedAt:new Date(),open:async()=>{opens++;return new Response(bytes).body;}};
 const request=new Request('https://page.test/internal/private/photo.png?sp-image=640&sp-quality=80');
 const [first,second]=await Promise.all([api.transformPageImage(ORG,request,original),api.transformPageImage(ORG,request,original)]);
 assert.equal(opens,1,'simultaneous variants share the original fetch and conversion');
 assert.equal(first.etag,second.etag);
 const full=Buffer.from(await new Response(await first.open(null)).arrayBuffer());
 const meta=await sharp(full).metadata();assert.equal(meta.width,640);assert.equal(meta.hasAlpha,true);assert.ok(full.length<bytes.length);
 const range=Buffer.from(await new Response(await first.open({start:0,end:5})).arrayBuffer());assert.deepEqual(range,full.subarray(0,6));
 const changed=await api.transformPageImage(ORG,request,{...original,etag:'"updated"'});assert.notEqual(changed.etag,first.etag);assert.equal(opens,2);
 const invalid=await api.transformPageImage(ORG,new Request('https://page.test/internal/private/photo.png?sp-image=100000'),original);assert.equal(invalid.status,400);
 assert.equal(await api.transformPageImage(ORG,request,{...original,contentType:'image/gif'}).then(x=>x.contentType),'image/gif');
});
test('real delivery routes authorize original, resized and blur images before caches, ranges and conditionals',async()=>{
 const {state,routes}=await mediaDeliveryHarness();
 const bytes=await sharp({create:{width:1600,height:1000,channels:3,background:'#407080'}}).png().toBuffer();
 const slug=['deck','photo.png'];
 state.files.set('internal/deck/photo.png',{bytes,type:'image/png',etag:'"private-photo"'});
 state.files.set('public/deck/photo.png',{bytes,type:'image/png',etag:'"public-photo"'});
 for(const width of [32,640]) {
  state.pageSlug='internal/deck';state.visibility='restricted';state.allowed=true;state.member=true;
  const url=`https://page.test/internal/deck/photo.png?sp-image=${width}&sp-quality=80`;
  const result=await routes.internalGET(new Request(url),{params:Promise.resolve({slug})});
  assert.equal(result.status,200);assert.match(result.headers.get('cache-control'),/private, no-store/);
  assert.equal((await sharp(Buffer.from(await result.arrayBuffer())).metadata()).width,width);
  state.allowed=false;state.calls=[];
  const denied=await routes.internalGET(new Request(url,{headers:{'if-none-match':'*'}}),{params:Promise.resolve({slug})});
  assert.equal(denied.status,403);assert.ok(!state.calls.some(c=>c.method==='get'||c.method==='head'));
  state.allowed=true;state.member=false;
  assert.equal((await routes.internalGET(new Request(url),{params:Promise.resolve({slug})})).status,302);
 }
});
test('the platform image optimizer is not configured (every image goes through the gated delivery)',async()=>{
 const config=await readFile('next.config.ts','utf8');
 assert.ok(!config.includes('page-image-source'));
 assert.ok(!/\bimages:\s*\{/.test(config));
});

test('animated PNG keeps every original frame even when decoder metadata omits pages',async()=>{
 const crc=bytes=>{let value=0xffffffff;for(const byte of bytes){value^=byte;for(let bit=0;bit<8;bit++)value=(value>>>1)^((value&1)?0xedb88320:0);}return(value^0xffffffff)>>>0;};
 const chunk=(type,bytes)=>{const name=Buffer.from(type),length=Buffer.alloc(4),checksum=Buffer.alloc(4);length.writeUInt32BE(bytes.length);checksum.writeUInt32BE(crc(Buffer.concat([name,bytes])));return Buffer.concat([length,name,bytes,checksum]);};
 const chunks=bytes=>{const result=[];for(let at=8;at<bytes.length;){const size=bytes.readUInt32BE(at);result.push([bytes.toString('ascii',at+4,at+8),bytes.subarray(at+8,at+8+size)]);at+=size+12;}return result;};
 const red=chunks(await sharp({create:{width:10,height:10,channels:4,background:'red'}}).png().toBuffer());
 const blue=chunks(await sharp({create:{width:10,height:10,channels:4,background:'blue'}}).png().toBuffer());
 const animation=Buffer.alloc(8);animation.writeUInt32BE(2);
 const frame=sequence=>{const bytes=Buffer.alloc(26);bytes.writeUInt32BE(sequence);bytes.writeUInt32BE(10,4);bytes.writeUInt32BE(10,8);bytes.writeUInt16BE(1,20);bytes.writeUInt16BE(10,22);return chunk('fcTL',bytes);};
 const sequence=Buffer.alloc(4);sequence.writeUInt32BE(2);
 const input=Buffer.concat([Buffer.from('89504e470d0a1a0a','hex'),chunk('IHDR',red.find(([type])=>type==='IHDR')[1]),chunk('acTL',animation),frame(0),...red.filter(([type])=>type==='IDAT').map(([type,data])=>chunk(type,data)),frame(1),chunk('fdAT',Buffer.concat([sequence,...blue.filter(([type])=>type==='IDAT').map(([,data])=>data)])),chunk('IEND',Buffer.alloc(0))]);
 const original={contentType:'image/png',size:input.length,etag:'"apng"',uploadedAt:new Date(),open:async()=>new Response(input).body};
 for(const width of [0,32,640]){
  const result=await api.transformPageImage(ORG,new Request('https://page.test/internal/animated.png?sp-image='+width),original);
  if(width===32){assert.equal(result.status,204);assert.equal(result.body,null);}
  else {assert.equal(result.contentType,'image/png');assert.deepEqual(Buffer.from(await new Response(await result.open(null)).arrayBuffer()),input);}
 }
});


test('one original download yields every width, and overload waits in line before falling back',async()=>{
 const bytes=await sharp({create:{width:1600,height:1000,channels:3,background:'#407080'}}).png().toBuffer();
 let opens=0;
 const original={contentType:'image/png',size:bytes.length,etag:'"family"',uploadedAt:new Date(),open:async()=>{opens++;return new Response(bytes).body;}};
 const widths=[32,320,640,960,1280,0];
 const results=await Promise.all(widths.map(width=>api.transformPageImage(ORG,new Request(`https://page.test/internal/family/photo.png?sp-image=${width}&sp-quality=${width===32?30:80}`),original)));
 assert.equal(opens,1,'all widths come from a single original download and decode');
 for(const [at,result] of results.entries()){
  const meta=await sharp(Buffer.from(await new Response(await result.open(null)).arrayBuffer())).metadata();
  assert.equal(meta.width,widths[at]||1600);assert.equal(result.contentType,'image/webp');
 }
 assert.equal(opens,1,'later widths never reopen the original');
 // Four conversions are busy and the waiting line is full: only then does a request fall back.
 let release;const held=new Promise(resolve=>{release=resolve;});
 const busy={contentType:'image/png',size:bytes.length,etag:'"busy-image"',uploadedAt:new Date(),open:async()=>{await held;return new Response(bytes).body;}};
 const jobs=Array.from({length:36},(_,n)=>api.transformPageImage(ORG,new Request(`https://page.test/internal/busy-${n}.png?sp-image=640`),busy));
 await new Promise(resolve=>setTimeout(resolve,20));
 try {
  const preview=await api.transformPageImage(ORG,new Request('https://page.test/internal/busy-preview.png?sp-image=32&sp-quality=30'),busy);
  assert.equal(preview.status,204,'an overloaded preview is skipped, never a second full download');
  assert.equal(await api.transformPageImage(ORG,new Request('https://page.test/internal/busy-overflow.png?sp-image=640'),busy),busy,'an overloaded display request serves the original itself');
 } finally {release();}
 const settled=await Promise.all(jobs);
 assert.ok(settled.every(result=>result.contentType==='image/webp'),'queued conversions complete once a slot frees up');
});
test('the same path in another organization never hits the first organization\'s cached variant or source record',async()=>{
 let opens=0;
 const bytes=await sharp({create:{width:900,height:600,channels:3,background:'#336699'}}).png().toBuffer();
 const original={contentType:'image/png',size:bytes.length,etag:'"shared-path"',uploadedAt:new Date(),open:async()=>{opens++;return new Response(bytes).body;}};
 const request=new Request('https://page.test/internal/guide/intro/photo.png?sp-image=640&sp-quality=80');
 // 最初の組織で変換して控える
 const ours=await api.transformPageImage(ORG,request,original);assert.equal(opens,1);
 // 同じ道筋・同じ目印でも、別の組織では控えに当たらない（下見は空、変換は自分の原画像から作り直す）
 assert.deepEqual(await api.peekPageImage(OTHER,request),{variant:null,source:null});
 const theirs=await api.transformPageImage(OTHER,request,original);assert.equal(opens,2,'another organization converts from its own original');
 assert.notEqual(theirs.etag,ours.etag);
 // 控えの名前は組織の置き場の頭から始まる（最初の組織 は頭が空で、今までと同じ）
 assert.equal(api.imagePlaceOf(ORG,request),'/internal/guide/intro/photo.png');
 assert.equal(api.imagePlaceOf(OTHER,request),'o/00000000-0000-4000-8000-0000000000b2//internal/guide/intro/photo.png');
});
test('cached source metadata skips storage lookups, falls on upload, and heals a stale record',async()=>{
 const {state,routes}=await mediaDeliveryHarness({extra:"export {expirePageAssets} from './src/lib/pages/cache';"});
 const bytes=await sharp({create:{width:1600,height:1000,channels:3,background:'#704080'}}).png().toBuffer();
 const slug=['meta','photo.png'];
 state.pageSlug='internal/meta';state.visibility='internal';state.allowed=true;state.member=true;
 state.files.set('internal/meta/photo.png',{bytes,type:'image/png',etag:'"meta-v1"'});
 const ask=(width)=>routes.internalGET(new Request(`https://page.test/internal/meta/photo.png?sp-image=${width}&sp-quality=${width===32?30:80}`),{params:Promise.resolve({slug})});
 state.calls=[];
 const first=await ask(640);assert.equal(first.status,200);assert.equal(first.headers.get('content-type'),'image/webp');
 assert.equal(state.calls.filter(c=>c.method==='head').length,1);assert.equal(state.calls.filter(c=>c.method==='get').length,1);
 state.calls=[];
 for(const width of [320,32,1280]){const result=await ask(width);assert.equal(result.status,200);await result.arrayBuffer();}
 assert.ok(state.calls.some(c=>c.method==='gate'),'every cached delivery still passes the view gate');
 assert.equal(state.calls.filter(c=>c.method==='head'||c.method==='get').length,0,'cached widths never touch storage again');
 state.calls=[];state.allowed=false;
 const denied=await ask(640);assert.equal(denied.status,403);
 assert.equal(state.calls.filter(c=>c.method==='head'||c.method==='get').length,0);
 state.allowed=true;
 // The upload route overwrote the file and dropped the metadata by tag.
 state.files.set('internal/meta/photo.png',{bytes:await sharp({create:{width:800,height:500,channels:3,background:'#204060'}}).png().toBuffer(),type:'image/png',etag:'"meta-v2"'});
 await routes.expirePageAssets({id:'00000000-0000-4000-8000-000000000001',assetPrefix:''},'internal/meta');
 state.calls=[];
 const after=await ask(640);assert.equal(after.status,200);
 assert.equal((await sharp(Buffer.from(await after.arrayBuffer())).metadata().then(m=>m.width)),640);
 assert.equal(state.calls.filter(c=>c.method==='head').length,1,'a dropped record asks storage again');
 // A record that was not dropped cannot open stale bytes: the old mark fails `If-Match`, the record is replaced and
 // the new file is converted. (A width already converted from the old file stays until the record drops or expires.)
 state.files.set('internal/meta/photo.png',{bytes:await sharp({create:{width:500,height:300,channels:3,background:'#604020'}}).png().toBuffer(),type:'image/png',etag:'"meta-v3"'});
 state.calls=[];
 const healed=await routes.internalGET(new Request('https://page.test/internal/meta/photo.png?sp-image=640&sp-quality=30'),{params:Promise.resolve({slug})});
 assert.equal(healed.status,200);assert.equal(healed.headers.get('content-type'),'image/webp');
 assert.equal((await sharp(Buffer.from(await healed.arrayBuffer())).metadata().then(m=>m.width)),500,'the new bytes are served, never a variant of the overwritten file');
 assert.equal(state.calls.filter(c=>c.method==='head').length,1,'the stale record is replaced by exactly one new lookup');
 assert.equal(state.calls.filter(c=>c.method==='get').length,2,'the failed open and the successful one');
});
