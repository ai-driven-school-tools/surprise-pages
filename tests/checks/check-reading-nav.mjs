import { readWidgetSource } from "./widget-source.mjs";
/** 清書の構造、移動、本文の照合境界を本物の DOM と閲覧部品で検査する。 */
import { root, dir } from "./paths.mjs";
import { JSDOM } from "jsdom";
import { build } from "esbuild";

for (const [name, entry] of Object.entries({ outline: "src/widget/reading/outline.ts", anchor: "src/widget/comments/anchor.ts", markdown: "src/lib/pages/markdown.ts" })) {
  await build({ entryPoints: [`${root}/${entry}`], outfile: `${dir}/reading-${name}.mjs`, bundle: true, format: "esm", platform: "node" });
}
// 目次と、上端の帯の持ち主は、同じ束に入れる（道具箱と同じく、持ち主は 1 つだけ）
await build({ stdin: { contents: `export { mountReadingNavigation } from "./src/widget/reading/nav"; export { topInset } from "./src/widget/reading/top-inset";`, resolveDir: root, loader: "ts" }, outfile: `${dir}/reading-navigation.mjs`, bundle: true, format: "esm", platform: "node" });
const { readOutline, readingHref, revealReadingTarget, activeReadingEntry } = await import(`${dir}/reading-outline.mjs`);
const { mountReadingNavigation, topInset } = await import(`${dir}/reading-navigation.mjs`);
const { buildTextIndex } = await import(`${dir}/reading-anchor.mjs`);
const { pageToMarkdown } = await import(`${dir}/reading-markdown.mjs`);
let failures = 0;
function ok(label, actual, expected) {
  const pass = JSON.stringify(actual) === JSON.stringify(expected);
  if (!pass) failures++;
  console.log(`${pass ? "OK  " : "NG  "} ${label}: ${JSON.stringify(actual)}（期待: ${JSON.stringify(expected)}）`);
}
function dom(body, width = 1440) {
  const instance = new JSDOM(`<!doctype html><html><head><base href="https://example.com/internal/long/"><title>原稿</title></head><body id="sp-top">${body}</body></html>`, { url: "https://example.com/internal/long?v=abcdef&compare=old", pretendToBeVisual: true });
  const win = instance.window;
  for (const name of ["window", "document", "history", "location", "Node", "Text", "NodeFilter", "Element", "HTMLElement", "HTMLDetailsElement", "MutationObserver", "ShadowRoot"]) {
    Object.defineProperty(globalThis, name, { value: name === "window" ? win : win[name], configurable: true });
  }
  globalThis.getComputedStyle = win.getComputedStyle.bind(win);
  globalThis.requestAnimationFrame = win.requestAnimationFrame.bind(win);
  Object.defineProperty(win.document.documentElement, "clientWidth", { value: width, configurable: true });
  Object.defineProperty(win, "innerWidth", { value: width, configurable: true });
  win.scrollTo = () => {}; win.scrollBy = () => {};
  win.HTMLElement.prototype.scrollIntoView = function () { this.dataset.scrolled = "yes"; };
  win.HTMLElement.prototype.getBoundingClientRect = function () {
    const height = this.classList.contains("trigger") && !this.hidden ? 72 : 20;
    const top = Number(this.dataset.top ?? 0);
    return { top, bottom: top + height, left: 0, right: width, width, height, x: 0, y: top };
  };
  win.HTMLElement.prototype.getClientRects = function () { return this.hidden ? [] : [this.getBoundingClientRect()]; };
  win.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  win.HTMLDialogElement.prototype.close = function () { this.open = false; this.dispatchEvent(new win.Event("close")); };
  return instance;
}
const bundle = `<main><nav data-clean-copy-ui="navigation"><a href="#doc-a">旧章名</a> ／ <a href="#doc-b">次章</a> ／ <a href="/internal/materials">関連資料</a></nav>
<section id="doc-a"><article data-clean-copy-source-id="doc-a"><h1 id="a-title">最初の章</h1><h2 id="a">同じ節名</h2><p>本文を変えない。</p><blockquote><h2 id="excluded">制作の見出し</h2><h3>左面</h3></blockquote><div class="lecture-cue"><h2>制作指示</h2></div><h2 id="a2">後半</h2><p>終わり。</p></article></section>
<details id="doc-b"><summary>次章</summary><article data-clean-copy-source-id="doc-b"><h1 id="b-title">次の章</h1><h2 id="b">同じ節名</h2><p>畳まれた本文。</p></article></details></main>`;

