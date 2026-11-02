/**
 * Pages の体感速度を、人が毎日する場面ごとに本物のブラウザで測る（手引きは docs/design/app-speed.md）。
 *
 *   node tests/checks/browser/app-speed.mjs             測って、合格ライン（BUDGET）と比べる（外れたら終了コード 1）
 *   node tests/checks/browser/app-speed.mjs --measure   測るだけ
 *
 * 一覧の画面の検査（tests/workspace-performance）は保存先が同じ機械にあるので、問い合わせの往復が 0 に近い。
 * 本番は 1 回の問い合わせごとに保存先まで往復する（配布版は東京の関数からシンガポールの Neon まで 1 往復約 70ms）。
 * 往復の数が増えた変更は手元では速く見えて本番だけ遅くなる（2026-10-08: 手元 0.1 秒・本番 2.7〜3.8 秒）。
 * だからここでは、個人版（設置した本人 1 人のサイト）として起こし、往復ごとに本番と同じだけ待たせて測る:
 *
 *   保存先   … 手元の PostgreSQL の前に中継を置き、行き帰りの通信を DB_RTT_MS の半分ずつ遅らせる
 *   データ   … 生きている資料 ALIVE・見る人を絞った資料 RESTRICTED を、架空の題と本文で積む。1 人のサイトとしては多めにして、
 *              資料の数に比例して遅くなる変更を捕まえる。資料は本人が作り、絞った資料の名簿とコメントは招いた人
 *
 * 測る場面（各 ROUNDS 回。時刻は押した瞬間・開き始めた瞬間からの ms）:
 *   home-open        ホームを新しいタブで開く（ブラウザの控えは空。部品の取り寄せも含む）
 *   home-reopen      もう 1 度ホームを新しいタブで開く（部品はブラウザの控えにある）
 *   library-open     本人の資料（「owner の資料」）を新しいタブで開く
 *   to-library       ホームからサイドバーで本人の資料へ
 *   to-home          本人の資料からサイドバーでホームへ
 *   open-document    ホームの「最近開いたもの」から記事を開く（本文が描かれる・道具箱が出る）
 *   back-home        記事からブラウザの「戻る」でホームへ
 *   open-deck        ホームの「最近開いたもの」からスライドを開く（最初の 1 枚が描かれる）
 *   open-gallery     画像が GALLERY_IMAGES 枚ある資料を新しいタブで開く（全部の画像が描かれるまで。画像は 1 枚ずつ
 *                    配信の入口で見てよいかを確かめるので、問い合わせの本数が画像の枚数に比例しうる）
 *
 * 結果は PAGES_SPEED_EVIDENCE_DIR（既定は一時フォルダ）の speed.json と、標準出力の表。
 * 組み立て済みのアプリ（node tests/support/test-app-build.mjs <出力先>）を PAGES_TEST_BUILD で渡すと組み立てを省く。
 */
import { readFileSync } from "node:fs";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { createServer, connect } from "node:net";
import { createServer as createHttpServer, request as httpRequest } from "node:http";
import { constants as zlibConstants, createBrotliCompress, createGzip } from "node:zlib";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { build } from "esbuild";
import postgres from "postgres";
import sharp from "sharp";
import { chromium } from "playwright";
import { initializeDatabase } from "../../../scripts/setup/database.mjs";
import { appEnvironment } from "../../support/environment.mjs";
import { childProcesses, disposableDatabase, freeLocalPort, sessionToken, startDisposableApp, stopProcessesInside } from "../../support/disposable-app.mjs";
import { buildTestApp, prepareTestApp, restoreTestBuild } from "../../support/test-app-build.mjs";
import { put as putTestAsset } from "../../support/blob-store.mjs";
import { GUARD, PHONE_GUARD, PHONE_TARGET, TARGET as DESKTOP_TARGET, SCENES as DESKTOP_SCENES, formatMetric, summarize, judge, judgeRatio } from "./app-speed-budget.mjs";

const argument = (name, fallback) => {
  const index = process.argv.indexOf(name);
  return index === -1 ? fallback : Number(process.argv[index + 1]);
};
/**
 * 保存先との通信の 1 往復（中継が行き帰りに半分ずつ足す）。既定の 30ms は、控え（app-speed-baseline.json）を取ったときの条件
 * （HTTP の受け口経由の保存先で 1 回の問い合わせ約 60ms）に合わせたもの。配布版の本番（関数は東京・Neon はシンガポール）は
 * 1 往復約 70ms なので `--db-rtt 70 --db-workers 0` で見積もる（docs/design/app-speed.md の「測り方」）。
 */
const DB_RTT_MS = argument("--db-rtt", 30);
/**
 * 保存先の混み合い（`--db-workers 2 --db-cost 30`）。HTTP の受け口経由の保存先は、1 本ずつなら 30ms 前後だが、
 * 同時に 10 本以上を投げると 1 本ずつが 170〜300ms に伸びた（2026-10-08 の記録・docs/design/app-speed.md の
 * 「本番で分かったこと」）。手元の PostgreSQL は同時に投げても伸びないので、そのままでは「同時に投げれば速い」と誤って出る。
 * そこで、送った文を「受け口の働き手（workers 人）が 1 本 cost ms ずつ順に片付ける」列に並べてから渡す。
 * `--db-workers 0` で並べない（保存先へ直接つなぐ配布版の形）。
 */
