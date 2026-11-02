import { currentOrganization } from "@/lib/organization/scope";
import { redirect } from "next/navigation";
import { currentIdentity, isMember } from "@/lib/identity/identity";
import { withWorkspaceKinds, workspaceRows } from "@/lib/workspace/workspace";
import {
  pageOfWorkspace,
  workspaceViewOf,
  type WorkspaceShelf,
} from "@/lib/workspace/model";
import { WorkspaceList } from "./workspace-list";

export type LibrarySearchParams = Promise<
  Record<string, string | string[] | undefined>
>;

/**
 * 資料の一覧。見てよい行（`workspaceRows`）を棚・検索・形式・共有範囲・並びで絞り、
 * **今のページの行と総数だけ**をブラウザへ渡す（全件を送ると資料の数に比例して重くなる）。
 */
export async function LibraryScreen({
  shelf,
  searchParams,
}: {
  shelf: WorkspaceShelf;
  searchParams: LibrarySearchParams;
}) {
  const organization = await currentOrganization();
  const viewer = await currentIdentity();
  if (!isMember(viewer)) redirect("/signin");
  const params = await searchParams;
  const view = workspaceViewOf((name) => {
    const value = params[name];
    return Array.isArray(value) ? value[0] : value;
  });
  // 形式で絞らないときは、形式を画面に出す行の分だけ引く（全件ぶん引くと資料の数に比例して重くなる）
  const later = view.kind === "";
  const rows = await workspaceRows(organization, viewer, shelf, {
    kinds: later ? "later" : "all",
  });
  const page = pageOfWorkspace(rows, shelf, view);
  const listed = later
    ? { ...page, rows: await withWorkspaceKinds(organization, page.rows, viewer.email) }
    : page;
  /*
   * 一覧を待ちの表示（Suspense）で包まない。ワークスペースは待ちの表示を持たない（`src/app/_components/back-link.tsx の LinkPending`）。
   * React は待ちを出してから 300ms は中身へ差し替えないので、応答が 20ms で届いても切り替えが 0.3 秒かかる。
   * この画面は要求ごとに描く（force-dynamic）ので、検索の条件を読む部品を包む必要も無い。
   */
  return (
    <WorkspaceList
      rows={listed.rows}
      total={listed.total}
      page={listed.page}
      shelf={shelf}
    />
  );
}
