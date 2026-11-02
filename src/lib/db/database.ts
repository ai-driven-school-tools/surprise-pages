// i18n-keep-file: 保存先の内部の失敗だけを持つ（画面には決まった文か設置の案内（src/lib/settings/setup-error.ts の辞書の文）しか出ない）
import postgres from "postgres";
import { isPersonalEdition, siteOrigin, siteOwnerEmail } from "../settings/site-settings";
import { SetupError, type SetupProblem } from "../settings/setup-error";
import environment from "../settings/environment.json";
import { logEvent } from "../logging/server-log";
import tenantTables from "../organization/tenant-tables.json";
import type { OrganizationScope } from "../organization/scope";

/** PostgreSQLだけを使う保存の入口。Neon / Supabaseで同じ問い合わせを実行する。 */
export type DbRow = Record<string, unknown>;
type Value = string | number | boolean | null;
/**
 * 失敗の値。`code` は保存先が返した符号（23505・PGRST205 など）を最優先にし、無ければ HTTP の状態から作った
 * `HTTP_401` の形か、届かなかった種類（TIMEOUT・ECONNRESET・FETCH_FAILED・BAD_RESPONSE）。
 * `status` は REST の経路で応答があったときだけの HTTP の状態（数だけ）。応答の本体・接続先・鍵は持たない。
 */
type DbError = { code: string; message: string; status?: number };
export type DbResult = { data: DbRow[] | DbRow | null; error: DbError | null };
type Filter = { column: string; operator: "=" | "<" | ">" | "like" | "ilike" | "is" | "is not" | "in"; value: unknown };
type State = {
  table: string;
  operation: "select" | "insert" | "update" | "delete" | "upsert";
  columns: string;
  returning: boolean;
  values: DbRow[];
  filters: Filter[];
  alternatives: Filter[];
  orders: { column: string; ascending: boolean }[];
  limit?: number;
  conflict?: string;
  cardinality: "many" | "one" | "optional";
  /** 組織で絞った口（orgDb）から来た問い合わせの組織の目印。組織に属する表だけが持つ */
  organizationId?: string;
};

function identifier(value: string): string {
  if (!/^[a-z_][a-z0-9_]*$/.test(value)) throw new Error("保管庫の項目名が正しくありません");
  return `"${value}"`;
}

function columns(value: string): string {
  return value === "*" ? "*" : value.split(",").map((one) => identifier(one.trim())).join(", ");
}

function parameter(value: unknown): Value {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "object") return JSON.stringify(value);
  throw new Error("保管庫へ渡す値が正しくありません");
}

/** JSON is already encoded by parameter(). Force a text input before the JSON cast,
 * otherwise the driver encodes that string again when PostgreSQL infers jsonb. */
function placeholder(index: number, value: unknown): string {
  const name = `$${index}`;
  return value !== null && typeof value === "object" ? `${name}::text::jsonb` : name;
}

/**
 * 組織に属する表・関数の台帳（src/lib/organization/tenant-tables.json が正本）。
 *
 * - 組織に属する表は、組織で絞った口（`orgDb(organization)`）からしか触れない。素の口（`getDb()`）で触ると**実行時に止まる**
 * - 組織で絞った口は、select / update / delete に `organization_id = <組織>` を必ず足し、insert / upsert には組織の印を差し込む
 * - 組織を引数に取る関数（`p_organization_id`）は組織で絞った口からしか呼べない。台帳に無い表・関数はどちらの口でも止まる
 *
 * 止めるのは例外を投げることで行う（`{ error }` の形で返すと、呼ぶ側が「行が無い」と読み違えて先へ進むため）。
 */
