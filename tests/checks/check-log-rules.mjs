/**
 * ログの決まりを、破ると落ちる形にする。台帳は src/lib/logging/log-ledger.json、判定は scripts/rules/log-rules.mjs。
 *
 * 決まりを文書に書くだけだと、入口や定期処理を足した人が外枠を掛け忘れても、生の console を
 * 書いても、誰も気づかない。ここが数え上げて台帳と突き合わせ、落ちたら直し方を出す。
 *
 * 見るのは 5 つ。
 *   1. 判定そのもの（作り物の入力で、増えた・減った・載っていない・証拠が外れた、が落ちること）
 *   2. 生の console：app と lib と根の入口で、免除の一覧と 1 件単位で一致する（一覧は減る方向だけ）
 *   3. 入口の台帳：app の route.ts が 1 つ残らず載り、書いてあるとおりの外枠を通る
 *   4. 定期処理と自動実行の台帳：vercel.json の crons・src/app/api/cron・schedule を持つワークフロー
 *   5. 添える項目：logEvent に渡す名前が通してよい一覧にある（伏せ方そのものは check-server-log が見る）。
 *      組織の印（organization）は入口の外枠が置くもので、logEvent を呼ぶ側は渡さない
 *
 * 保管庫にも配信網にも繋がない。ファイルの字面と構文の木だけを見る。
 */
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";

import { root } from "./paths.mjs";
import { FIXES, ORGANIZATION_PASSERS, consoleProblems, consoleUses, cronProblems, fieldProblems, hasSchedule, hasWorkflowRun, objectKeys, organizationProblems, routeProblems, runsUnattended, workflowProblems } from "../../scripts/rules/log-rules.mjs";

const { default: ts } = await import(`${root}/node_modules/typescript/lib/typescript.js`);

/**
 * 免除の合計の上限。**上げない。** 免除を 1 つ logEvent へ寄せたら、台帳と一緒にここも下げる
 * （下げ忘れは下の検査が落とす）。どうしても足すときは、PR の本文に理由を書いてここを上げる
 * ——台帳だけを書き足して通る形にしないための 2 つ目の鍵。
 */
// 個人配布版は共同編集の計測・録音のカレンダー・エラーの報告の行を外したので 5（減る方向だけ）
const RAW_CONSOLE_CEILING = 5;

const read = (path) => readFileSync(`${root}/${path}`, "utf8");

let fails = 0;
const ok = (label, actual, expected, fix) => {
  const pass = JSON.stringify(actual) === JSON.stringify(expected);
  if (!pass) fails += 1;
  console.log(`${pass ? "OK  " : "NG  "} ${label}: ${JSON.stringify(actual)}（期待: ${JSON.stringify(expected)}）`);
  if (!pass && fix !== undefined) console.log(`    ${fix}`);
};

function walk(folder, keep) {
  const found = [];
  for (const entry of readdirSync(`${root}/${folder}`, { withFileTypes: true })) {
    if (entry.isDirectory()) found.push(...walk(`${folder}/${entry.name}`, keep));
    else if (keep(entry.name)) found.push(`${folder}/${entry.name}`);
  }
  return found;
}
const isCode = (name) => /\.(ts|tsx|mts|js|jsx|mjs|cjs)$/.test(name) && !name.endsWith(".d.ts");

// ---------------------------------------------------------------------------
console.log("--- 1. 判定そのもの ---");

const uses = (text, name = "x.ts") => consoleUses(ts, name, text);
ok("呼び出しを数える", uses('console.warn("a"); console.info(JSON.stringify({}));'), 2);
ok("角かっこで呼んでも数える", uses('console[level]("a");'), 1);
ok("別名に移しても数える", uses("const { warn } = console; const out = console;"), 2);
ok("コメントと文字列の中は数えない", uses('// console.log("a")\n/* console.warn */ const text = "console.log(1)"; const html = `console.error`;'), 0);
ok("欄の名前は数えない", uses("const a = options.console; const b = { console: 1 };"), 0);
ok("tsx も読める", uses("export const A = () => { console.log(1); return <p>console.log</p>; };", "a.tsx"), 1);

