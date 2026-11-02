import { readWidgetSource } from "./widget-source.mjs";
/**
 * スライド形式（deck）を確かめる。
 *
 * 見るのは 6 つ。
 *   1. 目印の名前が src/lib/deck/deck.ts と雛形（src/templates/deck.html）で一致し、雛形が生の色を持たないか
 *   2. 門なし公開（/public/）と絵（/api/og）でスピーカーノートが取り除かれ、社内（/internal/）では残るか
 *   3. Markdown の書き出しが、枚の間に `---`・ノートに `> ノート:` を置くか
 *   4. 実行部が DOM を 1 度だけ組み、#N とキーで動き、#c= を枚と読まないか
 *   5. 道具箱が deck のページでだけ「プレゼン中は隠れる」規則を置くか
 *   6. 原本との逆向きの検知（edited）と、deck 向けの依頼文が explain-deck を呼ぶか
 *
 * 保管庫にも GitHub にも繋がない。材料は検査用の写し（fixtures/internal/example/deck.html）。
 */
import { readFile } from "node:fs/promises";

import { root, dir } from "./paths.mjs";
const { JSDOM } = await import("jsdom");
const { build } = await import(`${root}/node_modules/esbuild/lib/main.js`);

const read = (path) => readFile(`${root}/${path}`, "utf8");
const strip = (text) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
const count = (text, needle) => text.split(needle).length - 1;

let fails = 0;
const ok = (label, actual, expected) => {
  const pass = String(actual) === String(expected);
  if (!pass) fails += 1;
  console.log(`${pass ? "OK  " : "NG  "} ${label}: ${actual}（期待: ${expected}）`);
};

const bundle = async (entry, name, platform = "node") => {
  await build({
    entryPoints: [`${root}/${entry}`],
    outfile: `${dir}/${name}.mjs`,
    bundle: true,
    format: "esm",
    platform,
    external: ["node:*"],
  });
  return import(`${dir}/${name}.mjs`);
};

const deck = await bundle("src/lib/deck/deck.ts", "deck-lib", "neutral");
const content = await bundle("src/lib/pages/content.ts", "deck-content");
const markdown = await bundle("src/lib/pages/markdown.ts", "deck-markdown", "neutral");
const widgetDeck = await bundle("src/widget/deck/deck.ts", "deck-widget", "neutral");
// 書き出しの口はカスタム要素の class を持つので、読み込む前に HTMLElement を渡す（置き場探しだけ使う）
globalThis.HTMLElement = new JSDOM("").window.HTMLElement;
const pageExport = await bundle("src/widget/reading/page-export.ts", "deck-page-export", "neutral");

const TEMPLATE = await read("src/templates/deck.html");
const FIXTURE = await read("tests/checks/fixtures/internal/example/deck.html");
const PLAIN = await read("tests/checks/fixtures/internal/example/hello.html");
const ROUTE_P = strip(await read("src/app/public/[...slug]/route.ts"));
const ROUTE_I = strip(await read("src/lib/pages/private-page.ts"));
const OG = strip(await read("src/app/api/og/route.tsx"));
const WIDGET = strip(await readWidgetSource());
const WIDGET_API = strip(await read("src/widget/shared/api.ts"));
// 道具箱の文言は辞書（日本語が正本）。画面はその鍵を引き、字そのものは辞書で見る
const TOOLBOX_JA = await read("src/lib/i18n/messages/ja/toolbox.ts");
const ANCHOR = strip(await read("src/widget/comments/anchor.ts"));
const AGENTS = await read("AGENTS.md");

/** 雛形から「ページに貼る一式」を切り出す（先頭の但し書きの終わりから）。check-vendor と同じ見方。 */
function embedBlock(html) {
  const afterNote = html.indexOf("-->") + "-->".length;
  const from = html.indexOf("<style", afterNote);
  const to = html.lastIndexOf("</script>") + "</script>".length;
  return from < 0 || to <= from ? "" : html.slice(from, to);
}
const embed = embedBlock(TEMPLATE);

// ---------------------------------------------------------------------------
console.log("--- 1. 目印の名前と雛形 ---");

ok("雛形から一式を切り出せる", embed.startsWith("<style") && embed.endsWith("</script>"), true);
ok("一式は style 1 枚", count(embed, "<style"), 1);
ok("一式は script 1 本", count(embed, "<script"), 1);
ok("見本は雛形の一式を 1 文字も変えずに写している", FIXTURE.includes(embed), true);
ok("見本は deck（body の印）", deck.isDeckHtml(FIXTURE), true);
ok("素のページは deck でない", deck.isDeckHtml(PLAIN), false);
ok("data-deck-slides だけでは deck でない", deck.isDeckHtml('<body data-deck-slides class="x">'), false);
ok("印は属性名として見る（data-decks は別物）", deck.isDeckHtml("<body data-decks>"), false);

