import type { NoteBlockId } from "../../lib/notes/blocks";
import { noteBlock } from "../../lib/notes/blocks";
import { t } from "../shared/i18n";
import type { Chrome, ToolbarItem } from "./note-chrome";

/**
 * メモ帳の指での書き心地。スマホの幅のブラウザでも、パソコンと同じメモを同じ軽さで書けるようにする。
 *
 * - **行の長押しでつかむ**。指には取っ手が小さすぎるので、行を押したまま少し待つとつかめる。
 *   つかんだあとの写しと落ちる先の 2px の線はパソコンと同じ部品（src/widget/editor/note-chrome.ts の drag）。押してすぐ動かしたら
 *   ふつうの送り（画面が流れる）で、つかまない
 * - **キーボードの上の 1 列の道具**。焦点が本文にある間だけ、画面のキーボードのすぐ上（visualViewport の下端）に出す。
 *   並びはブロックの台帳から（見出し・箇条書き・確認の箱・画像。いまの行で使えないものは出さない）と、全部のブロックの一覧（「/」と同じ）
 *
 * 指かどうかは `pointer: coarse`（画面の太い指の印）で見る。パソコンの幅の指の端末（タブレット）にも同じに効く。
 */

/** 長押しとみなすまで（iOS の字の選び始め（約 500ms）より前につかむ）。 */
export const NOTE_LONG_PRESS_MS = 400;
/** この距離より動いたら、長押しではなく画面の送り。 */
const SLOP_PX = 10;

/** キーボードの上の道具に並べるブロック（台帳の名前・絵を使う）。 */
const TOOLBAR_BLOCKS: readonly NoteBlockId[] = ["h2", "bullet", "task", "image"];
/** 全部のブロックの一覧（「/」の一覧と同じ）を開く道具の絵（Lucide の plus） */
const ICON_BLOCKS = ["M5 12h14", "M12 5v14"];

export type NoteTouchOptions = {
  main: HTMLElement;
  chrome: Chrome;
  /** 本文に焦点があるか（編集の部品が乗っていて、芯が焦点を持つ） */
  focused(): boolean;
  /** 指の高さの行から、つかむ（つかめる行が無ければ false） */
  grab(clientY: number): boolean;
  /** 台帳のブロックをいまの行に当てる（「/」の一覧で選んだのと同じ） */
  apply(id: NoteBlockId): void;
  /** いまの行で使えるブロックか（使えない道具は押せない形で出す） */
  available(id: NoteBlockId): boolean;
  /** 全部のブロックの一覧を開く */
  openBlocks(): void;
};

export function coarsePointer(): boolean {
  return typeof window.matchMedia === "function" && window.matchMedia("(pointer: coarse)").matches;
}

/** 指の操作を本文に結ぶ。外すときは返り値を呼ぶ。 */
export function mountNoteTouch(options: NoteTouchOptions): () => void {
  const controller = new AbortController();
  const { signal } = controller;
  let timer: number | null = null;
  let start: { x: number; y: number } | null = null;
  let grabbing = false;

  const cancel = (): void => {
    if (timer !== null) window.clearTimeout(timer);
    timer = null;
    start = null;
  };

  options.main.addEventListener("touchstart", (event) => {
    if (event.touches.length !== 1) {
      cancel();
      return;
    }
    const touch = event.touches[0];
    start = { x: touch.clientX, y: touch.clientY };
    const y = touch.clientY;
    if (timer !== null) window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      timer = null;
      if (start === null || !options.grab(y)) return;
      grabbing = true;
      // つかめたことを指に返す（震えを持つ端末だけ）
      navigator.vibrate?.(10);
      window.getSelection()?.removeAllRanges();
    }, NOTE_LONG_PRESS_MS);
  }, { passive: true, signal });
  options.main.addEventListener("touchmove", (event) => {
    const touch = event.touches[0];
    if (start === null || touch === undefined) return;
    if (Math.hypot(touch.clientX - start.x, touch.clientY - start.y) > SLOP_PX) cancel();
  }, { passive: true, signal });
  options.main.addEventListener("touchend", () => {
    cancel();
    grabbing = false;
  }, { passive: true, signal });
  options.main.addEventListener("touchcancel", () => {
    cancel();
    grabbing = false;
  }, { passive: true, signal });
  // 長押しで出る端末のメニュー（Android の文脈メニュー）は、つかんだときだけ止める
  options.main.addEventListener("contextmenu", (event) => {
    if (grabbing || options.chrome.dragging) event.preventDefault();
  }, { signal });

  // --- キーボードの上の道具 ---------------------------------------------------

  const items = (): ToolbarItem[] => [
    // いまの行で使えないブロック（表のセルの中の見出しなど）は出さない（押せない形で並べない）
    ...TOOLBAR_BLOCKS.filter((id) => options.available(id)).map((id) => {
      const block = noteBlock(id);
      return { id, label: t(block.label), icon: block.icon, run: () => options.apply(id) };
    }),
    { id: "blocks", label: t("notes.editor.menu"), icon: ICON_BLOCKS, run: () => options.openBlocks() },
  ];
  const place = (): void => {
    if (!coarsePointer() || !options.focused()) {
      options.chrome.toolbar(null);
      return;
    }
    // 画面のキーボードが出ていると、見えている範囲（visualViewport）の下端がキーボードの上端になる
    const viewport = window.visualViewport;
    const bottom = viewport === null ? 0 : Math.max(0, window.innerHeight - (viewport.offsetTop + viewport.height));
    options.chrome.toolbar({ bottom, items: items() });
  };
  let frame = 0;
  const schedule = (): void => {
    window.cancelAnimationFrame(frame);
    frame = window.requestAnimationFrame(place);
  };
  document.addEventListener("selectionchange", schedule, { signal });
  window.addEventListener("focusin", schedule, { signal });
  window.addEventListener("focusout", schedule, { signal });
  window.visualViewport?.addEventListener("resize", schedule, { signal });
  window.visualViewport?.addEventListener("scroll", schedule, { signal });
  schedule();

  return () => {
    cancel();
    window.cancelAnimationFrame(frame);
    controller.abort();
    options.chrome.toolbar(null);
  };
}
