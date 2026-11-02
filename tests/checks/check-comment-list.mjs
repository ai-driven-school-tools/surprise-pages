import { readWidgetSource } from "./widget-source.mjs";
/**
 * コメント一覧の絞り込み・並べ替えと、カードの操作行を確かめる。
 *
 * 見るのは 4 つ。
 *   1. 並びと絞り込みの決まり（素の関数）
 *   2. 口は常時のタブではなく、頭の静かな絵記号
 *   3. カードの操作は絵記号だけ・右寄せ
 *   4. 本物の DOM に載せて、選んだら一覧が入れ替わる
 *
 * 保管庫にもネットワークにも繋がない。
 */
import { readFile } from "node:fs/promises";

import { root, dir } from "./paths.mjs";
const { JSDOM } = await import("jsdom");
const { build } = await import(`${root}/node_modules/esbuild/lib/main.js`);

await build({
  entryPoints: [`${root}/src/widget/comments/comment-list.ts`],
  outfile: `${dir}/cl-list.mjs`,
  bundle: true,
  format: "esm",
  platform: "neutral", mainFields: ["module", "main"],
});
await build({
  entryPoints: [`${root}/src/widget/comments/comments.ts`],
  outfile: `${dir}/cl-widget.mjs`,
  bundle: true,
  format: "esm",
  platform: "neutral", mainFields: ["module", "main"],
});

const {
  DEFAULT_FILTER,
  DEFAULT_SORT,
  FILTER_CHOICES,
  SORT_CHOICES,
  compareComments,
  filterFor,
  filterRows,
  isListDefault,
  listSummary,
  listTail,
  matchesFilter,
  priorityRank,
  sortComments,
} = await import(`${dir}/cl-list.mjs`);

let fails = 0;
const ok = (label, actual, expected) => {
  const pass = String(actual) === String(expected);
  if (!pass) fails += 1;
  console.log(`${pass ? "OK  " : "NG  "} ${label}: ${actual}（期待: ${expected}）`);
};

const strip = (text) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
const WIDGET = strip(await readWidgetSource());
const STYLES = strip(await readFile(`${root}/src/widget/shared/styles.ts`, "utf8"));
const LIST = strip(await readFile(`${root}/src/widget/comments/comment-list.ts`, "utf8"));

const author = { kind: "member", name: "作 二郎", image: null };
const comment = (over) => ({
  id: "x",
  pageSlug: "internal/demo",
  parentId: null,
  quote: null,
  quoteContext: null,
  body: "本文",
  kind: "comment",
  priority: "want",
  author,
  mine: false,
  pageVersion: "abc",
  resolvedAt: null,
  resolvedBy: null,
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z",
  ...over,
});

const positions = (entries) => new Map(entries);
const done = "2026-08-02T00:00:00.000Z";
const none = new Set();
const counts = (over) => ({ all: 0, open: 0, changed: 0, resolved: 0, ...over });

console.log("--- 1. 絞り込み ---");
ok("既定は未解決", DEFAULT_FILTER, "open");
ok("未解決は解決日が空", matchesFilter(comment({ resolvedAt: null }), "open", none), true);
ok("未解決は解決済みを落とす", matchesFilter(comment({ resolvedAt: done }), "open", none), false);
ok("解決済は未解決を落とす", matchesFilter(comment({ resolvedAt: null }), "resolved", none), false);
ok("すべてはどちらも残す", matchesFilter(comment({ resolvedAt: done }), "all", none), true);
ok("言葉は /activity と同じ（未解決）", FILTER_CHOICES.find((one) => one[0] === "open")[1], "未解決");
ok("言葉は /activity と同じ（解決済）", FILTER_CHOICES.find((one) => one[0] === "resolved")[1], "解決済");

