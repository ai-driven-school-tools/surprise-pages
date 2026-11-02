/**
 * 資料の一覧（自分の資料・会社の資料・お気に入り）を、サーバーで 1 ページ分に切り出す作り。
 *
 * 前はブラウザが全件を受け取って、棚分け・検索・絞り込み・並べ替え・50 件ずつの切り分けをしていた。
 * いまはサーバー（`src/app/_components/library-screen.tsx`）が済ませ、今のページの行と総数だけを渡す。
 * ここで見るのは 4 つ。
 *   1. 前の画面の組み立て（下の `before`。前のブラウザ側の処理をそのまま写したもの）と、
 *      棚・タブ・検索・形式・共有範囲・並び・ページ番号のすべての組み合わせで同じ行・同じ順・同じ件数
 *   2. サーバーの一覧の部品そのものが、URL の値をそのとおりに読み、上と同じものを渡している
 *   3. 見る人を絞った資料が、名簿の外の人の一覧に（件数にも）出ない
 *   4. ブラウザへ渡す量が資料の数に比例しない（1,000 件と 10,000 件で同じ）
 *
 * 保存先は使い捨ての PGlite に全部の移し替えを流したもの。差し替えるのは名乗りと
 * 保存先への通り道だけで、見てよいかの判定（`visiblePagesFor`）は本物を通す。
 * 本番と同じ組み立てで画面を叩く確かめは tests/e2e/workspace.spec.mjs が持つ。
 */
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { AsyncLocalStorage } from "node:async_hooks";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { isDeepStrictEqual } from "node:util";
import { PGlite } from "@electric-sql/pglite";
import { build } from "esbuild";
import { root, dir, companyDeployment } from "./paths.mjs";

const require = createRequire(import.meta.url);
let failures = 0;
async function check(label, test) {
  try { await test(); console.log(`OK  ${label}`); }
  catch (error) { failures++; console.log(`NG  ${label}: ${error.message}`); }
}