const LIST = [{ file: "src/lib/a.ts", count: 2, reason: "形を検査表が読んでいる計測の行" }];
ok("一覧と一致すれば通る", consoleProblems(new Map([["src/lib/a.ts", 2]]), LIST, 2), []);
ok("一覧に無いファイルは落ちる", consoleProblems(new Map([["src/lib/a.ts", 2], ["src/app/b/route.ts", 1]]), LIST, 2).length, 1);
ok("一覧より増えたら落ちる", consoleProblems(new Map([["src/lib/a.ts", 3]]), LIST, 2).length, 1);
ok("一覧より減ったら、一覧を下げるまで落ちる", consoleProblems(new Map([["src/lib/a.ts", 1]]), LIST, 2).length, 1);
ok("実在しないものが一覧に残っていたら落ちる", consoleProblems(new Map(), LIST, 2).length, 1);
ok("一覧を書き足しただけでは通らない（上限）", consoleProblems(new Map([["src/lib/a.ts", 2], ["src/lib/c.ts", 1]]), [...LIST, { file: "src/lib/c.ts", count: 1, reason: "足したいだけの理由を書いた" }], 2).length, 1);
ok("一覧が減ったら上限も下げさせる", consoleProblems(new Map([["src/lib/a.ts", 2]]), LIST, 3).length, 1);
ok("理由の無い免除は落ちる", consoleProblems(new Map([["src/lib/a.ts", 2]]), [{ file: "src/lib/a.ts", count: 2, reason: "" }], 2).length, 1);

const WRAPPED = { file: "src/app/api/a/route.ts", source: 'export const GET = (request) => routeLog("/api/a", request, run);' };
const V1 = { file: "src/app/api/v1/b/route.ts", source: 'export const GET = apiV1("/api/v1/b", run);' };
const BARE = { file: "src/app/api/c/route.ts", source: "export const { GET } = handlers;" };
const ROUTES = { "src/app/api/a/route.ts": "routeLog", "src/app/api/v1/b/route.ts": "apiV1", "src/app/api/c/route.ts": { none: "よその道具が配る関数をそのまま出す" } };
ok("台帳どおりなら通る", routeProblems([WRAPPED, V1, BARE], ROUTES), []);
ok("台帳に無い入口は落ちる", routeProblems([WRAPPED, V1, BARE, { file: "src/app/api/new/route.ts", source: WRAPPED.source }], ROUTES).length, 1);
ok("外枠を外した入口は落ちる", routeProblems([{ ...WRAPPED, source: "export const GET = run;" }, V1, BARE], ROUTES).length, 1);
ok("もう無い入口が台帳に残っていたら落ちる", routeProblems([WRAPPED, V1], ROUTES).length, 1);
ok("理由なしで外枠を外せない", routeProblems([WRAPPED, V1, BARE], { ...ROUTES, "src/app/api/c/route.ts": { none: "" } }).length, 1);
ok("包んだのに「通さない」のままなら落ちる", routeProblems([WRAPPED, V1, { ...BARE, source: WRAPPED.source }], ROUTES).length, 1);

const CRON = { file: "src/app/api/cron/views/route.ts", source: 'logEvent({ level: "info", event: "cron.swept" });' };
const CRONS = { "/api/cron/views": { records: "何を何件消したか" } };
ok("定期処理が台帳どおりなら通る", cronProblems(["/api/cron/views"], [CRON], CRONS), []);
ok("vercel.json に足した定期処理が台帳に無ければ落ちる", cronProblems(["/api/cron/views", "/api/cron/new"], [CRON], CRONS).length, 1);
ok("入口だけ足しても落ちる", cronProblems(["/api/cron/views"], [CRON, { file: "src/app/api/cron/new/route.ts", source: CRON.source }], CRONS).length, 1);
ok("記録をやめた定期処理は落ちる", cronProblems(["/api/cron/views"], [{ ...CRON, source: "await sweep();" }], CRONS).length, 1);
ok("もう無い定期処理が台帳に残っていたら落ちる", cronProblems([], [], CRONS).length, 1);

