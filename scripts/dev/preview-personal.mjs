/** 架空データだけのブラウザ検証。既存の保存先には接続しない。終了すると保管庫も消す。 */
import EmbeddedPostgres from "embedded-postgres";
import { randomBytes } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { build } from "esbuild";
import { initializeDatabase } from "../setup/database.mjs";
import { childProcesses, prepareDisposableDevApp, startDisposableDevApp } from "../../tests/support/disposable-app.mjs";
import { mirrorTestApp } from "../../tests/support/test-app-build.mjs";
import { parse } from "parse5";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const temp = await mkdtemp(path.join(tmpdir(), "pages-browser-"));
const reserve = createServer();
await new Promise((resolve) => reserve.listen(0, "127.0.0.1", resolve));
const address = reserve.address();
if (!address || typeof address === "string") throw new Error("試験用の保存先を作れません");
const port = address.port;
await new Promise((resolve) => reserve.close(resolve));
const password = randomBytes(24).toString("hex");
const cluster = new EmbeddedPostgres({ databaseDir: path.join(temp, "db"), user: "preview_admin", password, port, persistent: false,
  postgresFlags: ["-h", "127.0.0.1", "-k", temp], onLog: () => {}, onError: () => {} });
let mirror, store;
try {
  await cluster.initialise(); await cluster.start();
  const runtime = await initializeDatabase(`postgres://preview_admin:${password}@127.0.0.1:${port}/postgres`, "owner@example.com");
  Object.assign(process.env, { DATABASE_URL: runtime, PAGES_EDITION: "personal", PAGES_OWNER_EMAIL: "owner@example.com", PAGES_SITE_URL: "http://127.0.0.1:3148" });
  const stub = path.join(temp, "stub.mjs");
  await writeFile(stub, `export const ALLOWED_DOMAIN="example.com"; export const auth=async()=>null; export const headers=async()=>({get:()=>null}); export const cookies=async()=>({get:()=>undefined}); export const dangerouslyDeleteByTag=async()=>{}; export const getCache=()=>({get:async()=>null,set:async()=>{},delete:async()=>{}});`);
  const out = path.join(temp, "fixture.cjs");
  await build({ stdin: { contents: `export * from "${root}/src/lib/db/database"; export * from "${root}/src/lib/pages/store"; export * from "${root}/src/lib/organization/scope";`, resolveDir: root, loader: "ts" }, bundle: true, platform: "node", format: "cjs", outfile: out, alias: { "@/auth": stub, "next/headers": stub, "@vercel/functions": stub } });
  store = createRequire(import.meta.url)(out);
  const template = await readFile(path.join(root, "src/templates/mermaid.html"), "utf8");
  const pieces = [];
  const visit = (node) => {
    if (["script", "style"].includes(node.nodeName) && node.sourceCodeLocation) pieces.push(template.slice(node.sourceCodeLocation.startOffset, node.sourceCodeLocation.endOffset));
    for (const child of node.childNodes ?? []) visit(child);
  };
  visit(parse(template, { sourceCodeLocationInfo: true }));
  const diagram = pieces.join("\n");
  const deck = await readFile(path.join(root, "src/templates/deck.html"), "utf8");
  const author = { email: "owner@example.com", name: "試行する人" };
  const organization = await store.currentOrganization();
  const html = `<!doctype html><html lang="ja"><head><meta charset="utf-8"><title>図解の試行</title><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{font:16px/1.8 sans-serif;max-width:760px;margin:auto;padding:48px 24px}h1{font-size:28px}</style>${diagram}</head><body><h1>図解の試行</h1><p>この文章にコメントを付けて、原本の修正につなげます。</p><pre class="mermaid">flowchart LR\n A[資料を作る] --> B[共有する] --> C[コメントで直す]</pre></body></html>`;
  await store.commitRevision({ organization, pageSlug: "internal/trial/diagram", html: html.replace("原本の修正", "資料の修正"), message: "初版", author });
  await store.commitRevision({ organization, pageSlug: "internal/trial/diagram", html, message: "本文を更新", author });
  await store.commitRevision({ organization, pageSlug: "internal/trial/deck", html: `<!doctype html><html lang="ja"><head><meta charset="utf-8"><title>スライドの試行</title><meta name="viewport" content="width=device-width,initial-scale=1"></head><body data-deck><main data-deck-slides><section data-deck-slide><h1 style="font-size:64px;padding:80px">自分の判断を伝える</h1></section><section data-deck-slide><h2 style="font-size:48px;padding:80px">作る → 共有 → 直す</h2><aside data-deck-notes>発表者だけの架空のメモ</aside></section></main>${deck}</body></html>`, message: "初版", author });
  await store.commitRevision({ organization, pageSlug: "internal/trial/design", html: await readFile(path.join(root, "tests/checks/fixtures/internal/example/deck-design-presentation.html"), "utf8"), message: "着せ替えの試行", author });
  await store.closeDatabase();
  const env = { ...process.env, AUTH_SECRET: randomBytes(32).toString("hex"), AUTH_URL: "http://127.0.0.1:3148", AUTH_GOOGLE_ID: "preview", AUTH_GOOGLE_SECRET: "preview", VERCEL: "", VERCEL_REGION: "", NOW_REGION: "", GITHUB_TOKEN: "", GH_TOKEN: "", CURSOR_API_KEY: "", SLACK_BOT_TOKEN: "", SLACK_USER_TOKEN: "", CRON_SECRET: "preview",
    // 画像の置き場は Vercel Blob ではなく、通し検査と同じファイルの置き場（tests/support/blob-store.mjs・終了時に消える）。
    // 鍵は空にすると設置の不足として案内画面が出るので、形だけの値を入れる
    BLOB_READ_WRITE_TOKEN: "vercel_blob_rw_preview_notreal", PAGES_TEST_ASSETS: path.join(temp, "assets") };
  // --show-setup-guide: 保存先を初期化した人と違うアドレスで起動し、設置の不足の案内画面を確かめる
  if (process.argv.includes("--show-setup-guide")) env.PAGES_OWNER_EMAIL = "someone-else@example.com";
  // 通し検査と同じく、リポジトリの写しの上で起こす。写しの組み立て設定だけが画像の置き場をファイルへ差し替える（リポジトリの設定は触らない）。
  // 直したファイルは写しへ届け続けるので、手元の直しはそのまま画面に映る
  const app = path.join(temp, "app");
  const children = childProcesses();
  await prepareDisposableDevApp({ root, app, env, run: children.run });
  mirror = mirrorTestApp(root, app, { onError: (error) => console.error(`写しへ届けられませんでした: ${error.message}`) });
  console.log("試験専用: http://127.0.0.1:3148/internal/trial/diagram （画像もこのパソコンの中に置き、終了時に保存先ごと削除）");
  process.once("SIGINT", () => children.stop("SIGINT"));
  process.once("SIGTERM", () => children.stop("SIGTERM"));
  await startDisposableDevApp({ root, app, env, port: 3148, run: children.run }).catch(() => {});
} finally {
  mirror?.close();
  await store?.closeDatabase();
  await cluster.stop();
  await rm(temp, { recursive: true, force: true });
}
