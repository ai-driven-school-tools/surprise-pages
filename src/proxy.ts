import { NextResponse, type NextRequest } from "next/server";
import { countsTowardRateLimit, createRateLimiter, rateLimitClient, rateLimitedResponse, rateLimitTier, sameOriginRequest } from "./lib/access/request-security";
import { siteOrigin } from "./lib/settings/site-settings";
import { requestLocaleFrom, type Locale } from "./lib/i18n/locales";
import { messagesFor } from "./lib/i18n/messages";
import { translator } from "./lib/i18n/translate";
import { newRequestId, REQUEST_ID_HEADER } from "./lib/logging/log-record";
import { ORGANIZATION_HEADER, firstOrganizationScope, organizationHeaderValue } from "./lib/organization/scope";

const takeRate = createRateLimiter();

/**
 * 関所。すべての入口の手前で 3 つだけを行う。
 *
 *   1. 回数の上限（保存先を読む入口だけ・src/lib/access/request-security.ts）。知らない人に叩き続けられても保存先の無料枠を使い切られにくくする
 *   2. 書き込み（POST など）は同じサイトから来たものだけを通す（鍵つきの要求は別）
 *   3. 入口と受け皿が読む要求のヘッダに、要求の目印と組織の印を付け直す（外から送られた値は捨てる）
 */
export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  if (countsTowardRateLimit(path)) {
    const decision = takeRate(rateLimitTier(request), rateLimitClient(request));
    if (!decision.allowed) return rateLimitedResponse(decision.retryAfterSeconds, localeOf(request));
  }
  if (!path.startsWith("/api/")) return next(request);
  if (["GET", "HEAD", "OPTIONS"].includes(request.method)) return next(request);
  if (path.startsWith("/api/auth/") || path.startsWith("/api/cli-login/pending")) return next(request);
  if (request.headers.has("authorization") || sameOriginRequest(request, expectedOrigin())) return next(request);
  const locale = localeOf(request);
  const t = translator(locale, messagesFor(locale));
  return NextResponse.json({ error: t("server.sameSiteOnly") }, { status: 403 });
}

/** 同じサイトかの基準（設置のサイトの URL）。設置の途中で読めないときは、開いた宛先そのものを基準にする。 */
function expectedOrigin(): string | undefined {
  try { return siteOrigin(); } catch { return undefined; }
}

/**
 * 断り文の言語。関所は入口の外枠（`routeLog`）より手前なので、要求ごとの言語の置き場所を使わず、
 * 同じ決め方（cookie の写し → Accept-Language → 日本語）をここで 1 度だけ通す。DB は引かない。
 */
function localeOf(request: Request): Locale {
  return requestLocaleFrom({ cookieHeader: request.headers.get("cookie"), acceptLanguage: request.headers.get("accept-language") });
}

/** 通す。送られてきた目印は使わず付け直す。応答の見出しには触れない。 */
function next(request: NextRequest) {
  const headers = new Headers(request.headers);
  headers.set(REQUEST_ID_HEADER, newRequestId());
  headers.set(ORGANIZATION_HEADER, organizationHeaderValue(firstOrganizationScope()));
  return NextResponse.next({ request: { headers } });
}

/*
 * 関所は組み立ての静的な配り物（`_next/static`・`_next/image`）、自前で配る道具（`/vendor/…`）、
 * 道具箱と画像の部品（`/comments-widget.js`・`/page-images.js`）以外のすべての道筋で動かす。
 */
export const config = { matcher: ["/((?!_next/static|_next/image|vendor/|comments-widget.js|page-images.js).*)"] };
