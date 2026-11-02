/**
 * 名簿と共有の操作（管理者・許可・まとまり・見せてほしいの依頼・名簿の一覧）。
 * 外からは src/lib/access/access.ts を通して使う。
 * i18n-keep-file: 残る日本語は fail() の動作名と配布版の番人の文だけで、どちらも内部の失敗（ログには符号だけが残り、画面には固定の 500）。題の分からないページは null で返し、画面が辞書の言葉で代える
 */
import { isPersonalEdition, validEmail } from "../settings/site-settings";
import { requestAutoJoinDomains } from "../organization/member-organization";
import { createHash } from "node:crypto";
import { orgDb } from "@/lib/db/database";
import type { OrganizationScope } from "../organization/scope";
import { type Member } from "../identity/identity";
import { emailKey, sameEmail } from "../identity/member-name";
import { slugVisibilityOf, type PageEntry } from "../pages/content";
import { listPagesWithVisibility, type StoredPage } from "../pages/store";
import { PAGES_TABLE, PERMISSIONS_TABLE, GROUPS_TABLE, GROUP_MEMBERS_TABLE, REQUESTS_TABLE, PERMISSION_COLUMNS, GROUP_COLUMNS, REQUEST_COLUMNS, normalize, fail, isUniqueViolation, toRecord, readString, firstRecord } from "./rows";
import { type AccessVisibility, GRANTEE_KINDS, type GranteeKind, PERMISSION_ROLES, type PermissionRole, type PagePermission, type RoleChangeOutcome, type Group, type AccessRequest, type Admin, type MemberChangeVerdict, administersRole, canChangeMember, canInvite, toMemberEmail, canTogglePublic, OutsideDomainError, PageNotSwitchableError } from "./rules";
import { openPage } from "./gates";

function isGranteeKind(value: unknown): value is GranteeKind {
  return GRANTEE_KINDS.some((kind) => kind === value);
}

function isPermissionRole(value: unknown): value is PermissionRole {
  return PERMISSION_ROLES.some((role) => role === value);
}

/** 管理者（設置した本人だけ）。名簿の表は持たない。 */
export async function listAdmins(_organization: OrganizationScope): Promise<Admin[]> {
  return [];
}

/**
 * 名簿（共有の許可・まとまり）へ入れてよいアドレスか。通ればそろえた形、通らなければ null。
 * この設置は自動参加のドメインを持たないので、形の正しいアドレスをそのまま通す（`toMemberEmail`）。
 */
async function rosterEmail(_organization: OrganizationScope, value: string, domains: readonly string[]): Promise<string | null> {
  return toMemberEmail(value, domains);
}

function asRows(data: unknown): unknown[] {
  return Array.isArray(data) ? data : [];
}

function toPagePermission(row: unknown): PagePermission | null {
  const record = toRecord(row);
  if (record === null) return null;

  const id = readString(record, "id");
  const addedAt = readString(record, "added_at");
  const kind = record["grantee_kind"];
  // 知らない役割の行は、viewer に倒さず行ごと落とす（必須が欠けたら null、の流儀と揃える）。
  // 倒すほうが安全に見えるが、逆——読めない行を「見るだけの人」として画面に並べると、
  // 保管庫に何が入っているのか分からないまま名簿が正しく見えてしまう
  const role = record["role"];
  if (id === null || addedAt === null || !isGranteeKind(kind) || !isPermissionRole(role)) {
    return null;
  }

  return {
    id,
    granteeKind: kind,
    memberEmail: readString(record, "member_email"),
    groupId: readString(record, "group_id"),
    addedBy: readString(record, "added_by"),
    addedAt,
    role,
  };
}

/** そのページに出してある許可を、新しい順に。 */
export async function listPagePermissions(organization: OrganizationScope, pageId: string): Promise<PagePermission[]> {
  const { data, error } = await orgDb(organization)
    .from(PERMISSIONS_TABLE)
    .select(PERMISSION_COLUMNS)
    .eq("page_id", pageId)
    .order("added_at", { ascending: false });

  if (error !== null) fail("取得", error);
  const rows: unknown = data;
  if (!Array.isArray(rows)) return [];

  const permissions: PagePermission[] = [];
  for (const row of rows) {
    const permission = toPagePermission(row);
    if (permission !== null) permissions.push(permission);
  }
  return permissions;
}

