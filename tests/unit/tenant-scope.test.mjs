// 組織で絞った保存先の口。素の口で組織に属する表を触ると、問い合わせを組み立てる前に止まる。
// 保存先にはつながない（止まるのは口を開いた瞬間で、通信より前）。
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const ledger = createRequire(import.meta.url)(`${root}/src/lib/organization/tenant-tables.json`);
const SURPRISE = { id: "00000000-0000-4000-8000-000000000001", assetPrefix: "" };

async function loadDatabase() {
  const temp = await mkdtemp(path.join(tmpdir(), "tenant-scope-"));
  try {
    const out = path.join(temp, "database.cjs");
    await build({ entryPoints: [`${root}/src/lib/db/database.ts`], outfile: out, bundle: true, platform: "node", format: "cjs", logLevel: "error" });
    return createRequire(import.meta.url)(out);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
}

test("台帳にある組織に属する表は、どれも素の口で開くと実行時に止まる", async () => {
  const database = await loadDatabase();
  for (const table of Object.keys(ledger.organization)) {
    assert.throws(() => database.getDb().from(table), (error) => error.name === "TenantScopeError" && error.reason === "needs-organization", table);
  }
});

test("組織に属さない表は素の口で開け、組織で絞った口では開けない", async () => {
  const database = await loadDatabase();
  for (const table of Object.keys(ledger.global)) {
    assert.doesNotThrow(() => database.getDb().from(table), table);
    assert.throws(() => database.orgDb(SURPRISE).from(table), (error) => error.reason === "not-organization", table);
  }
});

test("台帳に無い表・関数はどちらの口でも止まる", async () => {
  const database = await loadDatabase();
  assert.throws(() => database.getDb().from("unregistered_table"), (error) => error.reason === "unknown");
  assert.throws(() => database.orgDb(SURPRISE).from("unregistered_table"), (error) => error.reason === "unknown");
  await assert.rejects(database.getDb().rpc("page_access_facts", {}), (error) => error.reason === "unknown");
  await assert.rejects(database.getDb().rpc("org_page_access_facts", {}), (error) => error.reason === "needs-organization");
  await assert.rejects(database.orgDb(SURPRISE).rpc("commit_deck_revision", {}), (error) => error.reason === "not-organization");
});

test("組織で絞った口で読むと、条件に組織の目印が必ず付く（呼ぶ側は書かない）", async () => {
  const database = await loadDatabase();
  const state = { table: "page_comments", operation: "select", columns: "id", returning: true, values: [], filters: [{ column: "page_slug", operator: "=", value: "internal/a" }], alternatives: [], orders: [], cardinality: "many", organizationId: SURPRISE.id };
  const compiled = database.compileQuery(database.withOrganization(state));
  assert.match(compiled.text, /where "organization_id" = \$1 and "page_slug" = \$2$/);
  assert.equal(compiled.parameters[0], SURPRISE.id);
});

test("組織の絞りを外れた書き方は、保存先へ送る前に例外で止まる（{ error } に言い換えない）", async () => {
  const database = await loadDatabase();
  const other = "00000000-0000-4000-8000-000000000002";
  // 保存先の設定が無いので、もし送ろうとすれば別の失敗になる。届く前に止まることを例外の種類で確かめる
  await assert.rejects(Promise.resolve(database.orgDb(SURPRISE).from("pages").insert({ page_slug: "internal/x", organization_id: other })), (error) => error.reason === "organization-mismatch");
  await assert.rejects(Promise.resolve(database.orgDb(SURPRISE).from("pages").update({ organization_id: other }).eq("id", "x")), (error) => error.reason === "organization-column");
  await assert.rejects(Promise.resolve(database.orgDb(SURPRISE).from("page_favorites").upsert({ owner_email: "a", page_id: "b" }, { onConflict: "owner_email,page_id" })), (error) => error.reason === "organization-column");
});
