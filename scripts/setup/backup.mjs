import { createCipheriv, createDecipheriv, createHash, randomBytes, scryptSync } from "node:crypto";
import { appendFile, mkdir, mkdtemp, open, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { createReadStream, createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";
import postgres from "postgres";
import { get, list, put } from "@vercel/blob";
import { databaseOptions, migrations } from "./database.mjs";

const MAGIC = Buffer.from("PAGESBK1");
const HEADER = 36;
const COPY_HEADER = /^COPY public\.([a-z_]+) \((?:"[a-z0-9_]+"|[a-z0-9_]+)(?:, (?:"[a-z0-9_]+"|[a-z0-9_]+))*\) FROM stdin;$/;
/**
 * 控えに入れない表。**取り出し（pg_dump）と復元前の確かめ（validateDataDump）の両方がこの 1 つを読む。**
 * 名乗りの鍵・ログインの待ち受け・アプリのログインの引換券・GitHubの利用者接続情報は、
 * その設置で発行した合鍵や一時認証の材料なので別の保存先へ持ち出さない
 * （復元先では入り直せばよい。古い引換券や鍵を生き返らせない）。
 * app_login_codes は配布版では窓口ごと閉じていて行もできないが、表は移し替えで作られるので同じく外す。
 */
export const BACKUP_EXCLUDED_TABLES = ["admins", "pages_schema_migrations", "pages_installation", "publish_tokens", "cli_login_pending", "app_login_codes", "recording_github_connections", "recording_github_pending", "recording_github_controls"];
const EXCLUDED = BACKUP_EXCLUDED_TABLES;
class SafeError extends Error {}
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");

export async function encryptBackup(source, destination, password) {
  if (password.length < 16) throw new SafeError("控えを守るパスワードは16文字以上にしてください");
  const salt = randomBytes(16), iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", scryptSync(password, salt, 32), iv);
  await writeFile(destination, Buffer.concat([MAGIC, salt, iv]), { flag: "wx", mode: 0o600 });
  try {
    await pipeline(createReadStream(source), cipher, createWriteStream(destination, { flags: "a", mode: 0o600 }));
    await appendFile(destination, cipher.getAuthTag());
  } catch (error) { await rm(destination, { force: true }); throw error; }
}

export async function decryptBackup(source, destination, password) {
  const size = (await stat(source)).size;
  if (size <= HEADER + 16) throw new SafeError("控えの形式が正しくありません");
  const file = await open(source, "r");
  const header = Buffer.alloc(HEADER), tag = Buffer.alloc(16);
  try { await file.read(header, 0, HEADER, 0); await file.read(tag, 0, 16, size - 16); }
  finally { await file.close(); }
  if (!header.subarray(0, 8).equals(MAGIC)) throw new SafeError("控えの形式が正しくありません");
  const cipher = createDecipheriv("aes-256-gcm", scryptSync(password, header.subarray(8, 24), 32), header.subarray(24, 36));
  cipher.setAuthTag(tag);
  try { await pipeline(createReadStream(source, { start: HEADER, end: size - 17 }), cipher, createWriteStream(destination, { flags: "wx", mode: 0o600 })); }
  catch { await rm(destination, { force: true }); throw new SafeError("パスワードが違うか、控えが壊れています"); }
}

export function pgEnvironment(url) {
  const parsed = new URL(url);
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname);
  return { ...process.env, PGHOST: parsed.hostname, PGPORT: parsed.port || "5432", PGDATABASE: decodeURIComponent(parsed.pathname.slice(1)), PGUSER: decodeURIComponent(parsed.username), PGPASSWORD: decodeURIComponent(parsed.password), PGSSLMODE: local ? "disable" : "verify-full", PGSSLROOTCERT: local ? "" : (parsed.searchParams.get("sslrootcert") ?? process.env.PGSSLROOTCERT ?? "system"), PGCHANNELBINDING: parsed.searchParams.get("channel_binding") ?? "prefer", PGOPTIONS: parsed.searchParams.get("options") ?? "" };
}

export function validateDataDump(text) {
  let copying = false;
  for (const line of text.split(/\r?\n/)) {
    if (copying) { if (line === "\\.") copying = false; continue; }
    if (!line.trim() || line.startsWith("--")) continue;
    const copy = COPY_HEADER.exec(line);
    if (copy && !EXCLUDED.includes(copy[1])) { copying = true; continue; }
    if (/^SET (?:statement_timeout|lock_timeout|idle_in_transaction_session_timeout|transaction_timeout|client_encoding|standard_conforming_strings|check_function_bodies|xmloption|client_min_messages|row_security|default_tablespace|default_table_access_method) = (?:[a-zA-Z0-9_-]+|'[a-zA-Z0-9_, -]*');$/.test(line)) continue;
    if (line === "SELECT pg_catalog.set_config('search_path', '', false);") continue;
    if (/^SELECT pg_catalog\.setval\('public\.[a-z_]+', \d+, (?:true|false)\);$/.test(line)) continue;
    if (/^\\(?:un)?restrict [a-zA-Z0-9]+$/.test(line)) continue;
    throw new SafeError("データ以外の命令が含まれる控えは復元しません");
  }
  if (copying) throw new SafeError("控えが途中で切れています");
}

/**
 * pg_dump orders table data by declared constraints, but the recording-artifact
 * freeze trigger also requires source links that are intentionally checked in
 * application-owned SQL. Keep every validated COPY block and reorder only the
 * recording tables into their dependency order before applying the dump.
 */
export function orderDataDumpForRestore(text) {
  validateDataDump(text);
  const lines = text.split(/\r?\n/);
  const chunks = [];
  for (let at = 0; at < lines.length; at++) {
    const header = COPY_HEADER.exec(lines[at]);
    if (!header) { chunks.push({ table: null, lines: [lines[at]] }); continue; }
    const block = [lines[at]];
    while (++at < lines.length) {
      block.push(lines[at]);
      if (lines[at] === "\\.") break;
    }
    if (block.at(-1) !== "\\.") throw new SafeError("控えが途中で切れています");
    chunks.push({ table: header[1], lines: block });
  }
  const recordingOrder = new Map([
    ["recordings", 0], ["recording_generations", 0], ["recording_repository_catalog", 0],
    ["recording_generation_inputs", 1], ["recording_artifacts", 2],
    ["recording_commands", 3], ["recording_events", 3], ["recording_grants", 3],
  ]);
  const recordingPositions = chunks.flatMap((chunk, index) => recordingOrder.has(chunk.table) ? [index] : []);
  const recordingChunks = recordingPositions.map((index) => chunks[index])
    .sort((left, right) => recordingOrder.get(left.table) - recordingOrder.get(right.table));
  recordingPositions.forEach((position, index) => { chunks[position] = recordingChunks[index]; });
  const ordered = chunks.flatMap((chunk) => chunk.lines).join("\n");
  validateDataDump(ordered);
  return ordered;
}

async function blobs() {
  const all = []; let cursor;
  do { const page = await list({ cursor, limit: 1000 }); all.push(...page.blobs); cursor = page.hasMore ? page.cursor : undefined; } while (cursor);
  return all;
}
function assetPath(directory, key) {
  if (!/^(internal|public)\/[a-z0-9_.@/-]+$/.test(key) || key.split("/").some((part) => !part || part === "." || part === "..")) throw new SafeError("想定外の素材の名前です");
  return path.join(directory, "assets", key);
}
async function fileTree(directory) {
  const found = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) throw new SafeError("控えにリンクが含まれています");
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) found.push(...await fileTree(file)); else found.push(file);
  }
  return found;
}

