#!/usr/bin/env node
// Pages への投稿コマンド。
//
//   # 1 枚ものの HTML
//   pages-publish --file report.html --slug nightly-sweep/2026-08-08
//
//   # 画像や動画つき（フォルダごと。index.html が本体）
//   pages-publish --dir ./out --slug diagrams/rls-flow
//
//   # 公開（門なし）
//   pages-publish --file guide.html --slug onboarding --public --yes
//
//   # 「選んだ人だけ」（作った人・管理者・指定した閲覧グループの人だけが開ける）
//   pages-publish --file brief.html --slug briefings/ev-1234 --restricted --grant-group 人事採用
//
//   # このパソコンから投稿できるようにする（初回だけ）
//   pages-publish login
//
//   # コメントを見て、直したあと解決にする
//   pages-publish comments list --slug nightly-sweep/2026-08-08
//   pages-publish comments resolve --id 11111111-1111-1111-1111-111111111111
//
// 初回は設置した本人の Google アカウントでログインする。ブラウザが開くので、そこで入るだけ。
// この道具は自分のサイトの API を叩くだけで、置き場所の面倒はサーバーが見る。
// 既定は招待した人だけ。--public を付けたときだけ門なし公開。

import { createInterface } from "node:readline/promises";
import { createServer } from "node:http";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { spawn } from "node:child_process";
import {
  chmodSync,
  createReadStream,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { homedir, hostname } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

function readLocalSettings(name) {
  try { return JSON.parse(readFileSync(new URL(`../${name}`, import.meta.url), "utf8")); }
  catch { return {}; }
}
// 規則の正本は src/lib/settings/site-settings.ts の resolveEdition。この道具は単体でも配られて
// そこを読めないので写しを持つ。一致は tests/checks/check-distribution.mjs が見る。
function resolveEdition(deployed, configured) {
  if (configured && configured !== "company" && configured !== "personal") throw new Error("利用形態の設定が正しくありません");
  return deployed === "personal" || configured === "personal" ? "personal" : "company";
}
const PERSONAL = resolveEdition(readLocalSettings("deployment.json").edition, process.env.PAGES_EDITION) === "personal";
const savedSite = readLocalSettings(".pages-site.json");
const HOST = process.env.PAGES_HOST ?? savedSite.origin ?? "";
/** 投稿先（自分のサイト）の URL の頭。 */
const ROOT_ORIGIN = HOST ? (HOST.startsWith("http") ? HOST.replace(/\/+$/, "") : `https://${HOST}`) : "";

/** 手元の宛先か（http を許す名前）。 */
function isLocalHostname(hostname) {
  return hostname === "localhost" || hostname === "127.0.0.1";
}

/** 投稿先として使える URL の頭か。形が違えば理由の文を投げる。 */
function checkSiteOrigin(value) {
  let target;
  try { target = new URL(value); } catch { throw new Error("投稿先のURLの形式が正しくありません"); }
  if (target.username || target.password || target.pathname !== "/" || target.search || target.hash || (target.protocol !== "https:" && !(target.protocol === "http:" && isLocalHostname(target.hostname)))) throw new Error("投稿先はHTTPSのサイトURLを指定してください");
}
if (ROOT_ORIGIN) checkSiteOrigin(ROOT_ORIGIN);

/** いま話している宛先（投稿先）の URL の頭。 */
function currentOrigin() {
  return currentTarget().origin;
}

/** Route all Pages HTTP through one redirect-safe transport. */
export function pagesFetch(target, init = {}) {
  if (!ROOT_ORIGIN) throw new Error("投稿先のURLが設定されていません");
  const origin = currentOrigin();
  const url = target instanceof URL ? target : new URL(target, origin);
  const configuredOrigin = new URL(origin).origin;
  if (url.origin !== configuredOrigin || url.username || url.password) {
    throw new Error("Pages通信の宛先が設定済みのoriginと一致しません");
  }
  const headers = new Headers(init.headers);
  headers.delete("x-vercel-trusted-oidc-idp-token");
  return fetch(url, { ...init, headers, redirect: "error" });
}

const MB = 1024 * 1024;
const MAX_HTML_BYTES = (PERSONAL ? 4 : 5) * MB;
const WARN_ASSET_BYTES = 50 * MB;
/** 1 ファイルの上限。src/app/api/pages/upload と必ずそろえる。 */
const MAX_ASSET_BYTES = (PERSONAL ? 4 : 100) * MB;

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.join(HERE, "..");

/**
 * ログインの控えと、クラウドの印を置くフォルダの名前（`~/.config/<名前>`）。正本は deployment.json の configDir で、
 * 書いていなければ既定の名前。ツールの名前やリポジトリの名前を変えても、ここ 1 か所で済む。
 */
export const CONFIG_NAME = typeof readLocalSettings("deployment.json").configDir === "string" ? readLocalSettings("deployment.json").configDir : "surprise-pages-distribution";

/**
 * ログインの控えと、クラウドの印を置く場所。本人以外に読めないようにして置く。
 *
 * ホームの場所を受け取るだけの計算にしてあるのは、置き場の名前をここ 1 か所で
 * 決めるため（検査表からも呼べる）。
 */
export function configDirFor(home) {
  return path.join(home, ".config", CONFIG_NAME);
}

const CONFIG_DIR = process.env.PAGES_CONFIG_DIR ?? configDirFor(homedir());
/** 投稿先ごとの控え（鍵 1 本だけのファイル）。宛先の印で分けるので、サイトを引っ越しても前の鍵と混ざらない。 */
const CREDENTIAL_FILE = credentialFileFor(CONFIG_DIR, ROOT_ORIGIN);
export function credentialFileFor(configDir, origin) {
  return path.join(configDir, "sites", createHash("sha256").update(origin).digest("hex"), "credential");
}

let chosenTarget = null;

/** いまの実行の投稿先（設定したサイト）。設定が無ければ投げる（呼ぶ側の止め方で止まる）。 */
export function currentTarget() {
  if (chosenTarget !== null) return chosenTarget;
  if (!ROOT_ORIGIN) throw new Error("投稿先のURLが設定されていません");
  chosenTarget = { origin: ROOT_ORIGIN, slug: null };
  return chosenTarget;
}

/** 手元の AI の口の登録が使う投稿先。 */
export function pageAgentTarget() {
  const target = currentTarget();
  return { root: ROOT_ORIGIN, origin: target.origin, organization: target.slug };
}

/**
 * 「ここはクラウドの作業場」という印のファイル名。
 *
 * 環境変数では届かない。クラウドの起動脚本（`.cursor/environment.json` の start）で
 * 立てた変数は、その脚本の中でしか生きていない——あとからエージェントが開く貝殻には
 * 渡らない。だから印はディスクに置く（作業場は毎回まっさらに作り直されるので、
 * 手元のパソコンにこの印が残ることはない）。
 *
 * 置く役はクラウドの作業場の起動脚本。読む役はここだけ。名前を変えるなら両方そろえる。
 */
export const CLOUD_MARKER_NAME = "cloud";

/** 印を探す場所（投稿コマンドの控えの隣）。ホームの場所を受け取るだけの計算なので、検査表から呼べる。 */
export function cloudMarkers(home) {
  return [path.join(configDirFor(home), CLOUD_MARKER_NAME)];
}

/**
 * まだログインしていない・自動で開けない場面の案内。
 *
 * 中身そのものには一切触れない書き方にしてある。手順に値が出てくると、
 * 画面にもコピーの履歴にも残ってしまう。
 */
const LOGIN_HELP = `ターミナルで \`pages-publish login\` を実行してください（ブラウザが開きます）。
  クラウド環境では \`pages-publish login --remote\` を実行し、表示された URL を自分のブラウザで開きます。
  無人実行では、環境変数 PAGES_TOKEN で渡してください。`;

/** 名乗りが通らなかったときの案内。仕組みの名前は出さない。 */
const RELOGIN_HELP = `ログインが切れています。
  \`pages-publish login\` でログインし直してください。`;

function die(message) {
  console.error(`エラー: ${message}`);
  process.exit(1);
}

function usage() {
  console.log(`使い方:
  pages-publish --file <HTMLファイル> --slug <パス> [オプション]
  pages-publish --dir  <フォルダ>     --slug <パス> [オプション]
  pages-publish get   --slug <パス> [--out <フォルダ>]
  pages-publish comments list --slug <パス> [--public] [--all]
  pages-publish comments resolve --id <番号>
  pages-publish comments reopen --id <番号>
  pages-publish comments post --slug <パス> --body <本文> [--public] [--priority must|better|want]
  pages-publish login
  pages-publish login --remote
  pages-publish login --remote --new

  get               すでにあるページの本文を手元に戻す（直す前にこれを打つ）
                    --out の既定は page-out。--public で公開ページ、
                    --version <目印> で過去の版を戻せる
  comments list     そのページのコメントを出す（既定は未解決だけ。--all ですべて）
  comments resolve  コメントを解決済みにする（--id）
  comments reopen   解決を取り消す（--id）
  comments post     コメントを 1 件書く（--slug と --body）
  login             このパソコンから投稿できるようにする（ブラウザでログイン）
  login --remote    クラウド環境から投稿できるようにする（初回だけブラウザで許可）
  login --remote --new
                    クラウドの作業場のぶんを、このパソコンから作る。許可の画面の
                    「コピー」で自分専用の Secrets（PAGES_TOKEN）に貼れば、以後は
                    どのクラウドの作業場でも聞かれない
  --file <path>     1 枚ものの HTML を投稿する
  --dir <path>      フォルダごと投稿する（index.html が本体。画像・動画も一緒に上がる）
  --slug <path>     URL に使うパス。英小文字・数字・- _ . / のみ（必須）
                    例: diagrams/rls-flow
  --public          門なしで公開する（既定は招待した人だけ）
  --restricted      「選んだ人だけ」で作る（作った人・管理者・許可した人だけが開ける。
                    新しいページを作るときにだけ効く。すでにあるページの見せ方は変えない）
  --grant-group <名前>  「選んだ人だけ」のページを見せる閲覧グループ。繰り返し指定できる
  --delete          そのページを消す（--slug だけ指定する）
  --yes             確認プロンプトを飛ばす（無人実行用）
  --message <text>  投稿に添える一言（省略時は自動生成）
  --base-version <版> 比較した土台の版（既存スライドの投稿では必須）
  get --slug <名前> --json   現在の本文と完全な版番号をJSONで取得
  upload-image --file <画像> --slug <名前> --base-version <版>
                   既存スライドの画像を編集用の入口へ追加（保存先をJSONで返す）
  -h, --help        この説明

ファイル名に使えるのは英小文字・数字・- _ . だけ。日本語や空白は入れられない。
初めてのパソコンでは、投稿しようとした時点でブラウザが開いてログインを求めます。
クラウド環境では、初回だけ表示された URL を自分のブラウザで開いて許可します。
そこで PAGES_TOKEN をコピーし、Cursor の自分専用 Secrets に保存すると、次回から省けます。
ログイン情報は ~/.config/${CONFIG_NAME}/ の下に、本人だけが読める形で保存されます。
環境変数: PAGES_HOST で投稿先を上書きできる。`);
}

// ── 引数 ─────────────────────────────────────────────────────────
export function parseArgs(argv) {
  const options = {
    file: null,
    dir: null,
    slug: null,
    visibility: "internal",
    restricted: false,
    grantGroups: [],
    assumeYes: false,
    message: null,
    remove: false,
    baseVersionId: null,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = () => {
      const value = argv[i + 1];
      if (value === undefined) die(`${arg} に値がありません`);
      i += 1;
      return value;
    };

    switch (arg) {
      case "--file": options.file = next(); break;
      case "--dir": options.dir = next(); break;
      case "--slug": options.slug = next(); break;
      case "--public": options.visibility = "public"; break;
      case "--restricted": options.restricted = true; break;
      case "--grant-group": options.grantGroups.push(next()); break;
      case "--delete": options.remove = true; break;
      case "--yes": options.assumeYes = true; break;
      case "--message": options.message = next(); break;
      case "--base-version": options.baseVersionId = next(); break;
      case "-h":
      case "--help": usage(); process.exit(0); break;
      /*
        知らないオプションは、この道具が古いだけのことがある（後から入った機能を、
        古い複製が知らない）。実際にそれで手順書を疑って直しかけた事故があるので、
        ここで先に「手順書ではなく手元が古い」を伝える。git は呼ばない（引数を
        読んでいる最中で、まだ何も確かめていないため）。
      */
      default:
        die(
          `不明なオプション: ${arg}\n` +
            "      手順書が間違っているのではなく、この道具が古いだけかもしれません。\n" +
            "      手順書を書き換える前に、次で最新にしてから試してください。\n" +
            `        git -C ${REPO_ROOT} pull --ff-only`,
        );
    }
  }
  return options;
}

const SAFE_SLUG = /^[a-z0-9][a-z0-9._/-]*$/;
const SAFE_NAME = /^[a-z0-9][a-z0-9._-]*$/;

function checkSlug(slug) {
  if (!slug) die("--slug が要ります");
  if (!SAFE_SLUG.test(slug)) die(`--slug に使えるのは英小文字・数字・- _ . / だけです: ${slug}`);
  if (slug.includes("..")) die("--slug に .. は使えません");
  if (slug.includes("//")) die("--slug に // は使えません");
  if (slug.endsWith("/")) die("--slug を / で終えないでください");
}

function suggestName(name) {
  return name.toLowerCase().replace(/[^a-z0-9._-]/g, "-").replace(/-{2,}/g, "-");
}

function listFilesRecursively(root, prefix = "") {
  const found = [];
  for (const entry of readdirSync(path.join(root, prefix), { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    const rel = prefix === "" ? entry.name : `${prefix}/${entry.name}`;
    if (entry.isDirectory()) {
      found.push(...listFilesRecursively(root, rel));
    } else if (entry.isFile()) {
      found.push(rel);
    }
  }
  return found.sort();
}

async function confirm(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(question);
  rl.close();
  return answer.trim().toLowerCase() === "y";
}

// ── 名乗り ───────────────────────────────────────────────────────
/**
 * このパソコンの名乗りを探す。環境変数 → 手元の控え の順。
 *
 * 見つけた値はどこにも出さない。ログにも画面にも残さない（見えたら使われてしまう）。
 */
function loadPublishToken() {
  const origin = currentOrigin();
  const fromEnv = process.env.PAGES_TOKEN?.trim();
  // 環境変数の名乗りは、その名乗りの宛先（PAGES_TOKEN_ORIGIN）と投稿先が同じときだけ送る（別のサイトへ鍵を送らない）
  const tokenOrigin = process.env.PAGES_TOKEN_ORIGIN;
  if (fromEnv && tokenOrigin === origin) return fromEnv;

  try {
    const stored = readFileSync(CREDENTIAL_FILE, "utf8").trim();
    if (stored) return stored;
  } catch {
    // 無ければログインへ
  }
  return null;
}

/**
 * 名乗りを用意する。無ければ、その場でログインまで済ませて投稿へ戻る。
 *
 * 人が見ている場面でだけブラウザを開く。無人の実行（CI や cron）で勝手に開いても
 * 誰も入れないまま 3 分待つだけなので、そのときは案内を出して終わる。
 */
async function requireToken() {
  const token = loadPublishToken();
  if (token) return token;

  if (runningInCloud()) {
    console.log("このクラウド環境は、まだログインしていません。");
    return runRemoteLogin();
  }

  if (!process.stdin.isTTY) {
    die(`まだログインしていません。\n${LOGIN_HELP}`);
  }

  console.log("このパソコンは、まだログインしていません。");
  return runLogin();
}

/** クラウド環境にいるか。環境変数で判定する（検査からも同じ関数を呼ぶ）。 */
export function isCloudSession(env) {
  const source = env ?? process.env;
  return source.CURSOR_CLOUD === "1" || source.CLAUDE_CODE_REMOTE === "true";
}

/**
 * この実行がクラウドの作業場にいるか。環境変数 → ディスクの印の順に見る。
 *
 * 環境変数だけでは足りない。Cursor のクラウドは起動脚本で立てた変数を
 * エージェントの貝殻へ渡さないので、印のファイルが本命の手がかりになる。
 */
export function runningInCloud() {
  if (isCloudSession(process.env)) return true;
  const markers = process.env.PAGES_CONFIG_DIR ? [path.join(CONFIG_DIR, CLOUD_MARKER_NAME)] : cloudMarkers(homedir());
  for (const marker of markers) {
    try {
      if (existsSync(marker)) return true;
    } catch {
      // 読めなければ次の手がかりを見る
    }
  }
  return false;
}

/**
 * このクラウド環境を見分ける短い印。分からなければ空。
 *
 * クラウド環境は、機械の名前がどれも同じ（Cursor なら `cursor`）ため、
 * 名前だけでは 2 つの環境を見分けられない。見分けが付かないと、一覧の
 * 片付け（同じ名前の古いものをログアウトさせる）が**別の生きている環境の
 * 名乗りまで消してしまう**。ここは見た目の名札にしか使わないので、
 * 中身が本物かは問わない（偽られても、一覧の名前が違って見えるだけ）。
 */
export function workspaceMark(env, host) {
  const source = env ?? process.env;
  for (const candidate of [
    source.CURSOR_CONVERSATION_ID,
    source.CLAUDE_SESSION_ID,
    source.CLAUDE_CODE_SESSION_ID,
  ]) {
    if (typeof candidate !== "string") continue;
    const cleaned = candidate.trim().replace(/^bc-/, "").replace(/[^A-Za-z0-9]/g, "");
    if (cleaned.length >= 6) return cleaned.slice(0, 8);
  }
  const name = (typeof host === "string" ? host : hostname()).trim();
  // どの環境でも同じになる名前は、見分けの役に立たないので使わない
  return name.length > 0 && name.toLowerCase() !== "cursor" ? name.slice(0, 12) : "";
}

/** クラウド環境を、一覧に並べるときの名前（環境ごとに違う名札にする）。 */
export function remoteComputerLabel(env, host) {
  const source = env ?? process.env;
  const platform =
    source.CURSOR_CLOUD === "1" || typeof source.CURSOR_CONVERSATION_ID === "string"
      ? "Cursor Cloud"
      : source.CLAUDE_CODE_REMOTE === "true"
        ? "Claude Cloud"
        : "クラウド環境";
  const mark = workspaceMark(source, host);
  return mark.length > 0 ? `${platform} ${mark}` : platform;
}

/** クラウドログインの URL に載せる問い合わせ。名乗りは載せない。 */
export function buildRemoteLoginQuery(state, name) {
  const query = new URLSearchParams({ state });
  if (typeof name === "string" && name.length > 0) query.set("name", name);
  return query;
}

/** 取りに来る合言葉のハッシュ。サーバー側と同じ sha256 の 16 進。 */
export function hashPollSecret(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

/** 郵便受けから返ってきた 1 通を読む。形が違えば null。 */
export function parseClaimResponse(body) {
  if (typeof body !== "object" || body === null) return null;
  const record = body;
  const status = record.status;
  if (status === "waiting" || status === "expired") return { status };
  if (status !== "ready") return null;
  const token = typeof record.token === "string" ? record.token : "";
  if (!LOOKS_LIKE_CREDENTIAL.test(token)) return null;
  return { status: "ready", token, email: cleanForDisplay(record.email) };
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

// ── ログイン ─────────────────────────────────────────────────────
/** 待つ上限。3 分。人が入れないまま待ち続けても、いつかは終わる。 */
export const LOGIN_TIMEOUT_MS = 3 * 60_000;

/** 受け取る 1 通の上限。これ以上は読まずに捨てる。 */
export const MAX_HANDOFF_BYTES = 4096;

/** 名乗りの形。ブラウザから届いたものが、それらしい形かだけ見る。 */
const LOOKS_LIKE_CREDENTIAL = /^spg_[A-Za-z0-9_-]{20,200}$/;

/**
 * 届いたあとにブラウザへ返す 1 枚。
 *
 * 画面は自分のパソコンへ移ってきているので、最後の知らせを出せるのはここしかない。
 * 見出しと 1 行だけ。線も色も足さない（足す理由が無い）。
 */
const DONE_PAGE = `<!doctype html><html lang="ja"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>ログインしました</title>
<style>
  :root { color-scheme: light dark }
  body { margin: 0 auto; padding: 0 1.5rem; max-width: 24rem; min-height: 100dvh;
         display: flex; flex-direction: column; justify-content: center;
         font: 16px/1.7 system-ui, sans-serif }
  h1 { margin: 0; font-size: 1.25rem; font-weight: 600; letter-spacing: -0.01em }
  p { margin: .5rem 0 0; font-size: .875rem; opacity: .6 }
</style>
<h1>ログインしました</h1>
<p>ターミナルに戻ってください。</p>`;

/**
 * 2 つの合図が同じかを、長さに関係なく同じ時間で比べる。
 *
 * 手元の受け口は、このパソコンの中からなら誰でも叩ける。1 文字ずつ早く返すと、
 * 何度も叩いて合図を当てられてしまう。
 */
export function sameSecret(left, right) {
  if (typeof left !== "string" || typeof right !== "string") return false;
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** 画面に出す前に、改行や制御文字を落として長さを切る（人が読む 1 行を壊さない）。 */
export function cleanForDisplay(value) {
  if (typeof value !== "string") return "";
  return value.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, 120);
}

/**
 * 届いた 1 通を読む。**合図が合わなければ null**（受け取らずに捨てる）。
 *
 * 合図の照合がこの道具のいちばん大事な一線。手元の受け口は他のページからも叩けるので、
 * ここを通さないと、別のサイトが用意した名乗りをこのパソコンに置かれてしまう。
 */
export function readHandoff(raw, expectedState) {
  if (typeof raw !== "string") return null;
  if (raw.length === 0 || raw.length > MAX_HANDOFF_BYTES) return null;
  // 待つ側の合図が用意できていないなら、何も受け取らない（空どうしを「合った」にしない）
  if (typeof expectedState !== "string" || expectedState.length < 16) return null;

  const form = new URLSearchParams(raw);
  if (!sameSecret(form.get("state") ?? "", expectedState)) return null;

  const token = (form.get("token") ?? "").trim();
  if (!LOOKS_LIKE_CREDENTIAL.test(token)) return null;

  return { token, email: cleanForDisplay(form.get("email")), origin: handoffOrigin(form.get("origin")) };
}

/** 許可した画面が名乗った自分の宛先（URL の頭）。形が違えば null。受け取ったあと、投稿先と同じかを呼ぶ側が確かめる。 */
export function handoffOrigin(value) {
  if (typeof value !== "string" || value.length === 0 || value.length > 255) return null;
  try {
    const url = new URL(value);
    return url.origin === value ? value : null;
  } catch {
    return null;
  }
}

/** 空いている番号を OS に選んでもらって、127.0.0.1 でだけ待つ。 */
function listenOnFreePort(server) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (address === null || typeof address === "string") {
        reject(new Error("受け口を開けませんでした"));
        return;
      }
      resolve(address.port);
    });
  });
}

