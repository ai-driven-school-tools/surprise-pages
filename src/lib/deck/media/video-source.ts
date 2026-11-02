/** Only the live view suspends URLs. Persisted HTML keeps normal src attributes. */
export const DECK_VIDEO_SUSPENDED_SOURCE="data-deck-video-src";
export function authoredMediaSource(node:Element):string|null{return node.getAttribute(DECK_VIDEO_SUSPENDED_SOURCE)??node.getAttribute("src");}
export function writeMediaSource(node:Element,src:string):void{node.setAttribute(node.hasAttribute(DECK_VIDEO_SUSPENDED_SOURCE)?DECK_VIDEO_SUSPENDED_SOURCE:"src",src);}

/** Stop URL-backed media without changing player type. Switching to a stream
 * leaves WebKit's video layer blank when returning to a URL. */
export function releaseDeckVideo(video:HTMLVideoElement):void {
  video.autoplay=false;video.pause();video.preload="none";
  for(const node of [video,...video.querySelectorAll("source")]){
    const src=node.getAttribute("src");if(src===null)continue;
    node.setAttribute(DECK_VIDEO_SUSPENDED_SOURCE,src);node.removeAttribute("src");
  }
  video.load();
}
export function activateDeckVideo(video:HTMLVideoElement):void {
  for(const node of [video,...video.querySelectorAll("source")]){
    const src=node.getAttribute(DECK_VIDEO_SUSPENDED_SOURCE);if(src===null)continue;
    node.setAttribute("src",src);node.removeAttribute(DECK_VIDEO_SUSPENDED_SOURCE);
  }
}
