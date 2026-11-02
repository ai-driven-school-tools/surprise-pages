/**
 * 投稿の鍵が、画面でログインした本人と同じ名乗りになるかを確かめる。
 *
 * 鍵は発行時から持ち主のアドレスを持っている。新しい種類の鍵も再発行も要らない。
 * 入口ごとに `ownerFromRequest` を足すと門が 2 つになるので、読むのは
 * `currentIdentity` ただ 1 つ。コメントの読み書き・解決もそこを通る。
 *
 * 保管庫には繋がない。照合の口は差し替えて、名乗りの組み立てだけを実際に呼ぶ。
 */
import { readFile, writeFile } from "node:fs/promises";

import { root, dir } from "./paths.mjs";
const { build } = await import(`${root}/node_modules/esbuild/lib/main.js`);

const read = (path) => readFile(`${root}/${path}`, "utf8");
const strip = (text) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");

let fails = 0;
const ok = (label, actual, expected) => {
  const pass = String(actual) === String(expected);
  if (!pass) fails += 1;
  console.log(`${pass ? "OK  " : "NG  "} ${label}: ${actual}（期待: ${expected}）`);
};

// 会社のドメインの正本は、最初の組織の自動参加のドメイン（src/lib/organization/organizations.ts）
const DOMAIN = /\bdomain: "([^"]+)"/.exec(await read("src/lib/organization/scope.ts"))?.[1] ?? "";
const IDENTITY = strip(await read("src/lib/identity/identity.ts"));
const TOKENS = strip(await read("src/lib/identity/publish-tokens.ts"));
const TOKEN_VALUE = strip(await read("src/lib/identity/token-value.ts"));
const AGENTS = await read("AGENTS.md");
const CLI = strip(await read("bin/pages-publish.mjs"));

const COMMENTS_API = strip(await read("src/app/api/comments/route.ts"));
const ONE_COMMENT_API = strip(await read("src/app/api/comments/[id]/route.ts"));
const HISTORY_API = strip(await read("src/app/api/history/route.ts"));
const EDIT_API = strip(await read("src/app/api/pages/edit/route.ts"));
const PAGES_API = strip(await read("src/app/api/pages/route.ts"));
const SOURCE_API = strip(await read("src/app/api/pages/source/route.ts"));

