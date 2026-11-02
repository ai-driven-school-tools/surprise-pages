import { cache } from "react";
import { cookies, headers } from "next/headers";
import { currentIdentity, isMember } from "../identity/identity";
import { readLocaleSetting, readOrganizationLocale, readOrganizationName } from "../workspace/workspace";
import { DEFAULT_LOCALE, LOCALE_COOKIE, isLocale, negotiateLocale, resolveLocale, type Locale, type LocaleSetting } from "./locales";
import { messagesFor } from "./messages";
import { organizationParams, translator, type Translate } from "./translate";

/**
 * いま描いている画面の言語（サーバー側）。外枠（`src/app/layout.tsx`）と画面が同じ値を引く。
 *
 * 会社の人は個人設定（DB の正本）→ ブラウザの言語。それ以外の人（ログインの画面など）は
 * cookie の写し → ブラウザの言語。決め方そのものは `resolveLocale` の 1 通り。
 *
 * ブラウザの言語からも決まらないときは、組織の設定の「既定の言語」（覚えは 60 秒）。
 *
 * **読めなかったときは日本語**（投げない）。言語のために画面ごと落とさない。
 */
export const currentLocale = cache(async (): Promise<Locale> => {
  try {
    const [setting, list, jar, fallback] = await Promise.all([currentLocaleSetting(), headers(), cookies(), readOrganizationLocale()]);
    const acceptLanguage = list.get("accept-language");
    if (setting !== null) return resolveLocale({ setting, acceptLanguage, fallback });
    const copied = jar.get(LOCALE_COOKIE)?.value;
    return isLocale(copied) ? copied : negotiateLocale(acceptLanguage, fallback);
  } catch {
    return DEFAULT_LOCALE;
  }
});

/** 会社の人の個人設定の言語（自動を含む）。会社の人でなければ null。読めなければ「自動」。 */
export const currentLocaleSetting = cache(async (): Promise<LocaleSetting | null> => {
  try {
    const viewer = await currentIdentity();
    return isMember(viewer) ? await readLocaleSetting(viewer.email) : null;
  } catch {
    return null;
  }
});

/**
 * いまの要求の組織の名前（画面の「{organization} の資料」に差し込む）。
 *
 * 組織は関所が決めた要求の組織（`currentOrganization`）、名前はその組織の設定（`organizationProfile`・60 秒覚える・
 * 言語の決め方 `readOrganizationLocale` と同じ 1 回の読みを分け合う）から 1 度だけ採る。読めなければ null で、
 * 辞書の一般語（「この組織」）が入る（名前のために画面ごと落とさない）。
 */
export const currentOrganizationName = cache(async (): Promise<string | null> => {
  const names = await readOrganizationName();
  if (names === null) return null;
  if (names.shareable !== null) return names.shareable;
  // 配布版の組織の名前は設置した本人の呼び方（アドレスの @ より前）なので、名乗った人（本人と招かれた人）の画面にだけ渡す。
  // ログインの画面・meta など名乗っていない人にも届く画面では一般語（src/lib/organization/profile.ts の shareableOrganizationName と同じ決まり）
  try {
    return isMember(await currentIdentity()) ? names.name : null;
  } catch {
    return null;
  }
});

/** ログインしていない人にも届く場所（画面の meta・カードの絵）に出してよい組織の名前。配布版では出さない（null）。 */
export const currentShareableOrganizationName = cache(async (): Promise<string | null> => (await readOrganizationName())?.shareable ?? null);

/** サーバーで描く画面の、辞書を引く関数。組織の名前は決めて渡してある（`{organization}`）。 */
export async function serverTranslate(): Promise<Translate> {
  const [locale, name] = await Promise.all([currentLocale(), currentOrganizationName()]);
  return translator(locale, messagesFor(locale), organizationParams(name));
}
