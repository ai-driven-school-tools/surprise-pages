import { EASE, MOTION } from "../../lib/settings/ui-motion";
import { CLEAN_COPY_DOCUMENT_ATTR } from "../../lib/notes/model";
import { TOKENS } from "../shared/tokens";

/**
 * メモ帳の見た目。
 *
 * **本文の見た目は清書そのもの**（直している間と読む人の見え方が同じ）。本文の側（light DOM）に置くのは、編集の芯が要る
 * 最小の指定と、清書の節（section）の間を直している間にも同じだけ空ける指定、空の行の薄い案内だけ。線・枠・帯を足さない。
 * 色はページの額縁の名前（`--ads-*`）だけ。字の大きさは部品の目盛り（12px の補足）から外れない。
 *
 * 取っ手・落ちる先の線・ブロックの一覧・保存の 1 行は、本文と別の根（Shadow DOM）に置く。値は道具箱の目盛り
 * （src/widget/shared/tokens.ts の `--space-*`・`--font-*`・`--radius-*`・`--rule-*`・`--size-*`）だけを使い、
 * **色を持つのは落ちる先の線 1 本（アクセント）だけ**。
 */
const ROOT = `main[${CLEAN_COPY_DOCUMENT_ATTR}].ProseMirror`;

export const NOTE_LIGHT_CSS = `
${ROOT} { outline: none; white-space: pre-wrap; white-space: break-spaces; word-wrap: break-word; font-variant-ligatures: none; font-feature-settings: "liga" 0; }
${ROOT} pre { white-space: pre-wrap; }
${ROOT} li { position: relative; }
${ROOT} .ProseMirror-hideselection *::selection { background: transparent; }
${ROOT} .ProseMirror-hideselection { caret-color: transparent; }
${ROOT} [data-note-box] { display: inline-flex; cursor: pointer; }
${ROOT} figure[data-note-media] { position: relative; }
${ROOT} figure[data-note-media] > :is(img, video) { display: block; }
${ROOT} figure.ProseMirror-selectednode > :is(img, video, iframe) { outline: 2px solid rgb(var(--ads-border)); outline-offset: 2px; }
${ROOT} figure[data-note-embed] > iframe { display: block; }
/* トグルの頭の行。字を打つ行なので矢印ではなく字の印（開け閉めは行頭の三角を押すか ⌘Enter） */
${ROOT} details > summary { cursor: text; }
${ROOT} details > summary::marker { cursor: pointer; }
${ROOT} table.ProseMirror-selectednode { outline: 2px solid rgb(var(--ads-border)); outline-offset: 2px; }
/* 清書は h2 から次の h2 の手前までを節で包み、節の下に mb-20（md 以上は mb-24）を空ける。直している間は節が無いので、同じ間を h2 の上に置く */
${ROOT} > h2 ~ h2 { margin-top: 5rem; }
@media (min-width: 768px) { ${ROOT} > h2 ~ h2 { margin-top: 6rem; } }
/* 空の行の薄い案内（題・末尾の行・添え書き）。字ではないので、索引にも書き出しにも数えられない */
${ROOT} [data-note-placeholder]::before { content: attr(data-note-placeholder); float: left; height: 0; pointer-events: none; color: rgb(var(--ads-muted)); opacity: .6; }
${ROOT} figcaption[data-note-placeholder]::before { opacity: .5; }
/* 題は任意。本文を書き始めたら、題の案内は指を乗せたときだけ出す（指で触る端末には指を乗せる操作が無いので出したまま） */
@media (hover: hover) { ${ROOT} [data-note-quiet]:not(:hover)::before { content: none; } }
/* 上げている間の 1 行（絵の下）。進み具合は字だけで出す */
${ROOT} [data-note-progress] { display: flex; align-items: center; gap: 8px; margin: -16px 0 24px; font-size: 12px; line-height: 1.6; color: rgb(var(--ads-muted)); user-select: none; }
${ROOT} [data-note-progress] button { all: unset; cursor: pointer; color: rgb(var(--ads-text)); font-weight: 500; }
${ROOT} [data-note-progress] button:hover { color: rgb(var(--ads-body)); }
${ROOT} [data-note-progress] button:focus-visible { outline: 2px solid rgb(var(--ads-text)); outline-offset: 2px; border-radius: 4px; }
@media print { ${ROOT} [data-note-progress], ${ROOT} [data-note-placeholder]::before { display: none; } }
/* 指でつかんでいる間は、字の選び始めや端末のメニューを出さない */
main[${CLEAN_COPY_DOCUMENT_ATTR}].is-note-grabbing { user-select: none; -webkit-user-select: none; -webkit-touch-callout: none; }
/* つかんだブロックの写し（本文の CSS で描くので light DOM に置く）。半透明で指に付いてくる */
[data-note-ghost] { position: fixed; z-index: 2147481001; pointer-events: none; opacity: .5; margin: 0; }
[data-note-ghost] > * { margin: 0 !important; }
`;