console.log("\n--- 1b. 本文が変わった ---");
const moved = new Set(["x"]);
ok("変わった目印があれば残す", matchesFilter(comment({ id: "x" }), "changed", moved), true);
ok("目印が無ければ落とす", matchesFilter(comment({ id: "y" }), "changed", moved), false);
ok(
  "片付いたものは入れない",
  matchesFilter(comment({ id: "x", resolvedAt: done }), "changed", moved),
  false,
);
ok("渡し忘れは 0 件になるだけ（既定を持たない）", matchesFilter(comment({ id: "x" }), "changed", none), false);
ok("未解決の一部として並べる", FILTER_CHOICES.map((one) => one[0]).join("/"), "open/changed/resolved/all");
ok("言葉は「直った」と言わない", FILTER_CHOICES.find((one) => one[0] === "changed")[1], "本文が変わった");

console.log("\n--- 1c. メニューに出す行 ---");
ok(
  "数が分かる前は出さない",
  filterRows("open", counts({ changed: 2 }), false).map((one) => one[0]).join("/"),
  "open/resolved/all",
);
ok(
  "0 件でも出さない",
  filterRows("open", counts({ changed: 0 }), true).map((one) => one[0]).join("/"),
  "open/resolved/all",
);
ok(
  "分かって 1 件以上あれば出す",
  filterRows("open", counts({ changed: 1 }), true).map((one) => one[0]).join("/"),
  "open/changed/resolved/all",
);
ok(
  "いま選んでいる行は 0 件でも消さない",
  filterRows("changed", counts({ changed: 0 }), true).map((one) => one[0]).join("/"),
  "open/changed/resolved/all",
);

console.log("\n--- 1d. 末尾の扉（外している側への 1 歩）---");
ok("未解決からは解決済へ", listTail("open", counts({ resolved: 12 })).label, "解決済 12 件を見る");
ok("行き先も持つ", listTail("open", counts({ resolved: 12 })).to, "resolved");
ok("0 件の側へは出さない", listTail("open", counts({ resolved: 0 })), null);
ok("解決済からは既定へ戻る", listTail("resolved", counts({ open: 3 })).label, "未解決 3 件に戻る");
ok("本文が変わったからも既定へ戻る", listTail("changed", counts({ open: 3 })).to, "open");
ok("すべてでは何も隠れていない", listTail("all", counts({ open: 3, resolved: 12 })), null);

console.log("\n--- 1e. その 1 件が主役になる絞り込み ---");
ok("未解決のものは未解決へ", filterFor(comment({ resolvedAt: null })), "open");
ok("解決済のものは解決済へ", filterFor(comment({ resolvedAt: done })), "resolved");
ok("すべてへ逃がさない", [filterFor(comment({})), filterFor(comment({ resolvedAt: done }))].includes("all"), false);

console.log("\n--- 2. 並べ替え ---");
ok("既定は本文の順", DEFAULT_SORT, "document");
ok("must がいちばん上", priorityRank("must"), 0);
ok("いいねは直してほしさの下", priorityRank("good") > priorityRank("want"), true);

const early = comment({ id: "early", createdAt: "2026-08-01T00:00:00.000Z", priority: "want" });
const late = comment({ id: "late", createdAt: "2026-08-03T00:00:00.000Z", priority: "must" });
const mid = comment({ id: "mid", createdAt: "2026-08-02T00:00:00.000Z", priority: "want" });
const nowhere = new Map();

ok(
  "新しい順は時刻だけ",
  sortComments([early, late, mid], "newest", nowhere)
    .map((one) => one.id)
    .join(","),
  "late,mid,early",
);
ok(
  "古い順は時刻だけ",
  sortComments([late, early, mid], "oldest", nowhere)
    .map((one) => one.id)
    .join(","),
  "early,mid,late",
);
ok(
  "強さ順は must が先（時刻は次）",
  sortComments([early, late, mid], "priority", nowhere)
    .map((one) => one.id)
    .join(","),
  "late,early,mid",
);

