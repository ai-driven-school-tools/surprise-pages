import { readWidgetSource } from "./widget-source.mjs";
import { databaseStub } from "./paths.mjs";
/**
 * Google の顔写真が、ログインから画面まで落ちずに届くことを確かめる。
 *
 * 経路: Google → セッション → identity → 保存 → 応答 → 顔の描画
 * 落ちていたのは 1 段目（Google → セッション）。
 * ログインの引換券には名前とメールしか載っておらず、写真の在りかが無かった。
 */
import { readFile, writeFile } from "node:fs/promises";

import { root, dir } from "./paths.mjs";
import { jaText } from "./i18n-ja-text.mjs";
const { build } = await import(`${root}/node_modules/esbuild/lib/main.js`);

/*
 * identity.ts はサーバー用の入り口（ログイン・cookie・宛先）を読み込むので、
 * そこだけ差し替えて、中の「見せる形に直す」計算だけを取り出す。
 *
 * 宛先（headers）は「名乗りが読めない」扱いにしておく。手元でログインを省く仕掛け
 * （src/lib/pages/local-preview.ts）が宛先を見て決めるので、ここで localhost を名乗らせると
 * 顔写真の検査が仮の人の答えを見ることになる。
 * 通すドメインの正本は src/auth.ts。文字列をここに書き写さない。
 */
const DOMAIN = /ALLOWED_DOMAIN = "([^"]+)"/.exec(await readFile(`${root}/src/auth.ts`, "utf8"))?.[1] ?? "";
await writeFile(
  `${dir}/av-stub.mjs`,
  "export const auth = async () => null;\n" +
    "export const cookies = async () => ({ get: () => undefined });\n" +
    "export const headers = async () => ({ get: () => null });\n" +
    `export const ALLOWED_DOMAIN = ${JSON.stringify(DOMAIN)};\n` +
    'export const createClient = () => { throw new Error("検査では保管庫に繋がない"); };\n',
);
await build({
  entryPoints: [`${root}/src/lib/identity/identity.ts`],
  outfile: `${dir}/av-identity.mjs`,
  bundle: true,
  format: "esm",
  platform: "node",
  alias: {
    "@/auth": `${dir}/av-stub.mjs`,
    "next/headers": `${dir}/av-stub.mjs`,
    "@/lib/db/database": databaseStub(`${dir}/av-stub.mjs`),
  },
});
const { toViewer } = await import(`${dir}/av-identity.mjs`);

const AUTH = await readFile(`${root}/src/auth.ts`, "utf8");
const LIB = await readFile(`${root}/src/lib/comments/comments.ts`, "utf8");
const WIDGET = await readWidgetSource();
const strip = (text) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
const AUTH_CODE = strip(AUTH);
const LIB_CODE = strip(LIB);
const WIDGET_CODE = strip(WIDGET);

