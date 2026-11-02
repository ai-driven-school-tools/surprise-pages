import { jsonError, jsonResponse, serverError } from "@/lib/api";
import { currentOrganization } from "@/lib/organization/scope";
import { rt } from "@/lib/i18n/request";
import { canUsePageTools, gateError, openToolsPage as openPage } from "@/lib/access/access";
import { currentIdentity } from "@/lib/identity/identity";
import { parsePageSlug } from "@/lib/comments/comments";
import { redlineDiff } from "@/lib/html/diff";
import { historyAvailable, isVersionSha, listVersions, readFileAt } from "@/lib/revisions/revisions";
import type { HistoryResponse, RedlineResponse } from "@/lib/comments/types";
import { routeLog } from "@/lib/logging/server-log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * ページの版の一覧と、2 版の差分。
 *
 * 読んでよい人の線引きはページ本体とまったく同じ（openPage を通す）。
 * 履歴には過去の本文がそのまま出るので、ここだけ緩いと、制限つきのページの
 * 中身が「差分」という形で丸ごと読めてしまう。書いた人は表示名しか返さない。
 *
 * 加えて、公開ページを開いた社外の人には返さない（`canUsePageTools`）。あれは記事で、
 * 「いつ誰がどこを直したか」は社内の話。台帳を引く前に断るので、往復も増えない。
 * 過去の版そのものを `?v=` で開くのは記事を読む行為なので、そちらは今までどおり。
 */
export async function GET(request: Request): Promise<Response> {
  return routeLog("/api/history", request, async () => {
    const organization = await currentOrganization();
    const url = new URL(request.url);
    const page = parsePageSlug(url.searchParams.get("page"));
    if (page === null) return jsonError(rt("toolbox.server.badPage"), 400);

    const viewer = await currentIdentity();
    if (!canUsePageTools(viewer)) return gateError("signin");

    try {
      const gate = await openPage(organization, viewer, page.slug);
      if (!gate.ok) return gateError(gate.reason);

      const from = url.searchParams.get("from");
      const to = url.searchParams.get("to");

      // 2 版を指定されたら差分を返す
      if (from !== null || to !== null) {
        if (!isVersionSha(from) || !isVersionSha(to)) {
          return jsonError(rt("toolbox.server.badVersion"), 400);
        }
        const [beforeHtml, afterHtml] = await Promise.all([
          readFileAt(gate.page, from),
          readFileAt(gate.page, to),
        ]);
        if (beforeHtml === null || afterHtml === null) {
          return jsonError(rt("toolbox.server.versionBodyMissing"), 404);
        }
        const payload: RedlineResponse = { diff: redlineDiff(beforeHtml, afterHtml) };
        return jsonResponse(payload, 200);
      }

      /*
       * `?latest=1` はいま出ている 1 版だけ（現在地の行の「いつ・何版目」に使う）。
       * 版の一覧を開く前に毎回 30 版ぶん運ばないための指定で、門も形も一覧と同じ。
       */
      const history = await listVersions(gate.page, url.searchParams.get("latest") === "1" ? 1 : undefined);
      const payload: HistoryResponse = {
        available: historyAvailable(),
        versions: history.versions,
        more: history.more,
      };
      return jsonResponse(payload, 200);
    } catch (error) {
      return serverError(error);
    }
  });
}
