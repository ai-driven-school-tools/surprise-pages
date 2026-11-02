/**
 * 機能のスイッチの台帳（src/lib/settings/environment.json の featureSwitch 欄）を読む口と、決まりの判定。
 * 決まりの文書は docs/guides/feature-switches.md。検査は tests/checks/check-feature-switches.mjs、
 * 期限切れは CI を赤にせず、下の一覧の出力で印を付けて見せるだけ（配布版は Slack への週 1 回の知らせを外した）。
 *
 *   node scripts/rules/feature-switches.mjs     台帳を一覧で出す（期限切れには印を付ける）
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const catalog = JSON.parse(readFileSync(new URL("../../src/lib/settings/environment.json", import.meta.url), "utf8"));

/** 環境変数の一覧（台帳に載っていない名前も含む）。 */
export const ENVIRONMENT = catalog.variables;

/** 台帳に載っているスイッチ。1 つの環境変数が 1 つのスイッチ。 */
export const SWITCH_LEDGER = ENVIRONMENT.filter((one) => one.featureSwitch).map((one) => ({
  name: one.name, purpose: one.purpose, feature: one.feature, scope: one.scope, ...one.featureSwitch,
}));

/**
 * スイッチではない印の種類。配備の種類（platform）と手元の確認だけの印（local）は、
 * 利用者に見せる機能を出し入れしないので台帳に載せない。
 */
export const NOT_SWITCH_SCOPES = ["platform", "local"];

/** 期限の上限。1 年より先の期限は「消さない」と同じなので受け取らない。 */
export const MAX_DAYS_AHEAD = 366;

