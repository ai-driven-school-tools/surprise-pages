import type { Node as PMNode } from "prosemirror-model";
import { Plugin, Selection, TextSelection, type Command } from "prosemirror-state";
import { Decoration, DecorationSet } from "prosemirror-view";
import { t } from "../shared/i18n";
import { noteSchema } from "./note-schema";

/**
 * メモ帳の題の行（題は任意）。白紙の最初の位置・題の行の案内・題へ字を吸い込ませないキーを、編集の部品（src/widget/editor/note-editor.ts）から分けて置く。
 *
 * - 白紙を開いたら、最初の位置は本文。題の行は残し、↑ か押して戻れる
 * - 題の行の案内「タイトル」は、題が空で、本文が空・カーソルが題の行・指を乗せた、のどれかのときだけ出す（指で触る端末では出したまま・
 *   静かにする見た目は src/widget/editor/note-styles.ts）
 * - 題が空のときのページの名前は本文の冒頭から決まる。決めるのはサーバー（src/lib/notes/document.ts）だけ
 */

const S = noteSchema.nodes;

/** 白紙の最初の位置。題が空なら、本文の最初の字を打てる場所。題に字があれば（保存しておいた下書きで題を戻した）null で題の行のまま。 */
export function bodyStart(doc: PMNode): Selection | null {
  const title = doc.firstChild;
  if (title === null || title.content.size > 0 || doc.childCount < 2) return null;
  return Selection.findFrom(doc.resolve(title.nodeSize), 1, true);
}

/** 本文の先頭で ↑。ブラウザの選択通知を待たず、題への移動を編集状態にも確定する。 */
export const arrowUpAtBodyStart: Command = (state, dispatch) => {
  const { $from, empty } = state.selection;
  const title = state.doc.firstChild;
  if (!empty || $from.depth !== 1 || $from.index(0) !== 1 || $from.parentOffset !== 0 || !$from.parent.isTextblock || title?.type !== S.title) return false;
  if (dispatch) dispatch(state.tr.setSelection(TextSelection.create(state.doc, title.nodeSize - 1)).scrollIntoView());
  return true;
};

/** 題の行の末尾で Delete。字のある本文の 1 段落目を題へ吸い込ませない（Backspace の止め方と対になる）。 */
export const deleteAtTitleEnd: Command = (state) => {
  const { $from, empty } = state.selection;
  if (!empty || $from.parent.type !== S.title || $from.parentOffset !== $from.parent.content.size) return false;
  const next = state.doc.childCount > 1 ? state.doc.child(1) : null;
  return next !== null && next.content.size > 0;
};

/** 本文に何か書いてあるか（字のあるブロックか、段落以外のブロック。見つけた時点で止める）。空の段落だけなら書いていない。 */
function hasBody(doc: PMNode): boolean {
  for (let index = 1; index < doc.childCount; index += 1) {
    const node = doc.child(index);
    if (node.type !== S.paragraph || node.content.size > 0) return true;
  }
  return false;
}

/** 空の行の薄い案内（題の行と、カーソルのある空の段落）。 */
export function placeholders(): Plugin {
  return new Plugin({
    props: {
      decorations(state) {
        const found: Decoration[] = [];
        const { $from, empty } = state.selection;
        state.doc.forEach((node, offset, index) => {
          if (index === 0 && node.content.size === 0) {
            // 題は任意。本文を書き始めて題の行から離れたら案内を静かにする（指を乗せた・題の行に戻ったときだけ出す。指で触る端末では出したまま）
            const quiet = hasBody(state.doc) && $from.parent.type !== S.title;
            const hint = t("notes.editor.titleHint");
            found.push(Decoration.node(offset, offset + node.nodeSize, quiet ? { "data-note-placeholder": hint, "data-note-quiet": "", "aria-label": hint } : { "data-note-placeholder": hint, "aria-label": hint }));
          }
          if (node.type === S.paragraph && node.content.size === 0 && empty && $from.depth === 1 && $from.before() === offset) {
            found.push(Decoration.node(offset, offset + node.nodeSize, { "data-note-placeholder": t("notes.editor.blockHint") }));
          }
        });
        return found.length === 0 ? null : DecorationSet.create(state.doc, found);
      },
    },
  });
}
