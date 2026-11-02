import { DEFAULT_LOCALE, localeFromCookies, type Locale } from "../../lib/i18n/locales";
import { MESSAGES } from "../../lib/i18n/messages";
import { organizationParams, translator, type Translate } from "../../lib/i18n/translate";
import { ORGANIZATION_LOGO_ATTR, ORGANIZATION_NAME_ATTR } from "../../lib/comments/types";

/**
 * 本文ページの道具箱の言語（多言語対応・docs/guides/i18n.md）。
 *
 * 道具箱は `/api/comments` の答えを待たずに描くので、言語は**描く前に同期で**決める。読むのは外枠
 * （`src/app/_components/i18n.tsx`）が書き写した cookie だけで、無ければ日本語。ページの HTML・ETag は言語で変えない。
 * ブラウザの言語（navigator）は見ない——外枠と窓口は個人設定と Accept-Language で決めており、
 * 道具箱だけ別の材料で決めると、同じ人の画面で言語が食い違う（写しは外枠を開くたびに揃う）。
 *
 * 保存済みページに貼られた実行部（`src/templates/deck.html` など）の文は本文の一部なので、ここでは訳さない。
 *
 * 辞書の `{organization}`（「見本商事の資料」）には、配信側が読み込みの札に書いた組織の名前を差し込む
 * （`data-organization-name`・src/lib/pages/content.ts の `withCommentsWidget`）。道具箱は保存先を引かない。札が無ければ辞書の一般語（「この組織」）。
 */
let current: { locale: Locale; t: Translate } | null = null;

function resolve(): { locale: Locale; t: Translate } {
  if (current) return current;
  let locale: Locale = DEFAULT_LOCALE;
  try {
    locale = localeFromCookies(typeof document === "undefined" ? "" : document.cookie) ?? DEFAULT_LOCALE;
  } catch {
    locale = DEFAULT_LOCALE;
  }
  current = { locale, t: translator(locale, MESSAGES[locale], organizationParams(organizationFromTag().name)) };
  return current;
}

/**
 * 配信側が読み込みの札に書いた、要求の組織の名前とロゴの行き先。読むのは印つきの行き先を名乗っている札だけ
 * （ページ本体が同じ形の札を書いていても拾わない・呼び名の札 `pageSlugFromTag` と同じ）。
 */
export function organizationFromTag(): { name: string | null; logo: string | null } {
  if (typeof document === "undefined") return { name: null, logo: null };
  const tag = document.querySelector(`script[src^="/comments-widget.js"][${ORGANIZATION_NAME_ATTR}]`);
  const name = tag?.getAttribute(ORGANIZATION_NAME_ATTR) ?? null;
  const logo = tag?.getAttribute(ORGANIZATION_LOGO_ATTR) ?? null;
  return {
    name: name !== null && name.trim().length > 0 ? name : null,
    // 自分の宛先のロゴの窓口だけ（配信側が書く形 src/lib/organization-logo.ts の organizationLogoHref）
    logo: logo !== null && /^\/api\/organization\/logo\?v=[0-9a-f]{16}$/.test(logo) ? logo : null,
  };
}

/** 道具箱の言語（日付と数の書式・`lang` 属性に渡す）。 */
export function widgetLocale(): Locale {
  return resolve().locale;
}

/** 道具箱の辞書を引く。`t("toolbox.reply")` の形で使う。 */
export const t: Translate = (key, params) => resolve().t(key, params);
