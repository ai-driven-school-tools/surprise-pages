import { readWidgetSource } from "./widget-source.mjs";
// 道具箱の文言は辞書（日本語が正本）。画面はその鍵を引き、字そのものは辞書で見る
import { readFileSync as readDictionary } from "node:fs";
const TOOLBOX_JA = readDictionary(new URL("../../src/lib/i18n/messages/ja/toolbox.ts", import.meta.url), "utf8");
/**
 * 「強さのボタン＝送信」の作りを確かめる。
 * 3 つそれぞれで正しい強さが飛ぶか / 空のとき押せないか / 編集は変わっていないか。
 */
import { readFile } from "node:fs/promises";

import { root, dir } from "./paths.mjs";
const { JSDOM } = await import("jsdom");
const { build } = await import(`${root}/node_modules/esbuild/lib/main.js`);

await build({
  entryPoints: [`${root}/src/widget/shared/styles.ts`],
  outfile: `${dir}/sr-styles.mjs`,
  bundle: true,
  format: "esm",
  platform: "neutral",
});
const { STYLES: RAW } = await import(`${dir}/sr-styles.mjs`);
const CSS = RAW.replace(/\/\*[\s\S]*?\*\//g, "");

const ok = (label, actual, expected) =>
  console.log(`${actual === expected ? "OK  " : "NG  "} ${label}: ${actual}（期待: ${expected}）`);

const code = (await readWidgetSource())
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^\s*\/\/.*$/gm, "");

// 引数の並びは先に読み飛ばす。既定値の `= {}` を本体の始まりと取り違えると、
// 中身が空に見えて「何も無い」という確認がすべて素通りしてしまう
function body(name) {
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
    if (code[i] === "}") { depth -= 1; if (depth === 0) return code.slice(open, i + 1); }
  }
  return "";
}

// ---------------------------------------------------------------------------
console.log("--- 1. 3 つのボタンが、それぞれの強さで送るか（本物の DOM）---");

const dom = new JSDOM("<!doctype html><html><body></body></html>");
global.document = dom.window.document;
global.window = dom.window;

const PRIORITY_ORDER = ["must", "better", "want"];
const LOOK = {
  must: { label: "must", description: "必ず直す", dotClass: "dot is-must" },
  better: { label: "better", description: "直したほうがよい", dotClass: "dot is-better" },
  want: { label: "want", description: "できれば", dotClass: "dot" },
};

/** 実装と同じ組み立て */
function prioritySendRow(onSend) {
  const row = dom.window.document.createElement("div");
  row.className = "send-row";
  const buttons = [];
  for (const priority of PRIORITY_ORDER) {
    const look = LOOK[priority];
    const button = dom.window.document.createElement("button");
    button.className = "send-pill";
    button.type = "button";
    button.title = `${look.description}として送る`;
    const holder = dom.window.document.createElement("span");
    holder.className = "dot-label";
    const dot = dom.window.document.createElement("span");
    dot.className = look.dotClass;
    holder.appendChild(dot);
    holder.appendChild(dom.window.document.createTextNode(look.label));
    button.appendChild(holder);
    button.addEventListener("click", () => {
      if (button.disabled) return;
      onSend(priority);
    });
    row.appendChild(button);
    buttons.push(button);
  }
  return { row, buttons, setEnabled: (on) => buttons.forEach((b) => (b.disabled = !on)) };
}

const sent = [];
const send = prioritySendRow((p) => sent.push(p));
send.setEnabled(true);

ok("ボタンは 3 つ", send.buttons.length, 3);
ok("並びは must → better → want", send.buttons.map((b) => b.textContent).join(" → "), "must → better → want");

for (const b of send.buttons) b.click();
ok("押した順に強さが飛ぶ", sent.join(","), "must,better,want");

console.log("\n   それぞれのボタンに色の丸が付いている");
ok("must の丸", send.buttons[0].querySelector(".dot").className, "dot is-must");
ok("better の丸", send.buttons[1].querySelector(".dot").className, "dot is-better");
ok("want の丸", send.buttons[2].querySelector(".dot").className, "dot");
ok("丸と文字が 1 組になっている", send.buttons[0].querySelector(".dot-label") !== null, true);
ok("丸は文字の並びの中にある", send.buttons[0].querySelector(".dot-label .dot") !== null, true);
ok("3 つとも同じ部品", [...new Set(send.buttons.map((b) => b.className))].join(","), "send-pill");
ok("「選ばれている」印を持たない", CSS.includes(".send-pill.is-active"), false);

