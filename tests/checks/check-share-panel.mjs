import { readWidgetSource } from "./widget-source.mjs";
// 道具箱と窓口の文言は辞書（日本語が正本）。入口と画面はその鍵を引き、字そのものは辞書で見る
import { readFileSync as readDictionary } from "node:fs";
const TOOLBOX_JA = readDictionary(new URL("../../src/lib/i18n/messages/ja/toolbox.ts", import.meta.url), "utf8");
/**
 * 道具箱の「共有範囲」（このページを誰に見せるか）の板を確かめる。
 *
 * この板だけは、間違えたときの被害が画面の乱れでは済まない。
 *   1. 触ってよくない人に出す        … 押しても何も返らないボタンを触らせる
 *   2. 公開ページで開いてしまう      … 会社のメールアドレスが社外の人の画面に出る
 *   3. 断りなく制限を外させる        … 見せるつもりのなかった人まで一斉に見られる
 * どれも開いて眺めただけでは気づけないので、ここで数として押さえる。
 *
 * 判定そのもの（誰に出すか）は dock.ts の素の関数をそのまま呼ぶ。
 * 画面は本物の DOM（jsdom）に本体を丸ごと載せて、出た字を読む。
 * 保管庫にもネットワークにも繋がない（サーバーの応答は手元で作った作り物）。
 */
import { readFile } from "node:fs/promises";

import { root, dir } from "./paths.mjs";
const { JSDOM } = await import("jsdom");
const { build } = await import(`${root}/node_modules/esbuild/lib/main.js`);

/* 作り物の置き場は他の検査表と分け合っている。名前をこの検査表のものに寄せる */
const DOCK_OUT = `${dir}/sp-dock.mjs`;
const WIDGET_OUT = `${dir}/sp-widget.mjs`;

await build({
  entryPoints: [`${root}/src/widget/comments/dock.ts`],
  outfile: DOCK_OUT,
  bundle: true,
  format: "esm",
  platform: "neutral", mainFields: ["module", "main"],
});
await build({
  entryPoints: [`${root}/src/widget/comments/comments.ts`],
  outfile: WIDGET_OUT,
  bundle: true,
  format: "esm",
  platform: "neutral", mainFields: ["module", "main"],
});
const { sharingVisible } = await import(DOCK_OUT);

let fails = 0;
const ok = (label, actual, expected) => {
  const pass = actual === expected;
  if (!pass) fails += 1;
  console.log(`${pass ? "OK  " : "NG  "} ${label}: ${actual}（期待: ${expected}）`);
};

/** 注記を落として、実際に動くところだけを見る。 */
const codeOnly = (text) =>
  text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");

const WIDGET = codeOnly(await readWidgetSource());
const API = codeOnly(await readFile(`${root}/src/widget/shared/api.ts`, "utf8"));
const STYLES = await readFile(`${root}/src/widget/shared/styles.ts`, "utf8");
const TOKENS = await readFile(`${root}/src/widget/shared/tokens.ts`, "utf8");
const has = (label, re, where = WIDGET) => ok(label, re.test(where), true);
const lacks = (label, re, where = WIDGET) => ok(label, re.test(where), false);

// ---------------------------------------------------------------------------
// 画面を出す仕掛け
// ---------------------------------------------------------------------------

/** 名簿に載せる人。作り物なので、本番には無いアドレスを使う。 */
const MEMBER_EMAIL = "hanako@example.com";
/** 「見せてほしい」と言っている人。名簿の人とは別のアドレスにして、取り違えを見つけられるように */
const ASKER_EMAIL = "taro@example.com";
const ASKER_NAME = "案内 太郎";
const GROUPS = [
  { id: "g1", name: "経営" },
  { id: "g2", name: "開発" },
];
/* 役割は本物の応答と同じ形で持たせる（既定は「見るだけ」） */
const GRANTS = [
  {
    id: "p1",
    granteeKind: "member",
    memberEmail: MEMBER_EMAIL,
    groupId: null,
    groupName: null,
    role: "viewer",
    mine: false,
  },
  {
    id: "p2",
    granteeKind: "group",
    memberEmail: null,
    groupId: "g1",
    groupName: "経営",
    role: "viewer",
    mine: false,
  },
];
/**
 * 見ている人自身に出してある許可（作った人（共同））。
 *
 * 「自分の行か」を立てるのはサーバーだけなので、作り物の応答でも本物と同じく
 * `mine` を立てて渡す。画面がアドレスで照合し直していないことも、これで見える。
 */
const SELF_EMAIL = "jiro@example.com";
const SELF_GRANT = {
  id: "p3",
  granteeKind: "member",
  memberEmail: SELF_EMAIL,
  groupId: null,
  groupName: null,
  role: "owner",
  mine: true,
};
const REQUESTS = [
  {
    id: "r1",
    requesterEmail: ASKER_EMAIL,
    requesterName: ASKER_NAME,
    createdAt: "2026-08-10T00:00:00.000Z",
  },
];

let mounted = 0;

/**
 * 配信側が書き入れる読み込みの札を再現する（src/lib/pages/content.ts の `withCommentsWidget`）。
 *
 * 本体は**この札から呼び名を読む**。URL から組み立てないのは、社内として投稿した
 * ページを公開に切り替えると、呼び名が `internal/…` のままで URL（`/public/…`）と
 * 頭が食い違うため。だから検査でも、配信と同じ形で札を置いてから動かす。
 */
function widgetTag(path, pageSlug, personal = false) {
  const named = pageSlug ?? `${path.startsWith("/public/") ? "public" : "internal"}${path.replace(/^\/(?:public|internal)/, "")}`;
  // 組織の名前も配信と同じく札に書く（src/lib/pages/content.ts の `withCommentsWidget`）。共有範囲の名前は札の名前で言う
  return `<script src="/comments-widget.js/x" data-page="${named}" data-organization-name="見本商事"${personal ? ' data-edition="personal"' : ""} defer></script>`;
}


/**
 * 本体を本物の DOM に載せて、出来上がった画面を返す。
 *
 * 取り込みの控えが効くと 2 回目が動かないので、毎回別のものとして読み込む。
 * 出す物（features）と居場所（/i か /p）だけを差し替えて、あとは同じ手順で通す。
 */
