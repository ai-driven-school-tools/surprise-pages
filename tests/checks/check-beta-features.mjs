/** ベータ機能の台帳。機能を足しても、設定画面・保存の口・保存先・道具箱を書き足さずに済む作りを検査する。 */
import { readFileSync, readdirSync } from "node:fs";
import { root, dir } from "./paths.mjs";
import { build } from "esbuild";

await build({ entryPoints: [`${root}/src/lib/settings/beta-features.ts`], outfile: `${dir}/beta-features.mjs`, bundle: true, format: "esm", platform: "node" });
await build({ entryPoints: [`${root}/src/lib/workspace/settings.ts`], outfile: `${dir}/beta-model.mjs`, bundle: true, format: "esm", platform: "node" });
const { BETA_FEATURE_IDS, BETA_FEATURES, betaFeatureTitle, betaFeatureDetail, isBetaFeatureId, knownBetaFeatures, hasBetaFeature } = await import(`${dir}/beta-features.mjs`);
const { workspaceMutationSchema } = await import(`${dir}/beta-model.mjs`);
const read = (file) => readFileSync(`${root}/${file}`, "utf8");

let failures = 0;
function ok(label, actual, expected) {
  const pass = JSON.stringify(actual) === JSON.stringify(expected);
  if (!pass) failures++;
  console.log(`${pass ? "OK  " : "NG  "} ${label}: ${JSON.stringify(actual)}（期待: ${JSON.stringify(expected)}）`);
}

console.log("--- 1. 台帳 ---");
ok("名前は保存先に置ける形（英小文字・数字・-）", BETA_FEATURE_IDS.every((id) => /^[a-z][a-z0-9-]{1,39}$/.test(id)), true);
ok("名前が重ならない", new Set(BETA_FEATURE_IDS).size, BETA_FEATURE_IDS.length);
// 題と説明は辞書の鍵。辞書に無い鍵は鍵のまま返るので、引いた字が鍵と違うことで「辞書にある」を見る
ok("どの機能にも題と説明がある（辞書に日本語がある）", BETA_FEATURE_IDS.filter((id) => !BETA_FEATURES[id]?.titleKey || !BETA_FEATURES[id]?.detailKey || betaFeatureTitle(id) === BETA_FEATURES[id].titleKey || betaFeatureDetail(id) === BETA_FEATURES[id].detailKey || !betaFeatureTitle(id).trim() || !betaFeatureDetail(id).trim()), []);
ok("台帳に無い機能の説明を残さない", Object.keys(BETA_FEATURES).filter((id) => !BETA_FEATURE_IDS.includes(id)), []);
ok("題と説明に絵文字を使わない", BETA_FEATURE_IDS.some((id) => /\p{Extended_Pictographic}/u.test(betaFeatureTitle(id) + betaFeatureDetail(id))), false);
// 配布版の台帳はいま空。空でも仕組み（漉す・聞く・保存の口）が働くことを見て、
// 機能が台帳に載ったときだけ、その名前で通ることも見る（空の台帳で BETA_FEATURE_IDS[0] を使うと嘘の検査になる）。
const sample = BETA_FEATURE_IDS[0];
const known = sample === undefined ? [] : [sample];
ok("台帳の名前だけを通す", [...known.map((id) => isBetaFeatureId(id)), isBetaFeatureId("unknown"), isBetaFeatureId("prompter"), isBetaFeatureId(1), isBetaFeatureId(null)], [...known.map(() => true), false, false, false, false]);
ok("保存先に残った知らない名前は捨てる", knownBetaFeatures(["retired", ...known, 3, null]), known);
ok("何も入れていなければ空", knownBetaFeatures([]), []);
ok("入っているかを名前で聞く", [...known.map((id) => hasBetaFeature([id], id)), ...known.map((id) => hasBetaFeature([], id)), ...known.map((id) => hasBetaFeature(undefined, id))], [...known.map(() => true), ...known.map(() => false), ...known.map(() => false)]);

console.log("\n--- 2. 保存の口 ---");
const accepts = (value) => workspaceMutationSchema.safeParse(value).success;
ok("台帳の機能は入り切りできる", BETA_FEATURE_IDS.map((feature) => accepts({ action: "beta", feature, enabled: true }) && accepts({ action: "beta", feature, enabled: false })), BETA_FEATURE_IDS.map(() => true));
ok("知らない機能は断る", accepts({ action: "beta", feature: "unknown", enabled: true }), false);
ok("台帳から消えた機能は断る", accepts({ action: "beta", feature: "prompter", enabled: true }), false);
for (const id of known) {
  ok("入り切りは真偽だけ", accepts({ action: "beta", feature: id, enabled: "yes" }), false);
  ok("誰の分かを受け取らない", accepts({ action: "beta", feature: id, enabled: true, email: "other@example.com" }), false);
}
const model = read("src/lib/workspace/settings.ts");
ok("選べる名前は台帳から採る", model.includes("feature: z.enum(BETA_FEATURE_IDS)"), true);
const route = read("src/app/api/workspace/route.ts");
ok("保存は共通の関数 1 つ・誰の分かは名乗りから", /input\.action === "beta"[\s\S]{0,160}await setBetaFeature\(organization, email, input\.feature, input\.enabled\)/.test(route), true);

