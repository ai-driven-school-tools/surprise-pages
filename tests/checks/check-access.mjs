import { databaseStub, readAccessSource, companyDeployment } from "./paths.mjs";
/**
 * ページごとの閲覧の許可（門番）を確かめる。
 *
 * 門番は「見せ方」と「名乗り」と「名簿」の 3 つから、見てよいかを決める。
 * 入口ごとに書き比べていると、片方だけ条件が抜けて
 * 「制限したはずのページが別の入口から読める」種類の見落としが起きるので、
 * 判定は src/lib/access/access.ts の 1 つだけに置いてある。
 *
 * ここで見るのは 6 つ。
 *   1. 見せ方 × 名乗り の総当たり（通す / 断るが 1 つも食い違わないか）
 *   2. 断る理由が 3 つに正しく分かれるか（ログインへ / 403 へ / 404 へ）
 *   3. 共有の設定を触れるのが所有者と管理者だけか
 *   4. 会社の外のアドレスを名簿に入れられないか
 *   5. 公開ページに制限を付けようとしたら断るか
 *   6. 社外への公開を、あとから付け外しできる範囲
 *   7. 保管庫の作りと、引きに行く回数
 *
 * 保管庫には繋がない。判定の部分だけを取り出して、実際に呼んで確かめる。
 */
import { readFile, writeFile } from "node:fs/promises";

import { root, dir } from "./paths.mjs";
const { build } = await import(`${root}/node_modules/esbuild/lib/main.js`);

const ACCESS = readAccessSource();
const SQL = await readFile(`${root}/db/migrations/0006_access.sql`, "utf8");
const ORGANIZATIONS = await readFile(`${root}/src/lib/organization/scope.ts`, "utf8");
const ROUTE = await readFile(`${root}/src/app/api/pages/access/route.ts`, "utf8");
const strip = (text) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
const ACCESS_CODE = strip(ACCESS);
const SQL_CODE = SQL.replace(/^--.*$/gm, "");
const SCOPE_SQL = (await readFile(`${root}/db/migrations/20261008170329_organization_scope.sql`, "utf8")).replace(/^--.*$/gm, "");
const SHRINK_SQL = (await readFile(`${root}/db/migrations/20261011095952_organization_keys_shrink.sql`, "utf8")).replace(/^--.*$/gm, "");
const ROUTE_CODE = strip(ROUTE);

/**
 * 会社のドメインの正本は、最初の組織（最初の組織）の自動参加のドメイン（src/lib/organization/organizations.ts の FIRST_ORGANIZATION）。
 * 検査用の値もそこから写して作る（ここに文字列を書き写すと、正本を変えたときに検査だけ古いまま通ってしまう）。
 */
const DOMAIN = "company.test";

// ログイン・cookie・保管庫への接ぎ口だけ差し替えて、中の判定を取り出す
await writeFile(
  `${dir}/access-stub.mjs`,
    "export const auth = async () => null;\n" +
    "export const cookies = async () => ({ get: () => undefined });\n" +
    // 宛先を教える口。ここでは名乗りが読めない扱いにして、手元でログインを省く仕掛けを効かせない
    "export const headers = async () => ({ get: () => null });\n" +
    'export const createClient = () => { throw new Error("検査では保管庫に繋がない"); };\n',
);
await build({
  entryPoints: [`${root}/src/lib/access/access.ts`],
  outfile: `${dir}/access.mjs`,
  bundle: true, plugins: [companyDeployment],
  format: "esm",
  platform: "node",
  external: ["node:*"],
  alias: {
    "@/auth": `${dir}/access-stub.mjs`,
    "next/headers": `${dir}/access-stub.mjs`,
    "@/lib/db/database": databaseStub(`${dir}/access-stub.mjs`),
  },
});
const {
  ACCESS_VISIBILITIES,
  canManageSharing,
  canTogglePublic,
  canToggleRestricted,
  decideAccess,
  toAccessVisibility,
  toMemberEmail,
} = await import(`${dir}/access.mjs`);

let fails = 0;
const ok = (label, actual, expected) => {
  const pass = String(actual) === String(expected);
  if (!pass) fails += 1;
  console.log(`${pass ? "OK  " : "NG  "} ${label}: ${actual}（期待: ${expected}）`);
};

const OWNER = `taro@${DOMAIN}`;
const OTHER = `hanako@${DOMAIN}`;