const ORGANIZATION_TABLES: ReadonlySet<string> = new Set(Object.keys(tenantTables.organization));
const GLOBAL_TABLES: ReadonlySet<string> = new Set(Object.keys(tenantTables.global));
const ORGANIZATION_FUNCTIONS: ReadonlySet<string> = new Set(Object.keys(tenantTables.functions.organization));
const KEYED_FUNCTIONS: ReadonlySet<string> = new Set(Object.keys(tenantTables.functions.keyed));
const ORGANIZATION_COLUMN = "organization_id";
const ORGANIZATION_ARGUMENT = "p_organization_id";
const ORGANIZATION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** 組織の絞りを外れた使い方。台帳の名前だけを文面に入れる（値・鍵・接続先は入れない）。 */
export class TenantScopeError extends Error {
  constructor(readonly target: string, readonly reason: "needs-organization" | "not-organization" | "unknown" | "organization-mismatch" | "organization-column") {
    super(`${target}: ${{
      "needs-organization": "組織に属する表・関数です。orgDb(organization) から触ってください",
      "not-organization": "組織に属さない表・関数です。getDb() から触ってください",
      unknown: "台帳（src/lib/organization/tenant-tables.json）に無い表・関数です。組織に属するかどうかを台帳に書いてください",
      "organization-mismatch": "組織の印が、組織で絞った口の組織と違います",
      "organization-column": "組織の印を書き換えたり、組織の印を含まない重複の見分け方で書いたりはできません",
    }[reason]}`);
    this.name = "TenantScopeError";
  }
}

function requireKnownTable(table: string): void {
  if (!ORGANIZATION_TABLES.has(table) && !GLOBAL_TABLES.has(table)) throw new TenantScopeError(table, "unknown");
}

/**
 * 組織で絞った口の問い合わせに、組織の条件と印を付ける。compileQuery と REST の経路の両方がこれを通った形を組み立てる。
 * 呼ぶ側が書いた印が組織と違えば止める（別の組織の行を作らせない）。update で印を書き換えるのも止める（行を別の組織へ移させない）。
 */
export function withOrganization(state: State): State {
  const organizationId = state.organizationId;
  if (organizationId === undefined) return state;
  if (state.operation === "select" || state.operation === "update" || state.operation === "delete") {
    if (state.operation === "update" && state.values.some((row) => ORGANIZATION_COLUMN in row)) throw new TenantScopeError(state.table, "organization-column");
    return { ...state, filters: [{ column: ORGANIZATION_COLUMN, operator: "=", value: organizationId }, ...state.filters] };
  }
  if (state.operation === "upsert" && !(state.conflict ?? "").split(",").map((one) => one.trim()).includes(ORGANIZATION_COLUMN)) {
    // 組織の印を含まない見分け方で upsert すると、別の組織の同じ行に当たって書き換えうる
    throw new TenantScopeError(state.table, "organization-column");
  }
  const values = state.values.map((row) => {
    const given = row[ORGANIZATION_COLUMN];
    if (given !== undefined && given !== organizationId) throw new TenantScopeError(state.table, "organization-mismatch");
    return { ...row, [ORGANIZATION_COLUMN]: organizationId };
  });
  return { ...state, values };
}

/**
 * 値はSQL本文へ連結せず、必ず別の引数として渡す。
 *
 * `stable` は「文の形が値の数で変わらないか」。in の並びと複数行の保存は、件数ごとに別の文になる。
 * 形を覚える（`prepare`）のは stable な文だけにする。覚えた形は接続ごとに溜まるので、件数で増える文を覚えると際限なく増える。
 */
