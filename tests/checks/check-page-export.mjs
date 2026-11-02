import { readWidgetSource } from "./widget-source.mjs";
/**
 * ページ右上の「書き出す」口が、PDF ボタンを置き換えて選択肢を出すかを確かめる。
 *
 * 見るのは 5 つ。
 *   1. PDF ボタンがあるときだけ差し込む（無い記事に道具を生やさない）
 *   2. 差し込んだあとはアイコンだけで、メニューは押すまで出さない
 *   3. 選択肢はコピー・保存・PDF の 3 つ
 *   4. コメントを含めるは、道具箱が出せる相手にだけ出る
 *   5. 公開ページで社外の人でも、元からある PDF ボタンは置き換わる
 *
 * 本体を jsdom に載せて、出た物を数える。
 */
import { readFile } from "node:fs/promises";

import { root, dir } from "./paths.mjs";
const { JSDOM } = await import("jsdom");
const { build } = await import(`${root}/node_modules/esbuild/lib/main.js`);

const read = (path) => readFile(`${root}/${path}`, "utf8");
const strip = (text) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");

await build({
  entryPoints: [`${root}/src/widget/reading/page-export.ts`],
  outfile: `${dir}/page-export.mjs`,
  bundle: true,
  format: "esm",
  platform: "neutral",
});

let fails = 0;
const ok = (label, actual, expected) => {
  const pass = String(actual) === String(expected);
  if (!pass) fails += 1;
  console.log(`${pass ? "OK  " : "NG  "} ${label}: ${actual}（期待: ${expected}）`);
};

const PRINT = `<div class="no-print"><button onclick="window.print()">PDF</button></div>`;

function install(win) {
  const names = [
    "window",
    "document",
    "navigator",
    "location",
    "HTMLElement",
    "Element",
    "Node",
    "customElements",
    "HTMLStyleElement",
    "ShadowRoot",
  ];
  for (const name of names) {
    if (!(name in win)) continue;
    const held = win[name];
    const value = typeof held === "function" && !/^[A-Z]/.test(name) ? held.bind(win) : held;
    Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
  }
}

/**
 * カスタム要素の class は、読み込んだ瞬間の HTMLElement を親にする。
 * 先に jsdom の HTMLElement を渡してから組み立てる（後から差し替えると別世界になる）。
 */
const boot = new JSDOM(
  `<!doctype html><html><head><title>お試し</title></head><body>${PRINT}<p>本文</p></body></html>`,
  { url: "https://example.com/public/samples/visibility-switch", pretendToBeVisual: true },
);
boot.window.navigator.clipboard = { writeText: async () => {} };
install(boot.window);

const {
  EXPORT_TAG,
  findPrintSlot,
  mountPageExport,
  setExportCommentsAvailable,
} = await import(`${dir}/page-export.mjs`);

// ---------------------------------------------------------------------------
console.log("--- 1. 差し込む場所 ---");

ok("タグ名は 1 つ", EXPORT_TAG, "surprise-page-export");

const slotted = new JSDOM(`<body>${PRINT}<p>本文</p></body>`).window.document;
ok("no-print を見つける", findPrintSlot(slotted)?.className, "no-print");

const onclickOnly = new JSDOM(
  `<body><div class="tools"><button onclick="window.print()">PDF</button></div></body>`,
).window.document;
ok("onclick の印刷ボタンの親を見つける", findPrintSlot(onclickOnly)?.className, "tools");

const bare = new JSDOM(`<body><p>本文だけ</p></body>`).window.document;
ok("ボタンが無い記事は触れない", findPrintSlot(bare), null);

// ---------------------------------------------------------------------------
console.log("\n--- 2. アイコンだけにして、押すまでメニューは出さない ---");

mountPageExport();
const host = boot.window.document.querySelector(EXPORT_TAG);
const shadow = host?.shadowRoot ?? null;
ok("差し込んだ", host !== null, true);
ok("元の PDF ボタンは消える", boot.window.document.body.textContent?.includes("PDF"), false);
ok("影がある", shadow !== null, true);
ok("トリガーがある", shadow?.querySelector(".trigger") !== null, true);
ok("名前は書き出す", shadow?.querySelector(".trigger")?.getAttribute("aria-label"), "書き出す");
ok("メニューはまだ無い", shadow?.querySelector(".menu"), null);
ok("押すと何かが開くことを機械に伝える", shadow?.querySelector(".trigger")?.getAttribute("aria-haspopup"), "menu");
ok("まだ閉じてる", shadow?.querySelector(".trigger")?.getAttribute("aria-expanded"), "false");

shadow?.querySelector(".trigger")?.click();
ok("押すとメニューが出る", shadow?.querySelector(".menu") !== null, true);
ok("開いていると伝える", shadow?.querySelector(".trigger")?.getAttribute("aria-expanded"), "true");

