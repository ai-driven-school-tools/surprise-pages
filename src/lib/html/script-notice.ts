import { SCRIPT_NOTICE_TAG } from "../comments/types";
import { defaultTranslate } from "../i18n/default";
import type { Translate } from "../i18n/translate";

/**
 * 組織の設定（仕掛け入りの HTML を「確かめた仕掛けだけ」）で、このページの仕掛けを配信時に止めたことを伝える上端の 1 行。
 *
 * 切り替えても保存されたページは**消さず・書き換えず**、配信時の実行制限（src/lib/html/document-security.ts の `documentPolicy`）だけが変わる。
 * 止めた仕掛けがあるページだけ、読む人が「壊れている」と思わないように 1 行で知らせる。
 *
 * 見た目は宣言型の Shadow DOM（`<template shadowrootmode>`）に閉じる（環境の帯と同じ作り）。スクリプトを持たず、
 * ページの CSS とも混ざらず、中の文字は本文の文字数（コメントの位置）や書き出しに数えられない。
 * 本文の先頭（body の直後）に流れの中で置く（上端に固定しない・環境の帯とも重ならない）。保存される本文に焼き付いたら
 * src/lib/html/check.ts が断る。
 */
const NOTICE_STYLE = `
:host {
  all: initial;
  color-scheme: inherit;
  display: block;
}
@media print {
  :host { display: none; }
}
p {
  box-sizing: border-box;
  margin: 0;
  padding: 0.5rem 1rem;
  background: color-mix(in srgb, CanvasText 6%, Canvas);
  color: color-mix(in srgb, CanvasText 72%, Canvas);
  font: 400 12px/1.5 -apple-system, BlinkMacSystemFont, "Hiragino Sans", "Noto Sans JP", system-ui, sans-serif;
  -webkit-font-smoothing: antialiased;
}
`.replace(/\s*\n\s*/g, " ").trim();

const BODY_OPEN = /<body[^>]*>/i;

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** 1 行そのもの。 */
export function scriptNoticeMarkup(t: Translate = defaultTranslate): string {
  return `<${SCRIPT_NOTICE_TAG} role="note"><template shadowrootmode="open"><style>${NOTICE_STYLE}</style><p>${escapeHtml(t("organization.scriptNotice"))}</p></template></${SCRIPT_NOTICE_TAG}>`;
}

/** 配信する本文の先頭（body の直後）に 1 行を差し込む。 */
export function withScriptNotice(html: string, t: Translate = defaultTranslate): string {
  const markup = scriptNoticeMarkup(t);
  const open = BODY_OPEN.exec(html);
  if (open === null) return `${markup}${html}`;
  const at = open.index + open[0].length;
  return `${html.slice(0, at)}${markup}${html.slice(at)}`;
}