console.log("--- 1. 適用対象と階層 ---");
let scene = dom("<main><h1>普通のページ</h1><h2>節1</h2><h2>節2</h2></main>");
ok("普通のページは対象外", readOutline(document), null);
scene.window.close();
scene = dom('<main data-clean-copy-document><h1>短い文書</h1><h2>節1</h2></main>');
ok("移動先が1か所なら付けない", readOutline(document), null);
scene.window.close();
scene = dom(bundle);
const outline = readOutline(document);
ok("昔の一括清書も判別", outline.chapters.length, 2);
ok("保存された目次より現在の見出しを使う", outline.chapters[0].title, "最初の章");
ok("章の移動先を保持", outline.chapters.map(ch => ch.target.id), ["doc-a", "doc-b"]);
ok("引用や制作指示は含めない", outline.chapters[0].sections.map(s => s.title), ["同じ節名", "後半"]);
ok("同名の節は混ざらない", outline.chapters[1].sections[0].target.id, "b");
ok("閉じた章も目次には含める", document.querySelector("details").open, false);
revealReadingTarget(document.getElementById("b"));
ok("目的地の祖先を開く", document.querySelector("details").open, true);
ok("別資料は章に混ぜない", outline.related, [{ title: "関連資料", href: "https://example.com/internal/materials" }]);
document.querySelector("article").setAttribute("data-clean-copy-label", "登録した名前");
ok("明示された名前を使う", readOutline(document).chapters[0].title, "登録した名前");
document.querySelector("article").removeAttribute("data-clean-copy-label");
document.getElementById("a-title").innerHTML = '<del data-surprise-redline="1">古い名前</del><ins>新しい名前</ins>';
ok("比較の取り消し文は目次に混ぜない", readOutline(document).chapters[0].title, "新しい名前");
document.getElementById("a-title").remove();
ok("二段目から始まる原本も章に残る", readOutline(document).chapters.length, 2);
ok("その原本の最初の見出しを名前にする", readOutline(document).chapters[0].title, "同じ節名");
ok("二段目から始まる原本の節も残る", readOutline(document).chapters[0].sections.map(s => s.title), ["同じ節名", "後半"]);
scene.window.close();

console.log("\n--- 2. 単一原本・移動先の安定性 ---");
scene = dom('<main data-clean-copy-document><h1>題</h1><h2>同名</h2><h3>細部</h3><h2>同名</h2><figure><h3>図の名前</h3></figure><h3>次の細部</h3><p>本文</p></main>');
const beforeText = document.querySelector("main").textContent;
const single = readOutline(document);
ok("大見出しが章", single.chapters.map(ch => ch.title), ["同名", "同名"]);
ok("小見出しが所属する節", single.chapters.map(ch => ch.sections.map(s => s.title)), [["細部"], ["次の細部"]]);
const ids = single.chapters.flatMap(ch => [ch.target.id, ...ch.sections.map(s => s.target.id)]);
ok("同名でも移動先は一意", new Set(ids).size, 4);
ok("再計算で移動先を変えない", readOutline(document).chapters.flatMap(ch => [ch.target.id, ...ch.sections.map(s => s.target.id)]), ids);
ok("本文の文字列は変えない", document.querySelector("main").textContent, beforeText);
const url = new URL(readingHref(document.URL, "日本語の節"));
ok("素材用の基準URLへ移動しない", url.pathname, "/internal/long");
ok("過去版・比較指定を保持", url.search, "?v=abcdef&compare=old");
ok("日本語の行き先を保持", decodeURIComponent(url.hash), "#日本語の節");
single.chapters[0].target.dataset.top = "-200";
single.chapters[1].target.dataset.top = "100";
ok("画面の上側を通った章が現在地", activeReadingEntry(single.chapters, 24), 0);
single.chapters[1].target.dataset.top = "-1";
ok("次の章を通ると切り替わる", activeReadingEntry(single.chapters, 24), 1);
single.chapters[1].target.hidden = true;
ok("非表示の節を現在地にしない", activeReadingEntry(single.chapters, 24), 0);
scene.window.close();

