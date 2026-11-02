import { AsyncLocalStorage } from "node:async_hooks";

import { logLine, logRecord, newRequestId, organizationIdOf, requestIdFrom, type LogInput, type LogLevel } from "./log-record";
import { ORGANIZATION_HEADER, organizationFromHeader } from "../organization/scope";
import { runWithRequestLocale } from "../i18n/request";

/**
 * サーバーのログを出す口。**ここの `logEvent` ただ 1 つ**で、生の console を使わない。
 *
 * 1 件は 1 行の JSON（形と伏せ方は `src/lib/logging/log-record.ts`）。Vercel は標準の出力をそのまま拾うので、
 * 送り先の道具は持たない。あとで外の道具へ送るときも、ここから分けるだけでよい。
 *
 * ## 要求の目印と受け口の型を、入口の外枠から引き継ぐ
 *
 * 入口（route.ts）は `routeLog` で包む。包んだ中で呼ばれた `logEvent` は、受け口の型・要求の
 * 目印・入口に入ってからの時間を自動で添える——書く側が毎回渡して回らなくてよい。
 * 目印は関所（src/proxy.ts）がヘッダで付けたものを使い、関所を通らなかった要求にはその場で付ける。
 * 失敗を書いた要求の応答には、同じ目印を `x-request-id` で返す（問い合わせからログへ直行できる）。
 *
 * 要求の組織の目印（uuid）も同じ道で添える。関所が宛先から決めて付け直した見出し `x-pages-organization`
 * （`currentOrganization` が読むのと同じ見出し・同じ読み方 `organizationFromHeader`）を、外枠が入口に入るときに 1 度だけ読み、
 * 中で書かれた行（裏で走る処理も）に自動で付ける。名前・呼び名・ドメインは付けない。見出しの無い要求（関所を通らない
 * 配り物など）は印なしで書き、要求そのものは止めない。ログのために要求の組織を引き直さない（保存先も next/headers も読まない）。
 *
 * ## 書くのは失敗だけ（スイッチを入れたときだけ、要求ごとの 1 行も）
 *
 * 既定では、うまくいった要求は書かない。投げっぱなしの失敗・5xx の応答・共通の後始末が受けた失敗を、1 要求につき 1 行にする。
 *
 * スイッチ `PAGES_REQUEST_LOG` が `on` のときだけ、外枠が**要求ごとに 1 行** `request.completed` を足す。
 * 持つのは受け口の型・要求の目印・かかった時間・応答の番号（`fields.status`）だけ。エラーの割合の分母・遅さ・
 * 「ログが来ない」の見張りの材料になる。送り方（公式の転送か、自分で送るか）とは別のスイッチにしてあり、
 */

type RequestLog = {
  route: string;
  requestId: string;
  /** 要求の組織の目印（uuid）。読めなければ null。 */
  organization: string | null;
  startedAt: number;
  /** この要求で既に失敗を書いたか。外枠が 5xx の行を重ねないため。 */
  reported: boolean;
};

const requests = new AsyncLocalStorage<RequestLog>();

/** 外枠が書いた失敗に付ける印。取りこぼしの受け皿（src/instrumentation.ts）がもう一度書かないため。 */
const LOGGED = Symbol.for("surprise-pages.logged");

const STREAMS: Readonly<Record<LogLevel, "log" | "warn" | "error">> = { info: "log", warn: "warn", error: "error" };

/** 呼ぶ側が渡せる形。組織の印（organization）は型で受け取らない（置くのは入口の外枠だけ）。 */
export type LogEvent = Omit<LogInput, "route" | "requestId" | "organization" | "durationMs"> & Partial<Pick<LogInput, "route" | "requestId" | "durationMs">>;

/**
 * 1 件書く。受け口・目印・組織・時間は、入口の外枠の中なら自動で添える。
 * ログを書くこと自体が失敗しても、呼んだ側は止めない（ログのために本来の処理を落とさない）。
 */
export function logEvent(input: LogEvent): void {
  write(input, undefined);
}

/**
 * 外枠の外で起きた失敗を、関所が付け直した見出しから読んだ組織の目印つきで 1 件書く。**取りこぼしの受け皿（src/instrumentation.ts）だけが使う口**
 * （呼ぶ側を検査表 check-log-rules が見る）。外枠の中では外枠の組織が勝つ（要求の文脈を呼ぶ側に上書きさせない）。
 */
export function logUnhandledEvent(input: LogEvent, organization: string | null): void {
  write(input, organization);
}

function write(input: LogEvent, organization: string | null | undefined): void {
  try {
    const held = requests.getStore();
    const record = logRecord(
      {
        ...input,
        route: input.route ?? held?.route ?? null,
        requestId: input.requestId ?? held?.requestId ?? null,
        organization: held?.organization ?? organization ?? null,
        durationMs: input.durationMs ?? (held === undefined ? null : performance.now() - held.startedAt),
      },
      process.env,
      new Date(),
    );
    if (held !== undefined && record.level === "error") held.reported = true;
    console[STREAMS[record.level]](logLine(record));
  } catch {
    console.error('{"level":"error","event":"log.failed"}');
  }
}