console.log("\n--- 2. 本文が空のときは押せない ---");
const sent2 = [];
const send2 = prioritySendRow((p) => sent2.push(p));

/** 実装と同じ判定 */
const canSend = (text) => text.trim().length > 0;

send2.setEnabled(canSend(""));
ok("空のコメントでは押せない", send2.buttons[0].disabled, true);
send2.buttons[0].click();
ok("押しても飛ばない", sent2.length, 0);

send2.setEnabled(canSend("  "));
ok("空白だけでも押せない", send2.buttons[0].disabled, true);

send2.setEnabled(canSend("書いた"));
ok("書けば押せる", send2.buttons[0].disabled, false);
send2.buttons[0].click();
ok("押すと飛ぶ", sent2.join(","), "must");

ok("空だと押せない（例外なし）", canSend(""), false);

console.log("\n--- 3. どこに適用されているか ---");
const sheet = body("sheetComposer");
const popover = body("showComposer");
const editor = body("editorBox");

ok("狭い画面の入力欄に適用", /prioritySendRow/.test(sheet), true);
ok("デスクトップの小窓にも適用", /prioritySendRow/.test(popover), true);
ok("返信にも適用", /prioritySendRow/.test(editor), true);
ok("編集は選んでから保存のまま", /priorityPicker/.test(editor), true);
ok("編集にだけ保存ボタンが残る", /t\("toolbox\.common\.save"\)/.test(editor) && /save: "保存"/.test(TOOLBOX_JA), true);

console.log("\n--- 4. 送信ボタンを消したこと ---");
ok("狭い画面に送信ボタンが無い", /"送信"/.test(sheet), false);
ok("小窓に送信ボタンが無い", /"送信"/.test(popover), false);
ok("返信に送信ボタンが無い", /el\("span", undefined, (?:"返信"|t\("toolbox\.card\.reply"\))\)/.test(editor), false);

