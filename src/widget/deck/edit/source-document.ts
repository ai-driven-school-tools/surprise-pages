import type {DeckLocalSourcePatch} from "../../../lib/deck/edit/local";
import {deckSourceHeadChange,deckRenderSnapshot,deckSlideInsertions} from "../../../lib/deck/edit/source";

/** Parse an authored island only if it keeps the same document context. */
function parseSourceSlide(html: string, key: string, parse: (html: string) => Document, mode: string): HTMLElement | null {
  const doc = parse(`${mode === "CSS1Compat" ? "<!doctype html>" : ""}<main data-deck-slides>${html}</main>`), main = doc.body.firstElementChild;
  const slide = main?.querySelector<HTMLElement>(":scope > section[data-deck-slide]");
  if (doc.documentElement.attributes.length || doc.body.attributes.length || doc.head.hasChildNodes() || doc.body.children.length !== 1 || !main?.matches("main[data-deck-slides]") || main.children.length !== 1 || slide?.getAttribute("data-deck-node") !== key) return null;
  if ([...doc.body.childNodes].some(child => child !== main && child.textContent?.trim()) || [...main.childNodes].some(child => child !== slide && child.textContent?.trim())) return null;
  return slide ?? null;
}

export function parseDeckSourceSlide(html:string,key:string,parse:(html:string)=>Document,mode:string,expected:string|null):HTMLElement|null {
  const slide=parseSourceSlide(html,key,parse,mode);return slide&&expected!==null&&slide.outerHTML===expected?slide:null;
}
/** Only primitive text/style edits produce this patch. The surrounding source
 * bytes and pre-edit DOM context must still match before adopting it. */
export function applyDeckLocalSourcePatch(patch:DeckLocalSourcePatch,doc:Document,parse:(html:string)=>Document):boolean {
  const old=[...doc.querySelectorAll<HTMLElement>("section[data-deck-slide][data-deck-node]")].find(node=>node.getAttribute("data-deck-node")===patch.slideId);
  if(!old||!parseDeckSourceSlide(patch.beforeSlide,patch.slideId,parse,doc.compatMode,old.outerHTML))return false;
  const next=parseSourceSlide(patch.afterSlide,patch.slideId,parse,doc.compatMode);if(!next)return false;
  old.replaceWith(doc.importNode(next,true));return true;
}

/** Reuse an inert source DOM only where the authored surrounding bytes match. */
export function updateDeckSourceDocument(before: string, after: string, doc: Document, parse: (html: string) => Document): Document {
  const a = deckRenderSnapshot(before), b = deckRenderSnapshot(after);
  const head = deckSourceHeadChange(before,after);
  if (head !== null) {
    const next = parse(`<!doctype html><html>${head}<body></body></html>`);
    if (!next.body.hasChildNodes() && next.documentElement.attributes.length === 0 && next.body.attributes.length === 0) {
      doc.head.replaceWith(doc.importNode(next.head,true));
      return doc;
    }
  }
  if (a && b && a.shell === b.shell) {
    const nodes = new Map([...doc.querySelectorAll<HTMLElement>("section[data-deck-slide][data-deck-node]")].map(node => [node.getAttribute("data-deck-node"),node]));
    const replacements: Array<{old:HTMLElement;next:HTMLElement}> = [];
    for (const [key,html] of b.slides) {
      if (a.slides.get(key) === html) continue;
      const old = nodes.get(key), next = parseDeckSourceSlide(html,key,parse,doc.compatMode,b.structure(key));
      if (!old || !next || old.outerHTML !== a.structure(key)) return parse(after);
      replacements.push({old,next});
    }
    for (const {old,next} of replacements) old.replaceWith(doc.importNode(next,true));
    return doc;
  }
  // 枚をまるごと差し込んだだけ（複製・追加）なら、資料全体を読み直さずに差し込んだ枚だけを足す。
  // 300 枚では全体の読み直しが遅い端末で 100ms を超え、その間の入力が止まるため。1 枚ずつ、通常の読み取りと
  // 同じ形になることを確かめてから足し、1 つでも確かめられなければ全体を読み直す。
  const inserted = b ? deckSlideInsertions(before, after) : null, main = doc.querySelector("main[data-deck-slides]");
  if (b && inserted && main && main.childNodes.length === inserted.childCount) {
    const runs: Array<{index:number;nodes:HTMLElement[]}> = [];
    for (const run of inserted.runs) {
      const nodes: HTMLElement[] = [];
      for (const slide of run.slides) {
        const next = parseDeckSourceSlide(slide.html, slide.id, parse, doc.compatMode, b.structure(slide.id));
        if (!next) return parse(after);
        nodes.push(next);
      }
      runs.push({index:run.childIndex,nodes});
    }
    const anchors = runs.map(run => run.index < 0 ? null : main.childNodes[run.index] ?? null);
    runs.forEach((run,i) => { for (const node of run.nodes) main.insertBefore(doc.importNode(node,true), anchors[i]); });
    return doc;
  }
  return parse(after);
}
