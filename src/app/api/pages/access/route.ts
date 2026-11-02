import { revalidatePath } from "next/cache";
import { currentOrganization, type OrganizationScope } from "@/lib/organization/scope";
import { rt } from "@/lib/i18n/request";
import { dropPageDelivery } from "@/lib/pages/cache";

import { jsonError, jsonResponse, serverError } from "@/lib/api";
import {
  canManageSharing,
  canTogglePublic,
  findPendingRequest,
  grantToGroup,
  grantToMember,
  hasOwnerGrant,
  isAdmin,
  listGroups,
  listPagePermissions,
  listPendingRequests,
  openPage,
  OutsideDomainError,
  PERMISSION_ROLES,
  PageNotSwitchableError,
  resolveAccessRequest,
  revokePermission,
  setPageScope,
  setPermissionRole,
  toAccessVisibility,
  toMemberEmail,
  type AccessRequest,
  type AccessVisibility,
  type Group,
  type PagePermission,
  type PermissionRole,
} from "@/lib/access/access";
import { parsePageSlug } from "@/lib/comments/comments";
import { currentIdentity, isMember, type Member } from "@/lib/identity/identity";
import { requestAutoJoinDomains } from "@/lib/organization/member-organization";
import type { StoredPage } from "@/lib/pages/store";
import { routeLog } from "@/lib/logging/server-log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * ページの共有範囲（誰に見せるか）の読み書き。
 *
 * 触れるのは所有者・管理者・共同の作った人だけ（`canManageSharing` が正本）。
 * それ以外の人には、そんな設定が無いのと同じに見せる（404）。
 *
 * ここは**メールアドレスを返す唯一の口**。「誰に許可したか」を出すのが用なので、
 * 名前だけでは足りない（同姓同名を取り違えると、見せる相手を間違える）。
 * 返す相手は会社の人に限られている。公開ページには共有の設定そのものが無いので、
 * この応答が社外の人へ渡ることはない。
 *
 * 画面（ページの道具箱に付ける共有の板）は別の作業。ここはサーバー側の入口だけ。
 */

type PermissionView = {
  id: string;
  granteeKind: PagePermission["granteeKind"];
  memberEmail: string | null;
  groupId: string | null;
  /** グループに出した許可のとき、その名前（id だけでは画面に出せない） */
  groupName: string | null;
  /**
   * 見るだけの人か、共同の作った人か。
   *
   * 画面はこれを見て「作った人にする / 閲覧に戻す」を出し分ける。数え直させない
   * （誰が共有を触れるかの決まりを、ブラウザ側にもう 1 つ持たせないため）。
   */
  role: PermissionRole;
  /**
   * 見ている人自身に出した許可か。
   *
   * 画面はこれを見て、自分の行から「閲覧に戻す」「取り消す」を落とす。出したままだと、
   * 共有を触る力（前者）やページを見る力そのもの（後者）を自分から外せて、
   * 外したあとは自分では戻せない。
   *
   * 突き合わせはサーバーでやる（コメントの `mine` と同じ流儀）。**応答に
   * 「見ている人のアドレス」を増やさない**——画面が自分で照合できる形にすると、
   * 出す必要のないアドレスがもう 1 つ画面まで流れる。
   */
  mine: boolean;
};

/**
 * まだ答えていない「見せてほしい」1 件。
 *
 * 名前とアドレスの両方を返す。答えるのは**誰を入れるかを決める場面**なので、
 * 名前だけでは同姓同名を取り違える。返す相手はこの入口を通れる人（持ち主と管理者）に
 * 限られているので、`permissions` と同じ扱いでよい。
 */
type RequestView = {
  id: string;
  requesterEmail: string;
  requesterName: string | null;
  createdAt: string;
};

type AccessView = {
  pageSlug: string;
  /**
   * いまの見せ方。**旗を 2 つ持たない**（同じ 1 つの列を 2 つの真偽で表すと、
   * 2 つが食い違った状態を画面の側で作れてしまう）。
   */
  scope: AccessVisibility;
  /**
   * 見せ方を、この画面から変えられるページか。
   *
   * 画面に数え直させない。公開として投稿したページは動かせないのに、
   * 判断をブラウザ側に持たせると「押せるのに断られるボタン」が生まれる。
   */
  switchable: boolean;
  permissions: PermissionView[];
  /** 選べる閲覧グループの一覧（画面の選択肢に使う） */
  groups: { id: string; name: string }[];
  /** まだ答えていない申し出（新しい順） */
  requests: RequestView[];
};

