import { mayPublish } from "../settings/site-settings";
import { cookies, headers } from "next/headers";
import { auth } from "@/auth";
import { GUEST_COOKIE, readGuest } from "../access/guest";
import { LOCAL_PREVIEW_MEMBER, isLocalPreviewMember, localPreviewMember } from "../pages/local-preview";
import { displayNameOf, emailKey, sameEmail } from "./member-name";
import { isAvatarPath } from "./avatar-path";
import { memberFromAuthorization, type KeyUse } from "./publish-tokens";
import type { CommentAuthor } from "../comments/types";
import { placeInOrganization, recordedMembers, type MemberOrganization, type RecordedPerson, type SignedInPerson } from "../organization/member-organization";
import { FIRST_ORGANIZATION, currentOrganization, type OrganizationScope } from "../organization/scope";
import { cache } from "react";

/**
 * 「いま操作している人が誰か」をサーバー側で確定させる。
 *
 * 名乗り方は 3 通り:
 *   投稿の鍵 … Authorization: Bearer（持ち主の会社アカウントとして名乗る）
 *   会社の人 … Google ログイン（Auth.js のセッション）
 *   ゲスト   … 昔「名前だけで参加した人」（署名付き cookie）
 *
 * **「会社の人」は、要求の組織に有効な所属がある人**。Google のドメインでは決めない。
 * ログインしていても所属が無ければ `outsider`（所属なし）になり、`isMember` は偽。鍵の持ち主も同じで、
 * 所属が外れた人の鍵は名乗れない（src/lib/identity/publish-tokens.ts）。所属は要求ごとに引く（src/lib/organization/member-organization.ts）。
 *
 * 投稿の鍵は発行時から持ち主のアドレスが載っている。コメントの読み書き・解決も、
 * 画面でログインした本人と同じ門を通る。
 *
 * ゲストの券は**もう発行されない**（公開ページも会社の人だけが書く）。まだ読むのは、
 * 昔そのやり方で書いた人が `/activity` で自分の分を引けるようにするため。
 *
 * 会社の人（鍵またはセッション）があるときは必ずそちらを優先する。社内の人が
 * たまたま昔のゲスト券を持っていても、社内の顔で書けるようにするため。
 *
 * **「いま誰か」を読むのは、このファイルの `currentIdentity` だけ。**
 * 画面・素材・コメント・OGP はここが返した名乗りだけを見る。入口ごとに
 * `ownerFromRequest` を足さない（門を 2 つ持つことになる）。手元でログインを
 * 省く仕掛け（src/lib/pages/local-preview.ts）も、だからここ 1 行で足りている。
 */
export type Identity =
  | {
      kind: "member";
      email: string;
      name: string | null;
      image: string | null;
      /**
       * 要求の組織での所属。役割は**要求ごとに名簿から引いた値**で、手形には焼かない
       * （外した・役割を変えた瞬間に次の要求から効く）。管理者かは src/lib/access/access.ts の `isAdmin` がここから決める。
       */
      organization: MemberOrganization;
    }
  | {
      /**
       * Google でログインしているが、要求の組織に有効な所属が無い人（外した人・招かれていない外の人）。
       * `isMember` は偽で、社内の入口はどれも通らない。ページの URL では「無い」（404）、ホームでは「この組織には参加していません」の 1 枚。
       */
      kind: "outsider";
      email: string;
      name: string | null;
      image: string | null;
      organization: OrganizationScope;
    }
  | { kind: "guest"; guestId: string; name: string };

/** 会社アカウントで名乗っている人（要求の組織の有効な所属）。 */
export type Member = Extract<Identity, { kind: "member" }>;

/** 昔「名前だけで参加した人」。 */
export type Guest = Extract<Identity, { kind: "guest" }>;

/** ログインしているが、要求の組織に所属の無い人。 */
export type Outsider = Extract<Identity, { kind: "outsider" }>;

/** ログインしているが、要求の組織に所属の無い人か（ホームの「参加していません」と、ページの 404 の見分けに使う）。 */
export function isOutsider(identity: Identity | null): identity is Outsider {
  return identity !== null && identity.kind === "outsider";
}

/**
 * 会社の人か。社内限定の入口はすべてこれで判定する。
 *
 * 名乗っていない（null）ときとゲストのときを 1 つの判定にまとめてある。
 * 入口ごとに `kind` を見比べていると、片方だけ書き方が違って
 * 「ゲストが社内の入口を通れる」種類の見落としが起きる。
 */