/**
 * そのページで「共同の作った人」の許可を持っているか。
 *
 * 見てよいかとは別の問い。ここが false でも、名簿に載っていればページは見られる
 * （可否は canViewPage ただ 1 つが決める。ここを可否の判定に使わない）。
 *
 * まとまり経由は数えない。まとまりに 1 人足すだけで共有を触れる人が増えると、
 * 「誰が共有を触れるか」が名簿を 2 段たどらないと分からなくなる。
 */
export async function hasOwnerGrant(organization: OrganizationScope, pageId: string, email: string): Promise<boolean> {
  const { data, error } = await orgDb(organization)
    .from(PERMISSIONS_TABLE)
    .select("id")
    .eq("page_id", pageId)
    .eq("grantee_kind", "member")
    .eq("member_email", normalize(email))
    .eq("role", "owner")
    .limit(1)
    .maybeSingle();

  if (error !== null) fail("確認", error);
  const row: unknown = data;
  return firstRecord(row) !== null;
}

/**
 * 許可 1 件の役割を付け替える（見るだけ ⇄ 共同の作った人）。
 *
 * ページも一緒に指定するのは、別のページの許可を目印だけで動かせないようにするため
 * （revokePermission と同じ）。
 *
 * **なぜ 2 往復かけてでも先に見分けるか。** まとまりあての行に owner を入れると
 * 保管庫の制約が弾いてくれるが、その失敗を「想定内の断り」として使うと、
 * 本物の壊れ方——列が消えた・制約が別の理由で効いた——と見分けが付かなくなる。
 * 断りの条件はこちらが自分で確かめ、保管庫からのエラーは全部「壊れている」として
 * 投げる。0007 の自前の番号（最後の 1 人）は逆に、アプリ側では絶対に守り切れない
 * ものだけを保管庫に預けたもので、向きが違うだけで理屈は同じ。
 */
export async function setPermissionRole(
  organization: OrganizationScope,
  id: string,
  pageId: string,
  role: PermissionRole,
): Promise<RoleChangeOutcome> {
  if (isPersonalEdition() && role === "owner") throw new Error("配布版では共同編集の権限を設定できません");
  const db = orgDb(organization);
  const { data, error } = await db
    .from(PERMISSIONS_TABLE)
    .select("id, grantee_kind, role, member_email")
    .eq("id", id)
    .eq("page_id", pageId)
    .maybeSingle();

  if (error !== null) fail("取得", error);
  const record = firstRecord(data);
  if (record === null) return "missing";
  if (readString(record, "grantee_kind") !== "member") return "group";

  const { data: changed, error: updateError } = await db
    .from(PERMISSIONS_TABLE)
    .update({ role })
    .eq("id", id)
    .eq("page_id", pageId)
    // 読んでから書くまでの間に行が入れ替わっていたら、何も書かない
    .eq("grantee_kind", "member")
    .select("id");

  if (updateError !== null) fail("更新", updateError);
  if (asRows(changed).length === 0) return "missing";
  const before = readString(record, "role");
  return "changed";
}

/**
 * 個人 1 人に見せる。
 *
 * 組織の外のアドレスは受け取らない（入れてよいのは `rosterEmail` が通すものだけ）。
 * すでに載っている人をもう一度足しても、何も起きない（打ち直しで壊れない）。
 */
export async function grantToMember(
  organization: OrganizationScope,
  pageId: string,
  email: string,
  addedBy: string,
): Promise<void> {
  const domains = await requestAutoJoinDomains(organization);
  const grantee = await rosterEmail(organization, email, domains);
  if (grantee === null) throw new OutsideDomainError(email, domains);

  const { error } = await orgDb(organization).from(PERMISSIONS_TABLE).insert({
    page_id: pageId,
    grantee_kind: "member",
    member_email: grantee,
    added_by: addedBy,
  });

  // すでに載っている人（打ち直し）は何も変わっていないので、記録も積まない
  if (error !== null && isUniqueViolation(error)) return;
  if (error !== null) fail("保存", error);
}

