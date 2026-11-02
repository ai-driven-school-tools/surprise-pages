import { observeDeferredSize } from "../../shared/deferred-resize";
import { navigationRuntime } from "../../../lib/deck/preview.generated";
import type { ThemeSnapshot } from '../../../lib/deck/design/theme-model';
import { authorSlide, escapeDeckText } from '../../../lib/deck/authoring';
import { DECK_LIBRARY, authorLibrarySlide } from '../../../lib/deck/design/library';
import type { BrowserTemplateRef } from '../../../lib/deck/design/browser-templates';
import type { DeckAppearance } from '../../../lib/deck/design/design';
import { prepareDeckFonts } from '../../../lib/deck/design/typography';
import type {} from '../../../lib/deck/render-contract';
import { withVendorScripts } from '../../../lib/html/vendor-scripts';
import { t } from '../../shared/i18n';

export const TEMPLATE_PREVIEW_CACHE_LIMIT = 24;
/**
 * Drawing one paper on an already booted renderer is CPU work only, so a short
 * budget is enough. Nothing that goes over the network is measured against it.
 */
export const TEMPLATE_PREVIEW_TIMEOUT = 8000;
/**
 * One-time downloads — a typography is up to 6 MB of fonts and a graph needs the
 * chart library — get their own, generous budget. They used to share the 8 seconds
 * above, and a timeout threw the renderer away, cancelling the half-finished
 * download; every retry then started from zero and a slow line never converged.
 */
export const TEMPLATE_PREVIEW_PREPARE_TIMEOUT = 60000;
/** After this long without the fonts, the cards say what they are waiting for. */
export const TEMPLATE_PREVIEW_NOTICE_DELAY = 400;
export type PreviewState = 'idle' | 'loading' | 'ready' | 'error';
type Snapshot = {html: string; fonts: FontFace[]; logoHidden:boolean;logoKey:string|null};
export type PreviewLogo = {value:ThemeSnapshot['logo'];base:string};
type Subscriber = {holder: HTMLElement; deliver: (value: Snapshot) => void; fail: () => void; notice?: (text: string) => void};
type Job = {key: string; ref: BrowserTemplateRef; appearance: DeckAppearance; logo?: PreviewLogo; listeners: Set<Subscriber>; generation: number};
type Renderer = {frame: HTMLIFrameElement; life: AbortController};
const frozenStyle = `<style>html,body,main[data-deck-slides]{margin:0!important;padding:0!important;width:1280px!important;height:720px!important;overflow:hidden!important}section[data-deck-slide]{position:relative!important;width:1280px!important;height:720px!important;transform:none!important;margin:0!important}aside{display:none!important}*,*::before,*::after{animation:none!important;transition:none!important}</style>`;
const CANCELLED = 'preview cancelled';

/** The renderer itself is unusable (never booted, or stopped answering). Only this
 * failure discards it; a failed download keeps the booted renderer for the retry. */
class RendererFailure extends Error {}

function until(test: () => boolean, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout>;
    const cleanup = () => {clearTimeout(timer); signal.removeEventListener('abort', abort);};
    const abort = () => {cleanup(); reject(new Error(CANCELLED));};
    const tick = () => {
      if(signal.aborted){abort();return;}
      if(test()){cleanup();resolve();return;}
      timer=setTimeout(tick,16);
    };
    signal.addEventListener('abort',abort,{once:true});tick();
  });
}

/** Settle within the budget, or as soon as the renderer's life ends. The work gets a
 * signal of its own, so a poll that lost the race stops instead of ticking on. */
function bounded<T>(run: (signal: AbortSignal) => Promise<T>, ms: number, life: AbortSignal, reason: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const scope = new AbortController();
    const cleanup = () => {clearTimeout(timer); life.removeEventListener('abort', abort);};
    const abort = () => {cleanup(); scope.abort(); reject(new Error(CANCELLED));};
    const timer = setTimeout(() => {cleanup(); scope.abort(); reject(new Error(reason));}, ms);
    if(life.aborted){abort();return;}
    life.addEventListener('abort',abort,{once:true});
    run(scope.signal).then(value => {cleanup(); resolve(value);}, error => {cleanup(); reject(error);});
  });
}

/** Fonts a preview typography installed in the owner's document. Browsers serialize
 * multi-word families with quotes, so both spellings are matched. */
