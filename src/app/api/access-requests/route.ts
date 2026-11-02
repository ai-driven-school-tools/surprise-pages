import { jsonError, jsonResponse, serverError } from "@/lib/api";
import { currentOrganization } from "@/lib/organization/scope";
import { requestPageAccess } from "@/lib/access/access";
import { parsePageSlug } from "@/lib/comments/comments";
import { currentIdentity, isMember } from "@/lib/identity/identity";
import { routeLog } from "@/lib/logging/server-log";
import { rt } from "@/lib/i18n/request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 「このページを見せてほしい」を 1 件出す。
 *
 * 出せるのは会社の人だけ。門なしで誰でも押せるようにすると、
 * 持ち主の手元に外からのお願いが積める道具になる。
 *
 * 誰が出したかはサーバーが持っている名乗りからしか採らない（申告は受け付けない）。
 * 同じ人・同じページの未処理は 1 件にまとまる（表の索引がそうなっている）ので、
 * 何度押しても増えない。
 *
 * 応答にはページの題名も要約も載せない。押した人は、まだそのページを見られない。
 */
export async function POST(request: Request): Promise<Response> {
  return routeLog("/api/access-requests", request, async () => {
    const organization = await currentOrganization();
    const viewer = await currentIdentity();
    if (!isMember(viewer)) return jsonError(rt("auth.api.loginRequired"), 401);

    let payload: unknown;
    try {
      payload = await request.json();
    } catch {
      return jsonError(rt("auth.api.unreadableBody"), 400);
    }

    const record: Record<string, unknown> =
      typeof payload === "object" && payload !== null && !Array.isArray(payload) ? { ...payload } : {};

    const page = parsePageSlug(record["pageSlug"]);
    if (page === null) return jsonError(rt("auth.api.badPage"), 400);

    try {
      const outcome = await requestPageAccess(organization, viewer, page.slug);
      if (outcome === "notFound") return jsonError(rt("auth.api.noPage"), 404);
      // すでに開ける人が押した。積むものが無いことを伝えるだけで、断りではない
      if (outcome === "allowed") return jsonResponse({ ok: true, state: "allowed" }, 200);
      if (outcome === "already") return jsonResponse({ ok: true, state: "already" }, 200);
      return jsonResponse({ ok: true, state: "created" }, 201);
    } catch (error) {
      return serverError(error);
    }
  });
}
