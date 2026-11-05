/**
 * 図のページの「図を先に描く」（src/lib/first-paint/diagrams.ts・src/lib/first-paint/diagram-prerender.ts）の決まり。
 * ブラウザは起こさない（描いて差し替えるところは tests/checks/browser/diagram-first-paint.mjs）。
 *
 *   1. 確かめられる形のページだけ通す（雛形の実行部・自前の図の道具 1 本・`<pre class="mermaid">` の字と `<br>` だけ）
 *   2. 差し込みの形（描いた図を置く・道具を描画を止めずに読む・元の文の控え・明暗・焼き付きを断る目印）
 *   3. 実行制限（documentPolicy）が差し込んだ読み込み役だけを許す（中身は決まった 1 通り・材料は実行されない入れ物）
 *   4. 描いた絵が本文に合わなければ当てない（数・元の文・大きさ・スクリプト）
 *   5. 図を描く API への頼みは、このサーバーが署名した許可（本文の指紋と鍵に結ぶ・1 分）が無ければ通らない
 *   6. 配信のつなぎ（スイッチが切れていれば何もしない・控えに無ければ頼んで今までどおり・あれば置く・描けなかった版は頼み直さない・台帳と同梱）
 */
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { build } from "esbuild";

import { dir, root } from "./paths.mjs";

const assets = mkdtempSync(`${tmpdir()}/pages-diagram-cache-`);
process.once("exit", () => rmSync(assets, { recursive: true, force: true }));
process.env.PAGES_TEST_ASSETS = assets;
process.env.PAGES_SITE_URL = "https://pages.example";

const out = `${dir}/first-paint-diagrams`;
await build({
  entryPoints: [
    `${root}/src/lib/first-paint/diagrams.ts`,
    `${root}/src/lib/first-paint/diagram-prerender.ts`,
    `${root}/src/lib/html/vendor-scripts.ts`,
    `${root}/src/lib/html/check.ts`,
    `${root}/src/lib/html/document-security.ts`,
  ],
  outdir: out,
  entryNames: "[name]",
  outExtension: { ".js": ".mjs" },
  bundle: true,
  format: "esm",
  platform: "node",
  external: ["node:*"],
  // 画像の置き場は通し検査と同じファイルの置き場（tests/support/blob-store.mjs・終わったら消す）
  alias: { "@vercel/blob": `${root}/tests/support/blob-store.mjs` },
  logLevel: "silent",
});
const { diagramPlan, withPrerenderedDiagrams, renderFits, quarantineSvgIds, diagramLoaderScript, FIRST_PAINT_DIAGRAM } = await import(`${out}/diagrams.mjs`);
const { withDiagramFirstPaint, keepDiagrams, recallDiagrams, diagramKey, readDiagramRenderRequest, requestDiagramRender, DIAGRAM_RENDER_PATH } = await import(`${out}/diagram-prerender.mjs`);
const { withVendorScripts } = await import(`${out}/vendor-scripts.mjs`);
const { findHtmlIssues } = await import(`${out}/check.mjs`);
const { documentPolicy } = await import(`${out}/document-security.mjs`);

let failures = 0;
const ok = (label, actual, expected) => {
  const pass = JSON.stringify(actual) === JSON.stringify(expected);
  if (!pass) failures += 1;
  console.log(`${pass ? "OK  " : "NG  "} ${label}${pass ? "" : `: ${JSON.stringify(actual)}（期待: ${JSON.stringify(expected)}）`}`);
};
const read = (file) => readFileSync(`${root}/${file}`, "utf8");

const fixture = read("tests/checks/fixtures/internal/guide/diagrams.html");
const page = withVendorScripts(fixture);
const plan = diagramPlan(page);

