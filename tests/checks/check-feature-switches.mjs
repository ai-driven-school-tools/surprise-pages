/**
 * 機能のスイッチの決まり（docs/guides/feature-switches.md）を見張る。
 *
 * 1. 新しいスイッチは切った状態で生まれる（未設定なら元の動き）
 * 2. 切っていれば元の動きが完全に保たれる
 * 3. 全員に入れて安定したら、スイッチと古いコードを消す（期限付き）
 *
 * コードが「環境変数の値を決まった文字と比べる」読み方をしていたら、それはスイッチ。
 * 台帳（src/lib/settings/environment.json の featureSwitch）に持ち主・目的・期限つきで載っていなければ落とす。
 * 期限切れは落とさない——関係の無い全員の PR が止まるため。期限切れは `node scripts/rules/feature-switches.mjs` の一覧が印を付けて見せる
 * （配布版は Slack への週 1 回の知らせを外した）。
 */
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { root } from "./paths.mjs";
import {
  ENVIRONMENT, SWITCH_LEDGER, codeProblems, detectSwitchReads, expiredSwitches, ledgerProblems, todayInTokyo,
} from "../../scripts/rules/feature-switches.mjs";

let failures = 0;
function check(label, test) {
  try { test(); console.log(`OK  ${label}`); }
  catch (error) { failures++; console.log(`NG  ${label}: ${error instanceof Error ? error.message : String(error)}`); }
}

/**
 * 未設定で入っているスイッチ（止めるためだけのもの）。決まりより前からある例外で、**減る方向にだけ動かす**。
 * 新しく足さない。消したら、ここからも外す（外し忘れは下の検査が落とす）。
 */
const BORN_ON_EXCEPTIONS = {
  PAGES_AGENT_EDITING: "手元の AI からの編集。全員に出したあと、止めるときだけ off にする",
};

/**
 * issueの時点であったスイッチのうち、配布版に残るもの。台帳から黙って落ちていないかを見る（消すときはここからも外す）。
 * 共同編集（PAGES_DECK_COLLABORATION・_PAGES・PAGES_DECK_REALTIME・PAGES_DECK_BATCHING）と HTML 動画（PAGES_MOTION_EDITING）は機能ごと外した。
 */
const KNOWN_AT_START = ["PAGES_DECK_DIAGNOSTICS", "PAGES_AGENT_EDITING"];

function walk(directory, keep) {
  const found = [];
  if (!existsSync(directory)) return found;
  for (const name of readdirSync(directory)) {
    const full = path.join(directory, name);
    if (statSync(full).isDirectory()) { if (name !== "node_modules") found.push(...walk(full, keep)); }
    else if (keep(full)) found.push(full);
  }
  return found;
}
const relative = (file) => path.relative(root, file).split(path.sep).join("/");
const today = todayInTokyo();

console.log("--- 台帳の書き方 ---");
check(`台帳に始めからのスイッチ ${KNOWN_AT_START.length} つが載っている`, () => {
  const missing = KNOWN_AT_START.filter((name) => !SWITCH_LEDGER.some((one) => one.name === name));
  assert.deepEqual(missing, [], `台帳に無い: ${missing.join(", ")}`);
});
for (const one of SWITCH_LEDGER) {
  check(`${one.name}: 持ち主・目的・期限・片付けがそろい、決まりに合う`, () => {
    assert.deepEqual(ledgerProblems([one, ...SWITCH_LEDGER.filter((other) => other.name !== one.name)], { today, bornOnExceptions: BORN_ON_EXCEPTIONS }).filter((problem) => problem.startsWith(`${one.name}:`)), []);
  });
}
check("台帳全体が決まりに合う（名前の重なり・例外の一覧の外し忘れ）", () => {
  assert.deepEqual(ledgerProblems(SWITCH_LEDGER, { today, bornOnExceptions: BORN_ON_EXCEPTIONS }), []);
});
check("例外（未設定で入）にはどれも理由がある", () => {
  for (const [name, why] of Object.entries(BORN_ON_EXCEPTIONS)) assert.ok(why.trim().length > 0, name);
});

