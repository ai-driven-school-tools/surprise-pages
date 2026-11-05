import { EASE, MOTION } from "../../../lib/settings/ui-motion";
import { el } from "../../shared/util";
import { t } from "../../shared/i18n";
import {
  columnsForWidth, FULL_COLUMNS, GRID_GAP, GRID_NUMBER_ROW, GRID_PAD, gridStep, listWidthRange, NARROW_FULL_COLUMNS, rememberedColumns,
  SPLIT_COLUMNS, stepColumns, widthForColumns, type ListView,
} from "./list-layout";

/**
 * 一覧の格子（src/widget/deck/workspace/list-layout.ts の決まりを画面に当てる側）。縦一覧の作りは navigation.ts のまま。
 * 形は .ds-workspace の data-list: rail（縦一覧）/ split（2〜3 列と 1 枚）/ full（一覧で見る・4・6・8 列）。
 * 取っ手は一覧の右の境目から 1 枚の側へ押す部品の幅（control）だけ。一覧の幅は --studio-left だけで変え、右の調整パネルはどの形でも残す。
 */
export const LIST_GRID_STYLES = `
.ds-nav-resize { position:absolute; top:0; bottom:0; left:var(--studio-left); z-index:3; width:var(--size-control); cursor:col-resize; touch-action:none; }
.ds-nav-resize::before { content:""; position:absolute; top:0; bottom:0; left:calc(var(--rule-thick) / -2); width:var(--rule-thick); background:var(--accent); opacity:0; transition:opacity ${MOTION.quick}ms ${EASE}; }
.ds-nav-resize:hover::before,.ds-nav-resize:active::before { opacity:1; }
.deck-studio .ds-nav-resize:focus-visible { outline:var(--rule-thick) solid var(--accent); outline-offset:calc(-1 * var(--rule-thick)); }
/* 一覧で見る: 一覧を作業場の全面に重ねる。下の 1 枚の枠の大きさは変えない（倍率を計算し直さない・閉じれば元のまま） */
.ds-workspace[data-list=full] .ds-nav { position:absolute; inset:0; z-index:4; border-right:0; }
.deck-studio:is([data-panel=inspector],[data-images-open],[data-media-open]) .ds-workspace[data-list=full] .ds-nav { display:none; }
.ds-slide-list[data-columns] { display:grid; grid-template-columns:repeat(var(--deck-columns),minmax(0,1fr)); align-content:start; gap:var(--space-4); padding:var(--space-4); }
/* 行の中の枚は下で揃える（行を改めた枚の上の余白で、同じ行の枚の頭がずれない） */
.ds-slide-list[data-columns] .ds-slide { grid-template-columns:minmax(0,1fr); gap:var(--space-1); margin-top:0; align-self:end; }
/* 章の頭と章の直後の枚で行を改める。番号は通し番号のまま、絵の下の左に */
.ds-slide-list[data-columns] .ds-slide[data-row-start] { grid-column-start:1; }
.ds-slide-list[data-columns] .ds-slide[data-row-start]:not(:first-child) { margin-top:calc(var(--space-5) - var(--space-4)); }
.ds-slide-list[data-columns] :is(.ds-thumb,.ds-skip-label) { grid-column:1; margin-left:0; }
.ds-slide-list[data-columns] .ds-slide-number { grid-column:1; grid-row:2; display:flex; align-items:center; min-height:var(--space-5); padding-top:0; text-align:left; }
.ds-slide-list[data-columns] .ds-fold { left:auto; right:0; bottom:calc(var(--space-5) - var(--size-control)); width:var(--size-control); height:var(--size-control); align-items:center; justify-content:center; }
.ds-slide-list[data-columns] .ds-fold-count { display:none; }
.ds-slide-list[data-columns] .ds-seam { display:none; }
.ds-drop-line[data-vertical] { right:auto; width:var(--rule-thick); margin-top:0; margin-left:calc(var(--rule-thick) / -2); }
.ds-footer .ds-list-columns .ds-button { width:auto; min-width:var(--size-control); padding:0 var(--space-2); }
@media(max-width:1023px) { .deck-studio[data-list-full] .ds-nav{display:flex;width:auto;right:0} .deck-studio .ds-desktop{display:none} }
`;
type GridHost = {
  screen: HTMLElement; nav: HTMLElement;
  /** 一覧の見えている行（畳んだ章の中は除く）を並び順で */
  rows: () => HTMLElement[];
  current: () => string;
  select: (id: string) => void;
  /** 一覧の行へ焦点（見える所までだけ動かす） */
  focusRow: (id: string) => void;
  /** 真ん中の 1 枚へ焦点（字を直したり要素を選んだりできる所） */
  focusCanvas: () => void;
  /** 形・列が変わった後（フッター・縮小表示の数を合わせる） */
  changed: (retained: number) => void;
  /** 編集画面を閉じたら、画面の幅を聞くのもやめる */
  signal: AbortSignal;
};
const STORE = { split: "pages:deck-list-columns:split", full: "pages:deck-list-columns:full" } as const;
/** 一覧を 1 枚の横に広げられる幅（それより狭い画面の一覧は引き出しで、広げずに「一覧で見る」だけ） */
const WIDE = "(min-width:1024px)";

