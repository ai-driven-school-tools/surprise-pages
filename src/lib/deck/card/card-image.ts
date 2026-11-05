import { copyFile, mkdir, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import type { Browser, BrowserContext, BrowserContextOptions, Page } from "playwright";

import { DECK_CARD_SIZE } from "./card";
import { DECK_EXIT, DECK_SLIDE, DECK_SLIDES, DECK_TOOLBAR } from "../deck";
import { deckSourcePreview } from "../../pages/preview";
import { logEvent } from "../../logging/server-log";

/**
 * スライドの 1 枚を、**本物のブラウザで描いて**絵（PNG）にする。
 *
 * ## なぜブラウザか
 *
 * 枚は Tailwind の class・Lucide の印・Mermaid の図・ECharts のグラフ・書体で組まれていて、
 * 見出しカードの道具（next/og）には描けない。「開いたときと同じ見た目」で出すには、
 * 読む人のブラウザと同じものに描かせるほかない。Vercel の上では Lambda 向けに固めた
 * Chromium（@sparticuz/chromium）を、手元では Playwright が持つ Chromium を起こす。
 *
 * ## 描き方は「読む表示」をそのまま使う
 *
 * 本文に実行部（src/templates/deck.html）が貼ってあるので、配信と同じ差し込み
 * （`<base>`・vendor の付け替え・id の付け替え＝`deckSourcePreview`）をして開き、
 * 器の幅だけを 1280px に固定する。実行部は器の幅から倍率を出すので（`--deck-k`）、
 * 倍率が 1 になり、枚が 1280×720 のまま描かれる。**発表の表示にはしない**——
 * 発表は段階（焦点）をたどるので 1 段目しか出ない。読む表示は全部の情報を持つ。
 *
 * 文書の URL はそのページの公開の宛先（`/public/…/`）にする。素材（`shot.png`）が
 * `<base>` から公開の棚へ解け、ブラウザが名乗り無しで取れる。文書そのものはネットワークへ
 * 出さず、保管庫から読んだ本文で応える（`page.route`）——配信網に載った古い版を描かない。
 *
 * ## 待ち方
 *
 * 書体（`document.fonts.ready`）、新しい実行部の描画完了（`deckRenderer.whenDrawn`・
 * `data-deck-loading`）、Mermaid の `data-processed`、その枚の画像の読み込みがそろうまで
 * 待つ。予算（`RENDER_BUDGET_MS`）を使い切ったら、そのとき描けているもので撮る——
 * 絵が無いより、図が 1 つ欠けた絵のほうが「何の資料か」は伝わる。
 *
 * ## 失敗しても投げない
 *
 * ブラウザが起きない・時間切れ・本文が壊れている、のどれでも null を返し、入口は
 * 今までどおりの文字のカードへ落ちる。理由はログにだけ残す。
 */

/** 描画に使ってよい時間。Slack や X の取り込み役が待つ間に収める。 */
export const RENDER_BUDGET_MS = 12_000;

/**
 * 止められたブラウザは、死んだと名乗らずに**黙る**ことがある（応答のあと関数が止められ、再開したときに
 * 子プロセスだけが戻らない）。Playwright の待ちは頁に対してしか効かず、文脈を開く呼び出しは永遠に待つので、
 * 開くのに使ってよい時間と、1 枚ぶん全体に使ってよい時間を自分で区切る。超えたらブラウザを捨てて起こし直す。
 * 全体の上限は入口の `maxDuration`（60 秒）より十分に短くし、時間切れの応答ではなく文字のカードが返るようにする。
 */
const OPEN_TIMEOUT_MS = 5_000;
export const TOTAL_BUDGET_MS = 30_000;

export class RenderTimeout extends Error {
  constructor(label: string) {
    super(`deck card ${label} timed out`);
    this.name = "RenderTimeout";
  }
}

export function withTimeout<T>(task: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new RenderTimeout(label)), ms);
  });
  return Promise.race([task, deadline]).finally(() => clearTimeout(timer));
}

/** いま起こしてあるブラウザを捨てる。次の要求が起こし直す。閉じるのを待ちすぎない。 */
export async function discardBrowser(): Promise<void> {
  const held = browserPromise;
  browserPromise = null;
  if (held === null) return;
  await withTimeout(held.then((browser) => browser.close()), OPEN_TIMEOUT_MS, "close").catch(() => {});
}

