import { jsonError, jsonResponse, serverError } from "@/lib/api";
import { currentOrganization } from "@/lib/organization/scope";
import { claimHandoff } from "@/lib/identity/cli-login-pending";
import { readClaimRequest } from "@/lib/identity/cli-login-pending-value";
import { routeLog } from "@/lib/logging/server-log";
import { rt } from "@/lib/i18n/request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * クラウド環境が、許可された名乗りを取りに来る口。
 *
 * 合言葉が違うときの返事は、「まだ届いていない」と同じにする。
 * 違う返事を返すと、URL の合図を知っている人が合言葉を探せる。
 * 名乗りが乗るのは、届いていて合言葉が合ったときだけ。
 */

export async function POST(request: Request): Promise<Response> {
  return routeLog("/api/cli-login/pending/claim", request, async () => {
    const organization = await currentOrganization();
    let payload: unknown;
    try {
      payload = await request.json();
    } catch {
      return jsonError(rt("auth.api.unreadableBody"), 400);
    }

    const claimed = readClaimRequest(payload);
    if (claimed === null) return jsonError(rt("auth.api.badClaim"), 400);

    try {
      const result = await claimHandoff(organization, claimed.state, claimed.pollSecret);
      if (result.status === "ready") {
        return jsonResponse(
          { status: "ready", token: result.token, email: result.email },
          200,
        );
      }
      return jsonResponse({ status: result.status }, 200);
    } catch (error) {
      return serverError(error);
    }
  });
}