/** 見えている格子の数（行の高さから）。縮小表示はこの数と 1 行ぶんまで残す */
function gridCapacity(box: HTMLElement | null, columns: number): number {
  if (!box || columns <= 1) return 0;
  const cell = (box.clientWidth - GRID_PAD - (columns - 1) * GRID_GAP) / columns;
  const row = cell * 9 / 16 + GRID_NUMBER_ROW + GRID_GAP;
  return (Math.ceil(box.clientHeight / Math.max(row, 1)) + 1) * columns;
}

/** 列が変わるとき、見えている行だけを元の位置から滑らせる（大きさは変えない・動きを減らす設定では動かさない） */
function slideRows(box: HTMLElement | null, rows: HTMLElement[], calm: boolean, apply: () => void) {
  if (!box || calm || typeof box.animate !== "function") { apply(); return; }
  const bounds = box.getBoundingClientRect();
  const before = new Map(rows.flatMap(row => { const rect = row.getBoundingClientRect(); return rect.bottom < bounds.top || rect.top > bounds.bottom ? [] : [[row, rect] as const]; }));
  apply();
  for (const [row, was] of before) {
    const now = row.getBoundingClientRect(), dx = was.left - now.left, dy = was.top - now.top;
    if (Math.abs(dx) + Math.abs(dy) < 1 || now.bottom < bounds.top || now.top > bounds.bottom + bounds.height) continue;
    row.animate([{ translate: `${dx}px ${dy}px` }, { translate: "0 0" }], { duration: MOTION.base, easing: EASE });
  }
}

/**
 * 値が変わったときだけ書く（null は外す）。一覧は保存のたびに描き直すので、同じ値を書き直すと
 * 作業場の下の全部（300 枚の行と枠）の見た目を測り直させ、操作の間に長い処理が挟まる（速度検査の「操作の間の止まり」）
 */
function attr(node: Element, name: string, value: string | null) {
  if (node.getAttribute(name) === value) return;
  if (value === null) node.removeAttribute(name); else node.setAttribute(name, value);
}
function style(node: HTMLElement, name: string, value: string | null) {
  if ((node.style.getPropertyValue(name) || null) === value) return;
  if (value === null) node.style.removeProperty(name); else node.style.setProperty(name, value);
}

