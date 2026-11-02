/**
 * ログの決まりの判定。ここは**純関数だけ**で、ファイルも台帳も読まない。
 * 読んで渡すのは検査表（tests/checks/check-log-rules.mjs）。台帳は src/lib/logging/log-ledger.json。
 *
 * 見るのは 4 つ。
 *   1. 生の console（共通の関数 logEvent を通さない出力）が、免除の一覧と 1 件単位で一致するか
 *   2. サーバーの入口（app の route.ts）が 1 つ残らず台帳に載り、書いてあるとおりの外枠を通るか
 *   3. 定期処理（vercel.json の crons）と自動実行（schedule を持つワークフロー）が台帳に載っているか
 *   4. logEvent に添える項目の名前が、通してよい一覧にあるか（無い名前は黙って落ちる＝記録が抜ける）。
 *      組織の印（organization）は入口の外枠が置くもので、呼ぶ側が渡していないか
 *
 * どの判定も、問題を「何が・どう直すか」の文で返す。空の配列が合格。
 */

/** 落ちたときに出す直し方。検査表がそのまま出す。 */
export const FIXES = {
  console:
    "直し方: 生の console をやめて src/lib/logging/server-log.ts の logEvent を使う（書き方は docs/guides/server-logs.md）。" +
    "ブラウザで動くコードなど logEvent を使えない場所だけ、src/lib/logging/log-ledger.json の rawConsole に理由つきで載せる" +
    "（一覧は減る方向だけ。上限は tests/checks/check-log-rules.mjs の RAW_CONSOLE_CEILING）。",
  route:
    "直し方: 入口を routeLog（アプリ向けの窓口は apiV1）で包み、src/lib/logging/log-ledger.json の routes に " +
    '"src/app/…/route.ts": "routeLog"（または "apiV1"）を足す。包めない入口だけ { "none": "理由" } と書く。',
  cron:
    "直し方: 定期処理の入口で logEvent を呼び（何を何件したか・どの段で落ちたか）、src/lib/logging/log-ledger.json の crons に載せる。",
  workflow:
    "直し方: src/lib/logging/log-ledger.json の workflows に、記録の残し方（records と、その証拠になる字面 evidence）か、" +
    '残さない理由（{ "none": "理由" }）を書く。知らせは scripts/slack/dev-notify.mjs の 1 本を使う。',
  field:
    "直し方: 添える項目の名前を通してよい一覧に載せる（数と真偽は src/lib/logging/log-fields.json、文字は src/lib/logging/log-record.ts の STRING_FIELDS）。" +
    "一覧に無い名前は logEvent が黙って落とす。fields は字面の { 名前: 値 } で書く。",
  organization:
    "直し方: 組織の印（organization）を logEvent に渡さない。入口の外枠（src/lib/logging/server-log.ts の routeLog・apiV1）が要求の組織を 1 度だけ置き、" +
    "中で書いた行に自動で付ける。入口の外で組織を書きたくなったら、その処理を入口の中（inBackground）で走らせる。",
};

/** 組織の印を logEvent に直に渡してよいファイル。外枠を通らない失敗を受ける取りこぼしの受け皿だけ（関所のヘッダから読む）。 */
export const ORGANIZATION_PASSERS = ["src/instrumentation.ts"];

const EVENT = /^[a-z][a-z0-9]*([._-][a-z0-9]+)*$/;

/**
 * 1 ファイルの中の、生の console の数（`console.warn(…)`・`console[…](…)`・`const { warn } = console`）。
 * コメントと文字列の中は数えない（構文の木で見る）。`x.console` のような欄の名前も数えない。
 */
export function consoleUses(ts, fileName, text) {
  const source = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true, scriptKind(ts, fileName));
  let count = 0;
  const visit = (node) => {
    if (ts.isIdentifier(node) && node.text === "console" && !isNamePosition(ts, node)) count += 1;
    ts.forEachChild(node, visit);
  };
  visit(source);
  return count;
}

function scriptKind(ts, fileName) {
  if (fileName.endsWith(".tsx")) return ts.ScriptKind.TSX;
  if (fileName.endsWith(".jsx")) return ts.ScriptKind.JSX;
  if (/\.(mjs|cjs|js)$/.test(fileName)) return ts.ScriptKind.JS;
  return ts.ScriptKind.TS;
}

