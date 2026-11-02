import postgres from "postgres";
import { randomBytes, createHash } from "node:crypto";
import { SCRAM_VERIFIER, scramVerifier } from "./scram.mjs";
import { readFile, readdir, open, truncate } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
export const migrationsDirectory = path.join(root, "db/migrations");
/** 設置で受講生が作る唯一の設定ファイル。初期化・乱数・診断・控えのどのコマンドもこれを読み、足す値はここへ追記する。 */
export const SETUP_ENV_FILE = ".env.setup";

/**
 * 設置の設定ファイルへ `名前=値` を追記する。ファイルは先にあること（3-7 で手で作る）。
 * 同じ名前の行が既にあれば拒否する（黙って二重にしない）。戻り値の `rollback` は追記前の長さへ戻す。
 */
export async function appendEnvEntries(file, entries) {
  const handle = await open(file, "r+");
  let size = 0;
  try {
    const before = await handle.readFile("utf8");
    size = Buffer.byteLength(before);
    const present = Object.keys(entries).filter((name) => new RegExp(`^${name}=`, "m").test(before));
    if (present.length) throw new Error(`${path.basename(file)} に ${present.join("・")} が既にあります。残すならその行を消してからやり直してください`);
    const invalid = Object.entries(entries).find(([name, value]) => !/^[A-Z][A-Z0-9_]*$/.test(name) || /[\r\n]/.test(String(value)));
    if (invalid) throw new Error("設定の名前か値の形が正しくありません");
    const lines = Object.entries(entries).map(([name, value]) => `${name}=${value}\n`).join("");
    const text = (before.length && !before.endsWith("\n") ? "\n" : "") + lines;
    await handle.write(text, size, "utf8");
    await handle.sync();
  } finally { await handle.close(); }
  return { rollback: async () => { await truncate(file, size); } };
}