export function createDeckListGrid(host: GridHost) {
  const view = host.screen.ownerDocument.defaultView ?? window;
  // 画面の幅を聞けない所（検査の jsdom）は広い画面として扱う
  const media = (query: string) => typeof view.matchMedia === "function" ? view.matchMedia(query) : null;
  const wide = media(WIDE);
  const narrow = () => wide ? !wide.matches : false;
  const read = (key: string) => () => view.localStorage.getItem(key);
  const write = (key: string, value: number) => { try { view.localStorage.setItem(key, String(value)); } catch { /* 覚えられなくても動く */ } };
  const fullChoices = (): readonly number[] => narrow() ? NARROW_FULL_COLUMNS : FULL_COLUMNS;
  const splitColumns = rememberedColumns(read(STORE.split), SPLIT_COLUMNS, 1);
  let state: ListView = splitColumns > 1 && !narrow() ? { mode: "split", columns: splitColumns } : { mode: "rail", columns: 1 };
  let width = widthForColumns(state.columns), beforeFull: ListView = state;

  // 取っ手は一覧の右の境目から 1 枚の側へ、押す部品の幅だけ（一覧のスクロールバーと重ならない）。見える線は今の境目の 1 本のまま
  const handle = el("div", "ds-nav-resize");
  handle.setAttribute("role", "separator"); handle.setAttribute("aria-orientation", "vertical");
  handle.setAttribute("aria-label", t("deckStudio.list.resize"));
  handle.setAttribute("aria-valuemin", "1"); handle.setAttribute("aria-valuemax", "3");
  handle.tabIndex = 0;

  const workspace = () => host.nav.parentElement;
  const list = () => host.nav.querySelector<HTMLElement>(".ds-slide-list");
  const capacity = () => gridCapacity(list(), state.columns);
  const moving = (apply: () => void) => slideRows(list(), host.rows(), media("(prefers-reduced-motion: reduce)")?.matches ?? true, apply);

  function paintWidth(layout: ListView["mode"]) { style(host.screen, "--studio-left", layout === "split" ? `${Math.round(width)}px` : null); }
  function paint() {
    const root = workspace(), box = list();
    // 並べ直すと浮かぶ説明が前の位置に残るので消す（次に指を乗せる・焦点を移すとまた出る）
    host.screen.querySelector<HTMLElement>(".ds-tooltip")?.toggleAttribute("hidden", true);
    // 一覧で見る間も、下の並び（縦一覧か一覧と 1 枚か）は開く前のまま残す。1 枚の枠の大きさが変わらず、倍率を計算し直さない
    const layout = state.mode === "full" ? beforeFull.mode : state.mode;
    if (root) { attr(root, "data-list", state.mode); attr(root, "data-list-layout", layout); }
    attr(host.screen, "data-list-full", state.mode === "full" ? "" : null);
    paintWidth(layout);
    if (box) {
      const grid = state.columns > 1 ? String(state.columns) : null;
      attr(box, "data-columns", grid); style(box, "--deck-columns", grid);
      attr(box, "aria-label", t("deckStudio.list.columnsLabel", { count: state.columns }));
    }
    attr(handle, "aria-valuenow", String(state.mode === "full" ? 1 : state.columns));
    const hidden = state.mode === "full" || narrow();
    if (handle.hidden !== hidden) handle.hidden = hidden;
    // 一覧の中身（見出し）を作り直しても消えないよう、取っ手は作業場に置く
    if (root && handle.parentElement !== root) root.append(handle);
  }
  /** 形・列を変える。persist は本人のブラウザに覚える（引いている途中は覚えず、離したときに 1 回） */
  function set(next: ListView, nextWidth = width, persist = true) {
    if (next.mode === state.mode && next.columns === state.columns && nextWidth === width) return;
    moving(() => { state = next; width = nextWidth; paint(); });
    if (persist && next.mode !== "full") write(STORE.split, next.columns);
    if (persist && next.mode === "full") write(STORE.full, next.columns);
    host.changed(capacity());
  }
  /** 横に並べる 1〜3 列（縦一覧・一覧と 1 枚） */
  function setSplit(columns: number) {
    set({ mode: columns > 1 ? "split" : "rail", columns }, widthForColumns(columns));
  }
  function openFull() {
    if (state.mode === "full") return;
    beforeFull = state;
    set({ mode: "full", columns: rememberedColumns(read(STORE.full), fullChoices(), narrow() ? 2 : 6) }, width);
    host.focusRow(host.current());
  }
  /** 全面の一覧を閉じる。canvas なら選んだ枚を開いて真ん中へ焦点、そうでなければ一覧の行へ */
  function closeFull(canvas: boolean) {
    if (state.mode !== "full") return;
    set(beforeFull, widthForColumns(beforeFull.columns));
    if (canvas) host.focusCanvas(); else host.focusRow(host.current());
  }
  function open(id: string) { host.select(id); if (state.mode === "full") closeFull(true); else host.focusCanvas(); }
  // 画面が狭くなったら 1 枚の横に広げた一覧は引き出しへ戻し、全面の一覧はその幅の選択肢の列へ
  wide?.addEventListener("change", () => {
    if (state.mode === "full") {
      if (beforeFull.mode === "split" && narrow()) beforeFull = { mode: "rail", columns: 1 };
      if (!fullChoices().includes(state.columns)) set({ mode: "full", columns: narrow() ? 2 : 6 }, width, false);
      else paint();
    } else if (state.mode === "split" && narrow()) set({ mode: "rail", columns: 1 }, widthForColumns(1), false);
    else paint();
    host.changed(capacity());
  }, { signal: host.signal });

  // 取っ手を引くと、幅は指に付いて途切れず動き（描く拍ごとに幅の値だけ）、列は閾値を越えたときだけ増減する。離すと列にちょうど合う幅へ寄せる
  handle.addEventListener("pointerdown", event => {
    if (event.button !== 0 || state.mode === "full") return;
    event.preventDefault();
    handle.setPointerCapture(event.pointerId);
    const start = event.clientX, from = host.nav.getBoundingClientRect().width;
    const inspector = workspace()?.querySelector(".ds-inspector")?.getBoundingClientRect().width ?? 0;
    const range = listWidthRange((workspace()?.clientWidth ?? 0) - inspector);
    let frame = 0, pointer = start;
    const draw = () => {
      frame = 0;
      const next = Math.max(range.min, Math.min(range.max, from + pointer - start)), columns = columnsForWidth(next);
      if (columns !== state.columns) set({ mode: columns > 1 ? "split" : "rail", columns }, next, false);
      else { width = next; if (state.mode === "split") paintWidth("split"); }
    };
    const move = (moved: PointerEvent) => { pointer = moved.clientX; if (!frame) frame = view.requestAnimationFrame(draw); };
    const end = () => {
      handle.removeEventListener("pointermove", move); handle.removeEventListener("pointerup", end); handle.removeEventListener("pointercancel", end);
      if (frame) { view.cancelAnimationFrame(frame); draw(); }
      setSplit(state.columns);
      write(STORE.split, state.columns);
    };
    handle.addEventListener("pointermove", move); handle.addEventListener("pointerup", end); handle.addEventListener("pointercancel", end);
  });
  handle.addEventListener("dblclick", () => setSplit(1));
  handle.addEventListener("keydown", event => {
    const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (!step) return;
    event.preventDefault();
    setSplit(stepColumns(SPLIT_COLUMNS, state.columns, step));
  });

  return {
    get view(): ListView { return state; },
    paint,
    /** 近道（台帳の deck-list-*）。当たって動いたら true */
    shortcut(id: string): boolean {
      if (id === "deck-list-overview") { if (state.mode === "full") closeFull(false); else openFull(); return true; }
      if (id !== "deck-list-fewer" && id !== "deck-list-more") return false;
      const step = id === "deck-list-more" ? 1 : -1;
      if (state.mode === "full") set({ mode: "full", columns: stepColumns(fullChoices(), state.columns, step) });
      else if (!narrow()) setSplit(stepColumns(SPLIT_COLUMNS, state.columns, step));
      return true;
    },
    /** 全面の一覧の間の Esc（焦点が一覧のどこにあっても閉じて一覧の行へ）。受けたら true */
    escape(): boolean {
      if (state.mode !== "full") return false;
      closeFull(false);
      return true;
    },
    /** 一覧の行で押されたキー（格子の矢印・Enter）。受けたら true */
    key(event: KeyboardEvent, id: string): boolean {
      if (event.altKey || event.metaKey || event.ctrlKey || event.shiftKey) return false;
      if (event.key === "Enter") { event.preventDefault(); open(id); return true; }
      if (state.columns <= 1) return false;
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight" && event.key !== "ArrowUp" && event.key !== "ArrowDown") return false;
      event.preventDefault();
      const boxes = host.rows().map(row => ({ id: row.dataset.slideId ?? "", top: row.offsetTop, left: row.offsetLeft }));
      const next = gridStep(boxes, id, event.key);
      if (next) { host.select(next); host.focusRow(next); }
      return true;
    },
    /** 行の Enter・ダブルクリック・指で 2 度目に触れたときに開く（全面の一覧なら閉じて、真ん中の 1 枚へ） */
    open,
    /** 列の数の選択肢（いまの形と画面の幅で）。狭い画面の縦一覧は広げないので無い */
    choices(): readonly number[] { return state.mode === "full" ? fullChoices() : narrow() ? [] : SPLIT_COLUMNS; },
    /** 列の数を選ぶ（フッターのボタン） */
    choose(value: number) { if (state.mode === "full") set({ mode: "full", columns: value }); else setSplit(value); },
    /** 一覧で見るの出し入れ（フッターのボタン） */
    toggle() { if (state.mode === "full") closeFull(false); else openFull(); },
  };
}
export type DeckListGrid = ReturnType<typeof createDeckListGrid>;

