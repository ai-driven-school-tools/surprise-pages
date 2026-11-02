import { z } from "zod";
import { orgDb } from "@/lib/db/database";
import type { OrganizationScope } from "../organization/scope";
import { isSafeSlug } from "../pages/content";
import { ownsRow, type Identity, type Member } from "../identity/identity";
import { readPageBatches } from "../pages/batches";
import { displayNameOf } from "../identity/member-name";
import { toPageEntry, type StoredPage } from "../pages/store";
import {
  BODY_MAX_LENGTH,
  COMMENT_KINDS,
  COMMENT_PRIORITIES,
  QUOTE_CONTEXT_MAX_LENGTH,
  QUOTE_MAX_LENGTH,
  SLUG_VISIBILITIES,
  type CommentAuthor,
  type CommentKind,
  type CommentPriority,
  type PageComment,
  type SlugVisibility,
  type QuoteContext,
} from "./types";
import { avatarPathOf } from "../identity/avatar-id";
import { defaultTranslate } from "../i18n/default";
import { rt } from "../i18n/request";
import type { MessageKey, MessageParams } from "../i18n/messages/types";

/**
 * コメントの読み書き。
 *
 * 誰が書いたかは currentIdentity が返した名乗りからしか採らない
 * （ブラウザが送ってきた「私は誰々です」という申告は一切信じない）。
 * 投稿の鍵で来たときは、鍵の持ち主の会社アカウントとして書く。
 * 消すときは行を消さず「消した印」（deleted_at）を立てる。
 */

const TABLE = "page_comments";
const COLUMNS =
  "id, page_slug, parent_id, quote, quote_context, body, kind, priority, " +
  "author_email, author_name, author_image, guest_id, page_version, " +
  "resolved_at, resolved_by, created_at, updated_at";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isCommentId(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value);
}

/**
 * ページの呼び名は `<見せ方>/<場所>`（例: `internal/example/hello`）。
 *
 * 見せ方を頭に含めるのは、コメント 1 件を見ただけで「社内のものか公開のものか」が
 * 分かるようにするため。社内のコメントを門なしで返してしまう事故を、
 * 別の表を引かずに防げる。
 */
export type PageRef = { slugPrefix: SlugVisibility; slug: string };

/**
 * ここが返す `slugPrefix` は、**呼び名の頭の文字を読んだだけ**のもの（`SlugVisibility`。2 通り）。
 * 台帳の見せ方（src/lib/pages/content.ts の `Visibility`。3 通り）とは別の型で、欄の名前も分けてある——
 * `visibility` という名前を持たせないことで、**可否の判定に使いようがない**ようにしてある。
 * ページ台帳（pages 表）の見せ方の列は一度も見ていない。
 *
 * この 2 つは、いつでも同じとは限らない。ページごとの閲覧制限は
 * 「呼び名は internal のまま、台帳の列だけを制限つきにする」作りなので、
 * **制限つきのページも、ここでは internal に見える**。
 *
 * だから「見てよいか」の判定にこの値を使ってはいけない。
 * 可否を決めるのは src/lib/access/access.ts の canViewPage ただ 1 つ。
 * ここで済ませると、本文だけ守られてコメント・履歴・共有が素通り、という
 * 「片方の入口だけ塞ぎ忘れた」状態になる。
 */
export function parsePageSlug(value: unknown): PageRef | null {
  if (typeof value !== "string" || value.length === 0) return null;
  const parts = value.split("/");
  const head = parts[0];
  const slugPrefix = SLUG_VISIBILITIES.find((known) => known === head);
  if (slugPrefix === undefined) return null;
  const rest = parts.slice(1);
  if (!isSafeSlug(rest)) return null;
  return { slugPrefix, slug: `${slugPrefix}/${rest.join("/")}` };
}

/** 素の値（JSON やデータベースの行）を、型を壊さずに 1 段だけ開く。 */
export function toRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const record: Record<string, unknown> = { ...value };
  return record;
}

function readString(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  return typeof value === "string" ? value : null;
}

function isKind(value: unknown): value is CommentKind {
  return COMMENT_KINDS.some((kind) => kind === value);
}

function isPriority(value: unknown): value is CommentPriority {
  return COMMENT_PRIORITIES.some((priority) => priority === value);
}

/** 空白を 1 つに詰めて、前後を落とし、長さで切る。 */
function tidy(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const text = value.replace(/\s+/g, " ").trim();
  if (text.length === 0) return null;
  return text.slice(0, maxLength);
}