const isDeckFont = (font: FontFace) => /^["']?SP Deck /.test(font.family) && font.status === 'loaded';

/** One executing renderer per chooser; visible cards are immutable, scriptless
 * snapshots. No user-authored HTML is ever accepted by this renderer. */
export function createDeckTemplatePreviews(host: HTMLElement, scrollRoot?:HTMLElement) {
  const cache = new Map<string,Snapshot>();
  const jobs = new Map<string,Job>();
  /**
   * Fonts are loaded into the owner's document, not the renderer's. The renderer is
   * disposable (theme switches and failures replace it), and a download must survive
   * that: the owner's document keeps every finished face, and prepareDeckFonts keeps
   * the in-flight ones, so a retry continues instead of starting over.
   */
  const owner = host.ownerDocument;
  let renderer: Renderer | null = null;
  let active: Job | null = null, generation=0, running=false, disposed=false, paints=0, hits=0;
  const mounts = new Set<() => void>();
  const logos=new Map<string,{url:string;promise:Promise<string>;abort:AbortController}>();
  let currentLogoKey:string|null=null;
  function releaseLogo(key:string){const resource=logos.get(key);resource?.abort.abort();if(resource?.url)URL.revokeObjectURL(resource.url);logos.delete(key);}
  function trimLogos(){const used=new Set([...cache.values()].map(snapshot=>snapshot.logoKey));if(currentLogoKey)used.add(currentLogoKey);for(const key of logos.keys())if(!used.has(key))releaseLogo(key);}
  async function loadLogo(logo:PreviewLogo){
    if(!logo.value)return null;
    const key=new URL(logo.value.asset.path,logo.base).href;currentLogoKey=key;
    const existing=logos.get(key);if(existing)return existing.promise;
    const resource={url:"",abort:new AbortController(),promise:Promise.resolve("")};
    resource.promise=fetch(key,{credentials:"same-origin",signal:AbortSignal.any([resource.abort.signal,AbortSignal.timeout(TEMPLATE_PREVIEW_PREPARE_TIMEOUT)])}).then(async response=>{if(!response.ok)throw new Error("ロゴを読み込めません");const blob=await response.blob();if(blob.size>10*1024*1024||resource.abort.signal.aborted)throw new Error("ロゴを読み込めません");resource.url=URL.createObjectURL(blob);return resource.url;}).catch(error=>{if(logos.get(key)===resource)releaseLogo(key);throw error;});logos.set(key,resource);return resource.promise; // i18n-keep: 内部の失敗の理由（画面には出さず、カードは固定の「表示できませんでした」を出す）
  }
  // The kit is immutable for this loaded application. A different kit/template
  // version loads a new module and therefore a fresh bounded cache.
  const kit = withVendorScripts(DECK_LIBRARY.previewKit);
  const keyOf = (ref: BrowserTemplateRef, appearance: DeckAppearance, logo?:PreviewLogo) => JSON.stringify([ref.kind,ref.id,Object.entries(appearance).sort(([a],[b])=>a.localeCompare(b)),logo]);
  function stats() {
    host.dataset.previewRenders=String(paints);host.dataset.previewCache=String(cache.size);host.dataset.previewCacheHits=String(hits);
  }
  function reset() {renderer?.life.abort();renderer?.frame.remove();renderer=null;}
  function remember(key: string, value: Snapshot) {
    cache.delete(key);cache.set(key,value);
    while(cache.size>TEMPLATE_PREVIEW_CACHE_LIMIT){const oldest=cache.keys().next().value;if(oldest!==undefined)cache.delete(oldest);}
    trimLogos();stats();
  }
  function rendererDocument(current: Renderer): Document {
    const doc=current.frame.contentDocument;
    if(!doc?.deckRenderer)throw new RendererFailure('見本を準備できません'); // i18n-keep: 内部の失敗の理由（画面には出さず、カードは固定の「表示できませんでした」を出す）
    return doc;
  }
  /** Boot the shared renderer once. Its start-up is inline script only, so it is measured
   * against the drawing budget; a renderer that never answers is discarded. */
  async function boot(job: Job): Promise<Renderer> {
    if(!renderer) {
      const frame=document.createElement('iframe'),life=new AbortController();
      frame.className='dp-renderer';frame.title=t('decks.templatePreview.renderer');frame.tabIndex=-1;frame.setAttribute('aria-hidden','true');
      frame.setAttribute('sandbox','allow-scripts allow-same-origin');
      Object.assign(frame.style,{position:'fixed',left:'-1400px',top:'0',width:'1280px',height:'720px',opacity:'0',pointerEvents:'none',border:'0'});
      renderer={frame,life};
      // The runtime's own start-up fetches the configured typography with a 2 second cap
      // and silently falls back to the system font when that runs out. Booting without
      // families keeps that fetch — and its fallback — out of the picture; the real
      // typography is written before the first paper is drawn, by which time its fonts
      // are already installed below.
      const config=JSON.stringify({version:1,document:{...job.appearance,typography:'system'},slides:{}}).replace(/</g,'\\u003c');
      frame.srcdoc=`<!doctype html><html lang="ja"><head><base href="${escapeDeckText(location.origin+'/')}"><script type="application/json" data-deck-design>${config}</script>${kit}${navigationRuntime}${frozenStyle}</head><body data-deck><main data-deck-slides><section data-deck-slide data-deck-id="preview-bootstrap"></section></main></body></html>`;
      host.append(frame);
    }
    const current=renderer;
    try {
      await bounded(signal=>until(()=>!!current.frame.contentDocument?.deckRenderer,signal),TEMPLATE_PREVIEW_TIMEOUT,current.life.signal,'見本を準備できません'); // i18n-keep: 内部の失敗の理由（画面には出さず、カードは固定の「表示できませんでした」を出す）
    } catch (error) {
      throw error instanceof Error&&error.message===CANCELLED?error:new RendererFailure('見本を準備できません'); // i18n-keep: 内部の失敗の理由（画面には出さず、カードは固定の「表示できませんでした」を出す）
    }
    return current;
  }
  /** Everything that goes over the network: fonts, the logo, the chart library. Nothing
   * here is charged to the drawing budget, and a failure keeps the booted renderer. */
  async function prepare(current: Renderer, job: Job): Promise<{doc: Document; logoUrl: string | null}> {
    const signal=current.life.signal;
    const doc=rendererDocument(current);
    const fonts=prepareDeckFonts(owner,[job.appearance.typography],TEMPLATE_PREVIEW_PREPARE_TIMEOUT);
    // Every queued paper of this theme waits for the same fonts, so all of their cards say so.
    const slow=setTimeout(()=>{for(const waiting of [job,...jobs.values()])for(const listener of waiting.listeners)listener.notice?.(t('decks.templatePreview.loadingFonts'));},TEMPLATE_PREVIEW_NOTICE_DELAY);
    try {await bounded(()=>fonts,TEMPLATE_PREVIEW_PREPARE_TIMEOUT,signal,'書体の読み込みに時間がかかっています');} // i18n-keep: 内部の失敗の理由（画面には出さず、カードは固定の「表示できませんでした」を出す）
    finally {clearTimeout(slow);}
    const installed=new Set(doc.fonts);
    for(const font of owner.fonts)if(isDeckFont(font)&&!installed.has(font))doc.fonts.add(font);
    const logo=job.logo;
    const logoUrl=logo?.value?await bounded(()=>loadLogo(logo),TEMPLATE_PREVIEW_PREPARE_TIMEOUT,signal,'ロゴを読み込めません'):null; // i18n-keep: 内部の失敗の理由（画面には出さず、カードは固定の「表示できませんでした」を出す）
    if(signal.aborted)throw new Error(CANCELLED);
    const main=doc.querySelector('main[data-deck-slides]'),setting=doc.head.querySelector('script[data-deck-design]');
    if(!doc.deckRenderer||!main||!setting)throw new RendererFailure('見本を準備できません'); // i18n-keep: 内部の失敗の理由（画面には出さず、カードは固定の「表示できませんでした」を出す）
    doc.deckRenderer.release([...main.children]);
    setting.textContent=JSON.stringify({version:1,document:job.appearance,slides:{}});
    doc.deckPreviewLogo=job.logo?.value&&logoUrl?{path:job.logo.value.asset.path,url:logoUrl}:undefined;
    doc.head.querySelector('[data-deck-logo]')?.remove();
    if(job.logo?.value){
      const logoSetting=doc.createElement('script');logoSetting.type='application/json';logoSetting.setAttribute('data-deck-logo','');
      logoSetting.textContent=JSON.stringify({version:1,asset:{...job.logo.value.asset,path:job.logo.value.asset.path},document:job.logo.value.presentation,layouts:job.logo.value.layouts,slides:{}});doc.head.append(logoSetting);
    }
    const id='preview-slide';
    main.innerHTML=job.ref.kind==='basic'?authorSlide(job.ref.id,id):authorLibrarySlide(job.ref.id,id).html;
    // The reading runtime now starts before deferred companions finish. A
    // graph must not be cached as a successful, empty picture in that interval.
    if(main.querySelector('[data-dd-chart]'))await bounded(scope=>until(()=>!!doc.defaultView&&!!Reflect.get(doc.defaultView,'echarts'),scope),TEMPLATE_PREVIEW_PREPARE_TIMEOUT,signal,'グラフの道具を読み込めません'); // i18n-keep: 内部の失敗の理由（画面には出さず、カードは固定の「表示できませんでした」を出す）
    if(signal.aborted)throw new Error(CANCELLED);
    return {doc,logoUrl};
  }
  /** Draw the prepared paper and copy it out. CPU only, so the short budget applies. */
  async function draw(current: Renderer, job: Job, doc: Document, logoUrl: string | null): Promise<Snapshot> {
    const signal=current.life.signal;
    const work=async()=>{
      const main=doc.querySelector('main[data-deck-slides]');
      if(!doc.deckRenderer||!main)throw new RendererFailure('見本を準備できません'); // i18n-keep: 内部の失敗の理由（画面には出さず、カードは固定の「表示できませんでした」を出す）
      const base=doc.head.querySelector('base');if(base)base.href=job.logo?.base??location.origin+'/';
      await doc.deckRenderer.update({slides:['preview-slide'],structure:true,appearance:true,customization:true});
      await doc.fonts.ready;
      const logoImages=[...doc.querySelectorAll<HTMLImageElement>('[data-deck-logo-view] img')];
      for(const img of logoImages){if(logoUrl)img.src=logoUrl;await img.decode();}
      if(signal.aborted)throw new Error(CANCELLED);
      const slide=main.querySelector('section[data-deck-slide]');
      if(!slide||slide.querySelector('[data-dd-chart-error],[data-dd-diagram-error]'))throw new Error('見本を描画できません'); // i18n-keep: 内部の失敗の理由（画面には出さず、カードは固定の「表示できませんでした」を出す）
      const copy=slide.cloneNode(true);
      if(!(copy instanceof doc.defaultView!.Element))throw new Error('見本をコピーできません'); // i18n-keep: 内部の失敗の理由（画面には出さず、カードは固定の「表示できませんでした」を出す）
      copy.querySelectorAll('script,iframe').forEach(node=>node.remove());
      for(const node of [copy,...copy.querySelectorAll('*')])for(const attribute of [...node.attributes])if(attribute.name.startsWith('on')||attribute.name==='contenteditable')node.removeAttribute(attribute.name);
      const styles=[...doc.querySelectorAll('head>style,head>base,head>link[rel="stylesheet"]')].map(node=>node.outerHTML).join('');
      paints++;stats();
      // Capture before another job can mutate the shared document.
      return {html:`<!doctype html><html lang="ja"><head>${styles}</head><body data-deck data-deck-design-ready><main data-deck-slides>${copy.outerHTML}</main></body></html>`,fonts:[...doc.fonts],logoHidden:slide.hasAttribute('data-dd-logo-collision-avoided'),logoKey:job.logo?.value?new URL(job.logo.value.asset.path,job.logo.base).href:null};
    };
    try {
      return await bounded(work,TEMPLATE_PREVIEW_TIMEOUT,signal,'見本の準備に時間がかかっています'); // i18n-keep: 内部の失敗の理由（画面には出さず、カードは固定の「表示できませんでした」を出す）
    } catch (error) {
      // Running out of the drawing budget means the renderer stopped answering.
      throw error instanceof Error&&error.message==='見本の準備に時間がかかっています'?new RendererFailure(error.message):error; // i18n-keep: 内部の失敗の理由（画面には出さず、カードは固定の「表示できませんでした」を出す）
    }
  }
  async function paint(job: Job): Promise<Snapshot> {
    const current=await boot(job);
    const {doc,logoUrl}=await prepare(current,job);
    return draw(current,job,doc,logoUrl);
  }
  function priority(job: Job) {
    return Math.min(...[...job.listeners].map(({holder})=>{
      const box=holder.getBoundingClientRect(),viewport=(holder.closest('dialog')?null:scrollRoot??holder.closest('.dp-results'))?.getBoundingClientRect();
      const top=viewport?.top??0,bottom=viewport?.bottom??innerHeight;
      return box.bottom>=top&&box.top<=bottom?0:Math.min(Math.abs(box.bottom-top),Math.abs(box.top-bottom));
    }));
  }
  async function drain() {
    if(running||disposed)return;running=true;
    try {
      while(jobs.size&&!disposed) {
        const job=[...jobs.values()].filter(item=>item.listeners.size).sort((a,b)=>priority(a)-priority(b))[0];
        if(!job)break;
        jobs.delete(job.key);active=job;
        try {
          const snapshot=await paint(job);
          if(disposed||job.generation!==generation)continue;
          remember(job.key,snapshot);for(const listener of job.listeners)listener.deliver(snapshot);
        } catch (error) {
          if(disposed||job.generation!==generation)continue;
          if(error instanceof RendererFailure)reset();
          for(const listener of job.listeners)listener.fail();
        } finally {active=null;}
      }
    } finally {running=false;}
  }
  function request(ref: BrowserTemplateRef, appearance: DeckAppearance, subscriber: Subscriber, logo?:PreviewLogo) {
    const key=keyOf(ref,appearance,logo),cached=cache.get(key);
    if(cached){hits++;remember(key,cached);subscriber.deliver(cached);return ()=>{};}
    let job=active?.key===key&&active.generation===generation?active:jobs.get(key);
    if(!job){job={key,ref,appearance,logo,listeners:new Set(),generation};jobs.set(key,job);}
    job.listeners.add(subscriber);queueMicrotask(()=>void drain());
    return ()=>{job.listeners.delete(subscriber);if(!job.listeners.size&&jobs.get(key)===job)jobs.delete(key);};
  }
  function mount(holder: HTMLElement, ref: BrowserTemplateRef, appearance: DeckAppearance, title: string, changed: (state: PreviewState) => void = ()=>{},logo?:PreviewLogo) {
    let visible=false,removed=false,ticket=0,frame:HTMLIFrameElement|null=null,cancel=()=>{};
    Object.assign(holder.style,{position:'relative',aspectRatio:'16 / 9',overflow:'hidden',pointerEvents:'none'});
    function state(value: PreviewState) {if(removed)return;holder.dataset.previewState=value;changed(value);}
    function clear() {size?.cancel(holder);ticket++;cancel();frame?.remove();frame=null;holder.replaceChildren();}
    const scale=()=>{if(frame&&!removed&&!disposed)frame.style.transform=`scale(${holder.clientWidth/1280})`;};
    const size=observeDeferredSize(holder.ownerDocument,scale);size?.observe(holder);
    function load() {
      clear();if(!visible||removed||disposed)return;
      const thisTicket=ticket;state('loading');holder.textContent=t('decks.templatePreview.loading');
      cancel=request(ref,appearance,{
        holder,
        notice:text=>{if(thisTicket!==ticket||removed||holder.dataset.previewState!=='loading')return;holder.textContent=text;},
        fail:()=>{if(thisTicket!==ticket||removed)return;holder.textContent=t('decks.templatePreview.failed');state('error');},
        deliver:snapshot=>{
          if(thisTicket!==ticket||removed||!visible)return;
          holder.dataset.logoHidden=String(snapshot.logoHidden);
          const next=document.createElement('iframe');frame=next;next.title=t('decks.templatePreview.frameTitle',{title});next.tabIndex=-1;next.setAttribute('aria-hidden','true');next.setAttribute('sandbox','allow-same-origin');
          Object.assign(next.style,{width:'1280px',height:'720px',position:'absolute',left:'0',top:'0',border:'0',transformOrigin:'top left',visibility:'hidden'});scale();
          next.addEventListener('load',()=>{
            const doc=next.contentDocument;if(!doc||thisTicket!==ticket||removed)return;
            for(const font of snapshot.fonts)doc.fonts.add(font);
            void Promise.all([doc.fonts.ready,...[...doc.querySelectorAll<HTMLImageElement>('[data-deck-logo-view] img')].map(img=>img.decode())]).then(()=>{
              if(thisTicket!==ticket||removed)return;
              if(holder.firstChild?.nodeType===Node.TEXT_NODE)holder.firstChild.remove();
              next.style.visibility='';state('ready');
            }).catch(()=>{if(thisTicket!==ticket||removed)return;next.remove();holder.textContent=t('decks.templatePreview.failed');state('error');});
          },{once:true});
          next.srcdoc=snapshot.html;holder.append(next);
        },
      },logo);
    }
    state('idle');
    const viewport=holder.closest('dialog')?null:scrollRoot??holder.closest('.dp-results');
    const margin=Math.ceil(holder.getBoundingClientRect().height+32);
    const observer=new IntersectionObserver(entries=>{
      const next=entries.some(entry=>entry.isIntersecting);if(next===visible)return;visible=next;
      if(visible)load();else{clear();state('idle');}
    },{root:viewport,rootMargin:`${margin}px 0px`});observer.observe(holder);
    const dispose=()=>{if(removed)return;removed=true;clear();observer.disconnect();size?.disconnect();mounts.delete(dispose);};mounts.add(dispose);
    return {dispose,retry:()=>{if(visible)load();}};
  }
  stats();
  return {
    mount,
    cancelPending(){generation++;jobs.clear();if(active)reset();currentLogoKey=null;trimLogos();},
    dispose(){disposed=true;generation++;jobs.clear();reset();for(const key of [...logos.keys()])releaseLogo(key);for(const dispose of [...mounts])dispose();cache.clear();},
  };
}
