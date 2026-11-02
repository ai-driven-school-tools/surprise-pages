/**
 * サーバーのログ（src/lib/logging/log-record.ts・src/lib/logging/server-log.ts）が、決まった 1 つの形で出て、
 * 出してはいけないものを 1 字も出さないかを確かめる。
 *
 * いちばん大事なのは伏せ方。Pages は社内資料を配る製品なので、ログに
 * **本文・題名・メールアドレス・ページの呼び名・ヘッダ・問い合わせ文字列**が混ざると、
 * ログを集める先（Vercel の記録・あとで足す外の道具）へそのまま漏れる。
 * 伏せ方は「出してはいけない語を探す」ではなく「通してよい項目だけ通す」。
 * ここでは、題名・アドレス・呼び名を**あらゆる入れ口**に混ぜて失敗させ、1 字も出ないことを見る。
 *
 * 見るのは 7 つ（個人配布版はアプリ向けの窓口 apiV1 を外したので、もとの 4 は無い）。
 *   1. 伏せ方（純関数）：エラーの文面・場所・符号・添える項目・受け口の型
 *   2. 1 行の形：時刻・重さ・出来事の名前・受け口の型・要求の目印・版・かかった時間
 *   3. 入口の外枠（routeLog）：投げっぱなしの失敗・500 の応答・共通の後始末
 *   5. 定期処理（src/app/api/cron/views）と、裏で走る処理
 *   6. 取りこぼしの受け皿（src/instrumentation.ts）
 *   7. 要求の目印を付ける関所（src/proxy.ts）と、エラー画面の番号
 *   8. 入口の字面：どの入口も外枠を通り、受け口の型が自分の置き場所と一致する
 *
 * 保管庫にも配信網にも繋がない。組み立てた関数と、ファイルの字面を見る。
 */
import { readFile, readdir, writeFile } from "node:fs/promises";

import { root, dir, companyDeployment } from "./paths.mjs";
const { build } = await import(`${root}/node_modules/esbuild/lib/main.js`);

const read = (path) => readFile(`${root}/${path}`, "utf8");

let fails = 0;
const ok = (label, actual, expected) => {
  const pass = JSON.stringify(actual) === JSON.stringify(expected);
  if (!pass) fails += 1;
  console.log(`${pass ? "OK  " : "NG  "} ${label}: ${JSON.stringify(actual)}（期待: ${JSON.stringify(expected)}）`);
};

// 出してはいけないもの。どれも本物ではない
const TITLE = "来期の人員計画（極秘）";
const EMAIL = "tanaka.hanako@example.com";
const SLUG = "internal/keiei/jinin-keikaku-2027";
const BODY = "この段落は本文です";
const QUERY = "?kind=draft&who=tanaka";
const HEADER = "Bearer spg_abcdefghijklmnopqrstuvwxyz";
// 2 つ目の組織（見本商事 の見本と同じ値）。ログに出してよいのは目印（uuid）だけで、名前・呼び名・宛先・ドメインは出さない
const MIHON = { id: "00000000-0000-4000-8000-000000000002", name: "見本商事", slug: "mihon", host: "mihon.pages.example.com", domain: "mihon.example" };
const FIRST_ORGANIZATION_ID = "00000000-0000-4000-8000-000000000001";
const SECRETS = [TITLE, EMAIL, SLUG, BODY, "tanaka", "jinin-keikaku", "keiei", "極秘", "kind=draft", "spg_abcdefghijklmnopqrstuvwxyz", "example.com", MIHON.name, MIHON.slug, MIHON.domain];
/** 出してはいけないものが 1 字でも混ざっていたら、その語を返す。無ければ「なし」。 */
const leaked = (text) => SECRETS.find((secret) => text.includes(secret)) ?? "なし";

/** 題名・アドレス・呼び名が文面に入った失敗（保存先の重複の断り文を模したもの）。 */
const dirtyError = () => {
  const error = new Error(`duplicate key value violates unique constraint "pages_slug_key": (${SLUG}) 「${TITLE}」 by ${EMAIL} ${BODY}`);
  error.code = "23505";
  return error;
};

/** 標準の出力を覗く。ログは 1 行ずつここに積まれる。 */
const capture = async (run) => {
  const lines = [];
  const held = { log: console.log, info: console.info, warn: console.warn, error: console.error };
  for (const stream of Object.keys(held)) console[stream] = (...parts) => lines.push({ stream, text: parts.map(String).join(" ") });
  try {
    const result = await run();
    return { result, lines };
  } catch (thrown) {
    return { thrown, lines };
  } finally {
    Object.assign(console, held);
  }
};
const parsed = (line) => {
  try {
    return JSON.parse(line.text);
  } catch {
    return null;
  }
};
const allText = (lines) => lines.map((line) => line.text).join("\n");

/**
 * 相対の読み込みを偽物に差し替える（保管庫や名乗りを連れて来ないため）。
 * 組み立て済みのファイル（.mjs）は外部参照にして、同じ 1 つの実体を共有させる
 * （ログの外枠は要求ごとの控えを持つので、写しが 2 つあると受け口と目印が引き継がれない）。
 */
const stubs = (table) => ({
  name: "stubs",
  setup(setup) {
    setup.onResolve({ filter: /.*/ }, (args) => {
      const hit = Object.keys(table).find((name) => args.path === name || args.path.endsWith(`/${name}`));
      return hit === undefined ? undefined : { path: table[hit], external: true };
    });
  },
});
const bundle = (entry, outfile, plugins = []) =>
  build({ entryPoints: [`${root}/${entry}`], outfile: `${dir}/${outfile}`, bundle: true, format: "esm", platform: "node", external: ["node:*"], plugins: [companyDeployment, ...plugins], logLevel: "silent" });

await bundle("src/lib/logging/log-record.ts", "log-record.mjs");
await bundle("src/lib/logging/server-log.ts", "server-log.mjs");
const { logRecord, logLine, describeError, requestIdFrom, newRequestId, REQUEST_ID_HEADER } = await import(`${dir}/log-record.mjs`);

const ENV = { VERCEL_GIT_COMMIT_SHA: "1534efe0a1b2c3d4e5f60718293a4b5c6d7e8f90", VERCEL_ENV: "preview", VERCEL_TARGET_ENV: "preview" };
const NOW = new Date("2026-10-01T03:04:05.678Z");
const ID = "0123456789abcdef";

// ---------------------------------------------------------------------------
console.log("--- 1. 伏せ方（通してよい項目だけ通す）---");

const dirty = describeError(dirtyError());
ok("エラーの種類は残る", dirty.kind, "Error");
ok("保存先の符号（決まった語彙）は残る", dirty.code, "23505");
ok("決めた型でないエラーの文面は残さない", "message" in dirty, false);
ok("起きた場所が残る（この検査表の中）", /check-server-log\.mjs:\d+:\d+/.test(dirty.at ?? ""), true);
ok("場所の一覧も残る", dirty.stack.length > 0, true);
ok("種類・場所・符号のどこにも題名・アドレス・呼び名が無い", leaked(JSON.stringify(dirty)), "なし");

