/**
 * 「組織に属する表を、組織の絞りなしで触っていないか」を確かめる（複数組織対応の A2）。
 *
 * 保存先の口は 2 つある（src/lib/db/database.ts）。
 *   - 組織で絞った口 `orgDb(organization)` … 組織に属する表に `organization_id = <組織>` を必ず付け、insert に印を差し込む
 *   - 素の口 `getDb()` … 組織に属さない表と、組織を引数に取らない関数だけ
 * どちらに属するかの正本は台帳 src/lib/organization/tenant-tables.json。素の口で組織に属する表を触ると実行時にも止まるが、
 * 実行時に止まるのは「その行を通ったとき」だけなので、通らない道（めったに開かない画面・夜の掃除）に絞り忘れが
 * 眠っていても気づけない。ここでは字面で全部の道を見る。
 *
 * ここで見るのは 5 つ。
 *   1. 台帳: 移行で作った表は全部、台帳のどちらか 1 つに載っている（台帳に無い表は落とす）
 *   2. 印: 組織に属する表には全部、組織の印の列（organization_id）を足してある。既定値（DEFAULT）は付けない
 *   3. 関数: 組織を引数に取る関数は p_organization_id を最初の引数に取る。台帳の関数は全部、移行に在る
 *   4. 字面: src/app/・src/lib/ の中で、素の口から組織に属する表・関数を触る行、組織で絞った口から組織に属さない表・関数を触る行、
 *      台帳に無い表・関数を触る行、表の名前が字面から決められない行を、1 つも通さない
 *   5. 実際に呼ぶ: 素の口は組織に属する表を断り、組織で絞った口は条件と印を付ける（保存先にはつながない）
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { build } from "esbuild";
import { root, dir } from "./paths.mjs";

let fails = 0;
const ok = (label, actual, expected) => {
  const pass = String(actual) === String(expected);
  if (!pass) fails += 1;
  console.log(`${pass ? "OK  " : "NG  "} ${label}: ${actual}（期待: ${expected}）`);
};
const read = (path) => readFileSync(`${root}/${path}`, "utf8");
const strip = (text) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "").replace(/([^:"'`])\/\/[^\n"'`]*$/gm, "$1");

const ledger = JSON.parse(read("src/lib/organization/tenant-tables.json"));
const ORGANIZATION = new Set(Object.keys(ledger.organization));
const GLOBAL = new Set(Object.keys(ledger.global));
const ORGANIZATION_FUNCTIONS = new Set(Object.keys(ledger.functions.organization));
const KEYED_FUNCTIONS = new Set(Object.keys(ledger.functions.keyed));

const MIGRATIONS = readdirSync(`${root}/db/migrations`).filter((name) => name.endsWith(".sql")).sort();
const SQL = MIGRATIONS.map((name) => ({ name, text: read(`db/migrations/${name}`) }));
const ALL_SQL = SQL.map((one) => one.text).join("\n");

// ---------------------------------------------------------------------------
console.log("--- 1. 台帳: 表は全部、組織に属する・属さないのどちらか 1 つに載っている ---");
const created = new Set();
for (const match of ALL_SQL.matchAll(/create table (?:if not exists )?public\.([a-z_][a-z0-9_]*)/gi)) created.add(match[1]);
// 配布版の設置が自分で作る台帳（scripts/setup/database.mjs）
for (const match of read("scripts/setup/database.mjs").matchAll(/create table public\.([a-z_][a-z0-9_]*)/g)) created.add(match[1]);
ok("組織に属するのと属さないのが重ならない", [...ORGANIZATION].filter((name) => GLOBAL.has(name)).join(" / ") || "なし", "なし");
ok("台帳に無い表", [...created].filter((name) => !ORGANIZATION.has(name) && !GLOBAL.has(name)).sort().join(" / ") || "なし", "なし");
ok("台帳にあるのに作られていない表", [...ORGANIZATION, ...GLOBAL].filter((name) => !created.has(name)).sort().join(" / ") || "なし", "なし");
ok("台帳の表と関数には、それぞれ理由（1 行）が書いてある",
  [...Object.entries(ledger.organization), ...Object.entries(ledger.global), ...Object.entries(ledger.functions.organization), ...Object.entries(ledger.functions.keyed).map(([name, entry]) => [name, entry?.why])]
    .filter(([, why]) => typeof why !== "string" || why.trim().length === 0).map(([name]) => name).join(" / ") || "なし", "なし");

console.log("\n   組織を取らない保存先の関数（keyed）は減る方向だけ。「組織を取る形へ直す段」（stage）の付いたものが残っている間は 2 つ目の組織を本番に作らない");
/**
 * keyed の数の上限と、そのうち直す段の決まったもの（stage が null でない）の上限。**減る方向だけ**。
 * 増やすには台帳とここの両方を動かすことになるので、PR の本文に理由を書く。直したら数を下げる。
 */
