import { cache } from "react";
import { memberRead } from "../identity/member-reads";
/**
 * 入口の関門。保管庫からページと許可の材料を引いて、述語（access-rules）に決めさせる。
 * 外からは src/lib/access/access.ts を通して使う。
 */
import { isPersonalEdition, isSiteOwner } from "../settings/site-settings";
import { jsonError } from "../api";
import { rt } from "../i18n/request";
import { orgDb } from "@/lib/db/database";
import { type OrganizationScope } from "../organization/scope";
import { isMember, type Identity, type Member } from "../identity/identity";
import { type PageEntry } from "../pages/content";
import { ancestorPageSlugs, findPage, pageRefOf, findPageAmong, listAlivePages, listAlivePagesByIds, toPageEntry, type StoredPage } from "../pages/store";
import { type SlugVisibility } from "../comments/types";
import { PERMISSIONS_TABLE, GROUPS_TABLE, GROUP_MEMBERS_TABLE, FACTS_FUNCTION, normalize, fail, toRecord, readString, readBoolean, firstRecord } from "./rows";
import { type PageAccess, type AdminAnswer, type AccessFacts, type PermissionRole, PERMISSION_ROLES, administersOrganization, decideAccess } from "./rules";

/** 材料を 1 つの形に畳む。決めるのは decideAccess。 */
function factsOf(page: StoredPage, admin: boolean, granted: boolean): AccessFacts {
  return {
    visibility: page.visibility,
    deleted: page.deletedAt !== null,
    createdBy: page.createdBy,
    admin,
    granted,
  };
}

/**
 * 見てよいかを決める。保管庫を引くのは、引かないと決まらないときだけ。
 *
 * public / internal / 消されたページ / 名乗っていない人は、行を 1 つも読まずに決まる。
 * restricted で「会社の人だが、まだ許可が見つかっていない」ときだけ、
 * 管理者かどうかと許可の有無を **1 回の問い合わせ**でまとめて取りに行く。
 */
export async function canViewPage(
  identity: Identity | null,
  page: StoredPage,
): Promise<PageAccess> {
  // 録音から作ったページ（議事録）の機能はこの版に無い。残っていても誰にも出さない（無いのと同じ）
  if (page.recordingProtected) return { allowed: false, reason: "notFound" };
  // 管理者かは名乗りに付いた所属の役割で決まる（保存先を引かない・admins 表は読まない。）
  // 名乗りの所属が、ページの組織のものでなければ管理者として扱わない
  const base = factsOf(page, isMember(identity) && identity.organization.id === page.organization.id && administersOrganization(identity), false);

  const early = decideAccess(identity, base);
  // 断りの理由が「名簿に無い」ときだけ、まだ答えが変わりうる（許可）。
  // それ以外（通す・ログインへ・無い）は材料を足しても変わらないので、そのまま返す
  if (early.allowed || early.reason !== "restricted") return early;
  if (!isMember(identity)) return early;

  const facts = await lookupAccessFacts(page, identity.email);
  // 保存先の関数が返す is_admin（admins 表）は使わない。管理者かは所属の役割だけで決める
  return decideAccess(identity, { ...base, granted: facts.granted });
}

/**
 * 「許可されているか」を 1 回で取る。保存先の関数は「管理者か」（admins 表）も返すが読まない——管理者かは
 * 所属の役割で決める（`isAdmin`）。
 *
 * 許可の表と、その人が入っているまとまりを保管庫側で突き合わせている
 * （0006_access.sql の page_access_facts）。ここで 3 回に割ると、
 * 制限つきのページを 1 枚めくるたびに往復が 3 回になる。
 */
async function lookupAccessFacts(
  page: StoredPage,
  email: string,
): Promise<{ granted: boolean }> {
  const { data, error } = await orgDb(page.organization).rpc(FACTS_FUNCTION, {
    p_page_id: page.id,
    p_email: normalize(email),
  });

  if (error !== null) fail("確認", error); // i18n-keep: 内部専用の失敗（fail の文は画面に届かず、窓口は固定の 500 の断りだけを返す）
  const row: unknown = data;
  const record = firstRecord(row);
  if (record === null) return { granted: false };
  return { granted: readBoolean(record, "is_granted") };
}

