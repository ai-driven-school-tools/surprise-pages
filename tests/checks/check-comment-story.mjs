import { readWidgetSource } from "./widget-source.mjs";
/**
 * コメントが付いたあと本文が直されたとき、当時といまが読めるかを確かめる。
 *
 * 見るのは 4 つ。
 *   1. 突き合わせの正本は src/lib/comments/outcome.ts で、画面はそれを描くだけか
 *   2. カードに「当時 → コメント → いま」がこの順で出るか
 *   3. 版が変わっただけの注記（どこが直ったか分からない）を出していないか
 *   4. 直した直後の帯と、履歴の「その版のコメント」があるか
 *
 * 保管庫にもネットワークにも繋がない。サーバーの応答は手元で作った作り物。
 */
import { readFile } from "node:fs/promises";

import { root, dir } from "./paths.mjs";
const { JSDOM } = await import("jsdom");
const { build } = await import(`${root}/node_modules/esbuild/lib/main.js`);

await build({
  entryPoints: [`${root}/src/widget/comments/comments.ts`],
  outfile: `${dir}/cs-widget.mjs`,
  bundle: true,
  format: "esm",
  platform: "neutral", mainFields: ["module", "main"],
});

let fails = 0;
const ok = (label, actual, expected) => {
  const pass = String(actual) === String(expected);
  if (!pass) fails += 1;
  console.log(`${pass ? "OK  " : "NG  "} ${label}: ${actual}（期待: ${expected}）`);
};

const strip = (text) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
const WIDGET = strip(await readWidgetSource());
const STYLES = strip(await readFile(`${root}/src/widget/shared/styles.ts`, "utf8"));
const API = strip(await readFile(`${root}/src/widget/shared/api.ts`, "utf8"));
const EDITOR = strip(await readFile(`${root}/src/widget/editor/editor.ts`, "utf8"));
const ROUTE = strip(await readFile(`${root}/src/app/api/comments/outcomes/route.ts`, "utf8"));
const LIB = strip(await readFile(`${root}/src/lib/comments/outcome.ts`, "utf8"));
// 文言は辞書（日本語が正本）。画面はその鍵を引き、字そのものは辞書で見る
const JA = await readFile(`${root}/src/lib/i18n/messages/ja/toolbox.ts`, "utf8");

const V1 = "a".repeat(40);
const V2 = "b".repeat(40);