/**
 * 同時に描く枚数の上限。1 つの関数に同時に来ても、ブラウザを溢れさせない。
 * 図の下描き（src/lib/first-paint/diagram-render.ts）も同じブラウザ・同じ枠・同じ時間の区切りを使う（ここから書き出す）。
 */
const MAX_CONCURRENT = 2;

/**
 * 組み立てのときに写した道具の置き場（scripts/build/deck-card.mjs）。
 *
 * node_modules の中を直に関数の包みへ入れると、pnpm の繋ぎ（symlink）越しのファイルになり
 * Vercel が包みを断る。写したものはふつうのファイル。
 */
export const DECK_CARD_RUNTIME_DIR = ".deck-card-runtime";

/**
 * 枚だけを 1280×720 で撮るための指定。本文の見た目には触れない。
 *
 *   ・器（main）を 1280px に固定して倍率を 1 にする
 *   ・操作の列（プレゼンを始める・一覧）と終える釦は、枚の上に被さるので出さない
 *   ・ページの余白を 0 にする（器の幅に効くのは body の余白）
 */
const SNAPSHOT_STYLE = `<style data-sp-deck-card>
html, body[data-deck] { margin: 0 !important; padding: 0 !important; max-width: none !important; min-width: 0 !important; }
body[data-deck] main[${DECK_SLIDES}] { width: ${DECK_CARD_SIZE.width}px !important; max-width: ${DECK_CARD_SIZE.width}px !important; margin: 0 !important; padding: 0 !important; }
[${DECK_TOOLBAR}], [${DECK_EXIT}] { display: none !important; }
</style>`;

/** 配信と同じ差し込みをして、撮るための指定を `</head>` の手前に足す。 */
export function snapshotDocument(html: string, pageHref: string): string {
  const prepared = deckSourcePreview(html, pageHref);
  const close = /<\/head\s*>/i.exec(prepared);
  if (close === null) return `${SNAPSHOT_STYLE}${prepared}`;
  return `${prepared.slice(0, close.index)}${SNAPSHOT_STYLE}${prepared.slice(close.index)}`;
}

export type DeckCardRequest = {
  /** 発表者のメモを取り除いた本文（呼ぶ側が `withoutDeckNotes` を通す） */
  html: string;
  /** そのページの公開の宛先（`https://…/public/decks/x`。末尾のスラッシュ無し） */
  pageHref: string;
  /** 1 から数えた枚。枚数を超えていれば最後の枚 */
  slide: number;
};

function onVercel(): boolean {
  return Boolean(process.env.VERCEL_REGION || process.env.VERCEL_DEPLOYMENT_ID);
}

function runtimeDir(): string {
  return path.join(process.cwd(), DECK_CARD_RUNTIME_DIR);
}

/**
 * 日本語の書体を Chromium の書体の置き場へ写す。
 *
 * Lambda 向けの Chromium には欧文の書体しか無く、そのままでは日本語が「□」で出る。
 * fontconfig は `/tmp/fonts` の下を見る決まり（@sparticuz/chromium の fonts.conf）なので、
 * 組み立てのときに用意した TTF（Noto Sans JP・Noto Serif JP）をそこへ置く。
 * **Chromium の展開のあとに写す**——先に置くと展開が「もうある」と飛ばされ、fonts.conf が無くなる。
 */
async function installFonts(): Promise<void> {
  const from = path.join(runtimeDir(), "fonts");
  const to = path.join(tmpdir(), "fonts", "deck-card");
  await mkdir(to, { recursive: true });
  for (const name of await readdir(from)) {
    if (!name.endsWith(".ttf")) continue;
    await copyFile(path.join(from, name), path.join(to, name));
  }
}

async function launch(): Promise<Browser> {
  if (!onVercel()) {
    const { chromium } = await import("playwright");
    return chromium.launch({ headless: true });
  }

  // Vercel では固めた Chromium の側を**先に**読む——読み込みの時点で HOME・書体・共有ライブラリの
  // 置き場を環境に立てる。Playwright は読み込みの時点で置き場を計算するので、順を逆にすると拾えない
  const sparticuz = (await import("@sparticuz/chromium")).default;
  const { chromium } = await import("playwright");
  const executablePath = await sparticuz.executablePath(path.join(runtimeDir(), "bin"));
  await installFonts();
  return chromium.launch({ executablePath, args: sparticuz.args, headless: true });
}

