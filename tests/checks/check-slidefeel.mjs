import { readWidgetSource } from "./widget-source.mjs";
/**
 * 覗き見カードの送りが「動いて見える」ことを確かめる。
 *
 * 元の症状: 指を離すとカードが動かずに次のカードへ切り替わる（＝送った手応えが無い）。
 *   1. 離した位置から動かしきる経路があるか（前は送るときだけ動きを通っていなかった）
 *   2. 組み直しは動きが終わってから・動きを切って行うか
 *   3. 長さとカーブ / 速さに連れて長さが変わる計算
 */

import { root, dir } from "./paths.mjs";
const { build } = await import(`${root}/node_modules/esbuild/lib/main.js`);

for (const [name, out] of [["shared/util", "sf-util"], ["shared/tokens", "sf-tokens"], ["shared/styles", "sf-styles"]]) {
  await build({
    entryPoints: [`${root}/src/widget/${name}.ts`],
    outfile: `${dir}/${out}.mjs`,
    bundle: true,
    format: "esm",
    platform: "neutral",
  });
}
const { swipeDuration, SWIPE_FAST_MS, swipeTarget } = await import(`${dir}/sf-util.mjs`);
const { SWIPE_MS } = await import(`${dir}/sf-tokens.mjs`);
const { STYLES: RAW } = await import(`${dir}/sf-styles.mjs`);
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

// ---------------------------------------------------------------------------
console.log("--- 1. 離した位置から動かしきる ---");
console.log("   前は、送るときだけ動きを通らずに中身を入れ替えていた");
console.log("   （戻すときは動きを通っていたので、戻す側だけ滑らかだった）");

const slide = /function slidePeek\([\s\S]*?\n\}/.exec(TS)?.[0] ?? "";
const commit = /function commitSlide\([\s\S]*?\n\}/.exec(TS)?.[0] ?? "";

ok("送る側でも動きを通る", /setTrackOffset\(target, true, ms\)/.test(slide), true);
ok("行き先は 1 枠ぶん", /const target = -step \* width;/.test(slide), true);
ok("動きの前に中身を入れ替えていない", /state\.activeId/.test(slide), false);
ok("戻す側も離した位置から吸い付く", /setTrackOffset\(0, true, swipeDuration\(/.test(slide), true);
has("掴んでいる間は動きを付けない", /if \(axis !== "horizontal"\) return;[\s\S]{0,400}setTrackOffset\([\s\S]*?, false\)/);

console.log("\n--- 2. 組み直しは動きのあと・動きを切って ---");
ok("入れ替えは待ち時間のあと", /(?:setTimeout|timeout)\(\(\) => commitSlide\(next\.id\), ms\)/.test(slide), true);
ok("待ち時間は動きと同じ長さ（別々に決めていない）", /, ms\);/.test(slide), true);
ok("入れ替えで中身が変わる", /state\.activeId = commentId;/.test(commit), true);
ok("組み直しは動きを切ってから", /setTrackOffset\(0, false\)/.test(TS), true);
has("送っている最中は組み直さない", /!selectionFeature\.peekDragging && !selectionFeature\.peekHandoff && !selectionFeature\.peekSliding\) (?:selectionFeature\.)?renderPeek\(\)/);
has("送り終わる前に触られたら、その場で送り切る", /if \(peekSliding && peekPendingId !== null\) commitSlide\(peekPendingId\)/);
has("動きの長さは要素に直接入れる", /peekTrack\.style\.transitionDuration = animate \? `\$\{ms\}ms` : "";/);

console.log("\n   離してから中身が変わるまで（旧 / 新）");
console.log("   旧: 0ms（離した瞬間に別のカード）→ 動いた距離 0px");
console.log(`   新: ${SWIPE_MS}ms かけて 1 枠ぶん動いてから入れ替え`);
ok("旧の「動いて見える時間」", 0, 0);
ok("新の「動いて見える時間」", SWIPE_MS, 340);

// ---------------------------------------------------------------------------
console.log("\n--- 3. 長さとカーブ ---");
ok("既定の長さ（0.32〜0.4 秒の範囲）", SWIPE_MS >= 320 && SWIPE_MS <= 400, true);
ok("↑ 実際の値（ミリ秒）", SWIPE_MS, 340);
ok("見た目の側も同じ数から作る", /--duration-swipe: 340ms;/.test(CSS), true);
ok("カーブ", /--ease-swipe: cubic-bezier\(0\.32, 0\.72, 0, 1\);/.test(CSS), true);
console.log("   出だしが速く、長い尾を引いて吸い付くカーブ（iOS のシートで定番の形）");