// ---------------------------------------------------------------------------
// 入口が使う門（ここを通さずにページの中身へ手を伸ばさせない）
// ---------------------------------------------------------------------------

/** 断る理由。行き先（401 / 403 / 404）はこれで決まる。 */
export type GateReason = Exclude<PageAccess, { allowed: true }>["reason"];

/**
 * 門を通した結果。
 *
 * 断ったときも `page` を返すのは、サーバー側の後始末に要るものがあるため
 * （「もう申し出を出してあるか」を見るのにページの id が要る）。
 * **断ったときの page を応答に載せないこと。** 題名も要約も、見せてよい情報ではない。
 */
export type PageGate =
  | { ok: true; page: StoredPage }
  | { ok: false; reason: GateReason; page: StoredPage | null };

/**
 * ページを 1 枚引くのと、見てよいかを決めるのを **1 つの動作にまとめたもの**。
 *
 * 入口（src/app/ の下）はこれだけを呼ぶ。`findPage` で行を引いてから別に判定を書くと、
 * 入口が増えたときに片方だけ書き忘れる——本文は守られているのに、コメント・履歴・
 * 素材・共有のどれかが素通り、という壊れ方をする。
 * 本文の読み口（`readHtmlOf` / `readFileAt`）が「引き当て済みのページ」を要るように
 * してあるので、門を通らないと中身に手が届かない。
 * 呼び忘れそのものは tests/checks/check-gate.mjs が落とす。
 */
export async function openPage(
  organization: OrganizationScope,
  identity: Identity | null,
  pageSlug: string,
): Promise<PageGate> {
  const page = await findPage(organization, pageSlug);
  if (page === null) return { ok: false, reason: "notFound", page: null };
  return gateOf(identity, page);
}

/** 公開本文の可否とは別に、コメント・履歴を招待された人へ限定する。 */
export async function openToolsPage(organization: OrganizationScope, identity: Identity | null, pageSlug: string): Promise<PageGate> {
  const gate = await openPage(organization, identity, pageSlug);
  if (!gate.ok || !isPersonalEdition()) return gate;
  if (!isMember(identity)) return { ok: false, reason: "signin", page: gate.page };
  if (isSiteOwner(identity.email)) return gate;
  const facts = await lookupAccessFacts(gate.page, identity.email);
  return facts.granted ? gate : { ok: false, reason: "restricted", page: gate.page };
}

/**
 * 素材の URL から持ち主のページを探して、**本文と同じ判定**を通す。
 *
 * 素材の置き場所は `<呼び名の頭>/<ページの呼び名>/<相対パス>` という 1 本の文字列で、
 * URL だけを見てもどこまでがページの呼び名か分からない。だから上へさかのぼって
 * 候補を全部挙げ、1 回の問い合わせで持ち主を当てる。
 *
 * 持ち主が見つからないときは null。台帳に行の無い置き去りの素材で、
 * 守るべきページが存在しない（呼び出し側は今までどおりの扱いに落とす）。
 */
export async function openAssetPage(
  organization: OrganizationScope,
  identity: Identity | null,
  visibility: SlugVisibility,
  slug: readonly string[],
): Promise<PageGate | null> {
  // 末尾はファイル名。持ち主になりうるのはその上のどれか
  const owner = await findPageAmong(organization, ancestorPageSlugs(`${visibility}/${slug.join("/")}`));
  if (owner === null) return null;
  return gateOf(identity, owner);
}

async function gateOf(identity: Identity | null, page: StoredPage): Promise<PageGate> {
  const access = await canViewPage(identity, page);
  if (access.allowed) return { ok: true, page };
  return { ok: false, reason: access.reason, page };
}

/**
 * 公開の URL（/public/...）が指す場所の、ありうる呼び名。
 *
 * 2 通りある。公開として投稿したページは `public/<場所>`、社内として投稿してから
 * **公開に切り替えた**ページは `internal/<場所>` のまま。切り替えで動かせるのは
 * 台帳の見せ方の列 1 つだけで、呼び名は動かさない——呼び名は URL と素材の置き場所を
 * 兼ねているので、動かすと既にある画像が全部割れる（AGENTS.md）。
 *
 * `public/` を先に置くのは、公開として投稿したページの URL を、あとから
 * 切り替えたページに横取りさせないため。同じ場所に両方あるときは先が勝つ
 * （`findPageAmong` が並び順で決める）。
 */
