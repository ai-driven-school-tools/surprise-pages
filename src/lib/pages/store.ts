import { createDeckCollaboration, deckCollaborationSchema, type DeckCollaboration } from "../deck/edit/collaboration";
import { prepareDeckEdit } from "../deck/edit/source";
import { CLASSIFIER_VERSION, classifyDocument, indexDocument } from "./catalog";
import { inheritDeckOverrides, readDeckDesignHtml } from "../deck/design/html";
import { assertSafeDocument } from "../html/document-security";
import { htmlScriptModeOf } from "../organization/profile";
import type { HtmlScriptMode } from "../organization/settings";
import { documentLimitMb, isPersonalEdition, mayPublish } from "../settings/site-settings";
import { getDb, orgDb } from "@/lib/db/database";
import type { OrganizationScope } from "../organization/scope";
import { readPageBatches } from "./batches";
import { inheritDeckCustomizations, readDeckCustomizationHtml } from "../deck/edit/customization-html";
import { parsePageSlug } from "../comments/comments";
import { isSafeSlug, urlPrefixFor, VISIBILITIES, type PageEntry, type Visibility } from "./content";
import { redlineDiff } from "../html/diff";
import { titleOf } from "../html/text";
import { displayNameOf } from "../identity/member-name";
import { dropPageDelivery, warmPageHtml } from "./cache";
import { computeVersionId, isVersionId } from "../revisions/version-id";
import type { PageVersion, SlugVisibility } from "../comments/types";
import type { DeckEditReceipt } from "../deck/edit/service";
import type { NoteReceipt } from "../notes/store";
import { defaultTranslate } from "../i18n/default";
import { LocalizedError } from "../i18n/errors";
import type { MessageKey, MessageParams } from "../i18n/messages/types";
import type { Translate } from "../i18n/translate";

/**
 * ページ本文の保管庫の読み書き（pages / page_revisions）。
 *
 * 版は積むだけ。直しは「新しい版」として上に積み、前の版には手を触れない
 * （書き換え・削除はデータベース側の番人が拒否する。0004_pages.sql）。
 * 消すときも行は消さず「消した印」を立てるだけで、本文・素材・版はそのまま残る。
 */

const PAGES_TABLE = "pages";
const REVISIONS_TABLE = "page_revisions";

const PAGE_COLUMNS =
  "id, page_slug, visibility, title, current_version_id, created_by, deleted_at, created_at, updated_at, recording_protected";

/**
 * 版の列（本文なし）。一覧・履歴はこちらだけを引く。
 *
 * **本文（html）を一覧のクエリに混ぜない。** 本文は 1 枚で数百 KB あるので、
 * 履歴で 20 本引くと数 MB を運んで捨てることになる。画面に出すのは
 * 「誰が・いつ・何件直したか」だけで、本文は開いた 1 枚しか要らない。
 */
const REVISION_COLUMNS =
  "id, page_id, version_number, version_id, parent_version_id, " +
  "author_email, author_name, message, change_count, created_at";

/** 版の列（本文つき）。1 件だけ取り出すときにしか使わない。 */
const REVISION_COLUMNS_WITH_HTML = `${REVISION_COLUMNS}, html`;

/**
 * 台帳のページ 1 行。
 *
 * **これを持っていること自体は「見てよい」を意味しない。** 可否は
 * src/lib/access/access.ts の `canViewPage`（入口向けには `openPage`）だけが決める。
 * 本文を取り出す口（`readHtmlOf` / `readRevisionHtmlOf`）がこの形を要るようにしてあるのは、
 * 門を通らずに本文へ手が届く道を残さないため。
 */
