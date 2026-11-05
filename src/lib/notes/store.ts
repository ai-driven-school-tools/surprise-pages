/**
 * メモ帳の本文を 1 版として積む。
 *
 * 積み方は投稿・直す画面と同じ `commitRevision`（版の目印・保存時の HTML の検査・同時の保存の検知を作り直さない）。
 * 送り直しで二度積まないための受領記録は、スライドの編集と同じ作り——版の行に送信の目印（`edit_operation_id`）と
 * 記録（`edit_receipt`）を同じ取引で書き、同じ目印がもう一度来たら前の答えを返す。保存先の一意の縛り（ページ × 目印）が、
 * 別々の実行環境に同時に届いた送り直しも 1 つにする。
 */
import { createHash } from "node:crypto";
import { z } from "zod";
import { orgDb } from "../db/database";
import { defaultTranslate } from "../i18n/default";
import { LocalizedError } from "../i18n/errors";
import type { Member } from "../identity/identity";
import { composeNote } from "./document";
import type { NoteSaveResponse } from "./model";
import type { NoteSaveRequest } from "./request";
import {
  commitRevision,
  readHeadOf,
  recoverHeadDelivery,
  RevisionRaceError,
  StaleBaseError,
  type StoredPage,
} from "../pages/store";

export const noteReceiptSchema = z.object({
  format: z.literal("note"),
  id: z.uuid(),
  fingerprint: z.string(),
  baseVersionId: z.string(),
  summary: z.string(),
  client: z.literal("browser"),
});
export type NoteReceipt = z.infer<typeof noteReceiptSchema>;

/** ほかの場所で先に保存されていた（土台の版が古い）。窓口は 409 で返し、編集の部品は「ほかの場所で直されました」を出す。 */
export class NoteConflictError extends LocalizedError {
  constructor() {
    super("notes.server.conflict");
    this.name = "NoteConflictError";
  }
}
/** 同じ送信の目印で、違う中身が来た。窓口は 409 で返す。 */
export class NoteOperationReusedError extends LocalizedError {
  constructor() {
    super("notes.server.operationReused");
    this.name = "NoteOperationReusedError";
  }
}

/** 送り主・土台・中身から決まる指紋。同じ目印で中身だけ違う送信を見分ける。 */
export function noteFingerprint(author: string, request: Pick<NoteSaveRequest, "baseVersionId" | "title" | "body">): string {
  return createHash("sha256")
    .update(JSON.stringify({ author: author.toLowerCase(), base: request.baseVersionId, title: request.title, body: request.body }))
    .digest("hex");
}

async function readReceipt(page: StoredPage, id: string): Promise<(NoteReceipt & { versionId: string; versionNumber: number }) | null> {
  const { data, error } = await orgDb(page.organization)
    .from("page_revisions")
    .select("edit_receipt,version_id,version_number")
    .eq("page_id", page.id)
    .eq("edit_operation_id", id)
    .maybeSingle();
  if (error) throw new Error("note receipt lookup failed");
  if (data === null) return null;
  const row = z.object({ edit_receipt: z.unknown(), version_id: z.string(), version_number: z.number() }).parse(data);
  const receipt = noteReceiptSchema.safeParse(row.edit_receipt);
  // 同じ目印がメモ以外の記録に使われていた（スライドの操作など）。中身が違うのと同じ扱い
  if (!receipt.success) throw new NoteOperationReusedError();
  return { ...receipt.data, versionId: row.version_id, versionNumber: row.version_number };
}

/**
 * 1 版を積む。`page` は門（loadEditablePage → canEditPage）を通ったページ、`head` はその頭の版（呼ぶ側が清書の本文か確かめるのに
 * 読んだもの。同じものを 2 度読まない）。見せ方はここでは触らない（変える口は共有範囲の画面ただ 1 つ）。
 */
export async function saveNote(input: {
  viewer: Member;
  page: StoredPage;
  head: NonNullable<Awaited<ReturnType<typeof readHeadOf>>>;
  request: NoteSaveRequest;
}): Promise<NoteSaveResponse> {
  const { viewer, request, page, head } = input;
  const pageSlug = page.pageSlug;
  const fingerprint = noteFingerprint(viewer.email, request);

  const received = await readReceipt(page, request.operationId);
  if (received !== null) {
    if (received.fingerprint !== fingerprint) throw new NoteOperationReusedError();
    // 前に積んだ版をそのまま答える（いまの頭の版ではない——その後にほかの直しが積まれていても、この送信の答えは変わらない）
    await recoverHeadDelivery(page).catch(() => undefined);
    return { pageSlug, versionId: received.versionId, versionNumber: received.versionNumber, name: composeNote({ ...request, base: head.html }).name, unchanged: false, replayed: true };
  }

  // 土台の照合を先に。ずれていたら組み直す前に止める（黙って後勝ちにしない）
  if (head.revision.versionId !== request.baseVersionId) throw new NoteConflictError();
  // 本文が書けない形を含んでいれば、ここで断る。ページの名前（題か本文の冒頭）も同じ組み立てから出す
  const { html, name } = composeNote({ title: request.title, body: request.body, base: head.html });
  // 字が 1 つも変わっていなければ版を積まない（受領記録も残さない。同じ送り直しは同じ答えになる）
  if (head.html === html) {
    return { pageSlug, versionId: head.revision.versionId, versionNumber: head.revision.versionNumber, name, unchanged: true, replayed: false };
  }

  const summary = defaultTranslate("notes.history.saved");
  try {
    const saved = await commitRevision({
      organization: page.organization,
      pageSlug,
      html,
      message: summary,
      // 書いた人はサーバーが持っている名乗りから採る（申告は受け付けない）
      author: { email: viewer.email, name: viewer.name },
      expectedHead: request.baseVersionId,
      editReceipt: { format: "note", id: request.operationId, fingerprint, baseVersionId: request.baseVersionId, summary, client: "browser" },
    });
    return { pageSlug, versionId: saved.versionId, versionNumber: saved.versionNumber, name, unchanged: saved.unchanged, replayed: false };
  } catch (error) {
    if (error instanceof StaleBaseError || error instanceof RevisionRaceError) {
      // 同じ送信がほかの実行環境で先に積まれていたなら、その答えを返す（二度積まない）
      const raced = await readReceipt(page, request.operationId);
      if (raced !== null && raced.fingerprint === fingerprint) {
        return { pageSlug, versionId: raced.versionId, versionNumber: raced.versionNumber, name, unchanged: false, replayed: true };
      }
      throw new NoteConflictError();
    }
    throw error;
  }
}
