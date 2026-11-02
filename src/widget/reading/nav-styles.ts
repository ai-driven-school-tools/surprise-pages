import { READING_LAYOUT, TOKENS } from "../shared/tokens";

export const READING_STYLES = `${TOKENS}
:host {
  --reading-rail: ${READING_LAYOUT.railWidth}px;
  position: fixed; inset: 0; z-index: 2147482500; pointer-events: none;
  font-family: 'Noto Sans JP', -apple-system, BlinkMacSystemFont, 'Hiragino Sans', sans-serif;
  font-size: var(--font-md); line-height: var(--leading-normal); color: var(--text);
}
*, *::before, *::after { box-sizing: border-box; }
[hidden] { display: none !important; }
a, button { color: inherit; font: inherit; text-decoration: none; }
button { border: 0; background: transparent; padding: 0; cursor: pointer; text-align: left; }
a:focus-visible, button:focus-visible { outline: var(--rule-thick) solid var(--accent); outline-offset: var(--rule-thick); }
a:hover, button:hover { color: var(--text); }
/* 組みの高さの目盛り（src/widget/reading/nav.ts の layoutHeight）。lvh を知らないブラウザでは vh（同じ意味の古い単位）に落ちる */
.viewport { position: absolute; top: 0; left: 0; width: 0; height: 100vh; height: 100lvh; visibility: hidden; pointer-events: none; }
.icon { display: inline-flex; flex: none; align-items: center; }
.icon svg { display: block; }
.rail {
  pointer-events: auto; position: absolute; width: var(--reading-rail);
  top: calc(var(--reading-top, 0px) + var(--space-5));
  bottom: calc(var(--space-5) + env(safe-area-inset-bottom, 0px));
  left: var(--reading-left, var(--space-5));
  display: flex; flex-direction: column; gap: var(--space-5);
}
.rail-title { font-size: var(--font-md); font-weight: var(--weight-bold); margin: 0 0 var(--space-2); }
.count { font-size: var(--font-sm); color: var(--muted); font-weight: var(--weight-normal); margin-left: var(--space-2); }
ol { list-style: none; margin: 0; padding: 0; }
.entry { display: block; min-height: var(--size-touch); padding: var(--space-2) 0; color: var(--muted); overflow-wrap: anywhere; }
.entry[aria-current] { color: var(--text); font-weight: var(--weight-medium); }
.entry.numbered { display:grid; grid-template-columns:var(--size-control) minmax(0,1fr); column-gap:var(--space-2); }
.entry-number { font-variant-numeric:tabular-nums; }
.entry-title { min-width:0; overflow-wrap:anywhere; }
/* 章の木。節は章の行の中に、章の題の字下げに合わせて入れる（章番号の列 + 列の間） */
.tree { min-height: 0; flex: 1; overflow-y: auto; overscroll-behavior: contain; scrollbar-width: thin; }
.rail .section-list { padding-left: calc(var(--size-control) + var(--space-2)); padding-bottom: var(--space-2); }
.rail .section-list .entry { min-height: var(--size-control); padding: var(--space-1) 0; }
.section-list .numbered, .sheet-content .section-entries .numbered { grid-template-columns:var(--space-7) minmax(0,1fr); }
.related { flex: none; font-size: var(--font-sm); }
.related a { display: block; padding: var(--space-2) 0; color: var(--muted); }
.trigger {
  pointer-events: auto; position: absolute; top: var(--reading-top, 0px); left: 0; right: var(--reading-right, 0px);
  display: flex; align-items: center; gap: var(--space-4); width: auto;
  padding: var(--space-3) calc(var(--space-4) + env(safe-area-inset-right, 0px)) var(--space-3) calc(var(--space-4) + env(safe-area-inset-left, 0px));
  background: var(--surface); border-bottom: var(--rule-thin) solid var(--border-light);
  min-height: var(--size-touch);
}
.trigger-copy { min-width: 0; flex: 1; }
.chapter-line, .section-line { display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.chapter-line { color: var(--muted); font-size: var(--font-sm); }
.section-line { font-size: var(--font-md); font-weight: var(--weight-medium); }
.trigger-label { display: flex; align-items: center; gap: var(--space-1); flex: none; }
.sheet {
  pointer-events: auto; position: fixed; inset: 0; margin: 0; width: 100%; height: 100%; max-width: none; max-height: none;
  padding: 0; border: 0; background: var(--surface); color: var(--text); overflow: hidden;
}
.sheet[open] { display: flex; flex-direction: column; }
.sheet::backdrop { background: var(--surface); }
.sheet-header { display: flex; flex: none; align-items: center; justify-content: space-between; gap: var(--space-4); padding: calc(var(--space-2) + env(safe-area-inset-top, 0px) + var(--titlebar-h)) var(--space-4) var(--space-2); }
.sheet-title { margin: 0; font-size: var(--font-lg); font-weight: var(--weight-bold); }
.control { display: inline-flex; align-items: center; gap: var(--space-1); min-height: var(--size-touch); min-width: var(--size-touch); }
.sheet-content { flex: 1; min-height: 0; overflow-y: auto; overscroll-behavior: contain; padding: var(--space-2) var(--space-5) calc(var(--space-5) + env(safe-area-inset-bottom, 0px)); }
.sheet-content .entry { min-height: var(--size-touch); padding: var(--space-3) 0; }
.chapter-row { margin-bottom: var(--space-3); }
.chapter-row .entry { padding-bottom: 0; }
.chapter-extra { display: flex; align-items: center; gap: var(--space-3); }
.current-note { color: var(--muted); font-size: var(--font-sm); margin: var(--space-1) 0 0; overflow-wrap: anywhere; }
.drill { margin-left: auto; color: var(--muted); white-space: nowrap; }
.sheet-heading { font-size: var(--font-lg); line-height: var(--leading-normal); font-weight: var(--weight-bold); margin: 0 0 var(--space-4); overflow-wrap: anywhere; }
.sheet-content .related { margin-top: var(--space-5); }
@media print { :host { display: none !important; } }
`;

