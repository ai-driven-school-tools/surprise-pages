import { canEditPage, grantsToMember, visiblePagesFor } from "../access/access";
import type { OrganizationScope } from "../organization/scope";
import { isFixPriority, type PageComment } from "../comments/types";
import { listOpenCommentsOn, listRepliesToMine, openCommentsFrom, readHomeComments, repliesFrom } from "../comments/comments";
import { insideRender } from "../identity/member-reads";
import type { Member } from "../identity/identity";
import { displayNameOf, sameEmail } from "../identity/member-name";
import type { DocumentKind } from "../pages/catalog";
import { pageViewTimes, viewOptedOut } from "../pages/views";
import { pageHrefOf, type StoredPage } from "../pages/store";
import { classifyPages, prefetchPageKinds, workspaceAdmin } from "./workspace";

/**
 * ホーム（`/`）の中身。「続きに戻る」画面で、4 つの節を 1 枚に集める（並びはこの順。最近開いたものが一番上）。
 *
 *   最近開いたもの        自分が開いた順（控えは src/lib/pages/views.ts。「残さない」設定なら空）
 *   コメントと返信        自分の資料に付いた未解決のコメント（解決するまで残る）と、
 *                         自分のコメントへの返信（その資料を開いたら消える）
 *   共有された資料        名簿に自分が載った、見る人を絞った資料（その資料を開いたら消える）
 *   ほかの人の新しい資料  ほかの人が作った資料のうち、直されてからまだ開いていないもの
 *
 * ## 「開いたら消える」は、開いた記録そのもので決める
 *
 * 返信・共有・新しい資料は、その資料を**最後に開いた時刻**（`pageViewTimes`）より後に起きたものだけを出す。
 * ホームを見ただけでは消えない（別の既読の記録を作らない）。iPhone アプリの「あなたの番」
 * （`src/lib/api-v1-inbox.ts`・既読は `inbox_reads`）とは独立で、こちらが向こうの既読を動かすことも無い。
 * 「記録を残さない」と言った人は開いた時刻が無いので、返信・共有・新しい資料は日数で落ちるまで残る。
 *
 * ## どれも Web の一覧と同じ判定だけで組み立てる
 *
 * 見てよい資料は `visiblePagesFor` ただ 1 つ。自分の資料は本文を直せる人の判定（`canEditPage`）から
 * 管理者の分を除いたもの（iPhone アプリの「あなたの番」と同じ顔ぶれ）。未解決のコメントは
 * `listOpenCommentsOn`（コメント一覧の既定「未解決」と同じ意味。いいねは入れない）、返信は `listRepliesToMine`。
 * ここに可否の判定を書き足さない。
 *
 * 縦に待つ回数は資料の枚数によらず 3 回（見てよい行の束 → コメントの束と、コメントに関わらない節の形式 → コメントの節だけに出る資料の形式）。
 */

/** 「最近開いたもの」に並べる件数。全部は「すべて見る」（自分の活動）で。 */
export const HOME_RECENT = 10;
/** 「ほかの人の新しい資料」に並べる件数と、新しいと見なす日数。 */
export const HOME_FRESH = 5;
export const HOME_FRESH_DAYS = 14;
/** コメント・返信・共有の節に並べる件数（総数は見出しに出す）と、さかのぼる日数。 */
export const HOME_NOTICE = 5;
export const HOME_NOTICE_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;
/** コメントを待つ間に形式を引いておく自分の資料の数（新しく直された順。classifyPages は 40 件ずつ 4 本まで同時に引く）。 */
const HOME_EARLY_KINDS = 160;

/** 行の添え書き。字にするのは画面（辞書の鍵は `home.*`）。 */
export type HomeNote =
  | { kind: "commented"; name: string; count: number }
  | { kind: "replied"; name: string }
  | { kind: "shared" }
  /** 作った人の表示名。null は自分 */
  | { kind: "author"; name: string | null };

export type HomeRow = {
  href: string;
  title: string;
  kind: DocumentKind;
  note: HomeNote;
  /** 並びと右端の時刻に使う出来事の時刻（ISO） */
  at: string;
};

export type Home = {
  comments: { total: number; rows: HomeRow[] };
  shared: { total: number; rows: HomeRow[] };
  recent: { rows: HomeRow[]; paused: boolean };
  fresh: { rows: HomeRow[] };
};