const SCHEDULED = "on:\n  schedule:\n    - cron: '0 18 * * *'\njobs:\n  a:\n    steps:\n      - run: node scripts/slack/dev-notify.mjs\n";
ok("予定実行を見分ける", [hasSchedule(SCHEDULED), hasSchedule("on:\n  pull_request:\n"), hasSchedule("# schedule:\n#   - cron: '0 0 * * *'\non: push\n")], [true, false, false]);
const CHAINED = "on:\n  workflow_run:\n    workflows: [Quality]\n    types: [completed]\njobs:\n  a:\n    steps:\n      - run: node x.mjs\n";
ok("ほかのワークフローの終わりで動くものも自動実行に数える", [hasWorkflowRun(CHAINED), hasWorkflowRun("# workflow_run:\non: push\n"), hasWorkflowRun(SCHEDULED), runsUnattended(CHAINED), runsUnattended(SCHEDULED), runsUnattended("on:\n  workflow_dispatch:\n")], [true, false, false, true, true, false]);
ok("workflow_run のワークフローも台帳に無ければ落ちる", workflowProblems([{ name: "chained.yml", source: CHAINED }], {}).length, 1);
const FLOWS = { "a.yml": { records: "失敗と復旧を Slack に", evidence: "scripts/slack/dev-notify.mjs" } };
ok("自動実行が台帳どおりなら通る", workflowProblems([{ name: "a.yml", source: SCHEDULED }], FLOWS), []);
ok("台帳に無い自動実行は落ちる", workflowProblems([{ name: "a.yml", source: SCHEDULED }, { name: "b.yml", source: SCHEDULED }], FLOWS).length, 1);
ok("知らせの口を外した自動実行は落ちる", workflowProblems([{ name: "a.yml", source: SCHEDULED.replace("dev-notify", "nothing") }], FLOWS).length, 1);
ok("もう無い自動実行が台帳に残っていたら落ちる", workflowProblems([], FLOWS).length, 1);
const BOTH = { "a.yml": { records: "失敗を Slack に・測定値を Datadog に", evidence: ["scripts/slack/dev-notify.mjs", "scripts/monitoring/ci-metrics.mjs nightly"] } };
const MEASURED = SCHEDULED + "      - run: node scripts/monitoring/ci-metrics.mjs nightly --dir x\n";
ok("証拠が 2 つの自動実行は、両方が実物にあれば通る", workflowProblems([{ name: "a.yml", source: MEASURED }], BOTH), []);
ok("証拠が 2 つのうち 1 つ（測定値を積む段）を外すと落ちる", workflowProblems([{ name: "a.yml", source: SCHEDULED }], BOTH).length, 1);
ok("空の並び・文字でない証拠は書き方の違いで落ちる", [workflowProblems([{ name: "a.yml", source: MEASURED }], { "a.yml": { records: "x", evidence: [] } }).length, workflowProblems([{ name: "a.yml", source: MEASURED }], { "a.yml": { records: "x", evidence: ["scripts/slack/dev-notify.mjs", 1] } }).length], [1, 1]);

const NAMES = new Set(["count", "step"]);
ok("一覧にある項目は通る", fieldProblems(ts, "x.ts", 'logEvent({ level: "info", event: "cron.swept", fields: { step, count: removed } });', NAMES), []);
ok("一覧に無い項目は落ちる", fieldProblems(ts, "x.ts", 'logEvent({ level: "info", event: "a.b", fields: { title: page.title } });', NAMES).length, 1);
ok("展開した項目は確かめられないので落ちる", fieldProblems(ts, "x.ts", 'logEvent({ level: "info", event: "a.b", fields: { ...detail } });', NAMES).length, 1);
ok("変数で渡した項目も落ちる", fieldProblems(ts, "x.ts", 'logEvent({ level: "info", event: "a.b", fields: detail });', NAMES).length, 1);
ok("出来事の名前の形も見る", fieldProblems(ts, "x.ts", 'logEvent({ level: "info", event: "保存に失敗" });', NAMES).length, 1);
ok("組織の印を logEvent に直に渡す呼び出しは落ちる（置くのは入口の外枠だけ）", organizationProblems(ts, "src/lib/x.ts", 'logEvent({ level: "info", event: "a.b", organization: organization.id });').length, 1);
ok("組織の印を fields に入れる呼び出しも落ちる", organizationProblems(ts, "src/lib/x.ts", 'logEvent({ level: "info", event: "a.b", fields: { organization: id } });').length, 1);
ok("取りこぼしの受け皿は関所のヘッダから読んだ印を渡してよい", organizationProblems(ts, ORGANIZATION_PASSERS[0], 'logEvent({ level: "error", event: "request.unhandled", organization: organizationOf(request.headers) });'), []);

// ---------------------------------------------------------------------------
console.log("\n--- 2. 生の console ---");

