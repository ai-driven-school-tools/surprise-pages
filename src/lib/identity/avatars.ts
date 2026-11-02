import { BlobNotFoundError, get, put } from "@vercel/blob";
import { avatarIdOf, isAvatarId } from "./avatar-id";

/**
 * 会社の人の顔写真を、こちらの保管庫（非公開）に預かって配る。ここが正本。
 *
 * **なぜ Google の在りかを使い回さないか。** ログインのときに Google から渡る写真の
 * 在りか（lh3.googleusercontent.com の URL）は数週間で使えなくなる。使えなくなった
 * 在りかは失敗を返さず、**200 で青い人型の絵**を返す（2026-09-29 実測・etag "v5"）。
 * 画面は「読めなかったら頭文字に落とす」を持っているのに、失敗しないので落ちない。
 * セッションは 90 日持つので、ログインし直すまで人型のまま残り、コメントの書き手の
 * 顔も（書いた時点の在りかを行に残しているので）古いものから順に人型になっていた。
 *
 * だから写真は**在りかがまだ新しいうちに 1 度だけ取りに行き、縮めて預かる**。
 * 縮めるのは預かるときの 1 回だけ（Vercel Blob そのものに縮める機能は無く、
 * Vercel の画像最適化は非公開の素材を読めない。社内の顔写真を共有の控えにも載せない）。
 * 画面は 24px の丸で出すので、高密度の画面の 4 倍まで見ても足りる 96px の正方形にする。
 *
 * 在りかは `/api/avatars/<目印>` の 1 通り（目印は `src/lib/identity/avatar-id.ts`）。
 * 預かっていない人の目印を引くと 404 になり、画面はいつもの頭文字に落ちる。
 * 縮める道具（sharp）は預かるときだけ読み込む（ログインの部品を読む先々へ持ち込まない）。
 */

/** 預かる大きさ（正方形の 1 辺）。画面の丸は 24px。 */
const AVATAR_SIZE = 96;
/** Google へ頼む大きさ。縮める前の元なので預かる大きさの 2 倍を取る。 */
const SOURCE_SIZE = AVATAR_SIZE * 2;
/** 取りに行く元の上限。顔写真としては十分に大きい。 */
const SOURCE_MAX_BYTES = 2 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 5_000;
const PREFIX = "_avatars/";

/**
 * Google の写真の在りかか。取りに行く先はここに限る（渡された任意の URL を取りに行く口にしない）。
 */
function googlePhotoUrl(value: string): URL | null {
  let url: URL;
  try { url = new URL(value); } catch { return null; }
  if (url.protocol !== "https:" || url.hostname !== "lh3.googleusercontent.com") return null;
  // 末尾の大きさの指定（=s96-c など）を、欲しい大きさに付け替える
  url.pathname = url.pathname.replace(/=[^/]*$/, "") + `=s${SOURCE_SIZE}-c`;
  return url;
}

/**
 * 使えなくなった在りかが返す人型の絵か。
 *
 * Google は失敗を返さないので、形で見分ける。人型の絵は単色の PNG で 1KB 前後
 * （192px で 973 バイト）。本物の写真は JPEG か WebP で数 KB ある。
 * 迷う形は「預からない」側に倒す（人型を預かると次のログインまで残る）。
 */
function isGooglePlaceholder(response: Response, bytes: Buffer): boolean {
  const type = response.headers.get("content-type") ?? "";
  return type.startsWith("image/png") && bytes.length < 4096;
}

async function downloadPhoto(source: string): Promise<Buffer | null> {
  const url = googlePhotoUrl(source);
  if (url === null) return null;
  const response = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!response.ok) return null;
  const declared = Number(response.headers.get("content-length") ?? "0");
  if (declared > SOURCE_MAX_BYTES) return null;
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length === 0 || bytes.length > SOURCE_MAX_BYTES) return null;
  return isGooglePlaceholder(response, bytes) ? null : bytes;
}

/**
 * Google の写真を取りに行き、縮めて預かる。預けられたら true。
 *
 * 失敗してもログインは止めない（写真が無ければ画面は頭文字を出すだけ）。
 * 同じ目印へ上書きするので、写真を変えた人は次のログインで入れ替わる。
 */
