import type { DocumentKind } from "../pages/catalog";
import type { MessageKey } from "../i18n/messages/types";
/*
 * このファイルはブラウザの一覧（src/app/_components/workspace-list.tsx）も読む。**zod を読み込まない**——読むと、使わない
 * 検査の道具（約 100KB）が一覧の画面の JS に入る。個人設定と一覧の操作の受け口の形は src/lib/workspace/settings.ts。
 */
export type WorkspaceRow = {
  id: string;
  page: string;
  href: string;
  title: string;
  updatedAt: string;
  author: string;
  kind: DocumentKind;
  scope: "company" | "restricted" | "public";
  mine: boolean;
  collaborator: boolean;
  editable: boolean;
  shareable: boolean;
  waiting: number;
  favorite: boolean;
};
/** 形式の名前（辞書の鍵）。字にするのは使う画面（`t(KIND_LABELS[kind])`）。 */
export const KIND_LABELS: Record<DocumentKind, MessageKey> = {
  deck: "library.kinds.deck",
  document: "library.kinds.document",
  page: "library.kinds.page",
  unknown: "library.kinds.unknown",
};
/** 共有範囲の名前（辞書の鍵）。字にするのは使う画面。 */
export const SCOPE_LABELS: Record<WorkspaceRow["scope"], MessageKey> = {
  company: "library.scopes.company",
  restricted: "library.scopes.restricted",
  public: "library.scopes.public",
};
export function foldWorkspaceText(text: string): string {
  return text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\u3041-\u3096]/g, (k) =>
      String.fromCharCode(k.charCodeAt(0) + 0x60),
    );
}

/**
 * \u4e00\u89a7\u306e\u68da\u30fb\u7d5e\u308a\u8fbc\u307f\u30fb\u4e26\u3073\u306e\u6c7a\u307e\u308a\u3002**Web \u306e\u4e00\u89a7\uff08\u30b5\u30fc\u30d0\u30fc\u5074\u306e `src/app/_components/library-screen.tsx` \u304c
 * `pageOfWorkspace` \u3067 1 \u30da\u30fc\u30b8\u5206\u306b\u5207\u308a\u51fa\u3059\uff09\u3068\u30a2\u30d7\u30ea\u306e\u7a93\u53e3\uff08`src/app/api/v1/pages`\uff09\u304c\u3053\u306e\u540c\u3058\u95a2\u6570\u3092\u901a\u3059\u3002**
 * \u7247\u65b9\u3060\u3051\u306b\u6761\u4ef6\u3092\u66f8\u304f\u3068\u3001\u753b\u9762\u3068\u30a2\u30d7\u30ea\u3067\u4e26\u3076\u8cc7\u6599\u304c\u98df\u3044\u9055\u3046\u3002
 *
 * \u898b\u3066\u3088\u3044\u304b\u306f\u3001\u3053\u3053\u3088\u308a\u524d\u306e `workspaceRows`\uff08`visiblePagesFor`\uff09\u3067\u78ba\u5b9a\u3057\u3066\u3044\u308b\u3002
 * \u3053\u3053\u306f\u78ba\u5b9a\u3057\u305f\u884c\u3092\u68da\u306b\u5206\u3051\u3001\u691c\u7d22\u30fb\u5f62\u5f0f\u30fb\u5171\u6709\u7bc4\u56f2\u3067\u7d5e\u308a\u3001\u4e26\u3079\u66ff\u3048\u308b\u3060\u3051\u3002
 */
export type WorkspaceShelf = "mine" | "company" | "favorites";

/** \u68da\u306b\u4e26\u3079\u308b\u884c\u3002`tab` \u306f\u81ea\u5206\u306e\u8cc7\u6599\u306e\u300c\u81ea\u5206\u304c\u4f5c\u6210\u300d\u3068\u300c\u5171\u540c\u7de8\u96c6\u300d\uff08`shared`\uff09\u306e\u5207\u308a\u66ff\u3048\u3002 */
export function rowsOnShelf(
  rows: readonly WorkspaceRow[],
  shelf: WorkspaceShelf,
  tab: string,
): WorkspaceRow[] {
  return rows.filter(
    (row) =>
      shelf === "company" ||
      (shelf === "favorites" && row.favorite) ||
      (shelf === "mine" &&
        (tab === "shared" ? row.collaborator && !row.mine : row.mine)),
  );
}

/** \u691c\u7d22\u306b\u4f7f\u3046\u6587\u5b57\uff08\u984c\u540d\u3068\u884c\u304d\u5148\u3002NFKC\u30fb\u5c0f\u6587\u5b57\u30fb\u3072\u3089\u304c\u306a\u3092\u30ab\u30bf\u30ab\u30ca\u3078\uff09\u3002 */
export function workspaceSearchText(row: WorkspaceRow): string {
  return foldWorkspaceText(row.title + " " + row.href);
}

type OrderKey = Pick<WorkspaceRow, "id" | "title" | "updatedAt">;