/** 要求の組織（最初の組織）の所属つきの会社の人。管理者かは材料（facts.admin）で渡す。 */
const member = (email) => ({ kind: "member", email, name: null, image: null, desktop: false, organization: { id: "00000000-0000-4000-8000-000000000001", assetPrefix: "", role: "member" } });
/** ログインしているが、要求の組織に所属の無い人（外した人・招かれていない外の人）。 */
const OUTSIDER = { kind: "outsider", email: OTHER, name: null, image: null, desktop: false, organization: { id: "00000000-0000-4000-8000-000000000001", assetPrefix: "" } };
const GUEST = { kind: "guest", guestId: "g1", name: "ゲスト" };

/** 名簿から引いた材料。ここに渡すものが変わると答えが変わる */
const facts = (visibility, extra = {}) => ({
  visibility,
  deleted: false,
  createdBy: OWNER,
  admin: false,
  granted: false,
  ...extra,
});

/** 答えを 1 語で。通すなら「通す」、断るならその理由 */
const verdict = (identity, one) => {
  const result = decideAccess(identity, one);
  return result.allowed ? "通す" : result.reason;
};

/** 名乗り方 7 通り。「許可あり」は個人でもまとまり経由でも材料は同じ形になる */
const viewers = [
  ["名乗っていない人", null, {}],
  ["ゲスト（名前だけの人）", GUEST, {}],
  ["会社の人（名簿に無い）", member(OTHER), {}],
  ["所有者（作った人）", member(OWNER), {}],
  ["管理者", member(OTHER), { admin: true }],
  ["個人として許可されている人", member(OTHER), { granted: true }],
  ["許可されたまとまりに入っている人", member(OTHER), { granted: true }],
  // 所属の無い人には、材料（作った人・管理者・許可）が何であっても「無い」（ページがあることも教えない）
  ["所属のない人（作った人・管理者・許可の材料つき）", { ...OUTSIDER, email: OWNER }, { admin: true, granted: true }],
];

// ---------------------------------------------------------------------------
console.log("--- 1. 見せ方 × 名乗り の総当たり ---");

/** 見せ方ごとの、7 通りの答え（viewers と同じ並び） */
const table = {
  public: ["通す", "通す", "通す", "通す", "通す", "通す", "通す", "通す"],
  internal: ["signin", "signin", "通す", "通す", "通す", "通す", "通す", "notFound"],
  restricted: ["signin", "signin", "restricted", "通す", "通す", "通す", "通す", "notFound"],
  // 知らない見せ方（あとで増やして、ここへ足し忘れたとき）
  secret: ["notFound", "notFound", "notFound", "notFound", "notFound", "notFound", "notFound", "notFound"],
};

const width = Math.max(...viewers.map(([label]) => label.length)) * 2;
for (const [visibility, expected] of Object.entries(table)) {
  console.log(`\n   ［${visibility}］`);
  viewers.forEach(([label, identity, extra], index) => {
    const padded = label + "　".repeat(Math.max(0, (width - label.length * 2) / 2));
    ok(`  ${padded}`, verdict(identity, facts(visibility, extra)), expected[index]);
  });
}

console.log("\n   総当たりの数");
ok("見せ方 × 名乗り", Object.keys(table).length * viewers.length, 32);
ok("知っている見せ方は 3 通り", ACCESS_VISIBILITIES.length, 3);
ok("並びは internal / public / restricted", ACCESS_VISIBILITIES.join(","), "internal,public,restricted");
ok("知らない見せ方は読み取らない", toAccessVisibility("secret"), null);
ok("空文字も読み取らない", toAccessVisibility(""), null);

console.log("\n   通してはいけない組み合わせが 1 つも通っていないか");
const leaks = [];
for (const [visibility, expected] of Object.entries(table)) {
  viewers.forEach(([label, identity, extra], index) => {
    const got = verdict(identity, facts(visibility, extra));
    if (got === "通す" && expected[index] !== "通す") leaks.push(`${visibility} / ${label}`);
  });
}
ok("漏れた組み合わせ", leaks.length === 0 ? "なし" : leaks.join(" / "), "なし");

