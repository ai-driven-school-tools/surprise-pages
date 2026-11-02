import type { ja } from "./ja";

/**
 * 辞書の形。**日本語の辞書から導く**ので、日本語に鍵を足すと、訳の側で欠けた鍵が型の誤りになる
 * （訳し漏れを `tsc` で止める）。
 */

/** 数で形が変わる文。`{count}` を渡すと、言語の決まり（`Intl.PluralRules`）で one / other を選ぶ。 */
export type Plural = { readonly one: string; readonly other: string };

type Widen<T> = T extends string
  ? string
  : T extends Plural
    ? Plural
    : { readonly [K in keyof T]: Widen<T[K]> };

export type Messages = Widen<typeof ja>;

type Leaves<T, Prefix extends string = ""> = {
  [K in keyof T & string]: T[K] extends string | Plural ? `${Prefix}${K}` : Leaves<T[K], `${Prefix}${K}.`>;
}[keyof T & string];

/** 辞書の鍵（`settings.appearance.title` の形）。無い鍵は型の誤りになる。 */
export type MessageKey = Leaves<Messages>;

/** 差し込む値。数は言語の書式（桁の区切り）で書く。 */
export type MessageParams = Readonly<Record<string, string | number>>;