const KEYED_CEILING = 24;
const STAGED_CEILING = 2;
const keyedEntries = Object.entries(ledger.functions.keyed);
ok("keyed の各項目は理由（why）と直す段（stage・直さなくてよいものは null）を持つ",
  keyedEntries.filter(([, entry]) => typeof entry !== "object" || entry === null || !("stage" in entry) || (entry.stage !== null && (typeof entry.stage !== "string" || entry.stage.trim() === ""))).map(([name]) => name).join(" / ") || "なし", "なし");
ok(`keyed の数は ${KEYED_CEILING} 以下（減る方向だけ）`, keyedEntries.length <= KEYED_CEILING, true);
const staged = keyedEntries.filter(([, entry]) => entry?.stage !== null).length;
ok(`直す段の決まった keyed は ${STAGED_CEILING} 以下（減る方向だけ）`, staged <= STAGED_CEILING, true);

// ---------------------------------------------------------------------------
console.log("\n--- 2. 印: 組織に属する表には組織の印の列があり、既定値で 最初の組織 に倒さない ---");
const withColumn = new Set();
for (const match of ALL_SQL.matchAll(/alter table public\.([a-z_][a-z0-9_]*) add column organization_id uuid([^;]*);/g)) {
  withColumn.add(match[1]);
  if (/default/i.test(match[2])) ok(`  ${match[1]} の印に既定値が無い`, match[2].trim(), "");
}
// 組織の印を最初から持って生まれた表（の organization_invitations 以後）。作る文の中の列を見る。
// 組織に属さない表（所属の名簿など・主キーに組織の目印を持つ）も作る文に organization_id を持つので、ここで拾うのは台帳の organization の表だけ
for (const match of ALL_SQL.matchAll(/create table (?:if not exists )?public\.([a-z_][a-z0-9_]*) \(([\s\S]*?)\n\);/g)) {
  if (!ORGANIZATION.has(match[1])) continue;
  const column = /^\s*organization_id uuid([^,\n]*)/m.exec(match[2]);
  if (column === null) continue;
  withColumn.add(match[1]);
  ok(`  ${match[1]} の印は作るときから必須で、既定値が無い`, /not null/i.test(column[1]) && !/default/i.test(column[1]), true);
}
// A2 より後に生まれた組織に属する表（の organization_secrets など）は、作る文の中で印の列を持つ。こちらも既定値を持たせない。
// 組織の台帳そのもの（所属の名簿・ドメイン）も作る文の頭に目印を持つが、あれは組織に属さない表（台帳の global）なので数えない
for (const match of ALL_SQL.matchAll(/create table public\.([a-z_][a-z0-9_]*) \(\s*organization_id uuid([^,]*),/g)) {
  if (!ORGANIZATION.has(match[1])) continue;
  withColumn.add(match[1]);
  ok(`  ${match[1]} の印は作る文の中で、既定値が無く、組織の台帳を指す`, /default/i.test(match[2]) ? match[2].trim() : /^ not null references public\.organizations\(id\)$/.test(match[2]) ? "" : match[2].trim(), "");
}
ok("組織の印の列が無い表", [...ORGANIZATION].filter((name) => !withColumn.has(name)).sort().join(" / ") || "なし", "なし");
ok("組織に属さない表に印を足していない", [...withColumn].filter((name) => !ORGANIZATION.has(name)).sort().join(" / ") || "なし", "なし");
ok("印の列に既定値を足す文が無い", /alter column organization_id set default/i.test(ALL_SQL), false);
ok("ページの呼び名は組織の中で一意", /create unique index \w+ on public\.pages \(organization_id, page_slug\)/.test(ALL_SQL), true);
ok("まとまりの名前は組織の中で一意", /create unique index \w+ on public\.groups \(organization_id, lower\(name\)\) where deleted_at is null/.test(ALL_SQL), true);
ok("コメントは別の組織のページを指せない（複合の外部キー）", /alter table public\.page_comments add constraint \w+ foreign key \(organization_id, page_id\) references public\.pages \(organization_id, id\)/.test(ALL_SQL), true);
ok("版も別の組織のページを指せない（複合の外部キー）", /alter table public\.page_revisions add constraint \w+ foreign key \(organization_id, page_id\) references public\.pages \(organization_id, id\)/.test(ALL_SQL), true);

// ---------------------------------------------------------------------------
console.log("\n--- 3. 関数: 組織を引数に取る関数は p_organization_id を最初に取る ---");
const definitions = new Map();
for (const match of ALL_SQL.matchAll(/create (?:or replace )?function public\.([a-z_][a-z0-9_]*)\s*\(([^)]*)\)/gi)) definitions.set(match[1], match[2]);
for (const name of ORGANIZATION_FUNCTIONS) {
  const parameters = definitions.get(name);
  ok(`  ${name} は p_organization_id uuid を最初に取る`, parameters === undefined ? "移行に無い" : /^\s*p_organization_id uuid\b/.test(parameters), true);
}
ok("台帳の「組織を取らない関数」は全部、移行に在る", [...KEYED_FUNCTIONS].filter((name) => !definitions.has(name)).join(" / ") || "なし", "なし");
ok("組織を取る関数と取らない関数が重ならない", [...ORGANIZATION_FUNCTIONS].filter((name) => KEYED_FUNCTIONS.has(name)).join(" / ") || "なし", "なし");