let browserPromise: Promise<Browser> | null = null;

/** 起こしたブラウザは関数が生きている間使い回す。落ちたら次に起こし直す。 */
function browserInstance(): Promise<Browser> {
  if (browserPromise === null) {
    browserPromise = launch().then(
      (browser) => {
        browser.on("disconnected", () => {
          browserPromise = null;
        });
        return browser;
      },
      (error: unknown) => {
        browserPromise = null;
        throw error;
      },
    );
  }
  return browserPromise;
}

let running = 0;
const waiting: (() => void)[] = [];

export async function withSlot<T>(task: () => Promise<T>): Promise<T> {
  if (running >= MAX_CONCURRENT) await new Promise<void>((resolve) => waiting.push(resolve));
  running += 1;
  try {
    return await task();
  } finally {
    running -= 1;
    waiting.shift()?.();
  }
}

type Settled =
  | { ok: true; index: number; left: number; top: number; width: number; height: number; complete: boolean }
  | { ok: false };

/**
 * ページの中で走らせる待ち。描けたら枚の位置と大きさを返す。
 *
 * 文字列で渡す（関数を渡すと組み立ての道具が書き換えることがある）。
 */
const SETTLE = `async ({ selector, index, budget }) => {
  const deadline = performance.now() + budget;
  const left = () => Math.max(0, deadline - performance.now());
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const frame = () => new Promise((resolve) => requestAnimationFrame(() => resolve()));
  const until = async (ready) => { while (!ready() && left() > 0) await sleep(50); return ready(); };
  const within = (promise) => Promise.race([promise, sleep(left())]);
  const slides = document.querySelectorAll(selector);
  if (slides.length === 0) return { ok: false };
  const at = Math.min(Math.max(0, index), slides.length - 1);
  const slide = slides[at];
  slide.scrollIntoView({ block: "start" });
  await frame(); await frame();
  const steps = [];
  if (document.fonts) await within(document.fonts.ready.catch(() => {}));
  const renderer = document.deckRenderer;
  if (renderer && typeof renderer.whenDrawn === "function") { try { await within(renderer.whenDrawn(slide)); } catch {} }
  steps.push(await until(() => !document.documentElement.hasAttribute("data-deck-loading")));
  steps.push(await until(() => Array.from(slide.querySelectorAll(".mermaid")).every((el) => el.hasAttribute("data-processed"))));
  steps.push(await until(() => Array.from(slide.querySelectorAll("img")).every((img) => img.complete)));
  steps.push(await until(() => !document.fonts || document.fonts.status === "loaded"));
  await frame(); await frame();
  const rect = slide.getBoundingClientRect();
  return { ok: true, index: at, left: rect.left, top: rect.top, width: rect.width, height: rect.height, complete: steps.every(Boolean) };
}`;

/**
 * 使い回しているブラウザで新しい文脈と頁を開く。死んでいたら起こし直して 1 度だけやり直す。
 *
 * Vercel は応答を返したあと、動いている関数を止めることがあり、そのときブラウザの子プロセスも
 * 道連れになる（次の要求で「Browser has been closed」・2026-10-08 のお試し公開）。切れたことを
 * 知らせる合図が届く前に次の要求が来るので、合図を待たずにここで確かめる。
 */
export async function openPage(options: BrowserContextOptions): Promise<{ context: BrowserContext; page: Page }> {
  for (let attempt = 0; ; attempt += 1) {
    const browser = await browserInstance();
    try {
      if (!browser.isConnected()) throw new Error("browser disconnected");
      // 黙ったブラウザは開く呼び出しが返ってこないので、時間で区切って死んだと見なす
      const context = await withTimeout(browser.newContext(options), OPEN_TIMEOUT_MS, "context");
      try {
        return { context, page: await withTimeout(context.newPage(), OPEN_TIMEOUT_MS, "page") };
      } catch (error) {
        await withTimeout(context.close(), OPEN_TIMEOUT_MS, "close").catch(() => {});
        throw error;
      }
    } catch (error) {
      await discardBrowser();
      if (attempt >= 1) throw error;
      logEvent({ level: "info", event: "deck-card.browser-relaunched" });
    }
  }
}

