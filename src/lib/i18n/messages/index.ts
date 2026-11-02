import type { Locale } from "../locales";
import { en } from "./en";
import { ja } from "./ja";
import type { Messages } from "./types";

/**
 * すべての言語の辞書。サーバー・画面の外枠・本文ページの道具箱（`src/widget/shared/i18n.ts`）が読む。
 * 外枠は選んだ言語の分だけを画面へ渡す。道具箱は答えを待たずに描くので、全言語を束ねて手元で選ぶ。
 */
export const MESSAGES: Readonly<Record<Locale, Messages>> = { ja, en };

export function messagesFor(locale: Locale): Messages {
  return MESSAGES[locale];
}