// ---------------------------------------------------------------------------
console.log("\n--- 4. 字面: 素の口で組織に属する表を触らない・組織で絞った口で組織に属さない表を触らない ---");
function collect(from) {
  const found = [];
  for (const entry of readdirSync(`${root}/${from}`, { withFileTypes: true })) {
    const path = `${from}/${entry.name}`;
    if (entry.isDirectory()) found.push(...collect(path));
    else if (/\.(tsx?|mjs)$/.test(entry.name)) found.push(path);
  }
  return found;
}
const ROOT_FILES = readdirSync(root).filter((name) => /^(proxy|auth|instrumentation[\w-]*)\.ts$/.test(name) && statSync(`${root}/${name}`).isFile());
const FILES = [...collect("src/app"), ...collect("src/lib"), ...ROOT_FILES].filter((path) => path !== "src/lib/db/database.ts").sort();

/**
 * 表・関数の名前の定数（`const PAGES_TABLE = "pages"`）。同じファイルの中の定数を先に見て、無ければ export された定数を見る。
 * export された定数は、ファイルをまたいで同じ名前が別の値を指していないことも確かめる（指していると引き当てが決まらない）。
 */
const exported = new Map();
const clashing = new Set();
const localConstants = (source) => {
  const found = new Map();
  for (const match of source.matchAll(/(?:export\s+)?const\s+([A-Z][A-Z0-9_]*)\s*=\s*["']([a-z_][a-z0-9_]*)["']/g)) found.set(match[1], match[2]);
  // 別の定数を写しただけのもの（`const OPTOUTS_TABLE = VIEW_OPTOUTS_TABLE`）
  for (const match of source.matchAll(/(?:export\s+)?const\s+([A-Z][A-Z0-9_]*)\s*=\s*([A-Z][A-Z0-9_]*)\s*;/g)) found.set(match[1], `=${match[2]}`);
  return found;
};
for (const path of FILES) {
  for (const match of read(path).matchAll(/export\s+const\s+([A-Z][A-Z0-9_]*)\s*=\s*["']([a-z_][a-z0-9_]*)["']/g)) {
    if (exported.has(match[1]) && exported.get(match[1]) !== match[2]) clashing.add(match[1]);
    exported.set(match[1], match[2]);
  }
}
ok("export された表・関数の名前の定数が、ファイルをまたいで別の値を指していない", [...clashing].join(" / ") || "なし", "なし");
function resolveConstant(name, local) {
  for (let hops = 0; hops < 3; hops += 1) {
    const value = local.get(name) ?? exported.get(name);
    if (value === undefined) return null;
    if (!value.startsWith("=")) return value;
    name = value.slice(1);
  }
  return null;
}

/**
 * 1 つのファイルの中の、保存先の口を通る呼び出しを全部拾う。
 * 口の形は 3 つ: `getDb().from(…)`・`orgDb(…).from(…)`・口を入れた変数（`const db = getDb()` の db）。
 */
function scan(source) {
  const code = strip(source);
  const local = localConstants(code);
  const raw = new Set();
  const scoped = new Set();
  for (const match of code.matchAll(/(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=\s*getDb\(\)/g)) raw.add(match[1]);
  for (const match of code.matchAll(/(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=\s*orgDb\(/g)) scoped.add(match[1]);
  const names = [...raw, ...scoped].map((name) => name.replace(/\$/g, "\\$"));
  const receiver = `getDb\\(\\)|orgDb\\((?:[^()]|\\([^()]*\\))*\\)${names.length > 0 ? `|\\b(?:${names.join("|")})\\b` : ""}`;
  const calls = [];
  const pattern = new RegExp(`(${receiver})\\s*\\.\\s*(from|rpc)\\(\\s*([^,)]*)`, "g");
  for (const match of code.matchAll(pattern)) {
    const head = match[1];
    const kind = head.startsWith("orgDb(") || scoped.has(head) ? "scoped" : "raw";
    const argument = match[3].trim();
    const literal = /^["'`]([a-z_][a-z0-9_]*)["'`]$/.exec(argument);
    const name = literal ? literal[1] : /^[A-Z][A-Z0-9_]*$/.test(argument) ? resolveConstant(argument, local) : null;
    calls.push({ kind, method: match[2], name, argument, line: code.slice(0, match.index).split("\n").length });
  }
  return calls;
}

/** 呼び出し 1 つの判定。問題が無ければ null、あれば理由の短い文。 */
function judge(call) {
  if (call.name === null) return `名前が字面から決められない（${call.argument}）。台帳の名前を文字か定数で書く`;
  if (call.method === "from") {
    if (!ORGANIZATION.has(call.name) && !GLOBAL.has(call.name)) return `台帳に無い表（${call.name}）`;
    if (call.kind === "raw" && ORGANIZATION.has(call.name)) return `組織に属する表（${call.name}）を素の口で触っている。orgDb(organization) を使う`;
    if (call.kind === "scoped" && GLOBAL.has(call.name)) return `組織に属さない表（${call.name}）を組織で絞った口で触っている。getDb() を使う`;
    return null;
  }
  if (!ORGANIZATION_FUNCTIONS.has(call.name) && !KEYED_FUNCTIONS.has(call.name)) return `台帳に無い関数（${call.name}）。組織を取らない古い関数を呼んでいないか`;
  if (call.kind === "raw" && ORGANIZATION_FUNCTIONS.has(call.name)) return `組織を取る関数（${call.name}）を素の口で呼んでいる`;
  if (call.kind === "scoped" && KEYED_FUNCTIONS.has(call.name)) return `組織を取らない関数（${call.name}）を組織で絞った口で呼んでいる`;
  return null;
}

const problems = [];
let counted = 0;
for (const path of FILES) {
  const source = read(path);
  if (!/getDb|orgDb/.test(source)) continue;
  for (const call of scan(source)) {
    counted += 1;
    const why = judge(call);
    if (why !== null) problems.push(`${path}:${call.line} ${why}`);
  }
}
for (const problem of problems) console.log(`      ${problem}`);
ok("保存先の口を通る呼び出しを拾えている", counted > 100, true);
ok("絞りを外れた呼び出し", problems.length, 0);
ok("保存先の口の別名を作っていない（import { getDb as … }）", FILES.filter((path) => /\b(getDb|orgDb)\s+as\s+\w+/.test(read(path))).join(" / ") || "なし", "なし");

console.log("\n   組織は入口で 1 度だけ決めて引数で渡す。lib の中で要求の組織を引いてよいのは、入口の本体と、組織を渡せない口だけ");
/**
 * lib の中で `currentOrganization()` を呼んでよいファイルと理由。**減る方向だけ**（A4・A5 で名乗りと関所が組織を渡す形になったら外す）。
 * ここに無い lib のファイルが呼んだら落とす（隠れたところで組織が決まると、どの組織で絞ったかを追えない）。
 */
const ORGANIZATION_LOOKUPS = {
  "src/lib/organization/scope.ts": "組織を引く口そのもの",
  "src/lib/pages/private-page.ts": "社内ページの入口の本体（src/app/internal・src/app/history が呼ぶ）",
  "src/lib/identity/identity.ts": "名乗りの入口の本体。要求の組織をここで 1 度だけ決め、鍵の照合と所属の読みへ渡す（A4 で鍵の照合から移した・A5 で関所の宛先から）",
  "src/lib/workspace/workspace.ts": "言語の決め方（src/lib/i18n/server.ts）から呼ばれる個人設定の読み方と、組織の既定の言語の読み方・組織の名前の読み方（。同じ組織の設定の読みを分け合う）",
};
const lookups = FILES.filter((path) => path.startsWith("src/lib/") && /\bcurrentOrganization\(\)/.test(strip(read(path))));
ok("lib の中で要求の組織を引くファイルは台帳のものだけ", lookups.filter((path) => !(path in ORGANIZATION_LOOKUPS)).join(" / ") || "なし", "なし");
ok("台帳に載っていて、もう引いていないファイル（台帳から外す）", Object.keys(ORGANIZATION_LOOKUPS).filter((path) => path !== "src/lib/organization/scope.ts" && !lookups.includes(path)).join(" / ") || "なし", "なし");

console.log("\n   組織をまたいで効く昔の仕組みは、最初の組織の外では効かせない（安全側）");
const GATES = strip(read("src/lib/access/gates.ts"));
// 管理者かは所属の役割で決める（A4）。昔の名簿（admins）と保存先の関数の is_admin は読まず、名乗りの所属が別の組織なら管理者ではない
ok("管理者かは所属の役割で、名乗りの所属が別の組織なら管理者ではない（昔の admins 表は読まない）", /return member\.organization\.id === organization\.id && administersOrganization\(member\);/.test(GATES) && !/ADMINS_TABLE|"is_admin"/.test(GATES), true);
ok("夜の掃除が回す組織の一覧は、この設置の組織 1 つ", /export async function everyOrganization\(\)[\s\S]*?return \[firstOrganizationScope\(\)\];/.test(read("src/lib/organization/organizations.ts")), true);

console.log("\n   見張りの見張り: 拾い方そのものが壊れていないか（わざと間違えた字面を渡す）");
const probe = (text) => scan(text).map(judge);
ok("素の口で pages を読むと落とす", probe(`const r = await getDb().from("pages").select("id");`)[0] !== null, true);
ok("定数でも・改行をはさんでも落とす", probe(`await getDb()\n  .from(PAGES_TABLE)`)[0] !== null, true);
ok("変数に入れた素の口でも落とす", probe(`const db = getDb(); await db.from("publish_tokens").select("id");`)[0] !== null, true);
ok("組織で絞った口で pages を読むのは通す", probe(`await orgDb(page.organization).from("pages").select("id");`)[0], null);
ok("組織で絞った口で組織の台帳を読むと落とす", probe(`await orgDb(organization).from("organizations").select("id");`)[0] !== null, true);
ok("名前の決まらない表は落とす", probe(`await getDb().from(table).select("id");`)[0] !== null, true);
ok("組織を取る関数を素の口で呼ぶと落とす", probe(`await getDb().rpc("org_page_access_facts", {});`)[0] !== null, true);
ok("組織を取らない古い関数（台帳に無い）を呼ぶと落とす", probe(`await getDb().rpc("page_access_facts", {});`)[0] !== null, true);

// ---------------------------------------------------------------------------
console.log("\n--- 5. 実際に呼ぶ: 素の口は断り、組織で絞った口は条件と印を付ける（保存先にはつながない） ---");
await build({ entryPoints: [`${root}/src/lib/db/database.ts`], outfile: `${dir}/tenant-scope-database.cjs`, bundle: true, platform: "node", format: "cjs", logLevel: "error" });
const database = createRequire(import.meta.url)(`${dir}/tenant-scope-database.cjs`);
const SURPRISE = { id: "00000000-0000-4000-8000-000000000001", assetPrefix: "" };
const thrown = (fn) => { try { fn(); return "通った"; } catch (error) { return error?.name ?? "例外"; } };
ok("素の口で組織に属する表を開くと止まる", thrown(() => database.getDb().from("pages")), "TenantScopeError");
ok("素の口で台帳に無い表を開くと止まる", thrown(() => database.getDb().from("no_such_table")), "TenantScopeError");
ok("素の口で組織に属さない表は開ける", thrown(() => database.getDb().from("organizations")), "通った");
ok("組織で絞った口で組織に属さない表を開くと止まる", thrown(() => database.orgDb(SURPRISE).from("organizations")), "TenantScopeError");
ok("目印の形でない組織は受けない", thrown(() => database.orgDb({ id: "surprise", assetPrefix: "" })), "TenantScopeError");
const base = { table: "pages", columns: "id", returning: true, values: [], filters: [{ column: "page_slug", operator: "=", value: "internal/a" }], alternatives: [], orders: [], cardinality: "many", organizationId: SURPRISE.id };
const selected = database.compileQuery(database.withOrganization({ ...base, operation: "select" }));
ok("読むときは組織の条件が必ず付く", selected.text, 'select "id" from public."pages" where "organization_id" = $1 and "page_slug" = $2');
ok("条件の値は組織の目印", selected.parameters[0], SURPRISE.id);
const inserted = database.compileQuery(database.withOrganization({ ...base, operation: "insert", filters: [], values: [{ page_slug: "internal/a" }] }));
ok("書くときは組織の印が差し込まれる", /"organization_id"/.test(inserted.text) && inserted.parameters.includes(SURPRISE.id), true);
ok("別の組織の印で書こうとすると止まる", thrown(() => database.withOrganization({ ...base, operation: "insert", filters: [], values: [{ organization_id: "00000000-0000-4000-8000-000000000002" }] })), "TenantScopeError");
ok("組織の印を書き換えようとすると止まる", thrown(() => database.withOrganization({ ...base, operation: "update", values: [{ organization_id: SURPRISE.id }] })), "TenantScopeError");
ok("組織の印を含まない見分け方の upsert は止まる", thrown(() => database.withOrganization({ ...base, operation: "upsert", filters: [], values: [{ page_slug: "x" }], conflict: "page_slug" })), "TenantScopeError");
const removed = database.compileQuery(database.withOrganization({ ...base, operation: "delete" }));
ok("消すときも組織の条件が必ず付く", /^delete from public\."pages" where "organization_id" = \$1 and /.test(removed.text), true);
let called = "呼ばれない";
try { await database.getDb().rpc("org_page_access_facts", {}); } catch (error) { called = error?.name ?? "例外"; }
ok("組織を取る関数は素の口から呼べない", called, "TenantScopeError");
called = "呼ばれない";
try { await database.getDb().rpc("page_access_facts", {}); } catch (error) { called = error?.name ?? "例外"; }
ok("組織を取らない古い関数（台帳に無い）は呼べない", called, "TenantScopeError");

console.log(`\n${fails === 0 ? "すべて合格" : `${fails} 件 不合格`}`);
if (fails > 0) process.exitCode = 1;
