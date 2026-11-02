import { readWidgetSource } from "./widget-source.mjs";
import { databaseStub } from "./paths.mjs";
/**
 * 「見たページとコメント」（/activity）の決まりを確かめる。
 *
 * 見るのは 12 点。
 *   1. ログイン画面へ飛ばしていない（名乗っていない人でも開ける）
 *   2. 「履歴」という語をこの画面が使っていない（版の一覧が先に使っている）
 *   3. 節が 2 つとも説明の 1 行を持っている
 *   4. 行の右端の操作は 1 つだけ／右端に日時が無い／日時は 2 行目にある
 *   5. 相対表記（〜分前）の部品を使っていない
 *   6. 消すは 2 段階（常時出るのは控えめな灰で、赤は確認したあとだけ）
 *   7. 読み上げ用の名前に対象名が入っている
 *   8. 空の案内と読み込み失敗が別の文になっている
 *   9. 控えの計算の総当たり（201 件目で 1 件落ちる・同じページは 1 行・最後に見た順）
 *  10. ウィジェットは同じタブで 1 回しか控えない
 *  11. ログイン中はブラウザの中に書かない
 *  12. 書いたコメントの節（見たページと同じ絞り込み・ゲストも出る・消す導線は無い）
 *
 * 計算そのものは src/lib/revisions/viewed-pages.ts の素の関数を**そのまま呼んで**確かめ、
 * 書き込みは本体を丸ごと jsdom に載せて、実際にページを開いて確かめる。
 * 保管庫にもネットワークにも繋がない。
 */
import { readdir, readFile, writeFile } from "node:fs/promises";

import { root, dir } from "./paths.mjs";
const { build } = await import(`${root}/node_modules/esbuild/lib/main.js`);

let fails = 0;
const ok = (label, actual, expected) => {
  const pass = String(actual) === String(expected);
  if (!pass) fails += 1;
  console.log(`${pass ? "OK  " : "NG  "} ${label}: ${actual}（期待: ${expected}）`);
};

/** 注記を落として、実際に動くところだけを見る。 */
const strip = (text) =>
  text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/^\s*\/\/.*$/gm, "");
const read = async (path) => strip(await readFile(`${root}/${path}`, "utf8"));

const SCREEN = await read("src/app/(workspace)/(screens)/activity/page.tsx");
const SECTION = await read("src/app/activity/viewed-pages.tsx");
/** 2 つめの節（書いたコメント）。 */
const NOTES = await read("src/app/activity/my-comments.tsx");
/** タブ（節の名前を言う部品）と、消す前の確認の共通部品。 */
const TABS = await read("src/app/activity/activity-tabs.tsx");
const CONTROLS = await read("src/app/_components/controls.tsx");
const STORE = await read("src/lib/revisions/viewed-pages.ts");
/** 書いたコメントを引く読み口の置き場。 */
const READER = await read("src/lib/comments/comments.ts");
const WIDGET = await readWidgetSource();
const LIST = await read("src/widget/comments/comment-list.ts");
const STYLES = await read("src/app/_components/styles.ts");
// 画面の文言は辞書にある（docs/guides/i18n.md）。画面のファイルが鍵を引き、辞書が日本語の正本を持つことを両方見る
const ACTIVITY = await read("src/lib/i18n/messages/ja/activity.ts");
const WORKSPACE_JA = await read("src/lib/i18n/messages/ja/workspace.ts");
const COMMON_JA = await read("src/lib/i18n/messages/ja/common.ts");
const FORMAT = await read("src/lib/i18n/format.ts");

/** 名前で関数・部品の中身を切り出す（引数の並びを読み飛ばしてから、波かっこを数える）。 */
function chunk(code, name) {
  const at = code.indexOf(`function ${name}(`);
  if (at < 0) return "";
  let cursor = code.indexOf("(", at);
  let paren = 0;
  for (; cursor < code.length; cursor += 1) {
    if (code[cursor] === "(") paren += 1;
    if (code[cursor] === ")") {
      paren -= 1;
      if (paren === 0) break;
    }
  }
  const open = code.indexOf("{", cursor);
  let depth = 0;
  for (let i = open; i < code.length; i += 1) {
    if (code[i] === "{") depth += 1;
    if (code[i] === "}") {
      depth -= 1;
      if (depth === 0) return code.slice(open, i + 1);
    }
  }
  return "";
}

const count = (code, re) => (code.match(re) ?? []).length;
/** 最初の組織（最初の組織）。組織に属する表は組織で絞った口から触る */
const ORG = Object.freeze({ id: "00000000-0000-4000-8000-000000000001", assetPrefix: "" });

// ---------------------------------------------------------------------------
console.log("--- 1. 名乗っていない人でも開ける ---");
console.log("   ここに並ぶのは、名乗っていない人ならブラウザの中の分だけ。身分照会を挟まない");