const DB_WORKERS = argument("--db-workers", 2);
/** 資料を開いてから「戻る」を押すまでに読む時間（ms）。読み込みが落ち着いたあとから数える。 */
const READ_MS = argument("--read", 1000);
const DB_COST_MS = argument("--db-cost", 30);
const ROUNDS = argument("--rounds", 5);
/**
 * リンクにマウスを乗せてから押すまでの間（ms）。人がリンクを押すときは、カーソルを運んで止め、少しとどまってから押す。
 * その間に先読みが働くので、0 で押す自動操作では人の体感と違う数字になる。0.3 秒はマウスで押す人のふつうの間合いの
 * 短めの側（docs/design/app-speed.md の「測り方」）。`--dwell 0` で、触れずにいきなり押した場合（キーボードの Enter など）も測れる。
 */
/**
 * `--phone` … スマホの条件で測る。幅 390px・指で押す（とどまらない）・回線は 4G 相当（下り 9Mbps・往復 165ms）・処理は 4 倍遅い
 * （docs/design/page-loading.md の計測と同じ条件）。サイドバーは畳まれているので、画面の中の切り替えは測らない。
 */
const PHONE = process.argv.includes("--phone");
const DWELL_MS = argument("--dwell", PHONE ? 0 : 300);
const measureOnly = process.argv.includes("--measure");
/**
 * 比べる線。既定は CI の歯止め（GUARD）。`--target` で目標（爆速・TARGET）と比べる
 * （直接つなぐ形の速さを確かめるとき: `--db-rtt 5 --target`）。
 */
const TARGET = process.argv.includes("--phone") ? PHONE_TARGET : DESKTOP_TARGET;
const BUDGET = process.argv.includes("--target") ? TARGET : process.argv.includes("--phone") ? PHONE_GUARD : GUARD;
/**
 * 比例の線（控えの 1.5 倍かつ +150ms）。控えは CI の台で測ったパソコンの条件の数なので、CI と同じ既定の条件
 * （パソコン・CI の歯止めと比べる・とどまる 300ms・保存先 30ms）のときだけ比べる。取り直しは tests/support/app-speed-baseline.mjs
 */
const BASELINE = JSON.parse(readFileSync(new URL("./app-speed-baseline.json", import.meta.url), "utf8"));
const COMPARE_RATIO = BUDGET === GUARD && DWELL_MS === 300 && DB_RTT_MS === BASELINE.dbRttMs && DB_WORKERS === BASELINE.dbWorkers && DB_COST_MS === BASELINE.dbCostMs;
const judgeAll = (summary) => [...judge(summary, BUDGET), ...(COMPARE_RATIO ? judgeRatio(summary, BASELINE.medians) : [])];
const SCENES = process.argv.includes("--phone") ? DESKTOP_SCENES.filter((scene) => PHONE_TARGET[scene]) : DESKTOP_SCENES;
/** `--trace /,/library` … 測らずに、その道筋を 1 回ずつ開いて保存先へ送った文を時刻順に出す。 */
const traceIndex = process.argv.indexOf("--trace");
const traceRoutes = traceIndex === -1 ? null : process.argv[traceIndex + 1].split(",");

const root = fileURLToPath(new URL("../../../", import.meta.url));
const temp = await mkdtemp(path.join(tmpdir(), "pages-app-speed-"));
const evidence = process.env.PAGES_SPEED_EVIDENCE_DIR ? path.resolve(root, process.env.PAGES_SPEED_EVIDENCE_DIR) : await mkdtemp(path.join(tmpdir(), "app-speed-evidence-"));
await mkdir(evidence, { recursive: true });
/** 組み立て済みのアプリの置き場（`--app <フォルダ>`）。中に組み立てが無ければ、そこへ組み立てて次から使い回す（手元で直しを比べるとき用）。 */
const appIndex = process.argv.indexOf("--app");
const app = appIndex === -1 ? path.join(temp, "app") : path.resolve(process.argv[appIndex + 1]);
const port = Number(process.env.PAGES_SPEED_TEST_PORT ?? 3143);
const origin = `http://127.0.0.1:${port}`;
/** アプリそのものが待ち受ける番号。ブラウザは手前の圧縮の中継（port）を通る。 */
const appPort = await freeLocalPort();
const secret = randomBytes(32).toString("hex");
const cluster = await disposableDatabase(temp);
/** 設置した本人（測る人）と、本人が招いた人。アドレスはどれも架空（example.com）。tests/support/serve-app.mjs と同じ */
const OWNER = "owner@example.com";
const READER = "reader@example.com";
/** サイドバーと一覧の見出しの名前（本人の名前で言う。tests/e2e/workspace.spec.mjs と同じ） */
const LIBRARY_TITLE = "owner の資料";
let children = childProcesses({ output: "ignore" });
let store;
let browser;
let proxy;
let front;
let startPromise;
let failed = false;

