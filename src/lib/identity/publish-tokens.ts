// i18n-keep-file: 残る日本語は fail() が投げる内部の失敗の文だけ（画面にもターミナルにも届かず、利用者には固定の 500）。人に返す案内は辞書から引く
import { mayPublish } from "../settings/site-settings";
import { defaultTranslate } from "../i18n/default";
import { orgDb } from "@/lib/db/database";
import { emailKey } from "./member-name";
import { type OrganizationScope } from "../organization/scope";
import type { Member } from "./identity";
import { memberOrganizationOf, type MemberOrganization } from "../organization/member-organization";
import {
  bearerToken,
  bearerTokenFromHeader,
  hashTokenValue,
  newTokenValue,
  tokenKindOfValue,
  type TokenKind,
} from "./token-value";

/**
 * 名乗りの鍵の読み書き。
 *
 * 鍵の種類（`kind` 列。`db/migrations/20260927145100_publish_tokens_kind.sql`）は、この版では 1 つだけ。
 *   publish … 投稿コマンド（pages-publish login）で作る。頭は `spg_`。投稿もできる。期限なし
 * 照合は**頭の印と種類の列の両方がそろったときだけ**通す（列に別の種類が残っていても通さない）。
 * **どの種類の鍵をどの口で使えるかは `KEY_USES` の 1 か所で決める。** 入口ごとに種類を見比べない。
 *
 * 鍵は「合鍵つきの入場証」のようなもの。渡すのは発行の 1 回だけで、こちらの手元には
 * 型（ハッシュ）しか残らない。だから一覧にも応答にも生の値は出てこないし、
 * 失くしたときに「見せ直す」ことはできない（新しく発行して古いほうを止める）。
 *
 * 止めるときも行は消さない。いつ止めたかが分からなくなると、
 * 「あの鍵はもう使えないはずだ」を後から確かめられなくなる。
 */

export {
  TOKEN_KINDS,
  TOKEN_PREFIX,
  type TokenKind,
  bearerToken,
  bearerTokenFromHeader,
  hashTokenValue,
  newTokenValue,
} from "./token-value";

const TABLE = "publish_tokens";

/**
 * 外に出してよい列だけを明示で並べる。
 *
 * **token_hash はここに入れない。** `select("*")` にしてしまうと、応答を組み立てる側が
 * うっかり全部を返した瞬間に型（ハッシュ）まで外へ出る。列を書き出しておけば、
 * 出す気の無いものは最初から手元に来ない。
 */
const COLUMNS = "id, label, created_at, last_used_at, revoked_at, kind, expires_at";

/** 照合のときだけ引く列。持ち主と種類と「止められているか」しか要らない。 */
const OWNER_COLUMNS = "id, kind, owner_email, owner_name, revoked_at, expires_at";

/** 種類ごとの鍵の寿命。null は期限なし（投稿の鍵は今までどおり）。 */
export const KEY_LIFETIME_MS: Readonly<Record<TokenKind, number | null>> = {
  publish: null,
};

/**
 * 保存先の値を種類として読む。**知らない値は null**（その鍵は通さない）。
 *
 * 列は not null・既定 publish なので、ふだん null になることは無い。読めなかったときに
 * 「たぶん投稿の鍵」と読むと、いちばん強い権限へ倒れることになるので、倒さない。
 */
function readKind(value: unknown): TokenKind | null {
  return value === "publish" ? value : null;
}

/**
 * 鍵を使う口の種類。
 *   publish … 投稿・素材の受け取り・本文の取り寄せ・素材の凍結・ページを消す（`ownerFromRequest`）
 *   web     … Web の窓口の名乗り（`currentIdentity` の既定。コメント・本文の直し・履歴など）
 */
export type KeyUse = "publish" | "web";

/** どの種類の鍵を、どの口で使えるか。**ここが正本。** 表に無い組み合わせは通さない。 */
export const KEY_USES: Readonly<Record<TokenKind, readonly KeyUse[]>> = {
  publish: ["publish", "web"],
};

/** その種類の鍵を、その口で使えるか。 */
export function keyAllows(kind: TokenKind, use: KeyUse): boolean {
  return KEY_USES[kind].includes(use);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isTokenId(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value);
}