async function mount({ path, sharing, scope = "restricted", switchable = true, waiting = false, selfOwner = false, personal = false }) {
  const dom = new JSDOM(`<!doctype html><html><body><p>本文</p>${widgetTag(path, null, personal)}</body></html>`, {
    url: `https://example.com${path}`,
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

  /*
   * サーバーの代わり。本物と同じ流儀で持ち替える（「こうなっていてほしい」形で置き換え、
   * 承認したら名簿にも 1 人足す）ので、押したあとに何が並ぶかまで確かめられる。
   * データベースにもネットワークにも行かない。
   */
  const held = {
    scope,
    permissions: [...GRANTS, ...(selfOwner ? [SELF_GRANT] : [])].map((one) => ({ ...one })),
    requests: waiting ? REQUESTS.map((one) => ({ ...one })) : [],
  };
  const asked = [];
  const sent = [];
  win.fetch = async (target, init) => {
    const url = String(target);
    asked.push(url);
    let body = {};
    if (url.startsWith("/api/comments")) {
      body = {
        viewer: { kind: "member", name: "作 二郎", image: null },
        comments: [],
        currentVersion: "abc1234",
        // 道具箱そのものは開いている（ここへ来るのは会社の人だけ）
        features: { tools: true, history: true, slack: false, sharing },
      };
    } else if (url.startsWith("/api/pages/access")) {
      if (init !== undefined && init.method === "PUT") {
        const wanted = JSON.parse(init.body);
        sent.push(wanted);
        apply(held, wanted);
      }
      body = {
        scope: held.scope,
        switchable,
        permissions: held.permissions,
        groups: GROUPS,
        requests: held.requests,
      };
    }
    return { ok: true, status: 200, json: async () => body };
  };

  installGlobals(win);
  mounted += 1;
  await import(`${WIDGET_OUT}?mount=${mounted}`);
  await settle();

  const host = win.document.querySelector("surprise-comments");
  const shadow = host === null ? null : host.shadowRoot;
  /*
   * 触る前に、その画面の窓を必ず表に戻す。
   *
   * 本体は `window` や `fetch` を**その場で**引くので、あとから別の画面を出すと、
   * 前の画面を押したときの問い合わせが新しいほうの作り物のサーバーへ飛ぶ。
   * 出した順と触る順が違うだけで結果が変わる、という取り違えをここで塞ぐ。
   */
  const press = async (node) => {
    installGlobals(win);
    node.dispatchEvent(new win.MouseEvent("click", { bubbles: true }));
    await settle();
  };
  const buttons = (selector) => [...(shadow === null ? [] : shadow.querySelectorAll(selector))];
  const barTitles = () => buttons(".bar button").map((one) => one.title);
  /*
   * 共有範囲の入口は右下の道具箱の ⋯（「その他」の小窓）の中。
   * 小窓は押して開くまで DOM に無いので、開いて読み、読んだら畳む（開いたままだと次の押しが小窓を畳む側に回る）。
   */
  const moreButton = () => buttons(".bar .bar-more")[0];
  const menuRows = () => buttons(".popover.is-menu .menu-row");
  const menuTitles = async () => {
    const more = moreButton();
    if (more === undefined) return [];
    await press(more);
    const titles = menuRows().map((one) => one.textContent);
    await press(more);
    return titles;
  };
  const openSharing = async () => {
    const more = moreButton();
    if (more === undefined) return false;
    await press(more);
    const entry = menuRows().find((one) => one.textContent === "共有範囲");
    if (entry === undefined) {
      await press(more);
      return false;
    }
    await press(entry);
    return true;
  };
  installGlobals(win);

  /*
   * 選び分けの読み方。**直接の子だけ**を拾う（`>`）——選んだものの下に入る設定にも
   * 四角の行が並ぶので、まとめて拾うとグループ名まで選択肢に数えてしまう。
   */
  const scopeRows = () => [
    ...(shadow === null ? [] : shadow.querySelectorAll(".access-scope > .check-row")),
  ];
  const scopeLabels = () =>
    scopeRows().map((row) => row.querySelector(".check-label")?.textContent ?? "");
  const scopeRow = (label) =>
    scopeRows().find((row) => row.querySelector(".check-label")?.textContent === label);
  const scopeInput = (label) => scopeRow(label)?.querySelector("input");
  const pickedScope = () =>
    scopeRows()
      .find((row) => row.querySelector("input")?.checked === true)
      ?.querySelector(".check-label")?.textContent;

  return {
    win,
    shadow,
    asked,
    sent,
    press,
    buttons,
    barTitles,
    menuTitles,
    openSharing,
    scopeRows,
    scopeLabels,
    scopeRow,
    scopeInput,
    pickedScope,
  };
}

const settle = () => new Promise((done) => setTimeout(done, 40));

/** 本体が見に行く窓まわりの名前を、この画面のものに差し替える。 */
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
    "customElements",
  ];
  for (const name of names) {
    if (!(name in win)) continue;
    const held = win[name];
    const value = typeof held === "function" && !/^[A-Z]/.test(name) ? held.bind(win) : held;
    Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
  }
}

/** 送られてきた望みの姿を、手元の控えに映す（本物の入口と同じ順で）。 */
function apply(held, wanted) {
  if (wanted.role !== undefined) {
    // 役割が付くのは個人あての許可だけ（まとまりあては本物の入口が断る）
    const one = held.permissions.find((row) => row.id === wanted.role.id);
    if (one !== undefined && one.granteeKind === "member") one.role = wanted.role.to;
    return;
  }
  if (wanted.answer !== undefined) {
    const asking = held.requests.find((one) => one.id === wanted.answer.id);
    if (asking === undefined) return;
    // 承認したら名簿に足してから、申し出をしまう（本物と同じ順）
    if (wanted.answer.approved) {
      held.permissions.push({
        id: `p-${asking.id}`,
        granteeKind: "member",
        memberEmail: asking.requesterEmail,
        groupId: null,
        groupName: null,
        role: "viewer",
        mine: false,
      });
    }
    held.requests = held.requests.filter((one) => one.id !== asking.id);
    return;
  }
  // 望みの見せ方は 1 つの値で来る（旗を 2 つ持たない）
  if (typeof wanted.scope === "string") held.scope = wanted.scope;
  if (Array.isArray(wanted.members)) {
    const kept = held.permissions.filter((one) => one.granteeKind !== "member");
    // 役割と「自分の行か」は行に付いたまま残る（名簿を送り直しても消えない）
    const roles = new Map(
      held.permissions
        .filter((one) => one.granteeKind === "member")
        .map((one) => [one.memberEmail, one.role]),
    );
    const mine = new Map(
      held.permissions
        .filter((one) => one.granteeKind === "member")
        .map((one) => [one.memberEmail, one.mine === true]),
    );
    held.permissions = [
      ...kept,
      ...wanted.members.map((email) => ({
        id: `p-${email}`,
        granteeKind: "member",
        memberEmail: email,
        groupId: null,
        groupName: null,
        role: roles.get(email) ?? "viewer",
        mine: mine.get(email) ?? false,
      })),
    ];
  }
  if (Array.isArray(wanted.groups)) {
    const kept = held.permissions.filter((one) => one.granteeKind !== "group");
    held.permissions = [
      ...kept,
      ...wanted.groups.map((id) => ({
        id: `p-${id}`,
        granteeKind: "group",
        memberEmail: null,
        groupId: id,
        groupName: GROUPS.find((one) => one.id === id)?.name ?? null,
        role: "viewer",
        mine: false,
      })),
    ];
  }
}

/**
 * 画面に出ている字ぜんぶ。
 *
 * 見た目の指定（style）は数えない。あそこには説明書きが入っていて、
 * 「画面に出ていない字」を出ていることにしてしまう。
 */
const wordsOf = (view) => {
  if (view.shadow === null) return "";
  const parts = [];
  for (const node of view.shadow.children) {
    if (node.tagName.toLowerCase() === "style") continue;
    parts.push(node.textContent);
  }
  return parts.join("\n");
};

// ---------------------------------------------------------------------------
console.log("--- 1. 誰に出すかの決まり（sharingVisible）---");
ok("持ち主・管理者（社内ページ）→ 出す", sharingVisible({ allowed: true, openToAnyone: false }), true);
ok("それ以外（社内ページ）→ 出さない", sharingVisible({ allowed: false, openToAnyone: false }), false);
ok("公開ページは、許しが立っていても出さない", sharingVisible({ allowed: true, openToAnyone: true }), false);
ok("公開ページ＋許し無し → 出さない", sharingVisible({ allowed: false, openToAnyone: true }), false);