/** 保存先の前に置く中継。行き帰りのどちらも半分ずつ遅らせる（同じ遅れのタイマーは置いた順に動くので、順番は崩れない）。 */
async function latencyProxy(target, rttMs, workers = 0, costMs = 0) {
  const half = rttMs / 2;
  // 保存先の働き手。空いた人が、列の先頭の文を cost ms かけて片付けてから渡す（同じつなぎの文の順番は崩れない）
  const queue = [];
  let busy = 0;
  const serve = () => {
    while (busy < workers && queue.length > 0) {
      const job = queue.shift();
      busy++;
      setTimeout(() => { busy--; job(); serve(); }, costMs);
    }
  };
  const handOver = (job) => { if (workers <= 0) { job(); return; } queue.push(job); serve(); };
  const sockets = new Set();
  const server = createServer((client) => {
    const upstream = connect(target.port, target.hostname);
    for (const socket of [client, upstream]) { sockets.add(socket); socket.on("close", () => sockets.delete(socket)); socket.setNoDelay(true); }
    const connection = ++latencyProxy.connections;
    const pipe = (from, to) => {
      from.on("data", (chunk) => {
        if (from === client && latencyProxy.trace) latencyProxy.trace.push({ at: performance.now(), connection, sql: statementOf(chunk) });
        const write = () => { if (!to.destroyed) to.write(chunk); };
        // 行きだけ列に並ぶ（帰りは片付いた答えが戻るだけ）
        setTimeout(from === client ? () => handOver(write) : write, half);
      });
      from.on("end", () => setTimeout(() => to.end(), half));
      from.on("error", () => to.destroy());
    };
    pipe(client, upstream);
    pipe(upstream, client);
  });
  const listenPort = await freeLocalPort();
  await new Promise((resolve) => server.listen(listenPort, "127.0.0.1", resolve));
  return { port: listenPort, close: () => { for (const socket of sockets) socket.destroy(); server.close(); } };
}

/**
 * 本番の配信網と同じく、文字の応答を圧縮して渡す中継（ブラウザ → ここ → アプリ）。next start は応答を圧縮しないので、
 * 素のままだと道具箱の部品（3.9MB）がそのまま届き、本番（配信網が圧縮して約 1MB）よりスマホの回線で大きく遅く出る。
 * 流しながら描く応答（画面の中身）を止めないよう、届いた分ごとに押し出す（flush）。
 */
async function compressingProxy(listenPort, targetPort) {
  const compressible = /^(text\/|application\/(javascript|json|x-component|manifest\+json)|image\/svg)/i;
  const server = createHttpServer((incoming, outgoing) => {
    const upstream = httpRequest({ host: "127.0.0.1", port: targetPort, method: incoming.method, path: incoming.url, headers: { ...incoming.headers, "accept-encoding": "identity" } }, (response) => {
      const accept = String(incoming.headers["accept-encoding"] ?? "");
      const type = String(response.headers["content-type"] ?? "");
      const encode = !response.headers["content-encoding"] && compressible.test(type) && incoming.method !== "HEAD" && response.statusCode !== 204 && response.statusCode !== 304
        ? (/\bbr\b/.test(accept) ? "br" : /\bgzip\b/.test(accept) ? "gzip" : null) : null;
      const headers = { ...response.headers };
      if (encode) { delete headers["content-length"]; headers["content-encoding"] = encode; headers.vary = headers.vary ? `${headers.vary}, Accept-Encoding` : "Accept-Encoding"; }
      outgoing.writeHead(response.statusCode ?? 502, headers);
      if (!encode) { response.pipe(outgoing); return; }
      const zip = encode === "br"
        ? createBrotliCompress({ flush: zlibConstants.BROTLI_OPERATION_FLUSH, params: { [zlibConstants.BROTLI_PARAM_QUALITY]: 5 } })
        : createGzip({ flush: zlibConstants.Z_SYNC_FLUSH });
      response.pipe(zip).pipe(outgoing);
    });
    upstream.on("error", () => { if (!outgoing.headersSent) outgoing.writeHead(502); outgoing.end(); });
    incoming.pipe(upstream);
  });
  await new Promise((resolve) => server.listen(listenPort, "127.0.0.1", resolve));
  return { close: () => { server.closeAllConnections?.(); server.close(); } };
}

latencyProxy.connections = 0;
/** `--trace` のときだけ、保存先へ送った文を時刻つきで控える（どの問い合わせを順番に待っているかを見る）。 */
latencyProxy.trace = null;
/** 送った塊から SQL の文を拾う（拡張問い合わせの Parse に入っている字。値は別に送られるので入らない）。 */
function statementOf(chunk) {
  const text = chunk.toString("latin1");
  const match = /(select|insert|update|delete|with)\s[\s\S]*?(?=\u0000)/i.exec(text);
  return match ? match[0].replace(/\s+/g, " ").slice(0, 140) : null;
}

