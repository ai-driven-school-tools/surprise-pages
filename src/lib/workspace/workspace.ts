import { cache } from "react";
import { logEvent } from "../logging/server-log";
import { getDb, orgDb, type DbRow } from "../db/database";
import { currentOrganization, type OrganizationScope } from "../organization/scope";
import { organizationProfile, shareableOrganizationName } from "../organization/profile";
import { insideRender, memberRead } from "../identity/member-reads";
import {
  isAdmin,
  visiblePagesFor,
  canEditPage,
  canManageSharing,
  pendingRequestCounts,
} from "../access/access";
import { pageHrefOf } from "../pages/store";
import { readPageBatches } from "../pages/batches";
import type { Member } from "../identity/identity";
import { sameEmail, displayNameOf } from "../identity/member-name";
import { CLASSIFIER_VERSION } from "../pages/catalog";
import type { WorkspaceRow } from "./model";
import {
  appearanceSchema,
  localeSettingSchema,
  type WorkspaceAppearance,
} from "./settings";
import type { LocaleSetting } from "../i18n/locales";
import { defaultTranslate } from "../i18n/default";

/** 管理者か（名乗りに付いた所属の役割から決まる・保存先を引かない）。 */
export const workspaceAdmin = (organization: OrganizationScope, viewer: Member): Promise<boolean> => isAdmin(organization, viewer);

/**
 * 保存先の読み込みの失敗。断り文は決まった文面のまま、保存先が返した符号（23505・PGRST205・57014 など）を
 * `code` に持たせる。符号はログと Sentry に残り、文面は残らない（`src/lib/logging/log-record.ts`）。
 */
function readFailure(message: string, code: string): Error {
  return Object.assign(new Error(message), { code });
}

/** 1 回の問い合わせで読む行の数（`allRows`）。 */
const ROWS_PER_READ = 500;

/**
 * 500 件に満たない答えが来たら、それが最後（続きを確かめに空の問い合わせをもう 1 回送らない）。
 * 本人の分の星・許可は 500 件より少ないのがふつうなので、読むのは 1 往復で済む。
 */
type TableQuery = ReturnType<ReturnType<typeof getDb>["from"]>;

/**
 * 表の行を鍵の順に 500 件ずつ全部読む（お気に入りの読み口 src/lib/workspace/sidebar-favorites.ts も使う）。
 * 表は呼ぶ側が口ごと渡す（`() => orgDb(organization).from("page_favorites")`）。表の名前を文字の引数で受けると、
 * 組織で絞った口を通したかを字面で確かめられない（tests/checks/check-tenant-scope.mjs）。
 */
export async function allRows(
  table: () => TableQuery,
  columns: string,
  key: string,
  configure: (query: TableQuery) => TableQuery,
): Promise<DbRow[]> {
  const rows: DbRow[] = [];
  let after: string | undefined;
  for (;;) {
    let query = configure(table().select(columns))
      .order(key, { ascending: true })
      .limit(ROWS_PER_READ);
    if (after) query = query.gt(key, after);
    const result = await query;
    if (result.error) throw readFailure("一覧を読み込めませんでした。", result.error.code); // i18n-keep: 内部の失敗（画面には決まったエラー画面の文しか出ない）
    const batch = Array.isArray(result.data) ? result.data : [];
    rows.push(...batch);
    if (batch.length < ROWS_PER_READ) break;
    const next = batch[batch.length - 1][key];
    if (typeof next !== "string" || next === after)
      throw readFailure("一覧を読み込めませんでした。", "WORKSPACE_CURSOR"); // i18n-keep: 内部の失敗（画面には決まったエラー画面の文しか出ない）
    after = next;
  }
  return rows;
}
/**
 * 星を付けた資料の行（本人の分だけ）。1 回の画面の表示の中では 1 度だけ読む——サイドバーのお気に入りと、
 * 一覧の行の星の両方が使うので、別々に読むと同じ行を 2 度読む。画面の表示の外（窓口）では毎回読み直す。
 */
