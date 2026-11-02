/**
 * 手元の検証だけで使う、GitHub の API の試験用の応答（の画面の確かめ）。
 *
 * 起こしたアプリの node に `--import` で読ませ、`https://api.github.com` への fetch だけを差し替える。
 * 中身は `PAGES_TEST_FAKE_GITHUB` の JSON ファイル（検証の脚本が書き換えて main の変更・権限の剥奪・障害を作る）。
 * アプリのコードには何も足さない。本番の組み立てには入らない（scripts/testing の中だけ）。
 * `PAGES_TEST_FAKE_GITHUB_DELAY_MS` を渡すと、1 回の問い合わせごとにその時間だけ待ってから答える
 * （本物の GitHub までの往復の時間。速さの計測 tests/support/repository-speed.mjs が使う）。
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const real = globalThis.fetch;
const sha1 = (bytes) => createHash("sha1").update(bytes).digest("hex");
const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
const bytesOf = (file) => Buffer.from(file.base64 ?? Buffer.from(file.text ?? "", "utf8").toString("base64"), "base64");

function commitJson(commit) {
  return { sha: commit.sha, commit: { author: { name: commit.author, date: commit.date }, committer: { date: commit.date } }, author: { login: commit.author.toLowerCase() } };
}

function answer(state, user, url, accept) {
  const path = `${url.pathname}${url.search}`;
  let match = /^\/repositories\/(\d+)$/.exec(url.pathname);
  const repos = Object.values(state.repos);
  if (match) {
    const repo = repos.find((one) => one.id === Number(match[1]));
    if (!repo || !user.readable.includes(repo.id)) return json({ message: "Not Found" }, 404);
    return json({ id: repo.id, full_name: repo.fullName, default_branch: repo.branch, permissions: { pull: true } });
  }
  if (url.pathname === "/user") return json({ id: user.id, login: user.login });
  match = /^\/repos\/([^/]+\/[^/]+)(?:\/(.*))?$/.exec(url.pathname);
  if (!match) return json({ message: "Not Found" }, 404);
  const repo = state.repos[match[1]];
  if (!repo || !user.readable.includes(repo.id)) return json({ message: "Not Found" }, 404);
  const rest = decodeURIComponent(match[2] ?? "");
  const head = repo.commits[repo.commits.length - 1];
  if (rest === "") return json({ id: repo.id, full_name: repo.fullName, default_branch: repo.branch, permissions: { pull: true } });
  if (rest === "contents/") return json([]);
  // 資料候補の登録（録音の設定）が確かめる、先頭のコミットと文書の中身
  if (rest === "commits" && !url.searchParams.has("path")) return json([commitJson(head)]);
  if (rest === `commits/${repo.branch}`) return json(commitJson(head));
  if (rest === "commits" && url.searchParams.has("path")) return json([commitJson(head)]);
  match = /^git\/trees\/([0-9a-f]{40})$/.exec(rest);
  if (match) {
    const commit = repo.commits.find((one) => one.sha === match[1]);
    if (!commit) return json({}, 404);
    return json({ truncated: false, tree: Object.entries(commit.files).map(([file, value]) => ({ path: file, type: "blob", sha: sha1(bytesOf(value)) })) });
  }
  match = /^compare\/([0-9a-f]{40})\.\.\.([0-9a-f]{40})$/.exec(rest);
  if (match) return json({ files: repo.compare?.[`${match[1]}...${match[2]}`] ?? [] });
  match = /^git\/blobs\/([0-9a-f]{40})$/.exec(rest);
  if (match) {
    for (const commit of repo.commits) for (const value of Object.values(commit.files)) {
      const bytes = bytesOf(value);
      if (sha1(bytes) !== match[1]) continue;
      if (accept.includes("raw")) return new Response(bytes, { headers: { "content-length": String(bytes.length) } });
      return json({ encoding: "base64", content: bytes.toString("base64"), size: bytes.length });
    }
    return json({}, 404);
  }
  match = /^contents\/(.+)$/.exec(rest);
  if (match && !accept.includes("raw")) {
    const commit = repo.commits.find((one) => one.sha === url.searchParams.get("ref")) ?? head;
    const value = commit.files[match[1]];
    if (!value) return json({}, 404);
    const bytes = bytesOf(value);
    return json({ type: "file", encoding: "base64", size: bytes.length, content: bytes.toString("base64"), sha: sha1(bytes) });
  }
  if (match && accept.includes("raw")) {
    const commit = repo.commits.find((one) => one.sha === url.searchParams.get("ref")) ?? head;
    const value = commit.files[match[1]];
    if (!value) return json({}, 404);
    const bytes = bytesOf(value);
    return new Response(bytes, { headers: { "content-length": String(bytes.length) } });
  }
  void path;
  return json({ message: "Not Found" }, 404);
}

globalThis.fetch = async (input, init) => {
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
  if (url.hostname !== "api.github.com") return real(input, init);
  const delay = Number(process.env.PAGES_TEST_FAKE_GITHUB_DELAY_MS ?? 0);
  if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
  const state = JSON.parse(readFileSync(process.env.PAGES_TEST_FAKE_GITHUB ?? "", "utf8"));
  if (state.unavailable) return json({ message: "unavailable" }, 503);
  const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
  const token = (headers.get("authorization") ?? "").replace(/^Bearer\s+/, "");
  const user = state.users[token];
  if (!user) return json({ message: "Bad credentials" }, 401);
  return answer(state, user, url, headers.get("accept") ?? "");
};
