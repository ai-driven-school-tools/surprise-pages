import { readWidgetSource } from "./widget-source.mjs";
/**
 * スクロールでキーボードを畳む方式と、ドックの下払いで閉じる一連を確かめる。
 *   1. 畳む / 畳まない の分岐（純粋な計算）
 *   2. 下へ抜けきる量（持ち上がっている状態からでも画面から出る）
 *   3. 揺れの再現（畳まない旧方式では毎コマ動き続ける ＝ 直っていることの証明）
 *   4. 組み立て側の確認（配線・後始末・指の受け取り）
 */

import { root, dir } from "./paths.mjs";
const { build } = await import(`${root}/node_modules/esbuild/lib/main.js`);

for (const [name, out] of [["comments/dock", "kd-dock"], ["shared/util", "kd-util"], ["shared/styles", "kd-styles"]]) {
  await build({
    entryPoints: [`${root}/src/widget/${name}.ts`],
    outfile: `${dir}/${out}.mjs`,
    bundle: true,
    format: "esm",
    platform: "neutral",
  });
}
const {
  dismissesKeyboard, exitDrop,
  keyboardInset, correctedShift, needsCorrection, visibleBottomFor,
} = await import(`${dir}/kd-dock.mjs`);
const { AXIS_LOCK_DISTANCE, SWIPE_CLOSE_DISTANCE, isDownwardSwipe, rubberBand } =
  await import(`${dir}/kd-util.mjs`);
const { STYLES: RAW } = await import(`${dir}/kd-styles.mjs`);
const CSS = RAW.replace(/\/\*[\s\S]*?\*\//g, "");

const TS = (await readWidgetSource())
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^[ \t]*\/\/.*$/gm, "");

let fails = 0;
const ok = (label, actual, expected) => {
  const pass = actual === expected;
  if (!pass) fails += 1;
  console.log(`${pass ? "OK  " : "NG  "} ${label}: ${actual}（期待: ${expected}）`);
};
const has = (label, re) => ok(label, re.test(TS), true);
const css = (label, re) => ok(label, re.test(CSS), true);

// ---------------------------------------------------------------------------
console.log("--- 1. ページ側の動きでキーボードを畳むか ---");
console.log(`   畳む条件: キーボードが出ている / 動き始めがドックの外 / 縦に ${AXIS_LOCK_DISTANCE}px 以上`);

const D = (keyboardVisible, startedInDock, dx, dy) =>
  dismissesKeyboard({ keyboardVisible, startedInDock, dx, dy });

console.log("\n   キーボードが出ていないとき（何をしても畳まない）");
ok("大きく下へ動かした", D(false, false, 0, 200), false);
ok("大きく上へ動かした", D(false, false, 0, -200), false);

console.log("\n   ドックの中から始めた動き（入力欄・つまみ・ボタン）");
ok("下へ動かした", D(true, true, 0, 200), false);
ok("上へ動かした", D(true, true, 0, -200), false);
ok("押しただけ", D(true, true, 0, 0), false);

console.log("\n   ページ側から始めた動き");
ok("押しただけ（動かない）", D(true, false, 0, 0), false);
ok("わずかな揺れ（7px）", D(true, false, 0, 7), false);
ok("斜めのわずかな揺れ", D(true, false, 5, 5), false);
ok("境目ちょうど 8px 下へ", D(true, false, 0, AXIS_LOCK_DISTANCE), true);
ok("下へスクロール", D(true, false, 0, 60), true);
ok("上へスクロール", D(true, false, 0, -60), true);
ok("斜めだが縦が勝つ", D(true, false, 20, 30), true);
ok("横へなぞった（文字を選び直す等）", D(true, false, 40, 5), false);
ok("横が勝つ斜め", D(true, false, 30, 20), false);

console.log("\n   境目のすぐ手前・すぐ後（1px 刻み）");
ok("縦 7px は畳まない", D(true, false, 0, -7), false);
ok("縦 8px で畳む", D(true, false, 0, -8), true);
ok("縦 9px で畳む", D(true, false, 0, 9), true);

// ---------------------------------------------------------------------------
console.log("\n--- 2. 下へ払って抜けきる量 ---");
console.log("   ドックはキーボードのぶん持ち上がっている（shift は負）。高さぶんだけでは出きらない");