console.log("--- 1. 確かめられる形だけ通す ---");
ok("見本（雛形の一式を写したページ）は通る・図は 4 つ", plan?.diagrams.length, 4);
ok("図の中身は書かれた HTML のまま（道具が読む形）", plan?.diagrams[0].inner.includes("--&gt;") || plan?.diagrams[0].inner.includes("-->"), true);
ok("付け替える前（外の行き先）は通さない", diagramPlan(fixture), null);
const swap = (from, to) => diagramPlan(page.replace(from, to));
ok("道具に defer が書いてあれば通さない", swap(/<script src="(\/vendor\/mermaid\.js\/[0-9a-z]+)">/, '<script defer src="$1">'), null);
ok("いまの版でない道具の行き先は通さない", swap(/\/vendor\/mermaid\.js\/[0-9a-z]+/, "/vendor/mermaid.js/000000000000"), null);
ok("自分で走らせない実行部（startOnLoad: false が無い）は通さない", swap("startOnLoad: false", "startOnLoad: true"), null);
ok("実行部が mermaid を別の形で呼んでいれば通さない", swap("await mermaid.run();", "await mermaid.run(); mermaid.contentLoaded();"), null);
ok("図の道具に触れる実行部が 2 つなら通さない", swap("</head>", "<script>mermaid.initialize({})</script></head>"), null);
ok("`<pre>` 以外の図は通さない", swap('<pre class="mermaid">', '<div class="mermaid">'), null);
ok("属性を足した図は通さない", swap('<pre class="mermaid">', '<pre class="mermaid" id="x">'), null);
ok("図の中に要素がある（`<br>` 以外）なら通さない", swap("flowchart LR", "flowchart LR<span>x</span>"), null);
ok("図の中の `<br>` は通す", swap("flowchart LR", "flowchart LR<br>")?.diagrams.length, 4);
const tailwindNote = "<script>tailwind.config = {\n  // 図を貼る一式（templates/mermaid.html）も同じ並びを持つ\n  theme: {} };</script></head>";
ok("コメントで図の一式の名前に触れるだけのスクリプトがあっても通る", swap("</head>", tailwindNote)?.diagrams.length, 4);
ok("図の道具を呼ぶスクリプトが別にあれば通さない（名前の手前が `window.` でも）", swap("</head>", "<script>window.mermaid.run()</script></head>"), null);
ok("図を選ぶ字（`pre.mermaid`）を持つスクリプトが別にあれば通さない", swap("</head>", "<script>document.querySelectorAll('pre.mermaid')</script></head>"), null);
ok("図の無いページは通さない", diagramPlan(page.replaceAll('class="mermaid"', 'class="code"')), null);

