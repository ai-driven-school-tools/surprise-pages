import { readFile } from "node:fs/promises";
import path from "node:path";

import { discardBrowser, openPage, RenderTimeout, withSlot, withTimeout } from "../deck/card/card-image";
import { diagramPlan, quarantineSvgIds, renderFits, type DiagramPlan, type DiagramRender } from "./diagrams";
import { logEvent } from "../logging/server-log";

/**
 * 図（Mermaid）のページの図を、**本物のブラウザで、ページ自身の実行部のまま**描いて SVG にする（配る側は src/lib/first-paint/diagrams.ts）。
 * 呼ぶのは図を描く API（src/app/api/pages/diagrams）だけ——Chromium を本文の入口（/internal・/public）の関数に同梱しない。
 *
 * - ブラウザは共有カードの絵（src/lib/deck/card/card-image.ts）と同じもの・同じ枠（同時に 2 つ）を使う
 * - 文書はネットワークへ出さず、渡された本文で応える。通すのは図の道具と見た目の道具（vendor）だけで、手元のファイルから応える。
 *   ほかは全部断る（素材・道具箱・外の宛先へは 1 本も出ない。WebSocket と WebRTC も止める）
 * - 描くのは**ページの実行部そのもの**（色・字・絵記号・目盛りの手当てまで）。描き終わり（`mermaid.run` とその後始末）を待ってから、
 *   図ごとの `<pre>` の中身を取る
 * - 明暗の 2 回描く（実行部は色を値にして渡すので、明暗で絵が違う）。幅は 390px（スマホ）——器の幅で組み直す日程だけ幅が変わり、
 *   スマホの器に合わせた幅は広い画面でもはみ出さない。高さは幅で変わらない
 * - 失敗しても投げない（null）。配る側は今までどおり配る
 */

const VIEWPORT = { width: 390, height: 844 };
/** 1 回（明暗の片方）に使ってよい時間。ページの実行部が `run` を呼び、後始末を終えるまで。 */
const SCHEME_BUDGET_MS = 15_000;
/** 全体の上限。API の `maxDuration`（60 秒）より十分に短くする。 */
const TOTAL_BUDGET_MS = 40_000;

/** 文書の宛先（ネットワークへは出ない・`route` で応える）。 */
const DOCUMENT_URL = "https://diagrams.invalid/";

/** 描くときに手元のファイルから応える道具（印つきの行き先・src/app/vendor の受け口と同じ置き場）。 */
const VENDOR_PATH = /^\/vendor\/(mermaid\.js|tailwind\.js)\/[0-9a-z]+$/;

/** 本文から WebRTC を作れないよう、頁の側で部品を消す（route の判定の外の通り道）。 */
const NO_WEBRTC = `for (const name of ["RTCPeerConnection", "webkitRTCPeerConnection", "RTCDataChannel", "RTCIceCandidate", "RTCSessionDescription"]) { try { delete globalThis[name]; } catch {} try { Object.defineProperty(globalThis, name, { value: undefined, configurable: false, writable: false }); } catch {} }`;

const vendorSources = new Map<string, Promise<string>>();
function vendorSource(name: string): Promise<string> {
  let held = vendorSources.get(name);
  if (held === undefined) {
    // 道筋は字面で書く（組み立ての同梱が辿れるように・next.config.ts の outputFileTracingIncludes）
    held = name === "mermaid.js"
      ? readFile(path.join(process.cwd(), "vendor", "mermaid", "mermaid.js"), "utf8")
      : readFile(path.join(process.cwd(), "vendor", "tailwindcss", "tailwind.js"), "utf8");
    held.catch(() => vendorSources.delete(name));
    vendorSources.set(name, held);
  }
  return held;
}

/**
 * ページの仕掛けより先に入れる見張り。図の道具が `window.mermaid` に置かれた瞬間に `run` を包み、
 * 走り終えて後始末（同じ流れの続き）が済んだら `__spDiagramsDone` を立てる。元の文は `DOMContentLoaded` で控える
 * （document で受けるので、window で受けるページの実行部より先）。
 */
const WATCH = `(() => {
  let held;
  document.addEventListener("DOMContentLoaded", () => { window.__spDiagramTexts = Array.from(document.querySelectorAll("pre.mermaid"), (pre) => pre.textContent); }, { once: true });
  Object.defineProperty(globalThis, "mermaid", { configurable: true, get() { return held; }, set(value) {
    if (value && typeof value.run === "function" && !value.__spWatched) {
      const run = value.run;
      value.run = function (...args) {
        const promise = run.apply(this, args);
        const settle = () => new Promise((resolve) => setTimeout(() => resolve(true), 0));
        window.__spDiagramsDone = promise.then(settle, settle);
        return promise;
      };
      value.__spWatched = true;
    }
    held = value;
  } });
})()`;

