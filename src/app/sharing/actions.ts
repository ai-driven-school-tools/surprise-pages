"use server";

/**
 * 管理画面の実行係。
 *
 * **成功でも失敗でも、終わり方は「道筋を変える」で揃える。** 成功のときだけ同じ道筋のまま
 * 描き直すと、前に断られたときの合言葉（`?error=...`）が道筋に残ったままになり、
 * うまくいったのに赤い帯が出続ける。行き先を書き直せば、残っていた合言葉も、
 * 消す前の確認の指定（`?confirm=...`）も一緒に消える。
 *
 * 人の面（招待・役割・外す・自動参加のドメイン）の実行係は src/app/sharing/people-actions.ts に分けてある。
 *
 * ただし**開いていた面と、そこで選んでいたもの（`?p=` / `?g=` / `?m=` / `?tab=`）は
 * 書き直したあとも保つ**。画面は「1 件を開いて、そこで何度か付け外しする」使い方をするので、
 * 1 回押すたびに面ごと戻ると、同じものを毎回選び直すことになる。
 *
 * 知らせ（断り・終わったことの一言）の置き場は中身の頭 1 か所だけなので、
 * 飛び先も `#notice` 1 本に揃えてある。
 */

import { redirect } from "next/navigation";

import { currentOrganization } from "@/lib/organization/scope";
import {
  addGroupMember,
  createGroup,
  findPendingRequest,
  grantToGroup,
  grantToMember,
  markGroupDeleted,
  OutsideDomainError,
  removeGroupMember,
  renameGroup,
  resolveAccessRequest,
  revokePermission,
  setPermissionRole,
} from "@/lib/access/access";

// 名簿の番人（1 本ずつ、必ず自分で名簿を確かめる・名簿に無い人には 404）。人の面の実行係と同じ 1 つを使う
import { requireAdmin } from "./require-admin";

/** 打ち込まれた文字を 1 本取り出す。 */
function text(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === "string" ? value.trim() : "";
}

/**
 * 保管庫が振る目印の形（36 桁の UUID）。
 *
 * **道筋に載せる id は、必ずこれを通したものだけ。** 隠し値は画面から送られてくるので、
 * 中身は人が書いた文字と同じだけ信用できない。形を確かめずに `?p=` へ継ぐと、
 * 送られた文字がそのまま道筋——履歴にも共有されたリンクにも残る場所——へ流れる。
 * 形が違えば、選択を捨ててその面の一覧へ戻す（実害のある操作はどのみち保管庫が弾く）。
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 隠し値から目印を 1 本。形が違えば null。 */
function uuid(form: FormData, name: string): string | null {
  const value = text(form, name);
  return UUID.test(value) ? value : null;
}

/**
 * 人の目印の形（16 進 12 桁）。正本は `src/lib/access/access.ts` の `memberKeyOf`。
 *
 * **道筋にメールアドレスを載せないため**に、人はこの片方向の目印で指す。
 * UUID と同じく、隠し値で来たものは形を確かめてからでないと道筋へ継がない。
 */
const MEMBER_KEY = /^[0-9a-f]{12}$/;

/** 隠し値から人の目印を 1 本。形が違えば null。 */
function memberKey(form: FormData, name: string): string | null {
  const value = text(form, name);
  return MEMBER_KEY.test(value) ? value : null;
}

/** 面（選択なし）。既定の面は申請。 */
const HOME = "/sharing";

/** ページの面（選択なし）。 */
const PAGES = "/sharing?tab=pages";

/** グループの面（選択なし）。 */
const GROUPS = "/sharing?tab=groups";


/**
 * 元に戻せない操作が終わったことを伝える合言葉。
 *
 * **文そのものは道筋に載せない。** 載せるのはこの決まった 4 語だけで、文言は画面が持つ
 * （src/app/sharing/page.tsx の DONE）。人が書いた文字を URL に流さないのは断りと同じ決まりで、
 * 出すのも「押したものが画面から消える」3 つだけ——足す・外すは結果が行として現れる
 * （人の面の 2 つは src/app/sharing/people-actions.ts）。
 */
type Done = "approved" | "rejected" | "group-deleted";

/** グループの面（選択なし）に、終わったことの一言を添えて。 */
function groupsDone(done: Done): string {
  return `/sharing?tab=groups&done=${done}#notice`;
}

