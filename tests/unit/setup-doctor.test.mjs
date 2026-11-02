import assert from "node:assert/strict";
import test from "node:test";
import { diagnose, publishCredentialState } from "../../scripts/setup/personal.mjs";

const SITE = "https://pages.example.com";
const SECRETS = { DATABASE_URL: "postgres://runtime:do-not-print-1@db.example.com/pages", AUTH_SECRET: "do-not-print-2", AUTH_GOOGLE_SECRET: "do-not-print-3", BLOB_READ_WRITE_TOKEN: "vercel_blob_rw_do-not-print-4" };
const env = { ...SECRETS, PAGES_OWNER_EMAIL: "Owner@Example.com", PAGES_SITE_URL: `${SITE}/`, AUTH_GOOGLE_ID: "client-id" };

function io(overrides = {}) {
  return {
    query: async (text) => text.includes("pages_installation") ? [{ owner_email: "owner@example.com" }] : [{ "?column?": 1 }],
    listBlobs: async () => {},
    getJson: async (url) => url.endsWith("/api/pages/agent") ? { protocol: 1 } : { google: { callbackUrl: `${SITE}/api/auth/callback/google` } },
    savedSite: () => SITE,
    signedIn: async () => "ok",
    ...overrides,
  };
}

function leaked(result) {
  const text = JSON.stringify(result);
  return Object.values(SECRETS).filter((value) => text.includes(value) || text.includes("do-not-print"));
}

test("全部そろっていれば順に通る", async () => {
  const result = await diagnose(env, io());
  assert.equal(result.ok, true);
  assert.equal(result.passed.length, 8);
});

const stops = [
  ["設定の名前", { ...env, AUTH_SECRET: " " }, {}, "3-9."],
  ["保存先", env, { query: async () => { throw new Error(`connect ${SECRETS.DATABASE_URL}`); } }, "3-7."],
  ["本人の照合", env, { query: async (text) => { if (text.includes("pages_installation")) throw new Error("relation does not exist"); return []; } }, "3-7."],
  ["本人の照合", env, { query: async (text) => text.includes("pages_installation") ? [{ owner_email: "someone@example.com" }] : [] }, "3-9."],
  ["画像の置き場", env, { listBlobs: async (token) => { throw new Error(`bad token ${token}`); } }, "3-6."],
  ["サイトの起動", env, { getJson: async () => null }, "3-9."],
  ["ログインの戻り先", env, { getJson: async (url) => url.endsWith("/api/pages/agent") ? { protocol: 1 } : { google: { callbackUrl: "https://other.example/api/auth/callback/google" } } }, "3-8."],
  ["投稿先", env, { savedSite: () => null }, "3-10."],
  ["本人のログイン", env, { signedIn: async () => "missing" }, "3-10."],
  ["本人のログイン", env, { signedIn: async () => "rejected" }, "3-10."],
];
for (const [step, givenEnv, overrides, chapter] of stops) {
  test(`${step}で止まり、その先は試さず、値を出さない（${chapter}）`, async () => {
    let later = 0;
    const base = io(overrides);
    const counted = { ...base, signedIn: () => { later++; return base.signedIn(); } };
    const result = await diagnose(givenEnv, counted);
    assert.equal(result.ok, false);
    assert.equal(result.step, step);
    assert.ok(result.chapter.startsWith(chapter), result.chapter);
    assert.deepEqual(leaked(result), []);
    if (step !== "本人のログイン") assert.equal(later, 0);
  });
}

test("足りない設定は名前だけを出す", async () => {
  const result = await diagnose({ ...env, DATABASE_URL: "" }, io());
  assert.match(result.problem, /DATABASE_URL/);
  assert.deepEqual(leaked(result), []);
});

test("控えがあっても、サイトが受け付けない鍵なら合格にしない（失効した鍵）", async () => {
  const result = await diagnose(env, io({ signedIn: async () => "rejected" }));
  assert.equal(result.ok, false);
  assert.equal(result.step, "本人のログイン");
  assert.match(result.problem, /切れて/);
  assert.match(result.problem, /login/);
});

test("投稿の許可は、控えを使ってサイトに読み取りを 1 回だけ問い合わせて確かめる", async () => {
  const KEY = "do-not-print-key";
  const calls = [];
  const answer = (status) => async (url, init) => { calls.push({ url, init }); return { status }; };
  assert.equal(await publishCredentialState(SITE, null, answer(400)), "missing");
  assert.equal(calls.length, 0);
  assert.equal(await publishCredentialState(SITE, KEY, answer(401)), "rejected");
  assert.equal(await publishCredentialState(SITE, KEY, answer(400)), "ok");
  assert.equal(await publishCredentialState(SITE, KEY, async () => { throw new Error(`refused ${KEY}`); }), "unreachable");
  const sent = calls[0];
  assert.equal(sent.url, `${SITE}/api/pages/source`);
  assert.equal(sent.init.method ?? "GET", "GET");
  assert.equal(sent.init.headers.authorization, `Bearer ${KEY}`);
  assert.equal(sent.init.redirect, "manual");
});
