/**
 * 配信のときに先に描く部品（src/lib/first-paint/chrome.ts）の決まり。
 *
 * 1. 目次の組み方が道具箱（src/widget/reading/outline.ts の readOutline）と同じか——同じ本文を両方に読ませて突き合わせる。
 *    食い違うと、道具箱が届いた瞬間に目次の中身が替わる（章が増える・移動先が変わる）。
 * 2. 手を出さないページ（スライド・動画・道具箱の札が無いもの）は 1 バイトも変えない。差し込みの外の本文も変えない。
 * 3. 外から来た字（見出し）は逃がして書く。保存される本文に焼き付いたら断る（src/lib/html/check.ts）。
 * （配布版には録音が無いので、「録音の情報」の写しは描かない）
 *
 * 入れ替わる瞬間に何も動かないことは、本物のブラウザで tests/checks/browser/first-paint-chrome.mjs が測る。
 */
import { readFile } from "node:fs/promises";
import { build } from "esbuild";
import { JSDOM } from "jsdom";
import { root, dir, companyDeployment } from "./paths.mjs";

// jsdom が先に parse5 を読み終えてから読む（同時に読み込むと、jsdom の require が読み込み途中の parse5 に当たって止まる）
const { parse } = await import("parse5");

// 先に描く部品は会社の版で動く（個人用の配布版では featureAvailable("first-paint") が閉じる）。束ねた中でだけ会社の版にする
await build({ entryPoints: [`${root}/src/lib/first-paint/chrome.ts`], outfile: `${dir}/first-paint-chrome.mjs`, bundle: true, format: "esm", platform: "node", logLevel: "error", plugins: [companyDeployment] });
await build({ entryPoints: [`${root}/src/widget/reading/outline.ts`], outfile: `${dir}/first-paint-outline.mjs`, bundle: true, format: "esm", platform: "node", logLevel: "error" });
await build({ entryPoints: [`${root}/src/lib/html/check.ts`], outfile: `${dir}/first-paint-html-check.mjs`, bundle: true, format: "esm", platform: "node", logLevel: "error" });
const { withFirstPaintChrome, readEarlyOutline, firstPaintLocale, firstPaintTranslate } = await import(`${dir}/first-paint-chrome.mjs`);
const { readOutline } = await import(`${dir}/first-paint-outline.mjs`);
const { findHtmlIssues } = await import(`${dir}/first-paint-html-check.mjs`);

let failures = 0;
function ok(label, actual, expected) {
  const pass = JSON.stringify(actual) === JSON.stringify(expected);
  if (!pass) failures++;
  console.log(`${pass ? "OK  " : "NG  "} ${label}${pass ? "" : `: ${JSON.stringify(actual)}（期待: ${JSON.stringify(expected)}）`}`);
}

const URL_ = "https://example.com/internal/long?v=abcdef";
const locale = firstPaintLocale(null);
const t = firstPaintTranslate(locale);
const WIDGET = '<script type="module" src="/comments-widget.js/abc/comments-widget.js" data-page="internal/long" defer></script>';
const page = (body, { head = "", tag = WIDGET } = {}) => `<!doctype html><html><head><title>原稿</title>${head}</head><body id="sp-top">${body}${tag}</body></html>`;

/** 道具箱が本物の DOM で組む目次。移動先の id は道具箱が本文に付けたもの。 */
function clientOutline(html) {
  const instance = new JSDOM(html, { url: URL_ });
  const win = instance.window;
  for (const name of ["window", "document", "Node", "Text", "Element", "HTMLElement", "HTMLDetailsElement"]) {
    Object.defineProperty(globalThis, name, { value: name === "window" ? win : win[name], configurable: true });
  }
  const outline = readOutline(win.document);
  const shaped = outline === null ? null : {
    chapters: outline.chapters.map(ch => ({ id: ch.target.id, title: ch.title, sections: ch.sections.map(s => ({ id: s.target.id, title: s.title })) })),
    related: outline.related,
  };
  win.close();
  return shaped;
}
const serverOutline = html => readEarlyOutline(parse(html), URL_, t);