/**
 * 同じ人か。大文字小文字と前後の空白を落としてから比べる。
 *
 * 名簿に積まれているアドレスは小文字に揃えてあるが、揃っている前提で比べない。
 * ここが外れると、自分の行が自分の行に見えなくなり、下の歯止めが静かに効かなくなる。
 */
function sameEmail(left: string | null, right: string): boolean {
  if (left === null) return false;
  return left.trim().toLowerCase() === right.trim().toLowerCase();
}

/** その許可 1 件が、見ている人自身に出したものか。 */
function isMine(permission: PagePermission, viewer: Member): boolean {
  return permission.granteeKind === "member" && sameEmail(permission.memberEmail, viewer.email);
}

function toView(
  viewer: Member,
  stored: StoredPage,
  permissions: readonly PagePermission[],
  groups: readonly Group[],
  requests: readonly AccessRequest[],
): AccessView {
  const names = new Map(groups.map((group) => [group.id, group.name]));
  return {
    pageSlug: stored.pageSlug,
    scope: stored.visibility,
    switchable: canTogglePublic(stored.pageSlug),
    permissions: permissions.map((permission) => ({
      id: permission.id,
      granteeKind: permission.granteeKind,
      memberEmail: permission.memberEmail,
      groupId: permission.groupId,
      groupName: permission.groupId === null ? null : (names.get(permission.groupId) ?? null),
      role: permission.role,
      mine: isMine(permission, viewer),
    })),
    groups: groups.map((group) => ({ id: group.id, name: group.name })),
    requests: requests.map((request) => ({
      id: request.id,
      requesterEmail: request.requesterEmail,
      requesterName: request.requesterName,
      createdAt: request.createdAt,
    })),
  };
}

/**
 * 対象のページを引いて、共有の設定を触ってよい人かまで確かめる。
 *
 * 見られない人には「無い」と返す。403 にすると、そのページがあることと、
 * 自分が所有者でないことの 2 つを教えてしまう。
 */
async function loadManageable(
  organization: OrganizationScope,
  viewer: Member,
  pageSlug: string,
): Promise<{ ok: true; page: StoredPage } | { ok: false; response: Response }> {
  const gate = await openPage(organization, viewer, pageSlug);
  if (!gate.ok) return { ok: false, response: jsonError(rt("toolbox.server.pageNotFound"), 404) };

  /*
   * 「管理者か」と「共同の作った人か」は互いの答えを要らないので、同時に投げる。
   * 縦に並べると、それだけで 1 往復（150 ミリ秒）ぶん余計に待つ。
   */
  const [admin, ownerGrant] = await Promise.all([
    isAdmin(organization, viewer),
    hasOwnerGrant(organization, gate.page.id, viewer.email),
  ]);
  if (!canManageSharing(viewer, gate.page, admin, ownerGrant)) {
    return { ok: false, response: jsonError(rt("toolbox.server.pageNotFound"), 404) };
  }
  return { ok: true, page: gate.page };
}

/** いまの共有範囲。 */
export async function GET(request: Request): Promise<Response> {
  return routeLog("/api/pages/access", request, async () => {
    const organization = await currentOrganization();
    const viewer = await currentIdentity();
    if (!isMember(viewer)) return jsonError(rt("toolbox.server.loginRequired"), 401);

    const page = parsePageSlug(new URL(request.url).searchParams.get("page"));
    if (page === null) return jsonError(rt("toolbox.server.badPage"), 400);

    try {
      const found = await loadManageable(organization, viewer, page.slug);
      if (!found.ok) return found.response;

      const [permissions, groups, requests] = await Promise.all([
        listPagePermissions(organization, found.page.id),
        listGroups(organization),
        listPendingRequests(organization, found.page.id),
      ]);
      return jsonResponse(toView(viewer, found.page, permissions, groups, requests), 200);
    } catch (error) {
      return serverError(error);
    }
  });
}