/** まとまり 1 つに見せる。すでに出してあれば何も起きない。 */
export async function grantToGroup(
  organization: OrganizationScope,
  pageId: string,
  groupId: string,
  addedBy: string,
  /** まとまりの名前（記録の要約に使う。呼ぶ側が手元に持っていれば渡す＝引き直しの 1 往復を減らす） */
  groupName?: string,
): Promise<void> {
  const db = orgDb(organization);
  const { error } = await db.from(PERMISSIONS_TABLE).insert({
    page_id: pageId,
    grantee_kind: "group",
    group_id: groupId,
    added_by: addedBy,
  });

  if (error !== null && isUniqueViolation(error)) return;
  if (error !== null) fail("保存", error);
}

/** まとまりの名前（記録の要約に使う・消したまとまりも引く）。見つからなければ目印のまま。 */
async function groupNameOf(organization: OrganizationScope, groupId: string): Promise<string> {
  const { data, error } = await orgDb(organization).from(GROUPS_TABLE).select("name").eq("id", groupId).maybeSingle();
  if (error !== null) fail("取得", error);
  const record = firstRecord(data);
  return (record === null ? null : readString(record, "name")) ?? groupId;
}

/**
 * 許可を 1 件取り消す。取り消せたら true（もう無ければ false）。
 *
 * ページも一緒に指定するのは、別のページの許可を目印だけで消せないようにするため。
 * ここは行を実際に消す。「いま誰が見られるか」の名簿なので、消した印を残す形にすると
 * 可否の判定が「印の立っていない行だけ」という条件を毎回背負うことになる。
 */
export async function revokePermission(organization: OrganizationScope, id: string, pageId: string): Promise<boolean> {
  const { data, error } = await orgDb(organization)
    .from(PERMISSIONS_TABLE)
    .delete()
    .eq("id", id)
    .eq("page_id", pageId)
    .select("id, grantee_kind, member_email, group_id");

  if (error !== null) fail("取り消し", error);
  const record = firstRecord(asRows(data)[0] ?? null);
  if (record === null) return false;
  const groupId = readString(record, "group_id");
  const who = readString(record, "grantee_kind") === "group" && groupId !== null ? await groupNameOf(organization, groupId) : readString(record, "member_email");
  return true;
}

/**
 * ページの見せ方を、望みの 1 つに置き換える。
 *
 * **旗を 2 つ持たない。** 「制限を付けるか」と「社外に公開するか」を別々の真偽で
 * 受けていたころは、同じ 1 つの列を 2 つの旗で表していた。だから 2 つが同時に来ると
 * 矛盾し、混ざらないようにする歯止めが要り、そのぶん「名簿で絞った状態から社外へは
 * 直に動かせない」という遠回りが人に見えていた。**受けるのは望みの見せ方 1 つ**に
 * すれば、矛盾しようがないし、どこからどこへでも 1 手で動ける。
 *
 * 見せ方は「見える人の広さ」の順に並んでいる:
 *
 *     restricted ＜ internal ＜ public
 *       名簿の人      社内の全員    誰でも
 *
 * 呼び名も素材の置き場所も動かさない。動かすと、既に貼られた `/internal/…` のリンクが死に、
 * 置き場所ごと変わって過去の版の画像まで全部割れる（AGENTS.md）。変わるのは台帳の
 * 見せ方の列 1 つで、`public` にすると `/public/…` の入口が開く。
 *
 * 更新した時刻には触らない。触ると、見せ方を変えるたびに一覧の先頭へ上がってくる
 * （中身は 1 文字も変わっていないのに）。
 *
 * 書く直前にもう一度、動かしてよい見せ方だけに絞る。読んでから書くまでの間に
 * 別の誰かが動かしていたら、何も書かない（片方の結果を静かに踏み消さない）。
 */
export async function setPageScope(organization: OrganizationScope, pageId: string, scope: AccessVisibility): Promise<void> {
  const db = orgDb(organization);
  const { data, error } = await db
    .from(PAGES_TABLE)
    .select("id, page_slug, visibility")
    .eq("id", pageId)
    .maybeSingle();

  if (error !== null) fail("取得", error);
  const row: unknown = data;
  const record = firstRecord(row);
  if (record === null) fail("更新", { message: "ページが見つかりませんでした" });

  const pageSlug = readString(record, "page_slug") ?? "";
  if (!canTogglePublic(pageSlug)) throw new PageNotSwitchableError();

  const before = readString(record, "visibility");
  const { data: changed, error: updateError } = await db
    .from(PAGES_TABLE)
    .update({ visibility: scope })
    .eq("id", pageId)
    .in("visibility", ["internal", "restricted", "public"])
    // 読んでから書くまでの間に別の誰かが動かしていたら書かない（記録の「前」を取り違えない）
    .eq("visibility", before ?? "")
    .select("id");

  if (updateError !== null) fail("更新", updateError);
}