/** 本文を持つ資料（開く場面で使う）。中身は検査の材料（tests/checks/fixtures の架空の資料）の写し。 */
const DOCUMENTS = [
  { slug: "internal/speed/hello", file: "internal/example/hello.html" },
  { slug: "internal/speed/diagrams", file: "internal/guide/diagrams.html" },
  { slug: "internal/speed/showcase", file: "internal/example/deck-showcase.html" },
  { slug: "internal/speed/presentation", file: "internal/example/deck-design-presentation.html" },
  { slug: "internal/speed/proposal", file: "internal/example/deck-design-proposal.html" },
  { slug: "internal/speed/deck", file: "internal/example/deck-design-report.html" },
];
const ARTICLE = "internal/speed/hello";
const DECK = "internal/speed/deck";
/**
 * 画像の多い資料。画像は全部すぐ取りに行く（`loading="eager"`。スライドの一覧や、下まで送った記事と同じ本数が一度に出る）。
 * 1 枚ずつ中身の違う PNG（目印が別になる）を、素材の置き場（検査用の保管庫）へ置く。
 */
const GALLERY = "internal/speed/gallery";
const GALLERY_IMAGES = 30;
/**
 * 生きている資料の数と、そのうち見る人を絞った資料の数。本文を持つ資料・画像の資料を引いた残りは、題と台帳の行だけの資料にする。
 * 1 人のサイトとしては多め（2026-10-14 に決めた。多いほど資料の数に比例して遅くなる変更が数字に出る）。
 * 絞った資料の割合は会社版の本番（2026-10-08: 827 のうち 119）に合わせる
 */
const ALIVE = 500, RESTRICTED = 72;
const author = { email: OWNER, name: "自分" };

/** 見本を積む組織（この設置の 1 つだけの組織）。組織に属する表は組織で絞った口から触る */
function firstOrganization() {
  return { id: store.FIRST_ORGANIZATION.id, assetPrefix: store.FIRST_ORGANIZATION.assetPrefix };
}

async function seedGallery() {
  const images = [];
  for (let n = 1; n <= GALLERY_IMAGES; n++) {
    const name = `images/${String(n).padStart(2, "0")}.png`;
    const png = await sharp({ create: { width: 400, height: 300, channels: 3, background: { r: (n * 37) % 256, g: (n * 71) % 256, b: (n * 113) % 256 } } }).png().toBuffer();
    await putTestAsset(`${GALLERY}/${name}`, png, { access: "private", contentType: "image/png", allowOverwrite: true });
    images.push(`<figure><img data-speed-image loading="eager" src="${name}" alt="図 ${n}"><figcaption>図 ${n}</figcaption></figure>`);
  }
  const html = `<!doctype html><html lang="ja"><head><meta charset="utf-8"><title>画像の多い資料</title></head><body><main><h1>画像の多い資料</h1>${images.join("")}</main></body></html>`;
  await store.commitRevision({ organization: firstOrganization(), pageSlug: GALLERY, html, author, message: "速さの計測の見本（画像）" });
}

async function seed(adminUrl) {
  for (const one of DOCUMENTS) {
    const html = await readFile(path.join(root, "tests/checks/fixtures", one.file), "utf8");
    await store.commitRevision({ organization: firstOrganization(), pageSlug: one.slug, html, author, message: "速さの計測の見本" });
  }
  await seedGallery();
  const sql = postgres(adminUrl, { max: 1, onnotice: () => {} });
  try {
    const bulk = ALIVE - DOCUMENTS.length - 1;
    // 題と台帳の行だけの資料。どれも本人が作ったもの。見る人を絞った資料は 1/6 で名簿に招いた人が載る
    await sql`insert into public.pages(page_slug,visibility,title,created_by,current_version_id,updated_at,created_at)
      select 'internal/speed-bulk/'||n, case when n<=${RESTRICTED}::int then 'restricted' else 'internal' end,
        '速さの計測の資料 '||lpad(n::text,4,'0')||' 月次の振り返りと次の打ち手',
        ${OWNER}, md5('speed-bulk-'||n)||'00000000',
        now()-(n||' hours')::interval, now()-(n||' hours')::interval-interval '1 day'
      from generate_series(1,${bulk}::int) n`;
    await sql`insert into public.page_permissions(page_id,grantee_kind,member_email,added_by,role)
      select id,'member',${READER},${OWNER},'viewer' from public.pages
      where page_slug like 'internal/speed-bulk/%' and visibility='restricted' and split_part(page_slug,'/',3)::int%6=0`;
    await sql`insert into public.page_catalog(page_id,version_id,classifier_version,kind)
      select id,current_version_id,1,case when page_slug like '%7' then 'deck' else 'page' end
      from public.pages where page_slug like 'internal/speed-bulk/%' on conflict do nothing`;
    // 最近開いたもの（本文を持つ資料を新しい順に・ほかに 30 枚）・招いた人からの未解決のコメント・お気に入り 5 枚
    await sql`insert into public.page_views(page_id,viewer_email,last_viewed_at,view_count)
      select id,${OWNER},now()-((array_position(${sql.array(DOCUMENTS.map((one) => one.slug))}::text[],page_slug))||' minutes')::interval,3
      from public.pages where page_slug = any(${sql.array(DOCUMENTS.map((one) => one.slug))}::text[])`;
    await sql`insert into public.page_views(page_id,viewer_email,last_viewed_at,view_count)
      select id,${OWNER},now()-(split_part(page_slug,'/',3)||' hours')::interval,1 from public.pages
      where page_slug like 'internal/speed-bulk/%' and visibility='internal' and split_part(page_slug,'/',3)::int between 200 and 229`;
    await sql`insert into public.page_comments(page_slug,body,priority,author_email,author_name,created_at)
      select 'internal/'||page_slug_tail,'直してほしい点 '||n,'must',${READER},'招いた人',now()-(n||' hours')::interval
      from (select substr(page_slug,10) page_slug_tail, row_number() over (order by page_slug) n from public.pages where created_by=${OWNER}) mine
      where n<=12`;
    await sql`insert into public.page_favorites(owner_email,page_id)
      select ${OWNER},id from public.pages where page_slug like 'internal/speed-bulk/%' and visibility='internal' order by page_slug limit 5`;
    for (const table of ["pages", "page_permissions", "page_catalog", "page_views", "page_comments"]) await sql.unsafe(`analyze public.${table}`);
    const [{ alive }] = await sql`select count(*)::int alive from public.pages where deleted_at is null`;
    if (alive !== ALIVE) throw new Error(`資料の数がそろいません（${alive}）`);
  } finally {
    await sql.end();
  }
}

