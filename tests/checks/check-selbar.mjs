import { readWidgetSource } from "./widget-source.mjs";
/**
 * 画面下の帯が「選んだ文言そのもの」を安全に出しているかを確かめる。
 *
 * 見るのは 3 つ。
 *   1. 出す文字が、写し取った値から来ていること（選択を二度読みしない）
 *   2. 文字として置いていること（記号がタグとして解釈されない）
 *   3. 縮むのは引用だけで、ボタンの幅は保たれること
 */
import { readFile } from "node:fs/promises";

import { root, dir } from "./paths.mjs";

/** 注記を落として、実際に動くところだけを見る（注記の文言を実装と取り違えないため）。 */
function codeOnly(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

const source = codeOnly(await readWidgetSource());
const util = codeOnly(await readFile(`${root}/src/widget/shared/util.ts`, "utf8"));

const { build } = await import(`${root}/node_modules/esbuild/lib/main.js`);
await build({
  entryPoints: [`${root}/src/widget/shared/styles.ts`],
  outfile: `${dir}/w-styles2.mjs`,
  bundle: true,
  format: "esm",
  platform: "neutral",
});
const { STYLES: RAW } = await import(`${dir}/w-styles2.mjs`);
const STYLES = RAW.replace(/\/\*[\s\S]*?\*\//g, "");

const ok = (label, actual, expected) =>
  console.log(`${actual === expected ? "OK  " : "NG  "} ${label}: ${actual}（期待: ${expected}）`);

// showSelectionBar の中身だけを切り出す
const start = source.indexOf("function showSelectionBar");
const body = source.slice(start, source.indexOf("\n}", start));

console.log("--- 1. どこから文字を持ってきているか ---");
ok("写し取った値を出している", /el\("span", "selbar-quote", pendingAnchor\.quote\)/.test(body), true);
ok("固定の文言「選択した部分に」は無い", /選択した部分に/.test(source), false);
ok("帯の中で選択を読み直していない", /captureSelection\(\)/.test(body), false);

console.log("\n--- 2. 文字として置いているか（記号がタグにならないか）---");
// el() は第 3 引数を textContent に入れる作り
ok("el() は textContent に入れる", /node\.textContent = text/.test(util), true);
ok("帯の組み立てで innerHTML を使っていない", /innerHTML/.test(body), false);

// innerHTML を使っている場所が、固定の図形だけであること
const innerHtmlLines = [...source.matchAll(/^.*innerHTML.*$/gm)].map((m) => m[0].trim());
const utilInnerHtml = [...util.matchAll(/^.*innerHTML.*$/gm)].map((m) => m[0].trim());
console.log(`   comments.ts の innerHTML: ${innerHtmlLines.length} 件`);
console.log(`   util.ts の innerHTML:     ${utilInnerHtml.length} 件（アイコンの図形のみ）`);
ok("本体では innerHTML を一切使っていない", innerHtmlLines.length, 0);
ok("道具側も 1 か所だけ（アイコン）", utilInnerHtml.length, 1);
ok("その 1 か所は利用者の文字を混ぜない", /span\.innerHTML =/.test(util), true);

// 危ない文字を入れても、文字のまま扱われることの確認（写し取りは文字列を複製するだけ）
await build({
  entryPoints: [`${root}/src/widget/comments/anchor.ts`],
  outfile: `${dir}/w-anchor2.mjs`,
  bundle: true,
  format: "esm",
  platform: "neutral",
});
const { stashSelection } = await import(`${dir}/w-anchor2.mjs`);
const nasty = '<img src=x onerror=alert(1)> と "引用" の <b>混ざり物</b>';
const kept = stashSelection({ quote: nasty, context: { beforeText: "", afterText: "" } });
ok("危ない文字もそのままの文字として保たれる", kept.quote, nasty);
ok("加工や取りこぼしをしていない", kept.quote.length, nasty.length);

console.log("\n--- 3. 縮むのは引用だけか ---");
// 行頭から始まる単独の指定だけを拾う（".quote-row .pop-quote" のような
// 修飾つきの指定を、本体と取り違えないため）
const rule = (name) => {
  const m = new RegExp(`^\\.${name}\\s*\\{([^}]*)\\}`, "m").exec(STYLES);
  return m === null ? "" : m[1].replace(/\s+/g, " ").trim();
};
const quoteRule = rule("selbar-quote");
const actionRule = rule("selbar-action");
console.log(`   引用:   ${quoteRule}`);
console.log(`   ボタン: ${actionRule}`);
ok("引用は伸び縮みする", /flex: 1/.test(quoteRule), true);
ok("引用は縮める設定がある", /min-width: 0/.test(quoteRule), true);
ok("あふれたら末尾を省く", /text-overflow: ellipsis/.test(quoteRule), true);
ok("1 行に収める", /white-space: nowrap/.test(quoteRule), true);
ok("ボタンは縮まない", /flex: none/.test(actionRule), true);

console.log("\n--- 引用らしさ（既存の語彙と同じか）---");
const popQuote = rule("pop-quote");
const bodyQuote = rule("quote");
const borderOf = (r) => (/border-left: ([^;]+)/.exec(r) ?? [, "なし"])[1];
console.log(`   本文中の引用: ${borderOf(bodyQuote)}`);
console.log(`   小窓の引用:   ${borderOf(popQuote)}`);
console.log(`   帯の引用:     ${borderOf(quoteRule)}`);
ok("帯の引用も左に 1 本（既存と同じ）", borderOf(quoteRule), borderOf(popQuote));