console.log("\n--- 3. 保存先 ---");
const store = read("src/lib/settings/beta-features-store.ts");
ok("読めなかったら「何も入れていない」（投げない）", [/if \(result\.error \|\| !Array\.isArray\(result\.data\)\) return \[\];/.test(store), /catch \{\s*return \[\];/.test(store)], [true, true]);
ok("読んだ名前は台帳で漉す", store.includes("return knownBetaFeatures("), true);
ok("アドレスは小文字にそろえる", (store.match(/email\.toLowerCase\(\)/g) ?? []).length, 2);
ok("入れるときは置き、切るときは行を消す", /upsert\(\{ owner_email: owner, feature \}, \{ onConflict: "organization_id,owner_email,feature" \}\)/.test(store) && /\.delete\(\)\.eq\("owner_email", owner\)\.eq\("feature", feature\)/.test(store), true);
const migrationFile = readdirSync(`${root}/db/migrations`).find((file) => file.endsWith("_beta_feature_optins.sql"));
const migration = read(`db/migrations/${migrationFile}`);
ok("1 人 1 機能 1 行", /primary key \(owner_email, feature\)/.test(migration), true);
ok("鍵をかけ、サーバーにだけ権限を渡す", [/enable row level security/.test(migration), /grant select, insert, update, delete on public\.beta_feature_optins to service_role/.test(migration), /revoke all on public\.beta_feature_optins from public, anon, authenticated/.test(migration)], [true, true, true]);
ok("機能の名前を DB で縛らない（足すたびに DB を変えない）", BETA_FEATURE_IDS.some((id) => migration.includes(`'${id}'`)), false);
ok("機能ごとの列を作らない", readdirSync(`${root}/db/migrations`).some((file) => BETA_FEATURE_IDS.some((id) => new RegExp(`add column ${id}_enabled`).test(read(`db/migrations/${file}`)))), false);

console.log("\n--- 4. 画面への受け渡し ---");
const screen = read("src/app/settings/settings-screen.tsx");
ok("設定画面の行は、台帳から組織で使える機能を抜いた一覧（offered）から出す", /\{t\("settings\.beta\.title"\)\}<\/h2>\s*\{offered\.map\(\(feature\) => \(\s*<SettingRow key=\{feature\} title=\{betaFeatureTitle\(feature, t\)\} detail=\{betaFeatureDetail\(feature, t\)\}>/.test(screen), true);
ok("並べる一覧は台帳そのもの（台帳の順・名前を書き足さない）", /const offered = \[\.\.\.BETA_FEATURE_IDS\];/.test(read("src/app/(workspace)/(screens)/settings/page.tsx")), true);
ok("設定画面に機能の名前を直に書かない", BETA_FEATURE_IDS.some((id) => screen.includes(`"${id}"`)), false);
ok("切り替えは既にある部品（ws-segments）", screen.includes('className="ws-segments" role="group"'), true);
const comments = read("src/app/api/comments/route.ts");
ok("道具箱へは 1 本にまとめて渡す", [comments.includes("isMember(viewer) ? readBetaFeatures(organization, viewer.email) : []"), /write: true,[\s\S]{0,120}\n\s*beta,/.test(comments)], [true, true]);
ok("道具箱を閉じた答えには載せない", (comments.match(/^\s*beta,$/gm) ?? []).length, 1);
const types = read("src/lib/comments/types.ts");
ok("旗は機能ごとに足さない", /beta\?: BetaFeatureId\[\];/.test(types) && !BETA_FEATURE_IDS.some((id) => new RegExp(`\\b${id}\\??: boolean`).test(types)), true);
const widget = read("src/widget/comments/comments.ts");
// いま入口を出すベータ機能は無い。使うときは hasBetaFeature(state.features.beta, 名前) で聞き、
// 機能ごとの旗や名前の字面の比較を道具箱に書かない
ok("道具箱は機能ごとの旗を持たない（使うときは名前で聞く）", /features\.beta\.(includes|indexOf|some)\(|features\.beta\[/.test(widget) || /features\.[a-z]+Beta\b/.test(widget), false);
ok("入れているかをブラウザ側で覚えない", /writeStored\([^)]*beta|localStorage[^\n]*beta/i.test(widget), false);
console.log("\n--- 3. 道具箱がサーバーの答えを受け取る（受け取りの関数の実物を動かす） ---");
// サーバーが返した「入れているベータ機能」が、道具箱の状態まで届くこと。字面ではなく実物で見る——
// 受け取りの関数が決まった欄だけを写す作りで、beta を写し忘れると誰が入れても入口が出ない（2026-10-02 に本番で起きた）。
await build({ entryPoints: [`${root}/src/widget/shared/api.ts`], outfile: `${dir}/beta-widget-api.mjs`, bundle: true, format: "esm", platform: "node" });
const { loadComments } = await import(`${dir}/beta-widget-api.mjs`);
const realFetch = globalThis.fetch;
async function received(features) {
  globalThis.fetch = async () => new Response(JSON.stringify({ viewer: null, comments: [], currentVersion: null, features }), { status: 200, headers: { "content-type": "application/json" } });
  try {
    const result = await loadComments("internal/example");
    return result.ok ? result.value.features.beta : "読めなかった";
  } finally {
    globalThis.fetch = realFetch;
  }
}
const base = { tools: true, history: true, slack: false, sharing: false, slackThread: false, edit: false, write: true };
ok("サーバーが返したベータ機能が道具箱に届く", await received({ ...base, beta: known }), known);
for (const id of known) ok("届いたものは入口の判定で「入っている」になる", hasBetaFeature(await received({ ...base, beta: [id] }), id), true);
ok("台帳に無い名前・文字でない値は捨てる", await received({ ...base, beta: ["retired", "prompter", ...known, 3, null] }), known);
ok("欄が無い・配列でない答えは「何も入れていない」", [await received(base), await received({ ...base, beta: "prompter" }), await received(null)], [[], [], []]);
process.exitCode = failures ? 1 : 0;