console.log("\n--- 2. 差し込みの形 ---");
const svg = (id, body = "") => `<svg id="${id}" width="10" height="10"><style>#${id} .a{fill:red}</style>${body}</svg>`;
const drawn = {
  sources: plan.diagrams.map((one) => one.inner),
  light: plan.diagrams.map((_, i) => quarantineSvgIds(svg(`mermaid-${100 + i}`, i === 3 ? "" : "<g/>"), `sp-light-${i}`)),
  dark: plan.diagrams.map((_, i) => quarantineSvgIds(svg(`mermaid-${200 + i}`), i === 3 ? `sp-light-${i}` : `sp-dark-${i}`)),
};
ok("目印は中の参照ごと付け替える", drawn.light[0], '<svg id="sp-light-0" width="10" height="10"><style>#sp-light-0 .a{fill:red}</style><g/></svg>');
ok("目印の無い絵は付け替えない（当てない）", quarantineSvgIds("<svg><g/></svg>", "x"), null);
const delivered = withPrerenderedDiagrams(page, plan, drawn);
ok("図の道具の script タグは残さない", delivered.includes(plan.tag), false);
const loader = diagramLoaderScript();
ok("道具は描画を止めない読み込みで必ず読む（行き先は同じ）", loader.includes(`s.src=${JSON.stringify(/src="([^"]+)"/.exec(plan.tag)[1])}`) && delivered.includes(`<script data-sp-first-paint="diagram">${loader}</script>`), true);
const pres = [...delivered.matchAll(/<pre class="mermaid" data-processed="true" data-surprise-mermaid="([^"]*)" data-sp-first-paint="diagram">([\s\S]*?)<\/pre>/g)];
ok("図ごとに描いた図を置く（描き済みの印・元の文の控え・焼き付きを断る目印）", pres.length, 4);
ok("元の文の控えは本文の字（textContent）を詰めたもの", pres.some((one) => one[1].startsWith("flowchart LR")) && pres.every((one) => !one[1].includes("<")), true);
ok("明暗が違えば 2 枚・印つき", /^<svg data-sp-scheme="light" id="sp-light-0"[\s\S]*<svg data-sp-scheme="dark" id="sp-dark-0"/.test(pres[0][2]), true);
ok("明暗が同じなら 1 枚だけ", (pres[3][2].match(/<svg\b/g) ?? []).length, 1);
ok("見せるのは OS の明暗に合う 1 枚（実行部と同じ条件）", delivered.includes('@media (prefers-color-scheme: dark){pre[data-sp-first-paint="diagram"]>svg[data-sp-scheme="light"]{display:none!important}}'), true);
ok("写しは `DOMContentLoaded` を document で受けて作る（window で受ける実行部より先）", loader.includes('document.addEventListener("DOMContentLoaded",twins)'), true);
const withBreak = page.replace("flowchart LR", "flowchart LR<br>");
const breakPlan = diagramPlan(withBreak);
const breakDelivered = withPrerenderedDiagrams(withBreak, breakPlan, { ...drawn, sources: breakPlan.diagrams.map((one) => one.inner) });
const data = /<script type="application\/json" data-sp-first-paint="diagram">([\s\S]*?)<\/script>/.exec(breakDelivered)?.[1] ?? "";
ok("写しの材料は書かれた HTML のまま、実行されない入れ物で渡す（`<` は逃がして入れ物を閉じない）", data.includes("flowchart LR\\u003cbr>") && !data.includes("<br>") && JSON.parse(data).length === 4, true);
ok("読み込み役の中身はページによらず同じ（図の元の文を含まない）", breakDelivered.includes(`<script data-sp-first-paint="diagram">${loader}</script>`) && !loader.includes("flowchart"), true);
ok("本文は図のほかは変えない", delivered.replace(/<pre class="mermaid" data-processed[\s\S]*?<\/pre>/g, "").replace(/<style data-sp-first-paint="diagram">[\s\S]*?<script data-sp-first-paint="diagram">[\s\S]*?<\/script>/, "") === page.replace(/<pre class="mermaid">[\s\S]*?<\/pre>/g, "").replace(plan.tag, ""), true);
ok("保存される本文に焼き付いたら断る", findHtmlIssues(delivered).some((issue) => issue.kind === "artifact" && issue.detail === "firstPaint"), true);
ok("目印の値", FIRST_PAINT_DIAGRAM, "diagram");

console.log("\n--- 3. 実行制限 ---");
const hashOf = async (text) => `'sha256-${(await import("node:crypto")).createHash("sha256").update(text).digest("base64")}'`;
const loaderHash = await hashOf(loader);
ok("差し込んだ読み込み役は実行制限で許す", documentPolicy(delivered).includes(loaderHash), true);
ok("差し込んでいないページには許しを足さない", documentPolicy(page).includes(loaderHash), false);
const tampered = delivered.replace(`<script data-sp-first-paint="diagram">${loader}`, `<script data-sp-first-paint="diagram">${loader};alert(1)`);
ok("字の違う読み込み役は許さない", documentPolicy(tampered).includes(await hashOf(`${loader};alert(1)`)), false);
ok("材料の入れ物（JSON）は実行されない形で置く", /<script type="application\/json" data-sp-first-paint="diagram">/.test(delivered), true);

console.log("\n--- 4. 合わない絵は当てない ---");
ok("合う絵は当てる", renderFits(plan, drawn), true);
ok("元の文が違えば当てない", renderFits(plan, { ...drawn, sources: drawn.sources.map((one, i) => (i === 1 ? `${one} ` : one)) }), false);
ok("数が違えば当てない", renderFits(plan, { ...drawn, light: drawn.light.slice(1) }), false);
const broken = (part) => renderFits(plan, { ...drawn, dark: drawn.dark.map((one, i) => (i === 0 ? one.replace("</svg>", `${part}</svg>`) : one)) });
ok("スクリプトを含む絵は当てない", broken("<script>1</script>"), false);
ok("`</pre>` を含む絵は当てない", broken("</pre>"), false);
ok("仕掛けの属性（on…=）を含む絵は当てない", broken('<g onclick="x()"/>'), false);
ok("javascript: を含む絵は当てない", broken('<a href="javascript:x()"/>'), false);
ok("大きすぎる絵は当てない", renderFits(plan, { ...drawn, light: drawn.light.map((one, i) => (i === 0 ? one.replace("</svg>", `<g>${"x".repeat(400_000)}</g></svg>`) : one)) }), false);
ok("当てられないときは本文をそのまま返す", withPrerenderedDiagrams(page, plan, { ...drawn, light: [] }) === page, true);