/** 覚え書きの長さ。「MacBook」程度が入れば足りる。 */
export const TOKEN_LABEL_MAX_LENGTH = 40;

export type TokenOwner = { email: string; name: string | null };

/**
 * 要求の組織に所属している鍵の持ち主。所属は照合のたびに名簿から引く——
 * 持ち主を組織から外したら、鍵そのものは生きていても次の要求から名乗れない。
 */
export type OrganizationOwner = TokenOwner & { organization: MemberOrganization };

/** 照合を通った鍵。持ち主と、どの種類の鍵か。`id` は鍵の行の目印（入場券が発行元を覚えるのに使う）。 */
export type VerifiedToken = OrganizationOwner & { kind: TokenKind; id: string };

export type TokenSummary = {
  id: string;
  kind: TokenKind;
  label: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
  /** 期限。投稿の鍵は null（期限なし） */
  expiresAt: string | null;
  /** 読んだ時点で期限を過ぎているか（一覧で「ログイン中」から外すため） */
  expired: boolean;
};

/**
 * 期限を過ぎているか。**期限が必要な種類なのに期限が読めない鍵も「過ぎた」と読む**
 * （読めないものを「期限なし」へ倒さない）。
 */
function expiredAt(kind: TokenKind, expiresAt: string | null, nowMs: number): boolean {
  if (expiresAt === null) return KEY_LIFETIME_MS[kind] !== null;
  const at = Date.parse(expiresAt);
  return !Number.isFinite(at) || at <= nowMs;
}

/**
 * 鍵が通らなかったときに返す案内。
 *
 * 投稿・凍結・素材の受け取りの 3 つの入口で同じ文言を出す。別々に書くと、
 * 同じ詰まり方をしたのに入口ごとに違う説明が出て、直し方が伝わらない。
 *
 * 文は辞書（auth.cli.loginExpired）から引く。受け取るのはターミナルの投稿コマンドで、
 * 言語の写し（cookie）を持たず、言語の希望も送らない（受け手が決まって日本語になる）ので、日本語の辞書の値で固定する。
 */
export const TOKEN_REJECTED = defaultTranslate("auth.cli.loginExpired");

/** データベースが返したエラーを、そのまま外に漏らさずに投げ直す。 */
function fail(action: string, error: { message: string } | null): never {
  throw new Error(`投稿トークンの${action}に失敗しました: ${error?.message ?? "原因不明"}`);
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

function toSummary(row: unknown): TokenSummary | null {
  const record = toRecord(row);
  if (record === null) return null;

  const id = readString(record, "id");
  const createdAt = readString(record, "created_at");
  const kind = readKind(record["kind"]);
  if (id === null || createdAt === null || kind === null) return null;

  const expiresAt = readString(record, "expires_at");
  return {
    id,
    kind,
    label: readString(record, "label") ?? "",
    createdAt,
    lastUsedAt: readString(record, "last_used_at"),
    revokedAt: readString(record, "revoked_at"),
    expiresAt,
    expired: expiredAt(kind, expiresAt, Date.now()),
  };
}

function toSummaries(rows: unknown): TokenSummary[] {
  if (!Array.isArray(rows)) return [];
  const summaries: TokenSummary[] = [];
  for (const row of rows) {
    const summary = toSummary(row);
    if (summary !== null) summaries.push(summary);
  }
  return summaries;
}

/** 空白を 1 つに詰めて、前後を落とし、長さで切る。 */
export function tidyLabel(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, TOKEN_LABEL_MAX_LENGTH);
}

/**
 * 鍵を発行する。
 *
 * 生の値は戻り値でだけ返す。呼び出し元が 1 回だけ本人に見せて、あとは捨てる。
 * 保存するのはハッシュ（token_hash）だけなので、こちらから見せ直す道は無い。
 *
 */
export async function issueToken(
  organization: OrganizationScope,
  owner: TokenOwner,
  label: string,
  kind: TokenKind = "publish",
): Promise<{ token: string; summary: TokenSummary }> {
  const token = newTokenValue(kind);
  const lifetime = KEY_LIFETIME_MS[kind];

  const { data, error } = await orgDb(organization)
    .from(TABLE)
    .insert({
      token_hash: hashTokenValue(token),
      owner_email: owner.email,
      owner_name: owner.name,
      label,
      kind,
      expires_at: lifetime === null ? null : new Date(Date.now() + lifetime).toISOString(),
    })
    .select(COLUMNS)
    .single();

  if (error !== null) fail("発行", error);
  const row: unknown = data;
  const summary = toSummary(row);
  if (summary === null) fail("発行", { message: "発行後の行が読めませんでした" });
  return { token, summary };
}