// ---------------------------------------------------------------------------
// 実装を組み立てる（名乗りと保存先への通り道だけ差し替え）
// ---------------------------------------------------------------------------
const stub = `${root}/tests/checks/fixtures/deck-edit/transport.mjs`;
const out = `${dir}/workspace-list.mjs`;
await build({
  stdin: {
    contents: `export {LibraryScreen} from './src/app/_components/library-screen'; export {WorkspaceList} from './src/app/_components/workspace-list';
export {workspaceRows} from './src/lib/workspace/workspace'; export * from './src/lib/workspace/model';`,
    resolveDir: root, loader: "ts",
  },
  outfile: out, bundle: true, format: "esm", platform: "node", logLevel: "silent", jsx: "automatic",
  // 絵記号の部品（CommonJS）が外に置いた react を require で読むため
  banner: { js: `import { createRequire as __createRequire } from "node:module"; const require = __createRequire(${JSON.stringify(`${root}/package.json`)});` },
  plugins: [companyDeployment, { name: "test-transport", setup(b) {
    b.onResolve({ filter: /^next\/(navigation|server)$/ }, (args) => ({ path: require.resolve(args.path), external: true }));
    b.onResolve({ filter: /^react(\/.*)?$|^react-dom(\/.*)?$|^@radix-ui\// }, (args) => ({ path: require.resolve(args.path), external: true }));
    b.onResolve({ filter: /supabase$|database$|pages\/cache$|^\.\/cache$|(^|\/)identity$|^@\/auth$|^@vercel\/blob$/ }, () => ({ path: stub }));
  } }],
});
const pg = new PGlite();
await pg.exec("create role anon; create role authenticated; create role service_role bypassrls;");
for (const file of readdirSync(`${root}/db/migrations`).sort()) if (file.endsWith(".sql")) await pg.exec(readFileSync(`${root}/db/migrations/${file}`, "utf8"));
globalThis.__deckPg = pg;
globalThis.__deckIdentity = new AsyncLocalStorage();
const api = await import(pathToFileURL(out).href);
delete process.env.PAGES_EDITION;

/** 要求の組織（最初の組織）の member の所属。名乗りは要求ごとに所属を付ける。 */
const ORG_MEMBER = { id: "00000000-0000-4000-8000-000000000001", assetPrefix: "", role: "member" };
const owner = { kind: "member", email: "owner@example.test", name: "作成者", image: null , organization: ORG_MEMBER };
const reader = { kind: "member", email: "reader@example.test", name: null, image: null , organization: ORG_MEMBER };
const collaborator = { kind: "member", email: "collab@example.test", name: "共同編集者", image: null , organization: ORG_MEMBER };
const VIEWERS = [owner, reader, collaborator];
/** 最初の組織（最初の組織）。移行が材料の行をこの組織へ写す */
const ORGANIZATION = Object.freeze({ id: "00000000-0000-4000-8000-000000000001", assetPrefix: "" });
const as = (viewer, run) => globalThis.__deckIdentity.run(viewer, run);

// ---------------------------------------------------------------------------
// 材料: 3 ページ以上にまたがる 130 件。題名はかな・カナ・全角・同じ名前、時刻は同じものを混ぜる
// ---------------------------------------------------------------------------
const EMAILS = ["owner@example.test", "reader@example.test", "collab@example.test"];
await pg.query(`insert into pages (page_slug, visibility, title, created_by, current_version_id, updated_at)
  select
    case when n % 17 = 0 then 'public/list/p-' || n else 'internal/list/p-' || n end,
    case when n % 17 = 0 or n % 7 = 0 then 'public' when n % 13 = 0 then 'restricted' else 'internal' end,
    case when n % 10 = 0 then '同じ名前'
      else (array['営業のスライド','かたかなの文書','カタカナの図解','ＡＢＣ公開','Report abc','人事の内緒'])[1 + n % 6] || ' ' || lpad(n::text, 3, '0') end,
    (array['owner@example.test','reader@example.test','collab@example.test'])[1 + n % 3],
    case when n % 4 = 0 then null else 'v-' || n end,
    timestamptz '2026-09-01T00:00:00Z' + ((n % 40) || ' minutes')::interval
  from generate_series(1, 130) n`);
await pg.query(`insert into page_catalog (page_id, version_id, classifier_version, kind)
  select id, current_version_id, 1, (array['deck','document','page','motion'])[1 + (substring(page_slug from '[0-9]+$')::int % 5)]
  from pages where current_version_id is not null and substring(page_slug from '[0-9]+$')::int % 5 < 4`);
// 見る人を絞った資料のうち、偶数番は owner を共同の作った人に、3 の倍数は reader に見せる
await pg.query(`insert into page_permissions (page_id, grantee_kind, member_email, role)
  select id, 'member', 'owner@example.test', 'owner' from pages
  where visibility = 'restricted' and substring(page_slug from '[0-9]+$')::int % 2 = 0 and created_by <> 'owner@example.test'`);
await pg.query(`insert into page_permissions (page_id, grantee_kind, member_email, role)
  select id, 'member', 'reader@example.test', 'viewer' from pages
  where visibility = 'restricted' and substring(page_slug from '[0-9]+$')::int % 3 = 0 and created_by <> 'reader@example.test'`);
for (const [email, step] of [[EMAILS[0], 2], [EMAILS[1], 5], [EMAILS[2], 11]]) {
  await pg.query(`insert into page_favorites (owner_email, page_id)
    select $1, id from pages where substring(page_slug from '[0-9]+$')::int % $2 = 0`, [email, step]);
}
// 自分の資料の棚の候補の拾い方: 作った人の欄の大文字小文字違い・前後の空白は自分のもの、
// 名前が含まれるだけの別の人（xowner@…）・消した資料は自分の棚に入らない
await pg.query(`insert into pages (page_slug, visibility, title, created_by, current_version_id, updated_at, deleted_at) values
  ('internal/list/upper-case', 'internal', '大文字で残った作った人', 'OWNER@Example.TEST', 'v-upper', '2026-09-02T00:00:00Z', null),
  ('internal/list/spaced', 'internal', '空白つきの作った人', ' owner@example.test ', null, '2026-09-02T00:00:01Z', null),
  ('internal/list/lookalike', 'internal', '似た名前の別の人', 'xowner@example.test', null, '2026-09-02T00:00:02Z', null),
  ('internal/list/deleted', 'internal', '消した自分の資料', 'owner@example.test', null, '2026-09-02T00:00:03Z', '2026-09-03T00:00:00Z')`);
await pg.query(`insert into page_catalog (page_id, version_id, classifier_version, kind)
  select id, current_version_id, 1, 'deck' from pages where page_slug = 'internal/list/upper-case'`);

// ---------------------------------------------------------------------------
// 前の画面の組み立て。#116 より前の main（9c140c7）の src/app/_components/workspace-list.tsx にあった
// ブラウザ側の処理の写しで、**いまの共通の部品（src/lib/workspace/model.ts）を 1 つも呼ばない**。
// 呼ぶと、比べる両側が同じ部品になり、部品を壊しても差が出ない。
// 全件を受け取り、URL の値を読み、棚・検索・絞り込み・並び・ページ番号で 50 件を切り出していた。
// ---------------------------------------------------------------------------
/** 検索用の文字のたたみ方の写し（9c140c7 の foldWorkspaceText）。 */
function foldBefore(text) {
  return text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[ぁ-ゖ]/g, (k) => String.fromCharCode(k.charCodeAt(0) + 0x60));
}
function before(rows, shelf, params) {
  const query = params.get("q") ?? "",
    kind = params.get("kind") ?? "",
    scope = params.get("scope") ?? "",
    sort = params.get("sort") ?? "new",
    tab = params.get("tab") ?? "created";
  const pool = rows.filter(
    (row) =>
      shelf === "company" ||
      (shelf === "favorites" && row.favorite) ||
      (shelf === "mine" && (tab === "shared" ? row.collaborator && !row.mine : row.mine)),
  );
  const needle = foldBefore(query.trim());
  const searching = needle.length > 0;
  const indexed = searching ? new Map(pool.map((row) => [row.id, foldBefore(row.title + " " + row.href)])) : null;
  const found = (() => {
    const filtered = pool.filter((row) =>
      (!kind || row.kind === kind) && (!scope || row.scope === scope) &&
      (!needle || indexed?.get(row.id)?.includes(needle)));
    if (sort !== "name" && sort !== "old") return filtered;
    return filtered.sort((a, b) =>
      (sort === "name" ? a.title.localeCompare(b.title, "ja") : a.updatedAt.localeCompare(b.updatedAt)) ||
      a.id.localeCompare(b.id));
  })();
  const total = Math.max(1, Math.ceil(found.length / 50)),
    requested = Number(params.get("page") ?? 1),
    page = Math.min(total, Math.max(1, Number.isSafeInteger(requested) ? requested : 1));
  return { rows: found.slice((page - 1) * 50, page * 50), total: found.length, page };
}

/** 新しい作り（URL を読む → 1 ページ分を切り出す）。変異の検査では、ここを壊した版に差し替える。 */
const current = (rows, shelf, params) => api.pageOfWorkspace(rows, shelf, api.workspaceViewOf((name) => params.get(name)));

/** 1 つの棚について、すべての組み合わせで前の画面と比べる。最初の食い違いを返す（無ければ null）。 */
function firstDifference(rows, shelf, tab, list) {
  for (const params of grid()) {
    if (tab !== null) params.set("tab", tab);
    const expected = before(rows, shelf, params);
    const actual = list(rows, shelf, params);
    if (JSON.stringify(ids(actual.rows)) !== JSON.stringify(ids(expected.rows))) return `?${params}（行・順）`;
    if (!isDeepStrictEqual(actual.rows, expected.rows)) return `?${params}（行の中身）`;
    if (actual.total !== expected.total) return `?${params}（件数）`;
    if (actual.page !== expected.page) return `?${params}（ページ番号）`;
    if (actual.rows.length > 50) return `?${params}（50 件を超えた）`;
  }
  return null;
}

/** Next.js がページへ渡す形（同じ名前が複数あれば配列）。 */
function searchParamsOf(params) {
  const record = {};
  for (const key of new Set(params.keys())) {
    const values = params.getAll(key);
    record[key] = values.length > 1 ? values : values[0];
  }
  return Promise.resolve(record);
}

/** サーバーの一覧の部品を呼び、ブラウザ側の部品へ渡している中身を取り出す。 */
async function rendered(viewer, shelf, params) {
  const element = await as(viewer, () => api.LibraryScreen({ shelf, searchParams: searchParamsOf(params) }));
  // 一覧は待ちの表示で包まずに、そのまま返す（待ちは画面の枠の 1 つだけ）
  const list = element;
  assert.equal(list.type, api.WorkspaceList, "一覧の部品へ渡していない");
  return list.props;
}

const ids = (rows) => rows.map((row) => row.id);
const QUERIES = ["", "カタカナ", "ｶﾀｶﾅ", "かたかな", "abc", "ＡＢＣ", "/internal/list/p-1", "  営業  ", "同じ", "内緒", "見つからない語"];
const KINDS = ["", "deck", "document", "page", "motion", "unknown", "bogus"];
const SCOPES = ["", "company", "restricted", "public", "bogus"];
const SORTS = [null, "new", "old", "name", "bogus"];
const PAGES = [null, "1", "2", "3", "99", "0", "-1", "1.5", "abc", ""];
const SHELVES = [["mine", null], ["mine", "created"], ["mine", "shared"], ["company", null], ["favorites", null]];

function* grid() {
  for (const q of QUERIES) for (const kind of KINDS) for (const scope of SCOPES) for (const sort of SORTS) for (const page of PAGES) {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (kind) params.set("kind", kind);
    if (scope) params.set("scope", scope);
    if (sort !== null) params.set("sort", sort);
    if (page !== null) params.set("page", page);
    yield params;
  }
}

console.log("--- 1. 前の画面と同じ結果（すべての組み合わせ） ---");
const all = new Map();
for (const viewer of VIEWERS) for (const shelf of ["mine", "company", "favorites"])
  all.set(`${viewer.email} ${shelf}`, await as(viewer, () => api.workspaceRows(ORGANIZATION, viewer, shelf)));
let compared = 0;
const GRID_SIZE = [...grid()].length;
for (const viewer of VIEWERS) {
  for (const [shelf, tab] of SHELVES) {
    await check(`${viewer.email.split("@")[0]} の ${shelf}${tab ? `（${tab}）` : ""}: 検索・形式・共有範囲・並び・ページ番号の全組み合わせで同じ行・同じ順・同じ件数`, () => {
      const rows = all.get(`${viewer.email} ${shelf}`);
      assert.equal(firstDifference(rows, shelf, tab, current), null);
      compared += GRID_SIZE;
    });
  }
}
await check("比べる組み合わせに 2 ページ目以降・範囲外のページ番号が入っている", () => {
  const rows = all.get(`${owner.email} company`);
  const pages = new Set([...grid()].map((params) => before(rows, "company", params).page));
  assert.deepEqual([...pages].sort(), [1, 2, 3]);
});
await check("前の画面の検索用のたたみ方（写し）は、いまの共通の部品と同じ結果", () => {
  const samples = ["ＡＢＣはーねす", "カタカナ かたかな ｶﾀｶﾅ", "Report ABC", "/internal/list/p-1", "①②③", "ﾊﾟﾋﾟﾌﾟ", "ゔゕゖ", ""];
  for (const row of all.get(`${owner.email} company`)) samples.push(row.title + " " + row.href);
  for (const text of samples) assert.equal(api.foldWorkspaceText(text), foldBefore(text), text);
});

// 比べる仕組みそのものが効いているか。新しい作りをわざと壊した版に差し替えると、差が出なければならない
const broken = {
  "形式の絞り込みを無視する": (rows, shelf, params) => { const p = new URLSearchParams(params); p.delete("kind"); return current(rows, shelf, p); },
  "共有範囲の絞り込みを無視する": (rows, shelf, params) => { const p = new URLSearchParams(params); p.delete("scope"); return current(rows, shelf, p); },
  "検索でかなをたたまない": (rows, shelf, params) => {
    const view = api.workspaceViewOf((name) => params.get(name));
    const found = api.rowsOnShelf(rows, shelf, view.tab).filter((row) =>
      (!view.kind || row.kind === view.kind) && (!view.scope || row.scope === view.scope) &&
      (row.title + " " + row.href).toLowerCase().includes(view.query.trim().toLowerCase()));
    if (view.sort === "name" || view.sort === "old") found.sort(api.compareWorkspaceRows(view.sort));
    const page = api.clampWorkspacePage(view.page, found.length);
    return { rows: found.slice((page - 1) * 50, page * 50), total: found.length, page };
  },
  "古い順を新しい順にする": (rows, shelf, params) => { const p = new URLSearchParams(params); if (p.get("sort") === "old") p.delete("sort"); return current(rows, shelf, p); },
  "ページ番号を範囲に収めない": (rows, shelf, params) => {
    const listed = current(rows, shelf, params);
    const asked = Number(params.get("page") ?? 1);
    return asked > listed.page ? { ...listed, rows: [], page: asked } : listed;
  },
};
for (const [name, list] of Object.entries(broken)) {
  await check(`変異: 「${name}」版と比べると食い違いが出る（比べる仕組みが効いている）`, () => {
    const difference = firstDifference(all.get(`${owner.email} company`), "company", null, list);
    assert.notEqual(difference, null, "壊した版でも全部一致した");
    console.log(`    見つけた食い違い: ${difference}`);
  });
}
await check("材料が 3 ページ目まで届き、どの棚も空ではない（比べる意味がある）", () => {
  assert.ok(all.get(`${owner.email} company`).length > 100);
  for (const [key, rows] of all) assert.ok(rows.length > 0, key);
  assert.ok(api.rowsOnShelf(all.get(`${owner.email} mine`), "mine", "shared").length > 0, "共同編集の棚が空");
});

console.log("--- 2. サーバーの一覧の部品が URL をそのとおりに読む ---");
await check("自分の資料・会社の資料・お気に入りの画面が、同じ URL で前の画面と同じ行・件数・ページ番号を渡す", async () => {
  const urls = ["", "q=%E3%81%8B%E3%81%9F%E3%81%8B%E3%81%AA", "sort=name&page=2", "sort=old&page=3", "kind=deck&scope=public", "tab=shared",
    "page=99", "page=abc", "q=abc&q=%E5%96%B6%E6%A5%AD", "scope=restricted&sort=name", "q=+%E5%90%8C%E3%81%98+&page=2"];
  for (const viewer of VIEWERS) for (const shelf of ["mine", "company", "favorites"]) for (const query of urls) {
    const params = new URLSearchParams(query);
    const props = await rendered(viewer, shelf, params);
    const expected = before(all.get(`${viewer.email} ${shelf}`), shelf, params);
    assert.deepEqual(ids(props.rows), ids(expected.rows), `${viewer.email} ${shelf} ?${query}`);
    // 形式を画面に出す分だけ後から引いても、行の中身（形式を含む）は全件ぶん引いたときと同じ
    assert.deepEqual(props.rows, expected.rows, `${viewer.email} ${shelf} ?${query}（行の中身）`);
    assert.equal(props.total, expected.total, `${viewer.email} ${shelf} ?${query}`);
    assert.equal(props.page, expected.page, `${viewer.email} ${shelf} ?${query}`);
    assert.equal(props.shelf, shelf);
  }
});
await check("ブラウザへ渡すのは今のページの行（多くて 50 件）と総数・ページ番号・棚だけ（配布版かどうかも渡さない・場所の名前は組織の名前で 1 通り）", async () => {
  const props = await rendered(owner, "company", new URLSearchParams());
  assert.deepEqual(Object.keys(props).sort(), ["page", "rows", "shelf", "total"]);
  assert.equal(props.rows.length, 50);
  assert.ok(props.total > 100);
});
await check("ブラウザ側の部品は、絞り込み・検索・並べ替えを自分でしない（サーバーの結果を並べるだけ）", () => {
  const source = readFileSync(`${root}/src/app/_components/workspace-list.tsx`, "utf8");
  for (const name of ["findWorkspaceRows", "workspaceSearchText", "compareWorkspaceRows", "foldWorkspaceText", "pageOfWorkspace", ".sort("])
    assert.ok(!source.includes(name), `${name} がブラウザ側に残っている`);
  assert.match(readFileSync(`${root}/src/app/_components/library-screen.tsx`, "utf8"), /pageOfWorkspace\(/);
});
await check("画面の一覧は棚・絞り込み・並びの関数を通す（新しい並べ方を作っていない）", () => {
  const model = readFileSync(`${root}/src/lib/workspace/model.ts`, "utf8");
  const body = model.slice(model.indexOf("export function pageOfWorkspace"));
  assert.match(body, /findWorkspaceRows\(rowsOnShelf\(rows, shelf, view\.tab\), view\)/);
});

console.log("--- 3. 見る人を絞った資料 ---");
await check("名簿の外の人には、見る人を絞った資料が一覧にも件数にも出ない（どの棚・どのページでも）", async () => {
  const restricted = (await pg.query(`select id, title, page_slug, created_by from pages where visibility = 'restricted'`)).rows;
  const granted = new Set((await pg.query(`select page_id from page_permissions where member_email = 'reader@example.test'`)).rows.map((row) => row.page_id));
  const hidden = restricted.filter((row) => row.created_by !== reader.email && !granted.has(row.id));
  assert.ok(hidden.length > 0, "名簿の外になる材料が無い");
  for (const shelf of ["mine", "company", "favorites"]) {
    for (let page = 1; page <= 4; page++) {
      const props = await rendered(reader, shelf, new URLSearchParams({ page: String(page) }));
      for (const row of props.rows) assert.ok(!hidden.some((one) => one.id === row.id), `${shelf} ${page}: ${row.page}`);
    }
    const scoped = await rendered(reader, shelf, new URLSearchParams({ scope: "restricted" }));
    const allowed = restricted.length - hidden.length;
    assert.ok(scoped.total <= allowed, `${shelf}: 見る人を絞った資料の件数 ${scoped.total} > ${allowed}`);
  }
  for (const one of hidden) {
    const props = await rendered(reader, "company", new URLSearchParams({ q: one.page_slug.replace(/^internal\//, "/internal/") }));
    assert.equal(props.total, 0, one.page_slug);
    assert.deepEqual(props.rows, []);
  }
});
await check("許可のある人には、同じ資料が出る（絞りすぎていない）", async () => {
  const granted = (await pg.query(`select p.page_slug from pages p join page_permissions g on g.page_id = p.id
    where p.visibility = 'restricted' and g.member_email = 'reader@example.test'`)).rows;
  assert.ok(granted.length > 0);
  for (const one of granted) {
    const props = await rendered(reader, "company", new URLSearchParams({ q: one.page_slug.replace(/^internal\//, "/internal/"), scope: "restricted" }));
    assert.ok(props.rows.some((row) => row.page === one.page_slug), one.page_slug);
  }
});
await check("ログインしていない人・昔のゲストには一覧を組み立てない（ログインへ送る）", async () => {
  for (const viewer of [null, { kind: "guest", guestId: "0f4c1a2b-3c4d-4e5f-8a9b-0c1d2e3f4a5b", name: "昔のゲスト" }]) {
    await assert.rejects(as(viewer, () => api.LibraryScreen({ shelf: "company", searchParams: Promise.resolve({}) })),
      (error) => String(error?.digest ?? error?.message).includes("/signin"));
  }
});

console.log("--- 4. 自分の資料の棚の候補と、サーバーの仕事の量 ---");
await check("自分の資料の棚: 作った人の欄の大文字小文字・空白が違っても自分の資料、似た名前の別の人・消した資料は入らない", async () => {
  const props = await rendered(owner, "mine", new URLSearchParams({ q: "/internal/list/" }));
  const pages = props.rows.map((row) => row.page);
  assert.ok(pages.includes("internal/list/upper-case"));
  assert.ok(pages.includes("internal/list/spaced"));
  assert.ok(!pages.includes("internal/list/lookalike"));
  assert.ok(!pages.includes("internal/list/deleted"));
  assert.equal(props.rows.find((row) => row.page === "internal/list/upper-case").kind, "deck");
  const other = await rendered({ ...collaborator, email: "xowner@example.test" }, "mine", new URLSearchParams());
  assert.deepEqual(other.rows.map((row) => row.page), ["internal/list/lookalike"]);
});
await check("自分の資料の棚: アドレスの _ や % は文字どおりに扱う（別の人の資料を拾っても棚には入れない）", async () => {
  await pg.query(`insert into pages (page_slug, visibility, title, created_by, updated_at) values
    ('internal/list/underscore', 'internal', '下線のある人', 'a_b@example.test', '2026-09-02T00:00:04Z'),
    ('internal/list/wildcard', 'internal', '似た別の人', 'aXb@example.test', '2026-09-02T00:00:05Z')`);
  const props = await rendered({ ...reader, email: "a_b@example.test" }, "mine", new URLSearchParams());
  assert.deepEqual(props.rows.map((row) => row.page), ["internal/list/underscore"]);
  const percent = await rendered({ ...reader, email: "%@example.test" }, "mine", new URLSearchParams());
  assert.deepEqual(percent.rows, []);
});

/** 1 回の画面の組み立てで、保管庫のどの表へ何回問い合わせたか。 */
async function queriesOf(viewer, shelf, query) {
  globalThis.__deckQueries = [];
  await rendered(viewer, shelf, new URLSearchParams(query));
  const counts = {};
  for (const one of globalThis.__deckQueries) counts[one.table] = (counts[one.table] ?? 0) + 1;
  delete globalThis.__deckQueries;
  return counts;
}
const beforeGrowth = {
  mine: await queriesOf(owner, "mine", ""),
  company: await queriesOf(owner, "company", ""),
  companyKind: await queriesOf(owner, "company", "kind=deck"),
};
// 全社の資料を 2,000 件増やす（自分の資料・お気に入りは増やさない）
await pg.query(`insert into pages (page_slug, visibility, title, created_by, current_version_id, updated_at)
  select 'internal/growth/' || n, 'internal', '増えた資料 ' || n, 'other@example.test', 'g-' || n, timestamptz '2026-08-01T00:00:00Z' + (n || ' seconds')::interval
  from generate_series(1, 2000) n`);
await pg.query(`insert into page_catalog (page_id, version_id, classifier_version, kind)
  select id, current_version_id, 1, 'page' from pages where page_slug like 'internal/growth/%'`);
const afterGrowth = {
  mine: await queriesOf(owner, "mine", ""),
  company: await queriesOf(owner, "company", ""),
  companyKind: await queriesOf(owner, "company", "kind=deck"),
};
console.log(`    全社 +2,000 件の前後: 自分の資料 ${JSON.stringify(beforeGrowth.mine)} → ${JSON.stringify(afterGrowth.mine)}`);
// 形式は保存先の関数 current_page_kinds の 1 本で引く（目印の一覧を本文で渡す・src/lib/workspace/workspace.ts の classifyPages）
const kindReads = (counts) => (counts.current_page_kinds ?? 0) + (counts.page_catalog ?? 0);
console.log(`    会社の資料（形式で絞らない）の形式の問い合わせ: ${kindReads(beforeGrowth.company)} → ${kindReads(afterGrowth.company)} 回` +
  `（形式で絞るとき ${kindReads(beforeGrowth.companyKind)} → ${kindReads(afterGrowth.companyKind)} 回）`);
await check("自分の資料の棚は、全社の資料が増えても問い合わせの回数が変わらない（全社を読まない）", () => {
  assert.deepEqual(afterGrowth.mine, beforeGrowth.mine);
});
await check("会社の資料の形式は、資料が増えても 1 本で引く（形式で絞るときも、絞らないときも）", () => {
  assert.equal(kindReads(afterGrowth.company), 1);
  assert.equal(kindReads(beforeGrowth.company), 1);
  assert.equal(kindReads(afterGrowth.companyKind), 1);
  assert.equal(afterGrowth.company.page_catalog ?? 0, 0);
});

console.log("--- 5. ブラウザへ渡す量 ---");
/** 資料が count 件あるときに、会社の資料の 1 ページ目としてブラウザへ渡す量（JSON にした字数）。 */
function sentBytes(count, params) {
  const rows = Array.from({ length: count }, (_, n) => ({
    id: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
    page: `internal/workspace-scale/${n}`, href: `/internal/workspace-scale/${n}`,
    title: `負荷検査の資料 ${String(n).padStart(5, "0")} ${"長い日本語の題名".repeat(8)}`,
    updatedAt: new Date(Date.UTC(2026, 8, 1) - n * 1000).toISOString(), author: "other",
    kind: n % 10 === 0 ? "deck" : "page", scope: "company", mine: n < 5, collaborator: false,
    editable: false, shareable: false, waiting: 0, favorite: n < 50,
  }));
  const listed = api.pageOfWorkspace(rows, "company", api.workspaceViewOf((name) => params.get(name)));
  return Buffer.byteLength(JSON.stringify(listed));
}
await check("1,000 件と 10,000 件で、渡す量が同じ（件数に比例しない）", () => {
  for (const query of ["", "sort=name", "sort=old&page=7", "kind=deck"]) {
    const params = new URLSearchParams(query);
    const small = sentBytes(1000, params), large = sentBytes(10000, params);
    console.log(`    ?${query || "（条件なし）"}: 1,000 件 ${small} バイト / 10,000 件 ${large} バイト`);
    assert.ok(large <= small * 1.05, `?${query}: ${small} → ${large}`);
  }
});

console.log(`\n比べた組み合わせ ${compared} 通り`);
console.log(failures === 0 ? "すべて合格" : `${failures} 件 不合格`);
process.exit(failures === 0 ? 0 : 1);