/**
 * ブラウザからの 1 通を待つ。
 *
 * 合図の合わない届けは、待ちを終わらせずに捨てる。1 通目で打ち切ると、
 * 適当な値を 1 度投げるだけで本人のログインを妨げられる。
 */
function waitForHandoff(server, state) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error("時間内にログインが終わりませんでした。もう一度お試しください。"));
    }, LOGIN_TIMEOUT_MS);

    server.on("request", (request, response) => {
      /*
        読み取りを許す返事（CORS）は 1 つも出さない。ブラウザは画面ごとここへ
        移ってくる送り方なので要らないし、出せば他所のページからも中身を読めてしまう。
      */
      if (request.method !== "POST") {
        response.writeHead(405).end();
        return;
      }

      let raw = "";
      let tooBig = false;
      request.setEncoding("utf8");
      request.on("data", (chunk) => {
        if (raw.length + chunk.length > MAX_HANDOFF_BYTES) {
          tooBig = true;
          raw = "";
          request.destroy();
          return;
        }
        raw += chunk;
      });
      request.on("error", () => {
        // 途中で切れただけ。待ち続ける
      });
      request.on("end", () => {
        const handoff = tooBig ? null : readHandoff(raw, state);
        if (handoff === null) {
          response.writeHead(400).end();
          return;
        }
        // ブラウザは画面ごとここへ移ってきている。最後の 1 枚はこちらが返す
        response.writeHead(200, {
          "content-type": "text/html; charset=utf-8",
          "cache-control": "no-store",
        });
        response.end(DONE_PAGE);
        clearTimeout(timer);
        resolve(handoff);
      });
    });
  });
}