class SetupError extends Error {
  constructor(message) {
    super(message);
    this.name = "SetupError";
  }
}
ok("決めた型（設置の不足）の文面は通す", describeError(new SetupError("保存先に繋がりません")).message, "保存先に繋がりません");
class SlugConflictError extends Error {}
const conflict = describeError(new SlugConflictError(`${SLUG} は使えません`));
ok("名前を付けていない型は、型の名前で呼ぶ", conflict.kind, "SlugConflictError");
ok("呼び名の入った断り文は通さない", leaked(JSON.stringify(conflict)), "なし");

const named = new Error("x");
named.name = `${EMAIL} のエラー`;
ok("種類の名前に文が入っていたら捨てる", describeError(named).kind, "Error");
const coded = new Error("x");
coded.code = `${SLUG}`;
ok("符号の欄に呼び名が入っていたら捨てる", "code" in describeError(coded), false);
ok("符号は大文字と数字の語彙だけ（小文字の語は呼び名と見分けられない）", ["23505", "ECONNRESET", "PGRST205", "intro", "theme_conflict", "Guide2027"].map((code) => "code" in describeError(Object.assign(new Error("x"), { code }))), [true, true, true, false, false, false]);

const fakeFrames = new Error(`保存に失敗\n    at ${EMAIL} (/${SLUG}/route.ts:1:2)`);
ok("文面の中の「場所に見える行」を場所として読まない", leaked(JSON.stringify(describeError(fakeFrames))), "なし");
const rewritten = new Error(`1 行目\n    at ${EMAIL} (/${SLUG}/x.ts:3:4)`);
rewritten.message = "あとから書き換えた";
ok("文面を書き換えたエラーでも漏れない", leaked(JSON.stringify(describeError(rewritten))), "なし");
const strangeStack = new Error("x");
strangeStack.stack = `Error: x\n    at ${TITLE} (${SLUG}:1:1)\n    at ok (/var/task/.next/server/chunks/12.js:3:4)`;
ok("場所の行に使えない字があれば、その行だけ捨てる", describeError(strangeStack).stack, ["ok (.next/server/chunks/12.js:3:4)"]);
ok("組み立てた置き場は .next からの道筋にする", describeError(strangeStack).at, "ok (.next/server/chunks/12.js:3:4)");
const home = new Error("x");
home.stack = "Error: x\n    at run (/Users/tanaka/src/app/lib/foo.ts:10:2)\n    at node:internal/process/task_queues:95:5";
ok("手元の絶対の道筋は末尾だけ残す（持ち主の名前を出さない）", describeError(home).at, "run (app/lib/foo.ts:10:2)");

ok("エラーでない値は、値を出さずに種類だけ", describeError(`${TITLE}`), { kind: "non-error:string", at: null, stack: [] });
ok("保存先が返す素の値（文面と符号）は符号だけ", describeError({ message: `${TITLE}`, code: "PGRST205" }), { kind: "non-error:object", at: null, stack: [], code: "PGRST205" });
const wrapped = new Error(`${TITLE} を保存できません`, { cause: dirtyError() });
const cause = describeError(wrapped).cause;
ok("元になった失敗は種類と符号だけ連れて行く", [cause?.kind, cause?.code], ["Error", "23505"]);
ok("元になった失敗からも漏れない", leaked(JSON.stringify(describeError(wrapped))), "なし");

const fieldsOf = (fields) => logRecord({ level: "info", event: "x", fields }, ENV, NOW).fields ?? {};
ok("知らない項目は落とす", fieldsOf({ title: TITLE, email: EMAIL, slug: SLUG, body: BODY, headers: { authorization: HEADER } }), {});
ok("台帳（src/lib/logging/log-fields.json）にある名前の数と真偽はそのまま通す", fieldsOf({ count: 3, status: 503, database: true, assets: false }), { count: 3, status: 503, database: true, assets: false });
ok("台帳に無い名前の数と真偽は落とす", fieldsOf({ removed: 0, replayed: true }), {});
const keyLeak = fieldsOf({ [TITLE]: 1, [EMAIL]: true, [SLUG]: 2, jininKeikaku2027: 3, tanakaHanako: true, [BODY]: false });
ok("名前の側に題名・アドレス・呼び名を入れた数と真偽は、名前ごと落とす", [keyLeak, leaked(JSON.stringify(keyLeak))], [{}, "なし"]);
const inherited = fieldsOf(JSON.parse(`{"constructor":"${TITLE}","toString":"${EMAIL}","__proto__":"${SLUG}","hasOwnProperty":"${BODY}","valueOf":1,"method":"POST"}`));
ok("受け継いだ名前（constructor・toString・__proto__ など）の項目は、知らない項目として落とす", [inherited, leaked(JSON.stringify(inherited)), Object.getPrototypeOf(inherited) === Object.prototype], [{ method: "POST" }, "なし", true]);
ok("数でない数は落とす", fieldsOf({ count: Number.NaN, total: Number.POSITIVE_INFINITY }), {});
ok("決めた語彙の項目は通す", fieldsOf({ method: "POST", status: 500, step: "page-views", routeType: "route", digest: "1234567890" }), { method: "POST", status: 500, step: "page-views", routeType: "route", digest: "1234567890" });
ok("Slack の断りの語と、こちらで畳んだ理由は通す", fieldsOf({ reason: "refused", slackError: "channel_not_found" }), { reason: "refused", slackError: "channel_not_found" });
// 保存先の読み込みをやり直したときの警告（src/lib/db/database.ts の database.read-retried）。添えるのは 1 回目の符号を小文字にした語・HTTP の状態・結果だけ
const retried = logRecord({ level: "warn", event: "database.read-retried", fields: { method: "GET", status: 401, reason: "http_401", result: "recovered" } }, ENV, NOW);
ok("保存先の読み込みのやり直しは、警告として決まった出来事の名前と 4 つの項目で出る", [retried.level, retried.event, retried.fields], ["warn", "database.read-retried", { method: "GET", status: 401, reason: "http_401", result: "recovered" }]);
ok("やり直しの理由に接続先・鍵・呼び名・本体の文が来ても通さない", fieldsOf({ reason: `https://db.example.co/rest/v1/admins?email=eq.${EMAIL}`, result: HEADER, method: SLUG, status: "401 Invalid API key" }), {});
ok("人が読む文の理由は通さない", fieldsOf({ reason: "Slack が受け付けませんでした（channel_not_found）", slackError: TITLE }), {});
ok("決めた項目でも、形が違えば落とす", fieldsOf({ method: TITLE, status: "500", step: SLUG, routeType: EMAIL, digest: `NEXT_REDIRECT;replace;/internal/${SLUG};307` }), {});
ok("文字の項目に数を、数の項目に文字を入れても通らない", fieldsOf({ step: 3, count: "3" }), {});
ok("項目の名前そのものに文を入れても通らない", fieldsOf({ [EMAIL]: 1, [TITLE]: true }), {});
ok("欄の道筋は、欄の名前の形だけ通す", fieldsOf({ paths: ["items.0.name", `${SLUG}`, EMAIL, "error.code"] }), { paths: ["items.0.name", "error.code"] });
ok("ページの目印（UUID）は通す", fieldsOf({ pageId: "0b55e22b-47c8-4b16-b5fa-0755816e57fe" }), { pageId: "0b55e22b-47c8-4b16-b5fa-0755816e57fe" });
ok("UUID でない目印は通さない", fieldsOf({ pageId: SLUG }), {});

