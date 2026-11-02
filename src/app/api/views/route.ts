import { jsonError, jsonResponse, serverError } from "@/lib/api";
import { currentOrganization } from "@/lib/organization/scope";
import { gateError, openPage } from "@/lib/access/access";
import { parsePageSlug } from "@/lib/comments/comments";
import { currentIdentity, isMember } from "@/lib/identity/identity";
import { recordPageView } from "@/lib/pages/views";
import { routeLog } from "@/lib/logging/server-log";
import { rt } from "@/lib/i18n/request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 「このページを見た」を 1 件控える口。
 *
 * 呼ぶのはウィジェット（右下の道具箱）で、名乗りが届いた直後に 1 回だけ、投げっぱなしにする。
 * だから応答は軽くてよく、失敗しても読む人の画面では何も起きない。
 *
 * ## 受け取るのは呼び名だけ（内部の目印は受け取らない）
 *
 * 台帳の目印（uuid）をそのまま受けて書く口にすると、**いま自分が見られないページの目印を
 * 当てた人が、一度も開かずに「見た」行を作れてしまう**。呼び名で受けて `openPage` を通せば、
 * 本文を読むのとまったく同じ判定を通ったページにしか書けない。
 *
 * 控えるのは会社の人の分だけ。名乗っていない人が公開ページを見た分は、
 * ブラウザの中にしか残さない（社外の人に、閲覧を追う目印を無言で配らないため）。
 */

/** 素の値（送られてきた JSON）を、型を壊さずに 1 段だけ開く。 */
function toRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const record: Record<string, unknown> = { ...value };
  return record;
}

export async function POST(request: Request): Promise<Response> {
  return routeLog("/api/views", request, async () => {
    const organization = await currentOrganization();
    let payload: unknown;
    try {
      payload = await request.json();
    } catch {
      return jsonError(rt("errors.request.unreadable"), 400);
    }

    const body = toRecord(payload);
    const page = parsePageSlug(body === null ? null : body["page"]);
    if (page === null) return jsonError(rt("errors.request.pageInvalid"), 400);

    const viewer = await currentIdentity();
    // ゲストと名乗っていない人には、アカウントに紐づく控えというものが無い
    if (!isMember(viewer)) return jsonError(rt("errors.request.loginRequired"), 401);

    try {
      // 門が開いてから書く。開くより前には、保管庫へ 1 文字も書かない
      const gate = await openPage(organization, viewer, page.slug);
      if (!gate.ok) return gateError(gate.reason);

      await recordPageView(viewer, gate.page);
      return jsonResponse({ recorded: true }, 200);
    } catch (error) {
      return serverError(error);
    }
  });
}
