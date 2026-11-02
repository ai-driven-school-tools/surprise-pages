import { jsonError, jsonResponse, serverError } from "@/lib/api";
import { currentOrganization, type OrganizationScope } from "@/lib/organization/scope";
import { rt } from "@/lib/i18n/request";
import { canUsePageTools, gateError, openToolsPage as openPage } from "@/lib/access/access";
import { currentIdentity, type Identity } from "@/lib/identity/identity";
import {
  applyCommentPatch,
  findComment,
  isCommentId,
  markCommentDeleted,
  validateCommentPatch,
} from "@/lib/comments/comments";
import type { CommentResponse, PageComment } from "@/lib/comments/types";
import { routeLog } from "@/lib/logging/server-log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 直す・消す対象を 1 件見つけて、触ってよい人かを確かめる。
 *
 * 触ってよいかは、そのコメントが付いている**ページを開けるか**で決める。
 * ページ本体と同じ判定（openPage）を通すので、制限つきのページのコメントを
 * 名簿に無い人が直したり消したりできない。
 *
 * ここへ来る前に、道具箱を触れる相手か（＝会社の人か）は各口の頭で確かめてある。
 * 公開ページのコメントも社外の人には触らせない——読めない会話は直せもしない。
 */
async function loadTarget(
  organization: OrganizationScope,
  id: string,
  viewer: Identity,
): Promise<{ ok: true; comment: PageComment } | { ok: false; response: Response }> {
  const comment = await findComment(organization, id, viewer);
  if (comment === null) return { ok: false, response: jsonError(rt("toolbox.server.commentNotFound"), 404) };

  const gate = await openPage(organization, viewer, comment.pageSlug);
  if (!gate.ok) return { ok: false, response: gateError(gate.reason) };
  return { ok: true, comment };
}

/**
 * コメント 1 件を直す。
 *
 * 誰が何をしてよいかの線引き:
 *   本文・優先度 … 書いた本人だけ
 *   解決 / 再開  … そのページの道具箱を触れる人なら誰でも（誰が閉じたかは記録する）
 */
export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  return routeLog("/api/comments/[id]", request, async () => {
    const organization = await currentOrganization();
    const viewer = await currentIdentity();
    if (!canUsePageTools(viewer)) return gateError("signin");

    const { id } = await context.params;
    if (!isCommentId(id)) return jsonError(rt("toolbox.server.badCommentId"), 400);

    let payload: unknown;
    try {
      payload = await request.json();
    } catch {
      return jsonError(rt("toolbox.server.unreadableBody"), 400);
    }

    const patch = validateCommentPatch(payload);
    if (!patch.ok) return jsonError(rt(patch.reasonKey, patch.reasonParams), 400);

    try {
      const found = await loadTarget(organization, id, viewer);
      if (!found.ok) return found.response;

      const editsContent = patch.value.body !== null || patch.value.priority !== null;
      if (editsContent && !found.comment.mine) {
        return jsonError(rt("toolbox.server.ownCommentEdit"), 403);
      }

      const updated: CommentResponse = {
        comment: await applyCommentPatch(organization, id, patch.value, viewer),
      };
      return jsonResponse(updated, 200);
    } catch (error) {
      return serverError(error);
    }
  });
}

/** 消す。行は残したまま「消した印」を立てるだけ。 */
export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  return routeLog("/api/comments/[id]", _request, async () => {
    const organization = await currentOrganization();
    const viewer = await currentIdentity();
    if (!canUsePageTools(viewer)) return gateError("signin");

    const { id } = await context.params;
    if (!isCommentId(id)) return jsonError(rt("toolbox.server.badCommentId"), 400);

    try {
      const found = await loadTarget(organization, id, viewer);
      if (!found.ok) return found.response;
      if (!found.comment.mine) return jsonError(rt("toolbox.server.ownCommentDelete"), 403);

      await markCommentDeleted(organization, id);
      return jsonResponse({ ok: true }, 200);
    } catch (error) {
      return serverError(error);
    }
  });
}