console.log("--- 1. 目次の組み方が道具箱と同じ ---");
const bundle = `<main><nav data-clean-copy-ui="navigation"><a href="#doc-a">旧章名</a> ／ <a href="#doc-b">次章</a> ／ <a href="#doc-c">名前だけの章</a> ／ <a href="/internal/materials">関連資料</a> ／ <a href="mailto:x@example.com">連絡</a></nav>
<section id="doc-a"><article data-clean-copy-source-id="doc-a"><h1 id="a-title">最初の<del data-surprise-redline="1">古い</del>章</h1><h2 id="a">同じ節名</h2><p>本文</p><blockquote><h2>制作の見出し</h2></blockquote><div class="lecture-cue"><h2>制作指示</h2></div><h2>後半</h2><h3>細部</h3></article></section>
<details id="doc-b"><summary>次章</summary><article data-clean-copy-source-id="doc-b" data-clean-copy-label="登録した名前"><h1>次の章</h1><h2 id="b">同じ節名</h2></article></details>
<section id="other"><article data-clean-copy-source-id="doc-c"><p>見出しの無い原本</p></article></section>
<section><article data-clean-copy-source-id="doc-d"><h2>二段目から始まる</h2><h4>深い節</h4><h3>浅い節</h3></article></section></main>`;
const scenes = {
  "複数の原本（旧目次・畳んだ章・名前の指定・見出しの無い原本）": page(bundle),
  "単一の原本（同名・図の中の見出し・id の無い見出し）": page('<main data-clean-copy-document><h1>題</h1><h3>章より前の節</h3><h2>同名</h2><h3>細部</h3><h2>同名</h2><figure><h3>図の名前</h3></figure><h3>次の細部</h3><p>本文</p></main>'),
  "付ける名前がほかの id とぶつかる": page('<div id="clean-copy-chapter-1"></div><main data-clean-copy-document><h2>一</h2><h2 id="clean-copy-chapter-2-x">二</h2><h3>二の節</h3><h2>三</h2></main><p id="clean-copy-chapter-1-1"></p>'),
  "見出しの空白と入れ子の字": page('<main data-clean-copy-document><h2>  改行\n  の<b>ある</b>  章 </h2><h2><span></span></h2><h2>二つめ</h2></main>'),
  "原本が 1 つの束": page('<main><article data-clean-copy-source-id="only"><h1>題</h1><h2>章A</h2><h3>節</h3><h2>章B</h2></article></main>'),
  "清書でないページ": page("<main><h2>一</h2><h2>二</h2></main>"),
  "移動先が 1 か所しか無い": page("<main data-clean-copy-document><h1>題</h1><h2>一</h2></main>"),
};
for (const [label, html] of Object.entries(scenes)) ok(label, serverOutline(html), clientOutline(html));
for (const file of ["current.html", "legacy.html"]) {
  const html = await readFile(`${root}/tests/checks/fixtures/clean-copy/${file}`, "utf8");
  ok(`清書の見本（${file}）`, serverOutline(html), clientOutline(html));
}

console.log("\n--- 2. 手を出さないページ・本文を変えない ---");
const minutes = page(`<main data-clean-copy-document><h1 class="text-3xl mb-10">清書</h1><h2>全体像</h2><h2>次にすること</h2><h3>担当</h3></main>`);
const delivered = withFirstPaintChrome(minutes, { url: URL_, locationBar: true, locale });
ok("清書には差し込む", delivered !== minutes, true);
ok("二度通しても同じ", withFirstPaintChrome(delivered, { url: URL_, locationBar: true, locale }), delivered);
const stripped = delivered
  .replace(/<style data-sp-first-paint="chrome">[\s\S]*?<\/style>/, "")
  .replace(/<surprise-reading-nav data-sp-first-paint>[\s\S]*?<\/surprise-reading-nav>/, "");
