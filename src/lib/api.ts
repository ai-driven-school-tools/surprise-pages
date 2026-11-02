import { UnsafeDocumentError } from "./html/document-security";
import type { ErrorResponse } from "./comments/types";
import { requestTranslate, rt } from "./i18n/request";
import { logEvent } from "./logging/server-log";

/**
 * API の共通の入口。
 *
 * ページ本体は未ログインならログイン画面へ飛ばすが、API は飛ばさない。
 * 飛ばすと、ブラウザ側には「ログイン画面の HTML」が返ってきて何が起きたか分からなくなる。
 *
 * 公開ページの HTML は配信網に載るが、コメントはここから個別に取りに来るので、
 * 応答そのものは誰の手元にも残さない（人によって「自分のものか」が変わるため）。
 */

const NO_STORE = "private, no-store, max-age=0";

export function jsonResponse(payload: unknown, status: number): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": NO_STORE },
  });
}

export function jsonError(message: string, status: number): Response {
  const payload: ErrorResponse = { error: message };
  return jsonResponse(payload, status);
}

/**
 * 中で起きた例外のあと始末。
 *
 * 詳しい中身（種類・起きた場所・符号）はサーバーのログにだけ残す。
 * ブラウザへそのまま返すと、表の画面に裏側の作りが出てしまう。
 * 文面はログにも残さない（保存先の断り文には題名やアドレスが混ざる。`src/lib/logging/log-record.ts`）。
 * 受け口の型と要求の目印は、入口の外枠（`routeLog`）から自動で付く。
 */
export function serverError(error: unknown): Response {
  if (error instanceof UnsafeDocumentError) return jsonError(error.messageIn(requestTranslate()), 400);
  // 組織の上限。投稿・素材の受け取り・スライドを作る…のどの口から来ても、同じ符号（quota_exceeded）と項目名で断る
  logEvent({ level: "error", event: "request.failed", error });
  return jsonError(rt("server.internalError"), 500);
}
