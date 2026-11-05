/**
 * 読む画面の 4 つの助け（読んでいた場所・新しい版の知らせ・目次から戻る・端末の声の読み上げ）の検査表。
 *
 *   1. 読んでいた場所 … 段落の書き出しと割合で控え、読み込み直し・版を移る・幅が変わっても同じ段落へ戻す（src/widget/reading/position.ts）
 *   2. 新しい版       … 自分では聞きに行かず、コメントの読み直し（live.ts）の答えを受け取るだけ。押したときだけ読み込み直す
 *   3. 目次から戻る   … 目次で飛ぶ前の履歴に読んでいた場所を書き添え、「戻る」でそこへ戻す（src/widget/reading/nav.ts）
 *   4. 読み上げ       … 端末の中で動く声だけ・サーバーを呼ばない・本文の DOM に足さない（src/widget/reading/read-aloud.ts）
 *
 * jsdom は組み版をしないので、要素の高さと位置は字から決めて置く。本物のブラウザでの動きは手元で確かめる。
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { JSDOM, VirtualConsole } from "jsdom";
import { build } from "esbuild";
import { dir, root } from "./paths.mjs";
import { readWidgetSource } from "./widget-source.mjs";

let failures = 0;
function ok(label, actual, expected) {
  const pass = JSON.stringify(actual) === JSON.stringify(expected);
  if (!pass) failures++;
  console.log(`${pass ? "OK  " : "NG  "} ${label}: ${JSON.stringify(actual)}（期待: ${JSON.stringify(expected)}）`);
}
const read = (file) => readFile(path.join(root, file), "utf8");
const strip = (source) => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

await build({
  stdin: {
    contents: [
      'export * as position from "./src/widget/reading/position";',
      'export * as latest from "./src/widget/reading/page-latest";',
      'export * as reader from "./src/widget/reading/read-aloud";',
      'export { topInset } from "./src/widget/reading/top-inset";',
    ].join("\n"),
    resolveDir: root,
    loader: "ts",
  },
  outfile: `${dir}/reading-place.mjs`,
  bundle: true,
  format: "esm",
  platform: "node",
});

const GLOBALS = ["window", "document", "history", "location", "navigator", "Node", "Text", "NodeFilter", "Element", "HTMLElement", "ShadowRoot", "sessionStorage", "localStorage", "MutationObserver", "AbortController", "Range"];
let current = null;
/** jsdom が「できない」と言ったこと（読み込み直し＝navigation など）。読み込み直したかはここで数える。 */
let unsupported = [];
function scene(body, url = "https://example.com/internal/guide") {
  current?.window.close();
  unsupported = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on("jsdomError", (error) => { unsupported.push(String(error.message)); });
  const instance = new JSDOM(`<!doctype html><html lang="ja"><head></head><body>${body}</body></html>`, { url, pretendToBeVisual: true, virtualConsole });
  const win = instance.window;
  for (const name of GLOBALS) Object.defineProperty(globalThis, name, { value: name === "window" ? win : win[name], configurable: true, writable: true });
  globalThis.getComputedStyle = win.getComputedStyle.bind(win);
  globalThis.requestAnimationFrame = (run) => setTimeout(() => run(0), 0);
  win.requestAnimationFrame = globalThis.requestAnimationFrame;
  win.matchMedia = (query) => ({ matches: false, media: query, addEventListener: () => {}, removeEventListener: () => {} });
  // 組み版の代わり: data-top と data-height を、いまのスクロールから引いた画面の位置として返す
  let scrollY = 0;
  Object.defineProperty(win, "scrollY", { configurable: true, get: () => scrollY });
  win.scrollBy = (options) => { scrollY += options.top ?? 0; };
  win.scrollTo = (options) => { scrollY = options.top ?? 0; };
  win.Element.prototype.getBoundingClientRect = function () {
    const height = Number(this.dataset?.height ?? 0);
    const top = Number(this.dataset?.top ?? 0) - scrollY;
    return { top, bottom: top + height, height, left: 0, right: 800, width: 800, x: 0, y: top, toJSON: () => null };
  };
  win.Element.prototype.getClientRects = function () { return Number(this.dataset?.height ?? 0) > 0 ? [this.getBoundingClientRect()] : []; };
  current = instance;
  return { win, scrollTo: (y) => { scrollY = y; }, scrolled: () => scrollY };
}
const settle = () => new Promise((done) => setTimeout(done, 20));

