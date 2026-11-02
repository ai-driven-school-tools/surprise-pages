/**
 * 保存される HTML の仕掛け（script など）の扱い。この設置はいつも `restricted`（保存時の検査と配信時の実行制限・src/lib/html/document-security.ts）。
 */
export const HTML_SCRIPT_MODES = ["restricted", "allowed"] as const;
export type HtmlScriptMode = (typeof HTML_SCRIPT_MODES)[number];

export function isHtmlScriptMode(value: unknown): value is HtmlScriptMode {
  return HTML_SCRIPT_MODES.some((mode) => mode === value);
}
