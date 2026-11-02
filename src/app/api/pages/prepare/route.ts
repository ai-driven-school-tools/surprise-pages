import { copy } from "@vercel/blob";
import { currentOrganization } from "@/lib/organization/scope";
import { rt } from "@/lib/i18n/request";
import { jsonError, jsonResponse, serverError } from "@/lib/api";
import {
  archivedAssetKey,
  archivePrefix,
  assetPrefix,
  listAssetsUnder,
  outsideNestedBranches,
} from "@/lib/pages/assets";
import { findPageIncludingDeleted, nestedPageSlugs, pageRefFrom } from "@/lib/pages/store";
import { ownerFromRequest, identityOf, TOKEN_REJECTED } from "@/lib/identity/publish-tokens";
import { loadEditablePage } from "@/lib/access/page-edit-access";
import { routeLog } from "@/lib/logging/server-log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 投稿の前に、いま置いてある素材を「いまの版のフォルダ」へ写す（凍結）。
 *
 * 上書きしてから写しても手遅れなので、必ず投稿の前に通す。写さないままだと、
 * 去年のレポートを開いたときに今年の図が出て、文章と図で話が食い違う。
 *
 * 何度打っても同じ結果になる（すでに写しがあるものは飛ばす）。
 * 投稿をやり直したときに、写しが二重になったり書き換わったりしない。
 *
 * 写し先のフォルダ名は**目印のフル 40 桁**にそろえる。手元の道具は先頭 7 桁で
 * 作っていたが、桁数が 2 通りあると読む側が両方を試すことになる。
 * 昔の 7 桁の写しは、読み側の面倒見（後の段）で拾う。
 */

type PrepareResponse = { frozen: number; versionId: string | null };

export async function POST(request: Request): Promise<Response> {
  return routeLog("/api/pages/prepare", request, async () => {
    const organization = await currentOrganization();
    try {
      const owner = await ownerFromRequest(organization, request);
      if (owner === null) return jsonError(TOKEN_REJECTED, 401);

      let payload: unknown;
      try {
        payload = await request.json();
      } catch {
        return jsonError(rt("toolbox.server.unreadableBody"), 400);
      }

      const record: Record<string, unknown> =
        typeof payload === "object" && payload !== null && !Array.isArray(payload)
          ? { ...payload }
          : {};

      const page = pageRefFrom(record["visibility"], record["slug"]);
      if (page === null) return jsonError(rt("toolbox.server.badPage"), 400);

      // 消した印が立っているページも凍結する。同じ場所へ投稿し直すと復活するので、
      // そのとき上書きされる素材は「前の版のもの」として写しておかないと割れる
      const stored = await findPageIncludingDeleted(organization, page.pageSlug);
      if (stored?.recordingProtected) {
        const gate = await loadEditablePage(organization, identityOf(owner), page.pageSlug);
        if (!gate.ok) return gate.response;
      }
      const versionId = stored?.currentVersionId ?? null;

      // 1 度目の投稿は、写す相手（前の版）がまだ無い
      if (versionId === null) {
        const nothing: PrepareResponse = { frozen: 0, versionId: null };
        return jsonResponse(nothing, 200);
      }

      const prefix = assetPrefix(organization, page.slugPrefix, page.slug);
      const frozenRoot = archivePrefix(organization, page.slugPrefix, page.slug);

      // 名前が入れ子になっているページの素材を、自分の過去の版のフォルダへ写し込まない。
      // 入れ子の名前は投稿の入口で断っているが、それより前に置かれた素材は守れない
      const outside = outsideNestedBranches(organization, await nestedPageSlugs(organization, page.pageSlug));

      // いま使っている素材だけを写す（写しの写しを作らない）
      const live = (await listAssetsUnder(prefix)).filter(
        (asset) => !asset.pathname.startsWith(frozenRoot) && outside(asset.pathname),
      );

      const already = new Set(
        (await listAssetsUnder(`${frozenRoot}${versionId}/`)).map((asset) => asset.pathname),
      );

      let frozen = 0;
      for (const asset of live) {
        const rel = asset.pathname.slice(prefix.length).split("/");
        const target = archivedAssetKey(organization, page.slugPrefix, page.slug, versionId, rel);
        if (already.has(target)) continue;

        // 保管は常に非公開。写しだけ素で読めると、社内ページの画像が裏口から見られる
        await copy(asset.pathname, target, { access: "private", addRandomSuffix: false });
        frozen += 1;
      }

      const done: PrepareResponse = { frozen, versionId };
      return jsonResponse(done, 200);
    } catch (error) {
      return serverError(error);
    }
  });
}
