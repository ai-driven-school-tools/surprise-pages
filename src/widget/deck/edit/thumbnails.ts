import { observeDeferredSize } from "../../shared/deferred-resize";
import { deckSlideDrawn, deckStyleDrawn, prepareDeckFonts, whenDeckStyleReady } from "../../../lib/deck/design/typography";
import { markDeferredWork } from "../deferred-work";
import { t } from "../../shared/i18n";

/** Scriptless previews retain their last complete picture while the next one
 * prepares. Work is bounded and prioritizes the visible strip plus two rows. */
export function createDeckThumbnails(nav: HTMLElement, document: () => Document | null, interactingWithCanvas: () => boolean) {
  type Work = {slide:HTMLElement;signature:string;attempt:number};
  const pending = new Map<HTMLElement,Work>(), failed = new Map<HTMLElement,Work>();
  const signatures = new WeakMap<HTMLElement,string>();
  const sources = new Map<HTMLElement,Work>();
  const painted = new Map<HTMLElement,number>();
  const MAX_RETAINED = 12;
  const generations = new WeakMap<HTMLElement,number>();
  let timer:ReturnType<typeof setTimeout>|undefined, idle:number|undefined, disposed=false, quietUntil=0;
  const active=new Set<HTMLIFrameElement>();
  const cancellations=new Map<HTMLIFrameElement,()=>void>(), observed=new Set<HTMLElement>(), retries=new Set<ReturnType<typeof setTimeout>>();
  const nearby = new Set<HTMLElement>();
  // While the opened preview is still drawing its other slides, previews wait. Each one
  // loads the deck's fonts into its own document, which would compete with the first input.
  let styleWait: {doc:Document;stop:()=>void} | null = null;
  const busy = () => markDeferredWork(nav, !disposed && (timer !== undefined || idle !== undefined || active.size > 0 || (styleWait !== null && styleWait.doc === document())));
  function waitForStyle(doc: Document) {
    if (styleWait?.doc === doc) return;
    styleWait?.stop();
    const view = doc.defaultView;
    const done = () => { if (styleWait?.doc !== doc) return; styleWait.stop(); styleWait = null; schedule(); busy(); };
    const stopReady = whenDeckStyleReady(doc, done);
    // A replaced preview never finishes. Stop waiting for it when it goes away.
    view?.addEventListener("pagehide", done, { once: true });
    styleWait = { doc, stop: () => { stopReady(); view?.removeEventListener("pagehide", done); } };
    busy();
  }
  const proximity = typeof IntersectionObserver === "undefined" ? null : new IntersectionObserver(entries => {
    for (const entry of entries) if (entry.target instanceof HTMLElement) {
      if (entry.isIntersecting) nearby.add(entry.target); else {
        nearby.delete(entry.target);
        for (const frame of entry.target.querySelectorAll("iframe")) cancellations.get(frame)?.();
      }
    }
    schedule();
  }, {root: nav, rootMargin: "320px 0px"});
  function scale(holder:HTMLElement, width:number) {
    const transform=`scale(${(width||160)/1280})`;
    for(const frame of holder.querySelectorAll("iframe"))if(frame.style.transform!==transform)frame.style.transform=transform;
  }
  const sizeObserver = observeDeferredSize(nav.ownerDocument, targets => {
    if(disposed)return;
    const sizes=targets.filter((target):target is HTMLElement=>target instanceof HTMLElement).map(holder=>({holder,width:holder.clientWidth}));
    for(const {holder,width} of sizes)scale(holder,width);
  });
  async function paint(holder:HTMLElement,slide:HTMLElement):Promise<boolean> {
    const source=document(),view=source?.defaultView;if(!source||!view||disposed||!holder.isConnected)return false;
    const width=holder.clientWidth;
    const ticket=(generations.get(holder)??0)+1;generations.set(holder,ticket);
    const live=source.querySelector<HTMLElement>(`[data-deck-node="${CSS.escape(slide.getAttribute("data-deck-node")??"")}"]`)??slide;
    // Previews start once the style has drawn every slide (see run). A preview never copies an undrawn slide.
    if(!deckSlideDrawn(source,live))return false;
    const copy=live.cloneNode(true);
    if(!(copy instanceof view.HTMLElement)&&!(copy instanceof HTMLElement))return false;
    copy.querySelectorAll("script,iframe,[data-deck-canvas-chrome]").forEach(n=>n.remove());
    for(const chrome of copy.querySelectorAll("[data-deck-youtube-view]")){const play=chrome.querySelector("button");if(play)play.hidden=false;}
    for(const video of copy.querySelectorAll("video")) {
      const poster=video.getAttribute("poster"),image=source.createElement("img");
      image.style.cssText=video.style.cssText;if(poster)image.src=poster;video.replaceWith(image);
    }
    for(const node of [copy,...copy.querySelectorAll("*")])for(const attr of [...node.attributes])if(attr.name.startsWith("on")||attr.name==="contenteditable")node.removeAttribute(attr.name);
    const styles=[...source.querySelectorAll("style:not([data-deck-canvas-chrome]),head>base,head>link[rel=stylesheet]")].map(n=>n.outerHTML).join("");
    const thumb=window.document.createElement("iframe");thumb.title=t("deckEditor.view.thumbnail");thumb.tabIndex=-1;thumb.setAttribute("sandbox","allow-same-origin");thumb.style.visibility="hidden";thumb.style.transform=`scale(${(width||160)/1280})`;
    active.add(thumb);busy();
    const loaded=new Promise<void>(resolve=>{thumb.addEventListener("load",()=>resolve(),{once:true});});
    thumb.srcdoc=`<!doctype html><html><head>${styles}<style>html,body,main[data-deck-slides],[data-deck-frame],[data-deck-stage]{margin:0!important;padding:0!important;width:1280px!important;height:720px!important;max-width:none!important;overflow:hidden!important;transform:none!important}section[data-deck-slide]{position:relative!important;width:1280px!important;height:720px!important;transform:none!important}aside{display:none!important}*,*::before,*::after{animation:none!important}</style></head><body data-deck data-deck-design-ready><main data-deck-slides><div data-deck-frame><div data-deck-stage>${copy.outerHTML}</div></div></main></body></html>`;
    holder.append(thumb);sizeObserver?.observe(holder);observed.add(holder);
    let timeout:ReturnType<typeof setTimeout>|undefined;
    try {
      await Promise.race([(async()=>{await loaded;const doc=thumb.contentDocument;if(!doc)return;await prepareDeckFonts(doc,[live.getAttribute("data-deck-typography")??undefined]);await Promise.all([...doc.images].map(img=>img.decode().catch(()=>{})));})(),new Promise<never>((_,reject)=>{cancellations.set(thumb,()=>reject(Error("thumbnail cancelled")));timeout=setTimeout(()=>reject(Error("thumbnail timeout")),15000);})]);
      // 操作の直後（一覧の送り・押す・キー）は、出来上がった縮小表示を出すのも静かになるまで待つ。
      // 出した瞬間の描き込みが、押した操作の次の描画に重なって、押してから画面が変わるまでを遅らせるため。
      while(!disposed&&holder.isConnected&&generations.get(holder)===ticket&&performance.now()<quietUntil)await new Promise<void>(resolve=>setTimeout(resolve,Math.max(16,quietUntil-performance.now())));
      if(disposed||!holder.isConnected||generations.get(holder)!==ticket)return false;
      for(const previous of [...holder.querySelectorAll("iframe")])if(previous!==thumb)previous.remove();
      thumb.style.visibility="";
      painted.set(holder, performance.now());
      return true;
    }catch{return false;}finally{clearTimeout(timeout);active.delete(thumb);cancellations.delete(thumb);if(thumb.style.visibility==="hidden")thumb.remove();busy();}
  }
  function schedule(){if(timer||idle!==undefined||disposed)return;timer=setTimeout(()=>{timer=undefined;if(disposed)return;if(window.requestIdleCallback)idle=window.requestIdleCallback(()=>{idle=undefined;run();busy();},{timeout:500});else run();busy();},Math.max(32,quietUntil-performance.now()));busy();}
  function interacting(){quietUntil=performance.now()+150;schedule();}
  function run(){
    timer=undefined;if(disposed)return;if(interactingWithCanvas())quietUntil=performance.now()+150;if(performance.now()<quietUntil){schedule();return;}
    const shown=document();if(shown&&!deckStyleDrawn(shown)){waitForStyle(shown);return;}
    for(const holder of observed)if(!holder.isConnected){sizeObserver?.unobserve(holder);observed.delete(holder);failed.delete(holder);}
    const bounds=nav.getBoundingClientRect();
    // A long scroll must not retain hundreds of browsing contexts. Evicted
    // rows retain source/signature only and are recreated when visible again.
    for (const [holder] of [...painted].sort((a,b)=>a[1]-b[1])) {
      if (painted.size <= MAX_RETAINED) break;
      const r=proximity?null:holder.getBoundingClientRect();
      if(proximity?nearby.has(holder):(r&&r.bottom>=bounds.top-r.height*2&&r.top<=bounds.bottom+r.height*2))continue;
      holder.querySelectorAll("iframe").forEach(frame=>frame.remove());painted.delete(holder);
      const source=sources.get(holder);if(source)pending.set(holder,{...source,attempt:0});
    }
    const candidates=[...pending].filter(([holder])=>{if(!holder.isConnected){pending.delete(holder);return false;}if(proximity)return nearby.has(holder);const r=holder.getBoundingClientRect();return r.bottom>=bounds.top-r.height*2&&r.top<=bounds.bottom+r.height*2;});
    for(const [holder,value] of candidates.slice(0,active.size<2?1:0)){pending.delete(holder);void paint(holder,value.slide).then(success=>{
      if(disposed||!holder.isConnected||signatures.get(holder)!==value.signature)return;
      if(success){failed.delete(holder);return;}
      if(proximity&&!nearby.has(holder)){pending.set(holder,value);return;}
      failed.set(holder,value);
      if(value.attempt<2){const retry=setTimeout(()=>{retries.delete(retry);if(!disposed&&signatures.get(holder)===value.signature){pending.set(holder,{...value,attempt:value.attempt+1});schedule();}},500*(value.attempt+1));retries.add(retry);}
    }).finally(schedule);}
    // Start at most one preview per idle turn. A slow network image must not
    // monopolize the preparation slot for every other visible row.
    if(candidates.length&&active.size<2)schedule();
  }
  function online(){for(const [holder,value] of failed)if(holder.isConnected)pending.set(holder,{...value,attempt:0});schedule();}
  nav.addEventListener("scroll",interacting,true);
  nav.ownerDocument.addEventListener("pointerdown",interacting,true);
  nav.ownerDocument.addEventListener("keydown",interacting,true);
  window.addEventListener("online",online);
  return {
    update(slide:HTMLElement,holder:HTMLElement,signature:string){if(signatures.get(holder)===signature)return;const work={slide,signature,attempt:0};if(!sources.has(holder))proximity?.observe(holder);sources.set(holder,work);signatures.set(holder,signature);generations.set(holder,(generations.get(holder)??0)+1);for(const frame of holder.querySelectorAll("iframe"))cancellations.get(frame)?.();pending.set(holder,work);schedule();},
    forget(holder:HTMLElement){proximity?.unobserve(holder);nearby.delete(holder);sources.delete(holder);painted.delete(holder);pending.delete(holder);failed.delete(holder);observed.delete(holder);sizeObserver?.unobserve(holder);generations.delete(holder);for(const frame of holder.querySelectorAll("iframe")){cancellations.get(frame)?.();frame.remove();}},
    dispose(){disposed=true;styleWait?.stop();styleWait=null;markDeferredWork(nav,false);clearTimeout(timer);if(idle!==undefined)window.cancelIdleCallback(idle);for(const timer of retries)clearTimeout(timer);sizeObserver?.disconnect();proximity?.disconnect();nearby.clear();window.removeEventListener("online",online);nav.removeEventListener("scroll",interacting,true);nav.ownerDocument.removeEventListener("pointerdown",interacting,true);nav.ownerDocument.removeEventListener("keydown",interacting,true);for(const [frame,cancel] of cancellations){cancel();frame.remove();}pending.clear();failed.clear();observed.clear();sources.clear();painted.clear();},
  };
}