export function isMember(identity: Identity | null): identity is Member {
  return identity !== null && identity.kind === "member";
}

/**
 * その組織の有効な所属か。外のサービスへ組織の中身を送ってよいかの述語（Slack の知らせ・リンクの見出し・
 * 読み上げの自然な声）が「会社の人」をこの意味で読む。名乗りの所属が別の組織なら偽（名乗りは要求の組織で付くので、
 * 引き当てたページの組織や Slack の組織と食い違ったら送らない）。
 */
export function isMemberOf(identity: Identity | null, organization: OrganizationScope): identity is Member {
  return isMember(identity) && identity.organization.id === organization.id;
}

/** 宛先が読めない場所（検査の組み立てなど）ではヘッダが無いものとして扱う。 */
async function authorizationHeader(): Promise<string | null> {
  try {
    return (await headers()).get("authorization");
  } catch {
    return null;
  }
}

/**
 * @param use どの口の名乗りか。既定は Web の窓口。
 */
export async function currentIdentity(use: KeyUse = "web"): Promise<Identity | null> {
  /*
   * 投稿の鍵をいちばん先に見る。
   *
   * CLI やエージェントはセッションを持たず、Authorization だけを付ける。
   * 鍵が通った時点で持ち主の会社アカウントとして確定するので、手元の仮の人も
   * Google のセッションも見ない。手元で `pnpm dev` して鍵付きで叩いたときに、
   * 仮の人へ吸い込まれる事故を防ぐ（本番の保管庫へ仮の人の名前で跡が残る）。
   *
   * ヘッダが無ければ照合にも行かない。ブラウザの画面操作は今までどおり。
   */
  const authorization = await authorizationHeader();
  // 鍵が付いていれば、その口で使えない種類でもセッションへは落ちない（名乗り無しで返す）
  // 要求の組織は名乗りの入口でここ 1 度だけ決め、鍵の照合と所属の読みへ渡す（A5 で関所の宛先から）
  const organization = await currentOrganization();
  if (authorization !== null) return memberFromAuthorization(organization, authorization, use);

  /*
   * 手元で動かしているときだけ、ログインを省いた仮の人を返す。
   *
   * 本物のセッションを確かめる**前**に置いてある。手元には Google の鍵が無く、
   * 確かめに行っても答えは出ないため（鍵がまったく無いパソコンでは、
   * 確かめる処理そのものが止まる）。本番・Vercel・よその宛先では必ず null が
   * 返るので、下の流れは 1 文字も変わらない（歯止めは src/lib/pages/local-preview.ts）。
   */
  // 仮の人は 最初の組織 の member として作られている。ほかの組織の宛先（手元の `<呼び名>.localhost`）では使わない
  const local = organization.id === FIRST_ORGANIZATION.id ? await localPreviewMember() : null;
  if (local !== null) return local;

  const person = await sessionPerson(organization.id);
  // 会社の人かは、要求の組織への所属で決める（ドメインでは決めない・src/lib/organization/member-organization.ts）
  if (person !== null) return placeInOrganization(organization, person);

  const store = await cookies();
  const guest = readGuest(store.get(GUEST_COOKIE)?.value);
  if (guest === null) return null;
  return { kind: "guest", guestId: guest.guestId, name: guest.name };
}

/**
 * ブラウザの手形（Auth.js のセッション）の人。所属はまだ引いていない。画面を描く 1 回の中では 1 度だけ読む。
 *
 * **手形を作った宛先の組織（`org`）が、要求の組織と同じときだけ名乗れる**（決定 2）。手形の cookie は宛先ごと
 * （Domain を付けない）で、別の組織の宛先へ写しても、ここで名乗り無しになる。印の無い手形（この仕組みより前の手形・
 * 通し検査の手形）は 最初の組織 の宛先で作ったものとして読む（最初の組織 の宛先の今までの流れは変えない）。
 */
const sessionPerson = cache(async (organizationId: string): Promise<SignedInPerson | null> => {
  const session = await auth();
  const user = session?.user;
  if (!user || typeof user.email !== "string" || user.email.length === 0) return null;
  return {
    email: user.email,
    name: typeof user.name === "string" && user.name.length > 0 ? user.name : null,
    // 外部の画像は https のものだけ通す。こちらで預かった写真の口（src/lib/identity/avatars.ts）も通す
    image:
      typeof user.image === "string" && (user.image.startsWith("https://") || isAvatarPath(user.image)) ? user.image : null,
  };
});

