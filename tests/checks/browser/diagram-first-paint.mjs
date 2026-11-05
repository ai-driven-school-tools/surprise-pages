/**
 * 図のページの「図を先に描く」（src/lib/first-paint/diagram-render.ts・src/lib/first-paint/diagrams.ts）を、本物の Chromium で確かめる。
 *
 *   1. サーバーの描く部品（renderDiagrams）が、見本（tests/checks/fixtures/internal/guide/diagrams.html）の 4 枚を明暗の 2 枚ずつ描ける
 *   2. 配った本文は、図の道具が届く前に本文と図を描く（道具を 1.5 秒止めても、最初の描画は道具を待たない）。直す前は道具を待つ
 *   3. 道具が届いたあとの図は、直す前と同じ（高さ・幅・目盛りの数・絵記号の手当て・属性）。サーバーの絵は残らない（目印が端末の `mermaid-`）
 *   4. 画面のずれ（layout-shift）は 0。スマホの幅・明るい側と、広い画面・暗い側の 2 通り
 *   5. 道具が届く前は、OS の明暗に合う 1 枚だけが見えている
 *   6. サーバーと端末で高さが違う図（書体の違い）は、見えている間は差し替えず、画面の外へ出てから差し替える（その間もずれ 0）
 *   7. 道具が届かなければ、サーバーの絵のまま（写しは残さない）
 *
 * 保管庫にもネットワークにも繋がない。文書と道具は page.route で応える。
 * 応答には配布版と同じ実行制限（documentPolicy）を付ける——差し込んだ読み込み役が実行制限の中で動くことも確かめる。
 */
import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";

import { root } from "../paths.mjs";

const { build } = await import(`${root}/node_modules/esbuild/lib/main.js`);
const { chromium } = await import("playwright");

// 組み立てたものはリポジトリの中（.test-build・追跡の対象外）へ置く。外に置くと、描く部品が実行時に読む playwright を見つけられない
const built = `${root}/.test-build/diagram-first-paint`;
await mkdir(built, { recursive: true });
process.env.PAGES_SITE_URL = "https://diagrams.test";
await build({
  entryPoints: [
    `${root}/src/lib/first-paint/diagram-render.ts`,
    `${root}/src/lib/first-paint/diagrams.ts`,
    `${root}/src/lib/html/vendor-scripts.ts`,
    `${root}/src/lib/deck/card/card-image.ts`,
    `${root}/src/lib/html/document-security.ts`,
  ],
  outdir: built,
  entryNames: "diagram-[name]",
  outExtension: { ".js": ".mjs" },
  bundle: true,
  format: "esm",
  platform: "node",
  external: ["node:*", "playwright", "playwright-core", "sharp", "@sparticuz/chromium"],
  logLevel: "silent",
});
const { renderDiagrams } = await import(`${built}/diagram-diagram-render.mjs`);
const { diagramPlan, withPrerenderedDiagrams } = await import(`${built}/diagram-diagrams.mjs`);
const { withVendorScripts } = await import(`${built}/diagram-vendor-scripts.mjs`);
const { closeDeckCardBrowser } = await import(`${built}/diagram-card-image.mjs`);
const { documentPolicy } = await import(`${built}/diagram-document-security.mjs`);

let failures = 0;
const ok = (label, pass, detail = "") => {
  console.log(`${pass ? "OK" : "NG"}  ${label}${pass || detail === "" ? "" : `: ${detail}`}`);
  if (!pass) failures += 1;
};

const stored = withVendorScripts(await readFile(`${root}/tests/checks/fixtures/internal/guide/diagrams.html`, "utf8"));
const mermaid = await readFile(`${root}/vendor/mermaid/mermaid.js`, "utf8");