/**
 * 目次があるページで、本文の側（light DOM）に効かせる規則。道具箱は `html[data-surprise-reading]` の下に、
 * 配信のときに先に描く差し込み（src/lib/first-paint/chrome.ts）は `html` の下に置く——同じ 1 つの規則なので、
 * 入れ替わる瞬間に章の間の余白も、隠した旧目次も動かない。
 *
 * 本文の index が旧目次を数えるため、旧目次は削除せず表示だけ隠す。
 */
export function readingPageRules(scope: string): string {
  return `
      @media screen {
        ${scope} main:has(article[data-clean-copy-source-id]) > :is(section,details) + :is(section,details) { margin-block-start:${READING_LAYOUT.chapterGap}px; }
      }
      @media screen and (max-width:${READING_LAYOUT.narrowWidth}px) {
        ${scope} main:has(article[data-clean-copy-source-id]) > :is(section,details) + :is(section,details) { margin-block-start:${READING_LAYOUT.chapterGapNarrow}px; }
      }
      ${scope} [data-clean-copy-ui="navigation"],
      ${scope} #sp-to-top { display:none !important; }`;
}

/**
 * 狭い画面で上端に出す現在地の帯（.trigger）の高さ。上下の余白（--space-3 ×2）と、章の行（--font-sm）と節の行（--font-md）を
 * 1.6 の行送りで積んだ 65.6px に下の線（--rule-thin）を足し、上端の帯の持ち主（top-inset.ts）が丸めた値。
 * 配信のときに先に空けておく高さに使う。
 * 実際に組んだ帯の高さと一致することは tests/checks/browser/first-paint-chrome.mjs が測る。
 */
export const READING_TRIGGER_HEIGHT = 67;
