import { readWidgetSource } from "./widget-source.mjs";
/**
 * 「門なし公開のページは、社外の人にはただの記事か」を確かめる。
 *
 * 公開ページ（/public/…）は URL を知れば誰でも開ける。そこにコメントや履歴が見えると、
 * 社内の直しの会話がそのまま社外の人の画面に出る。**画面から消すだけでは足りない**
 * ——窓口を直に叩けば読めてしまうし、逆に窓口だけ閉じると、押しても何も返らない
 * ボタンを社外の人に触らせることになる。だから両側を見る。
 *
 * ここで見るのは 4 つ。
 *   1. 可否を決める部品が 1 つだけか（入口ごとに書き比べていないか）
 *   2. 窓口が全部その 1 つを通っているか・閉じたときに何も返していないか
 *   3. 名前だけで参加する道が残っていないか
 *   4. 画面が、社外の人には道具箱ごと出さないか（本物の DOM で確かめる）
 *
 * 保管庫にもネットワークにも繋がない（サーバーの応答は手元で作った作り物）。
 */
import { readFile } from "node:fs/promises";

import { root, dir, readAccessSource } from "./paths.mjs";
const { JSDOM } = await import("jsdom");
const { build } = await import(`${root}/node_modules/esbuild/lib/main.js`);

const read = (path) => readFile(`${root}/${path}`, "utf8");
/** 注記を落として、実際に動くところだけを見る。 */
const strip = (text) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
/** そのファイルが在るか（無いことを確かめたい相手にだけ使う）。 */
const exists = async (path) => read(path).then(() => true).catch(() => false);

let fails = 0;
const ok = (label, actual, expected) => {
  const pass = String(actual) === String(expected);
  if (!pass) fails += 1;
  console.log(`${pass ? "OK  " : "NG  "} ${label}: ${actual}（期待: ${expected}）`);
};

const ACCESS = strip(readAccessSource());
const TYPES = strip(await read("src/lib/comments/types.ts"));
const COMMENTS_API = strip(await read("src/app/api/comments/route.ts"));
const ONE_COMMENT_API = strip(await read("src/app/api/comments/[id]/route.ts"));
const HISTORY_API = strip(await read("src/app/api/history/route.ts"));
const OUTCOMES_API = strip(await read("src/app/api/comments/outcomes/route.ts"));
const GUEST_LIB = strip(await read("src/lib/access/guest.ts"));
const WIDGET = strip(await readWidgetSource());
const WIDGET_API = strip(await read("src/widget/shared/api.ts"));

// ---------------------------------------------------------------------------
console.log("--- 1. 可否を決める部品は 1 つだけか ---");
console.log("   「見てよいか」とは別の決めごと。記事は誰でも読めて、道具箱は会社の人だけ");

ok("部品がある", (ACCESS.match(/export function canUsePageTools/g) ?? []).length, 1);
ok(
  "中身は「会社の人か」そのもの",
  /export function canUsePageTools\(identity: Identity \| null\): identity is Member \{\n\s*return isMember\(identity\);\n\}/.test(
    ACCESS,
  ),
  true,
);
console.log("      ※ ページを受け取らない（見せ方で答えが変わらない）");
ok("ページを受け取っていない", /canUsePageTools\([^)]*page/.test(ACCESS), false);
ok("見せ方で分岐していない", /canUsePageTools[\s\S]{0,200}visibility/.test(ACCESS), false);