const routeOf = (route) => logRecord({ level: "info", event: "x", route }, ENV, NOW).route;
ok("受け口の型は通す", routeOf("/internal/[...slug]"), "/internal/[...slug]");
ok("問い合わせの付いた道筋は通さない", routeOf(`/internal/${SLUG}${QUERY}`), null);
ok("日本語の入った道筋は通さない", routeOf(`/internal/${TITLE}`), null);
ok("出来事の名前に文を入れたら決まった名前に落とす", logRecord({ level: "error", event: `${TITLE} で失敗` }, ENV, NOW).event, "log.invalid-event");
ok("要求の目印は決まった形だけ", [requestIdFrom(new Headers({ [REQUEST_ID_HEADER]: ID })), requestIdFrom(new Headers({ [REQUEST_ID_HEADER]: EMAIL })), requestIdFrom(new Headers())], [ID, null, null]);
ok("素の入れ物のヘッダからも読める（取りこぼしの受け皿が渡す形）", requestIdFrom({ [REQUEST_ID_HEADER]: ID, cookie: HEADER }), ID);
ok("記録に入れる目印も決まった形だけ", logRecord({ level: "info", event: "x", requestId: EMAIL }, ENV, NOW).requestId, null);
ok("新しい目印は決まった形", /^[0-9a-f]{16}$/.test(newRequestId()), true);
const organizationOf = (organization) => logRecord({ level: "info", event: "x", organization }, ENV, NOW).organization;
ok("組織の印は目印（uuid）の形だけ通す。名前・呼び名・宛先・ドメイン・大文字の目印は通さない", [MIHON.id, MIHON.name, MIHON.slug, MIHON.host, MIHON.domain, "0B55E22B-47C8-4B16-B5FA-0755816E57FE", `${MIHON.id} `, 2].map(organizationOf), [MIHON.id, null, null, null, null, null, null, null]);
ok("組織の印は添える項目（fields）としては通さない（置くのは入口の外枠だけ）", fieldsOf({ organization: MIHON.id, organizationId: MIHON.id, organizationName: MIHON.name }), {});
ok("新しい目印は毎回違う", newRequestId() === newRequestId(), false);

// ---------------------------------------------------------------------------
console.log("\n--- 2. 1 行の形 ---");

const record = logRecord({ level: "error", event: "request.failed", route: "/api/comments", requestId: ID, durationMs: 12.3456, error: dirtyError(), fields: { method: "POST" } }, ENV, NOW);
ok("項目の並び", Object.keys(record), ["time", "level", "event", "route", "requestId", "organization", "version", "env", "durationMs", "error", "fields"]);
ok("時刻", record.time, "2026-10-01T03:04:05.678Z");
ok("重さ", record.level, "error");
ok("出来事の名前", record.event, "request.failed");
ok("受け口の型", record.route, "/api/comments");
ok("要求の目印", record.requestId, ID);
ok("版（組み立てたコミット）", record.version, ENV.VERCEL_GIT_COMMIT_SHA);
ok("どの環境か", record.env, "preview");
ok("かかった時間は小数 1 桁まで", record.durationMs, 12.3);
ok("エラーの種類と起きた場所", [record.error.kind, typeof record.error.at], ["Error", "string"]);
const line = logLine(record);
ok("1 件は 1 行", line.includes("\n"), false);
ok("JSON として読める", JSON.parse(line).event, "request.failed");
ok("その 1 行に題名・アドレス・呼び名が無い", leaked(line), "なし");
const bare = logRecord({ level: "info", event: "cron.swept" }, {}, NOW);
ok("分からない項目は null で埋め、欄は欠かさない", [bare.route, bare.requestId, bare.organization, bare.version, bare.env, bare.durationMs], [null, null, null, null, null, null]);
ok("エラーと添える項目は、あるときだけ", ["error" in bare, "fields" in bare], [false, false]);
ok("版の形でない値は版にしない", logRecord({ level: "info", event: "x" }, { VERCEL_GIT_COMMIT_SHA: TITLE, VERCEL_ENV: EMAIL }, NOW).version, null);
ok("手元は local", logRecord({ level: "info", event: "x" }, { NODE_ENV: "development" }, NOW).env, "local");
ok("知らない重さは error に倒す", logRecord({ level: TITLE, event: "x" }, ENV, NOW).level, "error");

// ---------------------------------------------------------------------------
console.log("\n--- 3. 入口の外枠（routeLog）---");

const { routeLog, logEvent, inBackground, wasLogged } = await import(`${dir}/server-log.mjs`);
await bundle("src/lib/api.ts", "api.mjs", [stubs({ "server-log": `${dir}/server-log.mjs` })]);
const { serverError } = await import(`${dir}/api.mjs`);

const requestFor = (path, headers = {}) => new Request(`https://example.invalid${path}`, { method: "POST", headers: { authorization: HEADER, cookie: `session=${EMAIL}`, ...headers } });
const ROUTE = "/internal/[...slug]";

const crashed = await capture(() => routeLog(ROUTE, requestFor(`/internal/${SLUG}${QUERY}`, { [REQUEST_ID_HEADER]: ID }), async () => { throw dirtyError(); }));
const crashLine = parsed(crashed.lines[0]);
ok("投げっぱなしの失敗は、そのまま外へ投げ直す（Next の扱いを変えない）", crashed.thrown instanceof Error, true);
ok("ログは 1 行だけ", crashed.lines.length, 1);
ok("エラーの口（標準エラー）に出る", crashed.lines[0].stream, "error");
ok("出来事の名前", crashLine?.event, "request.crashed");
ok("受け口の型が出る（実際の道筋ではない）", crashLine?.route, ROUTE);
ok("関所が付けた目印が出る", crashLine?.requestId, ID);
ok("エラーの種類と場所が出る", [crashLine?.error?.kind, /check-server-log\.mjs:\d+/.test(crashLine?.error?.at ?? "")], ["Error", true]);
ok("かかった時間が出る", typeof crashLine?.durationMs === "number" && crashLine.durationMs >= 0, true);
ok("どの操作かが出る", crashLine?.fields?.method, "POST");
ok("題名・アドレス・呼び名・ヘッダ・問い合わせが 1 字も出ない", leaked(allText(crashed.lines)), "なし");
ok("記録済みの印が付く（受け皿が二重に書かない）", wasLogged(crashed.thrown), true);

