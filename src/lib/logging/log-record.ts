/**
 * サーバーのログ 1 件の形と、伏せ方。
 *
 * ここは**純関数だけ**。標準の出力にも Node にも Next にも触れない。送り先を知らないので、
 * あとで足す外の道具（Sentry・Datadog）も同じ伏せ方をここから借りる。
 * 実際に書き出すのは `src/lib/logging/server-log.ts` の `logEvent` ただ 1 つ。
 *
 * ## 伏せ方は「通してよい項目だけ通す」
 *
 * Pages は社内資料を配る製品なので、**本文・題名・メールアドレス・ページの呼び名・ヘッダ・
 * 問い合わせ文字列**をログに出さない。「出してはいけない語を探して消す」方式は知らない形の
 * 漏れが素通りするので、逆に**通してよい形を決め、それ以外は落とす**。
 *
 * - エラーは、種類の名前・起きた場所（スタックの行）・決まった語彙の符号だけ。
 *   文面は決めた型（`SAFE_MESSAGE_KINDS`）のものだけ通す——保存先の重複の断り文などは
 *   題名やアドレスをそのまま含むため。
 * - 受け口は実際の道筋ではなく**型**（`/internal/[...slug]` のような置き場所）。問い合わせ・日本語・
 *   空白が混ざれば受け付けない。
 * - 組織は**目印（uuid）だけ**。名前・呼び名・宛先・ドメインは利用者の名乗りに近いので通さない。
 *   置くのは入口の外枠（`src/lib/logging/server-log.ts` の `routeLog`）で、`logEvent` を呼ぶ側は渡さない。
 * - 添える項目は、数と真偽はそのまま、文字は `STRING_FIELDS` に載せた名前と形のものだけ。
 *
 * 検査は `tests/checks/check-server-log.mjs`。
 */

import logFields from "./log-fields.json";

export type LogLevel = "info" | "warn" | "error";

const LEVELS: readonly LogLevel[] = ["info", "warn", "error"];

export type LogInput = {
  level: LogLevel;
  /** 出来事の名前。`request.failed` のように `.`／`-`／`_` で区切った小文字だけ。 */
  event: string;
  /** 受け口の型（置き場所）。実際の道筋は渡さない。 */
  route?: string | null;
  requestId?: string | null;
  /** 要求の組織の目印（uuid）。入口の外枠と取りこぼしの受け皿だけが渡す。 */
  organization?: string | null;
  durationMs?: number | null;
  error?: unknown;
  fields?: Readonly<Record<string, unknown>>;
};

export type ErrorRecord = {
  /** 種類の名前（型の名前）。 */
  kind: string;
  /** 起きた場所（自分のコードの最初の行）。読めなければ null。 */
  at: string | null;
  /** 場所の一覧（上から数行）。 */
  stack: string[];
  /** 決まった語彙の符号（保存先の 23505・Node の ECONNRESET など）。 */
  code?: string;
  /** 決めた型のときだけの文面。 */
  message?: string;
  /** 元になった失敗（1 段だけ）。 */
  cause?: { kind: string; at: string | null; code?: string };
};

export type LogFieldValue = number | boolean | string | string[];

export type LogRecord = {
  time: string;
  level: LogLevel;
  event: string;
  route: string | null;
  requestId: string | null;
  /** 要求の組織の目印（uuid）。入口の外では null。名前・呼び名・ドメインは載せない。 */
  organization: string | null;
  /** 組み立てたコミット。手元では null。 */
  version: string | null;
  /** どの環境か（production・preview・local）。 */
  env: string | null;
  durationMs: number | null;
  error?: ErrorRecord;
  fields?: Record<string, LogFieldValue>;
};

type Env = Readonly<Record<string, string | undefined>>;

/** 要求の目印を入口へ渡すヘッダ。関所（src/proxy.ts）が付け、入口と受け皿が読む。 */
export const REQUEST_ID_HEADER = "x-pages-request-id";

