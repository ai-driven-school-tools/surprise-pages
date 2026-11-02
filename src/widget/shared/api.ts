import { knownBetaFeatures } from "../../lib/settings/beta-features";
import { t, widgetLocale } from "./i18n";
import type { DeckOverrides } from "../../lib/deck/design/design";
import type { DeckCustomization } from "../../lib/deck/edit/customization-html";
import {
  COMMENT_KINDS,
  COMMENT_PRIORITIES,
  OUTCOME_STATES,
  type CommentAuthor,
  type CommentKind,
  type CommentOutcome,
  type CommentPriority,
  type OutcomeState,
  type PageComment,
  type PageFeatures,
  type PageVersion,
  type QuoteContext,
  type RedlineAnchor,
  type RedlineChange,
  type RedlineDiff,
} from "../../lib/comments/types";

/**
 * サーバーとのやりとり。
 *
 * 行き先は必ずスラッシュ始まりで書く。ページには配信時に `<base>` が入っているため、
 * `api/...` と書くとページの下の階層に化ける。
 */

/** コメントの窓口。 */
const commentsEndpoint = "/api/comments";

export type ApiResult<T> = { ok: true; value: T } | { ok: false; message: string; status: number };

function toRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const record: Record<string, unknown> = { ...value };
  return record;
}

function readString(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  return typeof value === "string" ? value : null;
}

function parseAuthor(value: unknown): CommentAuthor | null {
  const record = toRecord(value);
  if (record === null) return null;
  const name = readString(record, "name");
  if (name === null) return null;
  return {
    kind: readString(record, "kind") === "guest" ? "guest" : "member",
    name,
    image: readString(record, "image"),
  };
}

function parseQuoteContext(value: unknown): QuoteContext | null {
  const record = toRecord(value);
  if (record === null) return null;
  return {
    beforeText: readString(record, "beforeText") ?? "",
    afterText: readString(record, "afterText") ?? "",
  };
}

function parseKind(value: unknown): CommentKind {
  return COMMENT_KINDS.find((kind) => kind === value) ?? "comment";
}

function parsePriority(value: unknown): CommentPriority {
  return COMMENT_PRIORITIES.find((priority) => priority === value) ?? "want";
}

function parseComment(value: unknown): PageComment | null {
  const record = toRecord(value);
  if (record === null) return null;

  const id = readString(record, "id");
  const pageSlug = readString(record, "pageSlug");
  const createdAt = readString(record, "createdAt");
  const author = parseAuthor(record["author"]);
  if (id === null || pageSlug === null || createdAt === null || author === null) return null;

  return {
    id,
    pageSlug,
    parentId: readString(record, "parentId"),
    quote: readString(record, "quote"),
    quoteContext: parseQuoteContext(record["quoteContext"]),
    body: readString(record, "body") ?? "",
    kind: parseKind(record["kind"]),
    priority: parsePriority(record["priority"]),
    author,
    mine: record["mine"] === true,
    pageVersion: readString(record, "pageVersion"),
    resolvedAt: readString(record, "resolvedAt"),
    resolvedBy: readString(record, "resolvedBy"),
    createdAt,
    updatedAt: readString(record, "updatedAt") ?? createdAt,
  };
}

/**
 * 窓口へ 1 回届ける（外へ出る口はここ 1 つ）。届かなかった・止めたときは null。
 * 断り文の言語を道具箱とそろえる（窓口はこの見出しと cookie の写しで決める）。
 */
async function reach(path: string, init: RequestInit): Promise<Response | null> {
  try {
    const headers = new Headers(init.headers);
    if (!headers.has("Accept-Language")) headers.set("Accept-Language", widgetLocale());
    return await fetch(path, { credentials: "same-origin", ...init, headers });
  } catch {
    return null;
  }
}

/** 応答を読み、失敗ならそのまま人に見せられる 1 行にして返す。 */
async function send(
  path: string,
  init: RequestInit,
  extraOk: readonly number[] = [],
): Promise<ApiResult<unknown>> {
  const response = await reach(path, init);
  if (response === null) return { ok: false, message: t("toolbox.api.offline"), status: 0 };

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok && !extraOk.includes(response.status)) {
    const record = toRecord(payload);
    const message = record === null ? null : readString(record, "error");
    return {
      ok: false,
      message: message ?? t("toolbox.api.failed", { status: String(response.status) }),
      status: response.status,
    };
  }
  return { ok: true, value: payload };
}

