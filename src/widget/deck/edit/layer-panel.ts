/**
 * スライドの編集画面の右の欄の下端に固定した「レイヤー」の一覧（上ほど前面）。設定は上のまま、一覧はいつも同じ場所にある。
 * - 行を押すと選ぶ（⌘・Ctrl で足す、⇧ で範囲）。乗せるとキャンバスに枠。キャンバスで選んだ物は一覧でも選んだ印
 * - 行をドラッグすると重なり順だけが変わり、位置は動かない（./layer-tree.ts）。HTML の順序は動かさない
 * - 錠の印で位置の固定を切り替える。右クリック・Delete・⌘D などはキャンバスと同じ要素の操作
 * - 見出しで畳み、境目の取っ手で高さを変える（このブラウザにだけ覚える）
 * 行は入れ物（div）で、開閉・選ぶ・固定は並んだ本物のボタン。保存の操作の種類は新しく作らない（style と attribute だけ）。
 */
import { DECK_NODE_MARK, type DeckEditableNode, type DeckEditOperation } from "../../../lib/deck/edit/model";
import { inspectDeckEdit } from "../../../lib/deck/edit/source";
import { layerRows, planLayerDrop, readLayerNodes, GROUP_WRAPPER, type LayerKind, type LayerPlacement, type LayerRow } from "./layer-tree";
import { deckIcon, type DeckIcon } from "../ui";
import { el } from "../../shared/util";
import { t } from "../../shared/i18n";

type Host = {
  dock: HTMLElement;
  signal: AbortSignal;
  /** いま見せている枚（描いた側）。無ければ null */
  slide: () => Element | null;
  /** 一覧を出さないとき（デザインの板を開いている・枚が無い） */
  hidden: () => boolean;
  /** 原稿（編集できる要素の情報を読む） */
  source: () => string;
  labelOf: (node: Element) => string;
  selection: () => readonly string[];
  /** キャンバスで選ぶ（焦点は一覧に残す） */
  select: (ids: string[]) => void;
  hover: (id: string | null) => void;
  commit: (ops: DeckEditOperation[]) => boolean;
  /** 原稿の側の要素（保存の操作の before を読む） */
  sourceNode: (id: string) => HTMLElement | undefined;
  menu: (x: number, y: number) => void;
  command: (command: string) => void;
  message: (text: string) => void;
};
type Size = { open: boolean; height: number };
type Aim = { key: string; placement: LayerPlacement; box: HTMLElement };

const STORAGE = "pages-deck-layers";
const SELF = "img,video,audio,table,svg,figure,[data-deck-media-slot],[data-deck-sample-image],[data-deck-shape],[data-dd-chart],[data-deck-chart],[data-deck-youtube]";
const ICONS: Record<LayerKind, DeckIcon> = { text: "text", image: "image", video: "video", audio: "video", chart: "chart", table: "table", shape: "square", icon: "image", box: "grid", group: "layers" };
const MIN_HEIGHT = 96;
/** キャンバスと同じ要素の操作の近道（⌘・Ctrl と組む字） */
const COMMAND_KEYS: Readonly<Record<string, string>> = { c: "copy", v: "paste", d: "duplicate", x: "cut" };