console.log("--- 1. サーバーで描く ---");
const drawn = await renderDiagrams(stored);
await closeDeckCardBrowser();
assert.ok(drawn !== null, "見本の図を描けません");
ok("4 枚を明暗の 2 枚ずつ描く", drawn.light.length === 4 && drawn.dark.length === 4);
ok("明暗で絵が違う（色を値で渡している）", drawn.light.every((svg, i) => svg !== drawn.dark[i]));
ok("目印は端末で描く図と重ならない頭に付け替える", [...drawn.light, ...drawn.dark].every((svg) => /^<svg\b[^>]*\sid="sp-(?:light|dark)-\d+"/.test(svg) && !/mermaid-\d/.test(svg)));
const sequence = drawn.light.find((svg) => /aria-roledescription="sequence"/.test(svg)) ?? "";
ok("順序図の人は絵記号に差し替え済み（ページの実行部の後始末まで描く）", /class="actor-man/.test(sequence) && !/class="actor-man[^"]*"[^>]*>(?:(?!<\/g>)[\s\S])*<line/.test(sequence));
const plan = diagramPlan(stored);
const delivered = withPrerenderedDiagrams(stored, plan, drawn);
ok("配る本文に描いた図を置く", (delivered.match(/<pre class="mermaid" [^>]*data-sp-first-paint="diagram">/g) ?? []).length === 4);

/** 図が描き終わって差し替えも済んだ（サーバーの絵が残っていない）か。 */
const SETTLED = `() => [...document.querySelectorAll("pre.mermaid")].filter((pre) => !pre.closest("[data-sp-first-paint]")).every((pre) => pre.querySelector(":scope>svg")?.id.startsWith("mermaid-")) && !document.querySelector("pre[data-sp-first-paint], div[data-sp-first-paint]")`;
const STATE = `() => [...document.querySelectorAll("pre.mermaid")].map((pre) => { const svg = pre.querySelector(":scope>svg"); return { h: pre.getBoundingClientRect().height, w: svg ? Math.round(svg.getBoundingClientRect().width) : null, svgs: pre.querySelectorAll(":scope>svg").length, ticks: pre.querySelectorAll("g.tick").length, sticks: pre.querySelectorAll("g.actor-man line").length, attrs: [...pre.attributes].map((a) => a.name).filter((name) => name !== "data-surprise-mermaid").sort().join(",") }; })`;
const OBSERVE = `window.__shift = 0; new PerformanceObserver((list) => { for (const entry of list.getEntries()) if (!entry.hadRecentInput) window.__shift += entry.value; }).observe({ type: "layout-shift", buffered: true }); window.__csp = []; document.addEventListener("securitypolicyviolation", (event) => window.__csp.push(event.violatedDirective + " " + event.sample));`;

const browser = await chromium.launch();

/** 本文を開く。図の道具は `hold` ms 止めてから渡す（`null` なら渡さない）。 */
async function open(html, { width, height = 844, scheme, hold }) {
  const context = await browser.newContext({ viewport: { width, height }, colorScheme: scheme, deviceScaleFactor: 1 });
  await context.addInitScript(OBSERVE);
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route(() => true, async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/doc") return route.fulfill({ status: 200, headers: { "content-type": "text/html; charset=utf-8", "content-security-policy": documentPolicy(html) }, body: html });
    if (url.pathname.startsWith("/vendor/mermaid.js/")) {
      if (hold === null) return route.abort();
      await new Promise((resolve) => setTimeout(resolve, hold));
      return route.fulfill({ status: 200, contentType: "application/javascript", body: mermaid }).catch(() => undefined);
    }
    return route.abort();
  });
  await page.goto("https://diagrams.test/doc", { waitUntil: "commit" });
  return { context, page, errors };
}

const fcp = (page) => page.evaluate(() => new Promise((resolve) => {
  const seen = () => performance.getEntriesByType("paint").find((one) => one.name === "first-contentful-paint");
  const wait = () => (seen() ? resolve(Math.round(seen().startTime)) : setTimeout(wait, 10));
  wait();
}));

const HOLD = 1500;
for (const view of [{ label: "スマホの幅・明るい側", width: 390, scheme: "light" }, { label: "広い画面・暗い側", width: 1280, scheme: "dark" }]) {
  console.log(`\n--- 2〜5. ${view.label} ---`);
  const before = await open(stored, { ...view, hold: HOLD });
  const beforeFirst = await fcp(before.page);
  await before.page.waitForFunction(new Function(`return (${SETTLED})()`), null, { timeout: 30000 });
  await before.page.waitForTimeout(300);
  const beforeState = await before.page.evaluate(`(${STATE})()`);
  const beforeCsp = await before.page.evaluate(() => window.__csp);
  await before.context.close();

  const after = await open(delivered, { ...view, hold: HOLD });
  const afterFirst = await fcp(after.page);
  const early = await after.page.evaluate(() => [...document.querySelectorAll("pre.mermaid")].filter((pre) => !pre.closest("[data-sp-first-paint] pre")).map((pre) => [...pre.querySelectorAll(":scope>svg")].filter((svg) => getComputedStyle(svg).display !== "none").map((svg) => svg.getAttribute("data-sp-scheme"))));
  await after.page.waitForFunction(new Function(`return (${SETTLED})()`), null, { timeout: 30000 });
  await after.page.waitForTimeout(300);
  const afterState = await after.page.evaluate(`(${STATE})()`);
  const shift = await after.page.evaluate(() => window.__shift);
  ok(`直す前は図の道具を待って描く（最初の描画 ${beforeFirst}ms ≥ ${HOLD}ms）`, beforeFirst >= HOLD);
  ok(`直したあとは道具を待たない（最初の描画 ${afterFirst}ms < ${HOLD}ms）`, afterFirst < HOLD);
  ok("道具が届く前は、OS の明暗に合う 1 枚だけが見えている", early.every((shown) => shown.length === 1 && shown[0] === view.scheme), JSON.stringify(early));
  ok("道具が届いたあとの図は直す前と同じ（高さ・幅・目盛り・絵記号・属性）", JSON.stringify(afterState) === JSON.stringify(beforeState), `${JSON.stringify(beforeState)} / ${JSON.stringify(afterState)}`);
  ok("画面のずれは 0", shift === 0, String(shift));
  ok("例外が出ない", after.errors.length === 0, after.errors.join(" / "));
  const afterCsp = await after.page.evaluate(() => window.__csp);
  ok("実行制限に止められたものが直す前より増えない（読み込み役は許されている）", afterCsp.length <= beforeCsp.length && afterCsp.every((one) => beforeCsp.includes(one)), JSON.stringify({ beforeCsp, afterCsp }));
  await after.context.close();
}