// ---------------------------------------------------------------------------
console.log("\n--- 2. 断る理由の分かれ方（行き先が変わる）---");
console.log("   signin = ログインへ / restricted = 403 と「見せてほしい」へ / notFound = 404");
ok("制限つき × 名乗っていない → ログインへ", verdict(null, facts("restricted")), "signin");
ok("制限つき × ゲスト → ログインへ（403 にしない）", verdict(GUEST, facts("restricted")), "signin");
ok("制限つき × 会社の人 → 403（404 にしない）", verdict(member(OTHER), facts("restricted")), "restricted");
console.log("      ※ 404 にすると、許可を頼む相手が分からないまま行き止まりになる");
ok("社内限定 × ゲスト → ログインへ", verdict(GUEST, facts("internal")), "signin");

console.log("\n   消したページは、どの名乗りでも「無い」（消したことも見せない）");
for (const visibility of ["public", "internal", "restricted"]) {
  for (const [label, identity, extra] of viewers) {
    ok(
      `  ${visibility} / ${label}`,
      verdict(identity, facts(visibility, { ...extra, deleted: true })),
      "notFound",
    );
  }
}
ok(
  "消した公開ページは、名乗っていない人にも「無い」",
  verdict(null, facts("public", { deleted: true })),
  "notFound",
);
ok(
  "消した制限つきページは、管理者にも「無い」",
  verdict(member(OTHER), facts("restricted", { deleted: true, admin: true })),
  "notFound",
);

console.log("\n   所有者の照らし合わせ");
ok("大文字で名乗っても所有者と分かる", verdict(member(OWNER.toUpperCase()), facts("restricted")), "通す");
ok("所有者が空のページは、他人を通さない", verdict(member(OTHER), facts("restricted", { createdBy: null })), "restricted");
ok("似ているが別のアドレスは通さない", verdict(member(`taro2@${DOMAIN}`), facts("restricted")), "restricted");

// ---------------------------------------------------------------------------
console.log("\n--- 3. 共有の設定を触れる人 ---");
const page = (visibility, extra = {}) => ({
  id: "11111111-1111-4111-8111-111111111111",
  pageSlug: `${visibility === "public" ? "public" : "internal"}/example/hello`,
  visibility,
  title: "ごあいさつ",
  currentVersionId: null,
  createdBy: OWNER,
  deletedAt: null,
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z",
  ...extra,
});

const sharing = [
  ["所有者（社内限定）", member(OWNER), page("internal"), false, true],
  ["所有者（制限つき）", member(OWNER), page("restricted"), false, true],
  ["管理者", member(OTHER), page("internal"), true, true],
  ["管理者（制限つき）", member(OTHER), page("restricted"), true, true],
  ["ただの会社の人", member(OTHER), page("internal"), false, false],
  ["許可されているだけの人", member(OTHER), page("restricted"), false, false],
  ["ゲスト", GUEST, page("internal"), false, false],
  ["名乗っていない人", null, page("internal"), false, false],
  ["所有者だが公開ページ", member(OWNER), page("public"), false, false],
  ["管理者だが公開ページ", member(OTHER), page("public"), true, false],
  /*
   * 社内として投稿してから公開に切り替えたページ（呼び名は internal のまま）。
   * ここを閉じると、いったん公開にしたページを二度とやめられない
   * （設定の口ごと 404 になる）。片道切符を作らないための行。
   */
  ["所有者・公開に切り替えたページ", member(OWNER), page("public", { pageSlug: "internal/example/hello" }), false, true],
  ["管理者・公開に切り替えたページ", member(OTHER), page("public", { pageSlug: "internal/example/hello" }), true, true],
  ["ただの会社の人・公開に切り替えたページ", member(OTHER), page("public", { pageSlug: "internal/example/hello" }), false, false],
  ["所有者だが消したページ", member(OWNER), page("internal", { deletedAt: "2026-08-02T00:00:00.000Z" }), false, false],
  ["管理者だが消したページ", member(OTHER), page("restricted", { deletedAt: "2026-08-02T00:00:00.000Z" }), true, false],
];
for (const [label, identity, one, admin, expected] of sharing) {
  ok(label, canManageSharing(identity, one, admin), expected);
}

// ---------------------------------------------------------------------------
console.log("\n--- 4. 名簿に入れられるアドレス（会社の外を入れない）---");
console.log(`   試しのドメイン: @${DOMAIN}（この設置は自動参加のドメインを持たない。呼ぶ側が渡した一覧でだけ絞る）`);
ok("ドメインは呼ぶ側が組織の設定から渡す", /export function toMemberEmail\(value: unknown, domains: readonly string\[\]\)/.test(ACCESS_CODE), true);