/**
 * 所属を引く前の、ブラウザの手形の人。鍵（Authorization）のときは null。
 *
 * **素材の通行証を確かめる口（src/lib/pages/private-page.ts）と、組織の宛先へログインを渡す根の受け口（src/app/signin/handoff）と、
 * アプリのログインで組織を選ぶ口（src/lib/app-login-organizations.ts）と、運営者の名乗り（src/lib/organization-operations.ts。運営者は所属で決まらない）だけが使う。**
 * 根の受け口は「Google で確かめたのは誰か」だけを引換券に載せ、所属は渡した先の宛先が引く。 通行証は「10 分以内にこの人の門をこのページが通した」印で、
 * 画像 1 枚ごとに所属の名簿を引かずに済ませるため（大きな資料は画像が数十枚あり、1 枚ごとに引くと保存先が混み合う）。
 * **見てよいかの判定に使わない**——会社の人かは `currentIdentity` が所属で決める。
 */
export async function currentSessionPerson(): Promise<SignedInPerson | null> {
  if (await authorizationHeader() !== null) return null;
  // 手元の仮の人は見ない（仮の人に出した通行証は、手形の人と持ち主が合わないので効かない＝今までどおり門を通る）
  return sessionPerson((await currentOrganization()).id);
}

/**
 * 記録に残っている人（保存の途中の再確認・背景の処理の持ち主）を、いまの所属で名乗りにする。所属が外れていたら null。
 *
 * 名簿は読むだけで所属を作らない（src/lib/organization/member-organization.ts の `recordedMembers`）。手元の仮の人は名簿を引かず・書かず、
 * 仮の人の所属のまま返す（手元の `pnpm dev` は本番の保管庫を向いているので、名簿に仮の人の行を積まない）。
 */
export async function stillMembers(organization: OrganizationScope, people: readonly RecordedPerson[]): Promise<Map<string, Member>> {
  const local = people.filter((person) => isLocalPreviewMember(person));
  const found = await recordedMembers(organization, people.filter((person) => !isLocalPreviewMember(person)));
  for (const person of local) {
    found.set(emailKey(person.email), { kind: "member", email: person.email, name: person.name, image: null, organization: { ...organization, role: LOCAL_PREVIEW_MEMBER.organization.role } });
  }
  return found;
}

/** 1 人ぶんの `stillMembers`。 */
export async function stillMember(organization: OrganizationScope, person: RecordedPerson): Promise<Member | null> {
  return (await stillMembers(organization, [person])).get(emailKey(person.email)) ?? null;
}

/** 画面に出す形。メールアドレスはここで落とす。 */
export function toViewer(identity: Identity | null): CommentAuthor | null {
  if (identity === null || identity.kind === "outsider") return null;
  if (identity.kind === "guest") {
    return { kind: "guest", name: identity.name, image: null };
  }
  return {
    kind: "member",
    name: displayNameOf(identity.email, identity.name),
    image: identity.image,
  };
}

/** そのコメントを書いたのがこの人か。編集・削除を許すかの判断に使う。 */
export function ownsRow(
  identity: Identity | null,
  authorEmail: string | null,
  guestId: string | null,
): boolean {
  if (identity === null || identity.kind === "outsider") return false;
  if (isMember(identity)) {
    return sameEmail(authorEmail, identity.email);
  }
  return guestId !== null && guestId === identity.guestId;
}

/**
 * 鍵の発行など、投稿用の鍵に再委任しない操作の本人確認。
 *
 * 鍵が付いていれば名乗り無し。それ以外は `currentIdentity` と同じ決め方（手元でログインを省いた
 * 仮の人もここを通る——画面では見えるのに、お気に入りや個人設定だけ保存できない、を作らない）。
 * ゲストと、要求の組織に所属の無い人（と、配布版の設置した本人以外）は名乗れない。
 */
export async function currentBrowserIdentity(): Promise<Member | null> {
  if (await authorizationHeader() !== null) return null;
  const identity = await currentIdentity();
  if (!isMember(identity) || !mayPublish(identity.email)) return null;
  return identity;
}