const H = 220;
ok("キーボードが無いとき（持ち上げ 0）", exitDrop(H, 0), 220);
ok("336px 持ち上がっているとき", exitDrop(H, -336), 556);
console.log("\n   送り出したあとの見え方（画面の底 = 貼り付き先とする）");
for (const shift of [0, -120, -336]) {
  const drop = exitDrop(H, shift);
  const top = shift + drop - H; // カードの上端が、貼り付き先の底から何 px 下か
  ok(`持ち上げ ${shift}px → 上端が底より下`, top >= 0, true);
  ok(`持ち上げ ${shift}px → 上端の位置`, top, 0);
}
console.log("\n   旧式（高さぶんだけ下げる）だと、持ち上がっているぶん画面に残る");
ok("336px 持ち上がった状態で高さぶんだけ下げたときの残り", H + (-336) + H - H, -116);
ok("↑ 負＝底より上に残っている（見えたまま）", H + (-336) + H - H < 0, true);

console.log("\n   足りない払いは戻す（覗き見カードと同じ 48px の目安）");
ok("目安", SWIPE_CLOSE_DISTANCE, 48);
ok("30px 下げただけ → 閉じない", isDownwardSwipe(0, 30), false);
ok("48px ちょうど → 閉じる", isDownwardSwipe(0, 48), true);
ok("横に流れた 48px → 閉じない", isDownwardSwipe(80, 48), false);
ok("上へ 60px → 閉じない", isDownwardSwipe(0, -60), false);
console.log("\n   上へは抵抗を掛ける（行き止まりだと手で分かる）");
ok("上へ 100px 引いても付いてくるのは", rubberBand(-100), -30);

// ---------------------------------------------------------------------------
console.log("\n--- 3. 揺れの再現（旧方式と新方式の比較） ---");
console.log("   キーボードを出したままページをスクロールすると、visualViewport の知らせが");
console.log("   指の動きから遅れて届く。追いかけ続けると毎コマ位置が動く（＝ガタつき）");

const LAYOUT = 800;
const KEY = 336;            // キーボードの高さ
const VISIBLE = LAYOUT - KEY;
// スクロール中、見えている範囲のずれ（offsetTop）が遅れて届く様子
const offsets = [0, 6, 6, 14, 14, 22, 22, 30, 30, 30];

const chase = () => {
  const seen = [];
  let shift = 0;
  for (const offsetTop of offsets) {
    shift = -keyboardInset(LAYOUT, VISIBLE, offsetTop);
    const dockBottom = LAYOUT + shift;             // 貼り付き先 + 持ち上げ
    const visibleBottom = visibleBottomFor(LAYOUT, LAYOUT, VISIBLE, offsetTop);
    if (needsCorrection(dockBottom, visibleBottom)) {
      shift = correctedShift(shift, dockBottom, visibleBottom);
    }
    seen.push(shift);
  }
  return seen;
};

const collapse = () => {
  // 8px 動いた時点で畳む → 以降キーボードは無い（inset 0）ので、ずっと下端で静止
  const seen = [];
  for (const offsetTop of offsets) {
    const dismissed = dismissesKeyboard({ keyboardVisible: true, startedInDock: false, dx: 0, dy: offsetTop });
    seen.push(dismissed ? -keyboardInset(LAYOUT, LAYOUT, 0) : -keyboardInset(LAYOUT, VISIBLE, offsetTop));
  }
  return seen;
};

const chased = chase();
const collapsed = collapse();
const spread = (xs) => Math.max(...xs) - Math.min(...xs);
console.log(`   追いかけたとき: ${chased.join(", ")}`);
console.log(`   畳んだとき    : ${collapsed.join(", ")}`);
ok("追いかける旧方式は毎コマ位置が変わる（揺れ幅 px）", spread(chased) > 0, true);
ok("↑ 揺れ幅", spread(chased), 30);

// 畳むのは「8px 動いた」と分かってから。それまでの数コマは追いかける（＝避けられない窓）
const at = offsets.findIndex((offsetTop) => offsetTop >= AXIS_LOCK_DISTANCE);
ok("畳むまでの窓（コマ数）", at, 3);
ok("畳むまでに動く量は指の動き 8px より小さい", spread(collapsed.slice(0, at)) < AXIS_LOCK_DISTANCE, true);
ok("↑ その量", spread(collapsed.slice(0, at)), 6);
ok("畳んだあとは 1px も動かない（揺れ幅 0）", spread(collapsed.slice(at)), 0);
ok("畳んだあとは下端に貼り付いたまま", collapsed[collapsed.length - 1], 0);