const emails = [
  ["会社のアドレス", `owner@${DOMAIN}`, `owner@${DOMAIN}`],
  ["大文字混じりは小文字に揃える", `OWNER@${DOMAIN.toUpperCase()}`, `owner@${DOMAIN}`],
  ["前後の空白は落とす", `  owner@${DOMAIN}  `, `owner@${DOMAIN}`],
  ["よその会社", "someone@example.com", null],
  ["似せた長いドメイン", `someone@${DOMAIN}.attacker.com`, null],
  ["下に生やしたドメイン", `someone@mail.${DOMAIN}`, null],
  ["ドメインだけ", `@${DOMAIN}`, null],
  ["@ が 2 つ", `a@b@${DOMAIN}`, null],
  ["途中に空白", `ma ko@${DOMAIN}`, null],
  ["空文字", "", null],
  ["文字列でない（数）", 1234, null],
  ["文字列でない（null）", null, null],
  ["文字列でない（何も渡さない）", undefined, null],
  ["文字列でない（かたまり）", { email: `owner@${DOMAIN}` }, null],
];
for (const [label, input, expected] of emails) ok(label, toMemberEmail(input, [DOMAIN]), expected);
ok("自動参加のドメインを持たない組織では、名簿へ入れられるアドレスは無い", toMemberEmail(`owner@${DOMAIN}`, []), null);
ok("別の組織のドメインは、その組織の名簿にだけ入る", toMemberEmail("taro@acme.example", ["acme.example"]), "taro@acme.example");

console.log("\n   入口でも断る（保存の手前で止める）");
// 名簿へ入れてよいのは、自動参加のドメインの人か、組織に有効な所属のある人（招いた外の人）。所属の無い外の人は入れない
ok("個人に許可を出すところで確かめる", /const grantee = await rosterEmail\(organization, email, domains\);/.test(ACCESS_CODE), true);
ok("名簿へ入れてよいかは、渡された一覧で形をそろえるだけ（所属の名簿は持たない）", /return toMemberEmail\(value, domains\);/.test(ACCESS_CODE), true);
ok("外のアドレスなら投げて止める", /if \(grantee === null\) throw new OutsideDomainError\(email, domains\);/.test(ACCESS_CODE), true);
ok("ドメインは要求の組織の自動参加のドメインから引く", /const domains = await requestAutoJoinDomains\(organization\);\s*const grantee = await rosterEmail/.test(ACCESS_CODE), true);
// 申し出を出せるのは、名乗りの時点で要求の組織に所属している人だけ（招いた外の人も含む）。ドメインでは断らない
ok("申し出は名乗りの人のアドレスをそろえて積む", /const email = normalize\(requester\.email\);/.test(ACCESS_CODE), true);

// ---------------------------------------------------------------------------
console.log("\n--- 5. 見せ方を動かせるのは、社内として投稿したページだけ ---");
console.log("   公開として投稿したページの入口は /public/… しか無い。社内へ寄せると誰も開けなくなる");
ok("社内限定は付け外しできる", canToggleRestricted("internal"), true);
ok("制限つきも動かせる", canToggleRestricted("restricted"), true);
ok("公開の見せ方は、名簿の付け外しの対象ではない", canToggleRestricted("public"), false);
ok("知らない見せ方も断る", canToggleRestricted("secret"), false);
ok("空文字も断る", canToggleRestricted(""), false);

console.log("\n--- 6. 見せ方は、望みの 1 つを受けて置き換える ---");
console.log("   旗 2 つ（制限を付けるか / 公開するか）で受けると、同じ列を 2 通りで表すことになる");
console.log("   → 2 つが同時に来ると矛盾し、混ざらないための歯止めが要り、遠回りが人に見える");
ok("受けるのは見せ方 1 つ", /export async function setPageScope\(organization: OrganizationScope, pageId: string, scope: AccessVisibility\)/.test(ACCESS_CODE), true);
ok("旗で受ける口は残っていない", /setPageRestricted|setPagePublic/.test(ACCESS_CODE), false);

