import { z } from "zod";
import { NOTE_BODY_MAX_BYTES, NOTE_TITLE_MAX } from "./model";

/**
 * メモ帳の送る形の確かめ。取り決めの正本は src/lib/notes/model.ts で、ここは入力の確かめ（zod）を
 * 使う部分だけを分けたもの（道具箱の最初の読み込みに zod を連れてこない）。
 *
 * - `page` は直すページの呼び名（`<見せ方>/<場所>`）
 * - `baseVersionId` は直し始めた版の目印。必須で、頭の版とずれていたら 409（黙って後勝ちにしない）
 * - `operationId` は送る中身ごとに 1 つ。通信が切れて送り直すときは同じ目印・同じ中身で送る（二度積まない）
 */
export const noteSaveSchema = z
  .object({
    page: z.string().min(1).max(400),
    operationId: z.uuid(),
    baseVersionId: z.string().min(1).max(100),
    title: z.string().max(NOTE_TITLE_MAX),
    body: z.string().max(NOTE_BODY_MAX_BYTES),
  })
  .strict();
export type NoteSaveRequest = z.infer<typeof noteSaveSchema>;