console.log("\n   立てるのはサーバーだけ（ブラウザ側で持ち主かを数え直さない）");
has("道具箱の出し分けは、その決まり 1 つだけを見る", /if \((?:sharingFeature\.)?canManageAccess\(\)\) \{/);
has("決まりは dock.ts から借りている", /sharingVisible\(\{/);
has("元になるのはサーバーの返事", /allowed: state\.features\.sharing,/);
has("公開ページかどうかも渡す", /openToAnyone: state\.visibility === "public",/);
lacks("持ち主かどうかを画面側で組み立てていない", /createdBy|isOwner|isAdmin/);
has("届かないうちは立たない", /sharing: record\["sharing"\] === true,/, API);
/*
 * 応答が読めなかったときの戻り。**旗が増えても、増えたぶんが伏せてあること**まで見る。
 * 書き方をそのまま写した正規表現にすると、旗を 1 つ足した日に検査だけ古いまま落ちて、
 * 「並びを直せば通る」と読めてしまう（見たいのは並びではなく、true が 1 つも無いこと）。
 */
const FALLBACK = /if \(record === null\) \{\s*return \{([\s\S]*?)\};/.exec(API)?.[1] ?? "";
ok("読めない応答は全部伏せる", FALLBACK.length > 0 && !FALLBACK.includes("true"), true);

// ---------------------------------------------------------------------------
console.log("\n--- 2. 道具箱に項目が出るのはどのときか（本物の画面）---");

const owner = await mount({ path: "/internal/report/2026q1", sharing: true });
console.log(`      持ち主が見た社内ページ: ${owner.barTitles().join(" / ")} ｜ ⋯ の中: ${(await owner.menuTitles()).join(" / ")}`);
ok("持ち主には出る（⋯ の中）", (await owner.menuTitles()).includes("共有範囲"), true);
ok("バーには並べない（毎日使う道具だけを表に置く）", owner.barTitles().includes("共有範囲"), false);

const reader = await mount({ path: "/internal/report/2026q1", sharing: false });
console.log(`      ただ読む人が見た社内ページ: ${reader.barTitles().join(" / ")} ｜ ⋯ の中: ${(await reader.menuTitles()).join(" / ")}`);
ok("持ち主でなければ出ない", (await reader.menuTitles()).includes("共有範囲"), false);
ok("押せないボタンを代わりに置いてもいない", /共有範囲/.test(wordsOf(reader)), false);
ok("共有範囲を取りに行っていない", reader.asked.some((one) => one.includes("/api/pages/access")), false);

// ---------------------------------------------------------------------------
console.log("\n--- 3. 公開ページにはメールアドレスを出さない ---");
/*
 * サーバーは公開ページで許しを立てない。ここで見るのは「万一立って届いても、
 * こちら側で閉じるか」。門は 2 枚あって、どちらか 1 枚が抜けても外へは出ない。
 */
const outside = await mount({ path: "/public/guide/intro", sharing: true });
console.log(`      公開ページ: ${outside.barTitles().join(" / ")} ｜ ⋯ の中: ${(await outside.menuTitles()).join(" / ")}`);
ok("項目そのものが出ない", (await outside.menuTitles()).includes("共有範囲"), false);
ok("共有範囲を取りに行かない", outside.asked.some((one) => one.includes("/api/pages/access")), false);
ok("画面のどこにもアドレスが出ていない", wordsOf(outside).includes(MEMBER_EMAIL), false);
ok("＠ のある字すら出ていない", /[\w.-]+@[\w.-]+/.test(wordsOf(outside)), false);

const outsideWaiting = await mount({ path: "/public/guide/intro", sharing: true, waiting: true });
ok("申し出を出した人のアドレスも出ない", wordsOf(outsideWaiting).includes(ASKER_EMAIL), false);
ok("申し出を出した人の名前も出ない", wordsOf(outsideWaiting).includes(ASKER_NAME), false);

has("入り口からも閉じる（出していない項目を叩かれても開かない）", /if \(!(?:sharingFeature\.)?canManageAccess\(\)\) return;/);
has("途中で立たなくなったら板も畳む", /if \(state\.view === "access" && !(?:sharingFeature\.)?canManageAccess\(\)\) state\.view = "comments";/);

console.log("\n   アドレスが字になるのは、社内ページの持ち主の画面だけ");
ok("開く前は、持ち主の画面にもまだ出ていない", wordsOf(owner).includes(MEMBER_EMAIL), false);
await owner.openSharing();
ok("開いて初めて出る（誰に見せたかが分からないと使えない）", wordsOf(owner).includes(MEMBER_EMAIL), true);

// ---------------------------------------------------------------------------
console.log("\n--- 4. 板の中身 ---");
const panel = owner.shadow.querySelector(".panel-title").textContent;
ok("板の見出し", panel, "共有範囲");
ok("見せ方の選び分けが 3 つある", owner.scopeRows().length, 3);
console.log("      ※ 丸（1 つだけ選ぶ印）。横並びの丸角ボタンはタブの記号なので使わない");
ok(
  "並びは狭いほうから広いほうへ（正反対の 2 つが隣り合わない）",
  owner.scopeLabels().join(" → "),
  "選んだ人だけ → 見本商事 の全員 → 組織の外の誰でも",
);
ok("いまの状態を文で言っている", /見られるのは、あなたと管理者、それとここで選んだ人だけです/.test(wordsOf(owner)), true);
ok(
  "その文は、選んだものの子として字下げして入る",
  owner.shadow.querySelector(".scope-child") !== null,
  true,
);
console.log("      ※ 親子は字下げだけで示す（縦線も囲みも帯も引かない）");
ok("人の段がある", /見せる人/.test(wordsOf(owner)), true);
ok("グループの段がある", /見せるグループ/.test(wordsOf(owner)), true);
ok("グループの名前が出る", /経営/.test(wordsOf(owner)), true);
/*
 * グループは入り切りの四角で持つ。行ごとに「足す」「取り消す」の口を並べていたころは
 * 同じ語が行の数だけ出て、しかも押した行が上へ動いた。四角なら状態がその場に出るので、
 * 並びを名前順に固定できる（押しても動かない）。
 */
const boxes = [...owner.shadow.querySelectorAll(".access-part .check-input")];
ok("グループは入り切りの四角で持つ", boxes.length, 2);
/* 仕込みでは「経営」に既に許可を出してある（GRANTS）。入っているのはそれだけ */
ok(
  "入っているものだけに印が付く",
  boxes.filter((one) => one.checked).length,
  1,
);
ok(
  "並びは台帳の順のまま（押しても動かない）",
  [...owner.shadow.querySelectorAll(".access-part .check-label")].map((one) => one.textContent).join(" "),
  "経営 開発",
);
console.log("      ※ 許可済みを上へ寄せない。押した行がその場で切り替わり、動かない");
ok("「足す」という字はどこにも出ない", /足す/.test(wordsOf(owner)), false);
ok("スクロールする候補の一覧は使わない", owner.buttons(".access-list .pick-row").length, 0);
ok("打ち込む口がある", owner.shadow.querySelector(".access-add input") !== null, true);
ok("その口の字は「追加」", owner.buttons(".access-add .action")[0]?.textContent.includes("追加"), true);

console.log("\n   硬い言い方を画面に出していない");
for (const word of ["権限", "パーミッション", "トークン", "スコープ"]) {
  ok(`「${word}」が出ていない`, wordsOf(owner).includes(word), false);
}

console.log("\n   古い言い方が残っていない（管理の画面と呼び名を 1 つにした）");
/* 3 つの段が同時に出ている画面で見る（申し出の段は、待っている人がいるときだけ出る） */
const named = await mount({ path: "/internal/report/2026q1", sharing: true, waiting: true });
await named.openSharing();
for (const word of ["見せてほしいと言っている人", "見せるまとまり", "まとまり"]) {
  ok(`「${word}」が出ていない`, wordsOf(named).includes(word), false);
}

// ---------------------------------------------------------------------------
console.log("\n--- 5. 危ないほうへ倒すときは、何が起きるかを言い切る ---");

const wide = await mount({ path: "/internal/report/2026q1", sharing: true });
await wide.openSharing();
const toEveryone = wide.scopeInput("見本商事 の全員");
await wide.press(toEveryone);
const openWarning = wide.shadow.querySelector(".access-warning");
console.log(`      ${openWarning === null ? "（断りが出ていない）" : openWarning.textContent}`);
ok("押しただけでは変えない（先に断りが出る）", wide.sent.length, 0);
/*
 * 丸（ラジオ）は「押した瞬間に選ばれる」記号なので、押しても丸が動かないと
 * 「反応しなかった」と読まれる。だから**板の中身を念押しだけに差し替える**。
 * 何かが起きたことは画面が変わったことで伝わり、丸と実際の状態も食い違わない。
 */
ok("押した瞬間に、板の中身が念押しだけになる", wide.scopeRows().length, 0);
ok("行き先を見出しで言う", /見本商事 の全員 に切り替えます/.test(wordsOf(wide)), true);
console.log("      ※ 選び分けが見えなくなるので、どこへ動こうとしているかを見出しに出す");
ok("断りに「見本商事 の全員が見られるようになります」がある", openWarning !== null && openWarning.textContent.includes("見本商事 の全員が見られるようになります"), true);
ok("「よろしいですか」だけで済ませていない", /よろしいですか/.test(wordsOf(wide)), false);
ok("やめる道がある", wide.buttons(".access-confirm .action").some((one) => one.textContent.includes("やめる")), true);

const goAhead = wide.buttons(".access-confirm .action.is-danger")[0];
await wide.press(goAhead);
console.log(`      進んだあとに送ったもの: ${JSON.stringify(wide.sent)}`);
ok("進んで初めて送る", wide.sent.length, 1);
ok("送るのは望みの見せ方 1 つだけ", JSON.stringify(Object.keys(wide.sent[0]).sort()), JSON.stringify(["pageSlug", "scope"]));
ok("行き先を名指しで送っている", wide.sent[0].scope, "internal");

console.log("\n   狭めるほう（選んだ人だけに戻す）は念押ししない");
const back = await mount({ path: "/internal/report/2026q1", sharing: true, scope: "internal" });
await back.openSharing();
const toChosen = back.scopeInput("選んだ人だけ");
await back.press(toChosen);
ok("そのまま通す（見える人が減るだけで、押し直せば戻る）", back.sent.length, 1);
ok("行き先は「選んだ人だけ」", back.sent.length === 1 && back.sent[0].scope, "restricted");

console.log("\n   社外へ出す 1 手は、いちばん強く言い切る（押し直しても戻らない）");
const out = await mount({ path: "/internal/report/2026q1", sharing: true, scope: "internal" });
await out.openSharing();
const toAnyone = out.scopeInput("組織の外の誰でも");
await out.press(toAnyone);
const outWarning = out.shadow.querySelector(".access-warning");
console.log(`      ${outWarning === null ? "（断りが出ていない）" : outWarning.textContent}`);
ok("押しただけでは公開しない（先に断りが出る）", out.sent.length, 0);
ok(
  "誰が読めるようになるかを言う",
  outWarning !== null && outWarning.textContent.includes("組織の外の誰でも読めるようになります"),
  true,
);
ok(
  "ログインが要らないことも言う",
  outWarning !== null && outWarning.textContent.includes("ログインは要りません"),
  true,
);
ok(
  "社内向けの URL は生きていると言う（貼ってあるリンクの心配で手が止まらないように）",
  outWarning !== null && outWarning.textContent.includes("いまの 見本商事 の中で使う URL はそのまま使えます"),
  true,
);

/*
 * 検索と、公開の本当のリスクを**対で**言う。
 *
 * 検索避けだけ伝えると、安心だけを渡して肝心のリスクを隠すことになる。
 * 公開の危うさは検索ではなく人の手にある（転送・貼り付け・画面の写し）。
 * そして「出ません」と言い切れるのは 3 枚重ねで止めてあるからなので、
 * その 3 枚がそろっていることも一緒に見る——1 枚でも外れたら、この文言が嘘になる。
 */
ok(
  "検索には出ないと言う",
  outWarning !== null && outWarning.textContent.includes("検索には出ませんが"),
  true,
);
ok(
  "同じ文で、渡った先は追えないとも言う",
  outWarning !== null && outWarning.textContent.includes("渡った先から先は追えません"),
  true,
);
const NEXT_CONFIG = await readFile(`${root}/next.config.ts`, "utf8");
const OG = await readFile(`${root}/src/lib/pages/og.ts`, "utf8");
const ROBOTS = await readFile(`${root}/src/app/robots.ts`, "utf8");
ok("応答の頭で止めている", /"X-Robots-Tag", value: "noindex, nofollow"/.test(NEXT_CONFIG), true);
ok("ページの札でも止めている", /nameTag\("robots", "noindex, nofollow"\)/.test(OG), true);
ok("取りに来させない指示もある", /disallow: "\/"/.test(ROBOTS), true);
console.log("      ※ 3 枚のどれかが外れたら「検索には出ません」が嘘になるので、文言と一緒に見る");

/*
 * 押す前にやること（中身の見直し）は、**状態の説明とは別の段落**で置く。
 * 何が起きるかを読めても、自分のページを見返す動きにはならない。
 * 灰色の小さい字にしない——読み飛ばしてよい補足ではなく、いまやることだから。
 */
ok(
  "中身の見直しを頼む",
  /本文に個人情報や機密がないか確かめてください/.test(wordsOf(out)),
  true,
);
ok(
  "状態の説明とは別の段落に置く",
  out.shadow.querySelectorAll(".access-confirm .access-warning").length,
  2,
);
ok(
  "読み飛ばしてよい灰にしない（状態の説明と同じ強さ）",
  [...out.shadow.querySelectorAll(".access-confirm .note")].length,
  0,
);

/* 社内へ戻すほうでは頼まない（読む人が社外へ広がらないので） */
const backIn = await mount({ path: "/internal/report/2026q1", sharing: true, scope: "restricted" });
await backIn.openSharing();
await backIn.press(backIn.scopeInput("見本商事 の全員"));
ok(
  "社内へ戻すときは、見直しを頼まない",
  /本文に個人情報や機密がないか/.test(wordsOf(backIn)),
  false,
);
ok("やめる道がある", out.buttons(".access-confirm .action").some((one) => one.textContent.includes("やめる")), true);

const publish = out.buttons(".access-confirm .action.is-danger")[0];
await out.press(publish);
console.log(`      進んだあとに送ったもの: ${JSON.stringify(out.sent)}`);
ok("進んで初めて送る", out.sent.length, 1);
ok(
  "送るのは望みの見せ方 1 つだけ",
  JSON.stringify(Object.keys(out.sent[0]).sort()),
  JSON.stringify(["pageSlug", "scope"]),
);
ok("行き先を名指しで送っている", out.sent[0].scope, "public");

console.log("\n   許しを取り消すときも、誰が見られなくなるかを言う");
const cut = await mount({ path: "/internal/report/2026q1", sharing: true });
await cut.openSharing();
const revoke = cut.buttons(".access-row .action.is-danger")[0];
await cut.press(revoke);
const cutWarning = cut.shadow.querySelector(".access-warning");
console.log(`      ${cutWarning === null ? "（断りが出ていない）" : cutWarning.textContent}`);
ok("押しただけでは取り消さない", cut.sent.length, 0);
ok("相手の名を出して言い切る", cutWarning !== null && cutWarning.textContent.includes(`${MEMBER_EMAIL} は、このページを見られなくなります`), true);

await cut.press(cut.buttons(".access-confirm .action.is-danger")[0]);
console.log(`      取り消したあとに送ったもの: ${JSON.stringify(cut.sent)}`);
ok("進んで初めて送る", cut.sent.length, 1);
ok("送るのは「こうなっていてほしい」全部の並び", Array.isArray(cut.sent[0].members), true);
ok("取り消した人が並びから消えている", cut.sent[0].members.includes(MEMBER_EMAIL), false);
ok("触っていないグループは送らない（今のままにする）", "groups" in cut.sent[0], false);

// ---------------------------------------------------------------------------
console.log("\n--- 6. 見た目の値を発明していない ---");
/* 共有範囲のために足した見た目だけを切り出す */
const block = /\/\* ---- 共有範囲[\s\S]*?(?=\n\/\* ---- )/.exec(STYLES);
ok("共有範囲の見た目がひとまとまりに置いてある", block !== null, true);
const added = block === null ? "" : block[0];

const rawColors = added.match(/#[0-9a-f]{3,8}\b|rgba?\(/gi) ?? [];
console.log(`      生の色の値: ${rawColors.length === 0 ? "なし" : rawColors.join(" / ")}`);
ok("新しい色を足していない", rawColors.length, 0);

const rawSizes = added.match(/(?<![\w-])\d+(?:px|rem|em)\b/g) ?? [];
console.log(`      生の寸法: ${rawSizes.length === 0 ? "なし" : rawSizes.join(" / ")}`);
ok("素の余白・大きさを直書きしていない", rawSizes.length, 0);

const used = [...new Set((added.match(/var\((--[\w-]+)\)/g) ?? []).map((one) => one.slice(4, -1)))];
console.log(`      借りている名前: ${used.join(" / ")}`);
const unknown = used.filter((name) => !TOKENS.includes(`${name}:`));
ok("借りている名前は、すべて既にあるもの", unknown.length === 0 ? "なし" : unknown.join(" / "), "なし");

/*
 * 文字の大きさの序列（DESIGN.md 2 章「コメント部品の目盛り」）。
 *
 * 見出しは中身より必ず 1 段大きい（鉄則 1）。**役割ごとに 1 つ**に決めてあるので、
 * ここで名指しで押さえる。潰れると「見出しと中身が同格」「選択肢が添え物に見える」
 * という壊れ方をするが、どちらも画面はふつうに動くので目では見つけにくい。
 */
console.log("\n   文字の大きさの序列（見出しは中身より必ず 1 段大きい）");
const sizeOf = (name) => {
  const found = new RegExp(`\\n\\.${name} \\{[^}]*font-size: var\\((--font-[a-z]+)\\)`).exec(STYLES);
  return found === null ? "（無い）" : found[1];
};
ok("板の題", sizeOf("panel-title"), "--font-lg");
ok("節の見出し", sizeOf("access-head"), "--font-md");
ok("行の名前", sizeOf("access-name"), "--font-base");
ok("選び分け", sizeOf("pill"), "--font-base");
ok("選べる行", sizeOf("pick-row"), "--font-base");
ok("絞り込みの見出し", sizeOf("list-menu-label"), "--font-md");
ok("読み飛ばしてよい 1 行", sizeOf("note"), "--font-sm");
ok("控えめな操作", sizeOf("action"), "--font-sm");
console.log("      ※ 選べるものは本文と同じ大きさ。2 態の差は太さと濃さだけ（DESIGN.md 5 章）");

/*
 * いちばん小さい段（11px）は `src/app/**` に無い。**読まない字だけ**に使う。
 * 読ませる字（時刻・案内・ラベル）を落とすと、読んでほしいものが添え物に見える。
 */
const tiny = [
  ...new Set(
    [...STYLES.matchAll(/\n(\.[\w-]+(?:\s+[\w-]+)?) \{[^}]*font-size: var\(--font-xs\)/g)].map(
      (one) => one[1],
    ),
  ),
].sort();
console.log(`      いちばん小さい段を使っているもの: ${tiny.join(" ")}`);
ok(
  "読まない字だけ（数字・目印・1 文字・一時の吹き出し）",
  tiny.join(" "),
  ".avatar-initial .bar-count .change-number .hint-bubble .pick-count .version-sha",
);

console.log("\n   一覧の行・入力欄・ボタンは、板の中の既にあるものを使い回す");
ok("一覧から選ぶ行の作りは 1 つだけ", (STYLES.match(/^\.pick-row \{/m) ?? []).length, 1);
ok("Slack の一覧も同じ行を使っている", /"pick-row is-active" : "pick-row"/.test(WIDGET), true);
// Slack へ流す板（.share textarea）は配布版に無いので、入力欄の作りは共有範囲の 1 つだけ
ok("入力欄の作りは共有範囲の 1 つ", (STYLES.match(/^\.access-add input \{\s*width: 100%;/gm) ?? []).length, 1);
/*
 * 共有範囲のグループは、許可済みとまだのものを 1 本の並びにしたので、
 * スクロールする候補の一覧そのものを使わない（境目の線も消えた）。
 * 残っているのは Slack へ流す板の「探した結果」だけ。
 */
ok("候補の一覧（Slack の板の「探した結果」）の作りは残っていない", /^\.share-list \{/m.test(STYLES), false);
ok("共有範囲の一覧の見た目は残っていない", /\.access-list/.test(STYLES), false);
ok("送るボタンは既にあるもの", /el\("button", "button is-primary"\)/.test(WIDGET), true);
ok("危ない操作の見え方も既にあるもの", /"is-danger"/.test(WIDGET), true);

console.log("\n   色で段を作っていない（段は見出しの太さと余白だけ）");
ok("段の見出しは太さだけで示す", /\.access-head \{[^}]*font-weight: var\(--weight-bold\)/.test(added), true);
ok("段の見出しに色を当てていない", /\.access-head \{[^}]*color:/.test(added), false);
ok("段の区切りは余白だけ", /\.access-part \+ \.access-part \{ margin-top: var\(--space-5\); \}/.test(added), true);
ok("段を囲みや帯で仕切っていない", /\.access[\w-]*\s*\{[^}]*(border|background)/.test(added), false);

// ---------------------------------------------------------------------------
console.log("\n--- 7. 絵文字を使っていない ---");
const pictures = /\p{Extended_Pictographic}/u;
for (const name of ["comments/comments.ts", "shared/api.ts", "comments/dock.ts", "shared/styles.ts", "shared/util.ts", "shared/tokens.ts"]) {
  const text = await readFile(`${root}/src/widget/${name}`, "utf8");
  ok(`src/widget/${name}`, pictures.test(text), false);
}
ok("出来上がった画面にも無い", pictures.test(wordsOf(owner)), false);
has("印は既にある絵柄の仕組みで足している", /export const ICON_USERS = \[/, await readFile(`${root}/src/widget/shared/util.ts`, "utf8"));

// ---------------------------------------------------------------------------
console.log("\n--- 8. 前からあった動きを壊していない ---");
has("0 件なら板を開かない、はそのまま", /opensSheetOnLoad\((?:selectionFeature\.|connections\.)?sheetOpenPending, unresolvedCount, (?:selectionFeature\.)?isNarrow\(\)\)/);
has("板の中身は 1 枚で入れ替える（板を増やしていない）", /type PanelView = "comments" \| "changes" \| "versions" \| "access" \| "origin";/, await readFile(`${root}/src/widget/comments/types.ts`, "utf8"));
ok("見出しは中身の数だけある", (WIDGET.match(/const PANEL_TITLES: Record<PanelView, string> = \{[\s\S]*?\};/) ?? [""])[0].split("\n").length - 2, 5);
has("過去の版を見比べる道はそのまま", /if \(state\.view === "changes"\) state\.view = "versions";/);
console.log(`      道具箱の並び（持ち主の社内ページ）: ${owner.barTitles().join(" / ")}`);
ok("コメントの入口は先頭のまま", owner.barTitles()[0], "コメント");
// 右端は ⋯。たまにしか使わない道具（履歴・取り込み・Slack・共有範囲・読み方）はその中に畳む
ok("バーの右端は「その他」", owner.barTitles().at(-1), "その他");
ok("共有範囲は ⋯ の「このページ」の段の末尾（前からある並びを崩さない）", (await owner.menuTitles()).at(-1), "共有範囲");

// ---------------------------------------------------------------------------
console.log("\n--- 9. 閲覧許可の申請に、持ち主が答えられる ---");

console.log("\n   0 件なら段ごと出さない（中身の無い見出しを置かない）");
ok("待っている人がいない画面に、その見出しが無い", /閲覧許可の申請/.test(wordsOf(owner)), false);

const waited = await mount({ path: "/internal/report/2026q1", sharing: true, waiting: true });
await waited.openSharing();
ok("待っている人がいれば段が出る", /閲覧許可の申請/.test(wordsOf(waited)), true);
ok("名前とアドレスの両方が出る（同姓同名で取り違えない）", wordsOf(waited).includes(`${ASKER_NAME}（${ASKER_EMAIL}）`), true);
ok(
  "答える段は、名簿の段より先に出る（いちばん急ぐものを上に）",
  wordsOf(waited).indexOf("閲覧許可の申請") < wordsOf(waited).indexOf("見せる人"),
  true,
);

console.log("\n   承認は「誰が見られるようになるか」を言ってから");
const approve = waited.buttons(".access-part .action").find((one) => one.textContent.includes("承認"));
await waited.press(approve);
const askWarning = waited.shadow.querySelector(".access-warning");
console.log(`      ${askWarning === null ? "（断りが出ていない）" : askWarning.textContent}`);
ok("押しただけでは通さない", waited.sent.length, 0);
ok("誰が見られるようになるかを名指しで言う", askWarning !== null && askWarning.textContent.includes(`${ASKER_NAME}（${ASKER_EMAIL}） が、このページを見られるようになります`), true);

await waited.press(waited.buttons(".access-confirm .action.is-danger")[0]);
console.log(`      送ったもの: ${JSON.stringify(waited.sent)}`);
ok("送るのは返事 1 件だけ", JSON.stringify(waited.sent), JSON.stringify([{ pageSlug: "internal/report/2026q1", answer: { id: "r1", approved: true } }]));
ok("名簿の並びを混ぜて送っていない", "members" in waited.sent[0], false);
ok("承認したら、その人が名簿に増えている", wordsOf(waited).includes(ASKER_EMAIL), true);
ok("答え終わった申し出は、もう並ばない", /閲覧許可の申請/.test(wordsOf(waited)), false);

console.log("\n   却下はまた頼めるので、念押しを挟まない");
const turned = await mount({ path: "/internal/report/2026q1", sharing: true, waiting: true });
await turned.openSharing();
const reject = turned.buttons(".access-part .action").find((one) => one.textContent.includes("却下"));
await turned.press(reject);
console.log(`      送ったもの: ${JSON.stringify(turned.sent)}`);
ok("そのまま通す", turned.sent.length, 1);
ok("断る向きで送っている", turned.sent[0].answer.approved, false);
ok("断った人は名簿に入らない", wordsOf(turned).includes(ASKER_EMAIL), false);
ok("段ごと消える", /閲覧許可の申請/.test(wordsOf(turned)), false);

console.log("\n   入口の作り（承認は名簿への足し込みも連れてくる）");
const ROUTE = codeOnly(await readFile(`${root}/src/app/api/pages/access/route.ts`, "utf8"));
has("返事は別の欄で受ける", /const answer = record\["answer"\] === undefined \? null : readAnswer\(record\["answer"\]\);/, ROUTE);
ok("見せ方の変更と混ぜて送られたら断る", /rt\("toolbox\.server\.access\.answerWithScope"\)/.test(ROUTE) && /answerWithScope: "申し出への返事は、見せ方の変更と一緒には送れません"/.test(TOOLBOX_JA), true);
has("誰をどのページに足すかは、積まれている行から採る", /const pending = await findPendingRequest\(organization, answer\.id\);/, ROUTE);
has("別のページ宛ての申し出は通さない", /pending\.pageId !== target\.id/, ROUTE);
has("承認したら名簿にも足す", /await grantToMember\(organization, target\.id, pending\.requesterEmail, viewer\.email\);/, ROUTE);
ok(
  "足してから、しまう（途中で転んでも「承認済みなのに入れない」を残さない）",
  ROUTE.indexOf("await grantToMember(organization, target.id, pending.requesterEmail") <
    ROUTE.indexOf("await resolveAccessRequest(organization, answer.id"),
  true,
);
has("一覧にも申し出を載せる", /listPendingRequests\(organization, found\.page\.id\)/, ROUTE);
has("書いたあとの姿にも載せる", /listPendingRequests\(organization, after\.page\.id\)/, ROUTE);
has("読む側は、欄が無い応答でも 0 件として読む", /const asked = record\["requests"\];/, API);

// ---------------------------------------------------------------------------
console.log("\n--- 10. 共同の作った人（このページの共有も触れる人）---");

console.log("\n   決めるのはサーバー。画面は届いた役割をそのまま出す");
has("届いた役割をそのまま読む", /role: readString\(record, "role"\) === "owner" \? "owner" : "viewer",/, API);
has("役割の欄が無い応答は、いちばん狭いほうに倒す", /=== "owner" \? "owner" : "viewer"/, API);
lacks("画面側で「共有を触れる人」を数え直していない", /grant\.memberEmail === state\.|ownerGrant/);

const roled = await mount({ path: "/internal/report/2026q1", sharing: true });
await roled.openSharing();
const roleLines = () => roled.buttons(".access-name .note").map((one) => one.textContent);
const actions = (label) =>
  roled.buttons(".access-row .action").filter((one) => one.textContent.includes(label));

console.log("\n   押す前に、押すと何ができる人になるかを言っている");
ok(
  "説明の 1 行がある",
  /共同の作った人は、このページの共有をここから変えられます。/.test(wordsOf(roled)),
  true,
);

console.log("\n   付け替えの口は、人の行にだけ出す（まとまりには役割を持たせない）");
ok("人の行に「作った人にする」がある", actions("作った人にする").length, 1);
ok(
  "まとまりの行には出ていない",
  roled.buttons(".access-row .action").filter((one) => one.textContent.includes("作った人にする")).length,
  1,
);
ok("まだ誰にも役割の細字が付いていない", roleLines().length, 0);

await roled.press(actions("作った人にする")[0]);
console.log(`      送ったもの: ${JSON.stringify(roled.sent)}`);
ok("押したらそのまま送る（押し直せば戻るので念押ししない）", roled.sent.length, 1);
ok("送るのは役割の付け替えだけ", JSON.stringify(Object.keys(roled.sent[0]).sort()), JSON.stringify(["pageSlug", "role"]));
ok("名簿の並びを混ぜて送っていない", "members" in roled.sent[0], false);
ok("向きは作った人にする側", roled.sent[0].role.to, "owner");
ok("付け替えたら、名前の下に細字で出る（札は /sharing と同じ言い方）", roleLines().join(" / "), "作った人（共同）");
ok("行を色や囲みで塗り分けていない", /access-row is-|access-role/.test(WIDGET), false);

console.log("\n   もとに戻す道も同じ行に置く");
ok("作った人の行は「閲覧に戻す」に変わる", actions("閲覧に戻す").length, 1);
ok("「作った人にする」はもう出ていない", actions("作った人にする").length, 0);
await roled.press(actions("閲覧に戻す")[0]);
ok("戻す向きで送っている", roled.sent[1].role.to, "viewer");
ok("戻したら細字も消える", roleLines().length, 0);

console.log("\n   入口の作り（触ってよい人を 1 か所で決める）");
has("門は共同の作った人も見る", /canManageSharing\(viewer, gate\.page, admin, ownerGrant\)/, ROUTE);
has("「管理者か」と同時に投げる", /const \[admin, ownerGrant\] = await Promise\.all\(\[/, ROUTE);
has("一覧に役割を載せる", /role: permission\.role,/, ROUTE);
has("付け替えは目印で指す（アドレスで指さない）", /type RoleChange = \{ id: string; to: PermissionRole \};/, ROUTE);
has("知らない役割は通さない", /const to = PERMISSION_ROLES\.find\(\(known\) => known === record\["to"\]\);/, ROUTE);
ok("ほかの変更と混ぜて送られたら断る", /rt\("toolbox\.server\.access\.roleWithOthers"\)/.test(ROUTE) && /roleWithOthers: "役割の変更は、ほかの変更と一緒には送れません"/.test(TOOLBOX_JA), true);
has("触るのはそのページの行だけ", /setPermissionRole\(organization, role\.id, target\.id, role\.to\)/, ROUTE);
ok("まとまりあてには付けられない", /rt\("toolbox\.server\.access\.coOwnerMembersOnly"\)/.test(ROUTE) && /coOwnerMembersOnly: "共同の作った人にできるのは個人あての許可だけです"/.test(TOOLBOX_JA), true);
ok("もう無い許可は「ありません」", /if \(outcome === "missing"\) return jsonError\(rt\("toolbox\.server\.access\.grantMissing"\), 404\);/.test(ROUTE) && /grantMissing: "その許可はありません"/.test(TOOLBOX_JA), true);

console.log("\n   道具箱の項目（コメントの入口）も同じ決まりで出す");
const COMMENTS_ROUTE = codeOnly(await readFile(`${root}/src/app/api/comments/route.ts`, "utf8"));
has(
  "作った人・管理者は、名簿を見に行かずに通る",
  /let sharing = isMember\(viewer\) && canManageSharing\(viewer, gate\.page, admin\);/,
  COMMENTS_ROUTE,
);
has(
  "引きに行くのは、会社の人で、制限つきのページのときだけ",
  /if \(\(!sharing \|\| !edit\) && isMember\(viewer\) && gate\.page\.visibility === "restricted"\) \{/,
  COMMENTS_ROUTE,
);
ok(
  "ふつうの社内ページを開いただけでは引かない（社員全員に 1 往復足さない）",
  /canToggleRestricted\(gate\.page\.visibility\)/.test(COMMENTS_ROUTE),
  false,
);
has("見せ方は門を通ったページの行からだけ読む", /gate\.page\.visibility === "restricted"/, COMMENTS_ROUTE);
// 1 回の照会を、共有（sharing）と本文の直し（edit）の 2 つの旗で使い回す
has("役割の名簿は 1 回しか引かない", /const ownerGrant = await hasOwnerGrant\(organization, gate\.page\.id, viewer\.email\);/, COMMENTS_ROUTE);
ok("引くのは 1 か所だけ", (COMMENTS_ROUTE.match(/hasOwnerGrant\(/g) ?? []).length, 1);

// ---------------------------------------------------------------------------
console.log("\n--- 11. 自分で自分を締め出せない ---");
/*
 * 共同の作った人は、自分の行にも「閲覧に戻す」「取り消す」を出せる立場にいる。
 * 前者を押せば共有を触る力が、後者を押せばページを見る力そのものが自分から外れ、
 * **外したあとは自分では戻せない**。画面と入口の二重で塞いであるかを見る。
 */
const selfView = await mount({ path: "/internal/report/2026q1", sharing: true, selfOwner: true });
await selfView.openSharing();
const rowOf = (view, who) =>
  [...view.shadow.querySelectorAll(".access-row")].find((one) => one.textContent.includes(who));

console.log("\n   画面: 自分の行からは、どちらの口も落とす");
ok("自分の行が並んでいる", rowOf(selfView, SELF_EMAIL) !== undefined, true);
ok("「閲覧に戻す」が出ていない", rowOf(selfView, SELF_EMAIL).textContent.includes("閲覧に戻す"), false);
ok("「取り消す」も出ていない", rowOf(selfView, SELF_EMAIL).textContent.includes("取り消す"), false);
ok("代わりに細字で「あなたです」と言う", rowOf(selfView, SELF_EMAIL).textContent.includes("あなたです"), true);
ok("その行に押せるものが 1 つも無い", rowOf(selfView, SELF_EMAIL).querySelectorAll("button").length, 0);
ok("札は出したまま（何者かは分かる）", rowOf(selfView, SELF_EMAIL).textContent.includes("作った人（共同）"), true);

console.log("\n   ほかの人の行はそのまま");
ok("他人の行には付け替えの口がある", rowOf(selfView, MEMBER_EMAIL).textContent.includes("作った人にする"), true);
ok("他人の行には取り消す口もある", rowOf(selfView, MEMBER_EMAIL).textContent.includes("取り消す"), true);
/* まとまりは入り切りの四角で持つので、行ごとの口は 1 つも無い（状態は四角が言う） */
ok(
  "まとまりは四角で、行ごとの口を持たない",
  [...selfView.shadow.querySelectorAll(".access-part .check-input")].length,
  2,
);

console.log("\n   立てるのはサーバー。画面はアドレスを突き合わせない");
has("届いた印をそのまま読む", /mine: record\["mine"\] === true,/, API);
has("出し分けは、その印と役割だけを見る", /if \(grant\.mine && grant\.role === "owner"\) \{/);
lacks("画面側で見ている人のアドレスと比べていない", /viewerEmail|myEmail/);

console.log("\n   入口（画面を通さない通信も断る）");
has("自分の行かはサーバーが立てる", /mine: isMine\(permission, viewer\),/, ROUTE);
has("突き合わせは大文字小文字を落としてから", /left\.trim\(\)\.toLowerCase\(\) === right\.trim\(\)\.toLowerCase\(\)/, ROUTE);
lacks("応答に見ている人のアドレスを増やしていない", /viewerEmail|selfEmail/, ROUTE);
has("見るのは自分の「作った人（共同）」の行だけ", /one\.role === "owner" && isMine\(one, viewer\)/, ROUTE);
has(
  "自分を閲覧に戻す通信は断る",
  /rt\("toolbox\.server\.access\.selfDemote"\),/,
  /selfDemote: "自分を閲覧に戻すことはできません。別の作った人か管理者に頼んでください。"/.test(TOOLBOX_JA) ? ROUTE : "",
);
has(
  "自分への許可を取り消す通信も断る",
  /rt\("toolbox\.server\.access\.selfRevoke"\),/,
  /selfRevoke: "自分への許可は自分では取り消せません。別の作った人か管理者に頼んでください。"/.test(TOOLBOX_JA) ? ROUTE : "",
);
ok(
  "断るのは、どの書き込みよりも先（断ったのに見せ方だけ変わった、を残さない）",
  ROUTE.indexOf("自分を閲覧に戻すことはできません") < ROUTE.indexOf("await setPageScope("),
  true,
);
ok(
  "見るだけの人として載っている自分は、今までどおり自分で外せる",
  /role === "owner" && isMine/.test(ROUTE),
  true,
);
ok("そのために引く並びは 1 回だけ", (ROUTE.match(/await listPagePermissions\(organization, target\.id\)/g) ?? []).length, 2);

// ---------------------------------------------------------------------------
console.log("\n--- 12. 絵柄と読み上げ ---");
const UTIL = await readFile(`${root}/src/widget/shared/util.ts`, "utf8");

console.log("\n   同じ絵柄が 2 つの意味を持たない");
has("「作った人にする」に自前の絵柄がある", /export const ICON_USER_PEN = \[/, UTIL);
has("「閲覧に戻す」にも自前の絵柄がある", /export const ICON_EYE = \[/, UTIL);
has("付け替えの口はその絵柄を使う", /ICON_USER_PEN,/);
has("戻す口もその絵柄を使う", /ICON_EYE,/);
ok(
  "共有範囲の絵柄（人）を付け替えの口に流用していない",
  /actionButton\(\s*(?:"作った人にする"|t\("toolbox\.access\.toOwner"\)),\s*ICON_USERS/.test(WIDGET),
  false,
);
ok(
  "コメント再開の矢印を「閲覧に戻す」に流用していない",
  /actionButton\(\s*(?:"閲覧に戻す"|t\("toolbox\.access\.toViewer"\)),\s*ICON_REOPEN/.test(WIDGET),
  false,
);
ok("人の絵柄は共有範囲の入口と「見本商事 の全員」だけ", (WIDGET.match(/(?:barButton\([^;\n]*|icon: )ICON_USERS/g) ?? []).length, 2);

console.log("\n   同じ字のボタンが行の数だけ並ぶので、読み上げ名に相手を入れる");
const spoken = await mount({ path: "/internal/report/2026q1", sharing: true, selfOwner: true });
await spoken.openSharing();
const named2 = (label) =>
  spoken
    .buttons(".access-row .action")
    .filter((one) => one.textContent.includes(label))
    .map((one) => one.getAttribute("aria-label"));
console.log(`      読み上げ名: ${spoken.buttons(".access-row .action").map((one) => one.getAttribute("aria-label")).join(" / ")}`);
ok("「作った人にする」は相手を言う", named2("作った人にする")[0], `${MEMBER_EMAIL} を作った人にする`);
ok("「取り消す」も相手を言う", named2("取り消す")[0], `${MEMBER_EMAIL} への許可を取り消す`);
/* まとまりは四角なので、読み上げるのは名札（グループ名）そのもの */
ok(
  "まとまりの四角は、その名を名札にしている",
  [...owner.shadow.querySelectorAll(".access-part .check-label")].map((one) => one.textContent).join(" / "),
  "経営 / 開発",
);
has("読み上げ名を渡さないボタンは、見えている字のまま", /if \(spokenLabel !== undefined\) button\.setAttribute\("aria-label", spokenLabel\);/);

const back2 = await mount({ path: "/internal/report/2026q1", sharing: true });
await back2.openSharing();
await back2.press(
  back2.buttons(".access-row .action").find((one) => one.textContent.includes("作った人にする")),
);
ok(
  "「閲覧に戻す」も相手を言う",
  back2
    .buttons(".access-row .action")
    .find((one) => one.textContent.includes("閲覧に戻す"))
    .getAttribute("aria-label"),
  `${MEMBER_EMAIL} を閲覧に戻す`,
);

console.log("\n   狭い板で行が崩れない");
ok("行は折り返せる", /\.access-row \{[^}]*flex-wrap: wrap;/.test(added), true);
ok("名前は中身の幅を基準に置く（短い行は今までどおり 1 行）", /\.access-name \{ flex: auto;/.test(added), true);

// ---------------------------------------------------------------------------
console.log("\n--- 13. 社外への公開を、この板から付け外しできる ---");
console.log("   社内として投稿したページは、呼び名を動かさずに /public/… の入口だけを開け閉めする");

const opened = await mount({ path: "/internal/report/2026q1", sharing: true, scope: "public" });
await opened.openSharing();
ok("いま選ばれているのは「組織の外の誰でも」", opened.pickedScope(), "組織の外の誰でも");
ok("いまの状態を文で言っている", /URL を知っていれば、組織の外の誰でも見られます/.test(wordsOf(opened)), true);

console.log("\n   社外へ渡す URL を、その場で写せる");
const shown = opened.shadow.querySelector(".access-url")?.textContent ?? "";
console.log(`      出ている URL: ${shown}`);
ok("公開の入口を指している", shown, "https://example.com/public/report/2026q1");
console.log("      ※ いま開いているのは /internal/… のほう。URL から作ると社内の入口を渡してしまう");
ok(
  "写す口がある",
  opened.buttons(".access-link .action").some((one) => one.textContent.includes("リンクをコピー")),
  true,
);
console.log("      ※ 字はバーの口とそろえる（同じ役割なので同じ字）。どちらの入口かは URL が示す");

/*
 * リンクは**どの見せ方でも出す**。見せる相手を決めたその足で渡したくなるので、
 * ここに無いと右下のバーまで戻ることになる。
 */
const shownLinks = [
  ["選んだ人だけ", "restricted", "https://example.com/internal/report/2026q1"],
  ["見本商事 の全員", "internal", "https://example.com/internal/report/2026q1"],
  ["組織の外の誰でも", "public", "https://example.com/public/report/2026q1"],
];
for (const [label, scope, url] of shownLinks) {
  const view = await mount({ path: "/internal/report/2026q1", sharing: true, scope });
  await view.openSharing();
  ok(`${label}: その見せ方で渡す URL が出る`, view.shadow.querySelector(".access-url")?.textContent, url);
}
ok("閉じるまでにかかる時間を先に言う", /この URL は 1 分ほどで閉じます/.test(wordsOf(opened)), true);

console.log("\n   どこからでも 1 手で動ける（遠回りをさせない）");
console.log("   隣どうししか動かせない形だと、名簿で絞った状態から社外へ出すのに");
console.log("   「いったん見本商事 の全員に戻す」を挟ませることになる。押す人には理由が見えない");

const jump = await mount({ path: "/internal/report/2026q1", sharing: true, scope: "restricted" });
await jump.openSharing();
const jumpTo = jump.scopeInput("組織の外の誰でも");
ok("名簿で絞った状態からでも押せる", jumpTo?.disabled, false);
await jump.press(jumpTo);
const jumpWarning = jump.shadow.querySelector(".access-warning");
console.log(`      ${jumpWarning === null ? "（断りが出ていない）" : jumpWarning.textContent}`);
ok("押しただけでは公開しない", jump.sent.length, 0);
ok(
  "組織の外の誰でも読めるようになると言う",
  jumpWarning !== null && jumpWarning.textContent.includes("組織の外の誰でも読めるようになります"),
  true,
);
ok(
  "名簿が効かなくなることも言う（2 つ同時に起きるので両方言う）",
  jumpWarning !== null && jumpWarning.textContent.includes("ここで選んだ人はそのまま残りますが、効かなくなります"),
  true,
);
await jump.press(jump.buttons(".access-confirm .action.is-danger")[0]);
ok("進むと 1 手で公開になる", jump.sent.length === 1 && jump.sent[0].scope, "public");

const shrink = await mount({ path: "/internal/report/2026q1", sharing: true, scope: "public" });
await shrink.openSharing();
await shrink.press(
  shrink.scopeInput("選んだ人だけ"),
);
ok("公開中から名簿へも 1 手（狭まる向きなので念押しなし）", shrink.sent.length, 1);
ok("行き先を名指しで送っている", shrink.sent.length === 1 && shrink.sent[0].scope, "restricted");

console.log("\n   やめるほうは念押ししない（見える人が減るだけ）");
const closing = await mount({ path: "/internal/report/2026q1", sharing: true, scope: "public" });
await closing.openSharing();
const backToInside = closing.scopeInput("見本商事 の全員");
await closing.press(backToInside);
console.log(`      送ったもの: ${JSON.stringify(closing.sent)}`);
ok("そのまま通す", closing.sent.length, 1);
ok("行き先を名指しで送っている", closing.sent.length === 1 && closing.sent[0].scope, "internal");
ok("状態が入れ替わる", /見本商事 の全員がこのページを見られます/.test(wordsOf(closing)), true);

console.log("\n   公開として投稿したページには、この選び分けを出さない");
console.log("   （あちらは /public/… しか入口が無く、社内へ戻すと誰も開けなくなる）");
const fixed = await mount({ path: "/internal/report/2026q1", sharing: true, scope: "internal", switchable: false });
await fixed.openSharing();
ok("選び分けは 2 つに戻る", fixed.scopeRows().length, 2);
ok(
  "「組織の外の誰でも」が無い",
  fixed.scopeLabels().includes("組織の外の誰でも"),
  false,
);
console.log("      ※ 出すかどうかはサーバーの答え（switchable）だけで決める。画面で数え直さない");

console.log("\n   口の語彙は板の中で 1 つ（塗りの口をここに置かない）");
const voc = await mount({ path: "/internal/report/2026q1", sharing: true });
await voc.openSharing();
ok("塗りの口が 1 つも無い", voc.buttons(".button.is-primary").length, 0);
console.log("      ※ 塗りはその板でやりたいことに取ってある。ここの主役は上の選び分け");
ok(
  "アドレスを足す口も、ほかの口と同じ語彙",
  voc.buttons(".access-add .action").some((one) => one.textContent.includes("追加")),
  true,
);
/*
 * 塗りの口を使ってよいのは「その板でやりたいこと」だけ。
 * 増えていたら、そこは板の主役かどうかを問い直す場所のはず。
 */
const primary = (WIDGET.match(/el\("button", "button is-primary"\)/g) ?? []).length;
// Slack への「投稿」は配布版に無いので 2 か所
ok("塗りの口を出しているのは 2 か所だけ", primary, 2);
console.log("      ※ 編集の「保存」・まとめて動かす口。どれもその板でやりたいこと");
console.log("      ※ どれも同時には出ない（1 画面に塗りは 1 つまで）");
ok("押せない口は薄くする", /\.action\[disabled\] \{ opacity: \.45; cursor: default; \}/.test(STYLES), true);

console.log("\n   入力欄は、触っているときだけ枠を主張する");
ok("置いてあるときの枠は弱い", /\.access-add input \{[\s\S]*?border: var\(--rule-thin\) solid var\(--border-light\);/.test(STYLES), true);
ok("触ると主張する", /\.access-add input:focus[^{]*\{ border-color: var\(--accent\); \}/.test(STYLES), true);
console.log("      ※ 常時 --border だと、横幅いっぱいの枠が板の中でいちばん強い塊になる");

console.log("\n   押しても何も起きない口を作らない");
const here = await mount({ path: "/internal/report/2026q1", sharing: true, scope: "internal" });
await here.openSharing();
ok("いま居る場所は押せない", here.scopeInput("見本商事 の全員")?.disabled, true);
console.log("      ※ 押しても何も起きないので、口として出さない（居場所の印は丸が持つ）");
const onList = await mount({ path: "/internal/report/2026q1", sharing: true, scope: "restricted" });
await onList.openSharing();
ok(
  "名簿で絞っているときも、その口は押せない",
  onList.scopeInput("選んだ人だけ")?.disabled,
  true,
);
ok("公開中も、その口は押せない", opened.scopeInput("組織の外の誰でも")?.disabled, true);
/* 1 つだけ選ぶ印は丸。複数入り切りの四角と形で分ける（丸＝どれか 1 つ、四角＝いくつでも） */
ok("1 つだけ選ぶ印は丸", /\.radio-mark \{[^}]*border-radius: 50%;/.test(STYLES), true);
ok("選ばれたときだけ中に点が出る", /\.check-input:checked \+ \.radio-mark::after \{ background: var\(--muted\); \}/.test(STYLES), true);
ok("親子は字下げだけ（縦線も囲みも帯も無い）", /\.scope-child \{\s*padding-left:[^}]*\}/.test(STYLES), true);
const childRule = /\.scope-child \{([^}]*)\}/.exec(STYLES)?.[1] ?? "";
ok("字下げの決まりに線が混ざっていない", /border|background/.test(childRule), false);

console.log("\n   狭い板で選び分けが崩れない");
ok("選び分けは折り返せる", /\.access-scope \.picker \{ flex-wrap: wrap; \}/.test(added), true);
ok("URL も折り返せる", /\.access-url \{[^}]*overflow-wrap: anywhere;/.test(added), true);

console.log("\n   配布版では、招待した直後に送るリンクを指し示す");
async function invite(personal) {
  const screen = await mount({ path: "/internal/report/2026q1", sharing: true, scope: "restricted", personal });
  await screen.openSharing();
  const field = screen.shadow.querySelector(".access-add input");
  field.value = "guest@example.com";
  field.dispatchEvent(new screen.win.Event("input", { bubbles: true }));
  await screen.press(screen.buttons(".access-add .action")[0]);
  const people = [...screen.shadow.querySelectorAll(".access-part")].find((part) => part.querySelector(".access-add") !== null);
  return { screen, people };
}
const invitedPersonal = await invite(true);
ok("配布版の招待は、名簿の並びとして送る", invitedPersonal.screen.sent.at(-1)?.members?.includes("guest@example.com"), true);
ok("配布版の招待の直後に、知らせが届かないことを言う", invitedPersonal.people?.textContent.includes("guest@example.com を招待しました。相手には知らせが届かないので、上のリンクを送ってください。"), true);
const links = [...invitedPersonal.screen.shadow.querySelectorAll(".access-link")];
ok("指している上のリンクは 1 つだけで、同じリンクを 2 度並べない", links.length, 1);
ok("そのリンクは資料の URL", links[0]?.querySelector(".access-url")?.textContent, "https://example.com/internal/report/2026q1");
ok("そのリンクには写す口がある", links[0]?.querySelector(".action")?.textContent.includes("リンクをコピー"), true);
const invitedCompany = await invite(false);
ok("社内版の招待では、この案内を出さない", invitedCompany.people?.textContent.includes("相手には知らせが届かない"), false);

console.log(`\n${fails === 0 ? "すべて合格" : `${fails} 件 不合格`}`);

// 道具箱は見ている間、定期にコメントを読み直す（src/widget/comments/live.ts）。jsdom に載せたままなので、検査が済んだらここで終える
process.exit();
