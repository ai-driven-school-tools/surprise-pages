import type { Instrumentation } from "next";

import { requestIdFrom } from "./lib/logging/log-record";
import { ORGANIZATION_HEADER, organizationFromHeader } from "./lib/organization/scope";
import { logUnhandledEvent, wasLogged } from "./lib/logging/server-log";

/**
 * 取りこぼしの受け皿。入口の外枠（`routeLog`）が捕まえなかった失敗——画面の描画・
 * 操作（Server Actions）・外枠を持たない入口——も、同じ 1 つの形で残す。
 *
 * Next が渡す `request.path` は問い合わせ付きの実際の道筋（ページの呼び名が入る）なので
 * **読まない**。受け口は `context.routePath`（置き場所の型）で残す。ヘッダから読むのは
 * 関所が付けた要求の目印と、関所が付け直した要求の組織（目印だけ）だけ。
 */
export const onRequestError: Instrumentation.onRequestError = (error, request, context) => {
  // 外枠が既に書いた失敗（投げ直したもの）は、ここでは書かない
  if (wasLogged(error)) return;
  const digest = typeof error === "object" && error !== null ? Reflect.get(error, "digest") : undefined;
  // 外枠の外（画面の描画・操作）の失敗にも、関所が宛先から決めて付け直した組織の目印を付ける。形が違えば付けない
  logUnhandledEvent({
    level: "error",
    event: "request.unhandled",
    route: context.routePath,
    requestId: requestIdFrom(request.headers),
    error,
    fields: {
      method: request.method,
      routeType: context.routeType,
      renderSource: context.renderSource,
      digest: typeof digest === "string" ? digest : undefined,
    },
  }, organizationFromHeader(headerOf(request.headers, ORGANIZATION_HEADER))?.id ?? null);
};

/** Next が渡す見出し（素の入れ物）から 1 つ読む。同じ名前が並んでいれば最初のもの。 */
function headerOf(headers: Readonly<Record<string, string | string[] | undefined>>, name: string): string | null {
  const value = headers[name];
  const first = Array.isArray(value) ? value[0] : value;
  return typeof first === "string" ? first : null;
}
