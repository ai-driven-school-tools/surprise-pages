import { DEFAULT_LOCALE, type Locale } from "../i18n/locales";
import { messagesFor } from "../i18n/messages";
import { translator } from "../i18n/translate";

/**
 * 要求が届いた宛先の URL の頭（scheme は要求の URL、名前とポートは Host）。組織の宛先ではその組織の宛先になる。
 * 使うのは同じサイトかの基準と、アプリのログインが返す「引き換えに行く宛先」・引き換えの答えの宛先と、
 * 仕掛けを絞る組織の実行制限に書く行き先（src/lib/html/document-security.ts）だけ。
 * **組織は決めない**（組織は関所が付け直すヘッダ）。要求の URL の名前は組み立ての設定で決まり、組織の宛先を映さないので、Host を使う。
 */
export function requestOrigin(request: Request): string {
  const target = new URL(request.url);
  const host = request.headers.get("host");
  if (host !== null) target.host = host;
  return target.origin;
}

/** ブラウザの変更要求は同じサイトからだけ受ける。鍵を伴うCLIは各入口で別に認証。 */
export function sameOriginRequest(request: Request, expectedOrigin?: string): boolean {
  const origin = request.headers.get("origin");
  const fetchSite = request.headers.get("sec-fetch-site");
  return origin === (expectedOrigin ?? requestOrigin(request)) && (fetchSite === null || fetchSite === "same-origin");
}

/**
 * 関所の回数の上限。配布版は送信元ごと（保存先（Neon Free）を叩かれ続けて月の途中で止まるのを防ぐ）、社内版の組織は
 * 「組織 × 送信元」で、段（src/lib/plans.ts）の倍率を掛けて数える（。最初の組織と上限なしの段は数えない）。
 *
 * 数えるのは保存先ではなくこの処理の中。守りたい相手に数えさせると、数えること自体が
 * 上限を食う。そのぶん関数の実体ごとの控えになるので、一か所からの連打を止める役に
 * 限る。広い守りは Vercel の回数制限のルールが担う（導入ガイドの推奨手順）。
 *
 * 名乗りの有無は「どの枠を使うか」を選ぶだけで、本人かどうかは確かめない
 * （確かめるには保存先が要る）。偽の名乗りを付けても、送信元ごとに上限は残る。
 */
export const RATE_LIMIT_WINDOW_MS = 60_000;
export const RATE_LIMITS = {
  /** ログイン前の閲覧。資料 1 枚で画像を数十枚読むので、ページ数ではなく読み込み数で見積もる。 */
  anonymous: 300,
  /** ログイン中・投稿用の鍵つき。編集画面は保存の確認を繰り返すので広く取る。 */
  credentialed: 900,
  /** ログイン前に行を積めるただ 1 つの口。 */
  loginHandoff: 10,
} as const;
export type RateLimitTier = keyof typeof RATE_LIMITS;

const MAX_TRACKED = 10_000;

type Window = { startedAt: number; count: number };
export type RateLimitDecision = { allowed: true } | { allowed: false; retryAfterSeconds: number };

/**
 * 組織の段の回数の上限（決定 3）。関所が宛先から引いた組織と段（src/lib/plans.ts の rate）を渡す。
 * - 1 人（送信元）ぶんの枠は `RATE_LIMITS × multiplier` を**組織ごとに別に**数える（同じ送信元でも、組織が違えば別の枠）
 * - 組織の人みんなで分け合う「組織全体の枠」は**置かない**。関所は手形（セッションの cookie・Authorization）の中身を確かめられず、
 *   印の有無で「ログイン中」と見分けるだけなので、共有の枠を置くと、中身の無い印を付けて送信元を変えて叩くだけで
 *   組織の全員の閲覧・コメント・直しを 429 にできる（読むことは止めない決まりが破れる）。1 つの組織の連打が別の組織を
 *   減らさないことは、枠を組織ごとに分けることで足りる（決定 3 は「組織 × 人」の枠）
 */

export function createRateLimiter(limits: Record<RateLimitTier, number> = RATE_LIMITS, windowMs = RATE_LIMIT_WINDOW_MS) {
  const windows = new Map<string, Window>();
  function prune(now: number) {
    for (const [key, one] of windows) if (now - one.startedAt >= windowMs) windows.delete(key);
    // 期限内の送信元だけで埋まったときは古い順に捨てる。控えの大きさに上限を置く。
    for (const key of windows.keys()) {
      if (windows.size < MAX_TRACKED) break;
      windows.delete(key);
    }
  }
  function count(key: string, limit: number, now: number): RateLimitDecision {
    const current = windows.get(key);
    if (current === undefined || now - current.startedAt >= windowMs) {
      if (windows.size >= MAX_TRACKED) prune(now);
      windows.set(key, { startedAt: now, count: 1 });
      return limit >= 1 ? { allowed: true } : { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil(windowMs / 1000)) };
    }
    current.count += 1;
    if (current.count <= limit) return { allowed: true };
    return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((current.startedAt + windowMs - now) / 1000)) };
  }
  function take(tier: RateLimitTier, client: string, now = Date.now()): RateLimitDecision {
    return count(`${tier}:${client}`, limits[tier], now);
  }
  return Object.assign(take, { tracked: () => windows.size });
}

const SESSION_COOKIES = ["authjs.session-token", "__Secure-authjs.session-token"];

/**
 * 回数の上限で数える道筋（配布版も、組織の段の上限も同じ）。保存先を読む入口だけ（窓口・社内ページ・公開ページ・過去版・ログイン）。
 * 関所はすべての道筋で動く（組織のヘッダを付け直すため）が、道具・画像の部品・画面の読み込みまで数えると、
 * ふつうに読むだけで上限に当たる。数える範囲はこの関所が保存先を読む入口だけを見ていたころと同じ。
 */
export function countsTowardRateLimit(path: string): boolean {
  if (path === "/signin") return true;
  return ["/api", "/internal", "/public", "/history"].some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

export function rateLimitTier(request: Request): RateLimitTier {
  const path = new URL(request.url).pathname;
  if (path.startsWith("/api/cli-login/pending")) return "loginHandoff";
  if (request.headers.has("authorization")) return "credentialed";
  const cookie = request.headers.get("cookie") ?? "";
  const names = cookie.split(";").map((one) => one.split("=")[0].trim());
  return names.some((name) => SESSION_COOKIES.some((session) => name === session || name.startsWith(`${session}.`))) ? "credentialed" : "anonymous";
}

/** Vercel が付ける送信元。手元では 1 つの送信元として数える。 */
export function rateLimitClient(request: Request): string {
  const real = request.headers.get("x-real-ip")?.trim();
  if (real) return real;
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || "local";
}

/** 回数の上限の断り。言語は関所が決めて渡す（ここは要求の言語を知らない。無ければ日本語）。 */
export function rateLimitedResponse(retryAfterSeconds: number, locale: Locale = DEFAULT_LOCALE): Response {
  const message = translator(locale, messagesFor(locale))("server.rateLimited");
  return new Response(JSON.stringify({ error: message }), {
    status: 429,
    headers: { "content-type": "application/json; charset=utf-8", "retry-after": String(retryAfterSeconds), "cache-control": "no-store" },
  });
}