const REQUEST_ID = /^[0-9a-f]{16}$/;
const EVENT = /^[a-z][a-z0-9]*([._-][a-z0-9]+)*$/;
const ROUTE = /^\/[A-Za-z0-9._\-/[\]()@]{0,159}$/;
const IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]{0,63}$/;
/** 符号は大文字と数字の決まった語彙だけ（23505・ECONNRESET・PGRST205）。小文字の語は呼び名と見分けられないので通さない。 */
/** 決まった語彙の符号の形（保存先の 23505・PGRST205、Node の ECONNRESET など）。Sentry の組み立て直しも同じ形を借りる。 */
export const ERROR_CODE = /^[A-Z0-9_]{2,40}$/;
const CODE = ERROR_CODE;
const TOKEN = /^[a-z][a-z0-9_.-]{0,47}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const FIELD_PATH = /^[A-Za-z_][A-Za-z0-9_]*(\.(?:[A-Za-z_][A-Za-z0-9_]*|[0-9]+))*$/;
const FIELD_NAME = /^[a-z][A-Za-z0-9]{0,39}$/;
const COMMIT = /^[0-9a-f]{7,40}$/;
const ENV_NAME = /^[a-z][a-z0-9-]{0,31}$/;

/** 文面を通してよい型。固定の文（コードに書いた題）しか持たない型だけ載せる。 */
const SAFE_MESSAGE_KINDS: ReadonlySet<string> = new Set(["SetupError"]);
const MESSAGE_LIMIT = 200;

/** 文字で渡してよい項目と、その形。ここに無い名前は落ちる。 */
const STRING_FIELDS: Readonly<Record<string, (value: string) => boolean>> = {
  method: (value) => ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"].includes(value),
  step: (value) => TOKEN.test(value),
  stage: (value) => TOKEN.test(value),
  result: (value) => TOKEN.test(value),
  reason: (value) => TOKEN.test(value),
  routeType: (value) => ["render", "route", "action", "proxy"].includes(value),
  renderSource: (value) => ["react-server-components", "react-server-components-payload", "server-rendering"].includes(value),
  /** Next が付ける照合用の番号（数字だけ。転送などの合図は `NEXT_…;道筋` を含むので通さない）。 */
  digest: (value) => /^[0-9]{1,24}$/.test(value),
  pageId: (value) => UUID.test(value),
  /** Slack が返す断りの語（`channel_not_found` など。Slack の決まった語彙）。 */
  slackError: (value) => TOKEN.test(value),
  /** リポジトリの文書の「見てよいか」の覚えの上限の形（知らせが届いている 5 分か、60 秒か）。 */
  accessMemory: (value) => ["webhook", "fallback"].includes(value),
};
/** 数と真偽で渡してよい項目の名前。正本は src/lib/logging/log-fields.json（調査の道具も同じものを読む）。 */
const NUMBER_FIELDS: ReadonlySet<string> = new Set(logFields.numbers);
const BOOLEAN_FIELDS: ReadonlySet<string> = new Set(logFields.booleans);

/** 文字の一覧で渡してよい項目。 */
const LIST_FIELDS: Readonly<Record<string, (value: string) => boolean>> = {
  /** 取り決めと違った欄の道筋（`items.0.name`）。 */
  paths: (value) => FIELD_PATH.test(value),
};
const LIST_LIMIT = 10;

const STACK_LIMIT = 8;
/** スタックの 1 行。`at 名前 (場所:行:桁)` か `at 場所:行:桁`。 */
const FRAME = /^\s*at (?:(.+?) \()?(.+?):(\d+):(\d+)\)?$/;
const FRAME_NAME = /^[A-Za-z0-9_$.<> [\]]{1,80}$/;
const LOCATION = /^[A-Za-z0-9._\-/[\]()@+~]{1,200}$/;

export function logRecord(input: LogInput, env: Env, now: Date): LogRecord {
  const record: LogRecord = {
    time: now.toISOString(),
    level: LEVELS.includes(input.level) ? input.level : "error",
    event: EVENT.test(input.event) && input.event.length <= 64 ? input.event : "log.invalid-event",
    route: typeof input.route === "string" && ROUTE.test(input.route) ? input.route : null,
    requestId: typeof input.requestId === "string" && REQUEST_ID.test(input.requestId) ? input.requestId : null,
    organization: organizationIdOf(input.organization),
    version: versionOf(env),
    env: environmentOf(env),
    durationMs: typeof input.durationMs === "number" && Number.isFinite(input.durationMs) && input.durationMs >= 0 ? Math.round(input.durationMs * 10) / 10 : null,
  };
  if (input.error !== undefined) record.error = describeError(input.error);
  if (input.fields !== undefined) {
    const fields = allowedFields(input.fields);
    if (Object.keys(fields).length > 0) record.fields = fields;
  }
  return record;
}

