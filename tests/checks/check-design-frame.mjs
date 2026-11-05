/**
 * 投稿ページの額縁の色と書体（.claude/skills/_shared/references/base.html の --ads-*）を、それを写す場所と突き合わせる。
 *
 * 額縁の色は RGB の 3 つ組で、明るい側・暗い側・印刷の側の 3 か所に書いてある。写す場所は 5 つあり、どれも
 * 書き写しなので、額縁の値を直した日に 1 か所だけ古い色が残っても、明るい画面では気づけない（暗い画面でだけ沈む・浮く）。
 *
 *   1. 額縁そのもの: 暗い側・印刷の側が同じ名前をそろえて持つか。印刷は明るい側と同じか。端末の枠の色が地と同じか
 *   2. 図を貼る一式（src/templates/mermaid.html）: 名前が無い素のページで落ちる色が額縁と同じか。書体の並びが額縁と同じか。
 *      色を書くのは落ち先と、溶かす印（mask の #000）だけか
 *   3. スライドの実行部（src/templates/deck.html）: 生の色を書かず、額縁にある名前だけを読むか
 *   4. スライドの手本（tests/checks/fixtures/internal/example/deck-showcase.html）: 色が額縁と同じか（机だけは面 2 段目）
 *   5. 印と共有カードの色（src/lib/settings/brand.ts）: 額縁の同じ側の値から採っているか（新しい黒を作らない・DESIGN.md 3 章）
 *
 * 保管庫にもネットワークにも繋がない。
 */
import { readFile } from "node:fs/promises";
import { root } from "./paths.mjs";

const read = (path) => readFile(`${root}/${path}`, "utf8");
let fails = 0;
const ok = (label, actual, expected) => {
  const shown = (value) => (typeof value === "string" ? value : JSON.stringify(value));
  const pass = shown(actual) === shown(expected);
  if (!pass) fails += 1;
  console.log(`${pass ? "OK  " : "NG  "} ${label}: ${shown(actual).slice(0, 200)}（期待: ${shown(expected).slice(0, 200)}）`);
};

const FRAME_PATH = ".claude/skills/_shared/references/base.html";
const frame = await read(FRAME_PATH);
/** 額縁の 11 の名前（--ads-<名前>）。足すときはここと額縁の 3 か所を一緒に直す */
const NAMES = ["bg", "surface", "surface-2", "border", "text", "body", "muted", "line", "accent", "positive", "negative"];
const adsIn = (block) => Object.fromEntries([...(block ?? "").matchAll(/--ads-([a-z0-9-]+):\s*([\d\s]+);/g)].map(([, name, value]) => [name, value.trim().split(/\s+/).join(" ")]));
const hexOf = (triple) => `#${triple.split(" ").map((one) => Number(one).toString(16).padStart(2, "0")).join("")}`;
const sorted = (values) => Object.fromEntries(Object.entries(values).sort(([a], [b]) => a.localeCompare(b)));