function toQuoteContext(value: unknown): QuoteContext | null {
  const record = toRecord(value);
  if (record === null) return null;
  const before = readString(record, "beforeText") ?? "";
  const after = readString(record, "afterText") ?? "";
  if (before.length === 0 && after.length === 0) return null;
  return {
    beforeText: before.slice(0, QUOTE_CONTEXT_MAX_LENGTH),
    afterText: after.slice(0, QUOTE_CONTEXT_MAX_LENGTH),
  };
}

/** 書いた人を、外に出してよい形（メールアドレス抜き）に直す。 */
function toAuthor(record: Record<string, unknown>): CommentAuthor {
  const guestId = readString(record, "guest_id");
  const name = readString(record, "author_name");
  const email = readString(record, "author_email");

  if (guestId !== null && email === null) {
    return { kind: "guest", name: name ?? rt("toolbox.comments.noName"), image: null };
  }
  return {
    kind: "member",
    // アドレスの無い会社アカウントの行は形が壊れている（呼び方の決めようがない）
    name: email === null ? (name ?? rt("toolbox.comments.noName")) : displayNameOf(email, name),
    // 顔は書いた時点の在りかではなく、いま預かっている写真で出す（src/lib/identity/avatars.ts）。
    // 行に残る Google の在りかは数週間で人型に変わるため。預かっていない人は 404 で頭文字に落ちる
    image: (email === null ? null : avatarPathOf(email)) ?? readString(record, "author_image"),
  };
}

/**
 * データベースの 1 行を、外に出す形に直す。形が違えば null（落とす）。
 *
 * 「自分のものか」はここで決めて真偽値だけ返す。ブラウザ側に見分けの材料
 * （メールアドレスやゲストの目印）を渡さずに済ませるため。
 */
export function toPageComment(row: unknown, viewer: Identity | null): PageComment | null {
  const record = toRecord(row);
  if (record === null) return null;

  const id = readString(record, "id");
  const pageSlug = readString(record, "page_slug");
  const authorEmail = readString(record, "author_email");
  const guestId = readString(record, "guest_id");
  const createdAt = readString(record, "created_at");
  const updatedAt = readString(record, "updated_at");
  if (id === null || pageSlug === null) return null;
  if (authorEmail === null && guestId === null) return null;
  if (createdAt === null || updatedAt === null) return null;

  const kind = record["kind"];
  const priority = record["priority"];

  return {
    id,
    pageSlug,
    parentId: readString(record, "parent_id"),
    quote: readString(record, "quote"),
    quoteContext: toQuoteContext(record["quote_context"]),
    body: readString(record, "body") ?? "",
    kind: isKind(kind) ? kind : "comment",
    priority: isPriority(priority) ? priority : "want",
    author: toAuthor(record),
    mine: ownsRow(viewer, authorEmail, guestId),
    pageVersion: readString(record, "page_version"),
    resolvedAt: readString(record, "resolved_at"),
    resolvedBy: readString(record, "resolved_by"),
    createdAt,
    updatedAt,
  };
}

function toPageComments(rows: unknown, viewer: Identity | null): PageComment[] {
  if (!Array.isArray(rows)) return [];
  const comments: PageComment[] = [];
  for (const row of rows) {
    const comment = toPageComment(row, viewer);
    if (comment !== null) comments.push(comment);
  }
  return comments;
}

/** 投稿してよい形かを確かめた結果。ダメなら理由（そのまま利用者に見せる文）。 */
export type NewCommentInput = {
  pageSlug: string;
  parentId: string | null;
  quote: string | null;
  quoteContext: QuoteContext | null;
  body: string;
  kind: CommentKind;
  priority: CommentPriority;
};

/**
 * 断り。`reason` は日本語の正本の文、
 * ブラウザの窓口は `reasonKey` を要求の言語で引く（`rt(input.reasonKey, input.reasonParams)`）。
 */
export type Refusal = { ok: false; reason: string; reasonKey: MessageKey; reasonParams: MessageParams };
export type Validated<T> = { ok: true; value: T } | Refusal;

export function refuse(key: MessageKey, params: MessageParams = {}): Refusal {
  return { ok: false, reason: defaultTranslate(key, params), reasonKey: key, reasonParams: params };
}

export function validateNewComment(payload: unknown): Validated<NewCommentInput> {
  const record = toRecord(payload);
  if (record === null) return refuse("toolbox.comments.unreadableBody");

  const page = parsePageSlug(record["pageSlug"]);
  if (page === null) return refuse("toolbox.comments.badPage");

  const fields = validateCommentFields(record);
  if (!fields.ok) return fields;
  return { ok: true, value: { pageSlug: page.slug, ...fields.value } };
}

/** コメントの中身（どこに付くか以外）の受け取り。ページとリポジトリの文書（src/lib/repository-comments.ts）が同じものを通す。 */
export type CommentFields = Omit<NewCommentInput, "pageSlug">;

