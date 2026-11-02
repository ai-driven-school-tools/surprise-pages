import { EASE, MOTION } from "../../lib/settings/ui-motion";
import { TITLEBAR_HEIGHT, TITLEBAR_HISTORY_CSS, TITLEBAR_START_CSS } from "../../lib/workspace/window-titlebar";
import { WORKSPACE_FONT, WORKSPACE_INK, type WorkspaceInk } from "../../lib/workspace/ink";
import { NARROW_VIEWPORT } from "../shared/util";

/**
 * 現在地の行の見た目（location-bar.ts）。
 *
 * 色と寸法はワークスペースの画面と同じ（墨と地は `src/lib/workspace/ink.ts`、高さと左の幅は
 * `src/lib/workspace/window-titlebar.ts`）。一覧からページへ移っても、戻る・進むの位置と字の色が動かない。
 * 道具箱（コメント欄）の色は使わない——あちらは「このページの道具」、こちらは「製品の中の現在地」。
 *
 *   階層   いまいるページの題だけ濃く・中太。戻る先の場所の名前と区切りは灰（選んでいない目次の行と同じ 2 態）
 *   地     ページの地の色をそのまま借りて、少しだけ透かす。開いた瞬間は帯に見えず、本文が下をくぐるときだけ
 *          ぼかしで読める。線は、本文がくぐっている間だけ 1 本（余白と字で分けられるのは、重なっていないときだけ）
 *   色     墨の濃淡だけ。指を乗せたときの面のほかに、色は使わない
 *   右端   「いつ・何版目」は場所の名前と同じ灰・同じ大きさ・同じ押し心地。題より強くしない
 *          （題が主役で、版は添え書き）。狭い画面では何版目を畳み、日付だけ残す
 *   星     版の左。戻る・進むと同じ絵のボタンで、付いているときだけ塗る（一覧の行の星と同じ 2 態）
 *   印     左端。製品の印（サイドバーの頭と同じ 20px）を 32px の押す面の真ん中に置く。押すとホーム
 *   顔     右端。サイドバーの名乗りの行と同じ 24px の丸（頭文字・地は押した面の濃さ）を 32px の押す面に。
 *          押すと、その真下にサイドバーを畳んだメニュー。寸法はワークスペースのメニュー（`.ws-menu`）と同じ
 *          （幅 11rem から・内側 4px・角 8px・行 32px・字 14px・影は線 1 本と 2 段のぼかし）。線で段を割らず、
 *          個人設定の前を余白 1 段で分ける
 */
function ink(tone: WorkspaceInk): string {
  return [
    `--ink: ${tone.text};`,
    `--ink-muted: ${tone.muted};`,
    // 地を持たないページは、ブラウザの既定の地（明暗は color-scheme に従う）
    `--ground: var(--page-ground, Canvas);`,
    `--line: color-mix(in srgb, ${tone.text} ${tone.lineMix}%, transparent);`,
    `--hover: color-mix(in srgb, ${tone.text} ${tone.hoverMix}%, transparent);`,
    `--press: color-mix(in srgb, ${tone.text} ${tone.pressMix}%, transparent);`,
  ].join(" ");
}