export function compileQuery(state: State): { text: string; parameters: Value[]; stable: boolean } {
  const parameters: Value[] = [];
  let stable = true;
  const bind = (value: unknown) => { parameters.push(parameter(value)); return placeholder(parameters.length, value); };
  const whereOne = (filter: Filter): string => {
    const name = identifier(filter.column);
    if (filter.operator === "is" || filter.operator === "is not") {
      if (filter.value !== null) throw new Error("空の値の指定が正しくありません");
      return `${name} ${filter.operator} null`;
    }
    if (filter.operator === "in") {
      if (!Array.isArray(filter.value)) throw new Error("一覧の指定が正しくありません");
      if (filter.value.length > 0) stable = false;
      return filter.value.length === 0 ? "false" : `${name} in (${filter.value.map(bind).join(", ")})`;
    }
    return `${name} ${filter.operator} ${bind(filter.value)}`;
  };
  const table = `public.${identifier(state.table)}`;
  let text: string;
  if (state.operation === "select") text = `select ${columns(state.columns)} from ${table}`;
  else if (state.operation === "delete") text = `delete from ${table}`;
  else if (state.operation === "update") {
    const row = state.values[0];
    if (!row || Object.keys(row).length === 0) throw new Error("変更内容がありません");
    text = `update ${table} set ${Object.entries(row).map(([key, value]) => `${identifier(key)} = ${bind(value)}`).join(", ")}`;
  } else {
    const keys = Object.keys(state.values[0] ?? {});
    if (keys.length === 0) throw new Error("保存する内容がありません");
    if (state.values.length > 1) stable = false;
    for (const row of state.values) {
      if (Object.keys(row).length !== keys.length || keys.some((key) => !(key in row))) throw new Error("保存する項目が揃っていません");
    }
    text = `insert into ${table} (${keys.map(identifier).join(", ")}) values ${state.values.map((row) => `(${keys.map((key) => bind(row[key])).join(", ")})`).join(", ")}`;
    if (state.operation === "upsert") {
      if (!state.conflict) throw new Error("重複の見分け方がありません");
      text += ` on conflict (${columns(state.conflict)}) do update set ${keys.map((key) => `${identifier(key)} = excluded.${identifier(key)}`).join(", ")}`;
    }
  }
  const conditions = state.filters.map(whereOne);
  if (state.alternatives.length > 0) conditions.push(`(${state.alternatives.map(whereOne).join(" or ")})`);
  if (conditions.length > 0) text += ` where ${conditions.join(" and ")}`;
  if (state.orders.length > 0) text += ` order by ${state.orders.map((one) => `${identifier(one.column)} ${one.ascending ? "asc" : "desc"}`).join(", ")}`;
  if (state.limit !== undefined) text += ` limit ${bind(state.limit)}`;
  if (state.operation !== "select" && state.returning) text += ` returning ${columns(state.columns)}`;
  return { text, parameters, stable };
}

function failure(error: unknown, fallback = "DATABASE", status?: number): DbResult {
  const code = storeCode(error) ?? transportCode(error) ?? fallback;
  // 接続先・SQL・本文・鍵をエラー表示へ持ち出さない。
  return { data: null, error: { code, message: "保管庫の操作に失敗しました", ...(status === undefined ? {} : { status }) } };
}

/** 保存先（PostgREST / PostgreSQL）が自分で付けた符号。無ければ null。 */
function storeCode(error: unknown): string | null {
  return typeof error === "object" && error !== null && "code" in error && typeof error.code === "string" ? error.code : null;
}

/**
 * 保存先まで届かなかった失敗の種類。決まった語彙だけを返し、文面・接続先・鍵は見ない。
 * 時間切れは TIMEOUT、通信の失敗は原因の符号（ECONNRESET など）か FETCH_FAILED、成功の応答が読めないときは BAD_RESPONSE。
 */
function transportCode(error: unknown): string | null {
  if (!(error instanceof Error)) return null;
  if (error.name === "TimeoutError" || error.name === "AbortError") return "TIMEOUT";
  if (error instanceof SyntaxError) return "BAD_RESPONSE";
  if (error instanceof TypeError) {
    const cause: unknown = error.cause;
    const code = typeof cause === "object" && cause !== null && "code" in cause && typeof cause.code === "string" ? cause.code : null;
    return code !== null && /^[A-Z0-9_]{2,40}$/.test(code) ? code : "FETCH_FAILED";
  }
  return null;
}

/** 断った応答の中身を読む。読めなければ null（受け口が JSON でない文を返すことがある）。 */
function parsedBody(text: string): unknown {
  try {
    return text.length === 0 ? null : JSON.parse(text);
  } catch {
    return null;
  }
}

/**
 * 使っていない接続を閉じるまでの秒数。
 *
 * 人は資料を読んでから次を押すので、要求と要求の間は数十秒空く。閉じるのが早いと、押すたびに保存先まで
 * つなぎ直し（暗号の握手・型の読み込み）、覚えた文の形も捨てる。東京の関数とシンガポールの Neon の間では
 * これだけで 1 回 0.35 秒ほどかかっていた（20 秒で閉じていた頃、読んで 25 秒後に押すと記事 0.57 秒・一覧 0.72 秒。
 * 保って形を覚えると 0.14 秒・0.20 秒。docs/design/app-speed.md の「保存先とのつなぎ方」）。
 * Neon の無料の保存先が眠るまで（使われなくなって 5 分）より短くして、眠る仕組みの邪魔をしない。
 */
export const CONNECTION_IDLE_SECONDS = 240;