ok("差し込みの外の本文は 1 バイトも変えない", stripped, minutes);
ok("目次の写しは body の頭", /<body[^>]*><surprise-reading-nav data-sp-first-paint>/.test(delivered), true);
ok("場所を空ける指定は head の中", delivered.indexOf('<style data-sp-first-paint="chrome">') < delivered.indexOf("</head>"), true);
ok("写しにスクリプトを入れない", /<surprise-reading-nav[\s\S]*?<script/.test(delivered.slice(0, delivered.indexOf("</surprise-reading-nav>"))), false);
const deck = page('<main data-deck-slides><section data-deck-slide><h2>一</h2></section></main>').replace("<body", "<body data-deck");
ok("スライドは変えない", withFirstPaintChrome(deck, { url: URL_, locationBar: true, locale }), deck);
const plain = page("<main><h2>一</h2><h2>二</h2></main>");
ok("清書でない公開ページは変えない", withFirstPaintChrome(plain, { url: URL_, locationBar: false, locale }), plain);
const internalPlain = withFirstPaintChrome(plain, { url: URL_, locationBar: true, locale });
ok("清書でない社内ページは現在地の行の場所だけ空ける", internalPlain.match(/<style data-sp-first-paint="chrome">([\s\S]*?)<\/style>/)?.[1].includes("padding-top: 44px"), true);
ok("清書でない社内ページに目次は描かない", internalPlain.includes("surprise-reading-nav"), false);
ok("道具箱の札が無い・清書でもないページは変えない", withFirstPaintChrome(page("<main></main>", { tag: "" }), { url: URL_, locationBar: false, locale }), page("<main></main>", { tag: "" }));

console.log("\n--- 3. 外から来た字・焼き付き ---");
const hostile = page('<main data-clean-copy-document><h2>&lt;img src=x onerror=alert(1)&gt; "引用" &amp; \'字\'</h2><h2>二</h2></main>');
const escaped = withFirstPaintChrome(hostile, { url: URL_, locationBar: false, locale });
ok("見出しの字を逃がして書く", escaped.includes("<img src=x"), false);
ok("引用符も逃がす", /aria-label="[^"]*&quot;引用&quot;/.test(escaped), true);
ok("保存される本文に焼き付いたら断る", findHtmlIssues(delivered).some(issue => issue.kind === "artifact" && issue.detail === "firstPaint"), true);

// 4. 「録音の情報」の写しは配布版に無い（録音の機能ごと外した）。札が残っていても描かないことだけ見る
console.log("\n--- 4. 録音の札があっても「録音の情報」は描かない ---");
const withRecordingTag = page(`<main data-clean-copy-document><h1 class="text-3xl mb-10">議事録</h1><h2>一</h2><h2>二</h2></main>`, {
  tag: WIDGET.replace("data-page", 'data-recordings="0f8f3c1a-2b4d-4e6f-8a9b-1c2d3e4f5a6b" data-page'),
});
ok("録音の情報の写しを置かない", withFirstPaintChrome(withRecordingTag, { url: URL_, locationBar: true, locale }).includes("surprise-recording-about"), false);

console.log("\n--- 5. 読めない本文でも配信を止めない ---");
const deep = page(`<main data-clean-copy-document>${"<div>".repeat(6000)}<h2>一</h2><h2>二</h2>${"</div>".repeat(6000)}</main>`);
let thrown = null;
try { withFirstPaintChrome(deep, { url: URL_, locationBar: true, locale }); } catch (error) { thrown = String(error); }
ok("入れ子が深い本文でも例外を投げない", thrown, null);
const withQuery = withFirstPaintChrome(minutes, { url: `${URL_}&x=1`, locationBar: true, locale });
ok("? 以降が違っても、目次の中身はリンクの行き先以外同じ", withQuery.replaceAll("&amp;x=1", ""), delivered);

process.exitCode = failures ? 1 : 0;