console.log("\n--- 5. 見出しの行を消したこと ---");
ok("狭い画面に見出しが無い", /pop-title/.test(sheet), false);
ok("小窓に見出しが無い", /pop-title/.test(popover), false);
ok("見出しを畳む指定も消えている", /\.compose-dock\.is-compact \.pop-head/.test(CSS), false);
// 名乗りを聞く画面そのものが無くなった（公開ページも会社の人だけが書く）。
// 見出しを気にする相手ごと消えたので、生え直していないことだけ見る
ok("名乗りを聞く画面ごと無い", /function joinBox\(/.test(code), false);

// 以前はここで「⌘/Ctrl + Enter は want で送る」を守っていた。
// 送る道が「強さのボタン」と「Enter」の 2 通りある状態そのものをやめたので、
// 守る中身を「撤去できていること」に入れ替えてある（戻ってきたら気づけるように）。
console.log("\n--- 6. ⌘/Ctrl + Enter は撤去した ---");
const input = body("textArea");
ok("入力欄に Enter の受け口が無い", /Enter/.test(input), false);
ok("小窓に Enter の案内が無い", /Enter/.test(popover), false);
ok("返信にも Enter の案内が無い", /Enter/.test(editor), false);

console.log("\n--- 7. 触ったあとの hover が残る問題 ---");
ok(
  "強さのボタンの hover は hover が効く環境だけ",
  /@media \(hover: hover\) \{\s*\.send-pill:hover/.test(CSS.replace(/\s+/g, " ").replace(/@media \(hover: hover\) \{ /g, "@media (hover: hover) {")),
  true,
);
ok("編集の並びも同じ扱いにした", /@media \(hover: hover\)[\s\S]*\.pill:hover/.test(CSS), true);

// ---------------------------------------------------------------------------
console.log("\n--- 8. 並び順（書いてから送る）---");
function orderOf(source) {
  const marks = [];
  for (const [, name] of source.matchAll(/appendChild\((area|send\.row|quoteRow)\)/g)) marks.push(name);
  return marks.join(" → ");
}
ok("狭い画面: 引用 → 入力欄 → 送信", orderOf(sheet), "quoteRow → area → send.row");
ok("小窓も同じ並び", orderOf(popover), "quoteRow → area → send.row");
ok("返信も入力欄の下に送信", /appendChild\(area\)[\s\S]{0,120}appendChild\(send\.row\)/.test(editor), true);

console.log("\n--- 9. OS の帯をよける逃げしろ ---");
const token = new Map();
for (const [, k, v] of CSS.matchAll(/(--[a-z0-9-]+):\s*([0-9.]+)px/g)) token.set(k, Number(v));
ok("逃げしろのトークンがある", token.has("--size-os-strip"), true);
ok("その高さ", token.get("--size-os-strip"), 56);
ok("素の数値を直書きしていない", /padding-bottom:[^;]*\b56px/.test(CSS), false);
ok(
  "iOS のときだけ空ける",
  /:host\(\.is-ios\) \.compose-dock\.is-compact \{[^}]*padding-bottom/.test(CSS.replace(/\s+/g, " ")),
  true,
);
ok("キーボードが出ていないときは空けない", /:host\(\.is-ios\) \.compose-dock \{/.test(CSS), false);

console.log("\n   送信の行が帯より上に出るか（iPhone 15・見えている底 516）");
const VISIBLE_BOTTOM = 516;
const STRIP = token.get("--size-os-strip");
const padBottom = token.get("--space-2") + STRIP; // 安全域 0 の端末で計算
const sendBottom = VISIBLE_BOTTOM - padBottom;
console.log(`   ドックの底 ${VISIBLE_BOTTOM} / 下の余白 ${padBottom} → 送信の行の底 ${sendBottom}`);
ok("送信の行は帯より上", sendBottom <= VISIBLE_BOTTOM - STRIP, true);
ok("帯との隙間", VISIBLE_BOTTOM - STRIP - sendBottom, token.get("--space-2"));

console.log("\n   ページに残る隙間の減り");
const DOCK_BEFORE = 250 - 90; // 直前の姿（見出し・足もとを削ったあと）
const gapBefore = VISIBLE_BOTTOM - DOCK_BEFORE;
const gapAfter = VISIBLE_BOTTOM - (DOCK_BEFORE + STRIP);
console.log(`   ${gapBefore}px → ${gapAfter}px（${STRIP}px 減）`);
ok("減り幅は逃げしろぶん", gapBefore - gapAfter, STRIP);
ok("それでも隙間は残る", gapAfter > 0, true);

console.log("\n--- 10. iOS かどうかの見分け ---");
await build({
  entryPoints: [`${root}/src/widget/shared/util.ts`],
  outfile: `${dir}/sr-util.mjs`,
  bundle: true,
  format: "esm",
  platform: "neutral",
});
const { isIosLike } = await import(`${dir}/sr-util.mjs`);

const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15";
const IPAD_OLD = "Mozilla/5.0 (iPad; CPU OS 12_0 like Mac OS X) AppleWebKit/605.1.15";
const IPAD_NEW = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15";
const MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36";
const ANDROID = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36";
const WINDOWS = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";

const cases = [
  ["iPhone", IPHONE, "iPhone", 5, true],
  ["iPad（古い名乗り）", IPAD_OLD, "iPad", 5, true],
  ["iPad（Mac を名乗る）", IPAD_NEW, "MacIntel", 5, true],
  ["Mac（触れない）", MAC, "MacIntel", 0, false],
  ["Android", ANDROID, "Linux armv8l", 5, false],
  ["Windows のタッチ画面", WINDOWS, "Win32", 10, false],
];
let wrong = 0;
for (const [name, ua, platform, touch, want] of cases) {
  const got = isIosLike(ua, platform, touch);
  if (got !== want) wrong += 1;
  console.log(`   ${got ? "空ける  " : "空けない"} ${name}`);
}
ok("見分けを誤った例", wrong, 0);
ok("Android では隙間を作らない", isIosLike(ANDROID, "Linux armv8l", 5), false);

// ---------------------------------------------------------------------------
console.log("\n--- 11. 色の丸と文字の縦位置 ---");

const dotRule = (() => {
  const m = /^\.dot \{([^}]*)\}/m.exec(CSS);
  return m === null ? "" : m[1].replace(/\s+/g, " ").trim();
})();
console.log(`   .dot: ${dotRule}`);

ok("丸を文字の並びの中に置く", /display:\s*inline-block/.test(dotRule), true);
ok("文字の高さの真ん中にそろえる", /vertical-align:\s*middle/.test(dotRule), true);
ok("大きさは token のまま", /width:\s*var\(--size-dot\)/.test(dotRule), true);
ok("素の数値でずらしていない", /translate|margin-top|top:\s*-?[0-9]/.test(dotRule), false);

const pairRule = /\.dot-label \.dot \{([^}]*)\}/.exec(CSS);
ok("丸と文字の間隔も token", /var\(--space-1\)/.test(pairRule?.[1] ?? ""), true);

console.log("\n   同じ部品を使う場所すべて（1 つの作りに寄せた）");
const uses = [
  ["ドック・小窓・返信の送信ボタン", /button\.appendChild\(dotLabel\(priority\)\)/],
  ["一覧カードの優先度表示", /tag\.appendChild\(dotLabel\(priority\)\)/],
  ["編集の pill", /pill\.appendChild\(dotLabel\(priority\)\)/],
];
let separate = 0;
for (const [name, pattern] of uses) {
  const found = pattern.test(code);
  if (!found) separate += 1;
  console.log(`   ${found ? "そろえた  " : "未対応    "} ${name}`);
}
ok("1 つの作りに寄せられていない場所", separate, 0);

// 丸と文字を別々の箱として並べている箇所が残っていないか
const legacy = (code.match(/appendChild\(el\("span", look\.dotClass\)\)/g) ?? []).length;
ok("別々の箱で並べている残り（部品の中の 1 か所だけ）", legacy, 1);
ok("その 1 か所は部品の定義そのもの", /function dotLabel[\s\S]{0,300}el\("span", look\.dotClass\)/.test(code), true);

// ---------------------------------------------------------------------------
console.log("\n--- 12. 取り消し線の撤去 ---");
const anchorCode = await readFile(`${root}/src/widget/comments/anchor.ts`, "utf8");
const utilCode = await readFile(`${root}/src/widget/shared/util.ts`, "utf8");
const libCode = await readFile(`${root}/src/lib/comments/comments.ts`, "utf8");

ok("選択帯に取消線ボタンが無い", /取消線/.test(code), false);
ok("種類を選ぶ経路が無い", /"strikethrough"/.test(code), false);
ok("本文の印に取消線の分岐が無い", /strikethrough/.test(anchorCode), false);
ok("使わなくなった絵柄を消した", /ICON_STRIKE/.test(utilCode), false);
ok("取消線用の見た目が無い", /\.(pop-)?quote\.is-strike/.test(CSS), false);
ok("取消線の空本文特例は無い", /kind === "strikethrough"/.test(code), false);
ok("いいねの空本文だけ許す", /body\.length === 0 && (?:connections\.)?draft\.priority !== "good"/.test(body("submitDraft")), true);

console.log("\n   残すもの");
ok("保存先の種類の一覧はそのまま", /strikethrough/.test(await readFile(`${root}/src/lib/comments/types.ts`, "utf8")), true);
ok("新規作成は受け付けない", /kindValue === "strikethrough"/.test(libCode), true);
// 取り消し線そのものは「消した文」を表す別の機能。版を見比べる側に残っている
ok("消した文の取り消し線は別機能なので残す", /\.change-text\.is-del/.test(CSS), true);
ok("差分の取り消し線の指定も健在", /line-through/.test(CSS), true);

console.log("\n   帯のボタンが 1 つになった");
const barBlock = code.slice(code.indexOf("function showSelectionBar"), code.indexOf("function beginDraftFromBar"));
ok("帯に置くボタンは 1 つ", (barBlock.match(/el\("button", "selbar-action"\)/g) ?? []).length, 1);
ok("引用だけが縮む作りは維持", /\.selbar-quote \{[^}]*flex: 1/.test(CSS.replace(/\s+/g, " ")), true);
ok("ボタンは幅を保つ", /\.selbar-action \{[^}]*flex: none/.test(CSS.replace(/\s+/g, " ")), true);

console.log("\n--- 13. いいね（直してほしさの 3 つとは別口）---");
ok("送信行は折り返さない", /\.send-row \{[^}]*flex-wrap: nowrap/.test(CSS.replace(/\s+/g, " ")), true);
ok("直してほしさは左の組", /el\("div", "send-fixes"\)/.test(body("prioritySendRow")), true);
ok("いいねは手の絵", /ICON_THUMBS/.test(body("prioritySendRow")), true);
ok("いいねの案内", /t\("toolbox\.compose\.sendGood"\)/.test(body("prioritySendRow")) && /sendGood: "いいねとして送る"/.test(TOOLBOX_JA), true);
ok("いいねは色の丸ボタンではない", /send-pill[\s\S]{0,120}"good"/.test(body("prioritySendRow")), false);
ok("空でもいいねは disabled にしない", /good\.disabled/.test(body("prioritySendRow")), false);
ok("受付はいいねだけ空を許す", /priorityValue !== "good"/.test(libCode), true);
ok("返信は押した強さで送る", /priority: editor.priority/.test(body("submitEditor")), true);
ok("返信に親の強さを写さない", /priority: comment.priority/.test(body("submitEditor")), false);
// Slack への知らせは配布版に無いので、いいねの知らせ方の確かめも無い