/** 読めない時刻は、いちばん古い扱い。 */
function timeOf(iso: string | undefined): number {
  if (iso === undefined) return 0;
  const at = Date.parse(iso);
  return Number.isNaN(at) ? 0 : at;
}

const newestFirst = (a: { at: string; href: string }, b: { at: string; href: string }): number =>
  timeOf(b.at) - timeOf(a.at) || a.href.localeCompare(b.href);

type Draft = { page: StoredPage; href: string; note: HomeNote; at: string };

function draftOf(page: StoredPage, note: HomeNote, at: string): Draft[] {
  const href = pageHrefOf(page.pageSlug);
  return href === null ? [] : [{ page, href, note, at }];
}

function authorNote(viewer: Member, page: StoredPage): HomeNote {
  if (page.createdBy === null || sameEmail(page.createdBy, viewer.email)) return { kind: "author", name: null };
  return { kind: "author", name: displayNameOf(page.createdBy, null) };
}

/** 並べる行の資料を、重なりを除いて 1 枚ずつ。 */
function uniquePages(rows: readonly Draft[]): StoredPage[] {
  return [...new Map(rows.map((row) => [row.page.id, row.page])).values()];
}

export async function homeFor(organization: OrganizationScope, viewer: Member, now: Date = new Date()): Promise<Home> {
  const admin = workspaceAdmin(organization, viewer);
  const since = new Date(now.getTime() - HOME_NOTICE_DAYS * DAY_MS).toISOString();
  // コメントの節の材料と資料の形式は、ページの一覧を待たずに同時に読み始める（1 段で描き終える・docs/design/app-speed.md）。
  // どちらも候補を広めに読むだけで、出すかどうかは下の今までの判定が決める。読めなければ今までの読み方に戻る
  const early = insideRender() ? readHomeComments(organization, viewer, since) : null;
  early?.catch(() => undefined);
  prefetchPageKinds(organization, viewer.email);
  const [visible, grants, viewed, paused] = await Promise.all([
    visiblePagesFor(organization, viewer, admin),
    grantsToMember(organization, viewer.email),
    pageViewTimes(organization, viewer),
    viewOptedOut(organization, viewer),
  ]);
  const freshSince = new Date(now.getTime() - HOME_FRESH_DAYS * DAY_MS).toISOString();
  /** その資料を、この出来事より後に開いているか。 */
  const openedAfter = (page: StoredPage, at: string): boolean => timeOf(viewed.get(page.id)) >= timeOf(at);

  // 共同の作った人の許可は個人あての owner の行だけ（まとまりには出せない・0008_page_roles.sql）
  const ownerGrant = new Set(grants.filter((grant) => !grant.viaGroup && grant.role === "owner").map((grant) => grant.pageId));
  const coOwnerOf = (page: StoredPage): boolean => page.visibility === "restricted" && ownerGrant.has(page.id);
  const mine = visible.filter((page) => canEditPage(viewer, page, false, coOwnerOf(page)));

  // --- 共有された資料（名簿に載ってから、まだ開いていないもの） ---
  const firstShared = new Map<string, string>();
  for (const grant of grants) {
    const before = firstShared.get(grant.pageId);
    if (before === undefined || timeOf(grant.addedAt) < timeOf(before)) firstShared.set(grant.pageId, grant.addedAt);
  }
  const shared: Draft[] = visible
    .flatMap((page) => {
      const sharedAt = firstShared.get(page.id);
      if (sharedAt === undefined || page.visibility !== "restricted") return [];
      if (page.createdBy !== null && sameEmail(page.createdBy, viewer.email)) return [];
      if (timeOf(sharedAt) <= timeOf(since) || openedAfter(page, sharedAt)) return [];
      return draftOf(page, { kind: "shared" }, sharedAt);
    })
    .sort(newestFirst);
  const sharedIds = new Set(shared.map((row) => row.page.id));

  // --- 最近開いたもの ---
  const byId = new Map(visible.map((page) => [page.id, page]));
  const recent: Draft[] = [...viewed]
    .flatMap(([id, at]) => {
      const page = byId.get(id);
      return page === undefined ? [] : draftOf(page, authorNote(viewer, page), at);
    })
    .sort(newestFirst)
    .slice(0, HOME_RECENT);

  // --- ほかの人の新しい資料（直されてから、まだ開いていないもの） ---
  const fresh: Draft[] = visible
    .flatMap((page) => {
      if (page.createdBy === null || sameEmail(page.createdBy, viewer.email)) return [];
      if (timeOf(page.updatedAt) <= timeOf(freshSince) || sharedIds.has(page.id)) return [];
      if (openedAfter(page, page.updatedAt)) return [];
      return draftOf(page, authorNote(viewer, page), page.updatedAt);
    })
    .sort(newestFirst)
    .slice(0, HOME_FRESH);

  // 共有・最近開いたもの・新しい資料はコメントに関わらず決まるので、その形式はコメントと同時に引く
  // （コメントを待ってから全部の形式を引くと、縦の待ちが 1 往復ぶん伸びる）
  // コメントの節に出るのは自分の資料なので、新しく直されたものから一定の数までは、その形式も一緒に引いておく
  // （コメントを待ってから引くと 1 往復ぶん伸びる。数に入らなかった古い資料にコメントが来たときだけ、あとから引く）
  const mineByRecent = [...mine].sort((a, b) => timeOf(b.updatedAt) - timeOf(a.updatedAt)).slice(0, HOME_EARLY_KINDS);
  const earlyKinds = classifyPages(organization, [...new Map([...uniquePages([...shared.slice(0, HOME_NOTICE), ...recent, ...fresh]), ...mineByRecent].map((page) => [page.id, page])).values()], viewer.email);
  // コメントが先に失敗しても、形式の失敗を拾われないまま残さない
  earlyKinds.catch(() => undefined);
  const reads = early === null ? null : await early.catch(() => null);
  const [open, replies] = await Promise.all([
    (reads === null ? null : openCommentsFrom(reads, mine, viewer)) ?? listOpenCommentsOn(organization, mine, viewer),
    reads === null ? listRepliesToMine(organization, viewer, visible, since, HOME_NOTICE * 4) : repliesFrom(reads, viewer, visible, HOME_NOTICE * 4),
  ]);

  // --- コメントと返信（資料ごとに 1 行） ---
  const bySlug = new Map(mine.map((page) => [page.pageSlug, page]));
  const grouped = new Map<string, { page: StoredPage; comments: PageComment[] }>();
  for (const comment of open) {
    if (comment.mine || !isFixPriority(comment.priority)) continue;
    const page = bySlug.get(comment.pageSlug);
    if (page === undefined) continue;
    const entry = grouped.get(page.pageSlug) ?? { page, comments: [] };
    entry.comments.push(comment);
    grouped.set(page.pageSlug, entry);
  }
  const comments: Draft[] = [...grouped.values()].flatMap(({ page, comments: list }) => {
    // listOpenCommentsOn が新しい順に返すので、先頭が最新
    const latest = list[0];
    if (latest === undefined) return [];
    return draftOf(page, { kind: "commented", name: latest.author.name, count: list.length }, latest.createdAt);
  });
  for (const { reply, page } of replies.items) {
    // 未解決のコメントで既に並んでいる資料には重ねない。返信は、その資料を開いたら消える
    if (grouped.has(page.pageSlug) || openedAfter(page, reply.createdAt)) continue;
    if (comments.some((row) => row.page.id === page.id)) continue;
    comments.push(...draftOf(page, { kind: "replied", name: reply.author.name }, reply.createdAt));
  }
  comments.sort(newestFirst);

  // 出す行の形式だけを引く（40 件ずつ・資料の数に比例させない）
  const shownComments = comments.slice(0, HOME_NOTICE);
  const shownShared = shared.slice(0, HOME_NOTICE);
  const known = await earlyKinds;
  // コメントの節にだけ出る資料の形式を足す（ほかの節にも出ている資料は引き直さない）
  const missing = uniquePages(shownComments).filter((page) => !known.has(`${page.id}:${page.currentVersionId}`));
  const kinds = missing.length === 0 ? known : new Map([...known, ...(await classifyPages(organization, missing, viewer.email))]);
  const finish = (rows: Draft[]): HomeRow[] =>
    rows.map(({ page, href, note, at }) => ({
      href,
      title: page.title,
      kind: kinds.get(`${page.id}:${page.currentVersionId}`) ?? "unknown",
      note,
      at,
    }));

  return {
    comments: { total: comments.length, rows: finish(shownComments) },
    shared: { total: shared.length, rows: finish(shownShared) },
    recent: { rows: finish(recent), paused },
    fresh: { rows: finish(fresh) },
  };
}