export function validateCommentFields(record: Record<string, unknown>): Validated<CommentFields> {
  // 取消線は画面から取り下げた機能。新しくは受け付けない
  // （列と制約は残してあるので、あとで戻すときは validate を外すだけで済む）
  const kindValue = record["kind"] ?? "comment";
  if (!isKind(kindValue) || kindValue === "strikethrough") {
    return refuse("toolbox.comments.badKind");
  }

  const priorityValue = record["priority"] ?? "want";
  if (!isPriority(priorityValue)) return refuse("toolbox.comments.badPriority");

  const bodyValue = record["body"];
  const body = typeof bodyValue === "string" ? bodyValue.trim().slice(0, BODY_MAX_LENGTH) : "";
  // いいねは引用が中身。本文が空でも受ける。直してほしさの 3 つは本文が要る
  if (body.length === 0 && priorityValue !== "good") {
    return refuse("toolbox.comments.bodyRequired");
  }

  const parentValue = record["parentId"];
  let parentId: string | null = null;
  if (parentValue !== null && parentValue !== undefined) {
    if (!isCommentId(parentValue)) return refuse("toolbox.comments.badParent");
    parentId = parentValue;
  }

  const quoteValue = record["quote"];
  const quote = typeof quoteValue === "string" ? quoteValue.trim() : "";
  if (quote.length > QUOTE_MAX_LENGTH) {
    return refuse("toolbox.comments.quoteTooLong", { max: QUOTE_MAX_LENGTH });
  }

  return {
    ok: true,
    value: {
      parentId,
      quote: quote.length > 0 ? quote : null,
      quoteContext: toQuoteContext(record["quoteContext"]),
      body,
      kind: kindValue,
      priority: priorityValue,
    },
  };
}

export type CommentPatch = {
  body: string | null;
  priority: CommentPriority | null;
  resolved: boolean | null;
};

export function validateCommentPatch(payload: unknown): Validated<CommentPatch> {
  const record = toRecord(payload);
  if (record === null) return refuse("toolbox.comments.unreadableBody");

  const bodyValue = record["body"];
  let body: string | null = null;
  if (bodyValue !== undefined && bodyValue !== null) {
    if (typeof bodyValue !== "string") return refuse("toolbox.comments.badBody");
    body = bodyValue.trim().slice(0, BODY_MAX_LENGTH);
  }

  const priorityValue = record["priority"];
  let priority: CommentPriority | null = null;
  if (priorityValue !== undefined && priorityValue !== null) {
    if (!isPriority(priorityValue)) return refuse("toolbox.comments.badPriority");
    priority = priorityValue;
  }

  const resolvedValue = record["resolved"];
  let resolved: boolean | null = null;
  if (resolvedValue !== undefined && resolvedValue !== null) {
    if (typeof resolvedValue !== "boolean") {
      return refuse("toolbox.comments.badResolved");
    }
    resolved = resolvedValue;
  }

  if (body === null && priority === null && resolved === null) {
    return refuse("toolbox.comments.nothingToChange");
  }
  if (body === "" && priority !== null && priority !== "good") {
    return refuse("toolbox.comments.bodyRequired");
  }
  return { ok: true, value: { body, priority, resolved } };
}

/**
 * 一度にまとめて動かせる件数。
 *
 * 上限が無いと、目印を並べただけで重い問い合わせを作れてしまう。
 * 1 ページに付くコメントの実数（多くて数十件）から見て、まず足りる数。
 */
export const BULK_RESOLVE_MAX = 200;

export type BulkResolve = {
  page: PageRef;
  ids: string[];
  resolved: boolean;
};

/**
 * まとめて解決 / 戻すの受け取り。
 *
 * **ページの呼び名を必ず受ける。** 目印だけで動かせる形にすると、他のページの
 * コメントを混ぜても通ってしまう（関門はページ 1 枚に対してしか開けない）。
 * 同じ目印が 2 度並んでいても 1 件として扱う。
 */
export function validateBulkResolve(payload: unknown): Validated<BulkResolve> {
  const record = toRecord(payload);
  if (record === null) return refuse("toolbox.comments.unreadableBody");

  const page = parsePageSlug(record["pageSlug"]);
  if (page === null) return refuse("toolbox.comments.badPage");

  const picked = validateBulkPick(record);
  if (!picked.ok) return picked;
  return { ok: true, value: { page, ...picked.value } };
}

