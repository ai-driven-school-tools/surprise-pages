import { databaseStub } from "./paths.mjs";
/**
 * 「見たページの控え（アカウントに残るほう）」の決まりを確かめる。
 *
 * この控えは、社内ページを誰がいつ開いたかという**いちばん機微な記録**になる。
 * 出口は本人の画面 1 つきりで、90 日で消え、手元のお試しでは 1 行も積まれない——
 * どれも、抜けても画面はふつうに動くので、目では気づけない類の約束。
 *
 * ここで見るのは 9 つ。
 *   1. 控える口が受けるのは呼び名だけ（台帳の目印を受け取らない）
 *   2. 控える口は必ず門を通る／門が開くより前に 1 文字も書かない
 *   3. 手元の仮の人を、書き込みの手前で弾いている
 *   4. 消すのは物理削除（消した印の列を持たない）＝表の形そのもの
 *   5. 掃除の口は合言葉を照らし合わせ、置かれていないときも断る／件数をログに出す
 *   6. 定期実行の行き先が実在する（文字列を書き写して壊れるのを防ぐ）
 *   7. 読む口が受けるのは、絞り込み済みの台帳の行だけ
 *   8. アドレスは小文字で入る（表の制約と、書く側の両方）
 *   9. 消す口が、自分の行だけを・印を立てずに消す／「残さない」が既にある分も消す
 *
 * 保管庫にもネットワークにも繋がない。**繋ぎ口だけ差し替えて、中身は本物を呼ぶ**
 * （字面の検査だけだと「呼んでいるつもりで呼んでいない」が見つからない）。
 */
import { readFile } from "node:fs/promises";

import { root, dir, companyDeployment } from "./paths.mjs";
const { build } = await import(`${root}/node_modules/esbuild/lib/main.js`);

const read = (path) => readFile(`${root}/${path}`, "utf8");
/** 注記を落として、実際に動くところだけを見る。 */
const strip = (text) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");

const RECORD_API = strip(await read("src/app/api/views/route.ts"));
const SWEEP_API = strip(await read("src/app/api/cron/views/route.ts"));
const STORE = strip(await read("src/lib/pages/views.ts"));
const SCREEN = strip(await read("src/app/(workspace)/(screens)/activity/page.tsx"));
const PREVIEW = strip(await read("src/lib/pages/local-preview.ts"));
const SQL = await read("db/migrations/0009_page_views.sql");
/** 注記を落とした、実際に効く部分だけ（説明文に出てくる語を拾わないため）。 */
const SQL_CODE = SQL.replace(/^\s*--.*$/gm, "");
const VERCEL = JSON.parse(await read("vercel.json"));
const README = await read("README.md");

let fails = 0;
const ok = (label, actual, expected) => {
  const pass = String(actual) === String(expected);
  if (!pass) fails += 1;
  console.log(`${pass ? "OK  " : "NG  "} ${label}: ${actual}（期待: ${expected}）`);
};

const count = (code, re) => (code.match(re) ?? []).length;

// ---------------------------------------------------------------------------
// 繋ぎ口の差し替え（ログイン・宛先・保管庫）
// ---------------------------------------------------------------------------
/*
 * 保管庫は「何を頼まれたか」を控えるだけの張りぼてにする。呼ばれた順も中身も残るので、
 * 「弾いたはずの人の行が積まれていない」「消したのは古い行だけ」を実際に確かめられる。
 * 控えは globalThis 経由で覗く（組み立てで中に取り込まれるため、輸入では同じものを掴めない）。
 */
// 会社のドメインの正本は、最初の組織の自動参加のドメイン（src/lib/organization/organizations.ts）
const DOMAIN = "example.com";

const { writeFile } = await import("node:fs/promises");
await writeFile(
  `${dir}/views-stub.mjs`,
  `export const ALLOWED_DOMAIN = ${JSON.stringify(DOMAIN)};
// 名乗りは差し替えられるようにしておく（消す口を、会社の人と名無しの両方で叩くため）
export const auth = async () => globalThis.__views.session;
export const cookies = async () => ({ get: () => undefined });
export const headers = async () => ({ get: () => null });
// 消したあとに画面を作り直す頼み。検査では呼ばれたことだけ控える
export const refresh = () => { globalThis.__views.refreshed += 1; };

// 組み立てるたびに中へ取り込まれるので、既にあるものを使い回す（控えを 1 つに保つ）
const held = globalThis.__views ?? { calls: [], rows: [], page: null, session: null, refreshed: 0 };
globalThis.__views = held;

function query(table) {
  const note = { table, filters: {}, deleted: false, order: null, limit: null, lt: null, upsert: null };
  held.calls.push(note);
  const chain = {
    select(columns) { note.columns = columns; return chain; },
    eq(key, value) { note.filters[key] = value; return chain; },
    in(key, values) { note.filters[key] = values; return chain; },
    is(key, value) { note.filters[key] = value; return chain; },
    lt(key, value) { note.lt = { key, value }; return chain; },
    // 続きの目印（page_id）は note.gt、ほかの「より大きい」は note.after に控える
    gt(key, value) { if (key === "page_id") note.gt = { key, value }; else note.after = { ...note.after, [key]: value }; return chain; },
    order(key, options) { note.order = { key, ...options }; return chain; },
    limit(value) { note.limit = value; return chain; },
    delete() { note.deleted = true; return chain; },
    upsert(row, options) { note.upsert = { row, options }; return chain; },
    // ページ 1 枚を引くところ（findPage）。消す口は必ずここを通ってから消す
    maybeSingle() { return Promise.resolve({ data: held.page, error: null }); },
    then(resolve, reject) {
      if (held.respond) return Promise.resolve(held.respond(note)).then(resolve, reject);
      return Promise.resolve({ data: held.rows, error: null }).then(resolve, reject);
    },
  };
  return chain;
}

export const createClient = () => ({
  from: (table) => query(table),
  rpc: async (name, args) => {
    // 名乗りの所属の読み（src/lib/organization/member-organization.ts）。見本の人は全員 member（控えの頼みごととしては数えない）
    if (name === "org_member_identity_audited") return { data: { role: "member", joined: false }, error: null };
    held.calls.push({ rpc: name, args });
    return { data: null, error: null };
  },
});
`,
);

