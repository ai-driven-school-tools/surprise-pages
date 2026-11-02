import { build } from 'esbuild';
import { root, dir } from './paths.mjs';
let failures=0;
function ok(label,value,expected=true){const pass=JSON.stringify(value)===JSON.stringify(expected);console.log(`${pass?'OK  ':'NG  '} ${label}`);if(!pass)failures++;}
globalThis.__mediaTest={files:new Map(),calls:[],mode:'normal',cancelled:0};
const stub=`
export class BlobNotFoundError extends Error {}
export async function head(key){const s=globalThis.__mediaTest;s.calls.push({method:'head',key});if(s.mode==='head-error')throw Error('unavailable');const f=s.files.get(key);if(!f)throw new BlobNotFoundError();return {size:f.bytes.length,contentType:'video/mp4',etag:f.etag,uploadedAt:new Date('2026-09-14T00:00:00Z')};}
export async function get(key,options){const s=globalThis.__mediaTest;s.calls.push({method:'get',key,options});const f=s.files.get(key);if(!f)return null;let bytes=f.bytes;const headers=new Headers({etag:s.mode==='changed'?'"changed"':f.etag});if(options.headers.Range&&s.mode!=='ignored-range'){const match=/bytes=(\\d+)-(\\d+)/.exec(options.headers.Range);const start=Number(match[1]),end=Number(match[2]);bytes=bytes.slice(start,end+1);headers.set('content-range','bytes '+start+'-'+end+'/'+(f.bytes.length+(s.mode==='wrong-size'?1:0)));}headers.set('content-length',String(bytes.length));const stream=new ReadableStream({start(c){c.enqueue(bytes);},cancel(){s.cancelled++;},pull(c){c.close();}});return {statusCode:200,stream,headers,blob:{size:bytes.length,etag:f.etag}};}
export async function list(){return {blobs:[],hasMore:false};}
`;
await build({stdin:{contents:"export {readAsset,readArchivedAsset,assetContentType} from './src/lib/pages/assets';export {assetResponse} from './src/lib/pages/cache';",resolveDir:root},outfile:`${dir}/media-storage.mjs`,bundle:true,format:'esm',platform:'node',external:['node:*'],plugins:[{name:'blob-contract',setup(b){b.onResolve({filter:/^@vercel\/blob$/},()=>({path:'blob',namespace:'media-test'}));b.onLoad({filter:/.*/,namespace:'media-test'},()=>({contents:stub,loader:'js'}));}}]});
const {readAsset,readArchivedAsset,assetResponse,assetContentType}=await import(`${dir}/media-storage.mjs`);
ok('日本語字幕をUTF-8のWebVTTとして配信する',assetContentType('captions.vtt'),'text/vtt; charset=utf-8');
const ORG={id:'00000000-0000-4000-8000-000000000001',assetPrefix:''};
const state=globalThis.__mediaTest,bytes=new TextEncoder().encode('0123456789');
const config={cacheControl:'private, no-store',pageId:null};
const req=()=>new Request('https://example.test/internal/deck/movie.mp4',{headers:{range:'bytes=0-1'}});
state.files.set('internal/deck/movie.mp4',{bytes,etag:'"media-one"'});
const asset=await readAsset(ORG,'internal',['deck','movie.mp4']);
ok('読み取り準備はメタデータだけで本文を開かない',state.calls.map(call=>call.method),['head']);
const response=await assetResponse(req(),asset,config);
ok('SDKが状態を200へ正規化しても実際の範囲で206を返す',[response.status,await response.text(),response.headers.get('content-range')],[206,'01','bytes 0-1/10']);
const called=state.calls.at(-1);
ok('保管庫には範囲と素材の強い目印だけを渡す',[called.options.access,called.options.useCache,called.options.headers.Range,called.options.headers['If-Match'],called.options.headers['Accept-Encoding']],['private',false,'bytes=0-1','"media-one"','identity']);
ok('リクエスト中断の信号を保管庫へ渡す',called.options.abortSignal instanceof AbortSignal);
for(const mode of ['ignored-range','changed','wrong-size']){state.mode=mode;const before=state.cancelled;const rejected=await assetResponse(req(),asset,config);ok(`${mode}:違う本文を206として配らない`,rejected.status,502);ok(`${mode}:使わない上流ストリームを中止する`,state.cancelled,before+1);}
state.mode='normal';state.calls=[];
const missing=await readAsset(ORG,'internal',['deck','missing.mp4']);ok('保管庫で見つからない素材だけを未発見とする',missing,null);
state.files.set('internal/deck/@archive/abcdef0/movie.mp4',{bytes:new TextEncoder().encode('past-file'),etag:'"past"'});
state.calls=[];const archived=await readArchivedAsset(ORG,'internal',['deck'],'abcdef0'+'0'.repeat(33),['movie.mp4']);
const pastResponse=await assetResponse(req(),archived,config);
ok('40桁の過去版から従来の7桁凍結へ順に探す',state.calls.filter(call=>call.method==='head').map(call=>call.key),['internal/deck/@archive/abcdef0'+'0'.repeat(33)+'/movie.mp4','internal/deck/@archive/abcdef0/movie.mp4']);
ok('過去版の範囲も現在の素材ではなく凍結から読む',[await pastResponse.text(),pastResponse.headers.get('etag'),state.calls.at(-1).key],['pa','"past"','internal/deck/@archive/abcdef0/movie.mp4']);
state.calls=[];const fallback=await readArchivedAsset(ORG,'internal',['deck'],'1234567'+'0'.repeat(33),['movie.mp4']);ok('凍結前の素材は既存どおり現在の素材で代替する',fallback.etag,'"media-one"');
state.mode='head-error';state.calls=[];let failed=false;try{await readArchivedAsset(ORG,'internal',['deck'],'abcdef0'+'0'.repeat(33),['movie.mp4']);}catch{failed=true;}
ok('一時障害を未発見と誤認して現在の素材へ置き換えない',failed&&state.calls.length===1);
state.mode='normal';state.calls=[];await readAsset(ORG,'internal',['..','movie.mp4']);ok('不正な場所では保管庫にも問い合わせない',state.calls.length,0);
// 組織の置き場の頭: 新しい組織の素材は o/<組織の目印>/ の下だけを引く。最初の組織（頭は空）の鍵は今までと同じ
const OTHER={id:'00000000-0000-4000-8000-0000000000b2',assetPrefix:'o/00000000-0000-4000-8000-0000000000b2/'};
state.calls=[];const otherMissing=await readAsset(OTHER,'internal',['deck','movie.mp4']);
ok('別の組織は同じ呼び名でも自分の置き場の頭の下だけを引く（最初の組織 の素材は返らない）',[otherMissing,state.calls.map(call=>call.key)],[null,['o/00000000-0000-4000-8000-0000000000b2/internal/deck/movie.mp4']]);
delete globalThis.__mediaTest;
if(failures)process.exit(1);