function publicSlugCandidates(slug: readonly string[]): string[] {
  const at = slug.join("/");
  return [`public/${at}`, `internal/${at}`];
}

/**
 * 公開の URL からページを 1 枚引いて、門を通す。
 *
 * **呼び名の頭を可否の判定に使わない。** 決めるのは門ただ 1 つで、
 * `internal/` のままでも見せ方が公開なら通り、`public/` でも消されていれば通らない。
 * 門は「名乗っていない人」として通す（応答が人によって変わらないことを守るため。
 * 配信網に載せる紙に、ある人にだけ見せてよい中身が焼き付いてはいけない）。
 */
export async function openPublicPage(organization: OrganizationScope, slug: readonly string[]): Promise<PageGate> {
  const page = await findPageAmong(organization, publicSlugCandidates(slug));
  if (page === null) return { ok: false, reason: "notFound", page: null };
  return gateOf(null, page);
}

/**
 * 公開の URL の素材から、持ち主のページを探して**本文と同じ判定**を通す。
 *
 * 候補は 2 系統ぶん挙げる（`public/…` と `internal/…`）。深いほうが持ち主で、
 * 同じ深さなら `public/` が勝つ——本文と同じ決着の付け方にそろえないと、
 * 本文は片方から出て画像はもう片方から出る、という食い違いが起きる。
 *
 * 持ち主が見つからないときは null。台帳に行の無い置き去りの素材で、
 * 守るべきページが存在しない（呼び出し側は今までどおりの扱いに落とす）。
 */
export async function openPublicAssetPage(organization: OrganizationScope, slug: readonly string[]): Promise<PageGate | null> {
  const candidates = publicSlugCandidates(slug).flatMap((at) => ancestorPageSlugs(at));
  const owner = await findPageAmong(organization, candidates);
  if (owner === null) return null;
  return gateOf(null, owner);
}

/**
 * 断ったときの、API の返し方。入口ごとに文言と番号を書き比べない。
 *
 *   signin     … 名乗っていない（401。ゲストもここ）
 *   restricted … 名乗っているが名簿に無い（403）
 *   notFound   … 無い / 消されている（404）
 *
 * どの文言にもページの題名を入れない。断られた人に中身を教えない。
 */
export function gateError(reason: GateReason): Response {
  if (reason === "signin") return jsonError(rt("server.gate.signin"), 401);
  if (reason === "restricted") return jsonError(rt("server.gate.restricted"), 403);
  return jsonError(rt("server.gate.notFound"), 404);
}

// ---------------------------------------------------------------------------
// 一覧（見られないページを出さない）
// ---------------------------------------------------------------------------

/**
 * 一覧に出してよいページだけを選ぶ（保管庫に触らない）。
 *
 * 1 枚ずつ `canViewPage` を呼ぶと、8 枚のページで 8 往復になる。材料
 * （管理者か / どのページが許可されているか）をまとめて取ってから、
 * **判定そのものは 1 枚ずつ decideAccess に通す**。可否の決まりを 2 つ持たない。
 */
export function pagesVisibleTo(
  identity: Identity | null,
  pages: readonly StoredPage[],
  admin: boolean,
  granted: ReadonlySet<string>,
): StoredPage[] {
  return pages.filter(
    (page) => !page.recordingProtected && decideAccess(identity, factsOf(page, admin, granted.has(page.id))).allowed,
  );
}

/**
 * 一覧の 1 行。制限つきのページには旗が立つ（それ以外の行には欄ごと無い）。
 *
 * 旗にしてあるのは、**見せ方の文字列を画面へ持ち出さない**ため。`internal` と `restricted` の
 * 見分けを画面が書き始めると、入口ごとに書き比べることになり、片方で取りこぼす
 * （可否の判定と同じ事故が、見た目の側で起きる）。画面が見るのは旗の有無だけ。
 */
export type VisibleEntry = PageEntry & { restricted?: true };

/** 一覧の 2 つの節。制限つきは「社内限定」に混ぜる（URL も `/internal` で、読み手には同じ棚）。 */
export type VisiblePages = { internal: VisibleEntry[]; open: PageEntry[] };

