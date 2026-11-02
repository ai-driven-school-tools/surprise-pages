/**
 * 「ログインしているパソコン」の画面が、見るだけ・ログアウトさせるだけの画面かを、
 * 書いてあるコードで確かめる。
 *
 * この画面には、後から直せない失敗が 2 つある。
 *   1. 名乗りの中身が手元（記録・cookie・道筋）に残る … 保管庫を覗ける人が全員ぶんを持ち出せる
 *   2. 画面から名乗りを増やせてしまう                 … 人が値を写して貼る手順が復活する
 * どちらも画面を開いただけでは気づけないので、ここで文字として見張る。
 *
 * 加えて、使う人の目に「トークン」という言葉が出ないことも見る。仕組みの名前が
 * 表に出ていると、使う人は「自分が管理する持ち物」だと思い込んでしまう。
 *
 * 保管庫にもネットワークにも繋がない。読むのは src/app/devices の 2 枚と、
 * 画面をまたいで使い回している部品（src/app/_components）だけ。
 */
import { readdir, readFile } from "node:fs/promises";
import { jaText, withJaText } from "./i18n-ja-text.mjs";

import { root } from "./paths.mjs";

const DIR = `${root}/src/app/devices`;
/** 画面をまたいで使い回す部品の置き場（送信ボタンはここにある）。 */
const SHARED = `${root}/src/app/_components`;

let fails = 0;
const ok = (label, actual, expected) => {
  const pass = String(actual) === String(expected);
  if (!pass) fails += 1;
  console.log(`${pass ? "OK  " : "NG  "} ${label}: ${actual}（期待: ${expected}）`);
};

/**
 * 説明書き（コメント）は外して読む。
 * 「ここには名乗りの中身を出さない」と書いた説明そのものを、
 * 見つけてはいけない文字として拾ってしまうため。
 */
const codeOnly = (text) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");

/**
 * 画面に出る文字は、行の折り返しで途中に改行と字下げが入る。
 * JSX と同じように、行ごとに前後の空白を落として 1 つの空白で継ぐ。
 */
const flatten = (text) =>
  text
    .split("\n")
    .map((line) => line.trim())
    .join(" ")
    .replace(/ {2,}/g, " ");

const read = async (name) => codeOnly(await readFile(`${DIR}/${name}`, "utf8"));

const page = await read("page.tsx");
const actions = await read("actions.ts");
const button = codeOnly(await readFile(`${SHARED}/submit-button.tsx`, "utf8"));
/** 見た目の語彙（画面をまたいで 1 つ）。取り消しの赤もここが正本。 */
const styles = codeOnly(await readFile(`${SHARED}/styles.ts`, "utf8"));
const all = [page, actions, button].join("\n");
/** コマンドを並べる節。値ではなくコマンドを扱うので、別に読む。 */
const addDevice = await read("add-device.tsx");
/** 「そのまま貼る 1 行」の共通部品（画面をまたいで 1 つ）。コピーの作りはここが正本。 */
const copyRow = codeOnly(await readFile(`${SHARED}/copy-row.tsx`, "utf8"));
// 文言は辞書（src/lib/i18n/messages/ja/auth.ts）へ移した。鍵を日本語の正本の値に置き換えた写しで、画面に出る字そのものを見る
const words = flatten(withJaText([all, addDevice, copyRow].join("\n")));
const pageText = withJaText(page);