const handled = await capture(() =>
  routeLog("/api/comments", requestFor("/api/comments", { [REQUEST_ID_HEADER]: ID }), async () => {
    try {
      throw dirtyError();
    } catch (error) {
      return serverError(error);
    }
  }),
);
const handledLine = parsed(handled.lines[0]);
ok("共通の後始末は 500 を返す", handled.result.status, 500);
ok("応答に中の事情を出さない", leaked(await handled.result.clone().text()), "なし");
ok("後始末のログは 1 行だけ（外枠が 500 を二重に書かない）", handled.lines.length, 1);
ok("後始末のログにも受け口の型と目印が載る", [handledLine?.event, handledLine?.route, handledLine?.requestId], ["request.failed", "/api/comments", ID]);
ok("後始末のログにも場所と符号が載る", [/check-server-log\.mjs:\d+/.test(handledLine?.error?.at ?? ""), handledLine?.error?.code], [true, "23505"]);
ok("後始末のログからも漏れない", leaked(allText(handled.lines)), "なし");

const fine = await capture(() => routeLog("/api/pages", requestFor("/api/pages", { [REQUEST_ID_HEADER]: ID }), async () => new Response("ok")));
ok("うまくいった要求は何も書かない", fine.lines.length, 0);
const silent500 = await capture(() => routeLog("/api/pages", requestFor("/api/pages"), async () => new Response("x", { status: 503 })));
ok("黙って 5xx を返した入口も 1 行残る", [silent500.lines.length, parsed(silent500.lines[0])?.event, parsed(silent500.lines[0])?.fields?.status], [1, "request.failed", 503]);
ok("関所を通らなかった要求には、その場で目印を付ける", /^[0-9a-f]{16}$/.test(parsed(silent500.lines[0])?.requestId ?? ""), true);
ok("うまくいった応答には何も足さない（配り物や控えさせる応答を要求ごとに変えない）", [fine.result.headers.get("x-request-id"), fine.result.headers.get("server-timing")], [null, null]);
const timed = await routeLog("/api/pages/deck-edit", requestFor("/api/pages/deck-edit", { [REQUEST_ID_HEADER]: ID }), async () => new Response("ok", { headers: { "server-timing": "deck;dur=12.5" } }));
ok("入口が自分で持つ計測の見出しに触れない", timed.headers.get("server-timing"), "deck;dur=12.5");
const moved = await capture(() => routeLog("/api/pages", requestFor("/api/pages"), async () => Response.redirect("https://example.invalid/", 303)));
ok("転送の応答はそのまま返す", [moved.thrown, moved.result.status, moved.lines.length], [undefined, 303, 0]);
ok("失敗を書いた応答には、ログと同じ目印を載せる", handled.result.headers.get("x-request-id"), handledLine?.requestId);
const mixed = await capture(async () => {
  const answers = [];
  for (const fails of [true, false, true, false]) {
    answers.push(await routeLog("/api/comments", requestFor("/api/comments"), async () => (fails ? serverError(dirtyError()) : new Response("ok"))));
  }
  return answers;
});
const failedIds = mixed.result.map((answer) => answer.headers.get("x-request-id")).filter((id) => id !== null);
ok("失敗した応答だけが目印を持つ", failedIds.length, 2);
ok("応答の目印でログを引くと、その失敗の行だけが出る", failedIds.map((id) => mixed.lines.filter((line) => line.text.includes(id)).length), [1, 1]);
const nested = await capture(() =>
  routeLog("/internal/[...slug]", requestFor(`/internal/${SLUG}`), () => routeLog("/internal/[...slug]", requestFor(`/internal/${SLUG}`), async () => serverError(dirtyError()))),
);
ok("外枠の中で別の入口を呼んでも（HEAD が GET を呼ぶ）、同じ失敗は 1 行", nested.lines.length, 1);
const nestedCrash = await capture(() => routeLog("/public/[...slug]", requestFor(`/public/${SLUG}`), () => routeLog("/public/[...slug]", requestFor(`/public/${SLUG}`), async () => { throw dirtyError(); })));
ok("投げっぱなしの失敗も、重ねた外枠で 1 行", nestedCrash.lines.length, 1);
const denied = await capture(() => routeLog("/api/pages", requestFor("/api/pages"), async () => new Response("no", { status: 403 })));
ok("断っただけの要求（4xx）も何も書かない", denied.lines.length, 0);
const spoofed = await capture(() => routeLog("/api/pages", requestFor("/api/pages", { [REQUEST_ID_HEADER]: EMAIL }), async () => new Response("x", { status: 500 })));
ok("形の違う目印が送られてきたら使わない", leaked(allText(spoofed.lines)), "なし");
const noRequest = await capture(() => routeLog("/api/v1/health", null, async () => { throw new Error("x"); }));
ok("要求を受け取らない入口でも目印が付く", /^[0-9a-f]{16}$/.test(parsed(noRequest.lines[0])?.requestId ?? ""), true);

const redirect = Object.assign(new Error("NEXT_REDIRECT"), { digest: `NEXT_REDIRECT;replace;/internal/${SLUG};307;` });
const redirected = await capture(() => routeLog(ROUTE, requestFor(`/internal/${SLUG}`), async () => { throw redirect; }));
ok("Next の合図（転送・見つからない）は失敗として書かない", [redirected.thrown === redirect, redirected.lines.length], [true, 0]);

const inside = await capture(() =>
  routeLog("/api/pages", requestFor("/api/pages", { [REQUEST_ID_HEADER]: ID }), async () => {
    logEvent({ level: "info", event: "assets.spared", fields: { count: 2 } });
    return new Response("ok");
  }),
);
const insideLine = parsed(inside.lines[0]);
ok("入口の中のログは、同じ受け口の型と目印を引き継ぐ", [insideLine?.route, insideLine?.requestId, insideLine?.fields?.count], ["/api/pages", ID, 2]);
ok("知らせ（info）は標準の出力へ", inside.lines[0].stream, "log");
const outside = await capture(() => logEvent({ level: "warn", event: "catalog.update-failed" }));
ok("入口の外のログも同じ形（受け口と目印は null）", [parsed(outside.lines[0])?.event, parsed(outside.lines[0])?.route, parsed(outside.lines[0])?.requestId, outside.lines[0].stream], ["catalog.update-failed", null, null, "warn"]);
const hostile = await capture(() => logEvent({ level: "error", event: "x", get error() { throw new Error(TITLE); } }));
ok("ログを書くこと自体が失敗しても、呼んだ側を止めない", [hostile.thrown === undefined, leaked(allText(hostile.lines))], [true, "なし"]);

