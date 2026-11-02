import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "node:net";
import EmbeddedPostgres from "embedded-postgres";
import { randomBytes } from "node:crypto";
import { createRequire } from "node:module";
import { build } from "esbuild";
import { pgEnvironment, validateDataDump, orderDataDumpForRestore, encryptBackup, decryptBackup, BACKUP_EXCLUDED_TABLES } from "../scripts/setup/backup.mjs";
import { execFileSync } from "node:child_process";
import postgres from "postgres";
import { readFile } from "node:fs/promises";
import { initializeDatabase, migrations } from "../scripts/setup/database.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pgTool = (name) => process.env.PAGES_TEST_PG_BIN_DIR ? path.join(process.env.PAGES_TEST_PG_BIN_DIR, name) : name;
const temp = await mkdtemp(path.join(tmpdir(), "pages-postgres-"));
const data = path.join(temp, "database");
let running = false;
let cluster;
let store;
let failed = false;
// 保存先の記録（DDL を記録する設定）。接続情報や鍵を含み得るので、表示せずに中身を確かめるだけに使う。
const serverLogs = [];

try {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("試験用の接続先を用意できません");
  const port = address.port;
  await new Promise((resolve) => server.close(resolve));
  assert.equal(pgEnvironment("postgres://tester:example@db.example.com/test").PGSSLMODE, "verify-full");
  assert.equal(pgEnvironment("postgres://tester:example@db.example.com/test?sslrootcert=%2Ftmp%2Fca.pem").PGSSLROOTCERT, "/tmp/ca.pem");
  const password = randomBytes(24).toString("hex");
  cluster = new EmbeddedPostgres({ databaseDir: data, user: "pages_test_admin", password, port, persistent: false,
    // DDL を記録する設定のまま初期化する（Supabase と同じ。記録を弱めて通すことはしない）。
    postgresFlags: ["-h", "127.0.0.1", "-k", temp, "-c", "log_statement=ddl"], initdbFlags: ["--encoding=UTF8", "--no-locale"],
    onLog: (line) => { serverLogs.push(String(line)); }, onError: (line) => { serverLogs.push(String(line)); } });
  await cluster.initialise();
  await cluster.start();
  running = true;
  const admin = `postgres://pages_test_admin:${password}@127.0.0.1:${port}/postgres`;
  process.env.DATABASE_URL = await initializeDatabase(admin, "owner@example.com");
  {
    // 通常運転の役割のパスワードは SQL に生のまま書かず、SCRAM-SHA-256 の検証子だけを渡す
    const runtime = new URL(process.env.DATABASE_URL);
    const runtimeRole = decodeURIComponent(runtime.username);
    const runtimePassword = decodeURIComponent(runtime.password);
    assert.match(runtimeRole, /^pages_runtime_[0-9a-f]{12}$/);
    assert.ok(serverLogs.some((line) => line.includes(`create role "${runtimeRole}"`)), "DDL の記録に役割の作成が残っていない（記録が効いていない）");
    assert.ok(serverLogs.some((line) => line.includes(`create role "${runtimeRole}"`) && line.includes("SCRAM-SHA-256$")), "役割の作成に検証子が渡っていない");
    assert.equal(serverLogs.some((line) => line.includes(runtimePassword)), false, "DDL の記録に生のパスワードが残っている");
    const superuser = postgres(admin, { max: 1, onnotice: () => {} });
    const [stored] = await superuser`select rolpassword from pg_authid where rolname = ${runtimeRole}`;
    await superuser.end();
    assert.ok(typeof stored.rolpassword === "string" && stored.rolpassword.startsWith("SCRAM-SHA-256$4096:"), "保存先に検証子の形で残っていない");
    const loggedIn = postgres(process.env.DATABASE_URL, { max: 1, onnotice: () => {} });
    assert.equal((await loggedIn`select current_user as name`)[0].name, runtimeRole);
    await loggedIn.end();
    runtime.password = randomBytes(32).toString("base64url");
    const wrong = postgres(runtime.toString(), { max: 1, onnotice: () => {} });
    await assert.rejects(wrong`select 1`, "違うパスワードでもログインできてしまう（パスワードの照合が効いていない）");
    await wrong.end();
    console.log("OK: 通常運転の役割は、DDL を記録する保存先でも生のパスワードを記録に残さずに作られ、そのパスワードでログインできる");
  }
  process.env.PAGES_EDITION = "personal";
  process.env.PAGES_OWNER_EMAIL = "owner@example.com";
  process.env.PAGES_SITE_URL = "https://pages.example.com";
  delete process.env.VERCEL;
  const stub = path.join(temp, "stubs.mjs");
  await writeFile(stub, `export const ALLOWED_DOMAIN = "example.com"; export const auth = async () => null;
export const headers = async () => ({get: () => null}); export const cookies = async () => ({get: () => undefined});
export const dangerouslyDeleteByTag = async () => {}; export const getCache = () => ({get: async () => null,set: async () => {},delete: async () => {}});`);
  const out = path.join(temp, "store.cjs");
  await build({ stdin: { contents: `export * from "${root}/src/lib/db/database"; export * from "${root}/src/lib/pages/store"; export * from "${root}/src/lib/access/access"; export * from "${root}/src/lib/identity/publish-tokens"; export * from "${root}/src/lib/deck/design/html"; export * from "${root}/src/lib/workspace/usage";`, resolveDir: root, loader: "ts" }, bundle: true, platform: "node", format: "cjs", outfile: out, alias: { "@/auth": stub, "next/headers": stub, "@vercel/functions": stub } });
  store = createRequire(import.meta.url)(out);
  process.env.PAGES_OWNER_EMAIL = "wrong@example.com";
  assert.notEqual((await store.getDb().from("organizations").select("id")).error, null);
  const setupNames = { AUTH_SECRET: "x", AUTH_GOOGLE_ID: "x", AUTH_GOOGLE_SECRET: "x", BLOB_READ_WRITE_TOKEN: "x" };
  Object.assign(process.env, setupNames);
  assert.deepEqual(await store.installationProblem(), { kind: "owner-mismatch" });
  process.env.PAGES_OWNER_EMAIL = "owner@example.com";
  assert.equal(await store.installationProblem(), null);
  console.log("OK: 設置の案内は本人の不一致を見分け、そろった保存先では何も出さない");
  const author = { email: "owner@example.com", name: "試行する人" };
  // 配布版の設置は「組織が 1 つだけの設置」。組織の目印は最初の組織と同じ固定の値
  const SURPRISE = { id: "00000000-0000-4000-8000-000000000001", assetPrefix: "" };
  const scoped = store.orgDb(SURPRISE);
  // 名乗りは設置の組織の所属つき（配布版は名簿を引かず、設置した本人を持ち主・ほかを member とする）
  const member = (email) => ({ kind: "member", email, name: "試験", image: null,
    organization: { ...SURPRISE, role: email === author.email ? "owner" : "member" } });
  const first = await store.commitRevision({ organization: SURPRISE, pageSlug: "internal/check", html: "<title>試験</title><p>最初の本文</p>", message: "", author });
  assert.equal(first.page.visibility, "restricted");
  assert.equal((await store.openPage(SURPRISE, member(author.email), "internal/check")).ok, true);
  assert.equal((await store.openPage(SURPRISE, member("reader@example.com"), "internal/check")).ok, false);
  const limited = postgres(process.env.DATABASE_URL, {max: 1});
  await assert.rejects(limited.unsafe("create table public.must_not_create (id int)"));
  await assert.rejects(limited`update public.pages_installation set owner_email = 'intruder@example.com'`);
  await assert.rejects(limited`insert into public.pages_installation values (true, 'personal', 'intruder@example.com')`);
  await assert.rejects(limited`delete from public.pages_installation`);
  assert.equal((await limited`select owner_email from public.pages_installation`)[0].owner_email, "owner@example.com");
  const { diagnose } = await import("../scripts/setup/personal.mjs");
  const doctorEnv = { PAGES_OWNER_EMAIL: "owner@example.com", PAGES_SITE_URL: "https://pages.example.com", DATABASE_URL: process.env.DATABASE_URL, AUTH_SECRET: "x", AUTH_GOOGLE_ID: "x", AUTH_GOOGLE_SECRET: "x", BLOB_READ_WRITE_TOKEN: "x" };
  const doctorIo = { query: (text) => limited.unsafe(text), listBlobs: async () => { throw new Error("試験では画像の置き場を用意しない"); }, getJson: async () => null, savedSite: () => null, signedIn: async () => "missing" };
  const reached = await diagnose(doctorEnv, doctorIo);
  assert.equal(reached.step, "画像の置き場");
  assert.deepEqual(reached.passed.slice(1), ["保存先に繋がる", "保存先が本人のものになっている"]);
  assert.equal((await diagnose({ ...doctorEnv, PAGES_OWNER_EMAIL: "someone@example.com" }, doctorIo)).step, "本人の照合");
  console.log("OK: 設置の診断が本物の保存先で、繋がることと本人の照合を確かめる");
  await limited.end();
  const db = store.getDb();
  const grant = await scoped.from("page_permissions").insert({ page_id: first.page.id, grantee_kind: "member", member_email: "reader@example.com", added_by: author.email });
  assert.equal(grant.error, null);
  assert.equal((await store.openToolsPage(SURPRISE, member("reader@example.com"), "internal/check")).ok, true);
  const second = await store.commitRevision({ organization: SURPRISE, pageSlug: "internal/check", html: "<title>試験</title><p>直した本文</p>", message: "直す", author, expectedHead: first.versionId });
  assert.notEqual(second.versionId, first.versionId);
  await assert.rejects(store.commitRevision({ organization: SURPRISE, pageSlug: "internal/check", html: "<p>競合</p>", message: "", author, expectedHead: first.versionId }));
  await assert.rejects(store.commitRevision({ organization: SURPRISE, pageSlug: "internal/check", html: "<script>alert(1)</script>", message: "", author }));
  const immutable = await scoped.from("page_revisions").update({ html: "改ざん" }).eq("page_id", first.page.id);
  assert.notEqual(immutable.error, null);
  assert.equal((await scoped.from("pages").select("id").eq("page_slug", "' OR 1=1 --")).data.length, 0);
  // 台帳に無い名前は、組み立てる前に止まる（組織の絞りの台帳 src/lib/organization/tenant-tables.json）
  assert.throws(() => db.from("pages; drop table pages"));
  assert.throws(() => scoped.from("pages; drop table pages"));
  const removed = await scoped.from("page_permissions").delete().eq("page_id", first.page.id).eq("member_email", "reader@example.com");
  assert.equal(removed.error, null);
  assert.equal((await store.openToolsPage(SURPRISE, member("reader@example.com"), "internal/check")).ok, false);
  await scoped.from("pages").update({ visibility: "public" }).eq("id", first.page.id);
  assert.equal((await store.openPage(SURPRISE, null, "internal/check")).ok, true);
  assert.equal((await store.openToolsPage(SURPRISE, member("reader@example.com"), "internal/check")).ok, false);
  const issued = await store.issueToken(SURPRISE, author, "試験");
  assert.equal((await store.verifyToken(SURPRISE, issued.token)).email, author.email);
  // 一覧と失効は、アドレスの大文字小文字と前後の空白をそろえて比べる
  assert.equal((await store.listTokens(SURPRISE, " Owner@Example.com ")).some((one) => one.id === issued.summary.id), true);
  assert.equal(await store.revokeToken(SURPRISE, issued.summary.id, "OWNER@example.com"), true);
  assert.equal(await store.verifyToken(SURPRISE, issued.token), null);
  const designHtml = await readFile(path.join(root, "tests/checks/fixtures/internal/example/deck-design-presentation.html"), "utf8");
  const overrides = { version: 1, document: { accent: "#123456" }, slides: {} };
  const editedDesign = store.withDeckOverrides(designHtml, overrides);
  await store.commitRevision({ organization: SURPRISE, pageSlug: "internal/design", html: editedDesign, author, message: "配色を保存" });
  const republished = await store.commitRevision({ organization: SURPRISE, pageSlug: "internal/design", html: designHtml.replace("余白が、", "余白から、"), author, message: "原稿だけ更新", preserveDeckAppearance: true });
  const inherited = await scoped.from("page_revisions").select("html").eq("page_id", republished.page.id).eq("version_id", republished.versionId).single();
  assert.equal(inherited.error, null);
  assert.deepEqual(store.readDeckDesignHtml(inherited.data.html).overrides, overrides);
  assert.ok(inherited.data.html.includes("余白から、"));
  console.log("OK: 配布版で着せ替えを保存し、原稿の再投稿後も維持");
  const usage = await store.siteUsageFor("OWNER@example.com");
  assert.ok(usage !== null && usage.databaseBytes > 0);
  assert.equal(usage.pages, 2);
  assert.equal(usage.revisions, 4);
  assert.equal(await store.siteUsageFor("reader@example.com"), null);
  console.log("OK: 使用量は設置した本人にだけ、保存先の大きさと資料・版の数を返す");
  await assert.rejects(initializeDatabase(admin, author.email));
  // 録音の内容と共有許可は残し、利用者のGitHub認証・途中の認証状態は控えに入れない。
  const backupFixtureDb = postgres(admin, { max: 1 });
  const recordingId = "f1000000-0000-4000-8000-000000000001";
  const generationId = "f2000000-0000-4000-8000-000000000001";
  const recordingPageId = "f3000000-0000-4000-8000-000000000001";
  const githubRevision = "f4000000-0000-4000-8000-000000000001";
  await backupFixtureDb`insert into public.recordings
    (id,owner_email,title,source_kind,byte_size,sha256,accepted_at,audio_key,storage_verified_at,duration_seconds,state,raw_key)
    values (${recordingId},${author.email},'控え検査用の録音','web',100,${"a".repeat(64)},now(),'recordings/test/audio',now(),10,'complete','recordings/test/raw.json')`;
  await backupFixtureDb`insert into public.recording_grants(recording_id,member_email,artifact,granted_by)
    values (${recordingId},'reader@example.com','minutes',${author.email})`;
  await backupFixtureDb`insert into public.recording_generations
    (id,owner_email,request_key,"grouping",context_mode,selected_repositories,pipeline_version,state)
    values (${generationId},${author.email},${generationId},'single','none','[]'::jsonb,'backup-test','complete')`;
  await backupFixtureDb`insert into public.recording_generation_inputs(generation_id,recording_id,owner_email,position)
    values (${generationId},${recordingId},${author.email},0)`;
  await backupFixtureDb`insert into public.pages(id,page_slug,visibility,title,created_by,recording_protected,current_version_id)
    values (${recordingPageId},'internal/recordings/backup-fixture/minutes','restricted','控え検査用の議事録',${author.email},true,'backup-version')`;
  await backupFixtureDb`insert into public.recording_artifacts(id,generation_id,kind,basis,page_id)
    values ('f5000000-0000-4000-8000-000000000001',${generationId},'minutes','audio_only',${recordingPageId})`;
  await backupFixtureDb`insert into public.recording_github_connections
    (owner_email,github_user_id,github_login,encrypted_credentials,expires_at,refresh_expires_at,revision)
    values (${author.email},771,'backup-fixture','encrypted-test-token',now()+interval '1 hour',now()+interval '1 day',${githubRevision})`;
  await backupFixtureDb`insert into public.recording_github_pending
    (state_hash,owner_email,encrypted_verifier,expires_at,operation_id)
    values (${"a".repeat(64)},${author.email},'encrypted-test-verifier',now()+interval '10 minutes',${githubRevision})`;
  await backupFixtureDb`insert into public.recording_github_controls(owner_email,operation_id) values (${author.email},${githubRevision})`;
  await backupFixtureDb.end();
  for (const table of ["recording_github_connections", "recording_github_pending", "recording_github_controls"]) {
    assert.ok(BACKUP_EXCLUDED_TABLES.includes(table), `${table} must not travel with a database backup`);
  }
  // DBと別の環境への復旧、および控えの暗号化を実証する。
  const sqlFile = path.join(temp, "backup.sql");
  execFileSync(pgTool("pg_dump"), ["--data-only", "--no-owner", "--no-acl", "--schema=public", ...BACKUP_EXCLUDED_TABLES.map((name) => `--exclude-table=public.${name}`), "--file", sqlFile], {env: pgEnvironment(admin), stdio: ["ignore", "ignore", "pipe"]});
  const rawSql = await readFile(sqlFile, "utf8");
  const orderedSql = orderDataDumpForRestore(rawSql);
  await writeFile(sqlFile, orderedSql, { mode: 0o600 });
  validateDataDump(orderedSql);
  assert.ok(orderedSql.indexOf("COPY public.recordings ") < orderedSql.indexOf("COPY public.recording_generation_inputs "));
  assert.ok(orderedSql.indexOf("COPY public.recording_generations ") < orderedSql.indexOf("COPY public.recording_generation_inputs "));
  assert.ok(orderedSql.indexOf("COPY public.recording_generation_inputs ") < orderedSql.indexOf("COPY public.recording_artifacts "));
  const encrypted = path.join(temp, "backup.enc"), decrypted = path.join(temp, "restored.sql");
  await encryptBackup(sqlFile, encrypted, "test-only-backup-password");
  await assert.rejects(decryptBackup(encrypted, decrypted, "wrong-password"));
  await decryptBackup(encrypted, decrypted, "test-only-backup-password");
  assert.equal(await readFile(sqlFile, "utf8"), await readFile(decrypted, "utf8"));
  assert.throws(() => validateDataDump("DROP TABLE public.pages;"));
  assert.doesNotThrow(() => validateDataDump('COPY public.recording_generations (id, owner_email, request_key, "grouping", context_mode) FROM stdin;\n\\.\n'));
  assert.doesNotThrow(() => validateDataDump('COPY public.recordings (id, sha256, raw_sha256) FROM stdin;\n\\.\n'));
  assert.throws(() => validateDataDump('COPY public.recording_generations (id, "grouping; DROP TABLE public.pages;") FROM stdin;\n\\.\n'));
  // 控えに入れない表（鍵・引換券）の中身が紛れ込んだ控えも、今までどおり復元しない
  assert.throws(() => validateDataDump("COPY public.app_login_codes (id) FROM stdin;\n\\.\n"));
  const adminConnection = postgres(admin, {max: 1});
  await adminConnection.unsafe("create database schema_only");
  const schemaOnly = postgres(admin.replace("/postgres", "/schema_only"), {max: 1, onnotice: () => {}});
  await schemaOnly.begin(async (tx) => { for (const migration of await migrations()) await tx.unsafe(migration.text); });
  assert.equal((await schemaOnly`select count(*)::int as rows from public.pages_installation`)[0].rows, 0);
  await schemaOnly.end();
  console.log("OK: 本人照合の表は migration だけで作られ、行は初期化の脚本だけが入れる");
  await adminConnection.unsafe("create database empty_db");
  const runtimeUrl = process.env.DATABASE_URL;
  for (const [database, kind] of [["schema_only", "not-initialized"], ["empty_db", "not-initialized"]]) {
    await store.closeDatabase();
    process.env.DATABASE_URL = admin.replace("/postgres", `/${database}`);
    assert.deepEqual(await store.installationProblem(), { kind }, database);
  }
  await store.closeDatabase();
  process.env.DATABASE_URL = runtimeUrl;
  console.log("OK: 設置の案内は、行の無い保存先と表の無い保存先を初期化前として示す");
  await adminConnection.unsafe("create database restored");
  await adminConnection.unsafe("create database interrupted");
  await adminConnection.end();
  await assert.rejects(initializeDatabase(admin.replace("/postgres", "/interrupted"), author.email, async () => { throw new Error("save failed"); }));
  const recoveredRuntime = await initializeDatabase(admin.replace("/postgres", "/interrupted"), author.email);
  assert.ok(recoveredRuntime);
  const restoredRuntime = await initializeDatabase(admin.replace("/postgres", "/restored"), author.email);
  execFileSync(pgTool("psql"), ["--no-psqlrc", "--single-transaction", "--set", "ON_ERROR_STOP=1", "--file", decrypted], {env: pgEnvironment(admin.replace("/postgres", "/restored")), stdio: ["ignore", "ignore", "pipe"]});
  const restoredDb = postgres(restoredRuntime, {max: 1});
  assert.equal((await restoredDb`select html from page_revisions where version_id = ${first.versionId}`)[0].html, "<title>試験</title><p>最初の本文</p>");
  assert.equal((await restoredDb`select current_version_id from pages where id = ${first.page.id}`)[0].current_version_id, second.versionId);
  await restoredDb.end();
  const restoredAdmin = postgres(admin.replace("/postgres", "/restored"), { max: 1 });
  assert.equal((await restoredAdmin`select title from public.recordings where id=${recordingId}`)[0].title, "控え検査用の録音");
  assert.equal((await restoredAdmin`select member_email,artifact from public.recording_grants where recording_id=${recordingId}`)[0].artifact, "minutes");
  assert.equal((await restoredAdmin`select recording_id from public.recording_generation_inputs where generation_id=${generationId}`)[0].recording_id, recordingId);
  assert.equal((await restoredAdmin`select page_id from public.recording_artifacts where generation_id=${generationId}`)[0].page_id, recordingPageId);
  for (const table of ["recording_github_connections", "recording_github_pending", "recording_github_controls"]) {
    const rows = await restoredAdmin.unsafe(`select 1 from public."${table}" limit 1`);
    assert.equal(rows.length, 0, `${table} must be empty after restore`);
  }
  await restoredAdmin.end();
  for (const made of [recoveredRuntime, restoredRuntime]) assert.equal(serverLogs.some((line) => line.includes(decodeURIComponent(new URL(made).password))), false, "やり直しの初期化で、DDL の記録に生のパスワードが残っている");
  console.log("OK: 暗号化、間違ったパスワードの拒否、別DBへの復元、鍵の保存失敗時の初期化取り消しと再実行");
  {
    // 組織の境。2 つ目の組織を置き、同じ呼び名のページを両方に作る。
    // 全体で一意の古い縛り（pages.page_slug ほか）は縮める段（organization_keys_shrink）で外してあるので、移行のままで置ける
    const ORG_B = { id: "00000000-0000-4000-8000-0000000000b2", assetPrefix: "o/00000000-0000-4000-8000-0000000000b2/" };
    const shrink = postgres(admin, { max: 1, onnotice: () => {} });
    await shrink`insert into public.organizations (id, slug, name, host, asset_prefix) values (${ORG_B.id}, 'acme', 'Acme', 'acme.pages.example.com', ${ORG_B.assetPrefix})`;
    // 縮める段: 全体で一意の古い縛りが残っていない（呼び名・まとまりの名前・コメントの送り直しの目印・人のアドレスだけの主キー）
    const oldKeys = await shrink`select indexrelid::regclass::text as name from pg_index where indisunique
      and indexrelid::regclass::text in ('pages_page_slug_key', 'groups_alive_name_key', 'page_comments_request_key_idx')`;
    assert.equal(oldKeys.length, 0, oldKeys.map((row) => row.name).join(", "));
    for (const table of ["inbox_reads", "page_view_optouts", "beta_feature_optins", "deck_image_search_usage", "repository_document_views"]) {
      const [key] = await shrink`select pg_get_indexdef(i.indexrelid) as def from pg_index i where i.indrelid = ${`public.${table}`}::regclass and i.indisprimary`;
      assert.match(key.def, /\(organization_id, /, `${table} の主キーが組織つきの組でない`);
    }
    // 古い縛りの列の組で on conflict を書いた、組織を取らない古い関数は消してある
    const [{ old }] = await shrink`select count(*)::int as old from pg_proc where pronamespace = 'public'::regnamespace
      and proname in ('mark_inbox_seen', 'consume_deck_image_search', 'record_repository_document_view', 'prepare_recording_output')`;
    assert.equal(old, 0);
    await shrink.end();
    const ours = await store.commitRevision({ organization: SURPRISE, pageSlug: "internal/guide/intro", html: "<title>案内</title><p>最初の組織 の本文</p>", message: "", author });
    const theirs = await store.commitRevision({ organization: ORG_B, pageSlug: "internal/guide/intro", html: "<title>案内</title><p>Acme の本文</p>", message: "", author });
    assert.notEqual(ours.page.id, theirs.page.id);
    const ourGate = await store.openPage(SURPRISE, member(author.email), "internal/guide/intro");
    const theirGate = await store.openPage(ORG_B, member(author.email), "internal/guide/intro");
    assert.ok(ourGate.ok && theirGate.ok);
    assert.equal(ourGate.page.id, ours.page.id);
    assert.equal(theirGate.page.id, theirs.page.id);
    assert.equal(await store.readHtmlOf(ourGate.page), "<title>案内</title><p>最初の組織 の本文</p>");
    assert.equal(await store.readHtmlOf(theirGate.page), "<title>案内</title><p>Acme の本文</p>");
    // 組織で絞った口は、別の組織の行を 1 行も返さない（目印を知っていても）
    assert.equal((await store.orgDb(ORG_B).from("pages").select("id").eq("id", ours.page.id)).data.length, 0);
    assert.equal((await store.orgDb(ORG_B).from("page_revisions").select("version_id").eq("page_id", ours.page.id)).data.length, 0);
    assert.equal((await store.findPage(ORG_B, "internal/check")), null);
    console.log("OK: 2 つの組織に同じ呼び名のページを作れて、それぞれの組織でそれぞれの本文が返る（別の組織の行は 1 行も返らない）");
    {
      // 同じ人・同じ名前・同じ目印が 2 つの組織に並ぶ（組織ごとの縛り）
      const both = postgres(process.env.DATABASE_URL, { max: 1, onnotice: () => {} });
      const person = "both-organizations@example.com";
      for (const organization of [SURPRISE, ORG_B]) {
        await both`select public.org_mark_inbox_seen(${organization.id}, ${person}, now())`;
        await both`insert into public.page_view_optouts (organization_id, viewer_email) values (${organization.id}, ${person})`;
        await both`insert into public.beta_feature_optins (organization_id, owner_email, feature) values (${organization.id}, ${person}, 'shrink-check')`;
        await both`insert into public.groups (organization_id, name, created_by) values (${organization.id}, '同じ名前のまとまり', ${author.email})`;
      }
      const ourPage = ours.page.id;
      const theirPage = theirs.page.id;
      await both`insert into public.page_comments (organization_id, page_id, page_slug, author_email, author_name, body, request_key)
        values (${SURPRISE.id}, ${ourPage}, 'internal/guide/intro', ${author.email}, '試験', '送り直しの目印', 'shrink-request-key-0001')`;
      await both`insert into public.page_comments (organization_id, page_id, page_slug, author_email, author_name, body, request_key)
        values (${ORG_B.id}, ${theirPage}, 'internal/guide/intro', ${author.email}, '試験', '送り直しの目印', 'shrink-request-key-0001')`;
      // 同じ組織の中では、今までどおり 1 つだけ
      await assert.rejects(both`insert into public.groups (organization_id, name, created_by) values (${ORG_B.id}, '同じ名前のまとまり', ${author.email})`, /duplicate key/);
      await assert.rejects(both`insert into public.page_comments (organization_id, page_id, page_slug, author_email, author_name, body, request_key)
        values (${ORG_B.id}, ${theirPage}, 'internal/guide/intro', ${author.email}, '試験', '二重', 'shrink-request-key-0001')`, /duplicate key/);
      const [{ reads }] = await both`select count(*)::int as reads from public.inbox_reads where viewer_email = ${person}`;
      assert.equal(reads, 2);
      await both`delete from public.page_comments where request_key = 'shrink-request-key-0001'`;
      await both`delete from public.groups where name = '同じ名前のまとまり'`;
      await both`delete from public.beta_feature_optins where feature = 'shrink-check'`;
      await both`delete from public.inbox_reads where viewer_email = ${person}`;
      await both`delete from public.page_view_optouts where viewer_email = ${person}`;
      await both.end();
      console.log("OK: 同じ人の既読・記録を残さない・ベータ機能と、同じ名前のまとまり・同じ送り直しの目印を 2 つの組織に置ける（同じ組織の中では 1 つ）");
    }
    // 保存先の縛り: 別の組織のページの目印を持つコメント・版は、アプリが間違えても保存先が断る
    const runtimeDb = postgres(process.env.DATABASE_URL, { max: 1, onnotice: () => {} });
    await assert.rejects(runtimeDb`insert into public.page_comments (organization_id, page_id, page_slug, author_email, author_name, body)
      values (${ORG_B.id}, ${ours.page.id}, 'internal/guide/intro', ${author.email}, '試験', '越境')`, /foreign key/);
    await assert.rejects(runtimeDb`insert into public.page_permissions (organization_id, page_id, grantee_kind, member_email, added_by)
      values (${ORG_B.id}, ${ours.page.id}, 'member', 'reader@example.com', ${author.email})`, /foreign key/);
    // 組織で絞った口からは、別の組織の印を書かせない（口が先に止める）
    assert.throws(() => store.withOrganization({ table: "page_comments", operation: "insert", columns: "*", returning: false, values: [{ organization_id: SURPRISE.id }], filters: [], alternatives: [], orders: [], cardinality: "many", organizationId: ORG_B.id }));
    await runtimeDb.end();
    console.log("OK: 別の組織のページの目印を持つコメント・許可の insert は保存先が断る（複合の外部キー）");
    // 監査の記録は追記専用。運営の接続（通常運転の役割）でも、初期設定の接続でも、書き換えと削除を保存先が断る
    const auditRuntime = postgres(process.env.DATABASE_URL, { max: 1, onnotice: () => {} });
    const auditAdmin = postgres(admin, { max: 1, onnotice: () => {} });
    await auditRuntime`insert into public.organization_audit_log (organization_id, actor_kind, actor_email, action, target_kind, target, change)
      values (${ORG_B.id}, 'member', ${author.email}, 'page.scope-changed', 'page', ${theirs.page.id}, ${auditRuntime.json({ from: "internal", to: "restricted" })})`;
    const [written] = await auditRuntime`select actor_key, target_key from public.organization_audit_log where organization_id = ${ORG_B.id}`;
    assert.match(written.actor_key, /^[0-9a-f]{12}$/);
    assert.equal(written.target_key, theirs.page.id);
    for (const connection of [auditRuntime, auditAdmin]) {
      await assert.rejects(connection`update public.organization_audit_log set action = 'page.deleted' where organization_id = ${ORG_B.id}`, /追記専用/);
      await assert.rejects(connection`delete from public.organization_audit_log where organization_id = ${ORG_B.id}`, /追記専用/);
    }
    assert.equal((await auditAdmin`select count(*)::int as n from public.organization_audit_log where action = 'page.scope-changed'`)[0].n, 1);
    await auditRuntime.end();
    await auditAdmin.end();
    console.log("OK: 監査の記録は追記専用（通常運転の役割でも初期設定の接続でも、書き換えと削除を保存先が断る）");
    // 組織の物理削除。運営の接続（通常運転の役割）から保存先の関数を段ごとに呼ぶ。猶予の前は断り、過ぎたら 2 つ目の組織の行が
    // 0 件になり、最初の組織の行は 1 件も減らない。番人（版・記録）は関数の取引の中でだけ外れ、終わったあとも効いている
    const purgeRuntime = postgres(process.env.DATABASE_URL, { max: 1, onnotice: () => {} });
    const purgeAdmin = postgres(admin, { max: 1, onnotice: () => {} });
    const tables = (await purgeAdmin`select table_name from information_schema.columns where table_schema = 'public' and column_name = 'organization_id' order by 1`).map((row) => row.table_name);
    const countOf = async (id) => {
      let total = 0;
      for (const table of tables) total += (await purgeAdmin.unsafe(`select count(*)::int as n from public."${table}" where organization_id = $1`, [id]))[0].n;
      return total + (await purgeAdmin`select count(*)::int as n from public.organizations where id = ${id}`)[0].n;
    };
    const ourBefore = await countOf(SURPRISE.id);
    const steps = ["children", "revisions", "pages", "members", "audit", "organization"];
    await purgeAdmin`update public.organizations set status = 'suspended', deletion_scheduled_at = now() + interval '30 days' where id = ${ORG_B.id}`;
    for (const step of steps) await assert.rejects(purgeRuntime`select public.org_purge_organization(${ORG_B.id}, ${step}, 1000)`, /purge_refused/, `猶予の前の ${step}`);
    await assert.rejects(purgeRuntime`select public.org_purge_organization(${SURPRISE.id}, 'children', 1000)`, /purge_refused/, "最初の組織");
    assert.ok((await countOf(ORG_B.id)) > 1, "猶予の前に 2 つ目の組織の行が減った");
    await purgeAdmin`update public.organizations set deletion_scheduled_at = now() - interval '1 minute' where id = ${ORG_B.id}`;
    // 1 回 2 行ずつ（段の中で答えが 0 になるまで呼び直す・アプリの夜間の処理と同じ回し方）
    for (const step of steps) {
      for (let calls = 0; calls < 1000; calls += 1) {
        const [answer] = await purgeRuntime`select public.org_purge_organization(${ORG_B.id}, ${step}, 2) as n`;
        assert.ok(Number(answer.n) <= 2, `${step} で 1 回に上限より多く消した`);
        if (Number(answer.n) === 0) break;
      }
    }
    assert.equal(await countOf(ORG_B.id), 0);
    assert.equal(await countOf(SURPRISE.id), ourBefore);
    await assert.rejects(purgeRuntime`delete from public.page_revisions where organization_id = ${SURPRISE.id}`, /追記専用/, "版の番人");
    for (const trigger of ["page_revisions_append_only", "organization_audit_log_append_only", "recording_artifact_frozen", "recording_inputs_frozen", "organization_members_keep_manager"]) {
      assert.equal((await purgeAdmin`select tgenabled from pg_trigger where tgname = ${trigger}`)[0].tgenabled, "O", `${trigger} が外れたまま`);
    }
    // 通常運転の役割は番人を外せない（表の持ち主ではない）
    await assert.rejects(purgeRuntime.unsafe("alter table public.page_revisions disable trigger page_revisions_append_only"), /./, "通常運転の役割が番人を外せた");
    await purgeRuntime.end();
    await purgeAdmin.end();
    console.log("OK: 組織の物理削除は猶予の前と最初の組織を断り、過ぎた組織の行だけを 0 件にする（ほかの組織の行は 1 件も減らない・番人は戻っている）");
  }
  console.log("OK: 新規初期化、制限した接続権限、投稿、履歴、競合、招待・取り消し、公開と道具箱の分離、鍵の失効、SQLへの混入防止、既存環境の初期化拒否");
} catch (error) {
  // 接続情報や鍵を含み得る問い合わせは表示しない。
  console.error("NG: 専用PostgreSQLでの検証", error instanceof assert.AssertionError ? error.message : error instanceof Error ? error.message.split("\n")[0] : "不明なエラー");
  failed = true;
} finally {
  await store?.closeDatabase();
  if (running) await cluster.stop();
  await rm(temp, { recursive: true, force: true });
}

if (failed) process.exit(1);
