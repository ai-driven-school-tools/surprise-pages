import { createHash, randomBytes } from "node:crypto";

/**
 * 投稿の鍵の「値そのもの」を扱う部品。
 *
 * 鍵の扱いで守りたいのは 3 つ:
 *   ・生の値はこちらに残さない（保管するのはハッシュだけ）
 *   ・照合は必ずハッシュ越し
 *   ・受け取り口（Authorization ヘッダ）の読み方を 1 か所に置く
 *
 * 保管庫（Supabase）を触る部分（src/lib/identity/publish-tokens.ts）から**ここだけ切り出して**ある。
 * 上の 3 つは保管庫が無くても確かめられるべきもので、検査表
 * （tests/checks/check-publish-token.mjs）がこのファイルだけを組み立てて実際に呼ぶ。
 * 同じ関数を保管庫つきのファイルに置くと、検査のたびに接続の鍵が要る。
 */

/** 鍵の頭に付ける印。うっかり貼られた値を、引く前に見分けるためのもの。 */
export const TOKEN_PREFIX = "spg_";

/** 鍵の種類。この版は投稿もできる鍵（publish）だけ。 */
export const TOKEN_KINDS = ["publish"] as const;
export type TokenKind = (typeof TOKEN_KINDS)[number];

/** 種類ごとの頭の印。 */
export const TOKEN_PREFIXES: Readonly<Record<TokenKind, string>> = {
  publish: TOKEN_PREFIX,
};

/** 乱数の長さ。base64url にすると 43 文字になる。 */
const RANDOM_BYTES = 32;

/** 鍵として最低限これだけの長さが要る（短いものは引く前に落とす）。印はどれも 4 文字。 */
const MIN_LENGTH = TOKEN_PREFIX.length + 40;

/** これより長いものも見ない。長い文字列でデータベースを叩かせないため。 */
const MAX_LENGTH = 200;

/** 生の鍵を作る。呼び出し元が 1 回だけ本人に見せ、こちらには残さない。種類で頭の印が変わる。 */
export function newTokenValue(kind: TokenKind = "publish"): string {
  return `${TOKEN_PREFIXES[kind]}${randomBytes(RANDOM_BYTES).toString("base64url")}`;
}

/** 生の鍵からハッシュ（sha256 の 16 進 64 桁）を出す。照合は必ずこれ経由。 */
export function hashTokenValue(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

/**
 * 値の形と頭の印から、どの種類の鍵に見えるかを返す。鍵の形でなければ null。
 * 本当にその種類かは保存先の列と突き合わせて決める（src/lib/identity/publish-tokens.ts の verifyToken）。
 */
export function tokenKindOfValue(value: unknown): TokenKind | null {
  if (typeof value !== "string" || value.length < MIN_LENGTH || value.length > MAX_LENGTH) return null;
  for (const kind of TOKEN_KINDS) if (value.startsWith(TOKEN_PREFIXES[kind])) return kind;
  return null;
}

/** 明らかに鍵の形をしていないものは、データベースを引く前に落とす。 */
export function looksLikeToken(value: unknown): value is string {
  return tokenKindOfValue(value) !== null;
}

/** `Bearer <値>`。大文字小文字は問わない（送る道具によって書き方が違う）。 */
const BEARER = /^Bearer[ \t]+(\S+)$/i;

/**
 * Authorization ヘッダの文字列から生の鍵を取り出す。
 *
 * Request を持たない口（`currentIdentity` が `headers()` から読むとき）と、
 * Request を持つ口（投稿）が同じ読み方を使うための部品。読み方を 2 つ持つと、
 * 片方だけ `Bearer` の揺れを受け付けなくなる。
 */
export function bearerTokenFromHeader(header: string | null): string | null {
  if (header === null) return null;
  const found = BEARER.exec(header.trim());
  return found === null ? null : found[1];
}

export function bearerToken(request: Request): string | null {
  return bearerTokenFromHeader(request.headers.get("authorization"));
}
