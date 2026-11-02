import { jsonError, jsonResponse, serverError } from "@/lib/api";
import { currentOrganization } from "@/lib/organization/scope";
import { rt } from "@/lib/i18n/request";
import { gateError, openPage } from "@/lib/access/access";
import { pageRefOf, readHeadOf } from "@/lib/pages/store";
import { identityOf, ownerFromRequest, TOKEN_REJECTED } from "@/lib/identity/publish-tokens";
import { isVersionSha, readFileAt } from "@/lib/revisions/revisions";
import { routeLog } from "@/lib/logging/server-log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * いま出ている本文を、手元の道具へ返す（取り寄せ）。
 *
 * これが無かったころ、ページを直す作業は毎回「白紙から書き直す」になっていた。
 * 投稿が終わると手元の作業ファイルはゴミ箱へ入れる決まりで、正本は保管庫にあるのに、
 * そこから取り出す道が 1 本も無かったため。書き直すと前の版に書いてあったことが
 * 静かに落ちる——直したいのは 1 行なのに、他の 200 行が別物になる。
 *
 * 名乗り方は投稿の鍵だけ（投稿と同じ）。ブラウザのログインでは通さない。
 * ただし**鍵を持っていることを「見てよい」に読み替えない**。可否は画面・素材・
 * コメント・履歴とまったく同じ門（`openPage`）が決める。名簿で絞ったページは、
 * 名簿の外の人には返さない——ここだけ緩いと、制限つきの本文が丸ごと手元に落ちる。
 *
 * 返すのは HTML だけで、画像や動画は付けない。素材の正本は保管庫にあり、
 * 相対パスは配信のときに差し込む `<base>` が支えている（AGENTS.md）。
 * 取り寄せた HTML をそのまま投稿し直せば、素材はいま置いてあるものが続けて出る。
 */

type SourceResponse = {
  html: string;
  versionId: string;
  shortVersionId: string;
  /** 何番目の版か。取り寄せたものが最新かを人が確かめるのに使う */
  versionNumber: number | null;
  title: string;
  /** 台帳の見せ方（3 通り）。呼び名の頭の文字ではない */
  visibility: string;
};

export async function GET(request: Request): Promise<Response> {
  return routeLog("/api/pages/source", request, async () => {
    const organization = await currentOrganization();
    try {
      const owner = await ownerFromRequest(organization, request);
      if (owner === null) return jsonError(TOKEN_REJECTED, 401);

      const url = new URL(request.url);
      const ref = pageRefOf(url.searchParams.get("slug"));
      if (ref === null) return jsonError(rt("toolbox.server.badPage"), 400);

      const wanted = url.searchParams.get("v");
      if (wanted !== null && !isVersionSha(wanted)) {
        return jsonError(rt("toolbox.server.badVersion"), 400);
      }

      const gate = await openPage(organization, identityOf(owner), ref.pageSlug);
      if (!gate.ok) return gateError(gate.reason);

      const snapshot = await readHeadOf(gate.page);
      const html =
        wanted === null ? snapshot?.html ?? null : await readFileAt(gate.page, wanted);
      if (html === null) return jsonError(rt("toolbox.server.pageBodyMissing"), 404);

      /*
       * 版の目印と番号は、取り寄せたものが「いつの版か」を人に見せるためだけに使う。
       * 版を指定して取り寄せたときは、その版の番号を出さないと（最新の番号を出すと）
       * 古い本文を最新だと思って直してしまう。指定があったときは番号を伏せる。
       */
      const latest = snapshot?.revision ?? null;
      const versionId = wanted === null ? (latest?.versionId ?? "") : wanted.toLowerCase();

      const payload: SourceResponse = {
        html,
        versionId,
        shortVersionId: versionId.slice(0, 7),
        versionNumber: wanted === null ? (latest?.versionNumber ?? null) : null,
        title: gate.page.title,
        visibility: gate.page.visibility,
      };
      return jsonResponse(payload, 200);
    } catch (error) {
      return serverError(error);
    }
  });
}
