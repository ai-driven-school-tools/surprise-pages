import { readWidgetSource } from "./widget-source.mjs";
// 道具箱と窓口の文言は辞書（日本語が正本）。入口と画面はその鍵を引き、字そのものは辞書で見る
import { readFileSync as readDictionary } from "node:fs";
const TOOLBOX_JA = readDictionary(new URL("../../src/lib/i18n/messages/ja/toolbox.ts", import.meta.url), "utf8");
/**
 * 板（コメントの一覧）を、最初から開いてよいのはいつかを確かめる。
 *
 * 決まり: **未解決のコメントが付いているページは、開いた時点で一覧も開いて見せる**。
 * 右下の件数の印だけでは見落とされるため。開閉の記憶は持たない——覚えると、
 * 一度閉じた人がコメントの付いたページに二度と気づけなくなる。
 * ただし開くのはコメントが届いてから。ページを出した瞬間に開くと、
 * 1 件も無いページでも空の板が本文を覆う（元の不具合）。
 *
 * ここで固定したいのは 6 つ:
 *   1. 未解決が 0 件なら開かない（全部解決済みのページも開かない）
 *   2. 未解決が 1 件以上あれば、誰にでも開く（前に閉じた記憶で出し分けない）
 *   3. 0 件でも「書き始める道」は残っている
 *   4. 0 件から 1 件になったら出てくる（出たあと、0 件に戻っても畳まない）
 *   5. 自分で 1 件書いたら開いて、書いたものが光る
 *      （すでに開いている人には、開き直しも寄せ直しもしない）
 *   6. ただし本文を覆う形（狭い画面）では、こちらから開かない
 *      ——読み始める前に、まず閉じる操作を強いることになる
 */

import { root, dir } from "./paths.mjs";
const { build } = await import(`${root}/node_modules/esbuild/lib/main.js`);

await build({
  entryPoints: [`${root}/src/widget/comments/dock.ts`],
  outfile: `${dir}/so-dock.mjs`,
  bundle: true,
  format: "esm",
  platform: "neutral",
});
const { opensSheetAfterSend, opensSheetOnLoad, toolbarVisible } = await import(`${dir}/so-dock.mjs`);

const TS = (await readWidgetSource())
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^[ \t]*\/\/.*$/gm, "");

/** 名前で関数の中身を切り出す（波かっこの対応で数える）。 */
function body(name) {
  const at = TS.indexOf(`function ${name}(`);
  if (at < 0) return "";
  const open = TS.indexOf("{", at);
  let depth = 0;
  for (let i = open; i < TS.length; i += 1) {
    if (TS[i] === "{") depth += 1;
    if (TS[i] === "}") {
      depth -= 1;
      if (depth === 0) return TS.slice(open, i + 1);
    }
  }
  return "";
}

let fails = 0;
const ok = (label, actual, expected) => {
  const pass = actual === expected;
  if (!pass) fails += 1;
  console.log(`${pass ? "OK  " : "NG  "} ${label}: ${actual}（期待: ${expected}）`);
};
const has = (label, re, where = TS) => ok(label, re.test(where), true);
const lacks = (label, re, where = TS) => ok(label, re.test(where), false);

// ---------------------------------------------------------------------------
console.log("--- 1. 開いてよいかの決まり（opensSheetOnLoad）---");
ok("まだ決めていない / 未解決 0 件 → 開かない", opensSheetOnLoad(true, 0, false), false);
ok("まだ決めていない / 未解決 1 件 → 開く", opensSheetOnLoad(true, 1, false), true);
ok("まだ決めていない / 未解決 12 件 → 開く", opensSheetOnLoad(true, 12, false), true);
ok("もう決めたあと（控えは下りている）→ 開かない", opensSheetOnLoad(false, 5, false), false);
ok("覆う形（狭い画面）→ 件数があっても開かない", opensSheetOnLoad(true, 3, true), false);

// ---------------------------------------------------------------------------
console.log("\n--- 2. ページを出した瞬間には開かない（配線）---");
/* 組み立ては build、届いた答えを画面へ移すのは applyLoaded（refresh はそれを呼ぶだけ） */
const assembling = body("build");
const applied = body("applyLoaded");
const setOpen = body("setOpen");