/** まとめて動かす目印と向き。ページとリポジトリの文書（src/lib/repository-comments.ts）が同じものを通す。 */
export function validateBulkPick(record: Record<string, unknown>): Validated<{ ids: string[]; resolved: boolean }> {
  const rawIds = record["ids"];
  if (!Array.isArray(rawIds)) return refuse("toolbox.comments.badCommentId");
  const ids: string[] = [];
  for (const value of rawIds) {
    if (!isCommentId(value)) return refuse("toolbox.comments.badCommentId");
    if (!ids.includes(value)) ids.push(value);
  }
  if (ids.length === 0) return refuse("toolbox.comments.noneSelected");
  if (ids.length > BULK_RESOLVE_MAX) {
    return refuse("toolbox.comments.tooMany", { max: BULK_RESOLVE_MAX });
  }

  const resolved = record["resolved"];
  if (typeof resolved !== "boolean") {
    return refuse("toolbox.comments.badResolved");
  }

  return { ok: true, value: { ids, resolved } };
}

/** データベースが返したエラーを、そのまま外に漏らさずに投げ直す。 */
const FAILED_ACTIONS = { read: "取得", save: "保存", update: "更新", delete: "削除" } as const; // i18n-keep: 内部の失敗（画面には固定の失敗しか出ない）
function fail(action: keyof typeof FAILED_ACTIONS, error: { message: string } | null): never {
  throw new Error(`コメントの${FAILED_ACTIONS[action]}に失敗しました: ${error?.message ?? "原因不明"}`); // i18n-keep: 内部の失敗（ログにだけ残る）
}

/** そのページのコメントを古い順に返す（消した印が立っているものは除く）。 */
export async function listComments(
  organization: OrganizationScope,
  pageSlug: string,
  viewer: Identity | null,
): Promise<PageComment[]> {
  // 呼び名で引く（ページの門と同時に読み始められるように。呼び名は組織の中で一意）
  const { data, error } = await orgDb(organization)
    .from(TABLE)
    .select(COLUMNS)
    .eq("page_slug", pageSlug)
    .is("deleted_at", null)
    .order("created_at", { ascending: true });

  if (error !== null) fail("read", error);
  const rows: unknown = data;
  return toPageComments(rows, viewer);
}

export async function findComment(
  organization: OrganizationScope,
  id: string,
  viewer: Identity | null,
): Promise<PageComment | null> {
  const { data, error } = await orgDb(organization)
    .from(TABLE)
    .select(COLUMNS)
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();

  if (error !== null) fail("read", error);
  const row: unknown = data;
  return toPageComment(row, viewer);
}

// ---------------------------------------------------------------------------
// 自分が書いたコメント（/activity の 2 つめの節）
// ---------------------------------------------------------------------------

/**
 * 一度に引く上限。新しい順に切るので、あふれるのは古いものから。
 *
 * 書いた数は人によって桁が違う。上限が無いと、たくさん書いた人の画面だけが
 * 重くなる（しかも古い行ほど、読み返す値打ちが下がる）。
 */
export const MY_COMMENTS_LIMIT = 100;

/**
 * 「自分が書いたコメント」1 行。
 *
 * **メールアドレスも、ゲストの目印も持たせない。** 誰が書いたかはサーバーが引くときに
 * 決まっていて、並ぶのは全部その人のものなので、見分けの材料そのものが要らない
 * （公開ページのコメントと同じ決まり。src/lib/comments/types.ts の CommentAuthor）。
 *
 * ページの呼び名も持たせない。この節に消す操作は無いので、送り返す先が無い。
 */
export type MyComment = {
  id: string;
  /** コメントの本文。画面は 1 行に切って出す */
  body: string;
  /** 押した先（/internal/… か /public/…）。台帳の行から作る */
  href: string;
  /** そのページの題。台帳から採る（題が直れば、この一覧も追いつく） */
  pageTitle: string;
  /** 解決になっているか。画面は「未解決 / 解決済」と出す */
  resolved: boolean;
  createdAt: string;
};

/**
 * その人が書いたコメントを、新しい順に。
 *
 * ## 見えるページの分だけ
 *
 * 受け取るのは「見てよいページの台帳の行」で、**自分ではページを引かない**
 * （src/lib/pages/views.ts の listViewedPages とまったく同じ作法）。コメントが連れている
 * 呼び名は**頭の文字を読んだだけ**のもので、制限つきのページも `internal/…` に見える。
 * 呼び名だけで安全と判断すると、あとから名簿を外された人の画面に、そのページの題と
 * 自分の書いた文がそのまま残り続ける。見える行を確定させるのは src/lib/access/access.ts の
 * `visiblePagesFor` ただ 1 つで、ここは渡された行しか見られない。
 *
 * ## ゲストの分も出す
 *
 * 名乗り方（会社の人 / ゲスト）で絞る列が変わるだけで、あとは同じ道を通る。
 * 出さないと、公開ページで名前だけ名乗って書いた人にとって、この節は永久に空になる。
 * 自分のものかの判定は `ownsRow`——コメント 1 件の `mine` を決めているものと同じ
 * ——をそのまま通す（判定を 2 通り持たない）。
 *
 * ## 往復は 1 回
 *
 * 書いた人で絞って引き、見えるページかどうかは**手元の集合**で落とす。呼び名を並べて
 * 絞り込みに渡す形にすると、ページが増えるだけ問い合わせの文字列が伸びていく。
 * 1 件ずつページを引き当てるのは論外（コメントの数だけ往復する）。
 */
