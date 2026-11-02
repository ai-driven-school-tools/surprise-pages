import { build } from "esbuild";
import { root, dir, companyDeployment } from "./paths.mjs";
import { readFile } from "node:fs/promises";
const stub = `${root}/tests/checks/fixtures/deck-design/store.mjs`;
await build({ stdin: { contents: `export * from './src/lib/pages/store'; export * from './src/lib/deck/design/html'; export * from './src/lib/revisions/version-id'; export * from './src/app/api/pages/edit/route'; export * from './src/lib/access/page-edit-access';`, resolveDir: root },
  outfile: `${dir}/dd-save.mjs`, bundle: true, platform: "node", format: "esm",
  plugins: [companyDeployment, { name: "transport-only", setup(b) {
    b.onResolve({ filter: /supabase$|database$|pages\/cache$|^\.\/cache$|^@\/lib\/(identity\/identity|comments\/comments)$|^\.\/comments$|^@\/auth$|^next\/headers$/ }, () => ({ path: stub }));
  } }],
});
const api = await import(`${dir}/dd-save.mjs`);
let fails = 0;
function ok(label, value) { if (!value) fails++; console.log(`${value ? "OK  " : "NG  "} ${label}`); }
const original = await readFile(`${root}/tests/checks/fixtures/internal/example/deck-design-proposal.html`, "utf8");
const settings = { version: 1, document: { background: "#121314", motion: true }, slides: { opening: { accent: "#eebb77" } } };
const saved = api.withDeckOverrides(original, settings);
const page = { id: "page", page_slug: "internal/example/design", visibility: "internal", created_by: "owner@example.test", title: "例", current_version_id: "a".repeat(40), deleted_at: null, created_at: "2026-09-13T00:00:00Z", updated_at: "2026-09-13T00:00:00Z" };
const seed = (html) => ({ page_id: "page", version_number: 1, version_id: "a".repeat(40), parent_version_id: null, html, author_email: "owner@example.test", author_name: "Owner", message: "最初", change_count: null, created_at: "2026-09-13T00:00:00Z" });
const reset = (html) => { globalThis.__deckStore = { page: { ...page }, revisions: [seed(html)], race: false }; globalThis.__deckViewer = { kind: "member", email: "owner@example.test", name: "Owner" }; };
/** 最初の組織（最初の組織）。保存の入口は組織を受けて、その中で呼び名を引く */
const SURPRISE = { id: "00000000-0000-4000-8000-000000000001", assetPrefix: "" };
const input = { organization: SURPRISE, pageSlug: page.page_slug, html: original.replace("学びを、", "学びを深め、"), author: { email: "owner@example.test", name: "Owner" }, message: "原稿を更新", preserveDeckAppearance: true };
console.log("--- 1. 保存処理での引き継ぎ ---");
reset(saved);
const result = await api.commitRevision(input);
const newest = globalThis.__deckStore.revisions.at(-1);
ok("原稿を更新しながら着せ替えを保存", newest.html.includes("学びを深め、") && api.readDeckDesignHtml(newest.html).overrides.document.background === "#121314");
ok("配信する本文も同じ", globalThis.__deckStore.warm === newest.html);
ok("完成した本文から版の目印を計算", api.computeVersionId({ parentVersionId: newest.parent_version_id, pageSlug: page.page_slug, versionNumber: newest.version_number, authorEmail: newest.author_email, createdAt: newest.created_at, html: newest.html }) === result.versionId);
const repeated = await api.commitRevision(input);
ok("繰り返しても版を増やさない", repeated.unchanged && globalThis.__deckStore.revisions.length === 2);
reset(saved); globalThis.__deckStore.race = true;
try { await api.commitRevision(input); ok("競合を拒否", false); } catch (error) { ok("競合を拒否", error instanceof api.RevisionRaceError); }
ok("競合したときは途中の版を残さない", globalThis.__deckStore.revisions.length === 1);
reset(saved);
try { await api.commitRevision({ ...input, expectedHead: "b".repeat(40) }); ok("古い土台を拒否", false); } catch (error) { ok("古い土台を拒否", error instanceof api.StaleBaseError); }
reset(saved);
await api.commitRevision({ ...input, html: original, preserveDeckAppearance: false });
ok("本文編集・復元は保存処理で設定を勝手に戻さない", api.readDeckDesignHtml(globalThis.__deckStore.revisions.at(-1).html).saved === null);
reset(saved);
const almostFull = original + " ".repeat(5 * 1024 * 1024 - Buffer.byteLength(original) - 32);
try { await api.commitRevision({ ...input, html: almostFull }); ok("引き継いだ後の容量も検査する", false); }
catch (error) { ok("引き継いだ後の容量も検査する", error instanceof api.InheritedDeckTooLargeError && globalThis.__deckStore.revisions.length === 1); }
console.log("--- 2. 編集APIを通した保存と再読込 ---");
const put = async (extra = {}) => api.PUT(new Request("http://localhost/api/pages/edit", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ page: page.page_slug, html: original, deckAppearance: settings, baseVersionId: "a".repeat(40), ...extra }) }));
reset(original);
const response = await put();
ok("デザインだけの保存が通る", response.status === 200);
const stored = globalThis.__deckStore.revisions.at(-1);
ok("デザイン以外は元のバイト列を保存", api.withoutDeckOverrides(stored.html) === original);
const loaded = await api.GET(new Request(`http://localhost/api/pages/edit?page=${page.page_slug}`));
const body = await loaded.json();
ok("再読込で保存した設定が返る", loaded.status === 200 && api.readDeckDesignHtml(body.html).overrides.document.background === "#121314");
const stale = await put(); ok("別の保存の後は409", stale.status === 409);
reset(original);
const invalid = await put({ deckAppearance: { ...settings, document: { scale: 999 } } });
ok("設定の範囲外を400で拒否", invalid.status === 400 && globalThis.__deckStore.revisions.length === 1);
reset(original); globalThis.__deckViewer = { kind: "member", email: "reader@example.test" };
ok("閲覧だけの人は保存できない", (await put()).status === 404);
reset(original); globalThis.__deckViewer = null;
ok("未ログインは保存できない", (await put()).status === 401);
reset(original); globalThis.__deckStore.race = true;
ok("競合をAPIでも409で返す", (await put()).status === 409);
console.log("--- 3. 共通の編集権限を実際に通す ---");
reset(original);
// 管理者かは名乗りに付いた所属の役割で決まる。入れ物の管理者の名簿（admins）を役割に写す
const member = (email) => ({kind:"member",email,name:email,organization:{...SURPRISE,role:(globalThis.__deckStore.admins??[]).some((row)=>row.email===email)?"admin":"member"}});
ok("共通の門は作成者を通す", (await api.loadEditablePage(SURPRISE,member("owner@example.test"),page.page_slug)).ok);
ok("共通の門は閲覧だけの人を隠す", !(await api.loadEditablePage(SURPRISE,member("reader@example.test"),page.page_slug)).ok);
globalThis.__deckStore.admins=[{email:"admin@example.test"}];
ok("共通の門は管理者を通す", (await api.loadEditablePage(SURPRISE,member("admin@example.test"),page.page_slug)).ok);
globalThis.__deckStore.page.visibility="restricted";
globalThis.__deckStore.permissions=[{id:"grant",page_id:"page",grantee_kind:"member",member_email:"coowner@example.test",role:"owner"}];
ok("制限された資料は共同作成者も編集できる", (await api.loadEditablePage(SURPRISE,member("coowner@example.test"),page.page_slug)).ok);
globalThis.__deckStore.permissions[0].role="viewer";
ok("閲覧の許可を編集の許可へ読み替えない", !(await api.loadEditablePage(SURPRISE,member("coowner@example.test"),page.page_slug)).ok);
globalThis.__deckStore.page.deleted_at="2026-09-14T00:00:00Z";
ok("削除した資料は管理者にも編集画面を返さない", !(await api.loadEditablePage(SURPRISE,member("admin@example.test"),page.page_slug)).ok);
delete globalThis.__deckStore; delete globalThis.__deckViewer;
console.log(`\n${fails ? `${fails} 件 不合格` : "すべて合格"}`); process.exitCode = fails ? 1 : 0;
