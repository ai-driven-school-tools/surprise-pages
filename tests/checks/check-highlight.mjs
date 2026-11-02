/**
 * 蛍光ペンの塗りが、明るいページでも暗いページでも成立するかを確かめる。
 *
 * 見るのは 2 つ。
 *   1. 塗った場所が地の色と見分けられるか（薄すぎないか）
 *   2. 塗った上でも本文が読めるか＝文字と背景の明暗差が足りているか
 */
import { root, dir } from "./paths.mjs";
const { build } = await import(`${root}/node_modules/esbuild/lib/main.js`);

await build({
  entryPoints: [`${root}/src/widget/shared/tokens.ts`],
  outfile: `${dir}/w-tokens.mjs`,
  bundle: true,
  format: "esm",
  platform: "neutral",
});
const { MARK } = await import(`${dir}/w-tokens.mjs`);

const ok = (label, actual, expected) =>
  console.log(`${actual === expected ? "OK  " : "NG  "} ${label}: ${actual}（期待: ${expected}）`);

function parseRgba(value) {
  const m = /rgba?\(\s*([0-9]+)[,\s]+([0-9]+)[,\s]+([0-9]+)(?:[,\s/]+([0-9.]+))?\s*\)/.exec(value);
  return { r: +m[1], g: +m[2], b: +m[3], a: m[4] === undefined ? 1 : +m[4] };
}
function parseHex(hex) {
  const h = hex.replace("#", "");
  return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) };
}
/** 半透明の色を下地に重ねた結果 */
function over(top, bottom) {
  return {
    r: Math.round(top.r * top.a + bottom.r * (1 - top.a)),
    g: Math.round(top.g * top.a + bottom.g * (1 - top.a)),
    b: Math.round(top.b * top.a + bottom.b * (1 - top.a)),
  };
}
function luminance({ r, g, b }) {
  const f = (v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
/** 明暗差（WCAG の比。本文は 4.5 以上が目安） */
function contrast(a, b) {
  const l1 = luminance(a);
  const l2 = luminance(b);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}
const hex = ({ r, g, b }) => `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;

const pages = [
  { name: "明るいページ", bg: parseHex("#ffffff"), text: parseHex("#1a1a2e") },
  { name: "明るいページ（灰の本文）", bg: parseHex("#fafafa"), text: parseHex("#333333") },
  { name: "暗いページ", bg: parseHex("#111111"), text: parseHex("#e8e6e3") },
  { name: "暗いページ（紺）", bg: parseHex("#1a1a2e"), text: parseHex("#e8e6e3") },
];
const tints = [
  ["ふだんの塗り", MARK.tint],
  ["触れている・開いている", MARK.activeTint],
  ["片付いたもの", MARK.resolvedTint],
];

console.log("塗りの色: 常時 " + MARK.tint + " / 強め " + MARK.activeTint + " / 薄め " + MARK.resolvedTint);

let unreadable = 0;
let invisible = 0;

for (const page of pages) {
  console.log(`\n--- ${page.name}（地 ${hex(page.bg)} / 文字 ${hex(page.text)}）---`);
  console.log("塗りの種類                塗った色    文字との明暗差  地との差");
  console.log("-".repeat(66));
  for (const [label, value] of tints) {
    const painted = over(parseRgba(value), page.bg);
    const textContrast = contrast(page.text, painted);
    const againstPage = contrast(painted, page.bg);
    // 本文が読めること（4.5 以上）
    if (textContrast < 4.5) unreadable += 1;
    // 塗ったことが分かること。片付いたものはわざと薄いので対象外
    if (label !== "片付いたもの" && againstPage < 1.06) invisible += 1;
    console.log(
      `${label.padEnd(24)}  ${hex(painted)}    ${textContrast.toFixed(2).padStart(10)}  ${againstPage.toFixed(3).padStart(8)}`,
    );
  }
}

console.log("\n" + "=".repeat(66));
ok("本文が読めなくなる組み合わせ（明暗差 4.5 未満）", unreadable, 0);
ok("塗ったことが分からない組み合わせ", invisible, 0);

console.log("\n--- 下線をやめたことの確認 ---");
const flat = JSON.stringify(MARK);
ok("下線の太さの指定が残っていない", /thickness/.test(flat), false);
ok("下線の位置の指定が残っていない", /offset/.test(flat), false);
ok("ふだんの塗りが用意されている", typeof MARK.tint === "string", true);
ok("強めの塗りのほうが濃い", parseRgba(MARK.activeTint).a > parseRgba(MARK.tint).a, true);
ok("片付いたものの塗りはいちばん薄い", parseRgba(MARK.resolvedTint).a < parseRgba(MARK.tint).a, true);

console.log("\n--- 明暗どちらでも同じ 1 色で足りるか ---");
const lightPainted = over(parseRgba(MARK.tint), parseHex("#ffffff"));
const darkPainted = over(parseRgba(MARK.tint), parseHex("#111111"));
console.log(`   明るいページ: ${hex(lightPainted)}（地より暗くなる）`);
console.log(`   暗いページ:   ${hex(darkPainted)}（地より明るくなる）`);
ok("明るいページでは地より暗くなる", luminance(lightPainted) < luminance(parseHex("#ffffff")), true);
ok("暗いページでは地より明るくなる", luminance(darkPainted) > luminance(parseHex("#111111")), true);
