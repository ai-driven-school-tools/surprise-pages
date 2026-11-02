import { list } from "@vercel/blob";
import { storageUsage } from "../db/database";
import { isSiteOwner } from "../settings/site-settings";

/**
 * 設置した本人に見せる使用量。無料枠を使い切って止まる前に、本人が気づけるようにする。
 *
 * 数えるのは自分の保存先と画像の置き場だけで、Neon や Vercel の請求の数字は取りに行かない
 * （そのためだけの鍵を増やさない）。画像は一覧を数えるので、多すぎるときは途中で打ち切って
 * 「以上」と言う（設定画面を開くたびに置き場を長く歩かない）。
 */
export type SiteUsage = {
  databaseBytes: number;
  pages: number;
  revisions: number;
  assets: { bytes: number; files: number; partial: boolean } | null;
};

const ASSET_PAGES = 20;

async function assetUsage(): Promise<SiteUsage["assets"]> {
  let bytes = 0, files = 0, cursor: string | undefined;
  for (let page = 0; page < ASSET_PAGES; page++) {
    const result = await list({ limit: 1000, cursor });
    for (const blob of result.blobs) { bytes += blob.size; files += 1; }
    if (!result.hasMore || result.cursor === undefined) return { bytes, files, partial: false };
    cursor = result.cursor;
  }
  return { bytes, files, partial: true };
}

export async function siteUsageFor(email: string): Promise<SiteUsage | null> {
  if (!isSiteOwner(email)) return null;
  const [storage, assets] = await Promise.all([storageUsage().catch(() => null), assetUsage().catch(() => null)]);
  if (storage === null) return null;
  return { ...storage, assets };
}