/**
 * 台帳の 1 行を、一覧の 1 行に移す。旗を立てるのはここ 1 か所だけ。
 *
 * 出るのは**その人が開ける行だけ**なので、旗を見せても何も漏れない。むしろ無いと、
 * 社内の全員が見られるのか、選んだ人だけなのかが、並びからは分からない。
 */
export function toVisibleEntry(page: StoredPage): VisibleEntry | null {
  const entry = toPageEntry(page);
  if (entry === null) return null;
  return page.visibility === "restricted" ? { ...entry, restricted: true } : entry;
}

/**
 * その人が開ける、置いてあるページの**台帳の行**。
 *
 * 一覧の絞り込みから切り出してある。一覧のためだけの部品にしておくと、
 * 別の画面（「見たページ」など）が自分でページを引いて自分で絞り込むことになり、
 * **片方だけ条件が抜ける**——この仕組みでいちばん起きやすい事故——の余地が残る。
 * 見える行を先に確定させて配れる形にしておけば、読む側は渡された行しか見られない。
 *
 * 「管理者か」を呼び出し側がもう引いてあるなら、`known` で渡す。**同じ問いを 2 回投げない**
 * ためで、渡された答えが無いときだけ自分で引く。画面の右上にも管理の入口を出すので、
 * 一覧を出す画面は必ず先に引いている（src/app/page.tsx）。
 *
 * 縦に待つ回数はページの枚数によらず一定:
 *   1 回 … ページの一覧（渡された「管理者か」の問い合わせと同時に走る）
 *   +2 回 … 入っているまとまり ＋ 出ている許可（管理者ならこの 2 回は不要）
 *
 * 許可の引き当ての中身は grantedPageIds を参照。互いの答えを要らないものは横に並べてある。
 */
export async function visiblePagesFor(
  organization: OrganizationScope,
  identity: Identity | null,
  known?: AdminAnswer,
  pageIds?: readonly string[],
): Promise<StoredPage[]> {
  const member = isMember(identity) ? identity : null;
  // 「管理者か」と「出ている許可」はページの一覧の答えを要らないので、一覧と同時に投げる。
  // 使うのは制限つきのページがあるときだけだが、一覧を待ってから聞くと縦の待ちが 2 往復ぶん伸びる。
  // 使わなかったときの失敗は拾って捨てる（今までどおり、使わない問いの失敗で画面を落とさない）
  const early = member === null ? null : {
    admin: Promise.resolve(known ?? isAdmin(organization, member)),
    grants: memberGrantRows(organization, normalize(member.email)),
  };
  if (early !== null) { early.admin.catch(() => undefined); early.grants.catch(() => undefined); }
  // An explicit empty set stays empty. It must never fall back to the whole library.
  if (pageIds === undefined && member !== null) fullListMarks().add(markOf(organization, member.email));
  const pages = await (pageIds === undefined ? alivePagesOfRequest(organization, member === null ? null : normalize(member.email)) : listAlivePagesByIds(organization, pageIds));

  const restricted = pages.filter((page) => page.visibility === "restricted" || (isPersonalEdition() && page.visibility === "internal"));
  let admin = false;
  let granted: ReadonlySet<string> = new Set<string>();

  // 制限つきが 1 枚も無いなら、名簿は答えを変えない（引きに行かない）
  const decideGrants = async (): Promise<void> => {
    if (member === null || early === null || restricted.length === 0) return;
    admin = await early.admin;
    if (admin) return;
    const rows = await early.grants;
    // 関数で読めたら、制限つきのページに出ている許可だけを拾う。読めなければ今までどおり束ごとに引く
    if (rows === null) granted = await grantedPageIds(organization, member.email, restricted.map((page) => page.id));
    else {
      const ids = new Set(restricted.map((page) => page.id));
      granted = new Set(rows.filter((row) => ids.has(row.pageId)).map((row) => row.pageId));
    }
  };
  await decideGrants();

  const ordinary = new Set(pagesVisibleTo(identity, pages, admin, granted).map((page) => page.id));
  return pages.filter((page) => ordinary.has(page.id));
}

/** 保存先の関数（member_page_grants）が 1 回で返す、その人に出ている許可の 1 行。 */
type MemberGrantRow = { pageId: string; role: unknown; addedAt: string | null; viaGroup: boolean };