const ALIAS = {
  "@/auth": `${dir}/views-stub.mjs`,
  "next/headers": `${dir}/views-stub.mjs`,
  "next/cache": `${dir}/views-stub.mjs`,
  "@/lib/db/database": databaseStub(`${dir}/views-stub.mjs`),
};

process.env["SUPABASE_URL"] = "https://example.invalid";
process.env["SUPABASE_SECRET_KEY"] = "（検査では使わない）";

await build({
  entryPoints: [`${root}/src/lib/pages/views.ts`],
  outfile: `${dir}/views-store.mjs`,
  bundle: true,
  plugins: [companyDeployment],
  format: "esm",
  platform: "node",
  external: ["node:*"],
  alias: ALIAS,
});
const { listViewedPages, recordPageView, sweepOldPageViews, viewSweepCutoff, VIEW_RETENTION_DAYS } =
  await import(`${dir}/views-store.mjs`);

/** 張りぼての保管庫に届いた頼みごと。 */
const held = globalThis.__views;
const reset = (rows = []) => {
  held.calls.length = 0;
  held.rows = rows;
  held.page = null;
  held.session = null;
  held.refreshed = 0;
  held.respond = null;
};

const member = (email) => ({ kind: "member", email, name: null, image: null });
/** 最初の組織（最初の組織）。組織に属する表は組織で絞った口から触る */
const ORG = Object.freeze({ id: "00000000-0000-4000-8000-000000000001", assetPrefix: "" });
const page = (id, pageSlug, extra = {}) => ({
  id,
  organization: ORG,
  pageSlug,
  visibility: pageSlug.startsWith("public/") ? "public" : "internal",
  title: `ページ ${id}`,
  currentVersionId: null,
  createdBy: `taro@${DOMAIN}`,
  deletedAt: null,
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z",
  ...extra,
});

// ---------------------------------------------------------------------------
console.log("--- 1. 控える口が受けるのは呼び名だけ ---");
console.log("   台帳の目印（uuid）を受けて書く口にすると、一度も開かずに「見た」行を作れてしまう");

ok("呼び名として読み取っている", /parsePageSlug\(body === null \? null : body\["page"\]\)/.test(RECORD_API), true);
ok("読めない呼び名は断る", /if \(page === null\) return jsonError\(rt\("errors\.request\.pageInvalid"\), 400\);/.test(RECORD_API), true);
ok("台帳の目印を本文から読んでいない", /body\["id"\]|body\["pageId"\]|body\["page_id"\]/.test(RECORD_API), false);
ok("目印という言葉ごと出てこない", /pageId|page_id/.test(RECORD_API), false);
ok("会社の人以外には控えない", /if \(!isMember\(viewer\)\) return jsonError\(rt\("errors\.request\.loginRequired"\), 401\);/.test(RECORD_API), true);
ok("応答に中身を載せない", /jsonResponse\(\{ recorded: true \}, 200\)/.test(RECORD_API), true);
ok("応答にページの題を載せていない", /title/.test(RECORD_API), false);
console.log("      ※ 人に見せる文言に「トークン」という語を出さない");
ok("その語が出てこない", /トークン/.test(await read("src/app/api/views/route.ts")), false);

// ---------------------------------------------------------------------------
console.log("\n--- 2. 門が開くより前に、1 文字も書かない ---");

ok("門を通る", count(RECORD_API, /openPage\(organization, viewer, page\.slug\)/g), 1);
ok("断り方は 1 つの部品（gateError）", /if \(!gate\.ok\) return gateError\(gate\.reason\);/.test(RECORD_API), true);
ok(
  "書くのは門を見たあと",
  RECORD_API.indexOf("if (!gate.ok) return gateError(gate.reason);") <
    RECORD_API.indexOf("recordPageView("),
  true,
);
console.log("      ※ 書く相手は「門を通ったページの行」。呼び名を渡し直さない");
ok("渡すのは引き当て済みのページ", /recordPageView\(viewer, gate\.page\)/.test(RECORD_API), true);
ok("控える口が受けるのも台帳の行", /export async function recordPageView\(viewer: Member, page: StoredPage\)/.test(STORE), true);
ok("控える口は自分でページを引かない", /findPage|listAlivePages|pagesVisibleTo/.test(STORE), false);

// ---------------------------------------------------------------------------
console.log("\n--- 3. 手元の仮の人を、書き込みの手前で弾く ---");
console.log("   手元の pnpm dev は本番の保管庫を向いている。弾かないと、開発中に本物の行が積まれる");