export type StoredPage = {
  id: string;
  /**
   * このページを引き当てた組織。ページの子（版・コメント・許可…）を読み書きするときは
   * この組織で絞った口を使う。行は組織で絞った口からしか引かないので、行の組織の印と必ず同じ。
   */
  organization: OrganizationScope;
  recordingProtected?: boolean;
  pageSlug: string;
  /** 台帳の見せ方（3 通り）。呼び名の頭の文字とは別物 */
  visibility: Visibility;
  title: string;
  currentVersionId: string | null;
  createdBy: string | null;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

/** 版 1 つ。画面に出す形（PageVersion）へは toPageVersion で移す。 */
export type StoredRevision = {
  versionId: string;
  parentVersionId: string | null;
  versionNumber: number;
  authorEmail: string;
  authorName: string | null;
  message: string;
  changeCount: number | null;
  createdAt: string;
};

export type RevisionAuthor = { email: string; name: string | null };

export type CommitInput = {
  /** 積む組織。入口が決めた組織（src/lib/organization/scope.ts）。呼び名はこの組織の中で引く */
  organization: OrganizationScope;
  /** ページの呼び名。`<見せ方>/<場所>` */
  pageSlug: string;
  html: string;
  /** 人に読ませる一言。記号や番号は呼び出し元で落としてから渡す */
  message: string;
  author: RevisionAuthor;
  /**
   * 「選んだ人だけ」で作るか。効くのは**ページを新しく作るときだけ**。
   *
   * すでにあるページの見せ方はここでは変えない（変える口は共有範囲の画面ただ 1 つ）。
   * 投稿のついでに見せ方が切り替わると、「全員に見せていたページが投稿で closed になった」
   * 「制限したはずが投稿で開いた」という静かな事故がどちら向きにも起きるため、
   * すでにあるページに true を渡されたら、restricted のとき以外は断る（下の分岐を参照）。
   */
  restricted?: boolean;
  /**
   * 土台にした版の目印。渡されたら、頭の版がこれと違う瞬間に積むのをやめる
   * （ブラウザ編集のすれ違い検知）。投稿（CLI）は渡さない＝今までどおり。
   */
  expectedHead?: string | null;
  /** 投稿時だけ保存済みの着せ替えを引き継ぐ。本文編集・履歴の復元では指定しない。 */
  preserveDeckAppearance?: boolean;
  /** Stored in the same append-only row as the edit, so a lost reply is safely retryable. メモ帳の保存も同じ列に受領記録を書く（src/lib/notes/store.ts）。 */
  editReceipt?: DeckEditReceipt | NoteReceipt;
  collaboration?: DeckCollaboration;
  /** Trusted server-only operation receipts for one atomic collaborative save. */
  receiptGroup?:import("../deck/edit/receipts").DeckReceiptGroup;
  /** Internal editor snapshot. The atomic database function still compares the
   * actual head under its row lock; this only avoids fetching the same HTML twice. */
  observedHead?:{pageId:string;html:string;versionId:string;versionNumber:number;collaboration?:DeckCollaboration};
  /** Metadata already loaded by the current request's shared edit gate. This is
   * not a permission cache; only a collaborative receipt may use it, and the DB
   * checks the immutable page id and slug again while holding the page lock. */
  authorizedPage?:StoredPage;
};

export type CommitResult = {
  versionId: string;
  versionNumber: number;
  changeCount: number | null;
  title: string;
  /** 中身が前と同じで、新しい版を積まなかったか。CLI が「変わりありません」と言うのに使う */
  unchanged: boolean;
  /**
   * 台帳の行そのもの。許可の名簿に足すとき（id）と、応答が「選んだ人だけ」を
   * 言い当てるとき（visibility）に使う。**見せ方はコピーで持ち出さず、行から読む**
   * （可否や見せ方の出どころを台帳の行に揃える決まり。check-gate が見ている）。
   * 行は作成・取得時点の写しだが、見せ方は投稿では変えないので古くならない。
   */
  page: StoredPage;
  /** Final stored bytes after all browser settings were inherited. Never expose directly in API responses. */
  html: string;
};

/** データベースが返したエラーを、そのまま外に漏らさずに投げ直す。 */
function fail(action: string, error: { message: string } | null): never {
  throw new Error(`ページの${action}に失敗しました: ${error?.message ?? "原因不明"}`); // i18n-keep: 内部専用の失敗（画面に届かず、窓口は固定の 500 の断りだけを返す）
}

/** 同じものが 2 つ入ろうとしたときにデータベースが返す番号（PostgreSQL）。 */
const UNIQUE_VIOLATION = "23505";

function isUniqueViolation(error: unknown): boolean {
  const record = toRecord(error);
  return record !== null && readString(record, "code") === UNIQUE_VIOLATION;
}

/**
 * 名前が別のページの置き場所とぶつかっている。入り口はこれを 400 で返す。
 *
 * データベースの都合ではなく人の打ち間違いなので、待っても直らない。
 * 「しばらくしてからもう一度」と読める 500 に混ぜない。
 */
/**
 * 「選んだ人だけ」で投稿しようとしたが、その場所にはすでに別の見せ方のページがある。
 *
 * 入り口はこれを 400 で返す。人の指定の食い違いなので、待っても直らない。
 * ここで黙って通す選択肢は 2 つともとれない——見せ方を切り替えれば「全員に見せていた
 * ページが投稿で closed になる」、無視すれば「制限したつもりの本文が全員に見える」。
 * どちらも静かな事故なので、止めて言葉で返す。
 */
export class RestrictedExistingPageError extends LocalizedError {
  constructor(pageSlug: string) {
    super("server.pagesStore.restrictedExisting", { page: pageSlug });
    this.name = "RestrictedExistingPageError";
  }
}

export class SlugConflictError extends LocalizedError {
  readonly pageSlug: string;
  readonly conflict: string;

  constructor(pageSlug: string, conflict: string) {
    const { key, params } = slugConflictText(pageSlug, conflict);
    super(key, params);
    this.name = "SlugConflictError";
    this.pageSlug = pageSlug;
    this.conflict = conflict;
  }
}

/**
 * 同じページへ 2 本の投稿が同時に走って、版番号がぶつかった。
 *
 * 打ち直せば直る（同じ本文なら版は積まれず、目印の貼り替えだけで終わる）ので、
 * それが分かる言い方で返す。データベースの生の文言を出さない。
 */
export class RevisionRaceError extends LocalizedError {
  constructor() {
    super("server.pagesStore.revisionRace");
    this.name = "RevisionRaceError";
  }
}

/**
 * 土台にした版と、いまの頭の版が食い違っている。
 *
 * ブラウザ編集で、取り寄せてから保存するまでの間に別の直しが入ったとき。
 * ここで黙って積むと、先に入った直しがそっくり消える。
 */
export class StaleBaseError extends LocalizedError {
  constructor() {
    super("server.pagesStore.staleBase");
    this.name = "StaleBaseError";
  }
}

/**
 * スライドの保存設定を引き継いだら、本文が上限を超えた。打ち直し（原稿を小さくする）で直るので、
 * 投稿の入口は 400 で返す。保存設定を引き継ぐのは投稿の入口（`preserveDeckAppearance`）だけ。
 */
export class InheritedDeckTooLargeError extends LocalizedError {
  constructor(limitMb: number) {
    super("server.pagesStore.deckTooLarge", { limit: limitMb });
    this.name = "InheritedDeckTooLargeError";
  }
}

/** 素の値（データベースの行）を、型を壊さずに 1 段だけ開く。 */
function toRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const record: Record<string, unknown> = { ...value };
  return record;
}

function readString(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  return typeof value === "string" ? value : null;
}

