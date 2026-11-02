/** ログイン後の戻り先に使ってよいのは、このサイト内の絶対パスだけ。 */
export function safeInternalPath(value: string | undefined): string | null {
  if (typeof value !== "string") return null;
  if (!value.startsWith("/")) return null;
  // `//example.com` や `/\example.com` は外部サイトに飛ぶため弾く
  if (value.startsWith("//") || value.startsWith("/\\")) return null;
  return value;
}
