import { computerName } from "@/app/cli-login/handoff-target";
import { currentOrganization } from "@/lib/organization/scope";
import { jsonError, jsonResponse, serverError } from "@/lib/api";
import { openPending } from "@/lib/identity/cli-login-pending";
import { readOpenRequest } from "@/lib/identity/cli-login-pending-value";
import { tidyLabel } from "@/lib/identity/publish-tokens";
import { routeLog } from "@/lib/logging/server-log";
import { rt } from "@/lib/i18n/request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * クラウド環境が、ログインの待ち受けを開く口。
 *
 * まだ誰でもない（ログイン前）ので、合言葉のハッシュと合図だけを受け取る。
 * 名乗りは置かない。置くのは、人がブラウザで「許可する」を押したときだけ。
 */

export async function POST(request: Request): Promise<Response> {
  return routeLog("/api/cli-login/pending", request, async () => {
    const organization = await currentOrganization();
    let payload: unknown;
    try {
      payload = await request.json();
    } catch {
      return jsonError(rt("auth.api.unreadableBody"), 400);
    }

    const opened = readOpenRequest(payload);
    if (opened === null) return jsonError(rt("auth.api.badPending"), 400);

    try {
      const result = await openPending(organization, {
        state: opened.state,
        pollSecretHash: opened.pollSecretHash,
        label: tidyLabel(computerName(opened.name)),
      });
      if ("error" in result) {
        return jsonError(rt("auth.api.pendingAlive"), 409);
      }
      return jsonResponse({ expiresAt: result.expiresAt }, 201);
    } catch (error) {
      return serverError(error);
    }
  });
}
