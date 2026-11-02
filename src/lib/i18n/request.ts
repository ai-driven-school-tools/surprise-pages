import { AsyncLocalStorage } from "node:async_hooks";
import { DEFAULT_LOCALE, requestLocaleFrom, type Locale } from "./locales";
import { messagesFor } from "./messages";
import type { MessageKey, MessageParams } from "./messages/types";
import { translator, type Translate } from "./translate";

/**
 * 窓口（route.ts）の断り文の言語（多言語対応・docs/guides/i18n.md）。
 *
 * **DB を引かない**——外枠が書き写した cookie と Accept-Language だけで決める（`requestLocaleFrom`）。
 * 入口の外枠（`routeLog`）が要求ごとに 1 度だけ決めて置くので、`jsonError` を返す深い所からも
 * 同期で引ける（`rt`）。外枠の外（検査の組み立てなど）では日本語。
 */
const locales = new AsyncLocalStorage<{ locale: Locale; t: Translate }>();

/** 要求の言語を決めて、`run` の中で引けるようにする。入口の外枠（`src/lib/logging/server-log.ts` の `routeLog`）だけが呼ぶ。 */
export function runWithRequestLocale<T>(request: Request | null | undefined, run: () => T): T {
  const locale = requestLocaleFrom({
    cookieHeader: request?.headers.get("cookie"),
    acceptLanguage: request?.headers.get("accept-language"),
  });
  return locales.run({ locale, t: translator(locale, messagesFor(locale)) }, run);
}

/** いまの要求の言語。外枠の外では日本語。 */
export function requestLocale(): Locale {
  return locales.getStore()?.locale ?? DEFAULT_LOCALE;
}

/** いまの要求の言語で辞書を引く（`jsonError(rt("server.loginRequired"), 401)` の形で使う）。 */
export function rt(key: MessageKey, params?: MessageParams): string {
  const store = locales.getStore();
  return store ? store.t(key, params) : translator(DEFAULT_LOCALE, messagesFor(DEFAULT_LOCALE))(key, params);
}

/** いまの要求の言語で辞書を引く関数そのもの（例外を訳す `localizedMessage` に渡す）。 */
export function requestTranslate(): Translate {
  return locales.getStore()?.t ?? translator(DEFAULT_LOCALE, messagesFor(DEFAULT_LOCALE));
}
