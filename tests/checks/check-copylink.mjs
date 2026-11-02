import { readWidgetSource } from "./widget-source.mjs";
/**
 * 右下の「リンクをコピー」を押したあと、絵柄がしばらくチェックになるかを確かめる。
 *
 * 見るのは 4 点。
 *   1. 待ち／できた の姿が 1 か所で決まる（別のチェックを発明していない）
 *   2. バーも狭い画面の板の頭も、同じ口で絵柄を塗る
 *   3. できたときだけ印を付け、失敗では付けない。戻す長さは知らせと同じ
 *   4. コメント 1 件へのリンクは、右下の鎖を動かさない
 *
 * 判定そのものは util.ts の素の関数を**そのまま呼んで**確かめる。
 * 組み立て側は、本体と同じ手順を写して本物の DOM で動かす。
 */
import { readFile } from "node:fs/promises";

import { root, dir } from "./paths.mjs";
const { JSDOM } = await import("jsdom");
const { build } = await import(`${root}/node_modules/esbuild/lib/main.js`);

const dom = new JSDOM("<!doctype html><html><body></body></html>");
globalThis.document = dom.window.document;

for (const [name, out] of [
  ["shared/util", "cl-util"],
  ["shared/toast", "cl-toast"],
  ["shared/styles", "cl-styles"],
]) {
  await build({
    entryPoints: [`${root}/src/widget/${name}.ts`],
    outfile: `${dir}/${out}.mjs`,
    bundle: true,
    format: "esm",
    platform: "neutral",
  });
}

const { copyLinkLook, paintCopyLinkButton, COPY_CHECK_STROKE, ICON_CHECK, ICON_LINK } = await import(
  `${dir}/cl-util.mjs`
);
const { SUCCESS_LIFE_MS } = await import(`${dir}/cl-toast.mjs`);
const { STYLES: RAW } = await import(`${dir}/cl-styles.mjs`);
const CSS = RAW.replace(/\/\*[\s\S]*?\*\//g, "");

const ok = (label, actual, expected) =>
  console.log(`${actual === expected ? "OK  " : "NG  "} ${label}: ${actual}（期待: ${expected}）`);

/** 注記を落として、実際に動くところだけを見る。 */
const code = (await readWidgetSource())
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^\s*\/\/.*$/gm, "");

function fn(name) {
  const at = code.indexOf(`function ${name}(`);
  if (at < 0) return "";
  let cursor = code.indexOf("(", at);
  let paren = 0;
  for (; cursor < code.length; cursor += 1) {
    if (code[cursor] === "(") paren += 1;
    if (code[cursor] === ")") {
      paren -= 1;
      if (paren === 0) break;
    }
  }
  const open = code.indexOf("{", cursor);
  let depth = 0;
  for (let i = open; i < code.length; i += 1) {
    if (code[i] === "{") depth += 1;
    if (code[i] === "}") {
      depth -= 1;
      if (depth === 0) return code.slice(open, i + 1);
    }
  }
  return "";
}

function pathD(button) {
  return [...button.querySelectorAll("path")].map((node) => node.getAttribute("d"));
}

// ---------------------------------------------------------------------------
console.log("--- 1. 待ちとできたの姿 ---");

const idle = copyLinkLook(false);
const done = copyLinkLook(true);
ok("待ちの絵柄は鎖", idle.paths === ICON_LINK, true);
ok("待ちの名前", idle.label, "リンクをコピー");
ok("できた絵柄は既にあるチェック", done.paths === ICON_CHECK, true);
ok("できた名前", done.label, "コピーしました");
ok("別のチェックを発明していない", done.paths[0], ICON_CHECK[0]);

const button = document.createElement("button");
paintCopyLinkButton(button, false);
ok("塗ったあとの名前", button.title, "リンクをコピー");
ok("機械にも同じ名前", button.getAttribute("aria-label"), "リンクをコピー");
ok("色用の印は付けない", button.className, "");
ok("鎖の線の太さは既定", button.querySelector("svg")?.getAttribute("stroke-width"), "2");
ok("鎖の線の数", pathD(button).length, ICON_LINK.length);
ok("鎖の線", pathD(button).join("|"), ICON_LINK.join("|"));

