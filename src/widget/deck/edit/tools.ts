import { DECK_MARK, DECK_NOTES_HIDDEN, DECK_OVERVIEW, DECK_SLIDES, DECK_TOOLBAR } from "../../../lib/deck/deck";

/**
 * 保存済みの操作列（src/templates/deck.html が本文を読み終えたあと main の先頭へ組む
 * 「プレゼンを始める・一覧・ノートを隠す」の 1 段）を、道具箱の側から読む。
 *
 * 道具箱のある画面では、この 1 段は上端の現在地の行と重なって 2 段になるので出さない（src/widget/deck/deck.ts）。
 * 代わりに右下の道具箱がプレゼンを、⋯ の「読み方」が発表者画面・一覧・ノートを受け持つ。
 * **押すのは隠した釦そのもの**——実行部とのあいだにイベントの取り決めを足さない（道具箱が見るのは
 * 属性と釦だけ。display: none の釦でも click() は届く）。状態は実行部が html / main に立てる属性から読む。
 *
 * 釦は字面で探す（保存済みページの実行部の文は本文の一部で訳さない。deck-present-launch.ts と同じ）。
 */

/** 発表者画面の入口の釦（deck-present-launch.ts が「プレゼンを始める」の隣に足す）の目印。 */
export const PRESENTER_LAUNCHER = "data-surprise-presenter";

export type DeckTools = {
  /** プレゼンを始める。隠れている・押せない（全部スキップ・版の見比べ中）ときは null */
  readonly present: HTMLButtonElement | null;
  /** 発表者画面（最新の版を読んでいるときだけ足される） */
  readonly presenter: HTMLButtonElement | null;
  /** 一覧（格子）の入り切り */
  readonly overview: HTMLButtonElement | null;
  readonly overviewOpen: boolean;
  /** 発表者ノートの表示・非表示（ノートの無い公開の本文には無い） */
  readonly notes: HTMLButtonElement | null;
  readonly notesHidden: boolean;
};

/** main の直下の操作列。発表中の段階の操作（`.deck-step-*`）は別物なので数えない。 */
function savedToolbar(): HTMLElement | null {
  const toolbar = document.querySelector(
    `body[${DECK_MARK}] > main[${DECK_SLIDES}] > [${DECK_TOOLBAR}]:not(.deck-step-controls):not(.deck-step-entry)`,
  );
  return toolbar instanceof HTMLElement ? toolbar : null;
}

function usable(button: HTMLButtonElement | undefined): HTMLButtonElement | null {
  return button !== undefined && !button.hidden && !button.disabled ? button : null;
}

function label(button: HTMLButtonElement): string {
  return (button.textContent ?? "").trim();
}

/** いま出ている操作列の釦と状態。操作列がまだ組まれていなければ null。 */
export function readDeckTools(): DeckTools | null {
  const toolbar = savedToolbar();
  if (toolbar === null) return null;
  const buttons = [...toolbar.querySelectorAll<HTMLButtonElement>(":scope > button")];
  return {
    present: usable(buttons.find((button) => !button.hasAttribute(PRESENTER_LAUNCHER) && label(button).includes("プレゼンを始める"))), // i18n-keep: 保存済みページの実行部が描く釦を字面で探す
    presenter: usable(buttons.find((button) => button.hasAttribute(PRESENTER_LAUNCHER))),
    overview: usable(buttons.find((button) => /^一覧(?:を閉じる)?$/.test(label(button)))), // i18n-keep: 同上
    overviewOpen: document.documentElement.hasAttribute(DECK_OVERVIEW),
    notes: usable(buttons.find((button) => /^ノートを(?:隠す|表示)$/.test(label(button)))), // i18n-keep: 同上
    notesHidden: toolbar.parentElement?.hasAttribute(DECK_NOTES_HIDDEN) ?? false,
  };
}

function fingerprint(tools: DeckTools | null): string {
  if (tools === null) return "";
  return [tools.present, tools.presenter, tools.overview, tools.notes]
    .map((button) => (button === null ? "0" : "1"))
    .concat(tools.overviewOpen ? "1" : "0", tools.notesHidden ? "1" : "0")
    .join("");
}

/**
 * 操作列の出入りと状態の変わり目で知らせる。返すのは、見るのをやめる関数。
 *
 * 実行部が操作列を組むのは本文を読み終えたあとなので、道具箱が先に立ち上がっていることが多い。
 * 見るのは light DOM だけ（道具箱の中の描き直しは shadow の中で、ここには届かない）。
 * 読んだ姿が同じなら知らせない——本文の読み込み中の細かな変化で道具箱を描き直さない。
 */
export function watchDeckTools(onChange: () => void): () => void {
  let last = fingerprint(readDeckTools());
  const observer = new MutationObserver(() => {
    const now = fingerprint(readDeckTools());
    if (now === last) return;
    last = now;
    onChange();
  });
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["hidden", "disabled", DECK_OVERVIEW, DECK_NOTES_HIDDEN],
  });
  return () => observer.disconnect();
}