async function render(request: DeckCardRequest): Promise<Uint8Array | null> {
  const started = Date.now();
  const origin = new URL(request.pageHref).origin;
  const documentUrl = `${request.pageHref}/`;
  const body = snapshotDocument(request.html, request.pageHref);

  const { context, page } = await openPage({
    // 縦は枚より十分に高く取る。最後の枚は下に続きが無く、上端まで送れないことがある
    viewport: { width: DECK_CARD_SIZE.width, height: DECK_CARD_SIZE.height * 2 },
    deviceScaleFactor: 1,
    colorScheme: "light",
    reducedMotion: "reduce",
    serviceWorkers: "block",
  });
  try {
    page.setDefaultTimeout(RENDER_BUDGET_MS);

    // 全部の要求をここで見る（glob の字面は検査表の注釈落としに当たるので、関数で受ける）
    await page.route(() => true, (route) => {
      const req = route.request();
      const url = new URL(req.url());
      // 文書そのものは保管庫の本文で応える。配信網へは出ない
      if (req.isNavigationRequest() && req.frame() === page.mainFrame()) {
        if (url.href === documentUrl) {
          return route.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body });
        }
        return route.abort();
      }
      // 素材・道具・書体。自分の宛先と https だけ通す（手元の http は自分の宛先だけ）
      if (url.origin === origin || url.protocol === "https:") return route.continue();
      return route.abort();
    });

    await page.goto(`${documentUrl}#${request.slide}`, { waitUntil: "domcontentloaded" });
    // 文字の式として渡し、その場で呼ぶ（関数を渡すと組み立ての道具が書き換えることがある）
    const settleArgs = JSON.stringify({
      selector: `section[${DECK_SLIDE}]`,
      index: request.slide - 1,
      budget: Math.max(1_000, RENDER_BUDGET_MS - (Date.now() - started)),
    });
    const settled = await page.evaluate<Settled>(`(${SETTLE})(${settleArgs})`);
    if (!settled.ok) return null;

    const { width, height } = DECK_CARD_SIZE;
    const exact = Math.abs(settled.width - width) < 1 && Math.abs(settled.height - height) < 1;
    let png: Uint8Array;
    if (exact) {
      // 倍率 1 で描けている。枚の位置から構図の寸法ぴったりに切る（要素の箱で切ると、位置の端数で 1px 余る）
      png = await page.screenshot({
        type: "png",
        animations: "disabled",
        caret: "hide",
        clip: { x: Math.round(settled.left), y: Math.round(settled.top), width, height },
      });
    } else {
      // 倍率が 1 にならなかったとき（器の幅を自分で決める古い本文）だけ、要素の箱で撮って構図の寸法へそろえる
      const target = page.locator(`section[${DECK_SLIDE}]`).nth(settled.index);
      const box = await target.screenshot({ type: "png", animations: "disabled", caret: "hide" });
      const { default: sharp } = await import("sharp");
      png = new Uint8Array(await sharp(box).resize(width, height, { fit: "fill" }).png().toBuffer());
    }
    logEvent({
      level: "info",
      event: "deck-card.rendered",
      durationMs: Date.now() - started,
      fields: { result: settled.complete ? "complete" : "partial" },
    });
    return png;
  } finally {
    await withTimeout(context.close(), OPEN_TIMEOUT_MS, "close").catch(() => {});
  }
}

/** 起こしてあるブラウザを閉じる。検査が終わるときに呼ぶ（本番では関数ごと消えるので呼ばない）。 */
export async function closeDeckCardBrowser(): Promise<void> {
  await discardBrowser();
}

/**
 * 枚を絵にする。描けなければ null（入口は文字のカードへ落ちる）。
 *
 * 1 枚ぶん全体を `TOTAL_BUDGET_MS` で区切る。黙ったブラウザに付き合って入口の時間切れ
 * （60 秒・時間切れの応答）まで待たず、文字のカードで返す。時間切れのときはブラウザを捨てる。
 */
export async function renderDeckSlideImage(request: DeckCardRequest): Promise<Uint8Array | null> {
  try {
    return await withSlot(() => withTimeout(render(request), TOTAL_BUDGET_MS, "render"));
  } catch (error) {
    if (error instanceof RenderTimeout) await discardBrowser();
    logEvent({ level: "warn", event: "deck-card.render-failed", error });
    return null;
  }
}