export async function listMyComments(
  organization: OrganizationScope,
  viewer: Identity | null,
  visible: readonly StoredPage[],
): Promise<MyComment[]> {
  if (viewer === null) return [];
  if (visible.length === 0) return [];

  const mine = orgDb(organization)
    .from(TABLE)
    .select("id, page_slug, body, author_email, guest_id, resolved_at, created_at")
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(MY_COMMENTS_LIMIT);

  // 名乗り方で絞る列が変わる。値として渡す（絞り込みの文字列を組み立てない）
  const { data, error } =
    viewer.kind === "guest"
      ? await mine.eq("guest_id", viewer.guestId)
      : await mine.eq("author_email", viewer.email);

  if (error !== null) fail("read", error);

  const known = new Map(visible.map((page) => [page.pageSlug, page]));
  const rows: MyComment[] = [];
  const found: unknown = data;
  if (!Array.isArray(found)) return rows;

  for (const row of found) {
    const record = toRecord(row);
    if (record === null) continue;

    const id = readString(record, "id");
    const pageSlug = readString(record, "page_slug");
    const createdAt = readString(record, "created_at");
    if (id === null || pageSlug === null || createdAt === null) continue;

    // 引くときに絞ってあるが、判定はコメント 1 件のときと同じものを通す
    if (!ownsRow(viewer, readString(record, "author_email"), readString(record, "guest_id"))) {
      continue;
    }

    // 見えないページのコメントは**行ごと落とす**（題を出すこと自体が漏れになる）
    const page = known.get(pageSlug);
    if (page === undefined) continue;

    // 行き先と題は台帳から採る。URL に使えない呼び名の行は、一覧と同じくここでも出さない
    const entry = toPageEntry(page);
    if (entry === null) continue;

    rows.push({
      id,
      body: readString(record, "body") ?? "",
      href: entry.href,
      pageTitle: entry.title,
      resolved: readString(record, "resolved_at") !== null,
      createdAt,
    });
  }
  return rows;
}

// ---------------------------------------------------------------------------
// 「あなたの番」（ホームのコメントの節・src/lib/workspace/home.ts）
// ---------------------------------------------------------------------------

/** 新しい順。同じ時刻は目印の順（並びを毎回同じにする）。 */
function newestFirst(a: PageComment, b: PageComment): number {
  return Date.parse(b.createdAt) - Date.parse(a.createdAt) || a.id.localeCompare(b.id);
}

/**
 * 渡したページに付いている**未解決の親コメント**を、新しい順に。
 *
 * 「未解決」の意味は Web のコメント一覧の既定（`src/widget/comments/comment-list.ts` の `open`）と同じ——
 * 親コメントで、解決の印が無く、消した印も無いもの。返信は数えない（Web の件数も親だけ）。
 * **読むだけで、解決の状態には一切触らない**（解決は人の判断の記録。機械が閉じない）。
 *
 * 受け取るのは見てよいページの台帳の行で、自分ではページを引かない（`listMyComments` と同じ作法）。
 * 呼び名は小分けにして引く（HTTP 経由の保管庫でも問い合わせの長さが伸びないように）。
 * ページの数だけ往復はしない——40 枚ずつ 1 回。
 */
export async function listOpenCommentsOn(
  organization: OrganizationScope,
  pages: readonly StoredPage[],
  viewer: Identity | null,
): Promise<PageComment[]> {
  if (pages.length === 0) return [];
  // 呼び名の一覧を本文で渡して 1 本で読む（保存先の関数 open_page_comments・条件は下の読み方と同じ）。
  // 40 件ずつ URL に並べると、資料の多い人は 10 本・3 段に分かれていた（docs/design/app-speed.md の「本番で分かったこと」）。
  // 関数が無い・読めないときは今までの読み方に戻る
  const bundled = await orgDb(organization).rpc("org_open_page_comments", { p_slugs: [...new Set(pages.map((page) => page.pageSlug))] });
  if (bundled.error === null && Array.isArray(bundled.data)) return toPageComments(bundled.data, viewer).sort(newestFirst);
  const rows = await readPageBatches(pages.map((page) => page.pageSlug), async (slugs) => {
    const { data, error } = await orgDb(organization)
      .from(TABLE)
      .select(COLUMNS)
      .in("page_slug", slugs)
      .is("parent_id", null)
      .is("resolved_at", null)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });
    if (error !== null) fail("read", error);
    const found: unknown = data;
    return Array.isArray(found) ? found : [];
  });
  return toPageComments(rows, viewer).sort(newestFirst);
}

