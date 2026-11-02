import { createHmac } from "node:crypto";
import { AVATAR_PATH_PREFIX } from "./avatar-path";

/**
 * 預かった顔写真の目印（預かり方は `src/lib/identity/avatars.ts`）。サーバーだけが読む。
 *
 * 目印はアドレスから鍵付きで作る。アドレスを知らない人には誰の写真か分からず、
 * アドレスを知っていても鍵が無ければ作れない。縮める道具や保管庫の部品を持たないので、
 * コメントの一覧のような軽い部品からも読める。
 */

const ID = /^[A-Za-z0-9_-]{22}$/;

/** 預かった写真を取り直す間隔。写真を変えた人も、保管庫から消えた分も、この間隔で戻る。 */
export const AVATAR_REFRESH_MS = 7 * 24 * 60 * 60 * 1000;

/** アドレスから作る目印。署名の鍵が無い場所（検査の組み立てなど）では null。 */
export function avatarIdOf(email: string): string | null {
  const secret = process.env.AUTH_SECRET;
  if (secret === undefined || secret.length === 0) return null;
  const key = createHmac("sha256", secret).update("surprise-pages/avatar-id").digest();
  return createHmac("sha256", key).update(email.trim().toLowerCase()).digest().subarray(0, 16).toString("base64url");
}

/** その人の顔写真の在りか（こちらの口）。預かっていなければ口が 404 を返し、画面は頭文字に落ちる。 */
export function avatarPathOf(email: string): string | null {
  const id = avatarIdOf(email);
  return id === null ? null : `${AVATAR_PATH_PREFIX}${id}`;
}

export function isAvatarId(value: string): boolean {
  return ID.test(value);
}