export const savedFavorites = cache(async (organization: OrganizationScope, email: string): Promise<DbRow[]> => {
  const bundled = await memberRead(organization, email, "favorites");
  if (bundled !== undefined) return bundled.map((pageId) => ({ page_id: pageId }));
  return allRows(() => orgDb(organization).from("page_favorites"), "page_id", "page_id", (q) => q.eq("owner_email", email.toLowerCase()));
});

/**
 * 個人設定の 1 行（外観・言語・読み上げ）。1 回の画面の表示の中では 1 度だけ読む——外枠が外観を、言語の決め方が言語を、
 * 道具箱の受け渡しが読み上げを、それぞれ同じ行から引くので、別々に読むと同じ 1 行に 3 回往復する。
 * 失敗の扱いは読む側ごとに違う（外観は投げる・言語と読み上げは既定に落とす）ので、ここは答えをそのまま返す。
 */
const preferenceRow = cache(async (email: string) => {
  // 個人設定は人に付く（組織をまたいで同じ・組織に属さない表）。ただ、画面を描く 1 回の中では本人まわりの問い合わせと
  // まとめて 1 本で読み（src/lib/identity/member-reads.ts）、その 1 本が組織ごとなので、要求の組織を引く。言語の決め方（src/lib/i18n/server.ts）から
  // 組織を渡せないための例外（tests/checks/check-tenant-scope.mjs の台帳に載せてある）
  const organization = await currentOrganization();
  const bundled = await memberRead(organization, email, "preferences");
  if (bundled !== undefined) return { data: bundled, error: null };
  return getDb()
    .from("workspace_preferences")
    .select("appearance, locale")
    .eq("owner_email", email.toLowerCase())
    .maybeSingle();
});

export const readAppearance = cache(async (
  email: string,
): Promise<WorkspaceAppearance> => {
  const result = await preferenceRow(email);
  if (result.error) throw readFailure("個人設定を読み込めませんでした。", result.error.code); // i18n-keep: 内部の失敗（画面には決まったエラー画面の文しか出ない）
  const record =
    result.data && !Array.isArray(result.data) ? result.data : null;
  return appearanceSchema.catch("system").parse(record?.appearance);
});

/**
 * 個人設定の言語（空は「自動」）。外枠が画面ごとに引くので、**読めなかったときは「自動」として返す**
 * （投げない）。言語のために関係の無い画面ごと落とさない。
 */
export const readLocaleSetting = cache(async (email: string): Promise<LocaleSetting> => {
  try {
    const result = await preferenceRow(email);
    const record = !result.error && result.data && !Array.isArray(result.data) ? result.data : null;
    return localeSettingSchema.catch("auto").parse(record?.locale ?? "auto");
  } catch {
    return "auto";
  }
});
/**
 * 要求の組織の「既定の言語」（組織の設定）。言語の決め方（src/lib/i18n/server.ts）が、ブラウザの言語からも
 * 決まらないときに使う。組織を渡せない口なので、ここで要求の組織を引く（上の preferenceRow と同じ例外）。読めなければ日本語。
 */
export const readOrganizationLocale = cache(async (): Promise<"ja" | "en"> => {
  try {
    return (await organizationProfile(await currentOrganization())).defaultLocale;
  } catch {
    return "ja";
  }
});

/**
 * 要求の組織の名前（画面の「{organization} の資料」に差し込む・src/lib/i18n/server.ts の `currentOrganizationName`）。
 * 組織の設定の読み（60 秒覚える）を言語の決め方と分け合う。読めなければ null（辞書の一般語「この組織」が入る）。
 * `shareable` はログインしていない人にも届く場所へ出してよい名前（配布版は null・shareableOrganizationName）。
 */
export const readOrganizationName = cache(async (): Promise<{ readonly name: string; readonly shareable: string | null } | null> => {
  try {
    const profile = await organizationProfile(await currentOrganization());
    return { name: profile.name, shareable: shareableOrganizationName(profile) };
  } catch {
    return null;
  }
});

/**
 * 形式（スライド・文書など）をいつ引くか。
 * - `all`: すべての行について引いてから返す（形式で絞るとき・アプリの窓口）
 * - `later`: 引かずに「形式未確認」のまま返す。画面に出す行が決まってから
 *   `withWorkspaceKinds` でその行の分だけ引く（会社の資料 1 万件で 250 回の問い合わせを 2 回にする）
 */
