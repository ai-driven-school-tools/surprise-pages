/**
 * 「順番に待たなくてよい往復を、縦に並べ直していないか」を確かめる。
 *
 * 関数は米国東部、保管庫は東京にある。1 往復に 150〜175 ミリ秒かかり、保管庫の中で
 * 答えを出すのは 0.1〜0.2 ミリ秒しかかからない。**遅さの実体は距離だけ**なので、
 * 縦に並べた回数がそのまま待ち時間になる。ここは「横に並べたものが、うっかり
 * 縦へ戻っていないか」を数として押さえる。見た目には何も変わらないので、目では気づけない。
 *
 * ただし速さのために可否の判定を緩めたら本末転倒なので、同じ枚数で
 * **「取りに行くのは先でよいが、返すのは門が開いたときだけ」**も一緒に見る。
 *
 * ここで見るのは 6 つ。
 *   1. コメントの入口が、3 本を同時に投げているか
 *   2. 門が開くまで、中身を 1 行も返していないか
 *   3. 「管理者か」を、同じ入口で 2 回聞いていないか
 *   4. 一覧の許可の引き当てを、縦に並べていないか
 *   5. たいてい捨てられる見出しカードを、要るときだけ作っているか
 *   6. 速さのために、決まりを緩めていないか
 *
 * 保管庫にもネットワークにも繋がない。書いてある文字だけを見る。
 */
import { readdir, readFile } from "node:fs/promises";

import { root, readAccessSource } from "./paths.mjs";

const read = (path) => readFile(`${root}/${path}`, "utf8");
/** 注記を落として、実際に動くところだけを見る。 */
const strip = (text) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");

const COMMENTS_API = strip(await read("src/app/api/comments/route.ts"));
const INDEX = strip(await read("src/lib/workspace/workspace.ts"));
const PUBLIC_ROUTE = strip(await read("src/app/public/[...slug]/route.ts"));
const INTERNAL_ROUTE = strip(await read("src/lib/pages/private-page.ts"));
const VIEWS_API = strip(await read("src/app/api/views/route.ts"));
const ACCESS = strip(readAccessSource());
const STORE = strip(await read("src/lib/pages/store.ts"));
const PAGE_VIEWS = strip(await read("src/lib/pages/views.ts"));

let fails = 0;
const ok = (label, actual, expected) => {
  const pass = String(actual) === String(expected);
  if (!pass) fails += 1;
  console.log(`${pass ? "OK  " : "NG  "} ${label}: ${actual}（期待: ${expected}）`);
};

/** 数え上げ。 */
const count = (code, re) => (code.match(re) ?? []).length;

/**
 * 縦に待つ回数。入口の頭で 1 回だけ組織を取り出す行は保存先へ行かないので数えない
 * （保存先へ行かないことは下の「組織の取り出しは往復にならない」で確かめる）。それ以外の `= await` は全部数える。
 */
const ORGANIZATION_LINE = /const organization = await currentOrganization\(\);/g;
const waits = (code) => count(code.replace(ORGANIZATION_LINE, ""), /= await /g);
const ORGANIZATION_SCOPE = strip(await read("src/lib/organization/scope.ts"));

/** 関数 1 つぶんを切り出す（閉じ括弧が行頭に来るところまで）。 */
const bodyOf = (code, head) => new RegExp(`${head}[\\s\\S]*?\\n\\}`).exec(code)?.[0] ?? "";

/** src/app/ の下の実装ファイルを全部読む。 */
async function collect(from) {
  const found = [];
  for (const entry of await readdir(`${root}/${from}`, { withFileTypes: true })) {
    const path = `${from}/${entry.name}`;
    if (entry.isDirectory()) found.push(...(await collect(path)));
    else if (/\.tsx?$/.test(entry.name)) found.push(path);
  }
  return found;
}
const APP = new Map();
for (const path of (await collect("src/app")).sort()) APP.set(path, strip(await read(path)));