/** どの文書でも動く印。押した瞬間（呼ぶ側）と同じ時計（epoch の ms）で、各画面が描けた時刻を拾う。 */
const MARKS = () => {
  if (window.top !== window) return;
  const marks = {};
  Object.defineProperty(window, "__speed", { value: marks });
  const now = () => performance.timeOrigin + performance.now();
  // 描いた時刻は「中身が DOM に入った直後の描画のフレーム」
  const at = (key) => { if (key in marks || at.pending.has(key)) return; at.pending.add(key); requestAnimationFrame(() => { at.pending.delete(key); if (!(key in marks)) marks[key] = now(); }); };
  at.pending = new Set();
  const scan = () => {
    const where = location.pathname;
    if (where === "/" && document.querySelector("#home-recent ~ ul .ws-row-home, .ws-row-home")) at("home");
    if (where === "/library" && document.querySelector("h1.ws-title")?.textContent === "owner の資料" /* LIBRARY_TITLE（印は画面の中で動くので、字のまま書く） */
      && document.querySelector(".ws-row:not(.ws-row-heading):not(.ws-row-home)")) at("library");
    if (where.startsWith("/internal/")) {
      if (document.querySelector("body h1")) at("body");
      if (document.body?.hasAttribute("data-deck-design-live") || document.body?.hasAttribute("data-deck-design-ready")) at("deck");
      if (document.querySelector("surprise-comments")?.shadowRoot?.querySelector(".bar")) at("toolbox");
      const images = document.querySelectorAll("img[data-speed-image]");
      if (images.length > 0 && [...images].every((image) => image.complete && image.naturalWidth > 0)) at("images");
    }
  };
  new MutationObserver(scan).observe(document, { subtree: true, childList: true, attributes: true, characterData: true });
  setInterval(scan, 8);
  addEventListener("pageshow", (event) => { marks.pageshow = now(); marks.persisted = event.persisted; });
};

async function newPage(context) {
  const page = await context.newPage();
  page.on("pageerror", (error) => console.error(`画面の例外: ${error.message}`));
  if (PHONE) {
    const cdp = await context.newCDPSession(page);
    await cdp.send("Network.enable");
    await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 165, downloadThroughput: 9 * 1024 * 1024 / 8, uploadThroughput: 3 * 1024 * 1024 / 8 });
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  }
  return page;
}

/** 新しいタブで開き、印が立つまで。開き始め（navigationStart）からの時間。 */
async function openFresh(context, route, mark) {
  const page = await newPage(context);
  await page.goto(`${origin}${route}`, { waitUntil: "commit" });
  await page.waitForFunction((key) => window.__speed?.[key], mark, { timeout: 60000, polling: 10 });
  const result = await page.evaluate((key) => {
    const navigation = performance.getEntriesByType("navigation")[0];
    const fcp = performance.getEntriesByType("paint").find((one) => one.name === "first-contentful-paint");
    return { shown: Math.round(window.__speed[key] - performance.timeOrigin), ttfb: Math.round(navigation.responseStart),
      documentEnd: Math.round(navigation.responseEnd), fcp: fcp ? Math.round(fcp.startTime) : null };
  }, mark);
  return { page, result };
}

/**
 * 人と同じ順でリンクを押す: カーソルを運ぶ → DWELL_MS とどまる → 押して離す。返すのは「離す直前」の時刻（epoch の ms）。
 * ブラウザの中の時計（performance.timeOrigin + now）と同じ物差し。
 */
async function press(page, locator) {
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  if (!box) throw new Error("押す場所が見えません");
  await page.mouse.move(box.x + Math.min(box.width / 2, 40), box.y + box.height / 2, { steps: 4 });
  if (DWELL_MS > 0) await page.waitForTimeout(DWELL_MS);
  await page.mouse.down();
  const clicked = Date.now();
  await page.mouse.up();
  return clicked;
}

