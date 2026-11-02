/**
 * 画面の言語の正本（多言語対応の基盤・手引きは docs/guides/i18n.md）。
 *
 * どこからでも読める葉にしてある（サーバー・画面・道具箱・関所が同じ判定を通す）。
 * 保存先にも鍵にも触らない。誰の設定を使うかは `src/lib/i18n/server.ts` が決める。
 *
 * ## 決まり
 *
 * - **日本語が正本**。訳は日本語の辞書から導いた型に合わせる（`src/lib/i18n/messages/`）。
 * - 言語は URL に載せない（`/internal/`・`/public/`・共有のリンク・Slack の見出しを動かさないため）。
 *   決め方は「個人設定 → ブラウザの言語（Accept-Language）→ 日本語」の 1 通り（`resolveLocale`）。
 *   DB を引かない場所は、外枠が書き写した cookie（`LOCALE_COOKIE`）を先に見る（`requestLocaleFrom`）。
 * - 時刻帯は言語で変えない。会社の暦で読む（`Asia/Tokyo`・`src/lib/i18n/format.ts`）。
 */
export const LOCALES = ["ja", "en"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "ja";

/** 個人設定で選べる値。`auto` はブラウザの言語に合わせる（保存先では空）。 */
export const LOCALE_SETTINGS = ["auto", ...LOCALES] as const;
export type LocaleSetting = (typeof LOCALE_SETTINGS)[number];

/** 言語の名前は、その言語自身で書く（読めない言語の名前から自分の言語を探させない）。訳さない。 */
export const LOCALE_NAMES: Readonly<Record<Locale, string>> = { ja: "日本語", en: "English" }; // i18n-keep: 言語の名前はその言語自身で書く（訳さない）

/** 日付・数の書式に渡す地域つきの名前。 */
const INTL_LOCALES: Readonly<Record<Locale, string>> = { ja: "ja-JP", en: "en-US" };

export function isLocale(value: unknown): value is Locale {
  return LOCALES.some((locale) => locale === value);
}

export function intlLocale(locale: Locale): string {
  return INTL_LOCALES[locale];
}

/**
 * `Accept-Language` から、対応している言語のうち一番望まれているものを選ぶ。
 * 地域つき（`en-US`）は言語（`en`）で照らす。q=0 は「要らない」なので選ばない。
 * 何も合わなければ日本語。
 */
export function negotiateLocale(acceptLanguage: string | null | undefined, fallback: Locale = DEFAULT_LOCALE): Locale {
  if (!acceptLanguage) return fallback;
  const wanted = acceptLanguage
    .split(",")
    .map((part, order) => {
      const [tag = "", ...options] = part.trim().split(";");
      // q の無いものは 1。読めない q は「要らない」と読む（強い望みと取り違えない）
      const q = options.map((option) => /^\s*q\s*=(.*)$/i.exec(option)?.[1]).find((value) => value !== undefined);
      const weight = q === undefined ? 1 : /^\s*[0-9]*\.?[0-9]+\s*$/.test(q) ? Number(q) : 0;
      return { language: tag.trim().toLowerCase().split("-")[0] ?? "", weight: Number.isFinite(weight) ? weight : 0, order };
    })
    .filter((entry) => entry.weight > 0)
    .sort((a, b) => b.weight - a.weight || a.order - b.order);
  return wanted.map((entry) => entry.language).find(isLocale) ?? fallback;
}

/**
 * その人の画面の言語。選んだ言語があればそれ、「自動」ならブラウザの言語。
 */
export function resolveLocale({
  setting,
  acceptLanguage,
  fallback = DEFAULT_LOCALE,
}: {
  setting: LocaleSetting;
  acceptLanguage: string | null | undefined;
  /** ブラウザの言語からも決まらないときの言語（組織の設定の「既定の言語」）。渡さなければ日本語 */
  fallback?: Locale;
}): Locale {
  return setting === "auto" ? negotiateLocale(acceptLanguage, fallback) : setting;
}

/**
 * 決まった言語の写しを置く cookie の名前。
 *
 * 正本は個人設定（DB）で、外枠（`src/app/_components/i18n.tsx`）が画面を描くたびに**決まった言語**をここへ書き写す。
 * 読むのは DB を引かない場所——本文ページの道具箱（描く前に同期で決める）・窓口の断り文・関所。
 * HttpOnly にしない（道具箱が読むため）。中身は言語の名前だけで、人の名乗りは持たない。
 */
export const LOCALE_COOKIE = "sp-locale";
/** 写しの寿命（1 年）。外枠を開くたびに書き直す。 */
export const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/** `Cookie` の見出し（または `document.cookie`）から言語の写しを読む。無い・知らない値は null。 */
export function localeFromCookies(cookieHeader: string | null | undefined): Locale | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const [name = "", ...rest] = part.trim().split("=");
    if (name === LOCALE_COOKIE) {
      const value = rest.join("=").trim();
      return isLocale(value) ? value : null;
    }
  }
  return null;
}

/** DB を引かない場所の言語: cookie の写し → ブラウザの言語 → 日本語。 */
export function requestLocaleFrom({
  cookieHeader,
  acceptLanguage,
}: {
  cookieHeader: string | null | undefined;
  acceptLanguage: string | null | undefined;
}): Locale {
  return localeFromCookies(cookieHeader) ?? negotiateLocale(acceptLanguage);
}
