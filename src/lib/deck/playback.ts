import {installDeckYouTube} from "./media/youtube";
/** Playback state is transient. The authored video source and its native controls
 * remain normal HTML; no second media document or saved playback state exists. */
import {DECK_VIDEO_SUSPENDED_SOURCE,releaseDeckVideo,activateDeckVideo} from "./media/video-source";
export {releaseDeckVideo,activateDeckVideo} from "./media/video-source";
const READY="data-deck-playback-ready";
export function installDeckPlayback(doc:Document):void {
  installDeckYouTube(doc);
  const view=doc.defaultView;if(!view||!doc.body.hasAttribute("data-deck")||doc.body.hasAttribute(READY))return;
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
