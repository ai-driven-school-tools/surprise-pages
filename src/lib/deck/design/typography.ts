import fonts from "../../../../vendor/deck-fonts/manifest.json";
import type {} from "../render-contract";

/** 書体の置き場。自分のサイトの道筋だけを指し、外のサーバーからは読まない。 */
export const DECK_FONT_BASE = "/vendor/deck-fonts/";
export const DECK_TYPOGRAPHIES = [
  {id:"system",name:"元の書体",body:'-apple-system, BlinkMacSystemFont, "Hiragino Sans", "Noto Sans JP", sans-serif',heading:'-apple-system, BlinkMacSystemFont, "Hiragino Sans", "Noto Sans JP", sans-serif',families:[]}, // i18n-keep: 保存済みページの実行部に束ねられる。画面の書体名は deck-style-options の typographyLabel で訳す
  {id:"modern",name:"端正なゴシック",body:'"SP Deck Inter", "SP Deck Noto Sans JP", sans-serif',heading:'"SP Deck Inter", "SP Deck Noto Sans JP", sans-serif',families:["Inter","Noto Sans JP"]}, // i18n-keep: 保存済みページの実行部に束ねられる。画面の書体名は deck-style-options の typographyLabel で訳す
  {id:"soft",name:"柔らかなゴシック",body:'"SP Deck Manrope", "SP Deck Zen Kaku Gothic New", sans-serif',heading:'"SP Deck Manrope", "SP Deck Zen Kaku Gothic New", sans-serif',families:["Manrope","Zen Kaku Gothic New"]}, // i18n-keep: 保存済みページの実行部に束ねられる。画面の書体名は deck-style-options の typographyLabel で訳す
  {id:"editorial",name:"見出しに明朝",body:'"SP Deck Inter", "SP Deck Noto Sans JP", sans-serif',heading:'"SP Deck Manrope", "SP Deck Noto Serif JP", serif',families:["Inter","Manrope","Noto Sans JP","Noto Serif JP"]}, // i18n-keep: 保存済みページの実行部に束ねられる。画面の書体名は deck-style-options の typographyLabel で訳す
  {id:"school",name:"丸みのあるゴシック",body:'"SP Deck LINE Seed JP", sans-serif',heading:'"SP Deck LINE Seed JP", sans-serif',families:["LINE Seed JP"]}, // i18n-keep: 保存済みページの実行部に束ねられる。画面の書体名は deck-style-options の typographyLabel で訳す
];
export function deckTypography(id: string | undefined) {
  return DECK_TYPOGRAPHIES.find(item=>item.id===id) ?? DECK_TYPOGRAPHIES[0];
}
const pending = new WeakMap<Document,Map<string,Promise<FontFace>>>();
/** Load the complete glyph repertoire before switching. A newly typed kanji must
 * not fetch another subset and change metrics in the middle of composition. */
export async function prepareDeckFonts(doc: Document, ids: readonly (string|undefined)[], timeoutMs = 15000): Promise<void> {
  const families = new Set(ids.flatMap(id=>deckTypography(id).families));
  if (!families.size) return;
  if (!doc.fonts || typeof FontFace === "undefined") throw new Error("この環境では書体を切り替えられません"); // i18n-keep: 保存済みページの実行部に束ねられる。画面の書体名は deck-style-options の typographyLabel で訳す
  const cache = pending.get(doc) ?? new Map<string,Promise<FontFace>>(); pending.set(doc,cache);
  const base = /^https?:/.test(doc.baseURI) ? new URL("/vendor/deck-fonts/",doc.baseURI).href : DECK_FONT_BASE;
  const loaded = await Promise.all(fonts.filter(face=>families.has(face.family)).map(face=>{
    const existing=cache.get(face.id);if(existing)return existing;
    const family=`SP Deck ${face.family}`;
    // Browsers serialize multi-word family names with quotes. The embedded
    // runtime and editor have separate module caches but share this FontFaceSet.
    const installed = [...doc.fonts].find(font => font.family.replace(/^["']|["']$/g, "") === family && font.weight === face.weight && font.status === "loaded");
    if (installed) { const ready = Promise.resolve(installed); cache.set(face.id, ready); return ready; }
    const font=new FontFace(family,`url("${base}${face.file}")`,{weight:face.weight,style:"normal",display:"block"});
    let timer: ReturnType<typeof setTimeout>;
    const timeout=new Promise<never>((_resolve,reject)=>{timer=setTimeout(()=>reject(new Error("書体の読み込みに時間がかかっています")),timeoutMs);}); // i18n-keep: 保存済みページの実行部に束ねられる。画面の書体名は deck-style-options の typographyLabel で訳す
    const load=Promise.race([font.load(),timeout]).catch(error=>{cache.delete(face.id);throw error;}).finally(()=>clearTimeout(timer));
    cache.set(face.id,load);return load;
  }));
  // Commit the complete family together. Timed-out loads never swap fonts later.
  for (const font of loaded) if (![...doc.fonts].includes(font)) doc.fonts.add(font);
}

const STYLE_RUNTIME = '[data-deck-design-runtime="3"]';

/** Whether the embedded style has drawn this paper's charts and diagrams. The
 * standard runtime draws the requested paper first and the others after it;
 * runtimes without the per-paper report are drawn once the whole page is. */
export function deckSlideDrawn(doc: Document, slide: Element): boolean {
  if (deckStyleDrawn(doc)) return true;
  return doc.deckRenderer?.isDrawn?.(slide) ?? false;
}

/** The part of the editor that shows one paper becomes active once the style is
 * live and that paper is drawn, not after every other paper. Charts and diagrams
 * of a paper are never read before it is drawn: those that do not wait for it
 * check deckSlideDrawn. */
export function whenDeckSlideReady(doc: Document, slide: () => Element | null, ready: () => void): () => void {
  let stopped = false;
  const live = () => doc.body.hasAttribute("data-deck-design-ready") || (doc.body.hasAttribute("data-deck-design-live") && typeof doc.deckRenderer?.whenDrawn === "function");
  const drawSlide = () => {
    const target = slide();
    if (!target || deckSlideDrawn(doc, target)) { ready(); return; }
    void doc.deckRenderer?.whenDrawn?.(target).then(() => { if (!stopped) ready(); });
  };
  if (!doc.querySelector(STYLE_RUNTIME) || live()) { drawSlide(); return () => { stopped = true; }; }
  const observer = new MutationObserver(() => {
    if (!live()) return;
    observer.disconnect(); drawSlide();
  });
  observer.observe(doc.body,{attributes:true,attributeFilter:["data-deck-design-ready","data-deck-design-live"]});
  return () => { stopped = true; observer.disconnect(); };
}

/** Whether the embedded style has finished loading its fonts and painting every paper. */
export function deckStyleDrawn(doc: Document): boolean {
  return !doc.querySelector(STYLE_RUNTIME) || doc.body.hasAttribute("data-deck-design-ready");
}
/** Surfaces that read every paper become active only after the embedded style has
 * painted them all. Window.load alone does not wait for FontFace. */
export function whenDeckStyleReady(doc: Document, ready: () => void): () => void {
  if (deckStyleDrawn(doc)) { ready(); return () => {}; }
  const observer = new MutationObserver(() => {
    if (deckStyleDrawn(doc)) { observer.disconnect(); ready(); }
  });
  observer.observe(doc.body,{attributes:true,attributeFilter:["data-deck-design-ready"]});
  return () => observer.disconnect();
}