/**
 * \u4e26\u3073\u9806\u3002\u540c\u3058\u5024\u306e\u3068\u304d\u306f\u76ee\u5370\u3067\u6c7a\u3081\u308b\uff08\u30da\u30fc\u30b8\u9001\u308a\u3067\u91cd\u8907\u30fb\u629c\u3051\u3092\u8d77\u3053\u3055\u306a\u3044\u305f\u3081\uff09\u3002
 * `new`\uff08\u65e2\u5b9a\uff09\u306f `workspaceRows` \u304c\u8fd4\u3059\u9806\uff08`listAlivePages` \u306e\u65b0\u3057\u3044\u9806\uff09\u3068\u540c\u3058\u3002
 */
export function compareWorkspaceRows(
  sort: string,
): (a: OrderKey, b: OrderKey) => number {
  if (sort === "name")
    return (a, b) =>
      a.title.localeCompare(b.title, "ja") || a.id.localeCompare(b.id);
  if (sort === "old")
    return (a, b) =>
      a.updatedAt.localeCompare(b.updatedAt) || a.id.localeCompare(b.id);
  return (a, b) =>
    b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id);
}

export type WorkspaceFilter = {
  query: string;
  kind: string;
  scope: string;
  sort: string;
};

/**
 * \u68da\u306e\u884c\u3092\u691c\u7d22\u30fb\u5f62\u5f0f\u30fb\u5171\u6709\u7bc4\u56f2\u3067\u7d5e\u308a\u3001\u4e26\u3079\u66ff\u3048\u308b\u3002\u7a7a\u306e\u6761\u4ef6\u306f\u300c\u3059\u3079\u3066\u300d\u3002
 * `searchTextOf` \u306f\u753b\u9762\u304c\u63a7\u3048\u3092\u6301\u3063\u3066\u3044\u308b\u3068\u304d\u3060\u3051\u6e21\u3059\uff08\u6bce\u56de\u305f\u305f\u307f\u76f4\u3055\u306a\u3044\u305f\u3081\uff09\u3002
 */
export function findWorkspaceRows(
  pool: readonly WorkspaceRow[],
  { query, kind, scope, sort }: WorkspaceFilter,
  searchTextOf: (row: WorkspaceRow) => string = workspaceSearchText,
): WorkspaceRow[] {
  const needle = foldWorkspaceText(query.trim());
  const filtered = pool.filter(
    (row) =>
      (!kind || row.kind === kind) &&
      (!scope || row.scope === scope) &&
      (!needle || searchTextOf(row).includes(needle)),
  );
  // The server returns newest-first, with the same stable ID tie-breaker.
  if (sort !== "name" && sort !== "old") return filtered;
  return filtered.sort(compareWorkspaceRows(sort));
}

/** 画面の一覧 1 ページに並べる件数。 */
export const WORKSPACE_PAGE_SIZE = 50;

/**
 * 画面の一覧の URL に載る条件（検索・形式・共有範囲・並び・自分の資料のタブ・ページ番号）。
 * `page` は URL の値をそのまま数にしたもの（範囲に収めるのは `pageOfWorkspace`）。
 */
export type WorkspaceView = WorkspaceFilter & { tab: string; page: number };

/**
 * URL の値から条件を読む。サーバー（ページの `searchParams`）とブラウザ（`useSearchParams`）が
 * 同じ関数を通す。同じ名前が複数あるときは先頭を採る（`URLSearchParams.get` と同じ）。
 */
export function workspaceViewOf(
  get: (name: string) => string | null | undefined,
): WorkspaceView {
  return {
    query: get("q") ?? "",
    kind: get("kind") ?? "",
    scope: get("scope") ?? "",
    sort: get("sort") ?? "new",
    tab: get("tab") ?? "created",
    page: Number(get("page") ?? 1),
  };
}

export type WorkspacePage = {
  /** 今のページに並べる行（多くて `WORKSPACE_PAGE_SIZE` 件）。 */
  rows: WorkspaceRow[];
  /** 条件に合う行の総数。 */
  total: number;
  /** 範囲に収めたページ番号（1 から）。 */
  page: number;
};

/**
 * 画面の一覧 1 ページ分。**ブラウザへ渡すのは、ここで切り出した行と総数だけ。**
 * 棚・検索・形式・共有範囲・並びはアプリの窓口と同じ `rowsOnShelf` / `findWorkspaceRows` を通す。
 * ページ番号が範囲の外・整数でないときは、今までの画面と同じく 1〜最後のページに収める。
 */
export function pageOfWorkspace(
  rows: readonly WorkspaceRow[],
  shelf: WorkspaceShelf,
  view: WorkspaceView,
): WorkspacePage {
  const found = findWorkspaceRows(rowsOnShelf(rows, shelf, view.tab), view);
  const page = clampWorkspacePage(view.page, found.length);
  return {
    rows: found.slice(
      (page - 1) * WORKSPACE_PAGE_SIZE,
      page * WORKSPACE_PAGE_SIZE,
    ),
    total: found.length,
    page,
  };
}

/** ページ番号を 1〜最後のページに収める（整数でなければ 1）。 */
export function clampWorkspacePage(requested: number, total: number): number {
  const last = Math.max(1, Math.ceil(total / WORKSPACE_PAGE_SIZE));
  return Math.min(
    last,
    Math.max(1, Number.isSafeInteger(requested) ? requested : 1),
  );
}