// ---------------------------------------------------------------------------
console.log("\n--- 3. 選択肢 ---");

const items = [...(shadow?.querySelectorAll("[role=menuitem]") ?? [])].map((node) => node.textContent);
ok("コピーがある", items.includes("コピーする"), true);
ok("保存がある", items.includes("ファイルに保存"), true);
ok("PDF がある", items.includes("PDF"), true);
ok("3 つだけ", items.length, 3);
ok("コメントの入り切りはまだ出ない", shadow?.querySelector(".check-row"), null);

const pdf = [...(shadow?.querySelectorAll("[role=menuitem]") ?? [])].find((node) => node.textContent === "PDF");
let printed = 0;
boot.window.print = () => {
  printed += 1;
};
pdf?.click();
ok("PDF は印刷に繋がる", printed, 1);
ok("選んだらメニューが畳まる", shadow?.querySelector(".menu"), null);

shadow?.querySelector(".trigger")?.click();
let written = "";
boot.window.navigator.clipboard.writeText = async (text) => {
  written = text;
};
const copyBtn = [...(shadow?.querySelectorAll("[role=menuitem]") ?? [])].find(
  (node) => node.textContent === "コピーする",
);
copyBtn?.click();
// 本文の書き出しの部品は、入口を置いたあと手が空いてから読む（まだなら押してから読む）。読み終えるまで待つ
for (let tick = 0; tick < 5; tick++) await new Promise((resolve) => setTimeout(resolve, 0));
ok("コピーした中身がマークダウン", written.startsWith("# お試し"), true);
ok("コピーに出典が入る", written.includes("/public/samples/visibility-switch"), true);
ok("コピーに本文が入る", written.includes("本文"), true);
ok("コピーに PDF は入らない", written.includes("PDF"), false);
ok("コピーしたらメニューが畳まる", shadow?.querySelector(".menu"), null);
ok("できたあとの名前", shadow?.querySelector(".trigger")?.getAttribute("aria-label"), "コピーしました");

// ---------------------------------------------------------------------------
console.log("\n--- 4. コメントを含めるは、出せる相手にだけ ---");

setExportCommentsAvailable(true);
shadow?.querySelector(".trigger")?.click();
ok("出せる相手には入り切りが出る", shadow?.querySelector(".check-row") !== null, true);
ok("コピー・保存と入り切りのあいだに区切りがある", (shadow?.querySelectorAll(".rule") ?? []).length, 2);
ok("名前", shadow?.querySelector(".check-label")?.textContent, "コメントを含める");
ok("本物のチェックボックス", shadow?.querySelector(".check-input")?.type, "checkbox");
ok("既定はオフ", shadow?.querySelector(".check-input")?.checked, false);

setExportCommentsAvailable(false);
ok("出せない相手からは消える", shadow?.querySelector(".check-row"), null);

// ---------------------------------------------------------------------------
console.log("\n--- 5. 本体がこの口を通しているか ---");

const widget = strip(await readWidgetSource());
ok("立ち上げで差し込む", /mountPageExport\(\)/.test(widget), true);
ok("道具箱より先", widget.indexOf("mountPageExport()") < widget.indexOf("if (visibility === \"internal\")"), true);
ok("コメントの出どころを渡す", /bindExportSource\(/.test(widget), true);
ok("出せる相手になったら入り切りを出す", /setExportCommentsAvailable\(true\)/.test(widget), true);
ok("出せなくなったら閉じる", /setExportCommentsAvailable\(false\)/.test(widget), true);
ok("公開ページでも差し込む（答えを待たない）", widget.indexOf("mountPageExport()") < widget.indexOf("void loadComments"), true);

const exportCode = strip(await read("src/widget/reading/page-export.ts"));
ok("無いページには生やさないと書いてある", /ボタンが無いページには何も足さない/.test(await read("src/widget/reading/page-export.ts")), true);
ok("コピーはクリップボードの共通の口へ", /writeClipboardText\(body\)/.test(exportCode), true);
ok("保存は download の口", /download\(markdownFileName\(\), "text\/markdown"/.test(exportCode), true);
ok("PDF は window.print", /window\.print\(\)/.test(exportCode), true);
ok("マークダウンは pageToMarkdown を通す", /pageToMarkdown\(/.test(exportCode), true);
ok("タグ名の出どころは util", /export const EXPORT_TAG = "surprise-page-export"/.test(await read("src/widget/shared/util.ts")), true);
ok("書き出す口は本文として数えない", /EXPORT_TAG/.test(strip(await read("src/widget/comments/anchor.ts"))), true);
ok("変換側も同じタグを落とす", /surprise-page-export/.test(await read("src/lib/pages/markdown.ts")), true);

console.log(fails === 0 ? "\nぜんぶ通った" : `\n${fails} 件が期待と違う`);
process.exitCode = fails === 0 ? 0 : 1;
