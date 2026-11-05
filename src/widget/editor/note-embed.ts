import { isYouTubeId } from "../../lib/deck/media/youtube-id";
import { NOTE_EMBED_FRAME_ATTR, noteEmbedFrame } from "../../lib/notes/blocks";

/**
 * メモ帳の埋め込みを、見るときに枠へ差し替える。保存した本文には枠（iframe）を書けない
 * （保存する HTML に iframe を書けない決まり・src/lib/html/document-security.ts）ので、本文には元の動画へのリンクの箱が入っている。
 * 箱は字を持たないので、差し替えても本文の字数（コメントの引用の位置）は変わらない。道具箱が読めないときは、箱のリンクで動画を開ける。
 * 編集の部品が乗っている間は、部品が自分の枠を描く（src/widget/editor/note-block-edit.ts の EmbedView）。
 * 道具箱の最初の読み込みに入る小さな葉（ProseMirror を読まない）。
 */
export function upgradeNoteEmbeds(root: ParentNode): void {
  for (const box of root.querySelectorAll<HTMLAnchorElement>(`figure[data-note-embed] > a[${NOTE_EMBED_FRAME_ATTR}]`)) {
    const id = box.parentElement?.getAttribute("data-note-embed-id") ?? null;
    if (!isYouTubeId(id)) continue;
    box.replaceWith(noteEmbedFrame(box.ownerDocument, id, box.className, box.getAttribute("aria-label") ?? ""));
  }
}
