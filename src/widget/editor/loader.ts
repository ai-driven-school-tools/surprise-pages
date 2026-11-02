import type { EditorHooks } from "./editor";
import { t } from "../shared/i18n";

/**
 * 直す画面（記事・スライド・動画）の部品の入口。部品の本体（src/widget/editor/editor.ts から先・スライドの見本や HTML の読み取りを含めて
 * 3MB 超）は、道具箱の最初の読み込みに入れず、ここから読む（docs/design/app-speed.md の「道具箱の部品を分ける」）。
 *
 * - 直せる人の画面では、道具箱が落ち着いたあとの空き時間に先に読んでおく（warmEditor）。押した瞬間に開ける
 * - 直せない人・社外の人には送らない
 * - 読めなかったとき（公開をまたいで開いたままの画面で、前の版の部品がもう配られていない）は 1 行で告げる
 */
type EditorModule = typeof import("./editor");

let loaded: EditorModule | null = null;
let loading: Promise<EditorModule> | null = null;
/** 部品を読んでいる間も「開いている」と数える（2 度押しで 2 枚開かない）。 */
let opening = false;

function loadEditor(): Promise<EditorModule> {
  loading ??= import("./editor").then(
    (editor) => {
      loaded = editor;
      return editor;
    },
    (error: unknown) => {
      loading = null;
      throw error;
    },
  );
  return loading;
}

/** 直せる人の画面で、空き時間に部品を先に読んでおく。読めなくても何も起きない（押したときにもう 1 度読む）。 */
export function warmEditor(): void {
  const start = () => void loadEditor().catch(() => undefined);
  if (typeof window.requestIdleCallback === "function") window.requestIdleCallback(start, { timeout: 4000 });
  else window.setTimeout(start, 1500);
}

/** いま編集の画面が開いているか（開いている間は 2 枚目を開かない）。部品をまだ読んでいなければ、開いていない。 */
export function editorActive(): boolean {
  return opening || (loaded?.editorActive() ?? false);
}

export async function openPageEditor(hooks: EditorHooks, options: { designOnly?: boolean } = {}): Promise<void> {
  if (editorActive()) return;
  opening = true;
  let editor: EditorModule;
  try {
    editor = await loadEditor();
  } catch {
    hooks.fail(t("toolbox.editor.deckEditorLoadFailed"));
    return;
  } finally {
    opening = false;
  }
  await editor.openPageEditor(hooks, options);
}

export type { EditorHooks };
