/**
 * 既にあるスライドを原稿から丸ごと送り直すときの、巻き戻しの確かめ（./republish-guard.ts）に渡す 3 つの本文をそろえる。
 * 断るかどうかと言い方は投稿の入口（src/app/api/pages/route.ts）が決める。
 */
import { orgDb } from "../../db/database";
import { DECK_NODE_MARK } from "./model";
import { republishReverts, type RepublishConflict } from "./republish-guard";
import type { StoredPage } from "../../pages/store";
import { readFileAt } from "../../revisions/revisions";

/** さかのぼる版の数。見るのは 2 つの列だけ（本文は運ばない）。共同編集は打つたびに版を積むので多めに取る。 */
const SOURCE_SCAN = 500;

function versionIdsOf(rows: unknown, column: string): string[] {
  if (!Array.isArray(rows)) return [];
  const ids: string[] = [];
  for (const row of rows) {
    if (row === null || typeof row !== "object") continue;
    const value: unknown = Reflect.get(row, column);
    if (typeof value === "string") ids.push(value);
  }
  return ids;
}

/**
 * 最後に原稿から丸ごと投稿した版。ブラウザと AI の直しは、版に操作の ID を持つ（1 件ずつ）か、
 * 受領記録（deck_edit_receipts・まとめて保存した版）に載るので、そのどちらでもない新しい順の最初の版。見つからなければ null。
 */
export async function lastSourcePublishOf(page: StoredPage): Promise<string | null> {
  const db = orgDb(page.organization);
  const revisions = await db.from("page_revisions").select("version_id,edit_operation_id").eq("page_id", page.id)
    .order("version_number", { ascending: false }).limit(SOURCE_SCAN);
  // 読めなければ保存先のエラーのまま投げる（入口は固定の 500 の断りだけを返す）
  if (revisions.error !== null) throw revisions.error;
  const rows: unknown = revisions.data;
  const plain = Array.isArray(rows) ? versionIdsOf(rows.filter((row: unknown) => row !== null && typeof row === "object" && Reflect.get(row, "edit_operation_id") === null), "version_id") : [];
  if (plain.length === 0) return null;
  const receipts = await db.from("deck_edit_receipts").select("version_id").eq("page_id", page.id).in("version_id", plain);
  if (receipts.error !== null) throw receipts.error;
  const edited = new Set(versionIdsOf(receipts.data, "version_id"));
  return plain.find((id) => !edited.has(id)) ?? null;
}

/**
 * いまの版（`current`）に積まれた直しを、送られた原稿（`proposed`）が巻き戻す箇所。
 * 原稿から投稿した版が見つからない（画面で作った資料など）ときは、取り寄せた本文を元にした原稿（ID を持つ）なら
 * いまの版を元と見なして止めない。ID の無い手元の原稿なら、いまの文を 1 つでも落とせば止める。
 */
export async function deckRepublishConflicts(page: StoredPage, current: string, proposed: string): Promise<RepublishConflict[]> {
  const sourceId = await lastSourcePublishOf(page);
  const source = sourceId === null ? null : await readFileAt(page, sourceId);
  const base = source ?? (proposed.includes(`${DECK_NODE_MARK}=`) ? current : null);
  return republishReverts({ source: base, current, proposed }).conflicts;
}
