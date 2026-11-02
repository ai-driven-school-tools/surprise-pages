/**
 * ワークスペースの墨（DESIGN.md 9 章）を、CSS の外から読むための写し。
 *
 * 正本は `src/app/globals.css` の `--ws-*`。ページの上端の現在地の行（`src/widget/reading/location-bar-styles.ts`）は
 * 投稿されたページの中（Shadow DOM）に描くので、あの変数が届かない。一覧からページへ移っても
 * 戻る・進むと字の色が変わらないよう、同じ値をここから取る。
 * 2 つがそろっていることは検査表（check-window-titlebar）が見る。片方だけ直すと落ちる。
 *
 * 線と面は、墨を薄めて作る（`*Mix` はその割合）。地がどんな色でも同じ濃さで乗るので、地の色はここに持たない
 * （現在地の行は、開いているページの地を借りる）。
 */
export type WorkspaceInk = {
  readonly text: string;
  readonly muted: string;
  readonly lineMix: number;
  readonly hoverMix: number;
  readonly pressMix: number;
};

export const WORKSPACE_INK: { readonly light: WorkspaceInk; readonly dark: WorkspaceInk } = {
  light: { text: "#171717", muted: "#737373", lineMix: 9, hoverMix: 6, pressMix: 10 },
  dark: { text: "#f5f5f5", muted: "#a3a3a3", lineMix: 12, hoverMix: 9, pressMix: 15 },
};

/** 画面の字の書体。ワークスペースの画面（Tailwind の既定の並び）と同じ。 */
export const WORKSPACE_FONT = `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", "Noto Sans", Arial, sans-serif`;
