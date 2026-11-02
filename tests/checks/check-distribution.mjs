import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { copyFile, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { root, dir } from "./paths.mjs";
import { build } from "esbuild";

const stub = `${dir}/distribution-auth.mjs`;
await writeFile(stub, `export const ALLOWED_DOMAIN = "example.com";
export const auth = async () => ({ user: {email: "owner@example.com", name: "本人", image: null} });
export const headers = async () => ({get: (key) => globalThis.__distributionHeaders?.[key] ?? null});
export const cookies = async () => ({get: () => undefined});`);
const policySource = JSON.parse(await readFile(`${root}/src/templates/document-policy.json`, "utf8"));
assert.equal(policySource.rulesHash, createHash("sha256").update(await readFile(`${root}/src/lib/html/document-security.ts`)).digest("hex"), "実行制限を更新したら許可表の印も取り直す");
const out = `${dir}/distribution-check.cjs`;
await build({ stdin: { contents: `export * from "./src/lib/html/document-security"; export {DEFAULT_LOGO_PRESENTATION} from "./src/lib/deck/media/logo"; export * from "./src/lib/settings/site-settings"; export * from "./src/lib/access/request-security"; export {assetResponse,notModifiedResponse} from "./src/lib/pages/cache"; export {currentBrowserIdentity} from "./src/lib/identity/identity";`, resolveDir: root, loader: "ts" }, bundle: true, platform: "node", format: "cjs", outfile: out, alias: { "@/auth": stub, "next/headers": stub } });
const api = createRequire(import.meta.url)(out);
let failures = 0;
function check(label, test) {
  try { test(); console.log(`OK  ${label}`); }
  catch (error) { failures++; console.log(`NG  ${label}: ${error.message}`); }
}
console.log("--- 配布の設定と権限 ---");
process.env.PAGES_EDITION = "personal";
process.env.PAGES_OWNER_EMAIL = "owner@example.com";
process.env.PAGES_SITE_URL = "https://pages.example.com";
check("本人だけが投稿できる", () => assert.equal(api.mayPublish("OWNER@example.com"), true));
check("招待相手は投稿できない", () => assert.equal(api.mayPublish("reader@example.com"), false));
check("個人用の招待先を受け付ける", () => assert.equal(api.validEmail(" reader@example.com "), "reader@example.com"));
check("壊れたアドレスを受け付けない", () => assert.equal(api.validEmail("@example.com"), null));
check("本人未設定は閉じる", () => { delete process.env.PAGES_OWNER_EMAIL; assert.throws(() => api.mayPublish("owner@example.com")); process.env.PAGES_OWNER_EMAIL = "owner@example.com"; });
globalThis.__distributionHeaders = { authorization: "Bearer example" };
const denied = await api.currentBrowserIdentity();
check("投稿用の鍵では別の鍵の発行を許可しない", () => assert.equal(denied, null));
globalThis.__distributionHeaders = {};
assert.equal((await api.currentBrowserIdentity()).email, "owner@example.com");
console.log("OK  本人のブラウザでの確認は通る");

console.log("--- 資料内の仕掛け ---");
for (const html of [
  "<script>fetch('/api/tokens',{method:'POST'})</script>",
  '<img src="x" onerror="alert(1)">',
  '<a href="java&#x73;cript:alert(1)">開く</a>',
  '<svg><script>alert(1)</script></svg>',
  '<iframe srcdoc="<script>alert(1)</script>"></iframe>',
  '<script src="/internal/a/uploaded.js"></script>',
  '<script src="https://attacker.example/code.js"></script>',
  '<meta http-equiv="refresh" content="0;url=https://attacker.example">',
  '<form action="https://attacker.example"><input></form>',
]) check(`未承認の入力を拒否 ${html.slice(0, 35)}`, () => assert.ok(api.documentProblems(html).length));
check("静的な本文は通る", () => assert.deepEqual(api.documentProblems("<h1>資料</h1><p>本文</p>"), []));
check("承認済みのアイコンは通る", () => assert.deepEqual(api.documentProblems('<script src="https://unpkg.com/lucide@latest"></script><script>lucide.createIcons();</script>'), []));
for (const name of ["mermaid", "deck", "deck-design"]) {
  const html = await readFile(`${root}/src/templates/${name}.html`, "utf8");
  check(`${name}の正本は通る`, () => assert.deepEqual(api.documentProblems(html), []));
}
const design = await readFile(`${root}/tests/checks/fixtures/internal/example/deck-design-presentation.html`, "utf8");
check("着せ替え付きのスライドは通る", () => assert.deepEqual(api.documentProblems(design), []));
for (const [label, html] of [
  ["未知のJSON", '<script type="application/json">{}</script>'],
  ["設定だけのJSON", '<script type="application/json" data-deck-design>{}</script>'],
  ["設定の外部参照", design.replace('type="application/json" data-deck-design', 'src="/anything" type="application/json" data-deck-design')],
  ["実行できる種類への変更", design.replace('type="application/json" data-deck-design', 'type="text/javascript" data-deck-design')],
  ["設定の重複", design.replace('</head>', '<script type="application/json" data-deck-design>{}</script></head>')],
]) check(`${label}を拒否`, () => assert.ok(api.documentProblems(html).length));
const settings = `<script type="application/json" data-deck-focus>${JSON.stringify({version:1,slides:{}})}</script><script type="application/json" data-deck-logo>${JSON.stringify({version:1,asset:{path:"_deck/logo.png",contentType:"image/png"},document:api.DEFAULT_LOGO_PRESENTATION,slides:{}})}</script>`;
const customized = design.replace("</head>", settings + "</head>");
check("焦点とロゴの非実行設定を受け付ける", () => assert.deepEqual(api.documentProblems(customized), []));
check("設定にあるロゴも現在の公開素材に含める", () => assert.equal(api.referencedAsset(customized, "_deck/logo.png"), true));
check("設定にない古いロゴは公開しない", () => assert.equal(api.referencedAsset(customized, "_deck/old-logo.png"), false));
check("ロゴの設定を実行用scriptに変えても拒否する", () => assert.ok(api.documentProblems(customized.replace('type="application/json" data-deck-logo', 'type="text/javascript" data-deck-logo')).length));
const chart = {purpose:"chart-comparison",series:[{id:"sales",label:"売上",data:[{id:"q1",label:"今期",value:10}]}],ariaDescription:"売上の比較"};
const figure = `<figure><script type="application/json" data-dd-chart-source>${JSON.stringify(chart)}</script></figure>`;
check("グラフの材料を受け付ける", () => assert.deepEqual(api.documentProblems(figure), []));
check("壊れたグラフの材料を拒否する", () => assert.ok(api.documentProblems('<figure><script type="application/json" data-dd-chart-source>{}</script></figure>').length));
check("図表の印だけで実行コードを通さない", () => assert.ok(api.documentProblems(figure.replace('type="application/json"', 'type="text/javascript"')).length));
check("図表の外部スクリプトを許可しない", () => assert.ok(api.documentProblems(figure.replace('data-dd-chart-source', 'data-dd-chart-source src="/evil.js"')).length));
check("配置図の材料を受け付ける", () => assert.deepEqual(api.documentProblems('<figure><script type="application/json" data-dd-native-source>{"kind":"quadrant","points":[],"ariaDescription":"配置"}</script></figure>'), []));
check("デザインのJSONに実行許可を出さない", () => {
  const json = design.match(/<script type="application\/json" data-deck-design>([\s\S]*?)<\/script>/)[1];
  assert.ok(!api.documentPolicy(design).includes(createHash("sha256").update(json).digest("base64")));
});
const policy = api.documentPolicy("<script>fetch('/api/tokens')</script>");
const legacyNavigation=await readFile(`${root}/tests/checks/fixtures/deck-edit/legacy-navigation.html`,"utf8");
check("配布済みの標準操作部品を原本のまま受け付ける",()=>assert.deepEqual(api.documentProblems(legacyNavigation),[]));
check("旧標準部品の実際の空白を含めて配信時の実行を認める",()=>assert.ok(api.documentPolicy(legacyNavigation).includes(createHash("sha256").update(legacyNavigation.match(/<script>([\s\S]*?)<\/script>/)[1]).digest("base64"))));
check("旧標準部品の変更には互換許可を広げない",()=>assert.ok(api.documentProblems(legacyNavigation.replace('var WIDTH = 1280;','var WIDTH = 999;')).length));
check("任意の同一サイトのscriptは許可しない", () => assert.ok(!/script-src 'self'/.test(policy)));
check("未知のinlineコードを許可しない", () => {
  const badHash = createHash("sha256").update("fetch('/api/tokens')").digest("base64");
  const directive = policy.split(";").find((one) => one.trim().startsWith("script-src "));
  assert.ok(!directive.includes("'unsafe-inline'") && !directive.includes(badHash));
});
const isolatedAsset = await api.assetResponse(new Request("https://pages.example.com/image.svg"), {
  contentType: "image/svg+xml", size: 0, etag: '"asset"', uploadedAt: new Date(),
  open: async () => new ReadableStream({start(controller){controller.close();}}),
}, {cacheControl:"no-store",pageId:null});
check("SVG等の単独表示は実行できない", () => assert.match(isolatedAsset.headers.get("content-security-policy"), /^sandbox; default-src 'none'/));
check("変更なしの応答で本文の実行方針を壊さない", () => {
  assert.equal(api.notModifiedResponse({cacheControl:"no-store",pageId:null,etag:"a"}).headers.get("content-security-policy"), null);
});
check("外への送信を閉じる", () => assert.ok(policy.includes("connect-src 'self'") && policy.includes("form-action 'none'")));
check("別サイトの画像は読み込まない", () => assert.ok(policy.includes("img-src 'self' data: blob:")));
check("本文が使っている画像だけを認める", () => assert.equal(api.referencedAsset('<img src="images/a.png">', "images/a.png"), true));
check("古い画像は参照に数えない", () => assert.equal(api.referencedAsset('<img src="images/a.png">', "images/old.png"), false));
check("外部URLを自分の素材として認めない", () => assert.equal(api.referencedAsset('<img src="https://other.example/images/a.png">', "images/a.png"), false));

console.log("--- ブラウザの送信元 ---");
check("同じサイトからの変更を通す", () => assert.equal(api.sameOriginRequest(new Request("https://pages.example.com/api/tokens", {method:"POST", headers:{origin:"https://pages.example.com"}})), true));
check("外からの変更を通さない", () => assert.equal(api.sameOriginRequest(new Request("https://pages.example.com/api/tokens", {method:"POST", headers:{origin:"https://other.example"}})), false));
check("送信元不明のブラウザ変更を通さない", () => assert.equal(api.sameOriginRequest(new Request("https://pages.example.com/api/tokens", {method:"POST"})), false));
console.log("--- 回数の上限 ---");
check("名乗りの無い連打は上限の次で止まる", () => {
  const take = api.createRateLimiter();
  for (let i = 0; i < api.RATE_LIMITS.anonymous; i++) take("anonymous", "a", 0);
  assert.equal(take("anonymous", "a", 0).allowed, false);
});
check("ログイン中の普通の操作は当たらない", () => {
  const take = api.createRateLimiter();
  for (let i = 0; i < 600; i++) assert.equal(take("credentialed", "a", i).allowed, true);
});
const limited = api.rateLimitedResponse(30);
const limitedText = await limited.text();
check("断りは429で待ち時間だけを返す", () => {
  assert.equal(limited.status, 429);
  assert.equal(limited.headers.get("retry-after"), "30");
  assert.doesNotMatch(limitedText, /[0-9]|http|postgres/i);
});
console.log("--- 利用形態の判定 ---");
const cliHome = await mkdtemp(`${dir}/cli-`);
await mkdir(`${cliHome}/bin`);
for (const name of ["pages-publish.mjs"]) await copyFile(`${root}/bin/${name}`, `${cliHome}/bin/${name}`);
function cliEdition(deployed, configured, host = "https://pages.example.com") {
  writeFileSync(`${cliHome}/deployment.json`, JSON.stringify({ edition: deployed }));
  const env = { PATH: process.env.PATH, HOME: cliHome, PAGES_HOST: host };
  if (configured !== undefined) env.PAGES_EDITION = configured;
  const run = spawnSync(process.execPath, [`${cliHome}/bin/pages-publish.mjs`, "config", "--json"], { env, encoding: "utf8" });
  if (run.status !== 0) return { error: run.stderr };
  return { edition: JSON.parse(run.stdout).personal ? "personal" : "company" };
}
function serverEdition(deployed, configured) {
  try { return { edition: api.resolveEdition(deployed, configured) }; } catch (error) { return { error: error.message }; }
}
for (const deployed of ["company", "personal"]) for (const configured of [undefined, "company", "personal", "Personal"]) {
  check(`焼き込み ${deployed}・環境 ${configured ?? "なし"} で CLI とサーバーが同じ答え`, () => {
    const server = serverEdition(deployed, configured), cli = cliEdition(deployed, configured);
    if (server.error) assert.match(cli.error ?? "", /利用形態の設定が正しくありません/);
    else assert.deepEqual(cli, server);
  });
}
check("焼き込んだ配布版を環境変数で社内版へ戻せない", () => assert.equal(api.resolveEdition("personal", "company"), "personal"));
// このリポジトリは配布版。実物の deployment.json は personal を焼き込んだまま（社内版の形で見る検査表は組み立ての中だけで差し替える）
const deployed = JSON.parse(await readFile(`${root}/deployment.json`, "utf8"));
check("実物の deployment.json は配布版（personal）を焼き込んである", () => assert.deepEqual(deployed, { edition: "personal", configDir: "surprise-pages-distribution" }));
const cliSource = await readFile(`${root}/bin/pages-publish.mjs`, "utf8");
check("配布版の CLI に既定の宛先は無い（投稿先は本人が設定したサイトだけ）", () => assert.doesNotMatch(cliSource, /example|vercel\.app/));

console.log("--- 設置の不足の案内 ---");
const setupOut = `${dir}/distribution-setup.cjs`;
await build({ stdin: { contents: `export { installationProblem, closeDatabase } from "./src/lib/db/database"; export { SETUP_PROBLEMS } from "./src/lib/settings/setup-error";`, resolveDir: root, loader: "ts" }, bundle: true, platform: "node", format: "cjs", outfile: setupOut, logLevel: "error" });
const setup = createRequire(import.meta.url)(setupOut);
const headings = (await readFile(`${root}/README.md`, "utf8")).split("\n").filter((line) => /^#{2,3} /.test(line)).map((line) => line.replace(/^#+ /, "").trim());
check("案内が指す章は導入ガイドに実在する", () => {
  // 章が null のものは社内版だけの止まり方（本番でないサーバーが本番の保管庫を指している）で、導入ガイドには載らない
  for (const [kind, guide] of Object.entries(setup.SETUP_PROBLEMS)) if (guide.chapter !== null) assert.ok(headings.includes(guide.chapter), `${kind}: ${guide.chapter}`);
});
const doctorChapters = [...(await readFile(`${root}/scripts/setup/personal.mjs`, "utf8")).matchAll(/"(\d+(?:-\d+)?\. [^"]+)"/g)].map((match) => match[1]);
check("診断が指す章は導入ガイドに実在する", () => {
  assert.ok(doctorChapters.length >= 5);
  for (const chapter of doctorChapters) assert.ok(headings.includes(chapter), chapter);
});
const setupEnv = { PAGES_OWNER_EMAIL: "owner@example.com", PAGES_SITE_URL: "https://pages.example.com", DATABASE_URL: "postgres://runtime:do-not-print@127.0.0.1:1/pages", AUTH_SECRET: "do-not-print", AUTH_GOOGLE_ID: "id", AUTH_GOOGLE_SECRET: "do-not-print", BLOB_READ_WRITE_TOKEN: "do-not-print" };
const savedSetupEnv = Object.fromEntries(Object.keys(setupEnv).map((name) => [name, process.env[name]]));
Object.assign(process.env, setupEnv, { AUTH_SECRET: "" });
const missingSetup = await setup.installationProblem();
check("足りない設定は名前だけを返す", () => assert.deepEqual(missingSetup, { kind: "missing", names: ["AUTH_SECRET"] }));
Object.assign(process.env, setupEnv);
const unreachable = await setup.installationProblem();
check("保存先に繋がらないときは種類だけを返し、接続の値を返さない", () => {
  assert.deepEqual(unreachable, { kind: "database-unreachable" });
  assert.doesNotMatch(JSON.stringify(unreachable), /do-not-print|127\.0\.0\.1/);
});
await setup.closeDatabase();
for (const [name, value] of Object.entries(savedSetupEnv)) if (value === undefined) delete process.env[name]; else process.env[name] = value;

console.log("--- 手元のAIからの編集 ---");
const agentOut = `${dir}/distribution-agent.cjs`;
await build({ stdin: { contents: `export * from "./src/lib/page-agent/feature"; export {featureEnabled} from "./src/lib/settings/features";`, resolveDir: root, loader: "ts" }, bundle: true, platform: "node", format: "cjs", outfile: agentOut, logLevel: "error" });
const agent = createRequire(import.meta.url)(agentOut);
check("配布版でも既定で動く", () => { delete process.env.PAGES_AGENT_EDITING; assert.equal(agent.featureEnabled("page-agent"), true); });
check("off で止められる", () => { process.env.PAGES_AGENT_EDITING = "off"; assert.equal(agent.featureEnabled("page-agent"), false); delete process.env.PAGES_AGENT_EDITING; });
check("配布版の履歴付きリンクを資料として受ける", () => assert.deepEqual(agent.agentPagePath("/history/internal/guide/intro"), { kind: "slug", slug: "internal/guide/intro" }));
check("公開のリンクは呼び名を引き直す", () => assert.deepEqual(agent.agentPagePath("/public/guide"), { kind: "public", segments: ["guide"] }));
const { personalEnvironmentExample, requiredPersonalVariables } = await import(pathToFileURL(`${root}/scripts/setup/environment.mjs`).href);
check("設定の見本に止め方を載せる", () => assert.match(personalEnvironmentExample(), /^PAGES_AGENT_EDITING=$/m));
check("設定の見本に配布版で使えない鍵を載せない", () => assert.doesNotMatch(personalEnvironmentExample(), /SLACK_|SERPER_|CURSOR_|SUPABASE_|PAGES_MOTION_EDITING/));
check("設定の見本に必須の名前が全部ある", () => { for (const name of requiredPersonalVariables()) assert.match(personalEnvironmentExample(), new RegExp(`^${name}=`, "m")); });
console.log(`\n配布検査: ${failures} 件の不合格`);
process.exitCode = failures ? 1 : 0;