/** Windows の WSL の中か。WSL は Linux として動くので、カーネルの名乗りで見分ける。 */
export function runningInWsl(env = process.env, kernel = () => readFileSync("/proc/version", "utf8"), platform = process.platform) {
  if (platform !== "linux") return false;
  if (typeof env.WSL_DISTRO_NAME === "string" && env.WSL_DISTRO_NAME.length > 0) return true;
  try {
    return /microsoft/i.test(kernel());
  } catch {
    return false;
  }
}

/**
 * ブラウザを開く命令の候補。先頭から順に試し、無い命令なら次へ。
 * WSL には xdg-open が無いことが多い。wslview（wslu）か、Windows 側の cmd.exe で開く。
 */
export function browserCommands(platform = process.platform, wsl = runningInWsl()) {
  if (platform === "darwin") return [["open"]];
  if (platform === "win32") return [["cmd", "/c", "start", ""]];
  if (wsl) return [["wslview"], ["cmd.exe", "/c", "start", ""], ["xdg-open"]];
  return [["xdg-open"]];
}

/** ブラウザで開く。開けたかどうかは待ちの結果で分かるので、ここでは判定しない。 */
function openBrowser(url, commands = browserCommands()) {
  const [first, ...rest] = commands;
  if (!first) return;
  const [command, ...leading] = first;
  try {
    const child = spawn(command, [...leading, url], { stdio: "ignore", detached: true });
    child.on("error", () => {
      // この命令が無かっただけ。次の候補を試す（尽きれば、画面に出した URL を手で開く）
      openBrowser(url, rest);
    });
    child.unref();
  } catch {
    openBrowser(url, rest);
  }
}

