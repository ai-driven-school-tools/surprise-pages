/**
 * 見てよいか・直してよいか・共有を動かしてよいかの述語と、その材料の形。
 * 保管庫に触らない純粋な計算だけを置く。外からは src/lib/access/access.ts を通して使う。
 */
import { isPersonalEdition, isSiteOwner, validEmail } from "../settings/site-settings";
import { isMember, type Identity, type Member } from "../identity/identity";
import type { OrganizationRole } from "../organization/organizations";
import { sameEmail } from "../identity/member-name";
import { VISIBILITIES, type Visibility } from "../pages/content";
import { type StoredPage } from "../pages/store";
import { parsePageSlug } from "../comments/comments";
import { normalize } from "./rows";
import { LocalizedError } from "../i18n/errors";

// ---------------------------------------------------------------------------
// 形
// ---------------------------------------------------------------------------

/**
 * 見てよいか。断るときは理由まで返す。入口はこれを見て行き先を決める:
 *   signin     … 名乗っていない → ログインへ送る
 *   restricted … 名乗っているが名簿に無い → 403 と「見せてほしい」の導線へ
 *   notFound   … ページが無い / 消されている → 404
 *
 * 「無い」と「見せない」を混ぜない。制限つきのページに 404 を返すと、
 * 許可を頼む相手が分からないまま行き止まりになる。
 */
export type PageAccess =
  | { allowed: true }
  | { allowed: false; reason: "signin" }
  | { allowed: false; reason: "restricted" }
  | { allowed: false; reason: "notFound" };

const ALLOWED: PageAccess = { allowed: true };
const NEEDS_SIGNIN: PageAccess = { allowed: false, reason: "signin" };
const NOT_ALLOWED: PageAccess = { allowed: false, reason: "restricted" };
const NOT_FOUND: PageAccess = { allowed: false, reason: "notFound" };

/**
 * ページの見せ方。保管庫の pages.visibility に入りうる 3 通り。
 *
 * 正本は src/lib/pages/content.ts。ここは判定に使う名前として通しているだけで、
 * 並びを書き写していない（写すと、片方だけ増やしたときに静かに食い違う）。
 */
export const ACCESS_VISIBILITIES = VISIBILITIES;
export type AccessVisibility = Visibility;

/** 許可の相手の種類。 */
export const GRANTEE_KINDS = ["member", "group"] as const;
export type GranteeKind = (typeof GRANTEE_KINDS)[number];

/**
 * 許可 1 行の役割。
 *
 *   viewer … 見られるだけ（既定）
 *   owner  … 見られるうえに、共有の設定そのものを触れる（＝共同の作った人）
 *
 * **役割は「見てよいか」を 1 ミリも変えない。** owner も viewer も、名簿に載っている
 * という 1 点で見られる。増えるのは「共有を触れるか」だけ（canManageSharing）。
 *
 * owner を持てるのは個人あての行だけ。まとまりに owner を出すと、まとまりへ 1 人
 * 足すだけで共有を触れる人が増えてしまう（保管庫側の制約
 * page_permissions_owner_is_member が同じ決まりを持っている）。
 */
export const PERMISSION_ROLES = ["viewer", "owner"] as const;
export type PermissionRole = (typeof PERMISSION_ROLES)[number];

export type PagePermission = {
  id: string;
  granteeKind: GranteeKind;
  /** 個人に出した許可のとき、その人のメールアドレス */
  memberEmail: string | null;
  /** まとまりに出した許可のとき、そのまとまり */
  groupId: string | null;
  addedBy: string | null;
  addedAt: string;
  /** 見るだけか、共有も触れるか */
  role: PermissionRole;
};

/**
 * 役割を付け替えた結果。投げずに返す（画面が理由ごとに文言を出し分けるため）。
 *
 *   changed … 付け替えた
 *   missing … その行がもう無い（取り消し済み・二重押し）
 *   group   … まとまりあての行だった（共同の作った人にはできない）
 */
export type RoleChangeOutcome = "changed" | "missing" | "group";

export type Group = {
  id: string;
  name: string;
  createdBy: string | null;
  createdAt: string;
};

export type AccessRequest = {
  id: string;
  requesterEmail: string;
  requesterName: string | null;
  createdAt: string;
};

/** 管理者の名簿 1 行。 */
export type Admin = { email: string; addedBy: string | null; addedAt: string };