lacks("開閉を localStorage に覚えていない（毎回いまの中身で決める）", /STORAGE_OPEN/);
has("出した瞬間は控えを立てるだけ", /(?:connections\.)?sheetOpenPending = true;/, assembling);
has(
  "開くかを決めるのはコメントが届いたところ",
  /opensSheetOnLoad\((?:selectionFeature\.|connections\.)?sheetOpenPending, unresolvedCount, (?:selectionFeature\.)?isNarrow\(\)\)/,
  applied,
);
has(
  "数えるのは未解決の親コメントだけ（右下の件数の印と同じ数え方）",
  /const unresolvedCount = (?:listFeature\.)?topLevel\(\)\.filter\(\(comment\) => comment\.resolvedAt === null\)\.length;/,
  applied,
);
ok(
  "決めるのは件数が入ったあと",
  applied.indexOf("state.comments = value.comments") < applied.indexOf("opensSheetOnLoad("),
  true,
);
has("人が開け閉てしたら控えを下ろす", /(?:connections\.)?sheetOpenPending = false;/, setOpen);
lacks("届いた答えで localStorage に書き込まない", /writeStored/, applied);
lacks("0 件になったら閉じる、を足していない", /length === 0[\s\S]{0,120}(?:selectionFeature\.)?setOpen\(false\)/);
has("決まりは dock.ts から借りている（板の開閉の決まりを二重に持たない）", /opensSheetOnLoad,/);

console.log("\n   届く前と後で、板がどう見えるか");
console.log("   出した瞬間=閉 → 届いて未解決 0 件 → 閉じたまま（本文だけが見える）");
console.log("   出した瞬間=閉 → 届いて未解決 1 件以上 → 一覧が開いた状態で出る");
console.log("   「まず開いて 0 件なら閉じる」は採らない。開いた板が独りでに畳まれるのは事故に見える");

// ---------------------------------------------------------------------------
console.log("\n--- 3. 0 件 → 1 件 → 0 件 の流れ ---");

/** 実装と同じ動き。控え（pending）と板の開閉だけを持つ模型 */
const opened = () => ({ pending: true, open: false });
const arrived = (view, count, covering = false) =>
  opensSheetOnLoad(view.pending, count, covering) ? { pending: false, open: true } : view;
const byHand = (view, open) => ({ pending: false, open });

console.log("\n   コメントが 0 件のページ");
let view = opened();
ok("出した瞬間は閉じている", view.open, false);
view = arrived(view, 0);
ok("0 件が届いても閉じたまま", view.open, false);
view = arrived(view, 1);
ok("最初の 1 件を書いたら出てくる", view.open, true);
view = arrived(view, 0);
ok("全部片付いて 0 件に戻っても畳まない（足元を消さない）", view.open, true);
ok("控えはもう下りている", view.pending, false);

console.log("\n   未解決コメントが 3 件あるページ");
let withComments = opened();
ok("出した瞬間はまだ閉じている（件数を知らないので開かない）", withComments.open, false);
withComments = arrived(withComments, 3);
ok("届いたら一覧が開いた状態で出る", withComments.open, true);

console.log("\n   前に自分で閉じて帰った人が、また同じページを開いた");
let returning = arrived(opened(), 3);
ok("記憶を持たないので、未解決がある限りまた開く", returning.open, true);

console.log("\n   全部解決済みのページ");
let allResolved = arrived(opened(), 0);
ok("未解決が無ければ開かない（済んだ話で本文を狭めない）", allResolved.open, false);

console.log("\n   覆う形（狭い画面）");
let covered = arrived(opened(), 3, true);
ok("3 件あっても開かない（件数の印が代わりに知らせる）", covered.open, false);

console.log("\n   開いているあいだに自分で閉じた人");
let byReader = byHand(arrived(opened(), 3), false);
byReader = arrived(byReader, 4);
ok("そのあと 1 件増えても、閉じた手を上書きしない", byReader.open, false);

// ---------------------------------------------------------------------------
console.log("\n--- 4. 0 件でも書き始める道がある ---");
const closed = { dock: false, peek: false, selection: false };
ok("板が閉じているので、右下の道具箱が出る", toolbarVisible(closed, false), true);