/** 画面ファイル 3 枚（外枠と、2 つの節）をまとめて見る。 */
const both = `${SCREEN}${SECTION}${NOTES}`;
ok("ログイン画面へ飛ばしていない", /redirect\(/.test(both), false);
ok("ログイン画面の道筋を持っていない", /signin/.test(both), false);
ok("会社の人かを聞いていない", /isMember\(/.test(both), false);
console.log("      ※ 名乗りは引く。ただし「アカウントに残っている分があるか」を見るためだけで、扉は閉めない");
ok("名乗りを引いている", /await (?:currentIdentity\(\)|Promise\.all\(\[currentIdentity\(\), serverTranslate\(\)\]\))/.test(SCREEN), true);
ok(
  "入口の数（外枠と節 2 つ、消す口 1 枚）",
  (await readdir(`${root}/src/app/activity`)).sort().join(" / "),
  "actions.ts / activity-tabs.tsx / my-comments.tsx / viewed-pages.tsx",
);

console.log("\n   下描き（読み込み中の骨組み）を作っていない");
console.log("      ※ 下描きに片方を載せて後からもう片方を混ぜると、必ず 2 回描かれる");
ok("入れ子の待ちの表示を置いていない（待ちは画面の枠の 1 つだけ。入れ子だと遅い応答のあとにもう 300ms 待たせる）", /<Suspense/.test(both), false);
ok("下描きの画面も置いていない", (await readdir(`${root}/src/app/activity`)).includes("loading.tsx"), false);
ok("読み終わるまでは何も描かない", /if \(local\.rows === null\) return null;/.test(SECTION), true);
ok("混ぜてから 1 回で描く", /const rows = mergeViewed\(server, local\.rows\);/.test(SECTION), true);

console.log("\n   並べるのは「渡された行」だけ（自分でページを引かない）");
ok("受け取るのは行の配列と、止めているかの旗", /server: readonly AccountViewedPage\[\];[\s\S]*?optedOut: boolean;/.test(SECTION), true);
ok("自分で取りに行かない", /fetch\(/.test(SECTION), false);
ok("台帳を引く口を持ち込んでいない", /listViewablePages|listAlivePages|findPage/.test(both), false);
console.log("\n   アカウントに残る分は、見える行を先に確定させてから引く（絞り込みを画面に書かせない）");
ok("見える行を先に確定させている", /visiblePagesFor\(organization, viewer\)/.test(SCREEN), true);
console.log("      ※ 「残さない」の設定は、見える行を待たずに同時に取りに行く（材料が別なので縦に並べない）");
ok("2 本を同時に投げている", /await Promise\.all\(\[visiblePagesFor\(organization, viewer\), viewOptedOut\(organization, viewer\)\]\)/.test(SCREEN), true);
console.log("      ※ 2 つの節の中身は、どちらもその行が決まってからでないと引けない。まとめて 1 束で投げる");
ok("読む口にはその行を渡す", /const \[server, comments\] = await Promise\.all\(\[\s*listViewedPages\(organization, viewer, visible\),/.test(SCREEN), true);
ok("コメントの読む口にも同じ行を渡す", /listMyComments\(organization, viewer, visible\)/.test(SCREEN), true);
ok("渡す先は節の部品", /<ViewedPages server=\{server\} optedOut=\{optedOut\} retentionDays=\{VIEW_RETENTION_DAYS\} \/>/.test(SCREEN), true);
ok("コメントの節にも値として渡す", /<MyComments rows=\{comments\} \/>/.test(SCREEN), true);
ok("見せ方を読んでいない（呼び名の頭で判断しない）", /\.visibility/.test(both), false);

// ---------------------------------------------------------------------------
console.log("\n--- 2. 言葉づかい ---");
ok("画面の名前", /<PageHeader title=\{t\("workspace\.places\.activity"\)\} \/>/.test(SCREEN) && /activity: "自分の活動"/.test(WORKSPACE_JA), true);
console.log("   「履歴」は版の一覧が先に使っている。同じ語で 2 つのものを指さない");
ok("「履歴」を使っていない", /履歴/.test(both), false);
console.log("   日付の札（きょう / きのう）も作らない。全画面が絶対表記でそろっている");
for (const word of ["きょう", "きのう", "今日", "昨日"]) {
  ok(`  「${word}」を使っていない`, new RegExp(word).test(both), false);
}

// ---------------------------------------------------------------------------
console.log("\n--- 3. 節が 2 つとも説明の 1 行を持っている ---");
console.log("   見出しは名前しか言えない。何のための節かは、その下の 1 行が言う");
console.log("      ※ 片方に無いと、同じ形の節が違う詰まり方をする（SECTION_NOTE が余白を持っている）");
const heading = SCREEN.indexOf("<h2 className={SECTION_HEADING}>見たページ</h2>");
console.log("      ※ タブの名前がそのまま節の名前。下に見出しと説明を重ねると、同じ名前を 2 度読ませることになる");
ok("画面に見出しを重ねていない（節の名前はタブが言う）", /<h2/.test(SCREEN), false);
const afterHeading = SCREEN.slice(heading);
ok("見たページの節をタブへ渡す", /views=\{<ViewedPages /.test(SCREEN), true);
const commentHeading = SCREEN.indexOf("<h2 className={SECTION_HEADING}>書いたコメント</h2>");
ok("コメントの節もタブへ渡す", /comments=\{<MyComments /.test(SCREEN), true);
ok("タブは 2 つ", count(TABS, /className="ws-tab"/g), 2);
ok("タブの名前は節の中身と同じ言葉（見たページ・書いたコメント）", /t\("activity\.tabs\.viewed"\)[\s\S]*t\("activity\.tabs\.comments"\)/.test(TABS) && /viewed: "見たページ",\s*comments: "書いたコメント"/.test(ACTIVITY), true);
ok("常設の説明文を置いていない（画面の名前にも、節にも）", count(SCREEN, /SECTION_NOTE/g), 0);
console.log("      ※ コメントの説明は、この節に無い操作（消す）がどこにあるかを言う");
ok("コメントの行は、消せる場所（そのコメントの位置）へ連れて行く", /#c=\$\{row\.id\}/.test(NOTES), true);
console.log("      ※ 「◯ 日より前は消えています」と言い切れるのは、掃除の仕組みがある段から");
ok("日数の一文がある（件数の横に 1 度だけ）", count(SECTION, /t\("activity\.viewed\.summary"/g) === 1 && /日で消えます/.test(ACTIVITY), true);
ok("日数を書き写していない（掃除と同じ出どころを読む）", /\{VIEW_RETENTION_DAYS\}/.test(SCREEN), true);
ok("ブラウザの中の分は、その行の印に添えて断る", /t\("activity\.viewed\.localOnlyHint"\)/.test(SECTION) && /localOnlyHint: "ブラウザの設定で、早く消えることがあります"/.test(ACTIVITY), true);

// ---------------------------------------------------------------------------
console.log("\n--- 4. 行の形 ---");
const row = chunk(SECTION, "Row");
ok("行を切り出せている", row.length > 0, true);
ok("右端の操作は 1 つだけ", count(row, /<IconButton/g), 1);
ok("その操作はごみ箱の絵（字にしない・赤にしない）", /icon="delete"/.test(row) && !/danger|DANGER/.test(row), true);
ok("行の題は押せる（資料の一覧と同じ部品）", /<a href=\{row\.href\} className="ws-row-title">/.test(row), true);
ok("1 行目に出すのは題だけ", /\{row\.title\}/.test(row), true);
console.log("      ※ 消す入口はどの行にも出す（ブラウザの中の行にも、アカウントの行にも）。");
console.log("        出どころで押せる行と押せない行に割れていると、なぜこの行だけ消せないのかを説明できない");
ok("入口を出どころで出し分けていない", /\{row\.localOnly \? \(\s*<button/.test(row), false);
ok("入口はどの行にもある", /<IconButton\s+icon="delete"[\s\S]*?onClick=\{onAsk\}/.test(row), true);

console.log("\n   日時は 2 行目（右端には置かない）");
const meta = row.indexOf("${META}");
const button = row.indexOf("<IconButton");
ok("行は資料の一覧と同じ 1 行（ws-row）", /className="ws-row ws-row-activity"/.test(row), true);
ok("日時は 2 行目の中にある", meta < row.indexOf("stamp(locale, row.lastViewedAt)"), true);
ok("日時は右端の操作より前にある", row.indexOf("stamp(row.lastViewedAt)") < button, true);
ok("日時は時刻の札で置く（読み上げにも日時と伝わる）", /<time className="ws-row-date" dateTime=\{row\.lastViewedAt\}>/.test(row), true);

console.log("\n   2 行目は ・ で継ぐ。縮むのは URL だけ");
ok("URLは読み上げ用に残し通常表示から外す", /<span className="sr-only">\{row\.href\}<\/span>/.test(row), true);
ok("題は 1 行に切る（長い名前が操作を押し出さない）", count(row, /className="ws-name"/g), 1);
console.log("      ※ 1 行目の題も縮む。同じ行の中で、長い名前がボタンを押し出さないため");
ok("印は添え書きの列に出す", /row\.localOnly \? t\("activity\.viewed\.localOnly"\) : null/.test(row) && /localOnly: "このブラウザのみ"/.test(ACTIVITY), true);
ok("回数も添え書きの列に出す", /row\.viewCount > 1 \? t\("activity\.viewed\.times", \{ count: row\.viewCount \}\) : null/.test(row) && /times: \{ one: "\{count\} 回", other: "\{count\} 回" \}/.test(ACTIVITY), true);
ok("日時は専用の列（縮まない）", /\{stamp\(locale, row\.lastViewedAt\)\}/.test(row), true);
ok("添え書きの継ぎ目は 1 種類", count(row, / · /g), 1);

console.log("\n   ブラウザの中にしか無い行にだけ印を添える（色も点も足さない）");
ok("印は旗を見て出す", /\{row\.localOnly \? /.test(row), true);
ok("印に色を足していない", /text-(red|blue|green|amber|yellow)/.test(SECTION), false);
ok("回数は 2 回目から出す", /row\.viewCount > 1 \?/.test(row), true);

// ---------------------------------------------------------------------------
console.log("\n--- 5. 相対表記を使っていない ---");
console.log("   全画面が絶対表記でそろっている。ここだけ「〜分前」にすると書式の正本が 2 つに割れる");
ok("相対表記の部品を持ち込んでいない", /relativeTime/.test(both), false);
for (const word of ["分前", "時間前", "日前", "たった今"]) {
  ok(`  「${word}」と書いていない`, new RegExp(word).test(both), false);
}
ok("書式はほかの画面と同じ（年月日と時刻・書式の共通口）", /formatDateTime\(locale, at\)/.test(SECTION) && /from "@\/lib\/i18n\/format"/.test(SECTION) && /timeZone: TIME_ZONE, dateStyle: "medium", timeStyle: "short"/.test(FORMAT) && /TIME_ZONE = "Asia\/Tokyo"/.test(FORMAT), true);
ok("時刻は分まで", /export function formatDateTime[\s\S]{0,300}timeStyle: "short"/.test(FORMAT), true);

// ---------------------------------------------------------------------------
console.log("\n--- 6. 消すは 2 段階 ---");
console.log("   常時出る入口は灰。赤は確認したあとの実行だけ（30 行なら赤が 30 個並ぶ画面になる）");
const confirm = chunk(CONTROLS, "ConfirmDialog");
ok("確認のかたまりを切り出せている", confirm.length > 0, true);
ok("赤を使うのはメニューの「すべて消す」だけ", count(SECTION, /danger/g), 1);
console.log("      ※ 実行の赤は、確認の共通部品（ConfirmDialog）が持つ。画面ごとに赤いボタンを作らない");
ok("赤は確認の中にある", /className="ws-button ws-danger"/.test(confirm), true);
ok("行そのものには赤が無い", /DANGER/.test(row), false);
ok("確認には「やめる」がある", /t\("common\.dismiss"\)/.test(confirm) && /dismiss: "やめる"/.test(COMMON_JA), true);
ok("「やめる」は塗らないボタンで、実行より先（左）に置く", /className="ws-button" onClick=\{onCancel\}>[\s\S]*?ws-danger/.test(confirm), true);
ok("元に戻せないと言い切る", [count(SECTION, /t\("activity\.viewed\.confirm(?:Row|All|Stop)\.(?:settingsD|d)etail"/g), count(ACTIVITY, /元には戻せません/g)], [5, 7]);

console.log("\n   押した 1 か所だけが確認文に化ける");
ok("どこを聞いているかを 1 つだけ持つ", /const \[asking, setAsking\] = useState<Asking>\(null\);/.test(SECTION), true);
ok("確認のダイアログは 1 つだけ（行や節を確認文に化けさせない）", count(SECTION, /<ConfirmDialog/g), 1);
ok("聞き先は 3 通り（行・全部・残さない）", /kind: "row"[\s\S]*?kind: "all"[\s\S]*?kind: "pause"/.test(SECTION), true);
ok("聞いている間も消し先を握っている", /kind: "row"; href: string; title: string; pageSlug: string \| null/.test(SECTION), true);

console.log("\n   消す先は 2 つ（ブラウザの中と、アカウント）。押す人にその区別は要らない");
const forget = chunk(SECTION, "forget");
ok("1 行消す処理を切り出せている", forget.length > 0, true);
ok("ブラウザの中からは必ず落とす", /put\(VIEWED_STORAGE_KEY, serializeViewed\(removeViewed\(/.test(forget), true);
ok("呼び名を連れている行は、サーバー側の口へも投げる", /if \(pageSlug !== null\) startTransition\(\(\) => forgetViewAction\(pageSlug\)\);/.test(forget), true);
console.log("      ※ 両方に残っている行は両方から消える（片方だけ消すと、次に開いたときまた並ぶ）");
const forgetAll = chunk(SECTION, "forgetAll");
ok("全部消すもブラウザの中を空にする", /put\(VIEWED_STORAGE_KEY, serializeViewed\(\[\]\)\);/.test(forgetAll), true);
ok("全部消すはアカウントの側へも投げる", /startTransition\(\(\) => forgetAllViewsAction\(\)\);/.test(forgetAll), true);
ok("消す口は自分で組み立てず、決まった 3 つを呼ぶ", /import \{ forgetAllViewsAction, forgetViewAction, setViewOptOutAction \} from "\.\/actions";/.test(SECTION), true);

console.log("\n   全部消すは、何件消えるかを言い切ってから赤を出す");
console.log("      ※ 数えるのは**実際に消える数**（混ぜたあとの行数）。片方だけ数えると、");
console.log("        並んでいる行より少ない数を告げてから、並んでいる行が全部消えることになる");
ok("件数を文に入れている", /t\("activity\.viewed\.confirmAll\.detail", \{ count: rows\.length \}\)/.test(SECTION) && /\{count\} 件が消え/.test(ACTIVITY), true);
ok("消える範囲を言い切っている", /activity\.viewed\.confirmAll\./.test(SECTION) && count(ACTIVITY, /見たページの記録を全部消します。/g), 3);
ok("ブラウザの中の分も消えると添えている", /t\("activity\.viewed\.confirmAll\.detail"/.test(SECTION) && count(ACTIVITY, /このブラウザにだけ残っている分も一緒に消えます。/g) === 2, true);
ok("片方（ブラウザの中）だけで数えていない", /\$\{mine\.length\} 件/.test(SECTION), false);
ok("活動一覧では0件のときは出さず、設定は全記録の削除を出す", /\{rows\.length > 0 \? \(\s*<MenuAction icon="delete" danger onSelect=\{\(\) => setAsking\(\{ kind: "all" \}\)\}>/.test(SECTION) && /<IconButton icon="delete" label=\{t\("activity\.viewed\.forgetAll"\)\} onClick=\{\(\) => setAsking\(\{ kind: "all" \}\)\} \/>/.test(SECTION), true);
ok("消す入口はどれもごみ箱の絵（行・全部で同じ）", count(SECTION, /icon="delete"/g), 3);

console.log("\n   「記録を残さない」（もう控えない・いまの分も消す）");
ok("入口がある", /t\("activity\.viewed\.stop"\)/.test(SECTION) && /stop: "記録を残さない"/.test(ACTIVITY), true);
ok("戻す入口もある", /t\("activity\.viewed\.keep"\)/.test(SECTION) && /keep: "記録を残す"/.test(ACTIVITY), true);
ok("止めるときは、いまの分も消す", /put\(VIEWED_STORAGE_KEY, serializeViewed\(\[\]\)\);\s*put\(VIEWED_OFF_KEY, "1"\);/.test(SECTION), true);
ok("消えるものがあるときは先に聞く", /rows\.length > 0 \? setAsking\(\{ kind: "pause" \}\) : setPaused\(true\)/.test(SECTION), true);
ok("戻すときはブラウザの中を消さない", /if \(!next\) \{\s*put\(VIEWED_OFF_KEY, null\);\s*return;\s*\}/.test(SECTION), true);
console.log("      ※ ブラウザの中とアカウントは、必ず同じ向きに動かす（片方だけ効く状態を作らない）");
ok("アカウントの側へも同じ向きで伝える", /startTransition\(\(\) => setViewOptOutAction\(next\)\);/.test(SECTION), true);
ok("入り切りのどちらでも伝える（枝より前に置く）", SECTION.indexOf("setViewOptOutAction(next)") < SECTION.indexOf("if (!next)"), true);
ok("止まっているかは、どちらか一方でも立っていれば止まっている扱い", /const paused = local\.paused \|\| optedOut;/.test(SECTION), true);

// ---------------------------------------------------------------------------
console.log("\n--- 7. 読み上げ用の名前に対象名が入っている ---");
console.log("   入れないと、読み上げには「消す」だけが 30 個並ぶ");
ok("行の入口に対象名", /label=\{t\("activity\.viewed\.forgetRow", \{ title: row\.title \}\)\}/.test(row) && /forgetRow: "「\{title\}」を見た記録を消す"/.test(ACTIVITY), true);
ok("行の確認にも対象名", /description: t\("activity\.viewed\.confirmRow\.detail", \{ title: asking\.title \}\)/.test(SECTION) && /detail: "「\{title\}」を見た記録を消します。元には戻せません。"/.test(ACTIVITY), true);
ok("全部消すにも何を消すか", /label=\{t\("activity\.viewed\.forgetAll"\)\}/.test(SECTION) && /forgetAll: "見たページの記録を全部消す"/.test(ACTIVITY), true);
ok("残さないにも何が起きるか", /title: t\("activity\.viewed\.stop"\),\s*description:/.test(SECTION), true);
ok("確認の部品は題と説明を必ず受け取る（省けない）", /title: string;\s*description: string;\s*confirm\?: string;/.test(CONTROLS), true);

// ---------------------------------------------------------------------------
console.log("\n--- 8. 空の案内と読み込み失敗を別の文にする ---");
console.log("   無言で空になると、記録が消えたのか読めなかったのか区別が付かない");
ok("空の案内がある", /t\("activity\.viewed\.empty"\)/.test(SECTION) && /見たページはまだありません/.test(ACTIVITY), true);
ok("空の案内は共通の形", /className="ws-empty"/.test(SECTION), true);
ok("読み込み失敗の文がある", /t\("activity\.viewed\.loadFailed"\)/.test(SECTION) && /見た記録を読み込めませんでした。/.test(ACTIVITY), true);
ok("失敗は赤い帯（ALERT）", /className=\{ALERT\}>\{t\("activity\.viewed\.loadFailed"\)\}/.test(SECTION), true);
ok("2 つは別の文", /t\("activity\.viewed\.empty"\)/.test(SECTION) && /t\("activity\.viewed\.loadFailed"\)/.test(SECTION) && /empty: "[^"]*まだありません"/.test(ACTIVITY) && /loadFailed: "[^"]*読み込めませんでした/.test(ACTIVITY), true);
ok("止めているときは、そう言う（空とも別の文）", /t\("activity\.viewed\.paused"\)/.test(SECTION) && /paused: "記録を残していません"/.test(ACTIVITY), true);

console.log("\n   見た目は既にある語彙だけで組む（この画面は語彙を増やさない）");
ok("語彙の数（20 個目は連携の鍵の「確かめる」の SUCCESS）", count(STYLES, /^export const /gm), 20);
const vocabulary = [...SECTION.matchAll(/\b(ALERT|DANGER|LIST|META|QUIET|ROW_LINK|SECTION_NOTE)\b/g)];
ok("節が使っている語彙", [...new Set(vocabulary.map((one) => one[1]))].sort().join(" / "), "ALERT");
ok("画面ファイルで局所の語彙を作っていない", /^const \w+ = ["`][^"`]*(text-|font-|max-w-)/m.test(SECTION), false);

// ---------------------------------------------------------------------------
console.log("\n--- 9. 控えの計算（総当たり）---");
await build({
  entryPoints: [`${root}/src/lib/revisions/viewed-pages.ts`],
  outfile: `${dir}/me-store.mjs`,
  bundle: true,
  format: "esm",
  platform: "neutral", mainFields: ["module", "main"],
});
const {
  mergeViewed,
  parseViewed,
  recordViewed,
  removeViewed,
  serializeViewed,
  viewedMarkKey,
  viewedPaused,
  VIEWED_LIMIT,
} = await import(`${dir}/me-store.mjs`);

const at = (minutes) => new Date(Date.UTC(2026, 7, 14, 0, minutes)).toISOString();

console.log("   同じページは 1 行に畳む");
let list = recordViewed([], { href: "/public/guide/intro", title: "使いはじめの案内" }, at(1));
ok("1 枚目", list.length, 1);
ok("1 回目の回数", list[0].viewCount, 1);
list = recordViewed(list, { href: "/public/guide/intro", title: "使いはじめの案内" }, at(2));
ok("同じページをもう一度見ても行は増えない", list.length, 1);
ok("回数だけ増える", list[0].viewCount, 2);
ok("最後に見た時刻が新しくなる", list[0].lastViewedAt, at(2));
list = recordViewed(list, { href: "/public/guide/intro", title: "使いはじめの案内（改）" }, at(3));
ok("題は新しいほうに追いつく", list[0].title, "使いはじめの案内（改）");

console.log("\n   並びは最後に見た順（新しいものが上）");
let three = [];
for (const [minute, href] of [[10, "/public/a"], [30, "/public/b"], [20, "/public/c"]]) {
  three = recordViewed(three, { href, title: href }, at(minute));
}
ok("並び", three.map((one) => one.href).join(" "), "/public/b /public/c /public/a");
three = recordViewed(three, { href: "/public/a", title: "/public/a" }, at(40));
ok("見直した行が上に来る", three.map((one) => one.href).join(" "), "/public/a /public/b /public/c");
console.log("      ※ 時刻は字面で比べない（サーバーの +00:00 とブラウザの Z で形が違う）");
const mixed = mergeViewed(
  [{ href: "/internal/x", title: "x", lastViewedAt: "2026-08-14T00:20:00+00:00", viewCount: 1 }],
  [{ href: "/public/y", title: "y", lastViewedAt: "2026-08-14T00:10:00.000Z", viewCount: 1 }],
);
ok("形が違っても正しく並ぶ", mixed.map((one) => one.href).join(" "), "/internal/x /public/y");

console.log("\n   上限（あふれたら、最後に見たのがいちばん古い行から落ちる）");
ok("上限は 200", VIEWED_LIMIT, 200);
let many = [];
for (let index = 0; index < VIEWED_LIMIT; index += 1) {
  many = recordViewed(many, { href: `/public/page-${index}`, title: `${index}` }, at(index + 1));
}
ok("200 件までは全部残る", many.length, 200);
ok("いちばん古いのは 1 枚目", many[many.length - 1].href, "/public/page-0");
const over = recordViewed(many, { href: "/public/page-200", title: "201" }, at(500));
ok("201 件目を足しても 200 件のまま", over.length, 200);
ok("落ちたのはいちばん古い 1 件", over.some((one) => one.href === "/public/page-0"), false);
ok("新しい 1 件は残る", over[0].href, "/public/page-200");
ok("同じページを見直しただけなら落ちない", recordViewed(many, { href: "/public/page-0", title: "0" }, at(500)).length, 200);

console.log("\n   1 行だけ消す");
ok("消える", removeViewed(three, "/public/b").map((one) => one.href).join(" "), "/public/a /public/c");
ok("無い行を消しても何も起きない", removeViewed(three, "/public/zzz").length, 3);

console.log("\n   アカウントの分とブラウザの分を混ぜる");
const server = [
  { href: "/internal/report", title: "報告", lastViewedAt: at(25), viewCount: 3, pageSlug: "internal/report" },
];
const local = [{ href: "/public/guide", title: "案内", lastViewedAt: at(35), viewCount: 1 }];
const merged = mergeViewed(server, local);
ok("両方が並ぶ", merged.map((one) => one.href).join(" "), "/public/guide /internal/report");
ok("ブラウザの中の行に印が立つ", merged[0].localOnly, true);
ok("アカウントの行には立たない", merged[1].localOnly, false);
console.log("      ※ 消し先は行が自分で連れている。アカウントの行だけが呼び名を持つ");
ok("ブラウザの中の行は呼び名を持たない", merged[0].pageSlug, null);
ok("アカウントの行は呼び名を連れている", merged[1].pageSlug, "internal/report");
console.log("      ※ 行き先（/internal/…）から呼び名を組み直させない。画面に呼び名の決まりを持たせないため");
ok("画面で組み立てていない", /"\/internal\/"|'\/internal\/'|internal\//.test(SECTION), false);
const overlap = mergeViewed(server, [{ ...server[0], viewCount: 1, lastViewedAt: at(1) }]);
ok("同じページが両方にあればアカウントを採る", overlap.length, 1);
ok("採ったのはアカウントの行", `${overlap[0].viewCount} ${overlap[0].localOnly}`, "3 false");
console.log("      ※ 採ったほうが呼び名を持っているので、両方に残っている行も両方から消せる");
ok("採った行は呼び名を連れている", overlap[0].pageSlug, "internal/report");

console.log("\n   壊れた中身を読んでも落ちない（画面ごと出なくならない）");
ok("何も無い", parseViewed(null).length, 0);
ok("文字化け", parseViewed("{{{").length, 0);
ok("配列ではない", parseViewed('{"href":"/public/a"}').length, 0);
ok("形の違う行は落とす", parseViewed('[{"href":"/public/a"},{"href":"/public/b","title":"b","lastViewedAt":"' + at(1) + '","viewCount":1}]').length, 1);
ok("書いて読み戻せる", parseViewed(serializeViewed(three)).map((one) => one.href).join(" "), "/public/a /public/b /public/c");
ok("読むときも上限で切る", parseViewed(serializeViewed([...many, { href: "/public/extra", title: "e", lastViewedAt: at(0), viewCount: 1 }])).length, 200);

console.log("\n   鍵の形（書く側と読む側が同じものを見る）");
ok("控えの鍵", /VIEWED_STORAGE_KEY = "surprise-pages:views"/.test(STORE), true);
ok("止める印の鍵", /VIEWED_OFF_KEY = "surprise-pages:views:off"/.test(STORE), true);
ok("このタブの印はページごと", viewedMarkKey("public/guide/intro"), "surprise-pages:views:sent:public/guide/intro");
ok("止まっているのは 1 のときだけ", `${viewedPaused("1")} ${viewedPaused("0")} ${viewedPaused(null)}`, "true false false");

// ---------------------------------------------------------------------------
console.log("\n--- 10. ウィジェットが控える場所 ---");
console.log("   控えるのは名乗りが届いた直後の 1 か所。取りに行く処理の中には置かない");
ok("控える処理は 1 つだけ", count(WIDGET, /function rememberView\(/g), 1);
ok("取りに行く処理の中では控えない", /rememberView/.test(chunk(WIDGET, "refresh")), false);
console.log("      ※ 取りに行く処理は、版を見比べている最中にも、タブに戻るたびにも走る");
ok("タブに戻るたびの呼び直しは live.ts を通って refresh のまま", /createCommentLive\(\{\s*refresh,/.test(WIDGET) && /addEventListener\("focus", resume, \{ signal: lifetime\.signal \}\)/.test(WIDGET), true);
/*
 * 呼ぶのは立ち上げの道だけ。その道が 2 本ある（互いに通らない）:
 *   道具箱を出す人  … 名乗りが届いたあとの後始末（settleStart）
 *   記事だけの人    … 道具箱は組み立てないが、控えは同じ 1 つの処理を通す
 */
ok("呼ぶのは立ち上げの 2 本の道だけ", count(WIDGET, /\brememberView\(\);/g), 2);
ok("道具箱を出す側は、後始末で呼ぶ", /function settleStart\(\): void \{[\s\S]{0,200}rememberView\(\);/.test(WIDGET), true);
ok(
  "記事だけの側も、同じ処理を通す",
  /if \(!result\.value\.features\.tools\) \{[\s\S]{0,300}rememberView\(\);/.test(WIDGET),
  true,
);

const remember = chunk(WIDGET, "rememberView");
ok("公開ページ以外はブラウザの中に書かない", /if \(state\.visibility !== "public"\) return;/.test(remember), true);
console.log("      ※ 会社の人の分はアカウントの側へ投げる。ブラウザの中には書かない（両方に書かない）");
ok("会社の人はアカウントの側へ投げる", /if \(state\.viewer !== null && state\.viewer\.kind === "member"\) \{\s*(?:\/\/[^\n]*\n\s*)*if \(state\.features\.write\) void recordView\(state\.slug\);\s*return;\s*\}/.test(remember), true);
// 入場券で読むアプリの中のブラウザは書き込めない。見た記録も書き込みの口なので投げない（ブラウザの中にも書かない）
ok("書き込めない名乗り（入場券）ではアカウントへ投げない", /if \(state\.features\.write\) void recordView\(/.test(remember), true);
ok("投げっぱなし（答えを待たない）", /void recordView\(/.test(remember), true);
ok("投げたらブラウザの中へは進まない", remember.indexOf("recordView(") < remember.indexOf("writeStored("), true);
ok("止めていれば、どちらへも書かない", /if \(viewedPaused\(readStored\(VIEWED_OFF_KEY\)\)\) return;/.test(remember), true);
ok("止める確かめは、投げるより前にある", remember.indexOf("viewedPaused(") < remember.indexOf("recordView("), true);
ok("このタブの印を先に見る", remember.indexOf("readSession(mark)") < remember.indexOf("writeStored("), true);
ok("印はページごとの鍵で置く", /const mark = viewedMarkKey\(state\.slug\);/.test(remember), true);
ok("印はタブの中だけに置く（端末には残さない）", /writeSession\(mark, "1"\);/.test(remember), true);
ok("控えの計算は正本を呼ぶ（書き写さない）", /recordViewed\(/.test(remember), true);
ok("並べ方をここで書いていない", /sort\(|slice\(/.test(remember), false);

// ---------------------------------------------------------------------------
console.log("\n--- 11. 本物の DOM で、実際にページを開く ---");
/*
 * ここまでは字面の検査なので、「社内ページでも書いてしまう」たぐいの取り違えは
 * 見つからない。本体を丸ごと jsdom に載せて、開いたあとのブラウザの中を覗く。
 */
const { JSDOM } = await import("jsdom");
await build({
  entryPoints: [`${root}/src/widget/comments/comments.ts`],
  outfile: `${dir}/me-widget.mjs`,
  bundle: true,
  format: "esm",
  platform: "neutral", mainFields: ["module", "main"],
});

const settle = () => new Promise((done) => setTimeout(done, 40));

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
  const named = pageSlug ?? `${path.startsWith("/public/") ? "public" : "internal"}${path.replace(/^\/(?:public|internal)/, "")}`;
  return `<script src="/comments-widget.js/x" data-page="${named}" defer></script>`;
}


/** ページを 1 枚開く。名乗り・居場所・題と、開く前のブラウザの中身を差し替えられる。 */
async function open(path, viewer, { title = "使いはじめの案内", seed = () => {} } = {}) {
  const dom = new JSDOM(`<!doctype html><html><head><title>${title}</title></head><body><p>本文</p>${widgetTag(path, null)}</body></html>`, {
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
  // 送った先を控える（アカウントの側へ投げたかを、実際の呼び出しで確かめる）
  const sent = [];
  win.fetch = async (target, init) => {
    sent.push({ target: String(target), init: init ?? {} });
    return {
      ok: true,
      status: 200,
      json: async () =>
        String(target).startsWith("/api/comments")
          ? {
              viewer,
              comments: [],
              currentVersion: "abc1234",
              // 道具箱を出すのは会社の人だけ（サーバーと同じ決まりで答える）
              features: {
                tools: viewer?.kind === "member",
                history: true,
                slack: false,
                sharing: false,
              },
            }
          : {},
    };
  };

  seed(win);
  installGlobals(win);
  mounted += 1;
  await import(`${dir}/me-widget.mjs?mount=${mounted}`);
  await settle();
  installGlobals(win);
  const views = sent.filter((one) => one.target === "/api/views");
  return {
    win,
    kept: parseViewed(win.localStorage.getItem("surprise-pages:views")),
    mark: win.sessionStorage.getItem(`surprise-pages:views:sent:${path.replace(/^\//, "")}`),
    /** アカウントの側へ投げた回数と、その中身 */
    views: views.length,
    sentPage: views.length === 0 ? null : JSON.parse(String(views[0].init.body ?? "{}")).page ?? null,
  };
}

const MEMBER = { kind: "member", name: "作 二郎", image: null };
const GUEST = { kind: "guest", name: "はなこ", image: null };

console.log("\n   公開ページを、名乗らずに見る");
const anon = await open("/public/guide/intro", null);
ok("1 行だけ控える", anon.kept.length, 1);
ok("行き先は開いたページ", anon.kept[0].href, "/public/guide/intro");
ok("題はページのもの", anon.kept[0].title, "使いはじめの案内");
ok("回数は 1 から", anon.kept[0].viewCount, 1);
ok("このタブの印が立つ", anon.mark, "1");

console.log("\n   題の無いページ");
const untitled = await open("/public/guide/intro", null, { title: "" });
ok("行き先をそのまま名前にする（無題の行を作らない）", untitled.kept[0].title, "/public/guide/intro");

console.log("\n   名前だけのゲスト（ログインはしていない）");
const guest = await open("/public/guide/intro", GUEST);
ok("控える", guest.kept.length, 1);

ok("アカウントの側へは投げない", anon.views, 0);
console.log("      ※ 名乗っていない人にはアカウントが無い。控えはブラウザの中だけで完結する");

console.log("\n   社内ページ");
const internal = await open("/internal/report/2026q1", MEMBER, { title: "四半期の報告" });
ok("ブラウザの中には書かない", internal.kept.length, 0);
console.log("      ※ 共用のパソコンで、ログアウトした次の人の画面に社内ページの題が並ぶのを防ぐ");
ok("アカウントの側へ 1 回だけ投げる", internal.views, 1);
ok("送るのは呼び名（台帳の目印ではない）", internal.sentPage, "internal/report/2026q1");

console.log("\n   ログイン中に公開ページを見る");
const member = await open("/public/guide/intro", MEMBER);
ok("ブラウザの中には書かない（アカウントの側に寄せる）", member.kept.length, 0);
console.log("      ※ 両方に書くと、共用のパソコンで前の人の分が次の人の画面に混ざる");
ok("アカウントの側へ 1 回だけ投げる", member.views, 1);
ok("送るのは呼び名", member.sentPage, "public/guide/intro");

console.log("\n   名前だけのゲストは、アカウントの側へ投げない");
ok("投げない", guest.views, 0);

console.log("\n   同じタブで開き直す");
const again = await open("/public/guide/intro", null, {
  seed: (win) => {
    win.sessionStorage.setItem("surprise-pages:views:sent:public/guide/intro", "1");
  },
});
ok("2 回目は控えない", again.kept.length, 0);
console.log("      ※ 読み込み直しの連打や、アドレス欄の予測による先読みで回数が膨らむのを防ぐ");

console.log("\n   別のページなら、同じタブでも控える");
const another = await open("/public/guide/next", null, {
  seed: (win) => {
    win.sessionStorage.setItem("surprise-pages:views:sent:public/guide/intro", "1");
  },
});
ok("控える", another.kept.length, 1);
ok("行き先は開いたページ", another.kept[0].href, "/public/guide/next");

console.log("\n   「記録を残さない」を選んである");
const paused = await open("/public/guide/intro", null, {
  seed: (win) => {
    win.localStorage.setItem("surprise-pages:views:off", "1");
  },
});
ok("控えない", paused.kept.length, 0);

console.log("\n   会社の人でも、印が立っていれば投げない／止めていれば投げない");
const againMember = await open("/internal/report/2026q1", MEMBER, {
  seed: (win) => {
    win.sessionStorage.setItem("surprise-pages:views:sent:internal/report/2026q1", "1");
  },
});
ok("同じタブの 2 回目は投げない", againMember.views, 0);
const pausedMember = await open("/internal/report/2026q1", MEMBER, {
  seed: (win) => {
    win.localStorage.setItem("surprise-pages:views:off", "1");
  },
});
ok("「記録を残さない」なら投げない", pausedMember.views, 0);
console.log("      ※ 止めるのは送る前。届いてから断るのでは、往復のぶんだけ跡が残りうる");

console.log("\n   前に見た分が残っている");
const before = serializeViewed([
  { href: "/public/guide/intro", title: "使いはじめの案内", lastViewedAt: at(1), viewCount: 2 },
  { href: "/public/other", title: "べつのページ", lastViewedAt: at(2), viewCount: 1 },
]);
const stacked = await open("/public/guide/intro", null, {
  seed: (win) => {
    win.localStorage.setItem("surprise-pages:views", before);
  },
});
ok("行は増えない", stacked.kept.length, 2);
ok("回数が増える", stacked.kept[0].viewCount, 3);
ok("いちばん上に来る", stacked.kept[0].href, "/public/guide/intro");

// ---------------------------------------------------------------------------
console.log("\n--- 12. 書いたコメントの節 ---");
console.log("   コメントが連れている呼び名は、頭の文字を読んだだけのもの。");
console.log("   制限つきのページも internal/… に見えるので、呼び名だけで安全と判断できない");

console.log("\n   読む口が受けるのは、絞り込み済みの台帳の行だけ（型で強制）");
ok(
  "受け口の形（渡された行しか見られない）",
  /export async function listMyComments\(\n\s*organization: OrganizationScope,\n\s*viewer: Identity \| null,\n\s*visible: readonly StoredPage\[\],\n\): Promise<MyComment\[\]>/.test(READER),
  true,
);
const reader = chunk(READER, "listMyComments");
ok("読む口を切り出せている", reader.length > 0, true);
ok("自分でページを引かない", /findPage|listAlivePages|pagesVisibleTo|visiblePagesFor/.test(reader), false);
ok("見せ方を読んでいない（呼び名の頭で判断しない）", /\.visibility|slugPrefix/.test(reader), false);
console.log("      ※ 見たページの読み口とまったく同じ作法（src/lib/pages/views.ts の listViewedPages）");
ok("見たページの読み口も同じ形", /listViewedPages\(\n\s*organization: OrganizationScope,\n\s*viewer: Identity \| null,\n\s*visible: readonly StoredPage\[\],/.test(await read("src/lib/pages/views.ts")), true);

console.log("\n   1 件ずつ引かない（往復はコメントの数によらず 1 回）");
ok("保管庫を引くのは 1 か所（組織で絞った口）", count(reader, /orgDb\(organization\)/g), 1);
ok("呼び名を並べて絞り込みに渡していない", /\.in\(/.test(reader), false);
ok("or\\(\\) に文字列を組み立てていない", /\.or\(/.test(reader), false);
ok("上限を決めてある", /\.limit\(MY_COMMENTS_LIMIT\)/.test(reader), true);
ok("新しい順（あふれるのは古いほうから）", /\.order\("created_at", \{ ascending: false \}\)/.test(reader), true);
ok("消した印の立った行は出さない", /\.is\("deleted_at", null\)/.test(reader), true);

console.log("\n   節の部品は、渡された行だけを見る");
ok("受け取るのは行の配列（か、読めなかったことを表す null）だけ", /export function MyComments\(\{ rows \}: \{ rows: readonly MyComment\[\] \| null \}\)/.test(NOTES), true);
ok("自分で取りに行かない", /fetch\(|getDb\(/.test(NOTES), false);
ok("台帳を引く口を持ち込んでいない", /listMyComments|visiblePagesFor/.test(NOTES), false);

console.log("\n   この節に消す導線を置かない（消すのはページの中のコメント欄から）");
ok("押せるものが 1 つも無い", count(NOTES, /<button/g), 0);
ok("赤を使っていない", /DANGER/.test(NOTES), false);
ok("消す口を呼んでいない", /Action\(|markCommentDeleted|removeViewed/.test(NOTES), false);
ok("「消す」という語が節そのものに出てこない", /消す/.test(NOTES), false);

console.log("\n   行は押すとページを開くだけ（コメントの位置までは飛ばさない）");
ok("台帳の行き先にコメントの位置を付ける", /href=\{`\$\{row\.href\}#c=\$\{row\.id\}`\}/.test(NOTES), true);
ok("コメントの位置へ戻れる", /#c=/.test(NOTES), true);
ok("1 行目は書いた文（1 行に切る）", /\{row\.body\}/.test(NOTES), true);
ok("2 行目はページ名（灰・1 行に切る）", /className="ws-row-author truncate">\{row\.pageTitle\}/.test(NOTES), true);
ok("1 行目の下にページ名を置く", /<span className="ws-name block">\{row\.body\}<\/span>\s*<span className="ws-row-author truncate">/.test(NOTES), true);
ok("縮むのは本文の行とページ名", count(NOTES, /truncate|ws-name/g), 2);
ok("状態は専用の列（縮まない）", /className="ws-row-note">\{row\.resolved \? t\("activity\.comments\.resolved"\) : t\("activity\.comments\.open"\)\}/.test(NOTES) && /resolved: "解決済",\s*open: "未解決"/.test(ACTIVITY), true);
ok("日時は専用の列（時刻の札）", /<time className="ws-row-date" dateTime=\{row\.createdAt\}>/.test(NOTES), true);
ok("継ぎ目の ・ は使わない（列で分ける）", count(NOTES, /・ /g), 0);
console.log("      ※ 状態の言葉づかいはウィジェットに合わせる（同じものを 2 通りに呼ばない）");
// 道具箱の言葉は辞書（日本語が正本）から引く。絞り込みの鍵と、その日本語を見る
const TOOLBOX_JA = await readFile(`${root}/src/lib/i18n/messages/ja/toolbox.ts`, "utf8");
const FILTER_JA = /filter: \{[^}]*\}/.exec(TOOLBOX_JA)?.[0] ?? "";
ok("ウィジェットの絞り込みも同じ語（未解決）", /\["open", t\("toolbox\.list\.filter\.open"\)\],/.test(LIST) && /open: "未解決"/.test(FILTER_JA), true);
ok("ウィジェットの絞り込みも同じ語（解決済）", /\["resolved", t\("toolbox\.list\.filter\.resolved"\)\],/.test(LIST) && /resolved: "解決済"/.test(FILTER_JA), true);

console.log("\n   空の案内と読み込み失敗を別の文にする");
ok("空の案内がある", /t\("activity\.comments\.empty"\)/.test(NOTES) && /書いたコメントはまだありません/.test(ACTIVITY), true);
ok("読み込み失敗の文がある", /t\("activity\.comments\.loadFailed"\)/.test(NOTES) && /書いたコメントを読み込めませんでした。/.test(ACTIVITY), true);
ok("失敗は赤い帯（ALERT）", /className=\{ALERT\}>\{t\("activity\.comments\.loadFailed"\)\}/.test(NOTES), true);
console.log("      ※ 読めなくても画面ごと落とさない（見たページの節は出したまま断る）");
ok("画面は読めなかったことを null で渡す", /listMyComments\(organization, viewer, visible\)\.catch\(\(\) => null\)/.test(SCREEN), true);

console.log("\n   見た目は既にある語彙だけで組む（17 個のまま増やさない）");
const commentWords = [...NOTES.matchAll(/\b(ALERT|LIST|META|ROW_LINK|SECTION_NOTE)\b/g)];
ok("節が使っている語彙", [...new Set(commentWords.map((one) => one[1]))].sort().join(" / "), "ALERT");
ok("局所の語彙を作っていない", /^const \w+ = ["`][^"`]*(text-|font-|max-w-)/m.test(NOTES), false);

// ---------------------------------------------------------------------------
console.log("\n   本物の読み口を呼んで、見えないページのコメントが出ないことを確かめる");
/*
 * 保管庫は「何を頼まれたか」を控えて、**渡した行をそのまま返す**張りぼてにする。
 * 絞り込みを保管庫側でやっていないことになるので、読み口が自分で落としているかどうかが
 * そのまま出る（字面の検査では「呼んでいるつもりで呼んでいない」が見つからない）。
 */
await writeFile(
  `${dir}/me-comments-stub.mjs`,
  `export const ALLOWED_DOMAIN = "example.test";
export const auth = async () => null;
export const cookies = async () => ({ get: () => undefined });
export const headers = async () => ({ get: () => null });

const kept = globalThis.__mine ?? { calls: [], rows: [] };
globalThis.__mine = kept;

function query(table) {
  const note = { table, filters: {}, order: null, limit: null };
  kept.calls.push(note);
  const chain = {
    select(columns) { note.columns = columns; return chain; },
    eq(key, value) { note.filters[key] = value; return chain; },
    in(key, values) { note.filters[key] = values; return chain; },
    is(key, value) { note.filters[key] = value; return chain; },
    order(key, options) { note.order = { key, ...options }; return chain; },
    limit(value) { note.limit = value; return chain; },
    then(resolve, reject) {
      return Promise.resolve({ data: kept.rows, error: null }).then(resolve, reject);
    },
  };
  return chain;
}

export const createClient = () => ({ from: (table) => query(table) });
`,
);

process.env["SUPABASE_URL"] = "https://example.invalid";
process.env["SUPABASE_SECRET_KEY"] = "（検査では使わない）";

await build({
  entryPoints: [`${root}/src/lib/comments/comments.ts`],
  outfile: `${dir}/me-comments.mjs`,
  bundle: true,
  format: "esm",
  platform: "node",
  external: ["node:*"],
  alias: {
    "@/auth": `${dir}/me-comments-stub.mjs`,
    "next/headers": `${dir}/me-comments-stub.mjs`,
    "@/lib/db/database": databaseStub(`${dir}/me-comments-stub.mjs`),
  },
});
const { listMyComments, MY_COMMENTS_LIMIT } = await import(`${dir}/me-comments.mjs`);

const kept = globalThis.__mine;
const load = (rows) => {
  kept.calls.length = 0;
  kept.rows = rows;
};

const TARO = "taro@example.test";
const stored = (id, pageSlug) => ({
  id,
  pageSlug,
  visibility: pageSlug.startsWith("public/") ? "public" : "internal",
  title: `ページ ${id}`,
  currentVersionId: null,
  createdBy: TARO,
  deletedAt: null,
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z",
});
const wrote = (id, pageSlug, extra = {}) => ({
  id,
  page_slug: pageSlug,
  body: `本文 ${id}`,
  author_email: TARO,
  guest_id: null,
  resolved_at: null,
  created_at: "2026-08-13T02:00:00+00:00",
  ...extra,
});

/** 棚は 3 枚。制限つきのページ（secret）にも自分のコメントが 1 件ある */
const shelf = [
  stored("open", "public/guide/intro"),
  stored("inside", "internal/report/2026q1"),
  stored("locked", "internal/secret/plan"),
];
const wrote3 = shelf.map((one) => wrote(one.id, one.pageSlug));

console.log("\n   総当たり: 見える棚のどの組み合わせでも、出るのは渡した行の分だけ");
for (let mask = 0; mask < 8; mask += 1) {
  const visible = shelf.filter((_, index) => (mask & (1 << index)) !== 0);
  load(wrote3);
  const rows = await listMyComments(ORG, { kind: "member", email: TARO, name: null, image: null }, visible);
  ok(
    `  見える棚 [${visible.map((one) => one.id).join(",") || "なし"}]`,
    rows.map((one) => one.pageTitle).sort().join(" "),
    visible.map((one) => `ページ ${one.id}`).sort().join(" "),
  );
}

console.log("\n   名簿から外れたページは、行ごと出ない（題も本文も出さない）");
load(wrote3);
const shown = await listMyComments(
  ORG,
  { kind: "member", email: TARO, name: null, image: null },
  [shelf[0], shelf[1]],
);
const dumped = JSON.stringify(shown);
ok("出た行の数", shown.length, 2);
ok("制限つきのページの題が出ていない", dumped.includes("ページ locked"), false);
ok("その呼び名も出ていない", dumped.includes("secret"), false);
ok("そのコメントの本文も出ていない", dumped.includes("本文 locked"), false);
console.log("      ※ 呼び名は internal/… のままなので、頭の文字を見ただけでは社内ページと区別が付かない");

console.log("\n   応答にメールアドレスを載せない");
ok("アドレスが混ざっていない", dumped.includes(TARO), false);
ok("ゲストの目印も混ざっていない", dumped.includes("guestId") || dumped.includes("guest_id"), false);
ok("持って出るのは 6 つだけ", Object.keys(shown[0]).sort().join(" "), "body createdAt href id pageTitle resolved");

console.log("\n   往復は 1 回（コメントの数によらない）");
load(wrote3);
await listMyComments(ORG, { kind: "member", email: TARO, name: null, image: null }, shelf);
ok("頼んだ回数", kept.calls.length, 1);
const asked = kept.calls[0];
ok("引くのはコメントの表", asked.table, "page_comments");
ok("自分の行だけに絞っている", asked.filters["author_email"], TARO);
ok("消した印の立った行を外している", asked.filters["deleted_at"], null);
ok("並びは新しい順", `${asked.order.key} ${asked.order.ascending}`, "created_at false");
ok("上限を渡している", asked.limit, MY_COMMENTS_LIMIT);
ok("上限の数", MY_COMMENTS_LIMIT, 100);
ok("呼び名を絞り込みに並べていない", asked.filters["page_slug"], undefined);
ok("列は名指しで読む", asked.columns, "id, page_slug, body, author_email, guest_id, resolved_at, created_at");

console.log("\n   ゲストの分も、同じ判定で出る");
console.log("      ※ 出さないと、公開ページで名乗って書いた人にとって、この節は永久に空になる");
const GUEST_ID = "g-1";
const guestRows = [wrote("open", "public/guide/intro", { author_email: null, guest_id: GUEST_ID })];
load(guestRows);
const guestSeen = await listMyComments(ORG, { kind: "guest", guestId: GUEST_ID, name: "はなこ" }, shelf);
ok("並ぶ", guestSeen.length, 1);
ok("引くときはゲストの目印で絞る", kept.calls[0].filters["guest_id"], GUEST_ID);
ok("アドレスの列では絞らない", kept.calls[0].filters["author_email"], undefined);
console.log("      ※ ゲストにも見える範囲の絞り込みは同じように効く（公開ページだけ）");
load(guestRows.concat([wrote("locked", "internal/secret/plan", { author_email: null, guest_id: GUEST_ID })]));
ok(
  "見えないページの分は出ない",
  (await listMyComments(ORG, { kind: "guest", guestId: GUEST_ID, name: "はなこ" }, [shelf[0]])).length,
  1,
);

console.log("\n   自分のものかの判定は、コメント 1 件のときと同じもの（ownsRow）");
load([wrote("open", "public/guide/intro", { author_email: "hanako@example.test" })]);
ok("別の人の行は落とす", (await listMyComments(ORG, { kind: "member", email: TARO, name: null, image: null }, shelf)).length, 0);
load([wrote("open", "public/guide/intro", { author_email: null, guest_id: "g-2" })]);
ok("別のゲストの行も落とす", (await listMyComments(ORG, { kind: "guest", guestId: GUEST_ID, name: "はなこ" }, shelf)).length, 0);
ok("判定は書き写さず、既にあるものを呼ぶ", /ownsRow\(viewer, readString\(record, "author_email"\), readString\(record, "guest_id"\)\)/.test(reader), true);

console.log("\n   名乗っていない人・見えるページが 1 枚も無いときは、保管庫を引かない");
load(wrote3);
ok("名乗っていない人には 1 行も返さない", (await listMyComments(ORG, null, shelf)).length, 0);
ok("そのとき頼まない", kept.calls.length, 0);
load(wrote3);
ok("見えるページが無ければ 1 行も返さない", (await listMyComments(ORG, { kind: "member", email: TARO, name: null, image: null }, [])).length, 0);
ok("そのときも頼まない", kept.calls.length, 0);

console.log("\n   解決になっているかは、真偽で持って出す（画面が言葉を決める）");
load([
  wrote("open", "public/guide/intro"),
  wrote("inside", "internal/report/2026q1", { resolved_at: "2026-08-13T05:00:00+00:00" }),
]);
const states = await listMyComments(ORG, { kind: "member", email: TARO, name: null, image: null }, shelf);
ok("未解決の行", states.find((one) => one.href === "/public/guide/intro").resolved, false);
ok("解決済の行", states.find((one) => one.href === "/internal/report/2026q1").resolved, true);
ok("行き先は台帳から作る", states.map((one) => one.href).sort().join(" "), "/internal/report/2026q1 /public/guide/intro");

// ---------------------------------------------------------------------------
console.log("\n   索引（自分が書いた分を引く向き）");
const SQL = await readFile(`${root}/db/migrations/0010_comment_author_index.sql`, "utf8");
ok("索引がある", /create index page_comments_author_idx\s*\n\s*on public\.page_comments \(author_email, created_at desc\)/.test(SQL), true);
ok("消した印の立った行は入れない", /where deleted_at is null;/.test(SQL), true);
ok("説明が付いている", /comment on index public\.page_comments_author_idx is/.test(SQL), true);
console.log("      ※ ゲストの目印の索引は 0002 で既にある（足すのは書いた人のぶんだけ）");
ok("ゲストの索引は既にある", /create index page_comments_guest_idx/.test(await readFile(`${root}/db/migrations/0002_guest_comments.sql`, "utf8")), true);

console.log(`\n${fails === 0 ? "すべて合格" : `${fails} 件 不合格`}`);

// 道具箱は見ている間、定期にコメントを読み直す（src/widget/comments/live.ts）。jsdom に載せたままなので、検査が済んだらここで終える
process.exit();
