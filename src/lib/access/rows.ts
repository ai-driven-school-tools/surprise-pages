/** access の各ファイルが共有する、保管庫の表の名前と行の読み方。src/lib/access/access.ts からは外へ出さない。 */
// i18n-keep-file: 日本語は fail() が投げる内部の失敗の文だけ（ログには符号だけが残り、画面には固定の 500）

export const PAGES_TABLE = "pages";
export const PERMISSIONS_TABLE = "page_permissions";
export const GROUPS_TABLE = "groups";
export const GROUP_MEMBERS_TABLE = "group_members";
export const REQUESTS_TABLE = "access_requests";
export const ADMINS_TABLE = "admins";

export const PERMISSION_COLUMNS =
  "id, page_id, grantee_kind, member_email, group_id, added_by, added_at, role";
export const GROUP_COLUMNS = "id, name, created_by, created_at";
export const REQUEST_COLUMNS = "id, page_id, requester_email, requester_name, created_at";
export const ADMIN_COLUMNS = "email, added_by, added_at";

/** 0007_admins.sql の番人が、最後の 1 人を守るときに返す自前の番号。 */
export const LAST_ADMIN = "ADMIN";

/** 可否の材料を 1 回で返す、保管庫側の関数（組織を引数に取る版。古い版は 0006_access.sql の page_access_facts）。 */
export const FACTS_FUNCTION = "org_page_access_facts";
/** 名簿の照らし合わせ用。大文字小文字と前後の空白は揃えてから比べる。 */
export function normalize(email: string): string {
  return email.trim().toLowerCase();
}

// ---------------------------------------------------------------------------
// 保管庫の読み書き
// ---------------------------------------------------------------------------

/**
 * データベースが返したエラーを、そのまま外に漏らさずに投げ直す。
 * 保存先が返した符号（57014・PGRST205 など）は `code` に持たせる（の `src/lib/workspace/workspace.ts` と同じ形）。
 * 符号はログと Sentry に残り、文面は残らない（`src/lib/logging/log-record.ts`）。符号が無ければ付けない。
 */
export function fail(action: string, error: { message: string; code?: unknown } | null): never {
  const thrown = new Error(`閲覧の許可の${action}に失敗しました: ${error?.message ?? "原因不明"}`);
  throw typeof error?.code === "string" ? Object.assign(thrown, { code: error.code }) : thrown;
}

/** 同じものが 2 つ入ろうとしたときにデータベースが返す番号（PostgreSQL）。 */
export const UNIQUE_VIOLATION = "23505";

export function isUniqueViolation(error: unknown): boolean {
  const record = toRecord(error);
  return record !== null && readString(record, "code") === UNIQUE_VIOLATION;
}

/** 素の値（データベースの行）を、型を壊さずに 1 段だけ開く。 */
export function toRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const record: Record<string, unknown> = { ...value };
  return record;
}

export function readString(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  return typeof value === "string" ? value : null;
}

export function readBoolean(record: Record<string, unknown>, key: string): boolean {
  return record[key] === true;
}

/** 1 行だけ返る問い合わせの結果を開く（配列で返ることもある）。 */
export function firstRecord(data: unknown): Record<string, unknown> | null {
  if (Array.isArray(data)) return data.length === 0 ? null : toRecord(data[0]);
  return toRecord(data);
}