export async function migrations() {
  const names = (await readdir(migrationsDirectory)).filter((name) => /^\d+.*\.sql$/.test(name)).sort();
  return Promise.all(names.map(async (name) => {
    const source = await readFile(path.join(migrationsDirectory, name), "utf8");
    // 歴史的な社内管理者の登録と、会社の行（最初の組織・所属・運営者。印で囲んだ範囲）だけを新規設置から除く。DDLの正本は一つのまま。
    const text = source.replace(/^insert into public\.admins \(email\) values \('[^']+'\) on conflict do nothing;\s*$/m, "")
      .replace(/^-- company-seed: begin$[\s\S]*?^-- company-seed: end$/gm, "")
      .replace(/to service_role;/g, "to current_user;")
      .replace(/^revoke (.+) from public, anon, authenticated;$/gm, (_, privilege) => {
        const conditional = ["anon", "authenticated"].map((role) =>
          `if exists (select 1 from pg_roles where rolname = '${role}') then execute 'revoke ${privilege} from ${role}'; end if;`
        ).join("\n");
        return `revoke ${privilege} from public;\ndo $$ begin\n${conditional}\nend $$;`;
      });
    return { name, text, hash: createHash("sha256").update(text).digest("hex") };
  }));
}

/**
 * 脚本から PostgreSQL へつなぐときの設定。認証局（DATABASE_CA_CERT）は `env` から読む。
 * 見本の流し込みのように env を引数で受け取る脚本は、その env を渡すこと（process.env に置く前の
 * 最初の接続が認証局を持たず、Supabase の入口で「鎖の中に自己署名」で止まる）。
 */
export function databaseOptions(url, env = process.env) {
  const parsed = new URL(url);
  if (!["postgres:", "postgresql:"].includes(parsed.protocol)) throw new Error("保存先の形式が正しくありません");
  return { max: 1, prepare: false, connect_timeout: 10, ssl: ["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname) ? false : { rejectUnauthorized: true, ...(env.DATABASE_CA_CERT ? {ca:env.DATABASE_CA_CERT} : {}) }, onnotice: () => {} };
}

export { scramVerifier } from "./scram.mjs";

/**
 * 通常運転用の、ログインだけできる役割を作る 1 文を組み立てる。
 * 通常は SCRAM-SHA-256 の検証子だけを渡す。Neon は検証子を受け付けないため、
 * Neon の PostgreSQL 接続先に限り機械生成した32バイトの鍵を渡す（TLSは必須のまま）。
 * Neon 側で DDL を記録すると鍵が含まれ得るため、この文や例外の query は出力しない。
 * 名前と検証子は機械生成した安全な文字だけ。外から来た文字を DDL に混ぜない。
 */
export function createRuntimeRoleStatement(role, password, url) {
  if (!/^pages_runtime_[0-9a-f]+$/.test(role)) throw new Error("役割の名前の形が正しくありません");
  const target = url ? new URL(url) : null;
  if (target && ["postgres:", "postgresql:"].includes(target.protocol) && target.hostname.endsWith(".neon.tech")) {
    if (!/^[A-Za-z0-9_-]{43}$/.test(password)) throw new Error("機械生成した通常運転用の鍵の形が正しくありません");
    return `create role "${role}" login nosuperuser nocreatedb nocreaterole noreplication nobypassrls password '${password}'`;
  }
  const verifier = scramVerifier(password);
  if (!SCRAM_VERIFIER.test(verifier)) throw new Error("検証子の形が正しくありません");
  return `create role "${role}" login nosuperuser nocreatedb nocreaterole noreplication nobypassrls password '${verifier}'`;
}

export async function initializeDatabase(url, ownerEmail, persistRuntime) {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ownerEmail)) throw new Error("本人のメールアドレスが正しくありません");
  const sql = postgres(url, databaseOptions(url));
  const role = `pages_runtime_${randomBytes(6).toString("hex")}`;
  const password = randomBytes(32).toString("base64url");
  const runtime = new URL(url);
  const suffix = runtime.hostname.endsWith(".pooler.supabase.com") ? decodeURIComponent(runtime.username).split(".").slice(1).join(".") : "";
  runtime.username = suffix ? `${role}.${suffix}` : role;
  runtime.password = password;
  try {
    const existing = await sql`select tablename from pg_tables where schemaname = 'public'`;
    if (existing.length) throw new Error("空ではない保存先です。既存のデータを守るため初期化しません");
    const steps = await migrations();
    await sql.begin(async (tx) => {
      for (const migration of steps) await tx.unsafe(migration.text);
      await tx`create table public.pages_schema_migrations (name text primary key, checksum text not null)`;
      // 表の定義は migration（pages_installation.sql）が正本。ここは誰の設置かの 1 行だけを入れる。
      await tx`insert into public.pages_installation values (true, 'personal', ${ownerEmail.toLowerCase()})`;
      for (const migration of steps) await tx`insert into public.pages_schema_migrations values (${migration.name}, ${migration.hash})`;
      await tx`insert into public.admins (email) values (${ownerEmail.toLowerCase()})`;
      // 名前と鍵は機械生成した安全な文字だけ。受講生の入力をDDLへ混ぜない。Neon以外は検証子を渡す。
      await tx.unsafe(createRuntimeRoleStatement(role, password, url));
      await tx`revoke create on schema public from public`;
      await tx.unsafe(`grant usage on schema public to "${role}"`);
      const tables = await tx`select tablename from pg_tables where schemaname = 'public' and tablename not in ('pages_schema_migrations', 'pages_installation')`;
      for (const { tablename } of tables) {
        if (!/^[a-z_]+$/.test(tablename)) throw new Error("想定外の表が作成されました");
        await tx.unsafe(`grant select, insert, update, delete on public."${tablename}" to "${role}"`);
        await tx.unsafe(`create policy pages_server on public."${tablename}" to "${role}" using (true) with check (true)`);
      }
      await tx.unsafe(`grant usage, select on all sequences in schema public to "${role}"`);
      await tx.unsafe(`grant execute on all functions in schema public to "${role}"`);
      await tx.unsafe(`grant select on public.pages_installation to "${role}"`);
      await tx.unsafe(`create policy pages_installation_read on public.pages_installation for select to "${role}" using (true)`);
      // 鍵を保存できなければ、DBの初期化も確定させない。
      if (persistRuntime) await persistRuntime(runtime.toString());
    });
    return runtime.toString();
  } finally { await sql.end({ timeout: 5 }); }
}

async function main() {
  if (process.argv[2] !== "init" || !process.argv.includes("--confirm-new")) throw new Error("新しい専用の保存先に限り、init --confirm-new を指定してください");
  const url = process.env.DATABASE_ADMIN_URL;
  if (!url) throw new Error("初期設定用の接続情報を DATABASE_ADMIN_URL に設定してください");
  const output = path.join(root, SETUP_ENV_FILE);
  // 追記はトランザクションの中で行い、失敗したら追記前へ戻す（鍵を保存できなければ初期化も確定させない）。
  let saved = null;
  try {
    await initializeDatabase(url, process.env.PAGES_OWNER_EMAIL ?? "", async (runtime) => {
      saved = await appendEnvEntries(output, { DATABASE_URL: runtime });
    });
  } catch (error) {
    if (saved) await saved.rollback();
    throw error;
  }
  console.log(`初期化しました。通常運転用の接続情報は ${SETUP_ENV_FILE} の DATABASE_URL に追記しました。Vercel へはこの行を移し、DATABASE_ADMIN_URL は通常運転に渡さないでください。`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => { console.error(error instanceof Error && !('severity' in error) ? error.message : "保存先の初期化に失敗しました。接続と権限を確認してください"); process.exitCode = 1; });
}
