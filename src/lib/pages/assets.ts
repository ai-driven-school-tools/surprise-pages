import { get, head, list, BlobNotFoundError, type ListBlobResult } from "@vercel/blob";
import path from "node:path";
import type { SlugVisibility } from "../comments/types";
import { isSafeSlug } from "./content";
import { isDeckMediaAssetPath } from "../deck/edit/assets";
import { DECK_LOGO_ASSET_PREFIX } from "../deck/media/logo";
import type { OrganizationScope } from "../organization/scope";

/**
 * 画像・動画・PDF などの重いものは git ではなくストレージ（Vercel Blob）に置く。
 * 保管は常に非公開で、社内ページの素材もページと同じ門をくぐらせる。
 */

/** 配信を許す素材の種類。ここに無い拡張子は 404（許可リスト方式）。 */
const CONTENT_TYPES: Readonly<Record<string, string>> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mov": "video/quicktime",
  ".mp3": "audio/mpeg",
  ".m4a": "audio/mp4",
  ".wav": "audio/wav",
  ".vtt": "text/vtt; charset=utf-8",
  ".pdf": "application/pdf",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".csv": "text/csv; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
};

/** 拡張子から種類を引く。素材として扱えない名前なら null。 */
export function assetContentType(fileName: string): string | null {
  return CONTENT_TYPES[path.extname(fileName).toLowerCase()] ?? null;
}

/** Page names stay strict. Only the existing immutable browser-media namespace
 * is additionally valid for assets, including archived relative paths. */
export function isSafeAssetPath(slug:readonly string[]):boolean {
  if(isSafeSlug(slug))return true;
  if(slug.length<2)return false;
  const parent=slug.slice(0,-2),relative=slug.slice(-2).join("/");
  if(parent.length&&!isSafeSlug(parent))return false;
  return isDeckMediaAssetPath(relative) ||
    (relative.startsWith(DECK_LOGO_ASSET_PREFIX) && /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}\.[a-z0-9]+$/.test(relative.slice(DECK_LOGO_ASSET_PREFIX.length)));
}

/**
 * ストレージ内での置き場所。URL の並びとそろえてある。
 *
 * 受け取るのは**呼び名の頭に付く文字（2 通り）**で、ページの見せ方（3 通り）ではない。
 * 制限つきのページの素材は `internal/...` に置く。ここを 3 通りにすると、
 * 制限を付けた瞬間に置き場所が `restricted/...` へ動き、既にある画像が全部割れる。
 */
export function assetKey(organization: OrganizationScope, visibility: SlugVisibility, slug: readonly string[]): string {
  return `${shelfOf(organization)}${visibility}/${slug.join("/")}`;
}

/** 組織の置き場の頭の形（最初の組織は空・新しい組織は `o/<組織の目印>/`。organizations.asset_prefix の check と同じ形）。 */
const ORGANIZATION_SHELF = /^(?:|o\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/)$/;

/**
 * 素材の鍵の頭に付ける、組織の置き場の頭（決定 10）。**素材の鍵はどれもここを通る**。
 * 最初の組織 は空なので、既存の素材・凍結した過去の版の素材の鍵は 1 文字も変わらない。
 * 形の違う頭は使わない（台帳が壊れていても、別の組織の置き場や外の置き場を指さない）。
 */
export function shelfOf(organization: OrganizationScope): string {
  if (!ORGANIZATION_SHELF.test(organization.assetPrefix) || (organization.assetPrefix !== "" && organization.assetPrefix !== `o/${organization.id}/`)) {
    // 内部専用の失敗（画面には固定の 500 の断りしか出ない）
    throw new Error("organization asset prefix is malformed");
  }
  return organization.assetPrefix;
}

/**
 * 組織のロゴ（1 組織 1 枚）の素材の鍵。組織の置き場の頭の下の `_organization/` に置く（ページの置き場
 * `internal/`・`public/` と混ざらない）。名前に中身の指紋を入れるので、入れ替えると鍵が変わる。
 * 形は organizations.logo_key の check と同じ（拡張子は SVG を除く画像だけ。SVG は同じ宛先で開くと仕掛けを持てるため）。
 */