function readNumber(record: Record<string, unknown>, key: string): number | null {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * 台帳の見せ方の列を読み取る。**3 通りとも通す。**
 *
 * ここで restricted を弾くと、`toStoredPage` が null を返し、その行は
 * `findPage` からも一覧からも**まるごと消える**（＝制限を付けた瞬間に、
 * 所有者にも管理者にも「そんなページはありません」と出る）。
 * 知らない値だけを落とす。可否の判定はここではなく src/lib/access/access.ts が持つ。
 */
function isVisibility(value: unknown): value is Visibility {
  return VISIBILITIES.some((known) => known === value);
}

function toStoredPage(organization: OrganizationScope, row: unknown): StoredPage | null {
  const record = toRecord(row);
  if (record === null) return null;

  const id = readString(record, "id");
  const pageSlug = readString(record, "page_slug");
  const createdAt = readString(record, "created_at");
  const updatedAt = readString(record, "updated_at");
  const visibility = record["visibility"];
  if (id === null || pageSlug === null || createdAt === null || updatedAt === null) return null;
  if (!isVisibility(visibility)) return null;

  return {
    id,
    organization,
    pageSlug,
    visibility,
    title: readString(record, "title") ?? "",
    currentVersionId: readString(record, "current_version_id"),
    createdBy: readString(record, "created_by"),
    recordingProtected: record["recording_protected"] === true,
    deletedAt: readString(record, "deleted_at"),
    createdAt,
    updatedAt,
  };
}

function toStoredRevision(row: unknown): StoredRevision | null {
  const record = toRecord(row);
  if (record === null) return null;

  const versionId = readString(record, "version_id");
  const versionNumber = readNumber(record, "version_number");
  const authorEmail = readString(record, "author_email");
  const createdAt = readString(record, "created_at");
  if (versionId === null || versionNumber === null) return null;
  if (authorEmail === null || createdAt === null) return null;

  return {
    versionId,
    parentVersionId: readString(record, "parent_version_id"),
    versionNumber,
    authorEmail,
    authorName: readString(record, "author_name"),
    message: readString(record, "message") ?? "",
    changeCount: readNumber(record, "change_count"),
    createdAt,
  };
}

/**
 * 画面に出す形に移す。
 *
 * 出すのは表示名だけで、メールアドレスは渡さない（公開ページの履歴は社外の人も読む）。
 * 形そのものは src/lib/comments/types.ts の PageVersion をそのまま使う。
 * ここで似た型を作り直すと、画面側が 2 つの形を相手にすることになる。
 */
export function toPageVersion(revision: StoredRevision): PageVersion {
  return {
    sha: revision.versionId,
    shortSha: revision.versionId.slice(0, 7),
    number: revision.versionNumber,
    authorName: displayNameOf(revision.authorEmail, revision.authorName),
    committedAt: revision.createdAt,
    message: revision.message,
    changeCount: revision.changeCount,
  };
}

/**
 * ページの呼び名を、頭の文字と場所に割る。危ない呼び名はここで落ちる。
 *
 * 返る `visibility` は**呼び名の頭を読んだだけ**の 2 通り。台帳の見せ方ではない
 * （制限つきのページもここでは `internal` に見える）。可否の判定に使わない。
 */
function splitPageSlug(pageSlug: string): { slugPrefix: SlugVisibility; slug: string[] } | null {
  const page = parsePageSlug(pageSlug);
  if (page === null) return null;
  return { slugPrefix: page.slugPrefix, slug: page.slug.split("/").slice(1) };
}

export type PageRefParts = {
  /** `<呼び名の頭>/<場所>` */
  pageSlug: string;
  /** 呼び名の頭に付く文字（2 通り）。台帳の見せ方ではないので、名前も分けてある */
  slugPrefix: SlugVisibility;
  slug: string[];
};

/**
 * 送られてきた「見せ方」と「場所」を 1 つのページの指定にまとめる。
 *
 * 投稿・凍結・削除のどの入口も同じ形で受けるので、読み取りはここ 1 か所に置く。
 * 判定そのものは呼び名の SSoT（src/lib/comments/comments.ts の parsePageSlug）に任せる。
 */
export function pageRefFrom(visibility: unknown, slug: unknown): PageRefParts | null {
  if (typeof visibility !== "string" || typeof slug !== "string") return null;
  return pageRefOf(`${visibility}/${slug}`);
}

/** すでに `<見せ方>/<場所>` の形でまとまっているものから読み取る。 */
export function pageRefOf(pageSlug: unknown): PageRefParts | null {
  if (typeof pageSlug !== "string") return null;
  const page = parsePageSlug(pageSlug);
  if (page === null) return null;
  return {
    pageSlug: page.slug,
    slugPrefix: page.slugPrefix,
    slug: page.slug.split("/").slice(1),
  };
}

/**
 * 並んでいる呼び名の中から、その名前とぶつかる相手を選ぶ。
 *
 * 素材の置き場所は `<見せ方>/<呼び名>/<相対パス>` という 1 本の文字列で、
 * 片付けも凍結も前方一致で数える。だから片方の呼び名がもう片方の「下」にあると、
 * 浅い側の片付けが深い側の画像まで巻き込んで消す。
 * 置き場所の形は URL とそろえる決まり（AGENTS.md）なので変えられない。
 * 代わりに、ぶつかる名前を作らせない。
 *
 * ぶつかる条件は 2 通り:
 *   ・相手の呼び名が `<この呼び名>/` で始まる（この名前は相手の置き場所として使用中）
 *   ・この呼び名が `<相手の呼び名>/` で始まる（この名前は相手の置き場所の中）
 *
 * 同じ呼び名はぶつかりではない（同じページへの投稿）。
 */
export function collidingSlug(pageSlug: string, others: readonly string[]): string | null {
  const below = others.filter((slug) => slug.startsWith(`${pageSlug}/`)).sort();
  if (below.length > 0) return below[0];

  // 近い側（`a/b/c` なら `a/b`）から挙げる。直す相手が分かりやすい
  const above = others.filter((slug) => pageSlug.startsWith(`${slug}/`));
  return above.sort((x, y) => y.length - x.length)[0] ?? null;
}

/**
 * その呼び名を「下」に含みうる、上の呼び名の候補。深い順に並べる。
 *
 * `internal/a/b/c` なら `internal/a/b`、`internal/a`。
 * 見せ方だけ（`internal`）は 1 ページぶんにならないので数えない。
 */
export function ancestorPageSlugs(pageSlug: string): string[] {
  const parts = pageSlug.split("/");
  const ancestors: string[] = [];
  for (let depth = parts.length - 1; depth >= 2; depth -= 1) {
    ancestors.push(parts.slice(0, depth).join("/"));
  }
  return ancestors;
}

/** 見せ方を落として、人が打った呼び名の形に戻す（画面に出す言い方用）。 */
function withoutVisibility(pageSlug: string): string {
  return pageSlug.split("/").slice(1).join("/");
}

/**
 * ぶつかったときの言い方。
 *
 * 「何が起きているか」と「どうすればよいか」を必ず両方入れる。
 * 名前を断られた人が、次に何を打てばよいか分からないまま止まらないように。
 */
export function slugConflictMessage(pageSlug: string, conflict: string, t: Translate = defaultTranslate): string {
  const { key, params } = slugConflictText(pageSlug, conflict);
  return t(key, params);
}

/** ぶつかったときの言い方の鍵と差し込み。言い方は相手が上か下かの 2 通り。 */
function slugConflictText(pageSlug: string, conflict: string): { key: MessageKey; params: MessageParams } {
  const params = { here: withoutVisibility(pageSlug), other: withoutVisibility(conflict) };
  // 相手が「下」にいる = この名前は、そのページの置き場所として既に使われている
  if (conflict.startsWith(`${pageSlug}/`)) return { key: "server.pagesStore.slugTakenBelow", params };
  // 相手が「上」にいる = この名前は、別のページの置き場所の中にある
  return { key: "server.pagesStore.slugInsideAbove", params };
}

/** 呼び名の列だけを読み取る。 */
function readSlugs(rows: unknown): string[] {
  if (!Array.isArray(rows)) return [];
  const slugs: string[] = [];
  for (const row of rows) {
    const record = toRecord(row);
    const slug = record === null ? null : readString(record, "page_slug");
    if (slug !== null) slugs.push(slug);
  }
  return slugs;
}

/**
 * その置き場所の中に住んでいる、別のページの呼び名を返す（消されたものも含む）。
 *
 * 消した印が立っているページも数える。印が立っていても素材は残っているので、
 * ここで見落とすと、そのページの画像を巻き込んで消してしまう（＝復活の道が壊れる）。
 */
export async function nestedPageSlugs(organization: OrganizationScope, pageSlug: string): Promise<string[]> {
  if (splitPageSlug(pageSlug) === null) return [];

  const branch = `${pageSlug}/`;
  const { data, error } = await orgDb(organization)
    .from(PAGES_TABLE)
    .select("page_slug")
    // `_` は LIKE では「どれか 1 文字」なので、ここで取れるのは取りたいもの以上になる。
    // 取りこぼしはしないので、最後の判定は下の startsWith で文字どおりやり直す
    .like("page_slug", `${branch}%`);

  if (error !== null) fail("取得", error); // i18n-keep: 内部専用の失敗（fail の文は画面に届かず、窓口は固定の 500 の断りだけを返す）
  return readSlugs(data)
    .filter((slug) => slug.startsWith(branch))
    .sort();
}

/** 挙げた呼び名のうち、実際に置いてあるものを返す（消されたものも含む）。 */
async function selectExistingSlugs(organization: OrganizationScope, candidates: readonly string[]): Promise<string[]> {
  if (candidates.length === 0) return [];

  const { data, error } = await orgDb(organization)
    .from(PAGES_TABLE)
    .select("page_slug")
    .in("page_slug", [...candidates]);

  if (error !== null) fail("取得", error); // i18n-keep: 内部専用の失敗（fail の文は画面に届かず、窓口は固定の 500 の断りだけを返す）
  return readSlugs(data);
}

/** その名前が、別のページの置き場所とぶつかっていないか。ぶつかる相手があれば返す。 */
export async function findSlugConflict(organization: OrganizationScope, pageSlug: string): Promise<string | null> {
  if (splitPageSlug(pageSlug) === null) return null;

  const [below, above] = await Promise.all([
    nestedPageSlugs(organization, pageSlug),
    selectExistingSlugs(organization, ancestorPageSlugs(pageSlug)),
  ]);

  return collidingSlug(pageSlug, [...below, ...above]);
}

async function selectPage(organization: OrganizationScope, pageSlug: string, aliveOnly: boolean): Promise<StoredPage | null> {
  if (splitPageSlug(pageSlug) === null) return null;

  const query = orgDb(organization).from(PAGES_TABLE).select(PAGE_COLUMNS).eq("page_slug", pageSlug);
  const { data, error } = await (aliveOnly ? query.is("deleted_at", null) : query).maybeSingle();

  if (error !== null) fail("取得", error); // i18n-keep: 内部専用の失敗（fail の文は画面に届かず、窓口は固定の 500 の断りだけを返す）
  const row: unknown = data;
  return toStoredPage(organization, row);
}

/**
 * 生きているページ 1 枚。無い / 消されている なら null。
 *
 * **入口（src/app/ の下）からは直に呼ばない。** これは行を引くだけで門を通らないので、
 * ここを入口から呼ぶと制限つきのページがそのまま読めてしまう。
 * 入口が使うのは src/lib/access/access.ts の `openPage`（引くのと同時に可否を決める）。
 * 呼び忘れは tests/checks/check-gate.mjs が落とす。
 */
export async function findPage(organization: OrganizationScope, pageSlug: string): Promise<StoredPage | null> {
  return selectPage(organization, pageSlug, true);
}

/**
 * 挙げた呼び名のうち、実際にある生きているページを 1 枚。深いものを優先する。
 *
 * 素材の URL（`/internal/a/b/shot.png`）から持ち主のページを探すのに使う。
 * どこまでがページの呼び名で、どこからが相対パスかは URL からは分からないので、
 * 候補をまとめて **1 回の問い合わせ**で当てる。
 */
export async function findPageAmong(organization: OrganizationScope, candidates: readonly string[]): Promise<StoredPage | null> {
  if (candidates.length === 0) return null;

  /**
   * 消されたページも候補に含める。ここで落とすと**門ごと外れる**。
   *
   * 呼び出し元は「持ち主が見つからない = 台帳に無い置き去りの素材」とみなして、
   * 判定を飛ばして返す作りになっている。消したページをここで隠すと、
   * 名簿限定のページを消しただけで、その画像が会社の誰にでも見えるようになる。
   *
   * 消されているかどうかの答えは、拾ったうえで canViewPage に出させる（404 になる）。
   */
  const { data, error } = await orgDb(organization)
    .from(PAGES_TABLE)
    .select(PAGE_COLUMNS)
    .in("page_slug", [...candidates]);

  if (error !== null) fail("取得", error); // i18n-keep: 内部専用の失敗（fail の文は画面に届かず、窓口は固定の 500 の断りだけを返す）
  const rows: unknown = data;
  if (!Array.isArray(rows)) return null;

  /*
   * 決着の付け方は 2 段。
   *
   * 1. 深いほうが持ち主。名前の入れ子は投稿の入口で断っているが、それより前に
   *    作られた組み合わせは残りうる（浅いほうは前方一致に巻き込まれているだけ）。
   *    数えるのは**区切りの数**で、文字列の長さではない。同じ深さでも
   *    `internal/x` は `public/x` より字が多く、長さで比べると浅い側が勝ってしまう。
   * 2. 同じ深さなら、渡された並びで先にあるほうが勝つ。同じ場所に 2 通りの呼び名が
   *    立つのは、公開の URL（/public/...）を引くときだけ——公開として投稿したページと、
   *    社内として投稿してから公開に切り替えたページが、同じ場所を指しうる。
   *    どちらを出すかを保管庫の気分で決めさせない（並びを持たせるのは呼び出し側）。
   */
  const rank = new Map(candidates.map((slug, at) => [slug, at]));
  const depth = (slug: string) => slug.split("/").length;
  const order = (slug: string) => rank.get(slug) ?? Number.POSITIVE_INFINITY;

  let found: StoredPage | null = null;
  for (const row of rows) {
    const page = toStoredPage(organization, row);
    if (page === null) continue;
    if (found === null) {
      found = page;
      continue;
    }
    if (depth(page.pageSlug) > depth(found.pageSlug)) {
      found = page;
      continue;
    }
    if (
      depth(page.pageSlug) === depth(found.pageSlug) &&
      order(page.pageSlug) < order(found.pageSlug)
    ) {
      found = page;
    }
  }
  return found;
}

/** 消された行も含めて引く（再投稿で復活させるかの判定に使う）。 */
export async function findPageIncludingDeleted(organization: OrganizationScope, pageSlug: string): Promise<StoredPage | null> {
  return selectPage(organization, pageSlug, false);
}

/** その版の本文だけを取り出す。無ければ null。 */
async function selectHtml(page: StoredPage, versionId: string): Promise<string | null> {
  const { data, error } = await orgDb(page.organization)
    .from(REVISIONS_TABLE)
    .select(REVISION_COLUMNS_WITH_HTML)
    .eq("page_id", page.id)
    .eq("version_id", versionId)
    .maybeSingle();

  if (error !== null) fail("取得", error); // i18n-keep: 内部専用の失敗（fail の文は画面に届かず、窓口は固定の 500 の断りだけを返す）
  const row: unknown = data;
  const record = toRecord(row);
  return record === null ? null : readString(record, "html");
}

/**
 * いま出す版の本文。無ければ null。
 *
 * 受け取るのが呼び名ではなく**引き当て済みのページ**なのは、門を通らずに
 * 本文へ手が届く道を残さないため。入口はまず `openPage` で可否を決め、
 * 通ったときに返るページをここへ渡す。行を引き直さないので往復も 1 回減る。
 */
export async function readHtmlOf(page: StoredPage): Promise<string | null> {
  if (page.currentVersionId === null) return null;
  return selectHtml(page, page.currentVersionId);
}

/** 短い桁で指定されたときの形。40 桁ちょうどは「そのもの」なのでここには来ない。 */
const VERSION_ID_PREFIX = /^[0-9a-f]{1,39}$/i;

/**
 * 先頭の桁だけで版を引く（`?v=33f24ca` のような短い指定）。
 *
 * 探すのは**そのページの中だけ**。目印は本文から作るので、
 * 引っ越し前の版は別のページと同じ目印を持っていることがある。
 * ページを絞らずに前方一致で引くと、社内の本文が公開ページから出る道になる。
 *
 * 同じ先頭桁の版が 2 つ当たったら null を返す。どちらか片方を黙って選ぶと、
 * 頼まれたのと違う版を「その版です」として出してしまう。
 */
async function selectHtmlByPrefix(page: StoredPage, prefix: string): Promise<string | null> {
  // 16 進だけに絞ってあるので、LIKE の特別な文字（% _）は混ざりようがない
  if (!VERSION_ID_PREFIX.test(prefix)) return null;

  const { data, error } = await orgDb(page.organization)
    .from(REVISIONS_TABLE)
    .select(REVISION_COLUMNS_WITH_HTML)
    .eq("page_id", page.id)
    .like("version_id", `${prefix.toLowerCase()}%`)
    .limit(2);

  if (error !== null) fail("取得", error); // i18n-keep: 内部専用の失敗（fail の文は画面に届かず、窓口は固定の 500 の断りだけを返す）
  const rows: unknown = data;
  if (!Array.isArray(rows) || rows.length !== 1) return null;
  const record = toRecord(rows[0]);
  return record === null ? null : readString(record, "html");
}

/**
 * その版のときの本文。無ければ null。
 *
 * 版はページに紐づけて引く。目印だけで引くと、別のページの版を
 * 「このページの過去の版」として出せてしまう（社内の本文が公開ページから出る道になる）。
 *
 * 40 桁そろっていない指定も受ける。`?v=` に先頭 7 桁を貼る使い方が既にあるため。
 */
export async function readRevisionHtmlOf(
  page: StoredPage,
  versionId: string,
): Promise<string | null> {
  // 目印は必ず小文字で作る。URL に大文字で打たれても同じ版に行き着かせる
  // （入口の判定 isVersionSha は大文字も通すので、ここで揃えないと取りこぼす）
  const wanted = versionId.toLowerCase();
  if (isVersionId(wanted)) return selectHtml(page, wanted);
  return selectHtmlByPrefix(page, wanted);
}

/**
 * その版がそのページの何版目か。無ければ・短い指定で 1 つに決まらなければ null。
 *
 * 過去の版の帯（「第N版を表示しています」）に使う。本文の読み口と同じく、版は**ページに紐づけて**引き、
 * 本文は運ばない（番号だけ）。本文は控え（`rememberPageHtml`）から出ることが多いので、別に引く。
 */
export async function readVersionNumberOf(page: StoredPage, versionId: string): Promise<number | null> {
  const wanted = versionId.toLowerCase();
  const exact = isVersionId(wanted);
  if (!exact && !VERSION_ID_PREFIX.test(wanted)) return null;
  const rows = orgDb(page.organization).from(REVISIONS_TABLE).select("version_number").eq("page_id", page.id);
  const { data, error } = exact
    ? await rows.eq("version_id", wanted).limit(1)
    : await rows.like("version_id", `${wanted}%`).limit(2);

  // 引けなくても本文は出す（帯が目印の 7 桁で言うだけ）。番号のためにページごと止めない
  if (error !== null) return null;
  const found: unknown = data;
  if (!Array.isArray(found) || found.length !== 1) return null;
  const record = toRecord(found[0]);
  return record === null ? null : readNumber(record, "version_number");
}

/**
 * 生きているページを、見せ方で絞らずに新しい順で全部返す。
 *
 * 見せ方ごとに分けて引かないのは、一覧に出してよいかが**見せ方だけでは決まらない**ため
 * （制限つきは名簿を見ないと決まらない）。絞り込みは src/lib/access/access.ts の
 * `listViewablePages` が、この 1 回ぶんの結果を材料にしてやる。
 * ページ 1 枚ごとに問い合わせを増やさない（8 枚で 8 往復にしない）。
 */
export async function listAlivePages(organization: OrganizationScope, lastHint?: Promise<string | null | undefined>): Promise<StoredPage[]> {
  const db = orgDb(organization);
  const pages: StoredPage[] = [];
  let after: string | undefined;
  // いちばん後ろの目印を、最初の束と同時に聞いておく。届いた束の最後がそれと同じなら、続きは無い
  // （「空の束が返るまで読む」だと、どの画面でも最後に空を確かめる 1 往復が付いていた・docs/design/app-speed.md）。
  // 行数の上限には頼らないので、窓口が 1 回に返す数が 1,000 より少なくても取りこぼさない。
  // 画面を描く 1 回の中では、本人まわりの問い合わせとまとめて読んだ目印（lastHint）を使い、別の 1 本を投げない
  const lastOf = (): Promise<string | null> => Promise.resolve(db.from(PAGES_TABLE).select("id").is("deleted_at", null).order("id", { ascending: false }).limit(1)).then(({ data, error }) => {
    if (error !== null) return null;
    const row = Array.isArray(data) ? data[0] : null;
    return typeof row?.id === "string" ? row.id : null;
  }, () => null);
  let last: Promise<string | null> | null = lastHint === undefined ? lastOf() : lastHint.then((hint) => hint === undefined ? lastOf() : hint, () => lastOf());
  for (;;) {
    // 1 回で読む行数。保管庫の窓口が 1 回に返す上限（1,000 行）まで広げて、往復を減らす。
    // 上限より少なく返ってきても、目印（id）の続きから読み直すので取りこぼさない
    let query = db.from(PAGES_TABLE).select(PAGE_COLUMNS).is("deleted_at", null)
      .order("id", { ascending: true }).limit(1000);
    if (after) query = query.gt("id", after);
    const [{ data, error }, lastId] = await Promise.all([query, last]);
    if (error !== null) fail("一覧の取得", error); // i18n-keep: 内部専用の失敗（fail の文は画面に届かず、窓口は固定の 500 の断りだけを返す）
    if (!Array.isArray(data) || data.length === 0) break;
    for (const row of data) { const page = toStoredPage(organization, row); if (page !== null) pages.push(page); }
    const tail = data[data.length - 1];
    if (typeof tail.id !== "string" || tail.id === after) throw new Error("一覧を読み込めませんでした"); // i18n-keep: 内部専用の失敗（画面には固定の 500 の断りしか出ない）
    after = tail.id;
    // 最初の束だけ使う。読めなかった（null）ときは今までどおり空の束が返るまで読む
    if (lastId !== null && lastId === tail.id) break;
    last = null;
  }
  return pages.sort(newestPageFirst);
}

function newestPageFirst(a: StoredPage, b: StoredPage): number {
  return b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id);
}

