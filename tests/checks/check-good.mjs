import { readWidgetSource } from "./widget-source.mjs";
/**
 * コメントの「いいね」。直してほしさ（must / better / want）とは別口。
 *
 * 見るのは 4 つ。
 *   1. 種類の正本に good があり、送信の 3 つには入っていない
 *   2. 頭文字 g が good に当たらない（startsWith で食われる事故）
 *   3. 空本文はいいねだけ受け、must は拒む
 *   4. 画面は手の絵の別口で、色の丸ボタンに並べない
 *
 * 保管庫にもネットワークにも繋がない。
 */
import { readFile } from "node:fs/promises";

import { root, dir } from "./paths.mjs";
const { build } = await import(`${root}/node_modules/esbuild/lib/main.js`);

await build({
  entryPoints: [`${root}/src/lib/comments/types.ts`],
  outfile: `${dir}/good-types.mjs`,
  bundle: true,
  format: "esm",
  platform: "neutral",
});
await build({
  entryPoints: [`${root}/src/widget/shared/util.ts`],
  outfile: `${dir}/good-util.mjs`,
  bundle: true,
  format: "esm",
  platform: "neutral",
});
const { COMMENT_PRIORITIES, FIX_PRIORITIES, isFixPriority } = await import(`${dir}/good-types.mjs`);
const { PRIORITY_ORDER, PRIORITY_LOOK, priorityFromKey, ICON_THUMBS } = await import(`${dir}/good-util.mjs`);

const ok = (label, actual, expected) =>
  console.log(`${actual === expected ? "OK  " : "NG  "} ${label}: ${actual}（期待: ${expected}）`);

const types = await readFile(`${root}/src/lib/comments/types.ts`, "utf8");
const lib = await readFile(`${root}/src/lib/comments/comments.ts`, "utf8");
const widget = await readWidgetSource();
const css = await readFile(`${root}/src/widget/shared/styles.ts`, "utf8");
const sql = await readFile(`${root}/db/migrations/0012_comment_priority_good.sql`, "utf8");

const strip = (text) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const code = strip(widget);

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

console.log("--- 1. 種類の正本 ---");
ok("good がある", COMMENT_PRIORITIES.includes("good"), true);
ok("送信の 3 つに good は無い", FIX_PRIORITIES.includes("good"), false);
ok("送信の並び", FIX_PRIORITIES.join(","), "must,better,want");
ok("画面のボタンも同じ並び", PRIORITY_ORDER.join(","), "must,better,want");
ok("いいねは直してほしさではない", isFixPriority("good"), false);
ok("must は直してほしさ", isFixPriority("must"), true);
ok("丸印の表に good は無い", Object.hasOwn(PRIORITY_LOOK, "good"), false);
ok("種類は FIX_PRIORITIES を広げる", /COMMENT_PRIORITIES = \[\.\.\.FIX_PRIORITIES, "good"\]/.test(strip(types)), true);

console.log("\n--- 2. 近道が good を拾わない ---");
ok("g は good に当たらない", priorityFromKey("g"), null);
ok("m は must のまま", priorityFromKey("m"), "must");
ok("手の絵がある", ICON_THUMBS.length > 0, true);

console.log("\n--- 3. 空本文 ---");
ok("新規はいいねだけ空を許す", /priorityValue !== "good"/.test(strip(lib)), true);
ok("直しも must の空は拒む", /priority !== "good"/.test(strip(lib)), true);
ok("下書きの空もいいねだけ", /(?:selectionFeature\.)?draft\.priority !== "good"/.test(fn("submitDraft")), true);
ok("編集の空もいいねだけ", /editor\.priority !== "good"/.test(fn("submitEditor")), true);

console.log("\n--- 4. 画面 ---");
ok("いいねとして送る", /t\("toolbox\.compose\.sendGood"\)/.test(fn("prioritySendRow")) && /sendGood: "いいねとして送る"/.test(await readFile(`${root}/src/lib/i18n/messages/ja/toolbox.ts`, "utf8")), true);
ok("手の絵で送る", /ICON_THUMBS/.test(fn("prioritySendRow")), true);
ok("色の丸ボタンに並べない", /send-pill[\s\S]{0,80}"good"/.test(fn("prioritySendRow")), false);
ok("右端は手の絵", /margin-left: auto/.test(css), true);
ok("送信行は折り返さない", /flex-wrap: nowrap/.test(css), true);
ok("鍵盤の案内は置かない", /function shortcutBadge\(/.test(code), false);
ok("カードのいいねも手の絵", /priority === "good"/.test(fn("priorityTag")), true);
// Slack への知らせは配布版に無いので、知らせの文面の確かめも無い
ok("保管庫の縛りを足している", /drop constraint page_comments_priority_check/.test(sql), true);
ok("縛りに good がある", /'must', 'better', 'want', 'good'/.test(sql), true);
ok("返信は押した強さ", /priority: editor.priority/.test(fn("submitEditor")), true);