export const ORGANIZATION_LOGO_TYPES: Readonly<Record<string, string>> = {
  png: "image/png",
  jpg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  avif: "image/avif",
};
export function organizationLogoKey(organization: OrganizationScope, fingerprint: string, extension: string): string {
  if (!/^[0-9a-f]{16}$/.test(fingerprint) || !Object.hasOwn(ORGANIZATION_LOGO_TYPES, extension)) throw new Error("organization logo key is malformed"); // i18n-keep: 内部専用の失敗（画面には決まった 1 文しか出ない）
  return `${shelfOf(organization)}_organization/logo-${fingerprint}.${extension}`;
}
/** 鍵がその組織のロゴの置き場を指しているか（台帳の値をそのまま信じない）。 */
export function isOrganizationLogoKey(organization: OrganizationScope, key: string): boolean {
  const shelf = shelfOf(organization);
  return key.startsWith(shelf) && /^_organization\/logo-[0-9a-f]{16}\.(png|jpg|webp|gif|avif)$/.test(key.slice(shelf.length));
}

/**
 * 過去の版の素材の置き場所。
 *
 * 投稿で素材を上書きする前に、古いほうをここへ写しておく。
 * こうしないと、去年のレポートを開いたときに今年の図が出る、という食い違いが起きる。
 */
export const ARCHIVE_MARK = "@archive";

export function archivedAssetKey(
  organization: OrganizationScope,
  visibility: SlugVisibility,
  pageSlug: readonly string[],
  sha: string,
  rel: readonly string[],
): string {
  return `${shelfOf(organization)}${visibility}/${pageSlug.join("/")}/${ARCHIVE_MARK}/${sha}/${rel.join("/")}`;
}

/** そのページの素材が並ぶ場所。前方一致で使うので末尾の / まで含める。 */
export function assetPrefix(organization: OrganizationScope, visibility: SlugVisibility, pageSlug: readonly string[]): string {
  return `${assetKey(organization, visibility, pageSlug)}/`;
}

/** 過去の版の写しが並ぶ場所。片付けるときは必ずここを除ける。 */
export function archivePrefix(organization: OrganizationScope, visibility: SlugVisibility, pageSlug: readonly string[]): string {
  return `${assetPrefix(organization, visibility, pageSlug)}${ARCHIVE_MARK}/`;
}

/**
 * 別のページの枝に入っている素材を除ける網。
 *
 * 素材の置き場所は URL と同じ並び（`<見せ方>/<呼び名>/<相対パス>`）なので、
 * ページの呼び名が入れ子になっていると、浅い側の前方一致が深い側の素材まで拾う。
 * 例: `internal/reports` を投稿すると、`internal/reports/2026-…` の画像まで数に入る。
 *
 * 片付け（削除）も凍結（写し）も同じ数え上げに乗っているので、手を出す前にここを通す。
 * 入れ子の名前そのものは投稿の入口で断っているが、それより前に置かれた素材は
 * 守れない。壊す側にも歯止めを置く（破壊的な操作なので二重にする）。
 *
 * 渡すのは `<見せ方>/<呼び名>` の形の呼び名。**消された印が立っているページも含める**
 * （素材はまだ残っているので、除けないと復活の道を壊す）。
 */
export function outsideNestedBranches(
  organization: OrganizationScope,
  nestedPageSlugs: readonly string[],
): (pathname: string) => boolean {
  // 数え上げた素材の名前は組織の置き場の頭から始まるので、枝も同じ頭から数える
  const branches = nestedPageSlugs.map((pageSlug) => `${shelfOf(organization)}${pageSlug}/`);
  if (branches.length === 0) return () => true;
  return (pathname) => !branches.some((branch) => pathname.startsWith(branch));
}

export type StoredAsset = { pathname: string; size: number };