/** フッターの「一覧で見る」と列の数（切り替えの部品 .ds-segment）。狭い画面の入口は既存の「一覧」ボタン（ふたつ並べない） */
export function deckListFooter(grid: DeckListGrid, screen: HTMLElement, control: (label: string, action: () => void) => HTMLButtonElement): HTMLElement[] {
  const full = grid.view.mode === "full";
  const toggle = control(full ? t("deckStudio.list.close") : t("deckStudio.list.open"), () => grid.toggle());
  toggle.classList.add("ds-desktop");
  const choices = grid.choices();
  if (!choices.length) return [toggle];
  const group = el("div", "ds-segment ds-list-columns");
  group.setAttribute("role", "radiogroup"); group.setAttribute("aria-label", t("deckStudio.list.columns"));
  for (const value of choices) {
    const item = control(String(value), () => grid.choose(value));
    item.setAttribute("role", "radio"); item.setAttribute("aria-checked", String(value === grid.view.columns));
    item.setAttribute("aria-label", t("deckStudio.list.columnsLabel", { count: value }));
    item.tabIndex = value === grid.view.columns ? 0 : -1;
    item.addEventListener("keydown", event => {
      const step = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 0;
      if (!step) return;
      event.preventDefault();
      grid.choose(stepColumns(choices, grid.view.columns, step));
      screen.querySelector<HTMLButtonElement>(".ds-list-columns [aria-checked=true]")?.focus();
    });
    group.append(item);
  }
  return [toggle, group];
}
