/** Shared delivery transformations; never import widget build output here. */
import {withVendorScripts} from "../html/vendor-scripts";
const HEAD_OPEN = /<head[^>]*>/i;
const HAS_BASE = /<base\s/i;
/**
 * 頁の頭（body）と「先頭へ戻る」の、配信してよい名前。
 *
 * 額縁が付けていた `ads-top` / `ads-to-top` は、広告ブロッカーの汎用隠し
 * （EasyList `###ads-top`）にそのまま当たる。Safari のコンテンツブロッカーは
 * これを `css-display-none` に変えるので、body ごと消えて題名だけが残る。
 * 色の名前（`--ads-*` / `text-ads-text`）は class 規則と一致しないので触らない。
 */
export const PAGE_TOP_ID = "sp-top";
export const PAGE_TO_TOP_ID = "sp-to-top";
const LEGACY_TOP_ID = "ads-top";
const LEGACY_TO_TOP_ID = "ads-to-top";
export const DECK_SNAPSHOT_HEADER = "x-deck-snapshot";
/**
 * ページ内の相対パス（`shot.png`）が、そのページ専用のフォルダを指すようにする。
 *
 * ページ URL は `/internal/foo/bar` なので、素の相対パスは `/internal/foo/shot.png` に化けてしまう。
 * 配信時に行き先の基準を差し込むことで、書く人は「同じフォルダに画像がある」つもりのまま書ける。
 */
export function withAssetBase(html: string, pageHref: string): string {
  if (HAS_BASE.test(html)) return html;
  const baseTag = `<base href="${pageHref}/">`;
  const head = HEAD_OPEN.exec(html);
  if (head) {
    const at = head.index + head[0].length;
    return `${html.slice(0, at)}${baseTag}${html.slice(at)}`;
  }
  return `${baseTag}${html}`;
}

/**
 * 配信のときだけ、ブロッカーが隠す id を付け替える。
 *
 * **保管庫の中の HTML は書き換えない**。投稿し直さなくても既存のページが直る。
 * `ads-to-top` を先に置き換える（部分文字列の事故を避ける）。
 * 印の正本（src/lib/settings/brand.ts）も書き出し（`.no-print`）も、この id は見ていない。
 */
export function withSafeAnchorIds(html: string): string {
  if (!html.includes(LEGACY_TO_TOP_ID) && !html.includes(LEGACY_TOP_ID)) {
    return html;
  }
  return html.replaceAll(LEGACY_TO_TOP_ID, PAGE_TO_TOP_ID).replaceAll(LEGACY_TOP_ID, PAGE_TOP_ID);
}

export function deckSourcePreview(html:string,href:string|null):string {
  return withSafeAnchorIds(withVendorScripts(href?withAssetBase(html,href):html));
}
