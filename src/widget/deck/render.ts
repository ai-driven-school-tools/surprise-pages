import {parseDeckSourceSlide} from "./edit/source-document";
import type { DeckRenderChange } from "../../lib/deck/render-contract";
import { readDeckDesign } from "../../lib/deck/design/dom";
import { effectiveAppearance } from "../../lib/deck/design/design";
import { prepareDeckFonts } from "../../lib/deck/design/typography";
import { releaseDeckVideo } from "../../lib/deck/playback";
import { deckSettingsComparison, deckRenderSnapshot } from "../../lib/deck/edit/source";
import { DECK_VIDEO_SUSPENDED_SOURCE, writeMediaSource } from "../../lib/deck/media/video-source";
import { LocalizedError } from "../../lib/i18n/errors";

const NODE = "data-deck-node";
const SLIDE = "section[data-deck-slide]";
const SETTINGS = "title,script[type='application/json'][data-deck-appearance],script[type='application/json'][data-deck-design],script[type='application/json'][data-deck-focus],script[type='application/json'][data-deck-focus-overrides],script[type='application/json'][data-deck-logo],script[type='application/json'][data-deck-logo-overrides]";
const parse = (html: string) => new DOMParser().parseFromString(html, "text/html");
const id = (node: Element) => node.getAttribute(NODE) ?? "";
const find = (root: ParentNode, key: string) => root.querySelector<HTMLElement>(`[${NODE}="${CSS.escape(key)}"]`);
const children = (root: Element) => [...root.querySelectorAll<HTMLElement>(`[${NODE}]`)].filter(n => n.parentElement?.closest(`[${NODE}]`) === root);
function shell(element: Element): string {
  const copy = element.cloneNode(true);
  if (!(copy instanceof Element)) throw new LocalizedError("deckEditor.view.shell");
  for (const child of children(copy)) child.replaceWith(copy.ownerDocument.createComment(`deck-child:${id(child)}`));
  for (const attr of [...copy.attributes]) copy.removeAttribute(attr.name);
  return copy.innerHTML;
}
function envelope(doc: Document): string {
  const copy = doc.documentElement.cloneNode(true);
  if (!(copy instanceof Element)) return "";
  copy.querySelectorAll(`head>${SETTINGS.split(",").join(",head>")}`).forEach(n => n.remove());
  copy.querySelector("main[data-deck-slides]")?.replaceChildren();
  return copy.outerHTML;
}
export type DeckPaintPlan = {
  change: DeckRenderChange;
  nodesChanged: boolean;
  nodeSlides: readonly string[];
  prepare(): Promise<void>;
  apply(): Promise<void>;
};

/** Compare authored trees, then touch only changed authored islands in the live
 * document. Generated SVG, input chrome and media state are never serialized. */
