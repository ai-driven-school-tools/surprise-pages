/** Local-only visual/editing harness. Uses the real editor, edit API and revision
 * implementation with an in-memory database. Never reads secrets or live pages. */
import { guardProductionWrite } from "./production-guard.mjs";
import { createServer } from "node:http";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";
// 見本の画面はメモリ上の保管庫で動かす前提。本物の保管庫の接続が渡っていても本番なら書く前に止める。
guardProductionWrite({ action: "見本の画面からの保存" });
const root = fileURLToPath(new URL("../../", import.meta.url));
const temp = await mkdtemp(join(tmpdir(), "deck-design-preview-"));
const stub = `${root}tests/checks/fixtures/deck-design/store.mjs`;
await build({ stdin: { contents: `export {GET, PUT} from './src/app/api/pages/edit/route'; export {POST as uploadLogo} from './src/app/api/pages/logo/route'; export * from './src/lib/pages/store'; export * from './src/lib/deck/design/html'; export {withAssetBase} from './src/lib/pages/content';`, resolveDir: root }, outfile: `${temp}/api.mjs`, bundle: true, format: "esm", platform: "node",
  plugins: [{ name: "memory-only", setup(b) { b.onResolve({ filter: /supabase$|page-cache$|^@vercel\/blob$|^@\/lib\/(identity|access|comments)$|^\.\/comments$|^@\/auth$|^next\/headers$/ }, () => ({ path: stub })); } }],
});
const api = await import(pathToFileURL(`${temp}/api.mjs`).href);
const localVendor = {
  "mermaid.js": `${root}vendor/mermaid/mermaid.js`,
  "echarts.js": `${root}vendor/echarts/echarts.js`,
  "lucide.js": `${root}vendor/lucide/lucide.js`,
  "tailwind.js": `${root}vendor/tailwindcss/tailwind.js`,
};
const client = await build({ stdin: { contents: `
import {openPageEditor} from './src/widget/editor/editor';
import {STYLES} from './src/widget/shared/styles';
import {DECK_PRESETS, effectiveAppearance} from './src/lib/deck/design/design';
import {readDeckDesign, paintDeckDesign} from './src/lib/deck/design/dom';
import {applyDeckFocus} from './src/deck-design/focus-renderer';
const host=document.createElement('surprise-comments'); const shadow=host.attachShadow({mode:'open'});
const style=document.createElement('style');style.textContent=STYLES;shadow.append(style);document.body.append(host);
const trigger=document.createElement('button');trigger.textContent='この資料を編集';trigger.className='edit-button';
trigger.style.cssText='position:absolute;right:24px;top:24px;pointer-events:auto;background:var(--surface)';shadow.append(trigger);
trigger.onclick=()=>openPageEditor({pageSlug:'internal/example/design',host:shadow,notify:console.log,fail:console.error});
window.deckPreview={presets:DECK_PRESETS,read:readDeckDesign,paint:paintDeckDesign,effective:effectiveAppearance,focus:applyDeckFocus};
`, resolveDir: root }, bundle: true, write: false, format: "iife", platform: "browser" });
let kind = "catalog";
async function original(which) {
  const name = which === "catalog" ? "deck-format-catalog.html" : `deck-design-${which}.html`;
  return readFile(`${root}tests/checks/fixtures/internal/example/${name}`, "utf8");
}
async function reset(which) {
  if (!["catalog", "presentation", "proposal", "report"].includes(which)) throw new Error("Unknown example");
  kind = which;
  const html = await original(which);
  globalThis.__deckStore = { page: { id: "page", page_slug: "internal/example/design", visibility: "internal", created_by: "owner@example.test", title: /<title>(.*?)<\/title>/.exec(html)?.[1] ?? "スライド", current_version_id: "a".repeat(40), deleted_at: null, created_at: "2026-09-13T00:00:00Z", updated_at: "2026-09-13T00:00:00Z" }, revisions: [{ page_id: "page", version_id: "a".repeat(40), version_number: 1, parent_version_id: null, author_email: "owner@example.test", author_name: "Owner", message: "見本", change_count: null, created_at: "2026-09-13T00:00:00Z", html }], race: false };
  globalThis.__deckViewer = { kind: "member", email: "owner@example.test", name: "Owner" };
  globalThis.__deckAssets = new Map();
}
await reset(kind);
const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, "http://127.0.0.1");
    if (url.pathname.startsWith("/reset/")) {
      await reset(url.pathname.slice(7)); response.writeHead(302, { Location: "/" }); response.end(); return;
    }
    if (url.pathname === "/client.js") { response.setHeader("Content-Type", "text/javascript"); response.end(client.outputFiles[0].text); return; }
    if (url.pathname.startsWith("/vendor/")) {
      const name = url.pathname.split("/")[2];
      const file = localVendor[name];
      if (!file) { response.writeHead(404); response.end(); return; }
      response.setHeader("Content-Type", "text/javascript; charset=utf-8");
      response.setHeader("Cache-Control", "no-store");
      response.end(await readFile(file)); return;
    }
    if (url.pathname === "/api/pages/edit") {
      const chunks = []; for await (const chunk of request) chunks.push(chunk);
      const body = Buffer.concat(chunks).toString("utf8");
      const req = new Request(`http://localhost${request.url}`, { method: request.method, headers: { "Content-Type": "application/json" }, ...(body ? { body } : {}) });
      const result = request.method === "GET" ? await api.GET(req) : await api.PUT(req);
      response.writeHead(result.status, Object.fromEntries(result.headers)); response.end(await result.text()); return;
    }
    if (url.pathname === "/api/pages/logo" && request.method === "POST") {
      const chunks = []; for await (const chunk of request) chunks.push(chunk);
      const body = Buffer.concat(chunks);
      const req = new Request(`http://localhost${request.url}`, {
        method: "POST",
        headers: {
          "Content-Type": request.headers["content-type"] || "application/octet-stream",
          "Content-Length": String(body.byteLength),
        },
        body,
      });
      const result = await api.uploadLogo(req);
      response.writeHead(result.status, Object.fromEntries(result.headers)); response.end(await result.text()); return;
    }
    if (url.pathname === "/refresh" && request.method === "POST") {
      const html = (await original(kind)).replace("判断材料", "更新した判断材料");
      await api.commitRevision({ pageSlug: "internal/example/design", html, message: "原稿を更新", author: { email: "owner@example.test", name: "Owner" }, preserveDeckAppearance: true });
      response.end("ok"); return;
    }
    if (url.pathname.startsWith("/internal/example/design/_deck/")) {
      const rel = url.pathname.slice("/internal/example/design/".length);
      const asset = globalThis.__deckAssets.get(`internal/example/design/${rel}`);
      if (!asset) { response.writeHead(404); response.end(); return; }
      response.setHeader("Content-Type", asset.options.contentType);
      response.setHeader("Cache-Control", "no-store");
      response.end(asset.bytes); return;
    }
    if (url.pathname === "/") {
      const html = globalThis.__deckStore.revisions.at(-1).html;
      response.setHeader("Content-Type", "text/html; charset=utf-8");
      response.end(api.withAssetBase(html.replace("</body>", '<script src="/client.js"></script></body>'), "/internal/example/design")); return;
    }
    response.writeHead(404); response.end();
  } catch (error) { response.writeHead(500); response.end(String(error)); }
});
const port = Number(process.env.DECK_PREVIEW_PORT || 4318);
server.listen(port, "127.0.0.1", () => console.log(`手元だけの見本と編集: http://127.0.0.1:${port}/ （/reset/catalog・/reset/presentation・/reset/proposal・/reset/report）`));