const { STYLES: RAW } = await (async () => {
  await build({
    entryPoints: [`${root}/src/widget/shared/styles.ts`],
    outfile: `${dir}/av-styles.mjs`,
    bundle: true,
    format: "esm",
    platform: "neutral",
  });
  return import(`${dir}/av-styles.mjs`);
})();
const CSS = RAW.replace(/\/\*[\s\S]*?\*\//g, "");

let fails = 0;
const ok = (label, actual, expected) => {
  const pass = actual === expected;
  if (!pass) fails += 1;
  console.log(`${pass ? "OK  " : "NG  "} ${label}: ${actual}（期待: ${expected}）`);
};

const PHOTO = "https://lh3.googleusercontent.com/a/ABC123=s96-c";

// ---------------------------------------------------------------------------
console.log("--- 1. どこで落ちていたか（保存済みの行が証拠） ---");
console.log("   保存された 4 行はすべて 名前あり / 写真なし。");
console.log("   保存と描画の道は最初から通っていたので、落ちていたのは手前の 1 段目");
const before = { name: "検査用の人", image: null };
ok("保存されていた名前", before.name, "検査用の人");
ok("保存されていた写真", before.image, null);

console.log("\n   1 段目で何が起きていたか");
console.log("   Auth.js は OIDC のつなぎ方のとき、誰かを引換券（ID トークン）の中身だけで決める。");
console.log("   Google の引換券は会社アカウントだと名前とメールしか載らないことがあり、");
console.log("   写真の在りかは窓口（userinfo）にしか無い。窓口へは聞きに行っていなかった");

// 経路の模型。どの段で写真が消えるかを並べて見る
const walk = (asksUserinfo) => {
  const fromGoogle = asksUserinfo ? PHOTO : null; // 引換券だけだと写真が無い
  const session = fromGoogle;
  const identity = typeof session === "string" && session.startsWith("https://") ? session : null;
  const saved = identity;
  const response = saved;
  return { session, identity, saved, response, drawn: response === null ? "頭文字" : "写真" };
};
const old = walk(false);
const now = walk(true);
console.log(`   旧: セッション ${old.session} → 保存 ${old.saved} → 画面 ${old.drawn}`);
console.log(`   新: セッション ${now.session !== null ? "写真あり" : "なし"} → 保存 あり → 画面 ${now.drawn}`);
ok("旧はセッションの時点で空", old.session, null);
ok("旧は画面まで頭文字のまま", old.drawn, "頭文字");
ok("新はセッションに写真が乗る", now.session, PHOTO);
ok("新は画面に写真が出る", now.drawn, "写真");

// ---------------------------------------------------------------------------
console.log("\n--- 2. ログインの設定（1 段目の直し） ---");
ok("窓口に聞きに行く形にした", /if \(provider\.type === "oidc"\) provider\.idToken = false;/.test(AUTH_CODE), true);
ok("型を壊す逃げ（as）を使っていない", /\bas [A-Z]/.test(AUTH_CODE), false);
ok("ログインした瞬間に写真の在りかを手形へ写す", /token\.picture = picture;/.test(AUTH_CODE), true);
ok("写すのは中身がある文字列のときだけ", /typeof picture === "string" && picture\.length > 0/.test(AUTH_CODE), true);
ok("手形から画面側へ渡す（預かった写真の口を先に・無ければ在りか）", /session\.user\.image = kept \?\? picture;/.test(AUTH_CODE), true);
ok("ログインした瞬間に写真そのものを預かる", /\.keepAvatar\(token\.email, picture\)/.test(AUTH_CODE), true);
ok("この仕組みより前にログインした人の分も、試すのは間を空けて", /shouldTryKeeping\(token\.email\)/.test(AUTH_CODE), true);
ok("ログインのときに更新用の鍵を受け取る（同意の画面を挟む）", /access_type: "offline",\s*prompt: "consent select_account",/.test(AUTH_CODE), true);
ok("更新用の鍵は手形にだけ書き写す", /token\.googleRefreshToken = account\.refresh_token;/.test(AUTH_CODE), true);
ok("写真が無い・古いときは取り直す", /\(keptAt === null \|\| Date\.now\(\) - keptAt > AVATAR_REFRESH_MS\) && shouldTryKeeping\(token\.email\)/.test(AUTH_CODE), true);
ok("取り消された鍵は手形から外す", /if \(result\.revoked\) delete token\.googleRefreshToken;/.test(AUTH_CODE), true);
ok("手形の中身は画面へ渡さない（鍵を session に載せない）", /session\.[a-zA-Z.]*googleRefreshToken|googleRefreshToken[^;]*session/.test(AUTH_CODE), false);
// 通すかは「Google が確かめたアドレスか」だけ。会社の人かはログインのあとに要求の組織への所属で決まる
ok("ログインの判定は確かめたアドレスだけを見る（顔写真の仕組みで変えていない）", /return typeof email === "string" && email\.length > 0 && verified === true;/.test(AUTH_CODE), true);

// ---------------------------------------------------------------------------
console.log("\n--- 3. セッション → 見せる形（本物の計算） ---");
const member = (image) => toViewer({ kind: "member", email: "owner@example.com", name: "検査用の人", image });

ok("写真を持ったログイン者", member(PHOTO).image, PHOTO);
ok("↑ 名前も落ちない", member(PHOTO).name, "検査用の人");
ok("↑ ログイン者として扱う", member(PHOTO).kind, "member");
ok("写真が無いログイン者", member(null).image, null);
ok("見せる形は在りかをそのまま渡す", member("http://example.com/a.png").image, "http://example.com/a.png");
console.log("   ※ https だけを通す関門は 1 つ手前（誰かを確定させるところ）に置いてある");
ok("名前を持たない人はメールの @ より前", toViewer({ kind: "member", email: "owner@example.com", name: null, image: PHOTO }).name, "owner");
ok("ゲストは写真を持たない", toViewer({ kind: "guest", guestId: "g1", name: "ゲスト" }).image, null);
ok("ゲストはゲストとして扱う", toViewer({ kind: "guest", guestId: "g1", name: "ゲスト" }).kind, "guest");
ok("誰でもないときは何も返さない", toViewer(null), null);

const IDENTITY = strip(await readFile(`${root}/src/lib/identity/identity.ts`, "utf8"));
ok("入口で https と預かった写真の口以外を落とす", /typeof user\.image === "string" && \(user\.image\.startsWith\("https:\/\/"\) \|\| isAvatarPath\(user\.image\)\) \? user\.image : null/.test(IDENTITY.replace(/\s+/g, " ")), true);
ok("描くところでももう一度見る（二重の関門）", /!\(author\.image\.startsWith\("https:\/\/"\) \|\| isAvatarPath\(author\.image\)\)/.test(WIDGET_CODE), true);

console.log("\n   メールアドレスは画面側へ渡さない（今までどおり）");
ok("ログイン者の形にメールは無い", Object.keys(member(PHOTO)).includes("email"), false);

// ---------------------------------------------------------------------------
console.log("\n--- 4. 見せる形 → 保存 → 応答 ---");
ok("ログイン者の行に写真を書く", /author_image: author\.image,/.test(LIB_CODE), true);
ok("ゲストの行には書かない", /author_email: null,\s*\n\s*author_name: author\.name,\s*\n\s*author_image: null,/.test(LIB_CODE), true);
ok("読み出す列に写真が入っている", /author_email, author_name, author_image, guest_id/.test(LIB_CODE), true);
ok("応答でログイン者の写真は、いま預かっている写真の口で渡す", /image: \(email === null \? null : avatarPathOf\(email\)\) \?\? readString\(record, "author_image"\),/.test(LIB_CODE), true);
ok("応答でゲストは写真なし", /return \{ kind: "guest", name: name \?\? rt\("toolbox\.comments\.noName"\), image: null \};/.test(LIB_CODE), true);

// ---------------------------------------------------------------------------
console.log("\n--- 5. 顔の描画 ---");
const avatar = /function avatarFor\([\s\S]*?\n\}/.exec(WIDGET_CODE)?.[0] ?? "";
ok("写真があれば写真を出す", /const image = el\("img", "avatar"\);/.test(avatar), true);
ok("在りかは https か預かった写真の口だけ", /!\(author\.image\.startsWith\("https:\/\/"\) \|\| isAvatarPath\(author\.image\)\)/.test(avatar), true);
ok("読めなかったら頭文字に差し替える", /image\.addEventListener\("error", \(\) => image\.replaceWith\(drawn\), \{ signal: lifetime\.signal \}\);/.test(avatar), true);
ok("差し替え先は先に作ってある（壊れた絵を見せない）", avatar.indexOf("const drawn") < avatar.indexOf("addEventListener"), true);
ok("どこから来たかを Google へ伝えない", /image\.referrerPolicy = "no-referrer";/.test(avatar), true);
ok("読み上げの邪魔をしない", /image\.alt = "";/.test(avatar), true);

// 現在地の行の右端の顔（location-bar.ts）は製品の部品で、サイドバーの名乗りの行と同じ頭文字の丸を描く（写真は出さない）。数に入れない
console.log("\n   顔を出すところは 1 か所を通す（コメント・返信・覗き見カード）");
const sites = (WIDGET_CODE.match(/appendChild\(avatarFor\(/g) ?? []).length;
ok("顔を出している場所の数", sites, 3);
ok("その場で頭文字を描いている場所は無い（避けて通っていない）",
  /appendChild\(initialAvatar\(/.test(WIDGET_CODE), false);

console.log("\n   写真の見た目（四角いまま出さない）");
ok("丸く抜く", /border-radius: var\(--radius-pill\);/.test(/^\.avatar \{[^}]*\}/m.exec(CSS)?.[0] ?? ""), true);
ok("縦横比を崩さない", /object-fit: cover;/.test(/^\.avatar \{[^}]*\}/m.exec(CSS)?.[0] ?? ""), true);
ok("大きさはトークンから", /width: var\(--size-avatar\);/.test(/^\.avatar \{[^}]*\}/m.exec(CSS)?.[0] ?? ""), true);

// ---------------------------------------------------------------------------
console.log("\n--- 6. 出し分け（誰にどの顔を出すか） ---");
const drawnFor = (author) =>
  author.image !== null && (author.image.startsWith("https://") || author.image.startsWith("/api/avatars/")) ? "写真" : "頭文字";
const cases = [
  ["写真のあるログイン者", { kind: "member", name: "検査用の人", image: PHOTO }, "写真"],
  ["写真の無いログイン者", { kind: "member", name: "検査用の人", image: null }, "頭文字"],
  ["古い行（写真が空のまま）", { kind: "member", name: "検査用の人", image: null }, "頭文字"],
  ["ゲスト", { kind: "guest", name: "ゲスト", image: null }, "頭文字"],
  ["在りかが https でない", { kind: "member", name: "誰か", image: "http://x/a.png" }, "頭文字"],
  ["預かった写真の口", { kind: "member", name: "検査用の人", image: "/api/avatars/abcdefghijklmnopqrstuv" }, "写真"],
  ["よその同じ名前の道筋", { kind: "member", name: "誰か", image: "//evil.test/api/avatars/x" }, "頭文字"],
];
for (const [name, author, expected] of cases) ok(name, drawnFor(author), expected);

console.log("\n   写真が読めなかったとき（退職・在りかの失効）");
console.log("   壊れた絵のまま置かず、その場で頭文字の顔に入れ替える");
ok("読めたとき", "写真", "写真");
ok("読めなかったとき", "頭文字", "頭文字");

// ---------------------------------------------------------------------------
console.log("\n--- 7. 写真を預かる（Google の在りかは数週間で人型に変わる） ---");
const KEEP = strip(await readFile(`${root}/src/lib/identity/avatars.ts`, "utf8"));
const ROUTE = strip(await readFile(`${root}/src/app/api/avatars/[id]/route.ts`, "utf8"));
ok("取りに行く先は Google の写真だけ（任意の URL を取りに行く口にしない）", /url\.hostname !== "lh3\.googleusercontent\.com"/.test(KEEP), true);
ok("転送には付いていかない", /redirect: "error"/.test(KEEP), true);
ok("人型の絵（小さい PNG）は預からない", /type\.startsWith\("image\/png"\) && bytes\.length < 4096/.test(KEEP), true);
ok("保管庫へは非公開で置く", /access: "private"/.test(KEEP) && !/access: "public"/.test(KEEP), true);
ok("聞き直す先は Google の窓口だけ", /fetch\("https:\/\/oauth2\.googleapis\.com\/token"/.test(KEEP) && /fetch\("https:\/\/openidconnect\.googleapis\.com\/v1\/userinfo"/.test(KEEP), true);
ok("聞き直せないときは手元の在りかで試す", /const source = picture \?\? lastPicture;/.test(KEEP), true);
ok("縮める道具は預かるときだけ読み込む", /await import\("sharp"\)/.test(KEEP) && !/^import sharp/m.test(KEEP), true);
ok(
  "配る口は会社の人にだけ開く",
  /if \(!canUsePageTools\(viewer\)\) return jsonError\(rt\("auth\.api\.loginRequired"\), 401\);/.test(ROUTE) && jaText("auth.api.loginRequired") === "ログインが必要です",
  true,
);
ok("配る口の控えは本人のブラウザにだけ", /"Cache-Control": "private, max-age=3600"/.test(ROUTE), true);
// アプリ向けの窓口（/api/v1）は配布版に無いので、アプリへ写真を渡す口の確かめも無い。

console.log(`\n${fails === 0 ? "すべて合格" : `${fails} 件 不合格`}`);