export type WorkspaceKinds = "all" | "later";

/** `later` で返した行の、形式を引くための版の目印。行の中身（ブラウザへ送るもの）には載せない。 */
const pendingVersions = new WeakMap<WorkspaceRow, string | null>();

function pageIdsOf(rows: readonly DbRow[], key: string): string[] {
  return rows.flatMap((row) => {
    const id = row[key];
    return typeof id === "string" ? [id] : [];
  });
}

/** like の型の中で文字どおりに扱う（% と _ と \ を打ち消す）。 */
function likeLiteral(text: string): string {
  return text.replace(/[\\%_]/g, (character) => `\\${character}`);
}

/**
 * `workspaceRows(…, { kinds: "later" })` で返した行のうち、渡した行（画面に出す分）の形式を引いて埋める。
 * `all` で返した行はそのまま返す。
 */
export async function withWorkspaceKinds(
  organization: OrganizationScope,
  rows: readonly WorkspaceRow[],
  viewerEmail?: string,
): Promise<WorkspaceRow[]> {
  const waiting = rows.flatMap((row) => {
    const version = pendingVersions.get(row);
    return version === undefined ? [] : [{ id: row.id, currentVersionId: version }];
  });
  if (waiting.length === 0) return [...rows];
  const kinds = await classifyPages(organization, waiting, viewerEmail);
  return rows.map((row) => {
    const version = pendingVersions.get(row);
    return version === undefined
      ? row
      : { ...row, kind: kinds.get(`${row.id}:${version}`) ?? "unknown" };
  });
}

export async function workspaceRows(
  organization: OrganizationScope,
  viewer: Member,
  shelf: "mine" | "company" | "favorites" = "company",
  { kinds: when = "all" }: { kinds?: WorkspaceKinds } = {},
): Promise<WorkspaceRow[]> {
  const email = viewer.email.toLowerCase();
  // 形式の材料は、ページの一覧と同時に読み始める（一覧が届いてから読むと 1 段ぶん伸びる・docs/design/app-speed.md）
  prefetchPageKinds(organization, viewer.email);
  const readGrants = (pageIds?: readonly string[]) =>
    allRows(() => orgDb(organization).from("page_permissions"), "id,page_id", "id", (q) => {
      const query = q.eq("grantee_kind", "member")
        .eq("member_email", email).eq("role", "owner");
      return pageIds === undefined ? query : query.in("page_id", pageIds);
    });
  /*
   * 自分の資料・お気に入りの棚は、その棚に入りうる行（候補）だけを保管庫から読む。
   * 全社の資料が増えても、読む行はその人の分だけで済む。
   * 候補は「減らす」ためだけのもので、見てよいかは下の visiblePagesFor、
   * 棚に入るかは下の selected（今までと同じ判定）が決める。
   */
  let ids: string[] | undefined;
  let saved: DbRow[] | undefined;
  let ownerGrants: DbRow[] | undefined;
  if (shelf === "favorites") {
    saved = await savedFavorites(organization, email);
    ids = pageIdsOf(saved, "page_id");
  } else if (shelf === "mine") {
    const candidates = await mineCandidates(organization, viewer, readGrants);
    ownerGrants = candidates.grants;
    ids = candidates.ids;
  }
  if (ids?.length === 0) return [];

  const adminPromise = workspaceAdmin(organization, viewer);
  const [pages, admin, pending, grants, favorites] = await Promise.all([
    visiblePagesFor(organization, viewer, adminPromise, ids),
    adminPromise,
    ids === undefined ? pendingRequestCounts(organization, viewer.email) :
      readPageBatches(ids, (batch) => pendingRequestCounts(organization, viewer.email, batch).then(counts => [...counts]))
        .then((entries) => new Map(entries)),
    ownerGrants ?? (ids === undefined ? readGrants() : readPageBatches(ids, readGrants)),
    saved ?? savedFavorites(organization, email),
  ]);
  const ownerIds = new Set(grants.map((row) => row.page_id));
  const favoriteIds = new Set(favorites.map((row) => row.page_id));
  // Only classify and serialize the requested shelf, after the shared access gate.
  const selected = pages.filter((page) =>
    shelf === "company" ||
    (shelf === "favorites" && favoriteIds.has(page.id)) ||
    (shelf === "mine" && (sameEmail(page.createdBy, viewer.email) ||
      (page.visibility === "restricted" && ownerIds.has(page.id)))),
  );
  const kinds = when === "all" ? await classifyPages(organization, selected, viewer.email) : null;
  return selected.flatMap((page) => {
    const href = pageHrefOf(page.pageSlug);
    if (!href) return [];
    const collaborator =
      page.visibility === "restricted" && ownerIds.has(page.id);
    const row: WorkspaceRow = {
      id: page.id,
      page: page.pageSlug,
      href,
      title: page.title,
      updatedAt: page.updatedAt,
      author: page.createdBy
        ? displayNameOf(page.createdBy, null)
        : defaultTranslate("library.unknownAuthor"),
      kind: kinds?.get(`${page.id}:${page.currentVersionId}`) ?? "unknown",
      scope:
        page.visibility === "public"
          ? "public"
          : page.visibility === "restricted"
            ? "restricted"
            : "company",
      mine: sameEmail(page.createdBy, viewer.email),
      collaborator,
      editable: canEditPage(viewer, page, admin, collaborator),
      shareable: canManageSharing(viewer, page, admin, collaborator),
      waiting: pending.get(page.pageSlug) ?? 0,
      favorite: favoriteIds.has(page.id),
    };
    if (kinds === null) pendingVersions.set(row, page.currentVersionId);
    return [row];
  });
}