function toGroup(row: unknown): Group | null {
  const record = toRecord(row);
  if (record === null) return null;

  const id = readString(record, "id");
  const name = readString(record, "name");
  const createdAt = readString(record, "created_at");
  if (id === null || name === null || createdAt === null) return null;

  return { id, name, createdBy: readString(record, "created_by"), createdAt };
}

/** 生きているまとまりを名前順に。 */
export async function listGroups(organization: OrganizationScope): Promise<Group[]> {
  const { data, error } = await orgDb(organization)
    .from(GROUPS_TABLE)
    .select(GROUP_COLUMNS)
    .is("deleted_at", null)
    .order("name", { ascending: true });

  if (error !== null) fail("取得", error);
  const rows: unknown = data;
  if (!Array.isArray(rows)) return [];

  const groups: Group[] = [];
  for (const row of rows) {
    const group = toGroup(row);
    if (group !== null) groups.push(group);
  }
  return groups;
}

/** そのまとまりに入っている人のメールアドレス。 */
export async function listGroupMembers(organization: OrganizationScope, groupId: string): Promise<string[]> {
  const { data, error } = await orgDb(organization)
    .from(GROUP_MEMBERS_TABLE)
    .select("member_email")
    .eq("group_id", groupId)
    .order("member_email", { ascending: true });

  if (error !== null) fail("取得", error);
  const rows: unknown = data;
  if (!Array.isArray(rows)) return [];

  const emails: string[] = [];
  for (const row of rows) {
    const record = toRecord(row);
    const email = record === null ? null : readString(record, "member_email");
    if (email !== null) emails.push(email);
  }
  return emails;
}

/**
 * 「見せてほしい」を 1 件出す。
 *
 * 誰が出したかはサーバーが持っている名乗り（Member）からしか採らない。
 * すでに未処理のものがあれば、二重には積まない（何度押しても増えない）。
 */
export async function createAccessRequest(organization: OrganizationScope, pageId: string, requester: Member): Promise<void> {
  // 出した人は名乗りの時点で宛先の組織の人（招いた外の人も含む）。ドメインでは断らない
  const email = normalize(requester.email);

  const { error } = await orgDb(organization).from(REQUESTS_TABLE).insert({
    page_id: pageId,
    requester_email: email,
    requester_name: requester.name,
  });

  if (error !== null && !isUniqueViolation(error)) fail("保存", error);
}

function toAccessRequest(row: unknown): AccessRequest | null {
  const record = toRecord(row);
  if (record === null) return null;

  const id = readString(record, "id");
  const requesterEmail = readString(record, "requester_email");
  const createdAt = readString(record, "created_at");
  if (id === null || requesterEmail === null || createdAt === null) return null;

  return {
    id,
    requesterEmail,
    requesterName: readString(record, "requester_name"),
    createdAt,
  };
}

/** そのページの、まだしまっていない申し出を新しい順に。 */
export async function listPendingRequests(organization: OrganizationScope, pageId: string): Promise<AccessRequest[]> {
  const { data, error } = await orgDb(organization)
    .from(REQUESTS_TABLE)
    .select(REQUEST_COLUMNS)
    .eq("page_id", pageId)
    .is("resolved_at", null)
    .order("created_at", { ascending: false });

  if (error !== null) fail("取得", error);
  const rows: unknown = data;
  if (!Array.isArray(rows)) return [];

  const requests: AccessRequest[] = [];
  for (const row of rows) {
    const request = toAccessRequest(row);
    if (request !== null) requests.push(request);
  }
  return requests;
}

/**
 * 申し出をしまう（承認 / 却下）。しまえたら true（もうしまってあれば false）。
 *
 * 承認しても許可は自動では増えない。名簿に足すのは grantToMember の仕事で、
 * 呼び出し側が 2 つを続けて呼ぶ。ここで一緒にやると、
 * 「却下したのに名簿に載っている」ような食い違いの直し方が分からなくなる。
 */