const JSON_HEADERS = { "content-type": "application/json" };

/**
 * ブラウザ側が見る「使ってよい機能」の一式。
 *
 * サーバーが配るものに、**共有範囲（このページを誰に見せるか）を触ってよいか**を 1 つ足す。
 * 決めるのはサーバーだけ。届かないうちは立たないままなので、道具箱に項目も出ない
 * （鍵の無い機能はボタンごと出さない、という決まりのとおり）。
 */
export type WidgetFeatures = PageFeatures & { sharing: boolean };

/**
 * viewer が null なのは「名乗りが届いていない」とき。
 *
 * 道具箱を出す相手（会社の人）には必ず名前が付いてくるので、ここが null になるのは
 * 道具箱ごと閉じている答えか、ログインが切れているときのどちらか。
 */
export type LoadedComments = {
  viewer: CommentAuthor | null;
  comments: PageComment[];
  features: WidgetFeatures;
  currentVersion: string | null;
  /** このページが本人のお気に入りか。null なら星を出さない（src/lib/comments/types.ts の CommentsResponse） */
  favorite: boolean | null;
};

function parseFeatures(value: unknown): WidgetFeatures {
  const record = toRecord(value);
  if (record === null) {
    return { tools: false, history: false, sharing: false, edit: false, write: false, beta: [] };
  }
  // 本人が入れたベータ機能。台帳にある名前だけを通す（欄が無い・形が違う答えは「何も入れていない」）。
  // ここは決まった欄だけを写す作りなので、欄を足したら必ずここにも足す（写し忘れると、誰が入れても入口が出ない）
  const beta = record["beta"];
  return {
    tools: record["tools"] === true,
    history: record["history"] === true,
    sharing: record["sharing"] === true,
    edit: record["edit"] === true,
    // 倒すのはサーバーが偽と書いてきたときだけ。書く口の可否はサーバーが決めるので、ここは押しても断られる操作を出さないためだけの旗
    write: record["write"] !== false,
    beta: Array.isArray(beta) ? knownBetaFeatures(beta) : [],
  };
}

export async function loadComments(pageSlug: string): Promise<ApiResult<LoadedComments>> {
  const result = await send(`${commentsEndpoint}?page=${encodeURIComponent(pageSlug)}`, {
    method: "GET",
    cache: "no-store",
  });
  if (!result.ok) return result;

  const record = toRecord(result.value);
  const viewer = record === null ? null : parseAuthor(record["viewer"]);
  const rows = record === null ? null : record["comments"];
  if (!Array.isArray(rows)) {
    return { ok: false, message: t("toolbox.common.unreadable"), status: 0 };
  }

  const comments: PageComment[] = [];
  for (const row of rows) {
    const comment = parseComment(row);
    if (comment !== null) comments.push(comment);
  }
  const features = parseFeatures(record === null ? null : record["features"]);
  const currentVersion = record === null ? null : readString(record, "currentVersion");
  const favorite = record === null || typeof record["favorite"] !== "boolean" ? null : record["favorite"];
  return { ok: true, value: { viewer, comments, features, currentVersion, favorite } };
}

/**
 * お気に入りの付け外し。一覧の行・サイドバーと同じ口（`/api/workspace`）で、本人の名乗りはサーバーが cookie から採る。
 * 成功しても何も返さない（答えは次の読み込み直しで `favorite` に載る）。
 */
export async function saveFavorite(pageSlug: string, selected: boolean): Promise<ApiResult<null>> {
  const result = await send("/api/workspace", {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify({ action: "favorite", page: pageSlug, selected }),
  });
  return result.ok ? { ok: true, value: null } : result;
}

function parseOutcomeState(value: unknown): OutcomeState | null {
  return OUTCOME_STATES.find((state) => state === value) ?? null;
}

function parseOutcome(value: unknown): CommentOutcome | null {
  const record = toRecord(value);
  if (record === null) return null;
  const commentId = readString(record, "commentId");
  const thenText = readString(record, "thenText");
  const state = parseOutcomeState(record["state"]);
  if (commentId === null || thenText === null || state === null) return null;
  const nowText = readString(record, "nowText");
  const changedBy = readString(record, "changedBy");
  const changedAt = readString(record, "changedAt");
  return {
    commentId,
    state,
    thenText,
    nowText: nowText !== null && nowText.length > 0 ? nowText : null,
    changedBy: changedBy !== null && changedBy.length > 0 ? changedBy : null,
    changedAt: changedAt !== null && changedAt.length > 0 ? changedAt : null,
  };
}

