import { defaultTranslate } from "./default";
import { ja } from "./messages/ja";
import type { MessageKey, MessageParams } from "./messages/types";
import { isMessageKey } from "./translate";
import type { Translate } from "./translate";

/**
 * 利用者に届く例外（多言語対応・docs/guides/i18n.md）。文の代わりに**辞書の鍵**を持ち、出すときにその人の言語で訳す。
 *
 * `message` には日本語の文を入れておく（ログは文面を残さない決まりなので、言語で分ける必要が無い。
 * 既存の `instanceof` の分岐と、文で比べていた古い呼び手を壊さない）。
 * 画面に届く型つきの例外（`ThemeError` など）はこれを継ぐ。
 */
export class LocalizedError extends Error {
  readonly key: MessageKey;
  readonly params: MessageParams;
  constructor(key: MessageKey, params: MessageParams = {}) {
    super(defaultTranslate(key, params));
    this.name = "LocalizedError";
    this.key = key;
    this.params = params;
  }
}

/** 例外を、その人の言語の文にする。辞書の鍵を持たない例外は `message` をそのまま返す。 */
export function localizedMessage(error: unknown, t: Translate): string {
  if (error instanceof LocalizedError) return t(error.key, error.params);
  return error instanceof Error ? error.message : String(error);
}

let storedKeys: Map<string, MessageKey> | null = null;
const pixelDiagnosticPattern = new RegExp("^" + ja.deckEditor.inspection.pixelsLow
  .split(/(\{\w+\})/)
  .map(part => /^\{\w+\}$/.test(part) ? "(\\d+)" : part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
  .join("") + "$");

/** 日本語の辞書の値 → 鍵（数で形の変わらない文だけ）。保存された文を出すときに引く。 */
function storedKeyOf(text: string): MessageKey | undefined {
  if (!storedKeys) {
    storedKeys = new Map();
    const walk = (node: object, prefix: string) => {
      for (const [name, value] of Object.entries(node)) {
        if (typeof value === "string") {
          // 差し込みのある文は字面が一致しないので、引けるのは固定の文だけ
          if (!/\{\w+\}/.test(value) && !storedKeys?.has(value)) {
            const key = `${prefix}${name}`;
            if (isMessageKey(key)) storedKeys?.set(value, key);
          }
        } else if (value && typeof value === "object" && !("one" in value)) walk(value, `${prefix}${name}.`);
      }
    };
    walk(ja, "");
  }
  return storedKeys.get(text);
}

/**
 * 保存先に日本語のまま残っている文（版の要約「資料を更新」・書き手「共同編集」・動画処理の失敗文など）を、
 * 出すときにその人の言語へ寄せる。保存の形は変えない（過去の行も、新しく書く行も日本語の正本の文のまま）。
 * 辞書の日本語と完全に一致したものだけ訳し、一致しなければそのまま返す（利用者が書いた文を訳さない）。
 */
export function localizeStored(text: string, t: Translate): string {
  const key = storedKeyOf(text);
  if (key) return t(key);
  // This saved diagnostic contains measured pixel dimensions. Match only its
  // complete, dictionary-owned sentence; never translate arbitrary user text.
  const pixels = pixelDiagnosticPattern.exec(text);
  if (pixels) return t("deckEditor.inspection.pixelsLow", {
    width: pixels[1], height: pixels[2], requiredWidth: pixels[3], requiredHeight: pixels[4],
  });
  return text;
}