/**
 * 持ち主のアドレスで引く条件。大文字小文字と前後の空白をそろえて比べる（`sameEmail` と同じ形）。
 * 鍵の行のアドレスは発行したときの名乗りのままなので、大文字が混ざった昔の行も同じ人として拾う（ilike・特別な文字は外す）。
 * PostgREST は like の中の `*` を「何でも」と読むので、`*` を含むアドレスだけは小文字にそろえた値と完全一致で比べる。
 */
function ownedBy<Q extends { eq(column: string, value: unknown): Q; ilike(column: string, value: string): Q }>(query: Q, email: string): Q {
  const key = emailKey(email);
  return key.includes("*") ? query.eq("owner_email", key) : query.ilike("owner_email", key.replace(/[\\%_]/g, (one) => `\\${one}`));
}

/** 自分の鍵の一覧を新しい順で。生の値もハッシュも含めない。 */
export async function listTokens(organization: OrganizationScope, email: string): Promise<TokenSummary[]> {
  const { data, error } = await ownedBy(orgDb(organization)
    .from(TABLE)
    .select(COLUMNS), email)
    .order("created_at", { ascending: false });

  if (error !== null) fail("取得", error);
  const rows: unknown = data;
  return toSummaries(rows);
}

/**
 * 何人かの、止めていない・切れていない鍵の本数（鍵はそろえたアドレス）。組織の設定の「外した人」の一覧が
 * 「鍵 2 本は使えません」と言うために使う。鍵の行は外したときに触らないので（所属が無ければ名乗れない）、
 * 数は外したあとも残っている本数。生の値もハッシュも名前も返さない。
 */
