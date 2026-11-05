import {installDeckYouTube} from "./media/youtube";
/** Playback state is transient. The authored video source and its native controls
 * remain normal HTML; no second media document or saved playback state exists. */
import {DECK_VIDEO_SUSPENDED_SOURCE,releaseDeckVideo,activateDeckVideo} from "./media/video-source";
export {releaseDeckVideo,activateDeckVideo} from "./media/video-source";
import {deckPlayMode} from "./media/play";
const READY="data-deck-playback-ready",MEDIA_START_READY="data-deck-media-start-ready";
export function installDeckPlayback(doc:Document):void {
  installDeckYouTube(doc);
  const view=doc.defaultView;if(!view||!doc.body.hasAttribute("data-deck"))return;
  // 動画・音声の始まりは別の印で 1 度だけ（資料に貼った古い実行部が先に再生の準備を済ませていても、道具箱の新しい部品が足す）
  if(!doc.body.hasAttribute(MEDIA_START_READY)){doc.body.setAttribute(MEDIA_START_READY,"");installDeckMediaStart(doc,view);}
  if(doc.body.hasAttribute(READY))return;
  doc.body.setAttribute(READY,"");
  const states=new Map<HTMLVideoElement,{time:number;released:boolean;startOnClick:boolean;handledKey:string|null}>();
  const videos=()=>[...doc.querySelectorAll<HTMLVideoElement>("section[data-deck-slide] video")];
  const allowed=(video:HTMLVideoElement)=>{
    if(doc.pictureInPictureElement===video)return true;
    const r=video.getBoundingClientRect();
    return !doc.hidden&&video.isConnected&&r.width>0&&r.height>0&&r.bottom>0&&r.right>0&&r.top<view.innerHeight&&r.left<view.innerWidth&&
      (doc.documentElement.getAttribute("data-deck-mode")!=="present"||video.closest("[data-deck-current]")!==null);
  };
  function release(video:HTMLVideoElement){
    const state=states.get(video);if(!state||state.released)return;
    if(video.readyState>0)state.time=video.ended?0:Number.isFinite(video.currentTime)?video.currentTime:0;
    state.released=true;state.startOnClick=false;state.handledKey=null;releaseDeckVideo(video);
  }
  function check(){for(const video of states.keys())if(!allowed(video))release(video);}
  doc.deckPauseVideos=()=>{for(const video of states.keys())release(video);};
  const observer=typeof view.IntersectionObserver==="function"?new view.IntersectionObserver(check,{threshold:0}):null;
  function refresh(){
    for(const video of videos())if(!states.has(video)){states.set(video,{time:0,released:false,startOnClick:false,handledKey:null});observer?.observe(video);}
    for(const video of states.keys())if(!video.isConnected){release(video);observer?.unobserve(video);states.delete(video);}
    check();
  }
  const suspended=(video:HTMLVideoElement)=>video.hasAttribute(DECK_VIDEO_SUSPENDED_SOURCE)||video.querySelector(`source[${DECK_VIDEO_SUSPENDED_SOURCE}]`)!==null;
  const prepare=(video:HTMLVideoElement)=>{activateDeckVideo(video);const state=states.get(video);if(state)state.released=false;return state;};
  doc.addEventListener("pointerdown",event=>{
    const video=event.target;if(!(video instanceof view.HTMLVideoElement)||!video.controls||!allowed(video)||event.button!==0)return;
    const cold=suspended(video),state=prepare(video);if(state)state.startOnClick=cold;
  },true);
  // Native play controls are disabled while src is detached. Consume that first
  // trusted click ourselves; subsequent clicks use the browser's own controls.
  doc.addEventListener("click",event=>{
    const video=event.target;if(!(video instanceof view.HTMLVideoElement)||!video.controls||!allowed(video))return;
    const state=states.get(video);if(!state?.startOnClick)return;
    state.startOnClick=false;event.preventDefault();event.stopImmediatePropagation();void video.play().catch(()=>{});
  },true);
  doc.addEventListener("keydown",event=>{
    const video=event.target;if(!(video instanceof view.HTMLVideoElement)||!video.controls||!allowed(video))return;
    const state=states.get(video);if(!state)return;
    if(state.handledKey===event.key){event.preventDefault();event.stopImmediatePropagation();return;}
    if(![" ","Enter","ArrowLeft","ArrowRight","ArrowUp","ArrowDown","Home","End"].includes(event.key))return;
    const cold=suspended(video);prepare(video);
    if(cold&&(event.key===" "||event.key==="Enter")){state.handledKey=event.key;event.preventDefault();event.stopImmediatePropagation();void video.play().catch(()=>{});}
  },true);
  doc.addEventListener("keyup",event=>{
    const video=event.target;if(!(video instanceof view.HTMLVideoElement))return;
    const state=states.get(video);if(state?.handledKey===event.key){state.handledKey=null;event.preventDefault();event.stopImmediatePropagation();}
  },true);
  doc.addEventListener("play",event=>{
    const video=event.target;if(!(video instanceof view.HTMLVideoElement))return;
    if(!states.has(video))refresh();
    const state=states.get(video);if(!state)return;
    activateDeckVideo(video);state.released=false;state.startOnClick=false;
    if(!allowed(video)){release(video);return;}
    for(const other of states.keys())if(other!==video)release(other);
  },true);
  doc.addEventListener("loadedmetadata",event=>{
    const video=event.target;if(!(video instanceof view.HTMLVideoElement))return;
    const state=states.get(video);if(!state||state.time<=0)return;
    if(Number.isFinite(video.duration)&&state.time<video.duration)video.currentTime=state.time;
    state.time=0;
  },true);
  doc.addEventListener("visibilitychange",check);
  doc.addEventListener("scroll",check,{passive:true,capture:true});
  view.addEventListener("pagehide",()=>{for(const video of states.keys())release(video);});
  view.addEventListener("beforeprint",()=>{for(const video of states.keys())release(video);});
  new view.MutationObserver(refresh).observe(doc.body,{subtree:true,childList:true,attributes:true,attributeFilter:["data-deck-current"]});
  new view.MutationObserver(check).observe(doc.documentElement,{attributes:true,attributeFilter:["data-deck-mode"]});
  refresh();
}

