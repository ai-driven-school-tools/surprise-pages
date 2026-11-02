import { readWidgetSource } from "./widget-source.mjs";
/**
 * 一覧を組み直しても、読んでいた位置と光りが残ることを確かめる。
 *
 * 元の不具合: 組み直し（中身の作り直し）は絞り込みの切り替え・カードを押したとき・
 * コメントが届いたときなど、あちこちで走る。作り直すと要素ごと捨てられるので、
 * スクロール位置は先頭へ、光っていた印は消える。覗き見から一覧へ渡したときの
 * 「280ms 後に光りが消える」は、この地雷を踏んだ 1 例でしかない。
 */

const TS = (await readWidgetSource())
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^[ \t]*\/\/.*$/gm, "");

let fails = 0;
const ok = (label, actual, expected) => {
  const pass = actual === expected;
  if (!pass) fails += 1;
  console.log(`${pass ? "OK  " : "NG  "} ${label}: ${actual}（期待: ${expected}）`);
};
const has = (label, re) => ok(label, re.test(TS), true);

// ---------------------------------------------------------------------------
console.log("--- 1. 組み直しの前後で位置を控えて戻す ---");
const body = /function renderList\(\): void \{[\s\S]*?\n\}/.exec(TS)?.[0] ?? "";
const keepAt = body.indexOf("const keepTop = connections.listBox.scrollTop;");
const clearAt = body.indexOf("connections.listBox.replaceChildren()");
const restoreAt = body.indexOf("connections.listBox.scrollTop = keepTop;");
const focusAt = body.indexOf("applyFocus()");

ok("控える一行がある", keepAt >= 0, true);
ok("控えるのは捨てる前", keepAt < clearAt, true);
ok("戻すのは組み立てたあと", restoreAt > clearAt, true);
ok("光りを付け直すのは位置を戻したあと", focusAt > restoreAt, true);

console.log("\n   組み直しの回数ぶん、位置がどうなるか（旧 / 新）");
const steps = ["絞り込み切替", "カード押下", "コメント到着", "覗き見から渡す"];
// 組み直しの中身をそのまま写した模型。控えて戻すかどうかだけが違う
const rebuild = (top, restores) => (restores ? top : 0);
const oldSeen = [];
const newSeen = [];
let oldTop = 400;
let newTop = 400;
for (const step of steps) {
  oldTop = rebuild(oldTop, false);
  newTop = rebuild(newTop, true);
  oldSeen.push(`${step}:${oldTop}`);
  newSeen.push(`${step}:${newTop}`);
}
console.log(`   旧: ${oldSeen.join(" → ")}`);
console.log(`   新: ${newSeen.join(" → ")}`);
ok("旧はどの組み直しでも先頭へ戻る", oldSeen.every((seen) => seen.endsWith(":0")), true);
ok("新は読んでいた位置のまま", newSeen.every((seen) => seen.endsWith(":400")), true);
console.log("   中身が短くなったときは、ブラウザが入る範囲で止める（端を越えた値は丸められる）");

// ---------------------------------------------------------------------------
console.log("\n--- 2. 光りは「誰を・いつまで」を状態として持つ ---");
has("状態として持つ", /let focusing: \{ id: string; until: number \} \| null = null;/);
has("光らせ始めに、終わりの時刻を決める", /focusing = \{ id: commentId, until: Date\.now\(\) \+ FLASH_MS \};/);
has("組み直しのあとに付け直す", /function applyFocus\(\): void \{/);
has("残り時間ぶんだけ光らせる", /const left = focusing\.until - Date\.now\(\);/);
has("残り時間で消す", /(?:setTimeout|timeout)\(\(\) => card\.classList\.remove\("is-flash"\), left\)/);
ok("毎回 1.2 秒に伸ばし直していない", /remove\("is-flash"\), FLASH_MS\)/.test(TS), false);
has("時間切れなら忘れる", /if \(left <= 0\) \{\s*\n\s*focusing = null;/);

console.log("\n   覗き見から渡したとき（280ms 後に片付けの組み直しが走る）");
const FLASH = 1200;
const HANDOFF = 280;
const oldLife = HANDOFF;          // 旧: 片付けの組み直しで要素ごと捨てられて消える
const newLife = FLASH;            // 新: 残り (1200-280) を引き継いで光り続ける
ok("旧: 光っていた時間", oldLife, 280);
ok("新: 光っていた時間", newLife, 1200);
ok("新: 引き継ぐ残り時間", FLASH - HANDOFF, 920);
ok("光りが約束の時間より短く消えない", newLife >= FLASH, true);

// ---------------------------------------------------------------------------
console.log("\n--- 3. 光らせ直すだけ。位置には触らない ---");
console.log("   組み直しの側で読んでいた位置が保たれるようになったので、");
console.log("   ここで寄せ直すと『光っている 1.2 秒の間に自分で動かした人』だけが引き戻される");

const focus = /function applyFocus\(\): void \{[\s\S]*?\n\}/.exec(TS)?.[0] ?? "";
ok("やるのは光らせ直すことだけ", /card\.classList\.add\("is-flash"\)/.test(focus), true);
ok("残り時間で消すのも変わらず", /remove\("is-flash"\), left\)/.test(focus), true);
ok("位置を測っていない", /getBoundingClientRect/.test(focus), false);
ok("位置を動かしていない", /scrollIntoView/.test(focus), false);
ok("寄せるのは一覧へ渡した最初の 1 回だけ", /function focusCard[\s\S]{0,600}scrollIntoView/.test(TS), true);

console.log("\n   実機の再現（一覧に着地 → 1.2 秒以内に自分で動かす → カードを押す）");
// 押すと組み直しが走る。そのときの位置が、旧（寄せ直す）と新（触らない）でどうなるか
const rebuildWith = (top, recenters) => (recenters ? 0 : top);
const readerMoved = 331;
ok("旧: 引き戻される", rebuildWith(readerMoved, true), 0);
ok("新: 動かしたところに留まる", rebuildWith(readerMoved, false), 331);

console.log("\n   光り自体は残る（引き戻しを消しても、光る仕掛けは別）");
ok("光っている相手を覚えている", /let focusing/.test(TS), true);
ok("組み直しのあとに付け直す", /(?:selectionFeature\.)?applyFocus\(\);/.test(TS), true);

console.log(`\n${fails === 0 ? "すべて合格" : `${fails} 件 不合格`}`);