/**
 * 文の形を保存先に覚えさせてよい宛先か。覚えると 2 回目からは「形の確認」の往復が要らず 1 往復で済む。
 *
 * 接続を束ねる中継（プール。Neon の `-pooler`・Supabase の `pooler.supabase.com`・`pgbouncer=true` の指定）の宛先では覚えない。
 * 中継の種類によっては、覚えた形が別の接続へ渡り、問い合わせが失敗する。README の手順は直接の宛先を使う。
 */
export function canPrepareStatements(url: URL): boolean {
  const host = url.hostname.toLowerCase();
  if (host.includes("-pooler.") || host.endsWith(".pooler.supabase.com")) return false;
  return url.searchParams.get("pgbouncer") !== "true";
}

/**
 * 接続が途中で無くなった印（postgres.js の符号・通信の符号・保存先が止まるときの 57P01）。
 * 関数の一時停止明けに、止まっている間に相手が閉じた接続を使うとこうなる。
 */
const LOST_CONNECTION: ReadonlySet<string> = new Set(["CONNECTION_CLOSED", "CONNECTION_DESTROYED", "ECONNRESET", "EPIPE", "57P01"]);

/**
 * 読むだけの問い合わせを、接続が無くなっていたときだけ 1 回やり直す（次は新しい接続でつなぐ）。
 * 書き込みには使わない。届いたかどうか分からない書き込みをやり直すと、二重に書きうる。
 */
async function readAgainIfLost<T>(read: () => Promise<T>): Promise<T> {
  try {
    return await read();
  } catch (error) {
    if (!LOST_CONNECTION.has(storeCode(error) ?? "")) throw error;
    return read();
  }
}

let connection: ReturnType<typeof postgres> | undefined;
let installationOwner: Promise<string> | undefined;
let installationReady = false;
function sql() {
  if (connection) return connection;
  const url = process.env.DATABASE_URL;
  if (!url) throw new SetupError("missing");
  let parsed: URL;
  try { parsed = new URL(url); } catch { throw new SetupError("database-url"); }
  if (!["postgres:", "postgresql:"].includes(parsed.protocol)) throw new SetupError("database-url");
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname);
  connection = postgres(url, {
    // Shared coordination removes competing writers, but their receipt polls
    // and authorized delta reads must not queue behind one another in three
    // connections. Keep the larger, bounded pool exclusive to that rollout.
    max: poolMax(),
    // 形を覚えるかは文ごとに決める（execute / callFunction が stable な文にだけ prepare を付ける）。ここは宛先が覚えてよいかだけ
    idle_timeout: CONNECTION_IDLE_SECONDS, connect_timeout: 10, prepare: canPrepareStatements(parsed),
    ssl: local ? false : { rejectUnauthorized: true, ...(process.env.DATABASE_CA_CERT ? {ca:process.env.DATABASE_CA_CERT} : {}) },
    transform: { value: { from: (value) => value instanceof Date ? value.toISOString() : value } },
  });
  return connection;
}

async function checkedConnection() {
  const connection = sql();
  if (isPersonalEdition()) {
    installationOwner ??= connection.unsafe<DbRow[]>("select owner_email from public.pages_installation where singleton = true and edition = 'personal'")
      .then((rows) => {
        if (rows.length !== 1 || typeof rows[0].owner_email !== "string") throw new SetupError("not-initialized");
        return rows[0].owner_email;
      }).catch((error: unknown) => {
        installationOwner = undefined;
        // 表が無い（42P01）のは初期化していない保存先。繋がらないなどはそのまま投げる
        const code = typeof error === "object" && error !== null && "code" in error ? error.code : null;
        throw code === "42P01" ? new SetupError("not-initialized") : error;
      });
    if (await installationOwner !== siteOwnerEmail()) throw new SetupError("owner-mismatch");
  }
  return connection;
}

/**
 * 同時に開く接続の上限。設定（DATABASE_POOL_MAX・1〜20）があればそれ、無ければ 3。体感速度の計測は、本番の HTTP 経由の保存先と同じく問い合わせを同時に投げられるよう広げる（docs/design/app-speed.md）。
 */
function poolMax(): number {
  const configured = Number(process.env.DATABASE_POOL_MAX);
  if (Number.isInteger(configured) && configured >= 1 && configured <= 20) return configured;
  return 3;
}

