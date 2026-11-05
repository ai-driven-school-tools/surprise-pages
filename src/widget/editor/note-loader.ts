import { CLEAN_COPY_DOCUMENT_ATTR } from "../../lib/notes/model";
import { loadEditSource } from "../shared/api";
import { t } from "../shared/i18n";
import { noteEditing } from "./note-guard";
import type { NoteEditorHandle } from "./note-editor";

/**
 * メモ帳の入口（道具箱 src/widget/comments/comments.ts が呼ぶ）。編集の部品の本体（ProseMirror を含む）は道具箱の最初の読み込みに
 * 入れず、押したときにここから `import()` で読む。読むだけの人・直せない人には 1 バイトも送らない。
 *
 * 開く順:
 *   1. 直す口（/api/pages/edit）から、いまの版の目印と本文（配信と同じ見た目の付け替え済み）を取り寄せる
 *   2. 部品を読み、本文がメモ帳で崩さずに直せるかを確かめてから、配信された本文の上に乗せる
 * 終えるときは、送り残しを送って保存が落ち着くのを待ち、ページを読み込み直す（コメントの印・目次を元どおりに付け直す）。
 */

/** 道具箱の入口の絵（Lucide の notebook-pen）。 */
export const ICON_NOTEPAD = [
  "M13.4 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7.4",
  "M2 6h4",
  "M2 10h4",
  "M2 14h4",
  "M2 18h4",
  "M21.378 5.626a1 1 0 1 0-3.004-3.004l-5.01 5.012a2 2 0 0 0-.506.854l-.837 2.87a.5.5 0 0 0 .62.62l2.87-.837a2 2 0 0 0 .854-.506z",
];

/** このページでメモ帳を出せるか（清書の本文がある）。スライドのページには出さない。 */
export function noteOffered(): boolean {
  return document.querySelector(`main[${CLEAN_COPY_DOCUMENT_ATTR}]`) !== null && !document.body.hasAttribute("data-deck");
}

let handle: NoteEditorHandle | null = null;
let opening = false;

/** メモ帳が開いている（読んでいる最中も含む）。 */
export function noteOpen(): boolean {
  return opening || handle !== null || noteEditing();
}

/** 開く。開けたら true。開けなかった理由は `fail` で 1 行で告げる。 */
export async function openNotes(input: { pageSlug: string; notify(text: string): void; fail(text: string): void; prepare(): void }): Promise<boolean> {
  if (noteOpen()) return false;
  opening = true;
  try {
    const [source, module] = await Promise.all([loadEditSource(input.pageSlug), import("./note-editor").catch(() => null)]);
    if (module === null) {
      input.fail(t("notes.entry.loadFailed"));
      return false;
    }
    if (!source.ok) {
      input.fail(source.message);
      return false;
    }
    const main = new DOMParser().parseFromString(source.value.previewHtml, "text/html").querySelector<HTMLElement>(`main[${CLEAN_COPY_DOCUMENT_ATTR}]`);
    if (main === null || source.value.baseVersionId === null) {
      input.fail(t("notes.entry.unsupported"));
      return false;
    }
    const mounted = module.mountNoteEditor({ pageSlug: input.pageSlug, baseVersionId: source.value.baseVersionId, source: main, notify: input.notify, prepare: input.prepare });
    if (!mounted.ok) {
      input.fail(t(mounted.reason === "unsupported" ? "notes.entry.unsupported" : "notes.entry.loadFailed"));
      return false;
    }
    handle = mounted.handle;
    return true;
  } finally {
    opening = false;
  }
}

/** 終える。保存が落ち着いたらページを読み込み直す。保存が止まっている（ほかの場所で直された・届かない）ときは読み込み直さない。 */
export async function finishNotes(): Promise<boolean> {
  if (handle === null) return true;
  const saved = await handle.finish();
  if (!saved) return false;
  handle.destroy();
  handle = null;
  window.location.reload();
  return true;
}
