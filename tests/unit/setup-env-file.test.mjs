// 設置の設定ファイル（.env.setup）への追記。初期化・乱数のコマンドはこの 1 つのファイルへ値を足し、
// 同じ名前を二重に書かず、失敗したら追記前へ戻す。日本語のコメントがあっても位置がずれない。
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { appendEnvEntries } from "../../scripts/setup/database.mjs";

const temp = await mkdtemp(path.join(tmpdir(), "setup-env-"));
const file = (name, body) => writeFile(path.join(temp, name), body).then(() => path.join(temp, name));

test("末尾の改行が無くても、日本語の注記があっても、行として足される", async () => {
  const p = await file("a.env", "# この 1 行だけは Vercel に入れない\nDATABASE_ADMIN_URL=postgres://a\nPAGES_OWNER_EMAIL=o@example.com");
  await appendEnvEntries(p, { DATABASE_URL: "postgres://r" });
  assert.equal(await readFile(p, "utf8"), "# この 1 行だけは Vercel に入れない\nDATABASE_ADMIN_URL=postgres://a\nPAGES_OWNER_EMAIL=o@example.com\nDATABASE_URL=postgres://r\n");
});

test("同じ名前が既にあれば足さず、値を画面に出さない文で断る", async () => {
  const p = await file("b.env", "AUTH_SECRET=old\n");
  await assert.rejects(appendEnvEntries(p, { AUTH_SECRET: "new", CRON_SECRET: "c" }), (error) => error.message.includes("AUTH_SECRET") && !error.message.includes("new") && !error.message.includes("old"));
  assert.equal(await readFile(p, "utf8"), "AUTH_SECRET=old\n");
});

test("ファイルが無ければ作らない（3-7 で手で作る前提）", async () => {
  await assert.rejects(appendEnvEntries(path.join(temp, "missing.env"), { X: "1" }));
});

test("戻すと追記前の中身に戻る", async () => {
  const p = await file("c.env", "名前=値\n");
  const saved = await appendEnvEntries(p, { DATABASE_URL: "postgres://r" });
  await saved.rollback();
  assert.equal(await readFile(p, "utf8"), "名前=値\n");
});

test("改行を含む値や不正な名前は断る", async () => {
  const p = await file("d.env", "");
  await assert.rejects(appendEnvEntries(p, { "bad-name": "1" }));
  await assert.rejects(appendEnvEntries(p, { OK: "1\nEVIL=2" }));
  assert.equal(await readFile(p, "utf8"), "");
});