const { position, latest, reader, topInset } = await import(`${dir}/reading-place.mjs`);
const PLACE = strip(await read("src/widget/reading/position.ts"));
const NAV = strip(await read("src/widget/reading/nav.ts"));
const LATEST = strip(await read("src/widget/reading/page-latest.ts"));
const BAR = strip(await read("src/widget/reading/latest-bar.ts"));
const READER = strip(await read("src/widget/reading/read-aloud.ts"));
const INSET = strip(await read("src/widget/reading/top-inset.ts"));
const HISTORY = strip(await read("src/widget/comments/history.ts"));
const EDITOR = strip(await read("src/widget/editor/editor.ts"));
const WIDGET = await readWidgetSource();

const ARTICLE = `<main>
<h2 data-top="0" data-height="40">はじめに</h2><p data-top="40" data-height="200">はじめの本文。長い段落。</p>
<h2 data-top="240" data-height="40">使い方</h2><p data-top="280" data-height="400">使い方の本文。ここを読んでいる。</p>
<p data-top="680" data-height="200">終わりの本文。</p></main>`;

console.log("--- 1. 読んでいた場所 ---");
{
  const { scrollTo, scrolled } = scene(ARTICLE);
  ok("先頭を読んでいるなら控えない", position.placeAt(0), null);
  scrollTo(380);
  const place = position.placeAt(0);
  ok("読む線に掛かった段落を、書き出しの字と割合で控える", [place?.block?.text, place?.block?.ratio], ["使い方の本文。ここを読んでいる。", 0.25]);
  ok("予備に直前の見出しと、そこからの距離", [place?.heading?.text, place?.heading?.offset], ["使い方", 140]);
  // 版が変わって上に段落が足された: 同じ段落は 300px 下にある
  for (const node of document.querySelectorAll("[data-top]")) node.dataset.top = String(Number(node.dataset.top) + 300);
  scrollTo(380);
  ok("版が変わっても同じ段落へ戻す（画素では戻さない）", [position.scrollToPlace(place, 0), scrolled()], [true, 680]);
  position.carryPlace();
  const kept = JSON.parse(sessionStorage.getItem("surprise-pages:reading-place") ?? "null");
  ok("移る前の控えは道筋つき・このタブにだけ", [kept?.path, kept?.reason, kept?.place?.block?.text], ["/internal/guide", "move", "使い方の本文。ここを読んでいる。"]);
}
{
  // 読み込み直した先で戻す
  const { win, scrolled } = scene(ARTICLE);
  sessionStorage.setItem("surprise-pages:reading-place", JSON.stringify({ path: "/internal/guide", at: Date.now(), reason: "move", place: { block: { text: "使い方の本文。ここを読んでいる。", nth: 0, ratio: 0.25 }, heading: null } }));
  position.restoreCarriedPlace({ ready: Promise.resolve() });
  await settle();
  ok("開き直したら控えた段落へ戻す", scrolled(), 380);
  ok("控えは 1 度だけ使う", sessionStorage.getItem("surprise-pages:reading-place"), "");
  void win;
}
{
  const { scrolled } = scene(ARTICLE, "https://example.com/internal/other");
  sessionStorage.setItem("surprise-pages:reading-place", JSON.stringify({ path: "/internal/guide", at: Date.now(), reason: "move", place: { block: { text: "使い方の本文。ここを読んでいる。", nth: 0, ratio: 0.25 }, heading: null } }));
  position.restoreCarriedPlace({ ready: Promise.resolve() });
  await settle();
  ok("別のページの控えでは戻さない", scrolled(), 0);
}
{
  const { scrolled } = scene(ARTICLE);
  sessionStorage.setItem("surprise-pages:reading-place", JSON.stringify({ path: "/internal/guide", at: Date.now() - 61_000, reason: "move", place: { block: { text: "使い方の本文。ここを読んでいる。", nth: 0, ratio: 0.25 }, heading: null } }));
  position.restoreCarriedPlace({ ready: Promise.resolve() });
  await settle();
  ok("60 秒より古い控えでは戻さない", scrolled(), 0);
}
{
  const { scrolled } = scene(ARTICLE);
  sessionStorage.setItem("surprise-pages:reading-place", JSON.stringify({ path: "/internal/guide", at: Date.now(), reason: "leave", place: { block: { text: "使い方の本文。ここを読んでいる。", nth: 0, ratio: 0.25 }, heading: null } }));
  position.restoreCarriedPlace({ ready: Promise.resolve() });
  await settle();
  ok("離れたときの控えは、リンクから開き直した人には押し付けない", scrolled(), 0);
}
{
  const { win, scrollTo, scrolled } = scene(ARTICLE);
  scrollTo(380);
  // 上端に帯が出た: 本文が 48px 下がる（余白を書いたぶんだけ要素が下へ動く、を置く）
  position.keepInPlace(position.spotHere(0), () => { for (const node of document.querySelectorAll("[data-top]")) node.dataset.top = String(Number(node.dataset.top) + 48); });
  ok("上で何かが伸びても、読んでいる段落は同じ高さ", scrolled(), 428);
  void win;
}
ok("立ち上げで 戻す・離れるたびに控える・幅が変わっても保つ をまとめて呼ぶ", /function startReadingPlace\(\): void \{\s*restoreCarriedPlace\(\);\s*carryOnLeave\(\);\s*keepPlaceOnResize\(\);/.test(PLACE), true);
ok("道具箱の立ち上げで 1 度呼ぶ", /function start\(\): void \{[\s\S]{0,400}startReadingPlace\(\);/.test(WIDGET), true);
ok("読み込み直したあと、読む人が自分で送ったら引き戻さない", /if \(moved \|\| !scrollToPlace\(place\)\) return;/.test(PLACE), true);
ok("スライドの枚は #N が持つので、段落では戻さない", /document\.body\.hasAttribute\(DECK_MARK\)\) return;/.test(PLACE), true);
ok("上端の帯の余白を書き直すときも、読んでいる段落を動かさない", /keepInPlace\(spotHere\(\), \(\) => \{ html\.style\.paddingTop = paddingTop; \}\)/.test(INSET), true);
ok("版を移る前に控え、URL の # は持っていかない", /function moveTo[\s\S]*?carryPlace\(\);[\s\S]*?url\.hash = "";/.test(HISTORY) && !/window\.location\.href = compareUrl/.test(HISTORY), true);
ok("戻る・進むで版が変わって読み込み直すときも控える", /carryPlace\(\);\s*window\.location\.reload\(\);/.test(HISTORY), true);
ok("見比べの赤入れの出し入れでも段落を動かさない", (HISTORY.match(/keepInPlace\(spotHere\(\)/g) ?? []).length, 3);
ok("本文を直して保存し、読み込み直すときも控える", /carryPlace\(\);\s*window\.location\.reload\(\);/.test(EDITOR), true);
ok("取り込みのあとの「読み直す」も控える", /carryPlace\(\); window\.location\.reload\(\);/.test(WIDGET), true);

console.log("\n--- 2. 新しい版の知らせ ---");
const SHOWN = "a".repeat(40);
const NEWER = "b".repeat(40);
const versionBody = (sha) => ({ available: true, versions: [{ sha, shortSha: sha.slice(0, 7), number: 4, authorName: "山田 花子", committedAt: new Date().toISOString(), message: "", changeCount: null }], more: false });
function fetchScene() {
  const view = scene(ARTICLE);
  const asked = [];
  let answer = { status: 200, body: versionBody(NEWER) };
  globalThis.fetch = view.win.fetch = async (target) => {
    asked.push(String(target));
    return { ok: answer.status < 400, status: answer.status, json: async () => answer.body };
  };
  return { ...view, asked, answer: (next) => { answer = next; }, bar: () => document.querySelector("surprise-latest")?.shadowRoot ?? null };
}
{
  const view = fetchScene();
  let unsent = false;
  const watcher = new latest.PageLatest({ slug: "internal/guide", shownVersion: SHOWN, unsent: () => unsent });
  watcher.observe(SHOWN);
  await settle();
  ok("開いたときと同じ版なら聞きに行かない", [view.asked.length, view.bar()], [0, null]);
  watcher.observe(NEWER);
  await settle();
  ok("目印が変わったら、誰がいつ更新したかを 1 度だけ聞く（履歴の口のいまの 1 版）", view.asked, ["/api/history?page=internal%2Fguide&latest=1"]);
  ok("上端に 1 行出す", view.bar()?.querySelector(".text")?.textContent, "新しい版があります");
  ok("誰が更新したかを添える", (view.bar()?.querySelector(".detail")?.textContent ?? "").includes("山田 花子 が更新"), true);
  ok("帯の高さを上端の帯の持ち主に届ける", topInset.total() >= 44, true);
  watcher.observe(NEWER);
  watcher.observe("c".repeat(40));
  await settle();
  ok("見つけたら聞き直さない", view.asked.length, 1);
  unsent = true;
  const reloaded = () => unsupported.filter((message) => /navigation/i.test(message)).length;
  view.bar()?.querySelector("button")?.click();
  ok("書きかけのコメントがあれば、同じ帯で 1 度だけ確かめる", [reloaded(), view.bar()?.querySelector(".detail")?.textContent], [0, "書きかけのコメントは消えます。もう一度押すと再読み込みします"]);
  view.scrollTo(380);
  view.bar()?.querySelector("button")?.click();
  const kept = JSON.parse(sessionStorage.getItem("surprise-pages:reading-place") ?? "null");
  ok("もう 1 度押したら、読んでいた段落を控えて読み込み直す", [reloaded(), kept?.place?.block?.text], [1, "使い方の本文。ここを読んでいる。"]);
  watcher.dispose();
  ok("片付けたら帯と高さも消える", [view.bar(), topInset.total()], [null, 0]);
}
{
  const view = fetchScene();
  view.answer({ status: 401, body: {} });
  const watcher = new latest.PageLatest({ slug: "internal/guide", shownVersion: SHOWN, unsent: () => false });
  watcher.observe(NEWER);
  await settle();
  watcher.observe("c".repeat(40));
  await settle();
  ok("ログインが切れたら聞くのをやめる", view.asked.length, 1);
  watcher.dispose();
}
ok("自分では聞きに行く時機を持たない（タイマーで聞かない・見え隠れを聞かない）", /setInterval|visibilitychange|addEventListener\("focus"/.test(LATEST) || /setTimeout\([^)]*ask/.test(LATEST), false);
ok("時機はコメントの読み直しの答え（applyLoaded）から受け取る", /showCurrentVersion\(\);\s*watchForUpdates\(value\.currentVersion\);/.test(WIDGET), true);
ok("見張るのは清書で、履歴を見てよい人の、いまの版の画面だけ", /if \(currentVersion === null \|\| historyFeature\.loadedVersion !== null\) return;\s*if \(!state\.features\.history \|\| !isCleanCopyDocument\(document\)\) return;/.test(WIDGET), true);
ok("見張らない画面では部品を読まない", /void import\("\.\.\/reading\/page-latest"\)/.test(WIDGET) && !/from "\.\.\/reading\/page-latest"/.test(WIDGET.replace(/import type[^\n]*/g, "")), true);
ok("押してくる仕組みは使わない", /WebSocket|EventSource|realtime/i.test(LATEST + BAR), false);
ok("帯は高さを届けるだけで、本文の余白を書かない", /topInset\.set\("latest", TITLEBAR_HEIGHT\)/.test(BAR) && !/paddingTop|scrollPaddingTop/.test(BAR + LATEST), true);
ok("帯は印刷に出さない", /@media print \{ :host \{ display: none !important; \} \}/.test(BAR), true);
ok("帯の明暗は現在地の行と同じくページの地から読む", /paintPageTone\(host\)/.test(BAR) && /paintPageTone\(this\.host\)/.test(await read("src/widget/reading/location-bar.ts")), true);
ok("帯に色を足さない", /#[0-9a-f]{3,6}\b|rgb\(/i.test(BAR), false);
ok("読み上げは何が起きたかだけ（○分前は範囲の外）", /text\.setAttribute\("role", "status"\)/.test(BAR) && !/detail\.setAttribute\("role"/.test(BAR), true);

console.log("\n--- 3. 目次から戻る ---");
ok("目次で飛ぶ前に、いまの履歴へ読んでいた場所を書き添える", (NAV.match(/rememberPlaceInHistory\(\);\s*history\.pushState\(\{ \[READING_JUMP\]/g) ?? []).length, 2);
ok("「戻る」で来たら、書き添えた場所へ戻す", /const place = placeInHistory\(history\.state\);[\s\S]*?scrollToPlace\(place\)/.test(NAV), true);
ok("読み込み直し・戻る進むでは、URL の見出しへ連れて行き直さない", /if \(window\.location\.hash && !reopenedHere\(\)\) requestAnimationFrame\(this\.onHash\);/.test(NAV), true);
{
  const { scrollTo, scrolled } = scene(ARTICLE);
  scrollTo(380);
  history.replaceState({ other: 1 }, "");
  position.rememberPlaceInHistory();
  const place = position.placeInHistory(history.state);
  ok("履歴の印は今ある中身を消さずに足す", [history.state.other, place?.block?.text], [1, "使い方の本文。ここを読んでいる。"]);
  history.pushState({ surpriseReadingJump: "a" }, "", "#a");
  scrollTo(0);
  history.back();
  await settle();
  ok("戻った先の履歴から、読んでいた場所を読める", position.scrollToPlace(position.placeInHistory(history.state), 0) && scrolled(), 380);
}

console.log("\n--- 4. 端末の声の読み上げ ---");
function speechScene(voices) {
  const view = scene(`<main><h1 data-top="0" data-height="40">題</h1><p data-top="40" data-height="80">ひとつめ。ふたつめ！</p><pre data-top="120" data-height="40">コードは読まない。</pre><p data-top="160" data-height="40" aria-hidden="true">隠した注記。</p><p data-top="200" data-height="40">みっつめ</p></main><surprise-comments data-top="0" data-height="40">道具箱</surprise-comments>`);
  // jsdom の範囲は位置を持たない。文の位置は、その文が始まる段落の位置として置く
  view.win.Range.prototype.getBoundingClientRect = function () { return this.startContainer.parentElement.getBoundingClientRect(); };
  view.win.Range.prototype.getClientRects = function () { return [this.getBoundingClientRect()]; };
  const spoken = [];
  const synth = {
    getVoices: () => voices,
    speak: (utterance) => { spoken.push({ text: utterance.text, voice: utterance.voice?.voiceURI ?? null, rate: utterance.rate, utterance }); },
    cancel: () => {},
    pause: () => {},
    resume: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
  };
  class Utterance { constructor(text) { this.text = text; } }
  Object.defineProperty(view.win, "speechSynthesis", { configurable: true, value: synth });
  view.win.SpeechSynthesisUtterance = Utterance;
  globalThis.SpeechSynthesisUtterance = Utterance;
  let fetched = 0;
  globalThis.fetch = view.win.fetch = async () => { fetched++; return { ok: false, status: 500, json: async () => ({}) }; };
  return { ...view, spoken, fetched: () => fetched };
}
const local = { voiceURI: "com.apple.voice.compact.ja-JP.Kyoko", name: "Kyoko", lang: "ja-JP", localService: true, default: true };
const otoya = { voiceURI: "com.apple.voice.compact.ja-JP.Otoya", name: "Otoya", lang: "ja-JP", localService: true, default: false };
const cloud = { voiceURI: "Google 日本語", name: "Google 日本語", lang: "ja-JP", localService: false, default: true };
{
  const view = speechScene([cloud, local, otoya]);
  const sentences = reader.collectSentences(document.querySelector("main"), "surprise-comments");
  ok("文に分け、コード・隠した注記・道具箱は読まない", sentences.map((sentence) => sentence.text), ["題", "ひとつめ。", "ふたつめ！", "みっつめ"]);
  const problems = [];
  let changes = 0;
  localStorage.setItem("surprise-pages:read-aloud-voice", otoya.voiceURI);
  localStorage.setItem("surprise-pages:read-aloud-rate", "1.5");
  const aloud = new reader.ReadAloud({ root: () => document.querySelector("main"), ownChrome: "surprise-comments", onChange: () => { changes++; }, onProblem: (text) => problems.push(text) });
  aloud.toggle();
  await settle();
  ok("個人設定の声と速さで、見えている最初の文から読む", view.spoken.map(({ text, voice, rate }) => [text, voice, rate]), [["題", otoya.voiceURI, 1.5]]);
  ok("読んでいる間は active", [aloud.active, changes > 0], [true, true]);
  view.spoken.at(-1).utterance.onend();
  ok("読み終えたら次の文", view.spoken.at(-1).text, "ひとつめ。");
  aloud.step(1);
  ok("→ で 1 文進む", view.spoken.at(-1).text, "ふたつめ！");
  aloud.cycleRate();
  ok("速さを変えたら、いまの文から新しい速さで読み直し、控える", [view.spoken.at(-1).text, view.spoken.at(-1).rate, localStorage.getItem("surprise-pages:read-aloud-rate")], ["ふたつめ！", 2, "2"]);
  aloud.stop();
  ok("止めたら読んでいない", aloud.active, false);
  ok("サーバーを呼ばない", view.fetched(), 0);
  ok("本文に要素も属性も足さない", document.querySelector("main").outerHTML.includes("surprise-read-aloud"), false);
}
{
  const view = speechScene([cloud]);
  const problems = [];
  const aloud = new reader.ReadAloud({ root: () => document.querySelector("main"), ownChrome: "surprise-comments", onChange: () => {}, onProblem: (text) => problems.push(text) });
  aloud.toggle();
  await settle();
  ok("端末の中の声が無ければ、外へ送る声で代わりに読まず、読めないと知らせる", [view.spoken.length, problems, aloud.active], [0, ["この端末に読み上げの声が入っていないため、読み上げられません"], false]);
}
ok("読み上げの部品はサーバーを呼ばない（取り寄せの関数を持たない）", /fetch\(|shared\/api/.test(READER), false);
ok("スライドには出さない（記事と清書だけ）", /function readsAsArticle\(\): boolean \{\s*return !document\.body\.hasAttribute\("data-deck"\);/.test(WIDGET), true);
ok("選んだ文から読む入口を、コメント・コピーと同じ列に出す", /appendReadFromButton\(quoteRow\);/.test(WIDGET) && /appendReadFromButton\(selectionBar\);/.test(WIDGET), true);
ok("本文を直し始めたら読み上げを止める", /if \(root === null \|\| editorActive\(\)\) return;\s*readAloud\.stop\(\);/.test(WIDGET), true);

current?.window.close();
process.exitCode = failures ? 1 : 0;