/** 保存先の窓口が 1 回に返す行の上限。これに届いた答えは欠けているかもしれないので使わない（今までの読み方に戻る）。 */
const GRANT_ROWS_LIMIT = 1000;

/**
 * その人に出ている許可の全部（個人あて・生きているまとまり経由）を、保存先の関数 1 回で読む
 * （db/migrations/20261008083153_workspace_read_bundles.sql）。今までは「入っているまとまり → 生きているか → 許可」と
 * 3 回順番に待っていた。条件は今までの読み方（grantedPageIds・grantsToMember）と同じで、判定はしない。
 * 関数が無い（当てる前）・読めない・上限に届いた、のどれでも null を返し、呼ぶ側は今までの読み方に戻る。
 * 1 回の画面の表示の中では 1 度だけ読む（名簿の判定と「共有された資料」の両方が使う）。
 */
const memberGrantRows = cache(async (organization: OrganizationScope, email: string): Promise<MemberGrantRow[] | null> => {
  const bundled = await memberRead(organization, email, "grants");
  const { data, error } = bundled !== undefined ? { data: bundled, error: null } : await orgDb(organization).rpc("org_member_page_grants", { p_email: email });
  if (error !== null || !Array.isArray(data) || data.length >= GRANT_ROWS_LIMIT) return null;
  const rows: MemberGrantRow[] = [];
  for (const row of data) {
    const record = toRecord(row);
    const pageId = record === null ? null : readString(record, "page_id");
    if (record === null || pageId === null) return null;
    rows.push({ pageId, role: record["role"], addedAt: readString(record, "added_at"), viaGroup: record["via_group"] === true });
  }
  return rows;
});

/**
 * 置いてあるページの全部（台帳の行）。1 回の画面の表示の中では 1 度だけ読む（React の cache）——サイドバーと画面の両方が
 * 見てよい行を決めるので、使い回さないと同じ数百行を 2 度読む。使い回すのは行だけで、見てよいかは呼ぶ側が毎回決める。
 * 画面の表示の外（窓口の Route Handler）では使い回されず、毎回読み直す。
 */
/** この 1 回の表示で、だれの分の「全部」を読み始めたか（画面を描く中だけ。窓口では毎回空）。 */
const fullListMarks = cache((): Set<string> => new Set());
/**
 * この 1 回の表示で、その人の見てよい資料の全部をもう読み始めているか。読み始めていれば、ほかの部品（サイドバーのお気に入り）は
 * 同じ全部から拾い、目印を渡して読み直さない。読み始めていない画面では全部を読ませない（資料の数に比例させない）。
 */
export function alivePagesRequested(organization: OrganizationScope, identity: Identity | null): boolean {
  return isMember(identity) && fullListMarks().has(markOf(organization, identity.email));
}
/** 「全部を読み始めた」の控えの鍵。組織ごとに分ける（同じ人でも組織が違えば別の全部）。 */
function markOf(organization: OrganizationScope, email: string): string {
  return `${organization.id}\n${normalize(email)}`;
}
const alivePagesOfRequest = cache((organization: OrganizationScope, viewer: string | null) =>
  // 一覧の終わりの目印は、本人まわりの問い合わせとまとめて読んだもの（src/lib/identity/member-reads.ts）を使う
  listAlivePages(organization, viewer === null ? undefined : memberRead(organization, viewer, "last_page_id")));

/**
 * その人が開ける置いてあるページを、一覧の 2 つの節に分けて返す。
 *
 * 絞り込みそのものは visiblePagesFor が持つ（判定はここでは 1 つも増やさない）。
 * ここがやるのは、台帳の行を画面の行へ移して棚を分けることだけ。
 */
export async function listViewablePages(
  organization: OrganizationScope,
  identity: Identity | null,
  known?: AdminAnswer,
): Promise<VisiblePages> {
  const visible = await visiblePagesFor(organization, identity, known);

  const internal: VisibleEntry[] = [];
  const open: PageEntry[] = [];
  for (const page of visible) {
    const entry = toVisibleEntry(page);
    if (entry === null) continue;
    if (entry.visibility === "public") open.push(entry);
    else internal.push(entry);
  }
  return { internal, open };
}