/**
 * 自分の資料の棚に入りうる行の目印: 作った人がその人の資料と、共同の作った人の許可が出ている資料。
 * 作った人の欄は大文字小文字をそろえずに入っているので、区別せずに拾う（多めに拾うぶんには害が無い。
 * 棚に入るかは workspaceRows の selected が今までと同じ判定で決める）。
 */
async function mineCandidates(
  organization: OrganizationScope,
  viewer: Member,
  readGrants: () => Promise<DbRow[]>,
): Promise<{ ids: string[]; grants: DbRow[] }> {
  const [created, grants] = await Promise.all([
    allRows(() => orgDb(organization).from("pages"), "id", "id", (q) =>
      q.ilike("created_by", `%${likeLiteral(viewer.email.trim())}%`).is("deleted_at", null)),
    readGrants(),
  ]);
  return {
    ids: [...new Set([...pageIdsOf(created, "id"), ...pageIdsOf(grants, "page_id")])],
    grants,
  };
}

/** 1 段目で読む「出やすい資料」の数（新しく直された順。会社の資料の 1 ページ目 50 件と、見る人を絞った資料の分のゆとり）。 */
const EARLY_KIND_PAGES = 200;
const KIND_NAMES: ReadonlySet<string> = new Set(["deck", "document", "page"]);
function isKind(value: unknown): value is WorkspaceRow["kind"] {
  return typeof value === "string" && KIND_NAMES.has(value);
}

/**
 * 出やすい資料（新しく直された順に 200 件・本人が見た・作った・共有された資料）の今の版の形式を、1 本で読む
 * （保存先の関数 member_page_kinds）。鍵は `<台帳の目印>:<版の目印>`、値は形式（まだ無ければ null）。読めなければ null。
 * 画面を描く 1 回の中でだけ使い（React の cache）、窓口では読まない——全部の資料ぶんを読む口にしない。
 */
const pageKindsOfRequest = cache(async (organization: OrganizationScope, email: string): Promise<Map<string, WorkspaceRow["kind"] | null> | null> => {
  if (!insideRender()) return null;
  const { data, error } = await orgDb(organization).rpc("org_member_page_kinds", { p_email: email.trim().toLowerCase(), p_recent: EARLY_KIND_PAGES, p_classifier: CLASSIFIER_VERSION });
  if (error !== null || !Array.isArray(data)) return null;
  const found = new Map<string, WorkspaceRow["kind"] | null>();
  for (const row of data) {
    if (typeof row.page_id !== "string" || typeof row.version_id !== "string") return null;
    found.set(`${row.page_id}:${row.version_id}`, isKind(row.kind) ? row.kind : null);
  }
  return found;
});

