/**
 * キーボードが出ている間の「詰めた姿」で、どれだけ隙間が広がるかを数える。
 * 見た目の指定を読み、畳まれる部分の高さを積み上げて比べる。
 */
import { root, dir } from "./paths.mjs";
const { build } = await import(`${root}/node_modules/esbuild/lib/main.js`);

for (const [name, out] of [["shared/styles", "cp-styles"], ["comments/dock", "cp-dock"]]) {
  await build({
    entryPoints: [`${root}/src/widget/${name}.ts`],
    outfile: `${dir}/${out}.mjs`,
    bundle: true,
    format: "esm",
    platform: "neutral",
  });
}
const { STYLES: RAW } = await import(`${dir}/cp-styles.mjs`);
const { isWithinGap } = await import(`${dir}/cp-dock.mjs`);
const CSS = RAW.replace(/\/\*[\s\S]*?\*\//g, "");

const ok = (label, actual, expected) =>
  console.log(`${actual === expected ? "OK  " : "NG  "} ${label}: ${actual}（期待: ${expected}）`);

// トークンの値
const token = new Map();
for (const [, k, v] of CSS.matchAll(/(--[a-z0-9-]+):\s*([0-9.]+)px/g)) token.set(k, Number(v));
const px = (name) => token.get(name) ?? 0;

const rule = (sel) => {
  const m = new RegExp(`${sel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\{([^}]*)\\}`).exec(CSS);
  return m === null ? "" : m[1];
};
const declared = (sel, prop) => {
  const m = new RegExp(`${prop}:\\s*([^;]+)`).exec(rule(sel));
  return m === null ? null : m[1].trim();
};

console.log("--- 詰めた姿で畳まれるもの ---");
// 見出しと足もとの行は、姿によらず常に無い（この 2 行はもう作っていない）
ok("見出しの行はどこにも無い", /pop-head/.test(CSS), false);
ok("入力欄に足もとの行は無い", /\.compose-dock[^{]*\.composer-foot/.test(CSS), false);
ok(
  "入力欄を低くする",
  declared(".compose-dock.is-compact .composer textarea", "min-height"),
  "var(--size-input-compact)",
);
ok("縦の間合いを詰める", declared(".compose-dock.is-compact .composer", "gap"), "var(--space-1)");
ok("送信は強さのボタンが兼ねる", /\.send-pill\s*\{/.test(CSS), true);
ok("強さのボタンは並ぶ", /\.send-row\s*\{/.test(CSS), true);
ok("やめるボタンは引用の行にある", /\.quote-row \.icon-button/.test(CSS), true);

console.log("\n--- 稼げる高さ（16px の文字・行送り 1.6）---");
const LINE = Math.round(16 * 1.6);            // 26
const headRow = LINE + px("--space-2");        // 見出し 1 行 + 下の間合い
// 足もとの行を畳んだぶん。送信は強さの行へ移るので、その行が少し伸びる分を差し引く
const LINE_SM = Math.round(12 * 1.35);
const CHIP_H = LINE_SM + px("--space-1") * 2;
const footCut = px("--space-1") + CHIP_H;
const inputCut = px("--size-input-min") - px("--size-input-compact");
const padCut =
  (px("--space-2") - px("--space-1")) + (px("--space-3") - px("--space-2")); // 上下の詰め
const gapCut = (px("--space-2") - px("--space-1")) * 2;                       // 中の間合い 2 か所
const grabCut = px("--space-3") - px("--space-2");

const rows = [
  ["入力欄を低く", inputCut],
  ["上下の余白を詰める", padCut],
  ["中の間合いを詰める", gapCut],
  ["つまみの下を詰める", grabCut],
];
let total = 0;
console.log("畳んだところ              稼げる高さ");
console.log("-".repeat(40));
for (const [name, value] of rows) {
  total += value;
  console.log(`${name.padEnd(24)}  ${String(value).padStart(6)}px`);
}
console.log("-".repeat(40));
console.log(`${"合計".padEnd(24)}  ${String(total).padStart(6)}px`);

ok("入力欄で稼ぐ", inputCut, 8);
// 見出しと足もとの 2 行は「詰めた姿だから」ではなく、常に無い
console.log(`   ＋ 常に無くなった 2 行: 見出し ${headRow}px / 足もと ${footCut}px`);
ok("詰めた姿だけで稼ぐぶん", total, 28);
ok("常時ぶんも足すと 80px を超える", total + headRow + footCut > 80, true);

// iPhone 15 でキーボードが出たときの隙間
const VISIBLE = 852 - 336;   // 見えている高さ 516
const DOCK_NORMAL = 250;     // ふだんのドックの高さ（およそ）
const before = VISIBLE - DOCK_NORMAL;
const after = VISIBLE - (DOCK_NORMAL - (total + headRow + footCut));
console.log(`\n   ページに残る隙間: ${before}px → ${after}px（${Math.round((after / before - 1) * 100)}% 広い）`);
ok("隙間が広がる", after > before, true);

console.log("\n--- 見え直すかどうかの判定 ---");
// 隙間は「見えている上端 0」〜「ドックの上端 260」
const GAP_TOP = 0;
const GAP_BOTTOM = 260;
const cases = [
  ["隙間の真ん中にある", 100, 130, true],
  ["上端にぴったり", 0, 30, true],
  ["下端にぴったり", 230, 260, true],
  ["上へ 1px はみ出した", -1, 30, false],
  ["下へ 1px はみ出した", 230, 261, false],
  ["完全に上へ消えた", -120, -90, false],
  ["ドックの裏に隠れた", 300, 330, false],
  ["隙間より背が高い", -10, 300, false],
];
let wrong = 0;
for (const [name, top, bottom, want] of cases) {
  const got = isWithinGap(top, bottom, GAP_TOP, GAP_BOTTOM);
  if (got !== want) wrong += 1;
  console.log(`   ${got ? "そのまま  " : "出し直す  "} ${name}`);
}
ok("判定を誤った例", wrong, 0);
ok("見えていれば動かさない", isWithinGap(100, 130, 0, 260), true);
ok("隠れていたら出し直す", isWithinGap(-50, -20, 0, 260), false);