// 要求ごとの 1 行。スイッチ PAGES_REQUEST_LOG が on のときだけ。未設定・別の綴りでは上の「うまくいった要求は何も書かない」のまま
const withRequestLog = async (value, run) => {
  const saved = process.env.PAGES_REQUEST_LOG;
  if (value === undefined) delete process.env.PAGES_REQUEST_LOG;
  else process.env.PAGES_REQUEST_LOG = value;
  try {
    return await capture(run);
  } finally {
    if (saved === undefined) delete process.env.PAGES_REQUEST_LOG;
    else process.env.PAGES_REQUEST_LOG = saved;
  }
};
const okRequest = () => routeLog(ROUTE, requestFor(`/internal/${SLUG}${QUERY}`, { [REQUEST_ID_HEADER]: ID, referer: `https://example.invalid/internal/${SLUG}` }), async () => new Response(`${TITLE} ${BODY}`));
const offCounts = [];
// 標準の出力の差し替えは 1 つずつ（同時に走らせると、差し替えを戻す順が狂う）
for (const value of [undefined, "ON", "true", "1", " on"]) offCounts.push((await withRequestLog(value, okRequest)).lines.length);
ok("スイッチが未設定・別の綴りなら、うまくいった要求は今までどおり何も書かない", offCounts, [0, 0, 0, 0, 0]);
const counted = await withRequestLog("on", okRequest);
const countedLine = parsed(counted.lines[0]);
ok("スイッチが on なら、うまくいった要求も 1 行（request.completed）", [counted.lines.length, countedLine?.event, countedLine?.level, counted.lines[0]?.stream], [1, "request.completed", "info", "log"]);
ok("持つのは受け口の型・目印・かかった時間・応答の番号だけ", [Object.keys(countedLine ?? {}), countedLine?.route, countedLine?.requestId, typeof countedLine?.durationMs, countedLine?.fields], [["time", "level", "event", "route", "requestId", "organization", "version", "env", "durationMs", "fields"], ROUTE, ID, "number", { status: 200 }]);
ok("要求ごとの 1 行に、呼び名・問い合わせ・ヘッダ・本文が 1 字も出ない", leaked(allText(counted.lines)), "なし");
ok("要求ごとの 1 行を書いても、応答には何も足さない", counted.result.headers.get("x-request-id"), null);
const countedFailure = await withRequestLog("on", () => routeLog("/api/pages", requestFor("/api/pages", { [REQUEST_ID_HEADER]: ID }), async () => new Response("x", { status: 503 })));
ok("5xx は失敗の 1 行と要求の 1 行の 2 行（失敗の行の意味は変えない）", countedFailure.lines.map((one) => [parsed(one)?.event, parsed(one)?.fields?.status]), [["request.failed", 503], ["request.completed", 503]]);
const countedCrash = await withRequestLog("on", () => routeLog(ROUTE, requestFor(`/internal/${SLUG}`), async () => { throw dirtyError(); }));
ok("投げっぱなしの失敗は 500 として数える（そのまま投げ直す）", [countedCrash.thrown instanceof Error, countedCrash.lines.map((one) => [parsed(one)?.event, parsed(one)?.fields?.status ?? null])], [true, [["request.crashed", null], ["request.completed", 500]]]);
const countedSignals = await withRequestLog("on", async () => {
  for (const digest of [`NEXT_REDIRECT;replace;/internal/${SLUG};307;`, "NEXT_HTTP_ERROR_FALLBACK;404", `NEXT_REDIRECT;push;/internal/${SLUG}?who=${EMAIL};308;`, `DYNAMIC_SERVER_USAGE`]) {
    await routeLog(ROUTE, requestFor(`/internal/${SLUG}`), async () => { throw Object.assign(new Error("signal"), { digest }); }).catch(() => undefined);
  }
});
ok("Next の合図は失敗として書かず、合図の番号だけで数える（番号の無い合図は番号なしで数える）", countedSignals.lines.map((one) => [parsed(one)?.event, parsed(one)?.fields?.status ?? null]), [["request.completed", 307], ["request.completed", 404], ["request.completed", 308], ["request.completed", null]]);
ok("合図の中の道筋・問い合わせは 1 字も出ない", leaked(allText(countedSignals.lines)), "なし");
const countedNested = await withRequestLog("on", () => routeLog(ROUTE, requestFor(`/internal/${SLUG}`), () => routeLog(ROUTE, requestFor(`/internal/${SLUG}`), async () => new Response("ok"))));
ok("外枠を重ねても（HEAD が GET を呼ぶ）、要求の 1 行は 1 つ", countedNested.lines.length, 1);
const countedDenied = await withRequestLog("on", () => routeLog("/api/pages", requestFor("/api/pages"), async () => new Response("no", { status: 403 })));
ok("断った要求（4xx）も、番号つきで 1 行（失敗の行は書かない）", countedDenied.lines.map((one) => [parsed(one)?.event, parsed(one)?.fields?.status]), [["request.completed", 403]]);

