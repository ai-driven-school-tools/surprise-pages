/**
 * 画像の通行証（src/lib/pages/asset-pass.ts）。ページ本体を返すときに渡し、素材は 1 枚ごとに保存先を引かずに配る。
 *
 * 見るのは 6 つ（と個人版）。
 *   1. 封（作った通行証は開ける・中身は読めない・書き換え・期限切れ・寿命違い・形の違う欄）
 *   2. 出す（社内のページを開いた人に・cookie の属性・本文の読み込みには付かない・304 でも・下のページの確かめは覚える）
 *   3. 出さない（下に別のページがある・録音の成果物の上・見てよくない人・名乗っていない人・/history/）
 *   4. 素材（通行証があれば保存先を 1 本も引かない・他人の通行証・別のページ・ログアウト・過去の版）
 *   5. 遅れの上限（名簿から外した人は、通行証の期限が切れたら素材も断られる）
 *   5b. 個人版（招いた人に出す・素材は保存先を引かない・名簿に無い資料には出さない・外した人の遅れの上限）
 *   6. 決まりの置き場（通行証を読む・作る口は配信の入口だけ・ページを作る口は 2 つだけ）
 *
 * 保存先は使い捨ての PGlite に全部の移し替えを流したもの。差し替えるのは名乗りと、保存先・素材置き場への
 * 通り道だけで、封・見てよいかの判定・配信は本物を通す（check-view-ticket.mjs と同じ組み立て）。
 */
import assert from "node:assert/strict";
import { createCipheriv, createHmac, randomBytes } from "node:crypto";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { AsyncLocalStorage } from "node:async_hooks";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { build } from "esbuild";
import { root, dir, companyDeployment } from "./paths.mjs";