/**
 * 組織の人の役割を変える・外す、の可否。断るときは理由まで返す。
 *   forbidden … 押した人が組織の管理者（持ち主・管理者）ではない
 *   self      … 押した人自身（自分の役割は落とせない・自分は外せない。押し間違いで締め出されると戻す手立てが無い）
 *   owner     … 持ち主を触る・持ち主にするのに、押した人が持ち主ではない（管理者が持ち主を外して乗っ取れないように）
 *   same      … いまと同じ役割（何も変わらない）
 *   last      … 最後の持ち主（持ち主のいない組織では最後の管理者）が居なくなる
 */
export type MemberChangeVerdict = "ok" | "forbidden" | "self" | "owner" | "same" | "last";

/** 何をしようとしているか。 */
export type MemberChange = { kind: "remove" } | { kind: "role"; role: OrganizationRole };

/** 判定に渡す人 1 人（アドレスと、いまの役割）。 */
export type RosterEntry = { email: string; role: OrganizationRole };

/**
 * 可否を決めるのに要る材料。保管庫から引いた結果をこの形に畳んでから渡す。
 *
 * 材料と判定を分けてあるのは、判定だけを保管庫なしで走らせて確かめられるようにするため
 * （tests/checks/check-access.mjs が総当たりで呼んでいる）。
 */
/**
 * すでに引いてある（あるいは、いま引いている最中の）「管理者か」の答え。
 *
 * 値だけでなく**問い合わせそのもの**も受け取れるようにしてある。答えを待ってから
 * 次を頼むと往復が縦に積み上がるので、呼び出し側は先に投げておき、
 * ここは要るときにだけ待つ（投げるのは同時、待つのは要るときだけ）。
 *
 * 関数は米国東部、保管庫は東京にあって 1 往復が 150 ミリ秒かかる。
 * 保管庫の中で答えを出すのは 0.2 ミリ秒なので、遅さの実体は距離だけ——
 * つまり**縦に並べた回数がそのまま待ち時間**になる。
 */
export type AdminAnswer = boolean | Promise<boolean>;

export type AccessFacts = {
  /** pages.visibility の値そのまま。知らない値なら「無い」扱いになる */
  visibility: string;
  /** 消した印が立っているか */
  deleted: boolean;
  /** ページを作った人（所有者）のメールアドレス */
  createdBy: string | null;
  /** 管理者か */
  admin: boolean;
  /** 個人として、または入っているまとまり経由で許可されているか */
  granted: boolean;
};

// ---------------------------------------------------------------------------
// 純粋な計算（保管庫に触らない）
// ---------------------------------------------------------------------------

/**
 * 保管庫の行の見せ方を読み取る。知らない値は null。
 *
 * 受け口を string にしてあるのは、いま共有している型（src/lib/pages/content.ts の Visibility）が
 * まだ 2 通りしか知らないため。列には 'restricted' が入りうるので、
 * 型のほうが追いつくまでは文字列として受けて、ここで 1 度だけ確かめる。
 */
export function toAccessVisibility(value: string): AccessVisibility | null {
  return ACCESS_VISIBILITIES.find((known) => known === value) ?? null;
}

/**
 * 組織の管理者の役割か（持ち主・管理者）。全部のページを開けられ、共有と本文を直せる（決定 4）。
 * 役割から「何ができるか」を決めるのはここだけ。
 */
export function administersRole(role: OrganizationRole): boolean {
  return role === "owner" || role === "admin";
}

/**
 * 組織の独自ドメインをつなぐ・確かめる・外すことができる役割か。**持ち主だけ**——宛先を変えると、
 * 組織の全員が使う URL と、ログインの戻り先が変わる。管理者は今の状態を見るだけ。
 */
export function canManageCustomDomain(role: OrganizationRole): boolean {
  return role === "owner";
}

/**
 * 組織のデータを丸ごと書き出せる役割か。**持ち主だけ**——書き出しには全部の版・名簿で絞ったページ・コメント・名簿・
 * 記録が入る（管理者が画面で開ける範囲より広い・組織を持ち帰るための手続き）。書き出しのリンクも持ち主にだけ開く。
 */
export function canExportOrganization(role: OrganizationRole): boolean {
  return role === "owner";
}

/**
 * 組織を解約できるか。**持ち主だけ**で、**最初の組織（最初の組織）は誰も解約できない**（釦を出さず、実行係でも断る）。
 * 管理者はできない（契約の終了は持ち主の判断）。
 */
