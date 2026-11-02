import { existsSync, readFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { requiredPersonalVariables } from "./environment.mjs";
import { connectSkills, printConnection } from "./skills.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

async function configure() {
  const input = createInterface({ input: stdin, output: stdout });
  try {
    const answer = (process.argv[3] ?? await input.question("設置したサイトのURL: ")).trim();
    const url = new URL(answer);
    if (url.protocol !== "https:" || url.username || url.password || url.pathname !== "/" || url.search || url.hash) throw new Error("HTTPSのサイトURLだけを入力してください");
    await writeFile(path.join(root, ".pages-site.json"), JSON.stringify({ origin: url.origin }, null, 2) + "\n", { mode: 0o600 });
    console.log("投稿先を保存しました。次は bin/pages-publish login で本人のブラウザから許可してください。");
  } finally { input.close(); }
  // スキルを別のフォルダからも呼べるようにする。ここで失敗しても投稿先の保存は済んでいる
  try {
    console.log("\nスキルを Claude Code・Cursor・Codex につなぎます。");
    printConnection(connectSkills());
  } catch {
    console.log("スキルをつなげませんでした。あとで node scripts/setup/skills.mjs を打ってください。");
  }
}

/**
 * 設置の診断。設定の有無だけでなく、実際に繋いで確かめる。
 *
 * 見る順は依存の順（保存先が無ければ本人も照合できない）。1 つ落ちたらその先は試さず、
 * 落ちた 1 つと、直し方が書いてある導入ガイドの章だけを返す。秘密の値・接続先は返さない。
 * データを作ることも投稿することもしない（保存先も画像の置き場も読むだけ）。
 *
 * 繋ぐ部分は `io` で差し替えられる（検査は架空の相手で試す）。
 */
export async function diagnose(env, io) {
  const passed = [];
  const stop = (step, problem, chapter) => ({ ok: false, passed, step, problem, chapter });
  const missing = requiredPersonalVariables().filter((name) => typeof env[name] !== "string" || env[name].trim().length === 0);
  if (missing.length) return stop("設定の名前", `足りない設定: ${missing.join(", ")}`, "3-9. サイトへ設定を渡し、起動する");
  passed.push("設定の名前がそろっている");

  let site;
  try {
    site = new URL(env.PAGES_SITE_URL).origin;
  } catch {
    return stop("設定の名前", "PAGES_SITE_URL が URL の形になっていません", "3-9. サイトへ設定を渡し、起動する");
  }

  try {
    await io.query("select 1");
  } catch {
    return stop("保存先", "DATABASE_URL の保存先に繋がりません（止まっているか、接続情報が違います）", "3-7. 本文の保管庫を初期化する");
  }
  passed.push("保存先に繋がる");

  let owner;
  try {
    const rows = await io.query("select owner_email from public.pages_installation where singleton = true and edition = 'personal'");
    owner = rows.length === 1 ? rows[0].owner_email : null;
  } catch {
    owner = null;
  }
  if (typeof owner !== "string") return stop("本人の照合", "保存先がまだ個人用として初期化されていません", "3-7. 本文の保管庫を初期化する");
  if (owner.trim().toLowerCase() !== env.PAGES_OWNER_EMAIL.trim().toLowerCase()) return stop("本人の照合", "保存先を初期化したときのアドレスと PAGES_OWNER_EMAIL が違います", "3-9. サイトへ設定を渡し、起動する");
  passed.push("保存先が本人のものになっている");

  try {
    await io.listBlobs(env.BLOB_READ_WRITE_TOKEN);
  } catch {
    return stop("画像の置き場", "BLOB_READ_WRITE_TOKEN で画像の置き場を読めません", "3-6. 画像の保管先を作る");
  }
  passed.push("画像の置き場を読める");

  const running = await io.getJson(`${site}/api/pages/agent`);
  if (running === null || typeof running.protocol !== "number") return stop("サイトの起動", "サイトが応答しないか、このサイトの画面が動いていません。設定を入れたあと再デプロイしたか確かめてください", "3-9. サイトへ設定を渡し、起動する");
  passed.push("サイトが動いている");

  const providers = await io.getJson(`${site}/api/auth/providers`);
  const callback = `${site}/api/auth/callback/google`;
  if (providers === null || providers.google?.callbackUrl !== callback) return stop("ログインの戻り先", `Google のログインの戻り先が合っていません。Google Cloud に ${callback} を登録し、AUTH_GOOGLE_ID / AUTH_GOOGLE_SECRET を確かめてください`, "3-8. Google でログインする入口を作る");
  passed.push("Google のログインの戻り先が合っている");

  const saved = io.savedSite();
  if (saved !== site) return stop("投稿先", saved === null ? "このパソコンに投稿先がまだありません" : "このパソコンの投稿先が PAGES_SITE_URL と違います", "3-10. 投稿先を設定する");
  passed.push("このパソコンの投稿先が合っている");

  const signedIn = await io.signedIn(site);
  if (signedIn === "missing") return stop("本人のログイン", "このパソコンからの投稿の許可がまだありません（node bin/pages-publish.mjs login）", "3-10. 投稿先を設定する");
  if (signedIn === "rejected") return stop("本人のログイン", "このパソコンの投稿の許可が切れています（node bin/pages-publish.mjs login でもう一度）", "3-10. 投稿先を設定する");
  if (signedIn !== "ok") return stop("本人のログイン", "投稿の許可をサイトに確かめられませんでした。少し待ってからもう一度診断してください", "3-10. 投稿先を設定する");
  passed.push("このパソコンから投稿できる");
  return { ok: true, passed };
}

/**
 * このパソコンの投稿の許可を、サイトが今も受け付けるかを確かめる。
 *
 * 控えのファイルがあるだけでは合格にしない（サーバー側で失効した鍵でも控えは残る）。
 * 鍵だけを要る読み取りの口に、資料の名前を付けずに 1 回だけ問い合わせる。口は鍵を最初に確かめ、
 * 受け付けなければ 401、受け付ければ資料の名前が無いことを返すので、資料は読まず何も作らない。
 * 返すのは状態の名前だけで、鍵の値は返さない。
 */
export async function publishCredentialState(site, key, fetchImpl = fetch) {
  if (typeof key !== "string" || key.length === 0) return "missing";
  try {
    const response = await fetchImpl(`${site}/api/pages/source`, { method: "GET", headers: { authorization: `Bearer ${key}` }, redirect: "manual", signal: AbortSignal.timeout(15000) });
    return response.status === 401 ? "rejected" : "ok";
  } catch {
    return "unreachable";
  }
}

function realIo(env) {
  let connection;
  return {
    async query(text) {
      const { databaseOptions } = await import("./database.mjs");
      const { default: postgres } = await import("postgres");
      connection ??= postgres(env.DATABASE_URL, { ...databaseOptions(env.DATABASE_URL), connect_timeout: 10 });
      return connection.unsafe(text);
    },
    async listBlobs(token) {
      const { list } = await import("@vercel/blob");
      await list({ limit: 1, token });
    },
    async getJson(url) {
      try {
        const response = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(15000) });
        if (!response.ok) return null;
        const value = await response.json();
        return typeof value === "object" && value !== null ? value : null;
      } catch { return null; }
    },
    savedSite() {
      try { return new URL(JSON.parse(readFileSync(path.join(root, ".pages-site.json"), "utf8")).origin).origin; } catch { return null; }
    },
    async signedIn(site) {
      let key = null;
      try {
        const config = JSON.parse(execFileSync(process.execPath, [path.join(root, "bin/pages-publish.mjs"), "config", "--json"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }));
        if (typeof config.credentialFile === "string" && existsSync(config.credentialFile)) key = readFileSync(config.credentialFile, "utf8").trim();
      } catch { key = null; }
      return publishCredentialState(site, key);
    },
    async close() { await connection?.end({ timeout: 5 }); },
  };
}

async function doctor() {
  const io = realIo(process.env);
  try {
    const result = await diagnose(process.env, io);
    for (const line of result.passed) console.log(`OK: ${line}`);
    if (!result.ok) {
      console.log(`\n止まった所: ${result.step}`);
      console.log(`内容: ${result.problem}`);
      console.log(`直し方: 導入ガイドの「${result.chapter}」`);
      process.exitCode = 1;
    } else console.log("\n設置はそろっています。");
    console.log("この診断は値を表示せず、データの作成や投稿もしません。");
  } finally { await io.close(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const command = process.argv[2];
  try {
    if (command === "configure") await configure();
    else if (command === "doctor") await doctor();
    else console.log("configure: 投稿先を保存 / doctor: 設置を実際に繋いで確かめる");
  } catch { console.error(command === "configure" ? "設定できませんでした。URLの形式とファイルの書き込み権限を確認してください。" : "診断を続けられませんでした。"); process.exitCode = 1; }
}
