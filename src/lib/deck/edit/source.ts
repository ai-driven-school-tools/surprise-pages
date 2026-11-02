import {serializeOuter} from "parse5";
import {withVendorScripts} from "../../html/vendor-scripts";
import {isStockDesign} from "../design/stock-design";
import { DECK_PARENT, validateOutline, moveOutline, outlineRoots, type OutlineEntry } from "../outline";
import { navigationRuntime } from "../preview.generated";
import legacyNavigation from "../../../templates/deck-navigation-legacy.json";
import { themeStampSchema } from "../design/theme-model";
import { diagramKit } from "../design/library.generated.json";
import { deckNativeSourceSchema } from "../native-source";
import { parseFragment, type DefaultTreeAdapterMap } from "parse5";
import {sourceTree,cacheSourceTree,sourceTreeEntry,cloneSourceTree,prepareSourceTree} from "../../html/source-index";
import { diffChars } from "diff";
import { readDeckChartSource } from "../design/chart-source";
import { deckOverridesSchema, deckDesignSchema, emptyOverrides } from "../design/design";
import { deckFocusSchema, deckFocusOverridesSchema, emptyFocusOverrides } from "../design/focus";
import { deckLogoSchema, deckLogoOverridesSchema, emptyLogoOverrides } from "../media/logo";
import {
  DECK_CREATED_MARK, DECK_EMPTY_TEXT_PREFIX, DECK_NODE_MARK, DeckEditConflictError,
  deckCreatedNodeSchema, deckEditOperationSchema, deckEditOperationsSchema, deckEditRecordOperationsSchema, deckEditStylePropertySchema, deckNodeIdSchema,
  type DeckCreatedNode, type DeckEditableNode, type DeckEditOperation,
} from "./model";
import { defaultTranslate } from "../../i18n/default";