console.log("\n--- 3. 本物の閲覧部品・本文との分離 ---");
scene = dom(bundle);
const indexed = buildTextIndex().text;
const markdown = pageToMarkdown({ root: document, title: document.title, url: document.URL });
const mainHtml = document.querySelector("main").innerHTML;
const changes = [];
const nav = mountReadingNavigation({ onDialogChange: open => changes.push(open) });
const shadow = document.querySelector("surprise-reading-nav").shadowRoot;
ok("章の木と「先頭へ」を分ける", shadow.querySelectorAll(".rail > div").length, 2);
ok("章番号を独立した列にする", shadow.querySelector(".rail .entry-number").textContent, "01");
ok("節はいま読んでいる章の行の中に入る", shadow.querySelector(".rail .section-list")?.closest(".chapter")?.querySelector(".entry")?.getAttribute("aria-current"), "location");
ok("ほかの章の行に節を出さない", shadow.querySelectorAll(".rail .section-list").length, 1);
ok("節番号に親の章を含める", shadow.querySelector(".section-list .entry-number").textContent, "2.1");
ok("広い画面では左目次", shadow.querySelector(".rail").hidden, false);
ok("本文の木を変えない", document.querySelector("main").innerHTML, mainHtml);
ok("コメントの引用位置を変えない", buildTextIndex().text, indexed);
ok("本文の書き出しを変えない", pageToMarkdown({ root: document, title: document.title, url: document.URL }), markdown);
ok("二重に組み立てない", mountReadingNavigation({ onDialogChange() {} }), null);
nav.setPanel(380);
ok("コメントを除いた幅で小型にする", shadow.querySelector(".trigger").hidden, false);
topInset.set("compare", 56);
ok("比較帯と現在地帯の高さを合算", document.documentElement.style.paddingTop, "128px");
ok("スクロールの余白にも反映", document.documentElement.style.scrollPaddingTop, "152px");
nav.open();
ok("全画面の目次を開く", shadow.querySelector("dialog").open, true);
ok("最初は全章だけを並べる", shadow.querySelectorAll(".sheet-content .chapter-row").length, 2);
ok("本文への移動先を複製しない", document.querySelectorAll("#a").length, 1);
shadow.querySelectorAll(".drill")[1].click();
ok("選んだ章の節一覧へ進む", shadow.querySelector(".sheet-heading").textContent, "次の章");
shadow.querySelector(".sheet-content .entry").click();
ok("目的地の折り畳みを開く", document.querySelector("details").open, true);
ok("移動すると目次が閉じる", shadow.querySelector("dialog").open, false);
ok("本文の目的地へ焦点を移す", document.activeElement.id, "b");
ok("過去版指定を保ったまま移動", location.search, "?v=abcdef&compare=old");
ok("場所をURLに残す", location.hash, "#b");
nav.open(); nav.close();
ok("閉じるだけなら目次ボタンへ戻る", shadow.activeElement?.className, "trigger");
let documentEscapes = 0;
document.addEventListener("keydown", event => { if (event.key === "Escape") documentEscapes++; });
nav.open();
shadow.querySelector("dialog").dispatchEvent(new scene.window.KeyboardEvent("keydown", { key: "Escape", bubbles: true, composed: true, cancelable: true }));
ok("Escは目次だけを閉じる", shadow.querySelector("dialog").open, false);
ok("下書き破棄や比較終了へEscを伝えない", documentEscapes, 0);
nav.open();
shadow.querySelector("dialog").dispatchEvent(new scene.window.Event("close"));
ok("以前のclose通知で開き直した目次を変えない", shadow.querySelector(".trigger").getAttribute("aria-expanded"), "true");
nav.close();
ok("開閉をコメント側へ知らせる", changes.includes(true) && changes.includes(false), true);
document.getElementById("a-title").textContent = "直した章名";
await new Promise(resolve => scene.window.setTimeout(resolve, 30));
ok("見出しの変更が目次へ反映", shadow.querySelector(".rail .entry-title").textContent, "直した章名");
const positionUrl = location.href;
window.dispatchEvent(new scene.window.Event("scroll"));
await new Promise(resolve => scene.window.setTimeout(resolve, 30));
ok("スクロールだけでURLを増やさない", location.href, positionUrl);
document.querySelector("details").open = false;
history.replaceState(null, "", "#b-title");
window.dispatchEvent(new scene.window.Event("hashchange"));
ok("既存の章タイトルへの直リンクも開く", document.querySelector("details").open, true);
ok("既存の章タイトルへの直リンクも余白を使って移動", document.getElementById("b-title").dataset.scrolled, "yes");
nav.destroy();
ok("解除すると元の余白へ戻る", document.documentElement.style.paddingLeft, "");
ok("専用の入れ物を片付ける", document.querySelector("surprise-reading-nav"), null);
scene.window.close();

console.log("\n--- 4. 配信との接続 ---");
const source = await readWidgetSource();
ok("公開ページでも閲覧機能として立ち上がる", source.indexOf("readingNavigation = mountReadingNavigation") < source.indexOf('if (visibility === "internal")'), true);
ok("コメントの書きかけを消さずに隠す", source.includes('root.host.style.visibility = open ? "hidden" : ""'), true);
process.exitCode = failures ? 1 : 0;