console.log("\n--- 5. 図を描く API への頼み ---");
process.env.AUTH_SECRET = "check-first-paint-diagrams";
const key = diagramKey("00000000-0000-4000-8000-000000000009", "f".repeat(40));
const sent = [];
const fakeSend = async (url, init) => { sent.push({ url: String(url), init }); return new Response(null, { status: 202 }); };
ok("頼めた", await requestDiagramRender("https://pages.example", key, page, fakeSend), true);
ok("頼む先はサイトの宛先の図を描く API", sent[0].url, `https://pages.example${DIAGRAM_RENDER_PATH}`);
const authorization = sent[0].init.headers.authorization;
const body = JSON.parse(sent[0].init.body);
ok("署名した許可があれば通る", readDiagramRenderRequest(authorization, body)?.key, key);
ok("本文を差し替えたら通らない", readDiagramRenderRequest(authorization, { ...body, html: `${body.html} ` }), null);
ok("鍵を差し替えたら通らない（控えを書き換えさせない）", readDiagramRenderRequest(authorization, { ...body, key: diagramKey("00000000-0000-4000-8000-000000000008", "f".repeat(40)) }), null);
ok("許可が無ければ通らない", readDiagramRenderRequest(null, body), null);
ok("頭の違う許可は通らない", readDiagramRenderRequest(authorization.replace(/^\S+/, "Bearer"), body), null);
ok("1 分を過ぎた許可は通らない", readDiagramRenderRequest(authorization, body, Date.now() + 61_000), null);
ok("別の鍵（AUTH_SECRET）で作った許可は通らない", (() => { process.env.AUTH_SECRET = "other"; const got = readDiagramRenderRequest(authorization, body); process.env.AUTH_SECRET = "check-first-paint-diagrams"; return got; })(), null);
ok("形の違う鍵では許可を作らない（置き場の鍵を外から作らせない）", await requestDiagramRender("https://pages.example", "../../x", page, fakeSend), false);

console.log("\n--- 6. 配信のつなぎ ---");
const version = { pageId: "00000000-0000-4000-8000-000000000001", versionId: "a".repeat(40) };
delete process.env.PAGES_DIAGRAM_PRERENDER;
const offAsks = [];
ok("スイッチが切れていれば 1 字も変えず、頼まない", (await withDiagramFirstPaint(page, version, { send: async (...args) => { offAsks.push(args); return new Response(null, { status: 202 }); } })) === page && offAsks.length === 0, true);
process.env.PAGES_DIAGRAM_PRERENDER = "yes";
ok("知らない値も切", (await withDiagramFirstPaint(page, version, { origin: null })) === page, true);
process.env.PAGES_DIAGRAM_PRERENDER = "on";
const asks = [];
const counting = async (url, init) => { asks.push(JSON.parse(init.body)); return new Response(null, { status: 202 }); };
ok("控えに無ければ今までどおり配る", (await withDiagramFirstPaint(page, version, { send: counting })) === page, true);
await new Promise((resolve) => setTimeout(resolve, 20));
ok("控えに無ければサイトの宛先へ描くのを頼む（配る本文と鍵を渡す）", asks.length === 1 && asks[0].key === diagramKey(version.pageId, version.versionId) && asks[0].html === page, true);
await withDiagramFirstPaint(page, version, { send: counting });
await new Promise((resolve) => setTimeout(resolve, 20));
ok("同じ実行環境ではすぐに頼み直さない", asks.length, 1);
await keepDiagrams(diagramKey(version.pageId, version.versionId), drawn);
ok("控えにあれば描いた図を置く", (await withDiagramFirstPaint(page, version, { origin: null })) === delivered, true);
ok("別の版には当てない", (await withDiagramFirstPaint(page, { ...version, versionId: "b".repeat(40) }, { origin: null })) === page, true);
ok("描いた絵は非公開の置き場に控える（別の実行環境も読める）", "light" in ((await recallDiagrams(diagramKey(version.pageId, version.versionId), { fresh: true })) ?? {}), true);
const failedKey = diagramKey(version.pageId, "c".repeat(40));
await keepDiagrams(failedKey, { failed: true, at: Date.now() });
const failedAsks = [];
ok("描けなかった版は今までどおり配り、しばらく頼み直さない", (await withDiagramFirstPaint(page, { ...version, versionId: "c".repeat(40) }, { send: async (_u, init) => { failedAsks.push(init); return new Response(null, { status: 202 }); } })) === page && failedAsks.length === 0, true);
ok("大きすぎる本文には手を出さない", (await withDiagramFirstPaint(`${page}${" ".repeat(1_800_001)}`, version, { origin: null })).length === page.length + 1_800_001, true);