/**
 * 組織の印として通してよい値か（小文字の uuid だけ）。Sentry の印・Datadog の札も同じ形を借りる。
 * 名前・呼び名・宛先・ドメインは形で落ちる。
 */
export function organizationIdOf(value: unknown): string | null {
  return typeof value === "string" && UUID.test(value) ? value : null;
}

/** 1 件を 1 行にする（JSON は改行を逃がすので、必ず 1 行になる）。 */
export function logLine(record: LogRecord): string {
  return JSON.stringify(record);
}

function versionOf(env: Env): string | null {
  const sha = env.VERCEL_GIT_COMMIT_SHA?.trim() ?? "";
  return COMMIT.test(sha) ? sha : null;
}

function environmentOf(env: Env): string | null {
  const named = (env.VERCEL_TARGET_ENV ?? env.VERCEL_ENV ?? "").trim();
  if (ENV_NAME.test(named)) return named;
  return env.NODE_ENV === "development" ? "local" : null;
}

function allowedFields(given: Readonly<Record<string, unknown>>): Record<string, LogFieldValue> {
  const kept: Record<string, LogFieldValue> = {};
  for (const [name, value] of Object.entries(given)) {
    if (!FIELD_NAME.test(name)) continue;
    // 文字で決めた項目に数を入れても通らない（名前と形は対で決める）
    const typed = Object.hasOwn(STRING_FIELDS, name) || Object.hasOwn(LIST_FIELDS, name);
    if (typed && typeof value !== "string" && !Array.isArray(value)) continue;
    // 数と真偽も、名前が台帳（src/lib/logging/log-fields.json）にあるものだけ。名前そのものに題名・呼び名・アドレスを入れて通させない
    if (typeof value === "number") {
      if (NUMBER_FIELDS.has(name) && Number.isFinite(value)) kept[name] = value;
    } else if (typeof value === "boolean") {
      if (BOOLEAN_FIELDS.has(name)) kept[name] = value;
    } else if (typeof value === "string") {
      const allowed = Object.hasOwn(STRING_FIELDS, name) ? STRING_FIELDS[name] : null;
      if (allowed !== null && allowed(value)) kept[name] = value;
    } else if (Array.isArray(value)) {
      const allowed = Object.hasOwn(LIST_FIELDS, name) ? LIST_FIELDS[name] : null;
      if (allowed === null) continue;
      const items = value.filter((item): item is string => typeof item === "string" && allowed(item)).slice(0, LIST_LIMIT);
      if (items.length > 0) kept[name] = items;
    }
  }
  return kept;
}

// --- エラー ----------------------------------------------------------------

/** 失敗を、種類・場所・符号（と決めた型の文面）だけに畳む。 */
export function describeError(error: unknown): ErrorRecord {
  if (!(error instanceof Error)) {
    const record: ErrorRecord = { kind: `non-error:${error === null ? "null" : typeof error}`, at: null, stack: [] };
    const code = codeOf(error);
    if (code !== null) record.code = code;
    return record;
  }
  const stack = framesOf(error);
  const record: ErrorRecord = { kind: kindOf(error), at: primaryFrame(stack), stack };
  const code = codeOf(error);
  if (code !== null) record.code = code;
  if (SAFE_MESSAGE_KINDS.has(record.kind) && error.message.length <= MESSAGE_LIMIT) record.message = error.message;
  if (error.cause instanceof Error) {
    const causeStack = framesOf(error.cause);
    const cause: ErrorRecord["cause"] = { kind: kindOf(error.cause), at: primaryFrame(causeStack) };
    const causeCode = codeOf(error.cause);
    if (causeCode !== null) cause.code = causeCode;
    record.cause = cause;
  }
  return record;
}

/** 種類の名前。型が名前を付けていなければ型の名前で呼ぶ。名前の形でなければ Error。 */
function kindOf(error: Error): string {
  const constructor = error.constructor.name;
  if (error.name === "Error" && IDENTIFIER.test(constructor)) return constructor;
  return IDENTIFIER.test(error.name) ? error.name : "Error";
}