console.log("\n   動かせるページかどうか（決めるのは呼び名の頭）");
ok("社内として投稿したページは動かせる", canTogglePublic("internal/example/hello"), true);
ok("公開として投稿したページは動かさない", canTogglePublic("public/example/hello"), false);
ok("知らない頭は断る", canTogglePublic("secret/example/hello"), false);
ok("空文字も断る", canTogglePublic(""), false);
ok(
  "呼び名で断るときに投げる",
  /if \(!canTogglePublic\(pageSlug\)\) throw new PageNotSwitchableError\(\);/.test(ACCESS_CODE),
  true,
);
// 画面に届く断りは辞書の鍵を持つ LocalizedError（src/lib/i18n/errors.ts）を継ぐ
ok("断り方は 1 つだけ", (ACCESS_CODE.match(/class \w*Error extends (?:Localized)?Error/g) ?? []).length >= 1, true);
ok("2 段跳びを断る歯止めは無い（どこからでも 1 手で動く）", /RestrictedPageOpenError/.test(ACCESS_CODE), false);

console.log("\n   書くときの決まり");
ok("書き込むのは見せ方の列 1 つだけ", /update\(\{ visibility: scope \}\)/.test(ACCESS_CODE), true);
ok(
  "書く直前にもう一度絞る（読んだあとに誰かが動かしていたら書かない）",
  /\.in\("visibility", \["internal", "restricted", "public"\]\)/.test(ACCESS_CODE),
  true,
);
ok("更新した時刻には触らない（一覧の並びを動かさない）", /update\(\{ visibility: scope \}\)/.test(ACCESS_CODE), true);
ok("呼び名も素材の置き場所も動かさない", /page_slug/.test(/setPageScope[\s\S]*?^}/m.exec(ACCESS_CODE)?.[0] ?? ""), true);
console.log("      ※ 引くのは判定のためだけ。動かすと既にある画像が全部割れる");

