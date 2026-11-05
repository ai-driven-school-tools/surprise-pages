import { jsonError, jsonResponse, serverError } from "@/lib/api";
import { loadEditablePage } from "@/lib/access/page-edit-access";
import { sameOriginRequest } from "@/lib/access/request-security";
import { readUploadBytes } from "@/lib/deck/media/video-storage";
import { isDeckHtml } from "@/lib/deck/deck";
import { localizedMessage } from "@/lib/i18n/errors";
import { requestTranslate, rt } from "@/lib/i18n/request";
import { currentIdentity, isMember } from "@/lib/identity/identity";
import { routeLog } from "@/lib/logging/server-log";
import { NoteBodyError } from "@/lib/notes/document";
import { isCleanCopyHtml, NOTE_BODY_MAX_BYTES } from "@/lib/notes/model";
import { noteSaveSchema } from "@/lib/notes/request";
import { NoteConflictError, NoteOperationReusedError, saveNote } from "@/lib/notes/store";
import { currentOrganization } from "@/lib/organization/scope";
import { pageRefOf, readHeadOf } from "@/lib/pages/store";
import { featureEnabled } from "@/lib/settings/features";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * メモ帳の本文を、1 版として積む口。
 *
 * - 直す門は本文の直しと同じ 1 つ（loadEditablePage → canEditPage ただ 1 つ）。**頭の版が清書の本文であるとき**だけ積む
 *   （この口でスライドや図解のページを、清書の形で上書きさせない）
 * - 土台の版の目印（baseVersionId）は必須。頭の版とずれていたら 409（黙って後勝ちにしない）
 * - 積み方は投稿と同じ commitRevision（保存時の HTML の検査もそこで通る）。見せ方はここでは触らない
 * - 直せない人・無いページには、無いページと同じ 404（在りかも、直せないことも教えない）
 */
export async function PUT(request: Request): Promise<Response> {
  return routeLog("/api/pages/notes", request, async () => {
    if (!featureEnabled("notes")) return jsonError(rt("notes.server.notFound"), 404);
    // 閉じる瞬間の送信（keepalive）も同じ宛先から来る。よそのサイトからは受けない
    const origin = request.headers.get("origin");
    if ((origin !== null && !sameOriginRequest(request)) || request.headers.get("sec-fetch-site") === "cross-site") {
      return jsonError(rt("notes.server.sendHere"), 403);
    }
    const organization = await currentOrganization();
    const viewer = await currentIdentity();
    if (!isMember(viewer)) return jsonError(rt("notes.server.loginRequired"), 401);

    let payload: unknown;
    try {
      // 本文の上限に、題と目印のぶんのゆとりを足した大きさまで
      payload = JSON.parse(new TextDecoder().decode(await readUploadBytes(request, NOTE_BODY_MAX_BYTES + 4096)));
    } catch (error) {
      if (error instanceof RangeError) return jsonError(rt("notes.server.tooLarge"), 413);
      return jsonError(rt("notes.server.badRequest"), 400);
    }
    const parsed = noteSaveSchema.safeParse(payload);
    if (!parsed.success) return jsonError(rt("notes.server.badRequest"), 400);
    const save = parsed.data;
    const ref = pageRefOf(save.page);
    if (ref === null) return jsonError(rt("notes.server.notFound"), 404);

    try {
      const found = await loadEditablePage(organization, viewer, ref.pageSlug);
      if (!found.ok) return found.response;
      const head = await readHeadOf(found.page);
      if (head === null || !isCleanCopyHtml(head.html) || isDeckHtml(head.html)) return jsonError(rt("notes.server.notFound"), 404);
      const saved = await saveNote({ viewer, page: found.page, head, request: save });
      return jsonResponse(saved, 200);
    } catch (error) {
      if (error instanceof NoteBodyError) return jsonError(localizedMessage(error, requestTranslate()), 400);
      if (error instanceof NoteConflictError || error instanceof NoteOperationReusedError) return jsonError(localizedMessage(error, requestTranslate()), 409);
      return serverError(error);
    }
  });
}
