/** Browser-created immutable media must survive source refreshes for revision history. */
export const DECK_EDIT_ASSET_PREFIX = "_deck/media-";
export const DECK_EDIT_IMAGE_MAX_BYTES = 10 * 1024 * 1024;

/** The producer and both live/history readers share this immutable namespace.
 * Older uploads use UUIDs; optimized images use their SHA-256 content digest. */
const MEDIA_ID = /^(?:[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}|[a-f0-9]{64})$/;
export const DECK_MEDIA_PLACEHOLDER = `${DECK_EDIT_ASSET_PREFIX}video-placeholder.svg`;

export function isDeckMediaAssetPath(src: string): boolean {
  if (src === DECK_MEDIA_PLACEHOLDER) return true;
  if (!src.startsWith(DECK_EDIT_ASSET_PREFIX)) return false;
  const match = /^(.+)\.([a-z0-9]+)$/.exec(src.slice(DECK_EDIT_ASSET_PREFIX.length));
  return match !== null && MEDIA_ID.test(match[1]);
}

export function deckMediaAssetPath(id: string, extension: string): string {
  const src = `${DECK_EDIT_ASSET_PREFIX}${id}.${extension}`;
  if (!MEDIA_ID.test(id) || !isDeckMediaAssetPath(src)) throw new Error("素材の保存先が正しくありません"); // i18n-keep: 内部の不変条件。目印はサーバーが作るので、利用者の操作では起きない
  return src;
}