class Query implements PromiseLike<DbResult> {
  constructor(private state: State) {}
  private with(patch: Partial<State>) { return new Query({ ...this.state, ...patch }); }
  select(value: string) { return this.with({ columns: value, returning: true }); }
  insert(value: DbRow | DbRow[]) { return this.with({ operation: "insert", values: Array.isArray(value) ? value : [value] }); }
  update(value: DbRow) { return this.with({ operation: "update", values: [value] }); }
  delete() { return this.with({ operation: "delete" }); }
  upsert(value: DbRow, options: { onConflict: string }) { return this.with({ operation: "upsert", values: [value], conflict: options.onConflict }); }
  private filter(column: string, operator: Filter["operator"], value: unknown) { return this.with({ filters: [...this.state.filters, { column, operator, value }] }); }
  eq(column: string, value: unknown) { return this.filter(column, "=", value); }
  lt(column: string, value: unknown) { return this.filter(column, "<", value); }
  gt(column: string, value: unknown) { return this.filter(column, ">", value); }
  like(column: string, value: string) { return this.filter(column, "like", value); }
  /** 大文字小文字を区別しない like。 */
  ilike(column: string, value: string) { return this.filter(column, "ilike", value); }
  is(column: string, value: null) { return this.filter(column, "is", value); }
  not(column: string, operator: "is", value: null) { if (operator !== "is") throw new Error("未対応の比較です"); return this.filter(column, "is not", value); }
  in(column: string, value: readonly unknown[]) { return this.filter(column, "in", value); }
  or(value: string) {
    const alternatives = value.split(",").map((one): Filter => {
      const match = /^([a-z_][a-z0-9_]*)\.eq\.([a-zA-Z0-9_-]+)$/.exec(one);
      if (!match) throw new Error("複数条件の指定が正しくありません");
      return { column: match[1], operator: "=", value: match[2] };
    });
    return this.with({ alternatives });
  }
  order(column: string, options: { ascending: boolean }) { return this.with({ orders: [...this.state.orders, { column, ascending: options.ascending }] }); }
  limit(value: number) { if (!Number.isSafeInteger(value) || value < 0) throw new Error("件数が正しくありません"); return this.with({ limit: value }); }
  single() { return this.with({ cardinality: "one" }); }
  maybeSingle() { return this.with({ cardinality: "optional" }); }
  private async execute(): Promise<DbResult> {
    // 組織の絞りを外れた使い方は { error } にせず投げる（「行が無い」と読み違えて先へ進ませない）
    const state = withOrganization(this.state);
    try {
      const query = compileQuery(state);
      const run = async () => (await checkedConnection()).unsafe<DbRow[]>(query.text, query.parameters, { prepare: query.stable });
      const rows = await (state.operation === "select" ? readAgainIfLost(run) : run());
      if (this.state.cardinality === "many") return { data: [...rows], error: null };
      if (rows.length > 1 || (rows.length === 0 && this.state.cardinality === "one")) return { data: null, error: { code: "CARDINALITY", message: "保管庫の件数が一致しません" } };
      return { data: rows[0] ?? null, error: null };
    } catch (error) { return failure(error); }
  }
  then<T = DbResult, E = never>(resolve?: ((value: DbResult) => T | PromiseLike<T>) | null, reject?: ((reason: unknown) => E | PromiseLike<E>) | null): PromiseLike<T | E> { return this.execute().then(resolve, reject); }
}

function emptyQuery(table: string, organizationId?: string): Query {
  return new Query({ table, operation: "select", columns: "*", returning: false, values: [], filters: [], alternatives: [], orders: [], cardinality: "many", ...(organizationId === undefined ? {} : { organizationId }) });
}

async function callFunction(name: string, args: DbRow): Promise<DbResult> {
  try {
    identifier(name);
    const entries = Object.entries(args);
    const text = `select * from public.${identifier(name)}(${entries.map(([key, value], i) => `${identifier(key)} => ${placeholder(i + 1, value)}`).join(", ")})`;
    // 関数の呼び方は引数の名前で形が決まる（値の数で変わらない）。読むだけかは分からないので、やり直さない
    const rows = await (await checkedConnection()).unsafe<DbRow[]>(text, entries.map(([, value]) => parameter(value)), { prepare: true });
    return { data: [...rows], error: null };
  } catch (error) { return failure(error); }
}