/**
 * その場所にある素材を全部数え上げる。
 *
 * 1 度の問い合わせで返るのは 1000 件までなので、続きがある限り追う。
 * 途中で打ち切ると、写し忘れ（過去の版の画像が割れる）と
 * 消し忘れ（使っていない素材が残り続ける）が黙って起きる。
 */
export async function listAssetsUnder(prefix: string): Promise<StoredAsset[]> {
  const found: StoredAsset[] = [];
  let cursor: string | undefined = undefined;

  for (;;) {
    const page: ListBlobResult = await list({ prefix, cursor, mode: "expanded" });
    for (const blob of page.blobs) found.push({ pathname: blob.pathname, size: blob.size });
    if (!page.hasMore || page.cursor === undefined) return found;
    cursor = page.cursor;
  }
}

export type AssetRange = { start: number; end: number };
export type AssetHit = {
  contentType: string;
  size: number;
  etag: string;
  uploadedAt: Date;
  /** 保管庫での置き場所。保管庫から来た実物にだけ付く（変換した写しには無い）。 */
  key?: string;
  open: (range: AssetRange | null, signal: AbortSignal) => Promise<ReadableStream<Uint8Array>>;
};

/** 保管庫の目印（HEAD で分かる 4 つ）。配信の控えが覚えて、次は問い合わせずに開く。 */
export type AssetMetadata = {
  contentType: string;
  size: number;
  etag: string;
  uploadedAt: Date;
};

function strongAssetEtag(value: string): string {
  const etag = value.startsWith('"') ? value : `"${value}"`;
  if (!/^"[\x21\x23-\x7e]+"$/.test(etag)) throw new Error("素材の目印を確認できませんでした"); // i18n-keep: 内部の失敗（配信は決まった文の応答を返す）
  return etag;
}

/**
 * 目印から素材を開ける形にする。
 *
 * 保管庫に問い合わせた直後（`fetchAsset`）も、配信の控えが覚えていた目印から開き直すとき
 * （`src/lib/page-images/transform.ts`）も、開き方はこの 1 つ。開くときは `If-Match` で目印を添えるので、
 * 覚えていた目印が古ければ読めずに失敗し、古い中身が新しい名前で出ることはない。
 */
export function assetHitOf(key: string, metadata: AssetMetadata): AssetHit {
  const etag = strongAssetEtag(metadata.etag);
  return {
    contentType: metadata.contentType,
    size: metadata.size,
    etag,
    uploadedAt: metadata.uploadedAt,
    key,
    async open(range, signal) {
      const headers: Record<string, string> = { "If-Match": etag, "Accept-Encoding": "identity" };
      if (range) headers.Range = `bytes=${range.start}-${range.end}`;
      // get() supports custom Range headers, but SDK 2.7 reports statusCode 200
      // even for an upstream 206. Verify Content-Range rather than that union.
      // Bypass the private CDN so HEAD metadata and the returned bytes agree.
      const result = await get(key, { access: "private", useCache: false, headers, abortSignal: signal });
      if (!result || result.statusCode !== 200) throw new Error("素材の内容を取得できませんでした"); // i18n-keep: 内部の失敗（配信は決まった文の応答を返す）
      const expectedLength = range ? range.end - range.start + 1 : metadata.size;
      const contentRange = result.headers.get("content-range");
      const contentLength = result.headers.get("content-length");
      const returnedEtag = result.headers.get("etag") ?? result.blob.etag;
      const encoding = result.headers.get("content-encoding");
      const valid = returnedEtag === etag &&
        (encoding === null || encoding === "identity") &&
        (range ? contentRange === `bytes ${range.start}-${range.end}/${metadata.size}` : contentRange === null) &&
        (contentLength === null || Number(contentLength) === expectedLength);
      if (!valid) {
        await result.stream.cancel();
        throw new Error("素材が更新されました。読み直してください"); // i18n-keep: 内部の失敗（配信は決まった文の応答を返す）
      }
      return result.stream;
    },
  };
}