export function canCancelOrganization(organizationId: string, role: OrganizationRole, firstOrganizationId: string): boolean {
  return role === "owner" && organizationId !== firstOrganizationId;
}

/** その人が、名乗りに付いた所属の役割で組織の管理者か。 */
export function administersOrganization(member: Member): boolean {
  return administersRole(member.organization.role);
}

/**
 * 名簿（共有の許可・まとまり・見せてほしい・管理者・録音の共有）に入れてよいアドレスか。
 *
 * 通すのは、宛先の組織の**自動参加のドメイン**のアドレス（`domains`・呼ぶ側が組織の設定から引いて渡す）。
 * 通ったら小文字に揃えた形を返す（保存も照合もこの形でやる）。ドメインの文字列はここに書き写さない。
 * 自動参加のドメインの外の所属（招いた外の人）を名簿へ入れられるようにするのは、招待の画面（B1）と一緒に足す。
 */
export function toMemberEmail(value: unknown, domains: readonly string[]): string | null {
  if (isPersonalEdition()) return validEmail(value);
  if (typeof value !== "string") return null;
  const email = normalize(value);
  const at = email.lastIndexOf("@");
  // `@example.com` だけ（@ の前が空）は人ではない
  if (at <= 0 || email.slice(0, at).includes("@") || /\s/.test(email)) return null;
  return domains.includes(email.slice(at + 1)) ? email : null;
}

/**
 * 見せ方に「制限」を付け外しできるか。
 *
 * 公開ページには効かせない。公開を制限に変えるのは、呼び名（`public/...`）も
 * 素材の置き場所も過去の版の凍結先も丸ごと引っ越す話になる。
 * ここは列を 1 つ書き換えるだけの入口なので、断る。
 */
export function canToggleRestricted(visibility: string): boolean {
  const known = toAccessVisibility(visibility);
  return known === "internal" || known === "restricted";
}

/**
 * 社外への公開を、あとから付け外しできるページか。
 *
 * 決めるのは**呼び名の頭**。ここは「見てよいか」の判定ではないので、呼び名を見てよい
 * （見てよいかを呼び名で決めてはいけないのは別の話・AGENTS.md）。
 *
 * 行き来できるのは呼び名が `internal/…` のページだけ:
 *
 *     呼び名 internal/…    公開する ──▶  /public/… が生える（/internal/… はそのまま生きている）
 *                          やめる  ──▶  /public/… が閉じる
 *
 *     呼び名 public/…      動かさない
 *
 * 公開として投稿したページを社内へ戻せないのは、そのページの URL が `/public/…` しか
 * 無いため。戻した瞬間に唯一の入口が閉じて、誰も開けないページになる。
 * 戻したいときは社内限定として投稿し直す（呼び名が変われば素材の置き場所も変わる）。
 */
export function canTogglePublic(pageSlug: string): boolean {
  return parsePageSlug(pageSlug)?.slugPrefix === "internal";
}

/**
 * 材料がそろった状態で、見てよいかを決める。
 *
 * 並び順に意味がある。消されたページはどの見せ方でも「無い」。
 * 名乗っていない人は、社内のものについては理由を明かさずログインへ送る。
 */
export function decideAccess(identity: Identity | null, facts: AccessFacts): PageAccess {
  if (facts.deleted) return NOT_FOUND;

  const visibility = toAccessVisibility(facts.visibility);
  // 知らない見せ方は通さない。増やしたときにここへ足し忘れても、開いてしまわない
  if (visibility === null) return NOT_FOUND;

  if (visibility === "public") return ALLOWED;

  // ログインしているが宛先の組織に所属が無い人には、ページがあることも教えない（無いのと同じ の決定 1）。
  // ログインへ送ると、ログイン済みなのでまた同じページへ戻る行き止まりの輪になる
  if (identity !== null && identity.kind === "outsider") return NOT_FOUND;

  // ここから先は会社の人だけ。ゲストも「まだ名乗っていない人」と同じ扱いにする
  if (!isMember(identity)) return NEEDS_SIGNIN;

  if (visibility === "internal" && !isPersonalEdition()) return ALLOWED;
  if (isPersonalEdition() && isSiteOwner(identity.email)) return ALLOWED;

  if (facts.admin && !isPersonalEdition()) return ALLOWED;
  if (!isPersonalEdition() && sameEmail(facts.createdBy, identity.email)) return ALLOWED;
  if (facts.granted) return ALLOWED;
  return NOT_ALLOWED;
}

