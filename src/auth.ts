import { AVATAR_REFRESH_MS, avatarPathOf } from "./lib/identity/avatar-id";
import { currentOrganization } from "./lib/organization/scope";
import NextAuth, { type DefaultSession } from "next-auth";
import Google from "next-auth/providers/google";

/** 90 日。1 度ログインしたら実質ずっと保持される長さ。 */
const SESSION_MAX_AGE_SECONDS = 90 * 24 * 60 * 60;

/**
 * 預かりを試した時刻（この実行環境の中だけ）。
 *
 * 手形を書き直せない場所（画面の組み立て）でも同じ処理が走るので、覚えておかないと
 * 預けられるまで毎回 Google へ取りに行く。試すのは 1 人 1 時間に 1 度まで。
 */
const avatarTries = new Map<string, number>();
const AVATAR_RETRY_MS = 60 * 60 * 1000;

/** 預かる部品（保管庫・縮める道具）は使うときだけ読み込む。ログインの部品を読む先々へ持ち込まない。 */
async function avatars(): Promise<typeof import("./lib/identity/avatars")> {
  return import("./lib/identity/avatars");
}

/**
 * 顔写真を預かってよい人か（要求の組織に所属がある人だけ）。ログインはドメインを見なくなったので、
 * 所属の無い外の人の写真まで保管庫へ書かない。読めなかったときは預からない（ログインそのものは止めない）。
 */
async function mayKeepAvatar(email: string): Promise<boolean> {
  try {
    const { memberOrganizationOf } = await import("./lib/organization/member-organization");
    return (await memberOrganizationOf(await currentOrganization(), email)) !== null;
  } catch {
    return false;
  }
}

function shouldTryKeeping(email: string): boolean {
  const now = Date.now();
  const last = avatarTries.get(email);
  if (last !== undefined && now - last < AVATAR_RETRY_MS) return false;
  if (avatarTries.size > 1000) avatarTries.clear();
  avatarTries.set(email, now);
  return true;
}

/** Google から返る素の profile から、型を壊さずに値を1つ取り出す。 */
function readClaim(profile: unknown, key: string): unknown {
  if (typeof profile !== "object" || profile === null) return undefined;
  const claims: Record<string, unknown> = { ...profile };
  return claims[key];
}

/**
 * Google のつなぎ先。
 *
 * 誰なのかを、ログインの引換券（ID トークン）ではなく **Google の窓口に聞きに行く**。
 * 引換券に載る中身は Google が絞っており、会社アカウントでは
 * 名前とメールは載るのに **顔写真の在りかが載らない**ことがある。
 * 実際、これまでに保存された行は名前だけ入って写真は空だった。
 * 窓口（userinfo）に聞けば写真の在りかも返ってくるので、そちらを使う。
 * 引換券そのものは今までどおり検証される（なりすまし対策は変わらない）。
 */
function googleProvider(): ReturnType<typeof Google> {
  const provider = Google({
    authorization: {
      params: {
        // Google 側のアカウント選択画面を会社のドメインに寄せる `hd` は、ここでは渡さない。宛先の組織が自動参加のドメインを
        // 1 つだけ持つときに、ログインの画面（src/app/signin/page.tsx）が押した瞬間に渡す（組織ごとに違うため）
        // 写真の在りかは数週間で切れるので、ログインし直さなくても取り直せる更新用の鍵を受け取る（src/lib/identity/avatars.ts）。
        // Google は同意の画面を出したときにしか鍵を渡さないので、ログインのたびに同意の画面を挟む
        access_type: "offline",
        prompt: "consent select_account",
      },
    },
  });
  // 窓口に聞きに行く設定を持つのは OIDC のつなぎ方のときだけ（Google はこちら）
  if (provider.type === "oidc") provider.idToken = false;
  return provider;
}

export const { auth, handlers, signIn, signOut } = NextAuth({
  providers: [googleProvider()],
  session: {
    strategy: "jwt",
    maxAge: SESSION_MAX_AGE_SECONDS,
  },
  pages: {
    signIn: "/signin",
    error: "/signin",
  },
  callbacks: {
    /**
     * 通すのは「Google が確かめたアドレス」だけ。**ドメインは見ない**（決定 2）。
     * ログインは「誰か」を確かめるだけで、「どこに入れるか」はログインのあとに要求の組織への所属で決める
     * （src/lib/identity/identity.ts・src/lib/organization/member-organization.ts）。所属の無い人はログインできても、社内の入口はどれも通らない。
     */
    signIn({ profile }) {
      const email = readClaim(profile, "email");
      const verified = readClaim(profile, "email_verified");
      return typeof email === "string" && email.length > 0 && verified === true;
    },

    /**
     * 顔写真を手形（セッション）と保管庫にそろえる。
     *
     * `profile` が渡ってくるのはログインした瞬間だけ。そのときに写真の在りかと更新用の鍵を
     * 手形へ書き写し、写真そのものを預かる（src/lib/identity/avatars.ts）。
     * 手形は 90 日持ち歩くが、在りかは数週間で切れる。だから預かった写真が無い・古くなった
     * ときは、更新用の鍵で Google に新しい在りかを聞き直して取り直す（ログインし直させない）。
     */
    async jwt({ token, profile, account }) {
      const picture = readClaim(profile, "picture");
      if (typeof picture === "string" && picture.length > 0) {
        token.picture = picture;
        if (typeof account?.refresh_token === "string") token.googleRefreshToken = account.refresh_token;
        // 在りかは数週間で使えなくなるので、新しいうちに写真そのものを預かる（src/lib/identity/avatars.ts）
        if (typeof token.email === "string" && await mayKeepAvatar(token.email) && await (await avatars()).keepAvatar(token.email, picture)) token.avatarKeptAt = Date.now();
        return token;
      }
      // 預かった写真が無い・古くなったときは、取り直して預け直す（試すのは 1 人 1 時間に 1 度まで）
      const keptAt = typeof token.avatarKeptAt === "number" ? token.avatarKeptAt : null;
      if (typeof token.email === "string" && (keptAt === null || Date.now() - keptAt > AVATAR_REFRESH_MS) && shouldTryKeeping(token.email) && await mayKeepAvatar(token.email)) {
        const refreshToken = typeof token.googleRefreshToken === "string" ? token.googleRefreshToken : null;
        const result = await (await avatars()).refreshAvatar(token.email, refreshToken, typeof token.picture === "string" ? token.picture : null);
        if (result.picture !== null) token.picture = result.picture;
        if (result.revoked) delete token.googleRefreshToken;
        if (result.kept) token.avatarKeptAt = Date.now();
      }
      return token;
    },

    /**
     * 画面へは**預かった写真の口**を渡す（`avatarPathOf`）。Google の在りかは渡さない——
     * 使えなくなると 200 で人型を返し、画面の「読めなければ頭文字」が効かないため。
     * まだ預かっていない人は Google の在りかのまま（読めれば出る・預かれば次から切り替わる）。
     */
    session({ session, token }) {
      const picture = typeof token.picture === "string" ? token.picture : null;
      const kept = typeof token.avatarKeptAt === "number" && typeof token.email === "string" ? avatarPathOf(token.email) : null;
      session.user.image = kept ?? picture;
      return session;
    },
  },
});