console.log("--- コードの読み方と台帳 ---");
const sources = [
  ...["src/app", "src/lib", "src/widget"].flatMap((top) => walk(path.join(root, top), (file) => /\.(tsx?|mjs)$/.test(file) && !file.includes(".generated."))),
  ...["src/auth.ts", "src/proxy.ts", "next.config.ts"].map((name) => path.join(root, name)).filter(existsSync),
];
const reads = sources.flatMap((file) => detectSwitchReads(readFileSync(file, "utf8")).map((read) => ({ ...read, file: relative(file) })));
// 機能の台帳（src/lib/settings/features.ts）の switch は、featureEnabled が "off" と比べる。ここだけは名前を渡して読むので、形を確かめてから足す。
const featuresSource = readFileSync(path.join(root, "src/lib/settings/features.ts"), "utf8");
check("機能の台帳の止める設定は \"off\" と比べる形のまま", () => assert.match(featuresSource, /process\.env\[feature\.switch\] !== "off"/));
for (const match of featuresSource.matchAll(/\bswitch:\s*"([A-Z][A-Z0-9_]+)"/g)) reads.push({ name: match[1], literal: "off", file: "src/lib/settings/features.ts" });
// 配布版は共同編集と HTML 動画のスイッチを外したので、いまの読み方は 7 件（10 件から下げた）
check("コードからスイッチの読み方が見つかる（見張りが空回りしていない）", () => assert.ok(reads.length >= 7, `${reads.length} 件`));
check("コードが読むスイッチはどれも台帳に載り、未設定のときの動きが台帳と一致する", () => {
  assert.deepEqual(codeProblems(SWITCH_LEDGER, ENVIRONMENT, reads), []);
});
check("台帳のスイッチはどれもコードが読んでいる（消したら台帳からも外す）", () => {
  const read = new Set(reads.map((one) => one.name));
  const all = sources.map((file) => readFileSync(file, "utf8")).join("\n");
  const stale = SWITCH_LEDGER.filter((one) => !read.has(one.name) && !all.includes(one.name)).map((one) => one.name);
  assert.deepEqual(stale, []);
});

console.log("--- 台帳に無いスイッチを足すと赤になる ---");
const added = (source) => codeProblems(SWITCH_LEDGER, ENVIRONMENT, detectSwitchReads(source).map((read) => ({ ...read, file: "src/lib/new-feature.ts" })));
check("=== \"on\" で読む新しいスイッチ", () => assert.equal(added(`if (process.env.PAGES_NEW_THING === "on") start();`).length, 1));
check("!== \"off\" で読む新しいスイッチ", () => assert.equal(added(`const enabled = process.env.PAGES_NEW_THING !== "off";`).length, 1));
check("?? を挟んだ読み方", () => assert.equal(added(`const mode = (process.env.PAGES_NEW_THING ?? "") === "shared";`).length, 1));
check("文字を先に書いた読み方", () => assert.equal(added(`if ("on" === process.env.PAGES_NEW_THING) start();`).length, 1));
check("一覧に含まれるかで読む形", () => assert.equal(added(`["on", "shared"].includes(process.env.PAGES_NEW_THING ?? "")`).length, 2));
check("名前を定数に置いてから読む形", () => assert.equal(added(`const FLAG = "PAGES_NEW_THING";\nif (process.env[FLAG] === "1") start();`).length, 1));
check("括弧の中に名前を書く形", () => assert.equal(added(`if (process.env["PAGES_NEW_THING"] === "on") start();`).length, 1));
check("台帳にあるスイッチを未設定で入る向きに読み替えると赤", () => assert.equal(added(`if (process.env.PAGES_DECK_DIAGNOSTICS !== "off") connect();`).length, 1));
check("関数に渡した結果を比べる形はスイッチとして数えない", () => assert.deepEqual(added(`resolveEdition(deployment.edition, process.env.PAGES_NEW_THING) === "personal"`), []));
check("配備の印（platform）はスイッチとして数えない", () => assert.deepEqual(added(`if (process.env.NODE_ENV === "production") x();`), []));
check("値を比べずに読むだけの設定（接続先や鍵）はスイッチとして数えない", () => assert.deepEqual(added(`const url = process.env.PAGES_NEW_URL;`), []));

