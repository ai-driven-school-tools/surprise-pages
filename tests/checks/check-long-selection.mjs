/** 長い選択を、取得 → 保存 → 再読込 → 印の復元まで切らずに保つ。通信はしない。 */
import { createRequire } from "node:module";
import { writeFile } from "node:fs/promises";
import { JSDOM } from "jsdom";
import { build } from "esbuild";
import { root, dir } from "./paths.mjs";

const stub = `${dir}/long-selection-db.mjs`;
await writeFile(stub, `
export const getDb = () => ({ from: () => ({ insert: row => ({ select: () => ({
  single: async () => ({ error: null, data: {
    ...JSON.parse(JSON.stringify(row)), id: 'saved-comment',
    created_at: '2026-09-18T00:00:00Z', updated_at: '2026-09-18T00:00:00Z',
  } }),
}) }) }) });
// 組織で絞った口も同じ偽物を返す
export const orgDb = () => getDb();
`);
await build({
  entryPoints: [`${root}/src/widget/comments/anchor.ts`], outfile: `${dir}/long-selection-anchor.mjs`,
  bundle: true, format: "esm", platform: "neutral",
});
await build({
  stdin: { contents: `export * from './src/lib/comments/comments'; export { QUOTE_MAX_LENGTH } from './src/lib/comments/types';`, resolveDir: root, loader: "ts" },
  outfile: `${dir}/long-selection-server.cjs`, bundle: true, format: "cjs", platform: "node",
  alias: { "@/lib/db/database": stub },
});
const anchor = await import(`${dir}/long-selection-anchor.mjs`);
const server = createRequire(import.meta.url)(`${dir}/long-selection-server.cjs`);
let failures = 0;
function ok(label, actual, expected = true) {
  const pass = actual === expected;
  if (!pass) failures += 1;
  console.log(`${pass ? "OK  " : "NG  "} ${label}`);
}
const payload = quote => ({ pageSlug: "internal/example/long-selection", quote, body: "この範囲について", kind: "comment" });
const author = { kind: "member", email: "test@example.com", name: "検査用", image: null };
// コメントは門を通ったページ（組織つき）に結んで足す
const page = {
  id: "00000000-0000-4000-8000-0000000000aa",
  pageSlug: payload(null).pageSlug,
  organization: { id: "00000000-0000-4000-8000-000000000001", assetPrefix: "" },
};

console.log("--- 選択した末尾まで保存して復元する ---");
for (const length of [99, 100, 101, 1200]) {
  const first = "導入の見出し";
  const middle = "あ".repeat(length) + "😀";
  const last = "最後の段落の選択はここまで。";
  const expected = `${first} ${middle} ${last}`;
  const html = `<p>選択の前</p><section><h2>${first}</h2><p><strong>${middle}</strong></p><p>${last}</p></section><p>選択の後</p>`;
  const dom = new JSDOM(html);
  for (const key of ["window", "document", "Node", "Element", "HTMLElement", "Text", "NodeFilter"]) {
    globalThis[key] = key === "window" ? dom.window : dom.window[key];
  }
  const selection = window.getSelection();
  const range = document.createRange();
  range.selectNodeContents(document.querySelector("section"));
  selection.addRange(range);
  const captured = anchor.captureSelection();
  ok(`${length}文字超: 選択の全文が残る`, captured?.quote === expected);
  ok(`${length}文字超: 後ろの文脈は実際の選択末尾から採る`, captured?.context.afterText === " 選択の後");
  const kept = anchor.stashSelection(captured);
  selection.removeAllRanges();
  const validated = server.validateNewComment({ ...payload(kept.quote), quoteContext: kept.context });
  ok(`${length}文字超: サーバーが全文を受け取る`, validated.ok && validated.value.quote === expected);
  if (validated.ok) {
    const saved = JSON.parse(JSON.stringify(await server.createComment(page, validated.value, author, "version")));
    ok(`${length}文字超: 保存後の応答にも全文がある`, saved.quote === expected);
    for (const phase of ["投稿後", "再読込後"]) {
      document.body.innerHTML = html;
      anchor.applyHighlights([saved]);
      const highlighted = [...document.querySelectorAll("mark")].map(mark => mark.textContent).join("");
      ok(`${length}文字超: ${phase}も末尾まで印が付く`, highlighted === first + middle + last);
      ok(`${length}文字超: ${phase}に範囲外へ印が付かない`, document.querySelector("body > p mark") === null);
    }
  }
  dom.window.close();
}

console.log("--- 保存上限でも黙って切らない ---");
const atLimit = "あ".repeat(server.QUOTE_MAX_LENGTH);
const allowed = server.validateNewComment(payload(atLimit));
ok("上限ちょうどは全文を保持する", allowed.ok && allowed.value.quote === atLimit);
const rejected = server.validateNewComment(payload(atLimit + "い"));
ok("上限を超えたら短縮して成功させず理由を返す", !rejected.ok && rejected.reason.includes("選択"));
ok("引用の無いコメントも受ける", server.validateNewComment(payload(null)).ok);
process.exitCode = failures > 0 ? 1 : 0;
