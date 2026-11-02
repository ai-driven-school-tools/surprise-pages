import {youtubeId} from "../../lib/deck/media/media";
import {authoredMediaSource,writeMediaSource} from "../../lib/deck/media/video-source";
import { installDeckPlayback, releaseDeckVideo, activateDeckVideo } from "../../lib/deck/playback";
import { DECK_SLIDE, DECK_NOTES, DECK_CANVAS } from "../../lib/deck/deck";
import { DECK_NODE_MARK, DECK_CREATED_MARK, DECK_EMPTY_TEXT_PREFIX, type DeckEditableNode, type DeckEditOperation } from "../../lib/deck/edit/model";
import { TOKENS } from "../shared/tokens";
import { deckSlideDrawn } from "../../lib/deck/design/typography";
import { canvasDelta, cropPosition, dragCropPosition, resizeBox, translateBy, moveCropWindow, type CanvasPoint } from "./canvas-geometry";
import { t } from "../shared/i18n";
import { deckErrorMessage } from "../../lib/deck/edit/message";

export type DeckCanvasOptions = {
  document: Document;
  nodes: readonly DeckEditableNode[];
  onOperations: (operations: DeckEditOperation[]) => void;
  onUndo?: () => void;
  onRedo?: () => void;
  onSelection?: (ids: string[]) => void;
  onActivity?: (active: boolean) => void;
  onFiles?: (files: File[], slideId: string, point: CanvasPoint, replacementId?: string) => void;
  onUrl?: (url:string,slideId:string,point:CanvasPoint,replacementId?:string)=>void;
  onPalette?: (value:string,slideId:string,point:CanvasPoint,replacementId?:string)=>void;
  onMessage?: (message: string) => void;
  onExitToToolbar?: () => void;
  externalToolbar?: boolean;
  onEditComplex?: (id: string) => void;
  onCommand?: (command: string) => void;
  onCrop?: (id: string) => void;
};
export type DeckCanvas = ReturnType<typeof createDeckCanvas>;
type Align = "left" | "center" | "right" | "top" | "middle" | "bottom";
type TextRun = { target: string; run: number; node: Text; before: string };
type TextBox = { node: HTMLElement; operations: DeckEditOperation[]; applied: boolean; persisted: boolean };
type DragItem = { node: HTMLElement; before: string | null; translation: string };
type Drag = { pointer: number; start: CanvasPoint; slide: HTMLElement; items: DragItem[]; active: boolean; mode: "move" | "resize" | "crop"; width: number; height: number; originalScale: number; scaleBefore: string | null; originBefore: string | null; cropBefore: string | null; clipBefore: string | null; clip: number[]; crop: CanvasPoint };
const CHROME = "data-deck-canvas-chrome";
const graphemes = new Intl.Segmenter("ja", { granularity: "grapheme" });
const EXCLUDED = `svg,script,style,[${DECK_NOTES}],.mermaid,[data-deck-chart],[data-deck-logo-view],[${CHROME}]`;
const CSS = `
:host { position: fixed; inset: 0; z-index: 2147482600; pointer-events: none; }
* { box-sizing: border-box; }
.box { position: fixed; border: var(--rule-thin) solid var(--accent); pointer-events: none; }
.handle { position: absolute; right: calc(-1 * var(--size-grip)); bottom: calc(-1 * var(--size-grip)); width: var(--size-control); height: var(--size-control); border: 0; padding: 0; background: transparent; cursor: nwse-resize; pointer-events: auto; touch-action: none; }
.handle::after { content: ''; display: block; width: var(--size-grip); height: var(--size-grip); margin: auto; background: var(--surface); border: var(--rule-thin) solid var(--accent); }
.toolbar { position: fixed; display: flex; gap: var(--space-1); padding: var(--space-1); border-radius: var(--radius-md); background: var(--surface); color: var(--text); pointer-events: auto; font: var(--font-base)/var(--leading-tight) system-ui,sans-serif; }
button { color: inherit; background: transparent; font: inherit; border: 0; padding: var(--space-2); border-radius: var(--radius-sm); cursor: pointer; }
button:hover { background: var(--surface-sunken); }
button:focus-visible { outline: var(--rule-thick) solid var(--accent); outline-offset: var(--space-1); }
.overflow { position: fixed; max-width: var(--size-popover); padding: var(--space-2); border-radius: var(--radius-sm); color: var(--danger); background: var(--surface); font: var(--font-base)/var(--leading-normal) system-ui,sans-serif; pointer-events: auto; }
.status { position: fixed; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }
.media-placeholder { position:fixed; display:grid; place-items:center; width:180px; aspect-ratio:16/9; padding:12px; border:var(--rule-thin) dashed var(--accent); border-radius:var(--radius-sm); background:color-mix(in srgb,var(--surface) 82%,transparent); color:var(--muted); font:var(--font-sm)/var(--leading-normal) system-ui,sans-serif; text-align:center; pointer-events:none; }
`;