console.log("\n   カーブの進み方（時間の割合 → 進んだ割合）");
// 3 次ベジェ（x, y とも 0..1）を数値で解く。行きすぎ（1 を超える）が無いことも見る
const bezier = (p1, p2, t) => 3 * (1 - t) ** 2 * t * p1 + 3 * (1 - t) * t ** 2 * p2 + t ** 3;
const curveAt = (x1, y1, x2, y2, x) => {
  let low = 0;
  let high = 1;
  for (let i = 0; i < 60; i += 1) {
    const mid = (low + high) / 2;
    if (bezier(x1, x2, mid) < x) low = mid;
    else high = mid;
  }
  return bezier(y1, y2, (low + high) / 2);
};
const now = (x) => Math.round(curveAt(0.32, 0.72, 0, 1, x) * 100);
const before = (x) => Math.round(curveAt(0.22, 1, 0.36, 1, x) * 100);
for (const x of [0.1, 0.25, 0.5, 0.75, 0.9]) {
  console.log(`   ${Math.round(x * 100)}% の時点 … 前: ${before(x)}% / 今: ${now(x)}%`);
}
console.log("   どちらも出だしで大きく進む形。違いは出だしの角と、終わりぎわの尾");
ok("出だし（10%）は前より穏やか", now(0.1) < before(0.1), true);
ok("↑ 前 / 今", `${before(0.1)} / ${now(0.1)}`, "40 / 27");
ok("終わりぎわはまだ動いている（前は 75% で着いていた）", now(0.75) < 100 && before(0.75) === 100, true);
console.log("   ＝ カーブの効きは小さい。硬さの主因は「動きが無かった」ことのほう");
ok("行きすぎて戻らない（1 を超えない）", [0.25, 0.5, 0.75, 0.9, 1].every((x) => now(x) <= 100), true);
ok("最後は必ず着く", now(1), 100);

// ---------------------------------------------------------------------------
console.log("\n--- 4. 速さに連れて長さを変える ---");
console.log(`   長さ = 残りの距離 ÷ 払った速さ（下限 ${SWIPE_FAST_MS}ms・上限は既定の ${SWIPE_MS}ms）`);

console.log("\n   カード幅 320px を送るとき");
const W = 320;
ok("速さが取れない（ゆっくり離した）", swipeDuration(W, 0, SWIPE_MS), 340);
ok("ゆっくり 0.2px/ms → 1600ms ぶんだが、既定で止める", swipeDuration(W, 0.2, SWIPE_MS), 340);
ok("ふつう 0.94px/ms → ちょうど既定あたり", swipeDuration(W, 0.94, SWIPE_MS), 340);
ok("やや速い 1.2px/ms", swipeDuration(W, 1.2, SWIPE_MS), 267);
ok("速い 1.33px/ms → 下限ちょうど", swipeDuration(W, 1.3333, SWIPE_MS), 240);
ok("とても速い 3px/ms → 下限で止める", swipeDuration(W, 3, SWIPE_MS), 240);
ok("ありえない速さでも下限を割らない", swipeDuration(W, 999, SWIPE_MS), 240);

console.log("\n   残りが短いとき（画面の端まであと少し）");
ok("残り 40px・速さ 1.0 → 40ms ぶんだが、下限で止める", swipeDuration(40, 1, SWIPE_MS), 240);
ok("残り 0（もう着いている）", swipeDuration(0, 1, SWIPE_MS), 240);

console.log("\n   向き（左右）で長さが変わらない");
ok("右へ払った（速さが正）", swipeDuration(W, 1.2, SWIPE_MS), 267);
ok("左へ払った（速さが負）", swipeDuration(W, -1.2, SWIPE_MS), 267);
ok("残りが負でも同じ", swipeDuration(-W, 1.2, SWIPE_MS), 267);

console.log("\n   速いほど短い、が崩れないこと");
const speeds = [0.2, 0.5, 0.8, 1.0, 1.2, 1.5, 2.0, 3.0];
const lengths = speeds.map((speed) => swipeDuration(W, speed, SWIPE_MS));
console.log(`   速さ: ${speeds.join(", ")}`);
console.log(`   長さ: ${lengths.join(", ")}`);
ok("速くなるほど長さが増えない", lengths.every((ms, i) => i === 0 || ms <= lengths[i - 1]), true);
ok("どれも上限を超えない", lengths.every((ms) => ms <= SWIPE_MS), true);
ok("どれも下限を割らない", lengths.every((ms) => ms >= SWIPE_FAST_MS), true);

console.log("\n   送るか戻すかの判断は今までどおり（速さの使い道が増えただけ）");
ok("速く払えば距離が短くても送る", swipeTarget(-10, -0.9, W), 1);
ok("ゆっくりで距離が足りなければ戻す", swipeTarget(-40, -0.1, W), 0);

console.log("\n--- 5. 送っている途中の割り込み ---");
has("閉じたら送りを取り消す", /lifetime\.clearTimeout\(peekSlideTimer\);\n  peekSliding = false;\n  peekPendingId = null;\n/);
has("閉じられていたら中身を入れ替えない", /if \(!(?:selectionFeature\.)?isPeeking\(\)\) return;/);
ok("触られたら即座に送り切ってから掴ませる", /commitSlide\(peekPendingId\);/.test(TS), true);

console.log(`\n${fails === 0 ? "すべて合格" : `${fails} 件 不合格`}`);
