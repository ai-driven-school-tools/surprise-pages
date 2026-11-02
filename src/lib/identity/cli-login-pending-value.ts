import { createHash, timingSafeEqual } from "node:crypto";

/**
 * クラウド環境からのログインで使う「待ち受け」の、保管庫に触らない部分。
 *
 * 手元のログインは、ブラウザから自分のパソコン（127.0.0.1）へ届ける。
 * クラウド環境には、人のブラウザが無い。だから待ち受けをサーバーに置き、
 * 人が自分のパソコンのブラウザで許可したあと、クラウド環境が取りに来る。
 *
 * ここで守るのは 3 つ:
 *   ・取りに来る合言葉の生の値は、保管庫に残さない（残すのはハッシュだけ）
 *   ・合図（state）と合言葉の形が違うものは、引く前に落とす
 *   ・合言葉が違うときの返事は、「まだ届いていない」と同じに見せる
 *     （違う返事を返すと、合図を知っている人が合言葉を探せる）
 *
 * 保管庫を触る処理（src/lib/identity/cli-login-pending.ts）からここだけ切り出してある。
 * 検査表がこのファイルだけを組み立てて、接続の鍵なしで確かめられるようにするため。
 */

/** 手元のログインと同じ長さ。人が許可してから取りに来るまでの上限。 */
export const PENDING_TTL_MS = 3 * 60_000;

/** ターミナルが作る合図。cli-login の画面が受け取る形と同じ。 */
const HANDSHAKE = /^[A-Za-z0-9_-]{16,128}$/;

/** 取りに来る合言葉。短いものは引く前に落とす。 */
const POLL_SECRET = /^[A-Za-z0-9_-]{32,128}$/;

/** 合言葉のハッシュ。sha256 の 16 進 64 桁。 */
const HASH = /^[0-9a-f]{64}$/;

/** 合図として通せる形か。違えば null。 */
export function usableHandshake(value: unknown): string | null {
  if (typeof value !== "string") return null;
  return HANDSHAKE.test(value) ? value : null;
}

/** 取りに来る合言葉として通せる形か。違えば null。 */
export function usablePollSecret(value: unknown): string | null {
  if (typeof value !== "string") return null;
  return POLL_SECRET.test(value) ? value : null;
}

/** 合言葉のハッシュとして通せる形か。違えば null。 */
export function usablePollSecretHash(value: unknown): string | null {
  if (typeof value !== "string") return null;
  return HASH.test(value) ? value : null;
}

/** 合言葉からハッシュ（sha256 の 16 進 64 桁）を出す。照合は必ずこれ経由。 */
export function hashPollSecret(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

/**
 * 保管しているハッシュと、今渡された合言葉が同じか。
 *
 * 長さが違うときは先に落とす（timingSafeEqual は長さが違うと例外を投げる）。
 */
export function samePollSecret(storedHash: string, presented: string): boolean {
  const presentedHash = hashPollSecret(presented);
  if (storedHash.length !== presentedHash.length) return false;
  return timingSafeEqual(Buffer.from(storedHash, "utf8"), Buffer.from(presentedHash, "utf8"));
}

/** 待ち受けを開くときに受け取る中身。形が違えば null。 */
export function readOpenRequest(payload: unknown): {
  state: string;
  pollSecretHash: string;
  name: string;
} | null {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) return null;
  const record: Record<string, unknown> = { ...payload };
  const state = usableHandshake(record["state"]);
  const pollSecretHash = usablePollSecretHash(record["pollSecretHash"]);
  if (state === null || pollSecretHash === null) return null;
  const name = typeof record["name"] === "string" ? record["name"] : "";
  return { state, pollSecretHash, name };
}

/** 取りに来るときに受け取る中身。形が違えば null。 */
export function readClaimRequest(payload: unknown): { state: string; pollSecret: string } | null {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) return null;
  const record: Record<string, unknown> = { ...payload };
  const state = usableHandshake(record["state"]);
  const pollSecret = usablePollSecret(record["pollSecret"]);
  if (state === null || pollSecret === null) return null;
  return { state, pollSecret };
}

/** 取りに来た結果。中身が乗るのは「届いていて、合言葉が合った」ときだけ。 */
export type ClaimStatus = "waiting" | "ready" | "expired";

export type ClaimResult =
  | { status: "waiting" }
  | { status: "expired" }
  | { status: "ready"; token: string; email: string };

/**
 * 保管庫から読んだ 1 行と、今の時刻と、合言葉から、返す結果を決める。
 *
 * 行が無い・合言葉が違う・まだ許可されていない、はどれも waiting。
 * 期限切れ・すでに取られた、は expired。
 * 中身を返すのは、許可済み・期限内・未取得・合言葉が合った、の全部が揃ったときだけ。
 */
export function decideClaim(input: {
  row: {
    pollSecretHash: string;
    handoff: string | null;
    email: string | null;
    expiresAtMs: number;
    consumed: boolean;
  } | null;
  pollSecret: string;
  nowMs: number;
}): ClaimResult {
  const { row, pollSecret, nowMs } = input;
  if (row === null) return { status: "waiting" };
  if (!samePollSecret(row.pollSecretHash, pollSecret)) return { status: "waiting" };
  if (row.consumed) return { status: "expired" };
  if (nowMs >= row.expiresAtMs) return { status: "expired" };
  if (row.handoff === null || row.email === null) return { status: "waiting" };
  return { status: "ready", token: row.handoff, email: row.email };
}