// ---------------------------------------------------------------------------
console.log("--- 1. 鍵の持ち主を会社の人へ移す口 ---");
ok("ヘッダ文字列から鍵を取る部品がある", /export function bearerTokenFromHeader\(/.test(TOKEN_VALUE), true);
ok("Request の口は同じ部品を通る", /return bearerTokenFromHeader\(request\.headers\.get\("authorization"\)\)/.test(TOKEN_VALUE), true);
ok("持ち主を会社の人へ移す口がある", /export async function memberFromAuthorization\(/.test(TOKENS), true);
ok("照合は既にある verifyToken（アプリの鍵も同じ照合を通る・組織は名乗りが渡す）", /const owner = await verifyToken\(organization, value\)/.test(TOKENS), true);
ok("形は identityOf と同じ（顔写真は無い）", /return identityOf\(owner\)/.test(TOKENS), true);
ok("publish-tokens は identity を型だけ読む", /import type \{ Member \} from "\.\/identity"/.test(TOKENS), true);
ok("publish-tokens が currentIdentity を呼ばない（循環しない）", /currentIdentity/.test(TOKENS), false);

console.log("\n--- 2. currentIdentity がヘッダも読む ---");
ok("ヘッダを読む", /await headers\(\)/.test(IDENTITY), true);
ok("鍵の持ち主へ移す口を通る（要求の組織と、どの口の名乗りかを渡す）", /memberFromAuthorization\(organization, authorization, use\)/.test(IDENTITY), true);
ok("既定は Web の窓口の名乗り", /export async function currentIdentity\(use: KeyUse = "web"\)/.test(IDENTITY), true);
ok(
  "鍵は手元の仮の人より前（仮の人へ吸い込まない）",
  IDENTITY.indexOf("memberFromAuthorization") < IDENTITY.indexOf("localPreviewMember()"),
  true,
);
ok(
  "鍵はセッションより前（CLI はセッションを持たない）",
  IDENTITY.indexOf("memberFromAuthorization") < IDENTITY.indexOf("await auth()"),
  true,
);
// 手形の読みは 1 つの部品（sessionPerson）に寄せてあり、名乗りはそれをゲストより先に見る
// 手形は要求の組織の目印を受け取って読む（手形を作った宛先の組織と違えば名乗り無し）
ok("ゲストより会社の人が前", IDENTITY.indexOf("await sessionPerson(organization.id)") > 0 && IDENTITY.indexOf("await sessionPerson(organization.id)") < IDENTITY.indexOf("readGuest("), true);
ok("手形を読む部品は auth() の 1 か所", /const sessionPerson = cache\(async \(organizationId: string\): Promise<SignedInPerson \| null> => \{\s*const session = await auth\(\);/.test(IDENTITY), true);
// 鍵発行の本人確認（currentBrowserIdentity）は通常の名乗り（currentIdentity）を絞って返すので、セッションを読むのは 1 回
ok("セッションを読むのは通常の本人確認の 1 回だけ", (IDENTITY.match(/await auth\(\)/g) ?? []).length, 1);

console.log("\n--- 3. 入口に鍵の照合を書き足していない ---");
const SESSION_WINDOWS = [
  ["コメントの一覧・投稿", COMMENTS_API],
  ["コメントを直す・消す", ONE_COMMENT_API],
  ["履歴", HISTORY_API],
  ["本文の直し", EDIT_API],
];
for (const [label, code] of SESSION_WINDOWS) {
  ok(`  ${label}: currentIdentity`, /await currentIdentity\(\)/.test(code), true);
  ok(`  ${label}: ownerFromRequest を置かない`, /ownerFromRequest/.test(code), false);
}
ok("投稿の口は今までどおり鍵専用", /ownerFromRequest\(organization, request\)/.test(PAGES_API), true);
ok("取り寄せの口も鍵専用", /ownerFromRequest\(organization, request\)/.test(SOURCE_API), true);
ok("取り寄せは鍵を見てよいには読み替えない", /identityOf\(owner\)/.test(SOURCE_API), true);

console.log("\n--- 4. 決まり（AGENTS.md）---");
ok("鍵も currentIdentity が読むと書いてある", AGENTS.includes("currentIdentity` がヘッダも読む"), true);
ok("再発行は要らないと書いてある", AGENTS.includes("再発行は要らない"), true);
ok("CLI の入口が書いてある", AGENTS.includes("pages-publish comments"), true);
ok("入口ごとに ownerFromRequest を足すなと書いてある", AGENTS.includes("入口ごとに `ownerFromRequest` を足さない"), true);

console.log("\n--- 5. 手元の道具（pages-publish comments）---");
ok("comments の道がある", /if \(argv\[0\] === "comments"\)/.test(CLI), true);
ok("一覧がある", /action === "list"/.test(CLI), true);
ok("解決がある", /action === "resolve"/.test(CLI), true);
ok("再開がある", /action === "reopen"/.test(CLI), true);
ok("投稿がある", /action === "post"/.test(CLI), true);
ok("一覧はコメントの口を叩く", /\/api\/comments\?page=/.test(CLI), true);
ok("解決は PATCH", /callJson\("PATCH", `\/api\/comments\/\$\{/.test(CLI), true);
ok("書くのは POST", /callJson\("POST", "\/api\/comments"/.test(CLI), true);
// 配布版では Slack の知らせを外したので、送る欄そのものが無いことを見る
ok("Slack へ知らせる欄を送らない（配布版に Slack は無い）", /notifySlack/.test(CLI), false);
ok("新しい環境変数を足していない", /PAGES_COMMENT/.test(CLI), false);

const commentsHelp = /comments list[\s\S]*?comments post/.exec(await read("bin/pages-publish.mjs"))?.[0] ?? "";
ok("使い方に list がある", commentsHelp.includes("comments list"), true);
ok("使い方に resolve がある", commentsHelp.includes("comments resolve"), true);
ok("使い方に「トークン」を出さない", commentsHelp.includes("トークン"), false);

console.log("\n--- 6. 本物の currentIdentity を差し替えて呼ぶ ---");
await writeFile(
  `${dir}/id-token-stub.mjs`,
  "const stub = () => {\n" +
    "  if (globalThis.__spIdentityStub === undefined) {\n" +
    "    globalThis.__spIdentityStub = { authorization: null, session: null, local: null };\n" +
    "  }\n" +
    "  return globalThis.__spIdentityStub;\n" +
    "};\n" +
    "export const auth = async () => stub().session;\n" +
    "export const cookies = async () => ({ get: () => undefined });\n" +
    "export const headers = async () => ({\n" +
    '  get: (name) => (String(name).toLowerCase() === "authorization" ? stub().authorization : null),\n' +
    "});\n" +
    "export const localPreviewMember = async () => stub().local;\n" +
    "export const memberFromAuthorization = async (_organization, header) => {\n" +
    "  if (typeof header !== \"string\") return null;\n" +
    "  if (!/^Bearer[ \\t]+good$/i.test(header.trim())) return null;\n" +
    `  return { kind: "member", email: "taro@${DOMAIN}", name: "山田 太郎", image: null };\n` +
    "};\n" +
    // 入場券を作る口だけが使う鍵の読み出し。ここでは名乗りの判定だけを見るので空で返す
    "export const tokenFromAuthorization = async () => null;\n" +
    // 所属の読み（src/lib/organization/member-organization.ts）。要求の組織の名簿に「外した人」がいる、として分ける（本物は保存先の関数で引く）
    "const ORG = { id: \"00000000-0000-4000-8000-000000000001\", slug: \"surprise\" };\n" +
    "export const recordedMembers = async () => new Map();\n" +
    "export const isLocalPreviewMember = () => false;\n" +
    "export const LOCAL_PREVIEW_MEMBER = { kind: \"member\", email: \"local-preview@example.test\", name: null, image: null, desktop: false, organization: { ...ORG, role: \"member\" } };\n" +
    "export const placeInOrganization = async (_organization, person) => (stub().removed ?? []).includes(person.email)\n" +
    "  ? { kind: \"outsider\", ...person, organization: ORG } : { kind: \"member\", ...person, organization: { ...ORG, role: \"member\" } };\n",
);

await build({
  entryPoints: [`${root}/src/lib/identity/identity.ts`],
  outfile: `${dir}/id-token-identity.mjs`,
  bundle: true,
  format: "esm",
  platform: "node",
  external: ["node:*"],
  alias: {
    "@/auth": `${dir}/id-token-stub.mjs`,
    "next/headers": `${dir}/id-token-stub.mjs`,
  },
  plugins: [
    {
      name: "swap-identity-neighbors",
      setup(buildApi) {
        const stub = `${dir}/id-token-stub.mjs`;
        buildApi.onResolve({ filter: /\/(local-preview|publish-tokens|member-organization)(\.ts)?$/ }, () => ({
          path: stub,
        }));
      },
    },
  ],
});

const { currentIdentity, isMember, toViewer } = await import(`${dir}/id-token-identity.mjs`);
const reset = () => {
  globalThis.__spIdentityStub = { authorization: null, session: null, local: null };
};

reset();
ok("何も無ければ名乗らない", await currentIdentity(), null);

reset();
globalThis.__spIdentityStub.authorization = "Bearer good";
const fromToken = await currentIdentity();
ok("鍵だけで会社の人になる", fromToken?.kind, "member");
ok("  アドレスは持ち主", fromToken?.email, `taro@${DOMAIN}`);
ok("  名前は持ち主", fromToken?.name, "山田 太郎");
ok("  顔写真は鍵に無い", fromToken?.image, null);
ok("  isMember を通る", isMember(fromToken), true);
ok("  画面に出す形からメールを落とす", Object.keys(toViewer(fromToken)).includes("email"), false);
ok("  画面に出す名前", toViewer(fromToken).name, "山田 太郎");

reset();
globalThis.__spIdentityStub.authorization = "Bearer nope";
ok("形は鍵でも中身が違えば名乗らない", await currentIdentity(), null);

reset();
globalThis.__spIdentityStub.authorization = "Bearer good";
globalThis.__spIdentityStub.local = {
  kind: "member",
  email: `local-preview@${DOMAIN}`,
  name: "手元のお試し（ログイン省略）",
  image: null,
};
ok("鍵は仮の人より勝つ", (await currentIdentity())?.email, `taro@${DOMAIN}`);

reset();
globalThis.__spIdentityStub.session = {
  user: { email: `hanako@${DOMAIN}`, name: "花子", image: "https://example.com/a.png" },
};
const fromSession = await currentIdentity();
ok("ヘッダが無ければセッション", fromSession?.email, `hanako@${DOMAIN}`);
ok("  セッションの写真は残る", fromSession?.image, "https://example.com/a.png");

reset();
globalThis.__spIdentityStub.authorization = "Bearer good";
globalThis.__spIdentityStub.session = {
  user: { email: `hanako@${DOMAIN}`, name: "花子", image: "https://example.com/a.png" },
};
ok("鍵とセッションが両方あるときは鍵", (await currentIdentity())?.email, `taro@${DOMAIN}`);

reset();
globalThis.__spIdentityStub.session = { user: { email: `hanako@${DOMAIN}`, name: "花子", image: null } };
ok("セッションの人は要求の組織の所属つきで名乗る", (await currentIdentity())?.organization?.role, "member");
globalThis.__spIdentityStub.removed = [`hanako@${DOMAIN}`];
const removed = await currentIdentity();
ok("所属の無い人（外した人）はセッションがあっても会社の人ではない", isMember(removed), false);
ok("  所属なしとして名乗る（ログインしていない人とは分ける）", removed?.kind, "outsider");
ok("  画面に出す形も出さない", toViewer(removed), null);

console.log(`\n${fails === 0 ? "ぜんぶ通った" : `${fails} 件が期待と違う`}`);
process.exitCode = fails === 0 ? 0 : 1;
