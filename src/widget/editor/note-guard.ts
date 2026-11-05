/**
 * 本文の上でメモ帳の編集の部品が動いているか。
 *
 * 道具箱は本文の DOM に印を差し込む仕組みを持つ——コメントの引用の印・選んだ文へのコメントの下書きの印・版を見比べるときの赤入れ。
 * どれも文字ノードを割って要素を足すので、編集の芯（ProseMirror）が見張っている本文に差し込むと、芯がそれを「打った字」として
 * 読み直し、本文が壊れる。だからメモ帳が乗っている間は、道具箱はこの印を見て本文に何も差し込まない
 * （src/widget/comments/anchor.ts）。メモ帳を終えるとページを読み込み直すので、印はそこで元どおりに付く。
 *
 * ここは道具箱の最初の読み込みに入る小さな葉で、編集の部品そのものは読み込まない。
 */
let editing = false;

/** メモ帳が乗った・外れた。 */
export function setNoteEditing(next: boolean): void {
  editing = next;
}

/** 本文の上でメモ帳が動いているか（印を差し込まない）。 */
export function noteEditing(): boolean {
  return editing;
}