export function planDeckPaint(live: Document, beforeHtml: string, afterHtml: string): DeckPaintPlan | null {
  const beforeSettings=deckSettingsComparison(beforeHtml),afterSettings=deckSettingsComparison(afterHtml);
  const settingsOnly=beforeSettings!==null && afterSettings!==null && beforeSettings.body===afterSettings.body;
  const oldSource = settingsOnly ? null : deckRenderSnapshot(beforeHtml), nextSource = settingsOnly ? null : deckRenderSnapshot(afterHtml);
  const compact = oldSource !== null && nextSource !== null;
  const before = parse(settingsOnly?beforeSettings.minimal:compact?oldSource.shell:beforeHtml), after = parse(settingsOnly?afterSettings.minimal:compact?nextSource.shell:afterHtml);
  function authoredSlide(node: HTMLElement, source: ReturnType<typeof deckRenderSnapshot>): HTMLElement | null {
    if (!compact || !source) return node;
    const fragment = source.slides.get(id(node));
    if (fragment === undefined) return null;
    return parseDeckSourceSlide(fragment,id(node),parse,node.ownerDocument.compatMode,source.structure(id(node)));
  }
  if (envelope(before) !== envelope(after)) return null;
  const oldSlides = [...before.querySelectorAll<HTMLElement>(SLIDE)], nextSlides = [...after.querySelectorAll<HTMLElement>(SLIDE)];
  if (!live.deckLayout || !live.deckRenderer) return null;
  const edits: (() => void)[] = [], released: Element[] = [], dirty = new Set<string>(), nodeSlides = new Set<string>();
  let structure = false;
  function reconcile(old: HTMLElement, next: HTMLElement): boolean {
    if (old.outerHTML === next.outerHTML) return true;
    const target = find(live, id(old));
    if (!target) return false;
    const own = (node:Element) => shell(node).replace(/<!--deck-child:[^>]*-->/g, "");
    if (old.tagName !== next.tagName || own(old) !== own(next)) {
      released.push(target); structure = true;
      edits.push(() => target.replaceWith(live.importNode(next, true)));
      return true;
    }
    const keys = new Set([...old.attributes, ...next.attributes].map(a => a.name));
    const changes = [...keys].filter(key => old.getAttribute(key) !== next.getAttribute(key));
    if (old.matches(SLIDE) && changes.includes("data-deck-skip")) structure = true;
    edits.push(() => {
      for (const key of changes) {
        if (key === "style") {
          for (const property of new Set([...old.style, ...next.style])) {
            if (old.style.getPropertyValue(property) === next.style.getPropertyValue(property) && old.style.getPropertyPriority(property) === next.style.getPropertyPriority(property)) continue;
            const value = next.style.getPropertyValue(property);
            if (value) target.style.setProperty(property, value, next.style.getPropertyPriority(property)); else target.style.removeProperty(property);
          }
        } else {
          const value = next.getAttribute(key);
          const video = target.tagName === "VIDEO" ? target : target.tagName === "SOURCE" ? target.closest("video") : null;
          const Video = live.defaultView?.HTMLVideoElement;
          if (key === "src" && Video && video instanceof Video) {
            if (!target.hasAttribute(DECK_VIDEO_SUSPENDED_SOURCE)) releaseDeckVideo(video);
            if (value === null) { target.removeAttribute("src"); target.removeAttribute(DECK_VIDEO_SUSPENDED_SOURCE); }
            else writeMediaSource(target,value);
          } else if (value === null) target.removeAttribute(key); else target.setAttribute(key, value);
        }
      }
    });
    const oldChildren = children(old), nextChildren = children(next);
    const previous = new Map(oldChildren.map(n=>[id(n),n])), upcoming = new Map(nextChildren.map(n=>[id(n),n]));
    const orderChanged = oldChildren.map(id).join(" ") !== nextChildren.map(id).join(" ");
    // Child order is safe to patch only for direct authored children. Wrappers
    // without permanent IDs stay one indivisible island.
    if(orderChanged && [...oldChildren,...nextChildren].some(n=>n.parentElement!==old&&n.parentElement!==next))return false;
    for(const child of oldChildren)if(!upcoming.has(id(child))){const node=find(live,id(child));if(!node)return false;released.push(node);edits.push(()=>node.remove());structure=true;}
    for(const child of nextChildren){
      const was=previous.get(id(child));
      if(was){if(!reconcile(was,child))return false;}
      else {edits.push(()=>target.append(live.importNode(child,true)));structure=true;}
    }
    if(orderChanged){structure=true;edits.push(()=>{
      // Move from the end, preserving non-authored runtime children.
      let anchor:Element|null=null;
      for(const child of [...nextChildren].reverse()){const node=find(live,id(child));if(node){if(node.parentElement!==target||node.nextElementSibling!==anchor)target.insertBefore(node,anchor);anchor=node;}}
    });}
    return true;
  }
  const previous = new Map(oldSlides.map(n => [id(n), n]));
  for (const summary of nextSlides) {
    const oldSummary = previous.get(id(summary));
    if (compact ? oldSource.slides.get(id(summary)) === nextSource.slides.get(id(summary)) : oldSummary?.outerHTML === summary.outerHTML) continue;
    const next = authoredSlide(summary,nextSource), old = oldSummary ? authoredSlide(oldSummary,oldSource) : null;
    if (!next || oldSummary && !old) return null;
    dirty.add(next.getAttribute("data-deck-id") ?? id(next));nodeSlides.add(id(next));
    if (!old) { structure = true; edits.push(() => live.querySelector("main[data-deck-slides]")?.append(live.importNode(next, true))); continue; }
    // Notes are moved outside the slide by the presentation runtime.
    const oldNote = old.querySelector(":scope>aside[data-deck-notes]"), nextNote = next.querySelector(":scope>aside[data-deck-notes]");
    if (oldNote?.outerHTML !== nextNote?.outerHTML) {
      const frame = find(live, id(old))?.closest("[data-deck-frame]");
      if (!frame) return null;
      edits.push(() => { frame.querySelector(":scope>aside[data-deck-notes]")?.remove(); if (nextNote) frame.append(live.importNode(nextNote, true)); });
    }
    oldNote?.remove(); nextNote?.remove();
    if (!reconcile(old, next)) return null;
  }
  const nextIds = new Set(nextSlides.map(id));
  for (const old of oldSlides) if (!nextIds.has(id(old))) {
    const target = find(live, id(old)); if (!target) return null;
    structure = true;nodeSlides.add(id(old)); released.push(target); edits.push(() => (target.closest("[data-deck-frame]") ?? target).remove());
  }
  const orderChanged = oldSlides.map(id).join(" ") !== nextSlides.map(id).join(" ");
  const nodesChanged = dirty.size > 0 || oldSlides.length !== nextSlides.length;
  structure ||= orderChanged;
  const settings = (doc: Document) => [...doc.head.querySelectorAll(SETTINGS)].map(n => n.outerHTML).join("");
  const settingsChanged = settings(before) !== settings(after);
  const appearance = ["data-deck-design", "data-deck-appearance"].some(mark => before.querySelector(`script[${mark}]`)?.textContent !== after.querySelector(`script[${mark}]`)?.textContent);
  if (appearance) {
    const a = readDeckDesign(before), b = readDeckDesign(after);
    if (!a || !b) return null;
    for (const slideId of b.ids) if (JSON.stringify(effectiveAppearance(a.design,a.overrides,slideId)) !== JSON.stringify(effectiveAppearance(b.design,b.overrides,slideId))) dirty.add(slideId);
  }
  return {
    nodesChanged,nodeSlides:[...nodeSlides],
    change: { slides: [...dirty], structure, appearance, customization: ["data-deck-focus","data-deck-focus-overrides","data-deck-logo","data-deck-logo-overrides"].some(mark=>before.querySelector(`script[${mark}]`)?.textContent!==after.querySelector(`script[${mark}]`)?.textContent) },
    async prepare() {
      const source = readDeckDesign(after);
      if (source) { try { await prepareDeckFonts(live, source.ids.map(key => effectiveAppearance(source.design, source.overrides, key).typography)); } catch { throw new LocalizedError("deckEditor.view.fonts"); } }
    },
    async apply() {
      live.deckRenderer?.release(released);
      for (const root of released) for (const video of root.querySelectorAll("video")) releaseDeckVideo(video);
      for (const edit of edits) edit();
      if (orderChanged) {
        const main = live.querySelector("main[data-deck-slides]");
        if (main) {
          const current = [...main.querySelectorAll<HTMLElement>(SLIDE)];
          const frames = new Map(current.map(slide => [id(slide), slide.closest("[data-deck-frame]") ?? slide]));
          let anchor = current.at(-1)?.closest("[data-deck-frame]")?.nextElementSibling ?? null;
          for (const slide of [...nextSlides].reverse()) {
            const target = frames.get(id(slide)); if (!target) continue;
            if (target.parentElement !== main || target.nextElementSibling !== anchor) main.insertBefore(target, anchor);
            anchor = target;
          }
        }
      }
      if (settingsChanged) {
        live.head.querySelectorAll(SETTINGS).forEach(n => n.remove());
        for (const node of after.head.querySelectorAll(SETTINGS)) live.head.append(live.importNode(node, true));
      }
      if (structure) live.deckLayout?.refresh();
      await live.deckRenderer?.update(this.change);
    },
  };
}
