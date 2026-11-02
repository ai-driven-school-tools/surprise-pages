import { installDeckPlayback } from "../../lib/deck/playback";
/**
 * スライド形式（deck）の画面の地と、プレゼン中に道具箱を隠すための 1 枚の style。
 *
 * 隠れる合図は `<html data-deck-mode="present">` **だけ**（src/lib/deck/deck.ts が名前の正本）。
 * 実行部とのあいだにイベントの取り決めは作らない——属性 1 つなら、どちらが先に
 * 立ち上がっても食い違わない。
 *
 * light DOM に置くのは、隠す相手が light DOM にあるため。道具箱の器（<surprise-comments>）
 * そのものと、本文に刺した印（<mark data-surprise-comment>）は shadow の外にいる。
 * `:host-context` は Firefox に無いので使わない。印はインラインの style で色を持つので、
 * 消すには `!important` が要る。消すのは色だけで、要素は残す——戻ったときに引き直しが要らない。
 *
 * deck でないページには何も足さない（style 1 枚でも、要らないものは置かない）。
 */

import { DECK_MARK, DECK_MODE_ATTR, DECK_MODE_PRESENT, DECK_FRAME, DECK_CURRENT, DECK_TOOLBAR } from "../../lib/deck/deck";
import { LOCATION_TAG } from "../reading/location-bar";
import { TOP_INSET_VAR } from "../reading/top-inset";
import { EXPORT_TAG, HOST_TAG, MARK_ATTRIBUTE } from "../shared/util";

/** 置いた style の目印。2 度通しても増やさない。 */
export const DECK_STYLE_MARK = "data-surprise-deck";

export function isDeckPage(): boolean {
  return document.body !== null && document.body.hasAttribute(DECK_MARK);
}

/** 保存済みの資料にも「紙と机」を適用する。画面だけに限定して印刷の地は変えない。 */
function deckCanvasCss(): string {
  const body = `body[${DECK_MARK}]`;
  const present = `html[${DECK_MODE_ATTR}="${DECK_MODE_PRESENT}"]`;
  // 雛形と同じ面の色。古い資料で名前が無い場合も、OS の明暗に追従する。
  const surface = "var(--deck-surface, color-mix(in srgb, CanvasText 6%, Canvas))";
  return `@media screen {
    html:has(> ${body}), ${body},
    ${present} ${body} [${DECK_FRAME}][${DECK_CURRENT}] {
      background: ${surface} !important;
    }
    ${body} [data-deck-stage] { background: var(--deck-bg, Canvas); }
  }`;
}

/** プレゼン中に道具箱と印を引っ込める規則。 */
export function deckPresentCss(): string {
  const present = `html[${DECK_MODE_ATTR}="${DECK_MODE_PRESENT}"]`;
  return [
    `${present} ${HOST_TAG}, ${present} ${EXPORT_TAG}, ${present} ${LOCATION_TAG} { display: none !important; }`,
    `${present} mark[${MARK_ATTRIBUTE}] { background: transparent !important; box-shadow: none !important; }`,
  ].join("\n");
}

/**
 * 保存済みの操作列。古い雛形は幅を中身に合わせ、背景も無く sticky するので、
 * 狭い画面で「プレゼンを始める」と「ノートを隠す」が題に重なる。
 * 段階の操作（`.deck-step-*`）は発表中の置き方が別なので触れない。
 */
function deckToolbarCss(): string {
  const toolbar = `body[${DECK_MARK}] [${DECK_TOOLBAR}]:not(.deck-step-controls):not(.deck-step-entry)`;
  const surface = "var(--deck-surface, color-mix(in srgb, CanvasText 6%, Canvas))";
  return `@media screen {
    ${toolbar} {
      position: sticky !important;
      /* 上端の帯（現在地の行など）の下に貼り付く */
      top: var(${TOP_INSET_VAR}, 0px) !important;
      align-self: stretch !important;
      width: 100% !important;
      max-width: 100% !important;
      box-sizing: border-box !important;
      overflow: visible !important;
      background: ${surface} !important;
      padding: 8px 0 0 !important;
      flex-wrap: wrap !important;
    }
    ${toolbar}::after {
      content: "" !important;
      position: absolute !important;
      left: 0 !important;
      right: 0 !important;
      top: 100% !important;
      height: 24px !important;
      pointer-events: none !important;
      background-image: linear-gradient(to bottom, ${surface}, transparent) !important;
    }
    ${toolbar} button {
      white-space: nowrap !important;
      flex: none !important;
    }
  }
  @media screen and (max-width: 600px) {
    ${toolbar} button { min-height: 44px !important; }
  }`;
}

/**
 * 道具箱のある画面では、保存済みの操作列（プレゼンを始める・一覧・ノートを隠す）を出さない。
 *
 * 上端には現在地の行があり、その下にこの 1 段が貼り付くと帯が 2 段になる。釦は右下の道具箱（プレゼン）と
 * ⋯ の「読み方」（発表者画面・一覧・ノート）へ移し、押すのは隠した釦そのもの（src/widget/deck/edit/tools.ts。
 * 実行部とのあいだに取り決めを足さない）。道具箱の無い画面——社外の人・iOS アプリの中・手元で開いた HTML——では、
 * 今までどおりこの 1 段だけが出る。発表中の段階の操作（`.deck-step-*`）は別物なので触らない。
 */
function deckToolbarHandoverCss(): string {
  const toolbar = `body[${DECK_MARK}]:has(> ${HOST_TAG}) [${DECK_TOOLBAR}]:not(.deck-step-controls):not(.deck-step-entry)`;
  return `@media screen { ${toolbar} { display: none !important; } }`;
}

export function mountDeckStyles(): void {
  if (!isDeckPage()) return;
  installDeckPlayback(document);
  if (document.head.querySelector(`style[${DECK_STYLE_MARK}]`) !== null) return;
  const style = document.createElement("style");
  style.setAttribute(DECK_STYLE_MARK, "");
  style.textContent = `${deckCanvasCss()}\n${deckPresentCss()}\n${deckToolbarCss()}\n${deckToolbarHandoverCss()}`;
  document.head.appendChild(style);
}