console.log("\n   ブラウザへ渡す旗にも、道具箱ごとの 1 本がある");
ok("旗がある", /tools: boolean;/.test(TYPES), true);
ok("旗は道具箱の並びの先頭", TYPES.indexOf("tools: boolean;") < TYPES.indexOf("history: boolean;"), true);
ok("受け取る側も同じ名前で読む", /tools: record\["tools"\] === true,/.test(WIDGET_API), true);
ok("読めない答えは閉じたものとして扱う", /return \{ tools: false,/.test(WIDGET_API), true);

// ---------------------------------------------------------------------------
console.log("\n--- 2. 窓口が全部その 1 つを通っているか ---");

const WINDOWS = [
  ["コメントの一覧", COMMENTS_API],
  ["コメントを足す口", COMMENTS_API],
  ["まとめて解決の口", COMMENTS_API],
  ["コメントを直す・消す口", ONE_COMMENT_API],
  ["コメントの物語の口", OUTCOMES_API],
  ["履歴の口", HISTORY_API],
];
for (const [label, code] of WINDOWS) {
  ok(`  ${label}: 部品を通る`, /canUsePageTools\(/.test(code), true);
}
console.log("      ※ 直す・消す・解決はどれも同じ 1 つの入口から入る（PATCH と DELETE の 2 か所）");
ok("直す・消す口は 2 か所とも見る", (ONE_COMMENT_API.match(/canUsePageTools\(viewer\)/g) ?? []).length, 2);
console.log("      ※ 一覧の口は 3 つ（GET・POST・まとめて解決の PATCH）");
ok("一覧の口は 3 か所とも見る", (COMMENTS_API.match(/canUsePageTools\(viewer\)/g) ?? []).length, 3);
const BULK = /export async function PATCH\(request: Request\)[\s\S]*?\n}/.exec(COMMENTS_API)?.[0] ?? "";
ok("まとめての口が isMember を書き写していない", /isMember\(/.test(BULK), false);

console.log("\n   入口が自分で「会社の人か」を数え直していないか（可否を 2 通り持たない）");
console.log("      ※ コメントの一覧だけは、管理者を引くのにアドレスが要るので isMember を通る");
for (const [label, code] of [
  ["コメントを直す・消す口", ONE_COMMENT_API],
  ["履歴の口", HISTORY_API],
  ["コメントの物語の口", OUTCOMES_API],
]) {
  ok(`  ${label}: isMember を書いていない`, /isMember\(/.test(code), false);
}

console.log("\n   閉じたときは、断らずに空を返す（記事だけを読む人に知らせる先が無い）");
ok("閉じた答えを作る部品がある", /function closedTools\(\): CommentsResponse/.test(COMMENTS_API), true);
const CLOSED = /function closedTools\(\): CommentsResponse \{[\s\S]*?\n\}/.exec(COMMENTS_API)?.[0] ?? "";
ok("  名乗りを返さない", /viewer: null,/.test(CLOSED), true);
ok("  コメントは 1 件も返さない", /comments: \[\],/.test(CLOSED), true);
ok("  いまの版も返さない", /currentVersion: null,/.test(CLOSED), true);
// 旗は tools・history・sharing・edit・write の 5 つ（Slack の 2 つは配布版で外した）
ok("  旗は全部倒れている", (CLOSED.match(/: false/g) ?? []).length, 5);
ok("  倒れている旗の名前", ["tools", "history", "sharing", "edit", "write"].every((name) => new RegExp(`\\b${name}: false,`).test(CLOSED)), true);
ok("  200 で返している", /return jsonResponse\(closedTools\(\), 200\);/.test(COMMENTS_API), true);
ok("取り込み用の旗は足していない（閉じた答えの 6 を崩さない）", /origin: boolean/.test(TYPES), false);
ok("コメントの一覧は GitHub を叩かない", /github\.com|lookupOrigin|GITHUB_TOKEN/.test(COMMENTS_API), false);

console.log("\n   閉じている人のぶんは、コメント表を引きに行かない");
ok("引くかどうかを旗で決めている", /tools \? listComments\(organization, page\.slug, viewer\) : \[\]/.test(COMMENTS_API), true);
console.log("      ※ 門より先に取りに行くのは可（返さなければ漏れない）。引かずに済むならもっとよい");
ok("門を見るのが先、閉じた答えはその後ろ", COMMENTS_API.indexOf("if (!gate.ok)") < COMMENTS_API.indexOf("if (!tools)"), true);

console.log("\n   履歴は台帳を引く前に断る（往復を増やさない）");
ok(
  "名乗りを見てすぐ断る",
  HISTORY_API.indexOf("canUsePageTools(viewer)") < HISTORY_API.indexOf("openPage("),
  true,
);
ok(
  "物語の口も、触れない人のぶんは台帳を引かない",
  OUTCOMES_API.indexOf("canUsePageTools(viewer)") < OUTCOMES_API.indexOf("openPage("),
  true,
);
console.log("      ※ 過去の版そのもの（?v=）は記事なので、今までどおり誰でも開ける");
ok("公開ページの入口は道具箱の門を通していない", /canUsePageTools/.test(strip(await read("src/app/public/[...slug]/route.ts"))), false);

// ---------------------------------------------------------------------------
console.log("\n--- 3. 名前だけで参加する道が残っていないか ---");
console.log("   残すと「社外の人も書ける」が静かに生え直す");

ok("券を作る口が無い", await exists("src/app/api/guest/route.ts"), false);
ok("券を作る部品も無い", /issueGuest/.test(GUEST_LIB), false);
ok("券を読む部品は残っている（昔の分を /activity で引くため）", /export function readGuest/.test(GUEST_LIB), true);
ok("ブラウザ側にも参加を頼む口が無い", /joinAsGuest|\/api\/guest/.test(WIDGET_API), false);
ok("名乗りを聞く画面が無い", /joinBox|join-title/.test(WIDGET), false);
ok("見た目の指定も残っていない", /\.join\b|\.join-/.test(await read("src/widget/shared/styles.ts")), false);
console.log("      ※ 昔のゲストが書いた行は残る。誰が書いたかとして出すのは表示名だけ");
ok("行を読む側は残っている", /kind: "guest"/.test(strip(await read("src/lib/comments/comments.ts"))), true);

// ---------------------------------------------------------------------------
console.log("\n--- 4. 画面が、社外の人には道具箱ごと出さないか ---");
/*
 * 字面だけでは「一瞬出てから消える」を見つけられない。本体を丸ごと jsdom に載せて、
 * 出た物を数える。公開ページは**答えが来るまで組み立てない**ので、
 * 答えを返さない作り物のサーバーでも確かめられる。
 */
await build({
  entryPoints: [`${root}/src/widget/comments/comments.ts`],
  outfile: `${dir}/pt-widget.mjs`,
  bundle: true,
  format: "esm",
  platform: "neutral", mainFields: ["module", "main"],
});

const settle = () => new Promise((done) => setTimeout(done, 40));

/** 本体が見に行く窓まわりの名前を、この画面のものに差し替える。 */
function installGlobals(win) {
  const names = [
    "window", "document", "navigator", "location", "HTMLElement", "Element", "Node", "Range",
    "getComputedStyle", "requestAnimationFrame", "cancelAnimationFrame", "matchMedia", "fetch",
    "MutationObserver", "ResizeObserver", "IntersectionObserver", "getSelection", "customElements",
  ];
  for (const name of names) {
    if (!(name in win)) continue;
    const held = win[name];
    const value = typeof held === "function" && !/^[A-Z]/.test(name) ? held.bind(win) : held;
    Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
  }
}

let mounted = 0;

/**
 * 配信側が書き入れる読み込みの札を再現する（src/lib/pages/content.ts の `withCommentsWidget`）。
 *
 * 本体は**この札から呼び名を読む**。URL から組み立てないのは、社内として投稿した
 * ページを公開に切り替えると、呼び名が `internal/…` のままで URL（`/public/…`）と
 * 頭が食い違うため。だから検査でも、配信と同じ形で札を置いてから動かす。
 */
function widgetTag(path, pageSlug) {
  const named = pageSlug ?? `${path.startsWith("/public/") ? "public" : "internal"}${path.slice(2)}`;
  return `<script src="/comments-widget.js/x" data-page="${named}" defer></script>`;
}


/**
 * ページを 1 枚開く。
 *
 * `tools` に null を渡すと「答えが返ってこない」状態になる（立ち上げの瞬間を見る用）。
 */
async function open(path, { tools = true, viewer = { kind: "member", name: "作 二郎", image: null }, pageSlug = null } = {}) {
  const dom = new JSDOM(
    `<!doctype html><html><head><title>使いはじめの案内</title></head><body>
      <div class="no-print"><button onclick="window.print()">PDF</button></div>
      <p>本文</p>${widgetTag(path, pageSlug)}</body></html>`,
    { url: `https://example.com${path}`, pretendToBeVisual: true },
  );
  const win = dom.window;
  win.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  win.scrollTo = () => {};
  win.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  win.IntersectionObserver = win.ResizeObserver;

  const asked = [];
  win.fetch = async (target) => {
    asked.push(String(target));
    // 答えを返さない（立ち上げの瞬間のまま止める）
    if (tools === null) return new Promise(() => {});
    return {
      ok: true,
      status: 200,
      json: async () =>
        String(target).startsWith("/api/comments")
          ? {
              viewer: tools ? viewer : null,
              comments: [],
              currentVersion: "abc1234",
              features: { tools, history: true, slack: false, slackThread: false, sharing: false },
            }
          : {},
    };
  };

  installGlobals(win);
  mounted += 1;
  await import(`${dir}/pt-widget.mjs?mount=${mounted}`);
  await settle();
  installGlobals(win);

  const shadow = win.document.querySelector("surprise-comments")?.shadowRoot ?? null;
  return {
    win,
    asked,
    /** 影の入れ物ごと作ったか */
    mounted: shadow !== null,
    bar: shadow?.querySelector(".bar") ?? null,
    exportHost: win.document.querySelector("surprise-page-export"),
    /** ブラウザの中に残した「見たページ」 */
    kept: win.localStorage.getItem("surprise-pages:views"),
  };
}

console.log("\n   公開ページ・社外の人（道具箱は閉じている）");
const outside = await open("/public/guide/intro", { tools: false });
ok("影の入れ物すら作らない", outside.mounted, false);
ok("バーも出ない", outside.bar, null);
ok("本文はそのまま残る", outside.win.document.querySelector("p")?.textContent, "本文");
ok("聞きに行ったのはコメントの口 1 回だけ", outside.asked.length, 1);
console.log("      ※ 記事だけの画面でも「見たページ」の控えは残す（/activity で戻れる道）");
ok("控えは残る", outside.kept !== null && outside.kept.includes("/public/guide/intro"), true);
ok("元からある PDF ボタンは書き出す口に置き換わる", outside.exportHost !== null, true);
ok("コメントの入り切りは出さない", outside.exportHost?.shadowRoot?.querySelector(".check-row"), null);

console.log("\n   公開ページ・会社の人");
const inside = await open("/public/guide/intro");
ok("道具箱が出る", inside.mounted, true);
ok("バーが出る", inside.bar !== null, true);

console.log("\n   公開ページ・答えが来る前");
const waiting = await open("/public/guide/intro", { tools: null });
ok("一瞬も出さない", waiting.mounted, false);
ok("書き出す口は答えを待たない", waiting.exportHost !== null, true);
console.log("      ※ 道具箱を出してから消すと、消える前に押せてしまう");
console.log("      ※ PDF ボタンの置き換えは、元からある口なので待たない");

console.log("\n   社内ページ・答えが来る前");
const internal = await open("/internal/report/2026q1", { tools: null });
ok("待たずに出す", internal.mounted, true);
ok("バーも出ている", internal.bar !== null, true);
console.log("      ※ その本文が出ている時点で門を通っている＝会社の人（待つ理由が無い）");
ok("控えはブラウザに残さない", internal.kept, null);

// ---------------------------------------------------------------------------
console.log("\n--- 5. 公開に切り替えたページ（呼び名は internal のまま）---");
console.log("   社内として投稿してから公開にすると、/internal/… と /public/… の両方から開ける。");
console.log("   呼び名は動かないので、コメントはどちらの入口から書いても同じ 1 か所に付く");

const SWITCHED = "internal/report/2026q1";
const outsideSwitched = await open("/public/report/2026q1", { tools: false, pageSlug: SWITCHED });
ok("社外の人には道具箱ごと出さない", outsideSwitched.mounted, false);
ok("バーも出ない", outsideSwitched.bar, null);
console.log("      ※ 判断は URL の頭（/p）で決める。あそこには社外の人が座っている");
ok("控えは残る（記事として読んだ 1 行）", outsideSwitched.kept !== null, true);

const insideSwitched = await open("/public/report/2026q1", { pageSlug: SWITCHED });
ok("会社の人には出る", insideSwitched.mounted, true);
ok(
  "コメントを取りに行く先は、URL ではなく呼び名",
  insideSwitched.asked.some((one) => one.includes(encodeURIComponent(SWITCHED))),
  true,
);
ok(
  "URL の頭から組み立てた呼び名では聞きに行かない",
  insideSwitched.asked.some((one) => one.includes(encodeURIComponent("public/report/2026q1"))),
  false,
);
console.log("      ※ 台帳に無い呼び名で聞くと、断られて道具箱が丸ごと動かなくなる");

console.log("\n   札が無ければ、何も組み立てない");
const unnamed = await open("/internal/report/2026q1", { pageSlug: "" });
ok("影の入れ物すら作らない", unnamed.mounted, false);
console.log("      ※ 呼び名を推測して動くより、出さないほうがよい（別のページに書き込みうる）");

console.log("\n   本体が URL から呼び名を組み立てていないか（字面）");
ok(
  "札から読む部品がある",
  /function pageSlugFromTag\(\): string \| null \{/.test(WIDGET),
  true,
);
ok("読むのは印つきの行き先を名乗っている札だけ", /script\[src\^="\/comments-widget\.js"\]\[data-page\]/.test(WIDGET), true);
ok("札が無ければ立ち上げをやめる", /const named = pageSlugFromTag\(\);\s*\n\s*if \(named === null\) return;/.test(WIDGET), true);
ok("呼び名に入れるのは札の値", /state\.slug = named;/.test(WIDGET), true);
ok("URL をつないだ値を呼び名にしていない", /state\.slug = `\$\{visibility\}\//.test(WIDGET), false);

// ---------------------------------------------------------------------------
console.log(fails === 0 ? "\nぜんぶ通った" : `\n${fails} 件が期待と違う`);
process.exitCode = fails === 0 ? 0 : 1;

// 道具箱は見ている間、定期にコメントを読み直す（src/widget/comments/live.ts）。jsdom に載せたままなので、検査が済んだらここで終える
process.exit();
