import { databaseStub, readAccessSource, companyDeployment } from "./paths.mjs";
import { GATE_ENTRIES } from "./gate-entries.mjs";
/**
 * 「門（見てよいかの判定）が、全部の入口に付いているか」を確かめる。
 *
 * 可否そのものの正しさは check-access.mjs が見ている。こちらが見るのは
 * **付け忘れ**のほう。入口は本文だけではなく、素材・コメント・履歴・共有・一覧と
 * 5 つ以上あり、1 つでも抜けるとそこから読めてしまう。しかも抜けても画面は
 * ふつうに動くので、目では気づけない。
 *
 * ここで見るのは 7 つ。
 *   1. 見せ方（3 通り）と、呼び名の頭の文字（2 通り）が別の型に分かれているか
 *   2. 門を付けるべき入口が、全部 openPage を通っているか
 *   3. 門を素通りする道が塞がれているか（本文の読み口が「引き当て済みのページ」しか受けない）
 *   4. 呼び名の頭の文字を、可否の判定に使っていないか
 *   5. 一覧が「見られないページ」を出していないか（総当たり）と、往復の数と、制限つきの印
 *   6. 403 の紙に、ページの題名も要約も載っていないか
 *   7. 制限つきの中身が、公開ページの配信網に乗らないか
 *
 * 保管庫には繋がない。判定と組み立ての部分だけを取り出して、実際に呼んで確かめる。
 */
import { readdir, readFile, writeFile } from "node:fs/promises";

import { root, dir } from "./paths.mjs";
const { build } = await import(`${root}/node_modules/esbuild/lib/main.js`);

const read = (path) => readFile(`${root}/${path}`, "utf8");
const strip = (text) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");

const CONTENT = strip(await read("src/lib/pages/content.ts"));
const TYPES = strip(await read("src/lib/comments/types.ts"));
const COMMENTS = strip(await read("src/lib/comments/comments.ts"));
const STORE = strip(await read("src/lib/pages/store.ts"));
const PAGE_CACHE = strip(await read("src/lib/pages/cache.ts"));
const REVISIONS = strip(await read("src/lib/revisions/revisions.ts"));
const ACCESS = strip(readAccessSource());
const NO_ACCESS = strip(await read("src/lib/access/no-access.ts"));

let fails = 0;
const ok = (label, actual, expected) => {
  const pass = String(actual) === String(expected);
  if (!pass) fails += 1;
  console.log(`${pass ? "OK  " : "NG  "} ${label}: ${actual}（期待: ${expected}）`);
};

/** src/app/ の下の実装ファイルを全部読む（入口の数え上げに使う）。 */
async function collect(from) {
  const found = [];
  for (const entry of await readdir(`${root}/${from}`, { withFileTypes: true })) {
    const path = `${from}/${entry.name}`;
    if (entry.isDirectory()) found.push(...(await collect(path)));
    else if (/\.tsx?$/.test(entry.name)) found.push(path);
  }
  return found;
}
const APP_FILES = (await collect("src/app")).sort();
const APP = new Map();
for (const path of APP_FILES) APP.set(path, strip(await read(path)));
APP.set("src/lib/pages/private-page.ts", strip(await read("src/lib/pages/private-page.ts")));

// ---------------------------------------------------------------------------
console.log("--- 1. 見せ方（3 通り）と、呼び名の頭の文字（2 通り）を混ぜない ---");
console.log("   制限つきのページも呼び名は internal/… のまま。ここを 1 つの型にすると呼び名が壊れる");

ok(
  "台帳の見せ方は 3 通り",
  /VISIBILITIES = \["internal", "public", "restricted"\] as const/.test(CONTENT),
  true,
);
ok("呼び名の頭は 2 通りのまま", /SLUG_VISIBILITIES = \["internal", "public"\] as const/.test(TYPES), true);
ok("呼び名の頭に restricted を足していない", /SLUG_VISIBILITIES = \[[^\]]*restricted/.test(TYPES), false);
ok("名前が分かれている（Visibility / SlugVisibility）", /export type SlugVisibility/.test(TYPES), true);
ok("3 通りを 2 通りへ畳む口が 1 つだけある", (CONTENT.match(/export function slugVisibilityOf/g) ?? []).length, 1);
ok("URL の頭は呼び名の頭から決める", /return slugPrefix === "internal" \? "\/internal" : "\/public";/.test(CONTENT), true);
ok("見せ方から決めるときは、先に畳む（制限つきは /i）", /return urlPrefixFor\(slugVisibilityOf\(visibility\)\);/.test(CONTENT), true);

