/**
 * 画面の文言を辞書へ移したファイルを、検査表が**日本語の字面で**見続けるための道具（docs/guides/i18n.md）。
 *
 * 画面のファイルには `t("admin.title")` の形で鍵しか残らない。逐語で文言を見張っていた検査表は、
 * 鍵を日本語の辞書（正本）の値に置き換えた写しを見る——見張る言葉は 1 字も変えずに済み、
 * 辞書の値が変われば今までどおり落ちる（検査を弱めない）。
 *
 * - `jaText("admin.title")` … 日本語の辞書の値。数で形が変わる文は `other`（日本語は 2 つとも同じ字）
 * - `withJaText(source)` … `t("鍵", …)`・`rt("鍵", …)`・`defaultTranslate("鍵", …)` を `"日本語"` に置き換えた写し。
 *   差し込みは `{name}` の印のまま残る（`` `${count} 人` `` は `"{count} 人"` として現れる）
 */
import { build } from "esbuild";
import { pathToFileURL } from "node:url";
import { root, dir } from "./paths.mjs";

await build({
  entryPoints: [`${root}/src/lib/i18n/messages/ja.ts`],
  outfile: `${dir}/i18n-ja-text.mjs`,
  bundle: true,
  format: "esm",
  platform: "node",
  logLevel: "silent",
});
const { ja } = await import(pathToFileURL(`${dir}/i18n-ja-text.mjs`).href);

/** 日本語の辞書の値。無い鍵は投げる（鍵の打ち間違いを「文言が無い」と取り違えない）。 */
export function jaText(key) {
  let node = ja;
  for (const part of key.split(".")) {
    if (node === null || typeof node !== "object" || !(part in node)) throw new Error(`辞書に無い鍵: ${key}`);
    node = node[part];
  }
  if (typeof node === "string") return node;
  if (node && typeof node.other === "string") return node.other;
  throw new Error(`文ではない鍵: ${key}`);
}

/** 辞書に実在する鍵か（投げない）。 */
function isKey(key) {
  try {
    jaText(key);
    return true;
  } catch {
    return false;
  }
}

/**
 * 鍵を引く呼び出しを、日本語の辞書の値（引用符つき）に置き換えた写し。
 * 表に置いた鍵（`["approved", "admin.done.approved"]` の形）も、辞書に実在する鍵なら同じく置き換える。
 */
export function withJaText(source) {
  return source
    .replace(/\b(?:t|rt|defaultTranslate)\("([\w.]+)"(?:,\s*\{[^{}]*\})?\)/g, (_, key) => JSON.stringify(jaText(key)))
    .replace(/"([A-Za-z]\w*(?:\.\w+)+)"/g, (whole, key) => (isKey(key) ? JSON.stringify(jaText(key)) : whole));
}