export async function resolveAccessRequest(
  organization: OrganizationScope,
  id: string,
  approved: boolean,
  resolvedBy: string,
): Promise<boolean> {
  const { data, error } = await orgDb(organization)
    .from(REQUESTS_TABLE)
    .update({ resolved_at: new Date().toISOString(), resolved_by: resolvedBy, approved })
    .eq("id", id)
    .is("resolved_at", null)
    .select("id");

  if (error !== null) fail("更新", error);
  const rows: unknown = data;
  return Array.isArray(rows) && rows.length > 0;
}

/**
 * まだしまっていない申し出を 1 件、id で引く。
 *
 * 承認するとき、どのページの誰を名簿に足すかを**ここから採る**。
 * 画面から一緒に送られてきた値を信じると、隠し欄を書き換えるだけで
 * 好きなページに好きな人を足せてしまう。
 */
export async function findPendingRequest(
  organization: OrganizationScope,
  id: string,
): Promise<{ id: string; pageId: string; requesterEmail: string } | null> {
  const { data, error } = await orgDb(organization)
    .from(REQUESTS_TABLE)
    .select("id, page_id, requester_email")
    .eq("id", id)
    .is("resolved_at", null)
    .maybeSingle();

  if (error !== null) fail("取得", error);
  const record = firstRecord(data);
  if (record === null) return null;

  const pageId = readString(record, "page_id");
  const requesterEmail = readString(record, "requester_email");
  const found = readString(record, "id");
  if (pageId === null || requesterEmail === null || found === null) return null;
  return { id: found, pageId, requesterEmail };
}

/** その人がそのページに、まだしまわれていない申し出を出してあるか。 */
export async function hasPendingRequest(organization: OrganizationScope, pageId: string, email: string): Promise<boolean> {
  const { data, error } = await orgDb(organization)
    .from(REQUESTS_TABLE)
    .select("id")
    .eq("page_id", pageId)
    .eq("requester_email", normalize(email))
    .is("resolved_at", null)
    .maybeSingle();

  if (error !== null) fail("確認", error);
  const row: unknown = data;
  return firstRecord(row) !== null;
}

/**
 * 「見せてほしい」を出すまでの一連。入口はこれを 1 回呼ぶだけでよい。
 *
 * 出せるのは**本当に見られない人だけ**。すでに見られる人が押しても何も積まない
 * （管理者や所有者の手元に、答える必要のないお願いが並ばないように）。
 */
export type RequestOutcome = "created" | "already" | "allowed" | "notFound";

export async function requestPageAccess(
  organization: OrganizationScope,
  member: Member,
  pageSlug: string,
): Promise<RequestOutcome> {
  const gate = await openPage(organization, member, pageSlug);
  if (gate.ok) return "allowed";
  if (gate.page === null || gate.reason === "notFound" || gate.page.recordingProtected) return "notFound";
  // 名乗っていない人はここへ来ない（入口が会社の人だけに絞っている）
  if (gate.reason === "signin") return "notFound";

  if (await hasPendingRequest(organization, gate.page.id, member.email)) return "already";
  await createAccessRequest(organization, gate.page.id, member);
  return "created";
}

/**
 * その人が返事できる、まだしまっていない申し出をページごとに数える。
 *
 * 「返事できる」＝ そのページを**作った人**か、**共同の作った人**（owner の許可）。
 * canManageSharing が言う 3 人のうち、**管理者だけをここでは数えない**——管理者は
 * 受信箱（/sharing）で全部の申し出をまとめて見られるので、ここでも足すと、自分が
 * 作ったわけでもないページの知らせで一覧が埋まる。だから管理者かは引きに行かない
 * （引かない＝往復も 1 回減る）。管理者が自分で作ったページなら、作った人として数える。
 *
 * 返す鍵はページの**呼び名**（`internal/foo/bar`）。一覧の行が持っているのは呼び名と
 * URL だけで、台帳の目印（id）は持っていないため。引くときは pendingCountKey を使う
 * （鍵の形をここと画面で 2 通り持たない）。0 件のページは鍵ごと入れない
 * （呼び出し側が「あるかどうか」だけで見分けられるように）。
 *
 * 縦に待つのは多くて 2 回:
 *   1 回 … まだしまっていない申し出を全部（0 件ならここで終わり）
 *   +1 回 … その page_id について「作った人か」と「owner の許可があるか」を同時に投げる
 */