// ---------------------------------------------------------------------------
console.log("--- 1. コメントの入口が、3 本を同時に投げているか ---");
console.log("   門の判定・コメント一覧・管理者かは、互いの答えを要らない（縦に並べると 3 往復ぶん待つ）");

const GET = bodyOf(COMMENTS_API, "export async function GET\\(");
ok("コメントの入口を切り出せている", GET.length > 0, true);

const batch = /await Promise\.all\(\[([\s\S]*?)\]\);/.exec(GET)?.[1] ?? "";
ok("同時に投げる束がある（Promise.all）", batch.length > 0, true);
ok("  門の判定が束に入っている", /openPage\(organization, viewer, page\.slug\)/.test(batch), true);
ok("  コメントの一覧も束に入っている", /listComments\(organization, page\.slug, viewer\)/.test(batch), true);
ok("  「管理者か」も束に入っている", /\basked\b/.test(batch), true);

console.log("\n   縦に並べる古い書き方が残っていない");
ok("門を待ってからコメントを頼んでいない", /const gate = await openPage\(organization, viewer, page\.slug\);/.test(GET), false);
ok("コメントを頼むのは束の 1 か所だけ", count(GET, /listComments\(/g), 1);
ok("コメントだけを先に待っていない", /await listComments\(/.test(GET), false);
ok("「管理者か」を引数の中で待っていない", /canManageSharing\([^)]*await isAdmin/.test(COMMENTS_API), false);
/*
 * 3 本目は、制限つきのページだけが通る「共同の作った人か」の照会。
 * 前は canManageSharing の引数の中で待っていたものが、2 つの旗（sharing / edit）で
 * 使い回すために名前を持っただけで、往復の数は変わっていない
 * （ふつうの社内ページ・作った人・管理者は今までどおり 2 回で返る）。
 */
ok("縦に待つ回数（名乗り ＋ 束 ＋ 制限つきだけの照会）", waits(GET), 3);
ok("  組織の取り出しは往復にならない（保存先を読まない）", /from "\.\/database"|getDb\(|orgDb\(/.test(ORGANIZATION_SCOPE), false);
/*
 * 「画面を描く 1 回の中で 1 回だけ読む」（React の cache）は引数を物そのもので見分ける。組織の形を見出しから読むたびに
 * 新しく作ると、組織を引数に取る cache が毎回外れ、本人まわりの束（org_workspace_member_reads）を 1 画面で 3 度読んでいた
 * （2026-10-11 の録音の画面の --trace）。同じ値なら同じ物を返すことを、実際に呼んで確かめる。
 */
{
  const { build } = await import(`${root}/node_modules/esbuild/lib/main.js`);
  const { mkdtempSync, writeFileSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const work = mkdtempSync(`${tmpdir()}/roundtrips-scope-`);
  writeFileSync(`${work}/stub.mjs`, "export const headers = async () => null;\n");
  await build({
    entryPoints: [`${root}/src/lib/organization/scope.ts`],
    outfile: `${work}/organization-scope.mjs`,
    bundle: true,
    format: "esm",
    platform: "node",
    external: ["node:*"],
    alias: { "next/headers": `${work}/stub.mjs`, "next/navigation": `${work}/stub.mjs` },
  });
  const scope = await import(`${work}/organization-scope.mjs`);
  const other = "11111111-1111-4111-8111-111111111111;o/11111111-1111-4111-8111-111111111111/";
  ok("  同じ組織の見出しは、読むたびに同じ物になる（組織を引数に取る cache が効く）", scope.organizationFromHeader(other) === scope.organizationFromHeader(other), true);
  const first = scope.organizationHeaderValue(scope.firstOrganizationScope());
  ok("  最初の組織の見出しは、最初の組織の物そのものになる", scope.organizationFromHeader(first) === scope.firstOrganizationScope(), true);
  ok("  形の違う見出しは今までどおり読まない", scope.organizationFromHeader("11111111-1111-4111-8111-111111111111;x/"), null);
}

// ---------------------------------------------------------------------------
console.log("\n--- 2. 門が開くまで、中身を 1 行も返していないか ---");
console.log("   取りに行くのを先にするのは可。**返す**のは門が開いたときだけ");

const GATE_CHECK = "if (!gate.ok) return gateError(gate.reason);";
const POST = bodyOf(COMMENTS_API, "export async function POST\\(");

for (const [label, code] of [
  ["一覧を返す口（GET）", GET],
  ["書き込む口（POST）", POST],
]) {
  const at = code.indexOf(GATE_CHECK);
  ok(`  ${label}: 門を見て断る道がある`, at >= 0, true);
  ok(`  ${label}: 束より後ろで門を見ている`, at > code.indexOf("Promise.all(["), true);
  ok(`  ${label}: 中身を返すより前に門を見ている`, at >= 0 && at < code.search(/return jsonResponse\((?!closedTools\()/), true);
}
ok("組み立てるのも門を見たあと", COMMENTS_API.indexOf(GATE_CHECK) < COMMENTS_API.indexOf("const payload: CommentsResponse"), true);
console.log("      ※ 口は 3 つ（一覧・投稿・まとめて解決）。どれも同じ部品で断る");
ok("断り方は 1 つの部品（gateError）", count(COMMENTS_API, /gateError\(gate\.reason\)/g), 3);

console.log("\n   先に取りに行ってよいのは、コメントの一覧だけ（本文・素材は門の後）");
for (const forbidden of ["readHtmlOf(", "readFileAt(", "readAsset(", "readArchivedAsset(", "listRevisionsOf("]) {
  ok(`  束に入っていない: ${forbidden}`, batch.includes(forbidden), false);
}

console.log("\n   ページを引いたら、その場で可否を見る（見ないまま次へ進まない）");
for (const [label, code] of [
  ["公開ページの入口", PUBLIC_ROUTE],
  ["社内ページの入口", INTERNAL_ROUTE],
]) {
  const opened = count(code, /const gate = await open\w+\(/g);
  const checked = count(code, /const gate = await open\w+\([^;]*\);\s*if \(!?gate/g);
  ok(`  ${label}: 門を引いた数`, opened, 3);
  ok(`  ${label}: 引いた直後に可否を見ている数`, checked, opened);
}
ok("公開の入口は本文を門の後で読む", PUBLIC_ROUTE.indexOf("readHtmlOf(") > PUBLIC_ROUTE.indexOf("if (gate === null || !gate.ok) return notFound();"), true);
ok("公開の入口は手形を読まない（人によって変わらない）", /currentIdentity|isMember/.test(PUBLIC_ROUTE), false);

// ---------------------------------------------------------------------------
console.log("\n--- 3. 「管理者か」を、同じ入口で 2 回聞いていないか ---");
console.log("   1 回引いた答えを渡して回す。2 回投げると、同じ答えのために 1 往復ぶん余計に待つ");

const twice = [];
for (const [path, code] of APP) {
  if (count(code, /\bisAdmin\(/g) > 1) twice.push(path);
}
ok("同じ入口で 2 回聞いているところ", twice.length === 0 ? "なし" : twice.join(" / "), "なし");

console.log("\n   一覧の画面（右上の管理の入口と、制限つきの絞り込みの 2 か所で要る）");
ok("引くのは 1 回だけ", count(INDEX, /\bisAdmin\(/g), 1);
ok("引いた答えを絞り込みへ渡している", /visiblePagesFor\(organization,\s*viewer,\s*adminPromise,\s*ids\)/.test(INDEX), true);
ok("同じ答えを画面でも使う（束から受け取る）", /const \[pages, admin, pending, grants, favorites\] = await Promise\.all\(\[/.test(INDEX), true);
ok("先に投げてから一覧を頼んでいる", INDEX.indexOf("const adminPromise = workspaceAdmin(") < INDEX.indexOf("Promise.all(["), true);

console.log("\n   自分あての申し出の数も、同じ束に入っている（一覧とは互いの答えを要らない）");
const INDEX_BATCH = /await Promise\.all\(\[([\s\S]*?)\]\);/.exec(INDEX)?.[1] ?? "";
ok("数える口が束に入っている", /pendingRequestCounts\(organization, viewer\.email\)/.test(INDEX_BATCH), true);
ok("全件と対象限定の2経路だけ", count(INDEX, /pendingRequestCounts\(/g), 2);
ok("束の外で先に待っていない", /await pendingRequestCounts\(/.test(INDEX), false);
ok("閲覧判定の入口は一つ", count(INDEX, /visiblePagesFor\(/g), 1);

console.log("\n   コメントの入口");
ok("引くのは 1 回だけ", count(COMMENTS_API, /\bisAdmin\(/g), 1);
ok("会社の人でなければ引かない", /isMember\(viewer\) \? isAdmin\(organization, viewer\) : false/.test(COMMENTS_API), true);
ok("引いた答えを共有範囲の判定へ渡している", /canManageSharing\(viewer, gate\.page, admin\)/.test(COMMENTS_API), true);

console.log("\n   受け口（src/lib/access/access.ts）");
ok("答えでも問い合わせでも受け取れる", /export type AdminAnswer = boolean \| Promise<boolean>;/.test(ACCESS), true);
ok("一覧の絞り込みが受け口を持っている", /export async function listViewablePages\(\n\s*organization: OrganizationScope,\n\s*identity: Identity \| null,\n\s*known\?: AdminAnswer,\n\): Promise<VisiblePages>/.test(ACCESS), true);
ok("渡されたら引き直さない", /admin: Promise\.resolve\(known \?\? isAdmin\(organization, member\)\)/.test(ACCESS), true);
ok("管理者かは一覧と同時に聞き始める（一覧を待ってから聞かない）", bodyOf(ACCESS, "export async function visiblePagesFor\\(").indexOf("isAdmin(") < bodyOf(ACCESS, "export async function visiblePagesFor\\(").indexOf("await (pageIds === undefined"), true);
ok("渡されなくても動く（既定は自分で引く）", /known\?: AdminAnswer/.test(ACCESS), true);

// ---------------------------------------------------------------------------
console.log("\n--- 4. 一覧の許可の引き当てを、縦に並べていないか ---");
console.log("   「個人に出ている許可」と「その人が入っているまとまり」は互いの答えを要らない");

const GRANTED = bodyOf(ACCESS, "async function grantedPageIds\\(");
ok("引き当ての中身を切り出せている", GRANTED.length > 0, true);
ok("同時に投げる束がある（Promise.all）", /const \[personal, groupIds\] = await Promise\.all\(\[/.test(GRANTED), true);

const pair = /await Promise\.all\(\[([\s\S]*?)\]\);/.exec(GRANTED)?.[1] ?? "";
ok("  個人に出ている許可が束に入っている", /\.eq\("grantee_kind", "member"\)/.test(pair), true);
ok("  入っているまとまりも束に入っている", /\bgroups,/.test(pair), true);
ok("  まとまりは呼ぶ側が先に聞き始めたものを使う（無ければ自分で聞く）", /groups: Promise<string\[\]> = aliveGroupIdsOf\(organization, normalize\(email\)\)/.test(GRANTED), true);
ok("  束に分けても、まとまりは 1 回の答えを使い回す", /grantedPageIds\(organization, email, ids, groups\)/.test(GRANTED), true);
ok("縦に待つ回数（束 ＋ まとまり経由の許可）", count(GRANTED, /= await /g), 2);
ok("まとまり経由は、まとまりが出てから引く（ここは順番に意味がある）", GRANTED.indexOf("    groups,") > 0 && GRANTED.indexOf("    groups,") < GRANTED.indexOf('.eq("grantee_kind", "group")'), true);
ok("空振りなら引きに行かない", /if \(groupIds\.length === 0\) return found;/.test(GRANTED), true);

console.log("\n   ページの枚数によって往復が増えない（もとからの性質。壊していないか）");
console.log("      ※ 絞り込みは切り出してある（一覧も、見たページの画面も、同じ 1 つを通る）");
const LISTING = bodyOf(ACCESS, "export async function visiblePagesFor\\(");
ok("一覧はその口を呼ぶだけ", /const visible = await visiblePagesFor\(organization, identity, known\);/.test(ACCESS), true);
ok("一覧が自分でページを引き直していない", /listAlivePages\((?:organization)?\)/.test(bodyOf(ACCESS, "export async function listViewablePages\\(")), false);
ok("一覧を引くのは 1 回", count(LISTING, /alivePagesOfRequest\(/g), 1);
ok("1 回の画面の中では台帳を 1 度だけ読む（サイドバーと画面で使い回す）", /const alivePagesOfRequest = cache\(\(organization: OrganizationScope, viewer: string \| null\) =>[\s\S]{0,200}?listAlivePages\(organization, viewer === null \? undefined : memberRead\(organization, viewer, "last_page_id"\)\)\);/.test(ACCESS), true);
ok("入っているまとまりも 1 回の画面の中で 1 度だけ", /const aliveGroupIdsOf = cache\(/.test(ACCESS), true);
ok("1 枚ずつ判定を引きに行っていない", /canViewPage/.test(LISTING), false);
ok("制限つきが無ければ名簿を引かない", /restricted\.length === 0\) return;/.test(LISTING), true);
ok("管理者なら許可の引き当ても要らない", /if \(admin\) return;/.test(LISTING) && LISTING.indexOf("if (admin) return;") < LISTING.indexOf("granted = "), true);
ok("名簿の判定は 1 回待つだけ", count(LISTING, /await decideGrants\(\)/g), 1);

console.log("\n   見たページの画面も、材料が別のものは同時に取りに行く");
console.log("      ※ 「見える行」と「記録を残さないと言ったか」は、互いの答えを要らない");
const ME = strip(await read("src/app/(workspace)/(screens)/activity/page.tsx"));
ok("同時に投げる束がある（Promise.all）", /const \[visible, optedOut\] = await Promise\.all\(\[visiblePagesFor\(organization, viewer\), viewOptedOut\(organization, viewer\)\]\);/.test(ME), true);
ok("縦に待つ回数（名乗り ＋ 1 つめの束 ＋ 2 つめの束）", waits(ME), 3);
console.log("      ※ 2 つの節の中身は束に入れられない（見える行が決まらないと引けない）");
console.log("        ただし互いの答えは要らないので、2 つめの束としてまとめて投げる");
ok("節の中身も同時に投げる", /const \[server, comments\] = await Promise\.all\(\[/.test(ME), true);
ok("控えは見える行を材料にしている", /listViewedPages\(organization, viewer, visible\)/.test(ME), true);
ok("コメントも同じ行を材料にしている", /listMyComments\(organization, viewer, visible\)/.test(ME), true);

console.log("\n   自分あての申し出を数えるのも、往復は多くて 2 回");
console.log("      ※ 「作った人か」と「共同の作った人か」は互いの答えを要らない");
const COUNTS = bodyOf(ACCESS, "export async function pendingRequestCounts\\(");
ok("数える中身を切り出せている", COUNTS.length > 0, true);
ok("同時に投げる束がある（Promise.all）", /const \[pages, owned\] = await Promise\.all\(\[/.test(COUNTS), true);
ok("縦に待つ回数（申し出 ＋ 束）", count(COUNTS, /= await /g), 2);
ok("1 件も無ければ、そこで終わる", /if \(pending\.size === 0\) return new Map\(\);/.test(COUNTS), true);
console.log("      ※ 管理者かは引かない（全部は受信箱で見える。ここで足すと往復も 1 回増える）");
ok("管理者かを引きに行っていない", /isAdmin\(/.test(COUNTS), false);

// ---------------------------------------------------------------------------
console.log("\n--- 5. たいてい捨てられる見出しカードを、要るときだけ作っているか ---");
console.log("   ページが自分で og: を書いていれば丸ごと捨てられる（いまの実ページは全部そう）");

ok("組み立てを引数に直に書いていない", /withOgTags\([^;]*publicMetaFor\(/.test(PUBLIC_ROUTE), false);
ok("読まれたら作る部品がある", /function lazyPublicMeta\(html: string, pageUrl: string, imageUrl: string\): PublicPageMeta/.test(PUBLIC_ROUTE), true);
ok("組み立てを呼ぶのは 1 か所だけ", count(PUBLIC_ROUTE, /publicMetaFor\(/g), 1);
ok("その 1 か所は、読まれたときの中にある", bodyOf(PUBLIC_ROUTE, "function lazyPublicMeta\\(").includes("publicMetaFor("), true);
ok("2 回読まれても作るのは 1 回", /if \(made === null\) made = publicMetaFor\(/.test(PUBLIC_ROUTE), true);
ok("公開の本文は現在の版だけ", count(PUBLIC_ROUTE, /lazyPublicMeta\(/g), 2);

console.log("\n   「自分で書いてあるか」の決まりを、入口へ書き写していない（正本は src/lib/pages/og.ts）");
ok("見分けの正規表現を持ち込んでいない", /property=\["']og:/.test(PUBLIC_ROUTE), false);
ok("見分けの名前も持ち込んでいない", /HAS_OG/.test(PUBLIC_ROUTE), false);

// ---------------------------------------------------------------------------
console.log("\n--- 6. 速さのために、決まりを緩めていないか ---");

const TOUCHED = [
  ["src/app/api/comments/route.ts", COMMENTS_API],
  ["src/app/page.tsx", INDEX],
  ["src/app/public/[...slug]/route.ts", PUBLIC_ROUTE],
  ["src/app/internal/[...slug]/route.ts", INTERNAL_ROUTE],
  ["src/app/api/views/route.ts", VIEWS_API],
  ["src/app/activity/actions.ts", strip(await read("src/app/activity/actions.ts"))],
  ["src/lib/access/access.ts", ACCESS],
  ["src/lib/pages/store.ts", STORE],
  ["src/lib/pages/views.ts", PAGE_VIEWS],
  ["src/lib/pages/cache.ts", strip(await read("src/lib/pages/cache.ts"))],
];
for (const [path, code] of TOUCHED) {
  ok(`  列を名指しで読んでいる: ${path}`, /select\("\*"\)/.test(code), false);
  ok(`  型を壊す逃げが無い: ${path}`, /\bas [A-Z]|: any\b/.test(code), false);
}

console.log("\n   台帳を引く問い合わせが、本文を運んでいない");
console.log("      ※ 台帳と本文を 1 回にまとめると往復は減るが、門を通さない人のぶんの本文まで運ぶことになる");
const PAGE_COLUMNS = /const PAGE_COLUMNS =[\s\S]*?;/.exec(STORE)?.[0] ?? "";
const REVISION_COLUMNS = /const REVISION_COLUMNS =[\s\S]*?;/.exec(STORE)?.[0] ?? "";
ok("ページの列に本文が無い", /html/.test(PAGE_COLUMNS), false);
ok("履歴の列にも本文が無い", /html/.test(REVISION_COLUMNS), false);
ok("本文は、門を通ったページからしか読めない", /export async function readHtmlOf\(page: StoredPage\)/.test(STORE), true);

console.log("\n   門そのものは、もとの道を通っている");
ok("引くのと決めるのが 1 つの動きのまま", /const page = await findPage\(organization, pageSlug\);/.test(ACCESS), true);
ok("決めるのは 1 つの部品だけ", count(ACCESS, /const access = await canViewPage\(identity, page\);/g), 1);
ok("材料を取りに行くのは 1 か所だけ", count(ACCESS, /\.rpc\(FACTS_FUNCTION/g), 1);
ok("一覧の名簿の材料は、1 回で読む関数の 1 か所だけ（docs/design/app-speed.md）", count(ACCESS, /\.rpc\("org_member_page_grants"/g), 1);
ok("関数はこの 2 つだけ", count(ACCESS, /\.rpc\(/g), 2);

console.log(`\n${fails === 0 ? "すべて合格" : `${fails} 件 不合格`}`);