console.log("\n--- 6. 高さが違う図は、画面の外へ出てから差し替える ---");
// サーバーの書体が違って状態遷移図（3 枚目）が 47px 低く描けた、を作る（属性は最初のものが効く）
const shorter = { ...drawn, light: drawn.light.map((svg, i) => (i === 2 ? svg.replace(/^<svg\b/, '<svg style="height:140px"') : svg)) };
const odd = withPrerenderedDiagrams(stored, plan, shorter);
const tall = await open(`${odd.replace("</body>", '<div style="height:3000px"></div></body>')}`, { width: 390, height: 1400, scheme: "light", hold: 200 });
await tall.page.waitForFunction(() => document.querySelectorAll("pre[data-sp-first-paint]").length === 1 && !document.querySelector("pre:not([data-sp-first-paint]) > div[data-sp-first-paint]"), null, { timeout: 30000 });
await tall.page.waitForTimeout(300);
const held = await tall.page.evaluate(() => ({ id: document.querySelector("pre[data-sp-first-paint] > svg")?.id, shift: window.__shift }));
ok("見えている間はサーバーの絵のまま（ずれ 0）", held.id === "sp-light-2" && held.shift === 0, JSON.stringify(held));
await tall.page.evaluate(() => scrollTo(0, 2500));
await tall.page.waitForFunction(() => !document.querySelector("pre[data-sp-first-paint]"), null, { timeout: 10000 });
const moved = await tall.page.evaluate(() => {
  const marker = document.elementFromPoint(10, 10);
  return { marker: marker?.outerHTML.slice(0, 40), y: scrollY };
});
await tall.page.evaluate(() => scrollTo(0, 0));
await tall.page.waitForTimeout(100);
const swapped = await tall.page.evaluate(() => ({ id: document.querySelectorAll("pre.mermaid")[2].querySelector(":scope>svg")?.id ?? "", h: document.querySelectorAll("pre.mermaid")[2].getBoundingClientRect().height, shift: window.__shift }));
ok("画面の外へ出たら端末の絵に差し替わる", swapped.id.startsWith("mermaid-") && swapped.h > 150, JSON.stringify({ ...swapped, moved }));
ok("差し替えてもずれ 0（画面の外で入れ替わる）", swapped.shift === 0, String(swapped.shift));
await tall.context.close();

console.log("\n--- 7. 道具が届かなければサーバーの絵のまま ---");
const lost = await open(delivered, { width: 390, scheme: "light", hold: null });
await lost.page.waitForLoadState("load");
await lost.page.waitForTimeout(300);
const kept = await lost.page.evaluate(() => ({ shown: [...document.querySelectorAll("pre[data-sp-first-paint] > svg")].filter((svg) => getComputedStyle(svg).display !== "none").length, twins: document.querySelectorAll("pre[data-sp-first-paint] pre").length, shift: window.__shift }));
ok("4 枚が見えたまま・写しは残さない・ずれ 0", kept.shown === 4 && kept.twins === 0 && kept.shift === 0, JSON.stringify(kept));
await lost.context.close();

await browser.close();
console.log(`\n${failures === 0 ? "すべて合格" : `${failures} 件 不合格`}`);
process.exit(failures === 0 ? 0 : 1);