export async function pendingRequestCounts(organization: OrganizationScope, email: string, pageIds?: readonly string[]): Promise<ReadonlyMap<string, number>> {
  if (pageIds?.length === 0) return new Map();
  const db = orgDb(organization);
  let query = db.from(REQUESTS_TABLE).select("page_id").is("resolved_at", null);
  if (pageIds !== undefined) query = query.in("page_id", pageIds);
  const { data, error } = await query;
  if (error !== null) fail("取得", error);

  // ページごとの件数。返事できるかを確かめるのはこの後で、まずは数えるだけ
  const pending = new Map<string, number>();
  for (const row of asRows(data)) {
    const record = toRecord(row);
    const pageId = record === null ? null : readString(record, "page_id");
    if (pageId === null) continue;
    pending.set(pageId, (pending.get(pageId) ?? 0) + 1);
  }
  if (pending.size === 0) return new Map();

  const ids = [...pending.keys()];
  const viewer = normalize(email);

  // 「作った人か」（ページの台帳）と「owner の許可があるか」（許可の名簿）は
  // 互いの答えを要らないので、待たずに 2 本とも投げる
  const [pages, owned] = await Promise.all([
    db.from(PAGES_TABLE).select("id, page_slug, created_by").in("id", ids).is("deleted_at", null),
    db
      .from(PERMISSIONS_TABLE)
      .select("page_id")
      .in("page_id", ids)
      .eq("grantee_kind", "member")
      .eq("member_email", viewer)
      .eq("role", "owner"),
  ]);

  if (pages.error !== null) fail("取得", pages.error);
  if (owned.error !== null) fail("取得", owned.error);

  const asOwner = new Set<string>();
  for (const row of asRows(owned.data)) {
    const record = toRecord(row);
    const pageId = record === null ? null : readString(record, "page_id");
    if (pageId !== null) asOwner.add(pageId);
  }

  const counts = new Map<string, number>();
  for (const row of asRows(pages.data)) {
    const record = toRecord(row);
    if (record === null) continue;

    const pageId = readString(record, "id");
    const pageSlug = readString(record, "page_slug");
    if (pageId === null || pageSlug === null) continue;

    const answerable = sameEmail(readString(record, "created_by"), viewer) || asOwner.has(pageId);
    const waiting = pending.get(pageId) ?? 0;
    if (answerable && waiting > 0) counts.set(pageSlug, waiting);
  }
  return counts;
}

/**
 * 上の地図（pendingRequestCounts）を引くための鍵を、一覧の 1 行から作る。
 *
 * **鍵の形を画面側で組み立てさせない。** 頭の文字を決めるのは slugVisibilityOf ただ 1 つで、
 * 制限つきのページも呼び名は `internal/...` のまま。画面ごとに
 * 「public ならこう、そうでなければこう」と書き比べると、制限つきの行だけ鍵が食い違って
 * ——つまり**申し出が来ているページに限って**——印が黙って出なくなる。
 *
 * ここが読む見せ方は**鍵を組むためだけ**のもので、可否とは関わらない
 * （見てよいかを決めるのは canViewPage ただ 1 つ）。
 */
export function pendingCountKey(page: PageEntry): string {
  return `${slugVisibilityOf(page.visibility)}/${page.slug.join("/")}`;
}

// ---------------------------------------------------------------------------
// 管理画面が見るもの（会社の人にしか返らない口から呼ぶ）
// ---------------------------------------------------------------------------

/** まとまり 1 つと、入っている人。 */
export type GroupWithMembers = { group: Group; members: string[] };

/**
 * 生きているまとまりを、入っている人ごと。
 *
 * まとまりの数だけ問い合わせを増やさない（2 回で済ませる）。
 */