const DELIVERY = read("src/lib/first-paint/delivery.ts");
const ROUTE = read("src/app/api/pages/diagrams/route.ts");
const PRERENDER = read("src/lib/first-paint/diagram-prerender.ts");
ok("描画を待たせない差し込みの中で呼ぶ（スライドは対象外・配布版でも当てる）", /if \(isDeckHtml\(page\)\) return page;[\s\S]*if \(!diagramPrerenderOn\(\)\) return styled;\s*const \{ withDiagramFirstPaint \} = await import\("\.\/diagram-prerender"\);\s*return withDiagramFirstPaint\(styled, key\);/.test(DELIVERY), true);
ok("本文の入口は Chromium を読まない（描くのは図を描く API だけ）", /(?:from|import\()\s*"[^"]*(?:diagram-render|card-image|playwright)"/.test(PRERENDER + DELIVERY + read("src/lib/pages/private-page.ts") + read("src/app/public/[...slug]/route.ts")), false);
ok("頼む先は設定したサイトの宛先（要求の Host から決めない）", /siteOrigin\(\)/.test(PRERENDER) && !/headers\.get\("host"\)/.test(PRERENDER), true);
ok("控えは非公開の置き場にだけ置く", /await put\(parts\.blob, [^;]*?access: "private"/.test(PRERENDER) && !/access: "public"/.test(PRERENDER), true);
ok("図を描く API に Chromium と道具の現物を同梱する", /"\/api\/pages\/diagrams": \["\.\/\.deck-card-runtime\/\*\*\/\*", [^\]]*"\.\/vendor\/mermaid\/mermaid\.js"/.test(read("next.config.ts")), true);
ok("機能の台帳に載っている（配布版で使う・口はこれだけ）", /"diagram-prerender": \{[\s\S]*?personal: true,\s*routes: \["src\/app\/api\/pages\/diagrams"\]/.test(read("src/lib/settings/features.ts")), true);
ok("機能のスイッチは切れて生まれる", /"name": "PAGES_DIAGRAM_PRERENDER"[\s\S]*?"unset": "off"/.test(read("src/lib/settings/environment.json")) && /PAGES_DIAGRAM_PRERENDER === "on"/.test(read("src/lib/first-paint/diagrams.ts")), true);
ok("図を描く API はスイッチと許可を通す", /diagramPrerenderOn\(\)[\s\S]*readDiagramRenderRequest\(request\.headers\.get\("authorization"\), body\)/.test(ROUTE), true);
ok("図を描く API は応答のあとで描き、描けなかった版も控える", /after\(inBackground\("diagram-render"[\s\S]*keepDiagrams\(asked\.key, drawn \?\? \{ failed: true/.test(ROUTE), true);
ok("図を描く API は入口の外枠とログの台帳に載る", /routeLog\("\/api\/pages\/diagrams"/.test(ROUTE) && /"src\/app\/api\/pages\/diagrams\/route\.ts": "routeLog"/.test(read("src/lib/logging/log-ledger.json")), true);
ok("実行制限は読み込み役の字の一致でだけ許す", /text === diagramLoaderScript\(\)/.test(read("src/lib/html/document-security.ts")), true);

console.log(`\n${failures === 0 ? "すべて合格" : `${failures} 件 不合格`}`);
process.exitCode = failures === 0 ? 0 : 1;