/** 一覧で見分けるための、このパソコンの名前。取れなければ付けない。 */
function computerName() {
  try {
    const name = hostname().replace(/\.local$/i, "").trim();
    return name.length > 0 ? name.slice(0, 40) : "";
  } catch {
    return "";
  }
}

/** 本人だけが読める形で書く。フォルダも本人だけに絞る。控えを書くのはここだけ。 */
function writePrivate(file, text) {
  mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  writeFileSync(file, text, { mode: 0o600 });
  // すでにあったファイルには mode が効かないので、書いたあとに必ず絞り直す
  chmodSync(file, 0o600);
}

/** 届いた鍵を控える（鍵 1 本のファイル）。投稿先と違う宛先の鍵は受け取らない。 */
function saveCredential(origin, token) {
  if (origin !== ROOT_ORIGIN) die("許可した画面の宛先が、ログインを始めた宛先と合いません。もう一度 pages-publish login を実行してください。");
  writePrivate(CREDENTIAL_FILE, `${token}\n`);
}

/**
 * ブラウザでログインして、このパソコンから投稿できるようにする。
 *
 * 受け取った値は控えるだけで、画面にもログにも出さない。出した瞬間、
 * 端末の記録やスクリーンショットに残って、消して回れなくなる。
 */
async function runLogin(target = loginTarget()) {
  if (!process.stdin.isTTY) {
    die(`画面のない実行ではログインできません。\n${LOGIN_HELP}`);
  }

  const state = randomBytes(24).toString("base64url");
  const server = createServer();
  const port = await listenOnFreePort(server);

  const query = new URLSearchParams({ port: String(port), state });
  const name = computerName();
  if (name.length > 0) query.set("name", name);
  const url = `${target.origin}/cli-login?${query.toString()}`;

  console.log("ブラウザでログインの画面を開きます。設置した本人の Google アカウントでログインしてください。");
  console.log(`開かないときは、次の URL を開いてください:\n  ${url}`);
  openBrowser(url);
  console.log("ログインを待っています…（Ctrl-C で中止）");

  let handoff;
  try {
    handoff = await waitForHandoff(server, state);
  } finally {
    server.closeAllConnections?.();
    server.close();
  }

  saveCredential(handoff.origin ?? ROOT_ORIGIN, handoff.token);
  const who = handoff.email.length > 0 ? handoff.email : "本人のアカウント";
  console.log(`${who} でログインしました。`);
  return handoff.token;
}

/** ログインを始める宛先（設定したサイト）。 */
function loginTarget() {
  if (!ROOT_ORIGIN) die("先に node scripts/setup/personal.mjs configure で投稿先を設定してください");
  return { origin: ROOT_ORIGIN, expected: ROOT_ORIGIN, slug: null };
}


/**
 * クラウド環境からのログイン。
 *
 * ブラウザはクラウド環境では開かない。人が自分のパソコンで開くページを出し、
 * 許可された名乗りを郵便受けから取りに行く。合言葉は URL に載せない。
 */