const LEDGER_PATH = "src/lib/logging/log-ledger.json";
const ledger = existsSync(`${root}/${LEDGER_PATH}`) ? JSON.parse(read(LEDGER_PATH)) : {};
ok("台帳がある", existsSync(`${root}/${LEDGER_PATH}`), true, `直し方: ${LEDGER_PATH} を置く（rawConsole・routes・crons・workflows・fields）。`);

/** サーバーで動きうるコードの置き場。根の 4 つは入口の手前と立ち上げ。 */
const ROOT_FILES = ["src/instrumentation.ts", "instrumentation-client.ts", "src/proxy.ts", "src/auth.ts"].filter((file) => existsSync(`${root}/${file}`));
// src/app/.well-known/workflow は道具（workflow/next）が組み立てのときに書き出す生成物で、リポジトリのコードではない
// （eslint も同じ場所を除いている）。手元で組み立てたあとに残るので、数えると「組み立てたかどうか」で合否が変わる。
// 数えないのは**git が追跡していないものだけ**。場所で一律に外すと、ここに入口を置けば関門を素通りできてしまう。
// git に聞けなければ何も外さない（落ちる側に倒す）。
const GENERATED = "src/app/.well-known/workflow/";
const trackedGenerated = (() => {
  try { return execFileSync("git", ["ls-files", "-z", "--", GENERATED], { cwd: root, encoding: "utf8" }).split("\0").filter(Boolean); } catch { return null; }
})();
const skipGenerated = (file) => trackedGenerated !== null && file.startsWith(GENERATED) && !trackedGenerated.includes(file);
const codeFiles = [...walk("src/app", isCode), ...walk("src/lib", isCode), ...ROOT_FILES].filter((file) => !skipGenerated(file)).sort();
ok("生成物の置き場（src/app/.well-known/workflow）に、追跡中のファイルを置いていない", trackedGenerated, [], "直し方: 入口は src/app/ の通常の場所へ置く。ここは道具が書き出す場所で、追跡していないファイルは検査で数えない。");
const sources = new Map(codeFiles.map((file) => [file, read(file)]));
const found = new Map();
for (const [file, text] of sources) {
  // 字面に console が無いファイルは木を作らない（数百ファイルを毎回解くのを避ける）
  if (!text.includes("console")) continue;
  const count = consoleUses(ts, file, text);
  if (count > 0) found.set(file, count);
}
ok("見たファイルの数（置き場を読めている）", codeFiles.length > 300, true);
ok("生の console は免除の一覧と 1 件単位で一致する", consoleProblems(found, ledger.rawConsole, RAW_CONSOLE_CEILING), [], FIXES.console);
ok("ログを出す口（src/lib/logging/server-log.ts）の 2 か所は、出す口そのものとして一覧に載っている", (ledger.rawConsole ?? []).find((entry) => entry.file === "src/lib/logging/server-log.ts")?.count, 2);
// 免除ごとの項目は作らない（免除を減らすと項目数が減り、番人が「途中で止まった」と読むため）。理由の有無は上の 1 項目が見る

// ---------------------------------------------------------------------------
console.log("\n--- 3. 入口の台帳 ---");

const routes = codeFiles.filter((file) => file.startsWith("src/app/") && file.endsWith("/route.ts")).map((file) => ({ file, source: sources.get(file) }));
// 配布版は録音・リポジトリ・Slack・アプリ向け・組織の管理の窓口を外したので入口は 40（数え漏れで少なく出たら落とす）
ok("入口を数えた", routes.length >= 36, true);
ok("入口は 1 つ残らず台帳に載り、書いてあるとおりの外枠を通る", routeProblems(routes, ledger.routes), [], FIXES.route);
const bare = Object.entries(ledger.routes ?? {}).filter(([, entry]) => typeof entry === "object");
ok("外枠を通さない入口は Auth.js に預けた 1 つだけ（増やすときはここも見る）", bare.map(([file]) => file), ["src/app/api/auth/[...nextauth]/route.ts"], FIXES.route);

// ---------------------------------------------------------------------------
console.log("\n--- 4. 定期処理と自動実行の台帳 ---");