// 組織の印。関所が宛先から決めて付け直した見出し（x-pages-organization・currentOrganization が読むのと同じ）を
// 入口の外枠が 1 度だけ読み、中で書かれたログに自動で添える。logEvent を呼ぶ側は渡さない
const ORGANIZATION_HEADER = "x-pages-organization";
const mihonHeader = { [ORGANIZATION_HEADER]: `${MIHON.id};o/${MIHON.id}/`, host: MIHON.host };
ok("関所の見出しの無い要求（関所を通らない配り物）には組織の印を付けない（推測で最初の組織に倒さない）", [crashLine?.organization, insideLine?.organization], [null, null]);
ok("入口の外のログには組織の印が無い（null）", parsed(outside.lines[0])?.organization, null);
const mihonCrash = await capture(() => routeLog(ROUTE, requestFor(`/internal/${SLUG}`, { [REQUEST_ID_HEADER]: ID, ...mihonHeader }), async () => { throw dirtyError(); }));
const mihonInside = await capture(async () => {
  let later = null;
  await routeLog("/api/comments", requestFor("/api/comments", { [REQUEST_ID_HEADER]: ID, ...mihonHeader }), async () => {
    logEvent({ level: "warn", event: "comments.notify-skipped", fields: { reason: "restricted" } });
    later = inBackground("comment-notify", async () => { throw dirtyError(); });
    return new Response("ok");
  });
  await later();
});
ok("見本商事の宛先の要求は、失敗の行に見本商事の目印が付く", parsed(mihonCrash.lines[0])?.organization, MIHON.id);
ok("入口の中のログと、応答のあとに裏で走る処理のログにも同じ目印が付く（呼ぶ側は渡していない）", mihonInside.lines.map((one) => parsed(one)?.organization), [MIHON.id, MIHON.id]);
ok("組織の名前・呼び名・宛先・ドメインは 1 字も出ない", leaked(allText([...mihonCrash.lines, ...mihonInside.lines])), "なし");
const mihonCounted = await withRequestLog("on", () => routeLog(ROUTE, requestFor(`/internal/${SLUG}`, { [REQUEST_ID_HEADER]: ID, ...mihonHeader }), async () => new Response("ok")));
ok("要求ごとの 1 行にも組織の目印が付く（組織ごとのエラーの割合・遅さの材料）", [parsed(mihonCounted.lines[0])?.event, parsed(mihonCounted.lines[0])?.organization], ["request.completed", MIHON.id]);
ok("組織の目印が付いても、応答には何も足さない", mihonCounted.result.headers.get("x-request-id"), null);
const { logUnhandledEvent } = await import(`${dir}/server-log.mjs`);
const overridden = await capture(() => routeLog("/api/comments", requestFor("/api/comments", mihonHeader), async () => { logUnhandledEvent({ level: "warn", event: "x.y" }, FIRST_ORGANIZATION_ID); return new Response("ok"); }));
ok("外枠の中では、受け皿の口に渡した組織より要求の文脈（外枠の組織）が勝つ", parsed(overridden.lines[0])?.organization, MIHON.id);
const firstCounted = await withRequestLog("on", () => routeLog(ROUTE, requestFor(`/internal/${SLUG}`, { [ORGANIZATION_HEADER]: `${FIRST_ORGANIZATION_ID};` }), async () => new Response("ok")));
ok("最初の組織（最初の組織）の宛先の要求には 最初の組織 の目印が付く", parsed(firstCounted.lines[0])?.organization, FIRST_ORGANIZATION_ID);
const namedOrganization = await capture(() => routeLog(ROUTE, requestFor(`/internal/${SLUG}`, { [ORGANIZATION_HEADER]: `${MIHON.slug};o/${MIHON.slug}/` }), async () => { throw dirtyError(); }));
ok("組織の見出しが決まった形でなければ、印を付けずに書く（要求は止めない）", [namedOrganization.thrown instanceof Error, namedOrganization.lines.length, parsed(namedOrganization.lines[0])?.organization, leaked(allText(namedOrganization.lines))], [true, 1, null, "なし"]);
const SERVER_LOG = await read("src/lib/logging/server-log.ts");
ok("組織は currentOrganization と同じ見出し・同じ読み方で読み、ログのために組織を引き直さない（保存先も next/headers も読まない）", [/organizationFromHeader\(request\?\.headers\.get\(ORGANIZATION_HEADER\)\)/.test(SERVER_LOG), /next\/headers|currentOrganization\(|getDb|orgDb/.test(SERVER_LOG.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, ""))], [true, false]);

// ---------------------------------------------------------------------------
console.log("\n--- 5. 定期処理と、裏で走る処理 ---");

await writeFile(`${dir}/sweep-stub.mjs`, `
const plan = () => (globalThis.__logSweeps ??= { fail: new Map() });
const run = (name, value) => async () => { const error = plan().fail.get(name); if (error) throw error; return value; };
export const sweepOldPageViews = run("views", 3);
export const VIEW_RETENTION_DAYS = 90;
export const sweepVideoUploads = run("video", 0);
export const sweepAgentDrafts = run("drafts", undefined);
export const sweepHandoffCodes = run("handoff", 0);
export const recountOrganizationUsage = run("usage", []);
export const purgeDueOrganizations = run("purge", []);
// 掃除は組織ごとに回す。組織の台帳は最初の組織 1 つ
export const everyOrganization = async () => [{ id: "00000000-0000-4000-8000-000000000001", assetPrefix: "" }];
`);
const SWEEP = `${dir}/sweep-stub.mjs`;
await bundle("src/app/api/cron/views/route.ts", "cron.mjs", [
  stubs({ "@/lib/pages/views": SWEEP, "@/lib/deck/media/video-storage": SWEEP, "@/lib/page-agent/service": SWEEP, "@/lib/login-handoff": SWEEP, "@/lib/organization/organizations": SWEEP, "@/lib/organization-usage": SWEEP, "@/lib/organization-lifecycle": SWEEP, "@/lib/logging/server-log": `${dir}/server-log.mjs`, "@/lib/api": `${dir}/api.mjs` }),
]);
const cron = await import(`${dir}/cron.mjs`);
process.env["CRON_SECRET"] = "open-sesame-1234";
const cronCall = () => new Request("https://example.invalid/api/cron/views", { headers: { authorization: "Bearer open-sesame-1234" } });

globalThis.__logSweeps = { fail: new Map() };
const sweptAll = await capture(() => cron.GET(cronCall()));
const sweptLines = sweptAll.lines.map(parsed);
ok("定期処理が動いたことが、同じ形の 1 行で残る", sweptLines.every((one) => one !== null && "time" in one && "level" in one && "route" in one && "requestId" in one && "version" in one), true);
const viewsLine = sweptLines.find((one) => one?.fields?.step === "page-views");
ok("何の掃除で、何件消したか", [viewsLine?.event, viewsLine?.fields?.count, viewsLine?.route], ["cron.swept", 3, "/api/cron/views"]);
ok("合言葉がログに出ない", allText(sweptAll.lines).includes("open-sesame"), false);

globalThis.__logSweeps = { fail: new Map([["drafts", dirtyError()]]) };
const sweptPartly = await capture(() => cron.GET(cronCall()));
const failedLine = sweptPartly.lines.map(parsed).find((one) => one?.event === "cron.step-failed");
ok("片付けの 1 つが落ちても 500 のまま（見張りに出る）", sweptPartly.result.status, 500);
ok("どの片付けが落ちたかが、同じ形の 1 行で残る", [failedLine?.fields?.step, failedLine?.level, failedLine?.route], ["agent-drafts", "error", "/api/cron/views"]);
ok("落ちた場所と符号が残る", [typeof failedLine?.error?.at, failedLine?.error?.code], ["string", "23505"]);
ok("要求の目印が、その回のログすべてに同じ値で載る", new Set(sweptPartly.lines.map((one) => parsed(one)?.requestId)).size, 1);
ok("片付けの失敗の文面（題名・アドレス・呼び名）は出ない", leaked(allText(sweptPartly.lines)), "なし");
ok("5xx の 1 行を重ねて書かない（落ちた片付けの行が既にある）", sweptPartly.lines.map(parsed).filter((one) => one?.event === "request.failed").length, 0);