/** そのページを開いたまま。 */
function pageOpen(pageId: string, done?: Done): string {
  if (done === undefined) return `/sharing?p=${pageId}`;
  return `/sharing?p=${pageId}&done=${done}#notice`;
}

/** そのグループを開いたまま。 */
function groupOpen(groupId: string): string {
  return `/sharing?g=${groupId}`;
}

/** その人を開いたまま（人の面の詳細）。 */
function memberOpen(key: string): string {
  return `/sharing?m=${key}`;
}

/**
 * 断った理由の合言葉。`<面>-<理由>` の形にしてあり、頭がどの面の話かを言っている。
 *
 * 知らせの置き場は中身の頭 1 か所だけなので、飛び先はどれも `#notice`。
 * 変わるのは**どの面へ戻すか**で、そこは合言葉の頭と、保っておく選択が決める。
 */
type Failure =
  | "groups-domain"
  | "groups-name"
  | "pages-domain";

/** 断ったときに保っておく選択。どちらも UUID を確かめたものしか渡さない。 */
type Kept = { page?: string; group?: string };

/**
 * 失敗を画面に伝える。**載せるのはこの合言葉と、選んでいたものの目印だけ**。
 *
 * 打ち込まれたアドレスも、付けようとした名前も道筋には載せない。道筋は履歴にも
 * 共有されたリンクにも残るので、人が書いた文字をそこへ流さない（src/app/devices/actions.ts と同じ決まり）。
 */
function failed(code: Failure, kept: Kept = {}): never {
  // 断りは `error=` があるときだけ描かれるが、ここは必ず `error=` を積むので、
  // 知らせ置き場が空のまま飛ばされることは起きない。
  // 選択が無いまま断られるのはグループを作るときだけ。そのときはグループの面の頭へ戻す
  let keep = "&tab=groups";
  if (kept.page !== undefined) keep = `&p=${kept.page}`;
  else if (kept.group !== undefined) keep = `&g=${kept.group}`;
  redirect(`/sharing?error=${code}${keep}#notice`);
}

export async function createGroupAction(form: FormData): Promise<void> {
  const organization = await currentOrganization();
  const admin = await requireAdmin(organization);
  // 空の名前は createGroup 自身が断る（保管庫までは行かない）。
  // 「作れなかった」の出口を 1 つにまとめて、理由の出し分けを増やさない
  const created = await createGroup(organization, text(form, "name"), admin.email);
  if (created === null) failed("groups-name");
  // 作った直後にそのグループが開く。作る目的は「人を入れること」なので、
  // 作った先で一覧から探し直させない
  redirect(UUID.test(created.id) ? groupOpen(created.id) : GROUPS);
}

export async function renameGroupAction(form: FormData): Promise<void> {
  const organization = await currentOrganization();
  const admin = await requireAdmin(organization);
  const id = uuid(form, "id");
  // どのグループかが欠けているのは人の打ち間違いではない（隠し値）。文言を出さずに戻す
  if (id === null) redirect(GROUPS);
  // 空の名前も、すでにある名前も renameGroup が false で返す
  if (!(await renameGroup(organization, id, text(form, "name")))) failed("groups-name", { group: id });
  redirect(groupOpen(id));
}

export async function deleteGroupAction(form: FormData): Promise<void> {
  const organization = await currentOrganization();
  const admin = await requireAdmin(organization);
  const id = uuid(form, "id");
  if (id !== null) await markGroupDeleted(organization, id);
  // 消えたものは選べない。道筋を書き直すので、確認の指定（?confirm=...）もここで落ちる。
  // 元に戻せない一手なので、終わったことを一言だけ伝える（消えたことと、終わったことは別）
  redirect(groupsDone("group-deleted"));
}

export async function addMemberAction(form: FormData): Promise<void> {
  const organization = await currentOrganization();
  const admin = await requireAdmin(organization);
  const groupId = uuid(form, "groupId");
  if (groupId === null) redirect(GROUPS);
  const email = text(form, "email");
  if (email.length === 0) redirect(groupOpen(groupId));

  // redirect() は例外を投げて道筋を変える。try の中で呼ぶと自分の catch が食ってしまうので、
  // ここでは印を立てるだけにして、飛ぶのは try を出てから
  let outside = false;
  try {
    await addGroupMember(organization, groupId, email, admin.email);
  } catch (error) {
    if (!(error instanceof OutsideDomainError)) throw error;
    outside = true;
  }
  // 会社の外のアドレスは打ち間違い。黙って何も起きないと、入れたつもりで終わる
  if (outside) failed("groups-domain", { group: groupId });
  redirect(groupOpen(groupId));
}

