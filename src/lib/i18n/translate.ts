import { formatNumber } from "./format";
import { intlLocale, type Locale } from "./locales";
import { ja } from "./messages/ja";
import type { MessageKey, MessageParams, Messages, Plural } from "./messages/types";

/**
 * 辞書を引く関数を作る（多言語対応の基盤・docs/guides/i18n.md）。
 *
 * 辞書は引数で受け取る。どの言語の辞書を持ち込むかは使う側が決める（画面の外枠は選んだ言語の分だけを
 * ブラウザへ渡し、道具箱は描く前に選ぶので全言語を束ねる）。
 */
export type Translate = (key: MessageKey, params?: MessageParams) => string;

function isPlural(value: unknown): value is Plural {
  return typeof value === "object" && value !== null && "one" in value && "other" in value;
}

function lookup(messages: Messages, key: string): string | Plural | undefined {
  let node: unknown = messages;
  for (const part of key.split(".")) {
    if (typeof node !== "object" || node === null || !(part in node)) return undefined;
    node = Object.entries(node).find(([name]) => name === part)?.[1];
  }
  return typeof node === "string" || isPlural(node) ? node : undefined;
}

/** 辞書（日本語の正本）に実在する鍵か。外から来た字を鍵として扱う前に通す。 */
export function isMessageKey(value: string): value is MessageKey {
  return lookup(ja, value) !== undefined;
}

/**
 * 組織の名前の差し込み（複数組織対応の B5）。画面の「会社」「社内」は、要求の組織の名前を差し込んで言う
 * （「見本商事の資料」「最初の組織の全員」）。名前を毎回の呼び出しで渡さないよう、引く関数を作るときに 1 度だけ渡す（`fixed`）。
 * 渡す場所は外枠（`src/app/_components/i18n.tsx`）・サーバーの画面（`serverTranslate`）・道具箱（`src/widget/shared/i18n.ts`・配信時の札から）の 3 つ。
 */
export const ORGANIZATION_PARAM = "organization";

/**
 * 組織の名前が分からないとき（受け口の宛先でまだ組織が決まっていない・窓口の断り文・デスクトップアプリ）に差し込む一般語。
 * 字のまま `{organization}` を画面に出さないため、ここだけは渡し忘れを辞書の一般語（「この組織」）で埋める。
 */
const ORGANIZATION_FALLBACK = "common.thisOrganization";

/** 組織の名前を決まった差し込みに渡す形。名前が無ければ渡さない（辞書の一般語が入る）。 */
export function organizationParams(name: string | null | undefined): MessageParams {
  return typeof name === "string" && name.length > 0 ? { [ORGANIZATION_PARAM]: name } : {};
}

/**
 * @param fixed 呼び出しごとの差し込みより弱い、決まった差し込み（いまは組織の名前だけ）
 */
export function translator(locale: Locale, messages: Messages, fixed: MessageParams = {}): Translate {
  const plurals = new Intl.PluralRules(intlLocale(locale));
  const fallback = lookup(messages, ORGANIZATION_FALLBACK);
  return (key, given = {}) => {
    const params = { ...fixed, ...given };
    const found = lookup(messages, key);
    // 型で止めているので、ここに来るのは古い辞書を持った画面だけ。鍵をそのまま出して気づけるようにする
    if (found === undefined) return key;
    const count = params.count;
    const text = typeof found === "string" ? found : typeof count === "number" && plurals.select(count) === "one" ? found.one : found.other;
    return text.replace(/\{(\w+)\}/g, (whole, name: string) => {
      const value = params[name] ?? (name === ORGANIZATION_PARAM && typeof fallback === "string" ? fallback : undefined);
      if (value === undefined) return whole;
      return typeof value === "number" ? formatNumber(locale, value) : value;
    });
  };
}
