/**
 * 発表者画面のキーの台帳と読み替え（Apple の「Keynote のキーボードショートカット」の「プレゼンテーションを再生する」と同じ動き）。
 * 段階はスライドの中で順に見せる表示で、Keynote のビルドに当たる。
 * - → ↓ Page Down Return Space: 次の段階、無ければ次の枚（「クリックで」の動画・音声があれば先にそれを始める）
 * - Shift+↓: 残りの段階を飛ばして次の枚
 * - ← ↑: 段階の途中でも前の枚。Shift+← ↑・Page Up・Backspace は段階を 1 つ戻す（クリッカーが送るキー）
 * - Home・End: 最初・最後の枚。Z: 前に見ていた枚へさかのぼる。番号を打って Return: その枚へ（Escape でやめる）
 * - V: 手元だけで見る・観客の画面に戻る（src/widget/deck/present/browse.ts）
 * 画面に出す一覧（PRESENTER_KEY_MAP）と読み替え（presenterKeyAction）はこのファイルだけが持つ。
 */
export type PresenterJump = "home" | "end" | "back" | "previous-slide" | "next-slide" | { number: number };
export type PresenterKeyAction =
  | { kind: "step"; direction: -1 | 1 }
  | { kind: "jump"; to: PresenterJump }
  | { kind: "type"; typed: string }
  | { kind: "browse" }
  | { kind: "none" };

/** 発表者画面の「キー」の一覧に出す行（文言の鍵・押し方の鍵）。読み替えを変えたら、ここも変える。 */
export const PRESENTER_KEY_MAP = [
  ["deckStudio.presenter.keyNext", "deckStudio.presenter.keyNextKeys"],
  ["deckStudio.presenter.keyNextSlide", "deckStudio.presenter.keyNextSlideKeys"],
  ["deckStudio.presenter.keyPrevious", "deckStudio.presenter.keyPreviousKeys"],
  ["deckStudio.presenter.keyStepBack", "deckStudio.presenter.keyStepBackKeys"],
  ["deckStudio.presenter.keyEnds", "deckStudio.presenter.keyEndsKeys"],
  ["deckStudio.presenter.keyJump", "deckStudio.presenter.keyJumpKeys"],
  ["deckStudio.presenter.keyBack", "deckStudio.presenter.keyBackKeys"],
  ["deckStudio.presenter.keyBrowse", "deckStudio.presenter.keyBrowseKeys"],
] as const;

/** 打てる番号の桁数。スライドは 4 桁に届かない。 */
const NUMBER_DIGITS = 4;
/** Z でさかのぼれる枚の数。発表 1 回ぶんには足りる。 */
const VISITED_LIMIT = 200;

/** typed は打ちかけの番号。null は発表者画面が受けないキー。番号を打っている途中でほかの送るキーを押したら、番号は捨てる（呼ぶ側）。 */
export function presenterKeyAction(event: { key: string; shiftKey: boolean }, typed: string): PresenterKeyAction | null {
  const { key, shiftKey } = event;
  if (/^[0-9]$/.test(key)) return { kind: "type", typed: typed.length < NUMBER_DIGITS ? typed + key : typed };
  if (typed) {
    if (key === "Enter") return { kind: "jump", to: { number: Number(typed) } };
    if (key === "Escape") return { kind: "type", typed: "" };
    if (key === "Backspace") return { kind: "type", typed: typed.slice(0, -1) };
  }
  if (key === "ArrowDown" && shiftKey) return { kind: "jump", to: "next-slide" };
  if (["ArrowRight", "ArrowDown", "PageDown", "Enter", " "].includes(key)) return { kind: "step", direction: 1 };
  if (key === "ArrowLeft" || key === "ArrowUp") return shiftKey ? { kind: "step", direction: -1 } : { kind: "jump", to: "previous-slide" };
  if (key === "PageUp" || key === "Backspace") return { kind: "step", direction: -1 };
  if (key === "Home") return { kind: "jump", to: "home" };
  if (key === "End") return { kind: "jump", to: "end" };
  if (key === "z" || key === "Z") return { kind: "jump", to: "back" };
  if (key === "v" || key === "V") return { kind: "browse" };
  // Escape はブラウザの全画面を抜けるのにも押される。受けて捨てる（発表を終えるのは「発表を終える」だけ）
  if (key === "Escape") return { kind: "none" };
  return null;
}

/**
 * 飛ぶ先と、見てきた枚（Z でさかのぼる）。枚は発表の並びの ID で覚える。
 * 前の枚へは、離れたときと同じく段階を出し切った姿で見せる（← で戻るのは、いま話し終えた枚の見直しのため）。
 */
export function presenterJumps() {
  const visited: string[] = [];
  return {
    /** 枚を移ったときに、移る前の枚を覚える。 */
    remember(key: string) {
      if (visited.at(-1) === key) return;
      visited.push(key);
      if (visited.length > VISITED_LIMIT) visited.shift();
    },
    /** 飛ぶ先。無ければ null。Z は覚えた枚を後ろから取り出し、もう無い枚と今の枚は飛ばす。 */
    target(keys: readonly string[], current: string | null, to: PresenterJump): { key: string; step: number } | null {
      const index = current === null ? -1 : keys.indexOf(current);
      const at = (position: number, step = 0) => keys[position] === undefined ? null : { key: keys[position], step };
      if (to === "home") return at(0);
      if (to === "end") return at(keys.length - 1);
      if (to === "previous-slide") return index > 0 ? at(index - 1, Number.MAX_SAFE_INTEGER) : null;
      if (to === "next-slide") return index >= 0 ? at(index + 1) : null;
      if (to === "back") {
        for (let key = visited.pop(); key !== undefined; key = visited.pop()) if (key !== current && keys.includes(key)) return { key, step: 0 };
        return null;
      }
      return to.number > 0 && keys.length ? at(Math.min(to.number, keys.length) - 1) : null;
    },
  };
}
