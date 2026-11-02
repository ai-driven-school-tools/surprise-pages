/**
 * 関所の回数の上限（src/lib/access/request-security.ts と src/proxy.ts）。送信元ごとに数える。
 *
 * 見るのは 3 つ。名乗りの無い連打が 429 で止まる / ログイン中の普通の操作は当たらない / 断りに内部の情報が載らない。
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { build } from "esbuild";
import { root, dir } from "./paths.mjs";

const out = `${dir}/rate-limit.cjs`;
await build({
  stdin: { contents: `export * from "${root}/src/lib/access/request-security"; export { proxy, config } from "${root}/src/proxy";`, resolveDir: root, loader: "ts" },
  bundle: true, platform: "node", format: "cjs", outfile: out, logLevel: "silent",
});
const api = createRequire(import.meta.url)(out);

let failures = 0;
function check(label, test) {
  try { test(); console.log(`OK  ${label}`); }
  catch (error) { failures++; console.log(`NG  ${label}: ${error.message}`); }
}
async function checkAsync(label, test) {
  try { await test(); console.log(`OK  ${label}`); }
  catch (error) { failures++; console.log(`NG  ${label}: ${error.message}`); }
}
const request = (path, headers = {}, method = "GET") => new Request(`https://pages.example.com${path}`, { method, headers });

console.log("--- 枠の選び方 ---");
check("名乗りの無い閲覧は狭い枠", () => assert.equal(api.rateLimitTier(request("/public/guide")), "anonymous"));
check("ログイン中は広い枠", () => assert.equal(api.rateLimitTier(request("/internal/guide", { cookie: "theme=dark; __Secure-authjs.session-token=abc" })), "credentialed"));
check("分割されたセッションも広い枠", () => assert.equal(api.rateLimitTier(request("/internal/guide", { cookie: "authjs.session-token.0=abc" })), "credentialed"));
check("投稿用の鍵つきは広い枠", () => assert.equal(api.rateLimitTier(request("/api/pages", { authorization: "Bearer x" })), "credentialed"));
check("似た名前の Cookie では広げない", () => assert.equal(api.rateLimitTier(request("/public/guide", { cookie: "authjs.session-tokenish=1" })), "anonymous"));
check("ログイン待ちの口は名乗りがあっても厳しい枠", () => assert.equal(api.rateLimitTier(request("/api/cli-login/pending", { authorization: "Bearer x" })), "loginHandoff"));
check("送信元は Vercel の印から採る", () => assert.equal(api.rateLimitClient(request("/", { "x-real-ip": "203.0.113.5" })), "203.0.113.5"));
check("転送の列は先頭を採る", () => assert.equal(api.rateLimitClient(request("/", { "x-forwarded-for": "203.0.113.9, 10.0.0.1" })), "203.0.113.9"));

console.log("--- 数え方 ---");
check("名乗りの無い連打は上限の次で止まる", () => {
  const take = api.createRateLimiter();
  for (let i = 0; i < api.RATE_LIMITS.anonymous; i++) assert.equal(take("anonymous", "a", 1000).allowed, true);
  const denied = take("anonymous", "a", 1000);
  assert.equal(denied.allowed, false);
  assert.ok(denied.retryAfterSeconds >= 1 && denied.retryAfterSeconds <= 60);
});
check("ログイン中の普通の操作（1 分に 600 回）は当たらない", () => {
  const take = api.createRateLimiter();
  for (let i = 0; i < 600; i++) assert.equal(take("credentialed", "a", 1000 + i).allowed, true);
});
check("送信元ごとに別に数える", () => {
  const take = api.createRateLimiter({ anonymous: 1, credentialed: 1, loginHandoff: 1 });
  take("anonymous", "a", 0);
  assert.equal(take("anonymous", "b", 0).allowed, true);
});
check("時間が過ぎれば戻る", () => {
  const take = api.createRateLimiter({ anonymous: 1, credentialed: 1, loginHandoff: 1 }, 1000);
  take("anonymous", "a", 0);
  assert.equal(take("anonymous", "a", 10).allowed, false);
  assert.equal(take("anonymous", "a", 1000).allowed, true);
});
check("ログイン待ちの口は 1 分に 10 回まで", () => {
  const take = api.createRateLimiter();
  for (let i = 0; i < 10; i++) take("loginHandoff", "a", 0);
  assert.equal(take("loginHandoff", "a", 0).allowed, false);
});
check("送信元を変え続けても控えは膨らみ続けない", () => {
  const take = api.createRateLimiter({ anonymous: 1, credentialed: 1, loginHandoff: 1 }, 60_000);
  for (let i = 0; i < 25_000; i++) take("anonymous", `c${i}`, i);
  assert.ok(take.tracked() <= 10_000, `控え ${take.tracked()} 件`);
  assert.equal(take("anonymous", "c24999", 24_999).allowed, false);
});

console.log("--- 断り ---");
await checkAsync("429 で待ち時間を返し、控えさせない", async () => {
  const response = api.rateLimitedResponse(12);
  assert.equal(response.status, 429);
  assert.equal(response.headers.get("retry-after"), "12");
  assert.equal(response.headers.get("cache-control"), "no-store");
});
await checkAsync("断りに接続先も残り回数も書かない", async () => {
  const text = await api.rateLimitedResponse(12).text();
  assert.doesNotMatch(text, /[0-9]|http|postgres|neon|x-real-ip/i);
});
await checkAsync("断りの文は関所が決めた言語で書く（指定なしは日本語）", async () => {
  assert.equal(JSON.parse(await api.rateLimitedResponse(12).text()).error, "アクセスが集中しています。少し待ってからもう一度お試しください");
  const english = JSON.parse(await api.rateLimitedResponse(12, "en").text()).error;
  assert.equal(english, "Too many requests right now. Please wait a moment and try again");
  assert.doesNotMatch(english, /[0-9]|http|postgres|neon|x-real-ip/i);
});

console.log("--- 入口 ---");
check("関所の範囲は組織を読みうる道筋のすべて", () => {
  assert.deepEqual(api.config.matcher, ["/((?!_next/static|_next/image|vendor/|comments-widget.js|page-images.js).*)"]);
});
check("回数の上限で数えるのは保存先を読む入口だけ（関所の範囲を広げても数える道筋は広げない）", () => {
  for (const path of ["/api", "/api/comments", "/internal/guide", "/public/guide", "/history/internal/x", "/signin"]) assert.equal(api.countsTowardRateLimit(path), true, path);
  for (const path of ["/", "/activity", "/library", "/settings", "/signin/handoff", "/vendor/lucide.js", "/icon.svg", "/apix", "/image"]) assert.equal(api.countsTowardRateLimit(path), false, path);
});
const { NextRequest } = createRequire(import.meta.url)("next/server");
/** 関所へ渡す要求（Next が渡すのと同じ形）。 */
const proxied = (path, headers = {}, method = "GET") => new NextRequest(`https://pages.example.com${path}`, { method, headers: { host: "pages.example.com", ...headers } });
const flood = async (headers) => {
  let last;
  for (let i = 0; i <= api.RATE_LIMITS.anonymous; i++) last = await api.proxy(proxied("/public/guide", headers));
  return last;
};
await checkAsync("配布版では入口で止まる", async () => {
  process.env.PAGES_EDITION = "personal";
  assert.equal((await flood({ "x-real-ip": "198.51.100.2" })).status, 429);
});
await checkAsync("配布版でも、画面・道具の読み込み（/・/activity・/vendor）は数えない", async () => {
  process.env.PAGES_EDITION = "personal";
  for (const path of ["/", "/activity", "/vendor/lucide.js"]) {
    let last;
    for (let i = 0; i <= api.RATE_LIMITS.anonymous; i++) last = await api.proxy(proxied(path, { "x-real-ip": "198.51.100.9" }));
    assert.notEqual(last.status, 429, path);
  }
});
await checkAsync("止まった送信元の外は通る", async () => {
  const response = await api.proxy(proxied("/public/guide", { "x-real-ip": "198.51.100.3" }));
  assert.notEqual(response.status, 429);
});
await checkAsync("ページの閲覧に同一サイトの検査を掛けない", async () => {
  process.env.PAGES_SITE_URL = "https://pages.example.com";
  const response = await api.proxy(proxied("/public/guide", { "x-real-ip": "198.51.100.4" }, "POST"));
  assert.notEqual(response.status, 403);
});
await checkAsync("API の変更は今までどおり同一サイトだけ", async () => {
  const response = await api.proxy(proxied("/api/comments", { "x-real-ip": "198.51.100.5", origin: "https://other.example" }, "POST"));
  assert.equal(response.status, 403);
});

console.log(`\n回数の上限: ${failures} 件の不合格`);
process.exitCode = failures ? 1 : 0;