/**
 * その人が入っている、生きているまとまり。1 回の画面の表示の中では 1 度だけ読む（名簿の判定と「共有された資料」の両方が使う）。
 * 画面の表示の外（窓口）では毎回読み直す。
 */
const aliveGroupIdsOf = cache(async (organization: OrganizationScope, email: string): Promise<string[]> => readAliveGroupIds(organization, email));

async function readAliveGroupIds(organization: OrganizationScope, email: string): Promise<string[]> {
  const db = orgDb(organization);
  const { data, error } = await db
    .from(GROUP_MEMBERS_TABLE)
    .select("group_id")
    .eq("member_email", normalize(email));

  if (error !== null) fail("取得", error); // i18n-keep: 内部専用の失敗（fail の文は画面に届かず、窓口は固定の 500 の断りだけを返す）
  const rows: unknown = data;
  if (!Array.isArray(rows)) return [];

  const ids: string[] = [];
  for (const row of rows) {
    const record = toRecord(row);
    const id = record === null ? null : readString(record, "group_id");
    if (id !== null) ids.push(id);
  }
  if (ids.length === 0) return [];

  // 消したまとまり経由で見えたままにしない（保管庫側の判定と同じ決まり）
  const { data: alive, error: aliveError } = await db
    .from(GROUPS_TABLE)
    .select("id")
    .in("id", ids)
    .is("deleted_at", null);

  if (aliveError !== null) fail("取得", aliveError); // i18n-keep: 内部専用の失敗（fail の文は画面に届かず、窓口は固定の 500 の断りだけを返す）
  const aliveRows: unknown = alive;
  if (!Array.isArray(aliveRows)) return [];

  const live: string[] = [];
  for (const row of aliveRows) {
    const record = toRecord(row);
    const id = record === null ? null : readString(record, "id");
    if (id !== null) live.push(id);
  }
  return live;
}

/**
 * 挙げたページのうち、その人に許可が出ているものの id。
 *
 * 縦に待つのは 2 回まで。「個人として出ている許可」と「その人が入っているまとまり」は
 * 互いの答えを要らないので同時に投げ、まとまり経由の許可だけを、まとまりが出てから引く。
 */
async function grantedPageIds(
  organization: OrganizationScope,
  email: string,
  pageIds: readonly string[],
  groups: Promise<string[]> = aliveGroupIdsOf(organization, normalize(email)),
): Promise<ReadonlySet<string>> {
  const found = new Set<string>();
  if (pageIds.length === 0) return found;
  // Bound legacy REST request URLs and response size without weakening visibility checks.
  // 入っているまとまりは束ごとに引き直さない（1 回の答えを全部の束で使う）
  if (pageIds.length > 40) {
    for (let start = 0; start < pageIds.length; start += 160) {
      const batch = pageIds.slice(start, start + 160);
      const chunks = Array.from({ length: Math.ceil(batch.length / 40) }, (_, i) => batch.slice(i * 40, (i + 1) * 40));
      for (const granted of await Promise.all(chunks.map(ids => grantedPageIds(organization, email, ids, groups)))) {
        for (const id of granted) found.add(id);
      }
    }
    return found;
  }


  const db = orgDb(organization);
  const ids = [...pageIds];
  const grantee = normalize(email);

  const collect = (data: unknown): void => {
    if (!Array.isArray(data)) return;
    for (const row of data) {
      const record = toRecord(row);
      const id = record === null ? null : readString(record, "page_id");
      if (id !== null) found.add(id);
    }
  };

  // 個人として出ている許可。アドレスは値として渡す（絞り込みの文字列に混ぜない）。
  // その人が入っているまとまりとは互いに関わらないので、待たずに 2 本とも投げる
  const [personal, groupIds] = await Promise.all([
    db
      .from(PERMISSIONS_TABLE)
      .select("page_id")
      .in("page_id", ids)
      .eq("grantee_kind", "member")
      .eq("member_email", grantee),
    groups,
  ]);

  if (personal.error !== null) fail("取得", personal.error); // i18n-keep: 内部専用の失敗（fail の文は画面に届かず、窓口は固定の 500 の断りだけを返す）
  collect(personal.data);

  if (groupIds.length === 0) return found;

  const { data: viaGroup, error: groupError } = await db
    .from(PERMISSIONS_TABLE)
    .select("page_id")
    .in("page_id", ids)
    .eq("grantee_kind", "group")
    .in("group_id", groupIds);
  if (groupError !== null) fail("取得", groupError); // i18n-keep: 内部専用の失敗（fail の文は画面に届かず、窓口は固定の 500 の断りだけを返す）
  collect(viaGroup);

  return found;
}

