import { intlLocale, type Locale } from "./locales";

/**
 * 日付と数の書式の共通口（多言語対応の基盤・docs/guides/i18n.md）。
 *
 * 画面ごとに `Intl.DateTimeFormat("ja-JP", …)` を書かず、ここを通す。言語は引数で受け取る——
 * ブラウザやサーバーの既定に任せると、サーバーで描いた字と画面で描き直した字が食い違う
 * （Next の手引き「Preventing flash before hydration」）。
 * 時刻帯は言語で変えない（会社の暦で読む）。
 */
export const TIME_ZONE = "Asia/Tokyo";

const dateFormats = new Map<string, Intl.DateTimeFormat>();
const numberFormats = new Map<Locale, Intl.NumberFormat>();
const relativeFormats = new Map<Locale, Intl.RelativeTimeFormat>();

/** 書式の道具は作るのが重いので、言語と形ごとに 1 つだけ作って使い回す。 */
function memo<K, T>(store: Map<K, T>, key: K, make: () => T): T {
  const found = store.get(key);
  if (found !== undefined) return found;
  const made = make();
  store.set(key, made);
  return made;
}

function dateOf(value: Date | string | number): Date {
  return value instanceof Date ? value : new Date(value);
}

/** 年月日（例 2026/10/03・Oct 3, 2026）。 */
export function formatDate(locale: Locale, value: Date | string | number): string {
  return memo(dateFormats, `date:${locale}`, () =>
    new Intl.DateTimeFormat(intlLocale(locale), { timeZone: TIME_ZONE, dateStyle: "medium" }),
  ).format(dateOf(value));
}

/** 年月日と時刻（分まで）。 */
export function formatDateTime(locale: Locale, value: Date | string | number): string {
  return memo(dateFormats, `datetime:${locale}`, () =>
    new Intl.DateTimeFormat(intlLocale(locale), { timeZone: TIME_ZONE, dateStyle: "medium", timeStyle: "short" }),
  ).format(dateOf(value));
}

/** 月と日だけ（例 10/03・10/03）。一覧の狭い列に収めるときに使う。 */
export function formatMonthDay(locale: Locale, value: Date | string | number): string {
  return memo(dateFormats, `monthday:${locale}`, () =>
    new Intl.DateTimeFormat(intlLocale(locale), { timeZone: TIME_ZONE, month: "2-digit", day: "2-digit" }),
  ).format(dateOf(value));
}

/** 時刻だけ（分まで。例 14:02・2:02 PM）。同じ日の中の出来事を並べるときに使う。 */
export function formatTime(locale: Locale, value: Date | string | number): string {
  return memo(dateFormats, `time:${locale}`, () =>
    new Intl.DateTimeFormat(intlLocale(locale), { timeZone: TIME_ZONE, timeStyle: "short" }),
  ).format(dateOf(value));
}

/** 数（桁の区切りつき）。 */
export function formatNumber(locale: Locale, value: number): string {
  return memo(numberFormats, locale, () => new Intl.NumberFormat(intlLocale(locale))).format(value);
}

const sizeFormats = new Map<Locale, Intl.NumberFormat>();
const SIZE_UNITS: readonly [string, number][] = [["GB", 1024 ** 3], ["MB", 1024 ** 2], ["KB", 1024]];

/** 容量（例 3.2 GB・850 MB）。単位は 1024 刻みで、小数は 1 桁まで。1 KB に満たなければバイト。 */
export function formatSize(locale: Locale, bytes: number): string {
  const format = memo(sizeFormats, locale, () => new Intl.NumberFormat(intlLocale(locale), { maximumFractionDigits: 1 }));
  for (const [unit, size] of SIZE_UNITS) if (bytes >= size) return `${format.format(bytes / size)} ${unit}`;
  return `${format.format(bytes)} B`;
}

const RELATIVE_STEPS: readonly [Intl.RelativeTimeFormatUnit, number][] = [
  ["second", 60],
  ["minute", 60],
  ["hour", 24],
  ["day", 7],
  ["week", 4.35],
  ["month", 12],
  ["year", Number.POSITIVE_INFINITY],
];

/** いまからの隔たり（例 3 分前・3 minutes ago）。 */
export function formatRelative(locale: Locale, value: Date | string | number, now: Date | number = Date.now()): string {
  let amount = (dateOf(value).getTime() - dateOf(now).getTime()) / 1000;
  const format = memo(relativeFormats, locale, () => new Intl.RelativeTimeFormat(intlLocale(locale), { numeric: "auto" }));
  for (const [unit, size] of RELATIVE_STEPS) {
    if (Math.abs(amount) < size) return format.format(Math.round(amount), unit);
    amount /= size;
  }
  return format.format(Math.round(amount), "year");
}
