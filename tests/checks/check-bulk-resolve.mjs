import { readWidgetSource } from "./widget-source.mjs";
/**
 * まとめて解決にする / まとめて未解決に戻す口。
 *
 * 見るのは 5 つ。
 *   1. 受け取りの境目（呼び名が要る・目印の形・上限・向き）
 *   2. 動かす向きは選んだ中身が決める（画面側で数え直さない）
 *   3. 関門は 1 件の口とまったく同じ 2 つ（canUsePageTools と openPage）
 *   4. 書き込みはページの呼び名で縛り、すでにその状態のものは触らない
 *   5. 知らせは出さない（Slack へ流すのは付いたときだけ）
 *
 * 保管庫にもネットワークにも繋がない。
 */
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";

import { root, dir } from "./paths.mjs";
const { build } = await import(`${root}/node_modules/esbuild/lib/main.js`);

/*
 * 受け取りの判定だけを組み立てて読み込む。
 *
 * cjs で組むのは、src/lib/comments/comments.ts が保管庫ごしに next / next-auth を引き込んでいて、
 * esm にすると `__dirname` が無くて読み込めないため（check-page-nesting.mjs と同じ）。
 * データベースへは繋がない——ここで呼ぶのは素の判定だけ。
 */
const require2 = createRequire(import.meta.url);
await build({
  entryPoints: [`${root}/src/lib/comments/comments.ts`],
  outfile: `${dir}/bulk-lib.cjs`,
  bundle: true,
  format: "cjs",
  platform: "node",
  external: ["node:*"],
});
await build({
  entryPoints: [`${root}/src/widget/comments/comment-list.ts`],
  outfile: `${dir}/bulk-list.mjs`,
  bundle: true,
  format: "esm",
  platform: "neutral",
});

const { BULK_RESOLVE_MAX, validateBulkResolve } = require2(`${dir}/bulk-lib.cjs`);
const { bulkAction, bulkLabel } = await import(`${dir}/bulk-list.mjs`);

let fails = 0;
const ok = (label, actual, expected) => {
  const pass = String(actual) === String(expected);
  if (!pass) fails += 1;
  console.log(`${pass ? "OK  " : "NG  "} ${label}: ${actual}（期待: ${expected}）`);
};

const strip = (text) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
const ROUTE = strip(await readFile(`${root}/src/app/api/comments/route.ts`, "utf8"));
const ONE = strip(await readFile(`${root}/src/app/api/comments/[id]/route.ts`, "utf8"));
const LIB = strip(await readFile(`${root}/src/lib/comments/comments.ts`, "utf8"));
const WIDGET = strip(await readWidgetSource());
const API = strip(await readFile(`${root}/src/widget/shared/api.ts`, "utf8"));

const id = (tail) => `00000000-0000-4000-8000-00000000000${tail}`;
const body = (over) => ({ pageSlug: "internal/demo", ids: [id(1)], resolved: true, ...over });

console.log("--- 1. 受け取りの境目 ---");
ok("ふつうの形は通る", validateBulkResolve(body()).ok, true);
ok("呼び名が無ければ断る", validateBulkResolve({ ids: [id(1)], resolved: true }).ok, false);
ok("呼び名の頭が知らない字なら断る", validateBulkResolve(body({ pageSlug: "secret/x" })).ok, false);
ok("上へ抜ける道は通さない", validateBulkResolve(body({ pageSlug: "internal/../x" })).ok, false);
ok("目印が並びでなければ断る", validateBulkResolve(body({ ids: id(1) })).ok, false);
ok("目印の形が違えば断る", validateBulkResolve(body({ ids: ["abc"] })).ok, false);
ok("1 件も選ばれていなければ断る", validateBulkResolve(body({ ids: [] })).ok, false);
ok("向きが真偽値でなければ断る", validateBulkResolve(body({ resolved: "true" })).ok, false);
ok("向きが無ければ断る", validateBulkResolve({ pageSlug: "internal/demo", ids: [id(1)] }).ok, false);
ok("素の値でなければ断る", validateBulkResolve("x").ok, false);

ok("上限がある", typeof BULK_RESOLVE_MAX === "number" && BULK_RESOLVE_MAX > 0, true);
const many = (count) => Array.from({ length: count }, (_, at) => id(0).slice(0, -3) + String(at + 100));
ok("上限ぴったりは通る", validateBulkResolve(body({ ids: many(BULK_RESOLVE_MAX) })).ok, true);
ok("上限を 1 つ超えたら断る", validateBulkResolve(body({ ids: many(BULK_RESOLVE_MAX + 1) })).ok, false);

const twice = validateBulkResolve(body({ ids: [id(1), id(1), id(2)] }));
ok("同じ目印は 1 件に畳む", twice.ok && twice.value.ids.length, 2);
ok("呼び名は組み直したものを持つ", twice.ok && twice.value.page.slug, "internal/demo");