/** その人に出ている許可 1 件（個人あて・生きているまとまり経由）。 */
export type MemberGrant = { pageId: string; role: PermissionRole; addedAt: string; viaGroup: boolean };

/**
 * その人に出ている許可を全部（個人あて＋その人が入っている生きているまとまり経由）。
 *
 * **見てよいかの判定には使わない**（可否は `visiblePagesFor` / `canViewPage` ただ 1 つ）。
 * これは「自分に共有されたページ」「共同の作った人か」を見分けるための材料で、使う側は
 * 必ず `visiblePagesFor` が返した行と突き合わせてから出す。
 *
 * 往復はページの数によらず 2 回まで（個人あてとまとまりを同時に・まとまり経由をそのあと）。
 */
export async function grantsToMember(organization: OrganizationScope, email: string): Promise<MemberGrant[]> {
  const db = orgDb(organization);
  const grantee = normalize(email);
  const bundled = await memberGrantRows(organization, grantee);
  if (bundled !== null) {
    // 関数で 1 回で読めた。知らない役割の行は落とす（下の読み方・名簿の読み方 toPagePermission と同じ）
    return bundled.flatMap((row) => {
      const role = PERMISSION_ROLES.find((known) => known === row.role);
      return role === undefined || row.addedAt === null ? [] : [{ pageId: row.pageId, role, addedAt: row.addedAt, viaGroup: row.viaGroup }];
    });
  }
  const [personal, groupIds] = await Promise.all([
    db
      .from(PERMISSIONS_TABLE)
      .select("page_id, role, added_at")
      .eq("grantee_kind", "member")
      .eq("member_email", grantee),
    aliveGroupIdsOf(organization, grantee),
  ]);
  if (personal.error !== null) fail("取得", personal.error); // i18n-keep: 内部専用の失敗（fail の文は画面に届かず、窓口は固定の 500 の断りだけを返す）

  const grants: MemberGrant[] = [];
  const collect = (data: unknown, viaGroup: boolean): void => {
    if (!Array.isArray(data)) return;
    for (const row of data) {
      const record = toRecord(row);
      if (record === null) continue;
      const pageId = readString(record, "page_id");
      const addedAt = readString(record, "added_at");
      const role = PERMISSION_ROLES.find((known) => known === record["role"]);
      // 知らない役割の行は落とす（名簿の読み方 toPagePermission と同じ）
      if (pageId === null || addedAt === null || role === undefined) continue;
      grants.push({ pageId, role, addedAt, viaGroup });
    }
  };
  collect(personal.data, false);
  if (groupIds.length === 0) return grants;

  const { data, error } = await db
    .from(PERMISSIONS_TABLE)
    .select("page_id, role, added_at")
    .eq("grantee_kind", "group")
    .in("group_id", groupIds);
  if (error !== null) fail("取得", error); // i18n-keep: 内部専用の失敗（fail の文は画面に届かず、窓口は固定の 500 の断りだけを返す）
  collect(data, true);
  return grants;
}

/**
 * 全部のページを開けられる人か（その組織の管理者）。
 *
 * **所属の役割（owner / admin）で決める**（決定 4）。役割は名乗りを作るときに要求ごとに名簿から引いてあるので、
 * ここでは保存先を引かない。admins 表はもう読まない（縮めるのは別の PR）。配布版は設置した本人だけ。
 * 名乗りの所属が別の組織のものなら、ここの管理者ではない（安全側）。
 * 呼ぶ側が「先に投げておいて要るときに待つ」形（`AdminAnswer`）のまま使えるように、答えは Promise で返す。
 */
export async function isAdmin(organization: OrganizationScope, member: Member): Promise<boolean> {
  if (isPersonalEdition()) return isSiteOwner(member.email);
  return member.organization.id === organization.id && administersOrganization(member);
}