/** 自分の親コメントに付いた返信 1 件と、その親・ページ。 */
export type ReplyToMine = { reply: PageComment; parent: PageComment; page: StoredPage };

/**
 * 自分が書いた親コメントに、**ほかの人が** `since` より後に付けた返信を、新しい順に。
 *
 * - 返信の宛先は親コメントの書き手で決める（自分のものかは `ownsRow`。コメント 1 件の
 *   `mine` と同じ判定）。自分で自分に付けた返信は入れない。
 * - 見えないページの返信は**行ごと落とす**（`listMyComments` と同じ。受け取った台帳の行しか見ない）。
 * - 返す件数は `limit` まで。`total` は落とす前の全件（見えるもののうち）。
 *
 * 往復は件数によらず一定: 「自分の親コメントの目印」と「その時刻より後の返信」を同時に引き、
 * 返す分の親の本文だけを 1 回（40 件ずつ）引く。
 */
export async function listRepliesToMine(
  organization: OrganizationScope,
  viewer: Identity,
  visible: readonly StoredPage[],
  since: string,
  limit: number,
): Promise<{ total: number; items: ReplyToMine[] }> {
  if (visible.length === 0) return { total: 0, items: [] };

  const own = orgDb(organization)
    .from(TABLE)
    .select("id, author_email, guest_id")
    .is("parent_id", null)
    .is("deleted_at", null);
  const [mine, replies] = await Promise.all([
    viewer.kind === "guest" ? own.eq("guest_id", viewer.guestId) : own.eq("author_email", viewer.email),
    orgDb(organization)
      .from(TABLE)
      .select(COLUMNS)
      .not("parent_id", "is", null)
      .is("deleted_at", null)
      .gt("created_at", since)
      .order("created_at", { ascending: false }),
  ]);
  if (mine.error !== null) fail("read", mine.error);
  if (replies.error !== null) fail("read", replies.error);
  return assembleReplies(viewer, visible, limit, mine.data, replies.data, async (ids) =>
    readPageBatches(ids, async (batch) => {
      const { data, error } = await orgDb(organization).from(TABLE).select(COLUMNS).in("id", batch).is("deleted_at", null);
      if (error !== null) fail("read", error);
      const found: unknown = data;
      return Array.isArray(found) ? found : [];
    }));
}

/**
 * 自分の親コメントの行・返信の行・親の読み方から、返信の一覧を組み立てる（listRepliesToMine とホームの 1 段目の読み方で共通）。
 * 判定（自分の親か・自分の返信でないか・見えるページか・親が同じページか）は、ここだけに書く。
 */
async function assembleReplies(
  viewer: Identity,
  visible: readonly StoredPage[],
  limit: number,
  ownRows: unknown,
  replyRows: unknown,
  readParents: (ids: string[]) => Promise<readonly unknown[]>,
): Promise<{ total: number; items: ReplyToMine[] }> {
  const myIds = new Set<string>();
  if (Array.isArray(ownRows)) {
    for (const row of ownRows) {
      const record = toRecord(row);
      if (record === null) continue;
      const id = readString(record, "id");
      if (id === null) continue;
      if (!ownsRow(viewer, readString(record, "author_email"), readString(record, "guest_id"))) continue;
      myIds.add(id);
    }
  }

  const known = new Map(visible.map((page) => [page.pageSlug, page]));
  const matched = toPageComments(replyRows, viewer)
    .filter((reply) => reply.parentId !== null && myIds.has(reply.parentId) && !reply.mine && known.has(reply.pageSlug))
    .sort(newestFirst);

  const shown = matched.slice(0, limit);
  const parentRows = await readParents(shown.flatMap((reply) => (reply.parentId === null ? [] : [reply.parentId])));
  const parents = new Map(toPageComments(parentRows, viewer).map((parent) => [parent.id, parent]));

  const items: ReplyToMine[] = [];
  for (const reply of shown) {
    const parent = reply.parentId === null ? undefined : parents.get(reply.parentId);
    const page = known.get(reply.pageSlug);
    // 親が同じページのものでなければ出さない（壊れた行を別のページの題で見せない）
    if (parent === undefined || page === undefined || parent.pageSlug !== reply.pageSlug) continue;
    items.push({ reply, parent, page });
  }
  return { total: matched.length, items };
}