/** `x.console` や `{ console: … }` の名前の側（console そのものを指していない）。 */
function isNamePosition(ts, node) {
  const parent = node.parent;
  if (parent === undefined) return false;
  if (ts.isShorthandPropertyAssignment(parent)) return false;
  return "name" in parent && parent.name === node;
}

/**
 * 免除の一覧と、実際に見つかった数を突き合わせる。
 * 増えても（一覧に無い・一覧より多い）減っても（一覧に残ったまま）落とす。上限を超える一覧も落とす。
 */
export function consoleProblems(found, exemptions, ceiling) {
  const problems = [];
  const listed = new Map();
  for (const entry of Array.isArray(exemptions) ? exemptions : []) {
    if (typeof entry?.file !== "string" || !Number.isInteger(entry?.count) || entry.count < 1) {
      problems.push(`免除の一覧の形が違う: ${JSON.stringify(entry)}（file・count・reason が要る）`);
      continue;
    }
    if (typeof entry.reason !== "string" || entry.reason.trim().length < 10) problems.push(`${entry.file}: 免除の理由が無い（10 字以上で書く）`);
    if (listed.has(entry.file)) problems.push(`${entry.file}: 免除の一覧に 2 度載っている`);
    listed.set(entry.file, entry.count);
  }
  for (const [file, count] of found) {
    const allowed = listed.get(file);
    if (allowed === undefined) problems.push(`${file}: 生の console が ${count} か所ある（免除の一覧に無い）`);
    else if (count > allowed) problems.push(`${file}: 生の console が ${count} か所ある（免除は ${allowed} か所まで）`);
    else if (count < allowed) problems.push(`${file}: 生の console は ${count} か所に減った。免除の一覧の count を ${count} に下げる`);
  }
  for (const [file, allowed] of listed) {
    if (!found.has(file)) problems.push(`${file}: 免除の一覧に載っているが、生の console はもう無い（${allowed} か所ぶんを一覧から消す）`);
  }
  const total = [...listed.values()].reduce((sum, count) => sum + count, 0);
  if (total > ceiling) problems.push(`免除の合計 ${total} か所が上限 ${ceiling} を超えた（一覧は減る方向だけ。足さずに logEvent へ寄せる）`);
  if (total < ceiling) problems.push(`免除の合計が ${total} か所に減った。上限（RAW_CONSOLE_CEILING）も ${total} に下げる（戻れなくするため）`);
  return problems;
}

/** 台帳の 1 件が「記録しない（理由つき）」か。理由が空なら null ではなく問題にするので、形だけ見る。 */
function skipReason(entry) {
  if (typeof entry !== "object" || entry === null || !("none" in entry)) return undefined;
  return typeof entry.none === "string" ? entry.none.trim() : "";
}

