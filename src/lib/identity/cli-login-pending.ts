// i18n-keep-file: 日本語は fail() が投げる内部の失敗の文だけ（ログには符号だけが残り、利用者には固定の 500）
import { orgDb } from "@/lib/db/database";
import type { OrganizationScope } from "../organization/scope";

import {
  decideClaim,
  PENDING_TTL_MS,
  type ClaimResult,
  usableHandshake,
} from "./cli-login-pending-value";

/**
 * クラウド環境からのログインの郵便受け。
 *
 * 生の名乗りを置くのは、人が「許可する」を押したあと、クラウド環境が取りに来るまでの
 * 最大 3 分だけ。取られたら消す。取りに来る合言葉の生の値は、最初から残さない。
 */

const TABLE = "cli_login_pending";

const COLUMNS =
  "id, state, poll_secret_hash, computer_label, handoff, owner_email, created_at, expires_at, consumed_at";

function fail(action: string, error: { message: string } | null): never {
  throw new Error(`ログインの待ち受けの${action}に失敗しました: ${error?.message ?? "原因不明"}`);
}

function toRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const record: Record<string, unknown> = { ...value };
  return record;
}

function readString(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  return typeof value === "string" ? value : null;
}

type PendingRow = {
  pollSecretHash: string;
  handoff: string | null;
  email: string | null;
  expiresAtMs: number;
  consumed: boolean;
  label: string;
};

function toRow(value: unknown): PendingRow | null {
  const record = toRecord(value);
  if (record === null) return null;
  const pollSecretHash = readString(record, "poll_secret_hash");
  const expiresAt = readString(record, "expires_at");
  if (pollSecretHash === null || expiresAt === null) return null;
  const expiresAtMs = Date.parse(expiresAt);
  if (!Number.isFinite(expiresAtMs)) return null;
  return {
    pollSecretHash,
    handoff: readString(record, "handoff"),
    email: readString(record, "owner_email"),
    expiresAtMs,
    consumed: readString(record, "consumed_at") !== null,
    label: readString(record, "computer_label") ?? "",
  };
}

/** 期限が切れた行の中身を空にする。失敗しても本筋は止めない。 */
async function sweepExpired(organization: OrganizationScope): Promise<void> {
  try {
    await orgDb(organization)
      .from(TABLE)
      .update({ handoff: null, owner_email: null })
      .lt("expires_at", new Date().toISOString())
      .not("handoff", "is", null);
  } catch {
    // 掃除に失敗しただけ。期限の判定は読む側でもする
  }
}

/** 待ち受けを 1 つ開く。同じ合図がまだ生きていれば taken。 */
export async function openPending(organization: OrganizationScope, input: {
  state: string;
  pollSecretHash: string;
  label: string;
}): Promise<{ expiresAt: string } | { error: "taken" }> {
  await sweepExpired(organization);

  const expiresAt = new Date(Date.now() + PENDING_TTL_MS).toISOString();
  const label = input.label;

  const { error } = await orgDb(organization).from(TABLE).insert({
    state: input.state,
    poll_secret_hash: input.pollSecretHash,
    computer_label: label,
    expires_at: expiresAt,
  });

  if (error !== null) {
    if (error.message.includes("duplicate") || error.code === "23505") {
      return { error: "taken" };
    }
    fail("作成", error);
  }
  return { expiresAt };
}

/**
 * この合図の待ち受けが、人が許可できる状態か。
 *
 * 画面を開く判定に使う。中身（名乗り）は返さない。
 */
export async function findOpenPending(
  organization: OrganizationScope,
  state: string,
): Promise<{ label: string } | null> {
  const handshake = usableHandshake(state);
  if (handshake === null) return null;

  const { data, error } = await orgDb(organization)
    .from(TABLE)
    .select(COLUMNS)
    .eq("state", handshake)
    .maybeSingle();

  if (error !== null) fail("取得", error);
  const row = toRow(data);
  if (row === null) return null;
  if (row.consumed) return null;
  if (Date.now() >= row.expiresAtMs) return null;
  return { label: row.label };
}

/**
 * 人が許可した名乗りを、待ち受けへ置く。
 *
 * 置けたときだけ true。期限切れ・すでに取られた・まだ開いていない合図は false。
 * 先に新しい名乗りを用意してから呼ぶこと（置けなくても、用意した側は残る）。
 */
export async function depositHandoff(
  organization: OrganizationScope,
  state: string,
  token: string,
  email: string,
): Promise<boolean> {
  const handshake = usableHandshake(state);
  if (handshake === null) return false;

  const { data, error } = await orgDb(organization)
    .from(TABLE)
    .update({ handoff: token, owner_email: email })
    .eq("state", handshake)
    .is("consumed_at", null)
    .is("handoff", null)
    .gt("expires_at", new Date().toISOString())
    .select("id");

  if (error !== null) fail("預け", error);
  const rows: unknown = data;
  return Array.isArray(rows) && rows.length > 0;
}

/** クラウド環境が名乗りを取りに来る。合言葉が違うときは、まだ届いていないのと同じ返事。 */
export async function claimHandoff(organization: OrganizationScope, state: string, pollSecret: string): Promise<ClaimResult> {
  const { data, error } = await orgDb(organization)
    .from(TABLE)
    .select(COLUMNS)
    .eq("state", state)
    .maybeSingle();

  if (error !== null) fail("受け取り", error);

  const row = toRow(data);
  const decided = decideClaim({ row, pollSecret, nowMs: Date.now() });
  if (decided.status !== "ready") return decided;

  /*
    「取られた印」を付けられた 1 回だけを ready にする。付けられなかった
    （すでに誰かが取った直後だった）ときは expired ——同じ 1 通を 2 回渡さない。
  */
  const { data: consumed, error: consumeError } = await orgDb(organization)
    .from(TABLE)
    .update({
      consumed_at: new Date().toISOString(),
      handoff: null,
      owner_email: null,
    })
    .eq("state", state)
    .is("consumed_at", null)
    .select("id");

  if (consumeError !== null) fail("受け取り", consumeError);
  const rows: unknown = consumed;
  if (!Array.isArray(rows) || rows.length === 0) return { status: "expired" };
  return decided;
}