console.log("\n--- 2. 動かす向きは選んだ中身が決める ---");
const open = { resolvedAt: null };
const shut = { resolvedAt: "2026-08-02T00:00:00.000Z" };
ok("未解決だけなら解決へ", bulkAction([open, open]), "resolve");
ok("1 件でも未解決が混ざれば解決へ", bulkAction([shut, open, shut]), "resolve");
ok("全部片付いていれば戻す", bulkAction([shut, shut]), "reopen");
ok("1 件も無ければ何もしない", bulkAction([]), null);
ok("字は向きと件数だけ", bulkLabel("resolve", 3), "3 件を解決にする");
ok("戻す側の字", bulkLabel("reopen", 1), "1 件を未解決に戻す");
ok("向きを画面側で数え直していない", /some\(\(one\) => one\.resolvedAt === null\)/.test(WIDGET), false);
ok("画面は決まりを呼ぶだけ", /bulkAction\(chosen\)/.test(WIDGET), true);

console.log("\n--- 3. 関門は 1 件の口と同じ 2 つ ---");
const patch = /export async function PATCH\(request: Request\)[\s\S]*?\n}/.exec(ROUTE)?.[0] ?? "";
ok("まとめての口がある", patch.length > 0, true);
ok("道具箱を触れる人か", /canUsePageTools\(viewer\)/.test(patch), true);
ok("そのページを開けるか", /openPage\(organization, viewer, input\.value\.page\.slug\)/.test(patch), true);
ok("断り方も門に任せる", /gateError\(gate\.reason\)/.test(patch), true);
ok("名乗りはサーバーが採る", /currentIdentity\(\)/.test(patch), true);
ok("呼び名の頭で可否を決めていない", /slugPrefix/.test(patch), false);
ok("1 件の口も同じ 2 つ", /canUsePageTools\(viewer\)/.test(ONE) && /openPage\(organization, viewer,/.test(ONE), true);
ok("書いた本人かは問わない（解決は誰でも）", /\.mine/.test(patch), false);

console.log("\n--- 4. 書き込みの縛り ---");
const write = /export async function resolveComments\([\s\S]*?\n}/.exec(LIB)?.[0] ?? "";
ok("まとめての書き込みがある", write.length > 0, true);
ok("目印の並びで絞る", /\.in\("id", \[\.\.\.ids\]\)/.test(write), true);
ok("ページの呼び名でも絞る", /\.eq\("page_slug", page\.slug\)/.test(write), true);
ok("消した印が立った行は触らない", /\.is\("deleted_at", null\)/.test(write), true);
ok("解決へ動かすのは未解決だけ", /\.is\("resolved_at", null\)/.test(write), true);
ok("戻すのは解決済だけ", /\.not\("resolved_at", "is", null\)/.test(write), true);
ok("動いた件数を数えて返す", /return Array\.isArray\(data\) \? data\.length : 0/.test(write), true);
ok("列の作りは 1 件の口と共有する", /resolveColumns\(resolved, viewer\)/.test(write), true);
ok(
  "1 件の口も同じところから採る",
  /Object\.assign\(changes, resolveColumns\(patch\.resolved, viewer\)\)/.test(LIB),
  true,
);
ok("誰が閉じたかは表示名だけ", /resolved_by: resolved \? viewerLabel\(viewer\) : null/.test(LIB), true);
const columns = /function resolveColumns\([\s\S]*?\n}/.exec(LIB)?.[0] ?? "";
ok("戻すときは名前も時刻も消す", /resolved_at: resolved \? new Date\(\)\.toISOString\(\) : null/.test(columns), true);

console.log("\n--- 5. 知らせは出さない ---");
ok("Slack へ流さない", /notifyComment/.test(patch), false);
// Slack への知らせは配布版に無い（コメントが付いたときの知らせも無い）

console.log("\n--- 6. 呼ぶ側 ---");
ok("1 件ずつ何度も叩かない", /for \(const id of review\.commentIds\)/.test(WIDGET), false);
ok("帯もまとめての口を通る", /resolveComments\(state\.slug, review\.commentIds, true\)/.test(WIDGET), true);
ok("送るのは呼び名と目印と向きだけ", /JSON\.stringify\(\{ pageSlug, ids: \[\.\.\.ids\], resolved \}\)/.test(API), true);
// 行き先は /api/comments の 1 つだけ（配布版にはリポジトリの文書の口が無い）
ok("叩く先は一覧と同じ口", /send\(commentsEndpoint, \{\s*method: "PATCH"/.test(API) && /const commentsEndpoint = "\/api\/comments";/.test(API) && /send\(`\$\{commentsEndpoint\}\?page=/.test(API), true);

console.log(`\n${fails === 0 ? "すべて合格" : `${fails} 件 不合格`}`);
process.exitCode = fails === 0 ? 0 : 1;