/**
 * ページの道具箱（コメント・履歴）を触ってよいか。
 *
 * **「見てよいか」とは別の決めごと。** 門なし公開のページは誰でも読める記事で、
 * そこに社内の直しの会話や版の一覧を出さない。だから読める人と、道具箱を触れる人は
 * 同じにならない:
 *
 *   public     … 記事は誰でも読める。道具箱は会社の人だけ
 *   internal   … 門を通った時点で会社の人なので、答えは変わらない
 *   restricted … 同じ
 *
 * **入口ごとに `isMember` を書き比べない。** 道具箱に手が届く口はコメントの一覧・投稿・
 * 直し・履歴と 4 つ以上あり、1 つ書き忘れると「画面には出ないのに、窓口を直に叩けば
 * 読める」という壊れ方をする（画面を隠しただけでは中身は閉じない）。
 *
 * ページを受け取らないのは、答えが見せ方で変わらないから。**門を通したあとに呼ぶ**
 * 部品なので、消されたページ・名簿に無いページはここへ来る前に断られている。
 * 会社の人だという答えを型でも返すのは、呼んだ側が名乗りをもう一度確かめ直さずに
 * 済むようにするため（`isMember` と同じ作法）。
 */
export function canUsePageTools(identity: Identity | null): identity is Member {
  return isMember(identity);
}

/**
 * 共有の設定（誰に見せるか）を触れるのは、管理者・作った人・共同の作った人だけ。
 *
 * 共同の作った人（`ownerGrant`）は「許可の名簿に owner として載っている人」で、
 * 作った人が自分の手でこの 3 人目を増やせる。**渡さなければ既定は false**——
 * 触れる人を増やす材料なので、引き当てていない呼び出しが黙って広がることはない。
 *
 * 触れる対象は 2 通りある。名簿の付け外し（`internal` ⇄ `restricted`）と、
 * 社外への公開の付け外し（`internal` ⇄ `public`）。どちらも呼び名が
 * `internal/…` のページの話なので、条件はそのどちらかが成り立つこと。
 *
 * **公開中でも触れる形にしてある。** 見せ方だけを見て公開を弾くと、いったん
 * 公開に切り替えたページを二度とやめられない（設定の口ごと 404 になる）。
 * 公開として投稿したページ（呼び名が `public/…`）は今までどおり触れない——
 * あちらには名簿も無く、社内へ戻す道も無い（`canTogglePublic`）。
 */
export function canManageSharing(
  identity: Identity | null,
  page: StoredPage,
  admin: boolean,
  ownerGrant: boolean = false,
): boolean {
  if (!isMember(identity)) return false;
  if (page.deletedAt !== null) return false;
  if (page.recordingProtected) return false;
  if (isPersonalEdition()) return isSiteOwner(identity.email);
  if (!canToggleRestricted(page.visibility) && !canTogglePublic(page.pageSlug)) return false;
  return admin || sameEmail(page.createdBy, identity.email) || ownerGrant;
}

/**
 * ページの本文をブラウザから直せるのは、管理者・作った人・共同の作った人だけ。
 *
 * **「見てよいか」とも「道具箱を触れるか」とも別の決めごと。** 社内ページは会社の
 * 全員が読めるが、直してよいのは持ち主の側だけ——履歴には直した人の名前が刻まれ、
 * ページの言うことがその人の責任で変わるので、読める人の全員に開けない。
 *
 * 顔ぶれは共有の設定（canManageSharing）と同じ 3 人だが、**条件は 1 つ少ない**。
 * あちらは「見せ方を動かせるページか」（canToggleRestricted / canTogglePublic）を
 * 見るが、本文の直しは見せ方を 1 ミリも動かさないので、公開として投稿したページ
 * （呼び名が `public/…`）でも作った人は直せる。ここを共用にすると、
 * 公開として投稿したページだけ「直す道が CLI しか無い」に静かに戻る。
 *
 * `ownerGrant` の既定が false なのも canManageSharing と同じ理由——直せる人を
 * 増やす材料なので、引き当てていない呼び出しが黙って広がることはない。
 *
 * **ownerGrant を引くのは制限つきのページだけ。** 共同の作った人が効くのは、
 * 名簿で見る人を絞ったページに限る。旗（/api/comments）と API（/api/pages/edit）
 * が同じ条件で揃えている——制限つき以外では引かず false のまま渡す。ふつうの
 * 社内ページの読み手全員に 1 往復足さない、という旗側の速さの決めにも揃う。
 *
 * **ここ以外の場所で可否を判断しない。** 入口は 3 つ以上ある（取り寄せ・保存・
 * ボタンを出すかの旗）。入口ごとに書き比べると、ボタンは出ないのに窓口を直に
 * 叩けば書ける、という壊れ方をする。
 */