export const LOCATION_BAR_STYLES = `
:host {
  all: initial;
  position: fixed;
  top: var(--location-top, 0px);
  left: 0;
  right: 0;
  z-index: 2147482400;
  display: block;
  height: ${TITLEBAR_HEIGHT}px;
  --control: 32px;
  --radius: 6px;
  /* メニューの角と行の角（ワークスペースの --ws-radius-lg / --ws-radius-sm と同じ値） */
  --radius-lg: 8px;
  --radius-sm: 4px;
  /* メニューの影。線 1 本と 2 段のぼかし（ワークスペースの --ws-shadow と同じ） */
  --shadow: 0 0 0 1px var(--line), 0 8px 24px -6px rgb(0 0 0 / 0.14), 0 2px 6px -2px rgb(0 0 0 / 0.08);
  /* 信号機ボタンが使っている左の幅。窓の枠が無ければ 0 */
  --lead: ${TITLEBAR_START_CSS};
  color-scheme: light;
  ${ink(WORKSPACE_INK.light)}
}
:host([data-tone="dark"]) {
  color-scheme: dark;
  ${ink(WORKSPACE_INK.dark)}
}
/* 窓の題名の帯を兼ねているとき（デスクトップアプリ）は、全面の画面（編集など）より上に残す */
:host([data-titlebar]) { z-index: 2147483647; }
/* 顔のメニューを開いている間は、道具箱の層（コメントの板）より上。畳めば元の高さに戻る */
:host([data-menu-open]) { z-index: 2147483100; }
/* 環境の帯の下にいるときは、信号機ボタンは帯の側にある。左は端の余白ぶんだけ空ける */
:host([data-under-ribbon]) { --lead: 4px; }

*, *::before, *::after { box-sizing: border-box; }
[hidden] { display: none !important; }

.bar {
  display: flex;
  align-items: center;
  height: 100%;
  /* 左右とも 12px（サイドバーの内側の余白と同じ）。左は印の面、右は顔の面がここから始まる */
  padding: 0 12px;
  background: color-mix(in srgb, var(--ground) 84%, transparent);
  -webkit-backdrop-filter: saturate(180%) blur(20px);
  backdrop-filter: saturate(180%) blur(20px);
  color: var(--ink);
  font: 400 14px/20px ${WORKSPACE_FONT};
  -webkit-font-smoothing: antialiased;
  letter-spacing: normal;
  white-space: nowrap;
  transition: box-shadow ${MOTION.quick}ms ${EASE};
  /* デスクトップアプリでは、この行をつかんで窓を動かせる（ブラウザでは意味を持たない指定） */
  app-region: drag;
}
:host([data-scrolled]) .bar { box-shadow: 0 1px 0 var(--line); }

/*
 * 窓の枠のぶんの場所（信号機ボタンのぶんの空きと、その右隣の戻る・進む）。枠が無ければ幅は 0。
 * 戻る・進むは、この場所に幅があるとき（＝デスクトップアプリ）だけ出す。ブラウザには自前のものがある。
 * 見分けを JS でやらないのは、描いたあとで出たり引っ込んだりさせないため。
 */
.lead {
  display: flex;
  flex: none;
  justify-content: flex-end;
  width: calc(var(--lead) + ${TITLEBAR_HISTORY_CSS});
  container-type: inline-size;
}
.steps { display: none; }
@container (min-width: 1px) {
  .steps { display: flex; }
}

a, button {
  -webkit-tap-highlight-color: transparent;
  app-region: no-drag;
}
:focus-visible { outline: 2px solid var(--ink); outline-offset: -2px; }

.step {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: var(--control);
  height: var(--control);
  padding: 0;
  border: 0;
  border-radius: var(--radius);
  background: transparent;
  color: var(--ink-muted);
  cursor: pointer;
  transition: background-color ${MOTION.quick}ms ${EASE}, color ${MOTION.quick}ms ${EASE}, opacity ${MOTION.quick}ms ${EASE};
}
.step:hover:not(:disabled) { background: var(--hover); color: var(--ink); }
.step:active:not(:disabled) { background: var(--press); }
.step:disabled { opacity: 0.45; cursor: default; }
.step svg { display: block; }

/* 製品の印（ホーム）。絵のボタン（.step）と同じ 32px の面に、20px の印を真ん中に置く。
   印の色は地と墨の 2 つだけ（サイドバーの頭と同じ。紙は地の色、折った角は墨） */
.mark {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: var(--control);
  height: var(--control);
  border-radius: var(--radius);
  color: var(--ink);
  transition: background-color ${MOTION.quick}ms ${EASE};
}
/* 組織のロゴ。サイドバーの頭の行のロゴ（.ws-organization-logo）と同じ寸法: 印と同じ高さ・押す面 3 つぶんまでの幅 */
.logo {
  display: block;
  flex: none;
  width: auto;
  height: calc(var(--control) - 0.75rem);
  max-width: calc(var(--control) * 3);
  object-fit: contain;
}
.mark:hover { background: var(--hover); }
.mark:active { background: var(--press); }
.mark svg { display: block; }
.mark-tile { fill: var(--ink); }
.mark-sheet { fill: var(--ground); stroke: var(--ground); }
.mark-fold { fill: var(--ink); stroke: var(--ink); }
/* 場所の名前の面は印の面の右に続き、字は面の左右に 8px ずつ */
.crumbs {
  display: flex;
  flex: 1;
  align-items: center;
  min-width: 0;
}
.place {
  display: inline-flex;
  flex: none;
  align-items: center;
  height: var(--control);
  padding: 0 8px;
  border-radius: var(--radius);
  color: var(--ink-muted);
  text-decoration: none;
  transition: background-color ${MOTION.quick}ms ${EASE}, color ${MOTION.quick}ms ${EASE};
}
.place:hover { background: var(--hover); color: var(--ink); }
.place:active { background: var(--press); }
.version {
  display: inline-flex;
  flex: none;
  align-items: center;
  gap: 4px;
  height: var(--control);
  margin-left: 8px;
  padding: 0 8px;
  border: 0;
  border-radius: var(--radius);
  background: transparent;
  color: var(--ink-muted);
  font: inherit;
  font-variant-numeric: tabular-nums;
  cursor: pointer;
  transition: background-color ${MOTION.quick}ms ${EASE}, color ${MOTION.quick}ms ${EASE};
}
.version:hover { background: var(--hover); color: var(--ink); }
.version:active { background: var(--press); }
.version-sep { opacity: 0.6; }
/* お気に入りの星。絵のボタン（.step）と同じ寸法・押し心地。付いていれば墨で塗る */
.star {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: var(--control);
  height: var(--control);
  margin-left: 8px;
  padding: 0;
  border: 0;
  border-radius: var(--radius);
  background: transparent;
  color: var(--ink-muted);
  cursor: pointer;
  transition: background-color ${MOTION.quick}ms ${EASE}, color ${MOTION.quick}ms ${EASE};
}
.star:hover { background: var(--hover); color: var(--ink); }
.star:active { background: var(--press); }
.star[aria-pressed="true"] { color: var(--ink); }
.star[aria-pressed="true"] svg { fill: currentColor; }
.star svg { display: block; }
/* 右端の顔。絵のボタンと同じ 32px の面に、24px の丸 */
.self {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: var(--control);
  height: var(--control);
  margin-left: 8px;
  padding: 0;
  border: 0;
  border-radius: var(--radius);
  background: transparent;
  color: var(--ink-muted);
  cursor: pointer;
  transition: background-color ${MOTION.quick}ms ${EASE}, color ${MOTION.quick}ms ${EASE};
}
.self:hover, .self[aria-expanded="true"] { background: var(--hover); color: var(--ink); }
.self:active { background: var(--press); }
.self svg { display: block; }
/* 頭文字の丸。サイドバーの名乗りの行と同じ寸法・同じ地（押した面の濃さ）・同じ字 */
.avatar {
  display: grid;
  place-items: center;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: var(--press);
  color: var(--ink);
  font-size: 12px;
  font-weight: 500;
  line-height: 1;
}
/* 顔から開くメニュー。顔の真下に 4px 空けて、右端を顔の面の右端にそろえる */
.sheet {
  position: absolute;
  top: ${(TITLEBAR_HEIGHT - 32) / 2 + 32 + 4}px;
  right: 12px;
  min-width: 176px;
  padding: 4px;
  border-radius: var(--radius-lg);
  background: var(--ground);
  color: var(--ink);
  box-shadow: var(--shadow);
  font: 400 14px/20px ${WORKSPACE_FONT};
  app-region: no-drag;
}
/* 名乗りの 1 行。行き先と同じ高さ・同じ左端で、押せない（字の太さだけ 1 段上げる） */
.menu-name {
  display: flex;
  align-items: center;
  min-height: var(--control);
  margin: 0;
  padding: 0 8px;
  font-weight: 500;
  white-space: nowrap;
}
.menu { display: flex; flex-direction: column; }
.menu-item {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: var(--control);
  padding: 0 8px;
  border: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--ink);
  font: inherit;
  text-align: left;
  text-decoration: none;
  white-space: nowrap;
  cursor: pointer;
  transition: background-color ${MOTION.quick}ms ${EASE};
}
.menu-item:hover, .menu-item:focus-visible { background: var(--hover); }
.menu-item:focus-visible { outline: none; }
.menu-item svg { display: block; color: var(--ink-muted); }
.menu-item-label { flex: 1; }
/* 場所の列と、個人設定・ログアウトの間。線ではなく余白 1 段（4px の刻み 2 つ） */
.menu-item.is-apart { margin-top: 8px; }
@media (max-width: ${NARROW_VIEWPORT - 1}px) {
  .version-sep, .version-number { display: none; }
}
/* 指で押す画面では、メニューの行を 44px にする（ワークスペースの --ws-control と同じ切り替え。行の 44px は 32px の面に収まらないので、顔と印はそのまま） */
@media (max-width: ${NARROW_VIEWPORT - 1}px), (pointer: coarse) {
  .menu-name, .menu-item { min-height: 44px; }
}
.divider {
  flex: none;
  color: var(--ink-muted);
  opacity: 0.6;
}
.title {
  flex: 0 1 auto;
  min-width: 0;
  padding: 0 8px;
  overflow: hidden;
  text-overflow: ellipsis;
  font-weight: 500;
}

@media (prefers-reduced-motion: reduce) {
  .bar, .step, .place, .star, .version, .mark, .self, .menu-item { transition: none; }
}
@media print {
  :host { display: none !important; }
}
`;