console.log("      ※ 積むときだけでなく、消すときも「残さない」を入れるときも同じ述語で弾く");
ok("弾く述語を呼んでいる（積む・1 行消す・全部消す・残さない）", count(STORE, /skipsRealStore\(viewer\)/g), 4);
ok("述語の正本は手元の仕掛けの側", /export function skipsRealStore\(/.test(PREVIEW), true);
ok("アドレスを書き写していない", /local-preview@/.test(STORE), false);
ok("旗の名前を書き写していない", /LOCAL_PREVIEW_RECORD_VIEWS/.test(STORE), false);

console.log("\n   実際に呼んで確かめる");
reset();
await recordPageView(member(`local-preview@${DOMAIN}`), page("p1", "internal/report/2026q1"));
ok("手元の仮の人では、保管庫に何も頼まない", held.calls.length, 0);

reset();
await recordPageView(member(`taro@${DOMAIN}`), page("p1", "internal/report/2026q1"));
ok("ふつうの人なら 1 回だけ頼む", held.calls.length, 1);
ok("頼むのは「1 回で終わらせる関数」（組織を取る版）", held.calls[0].rpc, "org_record_page_view");
ok("渡すのはページの目印", held.calls[0].args.p_page_id, "p1");
ok("同じ呼び出しで積み増しまで終わる（往復は 1 回）", count(STORE, /\.rpc\(/g), 1);

// ---------------------------------------------------------------------------
console.log("\n--- 4. 消すのは物理削除（表の形） ---");
console.log("   閲覧の控えは本人のプライバシーの記録。「消した」のに残っているのは約束を破ること");

ok("控えの表がある", /create table public\.page_views \(/.test(SQL), true);
ok("1 人 1 ページ 1 行", /primary key \(page_id, viewer_email\)/.test(SQL), true);
ok("消した印の列を持たない", /deleted_at/.test(SQL_CODE), false);
console.log("      ※ ページの削除は印を立てる方式なので、繋がりによる自動削除は一生発火しない。");
console.log("        書けば「消えるはず」と読めてしまうぶん、無いほうが正しい");
ok("on delete cascade を書いていない", /on delete cascade/.test(SQL_CODE), false);
ok("行が 90 日残ることを表の説明に書いてある", /90 日の掃除まで残る/.test(SQL), true);
ok("回数の列がある", /view_count integer not null default 1/.test(SQL), true);
ok("回数は 1 以上", /check \(view_count > 0\)/.test(SQL), true);
ok("引く向きの索引がある", /create index page_views_by_viewer on public\.page_views \(viewer_email, last_viewed_at desc\)/.test(SQL), true);
ok("鍵をかけてある", /alter table public\.page_views enable row level security;/.test(SQL), true);
ok("ポリシーは作らない（既存の流儀）", /create policy/.test(SQL), false);

console.log("\n   記録を 1 回の往復で終わらせる関数");
ok("関数がある", /create function public\.record_page_view\(p_page_id uuid, p_email text\)/.test(SQL), true);
ok("探し場所を空にしてある", /set search_path = ''/.test(SQL), true);
ok("「残さない」設定の確認と積み増しが 1 文", /where not exists \(\s*select 1 from public\.page_view_optouts/.test(SQL), true);
ok("同じページは行を増やさず数える", /on conflict \(page_id, viewer_email\) do update/.test(SQL), true);
ok("数えるのは 1 ずつ", /view_count = page_views\.view_count \+ 1/.test(SQL), true);
ok("誰でも呼べる形になっていない", /revoke all on function public\.record_page_view\(uuid, text\) from public;/.test(SQL), true);
ok("呼べるのはサーバーだけ", /grant execute on function public\.record_page_view\(uuid, text\) to service_role;/.test(SQL), true);
ok("関数に説明が付いている", /comment on function public\.record_page_view\(uuid, text\) is/.test(SQL), true);
ok("表にも説明が付いている", /comment on table public\.page_views is/.test(SQL), true);

// ---------------------------------------------------------------------------
console.log("\n--- 5. 掃除の口（合言葉と、件数のログ）---");

// ほかの片付けは偽物にし、呼ばれた順と「わざと失敗させる」を外から決められるようにする
await writeFile(`${dir}/video-sweep-stub.mjs`,`
const plan=()=>globalThis.__sweeps??={called:[],fail:new Set()};
const run=(name,value)=>async()=>{plan().called.push(name);if(plan().fail.has(name))throw new Error(name+" を整理できませんでした（PGRST205）");return value;};
export const sweepVideoUploads=run("video",0); export const sweepAgentDrafts=run("drafts",undefined);
export const everyOrganization=async()=>[{id:"00000000-0000-4000-8000-000000000001",assetPrefix:""}];`);
await build({
  entryPoints: [`${root}/src/app/api/cron/views/route.ts`],
  outfile: `${dir}/views-sweep.mjs`,
  bundle: true,
  plugins: [companyDeployment],
  format: "esm",
  platform: "node",
  external: ["node:*"],
  alias: {...ALIAS,"@/lib/deck/media/video-storage":`${dir}/video-sweep-stub.mjs`,"@/lib/page-agent/service":`${dir}/video-sweep-stub.mjs`,"@/lib/organization/organizations":`${dir}/video-sweep-stub.mjs`},
});
const { GET } = await import(`${dir}/views-sweep.mjs`);

/** 合言葉を添えた（あるいは添えない）呼び出しを 1 本作る。 */
const call = (authorization) =>
  new Request("https://example.invalid/api/cron/views", {
    headers: authorization === null ? {} : { authorization },
  });

/** ログを覗く（動いていないことに気づく手立てが、これしかないため）。 */
const withLog = async (run) => {
  const lines = [];
  const held = console.log;
  console.log = (...parts) => lines.push(parts.join(" "));
  try {
    return { result: await run(), lines };
  } finally {
    console.log = held;
  }
};

delete process.env["CRON_SECRET"];
reset();
const noSecret = await GET(call("Bearer anything"));
ok("合言葉が置かれていないときは断る", noSecret.status, 401);
ok("そのとき保管庫には何も頼まない", held.calls.length, 0);
console.log("      ※ 「設定が無ければ素通し」にすると、入れ忘れた配置だけが全開になる");

process.env["CRON_SECRET"] = "open-sesame-1234";
reset();
ok("合言葉なしで叩いても断る", (await GET(call(null))).status, 401);
ok("違う合言葉でも断る", (await GET(call("Bearer wrong-one"))).status, 401);
ok("形だけ真似ても断る", (await GET(call("open-sesame-1234"))).status, 401);
ok("断ったときは保管庫に何も頼まない", held.calls.length, 0);

reset([{ page_id: "p1" }, { page_id: "p2" }, { page_id: "p3" }]);
const swept = await withLog(() => GET(call("Bearer open-sesame-1234")));
ok("正しい合言葉なら通る", swept.result.status, 200);
ok("消した件数を返す", (await swept.result.json()).removed, 3);
// ログは入口と同じ 1 行の形（src/lib/logging/server-log.ts）。何の掃除か・何件かを決まった項目で添える
const sweptLine = swept.lines.map((line) => { try { return JSON.parse(line); } catch { return null; } }).find((one) => one?.event === "cron.swept");
ok("消した件数をログに出す", sweptLine?.fields?.count, 3);
ok("何の掃除かもログに出す", sweptLine?.fields?.step, "page-views");

console.log("\n   消すのは古い行だけ（表そのものを空にしない）");
const asked = held.calls.find((one) => one.table === "page_views");
ok("控えの表に頼んでいる", asked !== undefined, true);
ok("消す頼みになっている", asked.deleted, true);
ok("物差しは最後に見た時刻", asked.lt.key, "last_viewed_at");
const cutoff = new Date(viewSweepCutoff(new Date("2026-08-14T00:00:00.000Z")));
ok("残す日数", VIEW_RETENTION_DAYS, 90);
ok("境目は 90 日前", cutoff.toISOString(), "2026-05-16T00:00:00.000Z");
ok("消した件数は数えて返す", await sweepOldPageViews(ORG), 3);

console.log("\n   1 つの片付けが失敗しても、ほかは止めない（本番で変更案の表が無く、後ろが毎日止まっていた）");
const withErrors = async (run) => {
  const lines = [];
  const held = console.error;
  console.error = (...parts) => lines.push(parts.join(" "));
  try {
    return { result: await run(), lines };
  } finally {
    console.error = held;
  }
};
globalThis.__sweeps = { called: [], fail: new Set(["drafts"]) };
reset([{ page_id: "p1" }]);
const partly = await withErrors(() => withLog(() => GET(call("Bearer open-sesame-1234"))));
const partlyBody = await partly.result.result.json();
ok("途中の 1 つが失敗 → 500 のまま（見張りに出る）", partly.result.result.status, 500);
ok("それでも後ろの片付けまで全部呼ぶ", globalThis.__sweeps.called, ["video", "drafts"]);
ok("見たページの掃除は変わらず済ませる（件数も返す）", [partlyBody.removed, partly.result.lines.some((line) => line.includes('"event":"cron.swept"') && line.includes('"count":1'))], [1, true]);
ok("どの片付けが落ちたかを返す", partlyBody.failed, ["変更案の整理"]);
// 文面（PGRST205 を含む断り文）は残さない——保存先の断り文には題名やアドレスが混ざる。種類・場所・符号で足りる
ok("どの片付けが落ちたかをログに残す（同じ 1 行の形）", partly.lines.some((line) => line.includes('"event":"cron.step-failed"') && line.includes('"step":"agent-drafts"')), true);
globalThis.__sweeps = { called: [], fail: new Set() };
reset([]);
const clean = await withLog(() => GET(call("Bearer open-sesame-1234")));
ok("全部済めば 200 で、失敗の欄を持たない", [clean.result.status, "failed" in (await clean.result.json())], [200, false]);
ok("変更案の整理の失敗には、原因の符号を添える", /変更案を整理できませんでした（\$\{error\.code/.test(await read("src/lib/page-agent/service.ts")), true);

// ---------------------------------------------------------------------------
console.log("\n--- 6. 定期実行の行き先が実在する ---");
console.log("   道筋は文字列なので、書き写した瞬間から静かに壊れうる（呼ばれても 404 になるだけ）");

const crons = Array.isArray(VERCEL.crons) ? VERCEL.crons : [];
ok("定期実行が 1 本ある", crons.length, 1);
const cron = crons[0] ?? {};
ok("行き先", cron.path, "/api/cron/views");
ok("その行き先のファイルがある", RECORD_API.length > 0 && SWEEP_API.length > 0, true);
ok(
  "道筋とファイルの置き場所が合っている",
  `src/app${cron.path}/route.ts`,
  "src/app/api/cron/views/route.ts",
);
ok("その口は取りに来られる形（GET）", /export async function GET\(/.test(SWEEP_API), true);
ok("1 日 1 回", cron.schedule, "0 18 * * *");
ok("置き場所は東京のまま", (VERCEL.regions ?? []).join(","), "hnd1");
console.log("      ※ 合言葉は鍵の一覧と手引きにも書いてある（無いと掃除が動かないため）");
ok("手引きに書いてある", /CRON_SECRET/.test(README), true);
ok("無いとどうなるかも書いてある", /日次の片付けが断られる/.test(README), true);

// ---------------------------------------------------------------------------
console.log("\n--- 7. 読む口が受けるのは、絞り込み済みの台帳の行だけ ---");
console.log("   自分でページを引ける形にすると、見える範囲の絞り込みが読む側にも生まれる");

ok(
  "受け口の形（渡された行しか見られない）",
  /export async function listViewedPages\(\n\s*organization: OrganizationScope,\n\s*viewer: Identity \| null,\n\s*visible: readonly StoredPage\[\],\n\): Promise<AccountViewedPage\[\]>/.test(STORE),
  true,
);
ok("画面が先に見える行を確定させている", /visiblePagesFor\(organization, viewer\)/.test(SCREEN), true);
ok("その行を読む口へ渡している", /listViewedPages\(organization, viewer, visible\)/.test(SCREEN), true);
console.log("      ※ 2 つめの節（書いたコメント）も、まったく同じ行を材料にする");
ok("同じ行を 2 つの節で使い回している", /const \[server, comments\] = await Promise\.all\(\[/.test(SCREEN), true);
ok("画面は見せ方を読まない", /\.visibility/.test(SCREEN), false);

console.log("\n   実際に呼んで確かめる");
reset([
  { page_id: "p1", last_viewed_at: "2026-08-14T05:00:00+00:00", view_count: 3 },
  { page_id: "p2", last_viewed_at: "2026-08-13T05:00:00+00:00", view_count: 1 },
]);
const visible = [page("p1", "internal/report/2026q1")];
const rows = await listViewedPages(ORG, member(`taro@${DOMAIN}`), visible);
ok("渡した行のぶんだけ並ぶ", rows.length, 1);
ok("渡していないページは行ごと出ない", rows.some((one) => one.href.includes("p2")), false);
console.log("      ※ 見た当時は開けたが、あとから制限がかかったページ。題を出すこと自体が漏れになる");
ok("行き先は台帳から作る", rows[0].href, "/internal/report/2026q1");
ok("題も台帳から採る", rows[0].title, "ページ p1");
ok("回数はそのまま", rows[0].viewCount, 3);

reset([{ page_id: "p1", last_viewed_at: "2026-08-14T05:00:00+00:00", view_count: 1 }]);
ok("名乗っていない人には 1 行も返さない", (await listViewedPages(ORG, null, visible)).length, 0);
ok("そのとき保管庫に頼まない", held.calls.length, 0);
reset([{ page_id: "p1", last_viewed_at: "2026-08-14T05:00:00+00:00", view_count: 1 }]);
ok(
  "ゲストにも返さない",
  (await listViewedPages(ORG, { kind: "guest", guestId: "g1", name: "はなこ" }, visible)).length,
  0,
);
reset([{ page_id: "p1", last_viewed_at: "2026-08-14T05:00:00+00:00", view_count: 1 }]);
ok("見えるページが 1 枚も無ければ、保管庫を引かない", (await listViewedPages(ORG, member(`taro@${DOMAIN}`), [])).length, 0);
ok("そのときも頼まない", held.calls.length, 0);

console.log("\n   絞り込みの材料は値として渡す（文字列を組み立てない）");
reset([]);
await listViewedPages(ORG, member(`taro@${DOMAIN}`), visible);
const asking = held.calls[0];
ok("引くのは控えの表", asking.table, "page_views");
ok("自分の行だけに絞っている", asking.filters["viewer_email"], `taro@${DOMAIN}`);
ok("見えるページの目印を問い合わせに並べない（全社の資料の数だけ問い合わせが増える）", asking.filters["page_id"], undefined);
ok("続きを読めるように目印の順で引く", `${asking.order.key} ${asking.order.ascending}`, "page_id true");
ok("1 回に読むのは保管庫の窓口の上限まで", asking.limit, 1000);
const keptFrom = Date.parse(asking.after?.last_viewed_at ?? "");
ok("掃除が消す行（保持の日数より古い）は読まない。日数は正本の定数から", Math.abs(Date.now() - VIEW_RETENTION_DAYS * 86400000 - keptFrom) < 60000, true);
ok("日数を読む側に直書きしていない", /const kept = viewSweepCutoff\(\);/.test(STORE) && !/gt\("last_viewed_at", [^k]/.test(STORE), true);
ok("列は名指しで読む", asking.columns, "page_id, last_viewed_at, view_count");
ok("or() に文字列を組み立てていない", /\.or\(/.test(STORE), false);

console.log("\n   資料が何件あっても、引くのは本人の控えだけ。見えるページの中の最新200件を返す");
reset();
// 控えの時刻は保持の日数の内側に置く（決まった日付にすると、日がたつと読まれなくなる）
const recentBase = Date.now() - 3 * 86400000;
const manyPages = Array.from({ length: 663 }, (_, i) => page(`p${i}`, `internal/report/p${i}`));
const manyViews = manyPages.map((p, i) => ({
  page_id: p.id,
  last_viewed_at: new Date(recentBase + i * 60000).toISOString(),
  view_count: 1,
}));
// 保管庫の代役: 本人の控えを目印の順に、続きの指定（gt）と上限を守って返す
const answerFrom = (views) => (note) => {
  const mine = [...views].sort((a, b) => (a.page_id < b.page_id ? -1 : 1))
    .filter((row) => note.after?.last_viewed_at === undefined || row.last_viewed_at > note.after.last_viewed_at)
    .filter((row) => note.gt === undefined || row.page_id > note.gt.value);
  return { data: mine.slice(0, note.limit), error: null };
};
// 見えなくなったページ（あとから制限がかかった）の控えも、保管庫には残っている。いちばん新しい
const hiddenView = { page_id: "hidden", last_viewed_at: new Date().toISOString(), view_count: 9 };
held.respond = answerFrom([...manyViews, hiddenView]);
const manyRows = await listViewedPages(ORG, member(`taro@${DOMAIN}`), manyPages);
ok("663件でも取得でき、全体で200件に収まる", manyRows.length, 200);
ok("問い合わせは資料の数によらず 1 回", held.calls.length, 1);
ok("見えるページの目印で問い合わせを分けていない", held.calls.every((call) => call.filters.page_id === undefined), true);
ok("本人の記録だけを取得する", held.calls.every((call) => call.filters.viewer_email === `taro@${DOMAIN}`), true);
ok("見える中の新しい順に並べる（見えないページの控えは 1 行も出ず、枠も取らない）", manyRows.map((row) => row.pageSlug).join(","), manyPages.slice(-200).reverse().map((p) => p.pageSlug).join(","));
console.log("\n   掃除が止まっていても、保持の日数より古い控えは読まない。掃除が動いていれば画面の内容は同じ");
reset();
const recent = (days) => new Date(Date.now() - days * 86400000).toISOString();
const agedPages = ["a1", "a2", "a3"].map((id) => page(id, `internal/aged/${id}`));
const keptViews = [
  { page_id: "a1", last_viewed_at: recent(1), view_count: 2 },
  { page_id: "a2", last_viewed_at: recent(VIEW_RETENTION_DAYS - 1), view_count: 1 },
];
const stale = { page_id: "a3", last_viewed_at: recent(VIEW_RETENTION_DAYS + 5), view_count: 7 };
held.respond = answerFrom(keptViews);
const afterSweep = JSON.stringify(await listViewedPages(ORG, member(`taro@${DOMAIN}`), agedPages));
held.respond = answerFrom([...keptViews, stale]);
const withoutSweep = await listViewedPages(ORG, member(`taro@${DOMAIN}`), agedPages);
ok("掃除が済んでいるときと同じ内容", JSON.stringify(withoutSweep), afterSweep);
ok("保持の内側の行は落とさない", withoutSweep.map((row) => row.pageSlug).join(","), "internal/aged/a1,internal/aged/a2");
console.log("\n   本人の控えが 1 回ぶんを超えても、続きから漏れなく読む");
reset();
const widePages = Array.from({ length: 2300 }, (_, i) => page(`w${String(i).padStart(4, "0")}`, `internal/wide/w${i}`));
const wideViews = widePages.map((p, i) => ({
  page_id: p.id,
  last_viewed_at: new Date(recentBase + i * 60000).toISOString(),
  view_count: 1,
}));
held.respond = answerFrom(wideViews);
const wideRows = await listViewedPages(ORG, member(`taro@${DOMAIN}`), widePages);
ok("2300件の控えを 3 回で読み切る", held.calls.length, 3);
ok("続きは前の組の最後の目印から", held.calls.map((call) => call.gt?.value ?? "").join(","), ",w0999,w1999");
ok("後の組にある新しい記録も含めて並べる", wideRows.map((row) => row.pageSlug).join(","), widePages.slice(-200).reverse().map((p) => p.pageSlug).join(","));
reset();
held.respond = (note) => held.calls.length === 2
  ? { data: null, error: { message: "取得失敗" } }
  : answerFrom(wideViews)(note);
let batchFailed = false;
try { await listViewedPages(ORG, member(`taro@${DOMAIN}`), widePages); } catch { batchFailed = true; }
ok("途中の組が失敗したら不完全な一覧を成功として返さない", batchFailed, true);
reset();

// ---------------------------------------------------------------------------
console.log("\n--- 8. アドレスは小文字で入る ---");
console.log("   大文字混じりが 1 回でも入ると、同じ人が 2 行に割れて「1 人 1 ページ 1 行」が崩れる");

ok("控えの表に制約がある", /viewer_email text not null check \(viewer_email = lower\(viewer_email\)\)/.test(SQL), true);
ok("「残さない」の表にも制約がある", /viewer_email text primary key check \(viewer_email = lower\(viewer_email\)\)/.test(SQL), true);
ok("保管庫の側でも小文字に落として突き合わせる", count(SQL_CODE, /lower\(p_email\)/g), 2);
ok("書く側も揃えてから渡す", /return email\.trim\(\)\.toLowerCase\(\);/.test(STORE), true);

console.log("\n   実際に呼んで確かめる");
reset();
await recordPageView(member(`Taro.Yamada@${DOMAIN}`), page("p1", "internal/report/2026q1"));
ok("控えるときは小文字で渡す", held.calls[0].args.p_email, `taro.yamada@${DOMAIN}`);
reset([]);
await listViewedPages(ORG, member(`Taro.Yamada@${DOMAIN}`), visible);
ok("読むときも小文字で照らす", held.calls[0].filters["viewer_email"], `taro.yamada@${DOMAIN}`);
reset();
await recordPageView(member(`  taro@${DOMAIN}  `), page("p1", "internal/report/2026q1"));
ok("前後の空白も落とす", held.calls[0].args.p_email, `taro@${DOMAIN}`);
console.log("      ※ 手元の仮の人の見分けも、同じ揃え方をしてから比べる");
reset();
await recordPageView(member(`LOCAL-PREVIEW@${DOMAIN}`), page("p1", "internal/report/2026q1"));
ok("大文字混じりの仮の人も弾く", held.calls.length, 0);
reset();
await recordPageView(member(` local-preview@${DOMAIN} `), page("p1", "internal/report/2026q1"));
ok("前後に空白が付いていても弾く", held.calls.length, 0);

// ---------------------------------------------------------------------------
console.log("\n--- 9. 消す口（自分の行だけを、印を立てずに消す）---");
console.log("   ここが繋がっていないと、画面の「消す」は約束の半分しか果たさない");

ok("消すのは行そのもの（印の列を使っていない）", /deleted_at/.test(STORE), false);
ok("1 行消す口がある", /export async function forgetPageView\(viewer: Member, page: StoredPage\)/.test(STORE), true);
ok("全部消す口がある", /export async function forgetAllPageViews\(organization: OrganizationScope, viewer: Member\)/.test(STORE), true);
ok("「残さない」を入り切りする口がある", /export async function setViewOptOut\(organization: OrganizationScope, viewer: Member, off: boolean\)/.test(STORE), true);
ok("いま止めているかを引く口がある", /export async function viewOptedOut\(organization: OrganizationScope, viewer: Identity \| null\)/.test(STORE), true);
console.log("      ※ どれもアドレスは名乗りから採る。引数で受ける形にすると、他人の控えを消せる口になる");
ok("消す口はアドレスを引数で受けない", /forget\w*\([^)]*email/i.test(STORE), false);
ok("自分の行だけを相手にする（引く 2 つ・消す 2 つ）", count(STORE, /\.eq\("viewer_email", normalize\(viewer\.email\)\)/g), 4);

const ACTIONS = strip(await read("src/app/activity/actions.ts"));
ok("画面から呼ぶ口がある", /"use server";/.test(ACTIONS), true);
ok("受け取るのは呼び名と入り切りだけ", /email/.test(ACTIONS), false);
ok("誰かは名乗りから採る", count(ACTIONS, /await currentIdentity\(\)/g), 1);
ok("会社の人でなければ何もしない", /return isMember\(viewer\) \? viewer : null;/.test(ACTIONS), true);
ok("送られた呼び名は形から確かめる", /parsePageSlug\(page\)/.test(ACTIONS), true);
ok("1 行消すときも門を通る", /const gate = await openPage\(organization, viewer, ref\.slug\);/.test(ACTIONS), true);
ok("門が開いたときだけ消す", /if \(gate\.ok\) await forgetPageView\(viewer, gate\.page\);/.test(ACTIONS), true);
console.log("      ※ 消したあとは画面を作り直す（消えたはずの行が残って見えない）");
ok("作り直しを頼んでいる（3 つとも）", count(ACTIONS, /\n  refresh\(\);/g), 3);
console.log("      ※ 人に見せる文言に「トークン」という語を出さない");
ok("その語が出てこない", /トークン/.test(await read("src/app/activity/actions.ts")), false);

console.log("\n   実際に叩いて確かめる（名無しのとき）");
await build({
  entryPoints: [`${root}/src/app/activity/actions.ts`],
  outfile: `${dir}/views-actions.mjs`,
  bundle: true,
  format: "esm",
  platform: "node",
  external: ["node:*"],
  alias: ALIAS,
  // 名乗りの所属の読み（src/lib/organization/organizations.ts）は相対の道筋で保存先を読むので、同じ差し替えに向ける
  plugins: [companyDeployment, { name: "views-database", setup(b) { b.onResolve({ filter: /^\.\/database$/ }, () => ({ path: ALIAS["@/lib/db/database"] })); } }],
});
const { forgetAllViewsAction, forgetViewAction, setViewOptOutAction } = await import(
  `${dir}/views-actions.mjs`
);

/** 台帳から返ってくる 1 枚（社内ページ。会社の人なら名簿を引かずに開く）。 */
const stored = {
  id: "p1",
  page_slug: "internal/report/2026q1",
  visibility: "internal",
  title: "四半期の報告",
  current_version_id: null,
  created_by: `taro@${DOMAIN}`,
  deleted_at: null,
  created_at: "2026-08-01T00:00:00.000Z",
  updated_at: "2026-08-01T00:00:00.000Z",
};

/** 名乗りを差し替えて叩く（session が null なら名無し）。 */
const asPerson = (email) => {
  held.calls.length = 0;
  held.session = email === null ? null : { user: { email } };
};

reset();
held.page = stored;
asPerson(null);
await forgetViewAction("internal/report/2026q1");
ok("名無しが 1 行消す口を叩いても、保管庫に何も頼まない", held.calls.length, 0);
asPerson(null);
await forgetAllViewsAction();
ok("全部消す口も同じ", held.calls.length, 0);
asPerson(null);
await setViewOptOutAction(true);
ok("「残さない」も同じ", held.calls.length, 0);
console.log("      ※ ゲストにも名無しにも、アカウントに紐づく控えというものが無い");

console.log("\n   会社の人が 1 行消す");
asPerson(`taro@${DOMAIN}`);
await forgetViewAction("internal/report/2026q1");
const deleted = held.calls.find((one) => one.table === "page_views");
ok("台帳を引いてから消している", held.calls[0].table, "pages");
ok("控えの表に頼んでいる", deleted !== undefined, true);
ok("消す頼みになっている", deleted.deleted, true);
ok("消すのは押した 1 ページだけ", deleted.filters["page_id"], "p1");
ok("消すのは自分の行だけ", deleted.filters["viewer_email"], `taro@${DOMAIN}`);
ok("消したら画面を作り直す", held.refreshed > 0, true);

console.log("\n   いま開けないページを指して叩く");
held.page = null;
asPerson(`taro@${DOMAIN}`);
await forgetViewAction("internal/report/2026q1");
ok("門が閉じていれば 1 行も消さない", held.calls.some((one) => one.deleted), false);
held.page = stored;
asPerson(`taro@${DOMAIN}`);
await forgetViewAction("／壊れた呼び名");
ok("読めない呼び名なら台帳も引かない", held.calls.length, 0);

console.log("\n   会社の人が全部消す");
asPerson(`taro@${DOMAIN}`);
await forgetAllViewsAction();
const all = held.calls.find((one) => one.table === "page_views");
ok("見たページの控えの表に 1 回だけ頼む", held.calls.filter((one) => one.table === "page_views").length, 1);
ok("頼むのは見たページの表だけ", held.calls.map((one) => one.table).sort().join(","), "page_views");
ok("消す頼みになっている", all.deleted, true);
ok("絞るのはアドレスだけ", Object.keys(all.filters).join(","), "viewer_email");
ok("自分の行だけ", all.filters["viewer_email"], `taro@${DOMAIN}`);
console.log("      ※ 一覧に出ていない行（あとから制限がかかったページの分）も一緒に消える。");
console.log("        「全部消す」と言って消し残すほうが、約束としては重い違反になる");

console.log("\n   「残さない」をオンにすると、既にある分も消える");
asPerson(`taro@${DOMAIN}`);
await setViewOptOutAction(true);
const marked = held.calls.find((one) => one.table === "page_view_optouts");
const swept2 = held.calls.find((one) => one.table === "page_views");
ok("「残さない」の表に自分を入れる", marked.upsert.row.viewer_email, `taro@${DOMAIN}`);
ok("同じ組織の同じ人を二重に入れない（組織ごとに 1 行）", marked.upsert.options.onConflict, "organization_id,viewer_email");
ok("いま残っている分も消す", swept2 !== undefined && swept2.deleted, true);
ok("消すのは自分の行だけ", swept2.filters["viewer_email"], `taro@${DOMAIN}`);
console.log("      ※ 先に印を置いてから消す。逆にすると、消してから印が立つまでの隙間に 1 行積まれうる");
ok("印が先、消すのが後", held.calls.indexOf(marked) < held.calls.indexOf(swept2), true);

console.log("\n   オフにすると表から外す（消えた控えは戻らない）");
asPerson(`taro@${DOMAIN}`);
await setViewOptOutAction(false);
ok("頼むのは 1 回だけ", held.calls.length, 1);
ok("外すのは「残さない」の表", held.calls[0].table, "page_view_optouts");
ok("消す頼みになっている", held.calls[0].deleted, true);
ok("自分の行だけ", held.calls[0].filters["viewer_email"], `taro@${DOMAIN}`);
ok("控えの表には触らない", held.calls.some((one) => one.table === "page_views"), false);

console.log("\n   手元の仮の人は、消す口でも保管庫に触らない");
asPerson(`local-preview@${DOMAIN}`);
await forgetAllViewsAction();
ok("全部消しても何も頼まない", held.calls.length, 0);
asPerson(`local-preview@${DOMAIN}`);
await setViewOptOutAction(true);
ok("「残さない」でも何も頼まない", held.calls.length, 0);
asPerson(`local-preview@${DOMAIN}`);
await forgetViewAction("internal/report/2026q1");
ok("1 行消しても、控えの表には触らない", held.calls.some((one) => one.table === "page_views"), false);

console.log("\n   いま止めているかを引く（画面の入口の出し分け）");
asPerson(`taro@${DOMAIN}`);
held.rows = [{ viewer_email: `taro@${DOMAIN}` }];
const { viewOptedOut } = await import(`${dir}/views-store.mjs`);
ok("入っていれば true", await viewOptedOut(ORG, member(`taro@${DOMAIN}`)), true);
ok("引くのは「残さない」の表", held.calls[0].table, "page_view_optouts");
ok("自分の行だけ照らす", held.calls[0].filters["viewer_email"], `taro@${DOMAIN}`);
held.calls.length = 0;
held.rows = [];
ok("入っていなければ false", await viewOptedOut(ORG, member(`taro@${DOMAIN}`)), false);
held.calls.length = 0;
ok("名乗っていない人には聞きに行かない", await viewOptedOut(ORG, null), false);
ok("そのとき保管庫に頼まない", held.calls.length, 0);

console.log(fails === 0 ? "\nぜんぶ通った" : `\n${fails} 件が期待と違う`);
process.exitCode = fails === 0 ? 0 : 1;
