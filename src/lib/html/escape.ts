/**
 * HTML に字を差し込むときのエスケープ（サーバーと道具箱の共用・ほかのファイルを読み込まない葉）。
 * メモ帳の組み立て（src/lib/notes/document.ts）と書き出し（src/widget/editor/note-schema.ts）が同じ組を使う。
 */

/** 要素の中身に置く字（& < >）。 */
export function escapeText(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** 二重引用符で囲んだ属性の値にも置ける字（& < > "）。 */
export function escapeAttribute(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