async function runRemoteLogin(options = {}) {
  /*
    受け取るかどうか。既定は受け取る（この作業場が投稿できるようになる）。
    受け取らないのは「別の席のぶんを、ここで作るだけ」のとき——受け取ってしまうと、
    このパソコンの控えが新しいほうに置き換わり、いま使えている名乗りが行方不明になる。
  */
  const claim = options.claim !== false;
  const target = options.target ?? loginTarget();
  const ORIGIN = target.origin;
  // 郵便受けを開く・取りに行く通信は、この宛先へ（投稿先の決め方より先に、ログインする宛先を決めてある）
  chosenTarget = { origin: ORIGIN, slug: target.slug };
  const state = randomBytes(24).toString("base64url");
  const pollSecret = randomBytes(32).toString("base64url");
  const name = claim ? remoteComputerLabel() : "クラウドの作業場";
  const opened = await send(() =>
    pagesFetch(`${ORIGIN}/api/cli-login/pending`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        state,
        pollSecretHash: hashPollSecret(pollSecret),
        name,
      }),
    }),
  );

  if (opened.status === 404) {
    die(
      "この投稿先は、まだクラウド環境からのログインに対応していません。\n" +
        "  手元のパソコンで pages-publish login を済ませるか、投稿先の更新を待ってください。",
    );
  }
  if (!opened.ok) die(await failureMessage(opened));

  const query = buildRemoteLoginQuery(state, name);
  const url = `${ORIGIN}/cli-login?${query.toString()}`;
  console.log("次の URL をブラウザで開き、「許可する」を押してください。");
  console.log(`  ${url}`);

  if (!claim) {
    console.log("");
    console.log("許可したら、その画面の「コピー」を押して、Cursor の自分専用 Secrets に");
    console.log("  PAGES_TOKEN という名前で貼り付けてください（値はどこにも表示しません）。");
    console.log("  貼ったあとに開くクラウドの作業場は、ログインを聞かれなくなります。");
    console.log("  3 分以内に許可してください（過ぎたら、もう一度この命令を実行します）。");
    return null;
  }

  console.log("許可を待っています…（最大 3 分）");

  const deadline = Date.now() + LOGIN_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await sleep(2000);
    const claimed = await send(() =>
      pagesFetch(`${ORIGIN}/api/cli-login/pending/claim`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ state, pollSecret }),
      }),
    );
    if (!claimed.ok) continue;
    let body = null;
    try {
      body = await claimed.json();
    } catch {
      continue;
    }
    const parsed = parseClaimResponse(body);
    if (parsed === null) continue;
    if (parsed.status === "expired") {
      die("時間切れです。pages-publish login --remote をもう一度実行してください。");
    }
    if (parsed.status === "ready") {
      saveCredential(ORIGIN, parsed.token);
      const who = parsed.email.length > 0 ? parsed.email : "本人のアカウント";
      console.log(`${who} でログインしました。`);
      console.log(
        "次回から省くには、許可ページの「コピー」で PAGES_TOKEN を\n" +
          "  Cursor の自分専用 Secrets に保存してください。",
      );
      return parsed.token;
    }
  }

  die("ログインの待ち時間が切れました。もう一度 pages-publish login --remote を実行してください。");
}

/** `pages-publish login`。手元かクラウドかを選ぶ。 */
async function loginCommand(rest) {
  let remote = false;
  let forAnother = false;
  for (const arg of rest) {
    if (arg === "-h" || arg === "--help") {
      usage();
      process.exit(0);
    }
    if (arg === "--remote") {
      remote = true;
      continue;
    }
    if (arg === "--new") {
      forAnother = true;
      continue;
    }
    die(`login と一緒には使えません: ${arg}`);
  }

  /*
    --new は「このパソコンではなく、別の席（クラウド）のぶんを作る」指定。
    すでにログイン済みでも作れるようにしてあるのは、ここが唯一の入口だから——
    クラウドの作業場には投稿コマンドが無く、無いと名乗りも作れない。だから
    投稿コマンドを持っている人が、代わりに 1 つ作って渡せる必要がある。
    渡し方は本人が「コピー」して自分の Secrets に貼る形だけ（値は画面に出さない）。
  */
  if (forAnother && !remote) {
    die("--new は --remote と一緒に使ってください（別の席のぶんを作る指定です）");
  }

  const target = loginTarget();
  if (!forAnother && alreadyLoggedIn(target)) {
    console.log("すでにログイン済みです。");
    console.log("  クラウドの作業場のぶんを作るなら: pages-publish login --remote --new");
    return;
  }
  if (remote || runningInCloud()) {
    await runRemoteLogin({ claim: !forAnother, target });
    return;
  }
  await runLogin(target);
}

/** ログインし直す必要が無いか（控えか環境変数に名乗りがあるか）。 */
function alreadyLoggedIn(target) {
  chosenTarget = { origin: target.expected, slug: target.slug };
  return loadPublishToken() !== null;
}

// ── サイトの API ─────────────────────────────────────────────────
/**
 * サーバーが返した日本語をそのまま人に見せる（言い換えると、直し方が伝わらなくなる）。
 *
 * ただし「名乗りが通らなかった」ときだけは、こちらの言葉に置き換える。
 * サーバー側の文言は仕組みの呼び名で書かれていて、手元でやることが伝わらない。
 */
async function failureMessage(response) {
  if (response.status === 401) return RELOGIN_HELP;

  let message = "";
  try {
    const body = await response.json();
    if (body && typeof body.error === "string") message = body.error;
  } catch {
    // JSON で返ってこないこともある（配信網が挟まったときなど）
  }
  if (!message) message = `応答が ${response.status} でした`;
  return message;
}

async function send(request) {
  try {
    return await request();
  } catch (error) {
    const detail = error?.cause?.message ?? error?.message ?? String(error);
    die(`${chosenTarget?.origin ?? ROOT_ORIGIN} につながりませんでした\n${detail}`);
  }
}

/**
 * 待つ上限。返事が来ないまま黙って止まり続けるのを防ぐ。
 *
 * 人が見ている場面なら Ctrl-C で抜けられるが、この道具は無人でも走る
 * （--yes を付けた自動投稿）。詰まったまま気づかれないほうが困る。
 * 素材は 100MB まであるので、本文のやり取りより長めに見る。
 */
const JSON_TIMEOUT_MS = 60_000;
const UPLOAD_TIMEOUT_MS = 15 * 60_000;

