import { jsonError, serverError } from "@/lib/api";
import { canUsePageTools } from "@/lib/access/access";
import { currentIdentity } from "@/lib/identity/identity";
import { readAvatar } from "@/lib/identity/avatars";
import { routeLog } from "@/lib/logging/server-log";
import { rt } from "@/lib/i18n/request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 預かった顔写真を 1 枚返す（預かり方は `src/lib/identity/avatars.ts`）。
 *
 * 顔が出るのはコメントと自分の入口だけなので、見てよい人も道具箱と同じ
 * `canUsePageTools`（会社の人）。社外の人には出さない。
 * 控えは本人のブラウザにだけ 1 時間（写真を変えた人は、次のログインから 1 時間以内に入れ替わる）。
 * 無いときは 404 を返し、画面はいつもの頭文字に落ちる。
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return routeLog("/api/avatars/[id]", request, async () => {
    const viewer = await currentIdentity();
    if (!canUsePageTools(viewer)) return jsonError(rt("auth.api.loginRequired"), 401);
    try {
      const avatar = await readAvatar((await params).id);
      if (avatar === null) return jsonError(rt("auth.api.noPhoto"), 404);
      const headers = {
        "Cache-Control": "private, max-age=3600",
        ETag: avatar.etag,
        "Content-Security-Policy": "default-src 'none'; sandbox",
        "X-Content-Type-Options": "nosniff",
      };
      if (request.headers.get("if-none-match") === avatar.etag) return new Response(null, { status: 304, headers });
      return new Response(avatar.bytes, { headers: { ...headers, "Content-Type": "image/webp" } });
    } catch (error) {
      return serverError(error);
    }
  });
}