const WRAPPERS = { routeLog: /\brouteLog\(\s*"/, apiV1: /\bapiV1\(\s*"/ };

/**
 * 入口（route.ts）と台帳を突き合わせる。`routes` は [{ file, source }]。
 * 台帳に無い入口・もう無い入口・書いてある外枠と実物の食い違いを返す。
 */
export function routeProblems(routes, ledger) {
  const problems = [];
  const entries = typeof ledger === "object" && ledger !== null ? ledger : {};
  const present = new Set(routes.map((route) => route.file));
  for (const { file, source } of routes) {
    if (!(file in entries)) {
      problems.push(`${file}: 台帳（routes）に無い入口`);
      continue;
    }
    const entry = entries[file];
    const reason = skipReason(entry);
    const used = Object.keys(WRAPPERS).filter((name) => WRAPPERS[name].test(source));
    if (reason !== undefined) {
      if (reason.length < 10) problems.push(`${file}: 外枠を通さない理由が無い（10 字以上で書く）`);
      if (used.length > 0) problems.push(`${file}: 台帳では外枠を通さないことになっているが、${used.join("・")} を通っている（台帳を直す）`);
    } else if (typeof entry === "string" && entry in WRAPPERS) {
      if (!WRAPPERS[entry].test(source)) problems.push(`${file}: 台帳では ${entry} を通ることになっているが、通っていない`);
    } else {
      problems.push(`${file}: 台帳の書き方が違う（"routeLog"・"apiV1"・{ "none": "理由" } のどれか）`);
    }
  }
  for (const file of Object.keys(entries)) {
    if (!present.has(file)) problems.push(`${file}: 台帳（routes）に載っているが、入口はもう無い（台帳から消す）`);
  }
  return problems;
}

/** 置き場所から道筋を出す（src/app/api/cron/views/route.ts → /api/cron/views）。 */
export const pathOfRoute = (file) => file.replace(/^src\/app/, "").replace(/\/route\.ts$/, "");

/**
 * 定期処理と台帳を突き合わせる。`scheduled` は vercel.json の crons の道筋、
 * `cronRoutes` は src/app/api/cron の下の入口 [{ file, source }]。
 */
export function cronProblems(scheduled, cronRoutes, ledger) {
  const problems = [];
  const entries = typeof ledger === "object" && ledger !== null ? ledger : {};
  const sources = new Map(cronRoutes.map((route) => [pathOfRoute(route.file), route.source]));
  for (const path of new Set([...scheduled, ...sources.keys()])) {
    if (!(path in entries)) {
      problems.push(`${path}: 台帳（crons）に無い定期処理`);
      continue;
    }
    const source = sources.get(path);
    if (source === undefined) {
      problems.push(`${path}: vercel.json にあるが、入口（app${path}/route.ts）が無い`);
      continue;
    }
    const reason = skipReason(entries[path]);
    if (reason !== undefined) {
      if (reason.length < 10) problems.push(`${path}: 記録しない理由が無い（10 字以上で書く）`);
    } else if (typeof entries[path]?.records !== "string" || entries[path].records.trim() === "") {
      problems.push(`${path}: 台帳の書き方が違う（{ "records": "何を残すか" } か { "none": "理由" }）`);
    } else if (!/\blogEvent\(/.test(source)) {
      problems.push(`${path}: 台帳では記録することになっているが、入口が logEvent を呼んでいない`);
    }
  }
  for (const path of Object.keys(entries)) {
    if (!scheduled.includes(path) && !sources.has(path)) problems.push(`${path}: 台帳（crons）に載っているが、定期処理はもう無い（台帳から消す）`);
  }
  return problems;
}

/** ワークフローが予定実行（schedule の cron）を持つか。コメントの行は見ない。 */
export function hasSchedule(source) {
  const lines = source.split("\n").filter((line) => !line.trim().startsWith("#"));
  return lines.some((line) => /^\s*schedule:\s*(#.*)?$/.test(line)) && lines.some((line) => /^\s*-\s*cron:\s*\S/.test(line));
}

/** ワークフローが、ほかのワークフローの終わりで動く（workflow_run）か。コメントの行は見ない。 */
export function hasWorkflowRun(source) {
  return source.split("\n").some((line) => !line.trim().startsWith("#") && /^\s*workflow_run:\s*(#.*)?$/.test(line));
}

/** 人が押さなくても動く（予定実行か、ほかのワークフローの終わりで動く）か。台帳に載せる対象。 */
export const runsUnattended = (source) => hasSchedule(source) || hasWorkflowRun(source);

/** 自動実行と台帳を突き合わせる。`workflows` は人が押さなくても動くものだけの [{ name, source }]。 */
export function workflowProblems(workflows, ledger) {
  const problems = [];
  const entries = typeof ledger === "object" && ledger !== null ? ledger : {};
  const present = new Set(workflows.map((workflow) => workflow.name));
  for (const { name, source } of workflows) {
    if (!(name in entries)) {
      problems.push(`${name}: 台帳（workflows）に無い自動実行`);
      continue;
    }
    const entry = entries[name];
    const reason = skipReason(entry);
    if (reason !== undefined) {
      if (reason.length < 10) problems.push(`${name}: 記録しない理由が無い（10 字以上で書く）`);
    } else {
      // 証拠は字面 1 つか、その並び（残す先が 2 つあるとき。例: 知らせは Slack・測定値は Datadog）。並びは全部が実物にあること
      const evidence = Array.isArray(entry?.evidence) ? entry.evidence : [entry?.evidence];
      if (typeof entry?.records !== "string" || entry.records.trim() === "" || evidence.length === 0 || evidence.some((one) => typeof one !== "string" || one.trim() === "")) {
        problems.push(`${name}: 台帳の書き方が違う（{ "records": "何を残すか", "evidence": "その字面（複数なら並び）" } か { "none": "理由" }）`);
      } else {
        for (const one of evidence) if (!source.includes(one)) problems.push(`${name}: 台帳の証拠（${one}）がワークフローに無い（記録の口が外れた）`);
      }
    }
  }
  for (const name of Object.keys(entries)) {
    if (!present.has(name)) problems.push(`${name}: 台帳（workflows）に載っているが、自動で動くワークフロー（予定実行・workflow_run）はもう無い（台帳から消す）`);
  }
  return problems;
}

/** `const 名前 = { … }` の、字面で書いた欄の名前（src/lib/logging/log-record.ts の STRING_FIELDS など）。見つからなければ null。 */
export function objectKeys(ts, fileName, text, constName) {
  const source = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true, scriptKind(ts, fileName));
  let keys = null;
  const visit = (node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === constName && node.initializer !== undefined && ts.isObjectLiteralExpression(node.initializer)) {
      keys = node.initializer.properties.map((property) => (property.name !== undefined && (ts.isIdentifier(property.name) || ts.isStringLiteral(property.name)) ? property.name.text : null));
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return keys === null || keys.includes(null) ? null : keys;
}

/**
 * 組織の印を logEvent に直に渡している呼び出し（`organization: …` か `fields: { organization: … }`）。
 * 置くのは入口の外枠だけで、呼ぶ側の型（src/lib/logging/server-log.ts の LogEvent）も受け取らない。型を外す書き方（JS・キャスト）で渡したものをここで落とす。
 * 外枠の外の失敗に組織を付ける取りこぼしの受け皿（ORGANIZATION_PASSERS）は専用の口 logUnhandledEvent を使う。
 */
export function organizationProblems(ts, fileName, text, contextNames = ["organization"]) {
  if (ORGANIZATION_PASSERS.includes(fileName)) return [];
  const source = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true, scriptKind(ts, fileName));
  const problems = [];
  const at = (node) => `${fileName}:${source.getLineAndCharacterOfPosition(node.getStart()).line + 1}`;
  const nameOf = (property) => (property.name !== undefined && (ts.isIdentifier(property.name) || ts.isStringLiteral(property.name)) ? property.name.text : null);
  const visit = (node) => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "logEvent") {
      const input = node.arguments[0];
      if (input !== undefined && ts.isObjectLiteralExpression(input)) {
        for (const property of input.properties) {
          const name = nameOf(property);
          if (name !== null && contextNames.includes(name)) problems.push(`${at(property)}: 外枠が置く項目「${name}」を logEvent に直に渡している`);
          if (name === "fields" && ts.isPropertyAssignment(property) && ts.isObjectLiteralExpression(property.initializer)) {
            for (const field of property.initializer.properties) if (contextNames.some((context) => (nameOf(field) ?? "").startsWith(context))) problems.push(`${at(field)}: 外枠が置く項目「${nameOf(field)}」を fields に入れている`);
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return problems;
}

/**
 * 1 ファイルの中の logEvent の呼び出しを見て、添える項目の名前が一覧にあるかを返す。
 * fields を字面で書いていない（変数・展開）ものは、名前を確かめられないので問題にする。
 */
export function fieldProblems(ts, fileName, text, allowed) {
  const source = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true, scriptKind(ts, fileName));
  const problems = [];
  const at = (node) => `${fileName}:${source.getLineAndCharacterOfPosition(node.getStart()).line + 1}`;
  const visit = (node) => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "logEvent") {
      const input = node.arguments[0];
      if (input === undefined || !ts.isObjectLiteralExpression(input)) {
        problems.push(`${at(node)}: logEvent には字面の { level, event, … } を渡す（項目の名前を確かめられない）`);
      } else {
        for (const property of input.properties) {
          const name = property.name !== undefined && ts.isIdentifier(property.name) ? property.name.text : null;
          if (name === "event" && ts.isPropertyAssignment(property) && ts.isStringLiteralLike(property.initializer) && !EVENT.test(property.initializer.text)) {
            problems.push(`${at(property)}: 出来事の名前の形が違う（${property.initializer.text}）。小文字を . - _ で区切る`);
          }
          if (name !== "fields") continue;
          if (!ts.isPropertyAssignment(property) || !ts.isObjectLiteralExpression(property.initializer)) {
            problems.push(`${at(property)}: fields は字面の { 名前: 値 } で書く（項目の名前を確かめられない）`);
            continue;
          }
          for (const field of property.initializer.properties) {
            const key = field.name !== undefined && (ts.isIdentifier(field.name) || ts.isStringLiteral(field.name)) ? field.name.text : null;
            if (key === null) problems.push(`${at(field)}: fields の中は字面の名前だけ（展開・計算した名前は確かめられない）`);
            else if (!allowed.has(key)) problems.push(`${at(field)}: 項目「${key}」は通してよい一覧に無い（ログには出ずに落ちる）`);
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return problems;
}
