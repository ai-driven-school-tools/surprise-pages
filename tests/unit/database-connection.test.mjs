// 保存先とのつなぎ方（src/lib/db/database.ts）。本物の PostgreSQL の前に中継を置き、行きの塊を数え、わざと接続を切る。
// - 形の決まった問い合わせは形を覚え、2 回目からは 1 往復で済む（覚えないと「形の確認」と「実行」の 2 往復）
// - 一時停止明けの古い接続で切れたとき、読むだけの問い合わせは 1 回だけやり直す。書き込みはやり直さない（二重に書かない）
// - 接続を束ねる中継（プール）の宛先では形を覚えない（覚えた形が別の接続へ渡って壊れる種類の中継がある）
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { createServer, connect } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { initializeDatabase } from "../../scripts/setup/database.mjs";
import { disposableDatabase, freeLocalPort } from "../support/disposable-app.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const FIRST = { id: "00000000-0000-4000-8000-000000000001", assetPrefix: "" };
const OWNER = "owner@example.com";

const temp = await mkdtemp(path.join(tmpdir(), "database-connection-"));
const cluster = await disposableDatabase(temp);

/** 行きの塊を数え、`cut()` のあとに来た最初の行きの塊で、送らずに接続を落とす（止まっていた間に相手が閉じた接続の再現）。 */
const relay = { sent: 0, cutNext: false, sockets: new Set() };
async function startRelay(targetPort) {
  const server = createServer((client) => {
    const upstream = connect(targetPort, "127.0.0.1");
    for (const socket of [client, upstream]) { relay.sockets.add(socket); socket.on("close", () => relay.sockets.delete(socket)); }
    client.on("data", (chunk) => {
      if (relay.cutNext) { relay.cutNext = false; client.destroy(); upstream.destroy(); return; }
      relay.sent++;
      upstream.write(chunk);
    });
    upstream.on("data", (chunk) => client.write(chunk));
    client.on("error", () => upstream.destroy());
    upstream.on("error", () => client.destroy());
    client.on("close", () => upstream.destroy());
    upstream.on("close", () => client.destroy());
  });
  const port = await freeLocalPort();
  await new Promise((resolve) => server.listen(port, "127.0.0.1", resolve));
  return server;
}

let database;
let server;
after(async () => {
  await database?.closeDatabase();
  for (const socket of relay.sockets) socket.destroy();
  server?.close();
  await cluster.stop();
  await rm(temp, { recursive: true, force: true });
});

async function prepare() {
  if (database) return database;
  await cluster.start();
  const runtime = new URL(await initializeDatabase(cluster.adminUrl, OWNER));
  server = await startRelay(Number(runtime.port));
  runtime.hostname = "127.0.0.1";
  runtime.port = String(server.address().port);
  Object.assign(process.env, { DATABASE_URL: runtime.toString(), DATABASE_POOL_MAX: "1", PAGES_EDITION: "personal", PAGES_OWNER_EMAIL: OWNER, PAGES_SITE_URL: "http://127.0.0.1:3000" });
  const out = path.join(temp, "database.cjs");
  await build({ entryPoints: [`${root}/src/lib/db/database.ts`], outfile: out, bundle: true, platform: "node", format: "cjs", logLevel: "error" });
  database = createRequire(import.meta.url)(out);
  return database;
}

const readPages = (db) => db.orgDb(FIRST).from("pages").select("id").eq("page_slug", "internal/connection-test");

test("形の決まった読み込みは形を覚え、2 回目からは行きが 1 回で済む", async () => {
  const db = await prepare();
  assert.equal((await readPages(db)).error, null);
  assert.equal((await readPages(db)).error, null);
  const before = relay.sent;
  assert.equal((await readPages(db)).error, null);
  assert.equal(relay.sent - before, 1);
});

test("古い接続で切れたとき、読むだけの問い合わせは 1 回だけやり直して読める", async () => {
  const db = await prepare();
  assert.equal((await readPages(db)).error, null);
  relay.cutNext = true;
  const result = await readPages(db);
  assert.equal(result.error, null);
  assert.deepEqual(result.data, []);
});

test("書き込みは切れてもやり直さない（二重に書かない）", async () => {
  const db = await prepare();
  assert.equal((await readPages(db)).error, null);
  relay.cutNext = true;
  // やり直すと保存先まで届き、足りない項目の断り（23502）になる。やり直さなければ切れた印のまま返る
  const result = await db.orgDb(FIRST).from("pages").insert({ page_slug: "internal/connection-test" });
  assert.equal(result.error?.code, "CONNECTION_CLOSED");
});

test("件数で形が変わる問い合わせ（in の並び・複数行の保存）は形を覚えない", async () => {
  const db = await prepare();
  const base = { table: "pages", operation: "select", columns: "id", returning: true, values: [], filters: [], alternatives: [], orders: [], cardinality: "many" };
  assert.equal(db.compileQuery({ ...base, filters: [{ column: "page_slug", operator: "=", value: "a" }] }).stable, true);
  assert.equal(db.compileQuery({ ...base, filters: [{ column: "id", operator: "in", value: ["a", "b"] }] }).stable, false);
  assert.equal(db.compileQuery({ ...base, filters: [{ column: "id", operator: "in", value: [] }] }).stable, true);
  assert.equal(db.compileQuery({ ...base, operation: "insert", values: [{ title: "a" }] }).stable, true);
  assert.equal(db.compileQuery({ ...base, operation: "insert", values: [{ title: "a" }, { title: "b" }] }).stable, false);
});

test("接続を束ねる中継（プール）の宛先では形を覚えない", async () => {
  const db = await prepare();
  assert.equal(db.canPrepareStatements(new URL("postgres://u:p@ep-cool-name-123456.ap-southeast-1.aws.neon.tech/neondb")), true);
  assert.equal(db.canPrepareStatements(new URL("postgres://u:p@ep-cool-name-123456-pooler.ap-southeast-1.aws.neon.tech/neondb")), false);
  assert.equal(db.canPrepareStatements(new URL("postgres://u:p@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres")), false);
  assert.equal(db.canPrepareStatements(new URL("postgres://u:p@db.example.com:5432/app?pgbouncer=true")), false);
});

test("使っていない接続は、Neon が眠る 5 分より短く、読んでから次を押すまでの間より長く保つ", async () => {
  const db = await prepare();
  assert.ok(db.CONNECTION_IDLE_SECONDS >= 60 && db.CONNECTION_IDLE_SECONDS < 300, String(db.CONNECTION_IDLE_SECONDS));
});
