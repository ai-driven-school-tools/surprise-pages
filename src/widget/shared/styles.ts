import { DECK_EDITOR_STYLES } from "../deck/edit/design-editor-styles";
import { LEGEND_MIN_WIDTH, TOKENS } from "./tokens";

/**
 * ウィジェットの見た目。Shadow DOM の中だけに効くので、ページ側の CSS とは混ざらない。
 *
 * 値は tokens.ts で名前を付けたものだけを参照する（素の数値を書かない）。
 * 階層はまず文字の大小・濃淡と余白で作り、線や面はそれで足りなかったところにだけ 1 本ずつ足す。
 */
export const STYLES = `${TOKENS}
:host {
  position: fixed;
  inset: 0;
  z-index: 2147483000;
  pointer-events: none;
  font-family: 'Noto Sans JP', 'Inter', -apple-system, BlinkMacSystemFont, 'Hiragino Sans', sans-serif;
  font-size: var(--font-base);
  line-height: var(--leading-normal);
  color: var(--text);
  -webkit-font-smoothing: antialiased;
}

*, *::before, *::after { box-sizing: border-box; }
button, textarea { font: inherit; color: inherit; }
button { background: transparent; border: 0; padding: 0; cursor: pointer; }
:focus-visible { outline: var(--rule-thick) solid var(--accent); outline-offset: var(--rule-thick); }
/* この道具の中で文字を選んだときの色。ページ本文側の選択色には手を出さない */
::selection { background: var(--accent-soft); color: var(--text); }
.icon { display: inline-flex; align-items: center; flex: none; }
.icon svg { display: block; }
[hidden] { display: none !important; }

/* 優先度の目印。色を使うのはこの丸だけ（文字は常にニュートラル） */
.dot {
  width: var(--size-dot);
  height: var(--size-dot);
  border-radius: var(--radius-pill);
  flex: none;
  background: var(--signal-want);
  /* 文字の高さの真ん中にそろえる。
     箱の中心どうしを合わせる（align-items: center）だけだと、
     字体によっては文字が丸より下に見える。文字の並びの中に置いて、
     ベースラインと x 高さから決まる「目で見た中心」に合わせる */
  display: inline-block;
  vertical-align: middle;
}
.dot.is-must { background: var(--signal-must); }
.dot.is-better { background: var(--signal-better); }

/* 色の丸と文字の組。1 つの文字の並びとして扱うので、丸が文字にそろう */
.dot-label { white-space: nowrap; }
.dot-label .dot { margin-right: var(--space-1); }

/* ---- 右下の道具箱 ----
   コメント・履歴・共有がばらばらに浮かぶと画面の隅が渋滞するので、1 本にまとめる */
.bar {
  position: absolute;
  /* 端末の丸みやホームバーに掛からないよう、安全な余白のぶん内側へ寄せる */
  right: calc(var(--tools-panel-offset, 0px) + var(--space-5) + env(safe-area-inset-right, 0px));
  bottom: calc(var(--space-5) + env(safe-area-inset-bottom, 0px));
  pointer-events: auto;
  display: flex;
  align-items: center;
  height: var(--size-bar);
  padding: 0 var(--space-2);
  border: var(--rule-thin) solid var(--border);
  border-radius: var(--radius-pill);
  background: var(--surface);
  box-shadow: var(--shadow);
}
.bar-button {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  height: var(--size-control);
  padding: 0 var(--space-2);
  border-radius: var(--radius-pill);
  color: var(--muted);
  transition: background var(--duration) var(--ease), color var(--duration) var(--ease);
}
.bar-button:hover { background: var(--surface-sunken); color: var(--text); }
.bar-button.is-open { color: var(--text); }
/* 名前は出さない（触れたときに出す）。コメントの件数だけ、絵柄の隣に添える。
   大きさは読まない字の段（件数・版の目印と同じ）。色はボタンの開閉に連れて
   動かさない——件数は知らせで、選んでいるかどうかの合図は絵柄が担う */
.bar-count {
  flex: none;
  font-size: var(--font-xs);
  color: var(--muted);
  font-variant-numeric: tabular-nums;
}
.bar-divider {
  width: var(--rule-thin);
  height: var(--space-4);
  margin: 0 var(--space-1);
  background: var(--border);
}
/* 取り込み中・新しい版。件数と同じ読み飛ばしてよい段。押せないボタンにはしない */
.bar-status {
  display: inline-flex;
  align-items: center;
  height: var(--size-control);
  padding: 0 var(--space-2);
  border-radius: var(--radius-pill);
  color: var(--muted);
  font-size: var(--font-sm);
  text-decoration: none;
  white-space: nowrap;
}
a.bar-status:hover,
.bar-status.is-action:hover { color: var(--text); }

/* 原本の更新。上端の知らせには出さない（取り込みボタンは右下で視線が届かない）。
   形はトーストと同じ静かな紙。危険の線も塗りも付けない */
.origin-hint {
  position: absolute;
  pointer-events: auto;
  display: flex;
  align-items: center;
  gap: var(--space-1);
  max-width: min(var(--size-popover), calc(100% - var(--space-5) * 2));
  padding: var(--space-2) var(--space-2) var(--space-2) var(--space-3);
  border: var(--rule-thin) solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface);
  box-shadow: var(--shadow);
  font-size: var(--font-sm);
  color: var(--muted);
}
.origin-hint-open {
  flex: 1;
  min-width: 0;
  text-align: left;
  color: inherit;
  font: inherit;
}
.origin-hint-text {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
/* ---- 画面下の入り口（狭い画面で文章を選んだとき） ----
   選んだ場所の真上は OS の「コピー / 調べる」が陣取るので、下端へ寄せる。
   端末の丸みやホームバーに掛からないよう、安全な余白のぶんだけ持ち上げる */
.selbar {
  position: absolute;
  left: var(--space-3);
  right: var(--space-3);
  bottom: calc(var(--space-3) + env(safe-area-inset-bottom, 0px));
  pointer-events: auto;
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
  border: var(--rule-thin) solid var(--border);
  border-radius: var(--radius-pill);
  background: var(--surface);
  box-shadow: var(--shadow);
  opacity: 0;
  transition: opacity var(--duration) var(--ease);
}
.selbar.is-shown { opacity: 1; }
/* 選んだ文言そのものを 1 行で見せる。引用の見せ方は本文中のものと同じ語彙
   （左に 1 本）。縮むのはここだけで、右のボタン 2 つは幅を保つ */
.selbar-quote {
  flex: 1;
  min-width: 0;
  padding-left: var(--space-2);
  border-left: var(--rule-thick) solid var(--border);
  font-size: var(--font-sm);
  color: var(--muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.selbar-action {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  flex: none;
  height: var(--size-control);
  padding: 0 var(--space-3);
  border-radius: var(--radius-pill);
  font-size: var(--font-base);
  font-weight: var(--weight-bold);
  color: var(--text);
}
.selbar-action:hover { background: var(--surface-sunken); }

/* ---- 狭い画面で書くところ（板の中） ---- */
.sheet-compose {
  padding: var(--space-4);
  border-bottom: var(--rule-thin) solid var(--border-light);
}

/* ---- 書き込みドック ----
   新しいコメントを書く間も、ページは見えたままにする。
   上端の位置は JS が実測で置く（貼り付けただけではキーボードに追従しないため） */
.compose-dock {
  /* 画面の下端に貼り付けたまま、キーボードのぶんだけ持ち上げる。
     上端を実測で置く作りに戻さないこと（打っている最中に測ると位置が崩れる） */
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  pointer-events: auto;
  padding: var(--space-2) var(--space-3) calc(var(--space-3) + env(safe-area-inset-bottom, 0px));
  border-top: var(--rule-thin) solid var(--border);
  border-radius: var(--radius-md) var(--radius-md) 0 0;
  background: var(--surface);
  box-shadow: var(--shadow);
}
/* 中身は板のときの部品をそのまま使う。囲いはドック側が持つ */
.compose-dock .sheet-compose { padding: 0; border-bottom: 0; }

/* 引用の行。やめるボタンを右端に置く（見出しを畳んでも押せる） */
.quote-row { display: flex; align-items: flex-start; gap: var(--space-2); }
.quote-row .pop-quote { flex: 1; min-width: 0; }
.quote-row .icon-button { flex: none; }

/* ---- 詰めた姿（キーボードが出ている間）----
   URL の錠剤も入力補助の帯も OS のもので消せない。
   こちらで畳めるところを畳んで、ページに残る隙間を広げる */
.compose-dock.is-compact {
  padding: var(--space-1) var(--space-3) calc(var(--space-2) + env(safe-area-inset-bottom, 0px));
}
/* 入力欄は 2 行ぶんまで低くする */
.compose-dock.is-compact .composer textarea { min-height: var(--size-input-compact); }
/* 縦の間合いを一段詰める */
.compose-dock.is-compact .composer { gap: var(--space-1); margin-top: var(--space-2); }
.compose-dock.is-compact .peek-grab { margin-bottom: var(--space-2); }
/* ドックの上で始めた指の動きは、全面でこちらが受け取る。
   後ろのページが道連れで動くと、書いている場所を見失う。
   部品ごとに掛けると隙間が素通しになるので、器の全面で受け取る。
   入力欄を縦に動かすぶんは JS が自分で流す（横となぞりはブラウザのまま） */
.compose-dock { touch-action: none; }
.compose-dock textarea { overscroll-behavior: contain; }
/* 払って閉じる・戻すときの滑り。覗き見カードと同じ減速にそろえる */
.compose-dock.is-dropping { transition: transform var(--duration-swipe) var(--ease-swipe); }

/* iOS では、キーボードの上に OS の帯（URL の錠剤・∧∨✓）が浮く。
   高さを測る手立てが無いので、こちらが下端に場所を空けて、
   送信のボタンがその帯に潜り込まないようにする。
   帯が出ない環境では空けない（無駄な隙間を作らないため） */
:host(.is-ios) .compose-dock.is-compact {
  padding-bottom: calc(
    var(--space-2) + var(--size-os-strip) + env(safe-area-inset-bottom, 0px)
  );
}

/* ---- 右のパネル ---- */
.panel {
  position: absolute;
  /* 上端の帯（現在地の行・比べている間の帯）の下から始める（帯の裏へ潜り込ませない） */
  top: calc(var(--top-lane) + var(--compare-bar));
  right: 0;
  bottom: 0;
  /* 幅は開いている人が変えられる。決めているのは JS 側（DEFAULT_WIDTH と保存値） */
  pointer-events: auto;
  display: flex;
  flex-direction: column;
  background: var(--surface);
  border-left: var(--rule-thin) solid var(--border);
  box-shadow: var(--shadow);
  /* 影は本文の側（左）にだけ落とす。上へ漏れると、上端の帯の下に薄い筋が出る */
  clip-path: inset(0 0 0 calc(-1 * var(--space-7)));
}

/* 狭い画面では本文を押しのけず、上に重ねて全幅で出す。
   横に並べると本文が 100px ほどになって読めなくなるため。
   狭い画面向けの指定は、すべてこの :host(.is-narrow) からぶら下げる */
/* 一覧は全画面にしない。上に必ずページが帯として見える高さで止める。
   読んでいた場所が消えると、何について話しているのか分からなくなるため */
:host(.is-narrow) .panel {
  left: 0;
  /* 再生バーは板の下に残す（聞きながら欄を読む） */
  bottom: 0;
  width: 100%;
  border-left: 0;
  border-top: var(--rule-thin) solid var(--border);
  border-radius: var(--radius-md) var(--radius-md) 0 0;
  transition: top var(--duration) var(--ease);
  /* 下から重ねる板は、上に影を落とす */
  clip-path: none;
}
:host(.is-narrow) .panel.is-half { top: 50%; }
/* 上げきったときも、ページの帯が必ず見えるところで止める。
   上端に知らせが出ている間は、その高さぶん下げて帯を譲らない。
   下げすぎて半分より低くなることはない */
:host(.is-narrow) .panel.is-expanded {
  top: min(50%, calc(var(--safe-top) + var(--space-7) + var(--toast-lane) + var(--compare-bar) + var(--top-lane)));
}
/* 指で引いている最中は、指に付いてくるほうが自然なので追従を切る */
:host(.is-narrow) .panel.is-dragging { transition: none; }
/* 覗き見カードから受け取るとき。カードが上へ抜けるのと同じ時間・同じ減速で、
   一覧が下から立ち上がる。順番に起きると「消えてから出る」間ができてしまう */
@keyframes sheet-rise {
  from { transform: translateY(100%); }
  to { transform: translateY(0); }
}
:host(.is-narrow) .panel.is-rising {
  animation: sheet-rise var(--duration-swipe) var(--ease-swipe);
}
:host(.is-narrow) .grip { display: none; }

/* 動きを減らす設定では、道具箱の中の動きも全部止める（DESIGN.md 12 章。長さを 0 にするだけで、終わりの姿は同じ） */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { transition-duration: 0s !important; animation-duration: 0s !important; }
}

/* 一覧のつまみ。覗き見カードのものと同じ見た目 */
.sheet-grab-area { display: none; padding: var(--space-2) 0 0; cursor: grab; touch-action: none; }
:host(.is-narrow) .sheet-grab-area { display: block; padding: var(--space-3) 0 0; }

/* 指で押す的を広げる。マウスのときの詰まり具合は変えない */
:host(.is-narrow) .action { padding: var(--space-2) var(--space-2); }
:host(.is-narrow) .card-actions,
:host(.is-narrow) .peek-actions { gap: var(--space-2); }
:host(.is-narrow) .card-actions .icon-button,
:host(.is-narrow) .peek-actions .icon-button {
  width: var(--size-touch);
  height: var(--size-touch);
}
:host(.is-narrow) .bar-button { height: var(--size-bar); }
/* 指で押す画面では ⋯ の小窓の行も 44px（バーのボタンと同じ刻み） */
:host(.is-narrow) .menu-row { height: var(--size-touch); }

/* 狭い画面では板が画面端まで張り付く。中の字と口を、覗き見カードと同じ距離まで空ける。
   覗き見は外余白 12 + 中余白 12 = 24。板も --space-5（24）にそろえる。
   左右は端末の安全域も足す（ノッチ・横持ち） */
:host(.is-narrow) .panel-head {
  padding-left: calc(var(--space-5) + env(safe-area-inset-left, 0px));
  padding-right: calc(var(--space-5) + env(safe-area-inset-right, 0px));
}
:host(.is-narrow) .access {
  padding: var(--space-4) calc(var(--space-5) + env(safe-area-inset-right, 0px))
    calc(var(--space-5) + env(safe-area-inset-bottom, 0px))
    calc(var(--space-5) + env(safe-area-inset-left, 0px));
}
:host(.is-narrow) .access-warning { margin-bottom: var(--space-4); }
:host(.is-narrow) .access-row { gap: var(--space-3); padding: var(--space-2) 0; }

/* 幅を変えるつまみ。掴めることが分かればよいので、触れたときだけ見せる */
.grip {
  position: absolute;
  left: calc(var(--size-grip) / -2);
  top: 0;
  bottom: 0;
  width: var(--size-grip);
  cursor: col-resize;
  touch-action: none;
}
.grip:hover { background: var(--accent-soft); }

.panel-head {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  padding: var(--space-4) var(--space-4) var(--space-2);
}
.panel-title {
  margin: 0;
  font-size: var(--font-lg);
  font-weight: var(--weight-bold);
  line-height: var(--leading-tight);
}
.spacer { flex: 1; }
.head-tools { display: inline-flex; align-items: center; }

.icon-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: var(--size-control);
  height: var(--size-control);
  border-radius: var(--radius-sm);
  color: var(--muted);
  transition: background var(--duration) var(--ease), color var(--duration) var(--ease);
}
.icon-button:hover { background: var(--surface-sunken); color: var(--text); }
.icon-button.is-active { color: var(--text); }
.icon-button.is-danger:hover { color: var(--danger); }
/* 選んだ文への脇の操作（コピー・ここから読み上げ）。主役のコメントより 1 段引く */
.icon-button.selection-aside { color: color-mix(in srgb, var(--muted) 50%, transparent); }
.icon-button.selection-aside:hover,
.icon-button.selection-aside:focus-visible { color: var(--muted); }

/* 絞り込みと並べ替え。既定では畳んでおき、口を開いたときだけ出す。
   常時のタブにしないのは、いつも使うわけではない操作を一覧の上に置かないため。
   囲みも下線も足さない。段は見出しの太さと余白だけで作る */
.list-menu {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-4);
  align-items: start;
  padding: 0 var(--space-4) var(--space-3);
}
.list-menu-label {
  margin: 0 0 var(--space-1);
  font-size: var(--font-md);
  font-weight: var(--weight-bold);
  color: var(--muted);
}
.list-summary {
  display: block;
  width: 100%;
  padding: 0 var(--space-4) var(--space-3);
  text-align: left;
  font-size: var(--font-sm);
  color: var(--muted);
  transition: color var(--duration) var(--ease);
}
.list-summary:hover { color: var(--text); }
/* 一覧の末尾に置く、いま外している側への 1 行（解決済 N 件を見る）。
   頭の要約とまったく同じ静かな見え方にする——どちらも「いまの見え方」を語る
   1 行で、役割が同じものに 2 通りの姿を作らない。
   違うのは上の余白だけ。直前にカードが並んでいるので、行と行の間隔
   （カードの区切り線）より広く離して、一覧の外側だと分かるようにする。
   区切り線は引かない（線は最後の手段。余白で足りている） */
.list-summary.is-tail { padding-top: var(--space-4); padding-bottom: var(--space-5); }
.pick-count {
  margin-left: auto;
  font-size: var(--font-xs);
  color: var(--muted);
  font-weight: var(--weight-normal);
}

.list { flex: 1; overflow-y: auto; }

.empty { padding: var(--space-7) var(--space-4); text-align: center; color: var(--muted); }
.empty-title {
  font-size: var(--font-md);
  font-weight: var(--weight-bold);
  color: var(--text);
  margin-bottom: var(--space-1);
}
.empty-hint { font-size: var(--font-sm); }

/* ---- 1 件分 ---- */
.card {
  padding: var(--space-4);
  cursor: pointer;
  transition: background var(--duration) var(--ease);
}
.card + .card { border-top: var(--rule-thin) solid var(--border-light); }
.card:hover { background: var(--surface-sunken); }
.card.is-active { background: var(--surface-sunken); box-shadow: inset var(--rule-thick) 0 0 var(--accent); }
.card.is-flash { background: var(--accent-soft); }
.card.is-resolved .quote,
.card.is-resolved .body,
.card.is-resolved .outcome-label,
.card.is-resolved .story-link,
.card.is-resolved .note { opacity: .6; }

/* 片付いたものは 1 行に畳む。押すと開く */
.card.is-collapsed { padding: var(--space-2) var(--space-4); }
.collapsed-row { display: flex; align-items: center; gap: var(--space-2); min-width: 0; }
.collapsed-text {
  flex: 1;
  min-width: 0;
  font-size: var(--font-sm);
  color: var(--muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-decoration: line-through;
}
.collapsed-who { flex: none; font-size: var(--font-sm); color: var(--muted); }

/* ---- まとめて選ぶ ----
   四角の印そのものは送信欄のスイッチと同じ部品（.check-input + .check-mark）。
   ここが持つのは置き場所だけで、押す的はカード全体なので的の広げ直しもしない。 */
.pick-box { flex: none; display: inline-flex; align-items: center; }
/* 選んでいるカード。**面の濃さだけで示す**（枠も左の線も色も足さない）。
   いま見ている 1 件の強調（.is-active）と同じ面を使い回すが、選んでいる間は
   あちらを出さないので、画面に「濃い面」の意味は 1 つしかない。 */
.card.is-picked { background: var(--surface-sunken); }
/* 選んでいる間の畳んだ行。中身を読むために開く操作は止まっているので、
   1 行のままでも文字を消し込まない（何を選んだのかは読めなければ選べない） */
.card.is-pick.is-collapsed .collapsed-text { text-decoration: none; }

/* 板の足。動かす向きと件数、やめる道、全部の入り切りだけを置く。
   画面の下端ではなく板の中にあるので、狭い画面で板が下から出てくる動きに付いてくる。
   上端の 1 本は、下端に貼り付いた操作と流れている一覧の境目
   （余白だけでは、指で送っている最中にどこまでが一覧か分からない） */
.pick-bar {
  display: flex;
  align-items: center;
  /* 板は 300px まで細くできる。件数が 3 桁になると 1 行に収まらないので、
     字を縮めたり切ったりせず、入らなかったものを次の段へ落とす
     （どれも押す口なので、読めなくなるほうが困る） */
  flex-wrap: wrap;
  gap: var(--space-2);
  padding: var(--space-3) var(--space-4);
  border-top: var(--rule-thin) solid var(--border-light);
  background: var(--surface);
}
/* 「すべて選ぶ / すべて外す」。主役ではないので静かな 1 行の語彙を借りる。
   幅いっぱいの指定だけ外して、右のボタンを端へ押し出す役をさせる */
.list-summary.is-pick-all {
  flex: 1;
  width: auto;
  padding: 0;
}

.card-head { display: flex; align-items: center; gap: var(--space-2); margin-bottom: var(--space-2); }
.avatar {
  width: var(--size-avatar);
  height: var(--size-avatar);
  border-radius: var(--radius-pill);
  flex: none;
  object-fit: cover;
}
/* 写真の無い人の顔。名前の頭 1 文字をその場で描く */
.avatar-face { fill: var(--avatar-0); }
.avatar-face.is-tint-1 { fill: var(--avatar-1); }
.avatar-face.is-tint-2 { fill: var(--avatar-2); }
.avatar-face.is-tint-3 { fill: var(--avatar-3); }
.avatar-initial {
  fill: var(--muted);
  font-size: var(--font-xs);
  font-weight: var(--weight-bold);
  font-family: inherit;
}
.who-name { font-size: var(--font-base); font-weight: var(--weight-bold); line-height: var(--leading-tight); }
.who-time { font-size: var(--font-sm); color: var(--muted); line-height: var(--leading-tight); }

/* 優先度・状態の表示。丸 1 つ + 文字だけ。塗りも囲みも付けない */
.tag {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  flex: none;
  font-size: var(--font-sm);
  color: var(--muted);
}

/* 引用。本文からの引き写しであることを示すため、左に 1 本だけ引く */
.quote {
  margin: 0 0 var(--space-2);
  padding-left: var(--space-2);
  border-left: var(--rule-thick) solid var(--border);
  color: var(--muted);
  font-size: var(--font-sm);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.body { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; }
.body.is-quiet { color: var(--muted); }
/* 読み飛ばしてよい 1 行（節の説明・空のときの案内・終わったことの報告・行の 2 行目）。
   本文（--font-base）より 1 段下げるだけに留める。2 段下げると、読ませたい案内文が
   時刻や件数と同じ「極小の添え物」に見えて、読まれないまま素通りされる */
.note { margin: var(--space-1) 0 0; font-size: var(--font-sm); color: var(--muted); }

/* 当時 → コメント → いま。札は読み飛ばしてよい大きさ。
   引用の左線は既存の .quote を使う（同じ「本文からの引き写し」に別の形を当てない）。
   中身は読ませる文なので、札と同じ灰色には落とさない */
.outcome-label {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--space-1) var(--space-2);
  margin: var(--space-3) 0 var(--space-1);
  font-size: var(--font-sm);
  color: var(--muted);
}
.outcome-beat {
  flex: none;
  font-weight: var(--weight-medium);
}
.outcome-meta {
  flex: 1;
  min-width: 0;
  text-align: right;
}
.card-head + .outcome-label,
.peek-body > .outcome-label:first-child { margin-top: 0; }
.body + .outcome-label,
.peek-text + .outcome-label { margin-top: var(--space-3); }
.quote.is-story,
.pop-quote.is-story,
.related-quote.is-story {
  color: var(--text);
  font-size: var(--font-base);
  margin-bottom: 0;
}
.note.is-story {
  margin-top: 0;
  font-size: var(--font-base);
  color: var(--text);
}

.story-link {
  display: inline-block;
  margin: var(--space-2) 0 0;
  padding: 0;
  color: var(--muted);
  font-size: var(--font-sm);
  text-align: left;
  text-decoration: none;
  transition: color var(--duration) var(--ease);
}
.story-link:hover { color: var(--text); }
.story-link[disabled] { opacity: .45; cursor: default; }
.story-link[disabled]:hover { color: var(--muted); }

/* 直した直後の 1 行。囲みも帯も足さない。余白と字だけで、一覧の上に載せる */
.story-banner { padding: var(--space-3) var(--space-4) var(--space-4); }
.story-banner-text { margin: 0; font-size: var(--font-base); }
.story-banner-actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3);
  margin-top: var(--space-2);
}
.story-banner .story-link { margin-top: 0; }

.card-actions,
.peek-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  align-items: center;
  gap: var(--space-1);
}
.card-actions { margin-top: var(--space-2); }
.peek-actions { margin-top: var(--space-2); }
.card-actions .hint,
.peek-actions .hint { margin-right: auto; }
.action {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  padding: var(--space-1) var(--space-2);
  border-radius: var(--radius-sm);
  color: var(--muted);
  font-size: var(--font-sm);
  transition: background var(--duration) var(--ease), color var(--duration) var(--ease);
}
.action:hover { background: var(--surface-sunken); color: var(--text); }
.action.is-danger:hover { color: var(--danger); }
.action.is-strong { color: var(--text); }
/* 押せないものを押せる見た目のままにしない（選び分けと同じ決まり）。
   触っても色が動かないので、押して初めて効かないと気づくことがなくなる */
.action[disabled] { opacity: .45; cursor: default; }
.action[disabled]:hover { background: none; color: var(--muted); }

/* 返信。1 段だけ字下げして、親との関係を余白で示す */
.replies {
  margin: var(--space-3) 0 0;
  padding-left: var(--space-3);
  border-left: var(--rule-thin) solid var(--border-light);
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

/* ---- 書くところ ---- */
.composer { display: flex; flex-direction: column; gap: var(--space-2); margin-top: var(--space-3); }
.composer textarea {
  width: 100%;
  min-height: var(--size-input-min);
  resize: vertical;
  padding: var(--space-2);
  border: var(--rule-thin) solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface);
  font-size: var(--font-base);
  line-height: var(--leading-normal);
  outline: none;
}
.composer textarea:focus { border-color: var(--accent); }

.picker { display: flex; gap: var(--space-1); }
/* 値を選び分ける口（見せ方の 3 択・強さの 3 択）。
   本文と同じ大きさにする。板の主役の操作なのに、下に並ぶ行の名前より小さいと、
   目がまず行の並びへ行ってしまう（強さは 大きさ → 太さ → 濃さ の順に効く） */
.pill {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  padding: var(--space-1) var(--space-2);
  border-radius: var(--radius-sm);
  color: var(--muted);
  font-size: var(--font-base);
  transition: background var(--duration) var(--ease), color var(--duration) var(--ease);
}
/* 指で押したあと hover が残る端末があるので、hover が効く環境にだけ出す。
   選ばれている印と同じ見え方になると、2 つ選ばれているように見えてしまう */
@media (hover: hover) {
  .pill:hover { background: var(--surface-sunken); color: var(--text); }
}
.pill.is-active { background: var(--surface-sunken); color: var(--text); font-weight: var(--weight-bold); }
/* 押せないものを、押せる見た目のままにしない。
   触っても色が動かないので、指で押して初めて「効かない」と気づくことがなくなる。
   ただし**いま選ばれているもの**は薄くしない——あれは操作の口ではなく現在地の印で、
   薄くすると「どこに居るか」が読めなくなる（押せないのは、押す必要が無いから） */
.pill[disabled] { opacity: .45; cursor: default; }
.pill[disabled]:hover { background: none; color: var(--muted); }
.pill.is-active[disabled] { opacity: 1; }
.pill.is-active[disabled]:hover { background: var(--surface-sunken); color: var(--text); }

/* ---- 強さごとの送信ボタン ----
   3 つとも同じ部品。押した強さでそのまま送るので、「選ばれている」状態は持たない。
   いいねは右端の手の絵。折り返すとジャンルの違いが縦の段に化けて、別の話に見える */
.send-row { display: flex; gap: var(--space-2); flex-wrap: nowrap; align-items: center; }
.send-fixes { display: flex; gap: var(--space-2); align-items: center; }
.send-pill {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  padding: var(--space-2) var(--space-3);
  border: var(--rule-thin) solid var(--border);
  border-radius: var(--radius-pill);
  font-size: var(--font-base);
  font-weight: var(--weight-bold);
  color: var(--text);
  position: relative;
  transition: background var(--duration) var(--ease), border-color var(--duration) var(--ease);
}
@media (hover: hover) {
  .send-pill:hover:not([disabled]) { background: var(--surface-sunken); border-color: var(--accent); }
}
.send-pill[disabled] { opacity: .45; cursor: default; }
.send-row > .icon-button { margin-left: auto; position: relative; flex: none; }

/* 送信の行は下に貼り付ける。長く書いてもキーボードの上に押し出されない */
.composer-foot {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  position: sticky;
  bottom: 0;
  background: var(--surface);
  padding-top: var(--space-2);
}
.hint { flex: 1; font-size: var(--font-sm); color: var(--muted); }
.button {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-sm);
  font-size: var(--font-base);
  color: var(--muted);
  /* 押せる 1 行は、その場で何かする場合も別の画面へ行く場合も同じ語彙にする。
     行き先のときだけ下線が付かないよう、ここで落としておく
     （押せることは濃さと hover の変化で示す。下線は赤入れの記号に予約されている） */
  text-decoration: none;
  transition: background var(--duration) var(--ease), color var(--duration) var(--ease);
}
.button:hover { background: var(--surface-sunken); color: var(--text); }
.button.is-primary {
  background: var(--accent);
  color: #ffffff;
  font-weight: var(--weight-bold);
}
.button.is-primary:hover { background: var(--accent); opacity: .88; color: #ffffff; }
.button[disabled], .pick-row[disabled] { opacity: .5; cursor: default; }

/* ---- チェックの付く 1 行 ----
   この製品で最初のチェックボックス。役割は「送る前に決める入り切り」で、
   ほかで同じものが要るときは、新しく作らずにここを使う（部品は役割ごとに 1 つ）。

   差を作るのは四角の塗りと、文字の濃さ・太さだけ。色も囲みも足さない。
   文言は入り切りで変わらない——状態は四角が持つので、名前は動かなくてよい。 */
.check-row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  /* 見た目は文字 1 行でも、指の的はここまで広げる（余白で広げ、面は敷かない） */
  min-height: var(--size-touch);
  /* 左端は送信ボタンの丸い枠とそろえる（あちらは 0 から始まる）。
     ここに余白を入れると、四角だけが右へずれて縦の線が 2 本に見える */
  padding: 0;
  cursor: pointer;
  user-select: none;
}
/* 本物のチェックボックス。見えないが、そこに在る——空白キーも読み上げもこれが受ける
   （display: none にすると的から外れて、どちらも効かなくなる） */
.check-input {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
  pointer-events: none;
}
.check-mark {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: var(--size-check);
  height: var(--size-check);
  border: var(--rule-thin) solid var(--border);
  border-radius: var(--radius-sm);
  /* 入っていないときはチェックを消す。場所は空けたままにして、
     入れた瞬間に四角が動かないようにする */
  color: transparent;
  transition: background var(--duration) var(--ease), border-color var(--duration) var(--ease),
    color var(--duration) var(--ease);
}
.check-input:checked + .check-mark {
  /* 塗るのは灰（--muted）。新しい色は持ち込まず、黒地では自動で反転する。
     文字色（ほぼ黒）で塗ると、小窓の中でいちばん濃い塊になってしまい、
     主役であるはずの送信ボタンより先に目が行く */
  background: var(--muted);
  border-color: var(--muted);
  color: var(--surface);
}
/* 1 つだけ選ぶときの印（丸）。複数入り切りの四角とは形で分ける——
   丸は「どれか 1 つ」、四角は「いくつでも」という、画面の外から持ってきた約束。
   中の点は選ばれたときだけ出す（場所は空けたままなので、印が動かない） */
.radio-mark {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: var(--size-check);
  height: var(--size-check);
  border: var(--rule-thin) solid var(--border);
  border-radius: 50%;
  transition: border-color var(--duration) var(--ease);
}
.radio-mark::after {
  content: "";
  width: var(--size-radio-dot);
  height: var(--size-radio-dot);
  border-radius: 50%;
  background: transparent;
  transition: background var(--duration) var(--ease);
}
.check-input:checked + .radio-mark { border-color: var(--muted); }
.check-input:checked + .radio-mark::after { background: var(--muted); }
@media (hover: hover) {
  .check-row:hover .radio-mark { border-color: var(--accent); }
}
.check-input:focus-visible + .radio-mark {
  border-color: var(--accent);
  box-shadow: 0 0 0 var(--rule-thick) var(--accent-soft);
}

/* 選んだものに属する設定。**親子は字下げだけで示す**——縦線も囲みも帯も引かない。
   左端をずらす幅は、印と名札の間隔とそろえる（印の右側から始まって見える） */
.scope-child {
  padding-left: calc(var(--size-check) + var(--space-2));
  margin: var(--space-2) 0 var(--space-5);
}
/* 説明の 1 行と、その下の最初の節を離す。
   説明は選択肢に付く文で、節はそこから始まる別のかたまり——詰まっていると、
   説明の続きに見出しが生えているように読める */
.scope-child > .note + .access-part { margin-top: var(--space-5); }

.check-label {
  font-size: var(--font-base);
  color: var(--muted);
  transition: color var(--duration) var(--ease);
}
/* 入り切りの差は濃さだけ。太さは変えない——四角がもう state を言っているので、
   文字まで太らせると同じことを二重に言うことになる */
.check-input:checked ~ .check-label { color: var(--text); }
@media (hover: hover) {
  .check-row:hover .check-mark { border-color: var(--accent); }
  .check-row:hover .check-label { color: var(--text); }
}
/* キーボードで辿ってきた人にも居場所を示す（見えない箱の代わりに四角が光る） */
.check-input:focus-visible + .check-mark {
  border-color: var(--accent);
  box-shadow: 0 0 0 var(--rule-thick) var(--accent-soft);
}

/* ---- 近道の案内（触れている間だけ出る吹き出し）---- */
.hint-bubble {
  position: absolute;
  right: 0;
  /* 絵記号の上に出す。下だと、小窓の外へはみ出して切れる */
  bottom: calc(100% + var(--space-1));
  width: max-content;
  max-width: var(--size-bubble-max);
  padding: var(--space-1) var(--space-2);
  border-radius: var(--radius-sm);
  background: var(--text);
  color: var(--surface);
  font-size: var(--font-xs);
  line-height: var(--leading-tight);
  opacity: 0;
  pointer-events: none;
  transition: opacity var(--duration) var(--ease);
}
.send-fixes .hint-bubble { left: 0; right: auto; }
@media (hover: hover) {
  .send-pill:hover:not([disabled]) .hint-bubble,
  .send-row > .icon-button:hover .hint-bubble { opacity: 1; }
}

/* ---- 文章を選んだときに出る小窓 ---- */
.popover {
  position: absolute;
  pointer-events: auto;
  width: var(--size-popover);
  max-width: calc(100vw - var(--space-5));
  padding: var(--space-3);
  border: var(--rule-thin) solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface);
  box-shadow: var(--shadow);
}
.popover.is-compact { width: auto; padding: var(--space-1); display: flex; gap: var(--space-1); }
/* 道具箱の「その他」（バーの右端の ⋯）。幅は「詰めた姿」のものをそのまま借り、並べ方だけ縦に組み替える。
   狭い小窓を新しく作らない（同じ役割の指定を 2 つに割らない）。
   段（このページの道具 / 読み方）の間は行と行の間より 1 段広く空けるだけで、見出しも線も置かない
   （行が 3〜5 本しか無いのに見出しを立てると、見出しのほうが行より強く見える） */
.popover.is-menu { flex-direction: column; align-items: stretch; gap: var(--space-2); }
.menu-group { display: flex; flex-direction: column; }
/* 行は押せる 1 行の語彙（.button）のまま、絵柄と名前を横に並べて左にそろえる。
   高さは道具箱のほかの部品と同じ 32px（字の行送りに任せると 36.8px になり、4px の刻みから外れる） */
.menu-row {
  display: flex;
  width: 100%;
  height: var(--size-control);
  padding-top: 0;
  padding-bottom: 0;
  gap: var(--space-2);
  text-align: left;
}
.menu-row-label { white-space: nowrap; }
.pop-quote {
  margin: 0 0 var(--space-2);
  padding-left: var(--space-2);
  border-left: var(--rule-thick) solid var(--border);
  font-size: var(--font-sm);
  color: var(--muted);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  transition: background var(--duration) var(--ease);
}
/* 付け先が別の文に移ったとき。動いたことが分かればよいので、ひと呼吸だけ */
.pop-quote.is-swapped { background: var(--accent-soft); }
/* 物語の引用は切らない。当時といまを 2 行に畳むと、直しの中身が読めなくなる */
.pop-quote.is-story {
  display: block;
  -webkit-line-clamp: unset;
  overflow: visible;
  white-space: pre-wrap;
}

/* ---- 覗き見カード（狭い画面で印を押したとき）----
   板を丸ごと開かずに、その 1 件だけを下からそっと見せる。
   外側は「置き場所を決めるだけ」の透明な層。面も影も角丸も持たない。
   1 枚 1 枚が自分の面・角丸・影・余白・つまみを持ち、枠ごと横に滑る。
   外側を画面いっぱいに取ってあるので、隣のカードは静止時には画面の外にいる。

   透明な層は指も受け取らない（pointer-events: none）。
   受け取ると、カードの周りの「何も見えていないところ」が押せる帯になり、
   外を押しても閉じない・後ろのページのリンクも押せない、という状態になる */
.popover.is-peek {
  pointer-events: none;
  left: 0;
  right: 0;
  top: auto;
  width: auto;
  max-width: none;
  bottom: calc(var(--space-3) + env(safe-area-inset-bottom, 0px));
  padding: 0;
  border: 0;
  border-radius: 0;
  background: none;
  box-shadow: none;
  overflow: hidden;
}
/* 指を離したあとだけ動きを付ける。掴んでいる間は 1 対 1 で付いてくる */
.popover.is-peek.is-dropping { transition: transform var(--duration-swipe) var(--ease-swipe); }
/* 一覧へ渡すとき。カードが上へ抜けるのと入れ替わりに一覧が立ち上がるので、
   すれ違うあいだだけ薄くする（2 枚が重なって見えないように） */
.popover.is-peek.is-handoff {
  opacity: 0;
  transition:
    transform var(--duration-swipe) var(--ease-swipe),
    opacity var(--duration-swipe) var(--ease-swipe);
}

/* 下へ払うと閉じられることを示すつまみ。カードの中に入っている */
.peek-grab {
  width: var(--space-6);
  height: var(--space-1);
  margin: 0 auto var(--space-3);
  border-radius: var(--radius-pill);
  background: var(--border);
}

/* 前・いま・次 を横に並べる。1 枠が画面の幅ぶん。
   下端でそろえる。上端でそろえると、隣に背の高いカードが来たときに
   いま見ているカードが浮き上がり、送るたびに下端の位置が変わってしまう */
.peek-track {
  display: flex;
  align-items: flex-end;
  width: 300%;
}
.peek-track.is-sliding { transition: transform var(--duration-swipe) var(--ease-swipe); }
.peek-slot { width: calc(100% / 3); flex: none; }

/* ここが 1 枚のカード。旧来の小窓の見た目をそのまま持つ。
   左右の余白がそのままカードどうしの間隔になる */
.peek-slide {
  /* 指を受け取るのはカードだけ（外側の透明な層は通り抜け） */
  pointer-events: auto;
  /* 指の動きはカード全面でこちらが受け取る。部品ごとに掛けると、
     部品の隙間と器の余白が素通しになり、そこから後ろのページが動く。
     中の本文を縦に動かすぶんは JS が自分で流すので、これで困らない */
  touch-action: none;
  margin: 0 var(--space-3);
  padding: var(--space-3);
  border: var(--rule-thin) solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface);
  box-shadow: var(--shadow);
}

/* 長い本文は、中で縦にスクロールできるようにする。
   ただし指で動かすぶんは JS が自分で流す（下の attachInnerScroll）。
   ブラウザに任せる書き方（部品ごとに touch-action を切り替える）だと、
   部品の隙間や器の余白が素通しになって後ろのページが動く。
   カード側は下で全面を受け取り、穴を作らない */
.peek-body {
  max-height: var(--size-scroll-max);
  overflow-y: auto;
  overscroll-behavior: contain;
}
/* 覗き見では行数を切らない。切ると中でスクロールする余地が無くなり、
   長いコメントの続きがどこからも読めなくなる（切るのは一覧のカードだけ） */
.peek-text {
  margin: 0;
  overflow-wrap: anywhere;
}
.peek-foot { display: flex; align-items: center; gap: var(--space-2); margin-top: var(--space-3); }
/* 上へ払えば同じことができる。気づかない人のための控えめな道なので、
   囲みも面も持たせず、文字と余白だけで示す（押せる広さは確保する）。
   下線も引かない——この板では下線は赤入れ（足した文）の記号で、リンクの飾りではない */
.peek-more {
  flex: none;
  display: inline-flex;
  align-items: center;
  /* 見た目は文字だけのまま、押せる高さは指の的の大きさまで余白で広げる */
  min-height: var(--size-touch);
  padding: var(--space-2);
  font-size: var(--font-sm);
  color: var(--muted);
  transition: color var(--duration) var(--ease);
}
.peek-more:hover { color: var(--text); }
/* 自分が書いたものだけ出る行。一覧のカードと同じ .card-actions / .peek-actions を使う */

/* ---- 版の一覧 ----
   主役は「誰が・いつ・どれだけ直したか」。コミットの説明文は出さない
   （機械語の書き分けが並ぶと、読む人の用事がそこに埋もれる）。
   sha は消さないが、いちばん小さく薄く、右の端に置く */
.version {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 0 var(--space-2);
  width: 100%;
  padding: var(--space-3) var(--space-4);
  text-align: left;
  transition: background var(--duration) var(--ease);
}
.version + .version { border-top: var(--rule-thin) solid var(--border-light); }
.version:hover { background: var(--surface-sunken); }
/* 開いている版は「選んでいる」なので、指を乗せた地より 1 段濃い（文字起こしの鳴っている発言と同じ） */
.version.is-current { background: var(--surface-pressed); }
/* 最初の版は比べる相手がいない。押せないことを濃さで示す */
.version[disabled] { cursor: default; }
.version[disabled]:hover { background: none; }
.version-who {
  font-size: var(--font-base);
  font-weight: var(--weight-medium);
  color: var(--text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.version-when { font-size: var(--font-sm); color: var(--muted); text-align: right; }
.version-count { font-size: var(--font-sm); color: var(--muted); }
.version-sha {
  font-size: var(--font-xs);
  color: var(--muted);
  font-family: ui-monospace, monospace;
  text-align: right;
}
.version-number {
  font-size: var(--font-sm);
  color: var(--muted);
  font-variant-numeric: tabular-nums;
  text-align: right;
}
.version .note { grid-column: 1 / -1; }

/* ---- 比べている間の帯（画面の上端）----
   いま何と何を見比べているか・何件あるか・いまどこにいるか、だけを置く。
   囲みも影も足さない。地色と下の細い線 1 本で本文と分ける。
   狭い画面では 2 段になる（高さは同じ寸法の 2 つぶんで、新しい値は作らない） */
.compare {
  position: absolute;
  top: var(--top-lane);
  left: 0;
  right: 0;
  pointer-events: auto;
  display: grid;
  grid-template-columns: 1fr auto auto auto auto;
  grid-template-areas: "pair legend count nav end";
  grid-auto-rows: var(--size-bar);
  align-items: center;
  gap: 0 var(--space-4);
  padding: 0 var(--space-4);
  background: var(--surface);
  border-bottom: var(--rule-thin) solid var(--border);
}
:host(.is-narrow) .compare {
  grid-template-columns: 1fr auto;
  grid-template-areas:
    "pair end"
    "count nav";
  gap: 0 var(--space-3);
  padding: 0 var(--space-3);
}
.compare-pair {
  grid-area: pair;
  display: flex;
  align-items: baseline;
  gap: var(--space-2);
  min-width: 0;
}
/* 幅が足りないとき、先に削るのは日付。誰の版かは残す
   （「8月7日 さ…」では用を成さないが、「8月… さとう」なら分かる） */
.compare-version {
  display: flex;
  flex: 0 1 auto;
  min-width: 0;
  overflow: hidden;
  font-size: var(--font-base);
  font-weight: var(--weight-medium);
  color: var(--text);
  transition: color var(--duration) var(--ease);
}
.compare-label {
  display: flex;
  align-items: baseline;
  gap: var(--space-1);
  min-width: 0;
}
.compare-when {
  min-width: 0;
  flex: 0 1 auto;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.compare-who { flex: none; white-space: nowrap; }
/* 押せる印は色の変化だけ。下線は引かない——この板では下線は赤入れ（足した文）の
   記号なので、リンクの飾りに使うと帯と本文で同じ形が別の意味を持つ */
.compare-version:hover { color: var(--accent); }
.compare-version[disabled] { cursor: default; }
.compare-version[disabled]:hover { color: var(--text); }
.compare-arrow { flex: none; font-size: var(--font-sm); color: var(--muted); }
.compare-count {
  grid-area: count;
  font-size: var(--font-sm);
  color: var(--muted);
  text-align: left;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.compare-count:hover { color: var(--text); }
.compare-count[disabled] { cursor: default; }
.compare-count[disabled]:hover { color: var(--muted); }
/* 凡例。説明の文は置かず、形そのものを見せる。
   場所が足りなくなったら**いちばん先に譲る**（人名 > 件数 > 凡例）。
   狭い画面では 2 段の帯にも入れない（読み方より、何と何を比べているかが先） */
.compare-legend {
  grid-area: legend;
  display: flex;
  align-items: baseline;
  gap: var(--space-3);
  font-size: var(--font-sm);
  color: var(--muted);
  white-space: nowrap;
}
@media (max-width: ${LEGEND_MIN_WIDTH}px) {
  .compare-legend { display: none; }
}
:host(.is-narrow) .compare-legend { display: none; }

.compare-nav { grid-area: nav; display: flex; align-items: center; gap: var(--space-1); }
/* 数が入れ替わっても幅が動かないよう、桁を等幅で置く */
.compare-position {
  font-size: var(--font-sm);
  color: var(--muted);
  font-variant-numeric: tabular-nums;
}
.compare-end {
  grid-area: end;
  padding: var(--space-1) var(--space-2);
  font-size: var(--font-base);
  color: var(--text);
  transition: color var(--duration) var(--ease);
}
.compare-end:hover { color: var(--accent); }

/* ---- 変更の一覧 ----
   本文の写しは並べない（読む場所が 2 つに割れる）。1 行 1 か所で、
   本文のどこへ飛べるかだけを示す。形は本文の赤入れと同じ語彙にそろえる */
/* 見出しはその版の一言。誰がいつ直したかを 1 行添える
   （書き手と日時の見せ方は、コメントのカードと同じ部品を使う） */
.change-head {
  padding: var(--space-3) var(--space-4);
  border-bottom: var(--rule-thin) solid var(--border-light);
}
.change {
  display: flex;
  align-items: baseline;
  gap: var(--space-2);
  width: 100%;
  padding: var(--space-3) var(--space-4);
  text-align: left;
  transition: background var(--duration) var(--ease);
}
.change + .change { border-top: var(--rule-thin) solid var(--border-light); }
.change:hover { background: var(--surface-sunken); }
.change.is-active { background: var(--surface-sunken); box-shadow: inset var(--rule-thick) 0 0 var(--accent); }
/* 本文に置けなかったもの。飛び先が無いので押せない */
.change[disabled] { cursor: default; }
.change[disabled]:hover { background: none; }
.change-number {
  flex: none;
  font-size: var(--font-xs);
  color: var(--muted);
  font-variant-numeric: tabular-nums;
}
.change-kind { flex: none; font-size: var(--font-sm); color: var(--muted); }
.change-main { flex: 1; min-width: 0; }
.change-text {
  font-size: var(--font-base);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
/* 赤入れの語彙。下線＝足した / 取り消し線＝消した。
   本文の印・一覧の行・帯の凡例で、同じ形を使う（同じ意味に別の形を当てない）。
   薄い地色を敷くのは板の中だけ。本文の上では敷かない
   （敷くとコメントの引用＝蛍光ペンと見分けが付かなくなる。板の中は本文ではないので混ざらない） */
.change-text.is-add, .legend-add {
  text-decoration-line: underline;
  text-decoration-thickness: var(--rule-thick);
  text-underline-offset: var(--rule-thick);
  text-decoration-color: var(--diff-add);
}
.change-text.is-del, .legend-del {
  text-decoration-line: line-through;
  text-decoration-thickness: var(--rule-thick);
  text-decoration-color: var(--diff-del);
}
.change-text.is-add { background: var(--diff-add-soft); }
.change-text.is-del { background: var(--diff-del-soft); }

/* その版のときに付いていたコメント。変更の行の下に、同じ一覧の続きとして置く */
.related-head {
  margin: var(--space-5) 0 0;
  padding: var(--space-3) var(--space-4) var(--space-2);
  font-size: var(--font-md);
  font-weight: var(--weight-bold);
}
.related {
  display: block;
  width: 100%;
  padding: var(--space-3) var(--space-4);
  text-align: left;
  border-top: var(--rule-thin) solid var(--border-light);
  transition: background var(--duration) var(--ease);
}
.related:hover { background: var(--surface-sunken); }
.related[disabled] { cursor: default; }
.related[disabled]:hover { background: none; }
.related-quote {
  margin: 0 0 var(--space-1);
  padding-left: var(--space-2);
  border-left: var(--rule-thick) solid var(--border);
  font-size: var(--font-sm);
  color: var(--muted);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.related-body { margin: 0; font-size: var(--font-base); white-space: pre-wrap; overflow-wrap: anywhere; }
.related > .outcome-label:first-child { margin-top: 0; }

/* ---- 板の中身の余白と入力欄 ----
   板の中身は 1 枚で入れ替わる。余白・入力欄は、どの中身でも同じものを使う */
.access { padding: var(--space-4); }
/* 入力欄の枠は、置いてあるときは弱く、触っているときだけ主張する。
   板の主役は上にある選び分けや一覧で、入力欄は「ここに打てる」と分かれば足りる。
   常時 --border だと、横幅いっぱいの枠が板の中でいちばん強い塊になる */
.access-add input {
  width: 100%;
  /* 縦は詰めて、横は空ける（画面側の打ち込み口 src/app/_components の FIELD と同じ縦横比）。
     一律に空けると、横幅いっぱいの枠が板の中でいちばん背の高い塊になる */
  padding: var(--space-1) var(--space-2);
  border: var(--rule-thin) solid var(--border-light);
  border-radius: var(--radius-sm);
  background: var(--surface);
  font: inherit;
  font-size: var(--font-base);
  color: var(--text);
  outline: none;
}
.access-add input:focus { border-color: var(--accent); }
/* 一覧から 1 つ選ぶ行。
   字は**本文と同じ大きさ**にする（DESIGN.md 5 章「目次の 1 行」）。選べる行の 2 態は
   大きさで分けず、太さと濃さだけで分ける決まり——小さくすると「読み飛ばしてよい
   添え物」の合図になり、選択肢そのものが弱く見える。
   選んでいない行が灰、選んでいる行が濃で太い（下の is-active）。 */
.pick-row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  width: 100%;
  padding: var(--space-2) var(--space-1);
  text-align: left;
  font-size: var(--font-base);
  color: var(--muted);
  transition: background var(--duration) var(--ease), color var(--duration) var(--ease);
}
.pick-row:hover { background: var(--surface-sunken); color: var(--text); }
.pick-row.is-active { background: var(--surface-sunken); color: var(--text); font-weight: var(--weight-bold); }

/* ---- 共有範囲（このページを誰に見せるか）----
   段は見出しの太さと余白だけで作る。囲みも帯も色分けも置かない。
   色が付くのは、取り消し側の文字が触れたときに赤くなるところ（.action.is-danger）だけ */
.access-scope { margin-bottom: var(--space-5); }
/* 選び分けは 3 つ並ぶ（社内の全員 / 選んだ人だけ / 社外の誰でも）。
   板は細くできるので、入りきらない 1 つだけが次の段へ落ちるようにする。
   縦に積み替えたり字を小さくしたりはしない——3 つは 1 本の軸に並んでいて、
   並び順そのものが「見える人が増える向き」を表しているため */
.access-scope .picker { flex-wrap: wrap; }
/* 社外へ渡す URL と、写す口。
   URL は長いので折り返す。囲みも帯も置かず、余白と細字だけで本文から離す */
.access-link {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2);
  margin-top: var(--space-2);
}
.access-url { flex: auto; min-width: 0; font-size: var(--font-sm); overflow-wrap: anywhere; }
.access-part + .access-part { margin-top: var(--space-5); }
/* 節の見出し。**中身より必ず 1 段大きい**（DESIGN.md の鉄則 1）。
   行の名前と同じ大きさにすると、差が太さだけになって同格に見える */
.access-head { margin: 0 0 var(--space-1); font-size: var(--font-md); font-weight: var(--weight-bold); }
/* 行は折り返す。
   板はかなり細くできて（下限は util.ts の PANEL_MIN_WIDTH）、
   そこにアドレス（長い）とボタン 2 つが並ぶ。
   折り返さないと、アドレスが 1 文字ずつ縦に折り重なって読めなくなる。
   ボタンを名前の下の段へ落とす手もあるが、こちらを採った——「作った人にする」と
   「取り消す」は押す前に見比べるものなので、いつも隣どうしに置いておきたい。
   名前は flex: auto（＝中身の幅を基準に置く）なので、名前が短い行（グループ名など）は
   今までどおり 1 行に収まり、入りきらない行だけがボタンごと次の段へ落ちる */
.access-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-1) 0;
}
.access-name { flex: auto; min-width: 0; font-size: var(--font-base); overflow-wrap: anywhere; }
/* まだ足していない相手。濃さが「いま効いているか」を表すので、ここだけ薄くする
   （右端の口を読まなくても、名前の列だけでどれが効いているか分かる） */
.access-name.is-pending { color: var(--muted); }
/* 行の中に置く細字（「あなたです」）。段落ではないので、上の余白は要らない */
.access-row > .note { margin-top: 0; }
/* 念押しの 1 文。読まずに押されては断りにならないので、注記（.note）の薄い小さな字には落とさない */
.access-confirm { padding: var(--space-2) 0; }
.access-warning {
  margin: 0 0 var(--space-3);
  font-size: var(--font-base);
  color: var(--text);
  overflow-wrap: anywhere;
}
.origin-diff { margin: var(--space-4) 0; }
.origin-diff .change { padding-left: 0; padding-right: 0; }
.origin-diff .change-text {
  white-space: pre-wrap;
  overflow: visible;
  text-overflow: unset;
}
.access-add { display: flex; align-items: center; gap: var(--space-2); margin-top: var(--space-2); }
.access-add input { flex: 1; min-width: 0; }

/* ---- 知らせ ---- */
/* ---- 知らせ（画面上端・独立して浮く）----
   押したあとの成り行きを伝える場所はここ 1 つ。板の中には出さない。
   下端はドック・覗き見・帯が使うので、上端に置いて取り合いを避ける */
.toast-stack {
  position: fixed;
  top: calc(env(safe-area-inset-top, 0px) + var(--space-3) + var(--compare-bar) + var(--top-lane));
  left: var(--space-3);
  right: var(--space-3);
  pointer-events: none;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-2);
}
.toast {
  pointer-events: auto;
  max-width: var(--size-popover);
  width: 100%;
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
  border: var(--rule-thin) solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface);
  box-shadow: var(--shadow);
  font-size: var(--font-sm);
  color: var(--text);
}
.toast-text { flex: 1; min-width: 0; }
/* 進行中。まだ何も起きていないので、印は付けない */
.toast.is-pending .toast-text { color: var(--muted); }
/* 済んだ知らせ。直すところは無いので、線を引かない */
.toast.is-success .toast-text { color: var(--muted); }
/* 失敗。ここだけ左に太い線を引き、やり直す道を 1 つ添える */
.toast.is-failure { border-left: var(--rule-thick) solid var(--danger); }
.toast-retry {
  flex: none;
  padding: var(--space-1) var(--space-2);
  border-radius: var(--radius-sm);
  font-size: var(--font-sm);
  font-weight: var(--weight-bold);
  color: var(--text);
}
.toast-retry:hover { background: var(--surface-sunken); }

/* ---- ページを直す画面（全面）----
   本文そのものを触る作業なので、板ではなく全面で 1 枚にする。
   下書きは iframe に描く（ページ本体の CSS とこちらの見た目を混ぜない） */
.edit-screen {
  position: absolute;
  /* デスクトップアプリでは、窓の題名の帯（現在地の行）の下から始める。ブラウザでは全面 */
  inset: var(--titlebar-h) 0 0 0;
  pointer-events: auto;
  display: flex;
  flex-direction: column;
  background: var(--surface);
}
.edit-bar {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
  border-bottom: var(--rule-thin) solid var(--border);
}
.edit-title {
  font-size: var(--font-lg);
  font-weight: var(--weight-bold);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.edit-count { font-size: var(--font-sm); color: var(--muted); white-space: nowrap; }
.edit-message {
  flex: 1;
  min-width: 0;
  max-width: 360px;
  height: var(--size-control);
  padding: 0 var(--space-3);
  border: var(--rule-thin) solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface);
  font-size: var(--font-base);
}
.edit-button {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  height: var(--size-control);
  padding: 0 var(--space-3);
  border: var(--rule-thin) solid var(--border);
  border-radius: var(--radius-pill);
  font-size: var(--font-base);
  font-weight: var(--weight-medium);
  color: var(--text);
  transition: background var(--duration) var(--ease);
}
.edit-button:hover { background: var(--surface-sunken); }
/* 塗るのは「まずこれを押して」の 1 つだけ */
.edit-button.is-primary { background: var(--text); border-color: var(--text); color: var(--surface); }
.edit-button.is-primary:hover { opacity: .9; }
.edit-button:disabled { opacity: .45; cursor: default; }
.edit-alert {
  margin: 0;
  padding: var(--space-2) var(--space-3);
  border-bottom: var(--rule-thin) solid var(--border);
  font-size: var(--font-base);
  color: var(--danger);
}
/* 控えの案内。断り（.edit-alert）と同じ位置・同じ余白で、色だけ灰（情報）。
   ボタンを同じ行に置くので flex にする——文字と余白だけでは「押す口」が並ばない。 */
.edit-resume {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2);
  margin: 0;
  padding: var(--space-2) var(--space-3);
  border-bottom: var(--rule-thin) solid var(--border);
  font-size: var(--font-base);
  color: var(--muted);
}
.edit-frame { flex: 1; width: 100%; border: 0; background: var(--surface); }

/* ---- 指で触るときの入力欄（いちばん最後に置く）----
   iOS は、焦点の当たった入力欄の文字が 16px 未満だと画面ごと勝手に拡大する。
   文章を選んで入力欄を押した瞬間に画面が飛ぶのは、その一番の原因。

   拡大そのものを禁じる手（viewport の maximum-scale）は使わない。
   指で広げて読む自由を奪ううえ、ページ本体は書いた人の持ち物なので触らない。
   こちらの文字を 16px にすれば、拡大は起きない。

   セレクタを種類で広く取ってあるのは、あとから入力欄を足したときの
   取りこぼしを防ぐため。並びの最後に置いてあるのは、先に出てくる
   個別の指定（.composer textarea など）を確実に上書きするため。 */
:host(.is-narrow) textarea,
:host(.is-narrow) input {
  font-size: var(--font-lg);
}
${DECK_EDITOR_STYLES}
`;