console.log("--- 台帳の書き漏れは赤になる ---");
const base = { name: "PAGES_NEW_THING", purpose: "試し", feature: "core", scope: "company", owner: "someone", unset: "off", removeBy: "2026-12-31", cleanup: "消す" };
const problemsOf = (entry) => ledgerProblems([entry], { today: "2026-09-27", bornOnExceptions: {} });
check("そろった台帳は合格", () => assert.deepEqual(problemsOf(base), []));
check("持ち主が無いと赤", () => assert.equal(problemsOf({ ...base, owner: undefined }).length, 1));
check("期限が無いと赤", () => assert.equal(problemsOf({ ...base, removeBy: undefined }).length, 1));
check("期限が日付でないと赤", () => assert.equal(problemsOf({ ...base, removeBy: "来年" }).length, 1));
check("1 年より先の期限は赤（消さないのと同じ）", () => assert.equal(problemsOf({ ...base, removeBy: "2099-12-31" }).length, 1));
check("片付けで消すものが無いと赤", () => assert.equal(problemsOf({ ...base, cleanup: "" }).length, 1));
check("未設定で入る新しいスイッチは赤（切った状態で生まれる）", () => assert.equal(problemsOf({ ...base, unset: "on" }).length, 1));
check("未設定のときの動きも親も無いと赤", () => assert.equal(problemsOf({ ...base, unset: undefined }).length, 1));
check("親のスイッチが台帳に無いと赤", () => assert.equal(problemsOf({ ...base, unset: undefined, follows: "PAGES_MISSING" }).length, 1));
check("手元の印（local）を台帳に載せると赤", () => assert.equal(problemsOf({ ...base, scope: "local" }).length, 1));
check("例外の一覧に残った、もう例外ではない名前は赤", () => assert.equal(ledgerProblems([base], { today: "2026-09-27", bornOnExceptions: { PAGES_NEW_THING: "理由" } }).length, 1));

console.log("--- 期限切れは一覧で見せるだけで、CI は赤にしない ---");
const past = { ...base, removeBy: "2026-01-31" };
check("期限を過ぎたものを期限切れとして拾う", () => assert.deepEqual(expiredSwitches([past, base], "2026-09-27").map((one) => one.name), ["PAGES_NEW_THING"]));
check("期限の当日はまだ期限切れにしない", () => assert.deepEqual(expiredSwitches([{ ...base, removeBy: "2026-09-27" }], "2026-09-27"), []));
check("期限切れは台帳の問題にしない（検査は赤にならない）", () => assert.deepEqual(ledgerProblems([past], { today: "2026-09-27", bornOnExceptions: {} }), []));
check(`今日（${today}）の期限切れの数を数えられる`, () => assert.ok(expiredSwitches(SWITCH_LEDGER, today).length >= 0));

console.log("--- 決まりの文書 ---");
const doc = readFileSync(path.join(root, "docs/guides/feature-switches.md"), "utf8");
for (const word of ["切った状態で生まれる", "元の動き", "期限", "src/lib/settings/environment.json", "featureSwitch", "owner", "removeBy", "unset", "follows", "cleanup", "node scripts/rules/feature-switches.mjs", "check-feature-switches", "CI は赤にしない"])
  check(`決まりの文書に「${word}」`, () => assert.ok(doc.includes(word)));
// 配布版は週 1 回の Slack の知らせ（.github/workflows/feature-switches.yml と scripts/slack/dev-notify.mjs）を外した。台帳の読み口は Slack を知らない
check("台帳の読み口は Slack の知らせの部品を読み込まない", () => assert.doesNotMatch(readFileSync(path.join(root, "scripts/rules/feature-switches.mjs"), "utf8"), /from "\.\/slack\//));

console.log(`\n機能のスイッチ: ${failures} 件の不合格`);
process.exitCode = failures ? 1 : 0;
