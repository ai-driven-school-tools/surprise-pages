import { jsonError, jsonResponse, serverError } from "@/lib/api";
import { currentOrganization } from "@/lib/organization/scope";
import { currentIdentity, isMember } from "@/lib/identity/identity";
import { revokeToken } from "@/lib/identity/publish-tokens";
import { routeLog } from "@/lib/logging/server-log";
import { rt } from "@/lib/i18n/request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 鍵を止める。
 *
 * 止められるのは自分の鍵だけ。他人のものや無い id は、区別せず「ありません」で返す。
 * 「あるけれど権限が無い」と答えると、id を並べて総当たりするだけで
 * 誰かの鍵が実在することを確かめられてしまう。
 */
export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  return routeLog("/api/tokens/[id]", _request, async () => {
    const organization = await currentOrganization();
    const viewer = await currentIdentity();
    if (!isMember(viewer)) return jsonError(rt("auth.api.loginRequired"), 401);

    const { id } = await context.params;

    try {
      const stopped = await revokeToken(organization, id, viewer.email);
      if (!stopped) return jsonError(rt("auth.api.noDevice"), 404);
      return jsonResponse({ ok: true }, 200);
    } catch (error) {
      return serverError(error);
    }
  });
}