/** 形式の材料を、ページの一覧と同時に読み始める（ホームと一覧の頭で呼ぶ・失敗は使うときに今までの読み方へ戻る）。 */
export function prefetchPageKinds(organization: OrganizationScope, email: string): void {
  if (!insideRender()) return;
  pageKindsOfRequest(organization, email).catch(() => undefined);
}

/**
 * 今の版の形式。1 ページに過去の分類がいくつもあるので、今の版だけを 40 件ずつ引く。
 * 一覧（`workspaceRows`）とホーム（`src/lib/workspace/home.ts`）が同じ口を使う（鍵は `<台帳の目印>:<版の目印>`）。
 */
export async function classifyPages(
  organization: OrganizationScope,
  pages: readonly { id: string; currentVersionId: string | null }[],
  viewerEmail?: string,
): Promise<Map<string, WorkspaceRow["kind"]>> {
  const kinds = new Map<string, WorkspaceRow["kind"]>();
  // A page can have many historical classifications: request only current versions, in bounded batches.
  let classified = pages.filter((page) => page.currentVersionId !== null);
  if (classified.length === 0) return kinds;
  // 画面を描く 1 回の中では、1 段目で読み始めておいた「出やすい資料の形式」を先に使う（prefetchPageKinds）。
  // そこで確かめた資料（形式が無いと分かったものも含む）は読み直さず、確かめていない資料だけを下の読み方で補う
  const early = viewerEmail === undefined ? null : await pageKindsOfRequest(organization, viewerEmail);
  if (early !== null) {
    for (const page of classified) {
      const key = `${page.id}:${page.currentVersionId}`;
      const kind = early.get(key);
      if (kind !== undefined && kind !== null) kinds.set(key, kind);
    }
    classified = classified.filter((page) => !early.has(`${page.id}:${page.currentVersionId}`));
    if (classified.length === 0) return kinds;
  }
  // 目印の一覧を本文で渡して 1 本で読む（保存先の関数 current_page_kinds・条件は下の読み方と同じ）。関数が無い・読めないときは今までの読み方に戻る
  const bundled = await getDb().rpc("current_page_kinds", {
    p_ids: [...new Set(classified.map((page) => page.id))],
    p_versions: [...new Set(classified.flatMap((page) => (page.currentVersionId === null ? [] : [page.currentVersionId])))],
    p_classifier: CLASSIFIER_VERSION,
  });
  if (bundled.error === null && Array.isArray(bundled.data)) {
    for (const row of bundled.data) {
      if (row.kind === "deck" || row.kind === "document" || row.kind === "page")
        kinds.set(`${row.page_id}:${row.version_id}`, row.kind);
    }
    return kinds;
  }
  let next = 0;
  async function classify() {
    for (;;) {
      const start = next;
      next += 40;
      const chunk = classified.slice(start, start + 40);
      if (chunk.length === 0) return;
      const result = await orgDb(organization)
        .from("page_catalog")
        .select("page_id,version_id,kind")
        .in(
          "page_id",
          chunk.map((p) => p.id),
        )
        .in(
          "version_id",
          chunk.map((p) => p.currentVersionId).filter((v) => v !== null),
        )
        .eq("classifier_version", CLASSIFIER_VERSION);
      if (result.error) {
        // 資料の形式を読めなかった。一覧は形式なしで出し、再分類で修復できる
        logEvent({ level: "warn", event: "catalog.read-failed" });
        continue;
      }
      for (const row of Array.isArray(result.data) ? result.data : []) {
        if (row.kind === "deck" || row.kind === "document" || row.kind === "page")
          kinds.set(`${row.page_id}:${row.version_id}`, row.kind);
      }
    }
  }
  // Bound database pressure while avoiding one network round trip per 40 documents.
  await Promise.all(Array.from({ length: Math.min(4, Math.ceil(classified.length / 40)) }, classify));
  return kinds;
}