export const LAYER_PANEL_CSS = `
.ds-layers { position:absolute; right:0; bottom:0; z-index:2; display:flex; flex-direction:column; width:var(--studio-right); padding:0 0 var(--space-2); border-top:1px solid var(--border); border-left:1px solid var(--border); background:var(--surface); }
.ds-workspace:has(> .ds-layers:not([hidden])) .ds-inspector { padding-bottom:calc(var(--space-4) + var(--layers-space, 0px)); }
.deck-studio[data-media-open] .ds-layers, .deck-studio[data-images-open] .ds-layers { display:none; }
@media(max-width:1023px) {
  .ds-layers { display:none; width:264px; z-index:4; }
  .deck-studio[data-panel=inspector] .ds-layers:not([hidden]) { display:flex; }
}
.ds-layers-resize { height:var(--space-2); margin-top:calc(-1 * var(--space-1)); cursor:ns-resize; }
.ds-layers-resize:focus-visible { outline:2px solid var(--accent); outline-offset:-2px; }
.ds-layers-head { display:flex; align-items:center; gap:var(--space-2); width:100%; min-height:32px; padding:0 var(--studio-inset); border:0; background:transparent; font-size:var(--font-sm); font-weight:600; color:var(--text); text-align:left; }
.ds-layers:not([data-open]) .ds-layers-head svg { rotate:-90deg; }
.ds-layers-list { position:relative; height:var(--layers-height); overflow:auto; padding:0 var(--space-2); scrollbar-width:thin; }
.ds-layer { display:grid; grid-template-columns:var(--space-5) minmax(0,1fr) var(--space-6); align-items:center; padding-left:calc(var(--layer-depth) * var(--space-4)); border-radius:4px; }
.ds-layer:hover { background:var(--surface-sunken); }
.ds-layer[data-drop-inside] { box-shadow:inset 0 0 0 1px var(--accent); }
.ds-layer button { min-width:0; height:28px; padding:0; border:0; background:transparent; color:inherit; }
.ds-layer-fold svg { width:12px; height:12px; }
.ds-layer-fold[aria-expanded="false"] svg { rotate:-90deg; }
.ds-layer-pick { display:flex; align-items:center; gap:var(--space-2); text-align:left; font-size:var(--font-base); color:var(--muted); }
.ds-layer-pick svg { flex:none; width:14px; height:14px; }
.ds-layer-pick[aria-pressed="true"] { color:var(--text); font-weight:600; }
.ds-layer:has(.ds-layer-pick[aria-pressed="true"]) { background:var(--surface-sunken); }
.ds-layer-label { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.ds-layer-lock { opacity:0; color:var(--muted); }
.ds-layer:hover .ds-layer-lock, .ds-layer-lock:focus-visible, .ds-layer[data-locked] .ds-layer-lock { opacity:1; }
.ds-layer[data-locked] .ds-layer-lock { color:var(--text); }
.ds-layer-lock svg { width:14px; height:14px; }
.ds-layers-line { position:absolute; left:calc(var(--space-2) + var(--layer-depth) * var(--space-4)); right:var(--space-2); height:2px; background:var(--accent); pointer-events:none; }
.ds-layers[data-dragging] .ds-layer { cursor:grabbing; }
`;

function remembered(): Size {
  try {
    const value: unknown = JSON.parse(window.localStorage.getItem(STORAGE) ?? "null");
    if (value && typeof value === "object" && "open" in value && "height" in value && typeof value.open === "boolean" && typeof value.height === "number") return { open: value.open, height: value.height };
  } catch { /* 保存できない設定のブラウザでも、この画面の中では使える */ }
  return { open: true, height: 200 };
}
function remember(size: Size) {
  try { window.localStorage.setItem(STORAGE, JSON.stringify(size)); } catch { /* 覚えられなくても、この画面の中では効く */ }
}
const labelOfRow = (item: LayerRow) => (item.kind === "group" ? t("deckEditor.workspace.group") : item.kind === "box" ? t("deckEditor.layers.box") : item.label);

/** 1 行: 開閉（子があるとき）・選ぶ・固定の 3 つの本物のボタンを並べた入れ物 */
function rowElement(item: LayerRow, pressed: boolean, closed: boolean): HTMLElement {
  const box = el("div", "ds-layer"), label = labelOfRow(item);
  box.dataset.key = item.key;
  box.style.setProperty("--layer-depth", String(item.depth));
  box.toggleAttribute("data-locked", item.locked);
  const control = (className: string, name: string) => { const one = el("button", className); one.type = "button"; one.tabIndex = -1; one.setAttribute("aria-label", name); return one; };
  if (item.children) {
    const fold = control("ds-layer-fold", closed ? t("deckEditor.layers.expand", { label }) : t("deckEditor.layers.collapse", { label }));
    fold.setAttribute("aria-expanded", String(!closed));
    fold.append(deckIcon("chevron"));
    box.append(fold);
  } else box.append(el("span", "ds-layer-fold"));
  // 読み上げの名前は「レイヤー「見出し」」の形にする（要素の名前だけだと、挿入の「画像」などほかのボタンと同じ名前になる）
  const pick = control("ds-layer-pick", item.locked ? t("deckEditor.layers.locked", { label }) : t("deckEditor.layers.row", { label }));
  pick.setAttribute("aria-pressed", String(pressed));
  pick.append(deckIcon(ICONS[item.kind]), el("span", "ds-layer-label", label));
  const lock = control("ds-layer-lock", item.locked ? t("deckEditor.inspector.unlock") : t("deckEditor.inspector.lock"));
  lock.setAttribute("aria-pressed", String(item.locked));
  lock.dataset.tooltip = lock.getAttribute("aria-label") ?? "";
  lock.append(deckIcon("lock"));
  box.append(pick, lock);
  return box;
}

