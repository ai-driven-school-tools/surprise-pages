/**
 * 選択の退避と、入り口の出し分けを確かめる。
 * どちらもブラウザ無しで確かめられるところだけを取り出してある。
 */
import { root, dir } from "./paths.mjs";
const { build } = await import(`${root}/node_modules/esbuild/lib/main.js`);

for (const [name, file] of [["anchor", "comments/anchor"], ["util", "shared/util"]]) {
  await build({
    entryPoints: [`${root}/src/widget/${file}.ts`],
    outfile: `${dir}/w-${name}.mjs`,
    bundle: true,
    format: "esm",
    platform: "neutral",
  });
}
const { stashSelection } = await import(`${dir}/w-anchor.mjs`);
const {
  selectionEntry,
  settleDelay,
  SETTLE_NARROW_MS,
  SETTLE_WIDE_MS,
  isDownwardSwipe,
  SWIPE_CLOSE_DISTANCE,
} = await import(`${dir}/w-util.mjs`);

const ok = (label, actual, expected) =>
  console.log(`${actual === expected ? "OK  " : "NG  "} ${label}: ${actual}（期待: ${expected}）`);

console.log("--- 引用の退避（選択が消えても失わないか）---");

// ブラウザから受け取ったつもりの値
const live = {
  quote: "売上は前年より 12% 伸びました。",
  context: { beforeText: "四半期レポート ", afterText: " 解約率は横ばいです。" },
};
const kept = stashSelection(live);

ok("引用が写る", kept.quote, "売上は前年より 12% 伸びました。");
ok("前の文脈が写る", kept.context.beforeText, "四半期レポート ");
ok("後ろの文脈が写る", kept.context.afterText, " 解約率は横ばいです。");

// ここが肝。ブラウザ側の選択が解除されて元の入れ物が書き換わっても、
// 退避したほうは影響を受けてはいけない
live.quote = "";
live.context.beforeText = "";
live.context.afterText = "";

ok("元が空になっても引用は残る", kept.quote, "売上は前年より 12% 伸びました。");
ok("元が空になっても前の文脈は残る", kept.context.beforeText, "四半期レポート ");
ok("元が空になっても後ろの文脈は残る", kept.context.afterText, " 解約率は横ばいです。");
ok("入れ物ごと別物になっている", kept.context === live.context, false);

// 名乗り → そのまま書く、の流れで作られる送信内容
const draft = { anchor: kept, kind: "comment", priority: "want", body: "ここ直したい" };
const payload = { quote: draft.anchor.quote, quoteContext: draft.anchor.context };
ok("名乗ったあとでも送信内容に引用が入る", payload.quote, "売上は前年より 12% 伸びました。");
ok("送信内容に前の文脈が入る", payload.quoteContext.beforeText, "四半期レポート ");

console.log("\n--- 入り口の出し分け ---");
const devices = [
  ["iPhone SE", 375, "bar"],
  ["iPhone 15", 393, "bar"],
  ["境目のすぐ下", 639, "bar"],
  ["境目", 640, "popover"],
  ["iPad 縦", 768, "popover"],
  ["ノート", 1440, "popover"],
];
for (const [name, viewport, expected] of devices) {
  ok(`${name}(${viewport}px)`, selectionEntry(viewport, true), expected);
}
ok("選んでいなければ出さない(狭い)", selectionEntry(375, false), "none");
ok("選んでいなければ出さない(広い)", selectionEntry(1440, false), "none");

console.log("\n--- 選び終わったと見なすまでの待ち ---");
ok("狭い画面は長めに待つ", settleDelay(375), SETTLE_NARROW_MS);
ok("広い画面は今までどおり速い", settleDelay(1440), SETTLE_WIDE_MS);
ok("待ち時間の値(狭い)", SETTLE_NARROW_MS, 400);

console.log("\n--- 覗き見カードを下へ払って閉じる判定 ---");
ok("しっかり下へ払った", isDownwardSwipe(0, 80), true);
ok("ちょうど境目", isDownwardSwipe(0, SWIPE_CLOSE_DISTANCE), true);
ok("境目のすぐ手前は閉じない", isDownwardSwipe(0, SWIPE_CLOSE_DISTANCE - 1), false);
ok("上へ払っても閉じない", isDownwardSwipe(0, -80), false);
ok("指がぶれただけでは閉じない", isDownwardSwipe(3, 6), false);
ok("横に大きく流したときは閉じない", isDownwardSwipe(120, 60), false);
ok("斜め下でも縦が勝てば閉じる", isDownwardSwipe(30, 90), true);
ok("ただの押下(動きなし)では閉じない", isDownwardSwipe(0, 0), false);