function codeOf(error: unknown): string | null {
  if (typeof error !== "object" || error === null) return null;
  const code = Reflect.get(error, "code");
  return typeof code === "string" && CODE.test(code) ? code : null;
}

/**
 * スタックから場所の行だけを採る。
 *
 * V8 のスタックは「種類: 文面」の頭に続いて `at …` の行が並ぶ。文面は複数行になりうるし、
 * 文面の中に「場所に見える行」が入ることもあるので、**頭が今の文面と一致するときだけ**その
 * 後ろを読む。一致しない（文面があとから書き換えられた）ときは、頭が 1 行で済んでいるときに
 * 限り末尾の連なりを読み、それ以外は場所を諦める（漏らすより読めないほうがよい）。
 */
function framesOf(error: Error): string[] {
  const stack = typeof error.stack === "string" ? error.stack : "";
  const header = `${error.name}: ${error.message}`;
  let tail: string[];
  if (stack.startsWith(header)) {
    tail = stack.slice(header.length).split("\n");
  } else if (stack.startsWith(`${error.name}\n`) && error.message === "") {
    tail = stack.split("\n").slice(1);
  } else {
    const lines = stack.split("\n");
    let start = lines.length;
    while (start > 0 && /^\s+at /.test(lines[start - 1])) start -= 1;
    if (start !== 1) return [];
    tail = lines.slice(start);
  }
  const frames: string[] = [];
  for (const line of tail) {
    if (!/^\s+at /.test(line)) continue;
    const frame = sanitizeFrame(line);
    if (frame !== null) frames.push(frame);
    if (frames.length >= STACK_LIMIT) break;
  }
  return frames;
}

function sanitizeFrame(line: string): string | null {
  const match = FRAME.exec(line);
  if (match === null) return null;
  const location = shortenLocation(match[2]);
  if (location === null) return null;
  const place = `${location}:${match[3]}:${match[4]}`;
  const name = match[1];
  if (name === undefined) return place;
  // 名前の形でないものが付いていたら、行ごと捨てる（場所の行に見せかけた文）
  return FRAME_NAME.test(name) ? `${name} (${place})` : null;
}

/** 道筋を短くする。組み立てた置き場は `.next/` から、依存は `node_modules/` から、それ以外の絶対の道筋は末尾 3 段だけ。 */
function shortenLocation(raw: string): string | null {
  let location = raw.replace(/^file:\/\//, "").replace(/^webpack-internal:\/\/\/(\([a-z-]+\)\/)?\.?\/?/, "");
  const built = location.lastIndexOf("/.next/");
  const dependency = location.lastIndexOf("/node_modules/");
  if (built >= 0) location = location.slice(built + 1);
  else if (dependency >= 0) location = location.slice(dependency + 1);
  else if (location.startsWith("/")) location = location.split("/").filter((part) => part.length > 0).slice(-3).join("/");
  return LOCATION.test(location) ? location : null;
}

/** 自分のコードの最初の行（依存と Node の中は飛ばす）。無ければ最初の行。 */
function primaryFrame(frames: string[]): string | null {
  return frames.find((frame) => !/(^|[ (])node_modules\//.test(frame) && !/(^|[ (])node:/.test(frame)) ?? frames[0] ?? null;
}

// --- 要求の目印 ------------------------------------------------------------

type HeaderBag = Headers | Readonly<Record<string, string | string[] | undefined>>;

/** ヘッダから要求の目印を読む。決まった形でなければ無いものとして扱う（送られてきた値を信じない）。 */
export function requestIdFrom(headers: HeaderBag | null | undefined): string | null {
  if (headers === null || headers === undefined) return null;
  const raw = headers instanceof Headers ? headers.get(REQUEST_ID_HEADER) : headers[REQUEST_ID_HEADER];
  const value = Array.isArray(raw) ? raw[0] : raw;
  return typeof value === "string" && REQUEST_ID.test(value) ? value : null;
}

/** 使い捨ての目印（16 桁の 16 進）。 */
export function newRequestId(): string {
  return crypto.randomUUID().replaceAll("-", "").slice(0, 16);
}
