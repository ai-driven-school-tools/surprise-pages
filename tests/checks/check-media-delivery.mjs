import { build } from 'esbuild';
import { root, dir } from './paths.mjs';

let failures=0;
function ok(label,value,expected=true){const pass=JSON.stringify(value)===JSON.stringify(expected);console.log(`${pass?'OK  ':'NG  '} ${label}`);if(!pass)failures++;}
await build({entryPoints:[`${root}/src/lib/pages/cache.ts`],outfile:`${dir}/media-response.mjs`,bundle:true,format:'esm',platform:'node',external:['node:*']});
const {assetResponse}=await import(`${dir}/media-response.mjs`);
const bytes=new TextEncoder().encode('0123456789');
function fixture({size=bytes.length,etag='"media-one"',fail=false}={}){
 const opens=[];
 return {opens,asset:{size,etag,contentType:'video/mp4',uploadedAt:new Date('2026-09-14T00:00:00.000Z'),async open(range,signal){opens.push({range,signal});if(fail)throw new Error('changed upstream');return new ReadableStream({start(c){c.enqueue(range?bytes.slice(range.start,range.end+1):bytes);c.close();}});}}};
}
const config={cacheControl:'private, no-store, max-age=0',pageId:null};
const request=(headers={},method='GET')=>new Request('https://example.test/internal/deck/movie.mp4',{method,headers});
const cases=[
 ['全体取得の長さが分かる',{},200,'0123456789',null],
 ['Safariの最初の2バイトだけを返す',{range:'bytes=0-1'},206,'01','bytes 0-1/10'],
 ['途中から末尾まで返す',{range:'bytes=7-'},206,'789','bytes 7-9/10'],
 ['末尾から指定したバイト数を返す',{range:'bytes=-3'},206,'789','bytes 7-9/10'],
 ['大きすぎる末尾を実際の末尾へ制限',{range:'bytes=8-999999999999999999999999'},206,'89','bytes 8-9/10'],
 ['大きな末尾指定は全体分の部分応答',{range:'bytes=-999999999999999999999999'},206,'0123456789','bytes 0-9/10'],
 ['範囲外はサイズ付きで416',{range:'bytes=10-'},416,'','bytes */10'],
 ['逆向きの範囲は416',{range:'bytes=8-2'},416,'','bytes */10'],
 ['長さゼロの末尾指定は416',{range:'bytes=-0'},416,'','bytes */10'],
 ['未知の範囲単位は全体取得へ戻す',{range:'items=0-1'},200,'0123456789',null],
 ['複数範囲は全体応答として明示する',{range:'bytes=0-1,5-6'},200,'0123456789',null],
 ['同じ素材の続きだけを返す',{range:'bytes=2-3','if-range':'"media-one"'},206,'23','bytes 2-3/10'],
 ['更新済みの素材は全体から取り直す',{range:'bytes=2-3','if-range':'"old-media"'},200,'0123456789',null],
 ['弱い目印で部分ファイルをつなげない',{range:'bytes=2-3','if-range':'W/"media-one"'},200,'0123456789',null],
 ['日付だけでは同秒更新を区別できないので全体を返す',{range:'bytes=2-3','if-range':'Mon, 14 Sep 2026 00:00:00 GMT'},200,'0123456789',null],
];
for(const [label,headers,status,body,range]of cases){const f=fixture();try{const r=await assetResponse(request(headers),f.asset,config);ok(label,[r.status,await r.text(),r.headers.get('content-range')],[status,body,range]);ok(`${label}:長さと私有範囲を守る`,r.headers.get('content-length')===String(body.length)&&r.headers.get('cache-control').includes('private'));if(status===416)ok(`${label}:保管庫の本文を取り寄せない`,f.opens.length,0);}catch{ok(label,false);}}
const head=fixture();const headResponse=await assetResponse(request({range:'bytes=0-1'},'HEAD'),head.asset,config);ok('HEADは範囲を無視し本文を開かず長さだけ返す',[headResponse.status,headResponse.headers.get('content-length'),await headResponse.text(),head.opens.length],[200,'10','',0]);
const cached=fixture();const cachedResponse=await assetResponse(request({'if-none-match':'W/"media-one"',range:'bytes=900-'}),cached.asset,config);ok('条件付き取得の304を範囲判定より先に行う',[cachedResponse.status,cached.opens.length],[304,0]);
const empty=fixture({size:0});const emptyResponse=await assetResponse(request({range:'bytes=0-1'}),empty.asset,config);ok('空ファイルの範囲取得は416',[emptyResponse.status,emptyResponse.headers.get('content-range'),empty.opens.length],[416,'bytes */0',0]);
const stale=fixture({fail:true});const staleResponse=await assetResponse(request({range:'bytes=0-1'}),stale.asset,config);ok('取得中に変わった本文を古い長さの206で返さない',staleResponse.status,502);
const publicResponse=await assetResponse(request({range:'bytes=0-1'}),fixture().asset,{cacheControl:'public, max-age=60, s-maxage=60',pageId:'ABC'});ok('公開の範囲応答にも既存の配信札を付ける',[publicResponse.headers.get('vercel-cache-tag'),publicResponse.headers.get('accept-ranges'),publicResponse.headers.get('etag')],['page-abc','bytes','"media-one"']);
let pulled=0,cancelled=false;
const lazy={...fixture().asset,size:100*1024*1024,async open(){return new ReadableStream({pull(c){pulled++;c.enqueue(new Uint8Array(1024));},cancel(){cancelled=true;}},{highWaterMark:0});}};
const streaming=await assetResponse(request(),lazy,config);ok('100MBの本文を応答前に読み込まない',pulled,0);const reader=streaming.body.getReader();await reader.read();await reader.cancel();ok('閲覧を中断すると上流の読取りも止まる',cancelled&&pulled<=2);
if(failures)process.exit(1);