// ---------------------------------------------------------------------------
console.log("--- 1. 名乗りの中身は、この画面のどこにも出てこない ---");
ok("画面から増やす入口が無い（発行）", /issueToken|issueAction|IssueState/.test(all), false);
ok("発行の板そのものが無い", /IssuePanel/.test(all), false);
ok("覚え書きの打ち込み口が無い", /<input(?![^>]*type="hidden")/.test(page), false);
ok("上限の受け渡しも要らなくなった", /TOKEN_LABEL_MAX_LENGTH/.test(all), false);
ok("中身を持つ変数を描いていない", /\{\s*(token|secret)\s*\}/.test(all), false);
ok("手元へ写す道具を使っていない", /clipboard/.test(all), false);
ok("cookie に入れていない", /cookies\(/.test(all), false);
ok("cookie の道具を持ち込んでいない", all.includes("next/headers"), false);
ok("記録（console）に出していない", /console\./.test(all), false);
ok("自分の入口を叩き直していない", /fetch\(/.test(all), false);
ok("できる操作は 1 つだけ", (actions.match(/^export async function/gm) ?? []).length, 1);
ok("その 1 つはログアウト", /export async function logOutAction/.test(actions), true);
ok("覚え書きを書き換える口も無い", /tidyLabel/.test(all), false);
ok("行を消す操作を持ち込んでいない", /delete|remove/i.test(all), false);
ok("実行係は結果を返さず道筋で伝える", /Promise<void>/.test(actions), true);
ok("手元で動く状態を持ち込んでいない", /useState|useActionState/.test(all), false);

const redirects = actions.match(/redirect\([^)]*\)/g) ?? [];
console.log(`      送り先: ${redirects.join(" / ")}`);
ok("送り先は 3 つ（未ログイン・止めた・止められなかった）", redirects.length >= 3, true);
ok("送り先に名乗りの中身を混ぜていない", /redirect\([^)]*\$\{[^}]*token[^}]*\}/.test(actions), false);
const targets = redirects.flatMap((call) => call.match(/["'`][^"'`]*["'`]/g) ?? []);
ok("書いてある送り先を数える", targets.length >= 3, true);
ok("送り先はこのサイトの中だけ", targets.every((target) => target.slice(1).startsWith("/")), true);

// ---------------------------------------------------------------------------
console.log("\n--- 2. 一覧に出さないもの（型・ハッシュ・id）---");
ok("型（token_hash）が出てこない", all.includes("token_hash"), false);
ok("ハッシュを触っていない", /hash/i.test(all), false);
// 印（key）・隠し値・道筋の中（${…}）以外で id が出てきたら、それは画面に字として出ている
ok("id を字として出していない", /[^=$]\{computer\.id\}/.test(page), false);
ok("id はログアウトのフォームの隠し値だけ", /type="hidden" name="id"/.test(page), true);
ok("一覧に出すのは名前と日時", /displayName\((?:words\.)?t, computer\)/.test(page) && /summaryLine\(words, computer\)/.test(page), true);
ok("一覧はサーバーで取り直す", /await listTokens\(organization, viewer\.email\)/.test(page), true);
ok("一覧は毎回作り直す", /export const dynamic = "force-dynamic"/.test(page), true);
ok("メールアドレスを一覧に出していない", /viewer\.email\}/.test(page), false);
ok("ログイン中は「止めた印」が無いものだけ", /one\.revokedAt === null/.test(page), true);
ok("ログアウト済みは別の節に分ける", /one\.revokedAt !== null/.test(page), true);
ok("読めなかったときは空の一覧として扱う", /computers = null/.test(page), true);

// ---------------------------------------------------------------------------
console.log("\n--- 3. 会社の人しか入れない ---");
ok("ページは会社の人以外を送り返す", /if \(!isMember\(viewer\)\) redirect\("\/signin\?next=\/devices"\)/.test(page), true);
ok("送り返す先は元の画面つき", /const SIGN_IN = "\/signin\?next=\/devices"/.test(actions), true);
ok("ログアウトも同じ関で見る", (actions.match(/if \(!isMember\(viewer\)\) redirect\(SIGN_IN\)/g) ?? []).length, 1);
ok("持ち主は名乗りから取る（画面から受け取らない）", /await currentBrowserIdentity\(\)/.test(page) && /await currentBrowserIdentity\(\)/.test(actions), true);
ok("ログアウトできるのは自分のものだけ", /revokeToken\(organization, id, viewer\.email\)/.test(actions), true);
ok("相手は形を確かめてから", /isTokenId\(id\)/.test(actions), true);
ok("実行係はサーバー側の宣言から始まる", /^"use server";$/m.test(await readFile(`${DIR}/actions.ts`, "utf8")), true);

// ---------------------------------------------------------------------------
console.log("\n--- 4. 決まった文言（「トークン」を出さない）---");
ok("画面の文字に「トークン」が出てこない", words.includes("トークン"), false);
ok("言い換えの発明もしていない（鍵・合言葉・キー）", /投稿の鍵|合言葉|投稿キー|合鍵/.test(words), false);
ok("「発行」という出来事が残っていない", /発行/.test(words), false);
ok("値を写して貼る手順の名残が無い", /貼り付け|PAGES_TOKEN|zshrc/.test(words), false);
ok("「止める」ではなく「ログアウト」で通す", /を止める|止めたもの|使えるもの/.test(words), false);
const phrases = [
  "ログイン中のデバイス",
  "ここに並ぶデバイスから投稿できます。",
  "デバイスを追加する",
  "追加したいデバイスのターミナルで実行します。どのフォルダでも動きます。",
  "パソコンから",
  "クラウド環境から",
  "コピー",
  "コピーしました",
  "ログイン中",
  "ログアウト済み",
  "ログアウト",
  "ログアウト中…",
  "キャンセル",
  "をログアウトしますか。",
  "ここからは投稿できなくなります（再ログインで戻せます）。",
  // 個人配布版はアプリの鍵（iOS）を外したので、種類と利用の文言は無い
  "ここに並ぶデバイスから投稿できます。",
  // アプリの鍵は 30 日で切れる。切れたものは使えないので、ログアウト済みの節に並べる
  "期限切れ",
  "をログアウトしました。",
  "をログアウトする",
  "まだありません。",
  "上のコマンドを実行すると表示されます。",
  "不明なデバイス",
  "ログイン",
  "ログアウト",
  "投稿なし",
  "最終投稿",
  "ログアウトできませんでした。再読み込みしてもう一度お試しください。",
  "一覧を読み込めませんでした。再読み込みしてください。",
];
for (const phrase of phrases) {
  ok(`そのまま書いてある: ${phrase.length > 24 ? `${phrase.slice(0, 24)}…` : phrase}`, words.includes(phrase), true);
}

// ---------------------------------------------------------------------------
console.log("\n--- 5. 見た目の決まり ---");
ok("絵文字を使っていない", /\p{Extended_Pictographic}/u.test(all), false);
ok("等幅で見せる持ち出し物が無い", /font-mono/.test(page), false);
ok("折り返して読ませる長い値も無い", /break-all/.test(page), false);
ok("面（塗り）を足していない", /rounded-md bg-neutral-50|bg-neutral-100/.test(page), false);
ok("塗りの主要ボタンを置いていない", /bg-neutral-900 px-4 py-2\.5|ws-primary|\bPRIMARY\b/.test(all), false);
ok("取り消す操作は赤い文字（塗りではない）", /text-red-700 transition-colors hover:text-red-900/.test(styles) && page.includes("DANGER"), true);
console.log("      ※ 下線は引かない。押せることは濃さの変化で示す（下線は赤入れの記号に予約してある）");
ok("赤い文字に下線を足していない", /underline/.test(styles), false);
ok("ログアウト済みを色や打ち消しで区別していない", /line-through/.test(page), false);
ok("見た目の語彙は共通のものから取る", /from "\.\.\/_components\/styles"/.test(page), true);
ok("節の見出しは共通の語彙", (page.match(/className=\{SECTION_HEADING\}/g) ?? []).length, 2);
ok("一覧の区切り線も共通の語彙", (page.match(/className=\{LIST\}/g) ?? []).length, 2);
ok("独自の余白・字の大きさを発明していない", /(p|m|text)-\[\d/.test(page), false);
ok(
  "ログアウトのボタンに相手の名前が入る",
  [/ label=\{t\("auth\.devices\.logoutLabel", \{ name \}\)\}/.test(page), jaText("auth.devices.logoutLabel")],
  [true, "「{name}」をログアウトする"],
);
ok("行のリンクにも相手の名前が入る", /aria-label=\{t\("auth\.devices\.logoutLabel", \{ name: displayName\(t, computer\) \}\)\}/.test(page), true);
ok("確認の文に行き先の目印がある", /id="confirm" tabIndex=\{-1\}/.test(page), true);
ok("確認は 2 段階（先に道筋を変える）", /href=\{`\/devices\?confirm=\$\{computer\.id\}#confirm`\}/.test(page), true);
ok("やめる で元の一覧へ戻れる", /href="\/devices"/.test(page), true);
ok("画面の中の移動は Link で", /from "next\/link"/.test(page), true);
ok("行に hover の背景を足していない", /hover:bg-/.test(page), false);
ok("外枠は共通の語彙", /className=\{PAGE\}/.test(page), true);
ok("知らせは 1 行の文（帯を作らない）", (page.match(/className=\{ALERT\}|\$\{ALERT\}/g) ?? []).length, 2);

const heading = pageText.indexOf('<PageHeader title={"ログイン中のデバイス"}');
const addSection = pageText.indexOf("<AddDevice />");
const liveHeading = pageText.indexOf('>{"ログイン中"}</h2>');
const deadHeading = pageText.indexOf('>{"ログアウト済み"}</h2>');
ok(
  "見出し → 追加のしかた → ログイン中 → ログアウト済み の順",
  heading >= 0 && heading < addSection && addSection < liveHeading && liveHeading < deadHeading,
  true,
);

// ---------------------------------------------------------------------------
console.log("\n--- 5.5 コマンドは貼れる形で出す（値は出さない）---");
/**
 * ここで扱うのは**コマンドだけ**。名乗り（投稿に使う値）を等幅で見せたり
 * コピーさせたりすると、人が値を写して貼る手順が復活する。
 */
ok("コピーするのはコマンド", /value=\{one\.command\}/.test(addDevice), true);
/*
  値そのものをこの節に持ち込まない。案内文で貼り先の名前（Secrets）に触れるのは
  よいが、値を等幅で出したりコピーさせたりする形が復活したら不合格にする。
*/
ok("値を写す行を作っていない", /value=\{[^}]*(secret|token)/i.test(addDevice), false);
ok("値を字として描いていない", /\{[^}]*(secret|token)[^}]*\}<\/code>/i.test(addDevice), false);
ok("共通の部品でそのまま貼る 1 行を出す", /<CopyRow/.test(addDevice), true);
ok("等幅と面は語彙から取る（発明しない）", /font-mono|bg-neutral-/.test(addDevice), false);
ok("共通部品は語彙の CODE を使う", /\$\{CODE\}/.test(copyRow), true);
ok("クリップボードへ入れるのは渡された値", /writeClipboardText\(value\)/.test(copyRow), true);
ok("伏せ字を渡せる（値を出さない行のため）", /const shown = display \?\? value;/.test(copyRow), true);
ok("画面に描くのは伏せ字のほう", /\{shown\}<\/code>/.test(copyRow), true);
ok("一覧側は等幅を使っていない", /font-mono|<code /.test(page), false);
ok("配布物のフォルダで打つ形で書く（README の第 11 章と同じ）", addDevice.includes("node bin/pages-publish.mjs"), true);
ok("出すのは 3 つ（手元・クラウド・クラウドのぶんをここで作る）", (addDevice.match(/where: "/g) ?? []).length, 3);
ok("3 つめは別の席のぶんを作る指定", addDevice.includes("login --remote --new"), true);
ok("共有の置き場に入れないよう言う", withJaText(addDevice).includes("共有の Secrets には入れないでください"), true);
ok("クラウド用には --remote が付く", /login --remote/.test(addDevice), true);
ok("押せるかどうかで描き分けない（食い違いを作らない）", /typeof navigator/.test(copyRow), false);
ok("写せなかったときの逃げ道がある", /t\("common\.copyFailed"\)/.test(copyRow) && (await readFile(`${root}/src/lib/i18n/messages/ja/common.ts`, "utf8")).includes("上の行を選んでコピーしてください。"), true);
ok("見た目の語彙は共通のものから取る（追加の節も）", /from "\.\.\/_components\/styles"/.test(addDevice), true);
ok("独自の余白・字の大きさを発明していない（追加の節も）", /(p|m|text)-\[\d/.test(addDevice), false);
ok("塗りのボタンにしていない（控えめな文字）", /PRIMARY/.test(addDevice + copyRow), false);

// ---------------------------------------------------------------------------
console.log("\n--- 6. 画面の部品の数 ---");
const clients = [];
for (const [from, label] of [[DIR, "src/app/devices"], [SHARED, "src/app/_components"]]) {
  for (const name of (await readdir(from)).filter((one) => /\.tsx?$/.test(one)).sort()) {
    const text = await readFile(`${from}/${name}`, "utf8");
    if (/^["']use client["'];?$/m.test(text)) clients.push(name);
    if (from === DIR) console.log(`      置いてあるもの（${label}）: ${name}`);
  }
}
console.log(`      手元で動く部品: ${clients.join(" / ")}`);
ok("共通画面枠を含む4枚", (await readdir(DIR)).filter((one) => /\.tsx?$/.test(one)).length, 4);
ok("発行の板は残っていない", (await readdir(DIR)).includes("issue-panel.tsx"), false);
// キーボードの近道の 2 つ（shortcut-provider・shortcuts）は台帳のキーと操作の結び付けだけで、鍵の中身は持たない。
// 言語の受け口（i18n）は選んだ言語の辞書（画面の文言）だけを、戻る先のリンク（back-link）は道筋と名前だけを持つ
ok("共通操作部品を含む10個", clients.length, 10);
ok("共通部品と送信・コピー・キーボードの近道・言語の部品", clients.sort().join(","), "back-link.tsx,controls.tsx,copy-row.tsx,i18n.tsx,shortcut-provider.tsx,shortcuts.tsx,submit-button.tsx,window-history.tsx,workspace-list.tsx,workspace-shell.tsx");
ok("送信ボタンは囲みのフォームから待ちを受け取る", /useFormStatus\(\)/.test(button), true);
ok("送信ボタンは押している間ふさがる", /disabled=\{pending\}/.test(button), true);
ok("送信ボタンを使うのはログアウトの 1 か所", (page.match(/<SubmitButton/g) ?? []).length, 1);

console.log(`\n${fails === 0 ? "すべて合格" : `${fails} 件 不合格`}`);
