/**
 * 預かった顔写真の口の頭（預かり方は `src/lib/identity/avatars.ts`）。
 *
 * ブラウザ側（widget）も読むので、縮める道具や保管庫の部品を持たないファイルに分けてある。
 */
export const AVATAR_PATH_PREFIX = "/api/avatars/";

/** 預かった写真の口か。 */
export function isAvatarPath(value: string): boolean {
  return value.startsWith(AVATAR_PATH_PREFIX);
}