/** Adds interaction to the existing rendered document. It never serializes or rebuilds that document. */
export function createDeckCanvas(options: DeckCanvasOptions) {
  const doc = options.document;
  const view = doc.defaultView;
  if (!view) throw new Error(t("deckEditor.canvas.openFailed"));
  let known = new Map(options.nodes.map((node) => [node.id, node]));
  let selected: string[] = [];
  let lastSlide: string | null = null;
  let readOnly = false;
  let disposed = false;
  let editing: HTMLElement | null = null;
  let previewVideo: HTMLVideoElement | null = null;
  const videoControls = new Map<HTMLVideoElement,boolean>();
  let editingAttributes: Map<string, string | null> | null = null;
  let runs: TextRun[] = [];
  let textBox: TextBox | null = null;
  let composing = false;
  let composition: { start: Node; startOffset: number; end: Node; endOffset: number; children: { node: Node; children: Node[] }[]; text: { node: Text; value: string }[] } | null = null;
  let drag: Drag | null = null;
  let cropping = false;
  let remoteQueue: DeckEditOperation[] = [];
  let animation = 0;
  let marquee: { x: number; y: number; slide: Element; ids: string[]; box: HTMLDivElement } | null = null;
  let guides: { x?: number; y?: number } = {};
  const removers: (() => void)[] = [];
  const host = doc.createElement("div");
  host.setAttribute(CHROME, "");
  const shadow = host.attachShadow({ mode: "open" });
  const style = doc.createElement("style");
  style.textContent = TOKENS + CSS;
  shadow.append(style);
  const boxes = doc.createElement("div");
  const status = doc.createElement("div");
  status.className = "status";
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  shadow.append(boxes, status);
  doc.body.append(host);
  const editStyle = doc.createElement("style");
  editStyle.setAttribute(CHROME, "");
  editStyle.textContent = `[data-deck-canvas-input] { outline: none !important; }
[data-deck-canvas-scroll] { overflow: auto !important; scrollbar-width: none !important; }
[data-deck-canvas-scroll]::-webkit-scrollbar { display: none !important; }`;
  doc.head.append(editStyle);
  installDeckPlayback(doc);
  function stopPreview(){if(previewVideo){releaseDeckVideo(previewVideo);previewVideo.controls=false;previewVideo=null;}}
  function preview(video:HTMLVideoElement){stopPreview();previewVideo=video;activateDeckVideo(video);video.controls=true;video.focus();void video.play().catch(()=>message(t("deckEditor.canvas.videoPlayFailed")));draw();}
  function syncVideoControls(){for(const video of doc.querySelectorAll("video")){if(!videoControls.has(video))videoControls.set(video,video.controls);video.controls=video===previewVideo;}if(previewVideo&&!previewVideo.isConnected)stopPreview();}
  removers.push(()=>{stopPreview();for(const [video,controls] of videoControls)video.controls=controls;});

  function listen<K extends keyof DocumentEventMap>(name: K, callback: (event: DocumentEventMap[K]) => void) {
    doc.addEventListener(name, callback, true);
    removers.push(() => doc.removeEventListener(name, callback, true));
  }
  const elementIndex = new Map<string, HTMLElement>();
  for (const node of doc.querySelectorAll<HTMLElement>(`[${DECK_NODE_MARK}]`)) elementIndex.set(node.getAttribute(DECK_NODE_MARK)!, node);
  function find(id: string): HTMLElement | null {
    if(!id)return null;
    if (!id) return null;
    const cached = elementIndex.get(id);
    if (cached?.isConnected && cached.ownerDocument === doc && cached.getAttribute(DECK_NODE_MARK) === id) return cached;
    const node = doc.querySelector(`[${DECK_NODE_MARK}="${globalThis.CSS?.escape(id) ?? id}"]`);
    if (node instanceof view!.HTMLElement) { elementIndex.set(id, node); return node; }
    elementIndex.delete(id); return null;
  }
  function safe(node: HTMLElement): boolean {
    const id = node.getAttribute(DECK_NODE_MARK);
    return !!id && known.has(id) && !node.matches(`[${DECK_SLIDE}]`) && !node.closest(EXCLUDED) && !!node.closest(`[${DECK_SLIDE}]`);
  }
  /** A slide still waiting for its charts and diagrams is not edited yet. It is drawn
   * next once shown, so the press is ignored only for that short moment. */
  function drawnAt(event: Event): boolean {
    const slide = event.target instanceof view!.Element ? event.target.closest(`[${DECK_SLIDE}]`) : null;
    return !slide || deckSlideDrawn(doc, slide);
  }
  function target(event: Event): HTMLElement | null {
    const raw = event.target;
    if (!(raw instanceof view!.Element)) return null;
    const node = raw.closest(`[data-dd-chart],table[data-deck-node],[data-deck-group]`) ?? raw.closest(`[${DECK_NODE_MARK}]`);
    if (options.externalToolbar && node === raw && node instanceof view!.HTMLElement && !node.textContent?.trim() && !node.matches("img,video,[data-deck-media-slot],[data-deck-shape],[data-dd-chart],[data-deck-group]")) return null;
    return node instanceof view!.HTMLElement && safe(node) ? node : null;
  }
  function elements(): HTMLElement[] {
    return selected.flatMap((id) => { const node = find(id); return node && safe(node) ? node.hasAttribute("data-deck-group") ? [...node.children].filter((n): n is HTMLElement => n instanceof view!.HTMLElement && safe(n)) : [node] : []; });
  }
  function announce(text: string) { status.textContent = text; }
  function message(text: string) { announce(text); options.onMessage?.(text); }
  function showMediaPlaceholder(slideId:string,point:CanvasPoint|null,replacementId?:string):()=>void{
    const slide=find(slideId),replacement=replacementId?find(replacementId):null,target=replacement??slide;if(!target)return()=>{};
    const rect=target.getBoundingClientRect(),node=doc.createElement("div");node.className="media-placeholder";node.textContent=t("deckEditor.canvas.imagePreparing");
    if(replacement){node.style.left=`${rect.left}px`;node.style.top=`${rect.top}px`;node.style.width=`${Math.max(80,rect.width)}px`;node.style.height=`${Math.max(60,rect.height)}px`;}
    else{const scale=rect.width/1280,x=point?.x??550,y=point?.y??315;node.style.left=`${rect.left+x*scale}px`;node.style.top=`${rect.top+y*scale}px`;node.style.width=`${180*scale}px`;}
    shadow.append(node);return()=>node.remove();
  }
  function activity() { options.onActivity?.(!!editing || !!drag || composing); }
  function button(label: string, action: () => void) {
    const node = doc.createElement("button");
    node.type = "button"; node.textContent = label;
    node.addEventListener("pointerdown", (event) => event.preventDefault());
    node.addEventListener("click", action);
    return node;
  }
  function clipInsets(node: HTMLElement): number[] {
    const value = view!.getComputedStyle(node).clipPath;
    const match = /^inset\(([-\d.%\s]+)\)$/.exec(value);
    if (!match) return [0, 0, 0, 0];
    const parts = match[1].trim().split(/\s+/);
    if (parts.some((part) => !/^-?[\d.]+%$/.test(part))) return [0, 0, 0, 0];
    const values = parts.map(Number.parseFloat);
    return [values[0], values[1] ?? values[0], values[2] ?? values[0], values[3] ?? values[1] ?? values[0]];
  }
  function draw() {
    if (disposed) return;
    syncVideoControls();
    boxes.replaceChildren();
    for (const [axis, value] of Object.entries(guides)) {
      const guide = doc.createElement("div");
      guide.style.cssText = `position:fixed;pointer-events:none;background:var(--accent);${axis === "x" ? `left:${value}px;top:0;width:1px;height:100vh` : `top:${value}px;left:0;height:1px;width:100vw`}`;
      boxes.append(guide);
    }
    const chosen = elements();
    for (const node of chosen) {
      const full = node.getBoundingClientRect();
      const clip = node.tagName === "IMG" ? clipInsets(node) : [0, 0, 0, 0];
      const rect = { left: full.left + full.width * clip[3] / 100, top: full.top + full.height * clip[0] / 100, width: full.width * (1 - (clip[1] + clip[3]) / 100), height: full.height * (1 - (clip[0] + clip[2]) / 100) };
      const box = doc.createElement("div"); box.className = "box";
      Object.assign(box.style, { left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px` });
      if (!readOnly && !node.hasAttribute("data-deck-locked") && (node.tagName === "IMG" || node.tagName === "VIDEO" || node.hasAttribute("data-deck-youtube") || options.externalToolbar && node.hasAttribute("data-deck-shape")) && chosen.length === 1 && !editing && node!==previewVideo) {
        const handle = button("", () => {}); handle.className = "handle";
        handle.setAttribute("aria-label", node.tagName==="VIDEO"?t("deckEditor.canvas.resizeVideo"):t("deckEditor.canvas.resizeImage"));
        handle.addEventListener("pointerdown", (event) => startDrag(event, node, "resize"));
        handle.addEventListener("keydown", (event) => {
          const delta = keyDelta(event); if (!delta) return;
          event.preventDefault(); resizeImage(node, delta); draw();
        });
        box.append(handle);
      }
      boxes.append(box);
    }
    for (const item of known.values()) {
      if (item.style.overflow !== "clip" || !item.style["max-height"]) continue;
      const node = find(item.id); if (!node || (node.scrollHeight <= node.clientHeight + 1 && node.scrollWidth <= node.clientWidth + 1)) continue;
      const rect = node.getBoundingClientRect(); if (rect.bottom < 0 || rect.top > view!.innerHeight) continue;
      const warning = button(t("deckEditor.canvas.textOverflow"), () => beginText(node));
      warning.className = "overflow"; warning.setAttribute("aria-live", "polite");
      Object.assign(warning.style, { left: `${Math.max(8, Math.min(rect.right - 320, view!.innerWidth - 320))}px`, top: `${Math.max(8, Math.min(rect.top - 44, view!.innerHeight - 64))}px` });
      boxes.append(warning);
    }
    if (!chosen.length || readOnly || editing || drag || options.externalToolbar) return;
    const rect = chosen[0].getBoundingClientRect();
    const toolbar = doc.createElement("div"); toolbar.className = "toolbar"; toolbar.setAttribute("role", "toolbar"); toolbar.setAttribute("aria-label", t("deckEditor.canvas.toolbar"));
    Object.assign(toolbar.style, { left: `${Math.max(8, Math.min(rect.left, view!.innerWidth - 300))}px`, top: `${Math.max(8, rect.top - 44)}px` });
    if (chosen.length === 1 && chosen[0].tagName !== "IMG" && captureTextBox(chosen[0]) && collectRuns(chosen[0]).length) {
      toolbar.append(button(t("deckEditor.canvas.editText"), () => beginText(chosen[0])));
    }
    if (chosen.length === 1 && chosen[0].tagName === "IMG") {
      const cropButton = button(cropping ? t("deckEditor.canvas.cropEnd") : t("deckEditor.canvas.cropPosition"), () => { crop(); announce(cropping ? t("deckEditor.canvas.cropHint") : t("deckEditor.canvas.cropDone")); });
      cropButton.setAttribute("aria-pressed", String(cropping)); toolbar.append(cropButton);
      if (cropping) {
        const node = chosen[0];
        const label = doc.createElement("label"); label.textContent = t("deckEditor.canvas.cropRange");
        const range = doc.createElement("input"); range.type = "range"; range.min = "0"; range.max = "45"; range.step = "1";
        range.value = String(Math.round(Math.min(...clipInsets(node)))); range.setAttribute("aria-label", t("deckEditor.canvas.cropRange"));
        const before = originalStyle(node, "clip-path");
        range.addEventListener("input", () => {
          const amount = Number(range.value); writeStyle(node, "clip-path", amount ? `inset(${amount}% ${amount}% ${amount}% ${amount}%)` : null);
        });
        range.addEventListener("change", () => {
          const after = node.style.getPropertyValue("clip-path") || null;
          commit([{ kind: "style", target: node.getAttribute(DECK_NODE_MARK)!, property: "clip-path", before, after }]); draw();
        });
        label.append(range); toolbar.append(label);
        toolbar.append(button(t("deckEditor.canvas.showAll"), () => emit([styleOperation(node, "clip-path", null), styleOperation(node, "object-position", "50% 50%")])));
      }
    }
    if(chosen.length===1 && chosen[0] instanceof view!.HTMLVideoElement){const video=chosen[0];toolbar.append(button(previewVideo===video?t("deckEditor.canvas.backToEdit"):t("deckEditor.canvas.playVideo"),()=>{if(previewVideo===video){stopPreview();draw();}else preview(video);}));}
    if (chosen.length > 1) {
      toolbar.append(button(t("deckEditor.canvas.alignLeft"), () => align("left")), button(t("deckEditor.canvas.alignTop"), () => align("top")));
    }
    boxes.append(toolbar);
  }
  function scheduleDraw() { if (!animation) animation = view!.requestAnimationFrame(() => { animation = 0; draw(); }); }
  function currentSlide(): string | null {
    if (lastSlide && find(lastSlide)) return lastSlide;
    const middle = view!.innerHeight / 2;
    const candidates = [...doc.querySelectorAll<HTMLElement>(`[${DECK_SLIDE}][${DECK_NODE_MARK}]`)].filter((node) => {
      const rect = node.getBoundingClientRect(); return rect.width > 0 && rect.bottom > 0 && rect.top < view!.innerHeight;
    });
    candidates.sort((a, b) => {
      const first = a.getBoundingClientRect(), second = b.getBoundingClientRect();
      return Math.abs((first.top + first.bottom) / 2 - middle) - Math.abs((second.top + second.bottom) / 2 - middle);
    });
    return candidates[0]?.getAttribute(DECK_NODE_MARK) ?? null;
  }
  function select(ids: string[]) {
    if(previewVideo && !ids.includes(previewVideo.getAttribute(DECK_NODE_MARK)??""))stopPreview();
    if (editing && !endText()) return;
    selected = [...new Set(ids)].filter((id) => { const node = find(id); return node && safe(node); });
    // A selected container owns its descendants; moving both would double the displacement.
    selected = selected.filter((id) => { const node = find(id); return !selected.some((other) => other !== id && find(other)?.contains(node)); });
    const chosenSlide = selected[0] ? slideOf(find(selected[0])!) : null;
    if (chosenSlide) lastSlide = chosenSlide.getAttribute(DECK_NODE_MARK);
    cropping = false; if (selected.length) view!.focus(); options.onSelection?.([...selected]); draw();
  }
  function directText(node: HTMLElement): Text[] {
    const result: Text[] = [];
    for (const child of [...node.childNodes]) {
      if (child.nodeType === 3 && child instanceof view!.Text) result.push(child);
      else if (child.nodeType === 8 && child.nodeValue === `${DECK_EMPTY_TEXT_PREFIX}${result.length}`) {
        const text = doc.createTextNode(""); child.replaceWith(text); result.push(text);
      }
    }
    return result;
  }
  function collectRuns(node: HTMLElement): TextRun[] {
    const result: TextRun[] = [];
    for (const current of [node, ...node.querySelectorAll<HTMLElement>(`[${DECK_NODE_MARK}]`)]) {
      const id = current.getAttribute(DECK_NODE_MARK);
      if (!id || !safe(current)) continue;
      const editableRuns = known.get(id)?.textRuns ?? [];
      directText(current).forEach((text, run) => {
        if (editableRuns.some((item) => item.run === run)) result.push({ target: id, run, node: text, before: text.data });
      });
    }
    return result.sort((left, right) => left.node.compareDocumentPosition(right.node) & 4 ? -1 : 1);
  }
  function captureTextBox(node: HTMLElement): TextBox | null {
    let box: HTMLElement | null = node;
    while (box && !box.hasAttribute(DECK_SLIDE)) {
      const style = view!.getComputedStyle(box);
      if (["block", "flow-root", "flex", "grid", "list-item"].includes(style.display)) break;
      if (style.display.includes("table")) return null;
      box = box.parentElement;
    }
    if (!box || !safe(box)) return null;
    // A scroll container establishes a new formatting context. It cannot retain
    // wrapping around an intersecting float outside the text box.
    const bounds = box.getBoundingClientRect();
    const slide = slideOf(box);
    if (slide && [...slide.querySelectorAll<HTMLElement>("*")].some((other) => {
      if (other === box || other.contains(box)) return false;
      const style = view!.getComputedStyle(other);
      if (style.cssFloat === "none" || !style.cssFloat || style.position === "absolute" || style.position === "fixed") return false;
      const rect = other.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && rect.left < bounds.right && rect.right > bounds.left && rect.top < bounds.bottom && rect.bottom > bounds.top;
    })) return null;
    // A multi-paragraph container is not one text box. Editing it could move other paragraphs inside it.
    if ([...box.querySelectorAll<HTMLElement>("*")].some((child) => {
      const display = view!.getComputedStyle(child).display;
      return ["block", "flow-root", "flex", "grid", "list-item", "table"].includes(display);
    })) return null;
    const computed = view!.getComputedStyle(box);
    if (!(Number.parseFloat(computed.width) > 0 && Number.parseFloat(computed.height) > 0)) return null;
    return {
      node: box, applied: false, persisted: false,
      // Positioned labels do not occupy space in the surrounding layout: their
      // authored auto-size must keep working. Flow text retains its height so it
      // cannot push its neighbours. Both retain the authored width constraints.
      operations: (computed.position === "absolute" || computed.position === "fixed" ? [] : [styleOperation(box, "height", computed.height),
        styleOperation(box, "min-height", computed.height), styleOperation(box, "max-height", computed.height), styleOperation(box, "overflow", "clip")]
        .filter((operation) => "after" in operation && operation.before !== operation.after)),
    };
  }
  function prepareTextBox() {
    if (!textBox || textBox.applied) return;
    for (const operation of textBox.operations) if (operation.kind === "style") writeStyle(textBox.node, operation.property, operation.after);
    textBox.node.setAttribute("data-deck-canvas-scroll", "");
    textBox.applied = true;
  }
  function releaseTextBox() {
    if (!textBox) return;
    if (textBox.applied && !textBox.persisted) for (const operation of textBox.operations) if (operation.kind === "style") writeStyle(textBox.node, operation.property, operation.before);
    textBox.node.scrollTop = 0; textBox.node.scrollLeft = 0;
    textBox.node.removeAttribute("data-deck-canvas-scroll"); textBox = null;
  }
  function flush(): boolean {
    if (composing) return false;
    if (!editing) return true;
    const operations: DeckEditOperation[] = [];
    for (const run of runs) {
      if (run.node.data !== run.before) {
        operations.push({ kind: "text", target: run.target, run: run.run, before: run.before, after: run.node.data });
      }
    }
    if (operations.length) {
      prepareTextBox();
      const batch = textBox && !textBox.persisted ? [...textBox.operations, ...operations] : operations;
      if (!commit(batch)) { if (textBox) textBox.applied = false; return true; }
      if (textBox) textBox.persisted = true;
    }
    runs.forEach((run) => { run.before = run.node.data; });
    scheduleDraw(); return true;
  }
  function beginText(node: HTMLElement, point?: CanvasPoint) {
    if (readOnly || node.hasAttribute("data-deck-youtube") || (node.tagName === "IMG" || node.tagName === "VIDEO") || !safe(node)) return;
    if (editing === node) return;
    if (!endText()) return;
    const textRuns = collectRuns(node);
    const box = captureTextBox(node);
    if (!box) { message(t("deckEditor.canvas.chooseParagraph")); return; }
    if (!textRuns.length) { message(t("deckEditor.canvas.noEditableText")); return; }
    select([node.getAttribute(DECK_NODE_MARK)!]);
    editing = node; runs = textRuns; textBox = box;
    editingAttributes = new Map(["contenteditable", "spellcheck", "tabindex", "data-deck-canvas-input"].map((name) => [name, node.getAttribute(name)]));
    node.setAttribute("contenteditable", "true"); node.setAttribute("spellcheck", "false"); node.setAttribute("tabindex", "0"); node.setAttribute("data-deck-canvas-input", "");
    node.focus({ preventScroll: true });
    if (point) {
      const caret = typeof doc.caretPositionFromPoint === "function" ? doc.caretPositionFromPoint(point.x, point.y) : null;
      const range = caret ? doc.createRange() : typeof doc.caretRangeFromPoint === "function" ? doc.caretRangeFromPoint(point.x, point.y) : null;
      if (caret && range) { range.setStart(caret.offsetNode, caret.offset); range.collapse(true); }
      if (range && node.contains(range.startContainer)) { const selection = doc.getSelection(); selection?.removeAllRanges(); selection?.addRange(range); }
    }
    activity(); draw();
  }
  function endText(): boolean {
    if (!flush()) return false;
    if (editing) {
      const previous = editing; editing = null;
      editingAttributes?.forEach((value, name) => value === null ? previous.removeAttribute(name) : previous.setAttribute(name, value));
      editingAttributes = null; runs = []; releaseTextBox();
      previous.blur(); activity();
    }
    drainRemote(); return true;
  }
  function textRange(): Range | null {
    const selection = doc.getSelection();
    if (!editing || !selection?.rangeCount) return null;
    const range = selection.getRangeAt(0);
    return editing.contains(range.startContainer) && editing.contains(range.endContainer) ? range : null;
  }
  function replaceSelection(text: string, deletion?: "backward" | "forward") {
    const range = textRange(); if (!range) return false;
    function boundary(container: Node, offset: number): { index: number; offset: number } {
      const exact = runs.findIndex((run) => run.node === container);
      if (exact >= 0) return { index: exact, offset };
      const point = doc.createRange(); point.setStart(container, offset); point.collapse(true);
      for (let index = 0; index < runs.length; index++) {
        if (point.comparePoint(runs[index].node, 0) >= 0) return { index, offset: 0 };
      }
      return { index: runs.length - 1, offset: runs[runs.length - 1]?.node.data.length ?? 0 };
    }
    const firstBoundary = boundary(range.startContainer, range.startOffset);
    const lastBoundary = boundary(range.endContainer, range.endOffset);
    let start = firstBoundary.index, end = lastBoundary.index;
    let from = firstBoundary.offset, to = lastBoundary.offset;
    if (start < 0 || end < start) return false;
    if (range.collapsed && deletion) {
      if (deletion === "backward") {
        if (!from && start > 0) { start--; from = runs[start].node.data.length; }
        const char = [...graphemes.segment(runs[start].node.data.slice(0, from))].pop(); from -= char?.segment.length ?? 0;
      } else {
        if (to === runs[end].node.data.length && end < runs.length - 1) { end++; to = 0; }
        const char = [...graphemes.segment(runs[end].node.data.slice(to))][0]; to += char?.segment.length ?? 0;
      }
    }
    const first = runs[start].node;
    const tail = runs[end].node.data.slice(to);
    // Replacing a character with itself must not create a temporary scroll box.
    if (start === end && first.data.slice(from, to) === text) {
      const caret = doc.createRange(); caret.setStart(first, from + text.length); caret.collapse(true);
      const selection = doc.getSelection(); selection?.removeAllRanges(); selection?.addRange(caret);
      return true;
    }
    prepareTextBox();
    if (start === end) first.data = first.data.slice(0, from) + text + tail;
    else {
      first.data = first.data.slice(0, from) + text;
      for (let index = start + 1; index < end; index++) runs[index].node.data = "";
      runs[end].node.data = tail;
    }
    const caret = doc.createRange(); caret.setStart(first, from + text.length); caret.collapse(true);
    const selection = doc.getSelection(); selection?.removeAllRanges(); selection?.addRange(caret);
    if (textBox && typeof caret.getBoundingClientRect === "function") {
      const cursor = caret.getBoundingClientRect(), bounds = textBox.node.getBoundingClientRect();
      const scale = bounds.width / textBox.node.offsetWidth;
      if (scale > 0 && cursor.height > 0) {
        if (cursor.bottom > bounds.bottom) textBox.node.scrollTop += (cursor.bottom - bounds.bottom) / scale;
        else if (cursor.top < bounds.top) textBox.node.scrollTop -= (bounds.top - cursor.top) / scale;
        if (cursor.right > bounds.right) textBox.node.scrollLeft += (cursor.right - bounds.right) / scale;
        else if (cursor.left < bounds.left) textBox.node.scrollLeft -= (bounds.left - cursor.left) / scale;
      }
    }
    flush(); return true;
  }
  function writeStyle(node: HTMLElement, property: string, value: string | null) {
    if (value === null) { node.style.removeProperty(property); return; }
    const important = /\s*!important\s*$/i.test(value);
    node.style.setProperty(property, important ? value.replace(/\s*!important\s*$/i, "") : value, important ? "important" : "");
  }
  function originalStyle(node: HTMLElement, property: string): string | null {
    const id = node.getAttribute(DECK_NODE_MARK);
    return (id ? known.get(id)?.style?.[property] : undefined) ?? (node.style.getPropertyValue(property) || null);
  }
  function styleOperation(node: HTMLElement, property: Extract<DeckEditOperation, { kind: "style" }> ["property"], after: string | null): DeckEditOperation {
    return { kind: "style", target: node.getAttribute(DECK_NODE_MARK)!, property, before: originalStyle(node, property), after };
  }
  function emit(operations: DeckEditOperation[]) {
    const changed = operations.filter((operation) => !("after" in operation) || operation.before !== operation.after);
    if (!changed.length) return;
    apply(changed); commit(changed); draw();
  }
  function scaleOf(node: HTMLElement) {
    const value = Number.parseFloat(view!.getComputedStyle(node).scale);
    return Number.isFinite(value) && value > 0 ? value : 1;
  }
  function positionOf(node: HTMLElement): CanvasPoint {
    const parts = view!.getComputedStyle(node).objectPosition.split(/\s+/).map(Number.parseFloat);
    return { x: Number.isFinite(parts[0]) ? parts[0] : 50, y: Number.isFinite(parts[1]) ? parts[1] : 50 };
  }
  function slideOf(node: HTMLElement): HTMLElement | null {
    const slide = node.closest(`[${DECK_SLIDE}]`); return slide instanceof view!.HTMLElement ? slide : null;
  }
  function movementAllowed(node: HTMLElement): boolean {
    const style = view!.getComputedStyle(node);
    if (style.display === "inline" && node.tagName !== "IMG" && node.tagName !== "VIDEO") {
      message(t("deckEditor.canvas.decorationOnly")); return false;
    }
    const slide = slideOf(node);
    for (let parent = node.parentElement; parent && parent !== slide; parent = parent.parentElement) {
      const parentStyle = view!.getComputedStyle(parent);
      if ((parentStyle.transform && parentStyle.transform !== "none") || (parentStyle.rotate && parentStyle.rotate !== "none") || (parentStyle.scale && parentStyle.scale !== "none" && parentStyle.scale !== "1")) {
        message(t("deckEditor.canvas.transformedGroup")); return false;
      }
    }
    return true;
  }
  function resizeAllowed(node: HTMLElement): boolean {
    if (!movementAllowed(node)) return false;
    const style = view!.getComputedStyle(node);
    const customTransform = (style.transform && style.transform !== "none") || (style.rotate && style.rotate !== "none");
    const unequalScale = style.scale?.trim().split(/\s+/).length > 1;
    const scaledAroundCenter = scaleOf(node) !== 1 && !/^0(?:px)? 0(?:px)?(?: 0(?:px)?)?$/.test(style.transformOrigin);
    if (customTransform || unequalScale || scaledAroundCenter) {
      message(t("deckEditor.canvas.sourceTransform")); return false;
    }
    return true;
  }
  function startDrag(event: PointerEvent, node: HTMLElement, mode: Drag["mode"]) {
    if (readOnly || editing || event.button !== 0 || node.closest("[data-deck-locked]")) return;
    if (mode === "resize" ? !resizeAllowed(node) : elements().some((element) => !movementAllowed(element))) return;
    const slide = slideOf(node); if (!slide || !slide.getBoundingClientRect().width) return;
    event.preventDefault(); event.stopPropagation();
    const rect = node.getBoundingClientRect();
    const scale = DECK_CANVAS.width / slide.getBoundingClientRect().width;
    drag = { pointer: event.pointerId, start: { x: event.clientX, y: event.clientY }, slide,
      items: elements().map((element) => ({ node: element, before: originalStyle(element, "translate"), translation: view!.getComputedStyle(element).translate })),
      active: false, mode, width: rect.width * scale, height: rect.height * scale, originalScale: scaleOf(node),
      scaleBefore: originalStyle(node, "scale"), originBefore: originalStyle(node, "transform-origin"),
      cropBefore: originalStyle(node, "object-position"), clipBefore: originalStyle(node, "clip-path"), clip: clipInsets(node), crop: positionOf(node) };
    activity();
  }
  function moveDrag(event: PointerEvent) {
    if (!drag || drag.pointer !== event.pointerId) return;
    const delta = canvasDelta({ x: event.clientX - drag.start.x, y: event.clientY - drag.start.y }, drag.slide.getBoundingClientRect().width);
    if (!delta) return;
    if (!drag.active && Math.hypot(event.clientX - drag.start.x, event.clientY - drag.start.y) < 3) return;
    drag.active = true; event.preventDefault();
    const node = drag.items[0]?.node; if (!node) return;
    if (drag.mode === "move") {
      for (const item of drag.items) item.node.style.setProperty("translate", translateBy(item.translation, delta));
      guides = {};
      if (options.externalToolbar && !event.altKey) {
        const stage = drag.slide.getBoundingClientRect(), rect = node.getBoundingClientRect(), scale = stage.width / 1280;
        const peers = [...drag.slide.querySelectorAll<HTMLElement>(`[${DECK_NODE_MARK}]`)].filter(n => !drag!.items.some(item => item.node === n || item.node.contains(n) || n.contains(item.node)) && n.getBoundingClientRect().width > 0);
        const xs = [stage.left, stage.left + stage.width / 2, stage.right], ys = [stage.top, stage.top + stage.height / 2, stage.bottom];
        for (const peer of peers) { const r = peer.getBoundingClientRect(); xs.push(r.left, r.left + r.width / 2, r.right); ys.push(r.top, r.top + r.height / 2, r.bottom); }
        const snap = (points: number[], candidates: number[]) => candidates.flatMap(to => points.map(from => ({ to, delta: to - from }))).filter(v => Math.abs(v.delta) < 5).sort((a,b) => Math.abs(a.delta)-Math.abs(b.delta))[0];
        const x = snap([rect.left, rect.left + rect.width / 2, rect.right], xs), y = snap([rect.top, rect.top + rect.height / 2, rect.bottom], ys);
        if(x)guides.x=x.to;if(y)guides.y=y.to;
        for (const item of drag.items) item.node.style.setProperty("translate", translateBy(item.translation, { x: delta.x + (x?.delta ?? 0) / scale, y: delta.y + (y?.delta ?? 0) / scale }));
      }
    }
    if (drag.mode === "resize") {
      const size = resizeBox({ width: drag.width, height: drag.height }, delta, true);
      node.style.setProperty("transform-origin", "0 0"); node.style.setProperty("scale", String(drag.originalScale * size.width / drag.width));
    }
    if (drag.mode === "crop") {
      if (drag.clip.some((inset) => inset > 0)) {
        const insets = moveCropWindow(drag.clip, { x: delta.x / drag.width * 100, y: delta.y / drag.height * 100 });
        node.style.setProperty("clip-path", `inset(${insets.map((value) => `${value}%`).join(" ")})`);
      } else {
        const point = dragCropPosition(drag.crop, delta, { width: drag.width, height: drag.height }, node instanceof view!.HTMLImageElement ? { width: node.naturalWidth, height: node.naturalHeight } : { width: 0, height: 0 });
        node.style.setProperty("object-position", `${point.x}% ${point.y}%`);
      }
    }
    scheduleDraw();
  }
  function finishDrag(cancel: boolean) {
    guides = {};
    const current = drag; if (!current) return;
    drag = null;
    const operations: DeckEditOperation[] = [];
    const node = current.items[0]?.node;
    if (current.active && node) {
      if (current.mode === "move") for (const item of current.items) operations.push({ kind: "style", target: item.node.getAttribute(DECK_NODE_MARK)!, property: "translate", before: item.before, after: item.node.style.getPropertyValue("translate") });
      if (current.mode === "resize") {
        operations.push({ kind: "style", target: node.getAttribute(DECK_NODE_MARK)!, property: "transform-origin", before: current.originBefore, after: "0 0" }, { kind: "style", target: node.getAttribute(DECK_NODE_MARK)!, property: "scale", before: current.scaleBefore, after: node.style.getPropertyValue("scale") });
      }
      if (current.mode === "crop") {
        if (current.clip.some((inset) => inset > 0)) operations.push({ kind: "style", target: node.getAttribute(DECK_NODE_MARK)!, property: "clip-path", before: current.clipBefore, after: node.style.getPropertyValue("clip-path") });
        else operations.push({ kind: "style", target: node.getAttribute(DECK_NODE_MARK)!, property: "object-position", before: current.cropBefore, after: node.style.getPropertyValue("object-position") });
      }
    }
    if (cancel) apply(operations.flatMap((operation) => operation.kind === "style" ? [{ ...operation, before: operation.after, after: operation.before }] : []));
    else if (operations.length) commit(operations);
    activity(); drainRemote(); draw();
  }
  function keyDelta(event: KeyboardEvent): CanvasPoint | null {
    const step = event.shiftKey ? 10 : 1;
    if (event.key === "ArrowLeft") return { x: -step, y: 0 };
    if (event.key === "ArrowRight") return { x: step, y: 0 };
    if (event.key === "ArrowUp") return { x: 0, y: -step };
    if (event.key === "ArrowDown") return { x: 0, y: step };
    return null;
  }
  function resizeImage(node: HTMLElement, delta: CanvasPoint) {
    if (!resizeAllowed(node)) return;
    const slide = slideOf(node); if (!slide) return;
    const rect = node.getBoundingClientRect(); const ratio = DECK_CANVAS.width / slide.getBoundingClientRect().width;
    if (!Number.isFinite(ratio)) return;
    const size = { width: rect.width * ratio, height: rect.height * ratio };
    const resized = resizeBox(size, delta, true);
    emit([styleOperation(node, "transform-origin", "0 0"), styleOperation(node, "scale", String(scaleOf(node) * resized.width / size.width))]);
  }
  function crop(position?: CanvasPoint) {
    const node = elements()[0]; if (readOnly || !node || node.tagName !== "IMG") return;
    if (!position) { cropping = !cropping; if (cropping && view!.getComputedStyle(node).objectFit !== "cover") emit([styleOperation(node, "object-fit", "cover")]); draw(); return; }
    const point = cropPosition(position);
    emit([styleOperation(node, "object-position", `${point.x}% ${point.y}%`)]);
  }
  function align(mode: Align) {
    if (readOnly) return;
    const nodes = elements(); if (nodes.length < 2 || nodes.some((node) => !movementAllowed(node))) return;
    const slide = slideOf(nodes[0]); if (!slide || nodes.some((node) => slideOf(node) !== slide)) return;
    const rects = nodes.map((node) => node.getBoundingClientRect());
    const horizontal = mode === "left" || mode === "center" || mode === "right";
    const min = Math.min(...rects.map((rect) => horizontal ? rect.left : rect.top));
    const max = Math.max(...rects.map((rect) => horizontal ? rect.right : rect.bottom));
    const target = mode === "left" || mode === "top" ? min : mode === "right" || mode === "bottom" ? max : (min + max) / 2;
    emit(nodes.flatMap((node, index) => {
      const rect = rects[index]; const value = mode === "left" ? rect.left : mode === "right" ? rect.right : mode === "top" ? rect.top : mode === "bottom" ? rect.bottom : horizontal ? (rect.left + rect.right) / 2 : (rect.top + rect.bottom) / 2;
      const delta = canvasDelta(horizontal ? { x: target - value, y: 0 } : { x: 0, y: target - value }, slide.getBoundingClientRect().width);
      if (!delta) return [];
      return [styleOperation(node, "translate", translateBy(view!.getComputedStyle(node).translate, delta))];
    }));
  }
  function commit(operations: DeckEditOperation[]): boolean {
    try {
      options.onOperations(operations);
      operations.forEach(remember);
      return true;
    } catch (error) {
      apply([...operations].reverse().flatMap((operation): DeckEditOperation[] => {
        if (operation.kind === "style") return [{ ...operation, before: operation.after, after: operation.before }];
        if (operation.kind === "text" || operation.kind === "image") return [{ ...operation, before: operation.after, after: operation.before }];
        return [];
      }));
      message(error instanceof Error ? deckErrorMessage(error, t) : t("deckEditor.canvas.changeRejected"));
      scheduleDraw(); return false;
    }
  }
  function remember(operation: DeckEditOperation) {
    const previous = known.get(operation.target);
    if (operation.kind === "insert") {
      known.set(operation.node.id, { id: operation.node.id, slideId: operation.target, tag: operation.node.tag==="youtube"?"figure":operation.node.tag, textRuns: operation.node.tag === "p" ? [{ run: 0, text: operation.node.text }] : [], style: operation.node.style ?? {}, src: (operation.node.tag === "img" || operation.node.tag === "video") ? operation.node.src : undefined, alt: operation.node.tag === "img" ? operation.node.alt : undefined, poster: operation.node.tag === "video" ? operation.node.poster : undefined, label: operation.node.tag === "video" ? operation.node.label : undefined, created: true });
    } else if (operation.kind === "remove") known.delete(operation.target);
    else if (previous && operation.kind === "text") known.set(previous.id, { ...previous, textRuns: previous.textRuns.map((run) => run.run === operation.run ? { ...run, text: operation.after } : run) });
    else if (previous && operation.kind === "style") {
      const style = { ...previous.style };
      if (operation.after === null) delete style[operation.property]; else style[operation.property] = operation.after;
      known.set(previous.id, { ...previous, style });
    } else if (previous && operation.kind === "image") known.set(previous.id, { ...previous, src: operation.after });
  }
  function apply(operations: readonly DeckEditOperation[]) {
    for (const operation of operations) {
      const node = find(operation.target); if (!node) continue;
      remember(operation);
      if (operation.kind === "text") {
        const text = directText(node)[operation.run]; if (text && text.data !== operation.after) text.data = operation.after;
      } else if (operation.kind === "style") {
        writeStyle(node, operation.property, operation.after);
      } else if (operation.kind === "image") node.setAttribute("src", operation.after);
      else if (operation.kind === "insert") {
        if (find(operation.node.id)) continue;
        const inserted = doc.createElement(operation.node.tag === "youtube" ? "figure" : operation.node.tag);
        inserted.setAttribute(DECK_NODE_MARK, operation.node.id);
        inserted.setAttribute(DECK_CREATED_MARK, "");
        if (operation.node.tag === "p") inserted.textContent = operation.node.text;
        else if(operation.node.tag==="img"){inserted.setAttribute("loading","lazy");inserted.setAttribute("decoding","async");inserted.setAttribute("src",operation.node.src);inserted.setAttribute("alt",operation.node.alt);}
        else if(operation.node.tag === "youtube"){inserted.setAttribute("data-deck-youtube",operation.node.videoId);inserted.setAttribute("aria-label",operation.node.label);const link=doc.createElement("a");link.href=`https://www.youtube.com/watch?v=${operation.node.videoId}`;link.target="_blank";link.rel="noopener noreferrer";link.textContent=`${operation.node.label} — https://www.youtube.com/watch?v=${operation.node.videoId}`;inserted.append(link);}
        else {inserted.setAttribute("preload","none");inserted.setAttribute("playsinline","");inserted.setAttribute("controls","");inserted.setAttribute("poster",operation.node.poster);inserted.setAttribute("aria-label",operation.node.label);inserted.setAttribute("src",operation.node.src);}
        for (const [property, value] of Object.entries(operation.node.style ?? {})) writeStyle(inserted, property, value);
        node.append(inserted);
      } else if (operation.kind === "remove") node.remove();
      else if (operation.kind === "restore") {
        const template = doc.createElement("template"); template.innerHTML = operation.html;
        const before = operation.beforeId ? find(operation.beforeId) : null;
        const restored = template.content.firstElementChild;
        if (restored instanceof view!.HTMLElement) {
          const id = restored.getAttribute(DECK_NODE_MARK);
          if (id) known.set(id, {
            id, slideId: operation.target, tag: restored.tagName.toLowerCase(),
            textRuns: directText(restored).map((text, run) => ({ run, text: text.data })),
            style: Object.fromEntries([...restored.style].map((property) => [property, restored.style.getPropertyValue(property)])),
            src: ["IMG","VIDEO"].includes(restored.tagName) ? restored.getAttribute("src") ?? "" : undefined, poster: restored.tagName==="VIDEO"?restored.getAttribute("poster")??undefined:undefined, label:restored.tagName==="VIDEO"?restored.getAttribute("aria-label")??undefined:undefined, alt: restored.tagName === "IMG" ? restored.getAttribute("alt") ?? "" : undefined, created: true,
          });
        }
        node.insertBefore(template.content, before?.parentNode === node ? before : null);
      }
    }
  }
  function applyNodeProperties(node:HTMLElement,item:DeckEditableNode):void {
      const textNodes = directText(node);
      for (const run of item.textRuns) { const text = textNodes[run.run]; if (text && text.data !== run.text) text.data = run.text; }
      const previous = known.get(item.id)?.style ?? {};
      for (const property of new Set([...Object.keys(previous), ...Object.keys(item.style)])) {
        if (previous[property] === item.style[property]) continue;
        const value = item.style[property];
        writeStyle(node, property, value ?? null);
      }
      if(item.poster!==undefined && node.getAttribute("poster")!==item.poster)node.setAttribute("poster",item.poster);
      if(item.label!==undefined && node.getAttribute("aria-label")!==item.label)node.setAttribute("aria-label",item.label);
      if (item.src !== undefined && authoredMediaSource(node) !== item.src) writeMediaSource(node, item.src);
      if (item.alt !== undefined && node.getAttribute("alt") !== item.alt) node.setAttribute("alt", item.alt);
  }
  /** During composition or dragging, update unrelated nodes without touching the
   * active subtree or declaring the whole snapshot rendered. Structural changes
   * remain staged until the native interaction completes. */
  function applyAvailableSnapshot(nodes:readonly DeckEditableNode[]):void {
    const protectedNodes=[...(editing?[editing]:[]),...(drag?.items.map(item=>item.node)??[])];
    for(const item of nodes){
      const node=find(item.id);
      if(!node||!known.has(item.id)||node.tagName.toLowerCase()!==item.tag||directText(node).length!==item.textRuns.length)continue;
      if(protectedNodes.some(active=>active.contains(node)||node.contains(active)))continue;
      applyNodeProperties(node,item);known.set(item.id,item);
    }
    scheduleDraw();
  }
  function applySnapshot(nodes: readonly DeckEditableNode[]): boolean {
    if (composing || drag) return false;
    if (editing && !nodes.some(node=>node.id===editing?.getAttribute(DECK_NODE_MARK))) return false;
    const cursor = editing ? doc.getSelection() : null;
    const caret = cursor?.anchorNode && cursor.focusNode ? { anchor:cursor.anchorNode, start:cursor.anchorOffset, focus:cursor.focusNode, end:cursor.focusOffset } : null;
    // Check the entire snapshot first. A partial patch must never hide an incompatible source update.
    for (const item of nodes) {
      const node = find(item.id);
      if (!node && !item.created) return false;
      if (node && node.tagName.toLowerCase() !== item.tag) return false;
      if (node && directText(node).length !== item.textRuns.length) return false;
      if (!node && !find(item.slideId)) return false;
    }
    const incoming = new Map(nodes.map((node) => [node.id, node]));
    for (const old of known.values()) {
      if (!incoming.has(old.id) && !old.created) return false;
    }
    // Cancelled IME may leave a measured, unsaved box in the preview. Restore it
    // before taking a fresh baseline; otherwise the next edit would omit its size operations.
    if (editing) releaseTextBox();
    for (const old of known.values()) if (old.created && !incoming.has(old.id)) find(old.id)?.remove();
    for (const item of nodes) {
      let node = find(item.id);
      if (!node) {
        if (item.tag !== "p" && item.tag !== "img" && item.tag !== "video") return false;
        node = doc.createElement(item.tag);
        node.setAttribute(DECK_NODE_MARK, item.id); node.setAttribute(DECK_CREATED_MARK, "");
        if(item.tag==="video"){node.setAttribute("preload","none");node.setAttribute("playsinline","");node.setAttribute("controls","");}
        if (item.tag === "p") node.append(doc.createTextNode(item.textRuns[0]?.text ?? ""));
        find(item.slideId)?.append(node);
      }
      applyNodeProperties(node,item);
    }
    // Restore the source paint order too: a recreated image must not jump over its later siblings.
    // Only editor-created nodes are moved. Author containers and runtime-generated groups stay intact.
    for (let index = nodes.length - 1; index >= 0; index--) {
      const item = nodes[index]; if (!item.created) continue;
      const node = find(item.id), slide = find(item.slideId); if (!node || !slide) continue;
      const next = nodes.slice(index + 1).find((candidate) => candidate.slideId === item.slideId && find(candidate.id)?.parentElement === slide);
      const anchor = next ? find(next.id) : null;
      if (node.parentElement !== slide || node.nextElementSibling !== anchor) slide.insertBefore(node, anchor);
    }
    known = incoming; selected = selected.filter((id) => known.has(id));
    if (editing) { runs = collectRuns(editing); textBox = captureTextBox(editing); }
    if (caret && cursor && caret.anchor.isConnected && caret.focus.isConnected) {
      const bound = (node:Node,offset:number) => Math.min(offset,node.nodeType===3?(node.textContent?.length??0):node.childNodes.length);
      cursor.setBaseAndExtent(caret.anchor,bound(caret.anchor,caret.start),caret.focus,bound(caret.focus,caret.end));
    }
    scheduleDraw(); return true;
  }
  function drainRemote() {
    if (composing || drag || !remoteQueue.length) return;
    const operations = remoteQueue; remoteQueue = [];
    if (editing) releaseTextBox();
    apply(operations);
    if (editing) { runs = collectRuns(editing); textBox = captureTextBox(editing); }
    scheduleDraw();
  }
  function applyRemote(operations: readonly DeckEditOperation[]) {
    if (composing || drag) { remoteQueue.push(...operations); return false; }
    flush();
    const cursor = editing ? doc.getSelection() : null;
    const caret = cursor?.anchorNode && cursor.focusNode ? {anchor:cursor.anchorNode,start:cursor.anchorOffset,focus:cursor.focusNode,end:cursor.focusOffset} : null;
    if (editing) releaseTextBox(); apply(operations); if (editing) { runs = collectRuns(editing); textBox = captureTextBox(editing); }
    if (caret && cursor && caret.anchor.isConnected && caret.focus.isConnected) {
      const bound = (node:Node,offset:number) => Math.min(offset,node.nodeType===3?(node.textContent?.length??0):node.childNodes.length);
      cursor.setBaseAndExtent(caret.anchor,bound(caret.anchor,caret.start),caret.focus,bound(caret.focus,caret.end));
    }
    scheduleDraw();
    return true;
  }
  function canApplyDirect(operations: readonly DeckEditOperation[]): boolean {
    const values = new Map<string,string>();
    for (const operation of operations) {
      if (operation.kind !== "text" && operation.kind !== "style") return false;
      if (operation.kind !== "text") continue;
      const key = `${operation.target}\u0000${operation.run}`;
      const current = values.get(key) ?? known.get(operation.target)?.textRuns.find(run=>run.run===operation.run)?.text;
      if (current !== operation.before && current !== operation.after) return false;
      values.set(key,operation.after);
    }
    return true;
  }
  listen("pointerdown", (event) => {
    if (event.composedPath().includes(host) || readOnly) return;
    if(event.target instanceof view!.Element&&event.target.closest("[data-deck-youtube-view] button,[data-deck-youtube-view] a,[data-deck-youtube-view] iframe"))return;
    if(previewVideo && event.target===previewVideo)return;
    if (!drawnAt(event)) { event.preventDefault(); return; }
    const node = target(event);
    const raw = event.target;
    const clickedSlide = raw instanceof view!.Element ? raw.closest(`[${DECK_SLIDE}][${DECK_NODE_MARK}]`) : null;
    if (clickedSlide) lastSlide = clickedSlide.getAttribute(DECK_NODE_MARK);
    if (editing?.contains(event.target instanceof view!.Node ? event.target : null)) return;
    if (!endText()) return;
    if (!node) {
      const keep = event.shiftKey ? [...selected] : []; select(keep);
      if (options.externalToolbar && clickedSlide && event.button === 0) {
        const box = doc.createElement("div"); box.style.cssText = "position:fixed;pointer-events:none;border:1px solid var(--accent);background:color-mix(in srgb,var(--accent) 10%,transparent)";
        shadow.append(box);marquee={x:event.clientX,y:event.clientY,slide:clickedSlide,ids:keep,box};event.preventDefault();
      }
      return;
    }
    const id = node.getAttribute(DECK_NODE_MARK)!;
    if (event.shiftKey) { select(selected.includes(id) ? selected.filter((value) => value !== id) : [...selected, id]); return; }
    if (!selected.includes(id)) select([id]);
    startDrag(event, node, cropping && node.tagName === "IMG" ? "crop" : "move");
  });
  listen("pointermove", moveDrag);
  listen("pointermove", event => { if(!marquee)return;const left=Math.min(marquee.x,event.clientX),top=Math.min(marquee.y,event.clientY),right=Math.max(marquee.x,event.clientX),bottom=Math.max(marquee.y,event.clientY);Object.assign(marquee.box.style,{left:`${left}px`,top:`${top}px`,width:`${right-left}px`,height:`${bottom-top}px`}); });
  listen("pointerup", event => { if(!marquee)return;const area=marquee,box=area.box.getBoundingClientRect();marquee=null;area.box.remove();if(Math.hypot(event.clientX-area.x,event.clientY-area.y)<3)return;const ids=[...area.slide.querySelectorAll<HTMLElement>(`[${DECK_NODE_MARK}]`)].filter(n=>safe(n)&&!n.closest("[data-deck-locked]")&&(n.matches("img,video,table,[data-deck-media-slot],[data-dd-chart],[data-deck-shape],[data-deck-group]")||collectRuns(n).some(run=>run.node.data.trim()))).filter(n=>{const r=n.getBoundingClientRect();return r.width>0&&r.left>=box.left&&r.right<=box.right&&r.top>=box.top&&r.bottom<=box.bottom;}).map(n=>n.getAttribute(DECK_NODE_MARK)!);select([...area.ids,...ids]); });
  listen("pointercancel",()=>{marquee?.box.remove();marquee=null;});
  listen("pointerup", () => finishDrag(false));
  listen("pointercancel", () => finishDrag(true));
  function editSelected() {
    const node = find(selected[0]); if (!node || readOnly || node.closest("[data-deck-locked]")) return;
    if (node.hasAttribute("data-dd-chart") || node.tagName === "TABLE") options.onEditComplex?.(selected[0]);
    else if (node instanceof view!.HTMLVideoElement) preview(node);
    else if (node.tagName === "IMG") { if(options.onCrop)options.onCrop(selected[0]);else crop(); }
    else beginText(node);
  }
  listen("dblclick", (event) => { if (!drawnAt(event)) { event.preventDefault(); return; } const node = target(event); if (node) { event.preventDefault(); select([node.getAttribute(DECK_NODE_MARK)!]); editSelected(); } });
  listen("compositionstart", () => {
    if (!editing) return;
    flush();
    const range = textRange();
    if (range) composition = {
      start: range.startContainer, startOffset: range.startOffset, end: range.endContainer, endOffset: range.endOffset,
      children: [editing, ...editing.querySelectorAll("*")].map((node) => ({ node, children: [...node.childNodes] })),
      text: runs.map((run) => ({ node: run.node, value: run.node.data })),
    };
    prepareTextBox(); composing = true; activity();
  });
  listen("compositionend", (event) => {
    composing = false;
    // Native IME owns the live marked text. Commit its final string into the original text runs,
    // restoring original element identities if the browser split or merged nodes during conversion.
    const saved = composition; composition = null;
    if (saved && editing) {
      for (const item of saved.children) {
        const current = [...item.node.childNodes];
        if (current.length !== item.children.length || current.some((child, index) => child !== item.children[index])) {
          while (item.node.firstChild) item.node.removeChild(item.node.firstChild);
          item.children.forEach((child) => item.node.appendChild(child));
        }
      }
      saved.text.forEach((item) => { item.node.data = item.value; });
      const range = doc.createRange(); range.setStart(saved.start, saved.startOffset); range.setEnd(saved.end, saved.endOffset);
      const selection = doc.getSelection(); selection?.removeAllRanges(); selection?.addRange(range);
      if (event.data) replaceSelection(event.data);
    }
    flush(); drainRemote(); activity();
  });
  listen("input", () => { if (editing && !composing) flush(); });
  listen("beforeinput", (event) => {
    if (!editing || composing || event.isComposing) return;
    if (event.inputType === "historyUndo" || event.inputType === "historyRedo") { event.preventDefault(); flush(); (event.inputType === "historyUndo" ? options.onUndo : options.onRedo)?.(); return; }
    if (event.inputType === "insertCompositionText" || event.inputType === "deleteCompositionText") return;
    event.preventDefault();
    if (event.inputType === "insertText" || event.inputType === "insertReplacementText") replaceSelection(event.data ?? "");
    else if (event.inputType === "deleteContentBackward") replaceSelection("", "backward");
    else if (event.inputType === "deleteContentForward") replaceSelection("", "forward");
    else if (event.inputType === "insertParagraph" || event.inputType === "insertLineBreak") {
      if (options.externalToolbar) { if (editing && !/pre|break-spaces/.test(view!.getComputedStyle(editing).whiteSpace)) emit([styleOperation(editing, "white-space", "pre-wrap")]); replaceSelection("\n"); }
      else message(t("deckEditor.canvas.noLineBreak"));
    }
  });
  listen("paste", (event) => { if (!editing || composing) return; event.preventDefault(); replaceSelection(event.clipboardData?.getData("text/plain") ?? ""); });
  listen("cut", (event) => { if (!editing || composing) return; const range = textRange(); if (!range) return; event.preventDefault(); event.clipboardData?.setData("text/plain", range.toString()); replaceSelection(""); });
  listen("keydown", (event) => {
    if (readOnly || event.composedPath().includes(host) || event.isComposing || composing) return;
    if(previewVideo && event.target===previewVideo && event.key!=="Escape")return;
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") { event.preventDefault(); event.stopPropagation(); flush(); (event.shiftKey ? options.onRedo : options.onUndo)?.(); return; }
    if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); if (drag) finishDrag(true); else if (editing) { endText(); draw(); } else if(cropping){cropping=false;draw();} else { select([]); options.onExitToToolbar?.(); } return; }
    if (editing) { event.stopPropagation(); return; }
    if (options.onCommand && !elements().some(node => node.closest("[data-deck-locked]"))) {
      const command = event.key === "Delete" || event.key === "Backspace" ? "delete" : (event.metaKey || event.ctrlKey) ? ({c:"copy",v:"paste",d:"duplicate"}[event.key.toLowerCase()]) : undefined;
      if(command){event.preventDefault();event.stopPropagation();options.onCommand(command);return;}
    }
    const delta = keyDelta(event);
    if (delta && selected.length) {
      event.preventDefault(); event.stopPropagation();
      if (cropping) {
        const node = elements()[0];
        if (node) {
          const insets = clipInsets(node);
          if (insets.some((value) => value > 0)) {
            const shifted = moveCropWindow(insets, delta);
            emit([styleOperation(node, "clip-path", `inset(${shifted.map((value) => `${value}%`).join(" ")})`)]);
          } else { const point = positionOf(node); crop({ x: point.x + delta.x, y: point.y + delta.y }); }
        }
      }
      else if (elements().every(node => !node.closest("[data-deck-locked]") && movementAllowed(node))) emit(elements().map((node) => { return styleOperation(node, "translate", translateBy(view!.getComputedStyle(node).translate, delta)); }));
    }
    if (event.key === "Enter" && selected.length === 1) { event.preventDefault(); editSelected(); }
    if (event.key === "Tab") {
      const ids = [...known.keys()].filter((id) => {
        const node = find(id), entry = known.get(id);
        return node && safe(node) && (node.matches("img,video,[data-deck-youtube],[data-deck-media-slot]") || entry?.textRuns.some((run) => run.text.trim())) && node.getBoundingClientRect().width > 0;
      });
      if (!ids.length) return;
      const current = ids.indexOf(selected[0]);
      if ((event.shiftKey && current <= 0) || (!event.shiftKey && current === ids.length - 1)) {
        if (options.onExitToToolbar) { event.preventDefault(); options.onExitToToolbar(); }
        return;
      }
      event.preventDefault(); event.stopPropagation();
      const next = Math.max(0, current + (event.shiftKey ? -1 : 1)); select([ids[next]]); find(ids[next])?.scrollIntoView({ block: "nearest" });
    }
  });
  function droppedUrl(data:DataTransfer):string|null {
    const html=data.getData("text/html");
    const fragment=html?new DOMParser().parseFromString(html,"text/html"):null;
    const image=fragment?.querySelector("img")?.getAttribute("src"),link=fragment?.querySelector("a[href]")?.getAttribute("href");
    const uri=data.getData("text/uri-list").split(/\r?\n/).find(line=>line&&!line.startsWith("#"))||data.getData("text/plain").trim();
    if(uri&&youtubeId(uri))return uri;if(link&&youtubeId(link))return link;
    const googleOriginal=(value:string|null|undefined)=>{if(!value)return null;try{const url=new URL(value),original=url.searchParams.get("imgurl");return /(^|\.)google\.[a-z.]+$/i.test(url.hostname)&&url.pathname.includes("/imgres")&&original&&/^https:\/\//i.test(original)?original:null;}catch{return null;}};
    return googleOriginal(link)||googleOriginal(uri)||image||uri||null;
  }
  const dropHint = doc.createElement("div");
  dropHint.style.cssText = "position:fixed;pointer-events:none;padding:8px 12px;border-radius:8px;background:var(--text);color:var(--surface);font:14px/1.4 system-ui,sans-serif;transform:translate(-50%,-50%)";
  dropHint.hidden = true;
  shadow.append(dropHint);
  function replacementImage(raw: EventTarget | null): HTMLElement | null {
    const node = raw instanceof view!.Element ? raw.closest('img[data-deck-node],[data-deck-media-slot="image"]') : null;
    return node instanceof view!.HTMLElement && safe(node) && !node.closest("[data-deck-locked]") ? node : null;
  }
  function clearDrop() {
    doc.querySelectorAll("[data-deck-drop-target]").forEach(node => node.removeAttribute("data-deck-drop-target"));
    dropHint.hidden = true;
  }
  const dropStyle = doc.createElement("style");
  dropStyle.setAttribute(CHROME, "");
  dropStyle.textContent = '[data-deck-drop-target]{outline:2px solid Highlight!important;outline-offset:-2px}';
  doc.head.append(dropStyle);
  removers.push(() => { clearDrop(); dropStyle.remove(); });
  listen("dragover", event => {
    if (readOnly || !event.dataTransfer || event.dataTransfer.types.includes("application/x-surprise-deck")) return;
    if (!event.dataTransfer.types.some(type => ["Files", "text/uri-list", "text/html", "text/plain", "application/x-surprise-image-palette"].includes(type))) return;
    event.preventDefault(); clearDrop();
    const replacement = replacementImage(event.target);
    const area = replacement ?? (event.target instanceof view!.Element ? event.target.closest(`[${DECK_SLIDE}]`) : null);
    if (!area) return;
    event.dataTransfer.dropEffect = "copy";
    area.setAttribute("data-deck-drop-target", "");
    const rect = area.getBoundingClientRect();
    dropHint.textContent = replacement ? t("deckEditor.canvas.replaceImage") : t("deckEditor.canvas.addMedia");
    dropHint.style.left = `${rect.left + rect.width / 2}px`;
    dropHint.style.top = `${rect.top + rect.height / 2}px`;
    dropHint.hidden = false;
  });
  listen("dragleave",event=>{if(!event.relatedTarget)clearDrop();});
  listen("drop",event=>{
    clearDrop();if(readOnly||!event.dataTransfer||event.dataTransfer.types.includes("application/x-surprise-deck"))return;
    event.preventDefault();const target=event.target;
    const slide=target instanceof view!.Element?target.closest(`[${DECK_SLIDE}]`):null,id=slide?.getAttribute(DECK_NODE_MARK);
    if(!slide||!id){message(t("deckEditor.canvas.dropOnSlide"));return;}
    const rect=slide.getBoundingClientRect(),point=canvasDelta({x:event.clientX-rect.left,y:event.clientY-rect.top},rect.width);if(!point)return;
    const replacementId = replacementImage(target)?.getAttribute(DECK_NODE_MARK) ?? undefined;
    const palette=event.dataTransfer.getData("application/x-surprise-image-palette");
    if(palette)options.onPalette?.(palette,id,point,replacementId);
    else if(event.dataTransfer.files.length)options.onFiles?.([...event.dataTransfer.files],id,point,replacementId);
    else{const url=droppedUrl(event.dataTransfer);if(url&&/^https:\/\//i.test(url))options.onUrl?.(url,id,point,replacementId);else message(t("deckEditor.canvas.dropKinds"));}
  });
  listen("paste",event=>{
    if(readOnly||editing||event.target instanceof view!.Element&&event.target.closest("input,textarea,[contenteditable]"))return;
    const data=event.clipboardData,id=currentSlide();if(!data||!id)return;
    const files=[...data.files];if(files.length){event.preventDefault();options.onFiles?.(files,id,{x:160,y:160});}
    else{const url=droppedUrl(data);if(url&&/^https:\/\//i.test(url)){event.preventDefault();options.onUrl?.(url,id,{x:160,y:160});}}
  });
  doc.addEventListener("scroll", scheduleDraw, true); view.addEventListener("resize", scheduleDraw);
  removers.push(() => doc.removeEventListener("scroll", scheduleDraw, true), () => view.removeEventListener("resize", scheduleDraw));
  return {
    select, selection: () => [...selected], currentSlide, applyRemote, canApplyDirect, applySnapshot, applyAvailableSnapshot, flush, crop, align, editSelected,
    isCropping: () => cropping,
    refreshSelection: scheduleDraw,showMediaPlaceholder,
    finishEditing: endText,
    cropInset(value:number) { const node=elements()[0];if(node?.tagName==="IMG"&&!readOnly)emit([styleOperation(node,"clip-path",`inset(${Math.max(0,Math.min(45,value))}%)`)]); },
    updateNodes(nodes: readonly DeckEditableNode[], slideIds?:readonly string[]) {
      elementIndex.clear();for(const node of doc.querySelectorAll<HTMLElement>(`[${DECK_NODE_MARK}]`))elementIndex.set(node.getAttribute(DECK_NODE_MARK)!,node);
      if(slideIds){const changed=new Set(slideIds);for(const [id,node] of known)if(changed.has(node.slideId))known.delete(id);for(const node of nodes)known.set(node.id,node);}
      else known=new Map(nodes.map(node=>[node.id,node]));
      selected=selected.filter(id=>known.has(id));draw();
    },
    isInteracting: () => !!editing || !!drag || composing,
    isInputBlocked: () => !!drag || composing,
    setReadOnly(value: boolean) { if (readOnly === value) return; readOnly = value; if (value) { finishDrag(true); endText(); } draw(); },
    dispose() { if (disposed) return; composing = false; endText(); finishDrag(true); marquee?.box.remove();marquee=null;disposed = true; removers.forEach((remove) => remove()); if (animation) view.cancelAnimationFrame(animation); host.remove(); editStyle.remove(); },
  };
}