/**
 * その人をグループから外す。**押した場所が 2 つある**（グループの面と、人の面）。
 *
 * どちらから押されたかは隠し値 `from`（人の目印）で受ける。形を確かめられたときだけ
 * その人の面へ戻し、それ以外はグループの面へ戻す。押した行が視界から消える操作なので、
 * 別の面へ飛ばされると「効いたのか」が分からなくなる。
 */
export async function removeMemberAction(form: FormData): Promise<void> {
  const organization = await currentOrganization();
  const admin = await requireAdmin(organization);
  const groupId = uuid(form, "groupId");
  const from = memberKey(form, "from");
  if (groupId === null) redirect(from === null ? GROUPS : memberOpen(from));
  const email = text(form, "email");
  if (email.length > 0) await removeGroupMember(organization, groupId, email);
  redirect(from === null ? groupOpen(groupId) : memberOpen(from));
}

/**
 * ページを 1 人に見せる（ページの詳細の付け足し）。
 *
 * どのページかは隠し値で来るが、形を確かめるだけで中身は突き合わせない——
 * 見せてよいページかの判定は、この口を叩ける人（管理者）にとっては全ページが対象なので、
 * ここで絞っても何も守れない。番人は入口の requireAdmin ただ 1 つ。
 */
export async function grantMemberAction(form: FormData): Promise<void> {
  const organization = await currentOrganization();
  const admin = await requireAdmin(organization);
  const pageId = uuid(form, "pageId");
  if (pageId === null) redirect(PAGES);
  const email = text(form, "email");
  if (email.length === 0) redirect(pageOpen(pageId));

  // 上の addMemberAction と同じ理由で、飛ぶのは try を出てから
  let outside = false;
  try {
    await grantToMember(organization, pageId, email, admin.email);
  } catch (error) {
    if (!(error instanceof OutsideDomainError)) throw error;
    outside = true;
  }
  if (outside) failed("pages-domain", { page: pageId });
  redirect(pageOpen(pageId));
}

/** ページをグループ 1 つに見せる。すでに出してあれば何も起きない（打ち直しで壊れない）。 */
export async function grantGroupAction(form: FormData): Promise<void> {
  const organization = await currentOrganization();
  const admin = await requireAdmin(organization);
  const pageId = uuid(form, "pageId");
  if (pageId === null) redirect(PAGES);
  const groupId = uuid(form, "groupId");
  if (groupId === null) redirect(pageOpen(pageId));

  await grantToGroup(organization, pageId, groupId, admin.email);
  redirect(pageOpen(pageId));
}

/**
 * 許可を 1 件外す。
 *
 * 目印だけでなくページも渡すのは、別のページに出してある許可を目印だけで消せないようにするため
 * （src/lib/access/access.ts の revokePermission が 2 つを突き合わせる）。
 * もう無かったときも戻り先は同じ。二重に押されても、断りの文言は出さない。
 *
 * こちらも押した場所が 2 つある（ページの面と、人の面）。`from` の扱いは
 * removeMemberAction と同じで、形を確かめられたときだけ人の面へ戻す。
 */
export async function revokePermissionAction(form: FormData): Promise<void> {
  const organization = await currentOrganization();
  const admin = await requireAdmin(organization);
  const pageId = uuid(form, "pageId");
  const from = memberKey(form, "from");
  if (pageId === null) redirect(from === null ? PAGES : memberOpen(from));
  const id = uuid(form, "id");
  if (id !== null) await revokePermission(organization, id, pageId);
  redirect(from === null ? pageOpen(pageId) : memberOpen(from));
}