console.log("\n   ページを指す URL は、見せ方ではなく呼び名から作る");
console.log("   （公開に切り替えても呼び名は動かない。見せ方から作ると /public/… に移って、公開をやめる導線が消える）");
ok("呼び名から作る口が 1 つある", (STORE.match(/export function pageHrefOf\(/g) ?? []).length, 1);
ok("一覧の行き先はそこを通る", /const href = pageHrefOf\(page\.pageSlug\);/.test(STORE), true);
ok("読めなければ行ごと落とす", /if \(href === null\) return null;/.test(STORE), true);

/*
 * 見せ方から URL を作ってよいのは、まだ呼び名が決まっていない 2 か所だけ。
 * 増えていたら、そこは呼び名から作るべき場所のはず。
 */
const byVisibility = [...APP.entries()].filter(([, code]) => /urlPrefix\(/.test(code)).map(([path]) => path);
ok("見せ方から URL を作っている入口", byVisibility.join(" / "), "src/app/api/pages/route.ts");
console.log("      ※ 管理画面の制限つきの一覧（いつも /i）と、投稿の返事（投稿の指定がそのまま呼び名になる）");
ok("台帳の読み取りが 3 通りとも通す", /VISIBILITIES\.some\(\(known\) => known === value\)/.test(STORE), true);
ok("2 通りだけを通す古い書き方が残っていない", /value === "internal" \|\| value === "public"/.test(STORE), false);

console.log("\n   呼び名の指定は visibility という欄を持たない（可否に使いようがない形にする）");
ok("欄の名前は slugPrefix", /export type PageRef = \{ slugPrefix: SlugVisibility; slug: string \};/.test(COMMENTS), true);
ok("呼び名の指定に visibility 欄が無い", /export type PageRef = \{[^}]*visibility:/.test(COMMENTS), false);
ok("投稿の指定にも visibility 欄が無い", /export type PageRefParts = \{[\s\S]*?slugPrefix: SlugVisibility;[\s\S]*?\};/.test(STORE), true);

// ---------------------------------------------------------------------------
console.log("\n--- 2. 門を付けるべき入口が、全部そろっているか ---");
console.log("   入口を増やした人がここへ足し忘れたら、下の 3 で落ちる");

/** 入口 → その入口が必ず呼ぶ門（一覧は tests/checks/gate-entries.mjs。組織の境の判定器 check-tenant-isolation.mjs も同じ一覧を読む）。 */
const ENTRIES = GATE_ENTRIES;

for (const [path, needed] of ENTRIES) {
  const code = APP.get(path);
  ok(`  入口がある: ${path}`, code !== undefined, true);
  for (const call of needed) {
    ok(`    ${call} を通る`, code !== undefined && code.includes(call), true);
  }
}
ok("門を付けた入口の数", ENTRIES.length, 17);
const EDIT_GATE = strip(await read("src/lib/access/page-edit-access.ts"));
ok("共通の編集の門は閲覧の許可を確認する", EDIT_GATE.includes("openPage(organization, viewer, pageSlug)") && EDIT_GATE.includes("await openPage(organization, current, pageSlug)"), true);
ok("共通の編集の門は編集の許可を確認する", EDIT_GATE.includes("canEditPage(current, gate.page, admin, ownerGrant)"), true);

/*
 * 道具箱（コメント・履歴）の口は、門を 2 つ通る。
 *
 * ページを見てよいか（openPage）だけでは足りない。門なし公開のページは誰でも
 * 開けるので、そこを通っただけで返すと、社外の人の画面にコメントと版の一覧が出る。
 * 「道具箱を触ってよいか」は src/lib/access/access.ts の canUsePageTools が決める
 * （決まりそのものは check-page-tools.mjs が見る。ここが見るのは**付け忘れ**）。
 */
console.log("\n   道具箱の口は、道具箱の門も通る");
const TOOL_ENTRIES = [
  "src/app/api/comments/route.ts",
  "src/app/api/comments/[id]/route.ts",
  "src/app/api/comments/outcomes/route.ts",
  "src/app/api/history/route.ts",
];
for (const path of TOOL_ENTRIES) {
  ok(`  canUsePageTools( を通る: ${path}`, (APP.get(path) ?? "").includes("canUsePageTools("), true);
}
/*
 * コメントの一覧のファイルには口が 3 つある（GET・POST・まとめて解決の PATCH）。
 * ファイル 1 つに 1 回でも呼んでいれば上は通ってしまうので、口の数だけ数える。
 */
console.log("      ※ 一覧のファイルは口が 3 つ（一覧・投稿・まとめて解決）");
const COMMENTS_FILE = APP.get("src/app/api/comments/route.ts") ?? "";
ok("  門は口ごとに通る", (COMMENTS_FILE.match(/openPage\(/g) ?? []).length, 3);
ok("  道具箱の門も口ごとに通る", (COMMENTS_FILE.match(/canUsePageTools\(/g) ?? []).length, 3);
console.log("      ※ 名前だけで名乗る口はもう無い（社外の人が書ける道ごと畳んだ）");
ok("名乗りを作る口が無い", APP.has("src/app/api/guest/route.ts"), false);

console.log("\n   ページ本体の中身に手を伸ばす口と、門の一覧");
/** 本文・素材・コメント・履歴に手が届く口。 */
const READERS = [
  "readHtmlOf(",
  "readRevisionHtmlOf(",
  "readFileAt(",
  // 過去の版の帯の「何版目か」。版の有無を当てる道具にしない
  "readVersionNumberOf(",
  "listVersions(",
  "listRevisionsOf(",
  "listComments(",
  "findComment(",
  // 自分が書いたコメント。ページの題を連れて出るので、見える行を先に確定させてから引く
  "listMyComments(",
  "readAsset(",
  "readArchivedAsset(",
  "listAlivePages(",
  "listPagesWithVisibility(",
];
/** 門。どれか 1 つを通っていればよい。 */
const GATES = [
  "loadEditable(",
  "loadEditablePage(",
  "openPage(",
  "openAssetPage(",
  "listViewablePages(",
  "visiblePagesFor(",
  "requestPageAccess(",
  // 公開の URL から引くときの門（呼び名が 2 通りありうるので、専用の口になっている）
  "openPublicPage(",
  "openPublicAssetPage(",
];

const ungated = [];
for (const [path, code] of APP) {
  if (!READERS.some((reader) => code.includes(reader))) continue;
  if (GATES.some((gate) => code.includes(gate))) continue;
  ungated.push(path);
}
ok("門を通さずに中身へ手を伸ばしている入口", ungated.length === 0 ? "なし" : ungated.join(" / "), "なし");
console.log("      ※ 中身に手が届く口を lib に増やしたら、この表にも足す（数を直すところで気づく）");
ok("中身に手が届く口の数", READERS.length, 13);

// ---------------------------------------------------------------------------
console.log("\n--- 3. 門を素通りする道が塞がれているか ---");
console.log("   本文の読み口が「引き当て済みのページ」しか受けない = 門を通らないと中身に届かない");

ok("いまの本文は引き当て済みのページから読む", /export async function readHtmlOf\(page: StoredPage\)/.test(STORE), true);
ok("過去の本文も同じ", /export async function readRevisionHtmlOf\(\n?\s*page: StoredPage,/.test(STORE), true);
ok("履歴の読み口も同じ", /export async function listVersions\(page: StoredPage/.test(REVISIONS), true);
ok("版の本文の読み口も同じ", /export async function readFileAt\(page: StoredPage/.test(REVISIONS), true);
ok("版の一覧も同じ", /export async function listRevisionsOf\(\n?\s*page: StoredPage,/.test(STORE), true);

console.log("\n   呼び名だけで本文を引く古い口が残っていない");
const anywhere = [...APP.values(), CONTENT, TYPES, COMMENTS, STORE, REVISIONS, ACCESS].join("\n");
ok("readPageHtml が消えている", /readPageHtml/.test(anywhere), false);
ok("currentVersion（呼び名から版を引く口）が消えている", /currentVersion\(/.test(anywhere), false);

console.log("\n   入口が台帳の行を直に引いていない");
/**
 * 台帳の行を門を通さずに引いてよい入口と、その理由。**減る方向にだけ動かす。**
 * 増やすときは「読者に中身を返さない」ことを説明できるときだけ。
 */
const RAW_LOOKUP_ALLOWED = new Map([
  [
    "src/app/api/pages/prepare/route.ts",
    "投稿トークンで名乗る口。読者に中身を返さず、前の版の目印を取るためだけに引く",
  ],
]);
const rawLookups = [];
for (const [path, code] of APP) {
  if (!/\bfindPage\b|\bfindPageIncludingDeleted\b|\bfindPageAmong\b/.test(code)) continue;
  if (RAW_LOOKUP_ALLOWED.has(path)) continue;
  rawLookups.push(path);
}
ok("findPage を直に呼んでいる入口", rawLookups.length === 0 ? "なし" : rawLookups.join(" / "), "なし");
ok("免除してある入口の数（増やさない）", RAW_LOOKUP_ALLOWED.size, 1);
for (const [path, why] of RAW_LOOKUP_ALLOWED) {
  ok(`  免除の理由が書いてある: ${path}`, why.length > 0, true);
  ok(`  免除の入口は本文を返さない`, (APP.get(path) ?? "").includes("readHtmlOf("), false);
}
ok("引くのと決めるのが 1 つの動きになっている", /const page = await findPage\(organization, pageSlug\);\n\s*if \(page === null\) return \{ ok: false, reason: "notFound", page: null \};/.test(ACCESS), true);
ok("素材も本文と同じ判定を通る", /export async function openAssetPage\(/.test(ACCESS), true);
ok("素材の持ち主は 1 回の問い合わせで当てる", /findPageAmong\(organization, ancestorPageSlugs\(/.test(ACCESS), true);
ok("決めるのは 1 つの部品だけ", (ACCESS.match(/const access = await canViewPage\(identity, page\);/g) ?? []).length, 1);
ok("断り方も 1 か所（401 / 403 / 404）", (ACCESS.match(/export function gateError/g) ?? []).length, 1);

// ---------------------------------------------------------------------------
console.log("\n--- 4. 呼び名の頭の文字を、可否の判定に使っていないか ---");
console.log("   制限つきのページも呼び名は internal/… なので、頭を見ても見分けが付かない");

/** src/app/ で `.visibility` を読んでよい相手（台帳の行だけ）。 */
const ALLOWED_RECEIVERS = new Set(["gate.page", "stored"]);
const receivers = new Set();
for (const code of APP.values()) {
  for (const hit of code.matchAll(/([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)\.visibility/g)) {
    receivers.add(hit[1]);
  }
}
const strangers = [...receivers].filter((name) => !ALLOWED_RECEIVERS.has(name));
ok("見せ方を読んでいる相手", [...receivers].sort().join(" / ") || "なし", "gate.page / stored");
ok("台帳の行以外から見せ方を読んでいる箇所", strangers.length === 0 ? "なし" : strangers.join(" / "), "なし");

console.log("\n   呼び名の頭で分岐していた古い書き方が残っていない");
// 台帳の行から読んでいるもの（gate.page.visibility）は正しいので、頭に . が無いものだけを見る
const OLD_BRANCH = /(?<![.\w])page\.visibility\s*(===|!==)/g;
const stale = [];
for (const [path, code] of APP) {
  if (OLD_BRANCH.test(code)) stale.push(path);
  OLD_BRANCH.lastIndex = 0;
}
ok("呼び名の頭で分岐している入口", stale.length === 0 ? "なし" : stale.join(" / "), "なし");
ok("parsePageSlug に「可否に使うな」と書いてある", /可否を決めるのは src\/lib\/access\/access\.ts の canViewPage ただ 1 つ/.test(await read("src/lib/comments/comments.ts")), true);

// ---------------------------------------------------------------------------
console.log("\n--- 5. 一覧が「見られないページ」を出さないか ---");

// ログイン・cookie・保管庫への接ぎ口だけ差し替えて、中の判定を取り出す
// 会社のドメインの正本は、最初の組織の自動参加のドメイン（src/lib/organization/organizations.ts）
const DOMAIN = /\bdomain: "([^"]+)"/.exec(await read("src/lib/organization/scope.ts"))?.[1] ?? "";
await writeFile(
  `${dir}/gate-stub.mjs`,
  "export const auth = async () => null;\n" +
    "export const cookies = async () => ({ get: () => undefined });\n" +
    // 宛先を教える口。ここでは名乗りが読めない扱いにして、手元でログインを省く仕掛けを効かせない
    "export const headers = async () => ({ get: () => null });\n" +
    'export const createClient = () => { throw new Error("検査では保管庫に繋がない"); };\n',
);
await build({
  entryPoints: [`${root}/src/lib/access/access.ts`],
  outfile: `${dir}/gate-access.mjs`,
  bundle: true, plugins: [companyDeployment],
  format: "esm",
  platform: "node",
  external: ["node:*"],
  alias: {
    "@/auth": `${dir}/gate-stub.mjs`,
    "next/headers": `${dir}/gate-stub.mjs`,
    "@/lib/db/database": databaseStub(`${dir}/gate-stub.mjs`),
  },
});
const { pagesVisibleTo, toVisibleEntry } = await import(`${dir}/gate-access.mjs`);

const OWNER = `taro@${DOMAIN}`;
const OTHER = `hanako@${DOMAIN}`;
/** 名乗りは要求の組織（最初の組織）の所属つき。役割を変えても一覧の判定は材料の admin で決まる（役割は門が材料に写す）。 */
const ORG = { id: "00000000-0000-4000-8000-000000000001", assetPrefix: "" };
const member = (email, role = "member") => ({ kind: "member", email, name: null, image: null, desktop: false, organization: { ...ORG, role } });
const GUEST = { kind: "guest", guestId: "g1", name: "ゲスト" };
/** ログインしているが、要求の組織に所属の無い人（外した人・招かれていない外の人）。 */
const outsider = (email) => ({ kind: "outsider", email, name: null, image: null, desktop: false, organization: ORG });

const page = (id, visibility, extra = {}) => ({
  id,
  pageSlug: `${visibility === "public" ? "public" : "internal"}/例/${id}`.replace("例/", ""),
  visibility,
  title: `ページ ${id}`,
  currentVersionId: null,
  createdBy: OWNER,
  deletedAt: null,
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z",
  ...extra,
});

const THIRD = `jiro@${DOMAIN}`;
const shelf = [
  page("open", "public"),
  page("inside", "internal"),
  // 制限つきを 2 枚。持ち主はどちらも「いま見ている人」ではない別々の人にしてある
  page("locked", "restricted"),
  page("locked2", "restricted", { createdBy: THIRD }),
  page("gone", "internal", { deletedAt: "2026-08-02T00:00:00.000Z" }),
];

const titlesFor = (identity, admin, granted) =>
  pagesVisibleTo(identity, shelf, admin, new Set(granted))
    .map((one) => one.id)
    .join(",");

ok("名乗っていない人には公開だけ", titlesFor(null, false, []), "open");
ok("ゲストにも公開だけ", titlesFor(GUEST, false, []), "open");
ok("会社の人には公開と社内限定だけ", titlesFor(member(OTHER), false, []), "open,inside");
ok("所有者には自分の制限つきも（他人のものは出ない）", titlesFor(member(OWNER), false, []), "open,inside,locked");
ok("別の持ち主には、そちらの 1 枚だけ", titlesFor(member(THIRD), false, []), "open,inside,locked2");
ok("管理者には全部（消したものを除く）", titlesFor(member(OTHER), true, []), "open,inside,locked,locked2");
ok("許可された 1 枚だけが増える", titlesFor(member(OTHER), false, ["locked2"]), "open,inside,locked2");
ok("許可が無ければ 1 枚も増えない", titlesFor(member(OTHER), false, []), "open,inside");
ok("消したページは管理者にも出ない", pagesVisibleTo(member(OTHER), shelf, true, new Set()).some((one) => one.id === "gone"), false);
// 所属の無い人には、作った人・管理者・許可の材料が付いていても、公開のほかは 1 枚も出ない（題名も漏れない）
ok("所属のない人には公開だけ", titlesFor(outsider(OTHER), false, []), "open");
ok("所属のない人は、作った人・管理者・許可の材料つきでも公開だけ", titlesFor(outsider(OWNER), true, ["locked", "locked2"]), "open");
ok("持ち主（owner）の役割の人も、一覧の判定は会社の人と同じ形（管理者の材料で全部）", titlesFor(member(OTHER, "owner"), true, []), "open,inside,locked,locked2");

console.log("\n   社内限定の棚では、全員が見られるのか選んだ人だけなのかを、行が自分で言う");
console.log("      ※ 出るのはその人が開ける行だけ。だから印を出しても中身は 1 文字も漏れない");
console.log("      ※ 立てるのは lib。画面へ渡すのは旗（真偽）だけで、見せ方の文字列は渡さない");

const markOf = (one) => {
  const entry = toVisibleEntry(one);
  if (entry === null) return "行が出ない";
  return entry.restricted === true ? "印あり" : "restricted" in entry ? "欄が残っている" : "印なし";
};
ok("制限つきの行", markOf(page("locked", "restricted")), "印あり");
ok("社内限定の行", markOf(page("inside", "internal")), "印なし");
ok("公開の行", markOf(page("open", "public")), "印なし");
ok("URL に使えない呼び名は、印より前に落ちる", markOf({ ...page("locked", "restricted"), pageSlug: "internal/..." }), "行が出ない");
ok("旗を立てているのは 1 か所だけ", (ACCESS.match(/restricted: true/g) ?? []).length, 1);

console.log("\n   画面は旗しか見ない");
console.log("      ※ 行を描くのは一覧の部品。一覧の画面（src/app/page.tsx）は台帳の行を渡すだけ");
const INDEX = APP.get("src/app/_components/workspace-list.tsx") ?? "";
ok("共有範囲は表示用の情報を使う", INDEX.includes("SCOPE_LABELS[row.scope]"), true);
ok("保存された権限列を直接判定しない", INDEX.includes(".visibility"), false);
ok("操作はサーバーから届く可否を見る", INDEX.includes("row.shareable") && INDEX.includes("row.editable"), true);
ok("共有範囲で一覧を別々の節へ分けない", (INDEX.match(/<h2 /g) ?? []).length, 0);

console.log("\n   決まりを 2 つ持たない（一覧も 1 枚ものも同じ判定を通す）");
ok("一覧の絞り込みが decideAccess を呼ぶ", /decideAccess\(identity, factsOf\(page, admin, granted\.has\(page\.id\)\)\)\.allowed/.test(ACCESS), true);
ok("材料の畳み方も 1 か所", (ACCESS.match(/function factsOf\(/g) ?? []).length, 1);

console.log("\n   絞り込みは 1 か所（一覧も、見たページの画面も、同じ 1 つを通る）");
console.log("      ※ 読む側が自分でページを引ける形にすると、絞り込みが画面の数だけ増える");
ok("見える台帳の行を返す口がある", /export async function visiblePagesFor\(/.test(ACCESS), true);
ok("一覧もその口を通る", /const visible = await visiblePagesFor\(organization, identity, known\);/.test(ACCESS), true);
ok("絞り込みを 2 通り持っていない", (ACCESS.match(/pagesVisibleTo\(identity, pages, admin, granted\)/g) ?? []).length, 1);

console.log("\n   往復の数は、ページの枚数によらない");
const listing = /export async function visiblePagesFor\([\s\S]*?\n\}/.exec(ACCESS)?.[0] ?? "";
ok("一覧を引くのは 1 回", (listing.match(/alivePagesOfRequest\(/g) ?? []).length, 1);
ok("1 枚ずつ判定を引きに行っていない", /canViewPage/.test(listing), false);
ok("制限つきが無ければ名簿を引かない", /restricted\.length === 0\) return;/.test(listing), true);
ok("管理者なら許可の引き当ても要らない", /if \(admin\) return;/.test(listing) && listing.indexOf("if (admin) return;") < listing.indexOf("granted = "), true);
ok("許可はまとめて 1 回で引く", /grantedPageIds\(/.test(listing), true);
ok("絞り込みに使うページ id を一度に渡す", /restricted\.map\(\(page\) => page\.id\)/.test(listing), true);

console.log("\n   絞り込みの材料を、絞り込みの文字列に混ぜない（アドレスは値として渡す）");
ok("個人の許可は値で絞る", /\.eq\("member_email", grantee\)/.test(ACCESS), true);
ok("まとまりの許可も値で絞る", /\.in\("group_id", groupIds\)/.test(ACCESS), true);
ok("or\\(\\) に文字列を組み立てていない", /\.or\(/.test(ACCESS), false);
ok("消したまとまり経由で見えない", /\.is\("deleted_at", null\)/.test(ACCESS), true);

// ---------------------------------------------------------------------------
console.log("\n--- 6. 403 の紙に、中身が 1 文字も載らないか ---");

await build({
  entryPoints: [`${root}/src/lib/access/no-access.ts`],
  outfile: `${dir}/gate-no-access.mjs`,
  bundle: true, plugins: [companyDeployment],
  format: "esm",
  platform: "node",
  external: ["node:*"],
});
const { noAccessPage, noAccessResponse } = await import(`${dir}/gate-no-access.mjs`);

const fresh = noAccessPage({ requested: false });
const again = noAccessPage({ requested: true });

ok("受け取るのは「もう頼んであるか」だけ", /export type NoAccessState = \{ requested: boolean \};/.test(NO_ACCESS), true);
ok("ページを指す値を受け取らない", /noAccessPage\([^)]*pageSlug/.test(NO_ACCESS), false);
ok("題名を取り出す部品を使っていない", /titleOf|summaryOf/.test(NO_ACCESS), false);

console.log("\n   実際に組み立てて、中身の言葉が混ざらないかを見る");
// 検査用の写しに入っている本物のページ名。1 つでも紙に出たら不合格
const fixtures = [
  "ごあいさつ",
  "Pages の使い方",
  "アルル",
  "エルバフ",
  "one-piece-elbaph",
  "example/hello",
  "internal/",
];
const leaked = fixtures.filter((word) => fresh.includes(word) || again.includes(word));
ok("紙に載ってしまった中身", leaked.length === 0 ? "なし" : leaked.join(" / "), "なし");
ok("題名は中身に触れない固定の文言", /<title>限定公開のページです<\/title>/.test(fresh), true);
ok("何が起きているかは伝える", fresh.includes("許可された人だけが開けます"), true);

console.log("\n   もう一度送らせない");
ok("まだのときはボタンが出る", fresh.includes('id="ask"'), true);
ok("送ってあるときはボタンを出さない", again.includes('id="ask"'), false);
ok("送ってあると伝える", again.includes("お願いを送ってあります"), true);
ok("まだのときはその文を隠しておく", /id="sent" hidden/.test(fresh), true);

console.log("\n   返し方");
const refused = noAccessResponse({ requested: false });
ok("状態は 403（302 で送り返さない）", refused.status, 403);
ok("どこにも残さない", refused.headers.get("cache-control"), "private, no-store, max-age=0");
ok("検索に載せない", fresh.includes('name="robots" content="noindex, nofollow"'), true);
ok("絵文字を使っていない", /\p{Extended_Pictographic}/u.test(fresh), false);

console.log("\n   入口がこの紙を返している");
const INTERNAL_ROUTE = APP.get("src/lib/pages/private-page.ts") ?? "";
ok("名簿に無い人には 403 の紙", /noAccessResponse\(\{ requested: await hasPendingRequest\(/.test(INTERNAL_ROUTE), true);

// ---------------------------------------------------------------------------
console.log("\n--- 6-2. 門の紙（まだ名乗っていない人へ返す 1 枚）にも、中身が載らないか ---");
console.log("   302 でログイン画面へ送らないのは、共有カードを作る相手が読むのがそちらになるから");
console.log("      ※ その結果、どの社内ページを貼っても同じ札が出ていた（だから同じ URL のまま紙を返す）");

await build({
  entryPoints: [`${root}/src/lib/access/signin-gate.ts`],
  outfile: `${dir}/gate-signin.mjs`,
  bundle: true, plugins: [companyDeployment],
  format: "esm",
  platform: "node",
  external: ["node:*"],
});
const { signInGatePage, signInGateResponse, gateCard, lockedCardPath } = await import(`${dir}/gate-signin.mjs`);

const SIGNIN_GATE = strip(await read("src/lib/access/signin-gate.ts"));
ok("受け取るのは戻り先と絵の在り処と組織の名前だけ", /export type SignInGateState = \{[\s\S]*?next: string;[\s\S]*?cardUrl: string;[\s\S]*?organization: string \| null;\s*\};/.test(SIGNIN_GATE), true);
ok("ページを指す値を受け取らない", /signInGatePage\([^)]*pageSlug|signInGateState[^)]*slug:/.test(SIGNIN_GATE), false);
ok("題名を取り出す部品を使っていない", /titleOf|summaryOf/.test(SIGNIN_GATE), false);
ok("保管庫に触らない", /pages-store|supabase|readHtmlOf/.test(SIGNIN_GATE), false);

const gatePaper = signInGatePage({ next: "/internal/one-piece-elbaph?v=abc", cardUrl: "https://x/api/og/locked", organization: "見本商事" });
const gateLeaked = fixtures.filter((word) => gatePaper.includes(word));
// 戻り先には呼び名がそのまま入る（ログイン後に同じ場所へ帰すため）。見るのは**読める文字**の側
const shown = gatePaper.replace(/<input[^>]*>/g, "").replace(/<meta[^>]*>/g, "");
ok("読める面に載ってしまった中身", fixtures.filter((word) => shown.includes(word)).join(" / ") || "なし", "なし");
ok("カードの札は中身に触れない固定の文言（差し込むのは組織の名前だけ）", [gateCard("見本商事").title, gateCard("最初の組織").title, gateCard(null).title], ["見本商事 の限定ページ", "最初の組織 の限定ページ", "この組織 の限定ページ"]);
ok("紙の題と札は組織の名前で言う", [gatePaper.includes("<title>見本商事 の限定ページ</title>"), gatePaper.includes('content="見本商事 の限定ページ"')], [true, true]);
ok("組織の名前は escapeHtml を通す（管理者が付けた自由な字）", signInGatePage({ next: "/", cardUrl: "x", organization: '<b>"A&B"' }).includes("<b>"), false);
ok("カードの絵の道筋は、最初の組織 は今までのまま・ほかの組織は名前の印つき・名前を付けないカードは一般語の道筋（?o=0）", [lockedCardPath("Pages"), lockedCardPath(null), /^\/api\/og\/locked\?o=[0-9a-f]{8}$/.test(lockedCardPath("見本商事")), lockedCardPath("見本商事") === lockedCardPath("見本商事 2")], ["/api/og/locked", "/api/og/locked?o=0", true, false]);
ok("そのままの呼び名が読める面に出ていない", shown.includes("one-piece-elbaph"), false);
console.log(`      ※ 戻り先だけは持ち帰る（隠し欄）: ${gateLeaked.length > 0 ? "呼び名を含む" : "含まない"}`);
ok("版の指定も持ち帰る", gatePaper.includes("?v=abc"), true);
ok("外のサイトへは帰さない", signInGatePage({ next: "//evil.example", cardUrl: "x", organization: null }).includes("evil"), false);
ok("危ない文字はそのまま出さない", signInGatePage({ next: '/internal/x"><script>', cardUrl: "x", organization: null }).includes("<script>"), false);

console.log("\n   返し方");
const gated = signInGateResponse({ next: "/internal/x", cardUrl: "https://x/api/og/locked", organization: "最初の組織" });
ok("状態は 200（カードを作る側が中身を読む番号）", gated.status, 200);
ok("どこにも残さない", gated.headers.get("cache-control"), "private, no-store, max-age=0");
ok("検索に載せない", gatePaper.includes('name="robots" content="noindex, nofollow"'), true);
ok("絵文字を使っていない", /\p{Extended_Pictographic}/u.test(gatePaper), false);
ok("ログインの入口を増やしていない（/signin へ渡すだけ）", /action="\/signin"/.test(gatePaper), true);

console.log("\n   入口の振り分け（名乗っていない人の分岐だけを取り出して見る）");
/** `if (!isMember(viewer)) { … }` の中だけ。外まで見ると、後ろにある門まで数えてしまう。 */
const noMemberBranch = (() => {
  const at = INTERNAL_ROUTE.indexOf("if (!isMember(viewer)) {");
  if (at === -1) return "";
  const end = INTERNAL_ROUTE.indexOf("\n  }", at);
  return end === -1 ? INTERNAL_ROUTE.slice(at) : INTERNAL_ROUTE.slice(at, end);
})();
ok("その分岐が読めた", noMemberBranch.length > 0, true);
ok("ページ本体には門の紙を返す", /return signInGateResponse\(\{/.test(noMemberBranch), true);
ok("素材はログインへ送る（絵の場所に紙を返さない）", /if \(isAssetPath\(slug\)\) \{[\s\S]*?Response\.redirect/.test(noMemberBranch), true);
ok("紙を返す前に保管庫を引いていない", /openPage\(|readHtmlOf\(|findPage\(/.test(noMemberBranch), false);
console.log("      ※ 引かないから、在る／無い・制限つきかどうかが、今までどおり一切漏れない");

// ---------------------------------------------------------------------------
console.log("\n--- 7. 制限つきの中身が、公開の配信網に乗らないか ---");
const PUBLIC_ROUTE = APP.get("src/app/public/[...slug]/route.ts") ?? "";

ok("社内の経路に配信網の指定（s-maxage）を書いていない", /s-maxage/.test(INTERNAL_ROUTE), false);
ok("社内の経路は控えを page-cache から取る", /internalCacheControl\(/.test(INTERNAL_ROUTE), true);
ok("制限つきを断る応答は残さない", /RESTRICTED_PAGE_CACHE/.test(INTERNAL_ROUTE), true);
ok("公開の経路は控えを page-cache から取る", /publicCacheControl\(/.test(PUBLIC_ROUTE), true);
ok("社内本文の控えに配信網の指定が無い", /s-maxage/.test(/INTERNAL_PAGE_CACHE = "([^"]+)"/.exec(PAGE_CACHE)?.[1] ?? "s-maxage"), false);
ok("制限つき本文は残さない", /RESTRICTED_PAGE_CACHE = "private, no-store, max-age=0"/.test(PAGE_CACHE), true);
ok("公開本文は配信網に載せる", /PUBLIC_PAGE_CACHE =\s*"[^"]*s-maxage=86400/.test(PAGE_CACHE), true);
ok("公開の経路は呼び名を自分で組み立てない", /openPage\(null, `public\//.test(PUBLIC_ROUTE), false);
ok("公開の経路は専用の門を通る", (PUBLIC_ROUTE.match(/openPublicPage\(/g) ?? []).length, 2);
ok("公開の素材も同じ門を通る", /openPublicAssetPage\(organization, slug\)/.test(PUBLIC_ROUTE), true);
ok("公開の経路は手形を読まない（人によって変わらない）", /currentIdentity|isMember/.test(PUBLIC_ROUTE), false);

console.log("\n   公開の URL が指す場所には、呼び名が 2 通りありうる");
console.log("   （公開として投稿したページと、社内として投稿してから公開に切り替えたページ）");
ok("門は候補を 2 つ持つ", /\[`public\/\$\{at\}`, `internal\/\$\{at\}`\]/.test(ACCESS), true);
ok(
  "public/ を先に見る（あとから切り替えたページに URL を横取りさせない）",
  ACCESS.indexOf("`public/${at}`") < ACCESS.indexOf("`internal/${at}`"),
  true,
);
ok("どちらの呼び名でも、通す判定は同じ 1 つ", (ACCESS.match(/gateOf\(null, /g) ?? []).length, 2);
console.log("      ※ 呼び名の頭は可否に使わない。internal/… のままでも見せ方が公開なら通る");
ok(
  "素材の棚は持ち主の呼び名で決める（URL の頭で決めない）",
  /pageRefOf\(page\.pageSlug\)\?\.slugPrefix/.test(PUBLIC_ROUTE),
  true,
);
ok("棚が読めなければ返さない（別の棚へ倒さない）", /if \(shelf === null\) return notFound\(\);/.test(PUBLIC_ROUTE), true);

console.log("\n   公開をやめられるページは、配信網に長く持たせない");
ok("切り替えたページ用の短い指定がある", /SWITCHED_PAGE_CACHE = "public, max-age=0, s-maxage=60"/.test(PAGE_CACHE), true);
ok("素材のほうも短い", /SWITCHED_ASSET_CACHE = "public, max-age=60, s-maxage=60"/.test(PAGE_CACHE), true);
ok("古いまま配り続ける指定を付けない", /SWITCHED_PAGE_CACHE = "[^"]*stale-while-revalidate/.test(PAGE_CACHE), false);
console.log("      ※ あれは「切れたあとも 1 日は古いままでよい」の意味。やめた直後に効いてしまう");
ok("本文でも素材でも、棚を見て使い分ける", (PUBLIC_ROUTE.match(/switchable\(shelf\)/g) ?? []).length, 2);
ok("切り替えでやめられるのは、呼び名が internal のまま公開になっているもの", /return shelf === "internal";/.test(PUBLIC_ROUTE), true);
ok("社内の経路は名乗りを見る", /openAssetPage\(organization, viewer, shelf, slug\)/.test(INTERNAL_ROUTE), true);

console.log("\n   見出しカードの絵も同じ（誰の手にも渡りうるので、名乗りで出し分けない）");
const OG_ROUTE = APP.get("src/app/api/og/route.tsx") ?? "";
ok("名乗っていない人として門を通す", /openPage\(organization, null, page\.slug\)/.test(OG_ROUTE), true);
ok("公開ページ以外は 404", /!gate\.ok \|\| gate\.page\.visibility !== "public"/.test(OG_ROUTE), true);

console.log("\n   応答にメールアドレスを載せる口は 1 つだけ（共有の設定と管理画面）");
const withEmail = [];
for (const [path, code] of APP) {
  if (/memberEmail|requesterEmail|member_email/.test(code)) withEmail.push(path);
}
ok(
  "アドレスを扱う入口",
  withEmail.sort().join(" / "),
  "src/app/api/pages/access/route.ts / src/app/sharing/actions.ts / src/app/sharing/personal.tsx",
);
console.log("      ※ どれも会社の人（所有者・管理者）にしか通らない口。公開ページの応答には混ざらない");
for (const path of withEmail) {
  ok(`  会社の人だけに絞っている: ${path}`, /isMember\(|requireAdmin\(|isSiteOwner\(/.test(APP.get(path) ?? ""), true);
}

// ---------------------------------------------------------------------------
console.log("\n--- 8. どの組織の門かは、関所が宛先から 1 度だけ決める ---");
console.log("   入口ごとにホスト名を読み直すと、1 か所で既定の組織に倒れる。外から送られた組織のヘッダは信じない");
const PROXY = strip(await read("src/proxy.ts"));
const SCOPE = strip(await read("src/lib/organization/scope.ts"));
ok("通すときは必ず組織のヘッダを付け直す", /headers\.set\(ORGANIZATION_HEADER, organizationHeaderValue\(firstOrganizationScope\(\)\)\);/.test(PROXY), true);
const MATCHER = /matcher: \["([^"]+)"\]/.exec(PROXY)?.[1] ?? "";
ok("関所の範囲は組織を読みうる道筋のすべて（外すのは組織を読まない配り物だけ）", MATCHER, "/((?!_next/static|_next/image|vendor/|comments-widget.js|page-images.js).*)");
// 範囲の字面を正規表現として読んで、どの道筋に掛かるかを確かめる（Next も同じ形で読む）
const covered = (path) => new RegExp(`^${MATCHER}$`).test(path);
ok("画面・窓口・社内と公開のページ・ログイン・素材の受け口には掛かる", ["/", "/library", "/activity", "/internal/x", "/public/x", "/history/internal/x", "/api/comments", "/signin", "/signin/handoff", "/api/auth/callback/handoff", "/page-image-source/x.png", "/r/x", "/vendorx"].filter((path) => !covered(path)).join(" / ") || "なし", "なし");
ok("組織を読まない配り物には掛からない", ["/vendor/lucide.js", "/vendor/deck-fonts/a.woff2", "/comments-widget.js/abc", "/page-images.js", "/_next/static/x.js"].filter(covered).join(" / ") || "なし", "なし");
// 範囲の外の入口は、組織も名乗りも読まない（外から送られた組織のヘッダが届いても使われない）
const outside = APP_FILES.filter((path) => /\/route\.tsx?$/.test(path)).filter((path) => !covered(`/${path.replace(/^src\/app\//, "").replace(/\/route\.tsx?$/, "").replace(/\[\[?\.\.\.[^\]]+\]\]?/g, "x").replace(/\[[^\]]+\]/g, "x")}`));
ok("範囲の外の入口", outside.join(" / "), "src/app/comments-widget.js/[[...stamp]]/route.ts / src/app/page-images.js/[[...stamp]]/route.ts / src/app/vendor/[name]/[[...stamp]]/route.ts / src/app/vendor/deck-fonts/[file]/route.ts");
ok("範囲の外の入口は組織も名乗りも保存先も読まない", outside.filter((path) => /currentOrganization|ORGANIZATION_HEADER|x-pages-organization|currentIdentity|currentSessionPerson|orgDb|getDb|@\/auth/.test(APP.get(path) ?? "")).join(" / ") || "なし", "なし");
ok("入口が読む要求の組織は関所のヘッダだけ（ホスト名を読まない）", /headers\?\.get\(ORGANIZATION_HEADER\)/.test(SCOPE) && !/"host"|x-forwarded-host/.test(SCOPE), true);
/**
 * ホスト名を読んでよいファイルと理由。**減る方向だけ**。どれも「どの組織か」には使わない（組織は関所のヘッダで決まる）。
 */
const HOST_READERS = new Map([
  ["src/proxy.ts", "関所。宛先から組織を決めるただ 1 か所"],
  ["src/app/signin/page.tsx", "根か組織の宛先かでログインの始め方を分け、根の URL を組む。組織は関所のヘッダから引く"],
  ["src/app/signin/handoff/route.ts", "根でだけ受け、組織の宛先の URL を組む。渡す先の組織は呼び名で引く"],
  ["src/lib/pages/local-preview.ts", "手元の仮の人の歯止め（宛先が手元向きか）"],
  ["src/lib/access/request-security.ts", "同じサイトかの基準と、アプリのログインが返す「引き換えに行く宛先」（開いた宛先＝その組織の宛先・`requestOrigin`）"],
]);
const hostReadersOutside = [];
for (const path of [...APP_FILES, "src/lib/pages/local-preview.ts", "src/lib/access/request-security.ts", "src/lib/identity/identity.ts", "src/lib/access/access.ts", "src/lib/pages/private-page.ts", "src/lib/organization/scope.ts", "src/proxy.ts"]) {
  const text = APP.has(path) ? APP.get(path) : strip(await read(path));
  if (/get\("host"\)|x-forwarded-host/.test(text) && !HOST_READERS.has(path)) hostReadersOutside.push(path);
}
ok("ホスト名を読む入口が台帳の外に増えていない", hostReadersOutside.join(" / ") || "なし", "なし");
ok("ホスト名を読んでよいファイルの数（増やさない）", HOST_READERS.size, 5);

console.log(`\n${fails === 0 ? "すべて合格" : `${fails} 件 不合格`}`);