/**
 * コメントが付いたときの文と、指定した版のときの文。
 *
 * `to` を省略すると、いま出している版と突き合わせる。
 * 読めなければ空。物語が出せなくてもコメントそのものは読めるので、
 * 失敗を画面の断りにしない（呼ぶ側が黙って空にする）。
 */
export async function loadOutcomes(
  pageSlug: string,
  toVersion?: string,
): Promise<ApiResult<CommentOutcome[]>> {
  const params = new URLSearchParams({ page: pageSlug });
  if (toVersion !== undefined && toVersion.length > 0) params.set("to", toVersion);
  const result = await send(`${commentsEndpoint}/outcomes?${params.toString()}`, {
    method: "GET",
    cache: "no-store",
  });
  if (!result.ok) return result;

  const record = toRecord(result.value);
  const rows = record === null ? null : record["outcomes"];
  if (!Array.isArray(rows)) {
    return { ok: true, value: [] };
  }

  const outcomes: CommentOutcome[] = [];
  for (const row of rows) {
    const outcome = parseOutcome(row);
    if (outcome !== null) outcomes.push(outcome);
  }
  return { ok: true, value: outcomes };
}

/**
 * このページを見たことを控えてもらう（会社の人のときだけ呼ぶ）。
 *
 * **投げっぱなし。** 返ってくるものは何も使わないし、失敗しても読む人の画面では
 * 何も起きない（見ることそのものを、控えの都合で止めない）。
 * 送るのはページの呼び名だけで、台帳の目印は持たない——受ける側が門を通して引き当てる。
 */
export async function recordView(pageSlug: string): Promise<void> {
  await send("/api/views", {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify({ page: pageSlug }),
  });
}

export type NewComment = {
  pageSlug: string;
  parentId: string | null;
  quote: string | null;
  quoteContext: QuoteContext | null;
  body: string;
  kind: CommentKind;
  priority: CommentPriority;
};

function pickComment(result: ApiResult<unknown>): ApiResult<PageComment> {
  if (!result.ok) return result;
  const record = toRecord(result.value);
  const comment = record === null ? null : parseComment(record["comment"]);
  if (comment === null) return { ok: false, message: t("toolbox.common.unreadable"), status: 0 };
  return { ok: true, value: comment };
}

export async function createComment(input: NewComment): Promise<ApiResult<PageComment>> {
  return pickComment(
    await send(commentsEndpoint, {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify(input),
    }),
  );
}

export type CommentChanges = {
  body?: string;
  priority?: CommentPriority;
  resolved?: boolean;
};

