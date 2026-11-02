/**
 * 覗き見カードを開け閉めしてよいかの決まり。
 *
 * 指で 1 回押しただけでも、ブラウザは pointerdown → pointerup → click の順に
 * 何度も知らせてくる。カードを開くのは click だが、その手前の pointerup が
 * 「選び終わったかの見張り」を仕掛けるため、放っておくと開いた直後に
 * 同じ 1 回の操作で閉じられる。
 *
 * そこで「どの操作で開いたか」を覚えておき、同じ操作では閉じない。
 * 時間をずらしてごまかすのではなく、操作そのものが同じかどうかで決める
 * （待ち時間で逃げると、端末が遅い日にまた再発する）。
 */

export type PeekView = {
  open: boolean;
  /** 開くきっかけになった操作。同じものでは閉じない */
  openedBy: object | null;
  /** いま映しているコメント。横に送ると入れ替わる */
  commentId: string | null;
};

export const PEEK_CLOSED: PeekView = { open: false, openedBy: null, commentId: null };

/** その操作で開く。 */
export function openedBy(gesture: object, commentId: string | null = null): PeekView {
  return { open: true, openedBy: gesture, commentId };
}

/** 横に送って、映すコメントだけ入れ替える（開いた操作は引き継ぐ）。 */
export function showing(view: PeekView, commentId: string): PeekView {
  return { open: view.open, openedBy: view.openedBy, commentId };
}

/** 開いたのと同じ操作か。 */
export function isSameGesture(view: PeekView, gesture: object): boolean {
  return view.openedBy !== null && view.openedBy === gesture;
}

/**
 * 画面のどこかが押された。
 *
 * 開いたその操作なら残す。自分の画面の中を押したときも残す（中身を操作している）。
 * それ以外の場所を押したら閉じる。
 */
export function afterTap(view: PeekView, gesture: object, insideOurUi: boolean): PeekView {
  if (!view.open) return view;
  if (isSameGesture(view, gesture)) return view;
  if (insideOurUi) return view;
  return PEEK_CLOSED;
}

/**
 * 選択が消えた。
 *
 * 覗き見カードは「印を押して 1 件を読む」ためのもので、選択とは関係がない。
 * 文章を選ぶ入り口（下の帯）だけが選択に連動する。ここでは何もしない。
 */
export function afterSelectionLost(view: PeekView): PeekView {
  return view;
}

/** 下へ払われた / Escape が押された / 自分から閉じた。 */
export function afterDismiss(): PeekView {
  return PEEK_CLOSED;
}
