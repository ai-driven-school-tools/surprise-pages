import { DECK_OUTLINE_DEPTH, moveOutline, outlineBranch, outlineDepth, outlineRoots, type OutlineEntry } from "../../../lib/deck/outline";
import { el } from "../../shared/util";
import { t } from "../../shared/i18n";
import { deckErrorMessage } from "../../../lib/deck/edit/message";
type Placement = "before" | "after" | "inside";
type Target = { id: string | null; placement: Placement };
/** 継ぎ目：見えている行 A の下・B の上。どちらかが無いのは一覧の端。 */
type Seam = { above: HTMLElement | null; below: HTMLElement | null; y: number };
/** 継ぎ目に落とせる深さの幅と、その深さごとの置き方。深さは 0 が根。 */
export function seamPlacement(source: readonly OutlineEntry[], above: string | null, below: string | null, depth: number): Target | null {
  const depthOf = (id: string) => outlineDepth(source, id) - 1;
  if (!above) return depth === 0 ? { id: below, placement: "before" } : null;
  const aboveDepth = depthOf(above);
  if (depth > aboveDepth + 1 || (below && depth < depthOf(below))) return null;
  if (depth === aboveDepth + 1) {
    const child = below && source.find(entry => entry.id === below)?.parent === above;
    return child ? { id: below, placement: "before" } : { id: above, placement: "inside" };
  }
  let ancestor: string | null = above;
  while (ancestor && depthOf(ancestor) > depth) ancestor = source.find(entry => entry.id === ancestor)?.parent ?? null;
  return ancestor ? { id: ancestor, placement: "after" } : null;
}
type Input = {
  screen: HTMLElement; list: () => HTMLElement | null; source: () => OutlineEntry[];
  selected: () => string[]; current: () => string;
  select: (id: string) => void; restore: (ids: string[], current: string) => void;
  move: (id: string | null, placement: Placement) => boolean;
  folded: (id: string) => boolean; unfold: (id: string) => void;
};
/** 格子の一覧で指のいちばん近い枚と、その左右どちらの継ぎ目か。指が一覧の外なら null。 */
function gridSeam(rows: readonly HTMLElement[], x: number, y: number): { row: HTMLElement; after: boolean } | null {
  let best: { row: HTMLElement; after: boolean; distance: number } | null = null;
  for (const row of rows) {
    const rect = row.getBoundingClientRect();
    const dx = x < rect.left ? rect.left - x : x > rect.right ? x - rect.right : 0, dy = y < rect.top ? rect.top - y : y > rect.bottom ? y - rect.bottom : 0;
    const distance = Math.hypot(dx, dy);
    if (!best || distance < best.distance) best = { row, after: x > rect.left + rect.width / 2, distance };
  }
  return best && best.distance < 48 ? { row: best.row, after: best.after } : null;
}
/** Internal moves use the same pointer model as the canvas. External file drops
 * retain native drag events; the two gestures never share a text payload. */