// ---------------------------------------------------------------------------
console.log("\n--- 4. 組み立て側の確認 ---");

console.log("\n   配線");
has("ページ側の見張りを付けている", /^  (?:selectionFeature\.)?attachKeyboardDismiss\(\);$/m);
has("見張りは pointer で拾う", /addEventListener\("pointermove", \(event\) => move\(/);
has("画面が動き出したあとの touch も同じ見張りへ", /addEventListener\(\s*\n?\s*"touchmove",/);
has("ドックの中から始めたかを composedPath で見る", /composedPath\(\)\.includes\(composeDock\)/);
has("キーボードが出ているかは焦点で判断", /keyboardVisible: isDockFocused\(\)/);

console.log("\n   畳んだときに失われないもの");
ok("畳む処理が書きかけを消していない", /function collapseKeyboard\(\): void \{[\s\S]*?\n\}/.exec(TS)[0].includes("draft"), false);
ok("畳む処理がドックを閉じていない", /function collapseKeyboard\(\): void \{[\s\S]*?\n\}/.exec(TS)[0].includes("closeComposeDock"), false);
has("畳んだあと下端へ着地させ直す", /function collapseKeyboard[\s\S]*?(?:selectionFeature\.)?settleComposeDock\(\);/);

console.log("\n   指で動かしている間は位置合わせを止める");
has("置き直しを止める", /function positionComposeDock[\s\S]*?if \(dockGesture\) return;/);
has("測って直すのも止める", /function correctComposeDock[\s\S]*?if \(dockGesture\) return false;/);
has("持ち上げと指の動きを足して 1 つの transform に", /const y = dockShift \+ dockDrag;/);
has("閉じたら指の動きの記録も戻す", /dockDrag = 0;\s*\n\s*dockGesture = false;/);

console.log("\n   下払いの一連");
has("指に 1:1 で付いてくる", /setDockDrag\(dy > 0 \? dy : rubberBand\(dy\), false\)/);
has("後ろのページを道連れにしない", /if \(axis !== "vertical"\) return;\s*\n\s*\n?\s*event\.preventDefault\(\);/);
has("方向を決めるのは共通の決まり", /axis = lockAxis\(dx, dy\)/);
has("払いきったら抜けきる量まで下げる", /setDockDrag\(exitDrop\(height, dockShift\), true\)/);
has("抜けきってから閉じる", /(?:setTimeout|timeout)\(\(\) => (?:selectionFeature\.)?closeComposeDock\(\), SWIPE_MS\)/);
has("足りなければ戻す", /setDockDrag\(0, true\);/);
has("戻したあとは置き直しに任せる", /dockGesture = false;\s*\n\s*(?:selectionFeature\.)?settleComposeDock\(\);/);

console.log("\n   指の受け取り（後ろのページを動かさない）");
// 器は全面で受け取る。部品ごとに掛けると、隙間と余白が素通しになる
css("ドックは全面で指を受け取る", /^\.compose-dock \{ touch-action: none; \}$/m);
ok("部品ごとの切り替えは残っていない", /^\.compose-dock \.peek-grab,/m.test(CSS), false);
css("入力欄は末端で後ろへ引き継がない", /^\.compose-dock textarea \{ overscroll-behavior: contain; \}$/m);
ok("入力欄の縦は JS が流す", /(?:selectionFeature\.)?attachInnerScroll\((?:selectionFeature\.|connections\.)?composeDock, "textarea"\)/.test(TS), true);
ok("横となぞりはブラウザのまま（カーソル・文字選択）", /if \(axis !== "vertical"\) return;/.test(TS), true);
css("滑りは覗き見カードと同じ", /^\.compose-dock\.is-dropping \{ transition: transform var\(--duration-swipe\) var\(--ease-swipe\); \}$/m);
ok("滑りの時間に生の数値を使っていない", /is-dropping \{ transition: transform \d/.test(CSS), false);

console.log("\n   見張りを止める場所（触っていない指の記録が残らない）");
has("指を離したら見張りをやめる", /addEventListener\("pointerup", stop, \{ capture: true, signal: lifetime\.signal \}\)/);
has("touch も同様", /addEventListener\("touchend", stop, \{ capture: true, signal: lifetime\.signal \}\)/);

console.log(`\n${fails === 0 ? "すべて合格" : `${fails} 件 不合格`}`);