paintCopyLinkButton(button, true);
ok("できたあとの名前", button.title, "コピーしました");
ok("できたあとも機械に伝える", button.getAttribute("aria-label"), "コピーしました");
ok("できても色用の印は付けない", button.className, "");
ok("絵柄は 1 つだけ残る", button.querySelectorAll(".icon").length, 1);
ok("チェックの線", pathD(button).join("|"), ICON_CHECK.join("|"));
ok("色は currentColor のまま", button.querySelector("svg")?.getAttribute("stroke"), "currentColor");
ok("斜め線は白に溶けない太さ", button.querySelector("svg")?.getAttribute("stroke-width"), String(COPY_CHECK_STROKE));
ok("その太さは既定より太い", COPY_CHECK_STROKE > 2, true);

paintCopyLinkButton(button, false);
ok("戻すと名前も戻る", button.title, "リンクをコピー");
ok("戻しても色用の印は付けない", button.className, "");
ok("戻すと鎖に戻る", pathD(button).join("|"), ICON_LINK.join("|"));

// ---------------------------------------------------------------------------
console.log("\n--- 2. バーも狭い画面も同じ口 ---");

ok("バーはページのコピー口を使う", /copyPageUrl/.test(fn("renderBar")), true);
ok("バーは塗りの口を通す", /paintCopyLinkButton\((?:connections\.)?barLink, (?:sharingFeature\.)?linkCopied\)/.test(fn("renderBar")), true);
ok("狭い画面も同じコピー口", /copyPageUrl/.test(fn("buildPanel")), true);
ok("狭い画面も同じ塗り口", /paintCopyLinkButton\((?:connections\.)?narrowLink, (?:sharingFeature\.)?linkCopied\)/.test(fn("buildPanel")), true);
ok("描き直しでも狭い画面の印を保つ", /paintCopyLinkButton\((?:connections\.)?narrowLink, (?:sharingFeature\.)?linkCopied\)/.test(fn("render")), true);
ok("2 つのボタンをまとめて塗る口がある", /function paintCopyButtons\(/.test(code), true);
ok("まとめて塗る口がバーを見る", /paintCopyLinkButton\((?:connections\.)?barLink, (?:sharingFeature\.)?linkCopied\)/.test(fn("paintCopyButtons")), true);
ok("まとめて塗る口が狭い画面も見る", /paintCopyLinkButton\((?:connections\.)?narrowLink, (?:sharingFeature\.)?linkCopied\)/.test(fn("paintCopyButtons")), true);

// ---------------------------------------------------------------------------
console.log("\n--- 3. できたときだけ印を付け、知らせと同じ長さで戻す ---");

const copyPage = fn("copyPageUrl");
ok("コピーは同じ口を通す", /(?:sharingFeature\.)?copyText\((?:sharingFeature\.)?pageUrl\(\), t\("toolbox\.common\.linkCopied"\)\)/.test(copyPage), true);
ok("できたときだけ印を付ける", /if \(ok\) markLinkCopied\(\)/.test(copyPage), true);

const copy = fn("copyText");
ok("写せたかどうかを共通の口から受けてそのまま返す", /const written = await writeClipboardText\(text\)[\s\S]*return written;/.test(copy), true);
ok("失敗したら false を返す", /return false/.test(copy), true);
ok("コピーの口そのものは印を付けない", /markLinkCopied/.test(copy), false);

const mark = fn("markLinkCopied");
ok("戻す長さは知らせと同じ", /SUCCESS_LIFE_MS/.test(mark), true);
ok("秒数を直書きしていない", /2400/.test(mark), false);
ok("知らせの長さそのもの", SUCCESS_LIFE_MS, 2400);
ok("バー全体を作り直さない", /\brender\(/.test(mark), false);
ok("タイマーが来たら印を外す", /linkCopied = false/.test(mark), true);
ok("外すときも同じ塗り口", /paintCopyButtons\(\)/.test(mark), true);

ok("できたあとも色は変えない", /\.is-copied/.test(CSS), false);
ok("塗る口も色の印を付けない", /is-copied/.test(await readFile(`${root}/src/widget/shared/util.ts`, "utf8")), false);

// ---------------------------------------------------------------------------
console.log("\n--- 4. コメント 1 件のリンクは右下を動かさない ---");

ok("コメントのリンクはページのコピー口を使わない", /copyPageUrl/.test(fn("commentCard")), false);
ok(
  "コメントのリンクは自分の行き先を写す",
  /(?:sharingFeature\.)?copyText\(`\$\{(?:sharingFeature\.)?pageUrl\(\)\}#c=\$\{comment\.id\}`/.test(fn("commentCard")),
  true,
);