export async function patchComment(
  id: string,
  changes: CommentChanges,
): Promise<ApiResult<PageComment>> {
  return pickComment(
    await send(`${commentsEndpoint}/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: JSON_HEADERS,
      body: JSON.stringify(changes),
    }),
  );
}

export async function deleteComment(id: string): Promise<ApiResult<unknown>> {
  return send(`${commentsEndpoint}/${encodeURIComponent(id)}`, { method: "DELETE" });
}

/**
 * まとめて解決にする / まとめて未解決に戻す。
 *
 * 1 件ずつの口を何度も叩かない（途中で失敗すると半分だけ動いた状態で止まる）。
 * 返るのは動いた件数だけで、動いたあとの中身は一覧を引き直して受け取る。
 */
export async function resolveComments(
  pageSlug: string,
  ids: readonly string[],
  resolved: boolean,
): Promise<ApiResult<number>> {
  const result = await send(commentsEndpoint, {
    method: "PATCH",
    headers: JSON_HEADERS,
    body: JSON.stringify({ pageSlug, ids: [...ids], resolved }),
  });
  if (!result.ok) return result;
  const record = toRecord(result.value);
  const changed = record === null ? null : record["changed"];
  return { ok: true, value: typeof changed === "number" ? changed : 0 };
}

function parseVersion(value: unknown): PageVersion | null {
  const record = toRecord(value);
  if (record === null) return null;
  const sha = readString(record, "sha");
  const committedAt = readString(record, "committedAt");
  if (sha === null || committedAt === null) return null;
  const count = record["changeCount"];
  const number = record["number"];
  return {
    sha,
    shortSha: readString(record, "shortSha") ?? sha.slice(0, 7),
    number: typeof number === "number" && Number.isInteger(number) && number > 0 ? number : null,
    authorName: readString(record, "authorName") ?? t("toolbox.api.unknownAuthor"),
    committedAt,
    message: readString(record, "message") ?? "",
    changeCount: typeof count === "number" ? count : null,
  };
}

/**
 * いちばん新しい 1 版（現在地の行の「いつ・何版目」）。版が無ければ null。
 * 門と形は版の一覧とまったく同じ窓口で、運ぶ行だけを 1 つに絞る。
 */
export async function loadLatestVersion(pageSlug: string): Promise<ApiResult<PageVersion | null>> {
  const result = await send(`/api/history?page=${encodeURIComponent(pageSlug)}&latest=1`, {
    method: "GET",
    cache: "no-store",
  });
  if (!result.ok) return result;
  const record = toRecord(result.value);
  const rows = record === null ? null : record["versions"];
  if (!Array.isArray(rows)) return { ok: false, message: t("toolbox.common.unreadable"), status: 0 };
  return { ok: true, value: rows.length === 0 ? null : parseVersion(rows[0]) };
}

/**
 * ログアウトの合言葉（Auth.js の CSRF の札・`/api/auth/csrf`）。
 *
 * 現在地の行の顔から開くメニューの「ログアウト」は、サイドバーのものと同じ Auth.js の口
 * （`POST /api/auth/signout`）へ form で送る。あの口は合言葉が無いと受けないので、押したときに 1 つ取る。
 * 送るのは form（画面ごと移る）で、ここは札を取るだけ。取れなければログアウトはしない（半端な状態を作らない）。
 */
export async function loadSignOutToken(): Promise<ApiResult<string>> {
  const result = await send("/api/auth/csrf", { method: "GET", cache: "no-store" });
  if (!result.ok) return result;
  const record = toRecord(result.value);
  const token = record === null ? null : readString(record, "csrfToken");
  if (token === null || token.length === 0) return { ok: false, message: t("toolbox.common.unreadable"), status: 0 };
  return { ok: true, value: token };
}

/** 版の一覧と、「これより前にもまだ版があるか」。 */
export type LoadedVersions = { versions: PageVersion[]; more: boolean };

/** そのページの版の一覧（新しい順）。 */
export async function loadVersions(pageSlug: string): Promise<ApiResult<LoadedVersions>> {
  const result = await send(`/api/history?page=${encodeURIComponent(pageSlug)}`, {
    method: "GET",
    cache: "no-store",
  });
  if (!result.ok) return result;

  const record = toRecord(result.value);
  const rows = record === null ? null : record["versions"];
  if (!Array.isArray(rows)) {
    return { ok: false, message: t("toolbox.common.unreadable"), status: 0 };
  }

  const versions: PageVersion[] = [];
  for (const row of rows) {
    const version = parseVersion(row);
    if (version !== null) versions.push(version);
  }
  return { ok: true, value: { versions, more: record !== null && record["more"] === true } };
}

function parseAnchor(value: unknown): RedlineAnchor | null {
  const record = toRecord(value);
  if (record === null) return null;
  const head = readString(record, "head");
  if (head === null) return null;
  return {
    head,
    tail: readString(record, "tail"),
    before: readString(record, "before") ?? "",
    after: readString(record, "after") ?? "",
  };
}

function parseChange(value: unknown): RedlineChange | null {
  const record = toRecord(value);
  if (record === null) return null;

  const index = record["index"];
  const kind = readString(record, "kind");
  const place = readString(record, "place");
  const anchor = parseAnchor(record["anchor"]);
  if (typeof index !== "number" || anchor === null) return null;
  if (kind !== "add" && kind !== "del" && kind !== "title") return null;
  if (place !== "wrap" && place !== "after" && place !== "before" && place !== "none") return null;

  return {
    index,
    kind,
    text: readString(record, "text") ?? "",
    block: record["block"] === true,
    place,
    anchor,
  };
}

function parsePaths(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const paths: string[] = [];
  for (const row of value) if (typeof row === "string") paths.push(row);
  return paths;
}

function parseRedline(value: unknown): RedlineDiff | null {
  const record = toRecord(value);
  if (record === null) return null;
  const rows = record["changes"];
  if (!Array.isArray(rows)) return null;

  const changes: RedlineChange[] = [];
  for (const row of rows) {
    const change = parseChange(row);
    if (change !== null) changes.push(change);
  }

  const images = toRecord(record["images"]);
  return {
    changes,
    identical: record["identical"] === true,
    coarse: record["coarse"] === true,
    addedCount: typeof record["addedCount"] === "number" ? record["addedCount"] : 0,
    removedCount: typeof record["removedCount"] === "number" ? record["removedCount"] : 0,
    images: {
      added: parsePaths(images === null ? null : images["added"]),
      removed: parsePaths(images === null ? null : images["removed"]),
    },
  };
}

/** 2 つの版の赤入れ（どこに何を足す / 挿し戻すか）。 */
export async function loadRedline(
  pageSlug: string,
  from: string,
  to: string,
): Promise<ApiResult<RedlineDiff>> {
  const query = new URLSearchParams({ page: pageSlug, from, to });
  const result = await send(`/api/history?${query.toString()}`, {
    method: "GET",
    cache: "no-store",
  });
  if (!result.ok) return result;

  const record = toRecord(result.value);
  const diff = record === null ? null : parseRedline(record["diff"]);
  if (diff === null) return { ok: false, message: t("toolbox.common.unreadable"), status: 0 };
  return { ok: true, value: diff };
}

export type OriginPreview = {
  path: string;
  cited: { sha: string; at: string | null };
  head: { sha: string; at: string | null };
  diff: RedlineDiff;
};

function parseOriginSide(value: unknown): { sha: string; at: string | null } | null {
  const record = toRecord(value);
  if (record === null) return null;
  const sha = readString(record, "sha");
  if (sha === null) return null;
  return { sha, at: readString(record, "at") };
}

/**
 * 出典の原本と GitHub の最新の差分。履歴の口は使わない
 * （Git の SHA はページの版ではない）。
 */
export async function loadOriginDiff(pageSlug: string): Promise<ApiResult<OriginPreview>> {
  const result = await send(`/api/pages/origin/diff?page=${encodeURIComponent(pageSlug)}`, {
    method: "GET",
    cache: "no-store",
  });
  if (!result.ok) return result;

  const record = toRecord(result.value);
  if (record === null) return { ok: false, message: t("toolbox.common.unreadable"), status: 0 };
  const path = readString(record, "path");
  const cited = parseOriginSide(record["cited"]);
  const head = parseOriginSide(record["head"]);
  const diff = parseRedline(record["diff"]);
  if (path === null || cited === null || head === null || diff === null) {
    return { ok: false, message: t("toolbox.common.unreadable"), status: 0 };
  }
  return { ok: true, value: { path, cited, head, diff } };
}

// ---------------------------------------------------------------------------
// ページの本文を直す（取り寄せと保存）
// ---------------------------------------------------------------------------

/**
 * 直すために取り寄せた本文。
 *
 * `html` が保存の土台（保管庫にあるまま）、`previewHtml` が見たまま確かめる用
 * （`<base>` と vendor の差し替え済み）。**2 つを取り違えない**——preview を保存すると
 * 配信時の差し込みが正本に焼き付き、素材の行き先がページの引っ越しに付いていけなくなる。
 */
export type EditSource = {
  pageSlug: string;
  html: string;
  previewHtml: string;
  /** いま出ている版。保存のときに送り返して、すれ違いを見つけてもらう */
  baseVersionId: string | null;
  title: string;
};

export async function loadEditSource(pageSlug: string): Promise<ApiResult<EditSource>> {
  const result = await send(`/api/pages/edit?page=${encodeURIComponent(pageSlug)}`, {
    method: "GET",
    cache: "no-store",
  });
  if (!result.ok) return result;

  const record = toRecord(result.value);
  const html = record === null ? null : readString(record, "html");
  const previewHtml = record === null ? null : readString(record, "previewHtml");
  if (record === null || html === null || previewHtml === null) {
    return { ok: false, message: t("toolbox.common.unreadable"), status: 0 };
  }
  return {
    ok: true,
    value: {
      pageSlug: readString(record, "pageSlug") ?? pageSlug,
      html,
      previewHtml,
      baseVersionId: readString(record, "baseVersionId"),
      title: readString(record, "title") ?? "",
    },
  };
}

/** 保存の結果。unchanged は「中身が前と同じで、新しい版を積まなかった」。 */
export type EditSaved = {
  versionId: string;
  versionNumber: number | null;
  unchanged: boolean;
};

export async function saveEdit(input: {
  pageSlug: string;
  html: string;
  deckAppearance?: DeckOverrides;
  deckCustomization?: DeckCustomization;
  baseVersionId: string;
  message: string;
}): Promise<ApiResult<EditSaved>> {
  const result = await send("/api/pages/edit", {
    method: "PUT",
    headers: JSON_HEADERS,
    body: JSON.stringify({
      page: input.pageSlug,
      html: input.html,
      protocol:2,
      ...(input.deckAppearance ? { deckAppearance: input.deckAppearance } : {}),
      ...(input.deckCustomization ? { deckCustomization: input.deckCustomization } : {}),
      baseVersionId: input.baseVersionId,
      message: input.message,
    }),
  });
  if (!result.ok) return result;

  const record = toRecord(result.value);
  const versionId = record === null ? null : readString(record, "versionId");
  if (record === null || versionId === null) {
    return { ok: false, message: t("toolbox.common.unreadable"), status: 0 };
  }
  const versionNumber = record["versionNumber"];
  return {
    ok: true,
    value: {
      versionId,
      versionNumber: typeof versionNumber === "number" ? versionNumber : null,
      unchanged: record["unchanged"] === true,
    },
  };
}

// ---------------------------------------------------------------------------
// 共有範囲（このページを誰に見せるか）
// ---------------------------------------------------------------------------

/** 選べる閲覧グループ 1 つ。 */
export type AccessGroup = { id: string; name: string };

/**
 * 許可 1 件の役割。`owner`（共同の作った人）は、このページの共有も触れる。
 *
 * 決めるのはサーバーだけ。画面はここに入ってきた値をそのまま出すだけで、
 * 誰が共有を触れるかを数え直さない。
 */
export type GrantRole = "viewer" | "owner";

/**
 * すでに出してある許可 1 件。
 *
 * 人に出したものにはメールアドレスが入る。**この道具でアドレスが字になるのはここだけ**で、
 * 応答が返ってくるのも社内ページの持ち主と管理者に限られている（サーバー側の決め）。
 */
export type AccessGrant = {
  id: string;
  kind: "member" | "group";
  memberEmail: string | null;
  groupId: string | null;
  groupName: string | null;
  role: GrantRole;
  /**
   * 見ている人自身に出した許可か。**立てるのはサーバーだけ。**
   *
   * 画面はこれを見て、自分の行から「閲覧に戻す」「取り消す」を落とす。
   * 応答に見ている人のアドレスは入っていないので、ここで照合し直すことはできない
   * （＝画面側が答えをもう 1 つ持つことがない）。
   */
  mine: boolean;
};

/**
 * まだ答えていない「見せてほしい」1 件。
 *
 * 名前だけでは同姓同名を取り違えるので、アドレスも一緒に受ける。
 * 出してよい相手は許可の一覧とまったく同じ（持ち主と管理者、社内ページのみ）。
 */
export type AccessRequest = {
  id: string;
  requesterEmail: string;
  requesterName: string | null;
  createdAt: string;
};

/**
 * ページの見せ方。**見える人の広さの順**に並んでいる。
 *
 *     restricted ＜ internal ＜ public
 *       名簿の人      社内の全員    誰でも
 */
export type AccessScope = "restricted" | "internal" | "public";

export type PageAccessView = {
  /**
   * いまの見せ方。**旗を 2 つ持たない**（同じ 1 つのことを 2 つの真偽で持つと、
   * 食い違った状態を画面の側で作れてしまう）。
   */
  scope: AccessScope;
  /**
   * 見せ方を、この板から変えられるページか。
   *
   * **画面で数え直さない。** 公開として投稿したページは動かせないので、
   * 判断をこちらに持たせると「押せるのに断られるボタン」が生まれる。
   */
  switchable: boolean;
  grants: AccessGrant[];
  groups: AccessGroup[];
  requests: AccessRequest[];
};

function parseGrant(value: unknown): AccessGrant | null {
  const record = toRecord(value);
  if (record === null) return null;
  const id = readString(record, "id");
  const kind = readString(record, "granteeKind");
  if (id === null) return null;
  if (kind !== "member" && kind !== "group") return null;
  return {
    id,
    kind,
    memberEmail: readString(record, "memberEmail"),
    groupId: readString(record, "groupId"),
    groupName: readString(record, "groupName"),
    /* 役割は後から足した欄。読めない応答は、いちばん狭いほう（見るだけ）に倒す */
    role: readString(record, "role") === "owner" ? "owner" : "viewer",
    /* 自分の行かどうかも後から足した欄。読めなければ「自分ではない」に倒す
       （倒した先は、押しても入口が断るほう。押せないボタンが出るだけで力は増えない） */
    mine: record["mine"] === true,
  };
}

function parseRequest(value: unknown): AccessRequest | null {
  const record = toRecord(value);
  if (record === null) return null;
  const id = readString(record, "id");
  const requesterEmail = readString(record, "requesterEmail");
  const createdAt = readString(record, "createdAt");
  if (id === null || requesterEmail === null || createdAt === null) return null;
  return { id, requesterEmail, requesterName: readString(record, "requesterName"), createdAt };
}

function parseAccess(value: unknown): PageAccessView | null {
  const record = toRecord(value);
  if (record === null) return null;
  const rows = record["permissions"];
  const choices = record["groups"];
  if (!Array.isArray(rows) || !Array.isArray(choices)) return null;

  const grants: AccessGrant[] = [];
  for (const row of rows) {
    const grant = parseGrant(row);
    if (grant !== null) grants.push(grant);
  }

  const groups: AccessGroup[] = [];
  for (const row of choices) {
    const item = toRecord(row);
    if (item === null) continue;
    const id = readString(item, "id");
    const name = readString(item, "name");
    if (id === null || name === null) continue;
    groups.push({ id, name });
  }
  /* 申し出は後から足した欄。古い応答には入っていないので、無ければ 0 件として読む */
  const requests: AccessRequest[] = [];
  const asked = record["requests"];
  if (Array.isArray(asked)) {
    for (const row of asked) {
      const request = parseRequest(row);
      if (request !== null) requests.push(request);
    }
  }
  // 知らない見せ方は受け取らない（読めなければ「社内の全員」に倒す。いちばん普通の姿）
  const named = record["scope"];
  const scope: AccessScope =
    named === "restricted" || named === "public" ? named : "internal";
  return { scope, switchable: record["switchable"] === true, grants, groups, requests };
}

/**
 * いまの共有範囲。
 *
 * 通るのは持ち主と管理者だけで、それ以外には「そんなページは無い」が返る。
 * 誰が触ってよいかをここで数え直さない（答えを 2 つ持たない）。
 */
export async function loadPageAccess(pageSlug: string): Promise<ApiResult<PageAccessView>> {
  const result = await send(`/api/pages/access?page=${encodeURIComponent(pageSlug)}`, {
    method: "GET",
    cache: "no-store",
  });
  if (!result.ok) return result;

  const view = parseAccess(result.value);
  if (view === null) return { ok: false, message: t("toolbox.common.unreadable"), status: 0 };
  return { ok: true, value: view };
}

/**
 * 共有範囲の書き換え。
 *
 * 送るのは「こうなっていてほしい」姿（見せる相手の**全部**）で、増やす / 減らすの指図ではない。
 * 触っていないものは省く（省いたぶんは今のまま）。指図の形にすると、画面を 2 枚開いて
 * 片方で消したときに、もう片方の「1 件足す」が古い並びごと書き戻してしまう。
 */
export type AccessChanges = {
  /**
   * 望みの見せ方。どこからどこへでも 1 手で動く。
   *
   * 旗 2 つ（制限を付けるか / 公開するか）で送っていたころは、同じ 1 つのことを
   * 2 通りで表していたため、混ざらないための歯止めが要り、そのぶん
   * 「名簿で絞った状態から社外へは直に動かせない」という遠回りが人に見えていた。
   */
  scope?: AccessScope;
  members?: string[];
  groups?: string[];
  /**
   * 申し出 1 件への返事。
   *
   * ほかの 3 つと**混ぜて送らない**（サーバーは混ざっていたら断る）。
   * 承認は名簿に 1 人足すので、同じ通信に古い名簿が乗っていると、
   * どちらを後にしても片方が消える。
   */
  answer?: { id: string; approved: boolean };
  /**
   * 許可 1 件の役割の付け替え。
   *
   * これも単独で送る。名簿の並びと混ぜると、その通信の中で消えた行の役割を
   * 変えることになり、どちらを後にしても結果が変わる。
   */
  role?: { id: string; to: GrantRole };
};

export async function savePageAccess(
  pageSlug: string,
  changes: AccessChanges,
): Promise<ApiResult<PageAccessView>> {
  const result = await send("/api/pages/access", {
    method: "PUT",
    headers: JSON_HEADERS,
    body: JSON.stringify({ pageSlug, ...changes }),
  });
  if (!result.ok) return result;

  const view = parseAccess(result.value);
  if (view === null) return { ok: false, message: t("toolbox.common.unreadable"), status: 0 };
  return { ok: true, value: view };
}

/** 原本の鮮度。出典が無いか、すでに取り込み済みならボタンは出さない。GitHub で比べられないときは出典があれば出す。 */
export type OriginFreshness = {
  hasSource: boolean;
  stale: boolean;
  checked: boolean;
  path: string | null;
  headDate: string | null;
  /**
   * いま出ている本文が原本と違うか（＝投稿のあとにブラウザで直された分があるか）。
   * 比べられるのは HTML そのものが原本の deck だけ。比べられなければ null。
   */
  edited: boolean | null;
};

/** 道具箱が「原本を取り込む」を出してよいか。 */
export function originShouldOffer(value: OriginFreshness): boolean {
  if (value.path === null) return false;
  if (value.stale) return true;
  return value.hasSource && !value.checked;
}

export async function loadOriginFreshness(pageSlug: string): Promise<ApiResult<OriginFreshness>> {
  const result = await send(`/api/pages/origin?page=${encodeURIComponent(pageSlug)}`, {
    method: "GET",
    cache: "no-store",
  });
  if (!result.ok) return result;
  const record = toRecord(result.value);
  if (record === null) return { ok: false, message: t("toolbox.common.unreadable"), status: 0 };
  return {
    ok: true,
    value: {
      hasSource: record["hasSource"] === true,
      stale: record["stale"] === true,
      checked: record["checked"] === true,
      path: readString(record, "path"),
      headDate: readString(record, "headDate"),
      edited: typeof record["edited"] === "boolean" ? record["edited"] : null,
    },
  };
}

export type OriginRefresh = {
  agentId: string;
  url: string;
};

function parseOriginRefresh(value: unknown): OriginRefresh | null {
  const record = toRecord(value);
  if (record === null) return null;
  const agentId = readString(record, "agentId");
  const url = readString(record, "url");
  if (agentId === null || url === null) return null;
  return { agentId, url };
}

/**
 * 原本からの取り込みを始める。
 *
 * 二重押しの 409 は、既存の実行が返っていれば成功として扱う
 * （同じ取り込みをもう 1 本立てない）。
 */
export async function startOriginRefresh(pageSlug: string): Promise<ApiResult<OriginRefresh>> {
  const result = await send(
    "/api/pages/origin/refresh",
    {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify({ page: pageSlug }),
    },
    [409],
  );
  if (!result.ok) return result;
  const parsed = parseOriginRefresh(result.value);
  if (parsed === null) {
    const record = toRecord(result.value);
    const message = record === null ? null : readString(record, "error");
    return {
      ok: false,
      message: message ?? t("toolbox.common.unreadable"),
      status: 409,
    };
  }
  return { ok: true, value: parsed };
}

export type OriginRefreshStatus = {
  status: "running" | "finished" | "failed";
  url: string | null;
};

export async function loadOriginRefreshStatus(
  pageSlug: string,
  agentId: string,
): Promise<ApiResult<OriginRefreshStatus>> {
  const result = await send(
    `/api/pages/origin/refresh?page=${encodeURIComponent(pageSlug)}&agent=${encodeURIComponent(agentId)}`,
    { method: "GET", cache: "no-store" },
  );
  if (!result.ok) return result;
  const record = toRecord(result.value);
  if (record === null) return { ok: false, message: t("toolbox.common.unreadable"), status: 0 };
  const status = record["status"];
  if (status !== "running" && status !== "finished" && status !== "failed") {
    return { ok: false, message: t("toolbox.common.unreadable"), status: 0 };
  }
  return { ok: true, value: { status, url: readString(record, "url") } };
}
