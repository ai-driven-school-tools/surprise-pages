/** 画面の幅ごとに、板の出し方と幅が正しく決まるかを確かめる。 */
import { root, dir } from "./paths.mjs";
const { build } = await import(`${root}/node_modules/esbuild/lib/main.js`);

await build({
  entryPoints: [`${root}/src/widget/shared/util.ts`],
  outfile: `${dir}/util.mjs`,
  bundle: true,
  format: "esm",
  platform: "neutral",
});
const { fitPanelWidth, isNarrowViewport, PANEL_MIN_WIDTH } = await import(`${dir}/util.mjs`);

const devices = [
  ["iPhone SE", 375],
  ["iPhone 15", 393],
  ["iPhone 15 Pro Max", 430],
  ["折りたたみを開いた幅", 600],
  ["境目のすぐ下", 639],
  ["境目", 640],
  ["iPad 縦", 768],
  ["小さめのノート", 1024],
  ["ふつうのノート", 1440],
];

console.log("画面幅   出し方        板の幅   本文に残る幅");
console.log("-".repeat(52));
let bad = 0;
for (const [name, viewport] of devices) {
  const narrow = isNarrowViewport(viewport);
  const width = fitPanelWidth(500, viewport); // 前に 500px まで広げていた人
  const rest = narrow ? viewport : viewport - width;
  const how = narrow ? "重ねる(全幅)" : "横に並べる  ";
  console.log(
    `${String(viewport).padStart(5)}   ${how}  ${String(narrow ? viewport : width).padStart(5)}   ${String(rest).padStart(5)}  ${name}`,
  );
  // 横に並べるときは、本文に最低幅が残っていること
  if (!narrow && rest < PANEL_MIN_WIDTH) bad += 1;
}
console.log("-".repeat(52));
console.log(`横に並べた場合に本文が潰れた画面: ${bad} 件（期待: 0）`);

const ok = (label, actual, expected) =>
  console.log(`${actual === expected ? "OK  " : "NG  "} ${label}: ${actual}（期待: ${expected}）`);

console.log("");
ok("広い画面では覚えた幅をそのまま使う", fitPanelWidth(500, 1440), 500);
ok("上限を超えた値は詰める", fitPanelWidth(9999, 1440), 640);
ok("下限を下回る値は広げる", fitPanelWidth(10, 1440), 300);
ok("入らない幅は本文ぶんを残して詰める", fitPanelWidth(600, 800), 500);
ok("壊れた保存値は既定に戻す", fitPanelWidth(Number.NaN, 1440), 380);