const renderBar = body("renderBar");
has("道具箱にコメントのボタンがある", /barButton\(t\("toolbox\.bar\.comments"\)/, renderBar);
has("押すとコメントの板が開く", /state\.view = "comments";\s*\n\s*(?:selectionFeature\.)?setOpen\(true\);/, renderBar);
lacks("0 件のときボタンを消していない", /openCount === 0/, renderBar);
has("件数の印は 1 件以上のときだけ", /if \(openCount > 0\) \{\s*comments\.appendChild/, renderBar);

has("本文を選ぶと下に入り口が出る", /function showSelectionBar\(anchor: Anchor\): void \{/);
has("その入り口から書き始められる", /function beginDraftFromBar\(\): void \{/);
has("書くところ（ドック）が開く", /(?:selectionFeature\.)?openComposeDock\(\);/, body("beginDraftFromBar"));
ok("板を開いたら、書き方の案内が出る", /t\("toolbox\.list\.empty\.hint"\)/.test(TS) && /hint: "本文をドラッグで選ぶと、コメントを付けられます"/.test(TOOLBOX_JA), true);
lacks("入り口を件数で出し分けていない", /comments\.length === 0/, body("showSelectionBar"));

console.log("\n   0 件のときに残っている道は 2 本（どちらも件数を見ていない）");
console.log("   1. 右下の道具箱 → コメント → 板が開く（案内文が出る）");
console.log("   2. 本文をドラッグ → 下の帯の「コメント」→ 書くところが開く");

// ---------------------------------------------------------------------------
console.log("\n--- 5. 自分で 1 件書いたら開く（板が横に並ぶ形）---");
console.log("   本文を覆う形では開かない。そちらの決まりは 6 章");
const submitDraft = body("submitDraft");
const sendSubmission = body("sendSubmission");
const revealSent = body("revealSent");
const flashCard = body("flashCard");
const focusCard = body("focusCard");

lacks("押した瞬間には開かない", /(?:selectionFeature\.)?setOpen\(|revealSent\(/, submitDraft);
has("保存が返ってきてから見せる", /revealSent\(result\.value\.id, wasOpen\);/, sendSubmission);
ok(
  "見せるのは、届いた中身を取り込んだあと",
  sendSubmission.indexOf("await refresh();") < sendSubmission.indexOf("revealSent("),
  true,
);
ok(
  "開いていたかは、送る前の状態で見る",
  sendSubmission.indexOf("const wasOpen = state.open;") < sendSubmission.indexOf("await refresh();"),
  true,
);
const failBranch = /if \(!result\.ok\) \{[\s\S]*?\n  \}/.exec(sendSubmission)?.[0] ?? "";
lacks("失敗したときは開かない（空の板を残さない）", /revealSent\(|(?:selectionFeature\.)?setOpen\(/, failBranch);

has("閉じていたら開く", /if \(!state\.open\) (?:selectionFeature\.)?setOpen\(true\);/, revealSent);
has("ただし覆う形では開かない", /if \(!state\.open && !opensSheetAfterSend\((?:selectionFeature\.)?isNarrow\(\)\)\) return;/, revealSent);
has("すでに開いていたら、光らせるだけ", /if \(wasOpen\) (?:selectionFeature\.)?flashCard\(id\);/, revealSent);
has("閉じていたときだけ寄せる", /else (?:selectionFeature\.)?focusCard\(id\);/, revealSent);
has("絞り込みで隠れていたら外す", /if \(!(?:listFeature\.)?matchesFilter\(sent\)\) state\.filter = filterFor\(sent\);/, revealSent);
console.log("      ※ 行き先は「その 1 件が主役になる絞り込み」（書いたばかりなら既定＝未解決）");
lacks("誰が書いたかで出し分けていない（ゲストも同じ）", /state\.viewer/, revealSent);
lacks("本文のほうを勝手に動かさない", /scrollIntoView/, revealSent);

has("光りは既存の仕掛けをそのまま使う", /focusing = \{ id: commentId, until: Date\.now\(\) \+ FLASH_MS \};/, flashCard);
lacks("光らせるだけのほうは位置に触らない", /scrollIntoView/, flashCard);
has("寄せるほうは、光らせる仕掛けをそのまま呼ぶ（二重に作らない）", /(?:selectionFeature\.)?flashCard\(commentId\);/, focusCard);
has("寄せるほうだけが位置を動かす", /scrollIntoView/, focusCard);

console.log("\n   送ったあとに何が起きるか（模型・横に並ぶ形）");
/** 実装と同じ。開いていたかで、寄せるか光らせるだけかが変わる */
const afterSend = (view) => ({
  open: true,
  movedList: !view.open,
  flashed: true,
  reopened: !view.open,
});

const fromClosed = afterSend({ open: false });
ok("閉じていた: 板が開く", fromClosed.open, true);
ok("閉じていた: 書いた 1 件へ寄せる", fromClosed.movedList, true);
ok("閉じていた: 光って知らせる", fromClosed.flashed, true);

const fromOpen = afterSend({ open: true });
ok("開いていた: 開いたまま", fromOpen.open, true);
ok("開いていた: 開き直さない", fromOpen.reopened, false);
ok("開いていた: 読んでいた場所を奪わない", fromOpen.movedList, false);
ok("開いていた: 光りだけで知らせる", fromOpen.flashed, true);

console.log("\n   失敗したときは板を開かない（知らせに「やり直す」が出るだけ）");
has("失敗の知らせにやり直しを添える", /updateToast\(job\.toastId, "failure"/, sendSubmission);

// ---------------------------------------------------------------------------
console.log("\n--- 6. 本文を覆う形では、送っても開かない（opensSheetAfterSend）---");
console.log("   選んで書くたびに全幅の板が被さると、次の文を選ぶ前に必ず閉じることになる");

ok("覆う形（狭い画面）→ 開かない", opensSheetAfterSend(true), false);
ok("横に並ぶ形（広い画面）→ 開く", opensSheetAfterSend(false), true);

console.log("\n   代わりに何が知らせるか（板を開かなくても分かる）");
ok("送った合図は画面上端の知らせ", /updateToast\(job\.toastId, "success", t\("toolbox\.card\.posted"\)\);/.test(sendSubmission) && /posted: "投稿しました"/.test(TOOLBOX_JA), true);
has("書いた場所は本文に残る印", /for \(const mark of job\.marks\) confirmDraftMark\(mark\);/, submitDraft);
console.log("      ※ 仮の印は外すが、確定した引用からサーバー側の印が引き直される");

console.log("\n   決まりの置き場所");
has("板の開閉の決まりは dock.ts から借りている", /import \{\s*opensSheetAfterSend\s*\} from "\.\/dock"/);
lacks("画面幅をこちらで数え直していない", /innerWidth|NARROW_VIEWPORT/, revealSent);
lacks("送信の処理が幅を見ていない", /(?:selectionFeature\.)?isNarrow\(\)/, submitDraft);
lacks("送信の処理が幅を見ていない（保存の側も）", /(?:selectionFeature\.)?isNarrow\(\)/, sendSubmission);

console.log("\n   続けて書く流れ（狭い画面・模型）");
/** 実装と同じ。板は閉じたまま、印と知らせだけが積まれていく */
const keepWriting = (sheet, times) => {
  let open = sheet;
  let marks = 0;
  let toasts = 0;
  for (let i = 0; i < times; i += 1) {
    // 選んで書く → 送る。開くのは「いま閉じていない」か「覆う形でない」ときだけ
    if (!open && opensSheetAfterSend(true)) open = true;
    marks += 1;
    toasts += 1;
  }
  return { open, marks, toasts };
};

const three = keepWriting(false, 3);
ok("3 件続けて書いても板は閉じたまま", three.open, false);
ok("本文には 3 つの印が残る", three.marks, 3);
ok("知らせも 3 回出る", three.toasts, 3);
console.log("      ※ 以前は 1 件ごとに板が開き、次の文を選ぶ前に閉じる操作が 3 回要った");

console.log("\n   自分で開けた板は、この決まりの外");
lacks("送ったあとに板を閉じることはしない", /(?:selectionFeature\.)?setOpen\(false\)/, revealSent);
has("開いていたら光らせるだけ（開き直さない）", /if \(wasOpen\) (?:selectionFeature\.)?flashCard\(id\);/, revealSent);
ok(
  "開いているかを見るのが先（覆う形でも、開いていれば寄せる）",
  revealSent.indexOf("!state.open && !opensSheetAfterSend") < revealSent.indexOf("state.view ="),
  true,
);

console.log(`\n${fails === 0 ? "すべて合格" : `${fails} 件 不合格`}`);