/** Read selected rows in the same order as listAlivePages; access is checked by visiblePagesFor. */
export async function listAlivePagesByIds(organization: OrganizationScope, ids: readonly string[]): Promise<StoredPage[]> {
  const pages = await readPageBatches(ids, async (batch) => {
    const { data, error } = await orgDb(organization).from(PAGES_TABLE).select(PAGE_COLUMNS)
      .is("deleted_at", null).in("id", batch).limit(batch.length);
    if (error !== null) fail("一覧の取得", error); // i18n-keep: 内部専用の失敗（fail の文は画面に届かず、窓口は固定の 500 の断りだけを返す）
    return (Array.isArray(data) ? data : []).flatMap((row) => {
      const page = toStoredPage(organization, row);
      return page === null ? [] : [page];
    });
  });
  return pages.sort(newestPageFirst);
}

/**
 * ページを開く URL。**呼び名の頭から決める。**
 *
 * 見せ方（台帳の列）から作らない。社内として投稿したページを公開に切り替えても、
 * 呼び名は `internal/…` のままで `/internal/…` の入口が生きている。見せ方から作ると、
 * 切り替えた瞬間に一覧や知らせのリンクが `/public/…` へ移る——あの入口には社外の人が
 * 座っているので共有の板を出さない作りになっており、**公開をやめる導線が消える**。
 *
 * 呼び名が読めなければ null。呼び出し側は行ごと落とす（当てずっぽうの URL を出さない）。
 */