/** 素の口。組織に属さない表（台帳の global）と、組織を引数に取らない関数（台帳の keyed）だけを触れる。 */
const database = {
  from(table: string) {
    requireKnownTable(table);
    if (ORGANIZATION_TABLES.has(table)) throw new TenantScopeError(table, "needs-organization");
    return emptyQuery(table);
  },
  async rpc(name: string, args: DbRow): Promise<DbResult> {
    if (ORGANIZATION_FUNCTIONS.has(name)) throw new TenantScopeError(name, "needs-organization");
    if (!KEYED_FUNCTIONS.has(name)) throw new TenantScopeError(name, "unknown");
    return callFunction(name, args);
  },
};

export function getDb() { return database; }

/**
 * 組織で絞った口。組織に属する表（台帳の organization）への select / update / delete には
 * `organization_id = <組織>` を必ず足し、insert / upsert には組織の印を差し込む。組織を引数に取る関数には
 * `p_organization_id` を差し込む。呼ぶ側は組織の条件を書かない（書き忘れで漏れる道を残さない）。
 *
 * 組織は入口（route・画面・サーバーの操作）が src/lib/organization/scope.ts の `currentOrganization()` で 1 度だけ決め、
 * 引数で下へ渡す。ページの子（版・コメント・許可…）は、引き当てたページが持つ組織（`StoredPage.organization`）を渡す。
 */
export function orgDb(organization: OrganizationScope) {
  if (!ORGANIZATION_ID.test(organization.id)) throw new TenantScopeError("orgDb", "organization-mismatch");
  return {
    from(table: string) {
      requireKnownTable(table);
      if (!ORGANIZATION_TABLES.has(table)) throw new TenantScopeError(table, "not-organization");
      return emptyQuery(table, organization.id);
    },
    async rpc(name: string, args: DbRow): Promise<DbResult> {
      if (KEYED_FUNCTIONS.has(name)) throw new TenantScopeError(name, "not-organization");
      if (!ORGANIZATION_FUNCTIONS.has(name)) throw new TenantScopeError(name, "unknown");
      const given = args[ORGANIZATION_ARGUMENT];
      if (given !== undefined && given !== organization.id) throw new TenantScopeError(name, "organization-mismatch");
      return callFunction(name, { [ORGANIZATION_ARGUMENT]: organization.id, ...args });
    },
  };
}
export type OrganizationDb = ReturnType<typeof orgDb>;

/** 配布版の保存先の大きさと中身の数。本人に使い切りの近さを見せるためだけに読む。社内版は読まない。 */
export async function storageUsage(): Promise<{ databaseBytes: number; pages: number; revisions: number } | null> {
  if (!isPersonalEdition()) return null;
  const rows = await (await checkedConnection()).unsafe<DbRow[]>(
    "select pg_database_size(current_database()) as bytes, (select count(*) from public.pages where deleted_at is null) as pages, (select count(*) from public.page_revisions) as revisions",
  );
  const row = rows[0];
  if (row === undefined) return null;
  return { databaseBytes: Number(row.bytes), pages: Number(row.pages), revisions: Number(row.revisions) };
}

/**
 * 設置がそろっているか。足りないものの種類だけを返す（値は返さない）。見るのは配布版だけ。
 * 組み立て中は何も見ない（保存先へ繋がない。止めるのは動いている最中のリクエスト）。
 * 画面の外枠（src/app/layout.tsx）が、画面を描く前に 1 度だけ呼ぶ。
 */
export async function installationProblem(): Promise<SetupProblem | null> {
  if (installationReady || process.env.NEXT_PHASE === "phase-production-build") return null;
  if (!isPersonalEdition()) return null;
  const names = environment.variables.filter((one) => one.required && (one.scope === "both" || one.scope === "personal")).map((one) => one.name)
    .filter((name) => (process.env[name] ?? "").trim().length === 0);
  if (names.length > 0) return { kind: "missing", names };
  try {
    siteOwnerEmail();
    siteOrigin();
    await (await checkedConnection()).unsafe("select 1");
    // そろったと分かれば、この実体の中では確かめ直さない（画面を開くたびに保存先を叩かない）。
    installationReady = true;
    return null;
  } catch (error) {
    return { kind: error instanceof SetupError ? error.kind : "database-unreachable" };
  }
}
export async function closeDatabase() { await connection?.end({ timeout: 5 }); connection = undefined; installationOwner = undefined; installationReady = false; }