function agentCredential(){const token=loadPublishToken();if(!token)throw new Error(`まだログインしていません。${LOGIN_HELP}`);return token;}
/** Shared authenticated transport for agent tools. Credentials never enter tool output. */
export async function pageAgentRequest(payload) {
  const token = agentCredential();
  const response = await pagesFetch(`${currentOrigin()}/api/pages/agent`, {
    method: "POST", signal: AbortSignal.timeout(JSON_TIMEOUT_MS),
    headers: {authorization:`Bearer ${token}`,"content-type":"application/json"},body:JSON.stringify(payload),
  });
  const result = await response.json();
  if (!response.ok) { const error = new Error(result.error ?? "操作できませんでした"); error.details = result; error.status = response.status; throw error; }
  return result;
}
export async function pageAgentMediaRequest(page,kind,method,body,params={}) {
  if (kind !== "assets") throw new Error("素材の送信先が正しくありません");
  const token=agentCredential();
  const mediaPath=`deck-edit/${kind}`;
  const response=await pagesFetch(`${currentOrigin()}/api/pages/${mediaPath}?${new URLSearchParams({page,...params})}`,{
    method,signal:AbortSignal.timeout(UPLOAD_TIMEOUT_MS),
    headers:{authorization:`Bearer ${token}`,"content-type":Buffer.isBuffer(body)?"application/octet-stream":"application/json"},
    body:body===undefined?undefined:Buffer.isBuffer(body)?body:JSON.stringify(body),
  });
  const result=await response.json();if(!response.ok)throw new Error(result.error??"素材を送信できませんでした");return result;
}
export function pageAgentOrigin() { return currentOrigin(); }
export async function pageAgentAsset(url, page) {
  const ORIGIN = currentOrigin();
  const target = new URL(url, ORIGIN);
  const slug = page.replace(/^(internal|public)\//, "");
  if (target.origin !== ORIGIN || !["/internal/", "/public/"].some(prefix => target.pathname.startsWith(`${prefix}${slug}/`)) && !target.pathname.startsWith("/vendor/")) throw new Error("資料以外の素材には接続できません");
  const token = agentCredential();
  return pagesFetch(target, {headers:{authorization:`Bearer ${token}`},signal:AbortSignal.timeout(JSON_TIMEOUT_MS)});
}

async function callJson(method, pathname, token, payload) {
  if (PERSONAL && Buffer.byteLength(JSON.stringify(payload), "utf8") > 4 * MB) die("送信する内容は1回4MBまでです。画像は小さくして別ファイルにしてください");
  const response = await send(() =>
    pagesFetch(`${currentOrigin()}${pathname}`, {
      method,
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json; charset=utf-8",
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(JSON_TIMEOUT_MS),
    }),
  );

  if (!response.ok) die(await failureMessage(response));
  return response.json();
}

/** 本文を取り寄せる（body の無い問い合わせ）。 */
async function getJson(pathname, token, allowMissing = false) {
  const response = await send(() =>
    pagesFetch(`${currentOrigin()}${pathname}`, {
      method: "GET",
      headers: { authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(JSON_TIMEOUT_MS),
    }),
  );

  if (allowMissing && response.status === 404) return null;
  if (!response.ok) die(await failureMessage(response));
  return response.json();
}

/**
 * 素材を 1 つ流し上げる。
 *
 * 中身はメモリに載せず、ファイルから直に流す。100MB の動画を丸ごと抱えると、
 * 1 本で持ち場所を使い切って手元の道具ごと落ちる。
 * Node の fetch に読み取りの流れを渡すときは duplex: "half" が要る（実測・Node 22）。
 */
async function uploadAsset({ token, slug, visibility, rel, localPath, size }) {
  const url =
    `${currentOrigin()}/api/pages/upload` +
    `?slug=${encodeURIComponent(`${visibility}/${slug}`)}` +
    `&path=${encodeURIComponent(rel)}`;

  const response = await send(() =>
    pagesFetch(url, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-length": String(size),
      },
      body: createReadStream(localPath),
      duplex: "half",
      signal: AbortSignal.timeout(UPLOAD_TIMEOUT_MS),
    }),
  );

  if (!response.ok) die(`${rel} を上げられませんでした\n${await failureMessage(response)}`);
  return response.json();
}

// ── 取り寄せ ─────────────────────────────────────────────────────
/**
 * `pages-publish get`。いま出ている本文を手元へ戻す。
 *
 * **ページを直すときの 1 手目がこれ。** 投稿が終わると手元の作業フォルダは
 * ゴミ箱へ入れる決まりなので、次に直すときには手元が空になっている。そこで
 * 白紙から書き直すと、前の版に書いてあったことが静かに落ちる——直したいのは
 * 1 行なのに、残りが全部別物になる。正本は保管庫にあるので、そこから戻す。
 *
 * 戻すのは HTML だけ。画像や動画は保管庫に置いたままで、そのまま投稿し直せば
 * 続けて出る（相対パスは配信のときに支えられている）。手元で開くと絵は出ない。
 */
async function getCommand(rest) {
  let slug = null;
  let visibility = "internal";
  let out = "page-out";
  let version = null;
  let json = false;
  let allowMissing = false;

  for (let i = 0; i < rest.length; i += 1) {
    const arg = rest[i];
    const next = () => {
      const value = rest[i + 1];
      if (value === undefined) die(`${arg} に値がありません`);
      i += 1;
      return value;
    };
    if (arg === "-h" || arg === "--help") {
      usage();
      process.exit(0);
    } else if (arg === "--slug") slug = next();
    else if (arg === "--public") visibility = "public";
    else if (arg === "--out") out = next();
    else if (arg === "--version") version = next();
    else if (arg === "--json") json = true;
    else if (arg === "--allow-missing") allowMissing = true;
    else die(`get と一緒には使えません: ${arg}`);
  }

  checkSlug(slug);
  if (allowMissing && !json) die("--allow-missing は --json と一緒に指定してください");

  const htmlPath = path.join(out, "index.html");
  if (!json && statSync(htmlPath, { throwIfNoEntry: false })?.isFile()) {
    die(`すでに ${htmlPath} があります\n      → 別の場所を --out で指定するか、先に片付けてください（前回の本文と混ざります）`);
  }

  const token = await requireToken();
  const query =
    `?slug=${encodeURIComponent(`${visibility}/${slug}`)}` +
    (version === null ? "" : `&v=${encodeURIComponent(version)}`);
  const result = await getJson(`/api/pages/source${query}`, token, allowMissing);
  if (json) { console.log(JSON.stringify(result)); return; }

  mkdirSync(out, { recursive: true });
  writeFileSync(htmlPath, result.html, "utf8");

  const marks = [];
  if (typeof result.versionNumber === "number") marks.push(`第 ${result.versionNumber} 版`);
  if (typeof result.shortVersionId === "string" && result.shortVersionId.length > 0) {
    marks.push(result.shortVersionId);
  }
  console.log(`取り寄せました${marks.length > 0 ? `（${marks.join(" / ")}）` : ""}`);
  if (typeof result.title === "string" && result.title.length > 0) {
    console.log(`  ページ: ${result.title}`);
  }
  console.log(`  出す先: ${htmlPath}`);
  console.log("");
  console.log("このファイルを直して、同じ場所に投稿すると新しい版になります:");
  console.log(`  pages-publish --file ${htmlPath} --slug ${slug} --base-version ${result.versionId}${visibility === "public" ? " --public" : ""}`);
  console.log("画像や動画は保管庫に置いたままです（手元で開くと絵は出ませんが、投稿すれば元どおり出ます）。");
}

/** Skill uploads use the browser's immutable image storage and edit permission gate. */
async function uploadImageCommand(options) {
  checkSlug(options.slug);
  if (!options.file || options.dir || options.remove || options.restricted || options.grantGroups.length) {
    die("upload-image は --file・--slug・--base-version と、必要なら --public を指定してください");
  }
  if (!options.baseVersionId) die("画像追加には --base-version が要ります。先に現在の本文と版を取り寄せてください");
  const info = statSync(options.file, { throwIfNoEntry: false });
  if (!info?.isFile()) die("画像ファイルがありません");
  if (!/\.(png|jpe?g|webp|gif|avif)$/i.test(options.file) || info.size > 10 * MB) {
    die("画像は PNG・JPEG・WebP・GIF・AVIF、10MBまでです");
  }
  const page = pageSlugOf(options.slug, options.visibility);
  const token = await requireToken();
  const current = await getJson(`/api/pages/source?slug=${encodeURIComponent(page)}`, token);
  if (current.versionId !== options.baseVersionId) die("他の人が更新しています。最新版と変更案を比較し直してください（画像は送信していません）");
  const result = await pageAgentMediaRequest(page, "assets", "POST", readFileSync(options.file), { name: path.basename(options.file) });
  console.log(JSON.stringify(result));
}

// ── コメント ─────────────────────────────────────────────────────
/**
 * `pages-publish comments`。画面でログインした本人と同じ口を、手元の道具から叩く。
 *
 * 鍵は投稿と同じものを使う。サーバー側は `currentIdentity` がヘッダを読んで
 * 持ち主の会社アカウントとして扱うので、新しい鍵は要らない。
 *
 * 古さの関門は通さない。ここは本文を積む道ではなく、コメントの窓口を叩くだけ。
 */