export function pageHrefOf(pageSlug: string): string | null {
  const ref = pageRefOf(pageSlug);
  if (ref === null) return null;
  return `${urlPrefixFor(ref.slugPrefix)}/${ref.slug.join("/")}`;
}

/** 一覧の 1 行に移す。URL に使えない呼び名は出さない（null）。 */
export function toPageEntry(page: StoredPage): PageEntry | null {
  const slug = page.pageSlug.split("/").slice(1);
  if (!isSafeSlug(slug)) return null;

  // 行き先は呼び名から作る（見せ方から作らない理由は pageHrefOf に書いてある）
  const href = pageHrefOf(page.pageSlug);
  if (href === null) return null;

  return {
    visibility: page.visibility,
    slug,
    href,
    // 名前が取れていない版もあるので、最後は場所の名前で代える
    title: page.title.length > 0 ? page.title : slug[slug.length - 1],
    updatedAt: page.updatedAt,
  };
}

/** 見せ方でだけ絞って引く（管理画面の「制限つきの一覧」用。可否の判定には使わない）。 */
export async function listPagesWithVisibility(organization: OrganizationScope, visibility: Visibility): Promise<StoredPage[]> {
  const { data, error } = await orgDb(organization)
    .from(PAGES_TABLE)
    .select(PAGE_COLUMNS)
    .eq("visibility", visibility)
    .is("deleted_at", null)
    .order("updated_at", { ascending: false });

  if (error !== null) fail("一覧の取得", error); // i18n-keep: 内部専用の失敗（fail の文は画面に届かず、窓口は固定の 500 の断りだけを返す）
  const rows: unknown = data;
  if (!Array.isArray(rows)) return [];

  const pages: StoredPage[] = [];
  for (const row of rows) {
    const page = toStoredPage(organization, row);
    if (page !== null) pages.push(page);
  }
  return pages;
}