async function fetchAsset(key: string, fallbackType: string, signal?: AbortSignal): Promise<AssetHit | null> {
  try {
    // Metadata is read without opening the file. HEAD and invalid ranges never
    // start a 100 MB download, and archived fallback is resolved before streaming.
    const metadata = await head(key, { abortSignal: signal });
    if (!Number.isSafeInteger(metadata.size) || metadata.size < 0) throw new Error("素材の大きさを確認できませんでした"); // i18n-keep: 内部の失敗（配信は決まった文の応答を返す）
    return assetHitOf(key, {
      contentType: metadata.contentType || fallbackType,
      size: metadata.size,
      etag: metadata.etag,
      uploadedAt: metadata.uploadedAt,
    });
  } catch (error) {
    if (error instanceof BlobNotFoundError) return null;
    // A failed read is not evidence that an archived copy is absent. Do not
    // silently replace a temporarily unavailable past asset with today's file.
    throw error;
  }
}

/** 組織のロゴを取り出す。鍵がその組織のロゴの置き場でなければ null。 */
export async function readOrganizationLogoAsset(organization: OrganizationScope, key: string, signal?: AbortSignal): Promise<AssetHit | null> {
  if (!isOrganizationLogoKey(organization, key)) return null;
  const extension = key.slice(key.lastIndexOf(".") + 1);
  return fetchAsset(key, ORGANIZATION_LOGO_TYPES[extension] ?? "application/octet-stream", signal);
}

/** ストレージから素材を取り出す。無い / 取り出せないときは null。 */
export async function readAsset(
  organization: OrganizationScope,
  visibility: SlugVisibility,
  slug: readonly string[],
  signal?: AbortSignal,
): Promise<AssetHit | null> {
  if (!isSafeAssetPath(slug)) return null;

  const fallbackType = assetContentType(slug[slug.length - 1]);
  if (fallbackType === null) return null;

  return fetchAsset(assetKey(organization, visibility, slug), fallbackType, signal);
}

/** 凍結の置き場に使ってきた短い目印の桁数。投稿ツールがこの桁で写しを作っている。 */
const SHORT_SHA_LENGTH = 7;

/**
 * 当時の素材を取り出す。上から順に 3 段で探す。
 *
 *   1. 渡された目印そのままの写し
 *      … いちばん確かな一致。URL に貼られた目印がそのまま置き場になっている場合
 *   2. 目印の先頭 7 桁の写し
 *      … これまでの投稿ツールは 7 桁で凍結してきた。40 桁で来た指定を
 *        ここで受け直さないと、既にある写しが 1 つも見つからない
 *   3. いまの素材
 *      … 凍結を始める前に投稿されたページには写しが無い。
 *        欠けた画像を出すより、今のものを見せるほうが読み手の役に立つ
 */
export async function readArchivedAsset(
  organization: OrganizationScope,
  visibility: SlugVisibility,
  pageSlug: readonly string[],
  sha: string,
  rel: readonly string[],
  signal?: AbortSignal,
  allowLiveFallback = true,
): Promise<AssetHit | null> {
  if (!isSafeSlug(pageSlug) || !isSafeAssetPath(rel)) return null;

  const fallbackType = assetContentType(rel[rel.length - 1]);
  if (fallbackType === null) return null;

  const exact = await fetchAsset(archivedAssetKey(organization, visibility, pageSlug, sha, rel), fallbackType, signal);
  if (exact !== null) return exact;

  const short = sha.slice(0, SHORT_SHA_LENGTH);
  if (short !== sha) {
    const shortened = await fetchAsset(
      archivedAssetKey(organization, visibility, pageSlug, short, rel),
      fallbackType,
      signal,
    );
    if (shortened !== null) return shortened;
  }

  if (!allowLiveFallback) return null;
  return fetchAsset(assetKey(organization, visibility, [...pageSlug, ...rel]), fallbackType, signal);
}