/**
 * 入口の外枠。受け口の型（置き場所。実際の道筋ではない）を字面で渡す。
 * 字面が置き場所と一致することは検査表が見る（`tests/checks/check-server-log.mjs`）。
 *
 * - 投げっぱなしの失敗は 1 行書いて、そのまま投げ直す（Next の扱いを変えない）。
 *   Next の合図（転送・見つからない・動的の印）は失敗ではないので書かない。
 * - 5xx を返した要求は、まだ何も書いていなければ 1 行書く。
 */
export async function routeLog(route: string, request: Request | null | undefined, run: () => Response | Promise<Response>): Promise<Response> {
  // 外枠の中から別の入口の関数を呼んだとき（HEAD が GET を呼ぶ）は、外側の外枠に任せる（同じ失敗を 2 行にしない）
  if (requests.getStore() !== undefined) return run();
  const organization = organizationIdOf(organizationFromHeader(request?.headers.get(ORGANIZATION_HEADER))?.id);
  const held: RequestLog = { route, requestId: requestIdFrom(request?.headers) ?? newRequestId(), organization, startedAt: performance.now(), reported: false };
  const method = request?.method ?? "GET";
  // 断り文の言語も要求ごとに 1 度だけ決めて置く（cookie の写しと Accept-Language だけ・DB は引かない）
  return requests.run(held, () => runWithRequestLocale(request, async () => {
    try {
      const response = await run();
      if (response.status >= 500 && !held.reported) logEvent({ level: "error", event: "request.failed", fields: { method, status: response.status } });
      if (held.reported) markResponse(response, held.requestId);
      completed(response.status);
      return response;
    } catch (error) {
      const signal = isFrameworkSignal(error);
      if (!signal && !wasLogged(error)) {
        logEvent({ level: "error", event: "request.crashed", error, fields: { method } });
        markLogged(error);
      }
      // 投げっぱなしの失敗は Next が 500 にする。合図（転送・見つからない）は合図が持つ番号だけを読む
      completed(signal ? signalStatus(error) : 500);
      throw error;
    }
  }));
}

/**
 * 要求ごとの 1 行。スイッチ `PAGES_REQUEST_LOG` が `on` のときだけ（未設定なら書かない＝今までの動き・docs/guides/feature-switches.md）。外枠の中から呼ぶので、受け口の型・目印・かかった時間は自動で添わる。
 * 添えるのは応答の番号だけ（分からなければ番号なし。数には入る）。
 */
function completed(status: number | null): void {
  if (process.env.PAGES_REQUEST_LOG !== "on") return;
  logEvent({ level: "info", event: "request.completed", fields: { status: status ?? undefined } });
}

/** Next の合図が持つ応答の番号（転送の 307 など・見つからないの 404）。番号の形でなければ null。道筋などほかの部分は読まない。 */
function signalStatus(error: unknown): number | null {
  if (typeof error !== "object" || error === null) return null;
  const digest = Reflect.get(error, "digest");
  if (typeof digest !== "string") return null;
  const match = /^NEXT_REDIRECT;.*;(30[12378]);?$/.exec(digest) ?? /^NEXT_HTTP_ERROR_FALLBACK;(4[0-9]{2})$/.exec(digest);
  return match === null ? null : Number(match[1]);
}

/**
 * 失敗を書いた要求の応答にだけ、同じ目印を載せる（`x-request-id`）。その値でログを引けば、その失敗の行が出る。
 * うまくいった応答には何も足さない——配り物（vendor・ウィジェット）や配信網に控えさせる応答を、要求ごとに変えないため。
 * `Response.redirect()` の見出しは書き換えられないので、そのときは載せない。
 */
function markResponse(response: Response, requestId: string): void {
  try {
    response.headers.set("x-request-id", requestId);
  } catch {
    // 書き換えられない見出し（転送の応答）
  }
}

/**
 * 応答を返したあとに走る処理（Next の `after`）を、元の要求の目印と受け口のまま走らせる。
 * 失敗は 1 行書いて飲み込む（応答は返したあとなので、投げ直す先が無い）。
 */
export function inBackground(step: string, run: () => unknown): () => Promise<void> {
  const held = requests.getStore();
  const task = async () => {
    try {
      await run();
    } catch (error) {
      logEvent({ level: "error", event: "background.failed", error, fields: { step } });
    }
  };
  return held === undefined ? task : () => requests.run(held, task);
}

/**
 * 待つ処理 1 つを包んで、答えとかかった時間（ミリ秒）を返す。段ごとの時間をログに添えるため（`accessMs` など・src/lib/logging/log-fields.json）。
 * 画面の組み立ての中で時計を直に読まない（描画は毎回同じ結果にする決まり）——時間を測るのは待つ処理の側。
 */
export async function timed<T>(run: () => Promise<T>): Promise<{ value: T; ms: number }> {
  const started = performance.now();
  const value = await run();
  return { value, ms: Math.round(performance.now() - started) };
}

/** Next が制御のために投げる値（転送・見つからない・動的の印）。digest が数字でない。 */
export function isFrameworkSignal(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const digest = Reflect.get(error, "digest");
  return typeof digest === "string" && !/^[0-9]+$/.test(digest);
}

export function markLogged(error: unknown): void {
  if (typeof error !== "object" || error === null) return;
  try {
    Object.defineProperty(error, LOGGED, { value: true, enumerable: false });
  } catch {
    // 凍った値には印を付けられない。受け皿が二重に書くだけで、漏れはしない
  }
}

export function wasLogged(error: unknown): boolean {
  return typeof error === "object" && error !== null && Reflect.get(error, LOGGED) === true;
}
