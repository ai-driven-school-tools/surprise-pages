import { publicationLimit } from "@/lib/settings/site-settings";
import { currentOrganization } from "@/lib/organization/scope";
import { rt } from "@/lib/i18n/request";
import { put } from "@vercel/blob";
import { jsonError, jsonResponse, serverError } from "@/lib/api";
import { assetContentType, assetKey } from "@/lib/pages/assets";
import { expirePageAssets } from "@/lib/pages/cache";
import { isSafeSlug } from "@/lib/pages/content";
import { pageRefOf } from "@/lib/pages/store";
import { deckPublicationTarget } from "@/lib/access/page-edit-access";
import { ownerFromRequest, identityOf, TOKEN_REJECTED } from "@/lib/identity/publish-tokens";
import { routeLog } from "@/lib/logging/server-log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 画像・動画などの素材を受け取って、非公開で保管する。
 *
 * サーバーが中身を受け取って自分で置く。ブラウザから保管庫へ直接上げる作りにしない。
 * 「非公開で保管する」という指定は**上げる側のリクエストが決める**もので、
 * サーバーが渡せる短命の鍵にも署名付き URL にも焼き込めない（署名の対象に入っていない）。
 * 素材は必ず非公開、というこの置き場の約束を守れるのは、サーバーが自分で置く形だけ。
 *
 * 中身はためずに流す。100MB の動画を丸ごとメモリに載せると、
 * 1 本で持ち場所を使い切って、同時に動いている他の処理ごと落ちる。
 */

const MB = 1024 * 1024;

/** 1 ファイルの上限。これより大きいものは書き出し設定を見直してもらう。 */
const MAX_ASSET_BYTES = publicationLimit();

/** これを超えたら分割して上げる（途中で切れたぶんだけやり直せる）。 */
const MULTIPART_OVER_BYTES = 8 * MB;

/** 大きすぎるときの断り。要求の言語で引くので、要求の中で呼ぶ。 */
const tooLarge = () => rt("toolbox.server.upload.tooLarge", { size: MAX_ASSET_BYTES / MB });

type UploadResponse = { path: string; size: number; contentType: string };

/**
 * 実際に流れたバイト数を数えながら通す網。上限を超えたらそこで打ち切る。
 *
 * 送り側の申告（content-length）を上限の判定に使わない。ヘッダを付けない・
 * 小さく偽る、のどちらでも判定が丸ごと飛ぶ。数えるのは自分でやる。
 *
 * 中身はためない。100MB の動画を丸ごとメモリに載せると、1 本で持ち場所を
 * 使い切って、同時に動いている他の処理ごと落ちる。
 */
type CountedBody = {
  stream: ReadableStream<Uint8Array>;
  /** 通したバイト数。put が終わってから読む */
  received: () => number;
  /** 上限で打ち切ったか */
  cutOff: () => boolean;
};

function countedBody(body: ReadableStream<Uint8Array>, limit: number): CountedBody {
  let received = 0;
  let cutOff = false;

  const counter = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      received += chunk.byteLength;
      if (received > limit) {
        cutOff = true;
        controller.error(new Error(tooLarge()));
        return;
      }
      controller.enqueue(chunk);
    },
  });

  return { stream: body.pipeThrough(counter), received: () => received, cutOff: () => cutOff };
}

export async function POST(request: Request): Promise<Response> {
  return routeLog("/api/pages/upload", request, async () => {
    const organization = await currentOrganization();
    try {
      const owner = await ownerFromRequest(organization, request);
      if (owner === null) return jsonError(TOKEN_REJECTED, 401);

      const params = new URL(request.url).searchParams;

      // slug は `<見せ方>/<場所>`。コメントやページ本体と同じ形で受ける
      const page = pageRefOf(params.get("slug"));
      if (page === null) return jsonError(rt("toolbox.server.badPage"), 400);
      const target=await deckPublicationTarget(organization, identityOf(owner),page.pageSlug);
      if(!target.ok)return target.response;
      if(target.deck)return jsonError(rt("toolbox.server.upload.deckAsset"),409);

      const relValue = params.get("path");
      if (relValue === null || relValue.length === 0) {
        return jsonError(rt("toolbox.server.upload.noPath"), 400);
      }
      const rel = relValue.split("/");
      if (!isSafeSlug(rel)) {
        return jsonError(
          rt("toolbox.server.upload.badName"),
          400,
        );
      }

      const contentType = assetContentType(rel[rel.length - 1]);
      if (contentType === null) {
        return jsonError(rt("toolbox.server.upload.badType"), 400);
      }

      /**
       * 申告（content-length）は「無駄な通信をしないうちに断る」ためだけに見る。
       * 大きすぎるかどうかの最後の判定は、下で実際に数えたバイト数でやる。
       */
      const declared = Number(request.headers.get("content-length") ?? "");
      const hinted = Number.isFinite(declared) && declared > 0 ? declared : null;
      if (hinted !== null && hinted > MAX_ASSET_BYTES) return jsonError(tooLarge(), 400);

      const body = request.body;
      if (body === null) return jsonError(rt("toolbox.server.upload.noBody"), 400);

      // 組織の素材の容量の上限。申告があればその大きさで、無ければ「もう満ちていないか」だけを見る

      const counted = countedBody(body, MAX_ASSET_BYTES);

      try {
        await put(assetKey(organization, page.slugPrefix, [...page.slug, ...rel]), counted.stream, {
          // 保管は常に非公開。ここを緩めると、社内ページの画像が門を通らずに読める
          access: "private",
          allowOverwrite: true,
          addRandomSuffix: false,
          multipart: hinted !== null && hinted > MULTIPART_OVER_BYTES,
          contentType,
        });
        // 上げ直した素材の目印の控えを落とす（配信が古い目印で写しを引き続けない）
        await expirePageAssets(organization, page.pageSlug);
        // 受け取ったぶんを組織の容量に足す（同じ名前への上書きで増えすぎたぶんは夜間の数え直しが直す）
      } catch (error) {
        /**
         * 途中で打ち切ったので、保管庫の側が書きかけのままになることがある
         * （分割で上げたぶん、または前の版の中身がそのまま残る）。
         * こちらから消しに行かないのは、消す指示そのものが「まだ書いている最中の
         * ものを消す」形になって、正しく上がっていた前の版まで落としうるため。
         * 上げ直しは同じ名前への上書きなので、それで揃う。
         */
        if (counted.cutOff()) {
          return jsonError(
            rt("toolbox.server.upload.cutOff", { size: MAX_ASSET_BYTES / MB }),
            400,
          );
        }
        throw error;
      }

      const payload: UploadResponse = {
        path: rel.join("/"),
        // 申告ではなく、実際に通ったバイト数を返す
        size: counted.received(),
        contentType,
      };
      return jsonResponse(payload, 201);
    } catch (error) {
      return serverError(error);
    }
  });
}