/** 一覧の中だけを送って、行を見える所に出す（外側の画面は動かさない） */
function reveal(list: HTMLElement, target: Element) {
  const box = target.getBoundingClientRect(), bounds = list.getBoundingClientRect();
  if (box.top < bounds.top) list.scrollTop += box.top - bounds.top;
  else if (box.bottom > bounds.bottom) list.scrollTop += box.bottom - bounds.bottom;
}

/** 背景か枠が見えている入れ物か（並べるためだけの見えない囲みは行にせず、中の要素を親の段に並べる） */
function visibleBox(node: Element): boolean {
  const css = node.ownerDocument.defaultView?.getComputedStyle(node);
  if (!css) return true;
  const filled = css.backgroundColor !== "transparent" && css.backgroundColor !== "rgba(0, 0, 0, 0)" || css.backgroundImage !== "none";
  return filled || [css.borderTopWidth, css.borderRightWidth, css.borderBottomWidth, css.borderLeftWidth].some((width) => Number.parseFloat(width) > 0);
}

/** 描いた枚から読む材料。編集できる要素（原稿の編集の情報にあるもの）だけ。原稿が変わったときだけ編集の情報を読み直す */
function createLayerReader(host: Pick<Host, "source" | "labelOf">) {
  let known: { html: string; nodes: ReadonlyMap<string, DeckEditableNode> } = { html: "", nodes: new Map() };
  return (slide: Element) => {
    const html = host.source();
    if (known.html !== html) known = { html, nodes: new Map(inspectDeckEdit(html).nodes.map((node) => [node.id, node])) };
    const editable = known.nodes, info = (node: Element) => editable.get(node.getAttribute(DECK_NODE_MARK) ?? "");
    return readLayerNodes(slide, {
      mark: DECK_NODE_MARK,
      selfListed: (node) => { const found = info(node); return !!found && !node.matches(GROUP_WRAPPER) && (node.matches(SELF) || found.textRuns.some((run) => run.text.trim())); },
      label: (node) => host.labelOf(node),
      boxListed: (node) => node.matches(GROUP_WRAPPER) || visibleBox(node),
    }).filter((node) => editable.has(node.id));
  };
}

/** 高さ: 取っ手を引くか、取っ手に焦点があるときの上下の矢印 */
function listenResize(handle: HTMLElement, dock: HTMLElement, size: Size, apply: () => void, signal: AbortSignal) {
  handle.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    handle.setPointerCapture(event.pointerId);
    const start = event.clientY, from = size.height, room = (dock.parentElement?.getBoundingClientRect().height ?? 600) - 120;
    const move = (next: PointerEvent) => { size.height = Math.round(Math.max(MIN_HEIGHT, Math.min(room, from + start - next.clientY))); apply(); };
    const up = () => { handle.removeEventListener("pointermove", move); remember(size); };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", up, { once: true });
    handle.addEventListener("pointercancel", up, { once: true });
  }, { signal });
  handle.addEventListener("keydown", (event) => {
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
    event.preventDefault();
    size.height = Math.max(MIN_HEIGHT, size.height + (event.key === "ArrowUp" ? 16 : -16));
    apply();
    remember(size);
  }, { signal });
}