console.log("--- 1. 正本と入口 ---");
ok("突き合わせの正本がある", /export function outcomeOfQuote\(/.test(LIB), true);
ok("画面は正本の物語だけを出す", /isVisibleOutcome\(outcome\.state\)/.test(WIDGET), true);
ok("当時といまを画面側で計算していない", /diffWordsWithSpace/.test(WIDGET), false);
ok("取り寄せ口がある", /export async function loadOutcomes\(/.test(API), true);
ok("窓口は道具箱の門を通る", /canUsePageTools\(viewer\)/.test(ROUTE), true);
ok("門も通る", /openPage\(organization, viewer, page\.slug\)/.test(ROUTE), true);
ok("閉じたときは空を返す", /function closed\(\): OutcomesResponse \{/.test(ROUTE), true);
ok("閉じた答えは 200", /if \(!canUsePageTools\(viewer\)\) return jsonResponse\(closed\(\), 200\)/.test(ROUTE), true);
ok("コメントも門のあとで取る", ROUTE.indexOf("if (!gate.ok)") < ROUTE.indexOf("await listComments("), true);
ok("当時の本文は門のあとで取る", ROUTE.indexOf("if (!gate.ok)") < ROUTE.indexOf("await htmlForOutcomes("), true);
ok("直した人も門のあとで取る", ROUTE.indexOf("if (!gate.ok)") < ROUTE.indexOf("listVersions(gate.page"), true);
ok("画面は版の一覧から直した人を拾わない", /withChangeAttribution/.test(WIDGET), false);

console.log("\n--- 2. カードの物語 ---");
ok("当時の札がある", /storyLabel\(parent, t\("toolbox\.story\.then"\)/.test(WIDGET) && /then: "当時"/.test(JA), true);
ok("コメントの札がある", /storyLabel\(parent, t\("toolbox\.common\.comment"\)/.test(WIDGET) && /comment: "コメント"/.test(JA), true);
ok("いまの札がある", /storyLabel\(parent, t\("toolbox\.story\.now"\)/.test(WIDGET) && /now: "いま"/.test(JA), true);
ok("コメントした人とときを出す", /commentStoryMeta\(/.test(WIDGET), true);
ok("直した人とときを出す", /changeStoryMeta\(/.test(WIDGET), true);
ok("コメントを直したときを出す", /commentWasEdited\(/.test(WIDGET), true);
ok("コメントの書き直しは本文の直しと動詞を分ける", /t\("toolbox\.story\.edited"\)/.test(WIDGET) && /edited: "書き直した"/.test(JA), true);
ok("たった今には助詞を付けない", /t\("toolbox\.story\.editedJustNow"\)/.test(WIDGET) && /editedJustNow: "たった今書き直した"/.test(JA), true);
ok("無くなった文を言う", /t\("toolbox\.story\.gone"\)/.test(WIDGET) && /この文は、あとの版で無くなりました/.test(JA), true);
ok("直しを見る口がある", /t\("toolbox\.story\.seeChange"\)/.test(WIDGET) && /この箇所の直しを見る/.test(JA), true);
ok("版が変わっただけの注記は無い", /ページが更新されています/.test(WIDGET), false);
ok("引用が見つからない注記は物語があるときは出さない", /missingQuoteNote\(/.test(WIDGET), true);
ok("覗き見も同じ組み立てを通る", /(?:listFeature\.)?appendQuoteStory\(body, comment, "pop-quote", "peek-text"\)/.test(WIDGET), true);
ok("一覧も同じ組み立てを通る", /(?:listFeature\.)?appendQuoteStory\(card, comment, "quote", "body"\)/.test(WIDGET), true);

console.log("\n--- 3. 直した直後と履歴 ---");
ok("保存のあとに合図を残す", /onSaved: \(\{ baseVersionId \}\) => (?:listFeature\.)?stashEditReview\(baseVersionId\)/.test(WIDGET), true);
ok("編集画面は合図を呼ぶ", /hooks\.onSaved\?\.\(\{ baseVersionId \}\)/.test(EDITOR), true);
ok("まとめて解決にする口がある", /resolve\.textContent = t\("toolbox\.list\.bulk\.resolve", \{ count \}\);/.test(WIDGET) && /resolve: \{ one: "\{count\} 件を解決にする"/.test(JA), true);
console.log("      ※ 何件動くかを字に出す（帯の下に並んでいるのがその中身）");
ok("1 件ずつ何度も叩かない", /for \(const id of review\.commentIds\)/.test(WIDGET), false);
ok("まとめての口を 1 回通る", /resolveComments\(state\.slug, review\.commentIds, true\)/.test(WIDGET), true);
ok("履歴にその版のコメントを出す", /t\("toolbox\.history\.relatedComments"\)/.test(WIDGET) && /この版のときに付いていたコメント/.test(JA), true);
ok("履歴の行も同じ物語を通る", /(?:listFeature\.)?appendQuoteStory\(row, comment, "related-quote", "related-body", false\)/.test(WIDGET), true);
ok("履歴の行は正本の触れ判定を使う", /changeTouchesOutcome\(change, outcome\)/.test(WIDGET), true);
ok("引用が見つからない注記は物語の到着を待つ", /awaitingOutcome\(/.test(WIDGET), true);

console.log("\n--- 4. 見た目 ---");
ok("当時いまの札は読み飛ばしてよい大きさ", /\.outcome-label \{[\s\S]*?font-size: var\(--font-sm\)/.test(STYLES), true);
ok("人とときは札の右に置く", /\.outcome-meta \{/.test(STYLES), true);
ok("物語の引用は読ませる濃さ", /\.quote\.is-story,/.test(STYLES) && /color: var\(--text\)/.test(STYLES), true);
ok("覗き見の物語は 2 行で切らない", /\.pop-quote\.is-story \{[\s\S]*?-webkit-line-clamp: unset/.test(STYLES), true);
const storyLink = /\.story-link \{[^}]*\}/.exec(STYLES)?.[0] ?? "";
const banner = /\.story-banner \{[^}]*\}/.exec(STYLES)?.[0] ?? "";
ok("直しを見る口に下線を引かない", /text-decoration:\s*none/.test(storyLink), true);
ok("直した直後に囲みを足していない", /border/.test(banner), false);
ok("直した直後に地色を敷いていない", /background/.test(banner), false);

const author = { kind: "member", name: "作 二郎", image: null };
const SAMPLE = [
  {
    id: "changed-1",
    pageSlug: "internal/demo",
    parentId: null,
    quote: "採用は通年で行っています。",
    quoteContext: { beforeText: "", afterText: "" },
    body: "募集期間を書いてほしい",
    kind: "comment",
    priority: "must",
    author,
    mine: false,
    pageVersion: V1,
    resolvedAt: null,
    resolvedBy: null,
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
  },
  {
    id: "same-1",
    pageSlug: "internal/demo",
    parentId: null,
    quote: "解約率は横ばいです。",
    quoteContext: { beforeText: "", afterText: "" },
    body: "この数字は最新ですか",
    kind: "comment",
    priority: "want",
    author,
    mine: false,
    pageVersion: V1,
    resolvedAt: null,
    resolvedBy: null,
    createdAt: "2026-08-02T00:00:00.000Z",
    updatedAt: "2026-08-02T00:00:00.000Z",
  },
  {
    id: "gone-1",
    pageSlug: "internal/demo",
    parentId: null,
    quote: "来月から受付を始めます。",
    quoteContext: { beforeText: "", afterText: "" },
    body: "開始日が分からない",
    kind: "comment",
    priority: "better",
    author,
    mine: false,
    pageVersion: V1,
    resolvedAt: null,
    resolvedBy: null,
    createdAt: "2026-08-03T00:00:00.000Z",
    updatedAt: "2026-08-10T00:00:00.000Z",
  },
];

const OUTCOMES = [
  {
    commentId: "changed-1",
    state: "changed",
    thenText: "採用は通年で行っています。",
    nowText: "採用は毎年4月から6月に行っています。",
    changedBy: "直 花子",
    changedAt: "2026-08-20T00:00:00.000Z",
  },
  {
    commentId: "same-1",
    state: "same",
    thenText: "解約率は横ばいです。",
    nowText: "解約率は横ばいです。",
    changedBy: null,
    changedAt: null,
  },
  {
    commentId: "gone-1",
    state: "gone",
    thenText: "来月から受付を始めます。",
    nowText: null,
    changedBy: "直 花子",
    changedAt: "2026-08-21T00:00:00.000Z",
  },
];

const settle = () => new Promise((done) => setTimeout(done, 40));

function installGlobals(win) {
  const names = [
    "window",
    "document",
    "navigator",
    "location",
    "HTMLElement",
    "Element",
    "Node",
    "Range",
    "getComputedStyle",
    "requestAnimationFrame",
    "cancelAnimationFrame",
    "matchMedia",
    "fetch",
    "MutationObserver",
    "ResizeObserver",
    "IntersectionObserver",
    "getSelection",
    "NodeFilter",
    "Node",
    "Text",
    "Document",
    "Comment",
    "DocumentFragment",
    "CharacterData",
  ];
  for (const name of names) {
    if (!(name in win)) continue;
    const held = win[name];
    const value = typeof held === "function" && !/^[A-Z]/.test(name) ? held.bind(win) : held;
    Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
  }
}

async function mount() {
  const html =
    `<!doctype html><html><body>` +
    `<p>採用は毎年4月から6月に行っています。</p>` +
    `<p>解約率は横ばいです。</p>` +
    `<script src="/comments-widget.js/x" data-page="internal/demo" defer></script>` +
    `</body></html>`;
  const dom = new JSDOM(html, {
    url: "https://example.com/internal/demo",
    pretendToBeVisual: true,
  });
  const win = dom.window;
  win.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  win.scrollTo = () => {};
  win.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  win.IntersectionObserver = win.ResizeObserver;
  win.fetch = async (target) => {
    const url = String(target);
    if (url.startsWith("/api/comments/outcomes")) {
      return { ok: true, status: 200, json: async () => ({ outcomes: OUTCOMES }) };
    }
    if (url.startsWith("/api/comments")) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          viewer: { kind: "member", name: "作 二郎", image: null },
          comments: SAMPLE,
          currentVersion: V2,
          features: {
            tools: true,
            history: true,
            slack: false,
            sharing: false,
            slackThread: false,
            edit: true,
          },
        }),
      };
    }
    return { ok: true, status: 200, json: async () => ({}) };
  };

  installGlobals(win);
  await import(`${dir}/cs-widget.mjs?mount=${Date.now()}`);
  await settle();
  await settle();

  const host = win.document.querySelector("surprise-comments");
  const shadow = host === null ? null : host.shadowRoot;
  const press = async (node) => {
    installGlobals(win);
    node.dispatchEvent(new win.MouseEvent("click", { bubbles: true }));
    await settle();
  };
  const buttons = (selector) => [...(shadow === null ? [] : shadow.querySelectorAll(selector))];
  const openComments = async () => {
    const entry = buttons(".bar button").find((one) => one.title === "コメント");
    if (entry === undefined) return false;
    await press(entry);
    await settle();
    return true;
  };
  installGlobals(win);
  return { win, shadow, press, buttons, openComments };
}

console.log("\n--- 5. 本物の板に載せる ---");
const screen = await mount();
ok("道具箱が出る", screen.shadow !== null, true);
ok("一覧を開けた", await screen.openComments(), true);

const cards = [...(screen.shadow?.querySelectorAll(".card") ?? [])];
ok("カードが 3 件", cards.length, 3);

const changedCard = cards.find((one) => one.dataset.cardId === "changed-1");
const sameCard = cards.find((one) => one.dataset.cardId === "same-1");
const goneCard = cards.find((one) => one.dataset.cardId === "gone-1");

const beats = (card) => [...(card?.querySelectorAll(".outcome-beat") ?? [])].map((one) => one.textContent);
const metaOf = (card, beat) => {
  const row = [...(card?.querySelectorAll(".outcome-label") ?? [])].find(
    (one) => one.querySelector(".outcome-beat")?.textContent === beat,
  );
  return row?.querySelector(".outcome-meta")?.textContent ?? "";
};
ok("直されたカードに当時とコメントといま", beats(changedCard).join("/"), "当時/コメント/いま");
ok(
  "いまの文が出る",
  changedCard?.textContent.includes("採用は毎年4月から6月に行っています。"),
  true,
);
ok("コメントした人が出る", metaOf(changedCard, "コメント").includes("作 二郎"), true);
ok("直した人が出る", metaOf(changedCard, "いま").includes("直 花子"), true);
ok("当時に人は載せない", metaOf(changedCard, "当時"), "");
ok("無くなった文も直した人が出る", metaOf(goneCard, "いま").includes("直 花子"), true);
ok(
  "コメント本文は当時といまの間",
  [...(changedCard?.children ?? [])]
    .map((node) => node.className.split(" ")[0])
    .slice(1, 7)
    .join("/"),
  "outcome-label/quote/outcome-label/body/outcome-label/quote",
);
ok(
  "物語の引用は読ませる印が付く",
  [...(changedCard?.querySelectorAll(".quote") ?? [])].every((one) => one.classList.contains("is-story")),
  true,
);
ok(
  "直しを見る口が出る",
  [...(changedCard?.querySelectorAll(".story-link") ?? [])].some((one) => one.textContent === "この箇所の直しを見る"),
  true,
);

ok("残っている引用には当時いまを出さない", beats(sameCard).join("/"), "");
ok("残っている引用の本文は残る", sameCard?.textContent.includes("この数字は最新ですか"), true);

ok("無くなったカードに当時とコメントといま", beats(goneCard).join("/"), "当時/コメント/いま");
ok("無くなったことを書く", goneCard?.textContent.includes("この文は、あとの版で無くなりました"), true);
ok("コメントを書き直したことが出る", metaOf(goneCard, "コメント").includes("書き直した"), true);
ok("コメントを書き直したときも出る", /に書き直した/.test(metaOf(goneCard, "コメント")), true);

ok(
  "版が変わっただけの注記は画面に無い",
  screen.shadow?.textContent.includes("ページが更新されています"),
  false,
);

// 道具箱は見ている間、定期にコメントを読み直す（src/widget/comments/live.ts）。jsdom に載せたままなので、検査が済んだらここで終える
process.exit(fails > 0 ? 1 : 0);