/** 画面の中のリンクを押し、行き先の印が立つまで。押した瞬間からの時間。 */
async function switchTo(page, text, mark, where) {
  await page.evaluate((key) => { delete window.__speed[key]; }, mark);
  const clicked = await press(page, page.locator(".ws-sidebar a.ws-nav-item", { hasText: text }).first());
  await page.waitForFunction(({ key, where }) => location.pathname === where && window.__speed?.[key], { key: mark, where }, { timeout: 60000, polling: 10 });
  return { shown: Math.round(await page.evaluate((key) => window.__speed[key], mark) - clicked) };
}

/** 一覧の行（本物の a）を押し、別の文書として開く。押した瞬間からの時間。 */
async function openFromHome(page, slug, marks) {
  const href = `/internal/${slug.replace(/^internal\//, "")}`;
  const clicked = await press(page, page.locator(`a.ws-row-title[href="${href}"]`).first());
  await page.waitForURL(`**${href}`, { waitUntil: "commit", timeout: 60000 });
  // 先読みで裏で開いた文書には、自動操作の道具が印を差し込めていないことがある。そのときはここで差し込む
  // （差し込んだあとの最初の描画で印が立つので、表に出た時刻より遅く数える側に倒れる）
  await page.evaluate(`window.__speed || (${MARKS.toString()})()`);
  await page.waitForFunction((keys) => keys.every((key) => window.__speed?.[key]), marks, { timeout: 60000, polling: 10 });
  const result = await page.evaluate(({ keys, clicked }) => {
    const out = {};
    const navigation = performance.getEntriesByType("navigation")[0];
    // 先読みで裏で描き終えていた文書は、表に出た瞬間（activationStart）より前には見えていない
    const shownFrom = performance.timeOrigin + navigation.activationStart;
    for (const key of keys) out[key] = Math.max(0, Math.round(Math.max(window.__speed[key], shownFrom) - clicked));
    out.ttfb = Math.max(0, Math.round(performance.timeOrigin + navigation.responseStart - clicked));
    out.bytes = navigation.transferSize;
    out.prerendered = navigation.activationStart > 0;
    return out;
  }, { keys: marks, clicked });
  return result;
}

/** ブラウザの「戻る」でホームへ。戻した瞬間からの時間（そのまま戻れたか・読み直したかも記録する）。 */
async function backHome(page) {
  // 人は資料を読んでから戻る。資料の読み込みが落ち着いてから READ_MS だけ置いて押す（落ち着く前に押すと、資料の画面が
  // まだ投げている問い合わせと保存先の列で取り合い、戻る先の画面の分が後ろに並ぶ——2026-10-08 の計測で 0.41 秒 → 0.26 秒。
  // 押した瞬間からの時間を測ることは変えない・docs/design/app-speed.md の「測り方」）
  await page.waitForLoadState("networkidle").catch(() => undefined);
  await page.waitForTimeout(READ_MS);
  const started = await page.evaluate(() => { const t = performance.timeOrigin + performance.now(); history.back(); return t; });
  await page.waitForURL(`${origin}/`, { waitUntil: "commit", timeout: 60000 });
  await page.waitForFunction((t) => (window.__speed?.persisted && window.__speed.pageshow > t) || window.__speed?.home > t, started, { timeout: 60000, polling: 10 });
  return page.evaluate((t) => {
    const restored = Boolean(window.__speed.persisted && window.__speed.pageshow > t);
    return { shown: Math.round((restored ? window.__speed.pageshow : window.__speed.home) - t), restored };
  }, started);
}