/**
 * 行のドラッグ: 4px 動いたら始め、行の上半分は上へ・下半分は下へ、包まないグループの行の真ん中（上下 1/4 を除く）は中へ。
 * 落とし先は強調色の線 1 本（中へはその行の縁）。Esc・指を離したまま外れたら何もしない。
 */
function listenDrag(input: { list: HTMLElement; dock: HTMLElement; hover: (id: string | null) => void; drop: (key: string, target: string, placement: LayerPlacement) => void; signal: AbortSignal }) {
  const { list, dock, signal } = input, line = el("div", "ds-layers-line");
  let drag: { key: string; pointer: number; y: number; active: boolean; target: Aim | null } | null = null, swallow = false;
  function aim(y: number): Aim | null {
    for (const box of list.querySelectorAll<HTMLElement>(".ds-layer")) {
      const rect = box.getBoundingClientRect();
      if (y < rect.top || y > rect.bottom || box.dataset.key === drag?.key) continue;
      const share = (y - rect.top) / rect.height, group = box.dataset.key?.startsWith("group:") ?? false;
      return { key: box.dataset.key ?? "", placement: group && share > 0.25 && share < 0.75 ? "inside" : share < 0.5 ? "before" : "after", box };
    }
    return null;
  }
  function paint(target: Aim | null) {
    for (const box of list.querySelectorAll("[data-drop-inside]")) box.removeAttribute("data-drop-inside");
    line.remove();
    if (!target) return;
    if (target.placement === "inside") { target.box.setAttribute("data-drop-inside", ""); return; }
    const rect = target.box.getBoundingClientRect(), bounds = list.getBoundingClientRect();
    line.style.top = `${(target.placement === "before" ? rect.top : rect.bottom) - bounds.top + list.scrollTop - 1}px`;
    line.style.setProperty("--layer-depth", target.box.style.getPropertyValue("--layer-depth"));
    list.append(line);
  }
  function end(apply: boolean) {
    const current = drag;
    drag = null;
    paint(null);
    dock.removeAttribute("data-dragging");
    if (apply && current?.active && current.target) input.drop(current.key, current.target.key, current.target.placement);
  }
  list.addEventListener("pointerdown", (event) => {
    const target = event.target instanceof Element ? event.target : null, key = target?.closest<HTMLElement>(".ds-layer")?.dataset.key;
    if (event.button === 0 && key && target?.closest(".ds-layer-pick")) drag = { key, pointer: event.pointerId, y: event.clientY, active: false, target: null };
  }, { signal });
  list.addEventListener("pointermove", (event) => {
    if (!drag || event.pointerId !== drag.pointer) return;
    if (!drag.active && Math.abs(event.clientY - drag.y) < 4) return;
    if (!drag.active) { drag.active = true; list.setPointerCapture(event.pointerId); dock.setAttribute("data-dragging", ""); input.hover(null); }
    drag.target = aim(event.clientY);
    paint(drag.target);
  }, { signal });
  list.addEventListener("pointerup", (event) => { if (drag?.pointer !== event.pointerId) return; swallow = drag.active; end(true); }, { signal });
  list.addEventListener("pointercancel", () => end(false), { signal });
  return {
    get active() { return !!drag?.active; },
    cancel: () => { if (!drag) return false; end(false); return true; },
    /** ドラッグを終えた直後の click は選び直しにしない */
    swallowClick: () => { const value = swallow; swallow = false; return value; },
  };
}

