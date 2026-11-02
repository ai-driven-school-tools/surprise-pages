/**
 * 部品を文字列で組むときの共通の材料（道具箱と、配信のときに先に描く部品 src/lib/first-paint/chrome.ts が同じものを使う）。
 */

/** 文字と属性の値に入れる字を逃がす。ページの見出しなど、外から来た字は必ずここを通す。 */
export function escapeMarkup(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/**
 * アイコンの SVG の文字列。道具箱が組み立てる部品（util.ts の icon）と、配信のときに先に描く部品
 * （src/lib/first-paint/chrome.ts）が同じ 1 つを使う——片方だけ太さや大きさが変わると、入れ替わる瞬間に絵が動く。
 * 中身は呼ぶ側が書いた固定の線だけで、外から来た値は混ざらない。
 */
export function iconSvg(paths: readonly string[], size: number, strokeWidth: number = 2): string {
  return (
    `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" ` +
    `stroke="currentColor" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round">` +
    paths.map((d) => `<path d="${d}" />`).join("") +
    `</svg>`
  );
}

/** 絵は飾りなので、部品の一覧（読み上げや AI の操作が読むもの）からは隠す。名前は押す部品の側が持つ。 */
export function iconMarkup(paths: readonly string[], size: number, strokeWidth: number = 2): string {
  return `<span class="icon" aria-hidden="true">${iconSvg(paths, size, strokeWidth)}</span>`;
}