const COMMENT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const COMMENT_PRIORITIES = ["must", "better", "want"];

function pageSlugOf(slug, visibility) {
  return `${visibility}/${slug}`;
}

function checkCommentId(id) {
  if (!id) die("--id が要ります");
  if (!COMMENT_ID.test(id)) die(`コメントの番号の形が正しくありません: ${id}`);
}

function readCommentFlags(rest, extra = {}) {
  const options = {
    slug: null,
    visibility: "internal",
    id: null,
    body: null,
    priority: "want",
    all: false,
    ...extra,
  };

  for (let i = 0; i < rest.length; i += 1) {
    const arg = rest[i];
    const next = () => {
      const value = rest[i + 1];
      if (value === undefined) die(`${arg} に値がありません`);
      i += 1;
      return value;
    };
    if (arg === "-h" || arg === "--help") {
      usage();
      process.exit(0);
    } else if (arg === "--slug") options.slug = next();
    else if (arg === "--public") options.visibility = "public";
    else if (arg === "--id") options.id = next();
    else if (arg === "--body") options.body = next();
    else if (arg === "--priority") options.priority = next();
    else if (arg === "--all") options.all = true;
    else die(`comments と一緒には使えません: ${arg}`);
  }
  return options;
}

function printComment(comment) {
  const status = comment.resolvedAt ? "解決済" : "未解決";
  const priority = typeof comment.priority === "string" ? comment.priority : "want";
  const author = comment.author && typeof comment.author.name === "string" ? comment.author.name : "名前なし";
  console.log(`${priority}  ${status}  ${comment.id}`);
  console.log(`  ${author}`);
  if (typeof comment.quote === "string" && comment.quote.length > 0) {
    console.log(`  引用: ${comment.quote}`);
  }
  if (typeof comment.body === "string" && comment.body.length > 0) {
    for (const line of comment.body.split("\n")) console.log(`  ${line}`);
  }
  console.log("");
}

async function commentsList(rest) {
  const options = readCommentFlags(rest);
  checkSlug(options.slug);
  const page = pageSlugOf(options.slug, options.visibility);
  const token = await requireToken();
  const result = await getJson(`/api/comments?page=${encodeURIComponent(page)}`, token);
  const comments = Array.isArray(result.comments) ? result.comments : [];
  const open = comments.filter((one) => one && one.resolvedAt == null);
  const shown = options.all ? comments : open;
  const resolvedCount = comments.length - open.length;

  if (shown.length === 0) {
    if (options.all || comments.length === 0) {
      console.log(`コメントはありません（${page}）`);
    } else {
      console.log(`未解決はありません（${page} · 解決済 ${resolvedCount} 件 · --all ですべて）`);
    }
    return;
  }

  const head = options.all ? `コメント ${shown.length} 件` : `未解決 ${shown.length} 件`;
  const extra =
    !options.all && resolvedCount > 0 ? ` · ほかに解決済 ${resolvedCount} 件 · --all ですべて` : "";
  console.log(`${head}（${page}${extra}）`);
  console.log("");
  for (const comment of shown) printComment(comment);
}

async function commentsResolve(rest, resolved) {
  const options = readCommentFlags(rest);
  checkCommentId(options.id);
  const token = await requireToken();
  await callJson("PATCH", `/api/comments/${encodeURIComponent(options.id)}`, token, { resolved });
  console.log(resolved ? "解決にしました" : "未解決に戻しました");
  console.log(`  ${options.id}`);
}

async function commentsPost(rest) {
  const options = readCommentFlags(rest);
  checkSlug(options.slug);
  if (typeof options.body !== "string" || options.body.trim().length === 0) {
    die("--body が要ります");
  }
  if (!COMMENT_PRIORITIES.includes(options.priority)) {
    die(`--priority に使えるのは ${COMMENT_PRIORITIES.join(" / ")} だけです`);
  }
  const page = pageSlugOf(options.slug, options.visibility);
  const token = await requireToken();
  const created = await callJson("POST", "/api/comments", token, {
    pageSlug: page,
    parentId: null,
    quote: null,
    quoteContext: null,
    body: options.body,
    kind: "comment",
    priority: options.priority,
  });
  const id = created?.comment?.id;
  console.log("書きました");
  if (typeof id === "string" && id.length > 0) console.log(`  ${id}`);
}

async function commentsCommand(rest) {
  const action = rest[0] && !rest[0].startsWith("-") ? rest[0] : "list";
  const args = action === rest[0] ? rest.slice(1) : rest;
  if (action === "list") {
    await commentsList(args);
    return;
  }
  if (action === "resolve") {
    await commentsResolve(args, true);
    return;
  }
  if (action === "reopen") {
    await commentsResolve(args, false);
    return;
  }
  if (action === "post") {
    await commentsPost(args);
    return;
  }
  die(`comments と一緒には使えません: ${action}`);
}

// ── 削除 ─────────────────────────────────────────────────────────
/** ページを消す。URL は開けなくなるが、本文と素材はサーバーに残る。 */
async function removePage({ token, slug, visibility, pageUrl, assumeYes }) {
  if (!assumeYes) {
    console.log(`次のページを消します: ${pageUrl}`);
    console.log("（URL は無効になります。本文と画像は履歴として残ります）");
    if (!process.stdin.isTTY) die("消すには --yes を付けてください（対話できない環境のため）");
    if (!(await confirm("本当に消しますか？ [y/N] "))) die("中止しました");
  }

  const result = await callJson("DELETE", "/api/pages", token, { slug, visibility });
  console.log(result.message ?? "消しました");
}