export function createDeckLayerPanel(host: Host) {
  const size = remembered(), folded = new Set<string>(), read = createLayerReader(host);
  let rows: LayerRow[] = [], frame = 0, anchor: string | null = null, lastShown: string | null = null;
  const dock = host.dock;
  dock.classList.add("ds-layers");
  dock.setAttribute("role", "region");
  dock.setAttribute("aria-label", t("deckEditor.layers.title"));
  const style = el("style");
  style.textContent = LAYER_PANEL_CSS;
  const handle = el("div", "ds-layers-resize");
  handle.setAttribute("role", "separator");
  handle.setAttribute("aria-orientation", "horizontal");
  handle.setAttribute("aria-label", t("deckEditor.layers.resize"));
  handle.tabIndex = 0;
  const head = el("button", "ds-layers-head");
  head.type = "button";
  head.append(deckIcon("chevron"), el("span", undefined, t("deckEditor.layers.title")));
  const list = el("div", "ds-layers-list");
  list.setAttribute("role", "group");
  list.setAttribute("aria-label", t("deckEditor.layers.list"));
  dock.append(style, handle, head, list);

  function applySize() {
    dock.toggleAttribute("data-open", size.open);
    head.setAttribute("aria-expanded", String(size.open));
    dock.style.setProperty("--layers-height", `${size.height}px`);
    list.hidden = !size.open;
    handle.hidden = !size.open;
    // 右の欄の下の余白を一覧の高さに合わせる（設定の最後の行が一覧の下に隠れない）
    dock.parentElement?.style.setProperty("--layers-space", `${dock.offsetHeight}px`);
  }
  applySize();

  const chosen = (row: LayerRow) => row.members.every((id) => host.selection().includes(id));
  const visible = () => rows.filter((row) => { for (let at = row.parentKey; at; at = rows.find((other) => other.key === at)?.parentKey ?? null) if (folded.has(at)) return false; return true; });
  const pickOf = (key: string) => list.querySelector<HTMLButtonElement>(`.ds-layer[data-key="${CSS.escape(key)}"] .ds-layer-pick`);
  const rowAt = (target: EventTarget | null) => { const key = target instanceof Element ? target.closest<HTMLElement>(".ds-layer")?.dataset.key : undefined; return rows.find((other) => other.key === key); };

  function render() {
    frame = 0;
    dock.hidden = host.hidden();
    if (!dock.hidden) dock.parentElement?.style.setProperty("--layers-space", `${dock.offsetHeight}px`);
    const slide = host.slide();
    if (dock.hidden || !slide || !size.open) return;
    rows = layerRows(read(slide));
    const focusKey = list.querySelector(".ds-layer-pick:focus")?.closest<HTMLElement>(".ds-layer")?.dataset.key ?? null, scroll = list.scrollTop;
    list.replaceChildren(...visible().map((item) => rowElement(item, chosen(item), folded.has(item.key))), ...(rows.length ? [] : [el("p", "ds-note", t("deckEditor.layers.empty"))]));
    list.scrollTop = scroll;
    if (focusKey) pickOf(focusKey)?.focus({ preventScroll: true });
    const pressed = list.querySelector<HTMLButtonElement>('.ds-layer-pick[aria-pressed="true"]'), first = pressed ?? list.querySelector<HTMLButtonElement>(".ds-layer-pick");
    if (first) first.tabIndex = 0;
    // キャンバスで選び直したら、その行が見える所まで一覧だけを送る（同じ選択のまま描き直したときは動かさない）
    const shown = pressed?.closest<HTMLElement>(".ds-layer")?.dataset.key ?? null;
    if (pressed && shown !== lastShown && !drag.active) reveal(list, pressed);
    lastShown = shown;
  }
  /** 描くのは次の描画の前に 1 回だけ（選択と保存の知らせが続けて来ても読み直しは 1 回） */
  function refresh() {
    if (!frame) frame = requestAnimationFrame(render);
  }

  function pick(item: LayerRow, event: MouseEvent | KeyboardEvent) {
    const shown = visible(), from = shown.findIndex((other) => other.key === anchor), to = shown.findIndex((other) => other.key === item.key);
    if (event.shiftKey && from >= 0 && to >= 0) { host.select(shown.slice(Math.min(from, to), Math.max(from, to) + 1).flatMap((other) => other.members)); return; }
    anchor = item.key;
    if (!event.metaKey && !event.ctrlKey) { host.select([...item.members]); return; }
    const current = [...host.selection()];
    host.select(chosen(item) ? current.filter((id) => !item.members.includes(id)) : [...current, ...item.members]);
  }
  function lock(item: LayerRow) {
    host.commit(item.members.flatMap((id): DeckEditOperation[] => {
      const node = host.sourceNode(id);
      return node ? [{ kind: "attribute", target: id, name: "data-deck-locked", before: node.getAttribute("data-deck-locked"), after: item.locked ? null : "true" }] : [];
    }));
  }
  function drop(moving: string, target: string, placement: LayerPlacement) {
    const slide = host.slide();
    if (!slide) return;
    const plan = planLayerDrop(read(slide), moving, target, placement);
    if ("error" in plan) { if (plan.error !== "deckEditor.layers.unchanged") host.message(t(plan.error)); return; }
    const ops: DeckEditOperation[] = [
      ...plan.groups.map(({ id, after }): DeckEditOperation => ({ kind: "attribute", target: id, name: "data-deck-group", before: host.sourceNode(id)?.getAttribute("data-deck-group") ?? null, after })),
      ...plan.styles.map(({ id, property, value }): DeckEditOperation => ({ kind: "style", target: id, property, before: host.sourceNode(id)?.style.getPropertyValue(property) || null, after: value })),
    ];
    const item = rows.find((other) => other.key === moving);
    if (host.commit(ops) && item) host.select([...item.members]);
  }
  function fold(item: LayerRow, closed: boolean) {
    if (closed) folded.add(item.key); else folded.delete(item.key);
    render();
    pickOf(item.key)?.focus();
  }
  /** 上下で行を移って選ぶ・左右で畳む／開く（左で親の行へ）。受けたら true */
  function navigate(event: KeyboardEvent, item: LayerRow): boolean {
    const shown = visible(), index = shown.findIndex((other) => other.key === item.key);
    const next = event.key === "ArrowDown" ? shown[index + 1] : event.key === "ArrowUp" ? shown[index - 1] : undefined;
    if (next) { pickOf(next.key)?.focus(); pick(next, event); return true; }
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return false;
    const open = item.children > 0 && !folded.has(item.key);
    if (item.children && (event.key === "ArrowRight") === !open) { fold(item, open); return true; }
    const parent = event.key === "ArrowLeft" ? shown.find((other) => other.key === item.parentKey) : undefined;
    if (!parent) return false;
    pickOf(parent.key)?.focus();
    return true;
  }

  const drag = listenDrag({ list, dock, hover: host.hover, drop, signal: host.signal });
  listenResize(handle, dock, size, applySize, host.signal);
  head.addEventListener("click", () => { size.open = !size.open; applySize(); remember(size); if (size.open) refresh(); }, { signal: host.signal });
  list.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target : null, item = rowAt(target);
    if (drag.swallowClick() || !item) return;
    if (target?.closest(".ds-layer-fold")) fold(item, !folded.has(item.key));
    else if (target?.closest(".ds-layer-lock")) lock(item);
    else if (target?.closest(".ds-layer-pick")) pick(item, event);
  }, { signal: host.signal });
  list.addEventListener("contextmenu", (event) => {
    const item = rowAt(event.target);
    if (!item) return;
    event.preventDefault();
    if (!chosen(item)) host.select([...item.members]);
    host.menu(event.clientX, event.clientY);
  }, { signal: host.signal });
  list.addEventListener("pointerover", (event) => { const item = rowAt(event.target); if (!drag.active) host.hover(item ? item.members[0] ?? null : null); }, { signal: host.signal });
  list.addEventListener("pointerleave", () => host.hover(null), { signal: host.signal });
  // キー: 行の移動と開閉・Delete と要素の操作の近道はキャンバスと同じ（固定した要素には効かせない）
  list.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && drag.cancel()) { event.preventDefault(); return; }
    const item = rowAt(event.target);
    if (!item || navigate(event, item)) { if (item) event.preventDefault(); return; }
    const modifier = event.metaKey || event.ctrlKey;
    const command = event.key === "Delete" || event.key === "Backspace" ? "delete" : modifier ? COMMAND_KEYS[event.key.toLowerCase()] : undefined;
    if (command && !item.locked) { event.preventDefault(); event.stopPropagation(); host.command(command); }
  }, { signal: host.signal });
  host.signal.addEventListener("abort", () => { if (frame) cancelAnimationFrame(frame); });

  return { refresh };
}