export async function liveTokenCounts(organization: OrganizationScope, emails: readonly string[]): Promise<Map<string, number>> {
  const wanted = new Set(emails.map(emailKey));
  const counts = new Map<string, number>();
  if (wanted.size === 0) return counts;
  const { data, error } = await orgDb(organization).from(TABLE).select("owner_email, kind, expires_at").is("revoked_at", null);
  if (error !== null) fail("取得", error);
  const rows: unknown = data;
  if (!Array.isArray(rows)) return counts;
  const now = Date.now();
  for (const row of rows) {
    const record = toRecord(row);
    const owner = record === null ? null : readString(record, "owner_email");
    const kind = record === null ? null : readKind(record["kind"]);
    if (record === null || owner === null || kind === null) continue;
    const key = emailKey(owner);
    if (!wanted.has(key) || expiredAt(kind, readString(record, "expires_at"), now)) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

/** 止める。行は消さず「止めた印」を立てる。自分のものでなければ false。 */
export async function revokeToken(organization: OrganizationScope, id: string, email: string): Promise<boolean> {
  if (!isTokenId(id)) return false;

  const { data, error } = await ownedBy(orgDb(organization)
    .from(TABLE)
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", id), email)
    .is("revoked_at", null)
    .select("id");

  if (error !== null) fail("停止", error);
  const rows: unknown = data;
  return Array.isArray(rows) && rows.length > 0;
}

/**
 * 使われた印を付ける。
 *
 * ここが失敗しても照合の結果は変えない。記録が取れないだけで投稿を止めるのは、
 * 困り方が釣り合わない（鍵は正しいのに投稿できない、になる）。
 */
async function touch(organization: OrganizationScope, id: string): Promise<void> {
  try {
    await orgDb(organization).from(TABLE).update({ last_used_at: new Date().toISOString() }).eq("id", id);
  } catch {
    // 記録が取れなかっただけ。投稿は通す
  }
}

/**
 * 鍵を照合して持ち主と種類を返す。止められていれば null。
 *
 * 生の値どうしを比べる場面は無い。ハッシュには一意の索引があるので、
 * 「ハッシュで 1 行引く」だけで済む。種類が読めない鍵・頭の印と種類がそろわない鍵・
 * 期限を過ぎた鍵も null（通さない）。
 */
export async function verifyToken(organization: OrganizationScope, value: string): Promise<VerifiedToken | null> {
  const shaped = tokenKindOfValue(value);
  if (shaped === null) return null;

  // 組織で絞った口で引く＝別の組織の鍵は「見つからない」（鍵の組織と宛先の組織の比べを別に書かない）
  const { data, error } = await orgDb(organization)
    .from(TABLE)
    .select(OWNER_COLUMNS)
    .eq("token_hash", hashTokenValue(value))
    .maybeSingle();

  // 接続できなかったのを「鍵が違う」と言い換えない（鍵を作り直させても直らない）
  if (error !== null) fail("照合", error);

  const row: unknown = data;
  const record = toRecord(row);
  if (record === null) return null;
  if (readString(record, "revoked_at") !== null) return null;

  const email = readString(record, "owner_email");
  if (email === null) return null;
  const kind = readKind(record["kind"]);
  // 頭の印と種類の列がそろわない鍵は通さない
  if (kind === null || kind !== shaped) return null;
  if (expiredAt(kind, readString(record, "expires_at"), Date.now())) return null;

  const id = readString(record, "id");
  if (id === null) return null;
  // 持ち主が宛先の組織に有効な所属を持つときだけ通す（外した人の鍵は名乗れない）
  const membership = await memberOrganizationOf(organization, email);
  if (membership === null) return null;
  await touch(organization, id);

  return { email, name: readString(record, "owner_name"), kind, id, organization: membership };
}

/**
 * 投稿の受け取り口。Authorization ヘッダから持ち主を割り出す。通らなければ null。
 *
 * 投稿・素材の受け取り・本文の取り寄せ・素材の凍結・ページを消す、の入口だけが使う。
 * 通すのは `KEY_USES` で publish を持つ種類だけ。断り方は止めた鍵と同じ（null）。
 */
export async function ownerFromRequest(organization: OrganizationScope, request: Request): Promise<OrganizationOwner | null> {
  const value = bearerToken(request);
  if (value === null) return null;
  const owner = await verifyToken(organization, value);
  if (owner === null || !keyAllows(owner.kind, "publish")) return null;
  return mayPublish(owner.email) ? { email: owner.email, name: owner.name, organization: owner.organization } : null;
}

/**
 * 鍵の持ち主を、門（src/lib/access/access.ts）が読める名乗りに移す。
 *
 * 鍵で名乗る入口も、見てよいかの判定は画面とまったく同じ 1 つ（`openPage`）を
 * 通したい。門が受けるのは `Identity` なので、ここで形だけそろえる。
 *
 * **鍵を持っていること自体を「見てよい」に読み替えない。** 鍵は「誰として動くか」
 * を示すだけで、名簿で絞ったページ（restricted）に名簿の外の人が投稿できても、
 * その中身を読めてよい理由にはならない。だから可否は必ず門に決めさせる。
 * 顔写真は鍵の側に無いので null。判定の材料には使われない。
 */
export function identityOf(owner: OrganizationOwner): Member {
  return { kind: "member", email: owner.email, name: owner.name, image: null, organization: owner.organization };
}

/**
 * Authorization ヘッダから、鍵の持ち主を会社の人として返す。
 *
 * 画面のログイン（セッション）と同じ `Identity` に揃えるための口。
 * コメントの読み書き・解決など、入口が `currentIdentity` を見ている処理は
 * ここを通る。照合そのものは `verifyToken` と同じなので、**既にある鍵の
 * 再発行は要らない**（持ち主のアドレスは発行時から載っている）。
 *
 * どの口の名乗りかを `use` で受け、その口で使えない種類の鍵は null（`KEY_USES`）。
 *
 * ヘッダが無い・形が違う・止められている・この口では使えない、は全部 null。
 */
export async function memberFromAuthorization(organization: OrganizationScope, header: string | null, use: KeyUse): Promise<Member | null> {
  const value = bearerTokenFromHeader(header);
  if (value === null) return null;
  // 組織は名乗り（src/lib/identity/identity.ts）が要求の組織を 1 度だけ決めて渡す
  const owner = await verifyToken(organization, value);
  if (owner === null) return null;
  if (!keyAllows(owner.kind, use)) return null;
  return identityOf(owner);
}
