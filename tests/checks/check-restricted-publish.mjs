/**
 * 投稿時の「選んだ人だけ」（restricted）とグループ許可が、安全側に組めているかを確かめる。
 *
 * この機能の一線は 3 つ。
 *   1. **既定を変えない** — restricted は付けたときだけ効く追加の指定で、
 *      付けない投稿の挙動は 1 ミリも変わらない
 *   2. **すでにあるページの見せ方を投稿で切り替えない** — 「全員に見せていたページが
 *      投稿で閉じる」「制限したはずが投稿で開く」のどちらの静かな事故も作らない
 *   3. **転ぶなら閉じる側に** — ページを restricted で作ってから名簿に足す。
 *      途中で失敗しても「見え過ぎる」方向には倒れない
 *
 * 保管庫が無くても見られる範囲なので、書いてあるコードを読んで確かめる
 * （check-publish-token の 5 節と同じ流儀）。
 */
import { readFile } from "node:fs/promises";
import { root } from "./paths.mjs";

let fails = 0;
const ok = (label, actual, expected) => {
  const pass = String(actual) === String(expected);
  if (!pass) fails += 1;
  console.log(`${pass ? "OK  " : "NG  "} ${label}: ${actual}（期待: ${expected}）`);
};

/** 説明書き（コメント）は外して読む。説明の文言をコードの証拠として拾わないため。 */
const codeOnly = (text) =>
  text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");

const route = codeOnly(await readFile(`${root}/src/app/api/pages/route.ts`, "utf8"));
const store = codeOnly(await readFile(`${root}/src/lib/pages/store.ts`, "utf8"));
const cli = codeOnly(await readFile(`${root}/bin/pages-publish.mjs`, "utf8"));
// 断り文は辞書にある（src/lib/i18n/messages/ja/server.ts）。入口がその鍵で引き、日本語の正本がその言い方であることを見る
const serverJa = await readFile(`${root}/src/lib/i18n/messages/ja/server.ts`, "utf8");
const says = (key, phrase) =>
  route.includes(`rt("${key}"`) && new RegExp(`\\b${key.split(".").pop()}:\\s*"[^"]*${phrase}`).test(serverJa);

// ---------------------------------------------------------------------------
console.log("--- 1. 入口（投稿 API）の受け付け ---");
ok("restricted は真偽値しか受けない", /typeof restrictedValue !== "boolean"/.test(route), true);
ok(
  "グループだけの指定は断る（絞ったつもりの事故を作らない）",
  says("server.publish.groupsNeedRestricted", "「選んだ人だけ」（restricted: true）と一緒に指定してください"),
  true,
);
ok(
  "門なし公開に「選んだ人だけ」は付けられない",
  says("server.publish.publicCannotRestrict", "門なし公開のページに「選んだ人だけ」は指定できません"),
  true,
);
ok("グループ名の空白は作る画面と同じ形に揃える", /entry\.replace\(\/\\s\+\/g, " "\)\.trim\(\)/.test(route), true);
ok("見つからないグループは、どれが無いかまで言って断る", says("server.publish.missingGroups", "「\\{names\\}」が見つかりません。管理画面で作ってから投稿してください") && /names: missing\.join\(/.test(route), true);

// ---------------------------------------------------------------------------
console.log("\n--- 2. 順序（解決 → 積む → 名簿） ---");
const resolveAt = route.indexOf("await listGroups(organization)");
const commitAt = route.indexOf("await commitRevision(");
const grantAt = route.indexOf("await grantToGroup(");
ok("グループの解決は、版を積む前", resolveAt !== -1 && commitAt !== -1 && resolveAt < commitAt, true);
ok("名簿への足し込みは、版を積んだあと", grantAt !== -1 && commitAt < grantAt, true);
ok("名簿の失敗は打ち直しで直ると言って返す", says("server.publish.grantFailed", "同じ内容をもう一度投稿すると、許可だけやり直せます"), true);
ok("投稿の入口から個人あての許可は作らない（グループのみ）", route.includes("grantToMember"), false);
ok("既存ページとの食い違いは 400 で返す", /RestrictedExistingPageError\) return jsonError\(localizedMessage\(error, t\), 400\)/.test(route), true);

// ---------------------------------------------------------------------------
console.log("\n--- 3. 台帳（見せ方を書き換えない） ---");
ok(
  "restricted が効くのはページを作るときだけ",
  /input\.restricted === true[\s\S]{0,100}\? "restricted" : parts\.slugPrefix/.test(store),
  true,
);
ok(
  "すでにあるページが restricted でなければ断る",
  /existing\.visibility !== "restricted"[\s\S]{0,80}RestrictedExistingPageError/.test(store),
  true,
);
const pointBlock = /async function pointPageAt[\s\S]*?\.update\(\{[\s\S]*?\}\)/.exec(store)?.[0] ?? "";
ok("上書き投稿の更新に見せ方の列が入っていない", /visibility/.test(pointBlock), false);
ok("消した印の復活はある（従来どおり）", /deleted_at:\s*null/.test(pointBlock), true);

// ---------------------------------------------------------------------------
console.log("\n--- 4. 手元の道具（間違った組み合わせを送る前に止める） ---");
ok("--restricted と --public は同時に使えない", /--restricted と --public は同時に使えません/.test(cli), true);
ok("--grant-group 単独は断る", /--grant-group は --restricted と一緒に指定してください/.test(cli), true);
ok("--restricted と --delete は同時に使えない", /--restricted は --delete と一緒には使えません/.test(cli), true);
ok(
  "付けたときだけ送る（付けなければ従来と同じ通信）",
  /\.\.\.\(options\.restricted \? \{ restricted: true \} : \{\}\)/.test(cli),
  true,
);
ok("投稿後に「いま誰が見られるか」を言い切る", /見られる人: あなた/.test(cli), true);

console.log(`\n${fails === 0 ? "すべて合格" : `${fails} 件 不合格`}`);
if (fails > 0) process.exit(1);
