/**
 * 狭い画面で、入力欄の文字が 16px 以上になっているかを確かめる。
 *
 * 16px を下回ると iOS が画面ごと勝手に拡大する。実機を出さずに確かめるため、
 * 見た目の指定を読み取り、優先順位（詳細度 → 記述順）を自前でたどって
 * 「結局どの指定が勝つか」を出している。
 */
import { root, dir } from "./paths.mjs";
const { build } = await import(`${root}/node_modules/esbuild/lib/main.js`);

await build({
  entryPoints: [`${root}/src/widget/shared/styles.ts`],
  outfile: `${dir}/w-styles.mjs`,
  bundle: true,
  format: "esm",
  platform: "neutral",
});
const { STYLES: RAW_STYLES } = await import(`${dir}/w-styles.mjs`);

// 注釈を先に落とす。残したまま読むと、注釈の中の文字を指定と取り違える
// （注釈に書いた "maximum-scale" を「使っている」と誤って数えてしまう）
const STYLES = RAW_STYLES.replace(/\/\*[\s\S]*?\*\//g, "");

// --- トークンの値を読み取る -------------------------------------------------
const tokens = new Map();
for (const [, name, value] of STYLES.matchAll(/(--font-[a-z]+):\s*([0-9.]+)px/g)) {
  tokens.set(name, Number(value));
}

function toPx(value) {
  const varName = /var\((--[a-z-]+)\)/.exec(value);
  if (varName !== null) return tokens.get(varName[1]) ?? null;
  const px = /([0-9.]+)px/.exec(value);
  return px !== null ? Number(px[1]) : null;
}

// --- 指定を全部拾う ---------------------------------------------------------
/** { selector, fontSize, order } の一覧 */
const rules = [];
let order = 0;
for (const [, selectorText, body] of STYLES.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
  const font = /(?:^|;)\s*font-size:\s*([^;]+)/.exec(body);
  const inherits = /(?:^|;)\s*font:\s*inherit/.test(body);
  for (const selector of selectorText.split(",")) {
    const trimmed = selector.trim().replace(/\s+/g, " ");
    if (trimmed.length === 0 || trimmed.startsWith("@") || trimmed.startsWith("/*")) continue;
    rules.push({
      selector: trimmed,
      fontSize: font !== null ? toPx(font[1].trim()) : null,
      inherits,
      order: order++,
    });
  }
}

/** 詳細度。:host(.x) は「擬似クラス + 中身」で数える */
function specificity(selector) {
  let b = 0;
  let c = 0;
  let rest = selector;
  const host = /:host\(([^)]*)\)/.exec(rest);
  if (host !== null) {
    b += 1 + (host[1].match(/\./g) ?? []).length;
    rest = rest.replace(host[0], " ");
  } else if (/:host\b/.test(rest)) {
    b += 1;
    rest = rest.replace(":host", " ");
  }
  b += (rest.match(/\.[a-z-]+/g) ?? []).length;
  b += (rest.match(/:[a-z-]+/g) ?? []).length;
  c += (rest.match(/(^|\s|>)[a-z]+[a-z0-9]*/gi) ?? []).length;
  return b * 1000 + c;
}

/** その要素にこの指定が当たるか（この道具で使っている形だけを見る簡易版） */
function matches(selector, element, narrow) {
  const parts = selector.split(" ").filter((p) => p.length > 0);
  const needsNarrow = parts.some((p) => p.includes(":host(.is-narrow)"));
  if (needsNarrow && !narrow) return false;

  const rest = parts.filter((p) => !p.startsWith(":host"));
  if (rest.length === 0) return selector.includes(":host") && !selector.includes("(");

  const last = rest[rest.length - 1];
  if (last.replace(/:[a-z-]+$/, "") !== element.tag) return false;
  if (/:focus|:hover|::selection|:focus-visible/.test(last)) return false;

  // 先祖の指定（.composer など）が要るか
  for (const ancestor of rest.slice(0, -1)) {
    const name = ancestor.replace(/^\./, "");
    if (!element.ancestors.includes(name)) return false;
  }
  return true;
}

/** 継承元（:host の font-size） */
const hostRule = rules.find((r) => r.selector === ":host" && r.fontSize !== null);
const inheritedPx = hostRule?.fontSize ?? null;

function effectiveFontSize(element, narrow) {
  const hits = rules
    .filter((r) => r.fontSize !== null && matches(r.selector, element, narrow))
    .sort((a, b) => specificity(a.selector) - specificity(b.selector) || a.order - b.order);
  if (hits.length === 0) return { px: inheritedPx, from: ":host からの継承" };
  const winner = hits[hits.length - 1];
  return { px: winner.fontSize, from: winner.selector };
}

// --- 洗い出した入力欄 -------------------------------------------------------
const elements = [
  { name: "ドックの入力欄", tag: "textarea", ancestors: ["compose-dock", "sheet-compose", "composer"] },
  { name: "返信・編集の入力欄", tag: "textarea", ancestors: ["card", "composer"] },
  { name: "小窓の入力欄（広い画面）", tag: "textarea", ancestors: ["popover", "composer"] },
  { name: "名乗りの名前欄", tag: "input", ancestors: ["join", "join-row"] },
  { name: "Slack のチャンネル検索", tag: "input", ancestors: ["share", "share-search"] },
  { name: "Slack の添え書き", tag: "textarea", ancestors: ["share"] },
  { name: "（将来足す入力欄・指定なし）", tag: "textarea", ancestors: [] },
  { name: "（将来足す入力欄・指定なし）", tag: "input", ancestors: [] },
];

console.log(`トークン: ${[...tokens].map(([k, v]) => `${k}=${v}px`).join(" / ")}`);
console.log("");
console.log("入力欄                            狭い画面   広い画面   勝った指定（狭い画面）");
console.log("-".repeat(92));

let tooSmall = 0;
for (const element of elements) {
  const narrow = effectiveFontSize(element, true);
  const wide = effectiveFontSize(element, false);
  if (narrow.px === null || narrow.px < 16) tooSmall += 1;
  console.log(
    `${element.name.padEnd(32)}  ${String(narrow.px).padStart(4)}px  ${String(wide.px).padStart(6)}px   ${narrow.from}`,
  );
}
console.log("-".repeat(92));

const ok = (label, actual, expected) =>
  console.log(`${actual === expected ? "OK  " : "NG  "} ${label}: ${actual}（期待: ${expected}）`);

ok("狭い画面で 16px 未満の入力欄", tooSmall, 0);

// デスクトップの密度は変えていないこと
const desktopSizes = elements.map((e) => effectiveFontSize(e, false).px);
ok("広い画面はこれまでどおり（13px のまま）", desktopSizes.every((px) => px === 13), true);

// 拡大を禁じる手を使っていないこと
ok("maximum-scale を使っていない", /maximum-scale/.test(STYLES), false);
ok("user-scalable を使っていない", /user-scalable/.test(STYLES), false);

// トークン経由であること（リテラル散布をしていない）
const flat = STYLES.replace(/\s+/g, " ");
ok(
  "トークンを参照している（素の 16px を書いていない）",
  /:host\(\.is-narrow\) textarea, :host\(\.is-narrow\) input \{ font-size: var\(--font-lg\)/.test(flat),
  true,
);
ok("素の 16px を直書きしていない", /font-size:\s*16px/.test(STYLES), false);