const background = await capture(async () => {
  let later = null;
  await routeLog("/api/comments", requestFor("/api/comments", { [REQUEST_ID_HEADER]: ID }), async () => {
    later = inBackground("comment-notify", async () => { throw dirtyError(); });
    return new Response("ok");
  });
  // 応答を返したあと、入口の外から呼ばれる（Next の after と同じ順）
  await later();
});
const backgroundLine = parsed(background.lines[0]);
ok("裏で走る処理の失敗は、呼んだ側へ投げない", background.thrown, undefined);
ok("裏で走る処理の失敗も同じ形で、元の要求の目印と受け口を引き継ぐ", [backgroundLine?.event, backgroundLine?.fields?.step, backgroundLine?.route, backgroundLine?.requestId], ["background.failed", "comment-notify", "/api/comments", ID]);
ok("裏で走る処理のログからも漏れない", leaked(allText(background.lines)), "なし");

// ---------------------------------------------------------------------------
console.log("\n--- 6. 取りこぼしの受け皿（src/instrumentation.ts）---");

await bundle("src/instrumentation.ts", "instrumentation.mjs", [stubs({ "@/lib/logging/server-log": `${dir}/server-log.mjs`, "./src/lib/logging/server-log": `${dir}/server-log.mjs` })]);
const { onRequestError } = await import(`${dir}/instrumentation.mjs`);
const seen = { path: `/internal/${SLUG}${QUERY}`, method: "GET", headers: { [REQUEST_ID_HEADER]: ID, cookie: `session=${EMAIL}`, authorization: HEADER, referer: `https://example.invalid/internal/${SLUG}` } };
const context = { routerKind: "App Router", routePath: "/internal/[...slug]", routeType: "route", renderSource: "react-server-components", revalidateReason: undefined, renderType: "dynamic" };

const uncaught = await capture(() => onRequestError(Object.assign(dirtyError(), { digest: "2882939012" }), seen, context));
const uncaughtLine = parsed(uncaught.lines[0]);
ok("入口が捕まえなかった失敗も 1 行で残る", [uncaught.lines.length, uncaughtLine?.event, uncaughtLine?.level], [1, "request.unhandled", "error"]);
ok("受け口は型で残す（Next が渡す置き場所）", uncaughtLine?.route, "/internal/[...slug]");
ok("目印・種類・場所・符号が載る", [uncaughtLine?.requestId, uncaughtLine?.error?.kind, typeof uncaughtLine?.error?.at, uncaughtLine?.error?.code], [ID, "Error", "string", "23505"]);
ok("どこで起きた種類か（入口・描画・操作）と照合用の番号が載る", [uncaughtLine?.fields?.routeType, uncaughtLine?.fields?.method, uncaughtLine?.fields?.digest], ["route", "GET", "2882939012"]);
ok("実際の道筋・問い合わせ・ヘッダは 1 字も出ない", leaked(allText(uncaught.lines)), "なし");
ok("関所の見出しが無ければ、受け皿の行に組織の印は無い（推測で最初の組織に倒さない）", uncaughtLine?.organization, null);
const scopedSeen = { ...seen, headers: { ...seen.headers, "x-pages-organization": `${MIHON.id};o/${MIHON.id}/`, host: MIHON.host } };
const scopedUncaught = await capture(() => onRequestError(Object.assign(dirtyError(), { digest: "2882939012" }), scopedSeen, { ...context, routeType: "render" }));
ok("画面の描画の失敗（外枠の外）にも、関所が付け直した組織の見出しから目印を付ける", [parsed(scopedUncaught.lines[0])?.organization, leaked(allText(scopedUncaught.lines))], [MIHON.id, "なし"]);
const badSeen = { ...seen, headers: { ...seen.headers, "x-pages-organization": MIHON.name } };
ok("組織の見出しが決まった形でなければ印を付けない", parsed((await capture(() => onRequestError(new Error("x"), badSeen, context))).lines[0])?.organization, null);
const twoRenders = await capture(async () => {
  await onRequestError(Object.assign(new Error("a"), { digest: "650147766" }), seen, { ...context, routePath: "/devices", routeType: "render" });
  await onRequestError(Object.assign(new Error("b"), { digest: "118822334" }), seen, { ...context, routePath: "/activity", routeType: "render" });
});
ok("画面の番号（digest）でログを引くと、その失敗の行だけが出る", twoRenders.lines.filter((line) => parsed(line)?.fields?.digest === "650147766").map((line) => parsed(line)?.route), ["/devices"]);
const once = await capture(async () => {
  const error = dirtyError();
  await routeLog(ROUTE, requestFor(`/internal/${SLUG}`), async () => { throw error; }).catch(() => undefined);
  await onRequestError(error, seen, context);
});
ok("外枠が書いた失敗は、受け皿でもう一度書かない", once.lines.length, 1);
const oddPath = await capture(() => onRequestError(new Error("x"), seen, { ...context, routePath: `/internal/${SLUG}${QUERY}` }));
ok("置き場所が型の形でなければ、受け口を空にする", [parsed(oddPath.lines[0])?.route, leaked(allText(oddPath.lines))], [null, "なし"]);
const INSTRUMENTATION = await read("src/instrumentation.ts");
ok("受け皿は実際の道筋（request.path）を読まない", /request\.path|\.path\b/.test(INSTRUMENTATION.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "")), false);

// ---------------------------------------------------------------------------
console.log("\n--- 7. 要求の目印を付ける関所と、エラー画面の番号 ---");

const PROXY = await read("src/proxy.ts");
// 関所の範囲はすべての道筋（。組織のヘッダを付け直さない道筋を残さないため）。外すのは組み立ての静的な配り物だけ
ok("関所の範囲は組織を読みうる道筋のすべて（外すのは組織を読まない配り物だけ）", PROXY.includes('matcher: ["/((?!_next/static|_next/image|vendor/|comments-widget.js|page-images.js).*)"]'), true);
ok("素通しの通し方は残っていない（どの通り道でも目印が付く）", /NextResponse\.next\(\)/.test(PROXY), false);
ok("関所は応答の見出しに触れない", /response\.headers|server-timing|x-request-id/i.test(PROXY), false);

