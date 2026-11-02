"use client";
import { createContext, useContext, useEffect, useMemo, type ReactNode } from "react";
import { DEFAULT_LOCALE, LOCALE_COOKIE, LOCALE_COOKIE_MAX_AGE, type Locale } from "../../lib/i18n/locales";
import type { Messages } from "../../lib/i18n/messages/types";
import { organizationParams, translator, type Translate } from "../../lib/i18n/translate";
import { defaultTranslate } from "../../lib/i18n/default";
import { ja } from "../../lib/i18n/messages/ja";

/**
 * 画面（ブラウザ側）へ言語と辞書を渡す受け口。外枠（`src/app/layout.tsx`）が 1 度だけ包む。
 * 渡すのは**選んだ言語の辞書だけ**（ほかの言語の辞書をブラウザへ配らない）。持つのは文言だけで、
 * 画面の中身・人の名乗りは持たない。
 *
 * 描いたら、決まった言語を cookie（`LOCALE_COOKIE`）へ書き写す。本文ページの道具箱・窓口の断り文・関所は
 * DB を引かずにこの写しで言語を決める（別の端末で設定を変えた分も、ここを開けば揃う）。
 */
type I18n = { locale: Locale; t: Translate; organization: string | null };

const I18nContext = createContext<I18n>({ locale: DEFAULT_LOCALE, t: defaultTranslate, organization: null });

/**
 * `messages` は既定の言語（日本語）では渡さない。日本語の辞書は画面の JS に既に入っている（`defaultTranslate`）ので、
 * 外枠から渡すと同じ辞書（約 200KB）を、控えの効かない HTML に載せて画面を開くたびに送り直すことになる。
 * ほかの言語のときだけ、その言語の辞書を渡す（ほかの言語の辞書を JS に入れて全員へ配らない）。
 *
 * `organization` は要求の組織の名前。辞書の `{organization}` に差し込む（「見本商事の資料」）。
 * 外枠がサーバーで 1 度だけ決めて渡す（`currentOrganizationName`）。null なら辞書の一般語（「この組織」）。
 */
export function I18nProvider({
  locale,
  messages,
  organization = null,
  children,
}: {
  locale: Locale;
  messages?: Messages;
  organization?: string | null;
  children: ReactNode;
}) {
  const value = useMemo(
    () => ({
      locale,
      organization,
      t: messages === undefined ? translator(DEFAULT_LOCALE, ja, organizationParams(organization)) : translator(locale, messages, organizationParams(organization)),
    }),
    [locale, messages, organization],
  );
  useEffect(() => {
    // 写しが既に同じ言語なら書かない。同じ値でも書き直すと、ブラウザが「開いてから cookie が変わった画面」と見なし、
    // 戻る・進むで画面をそのまま戻せなくなる（bfcache の CacheControlNoStoreCookieModified・docs/design/app-speed.md）。
    // 写しが無い・期限が切れた・別の言語のときは今までどおり書く
    const current = document.cookie.split("; ").find((part) => part.startsWith(`${LOCALE_COOKIE}=`));
    if (current === `${LOCALE_COOKIE}=${locale}`) return;
    const secure = window.location.protocol === "https:" ? "; Secure" : "";
    document.cookie = `${LOCALE_COOKIE}=${locale}; Path=/; Max-Age=${LOCALE_COOKIE_MAX_AGE}; SameSite=Lax${secure}`;
  }, [locale]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

/** 辞書を引く関数。外枠の外（`global-error`）では日本語の辞書を引く。 */
export function useT(): Translate {
  return useContext(I18nContext).t;
}

/** 要求の組織の名前（サイドバーが短く切って差し込む）。分からなければ null。 */
export function useOrganizationName(): string | null {
  return useContext(I18nContext).organization;
}

/** いまの画面の言語（日付と数の書式に渡す）。 */
export function useLocale(): Locale {
  return useContext(I18nContext).locale;
}
