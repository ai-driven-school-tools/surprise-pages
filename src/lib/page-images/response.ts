import { assetResponse } from "../pages/cache";
import { forgetImageSource, imagePlaceOf, imageVariantOf, peekPageImage, rememberImageSource, transformPageImage, type ImagePeek } from "./transform";
import type { OrganizationScope } from "../organization/scope";
import { rt } from "../i18n/request";
import type { AssetHit } from "../pages/assets";

export type ImageSource = {
  /** 門より先に始めた控えの下見（`peekPageImage`）。無ければ門のあとに控えを引く */
  peek?: Promise<ImagePeek | null> | null;
  /** 保管庫に問い合わせる（HEAD）。控えに目印が無いとき・古かったときだけ呼ばれる */
  load: () => Promise<AssetHit | null>;
  /** 目印の控えに付ける札（ページの目印と呼び名の札）。投稿・上げ直しで落ちる */
  tags: readonly string[];
};

/**
 * 素材の応答。**呼び出し側が門を通してから呼ぶ**（控えに当たるときも、下見を渡すときも）。組織は門を通したページの組織。
 *
 * 幅の指定が無い要求は今までどおり保管庫に問い合わせて流す。幅の指定がある要求は、
 * 下見（控えの写し）→ 控えていた目印から変換 → 保管庫に問い合わせて変換、の順で軽い道から試す。
 * 見つからなければ null（呼び出し側が 404 を返す）。
 */
export async function imageAssetResponse(organization: OrganizationScope, request: Request, source: ImageSource, input: { cacheControl: string; pageId: string | null }): Promise<Response | null> {
  const variant = imageVariantOf(request);
  if (variant === null) {
    const asset = await source.load();
    return asset === null ? null : assetResponse(request, asset, input);
  }
  if (variant === "invalid") return new Response(rt("errors.delivery.imageSizeInvalid"), { status: 400, headers: { "cache-control": "private, no-store" } });
  const peeked = await (source.peek ?? peekPageImage(organization, request));
  if (peeked?.variant) return assetResponse(request, peeked.variant, input);
  // 控えは組織ごと（同じ道筋でも別の組織の控えに当たらない）
  const pathname = imagePlaceOf(organization, request);
  const fresh = async (): Promise<AssetHit | null> => {
    const asset = await source.load();
    if (asset !== null) rememberImageSource(pathname, asset, source.tags);
    return asset;
  };
  let asset = peeked?.source ?? null;
  let remembered = asset !== null;
  if (asset === null) asset = await fresh();
  if (asset === null) return null;
  let result = await transformPageImage(organization, request, asset);
  if (result === "stale") {
    // 控えていた目印が古かった（上書きされていた）。捨てて 1 度だけ問い合わせ直す
    await forgetImageSource(pathname);
    if (remembered) {
      remembered = false;
      asset = await fresh();
      if (asset === null) return null;
      result = await transformPageImage(organization, request, asset);
    }
    if (result === "stale") return assetResponse(request, asset, input);
  }
  return result instanceof Response ? result : assetResponse(request, result, input);
}