export const NOTE_CHROME_CSS = `
${TOKENS}
:host { all: initial; position: fixed; inset: 0; pointer-events: none; z-index: 2147481000; font-family: inherit; }
* { box-sizing: border-box; }
.handle { position: fixed; display: flex; align-items: center; gap: 0; opacity: 0; pointer-events: none; transition: opacity ${MOTION.quick}ms ${EASE}; }
.handle.is-shown { opacity: 1; pointer-events: auto; }
.handle button { all: unset; display: inline-flex; align-items: center; justify-content: center; width: var(--size-avatar); height: var(--size-avatar); border-radius: var(--radius-sm); color: var(--muted); cursor: pointer; transition: color ${MOTION.quick}ms ${EASE}, background-color ${MOTION.quick}ms ${EASE}; }
.handle button:hover { color: var(--text); background: var(--surface-sunken); }
.handle button:focus-visible { outline: var(--rule-thick) solid var(--text); outline-offset: calc(var(--rule-thick) * -1); }
.handle .grip { cursor: grab; touch-action: none; }
.handle .grip:active { cursor: grabbing; }
.line { position: fixed; height: var(--rule-thick); border-radius: var(--radius-pill); background: var(--accent); opacity: 0; transition: opacity ${MOTION.quick}ms ${EASE}; }
.line.is-shown { opacity: 1; }
/* ブロックの一覧（/）とリンクの小窓。浮く面は道具箱の小窓と同じ影・角・内側の余白。枠の線は持たない */
.menu, .link { position: fixed; min-width: 220px; max-width: 280px; padding: var(--space-1); border-radius: var(--radius-md); background: var(--surface); color: var(--text); box-shadow: 0 0 0 var(--rule-thin) var(--border), var(--shadow); pointer-events: auto; font-size: var(--font-base); line-height: var(--leading-normal); animation: pop ${MOTION.base}ms ${EASE}; }
@keyframes pop { from { opacity: 0; transform: scale(.97); } to { opacity: 1; transform: none; } }
.menu [role="option"] { display: flex; align-items: center; gap: var(--space-2); min-height: var(--size-control); padding: 0 var(--space-2); border-radius: var(--radius-sm); cursor: pointer; }
.menu [role="option"][aria-selected="true"] { background: var(--surface-pressed); }
.menu [role="option"] .icon { display: inline-flex; flex: none; color: var(--muted); }
/* 右端の案内（近道の札か行頭に打つ印）。名前が主役なので、字は 12 の薄い字だけ（囲まない） */
.menu [role="option"] .hint { margin-left: auto; padding-left: var(--space-3); color: var(--muted); font-size: var(--font-sm); white-space: nowrap; }
.menu .empty { padding: var(--space-1) var(--space-2); color: var(--muted); font-size: var(--font-sm); }
.link { display: flex; gap: var(--space-1); }
.link input { all: unset; flex: 1; min-width: 0; padding: var(--space-1) var(--space-2); border-radius: var(--radius-sm); font-size: var(--font-base); line-height: var(--leading-normal); }
.link input:focus-visible { box-shadow: inset 0 0 0 var(--rule-thick) var(--text); outline: var(--rule-thick) solid transparent; outline-offset: calc(var(--rule-thick) * -1); }
.status { position: fixed; display: flex; align-items: center; gap: var(--space-2); padding: var(--space-1) var(--space-3); border-radius: var(--radius-md); background: var(--surface); color: var(--text); box-shadow: 0 0 0 var(--rule-thin) var(--border), var(--shadow); font-size: var(--font-sm); line-height: var(--leading-normal); pointer-events: auto; }
.status button { all: unset; cursor: pointer; font-weight: var(--weight-medium); }
.status button:hover { color: var(--muted); }
.status button:focus-visible { outline: var(--rule-thick) solid var(--text); outline-offset: var(--rule-thick); border-radius: var(--radius-sm); }
.menu [role="option"]:focus-visible { outline: var(--rule-thick) solid var(--text); outline-offset: calc(var(--rule-thick) * -1); }
/* キーボードの上の 1 列の道具。指で押す大きさ（44）・浮く面は一覧と同じ影・色は墨の濃淡だけ */
.toolbar { position: fixed; left: 0; right: 0; display: flex; justify-content: space-around; padding: 0 var(--space-2); padding-bottom: env(safe-area-inset-bottom, 0px); background: var(--surface); box-shadow: 0 0 0 var(--rule-thin) var(--border), var(--shadow); pointer-events: auto; }
.toolbar button { all: unset; display: inline-flex; align-items: center; justify-content: center; width: var(--size-touch); height: var(--size-touch); border-radius: var(--radius-md); color: var(--text); cursor: pointer; }
.toolbar button:focus-visible { outline: var(--rule-thick) solid var(--text); outline-offset: calc(var(--rule-thick) * -1); }
/* 指の画面では一覧の行も指で押せる高さにする */
@media (pointer: coarse) { .menu [role="option"] { min-height: var(--size-touch); } }
@media (prefers-reduced-motion: reduce) { * { transition: none !important; animation: none !important; } }
@media print { :host { display: none; } }
`;
