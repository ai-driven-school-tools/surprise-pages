/**
 * 本文の末尾の出典の札（`data-source-note`）の要素そのもの（開きから閉じまで）。中に要素を入れない決まりなので、
 * 閉じは最初に見つかったもので足りる。ほかのファイルを読み込まない葉（src/lib/pages/content.ts と
 * メモ帳の組み立て src/lib/notes/document.ts が同じものを読む）。
 */
export const SOURCE_NOTE_ELEMENT = /[ \t]*<(\w+)\b[^>]*\bdata-source-note\b[^>]*>[\s\S]*?<\/\1\s*>[ \t]*\n?/i;

/** 出典の札の要素そのもの（前後の空白を除く）。無ければ null。メモ帳の保存が札をそのまま引き継ぐ。 */
export function sourceNoteOf(html: string): string | null {
  return SOURCE_NOTE_ELEMENT.exec(html)?.[0].trim() ?? null;
}
