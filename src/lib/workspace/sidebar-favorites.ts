import { alivePagesRequested, visiblePagesFor } from "../access/access";
import type { OrganizationScope } from "../organization/scope";
import type { Member } from "../identity/identity";
import { insideRender } from "../identity/member-reads";
import { pageHrefOf, type StoredPage } from "../pages/store";
import { savedFavorites, workspaceAdmin } from "./workspace";

/** サイドバーに名前を直接並べるお気に入りの数。これより多い分は「ほか N 件」で一覧へ送る。 */
export const SIDEBAR_FAVORITES = 8;

/** 呼び名（page）は、サイドバーの星で外すときに `/api/workspace` へ渡す（一覧の行と同じ `action: "favorite"`）。 */
export type SidebarFavorite = { page: string; href: string; title: string };

/** 本人が星を付けた資料の目印（台帳の id）。見てよいかはここでは見ない（使う側が `visiblePagesFor` に渡す）。 */
export async function favoritePageIds(organization: OrganizationScope, viewer: Member): Promise<string[]> {
  const saved = await savedFavorites(organization, viewer.email);
  return saved.flatMap((row) => (typeof row.page_id === "string" ? [row.page_id] : []));
}

/**
 * サイドバーに並べるお気に入り（星を付けた資料の名前）。
 *
 * 星の表には時刻が無い（主キーだけ）ので、並びは名前順にする——サイドバーは毎回同じ順で出るほうが
 * 指が覚える（更新順にすると、誰かが直すたびに項目が入れ替わる）。
 * 見てよいかは一覧と同じ `visiblePagesFor` に候補の目印を渡して決める（星を付けたあとに見る人を
 * 絞られた資料は、ここにも出ない）。
 */
export async function sidebarFavorites(organization: OrganizationScope, viewer: Member): Promise<{ rows: SidebarFavorite[]; total: number }> {
  const pages = await favoritePages(organization, viewer);
  const rows = pages
    .flatMap((page) => {
      const href = pageHrefOf(page.pageSlug);
      return href === null ? [] : [{ page: page.pageSlug, href, title: page.title }];
    })
    .sort((a, b) => a.title.localeCompare(b.title, "ja") || a.href.localeCompare(b.href));
  return { rows: rows.slice(0, SIDEBAR_FAVORITES), total: rows.length };
}

/**
 * 星を付けた資料のうち、見てよいもの。
 *
 * 画面を描く 1 回の中では、星の目印を待たずに、その画面がどのみち読む「見てよい資料の全部」（visiblePagesFor・
 * 台帳の行は 1 回の表示で 1 度だけ読む）から拾う——星の目印が届いてから資料を読み直すと、サイドバーのために 1 段伸びる
 * （docs/design/app-speed.md）。見てよいかの判定は同じ visiblePagesFor が決めるので、答えは目印を渡したときと同じ。
 * 窓口では今までどおり、目印を渡して星の分だけ読む。
 */
async function favoritePages(organization: OrganizationScope, viewer: Member): Promise<StoredPage[]> {
  const admin = workspaceAdmin(organization, viewer);
  const ids = await favoritePageIds(organization, viewer);
  if (ids.length === 0) return [];
  // 全部を読むのは、その画面がどのみち全部を読んでいるときだけ（自分の資料・お気に入りの棚や設定の画面では、星の分だけ読む。
  // 資料が増えても読む量を増やさない——画面の切り替えの速さが資料の数に比例しないことを、検査が見ている）
  if (insideRender() && alivePagesRequested(organization, viewer)) {
    const wanted = new Set(ids);
    return (await visiblePagesFor(organization, viewer, admin)).filter((page) => wanted.has(page.id));
  }
  return visiblePagesFor(organization, viewer, admin, ids);
}