// ── 本体 ─────────────────────────────────────────────────────────
async function main() {
  if (process.argv[2] === "config" && process.argv[3] === "--json") {
    if (!ROOT_ORIGIN) die("先に投稿先を設定してください");
    console.log(JSON.stringify({ origin: ROOT_ORIGIN, credentialFile: CREDENTIAL_FILE, root: REPO_ROOT, personal: PERSONAL }));
    return;
  }
  if (PERSONAL && !ROOT_ORIGIN && !process.argv.includes("--help")) die("先に node scripts/setup/personal.mjs configure で投稿先を設定してください");
  const argv = process.argv.slice(2);

  // login だけは投稿ではないので、いちばん先に分ける（--slug なども要らない）
  if (argv[0] === "login") {
    await loginCommand(argv.slice(1));
    return;
  }

  // 取り寄せも投稿ではない（--file なども要らないので、引数の読み取りを分ける）
  if (argv[0] === "get") {
    await getCommand(argv.slice(1));
    return;
  }

  if (argv[0] === "comments") {
    await commentsCommand(argv.slice(1));
    return;
  }

  const imageUpload = argv[0] === "upload-image";
  const options = imageUpload ? parseArgs(argv.slice(1)) : parseArgs(argv);
  checkSlug(options.slug);

  if (!options.remove) {
    if (!options.file && !options.dir) die("--file か --dir のどちらかが要ります");
    if (options.file && options.dir) die("--file と --dir は同時に使えません");
  }

  // 「選んだ人だけ」の指定は、間違った組み合わせをここで止める（送ってから断られるより早い）
  if (options.restricted && options.visibility === "public") {
    die("--restricted と --public は同時に使えません（「選んだ人だけ」は社内限定のページに付けるものです）");
  }
  if (options.restricted && options.remove) die("--restricted は --delete と一緒には使えません");
  if (options.grantGroups.length > 0 && !options.restricted) {
    die("--grant-group は --restricted と一緒に指定してください");
  }

  if (imageUpload) {
    await uploadImageCommand(options);
    return;
  }

  const { slug, visibility } = options;
  const urlPrefix = visibility === "public" ? "public" : "internal";
  const pageUrl = `${currentOrigin()}/${urlPrefix}/${slug}`;
  // 名乗りが無ければ、ここでログインまで済ませてから投稿へ進む
  const token = await requireToken();

  if (options.remove) {
    await removePage({ token, slug, visibility, pageUrl, assumeYes: options.assumeYes });
    return;
  }

  // 何を上げるか決める
  let htmlPath;
  /** @type {{ rel: string, localPath: string, size: number }[]} */
  const assets = [];
  // 1 枚ものは素材に触らない（null）。フォルダ投稿は「今回の一覧だけ残す」を伝える
  let touchesAssets = false;

  if (options.file) {
    if (!statSync(options.file, { throwIfNoEntry: false })?.isFile()) {
      die(`ファイルがありません: ${options.file}`);
    }
    htmlPath = options.file;
  } else {
    const dir = options.dir;
    if (!statSync(dir, { throwIfNoEntry: false })?.isDirectory()) {
      die(`フォルダがありません: ${dir}`);
    }
    htmlPath = path.join(dir, "index.html");
    if (!statSync(htmlPath, { throwIfNoEntry: false })?.isFile()) {
      die(`フォルダ投稿には index.html が要ります: ${htmlPath}`);
    }
    touchesAssets = true;

    for (const rel of listFilesRecursively(dir)) {
      if (rel === "index.html") continue;
      for (const part of rel.split("/")) {
        if (!SAFE_NAME.test(part)) {
          die(`この名前は URL に使えません: ${rel}\n      → 例えば ${suggestName(part)} にリネームして、HTML 側の参照も直してください`);
        }
      }
      assets.push({ rel, localPath: path.join(dir, rel), size: statSync(path.join(dir, rel)).size });
    }
  }

  const html = readFileSync(htmlPath, "utf8");
  const htmlBytes = Buffer.byteLength(html, "utf8");
  if (htmlBytes > MAX_HTML_BYTES) {
    die(`HTML が大きすぎます（${Math.round(htmlBytes / MB)}MB・上限 ${MAX_HTML_BYTES / MB}MB）。画像は埋め込まず、同じフォルダに置いて --dir で投稿してください`);
  }

  for (const asset of assets) {
    if (asset.size > MAX_ASSET_BYTES) {
      die(`${asset.rel} が大きすぎます（${Math.round(asset.size / MB)}MB・上限 ${MAX_ASSET_BYTES / MB}MB）`);
    }
    if (asset.size > WARN_ASSET_BYTES) {
      console.log(`注意: ${asset.rel} は ${Math.round(asset.size / MB)}MB あります。長い動画は書き出し設定を見直すと軽くなります。`);
    }
  }

  // 公開のときだけ念を押す
  if (visibility === "public" && !options.assumeYes) {
    console.log("注意: これは門なしの公開ページです。URL を知れば誰でも開けます。");
    console.log(`      投稿先: ${pageUrl}`);
    if (!process.stdin.isTTY) die("公開するには --yes を付けてください（対話できない環境のため）");
    if (!(await confirm("      本当に公開しますか？ [y/N] "))) die("中止しました");
  }

  // 比較した版は取り直して置き換えない。送信直前と保存時の両方で競合を確認する。
  if (options.baseVersionId) {
    const current = await getJson(`/api/pages/source?slug=${encodeURIComponent(`${visibility}/${slug}`)}`, token);
    if (current.versionId !== options.baseVersionId) die("他の人が更新しています。最新版と変更案を比較し直してください（本文は更新していません）");
  }

  // Check before any page preparation or upload. A standalone CLI without its
  // rendering tools cannot silently publish unverified slide photographs.
  if (/<body\b[^>]*\sdata-deck(?:[\s=>/]|$)/i.test(html)) {
    let checkDeckImages;
    try { ({checkDeckImages}=await import("./deck-image-check.mjs")); }
    catch { die("画像付きスライドの検査道具がありません。このリポジトリで pnpm install を実行し、検査用ブラウザを用意してください（未検査では投稿できません）"); }
    const report=await checkDeckImages(htmlPath,{html,savedPage:options.baseVersionId?`${visibility}/${slug}`:null});
    if (!report.ok) die(report.issues.map(issue=>`${issue.slideId}: ${issue.message}`).join("\n"));
    console.log(`画像の画質検査: ${report.slides} 枚、画素不足 0 件`);
  }

  // いま置いてある素材を「いまの版」のフォルダへ凍結する。
  // 上書きしてからでは手遅れなので、素材を上げる前に必ず通す
  const prepared = await callJson("POST", "/api/pages/prepare", token, { slug, visibility });

  for (const asset of assets) {
    await uploadAsset({ token, slug, visibility, ...asset });
    console.log(`  ↑ ${asset.rel} (${Math.max(1, Math.round(asset.size / 1024))}KB)`);
  }

  const result = await callJson("POST", "/api/pages", token, {
    slug,
    visibility,
    html,
    message: options.message ?? `${visibility}/${slug} を投稿`,
    baseVersionId: options.baseVersionId,
    // 付けたときだけ送る。付けなければサーバーの挙動は今までと同じ
    ...(options.restricted ? { restricted: true } : {}),
    ...(options.restricted && options.grantGroups.length > 0
      ? { grantGroups: options.grantGroups }
      : {}),
    // 指定なし … 素材に触らない / 空の一覧 … 全部片付ける / 名前の並び … それだけ残す
    ...(touchesAssets ? { keep: assets.map((asset) => asset.rel) } : {}),
  });

  const done = [];
  if (assets.length > 0) done.push(`素材 ${assets.length} ファイル`);
  if (prepared.frozen > 0) done.push(`前の版の素材 ${prepared.frozen} ファイルを保存`);
  if (done.length > 0) console.log(`アップロード: ${done.join(" / ")}`);

  if (result.unchanged) {
    console.log("内容に変更がないため、新しい版は作成していません。");
  } else {
    const marks = [`第 ${result.versionNumber} 版`];
    if (typeof result.changeCount === "number") marks.push(`変更 ${result.changeCount} か所`);
    console.log(`投稿しました（${marks.join(" / ")}）`);
  }
  console.log(`URL: ${result.url ?? pageUrl}`);

  // 「選んだ人だけ」で投稿したときは、いま誰が見られるのかまで言い切る。
  // 絞ったつもりで絞れていない（またはその逆）に、投稿した本人が気づけるように
  if (result.restricted === true) {
    const groups =
      Array.isArray(result.grantedGroups) && result.grantedGroups.length > 0
        ? `、それと閲覧グループ「${result.grantedGroups.join("」「")}」の人`
        : "";
    console.log(`見られる人: あなた${groups}だけです（「選んだ人だけ」のページ）`);
  }
}

/**
 * この道具として呼ばれたときだけ走る。
 *
 * 検査表から中身（合図の照合など）を読み込んで確かめられるようにするため、
 * import されただけでは投稿を始めない。
 */
function invokedDirectly() {
  const entry = process.argv[1];
  if (typeof entry !== "string" || entry.length === 0) return false;
  const real = (value) => {
    try {
      return realpathSync(value);
    } catch {
      return path.resolve(value);
    }
  };
  return real(entry) === real(fileURLToPath(import.meta.url));
}

if (invokedDirectly()) {
  main().catch((error) => die(error?.message ?? String(error)));
}