export function canEditPage(
  identity: Identity | null,
  page: StoredPage,
  admin: boolean,
  ownerGrant: boolean = false,
): boolean {
  if (!isMember(identity)) return false;
  if (page.deletedAt !== null) return false;
  if (page.recordingProtected) return sameEmail(page.createdBy, identity.email);
  if (isPersonalEdition()) return isSiteOwner(identity.email);
  return admin || sameEmail(page.createdBy, identity.email) || ownerGrant;
}

/** 役割の並び（強い順）。画面の並びと選択肢の順はここから。 */
export const ORGANIZATION_ROLE_ORDER: readonly OrganizationRole[] = ["owner", "admin", "member"];

/**
 * 組織の人の役割を変えてよいか・外してよいか。保管庫に触らない純粋な計算（決定 2）。
 *
 * **画面（src/app/sharing/people.tsx）と実行係（src/app/sharing/people-actions.ts）が同じここを見る。**
 * 見せる／見せないの決まりと、押されたときに通す／断るの決まりを別々に書くと、
 * 片方だけ直したときに「押せるのに断られるボタン」が静かに生まれる。決まりはここに 1 つだけ置く。
 *
 * 並び順に意味がある（自分 → 持ち主 → 同じ → 最後の 1 人）。最後の 1 人の数え方は、保存先の番人
 * （organization_members_keep_manager）と同じ: 持ち主のいる組織では持ち主を 0 人にしない、持ち主のいない組織
 * （いまの 最初の組織）では管理者を 0 人にしない。番人は取り返しのつかないほうを塞ぐ最後の砦で、ここは押せる口を出すかの判定。
 *
 * アドレスはそろえてから比べる（大文字混じりや前後の空白で「同じ人なのに別人に見える」と、自分を外す歯止めが外れる）。
 * `roster` は組織の有効な所属（同じ人が 2 行あっても 1 人として数える）。
 */
export function canChangeMember(
  actor: RosterEntry,
  target: RosterEntry,
  change: MemberChange,
  roster: readonly RosterEntry[],
): MemberChangeVerdict {
  if (!administersRole(actor.role)) return "forbidden";
  if (normalize(actor.email) === normalize(target.email)) return "self";
  const touchesOwner = target.role === "owner" || (change.kind === "role" && change.role === "owner");
  if (touchesOwner && actor.role !== "owner") return "owner";
  if (change.kind === "role" && change.role === target.role) return "same";

  const others = new Map<string, OrganizationRole>();
  for (const one of roster) if (normalize(one.email) !== normalize(target.email)) others.set(normalize(one.email), one.role);
  const next = change.kind === "role" ? change.role : null;
  const owners = [...others.values()].filter((role) => role === "owner").length;
  const managers = [...others.values()].filter(administersRole).length;
  if (target.role === "owner" && next !== "owner" && owners === 0) return "last";
  if (target.role === "admin" && next !== "admin" && next !== "owner" && owners === 0 && managers === 0) return "last";
  return "ok";
}

/** その人の役割を、押した人が変えられる先（いまの役割と、通らない先は入れない）。画面の選択肢はここから出す。 */
export function assignableRoles(actor: RosterEntry, target: RosterEntry, roster: readonly RosterEntry[]): OrganizationRole[] {
  return ORGANIZATION_ROLE_ORDER.filter((role) => canChangeMember(actor, target, { kind: "role", role }, roster) === "ok");
}

/**
 * その役割で人を招いてよいか。招けるのは組織の管理者だけで、持ち主として招けるのは持ち主だけ
 * （管理者が「持ち主」の招待を作れると、別のアカウントを持ち主にして乗っ取れる）。
 */
export function canInvite(actor: RosterEntry, role: OrganizationRole): boolean {
  if (!administersRole(actor.role)) return false;
  return role !== "owner" || actor.role === "owner";
}

/** 押した人が招ける役割（画面の選択肢）。 */
export function invitableRoles(actor: RosterEntry): OrganizationRole[] {
  return ORGANIZATION_ROLE_ORDER.filter((role) => canInvite(actor, role));
}

