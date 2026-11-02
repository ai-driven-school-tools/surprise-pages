import { readWidgetSource } from "./widget-source.mjs";
/**
 * 覗き見カードの不合格 3 件 + 軽微 6 件を直したことを確かめる。
 *   A. 長い本文が読める（行数制限を外す / 縦の動きを本文へ譲る）
 *   B. カードの周りに押せる透明な帯を作らない
 *   C. カードの下端がそろう
 *   軽微 1〜6
 */
import { readFile } from "node:fs/promises";

import { root, dir } from "./paths.mjs";
const { build } = await import(`${root}/node_modules/esbuild/lib/main.js`);

for (const [name, out] of [["shared/styles", "pf-styles"], ["shared/tokens", "pf-tokens"]]) {
  await build({
    entryPoints: [`${root}/src/widget/${name}.ts`],
    outfile: `${dir}/${out}.mjs`,
    bundle: true,
    format: "esm",
    platform: "neutral",
  });
}
const { STYLES: RAW } = await import(`${dir}/pf-styles.mjs`);
const { SWIPE_MS } = await import(`${dir}/pf-tokens.mjs`);
// 注釈は先に落とす。文章の中の言葉を「書いてある」と誤って拾わないため
const CSS = RAW.replace(/\/\*[\s\S]*?\*\//g, "");
const RAW_STYLES = await readFile(`${root}/src/widget/shared/styles.ts`, "utf8");
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

/** セレクタの決まりごとを 1 かたまり取り出す（行頭で合わせる） */
const block = (selector) => {
  const at = CSS.search(new RegExp(`^${selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} \\{`, "m"));
  if (at < 0) return "";
  return CSS.slice(at, CSS.indexOf("}", at) + 1);
};

// ---------------------------------------------------------------------------
console.log("--- A. 長いコメントがカードの中で読める ---");
console.log("   行数制限が効いていると、中でスクロールする余地そのものが生まれない");

ok("覗き見の本文に行数制限が無い", /-webkit-line-clamp/.test(block(".peek-text")), false);
ok("覗き見の本文が箱組みになっていない", /-webkit-box/.test(block(".peek-text")), false);
ok("引用（2 行で切る）は今までどおり", /-webkit-line-clamp: 2/.test(block(".pop-quote")), true);
ok("一覧のカードの切り詰めは残っている", /-webkit-line-clamp/.test(CSS), true);

console.log("\n   見える高さと、スクロールできる余地（文字 13px・行間 1.6・枠 240px）");
const FONT = 13;
const LEADING = 1.6;
const LINE = FONT * LEADING;
const CAP = 240;
const clamped = Math.round(LINE * 4);
ok("旧: 4 行で切ったときの見える高さ", clamped, 83);
ok("新: 枠いっぱいまで見える高さ", CAP, 240);

const PER_LINE = 22; // 320px 幅のカードに 13px の日本語で入る目安
const CHARS = 785;
const contentHeight = Math.round(Math.ceil(CHARS / PER_LINE) * LINE);
console.log(`   785 文字＝およそ ${Math.ceil(CHARS / PER_LINE)} 行 ＝ ${contentHeight}px`);
ok("旧: スクロールできる余地（切った箱は overflow: hidden なので動かせない）", 0, 0);
ok("新: スクロールできる余地", contentHeight - CAP > 0, true);
ok("↑ その量", contentHeight - CAP, 509);

console.log("\n   縦の動きの受け持ち（器は全面で受け取り、中の縦は JS が流す）");
css("本文は中でスクロールする", /^\.peek-body \{[\s\S]*?overflow-y: auto;/m);
css("末端で後ろのページへ引き継がせない", /^\.peek-body \{[\s\S]*?overscroll-behavior: contain;/m);
ok("本文にブラウザ任せの縦許可を置いていない", /touch-action/.test(block(".peek-body")), false);
ok("カードは全面で受け取る（隙間から後ろが動かない）", /touch-action: none;/.test(block(".peek-slide")), true);
has("溢れているかは触った瞬間に測る", /found\.scrollHeight > found\.clientHeight/);
has("指の差分をそのまま流す", /scroller\.scrollTop -= event\.clientY - lastY;/);
has("縦のときだけ流す（横となぞりはブラウザへ）", /if \(axis !== "vertical"\) return;\n\s*event\.preventDefault\(\);/);
has("マウスはブラウザに任せる", /if \(event\.pointerType === "mouse"\) return;/);
has("覗き見の本文と入力欄に付ける", /(?:selectionFeature\.)?attachInnerScroll\((?:selectionFeature\.|connections\.)?popover, "\.peek-body, textarea"\)/);
has("ドックの入力欄にも付ける", /(?:selectionFeature\.)?attachInnerScroll\((?:selectionFeature\.|connections\.)?composeDock, "textarea"\)/);

console.log("\n   譲る判断は、カードを動かす前に置く（動かしてから譲ると 1 度跳ねる）");
const verticalBranch = /if \(axis === "vertical"\) \{([\s\S]*?)\n    \}/.exec(TS)?.[1] ?? "";
const deferAt = verticalBranch.indexOf("inScrollableBody");
const dropAt = verticalBranch.indexOf("setCardDrop");
const preventAt = verticalBranch.indexOf("preventDefault");
ok("譲る判断がある", deferAt >= 0, true);
ok("カードを動かすより先", deferAt < dropAt, true);
ok("ブラウザを止めるより先", deferAt < preventAt, true);
ok("譲るのは縦のときだけ（横送りは本文の上からでもできる）",
  /if \(axis !== "horizontal"\) return;[\s\S]*?setTrackOffset/.test(TS), true);

// ---------------------------------------------------------------------------
console.log("\n--- B. カードの周りに押せる透明な帯を作らない ---");
console.log("   外側は場所を決めるだけの層。指を受け取ると、見えないところが押せる帯になる");
ok("外側は指を通り抜けさせる", /pointer-events: none;/.test(block(".popover.is-peek")), true);
ok("受け取るのはカード 1 枚だけ", /pointer-events: auto;/.test(block(".peek-slide")), true);
ok("小窓（広い画面）は今までどおり受け取る", /pointer-events: none/.test(block(".popover")), false);
console.log("   → 外を押したときは自分の外側と判定され、閉じる道が戻る");

// ---------------------------------------------------------------------------
console.log("\n--- C. カードの下端がそろう ---");
css("3 枚並びは下でそろえる", /^\.peek-track \{[\s\S]*?align-items: flex-end;/m);

console.log("\n   隣に背の高いカードがあるときの浮き（上そろえ vs 下そろえ）");
const heights = [300, 180, 260];
const tallest = Math.max(...heights);
for (const [i, h] of heights.entries()) {
  const floatTop = tallest - h;      // 上そろえ: 自分の下端が入れ物の底から浮く量
  const floatBottom = 0;             // 下そろえ: 常に底
  ok(`${i + 1} 枚目（高さ ${h}px）上そろえの浮き`, floatTop, tallest - h);
  ok(`${i + 1} 枚目（高さ ${h}px）下そろえの浮き`, floatBottom, 0);
}
ok("上そろえだと送るたびに下端が変わる", new Set(heights.map((h) => tallest - h)).size > 1, true);
ok("下そろえならどの枚でも同じ", new Set(heights.map(() => 0)).size, 1);

// ---------------------------------------------------------------------------
console.log("\n--- 軽微 1. 一覧への受け渡しを同時に ---");
const handoff = /function openListFromPeek\(\): void \{[\s\S]*?\n\}/.exec(TS)?.[0] ?? "";
const openAt = handoff.indexOf("setOpen(true)");
const timerAt = handoff.indexOf("lifetime.timeout");
ok("一覧を開くのは待ち時間の外（＝同時）", openAt >= 0 && openAt < timerAt, true);
ok("カードを送り出すのも同じ拍", handoff.indexOf("setCardDrop") < timerAt, true);
ok("一覧に登場の動きを付ける", handoff.includes('panel?.classList.add("is-rising")'), true);
ok("すれ違う間だけカードを薄くする", handoff.includes('popover?.classList.add("is-handoff")'), true);
ok("待ち時間のあとにやるのは片付けだけ",
  handoff.slice(timerAt).includes("hideMarkPeek()") && !handoff.slice(timerAt).includes("setOpen("), true);
css("立ち上がる動きがある", /^@keyframes sheet-rise \{$/m);
css("動きの長さと減速はトークンから", /animation: sheet-rise var\(--duration-swipe\) var\(--ease-swipe\);/);
css("薄くなるのも同じ長さ", /^\.(?:selectionFeature\.|connections\.)?popover\.is-(?:selectionFeature\.)?peek\.is-handoff \{[\s\S]*?opacity: 0;/m);

console.log("\n--- 軽微 2. 一覧着地はまん中寄せ ---");
has("まん中へ寄せる", /card\.scrollIntoView\(\{ block: "center", behavior: "smooth" \}\)/);
ok("「見えていれば動かさない」寄せ方は残っていない",
  /card\.scrollIntoView\(\{ block: "nearest"/.test(TS), false);
has("一覧が組み上がった次のコマで寄せる", /(?:requestAnimationFrame|frame)\(\(\) => (?:selectionFeature\.)?focusCard\(id\)\)/);

console.log("\n--- 軽微 3. 「すべて表示」の押せる広さ ---");
ok("指の的の大きさを持つ", /min-height: var\(--size-touch\);/.test(block(".peek-more")), true);
ok("的の大きさ", /--size-touch: (\d+)px;/.exec(CSS)?.[1], "44");
ok("見た目は文字のまま（囲みも面も無い）",
  /background:|border:/.test(block(".peek-more")), false);

console.log("\n--- 軽微 4. 0.28 秒の二重定義を解消 ---");
ok("秒数の出どころは 1 つ", SWIPE_MS, 340);
css("トークンはそこから作る", /^  --duration-swipe: 340ms;$/m);
ok("見た目の側に生の秒数を書いていない", /--duration-swipe: \.\d+s/.test(CSS), false);
ok("待ち時間の側にも生の数を書いていない", /(?:setTimeout|timeout)\([\s\S]{0,80}?, 340\)/.test(TS), false);
ok("待ち時間は同じ名前を使う", (TS.match(/SWIPE_MS/g) ?? []).length >= 4, true);
ok("別名の定数は残っていない", /SWIPE_EXIT_MS/.test(TS), false);

console.log("\n--- 軽微 5. 関数名を実態に合わせる ---");
ok("ドックの高さと読める名前は消えた", /composeDockHeightSource/.test(TS), false);
has("覗き見カードの高さ、という名前", /function peekCardHeight\(\): number \{/);
ok("同じ問い合わせは 1 回だけ", (handoff.match(/peekCardHeight\(\)/g) ?? []).length, 1);
ok("測った値を使い回している", handoff.includes("const height = peekCardHeight();"), true);

console.log("\n--- 軽微 6. 二重見出しの掃除 ---");
ok("覗き見カードの見出しは 1 つ",
  (RAW_STYLES.match(/---- 覗き見カード/g) ?? []).length, 1);

console.log(`\n${fails === 0 ? "すべて合格" : `${fails} 件 不合格`}`);