let env;
async function startApp() {
  children = childProcesses({ output: "ignore" });
  startPromise = startDisposableApp({ root, app, env, port: appPort, run: children.run });
  startPromise.catch(() => undefined);
  for (let attempt = 0; attempt < 480; attempt++) {
    try { if ((await fetch(`${origin}/signin`)).status < 500) return; } catch { /* まだ起きていない */ }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("アプリが起きません");
}

try {
  await cluster.start();
  // 個人版として初期化する（設置した本人が持ち主。tests/support/serve-app.mjs と同じ）
  const dbUrl = await initializeDatabase(cluster.adminUrl, OWNER);
  process.env.DATABASE_URL = dbUrl;
  // 画像の置き場は検査用の置き場（PAGES_TEST_ASSETS）。設置の不足の案内に引っかからないよう、鍵は形だけの値を入れる
  const siteEnvironment = { PAGES_EDITION: "personal", PAGES_OWNER_EMAIL: OWNER, PAGES_SITE_URL: origin, BLOB_READ_WRITE_TOKEN: "vercel_blob_rw_test_notreal" };
  Object.assign(process.env, siteEnvironment);
  process.env.PAGES_TEST_ASSETS = path.join(temp, "assets");
  const stub = path.join(temp, "stub.mjs");
  await writeFile(stub, "export const auth=async()=>null; export const headers=async()=>({get:()=>null}); export const cookies=async()=>({get:()=>undefined}); export const dangerouslyDeleteByTag=async()=>{}; export const waitUntil=()=>{}; export const getCache=()=>({get:async()=>null,set:async()=>{},delete:async()=>{},expireTag:async()=>{}});");
  const bundle = path.join(temp, "seed.cjs");
  await build({ stdin: { contents: "export * from './src/lib/db/database'; export * from './src/lib/pages/store'; export { FIRST_ORGANIZATION } from './src/lib/organization/scope';", resolveDir: root, loader: "ts" },
    bundle: true, platform: "node", format: "cjs", outfile: bundle, alias: { "@/auth": stub, "next/headers": stub, "@vercel/functions": stub } });
  store = createRequire(import.meta.url)(bundle);
  await seed(cluster.adminUrl);
  await store.closeDatabase();

  // アプリは中継を通して保存先へつなぐ（往復ごとに DB_RTT_MS 待つ）
  const direct = new URL(dbUrl);
  proxy = await latencyProxy(direct, DB_RTT_MS, DB_WORKERS, DB_COST_MS);
  const delayed = new URL(dbUrl);
  delayed.port = String(proxy.port);
  env = appEnvironment({ origin, secret, extra: {
    // 控えを取った条件（HTTP 経由の保存先）は問い合わせを同時に何本でも投げられた。直接の接続は既定で 3 本までなので、広げて同じ形にする
    DATABASE_URL: delayed.toString(), DATABASE_POOL_MAX: "12", PAGES_TEST_ASSETS: path.join(temp, "assets"),
    ...siteEnvironment,
  } });
  const built = appIndex !== -1 && await readFile(path.join(app, ".next/BUILD_ID"), "utf8").then(Boolean, () => false);
  if (!built) {
    await prepareTestApp(root, app);
    if (process.env.PAGES_TEST_BUILD) await restoreTestBuild(root, app, path.resolve(process.env.PAGES_TEST_BUILD));
    else await buildTestApp(root, app, env, childProcesses().run);
  }
  front = await compressingProxy(port, appPort);
  await startApp();
  // 人の Chrome と同じ動きにする。Playwright の既定（古い形のヘッドレス・戻る進むの控えを切る指定）のままだと、
  // 「戻る」がいつも読み直しになり、画面をそのまま戻せるかを測れない
  browser = await chromium.launch({ headless: true, channel: process.env.PAGES_TEST_CHROME_CHANNEL ?? "chromium", ignoreDefaultArgs: ["--disable-back-forward-cache"] });
  const cookie = await sessionToken(secret, { email: OWNER, name: "自分", sub: OWNER });
  const contextFor = async () => {
    const context = await browser.newContext({ locale: "ja-JP", ...(PHONE ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 } : { viewport: { width: 1440, height: 900 } }) });
    // ふだん使っている人と同じく、言語の写し（sp-locale）は前に開いたときのものが残っている
    await context.addCookies([{ name: "authjs.session-token", value: cookie, url: origin, httpOnly: true, sameSite: "Lax" },
      { name: "sp-locale", value: "ja", url: origin, sameSite: "Lax" }]);
    await context.addInitScript(MARKS);
    return context;
  };

  if (process.argv.includes("--serve")) {
    // 測らずに起こしたままにする（手で調べるとき）。名乗りの cookie は証拠の置き場に書く
    await writeFile(path.join(evidence, "serve.json"), JSON.stringify({ origin, cookie }), { mode: 0o600 });
    console.log(`起こしたまま: ${origin}（名乗りは ${path.join(evidence, "serve.json")}）`);
    await new Promise(() => {});
  }
  if (traceRoutes) {
    // 1 つの要求の中で保存先へ送った文を、送った時刻の順に出す（同じ時刻に並ぶものは同時に投げている）。
    // 前の道筋で受け取った cookie（画像の通行証など）は、ブラウザと同じく次の道筋に持っていく
    const jar = new Map([["authjs.session-token", cookie]]);
    for (const route of traceRoutes) {
      for (let round = 0; round < 3; round++) {
        latencyProxy.trace = [];
        const started = performance.now();
        const headers = { cookie: [...jar].map(([name, value]) => `${name}=${value}`).join("; ") };
        const response = await fetch(`${origin}${route}`, { headers, redirect: "manual" });
        for (const line of response.headers.getSetCookie()) { const [pair] = line.split(";"); const at = pair.indexOf("="); jar.set(pair.slice(0, at), pair.slice(at + 1)); }
        await response.arrayBuffer();
        const took = performance.now() - started;
        const trace = latencyProxy.trace;
        latencyProxy.trace = null;
        if (round < 2) continue;
        console.log(`\n## ${route}（${response.status}・${Math.round(took)}ms・文 ${trace.filter((one) => one.sql).length} 本）`);
        for (const one of trace) if (one.sql) console.log(`${String(Math.round(one.at - started)).padStart(5)}ms #${one.connection} ${one.sql}`);
      }
    }
    throw new Error("TRACE_DONE");
  }
  /** 全部の場面を ROUNDS 回ずつ測る。1 回目は数えない（関数の立ち上がりと、各画面の部品の初回の読み込み。本番の関数はふだん温まっている） */
  const measureAll = async () => {
    const samples = Object.fromEntries(SCENES.map((scene) => [scene, []]));
    // 1 回目は数えない（関数の立ち上がりと、各画面の部品の初回の読み込み）。本番の関数はふだん温まっている
    for (let round = -1; round < ROUNDS; round++) {
      const keep = (scene, value) => { if (round >= 0) samples[scene].push(value); };
      const context = await contextFor();
      const home = await openFresh(context, "/", "home");
      keep("home-open", home.result);
      await home.page.close();
      const again = await openFresh(context, "/", "home");
      keep("home-reopen", again.result);
      if (!PHONE) {
        keep("to-library", await switchTo(again.page, LIBRARY_TITLE, "library", "/library"));
        keep("to-home", await switchTo(again.page, "ホーム", "home", "/"));
      }
      keep("open-document", await openFromHome(again.page, ARTICLE, ["body", "toolbox"]));
      keep("back-home", await backHome(again.page));
      keep("open-deck", await openFromHome(again.page, DECK, ["deck", "toolbox"]));
      await again.page.close();
      const library = await openFresh(context, "/library", "library");
      keep("library-open", library.result);
      await library.page.close();
      const gallery = await openFresh(context, `/internal/${GALLERY.slice("internal/".length)}`, "images");
      keep("open-gallery", gallery.result);
      await gallery.page.close();
      await context.close();
    }
    return samples;
  };
  let samples = await measureAll();
  let summary = summarize(samples);
  let misses = measureOnly ? [] : judgeAll(summary);
  // 合格ラインを超えたときだけ、その場で 1 回測り直す（2 回とも超えたら不合格。上限の数字は変えない・docs/guides/testing.md）。
  // 1 回目の結果も証拠に残す
  const firstAttempt = misses.length > 0 ? { misses, summary } : null;
  if (firstAttempt) {
    console.log(`合格ラインを超えたので 1 回だけ測り直します:\n- ${misses.join("\n- ")}`);
    samples = await measureAll();
    summary = summarize(samples);
    misses = judgeAll(summary);
  }
  const targetMisses = judge(summary, TARGET);
  const limits = (budget, scene) => budget[scene] ? Object.entries(budget[scene]).map(([key, limit]) => `${key} ≤ ${limit}`).join(" / ") : "-";
  const rows = Object.entries(summary).map(([scene, metrics]) =>
    `| ${scene} | ${Object.entries(metrics).map(([key, value]) => formatMetric(key, value)).join(" / ")} | ${limits(TARGET, scene)}${targetMisses.some((miss) => miss.startsWith(`${scene} `)) ? "（未達）" : "（達成）"} | ${limits(BUDGET === TARGET ? (PHONE ? PHONE_GUARD : GUARD) : BUDGET, scene)} |`);
  const table = ["| 場面 | 中央値（最遅）ms | 目標（爆速） | CI の歯止め |", "| --- | --- | --- | --- |", ...rows].join("\n");
  const result = {
    result: measureOnly ? "MEASURED" : misses.length === 0 ? "PASS" : "FAIL",
    dbRttMs: DB_RTT_MS, dbWorkers: DB_WORKERS, dbCostMs: DB_COST_MS, readMs: READ_MS, dwellMs: DWELL_MS, rounds: ROUNDS, budget: BUDGET, target: TARGET, guard: GUARD, ratio: COMPARE_RATIO ? BASELINE : null,
    misses, targetMisses, summary, samples, firstAttempt,
    testedCommit: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(), evidence,
  };
  await writeFile(path.join(evidence, "speed.json"), `${JSON.stringify(result, null, 2)}\n`);
  console.log(`保存先の 1 往復 ${DB_RTT_MS}ms・働き手 ${DB_WORKERS} 人が 1 本 ${DB_COST_MS}ms ずつ・押す前にとどまる ${DWELL_MS}ms・各 ${ROUNDS} 回\n\n${table}\n`);
  console.log(targetMisses.length === 0 ? "目標（爆速）: すべて達成" : `目標（爆速）に届いていない場面:\n- ${targetMisses.join("\n- ")}`);
  console.log(measureOnly ? "測るだけ（合格ラインと比べていない）" : misses.length === 0 ? `合格ライン（${BUDGET === TARGET ? "目標" : "CI の歯止め"}）の外れ: なし` : `合格ライン（${BUDGET === TARGET ? "目標" : "CI の歯止め"}）の外れ:\n- ${misses.join("\n- ")}`);
  if (!COMPARE_RATIO && BUDGET === GUARD && !measureOnly) console.log("比例の線は比べていません（控えと測る条件が違う。控えは tests/support/app-speed-baseline.mjs で CI の結果から取り直す）");
  if (misses.length > 0) failed = true;
} catch (error) {
  if (error instanceof Error && error.message === "TRACE_DONE") { /* 文を出し終えた */ } else {
  failed = true;
  console.error(JSON.stringify({ result: "ERROR", error: error instanceof Error ? error.stack : String(error), evidence }, null, 2));
  }
} finally {
  await browser?.close();
  children.stop();
  await stopProcessesInside(app).catch(() => undefined);
  await startPromise?.catch(() => {});
  proxy?.close();
  front?.close();
  await store?.closeDatabase?.().catch?.(() => undefined);
  await cluster.stop();
}
process.exit(failed ? 1 : 0);