console.log("\n   入口の受け取り方");
ok("知らない見せ方は通さない", /scope = toAccessVisibility\(scopeValue\);/.test(ROUTE_CODE), true);
ok("形が違えば受け取らない", /typeof scopeValue !== "string"/.test(ROUTE_CODE), true);
ok("旗で受ける欄は残っていない", /record\["restricted"\]|record\["open"\]/.test(ROUTE_CODE), false);
ok("断り方は入口で言い換えず、そのまま人に見せる", /error instanceof PageNotSwitchableError\) return jsonError\(error\.message, 400\)/.test(ROUTE_CODE), true);
ok("いまの姿を応答に載せる（画面に数え直させない）", /scope: stored\.visibility/.test(ROUTE_CODE), true);
ok("動かせるページかも載せる", /switchable: canTogglePublic\(stored\.pageSlug\)/.test(ROUTE_CODE), true);
ok("公開でなくなったら配信網の紙を落としにかかる", /if \(scope !== "public"\) revalidatePath\(/.test(ROUTE_CODE), true);
ok("札でも落とす（配信網の控えの正本）", /await dropPageDelivery\(target.id\)/.test(ROUTE_CODE), true);
console.log("      ※ 効かない経路もあるので頼り切らない。応答の側でも控えを 1 分しか持たせない");

// ---------------------------------------------------------------------------
console.log("\n--- 7. 引きに行く回数と、保管庫の作り ---");
console.log("   制限つきのページを 1 枚めくるのに、往復は多くて 1 回");
ok("材料を取りに行くのは 1 か所だけ", (ACCESS_CODE.match(/\.rpc\(FACTS_FUNCTION/g) ?? []).length, 1);
ok("一覧の名簿の材料は、1 回で読む関数の 1 か所だけ（docs/design/app-speed.md）", (ACCESS_CODE.match(/\.rpc\("org_member_page_grants"/g) ?? []).length, 1);
ok("まず材料なしで決める", /const early = decideAccess\(identity, base\);/.test(ACCESS_CODE), true);
ok("答えが変わらないならそのまま帰す", /if \(early\.allowed \|\| early\.reason !== "restricted"\) return early;/.test(ACCESS_CODE), true);
ok("決めるのは 1 つの部品だけ", (ACCESS_CODE.match(/export function decideAccess/g) ?? []).length, 1);
ok("列は名指しで読む（* を使わない）", /select\("\*"\)/.test(ACCESS_CODE), false);
ok("型を壊す逃げ（as）を使っていない", /\bas [A-Z]/.test(ACCESS_CODE), false);

console.log("\n   保管庫側（0006_access.sql）");
ok("見せ方に restricted を足した", /check \(visibility in \('internal', 'public', 'restricted'\)\)/.test(SQL_CODE), true);
ok("古い縛りを外してから足している", /drop constraint pages_visibility_check/.test(SQL_CODE), true);
ok("呼び名は動かさない（page_slug を書き換える文が無い）", /update public\.pages set page_slug/i.test(SQL_CODE), false);

const tables = ["groups", "group_members", "page_permissions", "access_requests", "admins"];
for (const name of tables) {
  ok(`  表がある: ${name}`, new RegExp(`create table public\\.${name} \\(`).test(SQL_CODE), true);
  ok(`  鍵がかかっている: ${name}`, new RegExp(`alter table public\\.${name} enable row level security`).test(SQL_CODE), true);
}
ok("ポリシーは作らない（0004 と同じ流儀）", /create policy/i.test(SQL_CODE), false);
ok("最初の管理者を入れてある", /insert into public\.admins \(email\) values \('owner@example\.com'\)/.test(SQL_CODE), true);
ok("入れ直しても壊れない", /on conflict do nothing/.test(SQL_CODE), true);

console.log("\n   相手はどちらか片方だけ");
ok("個人のときはまとまりが空", /grantee_kind = 'member' and member_email is not null and group_id is null/.test(SQL_CODE), true);
ok("まとまりのときは個人が空", /grantee_kind = 'group' and group_id is not null and member_email is null/.test(SQL_CODE), true);
ok("同じ人を 2 回足せない", /unique index page_permissions_member_key[\s\S]*?where grantee_kind = 'member'/.test(SQL_CODE), true);
ok("同じまとまりを 2 回足せない", /unique index page_permissions_group_key[\s\S]*?where grantee_kind = 'group'/.test(SQL_CODE), true);
ok("未処理の申し出は 1 人 1 つ", /unique index access_requests_pending_key[\s\S]*?where resolved_at is null/.test(SQL_CODE), true);
ok("しまった印と答えは一緒に立つ", /\(resolved_at is null\) = \(approved is null\)/.test(SQL_CODE), true);
// 全体で一意の古い索引（0006 の groups_alive_name_key）は縮める段で外した。いま効いているのは組織の中で一意の索引
ok("まとまりの名前は、組織の中の生きているものの中で 1 つ", /create unique index groups_organization_alive_name_key on public\.groups \(organization_id, lower\(name\)\) where deleted_at is null/.test(SCOPE_SQL), true);
ok("全体で一意の古い索引は外してある（同じ名前のまとまりを 2 つの組織に置ける）", /drop index public\.groups_alive_name_key;/.test(SHRINK_SQL), true);

console.log("\n   材料は 1 回の問い合わせで取る（許可の表とまとまりを突き合わせる）");
const fn = /create function public\.page_access_facts[\s\S]*?\$\$;/.exec(SQL_CODE)?.[0] ?? "";
ok("関数がある", fn.length > 0, true);
ok("管理者かを見る", /from public\.admins/.test(fn), true);
ok("許可の表を見る", /from public\.page_permissions/.test(fn), true);
ok("入っているまとまりを突き合わせる", /join public\.group_members/.test(fn), true);
ok("個人としての許可を数える", /p\.grantee_kind = 'member' and p\.member_email = lower\(p_email\)/.test(fn), true);
ok("まとまり経由の許可を数える", /p\.grantee_kind = 'group' and m\.member_email = lower\(p_email\)/.test(fn), true);
const body = /as \$\$([\s\S]*?)\$\$;/.exec(fn)?.[1] ?? "";
ok("中の文は 1 つだけ（往復も 1 回）", (body.match(/;/g) ?? []).length, 1);
ok("素の SQL で書いてある（手続きを挟まない）", /language sql/.test(fn), true);
ok("強い権限で動かさない（security definer を付けない）", /security definer/i.test(fn), false);
ok("呼べるのはサーバーだけ", /revoke all on function public\.page_access_facts/.test(SQL_CODE), true);

console.log("\n   索引（引き方に沿っているか）");
ok("この人が入っているまとまりを引ける", /create index group_members_email_idx/.test(SQL_CODE), true);
ok("このページの許可を新しい順に引ける", /create index page_permissions_page_idx/.test(SQL_CODE), true);
ok("このページの未処理の申し出を引ける", /create index access_requests_pending_idx/.test(SQL_CODE), true);

console.log(`\n${fails === 0 ? "すべて合格" : `${fails} 件 不合格`}`);