/**
 * 誰でもアドレスを作れる無料のメールのドメイン（Google の個人のアカウントにも使える）。自動参加に結ぶと世界中の人が組織に入るので足せない。
 * 「持っているドメインか」を運営者が確かめる形（と、同じドメインの早い者勝ち）は組織を作る入口（B4）で扱う。
 */
const CONSUMER_DOMAINS: readonly string[] = [
  "gmail.com", "googlemail.com",
  "outlook.com", "outlook.jp", "hotmail.com", "hotmail.co.jp", "live.com", "live.jp", "msn.com",
  "yahoo.com", "yahoo.co.jp", "ymail.com",
  "icloud.com", "me.com", "mac.com",
  "proton.me", "protonmail.com", "pm.me",
  "aol.com", "gmx.com", "gmx.net", "mail.com", "zoho.com", "yandex.com", "qq.com", "163.com", "naver.com",
  "docomo.ne.jp", "ezweb.ne.jp", "au.com", "softbank.ne.jp", "i.softbank.jp",
];

/**
 * 自動参加に足してよいドメイン。足せるのは**押した人自身のアドレスのドメイン**だけ。
 *
 * 自動参加は「このドメインの Google アカウントなら誰でも、ログインした瞬間にメンバー」なので、打ち込んだ文字を
 * そのまま受けると、持ってもいないドメイン（他社・誰でも作れるもの）を結べてしまう。押した人が Google でそのドメインの
 * アドレスを確かめてあることを、持っていることの代わりにする。誰でも作れる Google の個人のドメインは足せない。
 * 管理者でなければ null。
 */
export function autoJoinDomainFor(actor: RosterEntry): string | null {
  if (!administersRole(actor.role)) return null;
  const email = normalize(actor.email);
  const at = email.lastIndexOf("@");
  if (at <= 0) return null;
  const domain = email.slice(at + 1);
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(domain)) return null;
  return CONSUMER_DOMAINS.includes(domain) ? null : domain;
}


/**
 * 運営者か。**組織の役割とは別の述語**——組織の管理者・持ち主であることとは無関係で（両方である人はいる）、
 * 運営者でも組織の中身（本文・コメント・名簿の詳細）は読めない。運営者にできるのは組織を作る・止める・再開する・段を変える・
 * 持ち主を招く・依頼に返事をする、だけ。
 *
 * `person` は**ブラウザの手形で Google が確かめた人**（鍵では運営者になれない・src/lib/organization-operations.ts の `currentOperator`）。
 * `operators` は運営者の名簿（platform_operators）。アドレスはそろえて比べる。
 */
export function isOperator(person: { email: string } | null, operators: readonly string[]): boolean {
  if (person === null) return false;
  return operators.some((email) => sameEmail(email, person.email));
}

/**
 * 自動参加のドメインを外してよいか。外すのは持ち主だけ（確認を挟む）。外すと、名簿に行の無い人（初めてログインする社員）が
 * 自動では入れなくなるので、組織の入口を閉じる重い一手として持ち主に限る。持ち主のいない組織（いまの 最初の組織）では誰も外せない。
 */
export function canRemoveAutoJoinDomain(actor: RosterEntry): boolean {
  return actor.role === "owner";
}

/**
 * 会社の外のアドレスを名簿に入れようとした。打ち間違いなので 400 で返す。
 * 文は辞書の鍵で持つ（窓口は `localizedMessage` でその人の言語にする。`message` は日本語のまま）。
 */
export class OutsideDomainError extends LocalizedError {
  readonly email: string;

  /** @param domains 宛先の組織の自動参加のドメイン（文言には先頭の 1 つを出す） */
  constructor(email: string, domains: readonly string[]) {
    super("admin.errors.outsideDomain", { domain: domains[0] ?? "", email });
    this.name = "OutsideDomainError";
    this.email = email;
  }
}

/**
 * 公開として投稿したページの見せ方を変えようとした（理由は `canTogglePublic`）。
 *
 * あのページの入口は `/public/…` しか無いので、社内へ寄せた瞬間に誰も開けなくなる。
 * 文言に仕組みの呼び名を出さない。読んだ人が次に何をすればよいかだけを書く。
 */
export class PageNotSwitchableError extends LocalizedError {
  constructor() {
    super("admin.errors.pageNotSwitchable");
    this.name = "PageNotSwitchableError";
  }
}