/**
 * ホームのコメントの節の材料を、ページの一覧を待たずに 1 本で読む（保存先の関数 home_comment_reads・docs/design/app-speed.md）。
 * 関数は判定しない（候補を広めに返すだけ）。読めなかったら null で、ホームは今までの読み方に戻る。
 */
export type HomeCommentReads = {
  readonly candidateSlugs: ReadonlySet<string>;
  readonly open: readonly unknown[];
  readonly myParentIds: readonly unknown[];
  readonly replies: readonly unknown[];
  readonly parents: readonly unknown[];
};
const homeReadsShape = z.object({
  candidate_slugs: z.array(z.string()),
  open_comments: z.array(z.unknown()),
  my_parent_ids: z.array(z.string()),
  replies: z.array(z.unknown()),
  parents: z.array(z.unknown()),
});
export async function readHomeComments(organization: OrganizationScope, viewer: Member, since: string): Promise<HomeCommentReads | null> {
  const { data, error } = await orgDb(organization).rpc("org_home_comment_reads", { p_email: viewer.email.trim().toLowerCase(), p_author: viewer.email, p_since: since });
  if (error !== null) return null;
  const direct = homeReadsShape.safeParse(data);
  const wrapped = z.tuple([z.object({ org_home_comment_reads: homeReadsShape })]).safeParse(data);
  const body = direct.success ? direct.data : wrapped.success ? wrapped.data[0].org_home_comment_reads : null;
  if (body === null) return null;
  return {
    candidateSlugs: new Set(body.candidate_slugs),
    open: body.open_comments,
    myParentIds: body.my_parent_ids,
    replies: body.replies,
    parents: body.parents,
  };
}

/** まとめて読んだ材料から、渡したページの未解決のコメント（listOpenCommentsOn と同じ答え）。候補が足りなければ null。 */
export function openCommentsFrom(reads: HomeCommentReads, pages: readonly StoredPage[], viewer: Identity | null): PageComment[] | null {
  if (!pages.every((page) => reads.candidateSlugs.has(page.pageSlug))) return null;
  const slugs = new Set(pages.map((page) => page.pageSlug));
  return toPageComments(reads.open, viewer).filter((comment) => slugs.has(comment.pageSlug)).sort(newestFirst);
}

/** まとめて読んだ材料から、返信の一覧（listRepliesToMine と同じ答え）。 */
export async function repliesFrom(
  reads: HomeCommentReads,
  viewer: Member,
  visible: readonly StoredPage[],
  limit: number,
): Promise<{ total: number; items: ReplyToMine[] }> {
  if (visible.length === 0) return { total: 0, items: [] };
  const own = reads.myParentIds.map((id) => ({ id, author_email: viewer.email, guest_id: null }));
  return assembleReplies(viewer, visible, limit, own, reads.replies, async (ids) => {
    const wanted = new Set(ids);
    return reads.parents.filter((row) => {
      const record = toRecord(row);
      const id = record === null ? null : readString(record, "id");
      return id !== null && wanted.has(id);
    });
  });
}

/** 書いた人の欄は、名乗り方（ログイン / ゲスト）で入る列が変わる。 */
function authorColumns(author: Identity): Record<string, string | null> {
  if (author.kind === "guest") {
    return {
      author_email: null,
      author_name: author.name,
      author_image: null,
      guest_id: author.guestId,
    };
  }
  return {
    author_email: author.email,
    author_name: author.name,
    author_image: author.image,
    guest_id: null,
  };
}

/**
 * コメントを 1 件足す。
 *
 * `pageVersion` は「そのとき本文がどの版だったか」。取れなければ null のまま入れる
 * （版が分からないことより、コメントが保存できないことのほうが困るため）。
 */
export async function createComment(
  page: StoredPage,
  input: NewCommentInput,
  author: Identity,
  pageVersion: string | null,
): Promise<PageComment> {
  const { data, error } = await insertComment(page, input, author, pageVersion, {});
  if (error !== null) fail("save", error);
  return savedComment(data, author);
}

/** 足す 1 行。一度きりの目印の有無で列が 1 つ増えるだけで、ほかは `createComment` と同じ。 */
function insertComment(
  page: StoredPage,
  input: NewCommentInput,
  author: Identity,
  pageVersion: string | null,
  extra: Record<string, string>,
) {
  // 門を通ったページに結ぶ（組織の印は口が差し込み、page_id は保存先の外部キーが同じ組織のページかを確かめる）
  if (page.pageSlug !== input.pageSlug) fail("save", { message: "page slug differs from the gated page" });
  return orgDb(page.organization)
    .from(TABLE)
    .insert({
      page_id: page.id,
      page_slug: input.pageSlug,
      parent_id: input.parentId,
      quote: input.quote,
      quote_context: input.quoteContext,
      body: input.body,
      kind: input.kind,
      priority: input.priority,
      page_version: pageVersion,
      ...authorColumns(author),
      ...extra,
    })
    .select(COLUMNS)
    .single();
}

