import { localizedMessage, localizeStored } from "../../i18n/errors";
import type { Translate } from "../../i18n/translate";

/**
 * スライド編集の例外を、その人の言語の文にする（多言語対応・docs/guides/i18n.md）。
 *
 * 辞書の鍵を持つ例外（`LocalizedError`）は鍵から訳す。編集の衝突（`DeckEditConflictError`）は
 * エージェント用の入力契約に束ねるため鍵を持たず、日本語の正本の文で届く（保存先に残った「断った理由」も同じ）。
 * それは辞書の日本語と完全に一致するときだけ訳し直し、一致しなければ届いた文のまま出す。
 */
export function deckErrorMessage(error: unknown, t: Translate): string {
  return localizeStored(localizedMessage(error, t), t);
}