/** 送られてきた並びを、文字列の一覧として読み取る。1 つでも読めなければ null。 */
function readList(value: unknown): string[] | null {
  if (value === undefined || value === null) return null;
  if (!Array.isArray(value)) return null;
  const list: string[] = [];
  for (const entry of value) {
    if (typeof entry !== "string") return null;
    const tidy = entry.trim();
    if (tidy.length > 0) list.push(tidy);
  }
  return list;
}

/**
 * 申し出への返事 1 件。
 *
 * 並びでは受けない。承認は名簿への足し込みも連れてくるので、まとめて受けると
 * 「3 件目で失敗したとき、1・2 件目はどうなったのか」を応答 1 つで言えなくなる。
 * 1 件ずつなら、しまえたか否かの 2 択で済む。
 */
type Answer = { id: string; approved: boolean };

function readAnswer(value: unknown): Answer | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const record: Record<string, unknown> = { ...value };
  const id = record["id"];
  const approved = record["approved"];
  if (typeof id !== "string" || id.trim().length === 0) return null;
  if (typeof approved !== "boolean") return null;
  return { id: id.trim(), approved };
}

/**
 * 許可 1 件の役割の付け替え。
 *
 * 相手は目印で指す（並びでは受けない）。`answer` と同じで「積んである 1 行を
 * こう変えてほしい」であって、`members` のような「こうなっていてほしい全部」ではない。
 */
type RoleChange = { id: string; to: PermissionRole };

function readRoleChange(value: unknown): RoleChange | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const record: Record<string, unknown> = { ...value };
  const id = record["id"];
  if (typeof id !== "string" || id.trim().length === 0) return null;
  // 知らない役割は通さない（増やしたときにここへ足し忘れても、勝手に通らない）
  const to = PERMISSION_ROLES.find((known) => known === record["to"]);
  if (to === undefined) return null;
  return { id: id.trim(), to };
}

/**
 * 共有範囲をまとめて置き換える。
 *
 * 送るのは「こうなっていてほしい」形（誰に見せるかの全部）で、増やす / 減らすの
 * 指図ではない。指図の形にすると、画面を 2 つ開いて片方で消したときに、
 * もう片方の「1 件足す」が古い並びの上に乗って、消したはずの相手が戻る。
 *
 *   scope      … 望みの見せ方（restricted / internal / public。省略したら今のまま）
 *   members    … 見せる人のメールアドレス（省略したら今のまま）
 *   groups     … 閲覧グループの id（省略したら今のまま）
 *   answer     … 申し出 1 件への返事（{ id, approved }）
 *   role       … 許可 1 件の役割の付け替え（{ id, to }）
 *
 * 下の 2 つだけは別扱いにしてある。上の 3 つが「この姿にしてほしい」なのに対し、
 * こちらは「積んである 1 件をこうしてほしい」で、種類が違う。
 * 申し出も許可の目印も、望みの姿を並びで送りようがない。
 *
 * **`answer` と `role` は、ほかと混ぜて送れない**（混ざっていたら断る）。
 * 承認は名簿に 1 人足すので、同じ通信に古い `members` が乗っていると、
 * どちらを後にしても片方が消える。順番で結果が変わる送り方は受け付けない。
 */
