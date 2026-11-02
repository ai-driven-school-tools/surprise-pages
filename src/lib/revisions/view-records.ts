import { orgDb } from "@/lib/db/database";
import type { OrganizationScope } from "../organization/scope";

/**
 * 「見た」の控えに共通する決まり（で、見たページとリポジトリの文書の 2 つが同じものを読むために切り出した）。
 *
 *   残す日数      … `VIEW_RETENTION_DAYS`。これより古い行は日次の掃除（src/app/api/cron/views）が物理削除する
 *   「残さない」  … `page_view_optouts` の 1 行。見たページもリポジトリの文書も、この 1 つの印で止まる
 *
 * 見たページの読み書きは src/lib/pages/views.ts、リポジトリの文書の分は src/lib/repository-views.ts。
 * どちらもここを通し、日数や印の表の名前を書き写さない。
 */

/**
 * 控えを残す日数。これより古い行は日次の掃除（src/app/api/cron/views）が物理削除する。
 *
 * **画面の「90 日より前の分は消えています」もここを読む。** 数字を 2 か所に書くと、
 * 片方だけ変えたときに、画面が嘘をつく（消えていないのに消えたと言う／その逆）。
 */
export const VIEW_RETENTION_DAYS = 90;

const DAY_MS = 24 * 60 * 60 * 1000;

/** 「記録を残さない」と言った人の表（0009_page_views.sql）。 */
export const VIEW_OPTOUTS_TABLE = "page_view_optouts";

/**
 * 掃除の境目。これより前に最後に見た行は消す（読む側も読まない）。
 *
 * 時刻を引数で受けられるようにしてあるのは、検査が保管庫なしで境目を確かめられるようにするため。
 */
export function viewSweepCutoff(now: Date = new Date()): string {
  return new Date(now.getTime() - VIEW_RETENTION_DAYS * DAY_MS).toISOString();
}

/** 保存も照合も小文字で。表の側にも同じ制約があり、揃っていない値は insert で落ちる。 */
export function normalizeViewerEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** その人のアカウントに「記録を残さない」の印が立っているか。読めなければ投げる（立っていないと読まない）。 */
export async function viewOptOutMarked(organization: OrganizationScope, email: string): Promise<boolean> {
  const { data, error } = await orgDb(organization)
    .from(VIEW_OPTOUTS_TABLE)
    .select("viewer_email")
    .eq("viewer_email", normalizeViewerEmail(email))
    .limit(1);
  if (error !== null) throw new Error(`見たページの控えの「残さない」の取得に失敗しました: ${error.message}`); // i18n-keep: 内部の失敗（画面と窓口には決まった文しか出ない）
  return Array.isArray(data) && data.length > 0;
}
