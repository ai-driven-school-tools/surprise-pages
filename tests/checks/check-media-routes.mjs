import { mediaDeliveryHarness } from './media-delivery-harness.mjs';
let failures=0;
function ok(label,value,expected=true){const pass=JSON.stringify(value)===JSON.stringify(expected);console.log(`${pass?'OK  ':'NG  '} ${label}`);if(!pass)failures++;}
const {state,routes}=await mediaDeliveryHarness();
const bytes=new TextEncoder().encode('0123456789'),version='b'.repeat(40);
for(const prefix of ['internal','public']){
 state.files.set(`${prefix}/deck/movie.mp4`,{bytes,etag:'"current"',type:'video/mp4'});
 state.files.set(`${prefix}/deck/@archive/${version}/movie.mp4`,{bytes:new TextEncoder().encode('old-content'),etag:'"archived"',type:'video/mp4'});
}
const invoke=async(kind,method='GET',past=false,headers={range:'bytes=0-1'})=>{
 const slug=past?['deck','@v',version,'movie.mp4']:['deck','movie.mp4'];
 const response=await routes[kind+method](new Request(`https://example.test/${kind==='internal'?'i':'p'}/${slug.join('/')}`,{method,headers}),{params:Promise.resolve({slug})});
 if(kind==='public'&&past&&response.status===302){
  ok('公開の過去素材は認証付きの入口へ送る',new URL(response.headers.get('location')).pathname,`/history/public/${slug.join('/')}`);
  return routes['history'+method](new Request(response.headers.get('location'),{method,headers}),{params:Promise.resolve({visibility:'public',slug})});
 }
 return response;
};
for(const kind of ['internal','public'])for(const past of [false,true]){
 state.pageSlug=`${kind}/deck`;state.visibility=kind==='internal'?'restricted':'public';state.member=true;state.allowed=true;state.calls=[];
 const response=await invoke(kind,'GET',past);
 ok(`${kind}/${past?'過去版':'現在'}:同じ関門を通って2バイトだけ返す`,[response.status,await response.text()],[206,past?'ol':'01']);
 const methods=state.calls.map(call=>call.method);ok(`${kind}/${past?'過去版':'現在'}:本文より先に閲覧権限を確認`,methods.indexOf('gate')<methods.indexOf('head')&&methods.indexOf('head')<methods.indexOf('get'));
 ok(`${kind}/${past?'過去版':'現在'}:素材の実体の目印を使う`,response.headers.get('etag'),past?'"archived"':'"current"');
 state.calls=[];const head=await invoke(kind,'HEAD',past);ok(`${kind}/${past?'過去版':'現在'}:HEADは本文を開かない`,[head.status,await head.text(),head.headers.get('content-length'),state.calls.some(call=>call.method==='get')],[200,'',past?'11':'10',false]);
 state.allowed=false;state.calls=[];const denied=await invoke(kind,'GET',past,{'if-none-match':'*',range:'bytes=0-1'});ok(`${kind}/${past?'過去版':'現在'}:条件付き取得でも権限拒否を優先`,[denied.status,state.calls.some(call=>call.method==='head'||call.method==='get')],[kind==='internal'?403:404,false]);
}
state.allowed=true;state.member=false;state.calls=[];const signedOut=await invoke('internal','HEAD');ok('未ログインのHEADで社内素材のサイズを漏らさない',[signedOut.status,state.calls.some(call=>call.method==='head')],[302,false]);
state.member=true;state.pageSlug='internal/deck';state.visibility='public';state.calls=[];const switched=await invoke('public');ok('公開に切り替えた素材も元の非公開の棚から読む',[switched.status,state.calls.find(call=>call.method==='get')?.key,state.calls.find(call=>call.method==='get')?.access],[206,'internal/deck/movie.mp4','private']);
ok('切り替え可能な素材の配信寿命を延ばさない',switched.headers.get('cache-control').includes('s-maxage=60'));
state.files.set('internal/deck/captions.vtt',{bytes:new TextEncoder().encode('WEBVTT\n\n00:00:00.000 --> 00:00:03.000\n日本語字幕\n'),etag:'"captions"',type:'text/vtt; charset=utf-8'});
const captionRequest=new Request('https://example.test/internal/deck/captions.vtt');
const captionContext={params:Promise.resolve({slug:['deck','captions.vtt']})};
state.allowed=true;const captions=await routes.internalGET(captionRequest,captionContext);ok('字幕も通常の素材経路から文字化けせず配信する',captions.headers.get('content-type')==='text/vtt; charset=utf-8'&&(await captions.text()).includes('日本語字幕'));
state.allowed=false;state.calls=[];const deniedCaptions=await routes.internalGET(captionRequest,captionContext);ok('字幕だけが権限の外から読める抜け道を作らない',[deniedCaptions.status,state.calls.some(call=>call.method==='head')],[403,false]);
if(failures)process.exit(1);
