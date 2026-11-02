import { createHmac, timingSafeEqual } from "node:crypto";
import { GUEST_NAME_MAX_LENGTH } from "../comments/types";

/**
 * 名前だけで参加した人（ゲスト）の目印。
 *
 * 入場券のようなもの。名前と通し番号を書いた券に、破れないよう封（署名）をしてある。
 * ブラウザはそれを持ち歩くだけで、中身を書き換えても封が合わなくなるので、
 * 他人になりすませない。
 *
 * **券を作る口はもう無い。** 公開ページも会社の人だけが書ける形にしたので、
 * ここに残っているのは**読む側だけ**。昔このやり方で書いた人が `/activity` で自分の分を
 * 引けるように、持っている券は今までどおり読める（1 年で自然に切れる）。
 * 作る側を足し戻さないこと——足せば、社外の人が書ける道がそのまま開く。
 *
 * 券は httpOnly なので、ページに載った JavaScript からは読めない。
 * 読むのはこのファイルを通るサーバー側だけ。
 */

export const GUEST_COOKIE = "sp_guest";

export type Guest = {
  guestId: string;
  name: string;
};

/**
 * 封を確かめるための鍵。
 *
 * ゲスト用の鍵が置いてあればそれを、無ければログインの署名鍵を使う。
 * 分けてあるのは、片方を入れ替えたいときに巻き添えを避けるため。
 * ゲスト用を入れ替えれば、ログイン中の人を追い出さずに昔の券だけ失効できる。
 * 逆に、ログインの鍵を替えたときに券まで一斉に切れることもなくなる。
 *
 * どちらも無いまま動かすと封を確かめようがないので、その場で止める。
 */
function signingKey(): string {
  const own = process.env["GUEST_COOKIE_SECRET"];
  if (typeof own === "string" && own.length > 0) return own;

  const shared = process.env["AUTH_SECRET"];
  if (typeof shared !== "string" || shared.length === 0) {
    throw new Error(
      "環境変数 GUEST_COOKIE_SECRET も AUTH_SECRET も設定されていません。" + // i18n-keep: 設定漏れを開発者に知らせる内部の例外
        "`vercel env pull .env.local` で取得するか、Vercel の Environment Variables に追加してください。", // i18n-keep: 設定漏れを開発者に知らせる内部の例外
    );
  }
  return shared;
}

function seal(body: string): string {
  return createHmac("sha256", signingKey()).update(body).digest("base64url");
}

/** 封が本物かを、長さの違いで中身を推測されない形で確かめる。 */
function sealMatches(body: string, seen: string): boolean {
  const expected = Buffer.from(seal(body), "utf8");
  const actual = Buffer.from(seen, "utf8");
  if (expected.length !== actual.length) return false;
  return timingSafeEqual(expected, actual);
}

/** 表示に使う名前。前後の空白と改行を落とし、長すぎるものは切る。 */
export function tidyGuestName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const name = value.replace(/\s+/g, " ").trim();
  if (name.length === 0) return null;
  return name.slice(0, GUEST_NAME_MAX_LENGTH);
}

/** 券を読む。封が合わない・形が違うものは、無かったことにする。 */
export function readGuest(raw: string | null | undefined): Guest | null {
  if (typeof raw !== "string" || raw.length === 0) return null;

  const dot = raw.indexOf(".");
  if (dot <= 0 || dot === raw.length - 1) return null;
  const body = raw.slice(0, dot);
  if (!sealMatches(body, raw.slice(dot + 1))) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return null;
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null;
  const claims: Record<string, unknown> = { ...parsed };
  const id = claims["id"];
  const name = tidyGuestName(claims["name"]);
  if (typeof id !== "string" || id.length === 0 || name === null) return null;
  return { guestId: id, name };
}