export async function keepAvatar(email: string, source: string): Promise<boolean> {
  try {
    const id = avatarIdOf(email);
    if (id === null) return false;
    const original = await downloadPhoto(source);
    if (original === null) return false;
    const { default: sharp } = await import("sharp");
    const small = await sharp(original, { limitInputPixels: 16_000_000 })
      .rotate()
      .resize({ width: AVATAR_SIZE, height: AVATAR_SIZE, fit: "cover" })
      .webp({ quality: 82 })
      .toBuffer();
    await put(`${PREFIX}${id}.webp`, small, {
      access: "private",
      contentType: "image/webp",
      addRandomSuffix: false,
      allowOverwrite: true,
      cacheControlMaxAge: 60,
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Google に、いまの写真の在りかを聞き直す。
 *
 * 使うのはログインのときに受け取った**更新用の鍵**（refresh token）。これがあれば、
 * ログインし直してもらわなくても新しい在りかをもらえる。鍵は Auth.js の暗号化した手形
 * （HttpOnly の cookie）の中にだけ置き、保管庫には書かない。許されている範囲は
 * ログインと同じ「名前・メール・写真」を読むことだけ。
 * 鍵が取り消されていれば "revoked"（手形から外す）、一時的に聞けなければ null。
 */
async function currentGooglePicture(refreshToken: string): Promise<string | "revoked" | null> {
  const clientId = process.env.AUTH_GOOGLE_ID;
  const clientSecret = process.env.AUTH_GOOGLE_SECRET;
  if (!clientId || !clientSecret) return null;
  const grant = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, grant_type: "refresh_token", refresh_token: refreshToken }),
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  const granted: unknown = await grant.json().catch(() => null);
  const fields: Record<string, unknown> = typeof granted === "object" && granted !== null ? { ...granted } : {};
  if (!grant.ok) return fields.error === "invalid_grant" ? "revoked" : null;
  if (typeof fields.access_token !== "string") return null;
  const info = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: { Authorization: `Bearer ${fields.access_token}` },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!info.ok) return null;
  const body: unknown = await info.json().catch(() => null);
  const claims: Record<string, unknown> = typeof body === "object" && body !== null ? { ...body } : {};
  return typeof claims.picture === "string" && claims.picture.length > 0 ? claims.picture : null;
}

export type AvatarRefresh = {
  /** 預け直せたか。 */
  kept: boolean;
  /** 聞き直して分かった新しい在りか（手形の控えを差し替える）。 */
  picture: string | null;
  /** 更新用の鍵が取り消されていた（手形から外す）。 */
  revoked: boolean;
};

/**
 * 写真を**取り直して**預け直す。預かった写真が無いとき・古くなったときに、ログインの部品が呼ぶ。
 *
 * 更新用の鍵があれば Google に新しい在りかを聞いてから取りに行く（在りかが切れていても戻る）。
 * 鍵が無い人（この仕組みより前にログインした人）は、手形に残っている在りかで試すだけ
 * （切れていれば人型なので預からない。次のログインで鍵を受け取れば戻る）。
 */
export async function refreshAvatar(email: string, refreshToken: string | null, lastPicture: string | null): Promise<AvatarRefresh> {
  let picture: string | null = null;
  let revoked = false;
  if (refreshToken !== null) {
    try {
      const fresh = await currentGooglePicture(refreshToken);
      if (fresh === "revoked") revoked = true;
      else picture = fresh;
    } catch {
      // 聞けなかったときは、手元の在りかで試す
    }
  }
  const source = picture ?? lastPicture;
  const kept = source !== null && await keepAvatar(email, source);
  return { kept, picture, revoked };
}

/** 預かった写真。無ければ null。 */
export async function readAvatar(id: string): Promise<{ bytes: Uint8Array<ArrayBuffer>; etag: string } | null> {
  if (!isAvatarId(id)) return null;
  try {
    const result = await get(`${PREFIX}${id}.webp`, { access: "private", useCache: false });
    if (!result || result.statusCode !== 200) return null;
    const bytes = new Uint8Array(await new Response(result.stream).arrayBuffer());
    return { bytes, etag: result.blob.etag.startsWith('"') ? result.blob.etag : `"${result.blob.etag}"` };
  } catch (error) {
    if (error instanceof BlobNotFoundError) return null;
    throw error;
  }
}