export async function PUT(request: Request): Promise<Response> {
  return routeLog("/api/pages/access", request, async () => {
    const organization = await currentOrganization();
    const viewer = await currentIdentity();
    if (!isMember(viewer)) return jsonError(rt("toolbox.server.loginRequired"), 401);

    let payload: unknown;
    try {
      payload = await request.json();
    } catch {
      return jsonError(rt("toolbox.server.unreadableBody"), 400);
    }

    const record: Record<string, unknown> =
      typeof payload === "object" && payload !== null && !Array.isArray(payload) ? { ...payload } : {};

    const page = parsePageSlug(record["pageSlug"]);
    if (page === null) return jsonError(rt("toolbox.server.badPage"), 400);

    /*
     * 望みの見せ方は 1 つの値で受ける。
     *
     * 「制限を付けるか」と「社外に公開するか」を別々の真偽で受けていたころは、
     * 同じ 1 つの列を 2 つの旗で表していたので、2 つが同時に来ると矛盾した。
     * 値 1 つなら矛盾しようがなく、混ざらないための歯止めも要らない。
     * 知らない値は通さない（増やしたときにここへ足し忘れても、勝手に通らない）。
     */
    const scopeValue = record["scope"];
    let scope: AccessVisibility | null = null;
    if (scopeValue !== undefined) {
      if (typeof scopeValue !== "string") return jsonError(rt("toolbox.server.access.badScope"), 400);
      scope = toAccessVisibility(scopeValue);
      if (scope === null) return jsonError(rt("toolbox.server.access.badScope"), 400);
    }

    const members = readList(record["members"]);
    if (record["members"] !== undefined && members === null) {
      return jsonError(rt("toolbox.server.access.badMembers"), 400);
    }
    const groups = readList(record["groups"]);
    if (record["groups"] !== undefined && groups === null) {
      return jsonError(rt("toolbox.server.access.badGroups"), 400);
    }

    const answer = record["answer"] === undefined ? null : readAnswer(record["answer"]);
    if (record["answer"] !== undefined && answer === null) {
      return jsonError(rt("toolbox.server.access.badAnswer"), 400);
    }
    const role = record["role"] === undefined ? null : readRoleChange(record["role"]);
    if (record["role"] !== undefined && role === null) {
      return jsonError(rt("toolbox.server.access.badRole"), 400);
    }
    const alsoChangingScope =
      scope !== null || record["members"] !== undefined || record["groups"] !== undefined;
    if (answer !== null && alsoChangingScope) {
      return jsonError(rt("toolbox.server.access.answerWithScope"), 400);
    }
    // 役割の付け替えも、望みの姿（members の並び）とは混ぜない。
    // 混ぜると、同じ通信の中で並びが 1 行を消してから、その消えた行の役割を変えることになる
    if (role !== null && (alsoChangingScope || answer !== null)) {
      return jsonError(rt("toolbox.server.access.roleWithOthers"), 400);
    }

    // 会社の外のアドレスは、1 件でも混ざっていたらまとめて突き返す。
    // 読めたぶんだけ通すと、打ち間違いに気づかないまま「入ったつもり」になる
    const wantedMembers: string[] = [];
    const domains = members === null || members === undefined ? [] : await requestAutoJoinDomains(organization);
    for (const email of members ?? []) {
      const member = toMemberEmail(email, domains);
      if (member === null) return jsonError(new OutsideDomainError(email, domains).message, 400);
      wantedMembers.push(member);
    }

    try {
      const found = await loadManageable(organization, viewer, page.slug);
      if (!found.ok) return found.response;
      const target = found.page;

      /*
       * 自分で自分を締め出せないようにする門。
       *
       * 共同の作った人は、自分の行にも「閲覧に戻す」と「取り消す」を出せる立場にいる。
       * 前者を押せば共有を触る力が、後者を押せばページを見る力そのものが自分から外れ、
       * **外したあとは自分では戻せない**（もう入口が開かない）。画面でも隠すが、
       * 隠しただけでは通信を作れば通ってしまうので、ここでも断る。
       *
       * 見るのは自分の owner の行だけ。自分が「見るだけの人」として載っているだけなら、
       * 今までどおり自分で外してよい（外しても、作った人や管理者としての立場は残る）。
       *
       * **どの書き込みよりも先に置く。** 後ろに置くと、断ったのに見せ方の切り替えだけ
       * 通っている、という半端な結果が残る。ここで引いた並びは下の書き換えでも使い回す。
       */
      let known: PagePermission[] | null = null;
      if (role !== null || members !== null) {
        known = await listPagePermissions(organization, target.id);
        const mine = known.find((one) => one.role === "owner" && isMine(one, viewer));
        if (mine !== undefined) {
          if (role !== null && role.id === mine.id && role.to !== "owner") {
            return jsonError(
              rt("toolbox.server.access.selfDemote"),
              400,
            );
          }
          if (members !== null && !wantedMembers.some((email) => sameEmail(mine.memberEmail, email))) {
            return jsonError(
              rt("toolbox.server.access.selfRevoke"),
              400,
            );
          }
        }
      }

      if (answer !== null) {
        const pending = await findPendingRequest(organization, answer.id);
        /*
         * どのページの誰かは、必ず積まれている行から採る。送られてきた値を信じない。
         *
         * ページの一致もここで見る。見ないと、自分のページの持ち主でありさえすれば
         * **他人のページ宛ての申し出**を目印だけで承認でき、そのページの名簿に
         * 人を足せてしまう（管理画面と違い、この入口の関は 1 ページぶんしかない）。
         */
        if (pending === null || pending.pageId !== target.id) {
          return jsonError(rt("toolbox.server.access.requestMissing"), 404);
        }

        /*
         * 承認は「名簿に足す → 申し出をしまう」の順で行う。
         *
         * 逆にすると、足すところで失敗したときに「承認済みなのに入れない」が残り、
         * 頼んだ人は待たされ続ける（もう一度頼むこともできない。しまわれているので）。
         * この順なら、途中で転んでも申し出は積まれたままなので、押し直せば済む。
         * 同じ人を二度足しても何も起きないので、押し直しで壊れることもない。
         */
        if (answer.approved) {
          await grantToMember(organization, target.id, pending.requesterEmail, viewer.email);
        }
        await resolveAccessRequest(organization, answer.id, answer.approved, viewer.email);
      }

      if (role !== null) {
        /*
         * どの許可かはページごと絞ってから触る（目印だけで他のページの行を触らせない）。
         * まとまりあての許可には役割を持たせない——共有を触れるのは人であって、
         * 「その名前のまとまりに入っている人が全員」ではない。
         */
        const outcome = await setPermissionRole(organization, role.id, target.id, role.to);
        if (outcome === "group") {
          return jsonError(rt("toolbox.server.access.coOwnerMembersOnly"), 400);
        }
        if (outcome === "missing") return jsonError(rt("toolbox.server.access.grantMissing"), 404);
      }

      if (scope !== null) {
        try {
          await setPageScope(organization, target.id, scope);
        } catch (error) {
          if (error instanceof PageNotSwitchableError) return jsonError(error.message, 400);
          throw error;
        }

        /*
         * 公開でなくなったら、配信網に残っている紙を落としにかかる。
         *
         * 札で消す（dropPageDelivery）のが正。revalidatePath は上乗せで、
         * 効かない経路もあるので頼り切らない——切り替えでやめられるページは
         * 応答の側でも控えを 1 分しか持たせていない（src/lib/pages/cache.ts）。
         */
        if (scope !== "public") revalidatePath(`/public/${page.slug.split("/").slice(1).join("/")}`);
        await dropPageDelivery(target.id);
      }

      if (members !== null || groups !== null) {
        // 上の門で引いてあれば、それを使う（同じ並びを二度引かない。見せ方の切り替えでは変わらない）
        const current = known ?? (await listPagePermissions(organization, target.id));

        if (members !== null) {
          const has = new Set(
            current
              .filter((one) => one.granteeKind === "member")
              .map((one) => one.memberEmail ?? ""),
          );
          for (const email of wantedMembers) {
            if (!has.has(email)) await grantToMember(organization, target.id, email, viewer.email);
          }
          const keep = new Set(wantedMembers);
          for (const one of current) {
            if (one.granteeKind !== "member" || one.memberEmail === null) continue;
            if (!keep.has(one.memberEmail)) await revokePermission(organization, one.id, target.id);
          }
        }

        if (groups !== null) {
          const has = new Set(
            current.filter((one) => one.granteeKind === "group").map((one) => one.groupId ?? ""),
          );
          for (const groupId of groups) {
            if (!has.has(groupId)) await grantToGroup(organization, target.id, groupId, viewer.email);
          }
          const keep = new Set(groups);
          for (const one of current) {
            if (one.granteeKind !== "group" || one.groupId === null) continue;
            if (!keep.has(one.groupId)) await revokePermission(organization, one.id, target.id);
          }
        }
      }

      // 書いたあとの姿をそのまま返す。画面が自分で組み立て直さなくてよいように
      const after = await openPage(organization, viewer, page.slug);
      if (!after.ok) return jsonError(rt("toolbox.server.pageNotFound"), 404);
      const [permissions, allGroups, pending] = await Promise.all([
        listPagePermissions(organization, after.page.id),
        listGroups(organization),
        listPendingRequests(organization, after.page.id),
      ]);
      return jsonResponse(toView(viewer, after.page, permissions, allGroups, pending), 200);
    } catch (error) {
      if (error instanceof OutsideDomainError) return jsonError(error.message, 400);
      return serverError(error);
    }
  });
}