/**
 * 発表の 1 枚表示で、枚に着いたら始める・「次へ」で始める動画と音声（src/lib/deck/media/play.ts）。
 * - 「スライドに着いたら」のもの（音声の既定）は、枚に着いた時点で頭から始める。
 * - 「クリックで」のものは、着いて最初の「次へ」（→・↓・Space・Enter・Page Down）で枚を進めずに 1 本ずつ文書の順に始め、全部始めたあとの「次へ」で枚を進める。
 * - 枚を離れたら止めて頭に戻す。音声の再生バーは発表の間だけ隠す（保存する本文には何も書かない・見た目の指定は画面の中だけ）。
 * 発表者画面の枠の中（入れ子の窓）では動かさない。観客用の窓と手元の写しは発表者画面が動かす（src/widget/deck/present/media.ts）。
 * 読む表示（縦並び）では何もしない。再生の状態は保存しない。
 */
function installDeckMediaStart(doc:Document,view:Window&typeof globalThis):void{
  if(view.top!==view.self)return;
  const presenting=()=>doc.documentElement.getAttribute("data-deck-mode")==="present";
  let shown:Element|null=null,waiting:HTMLMediaElement[]=[];
  const started=new Set<HTMLMediaElement>();
  function start(media:HTMLMediaElement){
    if(media instanceof view.HTMLVideoElement)activateDeckVideo(media);
    media.muted=media.defaultMuted;
    try{media.currentTime=0;}catch{/* 読み込み前は頭から */}
    started.add(media);void media.play().catch(()=>{});
  }
  function stop(media:HTMLMediaElement){media.pause();try{media.currentTime=0;}catch{/* 読み込み前 */}}
  function sync(){
    const hide=presenting();
    for(const audio of doc.querySelectorAll<HTMLAudioElement>("section[data-deck-slide] audio"))if(audio.style.visibility!==(hide?"hidden":""))audio.style.visibility=hide?"hidden":"";
    const here=hide?doc.querySelector("[data-deck-current]"):null;
    if(here===shown)return;
    for(const media of started)stop(media);
    started.clear();waiting=[];shown=here;
    if(!here)return;
    for(const media of here.querySelectorAll<HTMLMediaElement>("audio,video")){const mode=deckPlayMode(media);if(mode==="arrive")start(media);else if(mode==="click")waiting.push(media);}
  }
  // 実行部の「次へ」（文書で受ける）より先に、窓で受ける
  view.addEventListener("keydown",event=>{
    if(!presenting()||!waiting.length||event.metaKey||event.ctrlKey||event.altKey||event.isComposing)return;
    if(!["ArrowRight","ArrowDown","PageDown","Enter"," "].includes(event.key))return;
    // 実行部の「次へ」と同じ見分け方（字を打つ所と再生バーは除き、押せる部品の上の Enter・Space はその部品に任せる）
    if(event.target instanceof view.Element&&(event.target.closest("input,textarea,select,[contenteditable],video,audio")||(event.key==="Enter"||event.key===" ")&&event.target.closest("button,a[href]")))return;
    event.preventDefault();event.stopImmediatePropagation();
    const next=waiting.shift();if(next)start(next);
  },true);
  new view.MutationObserver(sync).observe(doc.body,{subtree:true,attributes:true,attributeFilter:["data-deck-current"]});
  new view.MutationObserver(sync).observe(doc.documentElement,{attributes:true,attributeFilter:["data-deck-mode"]});
  sync();
}