export function createDeckOutlineDrag(input: Input) {
  const lifetime = new AbortController();
  let drag: { row: HTMLButtonElement; pointer: number; startX: number; startY: number; x: number; y: number; active: boolean; previous: string[]; current: string; ids: string[]; label: string; target: Target | null } | null = null;
  let ghost: HTMLElement | null = null, line: HTMLElement | null = null, frame = 0, unfoldTimer: ReturnType<typeof setTimeout> | undefined, hover = "";
  const hideLine = () => { line?.remove(); line = null; };
  /** 継ぎ目は見えている行の幾何だけで決める（動かしている枝は数えない）。行の上半分なら上の継ぎ目、下半分なら下の継ぎ目。 */
  function seamAt(list: HTMLElement, rows: HTMLElement[], y: number): Seam | null {
    const bounds = list.getBoundingClientRect();
    if (y < bounds.top - 16 || y > bounds.bottom + 16) return null;
    let start=0,index=rows.length;
    while(start<index){const middle=Math.floor((start+index)/2),rect=rows[middle].getBoundingClientRect();if(y<rect.top+rect.height/2)index=middle;else start=middle+1;}
    const above = rows[index - 1] ?? null, below = rows[index] ?? null;
    if (!above && !below) return null;
    const top = above?.getBoundingClientRect().bottom, bottom = below?.getBoundingClientRect().top;
    return { above, below, y: top !== undefined && bottom !== undefined ? (top + bottom) / 2 : top !== undefined ? top + 4 : bottom! - 4 };
  }
  function feedback() {
    const current=drag,list=input.list();if(!current?.active||!list||!ghost)return;
    const source=input.source(),moved=new Set(outlineRoots(source,current.ids).flatMap(id=>outlineBranch(source,id)));
    const all=[...list.querySelectorAll<HTMLElement>(".ds-slide")],rows=all.filter(row=>!row.hidden&&!!row.dataset.slideId&&!moved.has(row.dataset.slideId));
    // Finish geometry reads before updating the drag preview or insertion line.
    const seam=seamAt(list,rows,current.y),bounds=list.getBoundingClientRect(),scrollTop=list.scrollTop;
    let target:Target|null=null,label=current.label,position:{top:number;left:number}|null=null,vertical:number|null=null;
    if(list.hasAttribute("data-columns")){
      // 格子（2 列以上）: 指のいちばん近い枚の左右の継ぎ目。左半分ならその前、右半分ならその後ろ（同じ親のもと）
      const near=gridSeam(rows,current.x,current.y);
      if(near){
        const id=near.row.dataset.slideId!,rect=near.row.getBoundingClientRect(),gap=parseFloat(getComputedStyle(list).columnGap)||16;
        target={id,placement:near.after?"after":"before"};
        try{moveOutline(source,current.ids,target.id,target.placement);position={top:rect.top-bounds.top+scrollTop,left:(near.after?rect.right+gap/2:rect.left-gap/2)-bounds.left};vertical=rect.height;}
        catch(error){target=null;label=error instanceof Error?deckErrorMessage(error,t):t("deckEditor.view.cannotMoveHere");}
      }
    }
    else if(seam){
      const anchor=seam.above??seam.below!,thumb=anchor.querySelector<HTMLElement>(".ds-thumb")!.getBoundingClientRect();
      const step=parseFloat(getComputedStyle(anchor).getPropertyValue("--space-5"))||24;
      const anchorDepth=outlineDepth(source,anchor.dataset.slideId!)-1,rootLeft=thumb.left-anchorDepth*step;
      const height=Math.max(...outlineRoots(source,current.ids).map(id=>Math.max(...outlineBranch(source,id).map(child=>outlineDepth(source,child)-outlineDepth(source,id)+1))));
      const lowest=seam.below?outlineDepth(source,seam.below.dataset.slideId!)-1:0;
      const highest=Math.min(seam.above?outlineDepth(source,seam.above.dataset.slideId!):0,DECK_OUTLINE_DEPTH-height);
      const depth=Math.max(lowest,Math.min(highest,Math.round((current.x-rootLeft)/step)));
      target=seamPlacement(source,seam.above?.dataset.slideId??null,seam.below?.dataset.slideId??null,depth);
      if(target){try{moveOutline(source,current.ids,target.id,target.placement);position={top:seam.y-bounds.top+scrollTop,left:rootLeft+depth*step-bounds.left};}catch(error){target=null;label=error instanceof Error?deckErrorMessage(error,t):t("deckEditor.view.cannotMoveHere");}}
      else label=t("deckEditor.view.cannotMoveHere");
    }
    ghost.style.left=`${current.x+12}px`;ghost.style.top=`${current.y+12}px`;
    for(const row of all)row.toggleAttribute("data-moving",moved.has(row.dataset.slideId??""));
    if(ghost.textContent!==label)ghost.textContent=label;
    current.target=target;const key=target?`${target.id}:${target.placement}`:"";
    if(key!==hover){clearTimeout(unfoldTimer);unfoldTimer=undefined;hover=key;}
    if(!target||!position){hideLine();return;}
    if(!line){line=el("div","ds-drop-line");line.setAttribute("aria-hidden","true");list.append(line);}
    line.style.top=`${position.top}px`;line.style.left=`${position.left}px`;
    line.toggleAttribute("data-vertical",vertical!==null);line.style.height=vertical!==null?`${vertical}px`:"";
    if(target.id&&target.placement==="inside"&&input.folded(target.id)&&!unfoldTimer){const id=target.id;unfoldTimer=setTimeout(()=>{input.unfold(id);unfoldTimer=undefined;feedback();},650);}
  }

  function scroll() {
    const current = drag, list = input.list(); if (!current?.active || !list) return;
    const rect = list.getBoundingClientRect();
    if (current.x >= rect.left && current.x <= rect.right && current.y >= rect.top - 16 && current.y <= rect.bottom + 16) {
      const delta = current.y < rect.top + 40 ? -12 : current.y > rect.bottom - 40 ? 12 : 0;
      if (delta) { list.scrollTop += delta; feedback(); }
    }
    frame = requestAnimationFrame(scroll);
  }
  function finish(cancel: boolean) {
    const current = drag; if (!current) return;
    if (current.active && !cancel) feedback();
    drag = null; cancelAnimationFrame(frame); clearTimeout(unfoldTimer); unfoldTimer = undefined; hover = "";
    ghost?.remove(); ghost = null; hideLine(); input.list()?.querySelectorAll("[data-moving]").forEach(row => row.removeAttribute("data-moving"));
    if (current.row.hasPointerCapture?.(current.pointer)) current.row.releasePointerCapture(current.pointer);
    if (!current.active) return;
    current.row.dataset.dragConsumed = ""; setTimeout(() => delete current.row.dataset.dragConsumed, 0);
    if (!cancel && current.target) {
      if (current.target.id && current.target.placement === "inside") input.unfold(current.target.id);
      if (input.move(current.target.id, current.target.placement)) return;
    }
    input.restore(current.previous, current.current);
  }
  input.screen.addEventListener("keydown", event => { if (drag && event.key === "Escape") { event.preventDefault(); event.stopPropagation(); finish(true); } }, { capture: true, signal: lifetime.signal });
  function bind(row: HTMLButtonElement, id: string) {
    row.dataset.slideId = id; row.draggable = false;
    row.addEventListener("click", event => { if (row.hasAttribute("data-drag-consumed")) { event.preventDefault(); event.stopImmediatePropagation(); delete row.dataset.dragConsumed; } }, { capture: true, signal: lifetime.signal });
    row.onpointerdown = event => {
      if (event.button !== 0 || event.target instanceof Element && event.target.closest(".ds-fold,.ds-seam")) return;
      if(event.pointerType==="touch" && !(event.target instanceof Element && event.target.closest(".ds-slide-number")))return;
      drag = { row, pointer: event.pointerId, startX: event.clientX, startY: event.clientY, x: event.clientX, y: event.clientY, active: false, previous: [...input.selected()], current: input.current(), ids: [], label: "", target: null };
      row.setPointerCapture?.(event.pointerId);
    };
    row.onpointermove = event => {
      if (!drag || drag.pointer !== event.pointerId) return;
      drag.x = event.clientX; drag.y = event.clientY;
      if (!drag.active) {
        if (Math.hypot(drag.x - drag.startX, drag.y - drag.startY) < 5) return;
        if (!input.selected().includes(id)) input.select(id);
        drag.ids = [...input.selected()];
        if (!drag.ids.includes(id)) { finish(true); return; }
        drag.active = true; row.setAttribute("data-moving", "");
        const source = input.source(), count = new Set(outlineRoots(source, drag.ids).flatMap(id => outlineBranch(source, id))).size;
        drag.label = t("deckEditor.view.moveCount",{count});
        ghost = el("div", "ds-slide-drag-preview", drag.label); ghost.setAttribute("aria-hidden", "true"); input.screen.append(ghost); frame = requestAnimationFrame(scroll);
      }
      event.preventDefault(); feedback();
    };
    row.onpointerup = event => { if (drag?.pointer === event.pointerId) { if (drag.active) event.preventDefault(); finish(false); } };
    row.onpointercancel = () => finish(true); row.onlostpointercapture = () => { if (drag) finish(true); };
    row.ondragstart = event => event.preventDefault();
  }
  return { bind, dispose: () => { finish(true); lifetime.abort(); } };
}