/**
 * 個人あての許可を、見るだけ（viewer）と共同の作った人（owner）で付け替える。
 *
 * **確認を挟まない。** 押した先の同じ行に逆向きのボタンが出るので、間違えても 1 クリックで
 * そのまま戻せる（確認を挟むのは、グループを消すのと人を組織から外す一手だけ）。
 * 終わったことの一言も出さない——結果は札そのものが変わって現れる。
 *
 * 押せる場所はページの詳細だけなので、戻り先もそのページ 1 本。役割が変わるのは
 * 「そのページの共有を触れるか」だけで、**見てよいかは 1 ミリも動かない**。
 *
 * 断りの文言は 1 つも出さない。ここで通らない値は 3 通りあるが、どれも人の打ち間違いでは
 * 起きない——目印が崩れているのも、決めた 2 語以外の向きも、まとまりあての行を指してくるのも、
 * 隠し値を書き替えたときにしか起きない（画面はグループの行にボタンを置かない）。
 * 黙ってそのページへ戻す。
 */
export async function setRoleAction(form: FormData): Promise<void> {
  const organization = await currentOrganization();
  const admin = await requireAdmin(organization);
  const pageId = uuid(form, "pageId");
  if (pageId === null) redirect(PAGES);
  const id = uuid(form, "id");
  if (id === null) redirect(pageOpen(pageId));

  // 向きは決めてある 2 語だけ。ここで形から確かめておくと、保管庫へ渡る値が
  // 「viewer か owner のどちらか」であることを型のうえでも言い切れる
  const to = text(form, "to");
  if (to !== "viewer" && to !== "owner") redirect(pageOpen(pageId));

  // 返る答えは 3 通り（付け替えた・行がもう無い・まとまりあてだった）だが、行き先は同じ。
  // 後ろ 2 つは画面からは起こせないので、それぞれに文言を持たせても読む人が居ない
  await setPermissionRole(organization, id, pageId, to);
  redirect(pageOpen(pageId));
}

/**
 * 申し出をしまったあとの戻り先。
 *
 * ページの詳細から押したときだけ、そのページを開いたまま返す（`stay` の旗）。申請の面から
 * 押したときは申請の面へ戻す——そちらは「溜まったものを上から片付ける」場所なので、
 * 1 件ごとにページの面へ飛ぶと残りが見えなくなる。
 *
 * **どのページかは旗と一緒に送られてきた値ではなく、保管庫の行から採る。**
 * 隠し欄に別のページの目印を書き込まれても、行き先はその人が本当に申し出ていたページのまま。
 *
 * どちらの戻り先にも、終わったことの合言葉を添える。許可も却下も元に戻せない一手で、
 * 押した行は戻った先から消えているため。
 */
function afterRequest(form: FormData, pageId: string | null, done: Done): string {
  if (text(form, "stay") !== "1") return `/sharing?done=${done}#notice`;
  if (pageId === null || !UUID.test(pageId)) return `/sharing?tab=pages&done=${done}#notice`;
  return pageOpen(pageId, done);
}

/**
 * 申し出を承認する。
 *
 * どのページの誰かは、送られてきた値ではなく**保管庫の行から採る**。
 * しまうのと名簿に足すのは別々の動きで、しまえたときだけ足す
 * （二重に押されても、名簿に同じ人が 2 回入らない）。
 */
export async function approveRequestAction(form: FormData): Promise<void> {
  const organization = await currentOrganization();
  const admin = await requireAdmin(organization);
  const id = text(form, "id");
  if (id.length === 0) redirect(HOME);

  const request = await findPendingRequest(organization, id);
  if (request === null) redirect(HOME);

  const resolved = await resolveAccessRequest(organization, id, true, admin.email);
  if (resolved) {
    try {
      await grantToMember(organization, request.pageId, request.requesterEmail, admin.email);
    } catch (error) {
      if (!(error instanceof OutsideDomainError)) throw error;
    }
  }
  redirect(afterRequest(form, request.pageId, "approved"));
}

export async function rejectRequestAction(form: FormData): Promise<void> {
  const organization = await currentOrganization();
  const admin = await requireAdmin(organization);
  const id = text(form, "id");
  if (id.length === 0) redirect(HOME);

  // どのページ宛てかは、ページの詳細へ戻すときにしか要らない。要らないときに引きに行かない
  const stay = text(form, "stay") === "1";
  const request = stay ? await findPendingRequest(organization, id) : null;
  await resolveAccessRequest(organization, id, false, admin.email);

  // 呼び鈴から押したときは、そもそもページを引いていない（旗が無ければ行き先も見ない）
  redirect(afterRequest(form, request?.pageId ?? null, "rejected"));
}