console.log("\n--- 1. 額縁そのもの ---");
const light = adsIn(/:root \{([\s\S]*?)\n    \}/.exec(frame)?.[1]);
const dark = adsIn(/@media screen and \(prefers-color-scheme: dark\) \{\s*:root \{([\s\S]*?)\n      \}/.exec(frame)?.[1]);
const print = adsIn(/@media print \{[\s\S]*?:root \{([\s\S]*?)\n      \}/.exec(frame)?.[1]);
ok("明るい側が 11 の名前を全部持つ", Object.keys(light).sort(), [...NAMES].sort());
ok("暗い側が同じ名前を全部持つ", Object.keys(dark).sort(), [...NAMES].sort());
ok("印刷の側は明るい側と同じ値", sorted(print), sorted(light));
ok("端末の枠の色（明るい側）が地と同じ", /media="\(prefers-color-scheme: light\)" content="([^"]+)"/.exec(frame)?.[1], hexOf(light.bg ?? ""));
ok("端末の枠の色（暗い側）が地と同じ", /media="\(prefers-color-scheme: dark\)" content="([^"]+)"/.exec(frame)?.[1], hexOf(dark.bg ?? ""));
const frameCss = [...frame.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/g)].map((match) => match[1].replace(/\/\*[\s\S]*?\*\//g, "")).join("\n");
ok("額縁の CSS は生の色を書かない（名前の値の 3 つ組だけ）", frameCss.match(/#[0-9a-fA-F]{3,8}\b|rgba?\(\s*\d/g) ?? [], []);
const frameFont = /sans: \[([^\]]+)\]/.exec(frame)?.[1]?.split(",").map((one) => one.trim().replace(/^'|'$/g, "")).join(", ");
ok("額縁の書体の並びが読み取れる", (frameFont ?? "").includes('"Hiragino Sans"'), true);

console.log("\n--- 2. 図を貼る一式 ---");
const mermaid = await read("src/templates/mermaid.html");
const kit = mermaid.slice(mermaid.indexOf("-->") + 3).replace(/\/\*[\s\S]*?\*\//g, "");
// 明暗で同じ値の名前は 1 つだけ書く（color("--ads-line", "#737373")）。違う名前は dark ? 暗 : 明
const fallbacks = Object.fromEntries([...kit.matchAll(/color\("--ads-([a-z0-9-]+)", (?:dark \? "(#[0-9a-f]{6})" : "(#[0-9a-f]{6})"|"(#[0-9a-f]{6})")\)/g)].map(([, name, dim, bright, both]) => [name, { light: bright ?? both, dark: dim ?? both }]));
ok("代わりの色が読み取れる（6 つ）", Object.keys(fallbacks).sort(), ["bg", "border", "line", "muted", "surface-2", "text"]);
ok("代わりの色が額縁と同じ（明 / 暗）", Object.entries(fallbacks).filter(([name, pair]) => pair.light !== hexOf(light[name] ?? "") || pair.dark !== hexOf(dark[name] ?? "")).map(([name]) => name), []);
const strayColors = kit
  .replace(/color\("--ads-[a-z0-9-]+", (?:dark \? "#[0-9a-f]{6}" : "#[0-9a-f]{6}"|"#[0-9a-f]{6}")\)/g, "")
  .replace(/mask-image: linear-gradient\([^;]*\)/g, "")
  .match(/#[0-9a-fA-F]{3,8}\b|rgba?\(\s*\d/g) ?? [];
ok("色を書くのは落ち先と溶かす印だけ（ほかは額縁から採る）", strayColors, []);
ok("書体の並びが額縁と同じ", /const FONT = '([^']+)'/.exec(kit)?.[1], frameFont);

console.log("\n--- 3. スライドの実行部 ---");
const deck = await read("src/templates/deck.html");
const runtime = deck.slice(deck.indexOf("-->") + 3).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const runtimeOwn = runtime.replace(/\/\* DECK_MEDIA_START \*\/[\s\S]*?\/\* DECK_MEDIA_END \*\//, "");
ok("生の色を書かない（額縁の名前か OS の色に落ちる）", runtimeOwn.match(/#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b(?![\w-])|rgba?\(\s*\d/g) ?? [], []);
const readNames = [...new Set([...runtime.matchAll(/"--ads-([a-z0-9-]+)"/g)].map((match) => match[1]))].sort();
ok("額縁の名前を読んでいる", readNames.length > 0, true);
ok("読む名前は全部額縁にある", readNames.filter((name) => !NAMES.includes(name)), []);

console.log("\n--- 4. スライドの手本 ---");
// 手本は額縁を持たないので、使う名前だけを自分で書いている。机（実行部が --ads-surface を読む）だけは面 2 段目の値を置く
const SHOWCASE_AS = { surface: "surface-2" };
const showcase = await read("tests/checks/fixtures/internal/example/deck-showcase.html");
const showcaseLight = adsIn(/<style>\s*:root \{([\s\S]*?)\}/.exec(showcase)?.[1]);
const showcaseDark = adsIn(/@media \(prefers-color-scheme: dark\) \{\s*:root \{([\s\S]*?)\}/.exec(showcase)?.[1]);
const wrong = (values, want) => Object.entries(values).filter(([name, value]) => value !== want[SHOWCASE_AS[name] ?? name]).map(([name]) => name);
ok("手本の色が読み取れる（明暗で同じ名前）", Object.keys(showcaseLight).length > 0 && Object.keys(showcaseLight).sort().join() === Object.keys(showcaseDark).sort().join(), true);
ok("手本の色が額縁と同じ（明・机は面 2 段目）", wrong(showcaseLight, light), []);
ok("手本の色が額縁と同じ（暗・机は面 2 段目）", wrong(showcaseDark, dark), []);

console.log("\n--- 5. 印と共有カードの色 ---");
const brand = await read("src/lib/settings/brand.ts");
const pairs = Object.fromEntries([...brand.matchAll(/export const (\w+) = \{ light: "(#[0-9a-f]{6})", dark: "(#[0-9a-f]{6})" \} as const;/g)].map(([, name, bright, dim]) => [name, { light: bright, dark: dim }]));
ok("印の色が読み取れる（墨・地・灰）", Object.keys(pairs).sort(), ["GROUND", "INK", "QUIET"]);
const palette = (side) => new Set(Object.values(side).map(hexOf));
ok("印の色は額縁の同じ側の値から採る", Object.entries(pairs).flatMap(([name, pair]) => [
  ...(palette(light).has(pair.light) ? [] : [`${name}.light`]),
  ...(palette(dark).has(pair.dark) ? [] : [`${name}.dark`]),
]), []);
ok("印の墨は額縁の文字色", [pairs.INK?.light, pairs.INK?.dark], [hexOf(light.text ?? ""), hexOf(dark.text ?? "")]);
ok("印の地（明るい側）は額縁の地", pairs.GROUND?.light, hexOf(light.bg ?? ""));

console.log(`\n${fails === 0 ? "すべて合格" : `${fails} 件 不合格`}`);
process.exitCode = fails === 0 ? 0 : 1;