export { DeckEditConflictError } from "./model";
type Node = DefaultTreeAdapterMap["node"];
type Element = DefaultTreeAdapterMap["element"];
type Slot = { start: number; end: number; text: string };
type Entry = { element: Element; slide: Element; id: string; slots: Slot[] };
type Patch = { start: number; end: number; text: string };
const skippedTags = new Set(["script", "style", "svg", "template", "canvas", "iframe", "object", "noscript"]);
const runtimeMarks = ["data-deck-youtube", "data-dd-chart", "data-dd-native-diagram", "data-dd-mermaid-diagram"];
const attr = (element: Element, name: string) => element.attrs.find(value => value.name === name)?.value;
const escapeText = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const escapeAttribute = (text: string) => escapeText(text).replace(/"/g, "&quot;");

/** JSONB may reorder dictionaries; arrays and authored HTML remain exact. */
function sameJsonValue(left:unknown,right:unknown):boolean{
  const ordered=(_key:string,value:unknown):unknown=>value!==null&&typeof value==="object"&&!Array.isArray(value)
    ?Object.fromEntries(Object.entries(value).sort(([a],[b])=>a<b?-1:a>b?1:0)):value;
  return JSON.stringify(left,ordered)===JSON.stringify(right,ordered);
}

const entryIndexes = new WeakMap<DefaultTreeAdapterMap["document"], { entries: Entry[]; complete: boolean }>();
const elementIndexes = new WeakMap<DefaultTreeAdapterMap["document"], Element[]>();

function patch(html: string, edits: readonly Patch[]): string {
  let result = html;
  let boundary = html.length;
  for (const item of [...edits].sort((a, b) => b.start - a.start)) {
    if (item.start < 0 || item.end > boundary || item.start > item.end) throw new DeckEditConflictError(defaultTranslate("deckEditor.conflict.patchOverlap"));
    result = result.slice(0, item.start) + item.text + result.slice(item.end);
    boundary = item.start;
  }
  return result;
}

function reuseTokenIndex(html:string,next:string,location:NonNullable<Element["sourceCodeLocation"]>,encoded:string,visit:(node:Node,source:Readonly<Node>)=>boolean,inheritFingerprint=false,afterShift?:()=>void):void{
  const cached=sourceTreeEntry(html);
  if(!cached||/[\r\0]/.test(encoded))return;
  const delta=encoded.length-(location.endOffset-location.startOffset);
  const lines=encoded.split("\n"),endLine=location.startLine+lines.length-1;
  const endCol=lines.length===1?location.startCol+encoded.length:lines.at(-1)!.length+1;
  let replaced=false;
  const shift=(value:NonNullable<Element["sourceCodeLocation"]>):void=>{
    for(const edge of ["start","end"] satisfies Array<"start"|"end">){
      const offset=edge==="start"?value.startOffset:value.endOffset;
      if(offset<location.endOffset || location.startOffset===location.endOffset && edge==="end" && offset===location.startOffset)continue;
      const line=edge==="start"?value.startLine:value.endLine,col=edge==="start"?value.startCol:value.endCol;
      const nextLine=line+(endLine-location.endLine),nextCol=line===location.endLine?endCol+col-location.endCol:col;
      if(edge==="start"){value.startOffset+=delta;value.startLine=nextLine;value.startCol=nextCol;}
      else{value.endOffset+=delta;value.endLine=nextLine;value.endCol=nextCol;}
    }
  };
  // The clone already visits every node and deduplicates aliased locations.
  // Adjust each copy there, instead of walking the entire document a second time.
  const tree=cloneSourceTree(cached.tree,{location:shift,node:(copy,source)=>{if(visit(copy,source))replaced=true;}});
  if(replaced){afterShift?.();cacheSourceTree(next,{tree,...(inheritFingerprint&&cached.fingerprint?{fingerprint:cached.fingerprint}:{})});}
}

/** 設定（head の中）だけを変えた原稿の木を、本文を読み直さずに作って手元に残す。head は小さな原稿（新しい head と
 * 空の本文）で読んだ木に差し替え、head より後ろは位置をずらすだけ（head は明示の閉じタグで終わるので、後ろの読み方は
 * 変わらない）。確かめられないときは何もしない（必要になった側が通常どおり読む）。300 枚の資料で配色を変えるたびに
 * 本文ごと読み直して入力を止めないため。通常の読み取りと同じ木になることは単体の検査で突き合わせる。 */
function reuseHeadIndex(html:string,next:string,head:Element,minimal:string):void{
  const location=head.sourceCodeLocation;
  if(!location?.endTag)return;
  const fresh=cloneSourceTree(sourceTree(minimal));
  const root=fresh.childNodes.find((node):node is Element=>"tagName" in node&&node.tagName==="html");
  const replacement=root?.childNodes.find((node):node is Element=>"tagName" in node&&node.tagName==="head");
  const at=replacement?.sourceCodeLocation;
  if(!replacement||!at?.endTag||at.startOffset!==location.startOffset||next.slice(0,at.endOffset)!==minimal.slice(0,at.endOffset))return;
  reuseTokenIndex(html,next,location,next.slice(at.startOffset,at.endOffset),(copy,source)=>{
    if(source!==head||!("tagName" in copy))return false;
    copy.attrs=replacement.attrs;copy.childNodes=replacement.childNodes;copy.sourceCodeLocation=at;
    for(const child of copy.childNodes)child.parentNode=copy;
    return true;
  });
}

/** Reuse parse5's derived tree only for an existing, nonempty text token.
 * The HTML itself is still patched byte-for-byte. Tags, empty-slot comments,
 * parser-normalized control characters and foreign namespaces use a full parse.
 * Clone first: earlier revisions and their location indexes remain immutable. */
function patchTextToken(html:string,parent:Element,slot:Slot,encoded:string,decoded:string,plain=false):string{
  const next=patch(html,[{start:slot.start,end:slot.end,text:encoded}]);
  const cached=sourceTreeEntry(html);
  const stableTags=new Set(["h1","h2","h3","h4","h5","h6","p","span","strong","em","b","i","u","s","a","code","li","td","th","div"]);
  if(!cached||!encoded||/[\r\0]/.test(encoded)||parent.namespaceURI!=="http://www.w3.org/1999/xhtml"||!(plain?stableTags.has(parent.tagName):parent.tagName==="script"))return next;
  const original=parent.childNodes.find(node=>"value" in node&&node.sourceCodeLocation?.startOffset===slot.start&&node.sourceCodeLocation.endOffset===slot.end);
  const location=original?.sourceCodeLocation;if(!original||!location)return next;
  if(plain){
    // HTML's table/adoption rules can move or concatenate authored text across
    // tag boundaries. Such text is not a local token in its parsed parent.
    const parentLocation=parent.sourceCodeLocation;
    if(!parentLocation?.startTag||slot.start<parentLocation.startTag.endOffset||slot.end>parentLocation.endOffset)return next;
    const index=parent.childNodes.indexOf(original);
    const previous=index>0?parent.childNodes[index-1].sourceCodeLocation?.endOffset:parentLocation.startTag.endOffset;
    const following=index+1<parent.childNodes.length?parent.childNodes[index+1].sourceCodeLocation?.startOffset:parentLocation.endTag?.startOffset??parentLocation.endOffset;
    if(slot.start!==previous||slot.end!==following)return next;
    if(parent.childNodes.some(child=>child!==original&&child.sourceCodeLocation&&child.sourceCodeLocation.startOffset<=slot.start&&child.sourceCodeLocation.endOffset>slot.start))return next;
    const tokens=parseFragment(html.slice(slot.start,slot.end)).childNodes;
    if(tokens.length!==1||!("value" in tokens[0])||tokens[0].value!==slot.text)return next;
  }
  let inheritFingerprint=plain;
  let ancestor:Node|null=parent;
  while(ancestor){if("tagName" in ancestor&&attr(ancestor,DECK_CREATED_MARK)!==undefined)inheritFingerprint=false;ancestor="parentNode" in ancestor?ancestor.parentNode:null;}
  reuseTokenIndex(html,next,location,encoded,(node,source)=>{
    const at=source.sourceCodeLocation;
    if("value" in node&&at?.startOffset===slot.start&&at.endOffset===slot.end){node.value=decoded;return true;}
    return false;
  },inheritFingerprint);
  return next;
}

function textSlots(element: Element): Slot[] {
  const slots: Slot[] = [];
  for (const child of element.childNodes) {
    const location = child.sourceCodeLocation;
    if (!location) continue;
    if ("value" in child) slots.push({ start: location.startOffset, end: location.endOffset, text: child.value });
    else if ("data" in child && child.data === `${DECK_EMPTY_TEXT_PREFIX}${slots.length}`) {
      slots.push({ start: location.startOffset, end: location.endOffset, text: "" });
    }
  }
  // A newly inserted empty text box still has an editable slot.
  return slots;
}

function sourceEntries(html: string, requireIds: boolean): Entry[] {
  const tree = sourceTree(html);
  const cached = entryIndexes.get(tree);
  if (cached && (!requireIds || cached.complete)) return cached.entries;
  const result: Entry[] = [];
  const used = new Set<string>();
  let deck = false;
  function walk(node: Node, slide: Element | null, excluded: boolean): void {
    if (!("tagName" in node)) {
      if ("childNodes" in node) node.childNodes.forEach(child => walk(child, slide, excluded));
      return;
    }
    const id = attr(node, DECK_NODE_MARK);
    if (node.tagName === "body" && attr(node, "data-deck") !== undefined) deck = true;
    if (id !== undefined) {
      deckNodeIdSchema.parse(id);
      if (used.has(id)) throw new DeckEditConflictError(defaultTranslate("deckEditor.conflict.duplicateIds"));
      used.add(id);
    }
    const ownSlide = node.tagName === "section" && attr(node, "data-deck-slide") !== undefined ? node : slide;
    const blocked = excluded || skippedTags.has(node.tagName) || attr(node, "data-deck-notes") !== undefined ||
      (attr(node, "class") ?? "").split(/\s+/).includes("mermaid");
    if (ownSlide && !blocked && node.sourceCodeLocation?.startTag) {
      if (requireIds && !id) throw new DeckEditConflictError(defaultTranslate("deckEditor.conflict.sourceUpdated"));
      result.push({ element: node, slide: ownSlide, id: id ?? "", slots: runtimeMarks.some(mark => attr(node, mark) !== undefined) ? [] : textSlots(node) });
    }
    const excludeChildren = blocked || runtimeMarks.some(mark => attr(node, mark) !== undefined);
    node.childNodes.forEach(child => walk(child, ownSlide, excludeChildren));
  }
  walk(tree, null, false);
  if (!deck) throw new DeckEditConflictError(defaultTranslate("deckEditor.conflict.noSlides"));
  entryIndexes.set(tree, { entries: result, complete: result.every(entry => Boolean(entry.id)) });
  return result;
}

/** A deterministic namespace prevents an entirely replaced manuscript from reusing old targets. */
function sourceNamespace(html: string): string {
  let left = 2166136261;
  let right = 2246822507;
  for (let at = 0; at < html.length; at += 1) {
    left = Math.imul(left ^ html.charCodeAt(at), 16777619);
    right = Math.imul(right ^ html.charCodeAt(at), 3266489909);
  }
  return `${(left >>> 0).toString(36)}-${(right >>> 0).toString(36)}`;
}

/** Stable ids are added explicitly once. Existing ids are never recalculated from position. */
export function prepareDeckEdit(html: string): { html: string; nodes: DeckEditableNode[] } {
  const entries = sourceEntries(html, false);
  // Almost all collaborative saves already carry stable identities. Avoid a
  // second full parse and namespace hash on every keystroke in that case.
  if(entries.every(entry=>entry.id)){let nodes:DeckEditableNode[]|undefined;return {html,get nodes(){return nodes??=entries.map(view);}};}
  const used = new Set(entries.map(entry => entry.id).filter(Boolean));
  // Reserve identities even on excluded runtime/notes elements.
  const reserve = (node: Node): void => {
    if ("tagName" in node) { const id = attr(node, DECK_NODE_MARK); if (id) used.add(id); }
    if ("childNodes" in node) node.childNodes.forEach(reserve);
  };
  reserve(sourceTree(html));
  const namespace = sourceNamespace(html);
  let serial = 0;
  const edits: Patch[] = [];
  for (const entry of entries) {
    if (entry.id) continue;
    let id: string;
    do { serial += 1; id = `node-${namespace}-${serial.toString(36)}`; } while (used.has(id));
    used.add(id);
    const location = entry.element.sourceCodeLocation?.startTag;
    if (!location) throw new DeckEditConflictError();
    const raw = html.slice(location.startOffset, location.endOffset);
    const at = location.endOffset - (raw.endsWith("/>") ? 2 : 1);
    edits.push({ start: at, end: at, text: ` ${DECK_NODE_MARK}="${id}"` });
  }
  const prepared = patch(html, edits);
  const complete=sourceEntries(prepared,true);let nodes:DeckEditableNode[]|undefined;
  return { html: prepared, get nodes(){return nodes??=complete.map(view);} };
}

/** The source preparation model is lazy; server callers need no node DTOs. */
export function prepareDeckSource(html:string):string{return prepareDeckEdit(html).html;}
export function assertDeckSourceIdentities(html:string):void{sourceEntries(html,true);}

type Declaration = { property: string; start: number; end: number; valueStart: number; valueEnd: number; value: string };
function declarations(style: string): Declaration[] {
  const result: Declaration[] = [];
  let start = 0;
  let quote = "";
  let depth = 0;
  for (let at = 0; at <= style.length; at += 1) {
    const character = style[at];
    if (quote) { if (character === quote && style[at - 1] !== "\\") quote = ""; continue; }
    if (character === "\"" || character === "'") { quote = character; continue; }
    if (character === "(") depth += 1;
    if (character === ")") depth -= 1;
    if ((character === ";" && depth === 0) || at === style.length) {
      const segment = style.slice(start, at);
      const match = /^\s*([\w-]+)\s*:\s*/.exec(segment);
      if (match) {
        const valueStart = start + match[0].length;
        const valueEnd = at - (style.slice(valueStart, at).match(/\s*$/)?.[0].length ?? 0);
        result.push({ property: match[1].toLowerCase(), start, end: character === ";" ? at + 1 : at, valueStart, valueEnd, value: style.slice(valueStart, valueEnd) });
      }
      start = at + 1;
    }
  }
  return result;
}

function view(entry: Entry): DeckEditableNode {
  return {
    id: entry.id,
    slideId: attr(entry.slide, DECK_NODE_MARK) ?? "",
    tag: entry.element.tagName,
    textRuns: entry.slots.map((slot, run) => ({ run, text: slot.text })),
    style: Object.fromEntries(declarations(attr(entry.element, "style") ?? "").map(item => [item.property, item.value])),
    ...(entry.element.tagName === "img" ? { src: attr(entry.element, "src") ?? "", alt: attr(entry.element, "alt") ?? "" } : {}),
    ...(entry.element.tagName === "video" ? { src: attr(entry.element, "src"), poster: attr(entry.element, "poster"), label: attr(entry.element, "aria-label") } : {}),
    created: attr(entry.element, DECK_CREATED_MARK) !== undefined,
  };
}
export function inspectDeckEdit(html: string): { nodes: DeckEditableNode[] } {
  return { nodes: sourceEntries(html, true).map(view) };
}
export function inspectDeckSlideNodes(html:string,slideIds:readonly string[]):DeckEditableNode[] {
  const ids=new Set(slideIds);
  return sourceEntries(html,true).filter(entry=>ids.has(attr(entry.slide,DECK_NODE_MARK)??"")).map(view);
}
export function deckEditableNodeIds(html: string): ReadonlySet<string> {
  return new Set(sourceEntries(html,true).map(entry=>entry.id));
}
export function inspectDeckNode(html: string, id: string): DeckEditableNode | undefined {
  const entry = sourceEntries(html,true).find(entry=>entry.id===id);
  return entry ? view(entry) : undefined;
}

/** A settings-only comparison may omit an identical body from its temporary
 * DOM. Parser locations, not a body-tag regexp, keep script literals safe. */
/** Exact head replacement for a derived DOM; never serializes authored HTML. */
export function deckSourceHeadChange(before: string, after: string): string | null {
  if (!sourceTreeEntry(before) || !sourceTreeEntry(after)) return null;
  const a = sourceElements(before).find(node => node.tagName === "head")?.sourceCodeLocation;
  const b = sourceElements(after).find(node => node.tagName === "head")?.sourceCodeLocation;
  if (!a?.startTag || !a.endTag || !b?.startTag || !b.endTag) return null;
  if (before.slice(0,a.startOffset) !== after.slice(0,b.startOffset) || before.slice(a.endOffset) !== after.slice(b.endOffset)) return null;
  return after.slice(b.startOffset,b.endOffset);
}

type RenderSnapshot = { shell: string; slides: ReadonlyMap<string,string>; structure(key:string):string | null };
const renderSnapshots = new WeakMap<DefaultTreeAdapterMap["document"],RenderSnapshot | null>();
/** Preserve every byte outside authored slide interiors for renderer comparison. */
export function deckRenderSnapshot(html: string): RenderSnapshot | null {
  const tree = sourceTree(html);
  if (renderSnapshots.has(tree)) return renderSnapshots.get(tree) ?? null;
  const slides = new Map<string,string>(), elements = new Map<string,Element>(), normalized = new Map<string,string>(), parts: string[] = [];
  const scopes = new Map<Node,{start:number;end:number}>();
  let cursor = 0;
  for (const node of sourceElements(html).filter(node => node.tagName === "section" && attr(node,"data-deck-slide") !== undefined)) {
    const location = node.sourceCodeLocation, key = attr(node,DECK_NODE_MARK);
    if (!key || slides.has(key) || !location?.startTag || !location.endTag || location.startOffset < cursor) {
      renderSnapshots.set(tree,null); return null;
    }
    slides.set(key,html.slice(location.startOffset,location.endOffset));elements.set(key,node);scopes.set(node,{start:location.startOffset,end:location.endOffset});
    parts.push(html.slice(cursor,location.startTag.endOffset),html.slice(location.endTag.startOffset,location.endOffset));
    cursor = location.endOffset;
  }
  const ranges=[...scopes.values()];
  const bounded=(node:Node,inherited?:{start:number;end:number}):boolean=>{
    const scope=scopes.get(node)??inherited,location=node.sourceCodeLocation;
    // Active formatting reconstructed from another slide and foster-parented
    // nodes couple otherwise unchanged islands. Keep those documents whole.
    if ("tagName" in node && node.tagName === "form") return false;
    if (location && (scope ? location.startOffset < scope.start || location.endOffset > scope.end : ranges.some(range=>location.startOffset>=range.start&&location.startOffset<range.end))) return false;
    if ("childNodes" in node && node.childNodes.some(child=>!bounded(child,scope))) return false;
    return !("content" in node) || bounded(node.content,scope);
  };
  if(!bounded(tree)){renderSnapshots.set(tree,null);return null;}
  parts.push(html.slice(cursor));
  const result = {shell:parts.join(""),slides,structure(key:string){
    const node=elements.get(key);if(!node)return null;
    let value=normalized.get(key);if(value===undefined){value=serializeOuter(node);normalized.set(key,value);}return value;
  }};renderSnapshots.set(tree,result);return result;
}

export function deckSettingsComparison(html: string): { body: string; minimal: string } | null {
  // This shortcut must never introduce a second full parse for ordinary edits.
  if (!sourceTreeEntry(html)) return null;
  const nodes = sourceElements(html);
  const body = nodes.find(node=>node.tagName==="body")?.sourceCodeLocation;
  if (!body?.startTag || !body.endTag) return null;
  const slides = nodes.filter(node=>node.tagName==="section" && attr(node,"data-deck-slide")!==undefined);
  const minimalSlides = slides.map(node=>{
    const tag=node.sourceCodeLocation?.startTag;
    return tag ? html.slice(tag.startOffset,tag.endOffset)+"</section>" : "";
  }).join("");
  return {body:html.slice(body.startOffset,body.endOffset),minimal:html.slice(0,body.startTag.endOffset)+`<main data-deck-slides>${minimalSlides}</main>`+html.slice(body.endTag.startOffset)};
}

type Structure = string | number | null | Structure[];
/**
 * Detect source refreshes which an incremental canvas cannot reproduce. The actual renderer stays
 * authoritative; this is only a compatibility check, never an alternative document model.
 */
export function deckEditStructureFingerprint(html: string): string {
  const cached=sourceTreeEntry(html)?.fingerprint;
  if(cached!==undefined)return cached;
  const entries = sourceEntries(html, true);
  const byId = new Map(entries.map(entry => [entry.id, entry]));
  const slots = new Map(entries.flatMap(entry => entry.slots.map((slot, run) => [slot.start, { end: slot.end, run }])));
  const allowedStyle = new Set<string>(deckEditStylePropertySchema.options);
  function structure(node: Node): Structure {
    const location = node.sourceCodeLocation;
    if (location && ("value" in node || "data" in node)) {
      const slot = slots.get(location.startOffset);
      if (slot && slot.end === location.endOffset) return ["text-slot", slot.run];
    }
    if ("tagName" in node) {
      const entry = byId.get(attr(node, DECK_NODE_MARK) ?? "");
      if (entry && attr(node, DECK_CREATED_MARK) !== undefined && entry.element.parentNode === entry.slide && location) {
        try { safeCreatedSnippet(html.slice(location.startOffset, location.endOffset)); return null; }
        catch { /* A changed created node which is no longer supported must force a full refresh. */ }
      }
      const attributes: Structure[] = [];
      for (const attribute of [...node.attrs].sort((a, b) => a.name.localeCompare(b.name))) {
        if (entry && node.tagName === "img" && attribute.name === "src") continue;
        if (entry && attribute.name === "style") {
          const parsed = declarations(attribute.value);
          const remaining = parsed.filter(item => !allowedStyle.has(item.property));
          const unknown = patch(attribute.value, parsed.map(item => ({ start: item.start, end: item.end, text: "" }))).trim().replace(/^;+|;+$/g, "");
          if (remaining.length || unknown) attributes.push(["style", remaining.map(item => [item.property, item.value]), unknown]);
        } else attributes.push([attribute.name, attribute.value]);
      }
      const children = node.childNodes.map(structure).filter(child => child !== null);
      if ("content" in node) { const content = structure(node.content); if (content !== null) children.push(content); }
      return ["element", node.namespaceURI, node.tagName, attributes, children];
    }
    if ("value" in node) return ["text", node.value];
    if ("data" in node) return ["comment", node.data];
    if ("publicId" in node) return ["doctype", node.name, node.publicId, node.systemId];
    return [node.nodeName, "childNodes" in node ? node.childNodes.map(structure).filter(child => child !== null) : []];
  }
  const value=sourceNamespace(JSON.stringify(structure(sourceTree(html))));
  const entry=sourceTreeEntry(html);if(entry)entry.fingerprint=value;
  return value;
}

function setAttribute(html: string, element: Element, name: string, value: string | null): string {
  const location = element.sourceCodeLocation;
  const existing = location?.attrs?.[name];
  if (existing) {
    if (value === null) {
      const start = html[existing.startOffset - 1] === " " ? existing.startOffset - 1 : existing.startOffset;
      const next=patch(html, [{ start, end: existing.endOffset, text: "" }]);
      if(location?.startTag&&element.namespaceURI==="http://www.w3.org/1999/xhtml"){
        const raw=html.slice(location.startOffset,start)+html.slice(existing.endOffset,location.startTag.endOffset);
        const parsed=parseFragment(raw+`</${element.tagName}>`).childNodes,node=parsed.length===1?parsed[0]:null;
        if(node&&"tagName" in node&&node.tagName===element.tagName&&node.attrs.length===element.attrs.length-1&&node.attrs.every(item=>item.value===attr(element,item.name))){
          reuseTokenIndex(html,next,{...existing,startOffset:start,startCol:existing.startCol-(existing.startOffset-start)},"",copy=>{
            if(!("tagName" in copy)||copy.sourceCodeLocation?.startOffset!==location.startOffset||sourceId(copy)!==sourceId(element))return false;
            copy.attrs=copy.attrs.filter(item=>item.name!==name);
            if(copy.sourceCodeLocation.attrs)delete copy.sourceCodeLocation.attrs[name];
            if(copy.sourceCodeLocation.startTag){
              if(copy.attrs.length)Object.assign(copy.sourceCodeLocation.startTag,{attrs:copy.sourceCodeLocation.attrs});
              else{delete copy.sourceCodeLocation.attrs;Reflect.deleteProperty(copy.sourceCodeLocation.startTag,"attrs");}
            }
            return true;
          });
        }
      }
      return next;
    }
    const raw = html.slice(existing.startOffset, existing.endOffset);
    const match = /^([^=]+?\s*=\s*)(["'])([\s\S]*)\2$/.exec(raw);
    const text = match ? `${match[1]}${match[2]}${escapeText(value).replace(new RegExp(match[2], "g"), match[2] === "\"" ? "&quot;" : "&#39;")}${match[2]}` : `${name}="${escapeAttribute(value)}"`;
    const next=patch(html, [{ start: existing.startOffset, end: existing.endOffset, text }]);
    if(location?.startTag&&element.namespaceURI==="http://www.w3.org/1999/xhtml"){
      const startTag=html.slice(location.startOffset,existing.startOffset)+text+html.slice(existing.endOffset,location.startTag.endOffset);
      const parsed=parseFragment(startTag+`</${element.tagName}>`).childNodes;
      const node=parsed.length===1?parsed[0]:null;
      if(node&&"tagName" in node&&node.tagName===element.tagName&&node.attrs.length===element.attrs.length&&node.attrs.every(item=>item.value===(item.name===name?value:attr(element,item.name)))){
        reuseTokenIndex(html,next,existing,text,copy=>{
          if(!("tagName" in copy)||copy.sourceCodeLocation?.startOffset!==location.startOffset||sourceId(copy)!==sourceId(element))return false;
          const changed=copy.attrs.find(item=>item.name===name);if(!changed)return false;
          changed.value=value;return true;
        });
      }
    }
    return next;
  }
  if (value === null) return html;
  if (!location?.startTag) throw new DeckEditConflictError();
  const at = location.startTag.endOffset - (html[location.startTag.endOffset - 2] === "/" ? 2 : 1);
  const text=` ${name}="${escapeAttribute(value)}"`,next=patch(html,[{start:at,end:at,text}]);
  if(element.namespaceURI==="http://www.w3.org/1999/xhtml"){
    const raw=html.slice(location.startOffset,at)+text+html.slice(at,location.startTag.endOffset);
    const parsed=parseFragment(raw+`</${element.tagName}>`,{sourceCodeLocationInfo:true}).childNodes,node=parsed.length===1?parsed[0]:null;
    const fresh=node&&"tagName" in node?node.sourceCodeLocation?.attrs?.[name]:undefined;
    if(node&&"tagName" in node&&node.tagName===element.tagName&&fresh&&node.attrs.length===element.attrs.length+1&&node.attrs.every(item=>item.value===(item.name===name?value:attr(element,item.name)))){
      let changed:Element|null=null;
      const column=location.startTag.endCol-(location.startTag.endOffset-at),line=location.startTag.endLine;
      const attribute={...fresh,startOffset:location.startOffset+fresh.startOffset,endOffset:location.startOffset+fresh.endOffset,startLine:location.startTag.startLine+fresh.startLine-1,endLine:location.startTag.startLine+fresh.endLine-1,startCol:fresh.startLine===1?location.startTag.startCol+fresh.startCol-1:fresh.startCol,endCol:fresh.endLine===1?location.startTag.startCol+fresh.endCol-1:fresh.endCol};
      reuseTokenIndex(html,next,{startOffset:at,endOffset:at,startLine:line,endLine:line,startCol:column,endCol:column},text,copy=>{
        if(!("tagName" in copy)||copy.sourceCodeLocation?.startOffset!==location.startOffset||sourceId(copy)!==sourceId(element))return false;
        copy.attrs.push({name,value});changed=copy;return true;
      },false,()=>{
        const loc=changed?.sourceCodeLocation;if(!loc?.startTag)return;
        loc.attrs??={};Object.setPrototypeOf(loc.attrs,null);loc.attrs[name]=attribute;
        Object.assign(loc.startTag,{attrs:loc.attrs});
      });
    }
  }
  return next;
}

function changes(before: string, after: string): Patch[] {
  const edits: Patch[] = [];
  let at = 0;
  const difference = diffChars(before, after, { timeout: 100, maxEditLength: 10_000 });
  if (difference === undefined) throw new DeckEditConflictError(defaultTranslate("deckEditor.conflict.textOverlap"));
  for (const part of difference) {
    if (!part.added && !part.removed) { at += part.value.length; continue; }
    let edit = edits[edits.length - 1];
    if (!edit || edit.end !== at) { edit = { start: at, end: at, text: "" }; edits.push(edit); }
    if (part.added) edit.text += part.value;
    else { at += part.value.length; edit.end = at; }
  }
  return edits;
}
function mergeText(before: string, current: string, after: string): string {
  if (current === before) return after;
  const local = changes(before, after);
  const remote = changes(before, current);
  const extra: Patch[] = [];
  for (const incoming of local) {
    let exists = false;
    for (const existing of remote) {
      if (incoming.start === existing.start && incoming.end === existing.end && incoming.text === existing.text) { exists = true; continue; }
      const overlap = incoming.start < existing.end && existing.start < incoming.end;
      const sameInsertion = incoming.start === incoming.end && existing.start === existing.end && incoming.start === existing.start;
      const inside = (incoming.start === incoming.end && incoming.start >= existing.start && incoming.start <= existing.end) ||
        (existing.start === existing.end && existing.start >= incoming.start && existing.start <= incoming.end);
      if (overlap || sameInsertion || inside) throw new DeckEditConflictError();
    }
    if (!exists) extra.push(incoming);
  }
  return patch(before, [...remote, ...extra]);
}

function createdHtml(node: DeckCreatedNode): string {
  const style = node.style ? Object.entries(node.style).map(([key, value]) => `${key}:${value}`).join(";") : "";
  const attributes = ` ${DECK_NODE_MARK}="${node.id}" ${DECK_CREATED_MARK}${style ? ` style="${escapeAttribute(style)}"` : ""}`;
  if(node.tag === "youtube")return `<figure${attributes} data-deck-youtube="${node.videoId}" aria-label="${escapeAttribute(node.label)}"><a href="https://www.youtube.com/watch?v=${node.videoId}" target="_blank" rel="noopener noreferrer">${escapeText(node.label)} — https://www.youtube.com/watch?v=${node.videoId}</a></figure>`;
  if(node.tag === "video")return `<video${attributes} controls playsinline preload="none" poster="${escapeAttribute(node.poster)}" aria-label="${escapeAttribute(node.label)}" src="${escapeAttribute(node.src)}"></video>`;
  return node.tag === "p" ? `<p${attributes}>${node.text ? escapeText(node.text) : `<!--${DECK_EMPTY_TEXT_PREFIX}0-->`}</p>`
    : `<img${attributes} loading="lazy" decoding="async" src="${escapeAttribute(node.src)}" alt="${escapeAttribute(node.alt)}">`;
}
function safeCreatedSnippet(html: string): Element {
  const fragment = parseFragment(html, { sourceCodeLocationInfo: true });
  if (fragment.childNodes.length !== 1) throw new DeckEditConflictError(defaultTranslate("deckEditor.conflict.restoreInvalid"));
  const element = fragment.childNodes[0];
  if (!("tagName" in element) || !["p", "img", "video", "figure"].includes(element.tagName) || attr(element, DECK_CREATED_MARK) === undefined) throw new DeckEditConflictError();
  const allowed = new Set([DECK_NODE_MARK, DECK_CREATED_MARK, "style", ...(element.tagName === "figure" ? ["data-deck-youtube","aria-label"] : element.tagName === "img" ? ["src", "alt", "loading", "decoding"] : element.tagName === "video" ? ["src","poster","aria-label","controls","playsinline","preload"] : [])]);
  if (element.attrs.some(item => !allowed.has(item.name))) throw new DeckEditConflictError(defaultTranslate("deckEditor.conflict.restoreAttributes"));
  if (element.tagName !== "figure" && element.childNodes.some(child => !("value" in child) && !("data" in child && child.data === `${DECK_EMPTY_TEXT_PREFIX}0`))) throw new DeckEditConflictError();
  if(element.tagName === "figure"){
    const link=element.childNodes[0],id=attr(element,"data-deck-youtube");
    if(element.childNodes.length!==1||!link||!("tagName"in link)||link.tagName!=="a"||attr(link,"href")!==`https://www.youtube.com/watch?v=${id}`||attr(link,"target")!=="_blank"||attr(link,"rel")!=="noopener noreferrer"||link.attrs.some(item=>!["href","target","rel"].includes(item.name))||link.childNodes.some(child=>!("value"in child)))throw new DeckEditConflictError(defaultTranslate("deckEditor.conflict.videoLink"));
  }
  const rawStyle = attr(element, "style") ?? "";
  const parsedStyle = declarations(rawStyle);
  if (new Set(parsedStyle.map(item => item.property)).size !== parsedStyle.length) throw new DeckEditConflictError(defaultTranslate("deckEditor.conflict.restoreStyleDuplicate"));
  const remainder = patch(rawStyle, parsedStyle.map(item => ({ start: item.start, end: item.end, text: "" })));
  if (remainder.trim().replace(/;/g, "")) throw new DeckEditConflictError(defaultTranslate("deckEditor.conflict.restoreStyleInvalid"));
  const style = Object.fromEntries(parsedStyle.map(item => [item.property, item.value]));
  const node = { id: attr(element, DECK_NODE_MARK), style };
  if(element.tagName === "video" && (attr(element,"preload")!=="none" || attr(element,"controls")===undefined || attr(element,"playsinline")===undefined || element.childNodes.length))throw new DeckEditConflictError();
  deckCreatedNodeSchema.parse(element.tagName === "figure" ? {...node,tag:"youtube",videoId:attr(element,"data-deck-youtube"),label:attr(element,"aria-label")} : element.tagName === "video"
    ? {...node,tag:"video",src:attr(element,"src"),poster:attr(element,"poster"),label:attr(element,"aria-label")}
    : element.tagName === "img"
    ? { ...node, tag: "img", src: attr(element, "src"), alt: attr(element, "alt") ?? "" }
    : { ...node, tag: "p", text: element.childNodes.map(child => "value" in child ? child.value : "").join("") });
  return element;
}

function insertionPoint(slide: Element, beforeId: string | null): number {
  const before = beforeId === null
    ? slide.childNodes.find(child => "tagName" in child && attr(child, "data-deck-notes") !== undefined)
    : slide.childNodes.find(child => "tagName" in child && attr(child, DECK_NODE_MARK) === beforeId);
  if (beforeId !== null && !before) throw new DeckEditConflictError(defaultTranslate("deckEditor.conflict.insertMoved"));
  const at = before?.sourceCodeLocation?.startOffset ?? slide.sourceCodeLocation?.endTag?.startOffset;
  if (at === undefined) throw new DeckEditConflictError(defaultTranslate("deckEditor.conflict.slideClosing"));
  return at;
}

function applyOne(html: string, operation: DeckEditOperation): { html: string; inverse: DeckEditOperation[] } {
  if(operation.kind==="move"){
    const fragment=deckSourceFragment(html,operation.target);
    if(!fragment||fragment.parentId!==operation.parentId)throw new DeckEditConflictError(defaultTranslate("deckEditor.conflict.moveChanged"));
    const before=deckSourceChildren(html,operation.parentId);
    if(operation.beforeId===operation.target)return {html,inverse:[]};
    if(operation.beforeId!==null&&!before.includes(operation.beforeId))throw new DeckEditConflictError(defaultTranslate("deckEditor.conflict.destinationGone"));
    const after=before.filter(id=>id!==operation.target);const at=operation.beforeId===null?after.length:after.indexOf(operation.beforeId);after.splice(at,0,operation.target);
    const result=applyAuthoring(html,{kind:"order",target:operation.parentId,before,after});
    return {html:result.html,inverse:result.inverse.length?[{...operation,beforeId:fragment.beforeId}]:[]};
  }
  if(operation.kind==="outline-move"){
    const before=deckSourceOutline(html),roots=outlineRoots(before,operation.ids);
    if(operation.ids.some(id=>!before.some(entry=>entry.id===id)))throw new DeckEditConflictError(defaultTranslate("deckEditor.conflict.moveGone"));
    let after:OutlineEntry[];
    try{after=moveOutline(before,operation.ids,operation.anchor,operation.placement);}catch(error){throw new DeckEditConflictError(error instanceof Error?error.message:defaultTranslate("deckEditor.conflict.checkOrder"));}
    const result=applyOne(html,{kind:"outline",target:"deck-root",before,after});
    const inverse:DeckEditOperation[]=roots.map((id):DeckEditOperation=>{
      const entry=before.find(item=>item.id===id)!;
      const next=before.slice(before.findIndex(item=>item.id===id)+1).find(item=>item.parent===entry.parent);
      return {kind:"outline-move",target:"deck-root",ids:[id],anchor:next?.id??entry.parent,placement:next?"before":entry.parent?"inside":"after"};
    }).reverse();
    return {html:result.html,inverse:result.inverse.length?inverse:[]};
  }
  if (operation.kind === "outline") {
    const before = deckSourceOutline(html);
    if (JSON.stringify(before) === JSON.stringify(operation.after)) return {html,inverse:[]};
    if (JSON.stringify(before) !== JSON.stringify(operation.before)) throw new DeckEditConflictError(defaultTranslate("deckEditor.conflict.slideOrderChanged"));
    if ([...before.map(entry=>entry.id)].sort().join(" ") !== [...operation.after.map(entry=>entry.id)].sort().join(" ")) throw new DeckEditConflictError(defaultTranslate("deckEditor.conflict.moveMismatch"));
    let next = html;
    let indexed = next;
    let byId = new Map(sourceElements(next).map(node=>[sourceId(node),node]));
    for (const entry of operation.after) {
      if(indexed!==next){indexed=next;byId=new Map(sourceElements(next).map(node=>[sourceId(node),node]));}
      const node = byId.get(entry.id);
      if (!node) throw new DeckEditConflictError();
      if ((attr(node,DECK_PARENT)??null)!==entry.parent) next=setAttribute(next,node,DECK_PARENT,entry.parent);
    }
    next=applyAuthoring(next,{kind:"order",target:"deck-root",before:before.map(entry=>entry.id),after:operation.after.map(entry=>entry.id)}).html;
    return {html:next,inverse:[{...operation,before:operation.after,after:before}]};
  }
  if (operation.kind === "chart-value") {
    const node = sourceElements(html).find(node => sourceId(node) === operation.target);
    if (!node || attr(node, "data-deck-basic-chart") === undefined) throw new DeckEditConflictError(defaultTranslate("deckEditor.conflict.chartUnsupported"));
    const script = node.childNodes.find((child): child is Element => "tagName" in child && attr(child, "data-dd-chart-source") !== undefined);
    const loc = script?.sourceCodeLocation;
    if (!loc?.startTag || !loc.endTag) throw new DeckEditConflictError(defaultTranslate("deckEditor.conflict.chartSourceMissing"));
    const data = readDeckChartSource(html.slice(loc.startTag.endOffset, loc.endTag.startOffset));
    const series = data.series.find(item => item.id === operation.seriesId);
    const point = series?.data.find(item => item.id === operation.pointId);
    if (!point) throw new DeckEditConflictError(defaultTranslate("deckEditor.conflict.chartValueGone"));
    const before = point.value ?? null;
    if (before === operation.after) return { html, inverse: [] };
    if (before !== operation.before) throw new DeckEditConflictError();
    if (operation.after === null) delete point.value; else point.value = operation.after;
    // Keep the authored JSON and fallback table coherent; preserve every unrelated source byte.
    const raw: unknown = JSON.parse(html.slice(loc.startTag.endOffset, loc.endTag.startOffset));
    const changed = replaceChartValue(raw, operation.seriesId, operation.pointId, operation.after);
    let next = patch(html, [{ start: loc.startTag.endOffset, end: loc.endTag.startOffset, text: JSON.stringify(changed).replace(/</g, "\\u003c") }]);
    const rowIndex = series!.data.findIndex(item => item.id === operation.pointId);
    const colIndex = data.series.findIndex(item => item.id === operation.seriesId) + 1;
    const fresh = sourceElements(next).find(node => sourceId(node) === operation.target);
    const rows: Element[] = [];
    const walk = (node: Node): void => { if ("tagName" in node && node.tagName === "tr") rows.push(node); if ("childNodes" in node) node.childNodes.forEach(walk); };
    if (fresh) walk(fresh);
    const cell = rows[rowIndex + 1]?.childNodes.filter((node): node is Element => "tagName" in node && ["td", "th"].includes(node.tagName))[colIndex];
    if (cell?.sourceCodeLocation?.startTag && cell.sourceCodeLocation.endTag) next = patch(next, [{ start: cell.sourceCodeLocation.startTag.endOffset, end: cell.sourceCodeLocation.endTag.startOffset, text: operation.after === null ? "" : String(operation.after) }]);
    return { html: next, inverse: [{ ...operation, before: operation.after, after: before }] };
  }
  if (operation.kind === "notes") {
    const slide = sourceElements(html).find(node => sourceId(node) === operation.target && attr(node, "data-deck-slide") !== undefined);
    if (!slide) throw new DeckEditConflictError(defaultTranslate("deckEditor.conflict.notesGone"));
    const notes = slide.childNodes.find((node): node is Element => "tagName" in node && attr(node, "data-deck-notes") !== undefined);
    const before = notes ? sourceText(notes) : "";
    if (before === operation.after) return { html, inverse: [] };
    if (before !== operation.before) throw new DeckEditConflictError();
    const start = notes?.sourceCodeLocation?.startOffset ?? slide.sourceCodeLocation?.endTag?.startOffset;
    if (start === undefined) throw new DeckEditConflictError();
    const next = patch(html, [{ start, end: notes?.sourceCodeLocation?.endOffset ?? start, text: operation.after ? `<aside data-deck-notes>${escapeText(operation.after)}</aside>` : "" }]);
    return { html: next, inverse: [{ ...operation, before: operation.after, after: before }] };
  }
  if (operation.kind === "setting-field") {
    const raw = deckSourceSetting(html, operation.name);
    const defaults={appearance:emptyOverrides,focus:emptyFocusOverrides,logo:emptyLogoOverrides};
    const empty=defaults[operation.name]();
    const root: unknown = raw === null ? empty : JSON.parse(raw);
    const before = readSettingField(root, operation.path);
    if (sameJsonValue(before,operation.after)) return { html, inverse: [] };
    if (!sameJsonValue(before,operation.before)) throw new DeckEditConflictError();
    const next = writeSettingField(root, operation.path, operation.after);
    const result = applyAuthoring(html, { kind: "setting", target: "deck-document", name: operation.name, before: raw, after: JSON.stringify(next)===JSON.stringify(empty)?null:JSON.stringify(next) });
    return { html: result.html, inverse: [{ ...operation, before: operation.after, after: operation.before }] };
  }
  if (operation.kind === "fragment" || operation.kind === "order" || operation.kind === "setting") return applyAuthoring(html, operation);
  const entries = sourceEntries(html, true);
  const found = entries.find(entry => entry.id === operation.target);
  if (!found) {
    throw new DeckEditConflictError(defaultTranslate("deckEditor.conflict.targetGone"));
  }
  const element = found.element;
  if (operation.kind === "video-source") {
    if(element.tagName!=="video")throw new DeckEditConflictError(defaultTranslate("deckEditor.conflict.videoGone"));
    const before={src:attr(element,"src")??"",poster:attr(element,"poster")??""};
    if(JSON.stringify(before)===JSON.stringify(operation.after))return {html,inverse:[]};
    if(JSON.stringify(before)!==JSON.stringify(operation.before))throw new DeckEditConflictError(defaultTranslate("deckEditor.conflict.videoReplaced"));
    let next=setAttribute(html,element,"src",operation.after.src);
    const fresh=sourceElements(next).find(node=>sourceId(node)===operation.target);if(!fresh)throw new DeckEditConflictError();
    next=setAttribute(next,fresh,"poster",operation.after.poster);
    return {html:next,inverse:[{...operation,before:operation.after,after:before}]};
  }
  if (operation.kind === "attribute") {
    if(operation.name===DECK_PARENT&&(element.tagName!=="section"||operation.after!==null&&!deckNodeIdSchema.safeParse(operation.after).success))throw new DeckEditConflictError(defaultTranslate("deckEditor.conflict.invalidParent"));
    if (operation.name === "data-deck-skip" && (element.tagName !== "section" || attr(element, "data-deck-slide") === undefined || (operation.after !== null && operation.after !== "true"))) {
      throw new DeckEditConflictError(defaultTranslate("deckEditor.conflict.skipSlidesOnly"));
    }
    const before = attr(element, operation.name) ?? null;
    if (before === operation.after) return { html, inverse: [] };
    if (before !== operation.before) throw new DeckEditConflictError();
    return { html: setAttribute(html, element, operation.name, operation.after), inverse: [{ ...operation, before: operation.after, after: before }] };
  }
  if (operation.kind === "text") {
    const slot = found.slots[operation.run];
    if (!slot) throw new DeckEditConflictError(defaultTranslate("deckEditor.conflict.textStructureChanged"));
    if (slot.text === operation.after) return { html, inverse: [] };
    const after = mergeText(operation.before, slot.text, operation.after);
    if (after === slot.text) return { html, inverse: [] };
    return { html: after?patchTextToken(html,element,slot,escapeText(after),after,true):patch(html,[{start:slot.start,end:slot.end,text:`<!--${DECK_EMPTY_TEXT_PREFIX}${operation.run}-->`}]), inverse: [{ ...operation, before: after, after: slot.text }] };
  }
  if (operation.kind === "style") {
    const original = attr(element, "style") ?? "";
    const items = declarations(original).filter(item => item.property === operation.property);
    const item = items[items.length - 1];
    const before = item?.value ?? null;
    if (before === operation.after) return { html, inverse: [] };
    if (before !== operation.before) throw new DeckEditConflictError();
    if (items.length > 1) throw new DeckEditConflictError(defaultTranslate("deckEditor.conflict.styleDuplicate"));
    const after = item ? patch(original, [{ start: operation.after === null ? item.start : item.valueStart, end: operation.after === null ? item.end : item.valueEnd, text: operation.after ?? "" }])
      : `${original}${original && !original.trimEnd().endsWith(";") ? ";" : ""}${operation.property}:${operation.after}`;
    return { html: setAttribute(html, element, "style", after.trim() ? after : null), inverse: [{ ...operation, before: operation.after, after: before }] };
  }
  if (operation.kind === "image") {
    if (element.tagName !== "img") throw new DeckEditConflictError(defaultTranslate("deckEditor.conflict.chooseImage"));
    const before = attr(element, "src") ?? "";
    if (before === operation.after) return { html, inverse: [] };
    if (before !== operation.before) throw new DeckEditConflictError();
    return { html: setAttribute(html, element, "src", operation.after), inverse: [{ ...operation, before: operation.after, after: before }] };
  }
  if (operation.kind === "remove") {
    const location = element.sourceCodeLocation;
    if (attr(element, DECK_CREATED_MARK) === undefined || element.parentNode !== found.slide || !location) throw new DeckEditConflictError(defaultTranslate("deckEditor.conflict.sourceElement"));
    const raw = html.slice(location.startOffset, location.endOffset);
    if (raw !== operation.before) throw new DeckEditConflictError();
    safeCreatedSnippet(raw);
    const siblings = found.slide.childNodes;
    const following = siblings.slice(siblings.indexOf(element) + 1).find(child => "tagName" in child && attr(child, DECK_NODE_MARK));
    const beforeId = following && "tagName" in following ? attr(following, DECK_NODE_MARK) ?? null : null;
    return { html: patch(html, [{ start: location.startOffset, end: location.endOffset, text: "" }]), inverse: [{ kind: "restore", target: attr(found.slide, DECK_NODE_MARK) ?? "", beforeId, html: raw }] };
  }
  if (element !== found.slide) throw new DeckEditConflictError(defaultTranslate("deckEditor.conflict.chooseTargetSlide"));
  const raw = operation.kind === "insert" ? createdHtml(operation.node) : operation.html;
  const child = safeCreatedSnippet(raw);
  const id = attr(child, DECK_NODE_MARK) ?? "";
  const duplicate = entries.find(entry => entry.id === id);
  if (duplicate) {
    const location = duplicate.element.sourceCodeLocation;
    if (duplicate.slide === found.slide && location && html.slice(location.startOffset, location.endOffset) === raw) return { html, inverse: [] };
    throw new DeckEditConflictError(defaultTranslate("deckEditor.conflict.duplicateNewIds"));
  }
  const at = insertionPoint(element, operation.kind === "restore" ? operation.beforeId : null);
  return { html: patch(html, [{ start: at, end: at, text: raw }]), inverse: [{ kind: "remove", target: id, before: raw }] };
}

export function sourceText(node: Node): string {
  if ("value" in node) return node.value;
  if ("tagName" in node && ["script", "style"].includes(node.tagName)) return "";
  return "childNodes" in node ? node.childNodes.map(sourceText).join("") : "";
}
function replaceChartValue(value: unknown, seriesId: string, pointId: string, after: number | null): unknown {
  if (!value || typeof value !== "object" || !("series" in value) || !Array.isArray(value.series)) throw new DeckEditConflictError();
  return { ...value, series: value.series.map((series: unknown) => {
    if (!series || typeof series !== "object" || !("id" in series) || series.id !== seriesId || !("data" in series) || !Array.isArray(series.data)) return series;
    return { ...series, data: series.data.map((point: unknown) => {
      if (!point || typeof point !== "object" || !("id" in point) || point.id !== pointId) return point;
      const copy: Record<string, unknown> = { ...point };
      if (after === null) delete copy.value; else copy.value = after;
      return copy;
    }) };
  }) };
}
export function readSettingField(root: unknown, path: readonly string[]): unknown {
  let value = root;
  for (const key of path) { if (!value || typeof value !== "object" || Array.isArray(value)) return null; value = Object.entries(value).find(([name]) => name === key)?.[1]; }
  return value ?? null;
}
function writeSettingField(root: unknown, path: readonly string[], value: unknown, depth=0): unknown {
  const copy: Record<string, unknown> = root && typeof root === "object" && !Array.isArray(root) ? { ...root } : {};
  const [key, ...rest] = path;
  if (rest.length) {const child=writeSettingField(copy[key], rest, value, depth+1);if(depth>0 && child && typeof child==="object" && !Array.isArray(child) && Object.keys(child).length===0)delete copy[key];else copy[key]=child;}
  else if (value === null) delete copy[key]; else copy[key] = value;
  return copy;
}

/** Apply against current source, atomically in memory. No partial result escapes on a conflict. */
export function applyDeckEditOperations(html: string, input: readonly DeckEditOperation[], strictText=false, deferOutline=false): { html: string; nodes: DeckEditableNode[]; inverse: DeckEditOperation[] } {
  const operations = deckEditOperationsSchema.parse(input);
  return applyOperations(html, operations, strictText, false, deferOutline);
}

function applyOperations(html: string, operations: readonly DeckEditOperation[], strictText: boolean, scoped = false, deferOutline = false): {html:string;nodes:DeckEditableNode[];inverse:DeckEditOperation[]} {
  if (!scoped && operations.length && operations.every(op=>op.kind==="setting-field" || op.kind==="setting" && ["appearance","focus","logo","title"].includes(op.name))) {
    const settings = applyHeadSettings(html,operations,strictText); if (settings) return settings;
  }
  let current = html;
  const inverse: DeckEditOperation[] = [];
  for (let index = 0; index < operations.length; index++) {
    const inserts: Extract<DeckEditOperation,{kind:"fragment"}>[] = [];
    for (let candidate = index; candidate < operations.length; candidate++) {
      const op = operations[candidate];
      if (!independentInsertion(op)) break;
      inserts.push(op);
    }
    if (inserts.length > 1) {
      const bulk = independentSlideInsertions(current, inserts);
      if (bulk) { current = bulk.html; inverse.unshift(...bulk.inverse); index += inserts.length - 1; continue; }
    }
    const operation = operations[index];
    if(strictText && operation.kind === "text" && deckOperationValue(current,operation)!==operation.before && deckOperationValue(current,operation)!==operation.after)throw new DeckEditConflictError();
    const result = applyOne(current, operation);
    current = result.html;
    inverse.unshift(...result.inverse);
  }
  // Compound duplication/deletion temporarily refers to a parent restored later
  // in the same batch. Validate the complete atomic result, not those intermediates.
  if(!deferOutline&&operations.some(operation=>operation.kind==="outline"||operation.kind==="outline-move"||operation.kind==="move"||operation.kind==="attribute"&&operation.name===DECK_PARENT)){
    try{validateOutline(deckSourceOutline(current));}catch(error){throw new DeckEditConflictError(error instanceof Error?error.message:defaultTranslate("deckEditor.conflict.checkHierarchy"));}
  }
  // Validate identities eagerly, but materialize thousands of view records only
  // for callers that use them. Most local edits need just source and inverse.
  const entries = sourceEntries(current, true);
  let nodes: DeckEditableNode[] | undefined;
  return { html: current, get nodes() { return nodes ??= entries.map(view); }, inverse };
}

function applyHeadSettings(html: string, operations: readonly DeckEditOperation[], strictText: boolean): {html:string;nodes:DeckEditableNode[];inverse:DeckEditOperation[]} | null {
  const nodes = sourceElements(html), head=nodes.find(node=>node.tagName==="head");
  const end=head?.sourceCodeLocation?.endTag?.endOffset;
  if (!head || end===undefined) return null;
  for (const op of operations) {
    if (op.kind!=="setting" && op.kind!=="setting-field") return null;
    if (op.name==="navigation" || op.name==="diagram-library" || op.name==="design-runtime" || op.name==="design-style") return null;
    const name=op.name;
    const targets=nodes.filter(node=>name==="title"?node.tagName==="title":node.tagName==="script"&&attr(node,settingMarks[name])!==undefined);
    if(targets.some(target=>target.parentNode!==head))return null;
  }
  const entries=sourceEntries(html,true);
  const minimal=html.slice(0,end)+"<body data-deck></body></html>";
  const changed=applyOperations(minimal,operations,strictText,true);
  const nextEnd=sourceElements(changed.html).find(node=>node.tagName==="head")?.sourceCodeLocation?.endTag?.endOffset;
  if(nextEnd===undefined)throw new DeckEditConflictError(defaultTranslate("deckEditor.conflict.checkSettings"));
  let viewNodes: DeckEditableNode[] | undefined;
  const next=changed.html.slice(0,nextEnd)+html.slice(end);
  reuseHeadIndex(html,next,head,changed.html);
  return {html:next,get nodes(){return viewNodes??=entries.map(view);},inverse:changed.inverse};
}

/** Independent duplicates share the original anchors. Validate every fragment
 * and the combined identities, but do not parse the entire deck per new slide. */
function independentSlideInsertions(html: string, operations: readonly Extract<DeckEditOperation,{kind:"fragment"}>[]): {html:string;inverse:DeckEditOperation[]} | null {
  const planned = plannedSlideInsertions(html, operations);
  if (planned) sourceEntries(planned.html,true);
  return planned;
}
type SlideInsertion = Extract<DeckEditOperation,{kind:"fragment"}>;
const independentInsertion = (op: DeckEditOperation): op is SlideInsertion => op.kind === "fragment" && op.parentId === "deck-root" && op.before === null && op.after !== null && !op.beforeGap;
/** 独立した複数枚の差し込みだけを、原稿全体を読み直さずに組み立てる（全体の検証は呼び出し側）。 */
function plannedSlideInsertions(html: string, operations: readonly SlideInsertion[]): {html:string;inverse:DeckEditOperation[]} | null {
  const nodes = sourceElements(html), byId = new Map(nodes.map(node => [sourceId(node), node]));
  const parent = byId.get("deck-root"); if (!parent?.sourceCodeLocation?.endTag) return null;
  const additions = new Map<number,string[]>(), inverse: DeckEditOperation[] = [];
  const targets = new Set<string>();
  for (const operation of operations) {
    if (byId.has(operation.target) || targets.has(operation.target) || operation.after === null) return null;
    targets.add(operation.target);
    const anchor: DefaultTreeAdapterMap["childNode"] | undefined = operation.beforeId === null ? parent.childNodes.find(node=>"tagName" in node && attr(node,"data-deck-notes")!==undefined) : byId.get(operation.beforeId);
    if (operation.beforeId !== null && (!anchor || anchor.parentNode !== parent)) return null;
    const at = anchor?.sourceCodeLocation?.startOffset ?? parent.sourceCodeLocation.endTag.startOffset;
    validFragment(operation.after, operation.target, true);
    const texts = additions.get(at) ?? []; texts.push(operation.after); additions.set(at, texts);
    inverse.unshift({...operation,beforeId:operation.beforeId,beforeGap:undefined,before:operation.after,after:null});
  }
  const next = patch(html,[...additions].map(([at,texts])=>({start:at,end:at,text:texts.join("")})));
  return {html:next,inverse};
}
/** 複数枚の複製を反映した後の原稿を、検証の読み取りをせずに先に求める。大きな資料で、その読み取りを
 * 反映と別の処理単位へ先に済ませるために使う。反映そのものは必ず applyDeckEditOperations を通し、
 * そこで同じ検証を行う（ここで求めた原稿が違っていても、反映の側で読み直すだけで結果は変わらない）。 */
export function deckSourceAfterInsertions(html: string, input: readonly DeckEditOperation[]): string | null {
  const operations = deckEditOperationsSchema.parse(input);
  if (operations.length < 2 || !operations.every(independentInsertion)) return null;
  try { return plannedSlideInsertions(html, operations)?.html ?? null; } catch { return null; }
}

/** Internal atomic command pipeline validates the complete source once at the
 * end, rather than building every node's view after each individual property. */
export function applyDeckEditCommand(html:string,input:DeckEditOperation):{html:string;inverse:DeckEditOperation[]}{
  return applyOne(html,deckEditOperationSchema.parse(input));
}

/** The claimed old value must actually have existed in the declared revision. */
export function deckOperationValue(html: string, op: DeckEditOperation): unknown {
  if (op.kind === "outline") return deckSourceOutline(html);
  if (op.kind === "setting") return deckSourceSetting(html, op.name);
  if (op.kind === "setting-field") return readSettingField(JSON.parse(deckSourceSetting(html, op.name) ?? "{}"), op.path);
  if (op.kind === "order") return deckSourceChildren(html, op.target);
  if (op.kind === "fragment" || op.kind === "remove") return deckSourceFragment(html, op.target)?.html ?? null;
  const node = sourceElements(html).find(node => sourceId(node) === op.target);
  if (!node) return undefined;
  if (op.kind === "notes") return sourceText(node.childNodes.find(child => "tagName" in child && attr(child, "data-deck-notes") !== undefined) ?? { nodeName: "#text", value: "", parentNode: null });
  if (op.kind === "chart-value") {
    const script = node.childNodes.find(child => "tagName" in child && attr(child, "data-dd-chart-source") !== undefined);
    if (!script || !("childNodes" in script)) return undefined;
    const data = readDeckChartSource(script.childNodes.map(child => "value" in child ? child.value : "").join(""));
    const point = data.series.find(item => item.id === op.seriesId)?.data.find(item => item.id === op.pointId);
    return point ? point.value ?? null : undefined;
  }
  if (op.kind === "video-source") return {src:attr(node,"src")??"",poster:attr(node,"poster")??""};
  if (op.kind === "attribute") return attr(node, op.name) ?? null;
  if (op.kind === "image") return attr(node, "src") ?? "";
  if (op.kind === "style") return declarations(attr(node, "style") ?? "").findLast(item => item.property === op.property)?.value ?? null;
  if (op.kind === "text") return sourceEntries(html, true).find(entry => entry.id === op.target)?.slots[op.run]?.text;
  return null;
}
export function validateDeckEditBase(html: string, operations: readonly DeckEditOperation[]): void {
  let current = html;
  for (const op of operations) {
    if ("before" in op && !sameJsonValue(deckOperationValue(current,op),op.before)) throw new DeckEditConflictError(defaultTranslate("deckEditor.conflict.staleBefore"));
    current = applyOne(current, op).html;
  }
}

/** Source ranges, not rendered DOM, are used by every structural editing command. */
function sourceElements(html: string): Element[] {
  const tree = sourceTree(html);
  const cached = elementIndexes.get(tree); if (cached) return cached;
  const result: Element[] = [];
  const walk = (node: Node): void => { if ("tagName" in node) result.push(node); if ("childNodes" in node) node.childNodes.forEach(walk); };
  walk(tree); elementIndexes.set(tree, result); return result;
}
function sourceId(node: Element): string | undefined {
  return node.tagName === "main" && attr(node, "data-deck-slides") !== undefined ? "deck-root" : attr(node, DECK_NODE_MARK);
}
export function deckSourceFragment(html: string, id: string): { html: string; parentId: string; beforeId: string | null } | null {
  const node = sourceElements(html).find(node => sourceId(node) === id), location = node?.sourceCodeLocation;
  if (!node || !location || !node.parentNode || !("tagName" in node.parentNode)) return null;
  const siblings = node.parentNode.childNodes;
  const next = siblings.slice(siblings.indexOf(node) + 1).find(sibling => "tagName" in sibling && sourceId(sibling));
  return { html: html.slice(location.startOffset, location.endOffset), parentId: sourceId(node.parentNode) ?? "", beforeId: next && "tagName" in next ? sourceId(next) ?? null : null };
}
export type DeckSlideInsertion = { childIndex: number; slides: { id: string; html: string }[] };
/** 変更後の原稿が「変更前の原稿の、枚の並びの継ぎ目に、枚をまるごと差し込んだだけ」かを、読み取り済みの木で確かめる。
 * 差し込んだ位置（変更前の main の子の番号。末尾は -1）と、差し込んだ枚の原稿を返す。文字の並びで 1 字でも違えば null。
 * どちらかの木が手元に無いときも null（ここでは読み直さない）。資料全体を DOM に読み直さずに、差し込んだ枚だけを足すために使う。 */
export function deckSlideInsertions(before: string, after: string): { childCount: number; runs: DeckSlideInsertion[] } | null {
  if (!sourceTreeEntry(before) || !sourceTreeEntry(after)) return null;
  const layout = (html: string) => {
    const nodes = sourceElements(html), main = nodes.find(node => sourceId(node) === "deck-root"), end = main?.sourceCodeLocation?.endTag?.startOffset;
    if (!main || end === undefined) return null;
    const slides = main.childNodes.filter((node): node is Element => "tagName" in node && node.tagName === "section" && attr(node, "data-deck-slide") !== undefined)
      .map(node => ({ id: attr(node, DECK_NODE_MARK) ?? "", start: node.sourceCodeLocation?.startOffset ?? -1, end: node.sourceCodeLocation?.endOffset ?? -1 }));
    const nested = nodes.filter(node => node.tagName === "section" && attr(node, "data-deck-slide") !== undefined).length !== slides.length;
    return nested ? null : { slides, children: main.childNodes.map(node => node.sourceCodeLocation?.startOffset ?? -1), end };
  };
  const a = layout(before), b = layout(after);
  if (!a || !b || a.children.includes(-1) || [...a.slides, ...b.slides].some(slide => !slide.id || slide.start < 0 || slide.end < slide.start)) return null;
  const known = new Set(a.slides.map(slide => slide.id));
  if (b.slides.filter(slide => known.has(slide.id)).map(slide => slide.id).join(" ") !== a.slides.map(slide => slide.id).join(" ")) return null;
  const runs: { start: number; end: number; slides: { id: string; html: string }[] }[] = [];
  for (const slide of b.slides) {
    if (known.has(slide.id)) continue;
    const item = { id: slide.id, html: after.slice(slide.start, slide.end) }, last = runs.at(-1);
    if (last && last.end === slide.start) { last.end = slide.end; last.slides.push(item); } else runs.push({ start: slide.start, end: slide.end, slides: [item] });
  }
  if (!runs.length) return null;
  const result: DeckSlideInsertion[] = [];
  let rebuilt = "", cursor = 0, shift = 0;
  for (const run of runs) {
    const at = run.start - shift, childIndex = at === a.end ? -1 : a.children.indexOf(at);
    if (at < cursor || childIndex < 0 && at !== a.end) return null;
    rebuilt += before.slice(cursor, at) + after.slice(run.start, run.end);
    cursor = at; shift += run.end - run.start;
    result.push({ childIndex, slides: run.slides });
  }
  rebuilt += before.slice(cursor);
  return rebuilt === after ? { childCount: a.children.length, runs: result } : null;
}
/** 原稿全体の読み取り結果がすでに手元にあるか。大きな資料で、重い読み取りを操作と別の処理単位へ分けるかどうかの判断に使う。 */
export function deckSourceIndexed(html: string): boolean {
  return sourceTreeEntry(html) !== undefined;
}
/** 原稿全体の読み取りを、処理を小分けにして先に済ませる。結果は手元に残り、以後の操作は読み直さない。 */
export function readDeckSourceInSlices(html: string, pause: () => Promise<void>, budgetMs?: number): Promise<void> {
  return prepareSourceTree(html, pause, budgetMs);
}
export function deckSourceOutline(html: string): OutlineEntry[] {
  return sourceElements(html).filter(node=>node.tagName==="section" && attr(node,"data-deck-slide")!==undefined).map(node=>({id:sourceId(node)??"",parent:attr(node,DECK_PARENT)??null}));
}
export function deckSourceChildren(html: string, id: string): string[] {
  return sourceElements(html).find(node => sourceId(node) === id)?.childNodes.flatMap(node => "tagName" in node && sourceId(node) ? [sourceId(node)!] : []) ?? [];
}
export function deckSourceDescendants(html:string,id:string):string[]{
  const root=sourceElements(html).find(node=>sourceId(node)===id),ids:string[]=[];
  const walk=(node:Node):void=>{if("tagName" in node){const key=sourceId(node);if(key)ids.push(key);}if("childNodes" in node)node.childNodes.forEach(walk);};
  if(root)walk(root);return ids;
}
export function deckFragmentRootId(html:string):string|null{
  const root=parseFragment(html).childNodes.find(node=>"tagName" in node);
  return root&&"tagName" in root?sourceId(root)??null:null;
}
const diagramStart = "<!--DECK_LIBRARY_DIAGRAM_START-->";
const diagramEnd = "<!--DECK_LIBRARY_DIAGRAM_END-->";
type Setting = Extract<DeckEditOperation, {kind: "setting"}>["name"];
const settingMarks: Record<Exclude<Setting, "title" | "diagram-library" | "navigation" | "design-runtime" | "design-style">, string> = {
  appearance: "data-deck-appearance", focus: "data-deck-focus-overrides", logo: "data-deck-logo-overrides",
  "focus-source": "data-deck-focus", "design-source": "data-deck-design", "logo-source": "data-deck-logo", theme: "data-deck-theme",
};
export function deckSourceSetting(html: string, name: Setting): string | null {
  if (name === "design-runtime" || name === "design-style") {
    const tag = name === "design-runtime" ? "script" : "style";
    const node = sourceElements(html).find(node => node.tagName === tag && attr(node, name === "design-runtime" ? "data-deck-design-runtime" : "data-deck-design-style") === "3");
    const loc = node?.sourceCodeLocation;
    return loc ? html.slice(loc.startOffset, loc.endOffset) : null;
  }
  if (name === "navigation") {
    const script = sourceElements(html).find(node => node.tagName === "script" && node.childNodes.some(child => "value" in child && child.value.includes("var WIDTH = 1280;") && child.value.includes("data-deck-ready")));
    const loc = script?.sourceCodeLocation;
    return loc ? html.slice(loc.startOffset, loc.endOffset) : null;
  }
  if (name === "diagram-library") return html.includes(diagramStart) ? "mermaid" : null;
  const element = sourceElements(html).find(node => name === "title" ? node.tagName === "title" : node.tagName === "script" && attr(node, settingMarks[name]) !== undefined);
  if (!element) return null;
  return element.childNodes.map(node => "value" in node ? node.value : "").join("");
}
function validFragment(raw: string, target: string, slide: boolean): void {
  const fragment = parseFragment(raw, { sourceCodeLocationInfo: true });
  if (fragment.childNodes.length !== 1) throw new DeckEditConflictError(defaultTranslate("deckEditor.conflict.chooseOne"));
  const element = fragment.childNodes[0];
  if (!("tagName" in element) || attr(element, DECK_NODE_MARK) !== target || (slide && (element.tagName !== "section" || attr(element, "data-deck-slide") === undefined))) throw new DeckEditConflictError(defaultTranslate("deckEditor.conflict.idMismatch"));
  const walk = (node: Node): void => {
    if ("tagName" in node) {
      if (["iframe", "object", "embed", "base", "html", "body", "head", "link", "style"].includes(node.tagName)) throw new DeckEditConflictError(defaultTranslate("deckEditor.conflict.notDirect"));
      if (node.tagName === "script" && (attr(node, "type") !== "application/json" || !node.attrs.some(a => ["data-dd-chart-source", "data-deck-chart-source", "data-dd-native-source"].includes(a.name)))) throw new DeckEditConflictError(defaultTranslate("deckEditor.conflict.scripted"));
      if (node.attrs.some(a => /^on/i.test(a.name) || /^(data-deck-canvas|data-surprise-edit|data-deck-frame|data-deck-stage)/.test(a.name) || ["sp-top", "sp-to-top"].includes(a.value) && a.name === "id")) throw new DeckEditConflictError(defaultTranslate("deckEditor.conflict.editorChrome"));
      if (node.tagName === "script") {
        const value: unknown = JSON.parse(node.childNodes.map(child => "value" in child ? child.value : "").join(""));
        if (attr(node, "data-dd-native-source") !== undefined) deckNativeSourceSchema.parse(value);
      }
    }
    if ("childNodes" in node) node.childNodes.forEach(walk);
  };
  walk(element);
}
function applyAuthoring(html: string, operation: Extract<DeckEditOperation, {kind: "fragment" | "order" | "setting"}>): { html: string; inverse: DeckEditOperation[] } {
  const nodes = sourceElements(html);
  if (operation.kind === "setting") {
    const before = deckSourceSetting(html, operation.name);
    // The preview carries local font URLs; normalize only reviewed stock blocks.
    if ((operation.name === "design-runtime" || operation.name === "design-style") && operation.before !== null && operation.after !== null && before !== operation.before && before === withVendorScripts(operation.before)) {
      operation = {...operation,before,after:withVendorScripts(operation.after)};
    }
    if (before === operation.after) return { html, inverse: [] };
    if (before !== operation.before) throw new DeckEditConflictError();
    if (operation.name === "diagram-library") {
      if (operation.after !== null && operation.after !== "mermaid") throw new DeckEditConflictError(defaultTranslate("deckEditor.conflict.diagramMismatch"));
      const head = nodes.find(node => node.tagName === "head")?.sourceCodeLocation?.startTag?.endOffset;
      if (head === undefined) throw new DeckEditConflictError(defaultTranslate("deckEditor.conflict.settingsMissing"));
      const begin = html.indexOf(diagramStart), end = html.indexOf(diagramEnd,begin);
      if (begin >= 0 && end < begin) throw new DeckEditConflictError(defaultTranslate("deckEditor.conflict.diagramReload"));
      const text = operation.after === null ? "" : diagramStart + diagramKit + diagramEnd;
      return {html:patch(html,[{start:begin >= 0 ? begin : head,end:begin >= 0 ? end + diagramEnd.length : head,text}]),inverse:[{...operation,before:operation.after,after:before}]};
    }
    if (operation.name === "design-runtime" || operation.name === "design-style") {
      if (before === null || operation.after === null || !isStockDesign(operation.name, before) || !isStockDesign(operation.name, operation.after)) throw new DeckEditConflictError(defaultTranslate("deckEditor.conflict.customRendering"));
      const node = nodes.find(node => node.sourceCodeLocation && html.slice(node.sourceCodeLocation.startOffset, node.sourceCodeLocation.endOffset) === before);
      const loc = node?.sourceCodeLocation;
      if (!loc) throw new DeckEditConflictError();
      return {html:patch(html,[{start:loc.startOffset,end:loc.endOffset,text:operation.after}]),inverse:[{...operation,before:operation.after,after:before}]};
    }
    if (operation.name === "navigation") {
      if (before === operation.after) return { html, inverse: [] };
      if (before !== operation.before || before === null || operation.after === null) throw new DeckEditConflictError(defaultTranslate("deckEditor.conflict.presentationChanged"));
      const allowed = [navigationRuntime, ...legacyNavigation];
      if (!allowed.includes(before) || !allowed.includes(operation.after)) throw new DeckEditConflictError(defaultTranslate("deckEditor.conflict.customPresentation"));
      const node = nodes.find(node => node.tagName === "script" && node.sourceCodeLocation && html.slice(node.sourceCodeLocation.startOffset, node.sourceCodeLocation.endOffset) === before);
      const loc = node?.sourceCodeLocation;
      if (!loc) throw new DeckEditConflictError();
      return { html: patch(html, [{start:loc.startOffset,end:loc.endOffset,text:operation.after}]), inverse: [{...operation,before:operation.after,after:before}] };
    }
    if (operation.after !== null && operation.name !== "title") {
      const value: unknown = JSON.parse(operation.after);
      const schemas = { appearance: deckOverridesSchema, focus: deckFocusOverridesSchema, logo: deckLogoOverridesSchema, "focus-source": deckFocusSchema, "design-source": deckDesignSchema, "logo-source": deckLogoSchema, theme: themeStampSchema };
      schemas[operation.name].parse(value);
    }
    const name = operation.name;
    const node = nodes.find(node => name === "title" ? node.tagName === "title" : node.tagName === "script" && attr(node, settingMarks[name]) !== undefined);
    const loc = node?.sourceCodeLocation;
    const head = nodes.find(node => node.tagName === "head")?.sourceCodeLocation?.endTag?.startOffset;
    if (head === undefined) throw new DeckEditConflictError(defaultTranslate("deckEditor.conflict.settingsMissing"));
    const value = operation.after === null ? "" : operation.name === "title" ? `<title>${escapeText(operation.after)}</title>` : `<script type="application/json" ${settingMarks[operation.name]}>${operation.after.replace(/</g, "\\u003c")}</script>`;
    const textOnly=node&&operation.after!==null&&name!=="title"&&loc?.startTag&&loc.endTag&&
      html.slice(loc.startOffset,loc.startTag.endOffset)===`<script type="application/json" ${settingMarks[name]}>`&&html.slice(loc.endTag.startOffset,loc.endOffset)==="</script>";
    const encoded=operation.after?.replace(/</g,"\\u003c")??"";
    const next = textOnly&&node&&loc?.startTag&&loc.endTag?patchTextToken(html,node,{start:loc.startTag.endOffset,end:loc.endTag.startOffset,text:before??""},encoded,encoded):patch(html, [{ start: loc?.startOffset ?? head, end: loc?.endOffset ?? head, text: value }]);
    return { html: next, inverse: [{ ...operation, before: deckSourceSetting(next, operation.name), after: before }] };
  }
  if (operation.kind === "order") {
    const parent = nodes.find(node => sourceId(node) === operation.target);
    if (!parent) throw new DeckEditConflictError(defaultTranslate("deckEditor.conflict.noOrderPlace"));
    const children = parent.childNodes.filter((node): node is Element => "tagName" in node && Boolean(sourceId(node)));
    const current = children.map(node => sourceId(node)!);
    if (JSON.stringify(current) === JSON.stringify(operation.after)) return { html, inverse: [] };
    if (JSON.stringify(current) !== JSON.stringify(operation.before) || new Set(operation.after).size !== current.length || operation.after.some(id => !current.includes(id))) throw new DeckEditConflictError(defaultTranslate("deckEditor.conflict.orderUpdated"));
    const raw = new Map(children.map(node => { const loc = node.sourceCodeLocation!; return [sourceId(node), html.slice(loc.startOffset, loc.endOffset)]; }));
    return { html: patch(html, children.flatMap((node, index) => sourceId(node)===operation.after[index] ? [] : [{ start: node.sourceCodeLocation!.startOffset, end: node.sourceCodeLocation!.endOffset, text: raw.get(operation.after[index])! }])), inverse: [{ ...operation, before: operation.after, after: current }] };
  }
  const parent = nodes.find(node => sourceId(node) === operation.parentId);
  if (!parent || (operation.parentId !== "deck-root" && !nodes.some(node => node === parent && attr(node, DECK_NODE_MARK)))) throw new DeckEditConflictError(defaultTranslate("deckEditor.conflict.insertGone"));
  const existing = nodes.find(node => sourceId(node) === operation.target), loc = existing?.sourceCodeLocation;
  const current = loc ? html.slice(loc.startOffset, loc.endOffset) : null;
  if (current === operation.after) return { html, inverse: [] };
  if (current !== operation.before || existing && existing.parentNode !== parent) throw new DeckEditConflictError();
  // Never accept a change whose inverse would be rejected. Unknown author runtimes remain intact.
  if (current !== null) validFragment(current, operation.target, operation.parentId === "deck-root");
  if (operation.after !== null) validFragment(operation.after, operation.target, operation.parentId === "deck-root");
  const anchor = operation.beforeId === null ? parent.childNodes.find(node => "tagName" in node && attr(node,"data-deck-notes")!==undefined) : parent.childNodes.find(node => "tagName" in node && sourceId(node) === operation.beforeId);
  if (!existing && operation.beforeId !== null && !anchor) throw new DeckEditConflictError(defaultTranslate("deckEditor.conflict.insertMoved"));
  let at = loc?.startOffset ?? anchor?.sourceCodeLocation?.startOffset ?? parent.sourceCodeLocation?.endTag?.startOffset;
  if (at === undefined) throw new DeckEditConflictError();
  if(!existing && operation.beforeGap){if(html.slice(at-operation.beforeGap.length,at)!==operation.beforeGap)throw new DeckEditConflictError(defaultTranslate("deckEditor.conflict.restoreOrderChanged"));at-=operation.beforeGap.length;}
  const next = patch(html, [{ start: at, end: loc?.endOffset ?? at, text: operation.after ?? "" }]);
  sourceEntries(next, true); // Reject duplicate identities before committing any part of the batch.
  const beforeId = existing ? deckSourceFragment(html, operation.target)?.beforeId ?? null : operation.beforeId;
  const following = parent.childNodes.find(node => "tagName" in node && (beforeId ? sourceId(node)===beforeId : attr(node,"data-deck-notes")!==undefined) && (node.sourceCodeLocation?.startOffset??0)>=(loc?.endOffset??0));
  const gapEnd=following?.sourceCodeLocation?.startOffset??parent.sourceCodeLocation?.endTag?.startOffset;
  const beforeGap=loc && operation.after===null && gapEnd!==undefined?html.slice(loc.endOffset,gapEnd):undefined;
  return { html: next, inverse: [{ ...operation, beforeId, beforeGap, before: operation.after, after: current }] };
}

/** Duplicate source, replacing identities and local references without normalizing author markup. */
export function cloneDeckFragment(raw: string, namespace: string): { html: string; ids: Record<string, string> } {
  const tree = parseFragment(raw, { sourceCodeLocationInfo: true });
  const nodes: Element[] = [];
  const walk = (node: Node): void => { if ("tagName" in node) nodes.push(node); if ("childNodes" in node) node.childNodes.forEach(walk); };
  walk(tree);
  const ids: Record<string, string> = {};
  for (const node of nodes) for (const a of node.attrs) if (a.name === "id" || a.name === DECK_NODE_MARK || a.name === "data-deck-id" || /^data-dd-.+-id$/.test(a.name)) ids[a.value] ??= `${namespace}-${Object.keys(ids).length}`;
  const charts = nodes.filter(node => node.tagName === "script" && attr(node,"data-dd-chart-source") !== undefined);
  const register = (value: unknown): void => {
    if(Array.isArray(value)){value.forEach(register);return;}
    if(!value || typeof value!=="object")return;
    for(const [key,child] of Object.entries(value)){if((key==="id"||key==="rangeId")&&typeof child==="string")ids[child]??=`${namespace}-${Object.keys(ids).length}`;register(child);}
  };
  charts.forEach(node => register(JSON.parse(node.childNodes.map(child => "value" in child ? child.value : "").join(""))));
  const edits: Patch[] = [];
  for (const node of nodes) for (const a of node.attrs) {
    const loc = node.sourceCodeLocation?.attrs?.[a.name]; if (!loc) continue;
    const identity = a.name === "id" || a.name === DECK_NODE_MARK || a.name === "data-deck-id" || /^data-dd-.+-id$/.test(a.name);
    const reference = ["href", "data-dd-slide-link", "data-dd-range-ref", "aria-labelledby", "aria-describedby", "for"].includes(a.name);
    const value = identity ? ids[a.value] ?? a.value : reference ? a.value.split(/\s+/).map(value => ids[value] ?? (value.startsWith("#") && ids[value.slice(1)] ? `#${ids[value.slice(1)]}` : value)).join(" ") : a.value;
    if (value !== a.value) edits.push({ start: loc.startOffset, end: loc.endOffset, text: `${a.name}="${escapeAttribute(value)}"` });
  }
  for(const chart of charts){const loc=chart.sourceCodeLocation;if(!loc?.startTag||!loc.endTag)continue;const value:unknown=JSON.parse(raw.slice(loc.startTag.endOffset,loc.endTag.startOffset));const text=JSON.stringify(remapDeckReferences(value,ids)).replace(/</g,"\\u003c");edits.push({start:loc.startTag.endOffset,end:loc.endTag.startOffset,text});}
  return { html: patch(raw, edits), ids };
}

/** Only identities and references change. A label that happens to equal an ID is still prose. */
export function remapDeckReferences(value: unknown, ids: Readonly<Record<string,string>>, field=""): unknown {
  if(typeof value==="string")return ["id","slideId","rangeId","source","target","forecastFrom"].includes(field)?ids[value]??value:value;
  if(Array.isArray(value))return value.map(item=>remapDeckReferences(item,ids,field));
  if(value&&typeof value==="object")return Object.fromEntries(Object.entries(value).map(([key,child])=>[key,remapDeckReferences(child,ids,key)]));
  return value;
}

/** Convert safe data-only changes from the existing inspector into independent operations. */
export function refineDeckOperations(html:string,operations:readonly DeckEditOperation[],options:{settingsBatch?:boolean}={}):DeckEditOperation[]{
 return operations.flatMap(op=>{
  if(op.kind==="setting" && ["appearance","focus","logo"].includes(op.name)){
   const initial=op.name==="appearance"?emptyOverrides():op.name==="focus"?emptyFocusOverrides():emptyLogoOverrides();
   const before:unknown=op.before===null?initial:JSON.parse(op.before),after:unknown=op.after===null?initial:JSON.parse(op.after);
   // A logo asset is one validated object (or explicit null). Splitting its
   // fields would temporarily save an incomplete asset and lose null=remove.
   if(op.name==='logo'){
    const left=deckLogoOverridesSchema.parse(before),right=deckLogoOverridesSchema.parse(after);
    if(JSON.stringify(left.asset)!==JSON.stringify(right.asset))return [op];
   }
   const changes:unknown[]=[];
   const diff=(a:unknown,b:unknown,path:string[]):void=>{
    if(JSON.stringify(a)===JSON.stringify(b))return;
    if((a===null||typeof a==="object"&&!Array.isArray(a))&&(b===null||typeof b==="object"&&!Array.isArray(b))&&(a!==null||b!==null)){
     const left:Record<string,unknown>=a&&typeof a==="object"?{...a}:{},right:Record<string,unknown>=b&&typeof b==="object"?{...b}:{};for(const key of new Set([...Object.keys(left),...Object.keys(right)]))diff(left[key]??null,right[key]??null,[...path,key]);
    }else if(path.length)changes.push({kind:"setting-field",target:"deck-document",name:op.name,path,before:a??null,after:b??null});
   };
   diff(before,after,[]);return (options.settingsBatch?deckEditRecordOperationsSchema:deckEditOperationsSchema).parse(changes);
  }
  if(op.kind!=="fragment"||!op.before||!op.after)return [op];
  const a=parseFragment(op.before).childNodes.find((n):n is Element=>"tagName" in n),b=parseFragment(op.after).childNodes.find((n):n is Element=>"tagName" in n);
  if(!a||!b||a.tagName!==b.tagName)return [op];
  if(a.tagName==="table"){
   const structure=(node:Element):unknown=>[node.tagName,[...node.attrs].sort((a,b)=>a.name.localeCompare(b.name)),node.childNodes.filter((child):child is Element=>"tagName" in child).map(structure)];
   if(JSON.stringify(structure(a))!==JSON.stringify(structure(b)))return [op];
   const before=sourceEntries(`<html><body data-deck><section data-deck-slide data-deck-node="temporary-slide">${op.before}</section></body></html>`,true).map(view);
   const after=sourceEntries(`<html><body data-deck><section data-deck-slide data-deck-node="temporary-slide">${op.after}</section></body></html>`,true).map(view);
   if(JSON.stringify(before.map(n=>[n.id,n.tag,n.textRuns.length]))!==JSON.stringify(after.map(n=>[n.id,n.tag,n.textRuns.length])))return [op];
   return before.flatMap((node,i)=>node.textRuns.flatMap((run,r)=>run.text===after[i].textRuns[r].text?[]:[{kind:"text",target:node.id,run:run.run,before:run.text,after:after[i].textRuns[r].text} satisfies DeckEditOperation]));
  }
  if(attr(a,"data-deck-basic-chart")&&attr(a,"data-deck-basic-chart")===attr(b,"data-deck-basic-chart")){
   const read=(node:Element)=>node.childNodes.find((n):n is Element=>"tagName" in n&&attr(n,"data-dd-chart-source")!==undefined)?.childNodes.map(n=>"value" in n?n.value:"").join("");
   const x=read(a),y=read(b);if(!x||!y)return [op];
   const before=readDeckChartSource(x),after=readDeckChartSource(y);
   const strip=(data:ReturnType<typeof readDeckChartSource>)=>({...data,series:data.series.map(s=>({...s,data:s.data.map(p=>({...p,value:null}))}))});
   if(JSON.stringify(strip(before))!==JSON.stringify(strip(after))||JSON.stringify(a.attrs)!==JSON.stringify(b.attrs))return [op];
   return before.series.flatMap((series,s)=>series.data.flatMap((point,p)=>(point.value??null)===(after.series[s].data[p].value??null)?[]:[{kind:"chart-value",target:op.target,seriesId:series.id,pointId:point.id,before:point.value??null,after:after.series[s].data[p].value??null} satisfies DeckEditOperation]));
  }
  return [op];
 });
}

/** Text run numbers are valid only while the surrounding inline structure stays the same. */
export function assertDeckTextStructure(base:string,current:string,operations:readonly DeckEditOperation[]):void{
 const before=new Map(sourceEntries(base,true).map(entry=>[entry.id,entry.element]));
 const after=new Map(sourceEntries(current,true).map(entry=>[entry.id,entry.element]));
 const shape=(element:Element)=>JSON.stringify(element.childNodes.map(node=>"value" in node||"data" in node&&node.data.startsWith(DECK_EMPTY_TEXT_PREFIX)?"text":"tagName" in node?[node.tagName,attr(node,DECK_NODE_MARK)??null]:"comment"));
 for(const op of operations){if(op.kind!=="text")continue;const a=before.get(op.target),b=after.get(op.target);if(a&&b&&shape(a)!==shape(b))throw new DeckEditConflictError(defaultTranslate("deckEditor.conflict.textStructureUpdated"));}
}