/** 版の一覧を新しい順で。本文の列は読まない。門を通ったページを渡す。 */
export async function listRevisionsOf(
  page: StoredPage,
  limit: number,
): Promise<StoredRevision[]> {
  const { data, error } = await orgDb(page.organization)
    .from(REVISIONS_TABLE)
    .select(REVISION_COLUMNS)
    .eq("page_id", page.id)
    .order("version_number", { ascending: false })
    .limit(Math.max(1, limit));

  if (error !== null) fail("履歴の取得", error); // i18n-keep: 内部専用の失敗（fail の文は画面に届かず、窓口は固定の 500 の断りだけを返す）
  const rows: unknown = data;
  if (!Array.isArray(rows)) return [];

  const revisions: StoredRevision[] = [];
  for (const row of rows) {
    const revision = toStoredRevision(row);
    if (revision !== null) revisions.push(revision);
  }
  return revisions;
}

/**
 * そのページの版の並びの先頭（version_number がいちばん大きい 1 行）。本文つき。
 *
 * 親と版番号を `pages.current_version_id` から出さない。版を入れた直後に落ちると、
 * ページ側の目印だけ古いまま残る。そこから数えると**さっき入った番号と同じ番号**を
 * 作り続け、版の行は追記専用で消せないので、人が手で直すまで同じ失敗が繰り返される。
 * 履歴の正本は版の表なので、頭はそこから読む。
 * `pages.current_version_id` は「いま出す版を指す目印」に徹する。
 *
 * 本文も一緒に取る。前の版との比べ物（赤入れの件数・中身が同じかの判定）に
 * どちらも要るので、ここで 1 度だけ運ぶ。
 */