/** 日本時間の今日（YYYY-MM-DD）。期限は日本時間の日付で読む。 */
export function todayInTokyo(now = new Date()) {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/** 期限（removeBy）を過ぎたスイッチ。期限の日の当日はまだ過ぎていない。 */
export function expiredSwitches(ledger, today) {
  return ledger.filter((one) => one.removeBy < today);
}

const ENV_NAME = "[A-Z][A-Z0-9_]+";
const QUOTED = `["'\`]([^"'\`]*)["'\`]`;

/**
 * ソースの中で「環境変数の値を決まった文字と比べている」読み方を拾う。これがスイッチの形。
 * 返すのは { name, literal } の並び。literal が "off" のものは、未設定で入っている読み方。
 *
 * 拾う形:
 *   process.env.NAME === "on"      process.env.NAME !== "off"      "on" === process.env.NAME
 *   (process.env.NAME ?? "") === "shared"
 *   ["on", "shared"].includes(process.env.NAME ?? "")
 *   const FLAG = "NAME"; … process.env[FLAG] !== "1"
 */
export function detectSwitchReads(source) {
  const found = [];
  const constants = new Map([...source.matchAll(new RegExp(`\\b([A-Za-z_$][\\w$]*)\\s*=\\s*"(${ENV_NAME})"`, "g"))].map((match) => [match[1], match[2]]));
  const direct = `process\\.env(?:\\.(${ENV_NAME})|\\[\\s*(?:"(${ENV_NAME})"|([A-Za-z_$][\\w$]*))\\s*\\])`;
  const nameOf = (match, offset) => match[offset] ?? match[offset + 1] ?? constants.get(match[offset + 2] ?? "");
  for (const match of source.matchAll(new RegExp(`${direct}\\s*(?:\\?\\?\\s*${QUOTED}\\s*\\)?\\s*)?[!=]==?\\s*${QUOTED}`, "g"))) {
    const name = nameOf(match, 1);
    if (name) found.push({ name, literal: match[5] });
  }
  for (const match of source.matchAll(new RegExp(`${QUOTED}\\s*[!=]==?\\s*${direct}`, "g"))) {
    const name = nameOf(match, 2);
    if (name) found.push({ name, literal: match[1] });
  }
  for (const match of source.matchAll(new RegExp(`\\[([^\\]]*)\\]\\s*\\.includes\\(\\s*${direct}`, "g"))) {
    const name = nameOf(match, 2);
    if (!name) continue;
    for (const literal of match[1].matchAll(new RegExp(QUOTED, "g"))) found.push({ name, literal: literal[1] });
  }
  return found;
}

/**
 * 台帳の書き方の決まり。返すのは直す点の文（空なら合格）。期限切れはここでは問題にしない
 * （期限切れで CI を赤にすると、関係の無い全員の PR が止まる）。
 */
export function ledgerProblems(ledger, { today, bornOnExceptions }) {
  const problems = [];
  const names = new Set(ledger.map((one) => one.name));
  const latest = new Date(`${today}T00:00:00Z`);
  latest.setUTCDate(latest.getUTCDate() + MAX_DAYS_AHEAD);
  const limit = latest.toISOString().slice(0, 10);
  for (const one of ledger) {
    if (NOT_SWITCH_SCOPES.includes(one.scope)) problems.push(`${one.name}: 配備や手元の印（${one.scope}）はスイッチの台帳に載せない`);
    if (typeof one.owner !== "string" || !/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/.test(one.owner)) problems.push(`${one.name}: 持ち主（owner）に GitHub のアカウント名を書く`);
    if (typeof one.purpose !== "string" || one.purpose.trim().length === 0) problems.push(`${one.name}: 目的（purpose）を書く`);
    if (typeof one.cleanup !== "string" || one.cleanup.trim().length === 0) problems.push(`${one.name}: 片付けで消すもの（cleanup）を書く`);
    if (typeof one.removeBy !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(one.removeBy) || Number.isNaN(Date.parse(`${one.removeBy}T00:00:00Z`))) problems.push(`${one.name}: 片付けの期限（removeBy）を YYYY-MM-DD で書く`);
    else if (one.removeBy > limit) problems.push(`${one.name}: 片付けの期限は 1 年以内にする（${one.removeBy}）`);
    const hasUnset = one.unset !== undefined, hasFollows = one.follows !== undefined;
    if (hasUnset === hasFollows) problems.push(`${one.name}: 未設定のときの動き（unset）か、親のスイッチ（follows）のどちらか 1 つを書く`);
    if (hasUnset && !["off", "on"].includes(one.unset)) problems.push(`${one.name}: unset は off か on`);
    if (one.unset === "on" && !(one.name in bornOnExceptions)) problems.push(`${one.name}: 新しいスイッチは切った状態で生まれる（unset: off）。未設定で入るのは決まりより前からある例外だけ`);
    if (hasFollows) {
      const parent = ledger.find((other) => other.name === one.follows);
      if (!parent) problems.push(`${one.name}: 親のスイッチ ${one.follows} が台帳に無い`);
      else if (parent.unset !== "off") problems.push(`${one.name}: 親のスイッチ ${one.follows} は切った状態で生まれるものにする`);
    }
  }
  for (const name of Object.keys(bornOnExceptions)) {
    const one = ledger.find((entry) => entry.name === name);
    if (!one || one.unset !== "on") problems.push(`${name}: もう例外ではないので、例外の一覧から外す（例外は減る方向にだけ動かす）`);
  }
  if (names.size !== ledger.length) problems.push("台帳の名前が重なっている");
  return problems;
}

/**
 * コードの読み方と台帳の突き合わせ。reads は detectSwitchReads の結果にファイル名を足したもの。
 * 返すのは直す点の文（空なら合格）。
 */
export function codeProblems(ledger, environment, reads) {
  const problems = [];
  const scopeOf = new Map(environment.map((one) => [one.name, one.scope]));
  const byName = new Map(ledger.map((one) => [one.name, one]));
  for (const read of reads) {
    if (NOT_SWITCH_SCOPES.includes(scopeOf.get(read.name) ?? "")) continue;
    const entry = byName.get(read.name);
    if (!entry) { problems.push(`${read.file}: ${read.name} はスイッチの読み方をしているのに台帳（src/lib/settings/environment.json の featureSwitch）に無い`); continue; }
    const unsetOn = read.literal === "off";
    if (entry.unset === "off" && unsetOn) problems.push(`${read.file}: ${read.name} は台帳では未設定で切なのに、"off" と比べている（未設定で入ってしまう）`);
    if (entry.unset === "on" && !unsetOn) problems.push(`${read.file}: ${read.name} は台帳では未設定で入なのに、"${read.literal}" と比べている`);
  }
  return problems;
}

function main() {
  const today = todayInTokyo();
  const expired = new Set(expiredSwitches(SWITCH_LEDGER, today).map((one) => one.name));
  console.log(`機能のスイッチの台帳（${SWITCH_LEDGER.length} 件・今日 ${today}・決まりは docs/guides/feature-switches.md）\n`);
  for (const one of SWITCH_LEDGER) {
    const state = one.follows ? `親 ${one.follows} に従う` : one.unset === "off" ? "未設定で切" : "未設定で入（例外）";
    console.log(`${expired.has(one.name) ? "期限切れ" : "期限内  "}  ${one.name}`);
    console.log(`          持ち主 ${one.owner} / 期限 ${one.removeBy} / ${state} / 機能 ${one.feature}`);
    console.log(`          目的 ${one.purpose}`);
    console.log(`          片付け ${one.cleanup}`);
  }
  console.log(`\n期限切れ ${expired.size} 件`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) main();