const require = createRequire(import.meta.url);
let failures = 0;
async function check(label, test) {
  try { await test(); console.log(`OK  ${label}`); }
  catch (error) { failures++; console.log(`NG  ${label}: ${error.message}`); }
}
const code = (file) => readFileSync(`${root}/${file}`, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");

// ---------------------------------------------------------------------------
// 組み立て（名乗りと保存先・素材置き場への通り道だけ差し替え）
// ---------------------------------------------------------------------------
const transport = `${root}/tests/checks/fixtures/deck-edit/transport.mjs`;
const neighbors = `${dir}/asset-pass-neighbors.mjs`;
writeFileSync(neighbors, `export * from ${JSON.stringify(transport)};
import { displayNameOf } from ${JSON.stringify(`${root}/src/lib/identity/member-name.ts`)};
export const currentKey = async () => null;
export const toViewer = (who) => who === null ? null : who.kind === "guest" ? { kind: "guest", name: who.name, image: null } : { kind: "member", name: displayNameOf(who.email, who.name), image: who.image };
export const dangerouslyDeleteByTag = async () => {};
export const getCache = () => ({ get: async () => null, set: async () => {}, delete: async () => {}, expireTag: async () => {} });
export const waitUntil = () => {};
export const auth = async () => null;
export const headers = async () => ({ get: () => null });
export const cookies = async () => ({ get: () => undefined });
`);
const out = `${dir}/asset-pass.mjs`;
await build({
  stdin: {
    contents: `export {GET as pageGET} from './src/app/internal/[...slug]/route';
export {GET as historyGET} from './src/app/history/[visibility]/[...slug]/route';
export * from './src/lib/pages/asset-pass'; export {commitRevision} from './src/lib/pages/store';
export {RESTRICTED_ASSET_CACHE, INTERNAL_ASSET_CACHE} from './src/lib/pages/cache';`,
    resolveDir: root, loader: "ts",
  },
  outfile: out, bundle: true, format: "esm", platform: "node", logLevel: "silent",
  // 束ねた中では会社の版にする。個人版の道は PAGES_EDITION=personal で同じ組み立て物を動かして確かめる（5b）
  plugins: [companyDeployment, { name: "test-transport", setup(b) {
    b.onResolve({ filter: /^sharp$/ }, () => ({ path: require.resolve("sharp"), external: true }));
    b.onResolve({ filter: /^next\/server$/ }, () => ({ path: require.resolve("next/server"), external: true }));
    b.onResolve({ filter: /^workflow(?:\/api)?$|^@vercel\/sandbox$/ }, () => ({ path: `${root}/tests/checks/fixtures/deck-edit/media-worker.mjs` }));
    b.onResolve({ filter: /supabase$|database$|(^|\/)identity$|^@\/auth$|^@vercel\/blob$|^@vercel\/functions$|^next\/headers$/ }, () => ({ path: neighbors }));
  } }],
});

const pg = new PGlite();
await pg.exec("create role anon; create role authenticated; create role service_role bypassrls;");
for (const file of readdirSync(`${root}/db/migrations`).sort()) if (file.endsWith(".sql")) await pg.exec(readFileSync(`${root}/db/migrations/${file}`, "utf8"));
globalThis.__deckPg = pg;
globalThis.__deckIdentity = new AsyncLocalStorage();
globalThis.__deckAssets = new Map();
const SECRET = "check-asset-pass-secret-not-for-production";
process.env.AUTH_SECRET = SECRET;
delete process.env.PAGES_EDITION;
const api = await import(pathToFileURL(out).href);

const owner = { kind: "member", email: "owner@example.test", name: "作成者", image: null, desktop: false };
const reader = { kind: "member", email: "reader@example.test", name: "読む人", image: null, desktop: false };
const outsider = { kind: "member", email: "outsider@example.test", name: "名簿の外の人", image: null, desktop: false };
const ORIGIN = "https://pages.example.test";
const as = (viewer, run) => globalThis.__deckIdentity.run(viewer, run);
const article = (title) => `<!doctype html><html lang="ja"><head><meta charset="utf-8"><title>${title}</title></head><body><h1>${title}</h1><img src="pixel.png" alt="画像"></body></html>`;
const PNG = Buffer.from("89504e470d0a1a0a0000000d4948445200000001000000010806000000", "hex");

const ORG = Object.freeze({ id: "00000000-0000-4000-8000-000000000001", assetPrefix: "" });
for (const slug of ["internal/test/article", "internal/test/other", "internal/test/shared", "internal/test/parent"]) {
  await api.commitRevision({ organization: ORG, pageSlug: slug, html: article(slug), author: owner, message: "検査" });
}
// 入れ子のページは今の投稿では断られるが、歯止めより前の組み合わせは残りうる（AGENTS.md）。台帳に直に置く
await pg.query("insert into pages (page_slug, visibility, created_by) values ('internal/test/parent/child', 'restricted', 'owner@example.test')");
// 録音の成果物の置き場の上に、ふつうのページが立っている
await api.commitRevision({ organization: ORG, pageSlug: "internal/recordings", html: article("録音の上"), author: owner, message: "検査" });
for (const slug of ["internal/test/article", "internal/test/other", "internal/test/shared", "internal/test/parent", "internal/test/parent/child", "internal/recordings"]) {
  globalThis.__deckAssets.set(`${slug}/pixel.png`, { bytes: PNG, options: { contentType: "image/png", access: "private" } });
}
await pg.query("update pages set visibility = 'restricted' where page_slug = 'internal/test/shared'");
const shared = (await pg.query("select id from pages where page_slug = 'internal/test/shared'")).rows[0].id;
await pg.query("insert into page_permissions (page_id, grantee_kind, member_email, added_by) values ($1, 'member', 'reader@example.test', 'owner@example.test')", [shared]);
const articleVersion = (await pg.query("select current_version_id from pages where page_slug = 'internal/test/article'")).rows[0].current_version_id;
globalThis.__deckAssets.set(`internal/test/article/@archive/${articleVersion}/old.png`, { bytes: PNG, options: { contentType: "image/png", access: "private" } });

const params = (path) => ({ params: Promise.resolve({ slug: path.replace(/^\/internal\//, "").split("?")[0].split("/") }) });
/** /internal/ を開く。保存先へ送った問い合わせの数も返す。 */
async function open(path, { cookie = null, viewer = null, origin = ORIGIN, etag = null } = {}) {
  const headers = { ...(cookie === null ? {} : { cookie }), ...(etag === null ? {} : { "if-none-match": etag }) };
  globalThis.__deckQueries = [];
  try {
    const response = await as(viewer, () => api.pageGET(new Request(`${origin}${path}`, { headers }), params(path)));
    const bytes = Buffer.from(await response.arrayBuffer());
    return { status: response.status, headers: response.headers, text: bytes.toString("utf8"), queries: globalThis.__deckQueries.filter((one) => one.table !== "page_image") };
  } finally { delete globalThis.__deckQueries; }
}
const passLines = (headers) => headers.getSetCookie().filter((line) => /^(?:__Secure-)?sp-pass\./.test(line));
const asCookie = (lines) => lines.map((line) => line.split(";")[0]).join("; ");
const pageQueries = (queries) => queries.filter((one) => one.table === "pages" || one.table === "page_access_facts");

/** 検査の側で同じ封をして、中身だけ変えた通行証を作る（形の確かめが効いているかを見るため）。 */
/** 最初の組織（最初の組織）と、2 つ目の組織。通行証は発行した組織の宛先でだけ開く */
const OTHER = Object.freeze({ id: "00000000-0000-4000-8000-0000000000b2", assetPrefix: "o/00000000-0000-4000-8000-0000000000b2/" });
function forge(payload, secret = SECRET, purpose = "surprise-pages/asset-pass/v1", organizationId = ORG.id) {
  const key = createHmac("sha256", secret).update(purpose).digest();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv, { authTagLength: 16 });
  cipher.setAAD(Buffer.from(`${purpose}\n${organizationId}`, "utf8"));
  const body = Buffer.concat([cipher.update(JSON.stringify(payload), "utf8"), cipher.final()]);
  return "ap1." + Buffer.concat([iv, body, cipher.getAuthTag()]).toString("base64url");
}
const now = () => Math.floor(Date.now() / 1000);
const pageIds = Object.fromEntries((await pg.query("select page_slug, id from pages")).rows.map((row) => [row.page_slug, row.id]));
const good = (over = {}) => ({ v: 1, org: ORG.id, page: "internal/test/article", pid: pageIds[over.page ?? "internal/test/article"], sub: reader.email, restricted: false, iat: now(), exp: now() + 600, ...over });
const cookieFor = (page, value) => `${api.assetPassCookieName(page, true)}=${value}`;

// ---------------------------------------------------------------------------
console.log("--- 1. 封 ---");
// ---------------------------------------------------------------------------
await check("作った通行証は開けて、中身は 8 つの欄（版・組織・ページ・ページの目印・持ち主・絞ったページか・発行・期限）だけ", () => {
  const opened = api.openAssetPass(ORG, api.sealAssetPass({ organization: ORG, page: "internal/test/article", pageId: pageIds["internal/test/article"], viewer: reader, restricted: false }));
  assert.deepEqual(Object.keys(opened).sort(), ["exp", "iat", "org", "page", "pid", "restricted", "sub", "v"]);
  assert.equal(opened.org, ORG.id);
  assert.equal(opened.pid, pageIds["internal/test/article"]);
  assert.equal(opened.page, "internal/test/article");
  assert.equal(opened.sub, reader.email);
  assert.equal(opened.exp - opened.iat, 600);
});
await check("寿命は 10 分（名簿や見せ方の変更が素材に効くまでの最長の遅れ）", () => assert.equal(api.ASSET_PASS_TTL_SECONDS, 600));
await check("通行証の値から持ち主・ページは読めない", () => {
  const value = api.sealAssetPass({ organization: ORG, page: "internal/test/article", pageId: pageIds["internal/test/article"], viewer: reader, restricted: false });
  const decoded = Buffer.from(value.slice(4), "base64url").toString("latin1");
  for (const plain of [reader.email, "internal/test/article", "reader"]) assert.ok(!value.includes(plain) && !decoded.includes(plain), plain);
});
await check("1 文字でも書き換えると開かない", () => {
  const value = api.sealAssetPass({ organization: ORG, page: "internal/test/article", pageId: pageIds["internal/test/article"], viewer: reader, restricted: false });
  for (const at of [4, 10, 20, value.length - 2]) {
    const swapped = value.slice(0, at) + (value[at] === "A" ? "B" : "A") + value.slice(at + 1);
    assert.equal(api.openAssetPass(ORG, swapped), null, String(at));
  }
});
await check("期限の瞬間から開かない（10 分と 1 秒あと）", () => {
  const issuedAt = Date.now();
  const value = api.sealAssetPass({ organization: ORG, page: "internal/test/article", pageId: pageIds["internal/test/article"], viewer: reader, restricted: false }, issuedAt);
  assert.notEqual(api.openAssetPass(ORG, value, issuedAt + 599_000), null);
  assert.equal(api.openAssetPass(ORG, value, issuedAt + 601_000), null);
});
await check("同じ封でも、寿命が長い・公開の呼び名・発行が未来・欄が多い・別の用途の封は開かない", () => {
  assert.notEqual(api.openAssetPass(ORG, forge(good())), null, "検査の封が本物と同じ");
  assert.equal(api.openAssetPass(ORG, forge(good({ exp: now() + 86400 }))), null, "寿命 1 日");
  assert.equal(api.openAssetPass(ORG, forge(good({ page: "public/test/article" }))), null, "公開の呼び名");
  assert.equal(api.openAssetPass(ORG, forge(good({ page: "internal/../x" }))), null, "危ない呼び名");
  assert.equal(api.openAssetPass(ORG, forge(good({ iat: now() + 120, exp: now() + 720 }))), null, "発行が未来");
  assert.equal(api.openAssetPass(ORG, forge({ ...good(), admin: true })), null, "欄が多い");
  assert.equal(api.openAssetPass(ORG, forge(good(), SECRET, "surprise-pages/view-ticket/v1")), null, "入場券の封");
  assert.equal(api.openAssetPass(ORG, forge(good(), "another-secret")), null, "別の鍵");
});

// ---------------------------------------------------------------------------
await check("別の組織の通行証は効かない（封が開かない・中身の組織を書き換えても開かない・別の組織の宛先では素材に効かない）", () => {
  const value = api.sealAssetPass({ organization: ORG, page: "internal/test/article", pageId: pageIds["internal/test/article"], viewer: reader, restricted: false });
  assert.notEqual(api.openAssetPass(ORG, value), null);
  assert.equal(api.openAssetPass(OTHER, value), null, "A 社の通行証を B 社の宛先で開く");
  assert.equal(api.openAssetPass(ORG, forge(good({ org: OTHER.id }))), null, "中身だけ別の組織");
  assert.equal(api.openAssetPass(OTHER, forge(good({ org: OTHER.id }))), null, "付加データは A 社のまま");
  assert.notEqual(api.openAssetPass(OTHER, forge(good({ org: OTHER.id }), SECRET, "surprise-pages/asset-pass/v1", OTHER.id)), null, "B 社で出した通行証は B 社で開く");
  const request = new Request("https://pages.example.test/internal/test/article/pixel.png", { headers: { cookie: cookieFor("internal/test/article", value) } });
  assert.notEqual(api.assetPassOf(ORG, request, reader, "internal/test/article/pixel.png"), null);
  assert.equal(api.assetPassOf(OTHER, request, reader, "internal/test/article/pixel.png"), null);
});

// ---------------------------------------------------------------------------
console.log("--- 2. 出す ---");
// ---------------------------------------------------------------------------
let readerPass = "";
await check("社内のページを開いた人に、そのページの素材の道筋（末尾に /）に絞った cookie で渡す", async () => {
  const response = await open("/internal/test/article", { viewer: reader });
  assert.equal(response.status, 200);
  const lines = passLines(response.headers);
  assert.equal(lines.length, 1);
  const [line] = lines;
  assert.match(line, /^__Secure-sp-pass\.[A-Za-z0-9_-]{16}=ap1\./);
  assert.match(line, /; Path=\/internal\/test\/article\/(;|$)/);
  assert.match(line, /; Max-Age=600(;|$)/);
  assert.match(line, /; HttpOnly(;|$)/);
  assert.match(line, /; Secure(;|$)/);
  assert.match(line, /; SameSite=Lax(;|$)/);
  readerPass = asCookie(lines);
});
await check("http の手元では Secure と __Secure- を付けない（付けるとブラウザが受け取らない）", async () => {
  const [line] = passLines((await open("/internal/test/article", { viewer: reader, origin: "http://127.0.0.1:3000" })).headers);
  assert.match(line, /^sp-pass\./);
  assert.doesNotMatch(line, /Secure/);
});
/** ブラウザがその道筋の読み込みに cookie を付けるか（RFC 6265 の道筋の一致）。 */
const pathMatches = (cookiePath, requestPath) => requestPath === cookiePath
  || (requestPath.startsWith(cookiePath) && (cookiePath.endsWith("/") || requestPath[cookiePath.length] === "/"));
await check("本文の読み込みには通行証が付かない（先読みした本文と戻るの控えを、cookie の変化で捨てさせない）", async () => {
  const [line] = passLines((await open("/internal/test/article", { viewer: reader })).headers);
  const cookiePath = /;\s*Path=([^;]+)/.exec(line)[1];
  assert.equal(pathMatches(cookiePath, "/internal/test/article"), false, "本文");
  assert.equal(pathMatches(cookiePath, "/"), false, "ホーム");
  assert.equal(pathMatches(cookiePath, "/internal/test/article-2/pixel.png"), false, "名前の頭が同じ別のページ");
  assert.equal(pathMatches(cookiePath, "/internal/test/article/pixel.png"), true, "素材");
  assert.equal(pathMatches(cookiePath, `/internal/test/article/@v/${articleVersion}/old.png`), true, "過去の版の素材");
});
await check("下に別のページが無いかの確かめは、ページごとに 1 度だけ（2 回目からは本文の問い合わせを増やさない）", async () => {
  await open("/internal/test/other", { viewer: reader });
  const again = await open("/internal/test/other", { viewer: reader });
  assert.equal(passLines(again.headers).length, 1);
  assert.deepEqual(again.queries.filter((one) => one.table === "pages" && one.columns === "page_slug"), []);
});
await check("本文がブラウザの控えと同じ（304）でも出す（控えで開く人も素材を 1 枚ずつ待たない）", async () => {
  const first = await open("/internal/test/article", { viewer: reader });
  const etag = first.headers.get("etag");
  assert.ok(etag);
  const response = await open("/internal/test/article", { viewer: reader, etag });
  assert.equal(response.status, 304);
  assert.equal(passLines(response.headers).length, 1);
});
await check("見る人を絞ったページでは、絞ったページの印付きで出す", async () => {
  const response = await open("/internal/test/shared", { viewer: reader });
  assert.equal(response.status, 200);
  const value = passLines(response.headers)[0].split(";")[0].split("=").slice(1).join("=");
  assert.equal(api.openAssetPass(ORG, value).restricted, true);
});
await check("前に置いた手前の中継が https を名乗るときは、Secure を付ける", async () => {
  const response = await as(reader, () => api.pageGET(new Request("http://127.0.0.1:3000/internal/test/article", { headers: { "x-forwarded-proto": "https" } }), params("/internal/test/article")));
  await response.arrayBuffer();
  assert.match(passLines(response.headers)[0], /^__Secure-sp-pass\..*; Secure(;|$)/);
});
await check("通行証を作れないときは出さないだけで、本文は今までどおり返す（本文の配信を落とさない）", async () => {
  delete process.env.AUTH_SECRET;
  try {
    const response = await open("/internal/test/article", { viewer: reader });
    assert.equal(response.status, 200);
    assert.match(response.text, /internal\/test\/article/);
    assert.equal(passLines(response.headers).length, 0);
  } finally { process.env.AUTH_SECRET = SECRET; }
});

// ---------------------------------------------------------------------------
console.log("--- 3. 出さない ---");
// ---------------------------------------------------------------------------
await check("下に別のページがあるページには出さない（下の素材の持ち主は別のページ）", async () => {
  const response = await open("/internal/test/parent", { viewer: reader });
  assert.equal(response.status, 200);
  assert.equal(passLines(response.headers).length, 0);
});
await check("録音の成果物が後から下に作られうる呼び名（internal/recordings とその下）には出さない", async () => {
  const response = await open("/internal/recordings", { viewer: reader });
  assert.equal(response.status, 200);
  assert.equal(passLines(response.headers).length, 0);
  assert.deepEqual(api.UNGUARDED_BRANCHES, ["internal/recordings/"]);
});
await check("見てよくない人（名簿の外）には出さない", async () => {
  const response = await open("/internal/test/shared", { viewer: outsider });
  assert.equal(response.status, 403);
  assert.equal(passLines(response.headers).length, 0);
});
await check("名乗っていない人には出さない", async () => {
  const response = await open("/internal/test/article", { viewer: null });
  assert.equal(passLines(response.headers).length, 0);
});
await check("過去版の入口（/history/）では出さない", async () => {
  const response = await as(reader, () => api.historyGET(new Request(`${ORIGIN}/history/internal/test/article`), { params: Promise.resolve({ visibility: "internal", slug: ["test", "article"] }) }));
  await response.arrayBuffer();
  assert.equal(passLines(response.headers).length, 0);
});

// ---------------------------------------------------------------------------
console.log("--- 4. 素材 ---");
// ---------------------------------------------------------------------------
await check("通行証が無ければ、今までどおり素材ごとに持ち主のページを保存先から引く", async () => {
  const response = await open("/internal/test/article/pixel.png", { viewer: reader });
  assert.equal(response.status, 200);
  assert.ok(pageQueries(response.queries).length >= 1, JSON.stringify(response.queries));
});
await check("通行証があれば、素材の配信で保存先を 1 本も引かない", async () => {
  const response = await open("/internal/test/article/pixel.png", { viewer: reader, cookie: readerPass });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "image/png");
  assert.deepEqual(response.queries, []);
  assert.equal(response.headers.get("cache-control"), api.INTERNAL_ASSET_CACHE);
});
await check("見る人を絞ったページの通行証では、素材をブラウザに残さない（今までと同じ控え）", async () => {
  const pass = cookieFor("internal/test/shared", forge(good({ page: "internal/test/shared", restricted: true })));
  const response = await open("/internal/test/shared/pixel.png", { viewer: reader, cookie: pass });
  assert.equal(response.status, 200);
  assert.deepEqual(response.queries, []);
  assert.equal(response.headers.get("cache-control"), api.RESTRICTED_ASSET_CACHE);
});
await check("他人の通行証では効かない（名簿の外の人は今までどおり 403）", async () => {
  const pass = cookieFor("internal/test/shared", forge(good({ page: "internal/test/shared", restricted: true })));
  const response = await open("/internal/test/shared/pixel.png", { viewer: outsider, cookie: pass });
  assert.equal(response.status, 403);
  assert.ok(pageQueries(response.queries).length >= 1);
});
await check("別のページの通行証は、そのページの素材には効かない", async () => {
  const response = await open("/internal/test/other/pixel.png", { viewer: reader, cookie: readerPass });
  assert.equal(response.status, 200);
  assert.ok(pageQueries(response.queries).length >= 1);
});
await check("名前の頭が同じ別のページ（article と article-2）には効かない", () => {
  const value = api.sealAssetPass({ organization: ORG, page: "internal/test/article", pageId: pageIds["internal/test/article"], viewer: reader, restricted: false });
  const request = new Request(`${ORIGIN}/internal/test/article-2/pixel.png`, { headers: { cookie: cookieFor("internal/test/article", value) } });
  assert.equal(api.assetPassOf(ORG, request, reader, "internal/test/article-2/pixel.png"), null);
  assert.notEqual(api.assetPassOf(ORG, request, reader, "internal/test/article/images/pixel.png"), null);
});
await check("ログアウトしたら通行証があっても素材は出ない（ログインへ送る）", async () => {
  const response = await open("/internal/test/article/pixel.png", { viewer: null, cookie: readerPass });
  assert.equal(response.status, 302);
  assert.match(response.headers.get("location") ?? "", /\/signin\?next=/);
});
await check("過去の版の素材も、持ち主のページの通行証なら保存先を引かない", async () => {
  const response = await open(`/internal/test/article/@v/${articleVersion}/old.png`, { viewer: reader, cookie: readerPass });
  assert.equal(response.status, 200);
  assert.deepEqual(response.queries, []);
});
await check("期限の切れた通行証は使わない（今までどおり門を通す）", async () => {
  const expired = forge(good({ iat: now() - 700, exp: now() - 100 }));
  const response = await open("/internal/test/article/pixel.png", { viewer: reader, cookie: cookieFor("internal/test/article", expired) });
  assert.equal(response.status, 200);
  assert.ok(pageQueries(response.queries).length >= 1);
});

// ---------------------------------------------------------------------------
console.log("--- 5. 遅れの上限 ---");
// ---------------------------------------------------------------------------
await check("名簿から外された人は、本文はその場で、素材は通行証の期限が切れたところで断られる", async () => {
  const pass = passLines((await open("/internal/test/shared", { viewer: reader })).headers);
  assert.equal(pass.length, 1);
  await pg.query("delete from page_permissions where page_id = $1 and member_email = 'reader@example.test'", [shared]);
  try {
    assert.equal((await open("/internal/test/shared", { viewer: reader, cookie: asCookie(pass) })).status, 403, "本文はその場で断る");
    assert.equal((await open("/internal/test/shared/pixel.png", { viewer: reader, cookie: asCookie(pass) })).status, 200, "素材は期限までは控えの答えで出る");
    const expired = cookieFor("internal/test/shared", forge(good({ page: "internal/test/shared", restricted: true, iat: now() - 700, exp: now() - 100 })));
    assert.equal((await open("/internal/test/shared/pixel.png", { viewer: reader, cookie: expired })).status, 403, "期限が切れたら断る");
  } finally {
    await pg.query("insert into page_permissions (page_id, grantee_kind, member_email, added_by) values ($1, 'member', 'reader@example.test', 'owner@example.test')", [shared]);
  }
});

// ---------------------------------------------------------------------------
console.log("--- 5b. 個人版（設置した本人のサイト。招いた人は名簿に載った資料だけを見る） ---");
// ---------------------------------------------------------------------------
/** 同じ組み立て物を個人版として動かす（版は PAGES_EDITION で切り替わる・tests/checks/paths.mjs）。 */
async function personal(run) {
  Object.assign(process.env, { PAGES_EDITION: "personal", PAGES_OWNER_EMAIL: owner.email, PAGES_SITE_URL: ORIGIN });
  try { return await run(); } finally { for (const name of ["PAGES_EDITION", "PAGES_OWNER_EMAIL", "PAGES_SITE_URL"]) delete process.env[name]; }
}
await check("個人版: 招いた人が名簿に載った資料を開くと、絞ったページの印付きで通行証を渡す", () => personal(async () => {
  const response = await open("/internal/test/shared", { viewer: reader });
  assert.equal(response.status, 200);
  const lines = passLines(response.headers);
  assert.equal(lines.length, 1);
  assert.equal(api.openAssetPass(ORG, lines[0].split(";")[0].split("=").slice(1).join("=")).restricted, true);
}));
await check("個人版: 通行証があれば、素材の配信で保存先を 1 本も引かない（素材はブラウザに残さない）", () => personal(async () => {
  const pass = asCookie(passLines((await open("/internal/test/shared", { viewer: reader })).headers));
  const response = await open("/internal/test/shared/pixel.png", { viewer: reader, cookie: pass });
  assert.equal(response.status, 200);
  assert.deepEqual(response.queries, []);
  assert.equal(response.headers.get("cache-control"), api.RESTRICTED_ASSET_CACHE);
}));
await check("個人版: 名簿に載っていない資料は、本文も素材も断り、通行証を出さない", () => personal(async () => {
  const body = await open("/internal/test/article", { viewer: reader });
  assert.ok(body.status === 403 || body.status === 404, String(body.status));
  assert.equal(passLines(body.headers).length, 0);
  const asset = await open("/internal/test/article/pixel.png", { viewer: reader });
  assert.ok(asset.status === 403 || asset.status === 404, String(asset.status));
}));
await check("個人版: 名簿から外された人は、本文はその場で、素材は通行証の期限が切れたところで断られる", () => personal(async () => {
  const pass = passLines((await open("/internal/test/shared", { viewer: reader })).headers);
  assert.equal(pass.length, 1);
  await pg.query("delete from page_permissions where page_id = $1 and member_email = 'reader@example.test'", [shared]);
  try {
    const body = await open("/internal/test/shared", { viewer: reader, cookie: asCookie(pass) });
    assert.ok(body.status === 403 || body.status === 404, `本文はその場で断る（${body.status}）`);
    assert.equal((await open("/internal/test/shared/pixel.png", { viewer: reader, cookie: asCookie(pass) })).status, 200, "素材は期限までは控えの答えで出る");
    const expired = cookieFor("internal/test/shared", forge(good({ page: "internal/test/shared", restricted: true, iat: now() - 700, exp: now() - 100 })));
    const late = await open("/internal/test/shared/pixel.png", { viewer: reader, cookie: expired });
    assert.ok(late.status === 403 || late.status === 404, `期限が切れたら断る（${late.status}）`);
  } finally {
    await pg.query("insert into page_permissions (page_id, grantee_kind, member_email, added_by) values ($1, 'member', 'reader@example.test', 'owner@example.test')", [shared]);
  }
}));

// ---------------------------------------------------------------------------
console.log("--- 6. 決まりの置き場 ---");
// ---------------------------------------------------------------------------
await check("通行証を読む・作るのは配信の入口（src/lib/pages/private-page.ts）だけ", () => {
  const users = [];
  const walk = (folder) => {
    for (const entry of readdirSync(`${root}/${folder}`, { withFileTypes: true })) {
      const path = `${folder}/${entry.name}`;
      if (entry.isDirectory()) { if (!["node_modules", ".next"].includes(entry.name)) walk(path); continue; }
      if (!/\.(ts|tsx|mjs)$/.test(entry.name) || path === "src/lib/pages/asset-pass.ts") continue;
      if (/\bassetPass(Of|Cookie)\b/.test(code(path))) users.push(path);
    }
  };
  for (const folder of ["src/app", "src/lib", "src/widget"]) walk(folder);
  assert.deepEqual(users, ["src/lib/pages/private-page.ts"]);
});
await check("通行証を受けるのは社内の入口（/internal/）でブラウザのログインのときだけ（版で分けない）", () => {
  const delivery = code("src/lib/pages/private-page.ts");
  assert.match(delivery, /const passes = route === "\/internal";/);
  assert.match(delivery, /if \(route === "\/internal" && isAssetPath\(slug\)\) \{/);
});
await check("素材で通行証を使うのは、配信の入口が通行証を受けてよいと決めたあと・持ち主のページが通行証のページのときだけ", () => {
  const delivery = code("src/lib/pages/private-page.ts");
  const decided = delivery.indexOf("const passes = route === ");
  const uses = [...delivery.matchAll(/assetPassOf\(organization, request, viewer, /g)].map((match) => match.index);
  assert.equal(uses.length, 2);
  assert.ok(uses.every((at) => at > decided));
  assert.match(delivery, /const pass = held !== null && held\.page === owner \? held : null;/, "過去の版は持ち主の一致まで見る");
});
await check("通行証を作るのは、門がそのページを通したあとだけ", () => {
  const delivery = code("src/lib/pages/private-page.ts");
  const gate = delivery.indexOf("if (!gate.ok) return refusePage(gate, viewer);");
  const issue = delivery.indexOf("assetPassCookie(request, viewer, gate.page, restricted, leaf)");
  assert.ok(gate > 0 && issue > gate);
});
await check("ページの行を作るのは 2 か所だけ（投稿は名前のぶつかりを断る・録音の成果物は internal/recordings/ の下）", () => {
  const sql = readdirSync(`${root}/db/migrations`).filter((file) => file.endsWith(".sql"))
    .flatMap((file) => [...readFileSync(`${root}/db/migrations/${file}`, "utf8").replace(/--.*$/gm, "").matchAll(/insert\s+into\s+(?:public\.)?pages\s*\(/gi)].map(() => file));
  // 録音の成果物の置き場を用意する関数（古い形と、組織を取る形 org_prepare_recording_output）だけ
  assert.deepEqual(sql, ["20260928063347_recording_output_registration.sql", "20261009005743_recording_organization.sql"]);
  assert.match(readFileSync(`${root}/db/migrations/20260928063347_recording_output_registration.sql`, "utf8"), /slug:='internal\/recordings\/'\|\|p_generation::text\|\|'\/'\|\|p_kind/);
  const organizationScoped = readFileSync(`${root}/db/migrations/20261009005743_recording_organization.sql`, "utf8");
  assert.match(organizationScoped, /slug := 'internal\/recordings\/' \|\| p_generation::text \|\| '\/' \|\| p_kind/);
  assert.equal((organizationScoped.replace(/--.*$/gm, "").match(/insert\s+into\s+(?:public\.)?pages\s*\(/gi) ?? []).length, 1);
  const store = code("src/lib/pages/store.ts");
  assert.equal((store.match(/\.from\(PAGES_TABLE\)\s*\.insert\(/g) ?? []).length, 1, "lib で行を足すのは createPage だけ");
  assert.match(store, /if \(existing === null\) \{\s*const conflict = await findSlugConflict\(input\.organization, input\.pageSlug\);\s*if \(conflict !== null\) throw new SlugConflictError/);
  // 配布版には録音の処理側（services・packages の一部）が無いので、ある置き場だけを歩く
  for (const folder of ["src/app", "src/lib", "bin"].filter((name) => existsSync(`${root}/${name}`))) {
    const walk = (path) => {
      for (const entry of readdirSync(`${root}/${path}`, { withFileTypes: true })) {
        const next = `${path}/${entry.name}`;
        if (entry.isDirectory()) { if (!["node_modules", ".next", "dist", "__pycache__", ".venv"].includes(entry.name)) walk(next); continue; }
        if (!/\.(tsx?|mjs|js|py|sql)$/.test(entry.name) || next === "src/lib/pages/store.ts") continue;
        const text = code(next);
        assert.doesNotMatch(text, /from\(\s*["']pages["']\s*\)\s*\.(insert|upsert)\(/, next);
        assert.doesNotMatch(text, /insert\s+into\s+(?:public\.)?pages\s*\(/i, next);
      }
    };
    walk(folder);
  }
});

console.log(`\n画像の通行証: ${failures} 件の不合格`);
await pg.close();
process.exit(failures === 0 ? 0 : 1);