async function findHeadRevision(
  page: StoredPage,
): Promise<{ revision: StoredRevision; html: string; collaboration?: DeckCollaboration } | null> {
  const { data, error } = await orgDb(page.organization)
    .from(REVISIONS_TABLE)
    .select(`${REVISION_COLUMNS_WITH_HTML}, deck_collaboration`)
    .eq("page_id", page.id)
    .order("version_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error !== null) fail("取得", error); // i18n-keep: 内部専用の失敗（fail の文は画面に届かず、窓口は固定の 500 の断りだけを返す）
  const row: unknown = data;
  const revision = toStoredRevision(row);
  const record = toRecord(row);
  if (revision === null || record === null) return null;
  return { revision, html: readString(record, "html") ?? "", collaboration: record.deck_collaboration ? deckCollaborationSchema.parse(record.deck_collaboration) : undefined };
}

/** Current committed content, even when the delivery pointer is awaiting repair. Caller must authorize the page. */
export async function readHeadOf(page: StoredPage): Promise<{ revision: StoredRevision; html: string; collaboration?: DeckCollaboration } | null> {
  return findHeadRevision(page);
}

/** Poll metadata without transferring a large document when nothing changed. */
export async function readHeadVersionOf(page: StoredPage, details = false): Promise<{ versionId: string; versionNumber: number; updatedAt?: string; updatedBy?: string } | null> {
  const {data,error} = await orgDb(page.organization).from(REVISIONS_TABLE).select(details ? "version_id, version_number, created_at, author_name, author_email" : "version_id, version_number")
    .eq("page_id",page.id).order("version_number",{ascending:false}).limit(1).maybeSingle();
  if (error !== null) fail("取得",error); // i18n-keep: 内部専用の失敗（fail の文は画面に届かず、窓口は固定の 500 の断りだけを返す）
  const row = toRecord(data);
  if (row === null) return null;
  const versionId = readString(row,"version_id"), versionNumber = readNumber(row,"version_number");
  return versionId === null || versionNumber === null ? null : {versionId,versionNumber,...(details ? {updatedAt:readString(row,"created_at")??undefined,updatedBy:displayNameOf(readString(row,"author_email")??"",readString(row,"author_name"))} : {})};
}

/** Repair delivery after a committed edit whose response or pointer update failed. */
export async function recoverHeadDelivery(page: StoredPage): Promise<{ revision: StoredRevision; html: string; collaboration?: DeckCollaboration }> {
  const head = await findHeadRevision(page);
  if (!head) throw new Error("ページの本文が見つかりません"); // i18n-keep: 内部専用の失敗（画面には固定の 500 の断りしか出ない）
  // Collaborative commits already advance the pointer atomically. Avoid a
  // redundant write on replay; legacy saves retain the forward-only DB guard.
  if(!head.collaboration)await pointPageAt(page, head.revision.versionId, titleOf(head.html) ?? page.title,
    { email:head.revision.authorEmail, name:head.revision.authorName },head.revision.createdAt);
  await indexDocument(page, head.revision.versionId, head.html);
  await warmPageHtml(page.id,head.revision.versionId,head.html);
  await dropPageDelivery(page.id);
  return head;
}

/**
 * 新しい版を積む必要があるか。頭の版と 1 文字も違わなければ積まない。
 *
 * 3 つ効く:
 *   ・打ち直しても壊れない（同じものを 2 回送っても版が二重にならない）
 *   ・版だけ入って目印が古いまま残った状態も、打ち直せば直る
 *   ・履歴が「中身の変わらない直し」で埋まらない（git のときと同じ挙動）
 */
export function shouldStackRevision(headHtml: string | null, html: string): boolean {
  return headHtml === null || headHtml !== html;
}

/** ページの行を作る。 */
async function createPage(
  organization: OrganizationScope,
  pageSlug: string,
  visibility: Visibility,
  title: string,
  author: RevisionAuthor,
): Promise<StoredPage> {
  const { data, error } = await orgDb(organization)
    .from(PAGES_TABLE)
    .insert({
      page_slug: pageSlug,
      visibility,
      title,
      // 最初の版を書いた人が持ち主。あとから書き換えない
      created_by: author.email,
    })
    .select(PAGE_COLUMNS)
    .single();

  if (error !== null) {
    // 同じ呼び名で 2 本同時に始まったとき。先に入ったほうに乗る
    if (isUniqueViolation(error)) {
      const raced = await findPageIncludingDeleted(organization, pageSlug);
      if (raced !== null) return raced;
    }
    fail("作成", error); // i18n-keep: 内部専用の失敗（fail の文は画面に届かず、窓口は固定の 500 の断りだけを返す）
  }
  const row: unknown = data;
  const page = toStoredPage(organization, row);
  if (page === null) fail("作成", { message: "作成後の行が読めませんでした" }); // i18n-keep: 内部専用の失敗（fail の文は画面に届かず、窓口は固定の 500 の断りだけを返す）
  return page;
}

/**
 * ページの「いま出す版」を貼り替える（題名と、消した印の外しも一緒に）。
 *
 * 版を積まなかったとき（中身が同じ投稿）も必ずここを通す。**ここが冪等の要**で、
 * 版だけ入って目印が古いまま止まった状態は、同じ本文を打ち直せばこれで直る。
 */
async function pointPageAt(
  page: StoredPage,
  versionId: string,
  title: string,
  author: RevisionAuthor,
  at: string,
): Promise<void> {
  const { error } = await orgDb(page.organization)
    .from(PAGES_TABLE)
    .update({
      current_version_id: versionId,
      title,
      updated_at: at,
      // 同じ呼び名へもう一度投稿したら、消した印を外して復活させる
      deleted_at: null,
      created_by: page.createdBy ?? author.email,
    })
    .eq("id", page.id);

  if (error !== null) fail("保存", error); // i18n-keep: 内部専用の失敗（fail の文は画面に届かず、窓口は固定の 500 の断りだけを返す）
}

/**
 * 新しい版を積む。
 *
 * ページの名前は呼び出し元の名乗りを使わず、**サーバーが本文から取る**。
 * 名前を別に送れるようにすると、一覧に出る名前と本文の見出しが食い違い、
 * どちらが本当か分からなくなる。
 */
export async function commitRevision(input: CommitInput): Promise<CommitResult> {
  const diagnosticStart=performance.now();let diagnosticClock=diagnosticStart;
  const diagnostics:Record<string,number>={};
  const mark=(name:string)=>{const now=performance.now();diagnostics[name]=now-diagnosticClock;diagnosticClock=now;};
  if (input.preserveDeckAppearance) {
    readDeckDesignHtml(input.html);
    readDeckCustomizationHtml(input.html);
  }
  if (!mayPublish(input.author.email)) throw new Error("投稿できるのは設置した本人だけです"); // i18n-keep: 内部専用の失敗（画面には固定の 500 の断りしか出ない）
  // 仕掛け入りの HTML の扱いは組織の設定。制限する組織（と配布版）では、許可表に無い仕掛けをここで断る
  // （組織の設定を読むのは、許可表に無いものが見つかったときだけ・1 回の投稿で 1 度だけ）
  let scriptMode: Promise<HtmlScriptMode> | null = null;
  const scripts = () => (scriptMode ??= htmlScriptModeOf(input.organization));
  await assertSafeDocument(input.html, scripts);
  const parts = splitPageSlug(input.pageSlug);
  if (parts === null) throw new Error("ページの指定が正しくありません"); // i18n-keep: 内部専用の失敗（画面には固定の 500 の断りしか出ない）

  const title = titleOf(input.html) ?? parts.slug[parts.slug.length - 1];

  /**
   * 名前のぶつかりを見るのは**ページを新しく作るときだけ**。
   * すでにあるページへの投稿は、その名前で既に成り立っている。ここで断ると、
   * 名前がぶつかっているページを直す道（上書き投稿）ごと閉じてしまう。
   */
  const authorized=input.collaboration&&input.editReceipt&&input.authorizedPage?.id===input.observedHead?.pageId&&input.authorizedPage?.pageSlug===input.pageSlug&&input.authorizedPage.organization.id===input.organization.id?input.authorizedPage:undefined;
  const existing = authorized ?? await findPageIncludingDeleted(input.organization, input.pageSlug);
  mark("pageMs");
  if(input.observedHead&&existing?.id!==input.observedHead.pageId)throw new StaleBaseError();
  if (existing === null) {
    const conflict = await findSlugConflict(input.organization, input.pageSlug);
    if (conflict !== null) throw new SlugConflictError(input.pageSlug, conflict);
  }

  /**
   * 「選んだ人だけ」が効くのは新しく作るときだけ。すでにあるページは、
   * restricted のままの上書き投稿だけを通し、それ以外（internal / public）は断る。
   * 見せ方の列はここでは一切書き換えない（CommitInput.restricted の説明を参照）。
   */
  if (input.restricted === true && existing !== null && existing.visibility !== "restricted") {
    throw new RestrictedExistingPageError(input.pageSlug);
  }

  const page =
    existing ??
    (await createPage(
      input.organization,
      input.pageSlug,
      (input.restricted === true || (isPersonalEdition() && parts.slugPrefix === "internal")) ? "restricted" : parts.slugPrefix,
      title,
      input.author,
    ));

  const observed=input.collaboration&&input.editReceipt&&input.observedHead?.versionId===input.expectedHead?input.observedHead:undefined;
  const head = observed?{html:observed.html,collaboration:observed.collaboration,revision:{versionId:observed.versionId,versionNumber:observed.versionNumber,changeCount:null}}:await findHeadRevision(page);
  mark("headMs");
  /*
   * すれ違いの照合は「中身が同じなら積まない」より前に置く。古い土台での
   * 「変わりなし」も断る——見ていない直しの上へ「変わりなし」で乗ると、
   * 先に入った直しが消えたように見える。
   * findHeadRevision と insert のあいだの微小窓は、version_number の
   * UNIQUE 制約（RevisionRaceError）が塞ぐ。
   */
  if (input.expectedHead !== undefined) {
    const headId = head?.revision.versionId ?? null;
    if (headId !== input.expectedHead) throw new StaleBaseError();
  }
  let html = input.html;
  let collaboration = input.collaboration;
  if (input.preserveDeckAppearance) {
    html = inheritDeckOverrides(head?.html ?? null, html);
    html = inheritDeckCustomizations(head?.html ?? null, html);
  }
  if (head?.collaboration && !collaboration) {
    html = prepareDeckEdit(html).html;
    collaboration = createDeckCollaboration(html);
  }
  await assertSafeDocument(html, scripts);
  const maxBodyMb = documentLimitMb();
  if (input.preserveDeckAppearance && Buffer.byteLength(html, "utf8") > maxBodyMb * 1024 * 1024) {
    throw new InheritedDeckTooLargeError(maxBodyMb);
  }
  const parentVersionId = head?.revision.versionId ?? null;
  const versionNumber = head === null ? 1 : head.revision.versionNumber + 1;

  // 中身が 1 文字も変わっていないなら、新しい版は積まずに頭の版をそのまま返す。
  // 目印の貼り替えだけは通す（それが打ち直しで直る唯一の道）
  if (head !== null && input.editReceipt === undefined && input.collaboration === undefined && !shouldStackRevision(head.html, html)) {
    await pointPageAt(
      page,
      head.revision.versionId,
      title,
      input.author,
      new Date().toISOString(),
    );
    await indexDocument(page, head.revision.versionId, html);
    return {
      versionId: head.revision.versionId,
      versionNumber: head.revision.versionNumber,
      changeCount: head.revision.changeCount,
      title,
      unchanged: true,
      page,
      html,
    };
  }

  // 赤入れの件数は積むときに 1 度だけ数える（履歴を開くたびに前の版を読み直さないため）。
  // 最初の版は比べる相手が無いので null。
  const changeCount = head === null ? null : redlineDiff(head.html, html).changes.length;
  mark("validationAndDiffMs");

  /**
   * 時刻は**ここで 1 度だけ決めて**、目印の材料にも保存する created_at にも同じ値を使う。
   * 別々に取ると、保存された行から目印を計算し直しても一致しなくなる
   * （＝改ざんを見つける手立てが最初から壊れている状態になる）。
   */
  const createdAt = new Date().toISOString();

  const versionId = computeVersionId({
    parentVersionId,
    pageSlug: input.pageSlug,
    versionNumber,
    authorEmail: input.author.email,
    createdAt,
    html,
  });

  const revisionRow = {
      page_id: page.id,
      version_number: versionNumber,
      version_id: versionId,
      parent_version_id: parentVersionId,
      html,
      author_email: input.author.email,
      author_name: input.author.name,
      message: input.message,
      change_count: changeCount,
      created_at: createdAt,
      ...(input.editReceipt ? { edit_operation_id: input.editReceipt.id, edit_receipt: input.editReceipt } : {}),
      ...(collaboration ? { deck_collaboration: collaboration, page_slug:input.pageSlug, classifier_version: CLASSIFIER_VERSION, document_kind: classifyDocument(html) } : {}),
    };
  // HTML can be large. Send it as text rather than repeatedly parsing it inside
  // the metadata JSON; the same database transaction still commits both.
  const {html:revisionHtml,...revisionMetadata}=revisionRow;
  const { error: insertError } = collaboration
    ? input.receiptGroup
      ? input.receiptGroup.coordination
        ?await getDb().rpc("finish_deck_requests",{p_page:page.id,p_token:input.receiptGroup.coordination.token,p_expected:parentVersionId,p_audience:input.receiptGroup.audience,p_revision:revisionMetadata,p_title:title,p_html:revisionHtml,p_receipts:input.receiptGroup.receipts,p_rejected:input.receiptGroup.coordination.rejected})
        :await getDb().rpc("commit_deck_revision_group",{p_revision:revisionMetadata,p_expected:parentVersionId,p_title:title,p_html:revisionHtml,p_audience:input.receiptGroup.audience,p_receipts:input.receiptGroup.receipts})
      : await getDb().rpc("commit_deck_revision", {p_revision:revisionMetadata,p_expected:parentVersionId,p_title:title,p_html:revisionHtml})
    : await orgDb(page.organization).from(REVISIONS_TABLE).insert(revisionRow);
  mark("insertMs");

  if (insertError !== null) {
    // 同じ版番号が 2 本入ろうとした（同時に投稿が走った）。待っても直らないので、
    // 打ち直せば直ることが分かる言い方で返す
    if (isUniqueViolation(insertError) || insertError.code === "PT409") throw new RevisionRaceError();
    fail("保存", insertError); // i18n-keep: 内部専用の失敗（fail の文は画面に届かず、窓口は固定の 500 の断りだけを返す）
  }

  if (!collaboration) await pointPageAt(page, versionId, title, input.author, createdAt);
  // The collaboration transaction also updates this derived index. Avoid a
  // second database round trip in the document's serialized save lane.
  if (!collaboration) await indexDocument(page, versionId, html);
  mark("indexMs");

  /*
   * 配信網に残っている古い紙を落とし、新しい本文を実行環境へ温める。
   * 落とすのは公開の URL に載っている控え。温めは門を通ったあとの取り寄せ用。
   * どちらも失敗しても版は積んである（次の 1 人が取り直す／取りに行く）。
   */
  // Read immutable collaboration versions on demand instead of warming
  // every short-lived version inside the serialized save lane.
  if (!collaboration) await warmPageHtml(page.id, versionId, html);
  mark("warmMs");
  await dropPageDelivery(page.id);
  mark("deliveryMs");
  if(collaboration&&process.env.PAGES_DECK_DIAGNOSTICS==="on")console.info(JSON.stringify({event:"deck_collaboration_commit",pageId:page.id,revision:versionNumber,totalMs:performance.now()-diagnosticStart,...diagnostics}));

  return {
    versionId,
    versionNumber,
    changeCount,
    title,
    unchanged: false,
    page,
    html,
  };
}

/** 消した印を立てる（本文・素材・版は残す）。もう消えていれば false。 */
export async function markPageDeleted(organization: OrganizationScope, pageSlug: string): Promise<boolean> {
  if (splitPageSlug(pageSlug) === null) return false;

  const now = new Date().toISOString();
  const { data, error } = await orgDb(organization)
    .from(PAGES_TABLE)
    .update({ deleted_at: now, updated_at: now })
    .eq("page_slug", pageSlug)
    .eq("recording_protected", false)
    .is("deleted_at", null)
    .select("id");

  if (error !== null) fail("削除", error); // i18n-keep: 内部専用の失敗（fail の文は画面に届かず、窓口は固定の 500 の断りだけを返す）
  const rows: unknown = data;
  if (!Array.isArray(rows) || rows.length === 0) return false;
  const record = toRecord(rows[0]);
  const id = record === null ? null : readString(record, "id");
  if (id !== null) await dropPageDelivery(id);
  return true;
}
