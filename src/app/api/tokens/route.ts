import { jsonError, jsonResponse, serverError } from "@/lib/api";
import { currentOrganization } from "@/lib/organization/scope";
import { currentBrowserIdentity, isMember } from "@/lib/identity/identity";
import { issueToken, listTokens, tidyLabel, type TokenSummary } from "@/lib/identity/publish-tokens";
import { routeLog } from "@/lib/logging/server-log";
import { rt } from "@/lib/i18n/request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 投稿の鍵の発行と一覧。
 *
 * ここを通れるのは Google ログイン済みの会社の人だけ。鍵そのもの（Bearer）では入れない
 * ようにしてある。鍵で鍵を増やせると、1 本漏れた時点で歯止めが利かなくなる。
 *
 * 応答に生の値が乗るのは発行の 1 回だけ。**その後は二度と表示できない**
 * （こちらにはハッシュしか残らないため）。画面はその 1 回で本人に写してもらう。
 * 型（token_hash）はどの応答にも出さない。
 */

/** 自分の鍵の一覧。 */
export async function GET(request: Request): Promise<Response> {
  return routeLog("/api/tokens", request, async () => {
    const organization = await currentOrganization();
    const viewer = await currentBrowserIdentity();
    if (!isMember(viewer)) return jsonError(rt("auth.api.loginRequired"), 401);

    try {
      const tokens: TokenSummary[] = await listTokens(organization, viewer.email);
      return jsonResponse({ tokens }, 200);
    } catch (error) {
      return serverError(error);
    }
  });
}

/** 鍵を 1 本発行する。生の値を返すのはこの応答だけ。 */
export async function POST(request: Request): Promise<Response> {
  return routeLog("/api/tokens", request, async () => {
    const organization = await currentOrganization();
    const viewer = await currentBrowserIdentity();
    if (!isMember(viewer)) return jsonError(rt("auth.api.loginRequired"), 401);

    // 覚え書きは無くてもよい（付ける気が無い人に入力を強いない）
    let payload: unknown = null;
    try {
      payload = await request.json();
    } catch {
      payload = null;
    }

    const record: Record<string, unknown> =
      typeof payload === "object" && payload !== null && !Array.isArray(payload)
        ? { ...payload }
        : {};

    try {
      const issued = await issueToken(organization, 
        { email: viewer.email, name: viewer.name },
        tidyLabel(record["label"]),
      );
      return jsonResponse({ token: issued.token, summary: issued.summary }, 201);
    } catch (error) {
      return serverError(error);
    }
  });
}
