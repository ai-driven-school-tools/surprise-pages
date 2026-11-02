/**
 * 手順書と CI の記録に秘密の値が書かれていないことの見張り（scripts/ci/scan-secrets.mjs）。
 *
 *   1. いまの手順書（docs/・直下の *.md・.github/）に、秘密の形が 1 つも無い
 *   2. 本物の形の鍵（アプリの鍵・投稿の鍵・入場券・画像置き場・Supabase・Slack・GitHub・AI・秘密鍵・接続 URL・JWT・
 *      壁の鍵の見出しの値）は拾い、取り決めの見本（Example の繰り返し）と短い作り物は拾わない
 *   3. 見つけても値そのものは返さない（CI の記録を見る道具が、記録に値を書き戻さない）
 *   4. CI の記録の形（仕事の名前<TAB>手順<TAB>本文）を仕事ごとの行で数える
 *
 * 秘密の形の見本はこのファイルに字として置かず、その場で組み立てる（このファイル自体が見張りに当たらないように）。
 */
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { documentFiles, findSecrets, scanDocuments, scanRunLog } from "../../scripts/ci/scan-secrets.mjs";

const ok = (label) => console.log(`OK  ${label}`);
const check = async (label, fn) => { await fn(); ok(label); };
const b64 = (bytes) => randomBytes(bytes).toString("base64url");
const alnum = (length) => randomBytes(length * 2).toString("hex").slice(0, length);

/** 本物と同じ形の作り物（値はその場かぎりの乱数）。 */
const REAL_SHAPED = {
  app: ["sp", "a_", b64(32)].join(""),
  publish: ["sp", "g_", b64(32)].join(""),
  ticket: ["vt", "1.", b64(48)].join(""),
  blob: ["vercel_blob", "_rw_", alnum(16), "_", alnum(30)].join(""),
  supabase: ["sb_sec", "ret_", b64(24)].join(""),
  slack: ["xo", "xb-", "1234567890", "-", alnum(24)].join(""),
  github: ["gh", "p_", alnum(36)].join(""),
  ai: ["sk-", "ant-", b64(40)].join(""),
  key: ["-----BEGIN ", "PRIVATE KEY-----"].join(""),
  url: ["postgresql", "://postgres:", alnum(20), "@db.example.test:5432/postgres"].join(""),
  jwt: ["eyJ", b64(20), ".eyJ", b64(40), ".", b64(32)].join(""),
  bypass: ["x-vercel-protection-bypass", ": ", alnum(32)].join(""),
  share: ["_vercel_jwt", "=", b64(40)].join(""),
};

try {
  console.log("--- いまの手順書に秘密の形が無い ---");
  await check("docs/・直下の *.md・.github/ を見て、秘密の形は 0 件", async () => {
    const files = await documentFiles();
    assert.ok(files.some((file) => file === "docs/guides/testing.md") && files.some((file) => file.startsWith(".github/")) && files.includes("AGENTS.md"), "見る範囲が欠けている");
    assert.deepEqual(await scanDocuments(), []);
  });

  console.log("--- 本物の形は拾い、見本は拾わない ---");
  await check("本物と同じ形の鍵・入場券・接続の合言葉は、どれも拾う", () => {
    for (const [name, value] of Object.entries(REAL_SHAPED)) assert.equal(findSecrets(`前 ${value} 後`).length, 1, name);
  });
  await check("取り決めの見本（Example の繰り返し）と、短い作り物・伏せ字・参照は拾わない", () => {
    for (const text of [
      "access_token: spa_ExampleExampleExampleExampleExampleExamp",
      "ticket: vt1.ExampleExampleExampleExampleExampleExampleExample",
      "Bearer spa_check-app-key-4c8e2a6f1d3b", "BLOB_READ_WRITE_TOKEN=vercel_blob_rw_preview_notreal", "xoxb-test",
      "PAGES_API_TOKEN=op://最初の組織/Pages app key/credential", "Authorization: Bearer ＊＊＊",
      "postgresql://postgres:x@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres", "x-vercel-protection-bypass: ***",
      "VERCEL_SHARE_JWT=$(pbpaste)",
    ]) assert.deepEqual(findSecrets(text), [], text);
  });
  await check("見つけても値は返さない（行の番号と形の名前だけ）", () => {
    const hits = findSecrets(`1 行目\n2 行目 ${REAL_SHAPED.app}\n3 行目 ${REAL_SHAPED.blob}`);
    assert.deepEqual(hits.map((hit) => hit.line), [2, 3]);
    assert.ok(!JSON.stringify(hits).includes(REAL_SHAPED.app) && !JSON.stringify(hits).includes(REAL_SHAPED.blob));
  });

  console.log("--- 手順書に書き足すと見つかる・CI の記録を仕事ごとに見る ---");
  await check("手順書の置き場に秘密の形を書くと、ファイルと行で見つかる（値は出さない）", async () => {
    const base = await mkdtemp(path.join(tmpdir(), "secret-scan-"));
    try {
      await mkdir(path.join(base, "docs", "api"), { recursive: true });
      await writeFile(path.join(base, "docs", "api", "runbook.md"), `# 手順\n\nPAGES_API_TOKEN=${REAL_SHAPED.app}\n`);
      await writeFile(path.join(base, "README.md"), "# 説明\n");
      const found = await scanDocuments(base);
      assert.deepEqual(found, [{ file: path.join("docs", "api", "runbook.md"), line: 3, pattern: "アプリ・投稿の鍵（spa_ / spg_）" }]);
    } finally { await rm(base, { recursive: true, force: true }); }
  });
  await check("CI の記録は仕事ごとの行の番号で告げ、GitHub が伏せた *** は拾わない", () => {
    const log = [
      "Contracts 1/2\tRun checks\tOK  全部",
      "Contracts 1/2\tRun checks\tAuthorization: Bearer ***",
      "Browser chromium regular 1/4\tRun tests\tほげ",
      `Browser chromium regular 1/4\tRun tests\t漏れ ${REAL_SHAPED.ticket}`,
    ].join("\n");
    const { found, jobs, lines } = scanRunLog(log);
    assert.equal(jobs, 2);
    assert.equal(lines, 4);
    assert.deepEqual(found, [{ job: "Browser chromium regular 1/4", line: 2, pattern: "本文の入場券（vt1.）" }]);
  });
} catch (error) {
  console.log(`NG  秘密の見張りの検査: ${error instanceof Error ? error.message.split("\n")[0] : "不明なエラー"}`);
  process.exitCode = 1;
}
