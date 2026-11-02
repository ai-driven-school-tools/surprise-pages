/**
 * 画面上端に出す「知らせ」の重なり方の決まり。
 *
 * 文章で知らせる場所はここ 1 つ。手段を増やすと、どこを見れば結果が分かるのかが散らばる。
 *
 * 例外は 2 つ。どちらも「知らせは上端、操作は右下」で視線が届かないための逃げ。
 * リンクのコピーは、押したボタンの絵柄をチェックに差し替える（copyLinkLook）。
 * 原本の更新は、取り込みボタンの上に静かな紙を 1 回出す（origin-hint）。
 * 戻す長さは SUCCESS_LIFE_MS を共有する（コピーの絵柄）。原本の知らせの長さは
 * ウィジェット側（ORIGIN_HINT_LIFE_MS）が持つ。
 *
 * DOM を触らない決まりだけを置いてある。
 */

export type ToastState = "pending" | "success" | "failure";

export type Toast = {
  id: string;
  state: ToastState;
  text: string;
};

/** 同時に出しておく上限。これを超えたら、消えるのを待っているものから片付ける。 */
export const MAX_TOASTS = 5;

/**
 * うまくいった知らせが自分で消えるまで。失敗は消えない（読んで対処してもらうため）。
 * リンクをコピーしたあとの絵柄の差し替えも同じ長さを使う。片方だけ変えると、
 * 知らせが消えたあともチェックが残る／その逆が起きる。
 */
export const SUCCESS_LIFE_MS = 2400;

export function autoDismissMs(state: ToastState): number | null {
  return state === "success" ? SUCCESS_LIFE_MS : null;
}

/**
 * 新しい知らせを足す。新しいものが上。
 *
 * 溢れたときに片付けるのは「うまくいった知らせ」だけ。
 * 失敗は放っておくと消えてしまうと困るので、数の勘定では譲らない。
 */
export function addToast(list: readonly Toast[], toast: Toast): Toast[] {
  const next = [toast, ...list.filter((item) => item.id !== toast.id)];
  if (next.length <= MAX_TOASTS) return next;

  // 末尾（いちばん古い）から順に、消えてよいものを 1 つ落とす
  for (let i = next.length - 1; i >= 0; i -= 1) {
    if (next[i].state === "success") {
      next.splice(i, 1);
      return next;
    }
  }
  // 消してよいものが無ければ、そのまま並べる（失敗を勝手に消さない）
  return next;
}

/** 同じ 1 枚の中身を差し替える。カードは作り直さない。 */
export function settleToast(
  list: readonly Toast[],
  id: string,
  state: ToastState,
  text: string,
): Toast[] {
  return list.map((item) => (item.id === id ? { id, state, text } : item));
}

export function dismissToast(list: readonly Toast[], id: string): Toast[] {
  return list.filter((item) => item.id !== id);
}

export function findToast(list: readonly Toast[], id: string): Toast | null {
  return list.find((item) => item.id === id) ?? null;
}
