import { parseFragment } from "parse5";
import { sourceTree, sourceTreeEntry } from "../../html/source-index";
import { applyDeckEditOperations, inspectDeckNode, deckRenderSnapshot, deckEditableNodeIds } from "./source";
import { DeckEditConflictError, type DeckEditOperation } from "./model";
import { defaultTranslate } from "../../i18n/default";

type Range = { start: number; end: number; id: string };
export type DeckLocalSourcePatch = {before:string;after:string;slideId:string;beforeSlide:string;afterSlide:string};
/** Session-scoped index, not a second document model. All validation and inverse generation still
 * go through the canonical operation applier, on the affected authored slide.
 * Structural edits also validate identities against the rest of the document.
 * Remote/document-wide changes invalidate the index by exact source equality. */
export function createDeckLocalEdits() {
  let indexed = "", isolated = false;
  let localPatch: DeckLocalSourcePatch | null = null;
  const prefix = "<!doctype html><html><body data-deck><main data-deck-slides>", suffix = "</main></body></html>";
  const targets = new Map<string, Range>();
  const reserved = new Map<string, Range | null>();
  const slides: Range[] = [];
  function prepare(html: string) {
    if (indexed === html) { if(!isolated&&sourceTreeEntry(html))isolated=sourceTreeEntry(html)?.tree.mode==="no-quirks"&&deckRenderSnapshot(html)!==null;return; }
    targets.clear(); reserved.clear(); slides.length = 0;
    const tree = sourceTree(html), editable = deckEditableNodeIds(html);
    isolated = tree.mode === "no-quirks" && deckRenderSnapshot(html) !== null;
    function walk(node: typeof tree.childNodes[number], slide?: Range) {
      if ("tagName" in node) {
        if (node.tagName === "section" && node.attrs.some(a => a.name === "data-deck-slide") && node.sourceCodeLocation) {
          slide = { start: node.sourceCodeLocation.startOffset, end: node.sourceCodeLocation.endOffset, id: node.attrs.find(a=>a.name==="data-deck-node")?.value??"" }; slides.push(slide);
        }
        const id = node.attrs.find(a => a.name === "data-deck-node")?.value;
        if(id)reserved.set(id,slide??null);
        if (slide && id && editable.has(id)) targets.set(id, slide);
      }
      if ("childNodes" in node) for (const child of node.childNodes) walk(child, slide);
    }
    tree.childNodes.forEach(node => walk(node)); indexed = html;
  }
  const editor = {
    prepare,
    inspect(html:string,id:string) {
      prepare(html);
      if(!isolated){
        if(!sourceTreeEntry(html)){const value=inspectDeckNode(html,id);isolated=sourceTreeEntry(html)?.tree.mode==="no-quirks"&&deckRenderSnapshot(html)!==null;return value;}
        isolated=sourceTreeEntry(html)?.tree.mode==="no-quirks"&&deckRenderSnapshot(html)!==null;
      }
      const range=targets.get(id);
      return isolated&&range ? inspectDeckNode(prefix+html.slice(range.start,range.end)+suffix,id) : inspectDeckNode(html,id);
    },
    takePatch(){const value=localPatch;localPatch=null;return value;},
    apply(html: string, operations: readonly DeckEditOperation[]): {html:string;inverse:DeckEditOperation[]} {
      localPatch=null;
      if (!operations.length) return { html, inverse: [] };
      const group = (op:DeckEditOperation) => op.kind === "text" || op.kind === "style" ? 1 : op.kind === "setting-field" || op.kind === "setting" && ["appearance","focus","logo","title"].includes(op.name) ? 2 : 0;
      const first = group(operations[0]);
      const boundary = first ? operations.findIndex(op=>group(op)!==first) : -1;
      if (boundary > 0) {
        // Pending typing followed by a structural edit still uses the local
        // slide index. Keep the structural suffix atomic for outline checks.
        const prefix=editor.apply(html,operations.slice(0,boundary));
        const suffix=editor.apply(prefix.html,operations.slice(boundary));
        return {html:suffix.html,inverse:[...suffix.inverse,...prefix.inverse]};
      }
      if (operations.some(op => op.kind === "setting" || op.kind === "setting-field" || op.kind === "outline")) {
        const result = applyDeckEditOperations(html, operations);
        // Head-only appearance changes do not invalidate the slide index.
        // Compare the exact authored span, never infer identity from position.
        if (indexed === html && slides.length && operations.every(op => op.kind === "setting" || op.kind === "setting-field")) {
          const span = html.slice(slides[0].start, slides[slides.length - 1].end);
          const start = result.html.indexOf(span);
          if (start >= 0 && result.html.lastIndexOf(span) === start) {
            const delta = start - slides[0].start;
            for (const slide of slides) { slide.start += delta; slide.end += delta; }
            indexed = result.html;
          }
        }
        return result;
      }
      if (operations.some(op=>!["text","style","image","insert","remove","restore","notes","fragment","order","attribute","chart-value","video-source"].includes(op.kind)||op.kind==="attribute"&&op.name==="data-deck-parent")) return applyDeckEditOperations(html,operations);
      prepare(html);
      if(!isolated)return applyDeckEditOperations(html,operations);
      const targetRange = (op: DeckEditOperation) => targets.get(op.kind === "fragment" ? op.parentId : op.target);
      const range = targetRange(operations[0]);
      if (!range || !operations.every(op => targetRange(op) === range)) return applyDeckEditOperations(html, operations);
      const beforeSlide=html.slice(range.start,range.end);
      const changed = applyDeckEditOperations(prefix + beforeSlide + suffix, operations);
      const fragment = changed.html.slice(prefix.length, -suffix.length);
      if (!operations.every(op => op.kind === "text" || op.kind === "style")) {
        const ids = new Set<string>();
        const tree = parseFragment(fragment);
        function walk(node: typeof tree.childNodes[number]) {
          if ("tagName" in node) {
            const id = node.attrs.find(a => a.name === "data-deck-node")?.value;
            if (id) {
              if (ids.has(id) || reserved.has(id) && reserved.get(id) !== range) throw new DeckEditConflictError(defaultTranslate("deckEditor.conflict.duplicateIds"));
              ids.add(id);
            }
          }
          if ("childNodes" in node) node.childNodes.forEach(walk);
        }
        tree.childNodes.forEach(walk);
        const editable=deckEditableNodeIds(changed.html);
        for (const [id, owner] of targets) if (owner === range && !editable.has(id)) targets.delete(id);
        for (const [id, owner] of reserved) if (owner === range && !ids.has(id)) reserved.delete(id);
        for (const id of ids) reserved.set(id,range);
        for (const id of editable) targets.set(id,range);
      }
      const next = html.slice(0, range.start) + fragment + html.slice(range.end);
      if(isolated && next!==html && operations.every(op=>op.kind==="text"||op.kind==="style"))localPatch={before:html,after:next,slideId:range.id,beforeSlide,afterSlide:fragment};
      if(!operations.every(op=>op.kind==="text"||op.kind==="style"))isolated=false;
      const delta = fragment.length - (range.end - range.start);
      for (const other of slides) if (other.start > range.start) { other.start += delta; other.end += delta; }
      range.end += delta; indexed = next;
      return { html: next, inverse: changed.inverse };
    },
    dispose() { indexed = ""; isolated=false;localPatch=null; targets.clear();reserved.clear(); slides.length = 0; },
  };
  return editor;
}