await writeFile(`${dir}/next-server-stub.mjs`, `
export class NextResponse extends Response {
  static next(init) { const made = new NextResponse(null, { status: 200 }); made.forwarded = init?.request?.headers ?? null; return made; }
  static json(body, init) { return new NextResponse(JSON.stringify(body), { ...init, headers: { "content-type": "application/json" } }); }
}
`);
await build({
  entryPoints: [`${root}/src/proxy.ts`], outfile: `${dir}/proxy.mjs`, bundle: true, format: "esm", platform: "node", external: ["node:*"], logLevel: "silent",
  plugins: [companyDeployment, { name: "next-server", setup(setup) { setup.onResolve({ filter: /^next\/server$/ }, () => ({ path: `${dir}/next-server-stub.mjs`, external: true })); } }],
});
const { proxy } = await import(`${dir}/proxy.mjs`);
const through = (path, init = {}) => {
  const request = new Request(`https://example.invalid${path}`, init);
  request.nextUrl = new URL(request.url);
  request.cookies = { get: () => undefined };
  return proxy(request);
};
const viewed = await through(`/internal/${SLUG}`, { headers: { [REQUEST_ID_HEADER]: "ffffffffffffffff", cookie: "a=b" } });
const given = viewed.forwarded?.get(REQUEST_ID_HEADER) ?? "";
ok("通した要求に目印が付く", /^[0-9a-f]{16}$/.test(given), true);
ok("送られてきた目印は捨てて付け直す", given === "ffffffffffffffff", false);
ok("ほかの要求のヘッダは落とさない", viewed.forwarded?.get("cookie"), "a=b");
ok("通した応答の見出しは空のまま（控えと、入口の見出しを変えない）", [...viewed.headers.keys()], []);
ok("変更要求を通すときも目印が付く", /^[0-9a-f]{16}$/.test((await through("/api/comments", { method: "POST", headers: { authorization: HEADER } })).forwarded?.get(REQUEST_ID_HEADER) ?? ""), true);
ok("関所の断りは今までどおり", (await through("/api/comments", { method: "POST", headers: { origin: "https://evil.invalid" } })).status, 403);
ok("2 つの要求の目印は違う", (await through("/public/x")).forwarded.get(REQUEST_ID_HEADER) === (await through("/public/x")).forwarded.get(REQUEST_ID_HEADER), false);
// 関所が付け直した組織の見出しを、入口の外枠がそのまま印にする。外から送られた組織の見出しは関所が捨てる
const spoofedOrganization = await through(`/internal/${SLUG}`, { headers: { [REQUEST_ID_HEADER]: ID, [ORGANIZATION_HEADER]: `${MIHON.id};o/${MIHON.id}/` } });
const forwardedOrganization = spoofedOrganization.forwarded?.get(ORGANIZATION_HEADER) ?? "";
ok("関所は外から送られた組織の見出しを捨て、宛先から決めた組織で付け直す（本番でない example.invalid は最初の組織）", forwardedOrganization.startsWith(`${FIRST_ORGANIZATION_ID};`), true);
const relayed = await capture(() => routeLog(ROUTE, new Request(`https://example.invalid/internal/${SLUG}`, { headers: spoofedOrganization.forwarded }), async () => { throw dirtyError(); }));
ok("関所を通った要求の失敗の行には、関所が付け直した組織の目印が付く（外から送られた目印ではない）", parsed(relayed.lines[0])?.organization, FIRST_ORGANIZATION_ID);

for (const screen of ["src/app/error.tsx", "src/app/global-error.tsx"]) {
  const source = await read(screen);
  ok(`${screen}: Next が渡す照合用の番号を画面に出す`, /<ErrorMark digest=\{error\.digest\} \/>/.test(source), true);
}
const MARK = await read("src/app/_components/error-mark.tsx");
ok("番号は数字の形のときだけ出す（転送などの合図は道筋を含む）", /\^\[0-9\]\{1,24\}\$/.test(MARK), true);
ok("画面の操作で起きた失敗（番号が無い）には出さない", /digest === undefined/.test(MARK), true);
ok("画面側にログの道具を持ち込まない", /log-record|server-log|performance\./.test(MARK), false);
ok("見た目は既にある語彙だけ", /import \{ META \} from "\.\/styles"/.test(MARK) && !/className="/.test(MARK), true);
ok("受け皿は同じ番号をログに残す", /digest: typeof digest === "string" \? digest : undefined/.test(INSTRUMENTATION), true);

// ---------------------------------------------------------------------------
console.log("\n--- 8. 入口の字面 ---");

async function routeFiles(folder) {
  const found = [];
  for (const entry of await readdir(`${root}/${folder}`, { withFileTypes: true })) {
    if (entry.isDirectory()) found.push(...(await routeFiles(`${folder}/${entry.name}`)));
    else if (entry.name === "route.ts") found.push(`${folder}/${entry.name}`);
  }
  return found;
}
const routes = (await routeFiles("src/app")).sort();
/** 置き場所から受け口の型を出す（src/app/api/comments/[id]/route.ts → /api/comments/[id]）。 */
const typeOf = (file) => file.replace(/^src\/app/, "").replace(/\/route\.ts$/, "");
/** Auth.js の入口だけは Auth.js が配る関数をそのまま出すので、外枠を掛けない（受け皿が拾う）。 */
const HANDED_OVER = ["src/app/api/auth/[...nextauth]/route.ts"];

const unwrapped = [];
const mistyped = [];
let handlers = 0;
for (const file of routes) {
  if (HANDED_OVER.includes(file)) continue;
  const source = await read(file);
  const literals = [...source.matchAll(/routeLog\(\s*"([^"]+)"/g)].map((match) => match[1]);
  const exported = [...source.matchAll(/export (?:async function|function|const) (GET|POST|PUT|PATCH|DELETE|HEAD)\b/g)].length;
  handlers += exported;
  if (literals.length === 0) unwrapped.push(file);
  if (literals.some((literal) => literal !== typeOf(file))) mistyped.push(file);
}
// 個人配布版は録音・リポジトリ・Slack・アプリ向けの窓口などを外したので入口は 48
ok("入口の数（増えたらここも見る）", routes.length >= 36, true);
ok("外枠を通っていない入口", unwrapped, []);
ok("受け口の型が自分の置き場所と食い違う入口", mistyped, []);
// 個人配布版は窓口を外したので操作は 67（Auth.js の入口を除く。数え漏れで少なく出たら落とす）
ok("操作（GET・POST など）を 1 つ以上数えた", handlers >= 50, true);
ok("受け口の型に変数を渡していない", (await Promise.all(routes.map(read))).filter((source) => /routeLog\(\s*[^"\s]/.test(source)).length, 0);
ok("Auth.js の入口は預けたまま", /handlers/.test(await read(HANDED_OVER[0])), true);

const API = await read("src/lib/api.ts");
ok("共通の後始末は共通の関数で書く", /logEvent\(/.test(API) && !/console\./.test(API), true);
ok("定期処理も共通の関数で書く", /logEvent\(/.test(await read("src/app/api/cron/views/route.ts")) && !/console\./.test(await read("src/app/api/cron/views/route.ts")), true);
const RECORD = await read("src/lib/logging/log-record.ts");
ok("伏せ方の関数は送り先を知らない（標準の出力にも Node にも触れない）", /console\.|process\.|from "node:|from "next/.test(RECORD), false);
ok("ログを出す口は 1 か所", (await read("src/lib/logging/server-log.ts")).match(/console\[/g)?.length, 1);
for (const file of ["src/app/api/pages/route.ts"]) {
  ok(`${file}: 生の出力に失敗の中身や呼び名を渡さない`, /console\./.test(await read(file)), false);
}

console.log(`\n${fails === 0 ? "すべて合格" : `不合格 ${fails} 件`}`);
if (fails > 0) process.exitCode = 1;