export async function listGroupsWithMembers(organization: OrganizationScope): Promise<GroupWithMembers[]> {
  const groups = await listGroups(organization);
  if (groups.length === 0) return [];

  const { data, error } = await orgDb(organization)
    .from(GROUP_MEMBERS_TABLE)
    .select("group_id, member_email")
    .in(
      "group_id",
      groups.map((group) => group.id),
    )
    .order("member_email", { ascending: true });

  if (error !== null) fail("取得", error);
  const rows: unknown = data;

  const byGroup = new Map<string, string[]>();
  if (Array.isArray(rows)) {
    for (const row of rows) {
      const record = toRecord(row);
      if (record === null) continue;
      const groupId = readString(record, "group_id");
      const email = readString(record, "member_email");
      if (groupId === null || email === null) continue;
      const list = byGroup.get(groupId);
      if (list === undefined) byGroup.set(groupId, [email]);
      else list.push(email);
    }
  }

  return groups.map((group) => ({ group, members: byGroup.get(group.id) ?? [] }));
}

/** まとまりを 1 つ作る。同じ名前が生きていれば、そちらをそのまま返す。 */
export async function createGroup(
  organization: OrganizationScope,
  name: string,
  createdBy: string,
): Promise<Group | null> {
  const tidy = name.replace(/\s+/g, " ").trim();
  if (tidy.length === 0) return null;

  const { data, error } = await orgDb(organization)
    .from(GROUPS_TABLE)
    .insert({ name: tidy, created_by: createdBy })
    .select(GROUP_COLUMNS)
    .single();

  if (error !== null) {
    if (isUniqueViolation(error)) return null;
    fail("保存", error);
  }
  const row: unknown = data;
  const group = toGroup(row);
  return group;
}

/** 名前を変える。 */
export async function renameGroup(organization: OrganizationScope, id: string, name: string): Promise<boolean> {
  const tidy = name.replace(/\s+/g, " ").trim();
  if (tidy.length === 0) return false;

  const before = await groupNameOf(organization, id);
  const { data, error } = await orgDb(organization)
    .from(GROUPS_TABLE)
    .update({ name: tidy })
    .eq("id", id)
    .is("deleted_at", null)
    .select("id");

  if (error !== null) {
    if (isUniqueViolation(error)) return false;
    fail("更新", error);
  }
  if (asRows(data).length === 0) return false;
  return true;
}

/**
 * まとまりを消す。行は残して「消した印」を立てるだけ。
 *
 * 許可の行がこのまとまりを指したまま残るが、可否の判定は生きているまとまりしか
 * 数えないので、見えなくなる（0006_access.sql の page_access_facts）。
 */
export async function markGroupDeleted(organization: OrganizationScope, id: string): Promise<boolean> {
  const { data, error } = await orgDb(organization)
    .from(GROUPS_TABLE)
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
    .is("deleted_at", null)
    .select("id, name");

  if (error !== null) fail("削除", error);
  const record = firstRecord(asRows(data)[0] ?? null);
  if (record === null) return false;
  return true;
}

/** まとまりに 1 人入れる。すでに入っていれば何も起きない。 */
export async function addGroupMember(
  organization: OrganizationScope,
  groupId: string,
  email: string,
  addedBy: string,
): Promise<void> {
  const domains = await requestAutoJoinDomains(organization);
  const member = await rosterEmail(organization, email, domains);
  if (member === null) throw new OutsideDomainError(email, domains);

  const { error } = await orgDb(organization).from(GROUP_MEMBERS_TABLE).insert({
    group_id: groupId,
    member_email: member,
    added_by: addedBy,
  });

  // すでに入っている人（打ち直し）は何も変わっていないので、記録も積まない
  if (error !== null && isUniqueViolation(error)) return;
  if (error !== null) fail("保存", error);
}

/** まとまりから 1 人外す。 */
export async function removeGroupMember(organization: OrganizationScope, groupId: string, email: string): Promise<boolean> {
  const { data, error } = await orgDb(organization)
    .from(GROUP_MEMBERS_TABLE)
    .delete()
    .eq("group_id", groupId)
    .eq("member_email", normalize(email))
    .select("member_email");

  if (error !== null) fail("取り消し", error);
  const removed = firstRecord(asRows(data)[0] ?? null);
  if (removed === null) return false;
  return true;
}

// ---------------------------------------------------------------------------
// 人から引く台帳（メンバー）
// ---------------------------------------------------------------------------