/** 雛形の script が `var 名 = "値"` で持つ名前を全部拾う */
const scriptVars = Object.fromEntries(
  [...embed.matchAll(/var\s+([A-Z_]+)\s*=\s*"([^"]+)";/g)].map((hit) => [hit[1], hit[2]]),
);
const NAMES = {
  MARK: deck.DECK_MARK,
  SLIDES: deck.DECK_SLIDES,
  SLIDE: deck.DECK_SLIDE,
  SKIP: deck.DECK_SKIP,
  NOTES: deck.DECK_NOTES,
  MODE: deck.DECK_MODE_ATTR,
  PRESENT: deck.DECK_MODE_PRESENT,
  FRAME: deck.DECK_FRAME,
  CURRENT: deck.DECK_CURRENT,
  OVERFLOW: deck.DECK_OVERFLOW,
  TOOLBAR: deck.DECK_TOOLBAR,
  EXIT: deck.DECK_EXIT,
  NOTES_HIDDEN: deck.DECK_NOTES_HIDDEN,
  OVERVIEW: deck.DECK_OVERVIEW,
};
for (const [name, value] of Object.entries(NAMES)) {
  ok(`雛形の ${name} は src/lib/deck/deck.ts と同じ字（${value}）`, scriptVars[name], value);
}
ok("キャンバスの幅は src/lib/deck/deck.ts と同じ", /var WIDTH = (\d+);/.exec(embed)?.[1], String(deck.DECK_CANVAS.width));
ok("キャンバスの高さは src/lib/deck/deck.ts と同じ", /var HEIGHT = (\d+);/.exec(embed)?.[1], String(deck.DECK_CANVAS.height));
ok("枚のハッシュの形は src/lib/deck/deck.ts と同じ", /var HASH = (\/[^;]+\/);/.exec(embed)?.[1], String(deck.DECK_HASH));
ok("紙の大きさはキャンバスと同じ", embed.includes(`size: ${deck.DECK_CANVAS.width}px ${deck.DECK_CANVAS.height}px`), true);
ok("縮めるのは transform だけ", /transform:\s*scale\(var\(--deck-k\)\)/.test(embed), true);
ok("器は 16:9", /aspect-ratio:\s*16 \/ 9/.test(embed), true);
ok("プレゼンは html の属性を見る CSS", embed.includes(`html[${deck.DECK_MODE_ATTR}="${deck.DECK_MODE_PRESENT}"]`), true);
ok("紙は 1 枚 1 ページ", /break-after:\s*page/.test(embed), true);
ok("紙ではノートを出さない", /@media print[\s\S]*aside\[data-deck-notes\][\s\S]*display:\s*none/.test(embed), true);
ok("DOM は 1 度しか組まない（済んだ印）", embed.includes('"data-deck-ready"'), true);
// 配信は body の閉じを探して道具箱を差し込む。雛形（但し書きも）にその字があると、そこへ刺さる
ok("雛形のどこにも body の閉じタグの字が無い", /<\/body/i.test(TEMPLATE), false);
ok("一式の script の閉じは本物の 1 つだけ", count(embed, "</script"), 1);
// 配信は「base タグが既にあるか」を字面で見て、あれば差し込まない。雛形にその字があると相対の道筋が全部切れる
ok("雛形のどこにも base タグの字が無い", /<base\s/i.test(TEMPLATE), false);
ok("一式の style の閉じは本物の 1 つだけ", count(embed, "</style"), 1);
{
  const served = content.withCommentsWidget(FIXTURE, "internal/example/deck");
  const scriptAt = served.indexOf("comments-widget.js");
  ok("配信の差し込みは見本の実行部より後ろに刺さる", scriptAt > served.indexOf(embed) + embed.length, true);
}
ok("版の見比べ中はプレゼンに入らない", /has\("from"\)/.test(embed), true);

