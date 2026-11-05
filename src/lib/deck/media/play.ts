/**
 * 発表中に枚の動画・音声をいつ始めるか（Keynote の「スライドに着いたら」「クリック時」と同じ 2 つ）。
 * 本文の属性 `data-deck-play` に書く。書いていないときの既定は、音声が「着いたら」、動画が今までどおり（自分で再生ボタンを押す）。
 * 繰り返しは標準の `loop`、音を消すのは標準の `muted` で持つ。枚を離れたら止める。
 * 再生するのは発表の 1 枚表示だけ（src/lib/deck/playback.ts・発表者画面は src/widget/deck/present/media.ts）。
 */
export const DECK_PLAY = "data-deck-play";
export const DECK_PLAY_MODES = ["arrive", "click"] as const;
export type DeckPlayMode = (typeof DECK_PLAY_MODES)[number];

export function isDeckPlayMode(value: string | null | undefined): value is DeckPlayMode {
  return DECK_PLAY_MODES.some(mode => mode === value);
}
/** 本文の動画・音声がいつ始まるか。null は「自分で再生ボタンを押す」（属性の無い動画）。 */
export function deckPlayMode(media: Pick<Element, "localName" | "getAttribute">): DeckPlayMode | null {
  const value = media.getAttribute(DECK_PLAY);
  if (isDeckPlayMode(value)) return value;
  return media.localName === "audio" ? "arrive" : null;
}
/** 右の欄で付け外しする動画・音声の属性。 */
export const DECK_MEDIA_SOUND_ATTRIBUTES = [DECK_PLAY, "loop", "muted"] as const;
/** 編集の操作で付けてよい始まり・繰り返し・ミュートか（動画と音声にだけ・始まりは arrive と click・繰り返しとミュートは "" か外す）。ほかの属性は見ない。 */
export function deckPlayAttributeAllowed(tag: string, name: string, after: string | null): boolean {
  if (name !== DECK_PLAY && name !== "loop" && name !== "muted") return true;
  return (tag === "video" || tag === "audio") && (after === null || (name === DECK_PLAY ? isDeckPlayMode(after) : after === ""));
}
