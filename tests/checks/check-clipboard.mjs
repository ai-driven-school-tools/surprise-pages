/**
 * 「コピー」のボタンが、ブラウザに新しい書き込みの口を断られても写せるかを確かめる。
 *
 * 2026-10-02、本文で文字を選んで小窓のコピーを押すと「コピーできませんでした」が出た。
 * 開いていたブラウザ（アプリの中のブラウザ）は、クリップボードへの書き込みの許可を
 * 拒んでいて（`navigator.clipboard.writeText` が NotAllowedError: Write permission denied）、
 * 同じ押した操作の中で `copy` の出来事を起こす昔の口なら写せた（実機で確認）。
 *
 * 見るのは 2 つ。
 *   1. 共通の口（src/lib/workspace/clipboard.ts）が、新しい口に断られたら昔の口で写し、写せた・写せなかったを返す
 *   2. 画面とページの道具箱のコピーは、全部この口を通る（新しい口を直に呼ぶ場所を残さない）
 */
import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";

import { root, dir } from "./paths.mjs";
const { JSDOM } = await import("jsdom");
const { build } = await import(`${root}/node_modules/esbuild/lib/main.js`);

const ok = (label, actual, expected) =>
  console.log(`${actual === expected ? "OK  " : "NG  "} ${label}: ${actual}（期待: ${expected}）`);

console.log("\n# 1. 新しい口に断られても写せる");

const dom = new JSDOM("<!doctype html><html><body></body></html>");
const { window } = dom;
globalThis.document = window.document;
Object.defineProperty(globalThis, "navigator", { configurable: true, value: window.navigator });

/** 昔の口（execCommand("copy")）の真似。押した操作の中なら copy の出来事を起こす。 */
let legacyAllowed = true;
let pasted = null;
window.document.execCommand = (command) => {
  if (command !== "copy" || !legacyAllowed) return false;
  const data = new Map();
  const event = new window.Event("copy", { bubbles: true, cancelable: true });
  Object.defineProperty(event, "clipboardData", {
    value: { setData: (type, value) => data.set(type, value) },
  });
  const notCanceled = window.document.dispatchEvent(event);
  // 取り消されなかったら、ブラウザは選んでいる文字（ここでは空）を写す
  pasted = notCanceled ? "" : (data.get("text/plain") ?? null);
  return true;
};

await build({
  entryPoints: [`${root}/src/lib/workspace/clipboard.ts`],
  outfile: `${dir}/clipboard.mjs`,
  bundle: true,
  format: "esm",
  platform: "neutral",
});
const { writeClipboardText } = await import(`${dir}/clipboard.mjs`);

let modern = null;
Object.defineProperty(window.navigator, "clipboard", {
  configurable: true,
  value: { writeText: async (text) => { modern = text; } },
});
ok("新しい口が使えるときはそちらで写す", await writeClipboardText("あ"), true);
ok("新しい口に渡した文字", modern, "あ");
ok("昔の口は使わない", pasted, null);

Object.defineProperty(window.navigator, "clipboard", {
  configurable: true,
  value: { writeText: async () => { throw new window.DOMException("Write permission denied.", "NotAllowedError"); } },
});
ok("書き込みを断られても写せた", await writeClipboardText("選んだ文字"), true);
ok("昔の口で写した文字", pasted, "選んだ文字");

pasted = null;
let otherListener = 0;
const other = () => { otherListener += 1; };
window.document.addEventListener("copy", other);
await writeClipboardText("2 回目");
window.document.removeEventListener("copy", other);
ok("ページの他の copy の受け手に渡さない", otherListener, 0);
await writeClipboardText("3 回目");
ok("受け手は 1 回ごとに外す（前の文字が残らない）", pasted, "3 回目");

Object.defineProperty(window.navigator, "clipboard", { configurable: true, value: undefined });
ok("新しい口が無くても写せた", await writeClipboardText("口なし"), true);
ok("口なしで写した文字", pasted, "口なし");

legacyAllowed = false;
pasted = null;
Object.defineProperty(window.navigator, "clipboard", {
  configurable: true,
  value: { writeText: async () => { throw new window.DOMException("denied", "NotAllowedError"); } },
});
ok("どちらも断られたら「写せなかった」を返す", await writeClipboardText("x"), false);

console.log("\n# 2. コピーは全部この口を通る");

const files = execFileSync("git", ["ls-files", "src/app", "src/widget", "src/lib"], { cwd: root, encoding: "utf8" })
  .split("\n")
  .filter((file) => /\.(ts|tsx|mjs)$/.test(file) && !file.includes("/dist/") && !file.includes(".generated."));
const direct = [];
for (const file of files) {
  if (file === "src/lib/workspace/clipboard.ts") continue;
  const source = (await readFile(`${root}/${file}`, "utf8")).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  if (/clipboard\s*\.\s*write(Text)?\s*\(|navigator\s*\.\s*clipboard\b/.test(source)) direct.push(file);
}
ok("新しい口を直に呼ぶ場所", direct.join(", ") || "なし", "なし");

const users = [
  "src/widget/comments/sharing.ts",
  "src/widget/reading/page-export.ts",
  "src/widget/reading/page-agent-review.ts",
  "src/app/_components/copy-row.tsx",
  "src/app/_components/workspace-list.tsx",
  "src/app/create/create-document.tsx",
];
for (const file of users) {
  const source = await readFile(`${root}/${file}`, "utf8");
  ok(`${file} は共通の口を使う`, /writeClipboardText\(/.test(source), true);
}