async function main() {
  const action = process.argv[2], archive = process.argv[3];
  if (!["backup", "restore"].includes(action) || !archive) throw new SafeError("backup 保存する名前 / restore 控えの名前 --confirm-empty を指定してください");
  const url = process.env.DATABASE_ADMIN_URL, password = process.env.PAGES_BACKUP_PASSWORD;
  if (!url || !password || password.length < 16 || !process.env.BLOB_READ_WRITE_TOKEN) throw new SafeError("控えと復旧用の管理接続情報・非公開素材の鍵・16文字以上の控え用パスワードを設定してください");
  const temp = await mkdtemp(path.join(tmpdir(), "pages-backup-"));
  const tar = path.join(temp, "data.tar.gz");
  const schemaHash = digest(JSON.stringify((await migrations()).map((one) => [one.name, one.hash])));
  try {
    if (action === "backup") {
      await mkdir(path.join(temp, "assets"));
      execFileSync("pg_dump", ["--data-only", "--no-owner", "--no-acl", "--schema=public", ...EXCLUDED.map((name) => `--exclude-table=public.${name}`), "--file", path.join(temp, "database.sql")], { env: pgEnvironment(url), stdio: ["ignore", "ignore", "pipe"] });
      const orderedSql = orderDataDumpForRestore(await readFile(path.join(temp, "database.sql"), "utf8"));
      await writeFile(path.join(temp, "database.sql"), orderedSql, { mode: 0o600 });
      const assets = [];
      for (const one of await blobs()) {
        const destination = assetPath(temp, one.pathname);
        await mkdir(path.dirname(destination), { recursive: true });
        const response = await get(one.pathname, { access: "private" });
        if (response?.statusCode !== 200) throw new SafeError("取得できない素材があります。控えは完成扱いにしません");
        await pipeline(Readable.fromWeb(response.stream), createWriteStream(destination, { mode: 0o600 }));
        assets.push({ key: one.pathname, type: response.blob.contentType, sha256: digest(await readFile(destination)) });
      }
      await writeFile(path.join(temp, "manifest.json"), JSON.stringify({ format: 1, schemaHash, sqlHash: digest(await readFile(path.join(temp, "database.sql"))), assets }), { mode: 0o600 });
      execFileSync("tar", ["-czf", tar, "-C", temp, "database.sql", "assets", "manifest.json"]);
      await encryptBackup(tar, path.resolve(archive), password);
      console.log("本文・履歴・コメント・閲覧権限・画像の暗号化した控えを作成しました。パスワードは控えと別に保管してください。");
      return;
    }
    if (!process.argv.includes("--confirm-empty")) throw new SafeError("新規初期化した空の保存先に限り --confirm-empty を指定してください");
    await decryptBackup(path.resolve(archive), tar, password);
    const names = execFileSync("tar", ["-tzf", tar], { encoding: "utf8" }).trim().split("\n");
    if (names.some((name) => !/^(database\.sql|manifest\.json|assets(?:\/[a-z0-9_.@/-]*)?)$/.test(name) || name.split("/").includes(".."))) throw new SafeError("控えの中の名前が正しくありません");
    const listing = execFileSync("tar", ["-tvzf", tar], { encoding: "utf8" }).trim().split("\n");
    if (listing.some((line) => !/^[d-]/.test(line))) throw new SafeError("リンク等を含む控えは展開しません");
    execFileSync("tar", ["-xzf", tar, "-C", temp, "--no-same-owner", "--no-same-permissions"]);
    const manifest = JSON.parse(await readFile(path.join(temp, "manifest.json"), "utf8"));
    if (manifest.format !== 1 || manifest.schemaHash !== schemaHash) throw new SafeError("控えと同じ版の配布物を使って復元してください");
    const sqlFile = path.join(temp, "database.sql");
    if (digest(await readFile(sqlFile)) !== manifest.sqlHash) throw new SafeError("本文の控えが壊れています");
    validateDataDump(await readFile(sqlFile, "utf8"));
    const database = postgres(url, databaseOptions(url));
    try {
      for (const table of ["pages", "page_revisions", "page_comments", "page_permissions", "groups", "group_members", "access_requests", "page_views", "page_view_optouts"]) {
        const rows = await database.unsafe(`select 1 from public."${table}" limit 1`);
        if (rows.length) throw new SafeError("復元先に既存のデータがあります。上書きしません");
      }
    } finally { await database.end({ timeout: 5 }); }
    const expected = new Map(manifest.assets.map((one) => [one.key, one]));
    const existing = new Map((await blobs()).map((one) => [one.pathname, one]));
    if ([...existing.keys()].some((key) => !expected.has(key))) throw new SafeError("復元先の素材保管庫が空ではありません");
    const files = await fileTree(path.join(temp, "assets"));
    if (files.length !== expected.size) throw new SafeError("素材の控えの件数が一致しません");
    for (const one of expected.values()) {
      const file = assetPath(temp, one.key);
      if (digest(await readFile(file)) !== one.sha256) throw new SafeError("素材の控えが壊れています");
      if (existing.has(one.key)) {
        const saved = await get(one.key, { access: "private" });
        if (saved?.statusCode !== 200 || digest(Buffer.from(await new Response(saved.stream).arrayBuffer())) !== one.sha256) throw new SafeError("復元先に違う素材があります。上書きしません");
      } else await put(one.key, createReadStream(file), { access: "private", addRandomSuffix: false, allowOverwrite: false, contentType: one.type });
    }
    execFileSync("psql", ["--no-psqlrc", "--single-transaction", "--set", "ON_ERROR_STOP=1", "--file", sqlFile], { env: pgEnvironment(url), stdio: ["ignore", "ignore", "pipe"] });
    console.log("復元しました。投稿用の鍵とログイン状態は復元しません。本人が改めてログインし、資料と招待先を確認してください。");
  } finally { await rm(temp, { recursive: true, force: true }); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch((error) => {
  console.error(error instanceof SafeError ? error.message : "控えの作成・復元に失敗しました。接続設定、空き容量、PostgreSQLの操作道具を確認してください。");
  process.exitCode = 1;
});