const styleOnly = /<style>([\s\S]*?)<\/style>/.exec(embed)?.[1] ?? "";
const scriptOnly = /<script>([\s\S]*?)<\/script>/.exec(embed)?.[1] ?? "";
ok("style に生の色（#…）が無い", /#[0-9a-fA-F]{3,8}\b/.test(strip(styleOnly)), false);
ok("style に生の色（rgb/hsl）が無い", /\b(?:rgba?|hsla?)\(\s*\d/.test(styleOnly), false);
const paints = [...strip(styleOnly).matchAll(/(?:^|;|\{)\s*(?:color|background(?:-color)?|border-color)\s*:\s*([^;}]+)/g)].map((hit) =>
  hit[1].trim(),
);
ok("style の色は額縁の名前を受ける var(--deck-*) か素の指定だけ", paints.length > 0 && paints.every((value) =>
  /^(?:var\(--deck-[a-z]+\)|inherit|none|transparent|currentColor)$/.test(value),
), true);
ok("script も生の色を持たない", /#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?)\(\s*\d/.test(strip(scriptOnly)), false);
for (const token of ["--ads-text", "--ads-muted", "--ads-bg", "--ads-surface"]) {
  ok(`額縁の名前を先に見る（${token}）`, scriptOnly.includes(`"${token}"`), true);
}
ok("名前が無いときは OS の色に落ちる", /"CanvasText"[\s\S]*"GrayText"[\s\S]*"Canvas"/.test(scriptOnly), true);
ok("画面の単位（vw / vh）を枚の置き方に使わない", /\d(?:vw|vh|dvh|svh)\b/.test(styleOnly), false);
// 枚は紙、ページは机。境は 2 つの色の差で見せ、線も影も足さない
ok("縦並びの地（机）は body に敷く", /body\[data-deck\]\s*\{[^}]*background:\s*var\(--deck-surface\)/.test(strip(styleOnly)), true);
ok("枚（stage）は紙", /\[data-deck-stage\]\s*\{[^}]*background:\s*var\(--deck-bg\)/.test(strip(styleOnly)), true);
ok("プレゼンの枚の外も机", /\[data-deck-current\]\s*\{[^}]*background:\s*var\(--deck-surface\)/.test(strip(styleOnly)), true);
ok("枚の境に線や影を足さない", /(?:outline|box-shadow|border):\s*[1-9]/.test(strip(styleOnly)), false);
ok("紙に刷るときは地を塗らない", /@media print[\s\S]*body\[data-deck\]\s*\{[^}]*background:\s*none/.test(strip(styleOnly)), true);
ok("操作の列は器の幅に収める", /\[data-deck-toolbar\]:not\(\.deck-step-controls\):not\(\.deck-step-entry\)[\s\S]{0,200}max-width:\s*100%/.test(strip(styleOnly)), true);
ok("操作の列は机の色を連れて sticky する", /\[data-deck-toolbar\]:not\(\.deck-step-controls\):not\(\.deck-step-entry\)[\s\S]{0,280}background:\s*var\(--deck-surface\)/.test(strip(styleOnly)), true);
ok("操作の列の先は溶かして紙を見せる", /\[data-deck-toolbar\]:not\(\.deck-step-controls\):not\(\.deck-step-entry\)::after[\s\S]{0,280}linear-gradient\(to bottom, var\(--deck-surface\), transparent\)/.test(strip(styleOnly)), true);
ok("操作の釦の字は途中で折らない", /\[data-deck-toolbar\] button[\s\S]{0,400}white-space:\s*nowrap/.test(strip(styleOnly)), true);

// ---------------------------------------------------------------------------
console.log("\n--- 2. 公開ではノートを取り除く ---");

const stripped = content.withoutDeckNotes(FIXTURE);
ok("aside が全部消える", count(stripped, `<aside ${deck.DECK_NOTES}`), 0);
ok("元には aside が 4 つあった", count(FIXTURE, `<aside ${deck.DECK_NOTES}`), 4);
ok("枚（section）は残る", count(stripped, `<section ${deck.DECK_SLIDE}`), count(FIXTURE, `<section ${deck.DECK_SLIDE}`));
ok("本文は残る", stripped.includes("Pages にスライドを載せる"), true);
ok("ノートの文が消える", stripped.includes("聞く人の画面には出ない"), false);
ok("ノートの中の一覧も消える", stripped.includes("PPTX が要るときだけ"), false);
ok("実行部（雛形）は残る", stripped.includes(embed), true);
ok("出典の札は残る", /data-source-note/.test(stripped), true);
ok("deck でない本文には何も起きない", content.withoutDeckNotes(PLAIN) === PLAIN, true);
ok("素の aside は消さない", content.withoutDeckNotes("<aside>x</aside>"), "<aside>x</aside>");
ok("2 度通しても同じ", content.withoutDeckNotes(stripped) === stripped, true);
ok("属性の後ろに値や別の属性があっても取る", content.withoutDeckNotes('<p>a</p><aside class="n" data-deck-notes="">m</aside><p>b</p>'), "<p>a</p><p>b</p>");
ok("閉じの前に空白があっても取る", content.withoutDeckNotes("<aside data-deck-notes>m</aside ><p>b</p>"), "<p>b</p>");

ok("公開本文と公開素材の参照からノートを除く", count(ROUTE_P, "withoutDeckNotes("), 2);
ok("/internal/ では取り除かない", count(ROUTE_I, "withoutDeckNotes("), 0);
ok("公開の絵（/api/og）は取り除いた本文から要約する", count(OG, "withoutDeckNotes("), 1);
ok("/public/ は取り除いた形を配信にも要約にも渡す", /withAssetBase\(html,[\s\S]*lazyPublicMeta\(html,/.test(ROUTE_P), true);

// ---------------------------------------------------------------------------
console.log("\n--- 3. Markdown の書き出し ---");

const toMarkdown = (html, withScripts = false) => {
  const dom = new JSDOM(
    html,
    withScripts
      ? { runScripts: "dangerously", pretendToBeVisual: true, url: "https://pages.example/internal/example/deck" }
      : { url: "https://pages.example/internal/example/deck" },
  );
  return markdown.pageToMarkdown({
    title: dom.window.document.title,
    url: "https://pages.example/internal/example/deck",
    root: dom.window.document,
    comments: null,
  });
};
const md = toMarkdown(FIXTURE);
const slides = count(FIXTURE, `<section ${deck.DECK_SLIDE}`);
ok("枚の間に --- が入る（枚数 − 1）", count(md, "\n---\n"), slides - 1);
ok("先頭の枚の前には --- を置かない", /^# Deck の見本\n\nhttps:[^\n]+\n\n# Pages/.test(md), true);
ok("ノートは > ノート: で出る（ノートの枚だけ）", count(md, "> ノート: "), 4);
ok("ノートの中の一覧も引用のまま", md.includes(">\n> - PPTX が要るときだけ Marp が勝つ"), true);
ok("ノートはその枚の直後に出る", md.indexOf("> ノート: 最初の枚") < md.indexOf("\n---\n"), true);
ok("ノートの枚と無い枚の順が本文の順", md.indexOf("## 縦並びとプレゼン") < md.indexOf("## 流れ"), true);
ok("図は元の文で出る", md.includes("```mermaid\nflowchart LR"), true);
const mdLive = toMarkdown(FIXTURE, true);
ok("実行部が組み直した後でも同じ枚数の区切り", count(mdLive, "\n---\n"), slides - 1);
ok("操作の列の字は書き出さない", mdLive.includes("プレゼンを始める"), false);
ok("ノートを隠す釦の字も書き出さない", mdLive.includes("ノートを隠す"), false);
ok("組み直した後でもノートは同じ数", count(mdLive, "> ノート: "), 4);
ok("組み直した後でも本文は同じ", mdLive.replace(/\s+/g, " ") === md.replace(/\s+/g, " "), true);

// ---------------------------------------------------------------------------
console.log("\n--- 4. 実行部 ---");

/** jsdom は寸法を持たないので、器の幅と枚の高さだけ与える */
function openDeck(url, html = FIXTURE) {
  const dom = new JSDOM(html, {
    runScripts: "dangerously",
    pretendToBeVisual: true,
    url,
    beforeParse(window) {
      window.ResizeObserver = class {
        constructor(callback) {
          this.callback = callback;
        }
        observe() {}
        disconnect() {}
      };
      Object.defineProperty(window.HTMLElement.prototype, "scrollHeight", {
        configurable: true,
        get() {
          return this.hasAttribute("data-fixture-tall") ? 900 : 0;
        },
      });
      window.HTMLElement.prototype.getBoundingClientRect = function () {
        return this.hasAttribute("data-deck-slide") ? new window.DOMRect(0, 0, 1280, 720) : new window.DOMRect();
      };
      Object.defineProperty(window.HTMLElement.prototype, "clientWidth", {
        configurable: true,
        get() {
          return this.tagName === "MAIN" ? 640 : 0;
        },
      });
    },
  });
  return dom.window;
}
const settle = () => new Promise((resolve) => setTimeout(resolve, 30));
const key = (window, name) => window.document.dispatchEvent(new window.KeyboardEvent("keydown", { key: name, bubbles: true }));
const currentIndex = (document) =>
  document.querySelector(`[${deck.DECK_CURRENT}] > [data-deck-stage]`)?.getAttribute("data-deck-index") ?? null;

{
  const window = openDeck("https://pages.example/internal/example/deck");
  const { document } = window;
  await settle();
  ok("枚を frame で包む", document.querySelectorAll(`[${deck.DECK_FRAME}]`).length, slides);
  ok("frame の中に stage、stage の中に section", document.querySelectorAll(`[${deck.DECK_FRAME}] > [data-deck-stage] > section[${deck.DECK_SLIDE}]`).length, slides);
  ok("aside は section の外（frame の中・stage の直後）", document.querySelectorAll(`[${deck.DECK_FRAME}] > [data-deck-stage] + aside[${deck.DECK_NOTES}]`).length, 4);
  ok("section の中に aside は残らない", document.querySelectorAll(`section[${deck.DECK_SLIDE}] aside`).length, 0);
  ok("枚数は属性で持つ（文字を DOM に足さない）", document.querySelector("[data-deck-stage]")?.getAttribute("data-deck-total"), String(slides));
  ok("本文に「1 / 6」の字は無い", document.body.textContent.includes(`1 / ${slides}`), false);
  ok("倍率は器の幅から", document.querySelector("main").style.getPropertyValue("--deck-k"), String(640 / deck.DECK_CANVAS.width));
  ok("操作の列は main の先頭", document.querySelector("main").firstElementChild?.hasAttribute(deck.DECK_TOOLBAR), true);
  // .no-print は道具箱が「ページの PDF ボタンの置き場」と読む印。付けると釦が抜かれて書き出しの口に化ける
  ok("操作の列に no-print を付けない", document.querySelector(`[${deck.DECK_TOOLBAR}]`)?.classList.contains("no-print"), false);
  ok("終える釦にも no-print を付けない", document.querySelector(`[${deck.DECK_EXIT}]`)?.classList.contains("no-print"), false);
  ok("道具箱の PDF の置き場探しが操作の列を掴まない", pageExport.findPrintSlot(document), null);
  ok("プレゼンを始める釦がある", document.querySelector(`[${deck.DECK_TOOLBAR}] button`)?.textContent, "プレゼンを始める");
  ok("終える釦は body の直下", document.querySelector(`body > [${deck.DECK_EXIT}]`) !== null, true);
  ok("終える釦は字を持たない（aria-label だけ）", document.querySelector(`[${deck.DECK_EXIT}]`)?.textContent.trim(), "");
  ok("色は額縁の名前が無いので OS の色に落ちる", document.documentElement.style.getPropertyValue("--deck-muted"), "GrayText");
  ok("机の色は OS に無いので紙に字を混ぜて作る", document.documentElement.style.getPropertyValue("--deck-surface"), "color-mix(in srgb, CanvasText 6%, Canvas)");
  ok("はみ出した枚に印", document.querySelectorAll(`[${deck.DECK_FRAME}][${deck.DECK_OVERFLOW}]`).length, 1);
  ok("印が付くのは高い枚", document.querySelector(`[${deck.DECK_OVERFLOW}] section`)?.hasAttribute("data-fixture-tall"), true);

  ok("はじめはプレゼンでない", document.documentElement.hasAttribute(deck.DECK_MODE_ATTR), false);
  document.querySelector(`[${deck.DECK_TOOLBAR}] button`).click();
  ok("釦でプレゼンに入る", document.documentElement.getAttribute(deck.DECK_MODE_ATTR), deck.DECK_MODE_PRESENT);
  ok("いまの枚は 1（開いた直後はいちばん上の枚）", currentIndex(document), "1");
  ok("#N を URL に書く", window.location.hash, "#1");
  key(window, "ArrowRight");
  ok("→ で次へ", currentIndex(document), "2");
  ok("URL も進む", window.location.hash, "#2");
  key(window, " ");
  ok("Space でも次へ", currentIndex(document), "3");
  key(window, "ArrowLeft");
  ok("← で前へ", currentIndex(document), "2");
  key(window, "End");
  ok("End で最後へ", currentIndex(document), String(slides));
  key(window, "ArrowRight");
  ok("最後で止まる", currentIndex(document), String(slides));
  key(window, "Home");
  ok("Home で最初へ", currentIndex(document), "1");
  key(window, "ArrowLeft");
  ok("最初で止まる", currentIndex(document), "1");
  window.location.hash = "#4";
  await settle();
  ok("プレゼン中の #N でその枚へ", currentIndex(document), "4");
  window.location.hash = "#c=0c3f1c8e-1111-4222-8333-444444444444";
  await settle();
  ok("#c=… は枚と読まない（いまの枚のまま）", currentIndex(document), "4");
  ok("いまの枚は 1 つだけ", document.querySelectorAll(`[${deck.DECK_CURRENT}]`).length, 1);
  key(window, "Escape");
  ok("Esc でプレゼンを出る", document.documentElement.hasAttribute(deck.DECK_MODE_ATTR), false);
  ok("出たらいまの枚の印も消える", document.querySelectorAll(`[${deck.DECK_CURRENT}]`).length, 0);
  key(window, "ArrowRight");
  ok("縦並びではキーを取らない", document.documentElement.hasAttribute(deck.DECK_MODE_ATTR), false);
  window.close();
}
{
  // 配信時に差し込まれる <base href="/internal/…/名前/"> があっても、#N は今の道筋に付く（末尾に / を足さない）
  const served = content.withAssetBase(FIXTURE, "/internal/example/deck");
  ok("配信の形には <base> がある", /<base href="\/internal\/example\/deck\/">/.test(served), true);
  const window = openDeck("https://pages.example/internal/example/deck", served);
  const { document } = window;
  await settle();
  document.querySelector(`[${deck.DECK_TOOLBAR}] button`).click();
  key(window, "ArrowRight");
  ok("<base> 越しでも #N は今の道筋に付く", window.location.pathname + window.location.hash, "/internal/example/deck#2");
  ok("<base> の末尾の / を URL に持ち込まない", window.location.href.includes("/deck/#"), false);
  key(window, "Escape");

  const notesToggle = document.querySelectorAll(`[${deck.DECK_TOOLBAR}] button`)[1];
  ok("ノートの釦の初期の字", notesToggle?.textContent, "ノートを隠す");
  notesToggle.click();
  ok("押すと main に隠す印", document.querySelector("main").hasAttribute(deck.DECK_NOTES_HIDDEN), true);
  ok("字が入れ替わる", notesToggle.textContent, "ノートを表示");
  notesToggle.click();
  ok("もう 1 度で戻る", document.querySelector("main").hasAttribute(deck.DECK_NOTES_HIDDEN), false);
}

{
  const window = openDeck("https://pages.example/internal/example/deck#3");
  const { document } = window;
  await settle();
  ok("#3 で開いても縦並びのまま（モードは URL に載せない）", document.documentElement.hasAttribute(deck.DECK_MODE_ATTR), false);
  document.querySelector(`[${deck.DECK_TOOLBAR}] button`).click();
  window.location.hash = "#3";
  await settle();
  ok("#3 のままプレゼンに入れば 3 枚目", currentIndex(document), "3");
}

{
  const window = openDeck("https://pages.example/internal/example/deck?from=abc1234");
  const { document } = window;
  await settle();
  ok("版の見比べ中はプレゼンの釦を出さない", document.querySelector(`[${deck.DECK_TOOLBAR}] button`)?.textContent, "ノートを隠す");
  ok("見比べ中でも枚は包む", document.querySelectorAll(`[${deck.DECK_FRAME}]`).length, slides);
}

{
  const window = openDeck("https://pages.example/internal/example/hello", PLAIN);
  const { document } = window;
  await settle();
  ok("deck でないページでは何も組まない", document.querySelectorAll(`[${deck.DECK_FRAME}]`).length, 0);
}

{
  const window = openDeck("https://pages.example/internal/example/deck", content.withoutDeckNotes(FIXTURE));
  const { document } = window;
  await settle();
  ok("ノートが無い（公開）ならノートの釦を出さない", [...document.querySelectorAll(`[${deck.DECK_TOOLBAR}] button`)].filter((button) => /^ノートを(?:隠す|表示)$/.test(button.textContent ?? "")).length, 0);
}

// ---------------------------------------------------------------------------
console.log("\n--- 5. 道具箱 ---");

{
  const dom = new JSDOM(FIXTURE, { url: "https://pages.example/internal/example/deck" });
  globalThis.document = dom.window.document;
  widgetDeck.mountDeckStyles();
  const style = dom.window.document.head.querySelector(`style[${widgetDeck.DECK_STYLE_MARK}]`);
  ok("deck のページには style を 1 枚置く", style !== null, true);
  ok("道具箱の器を隠す", style?.textContent.includes(`html[${deck.DECK_MODE_ATTR}="${deck.DECK_MODE_PRESENT}"] surprise-comments`), true);
  ok("書き出しの釦と現在地の行も隠す", style?.textContent.includes(`html[${deck.DECK_MODE_ATTR}="${deck.DECK_MODE_PRESENT}"] surprise-page-export, html[${deck.DECK_MODE_ATTR}="${deck.DECK_MODE_PRESENT}"] surprise-location { display: none !important; }`), true);
  ok("印は透明にする（要素は残す）", /mark\[data-surprise-comment\] \{ background: transparent !important/.test(style?.textContent ?? ""), true);
  ok(":host-context は使わない（Firefox に無い）", style?.textContent.includes(":host-context"), false);
  ok("保存済みの操作列にも机の色を載せる", style?.textContent.includes(`[${deck.DECK_TOOLBAR}]:not(.deck-step-controls):not(.deck-step-entry)`) && /background: var\(--deck-surface/.test(style?.textContent ?? ""), true);
  ok("保存済みの操作列の先も溶かして紙を見せる", /::after[\s\S]{0,280}linear-gradient\(to bottom/.test(style?.textContent ?? ""), true);
  ok("段階の操作列は保存済みの上書きから外す", style?.textContent.includes(".deck-step-controls") && style?.textContent.includes(".deck-step-entry"), true);
  // 道具箱のある画面では操作の列を出さない（上端の現在地の行と 2 段にしない）。釦は道具箱と ⋯ が受け持つ（src/widget/deck/edit/tools.ts）
  ok("道具箱があるあいだは保存済みの操作列を隠す", style?.textContent.includes(`body[${deck.DECK_MARK}]:has(> surprise-comments) [${deck.DECK_TOOLBAR}]:not(.deck-step-controls):not(.deck-step-entry) { display: none !important; }`), true);
  ok("隠すのは画面だけ（紙には元から出ない）", /@media screen \{ body\[data-deck\]:has\(> surprise-comments\)/.test(style?.textContent ?? ""), true);
  widgetDeck.mountDeckStyles();
  ok("2 度通しても 1 枚", dom.window.document.head.querySelectorAll(`style[${widgetDeck.DECK_STYLE_MARK}]`).length, 1);
  const plain = new JSDOM(PLAIN, { url: "https://pages.example/internal/example/hello" });
  globalThis.document = plain.window.document;
  widgetDeck.mountDeckStyles();
  ok("deck でないページには置かない", plain.window.document.head.querySelector(`style[${widgetDeck.DECK_STYLE_MARK}]`), null);
  delete globalThis.document;
}
ok("道具箱の立ち上げで通す（図の控えの直後）", /keepMermaidSource\(document\);[\s\S]{0,200}mountDeckStyles\(\);/.test(WIDGET), true);
ok("道具箱は data-deck-mode 以外の合図を作らない", /deck-(?:enter|leave|present)\b.*addEventListener|CustomEvent\("deck/.test(WIDGET), false);
ok("索引は操作の列を数えない", ANCHOR.includes("DECK_TOOLBAR") && ANCHOR.includes("DECK_EXIT"), true);

// ---------------------------------------------------------------------------
console.log("\n--- 6. 原本との逆向きの検知 ---");

/** 札の行（字下げから改行まで）。スキルはこの形で 1 行足す */
const NOTE_RE = /[ \t]*<p data-source-note[\s\S]*?<\/p>\n/;
ok("見本には出典の札がある", NOTE_RE.test(FIXTURE), true);
/** 札を足す前の原本のファイル（のつもり） */
const ORIGINAL = FIXTURE.replace(NOTE_RE, "");
const bare = content.stripSourceNote(FIXTURE);
ok("札を外すと札が無い", /data-source-note/.test(bare), false);
ok("札を外しても本文は残る", bare.includes("Pages にスライドを載せる") && bare.includes(embed), true);
ok("札の無い本文はそのまま", content.stripSourceNote(PLAIN) === PLAIN, true);
ok("札を外した形は、札を書く前のファイルと 1 字も違わない", bare === ORIGINAL, true);

ok("足す 1 行は現在の修正を残すと伝える", /t\("toolbox\.origin\.editedCopy"\)/.test(WIDGET) && /editedCopy: "[^"]*現在の修正を残して更新します。"/.test(TOOLBOX_JA), true);
ok("釦は今のまま（取り込む／やめる）", /actionButton\(t\("toolbox\.origin\.take"\), ICON_ORIGIN/.test(WIDGET) && /actionButton\(t\("toolbox\.common\.cancel"\), ICON_CLOSE/.test(WIDGET) && /take: "取り込む"/.test(TOOLBOX_JA) && /cancel: "やめる"/.test(TOOLBOX_JA), true);

ok("AGENTS.md に deck の決まりがある", AGENTS.includes("data-deck") && AGENTS.includes("src/templates/deck.html"), true);

// ---------------------------------------------------------------------------
console.log("\n--- 7. 組み方の手本（deck-showcase） ---");

/*
 * 手本は「枚の中で守ること」を自分で守っていないと手本にならない。
 * 見るのは枚の CSS（head の style）だけ。雛形の写しの部分は 1 章で正本と突き合わせている。
 */
const SHOWCASE = await read("tests/checks/fixtures/internal/example/deck-showcase.html");
const showcaseStyle = SHOWCASE.slice(SHOWCASE.indexOf("<style>"), SHOWCASE.indexOf("</style>"));
const showcaseMain = SHOWCASE.slice(SHOWCASE.indexOf("<main"), SHOWCASE.indexOf("</main>"));
const showcaseSlides = count(SHOWCASE, `<section ${deck.DECK_SLIDE}`);
const showcaseNotes = count(SHOWCASE, `<aside ${deck.DECK_NOTES}`);

ok("手本は雛形の一式を 1 文字も変えずに写している", SHOWCASE.includes(embed), true);
ok("手本は deck（body の印）", deck.isDeckHtml(SHOWCASE), true);
ok("手本は 14 枚", showcaseSlides, 14);
ok("手本のノートは 10 枚ぶん（扉 3 枚と芯の 1 枚には付けない）", showcaseNotes, 10);
ok("手本には出典の札がある", NOTE_RE.test(SHOWCASE), true);

const fontSizes = [...showcaseStyle.matchAll(/font-size:\s*(\d+(?:\.\d+)?)px/g)].map((hit) => Number(hit[1]));
ok("枚の字の指定がある", fontSizes.length > 0, true);
ok("枚の字は 20px 以上（0.30 倍でも読める下限）", Math.min(...fontSizes) >= 20, true);
ok("器の幅で組み替える単位（vw / vh）を使わない", /\d(vw|vh|dvh|svh|lvh)\b/.test(showcaseStyle), false);
ok("position: fixed / sticky を使わない", /position:\s*(fixed|sticky)/.test(showcaseStyle), false);
ok("メディアクエリは色の明暗だけ（幅で組み替えない）", [...showcaseStyle.matchAll(/@media\s*\(([^)]+)\)/g)].every((hit) => hit[1].startsWith("prefers-color-scheme")), true);
ok("色は額縁の名前（--ads-*）だけで、生の色を書かない", /#[0-9a-f]{3,8}\b|rgba?\(\s*\d/i.test(showcaseStyle.replace(/--ads-[a-z]+:\s*[\d ]+;/g, "")), false);
ok("識別色（accent）は 8px の印にだけ使う", count(showcaseStyle, "var(--ads-accent)"), 2);
ok("枚の中に script を置かない", /<script/i.test(showcaseMain), false);
ok("枚の中に絵文字を使わない（印は Lucide の SVG）", /\p{Extended_Pictographic}/u.test(showcaseMain), false);
ok("印の SVG は Lucide の check", count(showcaseMain, '<path d="M20 6 9 17l-5-5" />'), 6);
ok("ノートは必ず枚の最後の子", count(SHOWCASE, `<aside ${deck.DECK_NOTES}`), (showcaseMain.match(/<\/aside>\s*<\/section>/g) ?? []).length);
ok("枚を入れ子にしない", /<section [^>]*data-deck-slide[^>]*>(?:(?!<\/section>)[\s\S])*<section /.test(showcaseMain), false);
ok("公開ではノートが全部消える", count(content.withoutDeckNotes(SHOWCASE), `<aside ${deck.DECK_NOTES}`), 0);
ok("公開でも枚は全部残る", count(content.withoutDeckNotes(SHOWCASE), `<section ${deck.DECK_SLIDE}`), showcaseSlides);
{
  const md = toMarkdown(SHOWCASE);
  ok("書き出しの区切りは枚数 − 1", count(md, "\n---\n"), showcaseSlides - 1);
  ok("書き出しのノートはノートの枚数ぶん", count(md, "> ノート: "), showcaseNotes);
  // 足の字は 8 枚に CSS で描いてあるが、DOM にあるのは結びの 1 行だけ。書き出しに出るのもその 1 つ
  ok("枚の足（CSS で描く字）は書き出しに出ない", count(md, "Pages · スライド形式の作り方"), 1);
  ok("表は表として書き出す", md.includes("| 観点 | Marp | この形 |"), true);
}
{
  const window = openDeck("https://pages.example/internal/example/deck-showcase", SHOWCASE);
  const { document } = window;
  await settle();
  ok("実行部が手本の枚を全部包む", document.querySelectorAll(`[${deck.DECK_FRAME}]`).length, showcaseSlides);
  ok("手本の机の色は額縁の面から採る", document.documentElement.style.getPropertyValue("--deck-surface"), "rgb(245 245 245)");
  ok("手本の枚に「はみ出し」の印は付かない", document.querySelectorAll(`[${deck.DECK_OVERFLOW}]`).length, 0);
  window.close();
}

// Skipping changes presentation traversal, never the authored order or reading content.
{
  const window = openDeck("https://pages.example/internal/example/deck#1");
  const {document} = window;
  await settle();
  const sections = [...document.querySelectorAll("section[data-deck-slide]")];
  sections[0].setAttribute(deck.DECK_SKIP,"true");
  sections[2].setAttribute(deck.DECK_SKIP,"true");
  sections.at(-1).setAttribute(deck.DECK_SKIP,"true");
  document.deckLayout.refresh();
  const start = document.querySelector("main [data-deck-toolbar] button");
  start.click();
  ok("先頭をスキップした発表は次の枚から始まる",currentIndex(document),"2");
  key(window,"ArrowRight");
  ok("次へはスキップした途中の枚を飛ばす",currentIndex(document),"4");
  key(window,"ArrowLeft");
  ok("前へもスキップした枚を飛ばす",currentIndex(document),"2");
  key(window,"End");
  ok("末尾をスキップしても最後の有効な枚へ移動する",currentIndex(document),String(sections.length-1));
  key(window,"Home");
  ok("Homeは最初の有効な枚へ移動する",currentIndex(document),"2");
  window.location.hash="#3";
  await settle();
  ok("発表中の直接リンクもスキップ先を表示しない",currentIndex(document),"4");
  key(window,"Escape");
  ok("発表を終えてもスキップ枚の本文は残る",document.querySelectorAll("section[data-deck-slide]").length,sections.length);
  sections.forEach(section=>section.setAttribute(deck.DECK_SKIP,"true"));
  document.deckLayout.refresh();
  ok("全枚スキップでは発表を開始しない",start.disabled,true);
  ok("全枚スキップの理由と解除方法を案内する",start.title.includes("解除"),true);
  start.click();
  ok("全枚スキップで空の発表画面へ入らない",document.documentElement.hasAttribute("data-deck-mode"),false);
  sections[1].removeAttribute(deck.DECK_SKIP);
  document.deckLayout.refresh();
  start.click();
  ok("解除後は発表を再開できる",currentIndex(document),"2");
  key(window,"ArrowRight");
  ok("最後の有効な枚からスキップ枚へ進まない",currentIndex(document),"2");
  sections[1].setAttribute(deck.DECK_SKIP,"true");
  document.deckLayout.refresh();
  ok("発表中に全枚がスキップされたら閲覧へ戻す",document.documentElement.hasAttribute("data-deck-mode"),false);
  window.close();
}

{
  const many = `<!doctype html><html><body data-deck><main data-deck-slides>${[1, 2, 3, 4, 5].map((n) => `<section data-deck-slide><img src="pic-${n}.webp" alt=""></section>`).join("")}</main>${embed}</body></html>`;
  const window = openDeck("https://pages.example/internal/example/images", many);
  const { document } = window;
  await settle();
  const images = [...document.querySelectorAll("img")];
  ok("近い2枚の画像は読む", images.slice(0, 2).every((img) => img.getAttribute("src")), true);
  ok("遠い画像はブラウザに後回しを任せる", images.slice(2).every((img) => img.loading === "lazy"), true);
  ok("画像の参照を外さず保持する", images.every((img, at) => img.getAttribute("src") === `pic-${at + 1}.webp`), true);
  ok("近い画像は先に読み込む", images.slice(0, 2).every((img) => img.loading === "eager"), true);
  const list = [...document.querySelectorAll("button")].find((button) => button.textContent.includes("一覧"));
  ok("一覧の釦がある", list !== undefined, true);
  list.click();
  await settle();
  ok("読む画面から一覧を開ける", document.documentElement.hasAttribute("data-deck-overview"), true);
  ok("一覧は格子として組む", document.querySelector(`[${deck.DECK_TOOLBAR}] style`)?.textContent.includes("display: grid"), true);
  ok("今の枚の番号を濃くする印がある", document.querySelector(`[${deck.DECK_CURRENT}]`) !== null, true);
  document.querySelector(`[${deck.DECK_FRAME}]`).click();
  await settle();
  ok("一覧を閉じる", document.documentElement.hasAttribute("data-deck-overview"), false);
  ok("一覧から1枚目へ戻る", window.location.hash, "#1");
  ok("戻った枚の画像は残る", document.querySelector("img")?.getAttribute("src"), "pic-1.webp");
  window.close();
}

console.log(fails === 0 ? "\nすべて OK" : `\n${fails} 件 NG`);
process.exit(fails === 0 ? 0 : 1);