/** 描き終わりを待って、元の文と描いた中身を取る（文字の式で渡す。関数を渡すと組み立ての道具が書き換えることがある）。 */
const COLLECT = `async (budget) => {
  const deadline = performance.now() + budget;
  while (!window.__spDiagramsDone && performance.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 50));
  if (!window.__spDiagramsDone) return null;
  const done = await Promise.race([window.__spDiagramsDone, new Promise((resolve) => setTimeout(() => resolve(false), Math.max(0, deadline - performance.now())))]);
  if (!done) return null;
  return { texts: window.__spDiagramTexts ?? [], svgs: Array.from(document.querySelectorAll("pre.mermaid"), (pre) => pre.innerHTML) };
}`;

type Collected = { texts: string[]; svgs: string[] } | null;

async function renderScheme(html: string, plan: DiagramPlan, scheme: "light" | "dark"): Promise<string[] | null> {
  const { context, page } = await openPage({
    viewport: VIEWPORT,
    deviceScaleFactor: 1,
    colorScheme: scheme,
    reducedMotion: "reduce",
    serviceWorkers: "block",
  });
  try {
    page.setDefaultTimeout(SCHEME_BUDGET_MS);
    await context.addInitScript(NO_WEBRTC);
    await context.addInitScript(WATCH);
    // WebSocket は 1 本も通さない（描くのに要らない・route の判定の外なので別に断る）
    await context.routeWebSocket(() => true, (socket) => socket.close());
    // 全部の要求をここで見る（glob の字面は検査表の注釈落としに当たるので、関数で受ける）。
    // 文脈ごとに掛けて、iframe・別窓・部品（worker）の要求も同じ判定に通す
    await context.route(() => true, async (route) => {
      const req = route.request();
      const url = new URL(req.url());
      if (req.isNavigationRequest() && req.frame() === page.mainFrame() && url.href === DOCUMENT_URL) {
        return route.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: html });
      }
      const vendor = url.origin === new URL(DOCUMENT_URL).origin && req.method() === "GET" ? VENDOR_PATH.exec(url.pathname) : null;
      if (vendor !== null) {
        try {
          return await route.fulfill({ status: 200, contentType: "application/javascript; charset=utf-8", body: await vendorSource(vendor[1]) });
        } catch {
          return route.abort();
        }
      }
      return route.abort();
    });
    await page.goto(DOCUMENT_URL, { waitUntil: "domcontentloaded" });
    const collected = await page.evaluate<Collected>(`(${COLLECT})(${SCHEME_BUDGET_MS})`);
    if (collected === null || collected.svgs.length !== plan.diagrams.length) return null;
    // 描いたのがこの本文の図であること（並びと元の文）。違えば当てない
    if (plan.diagrams.some((one, i) => collected.texts[i] !== one.text)) return null;
    const svgs: string[] = [];
    for (const [i, svg] of collected.svgs.entries()) {
      const quarantined = quarantineSvgIds(svg.trim(), `sp-${scheme}-${i}`);
      if (quarantined === null) return null;
      svgs.push(quarantined);
    }
    return svgs;
  } finally {
    await withTimeout(context.close(), 5_000, "close").catch(() => {});
  }
}

async function render(html: string, plan: DiagramPlan): Promise<DiagramRender | null> {
  const started = Date.now();
  const light = await renderScheme(html, plan, "light");
  if (light === null) return null;
  const dark = await renderScheme(html, plan, "dark");
  if (dark === null) return null;
  const drawn = { sources: plan.diagrams.map((one) => one.inner), light, dark };
  if (!renderFits(plan, drawn)) return null;
  logEvent({ level: "info", event: "diagram.rendered", durationMs: Date.now() - started, fields: { count: plan.diagrams.length } });
  return drawn;
}

/**
 * 本文の図を明暗の 2 枚ずつ描く。描けなければ null。`html` は配る直前の本文（vendor の付け替えのあと・src/lib/first-paint/diagram-prerender.ts が渡す）。
 * 全体を `TOTAL_BUDGET_MS` で区切り、時間切れのときはブラウザを捨てる（共有カードの絵と同じ）。
 */
export async function renderDiagrams(html: string): Promise<DiagramRender | null> {
  const plan = diagramPlan(html);
  if (plan === null) return null;
  try {
    return await withSlot(() => withTimeout(render(html, plan), TOTAL_BUDGET_MS, "diagrams"));
  } catch (error) {
    if (error instanceof RenderTimeout) await discardBrowser();
    logEvent({ level: "warn", event: "diagram.render-failed", error });
    return null;
  }
}