const byPlace = positions([
  ["early", 200],
  ["late", 10],
  ["mid", 50],
]);
ok(
  "本文の順は位置が先",
  sortComments([early, late, mid], "document", byPlace)
    .map((one) => one.id)
    .join(","),
  "late,mid,early",
);
ok(
  "位置が同じなら強さ",
  compareComments(late, mid, "document", positions([["late", 1], ["mid", 1]])) < 0,
  true,
);

console.log("\n--- 3. 既定のときは何も言わない ---");
ok("両方既定なら空", listSummary("open", "document"), "");
ok("絞り込みだけ", listSummary("all", "document"), "すべて");
ok("並べ替えだけ", listSummary("open", "newest"), "新しい順");
ok("両方", listSummary("resolved", "priority"), "解決済 ・ 強さ順");
ok("既定の判定", isListDefault("open", "document"), true);
ok("外れている判定", isListDefault("resolved", "document"), false);

console.log("\n--- 4. 口の作り ---");
ok("常時のタブは置かない", /\n\.tab \{/.test(STYLES), false);
ok("下線付きのタブ行は置かない", /\n\.tabs \{/.test(STYLES), false);
ok("口は頭の絵記号", /aria-label", t\("toolbox\.list\.menu"\)/.test(WIDGET), true);
ok("選択肢は既にある選べる行", /pick-row is-active" : "pick-row"/.test(WIDGET), true);
ok("並べ替えの選択肢がある", SORT_CHOICES.map((one) => one[1]).join("/"), "本文の順/新しい順/古い順/強さ順");
ok("決まりは comment-list.ts に置く", /sortComments\(shown, state\.sort, positions\)/.test(WIDGET), true);
ok("画面側に並びの比較を書き写していない", /priorityRank\(/.test(WIDGET), false);

console.log("\n--- 5. カードの操作行 ---");
ok("返信は絵記号だけ", /iconAction\(t\("toolbox\.card\.reply"\), ICON_REPLY/.test(WIDGET), true);
ok("解決は絵記号だけ", /iconAction\(t\("toolbox\.card\.resolve"\), ICON_CHECK/.test(WIDGET), true);
ok("リンクは絵記号だけ", /iconAction\(t\("toolbox\.card\.link"\), ICON_LINK/.test(WIDGET), true);
ok("テキストコピーは絵記号だけ", /iconAction\(t\("toolbox\.card\.copyText"\), ICON_COPY/.test(WIDGET), true);
ok("編集は絵記号だけ", /iconAction\(t\("toolbox\.common\.edit"\), ICON_EDIT/.test(WIDGET), true);
ok("削除は絵記号だけ", /iconAction\(t\("toolbox\.common\.delete"\), ICON_TRASH/.test(WIDGET), true);
ok("文言付きの返信は残していない", /actionButton\("返信"/.test(WIDGET), false);
ok("消す確認は字を残す", /actionButton\(t\("toolbox\.common\.remove"\), ICON_TRASH/.test(WIDGET), true);
ok("操作行は右寄せ", /\.card-actions[\s\S]*?justify-content: flex-end/.test(STYLES), true);
ok("確認の案内は左へ残す", /\.card-actions \.hint[\s\S]*?margin-right: auto/.test(STYLES), true);

console.log("\n--- 6. 本物の板に載せる ---");

const SAMPLE = [
  comment({
    id: "must-open",
    body: "必ず直す",
    priority: "must",
    mine: true,
    createdAt: "2026-08-01T00:00:00.000Z",
  }),
  comment({
    id: "want-open",
    body: "できれば",
    priority: "want",
    mine: false,
    createdAt: "2026-08-02T00:00:00.000Z",
  }),
  comment({
    id: "want-done",
    body: "片付いた",
    priority: "want",
    mine: false,
    resolvedAt: "2026-08-04T00:00:00.000Z",
    resolvedBy: "案内 太郎",
    createdAt: "2026-08-03T00:00:00.000Z",
  }),
];

function widgetTag() {
  return `<script src="/comments-widget.js/x" data-page="internal/demo" defer></script>`;
}

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
    // 本文の印は文字ノードを歩いて張るので、その道具も渡す
    "NodeFilter",
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

async function mount(comments = SAMPLE) {
  const dom = new JSDOM(`<!doctype html><html><body><p>本文です</p>${widgetTag()}</body></html>`, {
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
  let copiedText = null;
  win.navigator.clipboard = {
    writeText: async (t) => {
      copiedText = String(t);
    },
  };
  const sent = [];
  win.fetch = async (target, init) => {
    const url = String(target);
    const method = init?.method ?? "GET";
    sent.push({ url, method, body: init?.body === undefined ? null : String(init.body) });
    if (method === "PATCH" && url === "/api/comments") {
      const ids = JSON.parse(String(init.body)).ids;
      return { ok: true, status: 200, json: async () => ({ changed: ids.length }) };
    }
    if (url.startsWith("/api/comments") && !url.includes("/api/comments/")) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          viewer: { kind: "member", name: "作 二郎", image: null },
          comments,
          currentVersion: "abc1234",
          features: { tools: true, history: false, slack: false, sharing: false, slackThread: false },
        }),
      };
    }
    return { ok: true, status: 200, json: async () => ({}) };
  };

  installGlobals(win);
  await import(`${dir}/cl-widget.mjs?mount=${Date.now()}`);
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
    return true;
  };
  installGlobals(win);
  return { win, shadow, press, buttons, openComments, sent, copied: () => copiedText };
}

const screen = await mount();
ok("道具箱が出る", screen.shadow !== null, true);
ok("一覧を開けた", await screen.openComments(), true);

const filterButton = screen.buttons('button[aria-label="絞り込みと並べ替え"]')[0];
ok("頭に絞り込みの口がある", filterButton !== undefined, true);
ok("既定ではメニューを出さない", screen.shadow?.querySelector(".list-menu") === null, true);
ok(
  "既定では要約も出さない",
  screen.shadow?.querySelector(".list-summary:not(.is-tail)") === null,
  true,
);

console.log("\n--- 6b. 既定は未解決だけ並ぶ ---");
ok("既定で並ぶのは未解決の 2 件", screen.shadow?.querySelectorAll(".card").length, 2);
ok("解決済は畳んだ姿でも出さない", screen.shadow?.querySelectorAll(".card.is-collapsed").length, 0);
const tail = () => screen.shadow?.querySelector(".list-summary.is-tail");
ok("外した分は末尾の 1 行で告げる", tail()?.textContent, "解決済 1 件を見る");
ok("末尾の扉は一覧の中（板の外に帯を足さない）", tail()?.closest(".list") !== null, true);

const firstActions = screen.shadow?.querySelector(".card:not(.is-collapsed) .card-actions");
const actionLabels = firstActions === null || firstActions === undefined
  ? []
  : [...firstActions.querySelectorAll("button")].map((one) => one.getAttribute("aria-label"));
ok("自分の未解決カードの操作", actionLabels.join("/"), "返信/解決/リンク/テキストをコピー/編集/削除");
const copyButton = firstActions === null || firstActions === undefined
  ? undefined
  : [...firstActions.querySelectorAll("button")].find((one) => one.getAttribute("aria-label") === "テキストをコピー");
ok("テキストコピーボタンがある", copyButton !== undefined, true);
if (copyButton !== undefined) {
  await screen.press(copyButton);
  ok("コメント本文がコピーされる", screen.copied(), "必ず直す");
}
ok(
  "操作に見える字は無い",
  firstActions === null || firstActions === undefined
    ? "（無い）"
    : [...firstActions.querySelectorAll("button")].every((one) => one.textContent.trim() === "")
      ? "空"
      : [...firstActions.querySelectorAll("button")].map((one) => one.textContent.trim()).join("/"),
  "空",
);

await screen.press(tail());
ok("扉から解決済へ移れた", screen.shadow?.querySelectorAll(".card").length, 1);
ok("解決済で見るときは開いたまま出す", screen.shadow?.querySelectorAll(".card.is-collapsed").length, 0);
ok(
  "そこからは既定へ 1 歩で戻れる",
  screen.shadow?.querySelector(".list-summary.is-tail")?.textContent,
  "未解決 2 件に戻る",
);
ok(
  "解決済のカードには再開が出る",
  [...(screen.shadow?.querySelectorAll(".card .card-actions button") ?? [])]
    .map((one) => one.getAttribute("aria-label"))
    .join("/"),
  "返信/再開/リンク/テキストをコピー",
);
await screen.press(screen.shadow?.querySelector(".list-summary.is-tail"));
ok("既定へ戻った", screen.shadow?.querySelectorAll(".card").length, 2);

await screen.press(filterButton);
ok("口を開くとメニューが出る", screen.shadow?.querySelector(".list-menu") !== null, true);
ok(
  "絞り込みの行",
  [...(screen.shadow?.querySelectorAll(".list-menu .pick-row") ?? [])]
    .map((one) => one.textContent.replace(/\d+/g, "").trim())
    .slice(0, 3)
    .join("/"),
  "未解決/解決済/すべて",
);
ok(
  "並べ替えの行",
  [...(screen.shadow?.querySelectorAll(".list-menu .pick-row") ?? [])]
    .map((one) => one.textContent.trim())
    .slice(3)
    .join("/"),
  "本文の順/新しい順/古い順/強さ順",
);

const pick = async (label) => {
  const row = screen.buttons(".list-menu .pick-row").find((one) => one.textContent.includes(label));
  if (row === undefined) return false;
  await screen.press(row);
  return true;
};

ok("すべてに絞れた", await pick("すべて"), true);
ok("通読では解決済も並ぶ", screen.shadow?.querySelectorAll(".card").length, 3);
ok("通読の解決済は 1 行に畳む", screen.shadow?.querySelectorAll(".card.is-collapsed").length, 1);
ok("通読では扉を出さない", screen.shadow?.querySelector(".list-summary.is-tail") === null, true);

ok("新しい順にできた", await pick("新しい順"), true);
ok("未解決に戻せた", await pick("未解決"), true);
ok(
  "新しい順の並び",
  [...(screen.shadow?.querySelectorAll(".card .body") ?? [])].map((one) => one.textContent).join("/"),
  "できれば/必ず直す",
);

await screen.press(filterButton);
ok("閉じるとメニューは消える", screen.shadow?.querySelector(".list-menu") === null, true);
ok(
  "外れているときは要約を残す",
  screen.shadow?.querySelector(".list-summary:not(.is-tail)")?.textContent,
  "新しい順",
);

const summary = screen.shadow?.querySelector(".list-summary:not(.is-tail)");
ok("要約からまた開ける", summary !== undefined && summary !== null, true);
if (summary !== undefined && summary !== null) await screen.press(summary);
ok("要約からメニューが戻る", screen.shadow?.querySelector(".list-menu") !== null, true);

ok("本文の順に戻した", await pick("本文の順"), true);
await screen.press(screen.buttons('button[aria-label="絞り込みと並べ替え"]')[0]);
ok(
  "既定に戻すと要約も消える",
  screen.shadow?.querySelector(".list-summary:not(.is-tail)") === null,
  true,
);
ok("既定に戻すとメニューも出さない", screen.shadow?.querySelector(".list-menu") === null, true);

ok("正本に並べ替えの口がある", /SORT_CHOICES/.test(LIST), true);

console.log("\n--- 7. まとめて選ぶ ---");
ok("決まりは comment-list.ts に置く", /bulkAction\(|bulkLabel\(/.test(LIST), true);
ok("向きを画面側で数え直していない", /resolvedAt === null \? "resolve"/.test(WIDGET), false);
ok("四角は既にある部品を使い回す", /className = "check-input"/.test(WIDGET), true);
ok("足の帯は入らなければ次の段へ落とす", /\.pick-bar \{[\s\S]*?flex-wrap: wrap;/.test(STYLES), true);
console.log("      ※ 板は 300px まで細くできる。字を縮めたり切ったりしない");
const pickedRule = /\.card\.is-picked \{([^}]*)\}/.exec(STYLES)?.[1] ?? "";
ok("選んだ印は面の濃さだけ", pickedRule.trim(), "background: var(--surface-sunken);");
ok("囲みも線も足さない", /border|outline|box-shadow/.test(pickedRule), false);

const pickButton = screen.buttons('button[aria-label="まとめて選ぶ"]')[0];
ok("頭にまとめて選ぶ口がある", pickButton !== undefined, true);
ok("既定では帯を出さない", screen.shadow?.querySelector(".pick-bar")?.hidden, true);

await screen.press(pickButton);
const bar = () => screen.shadow?.querySelector(".pick-bar");
const applyButton = () => screen.buttons(".pick-bar .button.is-primary")[0];
ok("入ると帯が出る", bar()?.hidden, false);
ok("入った時点で見えている全件が選ばれている", screen.shadow?.querySelectorAll(".card.is-picked").length, 2);
ok("選んでいる間は 1 件ずつの操作を出さない", screen.shadow?.querySelectorAll(".card-actions").length, 0);
ok("向きと件数を字に出す", applyButton()?.textContent, "2 件を解決にする");
ok("やめる道も残す", screen.buttons(".pick-bar .button").some((one) => one.textContent === "やめる"), true);
ok("全部選んでいるので外す側を出す", screen.shadow?.querySelector(".pick-bar .is-pick-all")?.textContent, "すべて外す");
ok("選んでいる間は絞り込みを触らせない", screen.buttons('button[aria-label="絞り込みと並べ替え"]')[0]?.hidden, true);
ok("選んでいる間は末尾の扉も出さない", screen.shadow?.querySelector(".list-summary.is-tail") === null, true);

const firstCard = screen.shadow?.querySelector(".card");
await screen.press(firstCard);
ok("カードを押すと外れる", screen.shadow?.querySelectorAll(".card.is-picked").length, 1);
ok("件数は選んだ数に付いてくる", applyButton()?.textContent, "1 件を解決にする");

await screen.press(screen.shadow?.querySelector(".pick-bar .is-pick-all"));
ok("すべて選べる", screen.shadow?.querySelectorAll(".card.is-picked").length, 2);

await screen.press(screen.shadow?.querySelector(".pick-bar .is-pick-all"));
ok("すべて外せる", screen.shadow?.querySelectorAll(".card.is-picked").length, 0);
ok("1 件も選んでいなければ動かす口を出さない", applyButton() === undefined, true);

await screen.press(screen.shadow?.querySelector(".pick-bar .is-pick-all"));
await screen.press(applyButton());
const patches = screen.sent.filter((one) => one.method === "PATCH");
ok("まとめては 1 回の書き込みで済ませる", patches.length, 1);
ok("叩く先は一覧と同じ口", patches[0]?.url, "/api/comments");
ok(
  "送るのは呼び名と目印の並びと向き",
  Object.keys(JSON.parse(patches[0]?.body ?? "{}")).sort().join("/"),
  "ids/pageSlug/resolved",
);
ok("目印は選んだ 2 件", JSON.parse(patches[0]?.body ?? "{}").ids.length, 2);
ok("向きは解決へ", JSON.parse(patches[0]?.body ?? "{}").resolved, true);
ok("済んだら帯を畳む", bar()?.hidden, true);
ok("1 件ずつの操作が戻る", screen.shadow?.querySelectorAll(".card-actions").length > 0, true);

console.log("\n--- 8. 本文の印は、一覧に出ているものだけ ---");
ok("張る相手は一覧の中身", /state\.anchored = applyHighlights\(shown\)/.test(WIDGET), true);
ok("全件に張っていない", /applyHighlights\(state\.comments\)/.test(WIDGET), false);
ok("そろえる口が 1 つある", (WIDGET.match(/function syncMarks\(/g) ?? []).length, 1);
ok("呼ぶのは組み立てより前", WIDGET.indexOf("syncMarks();") < WIDGET.indexOf("renderBar(openCount)"), true);
ok("比べている間は張らない", /function syncMarks\([\s\S]*?if \((?:historyFeature\.)?isComparing\(\)\) return;/.test(WIDGET), true);
ok("同じ相手なら張り直さない", /if \(!force && key === markedKey\) return;/.test(WIDGET), true);
console.log("      ※ 張り直しは本文の文字ノードを割り直す操作（描き直しのたびには走らせない）");
ok("本文が入れ替わったときは張り直す", (WIDGET.match(/(?:selectionFeature\.)?syncMarks\(true\)/g) ?? []).length, 2);
ok("覗き見も一覧と同じ並びを見る", /sortedForList/.test(WIDGET), false);
ok(
  "書き出しは絞り込みにも本文の位置にも寄りかからない",
  /sortComments\((?:listFeature\.)?topLevel\(\), "oldest", new Map\(\)\)/.test(WIDGET),
  true,
);

const MARK_VERSION = "v2222222222222222222222222222222222222222";
const markSample = (over) => ({
  ...comment({ pageVersion: MARK_VERSION, quoteContext: { beforeText: "", afterText: "" } }),
  ...over,
});

/**
 * 本文に引用のある板を、もう 1 枚だけ載せる。
 *
 * 上の板は引用を持たないコメントで組んであるので（印が 1 つも立たない）、
 * 印の出入りはここで見る。付いたときの版といまの版をそろえて、
 * 成り行きの問い合わせが走らないようにしてある（見たいのは印だけ）。
 */
async function mountMarks() {
  let rows = [
    markSample({ id: "open-a", quote: "採用は通年で行っています。", body: "募集期間を書いてほしい", priority: "must", mine: true }),
    markSample({ id: "open-b", quote: "解約率は横ばいです。", body: "この数字は最新ですか", priority: "want" }),
    markSample({
      id: "done-c",
      quote: "受付は来月からです。",
      body: "片付いた",
      priority: "want",
      resolvedAt: "2026-08-04T00:00:00.000Z",
      resolvedBy: "案内 太郎",
    }),
  ];

  const html =
    `<!doctype html><html><body>` +
    `<p>採用は通年で行っています。</p>` +
    `<p>解約率は横ばいです。</p>` +
    `<p>受付は来月からです。</p>` +
    `${widgetTag()}</body></html>`;
  const dom = new JSDOM(html, { url: "https://example.com/internal/demo", pretendToBeVisual: true });
  const win = dom.window;
  win.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  win.scrollTo = () => {};
  win.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  win.IntersectionObserver = win.ResizeObserver;
  win.fetch = async (target, init) => {
    const url = String(target);
    const method = init?.method ?? "GET";
    // 1 件の解決。次に引かれる一覧へそのまま反映する
    if (method === "PATCH" && url.startsWith("/api/comments/")) {
      const id = url.slice("/api/comments/".length);
      const wants = JSON.parse(String(init.body)).resolved === true;
      rows = rows.map((one) =>
        one.id === id
          ? { ...one, resolvedAt: wants ? "2026-08-05T00:00:00.000Z" : null, resolvedBy: wants ? "作 二郎" : null }
          : one,
      );
      return { ok: true, status: 200, json: async () => ({ comment: rows.find((one) => one.id === id) }) };
    }
    if (url.startsWith("/api/comments") && !url.includes("/outcomes")) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          viewer: { kind: "member", name: "作 二郎", image: null },
          comments: rows,
          currentVersion: MARK_VERSION,
          features: { tools: true, history: false, slack: false, sharing: false, slackThread: false },
        }),
      };
    }
    return { ok: true, status: 200, json: async () => ({}) };
  };

  installGlobals(win);
  await import(`${dir}/cl-widget.mjs?marks=${Date.now()}`);
  await settle();
  await settle();

  const host = win.document.querySelector("surprise-comments");
  const shadow = host === null ? null : host.shadowRoot;
  const press = async (node) => {
    installGlobals(win);
    node.dispatchEvent(new win.MouseEvent("click", { bubbles: true }));
    await settle();
    await settle();
  };
  const buttons = (selector) => [...(shadow === null ? [] : shadow.querySelectorAll(selector))];
  const openComments = async () => {
    const entry = buttons(".bar button").find((one) => one.title === "コメント");
    if (entry === undefined) return false;
    await press(entry);
    return true;
  };
  installGlobals(win);
  return { win, shadow, press, buttons, openComments };
}

const page = await mountMarks();
const marks = () => [...page.win.document.querySelectorAll("mark")];
const markedIds = () => marks().map((one) => one.dataset.commentId).sort().join("/");

ok("道具箱が出る", page.shadow !== null, true);
ok("既定で立つ印は未解決の 2 つ", markedIds(), "open-a/open-b");
ok("解決済の印は本文に出さない", marks().some((one) => one.dataset.commentId === "done-c"), false);
console.log("      ※ 片付けた箇所が本文で光り続けるのを、これで止める");

ok("一覧を開けた", await page.openComments(), true);
ok("開いても印は増えない", markedIds(), "open-a/open-b");

const tailOf = () => page.shadow?.querySelector(".list-summary.is-tail");
ok("末尾に扉が出る", tailOf()?.textContent, "解決済 1 件を見る");
await page.press(tailOf());
ok("解決済を見ているときは、その印だけ立つ", markedIds(), "done-c");
console.log("      ※ どこの話か分かる・並びも本文の順を保てる（印の座標で測るため）");

const filterOf = () => page.buttons('button[aria-label="絞り込みと並べ替え"]')[0];
await page.press(filterOf());
const pickIn = async (label) => {
  const row = page.buttons(".list-menu .pick-row").find((one) => one.textContent.includes(label));
  if (row === undefined) return false;
  await page.press(row);
  return true;
};
ok("すべてに絞れた", await pickIn("すべて"), true);
ok("通読では 3 つとも立つ", markedIds(), "done-c/open-a/open-b");

const markOf = (id) => marks().find((one) => one.dataset.commentId === id);
ok("片付いたものの塗りは薄いほう", markOf("done-c")?.style.background !== markOf("open-a")?.style.background, true);
ok("片付いたものは半段透ける", markOf("done-c")?.style.opacity, "0.75");

ok("未解決に戻せた", await pickIn("未解決"), true);
ok("印も戻る", markedIds(), "open-a/open-b");
await page.press(filterOf());

const resolveOn = (id) => {
  const card = page.shadow?.querySelector(`[data-card-id="${id}"]`);
  return [...(card?.querySelectorAll(".card-actions button") ?? [])].find(
    (one) => one.getAttribute("aria-label") === "解決",
  );
};
await page.press(resolveOn("open-a"));
ok("解決にすると、その印が本文から消える", markedIds(), "open-b");
ok("残った印はそのまま", marks().length, 1);

const emptyBody = await mount([comment({ id: "empty-good", kind: "good", body: "", quote: "本文です" })]);
ok("本文なしのいいねにはコピーを出さない", emptyBody.buttons('button[aria-label="テキストをコピー"]').length, 0);
ok("本文なしでもリンクコピーは使える", emptyBody.buttons('.card-actions button[aria-label="リンク"]').length, 1);

console.log(`\n${fails === 0 ? "すべて合格" : `${fails} 件 不合格`}`);
process.exitCode = fails === 0 ? 0 : 1;

// 道具箱は見ている間、定期にコメントを読み直す（src/widget/comments/live.ts）。jsdom に載せたままなので、検査が済んだらここで終える
process.exit();