const vercel = JSON.parse(read("vercel.json"));
const scheduled = (Array.isArray(vercel.crons) ? vercel.crons : []).map((cron) => cron.path);
const cronRoutes = routes.filter((route) => route.file.startsWith("src/app/api/cron/"));
ok("定期処理を数えた", scheduled.length >= 1 && cronRoutes.length >= 1, true);
ok("定期処理は 1 つ残らず台帳に載り、記録を残す", cronProblems(scheduled, cronRoutes, ledger.crons), [], FIXES.cron);

const WORKFLOWS = ".github/workflows";
const workflows = readdirSync(`${root}/${WORKFLOWS}`)
  .filter((name) => /\.ya?ml$/.test(name))
  .sort()
  .map((name) => ({ name, source: read(`${WORKFLOWS}/${name}`) }))
  .filter((workflow) => runsUnattended(workflow.source));
// 個人配布版のリポジトリには予定実行・workflow_run のワークフローが無い（社内の見張り・夜間の検査は持ち込まない）。足したら台帳に載せる
ok("予定実行・workflow_run で動くワークフローの一覧", workflows.map((workflow) => workflow.name).sort(), []);
ok("自動実行は 1 つ残らず台帳に載り、記録の口が実物にある", workflowProblems(workflows, ledger.workflows), [], FIXES.workflow);

// ---------------------------------------------------------------------------
console.log("\n--- 5. 添える項目 ---");

const RECORD = read("src/lib/logging/log-record.ts");
const strings = objectKeys(ts, "src/lib/logging/log-record.ts", RECORD, "STRING_FIELDS");
const lists = objectKeys(ts, "src/lib/logging/log-record.ts", RECORD, "LIST_FIELDS");
const named = JSON.parse(read("src/lib/logging/log-fields.json"));
ok("通してよい一覧を読めた（文字・一覧・数・真偽）", [strings !== null && strings.length > 0, lists !== null && lists.length > 0, named.numbers.length > 0, named.booleans.length > 0], [true, true, true, true]);
const allowed = new Set([...(strings ?? []), ...(lists ?? []), ...named.numbers, ...named.booleans]);
ok("台帳が指す一覧の正本は実物と同じ", ledger.fields?.allowList, ["src/lib/logging/log-record.ts#STRING_FIELDS", "src/lib/logging/log-record.ts#LIST_FIELDS", "src/lib/logging/log-fields.json#numbers", "src/lib/logging/log-fields.json#booleans"]);

const callers = [...sources].filter(([, text]) => text.includes("logEvent("));
ok("logEvent を呼ぶファイルを数えた", callers.length >= 8, true);
ok("logEvent に添える項目は、どれも通してよい一覧にある", callers.flatMap(([file, text]) => fieldProblems(ts, file, text, allowed)), [], FIXES.field);
ok("組織の印を logEvent に直に渡す呼び出しは無い（入口の外枠が要求の組織を 1 度だけ置く）", callers.flatMap(([file, text]) => organizationProblems(ts, file, text, named.context)), [], FIXES.organization);
ok("外枠が置く項目の台帳（src/lib/logging/log-fields.json の context）は組織の印だけ", named.context, ["organization"]);
const unhandledCallers = [...sources].filter(([file, text]) => file !== "src/lib/logging/server-log.ts" && /\blogUnhandledEvent\s*\(/.test(text)).map(([file]) => file);
ok("組織の目印を渡せる専用の口（logUnhandledEvent）を呼ぶのは取りこぼしの受け皿だけ", unhandledCallers, ORGANIZATION_PASSERS, FIXES.organization);

// 一覧に無い項目が実際に出ないこと（伏せ方）は check-server-log が実物を動かして見ている。ここでは重ねず、その項目が残っていることだけを固定する
const provenBy = ledger.fields?.provenBy ?? "";
ok("伏せ方を動かして確かめる検査表を台帳が指している", provenBy, "tests/checks/check-server-log.mjs");
const PROOF = existsSync(`${root}/${provenBy}`) && provenBy !== "" ? read(provenBy) : "";
for (const label of ledger.fields?.proofs ?? []) {
  ok(`伏せ方の検査が残っている: ${label}`, PROOF.includes(`ok("${label}"`), true);
}
ok("伏せ方の検査を 3 つ以上指している", (ledger.fields?.proofs ?? []).length >= 3, true);

console.log(`\n${fails === 0 ? "すべて合格" : `不合格 ${fails} 件`}`);
if (fails > 0) process.exitCode = 1;