function savedComment(data: unknown, author: Identity): PageComment {
  const comment = toPageComment(data, author);
  if (comment === null) fail("save", { message: "保存後の行が読めませんでした" }); // i18n-keep: 内部の失敗
  return comment;
}

/**
 * 返信の相手として正しいか。正しければ null、だめなら断りの文（そのまま利用者に見せる）。
 *
 * 返信は 1 段まで。返信への返信と、別ページへのぶら下げは受け付けない。
 * ブラウザの道具箱（/api/comments）がここを通る。
 */
export async function replyProblemKey(organization: OrganizationScope, input: NewCommentInput, viewer: Identity): Promise<MessageKey | null> {
  if (input.parentId === null) return null;
  const parent = await findComment(organization, input.parentId, viewer);
  if (parent === null || parent.pageSlug !== input.pageSlug) return "toolbox.comments.parentMissing";
  if (parent.parentId !== null) return "toolbox.comments.nestedReply";
  return null;
}

/**
 * 解決の付け外しで動く列。**1 件の口とまとめての口が、ここを共有する。**
 *
 * 誰が閉じたかは画面に出すだけなので、識別子ではなく表示名を残す。
 * 入口ごとに書き比べると、片方だけ名前を残し忘れた版が出る。
 */
export function resolveColumns(resolved: boolean, viewer: Identity): Record<string, string | null> {
  return {
    resolved_at: resolved ? new Date().toISOString() : null,
    resolved_by: resolved ? viewerLabel(viewer) : null,
  };
}

export async function applyCommentPatch(
  organization: OrganizationScope,
  id: string,
  patch: CommentPatch,
  viewer: Identity,
): Promise<PageComment> {
  const changes: Record<string, string | null> = { updated_at: new Date().toISOString() };
  if (patch.body !== null) changes["body"] = patch.body;
  if (patch.priority !== null) changes["priority"] = patch.priority;
  if (patch.resolved !== null) Object.assign(changes, resolveColumns(patch.resolved, viewer));

  const { data, error } = await orgDb(organization)
    .from(TABLE)
    .update(changes)
    .eq("id", id)
    .is("deleted_at", null)
    .select(COLUMNS)
    .single();

  if (error !== null) fail("update", error);
  const row: unknown = data;
  const comment = toPageComment(row, viewer);
  if (comment === null) fail("update", { message: "更新後の行が読めませんでした" }); // i18n-keep: 内部の失敗
  return comment;
}

/**
 * まとめて解決 / 戻す。動いた件数だけ返す。
 *
 * 目印の並びだけでなく**ページの呼び名も条件に入れる**。関門（openPage）が開くのは
 * ページ 1 枚に対してなので、別のページの目印が混ざっていたら当たらないほうが正しい
 * （越境の書き込みも、「その目印が在るか」の当てっこも、これで同時に塞がる）。
 *
 * すでにその状態のものは触らない。解決済のものをもう一度解決にすると、
 * 誰がいつ閉じたかの記録が上書きされてしまう（まとめて選んだ中に片付いたものが
 * 混ざるのは普通のこと）。だから返る件数は、本当に動いた数になる。
 */
export async function resolveComments(
  organization: OrganizationScope,
  page: PageRef,
  ids: readonly string[],
  resolved: boolean,
  viewer: Identity,
): Promise<number> {
  const changes: Record<string, string | null> = {
    updated_at: new Date().toISOString(),
    ...resolveColumns(resolved, viewer),
  };

  const query = orgDb(organization)
    .from(TABLE)
    .update(changes)
    .in("id", [...ids])
    .eq("page_slug", page.slug)
    .is("deleted_at", null);

  const scoped = resolved
    ? query.is("resolved_at", null)
    : query.not("resolved_at", "is", null);

  const { data, error } = await scoped.select("id");
  if (error !== null) fail("update", error);
  return Array.isArray(data) ? data.length : 0;
}

function viewerLabel(viewer: Identity): string {
  if (viewer.kind === "guest") return viewer.name;
  return displayNameOf(viewer.email, viewer.name);
}

/** 物理削除はしない。「消した印」を立てて一覧から外すだけ。 */
export async function markCommentDeleted(organization: OrganizationScope, id: string): Promise<void> {
  const now = new Date().toISOString();
  const { error } = await orgDb(organization)
    .from(TABLE)
    .update({ deleted_at: now, updated_at: now })
    .eq("id", id)
    .is("deleted_at", null);

  if (error !== null) fail("delete", error);
}
