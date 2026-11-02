/**
 * 体感速度の決まり（docs/design/app-speed.md）を確かめる。速さそのものは本物のブラウザで測る（tests/checks/browser/app-speed.mjs）。
 * ここは「速くした仕掛けが、気づかないうちに外れていないか」を、書いてある中身と純粋な関数だけで見る。
 *
 *   1. 先読み: 触れたリンクだけを先読みし、取り寄せた中身を使う長さが 2 か所（決まりと Next の設定）で同じか
 *   2. 先読みで裏で開いた資料は、表に出るまで「見た」と控えないか
 *   3. 戻る: 画面を開くたびに cookie を書き直していないか（書き直すと、戻る・進むで画面をそのまま戻せない）
 *   4. 往復: 一覧の画面が、同じ問い合わせを 1 回の表示の中で 2 度読んでいないか
 *   5. 測り方: 合格ラインがすべての場面にあり、測る場面と食い違っていないか
 *   6. つなぎ方: 保存先との接続を押すたびに作り直していないか・文の形を覚えているか
 *
 * 保管庫にもネットワークにも繋がない。
 */
import { readFile } from "node:fs/promises";
import { build } from "esbuild";

import { root } from "./paths.mjs";
import { readFileSync, readdirSync } from "node:fs";
import { GUARD, RATIO, TARGET, SCENES, baselineFrom, judge, judgeRatio, summarize } from "./browser/app-speed-budget.mjs";

const read = (path) => readFile(`${root}/${path}`, "utf8");
/** 説明書き（コメント）を落として、実際に動くところだけを見る。 */
const strip = (text) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");

let fails = 0;
const ok = (label, actual, expected) => {
  const pass = JSON.stringify(actual) === JSON.stringify(expected);
  if (!pass) fails += 1;
  console.log(`${pass ? "OK  " : "NG  "} ${label}: ${JSON.stringify(actual)}（期待: ${JSON.stringify(expected)}）`);
};

/** TypeScript の決まりを、その場で組み立てて読む。 */
async function loadTs(path) {
  const result = await build({ entryPoints: [`${root}/${path}`], bundle: true, format: "esm", platform: "neutral", write: false, logLevel: "silent" });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString("base64")}`);
}

const policy = await loadTs("src/lib/pages/prefetch-policy.ts");
const SHELL = strip(await read("src/app/_components/workspace-shell.tsx"));
const NEXT_CONFIG = strip(await read("next.config.ts"));
const WIDGET = strip(await read("src/widget/comments/comments.ts"));
const I18N = strip(await read("src/app/_components/i18n.tsx"));
const ACCESS = strip(await read("src/lib/access/gates.ts"));
const WORKSPACE = strip(await read("src/lib/workspace/workspace.ts"));
const SIDEBAR = strip(await read("src/lib/workspace/sidebar-favorites.ts"));
const STORE = strip(await read("src/lib/pages/store.ts"));
const HOME = strip(await read("src/lib/workspace/home.ts"));

// ---------------------------------------------------------------------------
console.log("--- 1. 先読みは触れたリンクだけ（src/lib/pages/prefetch-policy.ts）---");
const here = { origin: "https://pages.example", pathname: "/", search: "" };
const link = (href, extra = {}) => policy.prefetchTarget({ href, target: "", hasDownload: false, ...extra }, here);
ok("会社の資料は先読みする", link("/library"), "/library");
ok("問い合わせ（絞り込み・ページ送り）も付けたまま", link("/library?q=%E8%AD%B0&page=2"), "/library?q=%E8%AD%B0&page=2");
ok("いま居る画面は先読みしない", link("/"), null);
ok("資料（/internal/）はブラウザの先読みに任せる（Next では取らない）", link("/internal/guide"), null);
ok("よそのサイトは先読みしない", link("https://evil.example/library"), null);
ok("新しい窓で開くリンクは先読みしない", link("/library", { target: "_blank" }), null);
ok("保存のリンクは先読みしない", link("/library", { hasDownload: true }), null);
ok("知らない画面（管理・ログイン）は先読みしない", [link("/sharing"), link("/signin"), link("/api/comments")], [null, null, null]);
const page = (href, extra = {}) => policy.prerenderTarget({ href, target: "", hasDownload: false, listed: true, ...extra }, { origin: "https://pages.example", pathname: "/mine", search: "" });
ok("一覧の資料は触れた 1 枚を裏で開く（/internal/・/public/）", [page("/internal/guide"), page("/public/intro?v=1")], ["/internal/guide", "/public/intro?v=1"]);
ok("行の題・お気に入りでないリンク・保存・新しい窓・よそ・画面は裏で開かない", [page("/internal/guide", { listed: false }), page("/internal/guide", { hasDownload: true }), page("/internal/guide", { target: "_blank" }), page("https://evil.example/internal/guide"), page("/library")], [null, null, null, null, null]);
ok("裏で開く資料のリンクは、宣言の受け皿と同じ選び方", policy.DOCUMENT_LINK_SELECTOR, "a.ws-row-title, a.ws-nav-item");
ok("触れた 1 枚の宣言は URL を並べる形（書いた瞬間に始まる）", JSON.parse(policy.documentPrerenderRules("/internal/guide")), { prerender: [{ urls: ["/internal/guide"] }] });
ok("資料の宣言はとどまってから差し込み、1 枚だけに保つ（前の宣言を外してから足す）", /prerendering\?\.rules\.remove\(\);[\s\S]*?document\.head\.append\(rules\)/.test(SHELL) && /if \(intent\.document\) \{\s*prerender\(target\);/.test(SHELL), true);
ok("宣言を受け付けないブラウザでは差し込まない", /HTMLScriptElement\.supports\("speculationrules"\)/.test(SHELL), true);
ok("先読みしてよい画面はサイドバーの場所と個人設定だけ", [...policy.PREFETCH_SCREENS].sort(), ["/", "/activity", "/favorites", "/library", "/mine", "/settings"]); // 録音・リポジトリの文書の画面はこの版に無い
const staleTimes = /staleTimes: \{ static: (\d+) \}/.exec(NEXT_CONFIG)?.[1];
ok("取り寄せた中身を使う長さが、決まりと Next の設定で同じ", Number(staleTimes), policy.PREFETCH_FRESH_SECONDS);
ok("中身まで取り寄せる（指定が無いと、待ちの表示の手前までしか取らない）", /router\.prefetch\(target, \{ kind: PrefetchKind\.FULL \}\)/.test(SHELL), true);
ok("マウスを止めた・キーで選んだときに始める（見えただけ・指で触れただけでは始めない）", /\["pointerover", onIntent\], \["focusin", onIntent\]/.test(SHELL) && !SHELL.includes("touchstart"), true);
ok("とどまってから始める（すぐ押したときに同じ画面を 2 度描かせない）", /window\.setTimeout\([\s\S]*?router\.prefetch\(target[\s\S]*?\}, PREFETCH_HOVER_MS\)/.test(SHELL) && policy.PREFETCH_HOVER_MS > 0 && policy.PREFETCH_HOVER_MS < 200, true);
ok("押し始めたら、まだ始めていない先読みはやめる", /\["pointerdown", cancel\], \["keydown", cancel\]/.test(SHELL), true);
ok("枠に 1 つだけ置いている", (SHELL.match(/<IntentPrefetch \/>/g) ?? []).length, 1);
const rules = JSON.parse(policy.DOCUMENT_SPECULATION_RULES);
ok("資料の先読みは触れて 0.2 秒とどまったとき（moderate）", rules.prerender?.[0]?.eagerness, "moderate");
ok("資料の先読みは /internal/・/public/ の行の題だけ", JSON.stringify(rules.prerender?.[0]?.where).includes('"href_matches":["/internal/*","/public/*"]') && JSON.stringify(rules).includes("a.ws-row-title"), true);
ok("資料の先読みの宣言を枠に置いている", /type="speculationrules"/.test(SHELL), true);

console.log("\n--- 2. 先読みで開いた資料は、表に出るまで「見た」と控えない（src/widget/comments/comments.ts）---");
const remember = /function rememberView\(\): void \{[\s\S]*?\n\}/.exec(WIDGET)?.[0] ?? "";
ok("見た記録を控える前に、裏で開いているかを見る", remember.indexOf('Reflect.get(document, "prerendering") === true') >= 0 && remember.indexOf('Reflect.get(document, "prerendering")') < remember.indexOf("recordView"), true);
ok("表に出た瞬間に控え直す", /addEventListener\("prerenderingchange", \(\) => rememberView\(\), \{ once: true \}\)/.test(remember), true);

console.log("\n--- 3. 戻る・進むで画面をそのまま戻せる（cookie を書き直さない）---");
ok("言語の写しは、違うときだけ書く", /if \(current === `\$\{LOCALE_COOKIE\}=\$\{locale\}`\) return;/.test(I18N), true);
ok("画面の側で cookie を書くのはその 1 か所だけ", (I18N.match(/document\.cookie = /g) ?? []).length, 1);

console.log("\n--- 4. 1 回の表示の中で同じ問い合わせを 2 度読まない・縦に並べない ---");
ok("台帳の全行は 1 回の表示の中で 1 度だけ", /const alivePagesOfRequest = cache\(\(organization: OrganizationScope, viewer: string \| null\) =>/.test(ACCESS), true);
ok("入っているまとまりも 1 度だけ", /const aliveGroupIdsOf = cache\(/.test(ACCESS), true);
ok("個人設定の 1 行は 1 度だけ（外観・言語・読み上げで共有）", (WORKSPACE.match(/\.from\("workspace_preferences"\)/g) ?? []).length, 1);
ok("お気に入りの行は 1 度だけ（サイドバーと一覧で共有）", /savedFavorites\(organization, viewer\.email\)/.test(SIDEBAR) && (WORKSPACE.match(/allRows\(\(\) => orgDb\(organization\)\.from\("page_favorites"\)/g) ?? []).length === 1, true);
ok("台帳の最後の目印を最初の束と同時に聞く（空の束を確かめる往復を足さない）", /order\("id", \{ ascending: false \}\)\.limit\(1\)/.test(STORE), true);
ok("ホームはコメントを待つ間に、ほかの節の形式を引く", HOME.indexOf("const earlyKinds = classifyPages(") >= 0 && HOME.indexOf("const earlyKinds = classifyPages(") < HOME.indexOf("listOpenCommentsOn(organization, mine, viewer)"), true);
ok("名簿の材料は保存先の関数 1 回で読む（無ければ今までの読み方に戻る）", /rpc\("org_member_page_grants"/.test(ACCESS) && /if \(rows === null\) granted = await grantedPageIds\(/.test(ACCESS), true);

console.log("\n--- 4b. 本人まわりの問い合わせを 1 本にまとめる（本番の保存先は同時に投げると混み合う） ---");
const MEMBER_READS = strip(await read("src/lib/identity/member-reads.ts"));
// 画面が呼ぶのは組織を取る版。中身の決まりはそちらで確かめる
const SCOPE_MIGRATION = readdirSync(`${root}/db/migrations`).find((file) => /^\d{14}_organization_scope\.sql$/.test(file));
const SCOPE_SQL = await read(`db/migrations/${SCOPE_MIGRATION}`);
/** 移行の中から、関数 1 つの定義と権限の行（作る文から grant の行まで）だけを切り出す。同じ移行の別の関数（印を写す番人）と混ぜない */
const functionSql = (name) => new RegExp(`create function public\\.${name}\\([\\s\\S]*?grant execute on function public\\.${name}\\([^)]*\\) to service_role;`).exec(SCOPE_SQL)?.[0] ?? "";
const BUNDLE_SQL = functionSql("org_workspace_member_reads");
ok("まとめて読むのは画面を描く 1 回の中だけ（窓口では 1 本ずつ読む）", /if \(!insideRender\(\)\) return null;/.test(MEMBER_READS) && /return requestScope\(\) === requestScope\(\);/.test(MEMBER_READS), true);
ok("まとめて読めなかった欄は、使う側が今までの読み方に戻る（読めない・形が違う欄は undefined）", /if \(error !== null\) return null;/.test(MEMBER_READS) && /result\.success \? result\.data : undefined/.test(MEMBER_READS), true);
ok("まとめて読む関数は GitHub の鍵の欄を返さない", /encrypted_credentials'?\s*,/.test(BUNDLE_SQL.replace(/^--.*$/gm, "")), false);
ok("まとめて読む関数は判定せず、呼ぶ人の権限で動き、サーバーだけが呼べる",
  /security invoker/.test(BUNDLE_SQL) && !/security definer/.test(BUNDLE_SQL) && /revoke all on function public\.org_workspace_member_reads\(uuid, text\) from public, anon, authenticated;/.test(BUNDLE_SQL), true);
// 録音・リポジトリの文書の読み手（recording_sources・recording_grants・github_link・catalog）はこの版に無いので並べない
const BUNDLED_READERS = [
  ["src/lib/access/gates.ts", 'memberRead(organization, email, "grants")'],
  ["src/lib/access/gates.ts", 'memberRead(organization, viewer, "last_page_id")'],
  ["src/lib/workspace/workspace.ts", 'memberRead(organization, email, "preferences")'],
  ["src/lib/workspace/workspace.ts", 'memberRead(organization, email, "favorites")'],
  ["src/lib/pages/views.ts", 'memberRead(organization, viewer.email, "view_optout")'],
];
const missingReaders = [];
for (const [file, call] of BUNDLED_READERS) if (!(await read(file)).includes(call)) missingReaders.push(`${file}: ${call}`);
ok("本人まわりの 13 本は、どれもまとめて読んだ答えを先に使う", missingReaders, []);
// 管理者かは、名乗りを作るときに要求ごとに引いた所属の役割で決まる。まとめて読む欄（admin）も保存先も引かない
const IS_ADMIN = /export async function isAdmin\(organization: OrganizationScope, member: Member\)[\s\S]*?\n\}/.exec(strip(await read("src/lib/access/gates.ts")))?.[0] ?? "";
ok("管理者かは名乗りの役割から決め、保存先を引かない（まとめて読む欄も使わない）", IS_ADMIN.length > 0 && !/getDb|orgDb|memberRead|rpc\(/.test(IS_ADMIN), true);
ok("未解決のコメントは呼び名の一覧を本文で渡す 1 本で読む（無ければ 40 件ずつに戻る）", /rpc\("org_open_page_comments"/.test(strip(await read("src/lib/comments/comments.ts"))), true);
ok("今の版の形式は目印の一覧を本文で渡す 1 本で読む（無ければ 40 件ずつに戻る）", /rpc\("current_page_kinds"/.test(strip(await read("src/lib/workspace/workspace.ts"))), true);

console.log("\n--- 4c. ホームと一覧を 1 段で描き終える ---");
const COMMENTS_LIB = strip(await read("src/lib/comments/comments.ts"));
const FIRST_WAVE_SQL = `${functionSql("org_home_comment_reads")}\n${functionSql("org_member_page_kinds")}`;
ok("ホームはコメントの材料をページの一覧を待たずに読み始める", /const early = insideRender\(\) \? readHomeComments\(organization, viewer, since\) : null;[\s\S]{0,200}const \[visible, grants, viewed, paused\] = await Promise\.all/.test(HOME), true);
ok("ホームは候補が足りないとき・読めないとき今までの読み方に戻る", /\?\? listOpenCommentsOn\(organization, mine, viewer\)/.test(HOME) && /reads === null \? listRepliesToMine\(/.test(HOME), true);
ok("未解決のコメントは、自分の資料の呼び名が全部候補にあるときだけ使う", /if \(!pages\.every\(\(page\) => reads\.candidateSlugs\.has\(page\.pageSlug\)\)\) return null;/.test(COMMENTS_LIB), true);
ok("返信の判定は今までの読み方と同じ 1 か所（assembleReplies）", (COMMENTS_LIB.match(/assembleReplies\(/g) ?? []).length, 3);
ok("形式の材料はホームと一覧の頭で読み始める", /prefetchPageKinds\(organization, viewer\.email\);/.test(HOME) && /prefetchPageKinds\(organization, viewer\.email\);/.test(WORKSPACE), true);
ok("形式の材料は画面を描く 1 回の中だけ（窓口で全部の資料ぶんを読まない）", /const pageKindsOfRequest = cache\(async \(organization: OrganizationScope, email: string\)[^{]*\{\s*if \(!insideRender\(\)\) return null;/.test(WORKSPACE), true);
ok("形式の材料は資料の数に比例しない（新しい順の件数と本人の分だけ）", /order by p\.updated_at desc limit greatest\(p_recent, 0\)/.test(FIRST_WAVE_SQL) && /const EARLY_KIND_PAGES = 200;/.test(WORKSPACE), true);
// 保存先とのつなぎ方（docs/design/app-speed.md の「保存先とのつなぎ方」）。2 つは組みでしか効かない（閉じると覚えた形も消える）
const DATABASE = strip(await read("src/lib/db/database.ts"));
ok("使っていない接続は、読んで次を押すまでの間は保ち、Neon が眠る 5 分より前に閉じる",
  /idle_timeout: CONNECTION_IDLE_SECONDS/.test(DATABASE) && [Number(/export const CONNECTION_IDLE_SECONDS = (\d+);/.exec(DATABASE)?.[1])].every((seconds) => seconds >= 60 && seconds < 300), true);
ok("形の決まった文は形を覚える（覚えないと 1 本ごとに「形の確認」と「実行」の 2 往復）",
  /prepare: canPrepareStatements\(parsed\)/.test(DATABASE) && /unsafe<DbRow\[\]>\(query\.text, query\.parameters, \{ prepare: query\.stable \}\)/.test(DATABASE), true);
ok("保存先の関数の呼び出しも形を覚える", /entries\.map\(\(\[, value\]\) => parameter\(value\)\), \{ prepare: true \}\)/.test(DATABASE), true);
ok("確かめていない資料だけを今までの読み方で補う", /classified = classified\.filter\(\(page\) => !early\.has\(/.test(WORKSPACE), true);
ok("サイドバーのお気に入りは、その画面が全部を読んでいるときだけ全部から拾う（目印を待って読み直さない・全部を読まない画面では星の分だけ）",
  /if \(insideRender\(\) && alivePagesRequested\(organization, viewer\)\) \{/.test(SIDEBAR) && /return visiblePagesFor\(organization, viewer, admin, ids\);/.test(SIDEBAR), true);
ok("形式の材料は、新しい順・最近見た・作った・共有された、それぞれ件数で切る（本人が資料を増やしても比例しない）",
  (FIRST_WAVE_SQL.match(/limit greatest\(p_recent, 0\)/g) ?? []).length, 4);
ok("1 段目の関数は判定せず、サーバーだけが呼べる", /security invoker/.test(FIRST_WAVE_SQL) && !/security definer/.test(FIRST_WAVE_SQL)
  && /revoke all on function public\.org_home_comment_reads\(uuid, text, text, timestamptz\) from public, anon, authenticated;/.test(FIRST_WAVE_SQL)
  && /revoke all on function public\.org_member_page_kinds\(uuid, text, integer, integer\) from public, anon, authenticated;/.test(FIRST_WAVE_SQL), true);
const WIDGET_ENTRY = await read("src/widget/comments/comments.ts");
const HISTORY = await read("src/widget/comments/history.ts");
ok("変更案の確かめは押したときに読む", !/^import \{ openAgentReview \}/m.test(HISTORY) && /import\("\.\.\/reading\/page-agent-review"\)/.test(HISTORY), true);
ok("戻るは資料の読み込みが落ち着いてから押す（人は読んでから戻る）", /await page\.waitForLoadState\("networkidle"\)[\s\S]{0,80}await page\.waitForTimeout\(READ_MS\);/.test(readFileSync(new URL("./browser/app-speed.mjs", import.meta.url), "utf8")), true);

console.log("\n--- 4d. 道具箱の最初の読み込みを軽くする ---");
{
  const stamp = JSON.parse(await read("src/widget/dist/stamp.json"));
  const first = ["comments-widget.js", ...stamp.preload];
  const withZod = [];
  for (const name of first) if ((await read(`src/widget/dist/${name}`)).includes("ZodError")) withZod.push(name);
  ok("入力の確かめの部品（zod）を、道具箱の最初の読み込みに入れない（スライドの設定・書き出し・編集の部品が連れてくる）", withZod, []);
  const WIDGET_ENTRY = await read("src/widget/comments/comments.ts");
  ok("図の元の文は、書き出しの部品を通さずに控える", WIDGET_ENTRY.includes('keepMermaidSource } from "../../lib/html/mermaid-source"'), true);
  ok("本文の書き出しは使うときに読む（入口を置いたら手が空いたときに先に読む）", /import\("\.\.\/\.\.\/lib\/pages\/markdown"\)/.test(await read("src/widget/reading/page-export.ts")) && !/^import \{ pageToMarkdown \}/m.test(await read("src/widget/reading/page-export.ts")), true);
  ok("スライドの公開の補足を並べる部品は、スライドのページでだけ読む", /import\("\.\.\/\.\.\/lib\/deck\/edit\/customization-dom"\)/.test(await read("src/widget/comments/anchor.ts")) && !/^import \{ ensureDeckPublicSupplements \}/m.test(await read("src/widget/comments/anchor.ts")), true);
}

console.log("\n--- 5. 合格ラインと測る場面 ---");
for (const [name, budget] of [["目標", TARGET], ["CI の歯止め", GUARD]]) {
  ok(`${name}: すべての場面に線がある`, SCENES.filter((scene) => !budget[scene]), []);
  ok(`${name}: 測らない場面が混ざっていない`, Object.keys(budget).filter((scene) => !SCENES.includes(scene)), []);
}
ok("歯止めは目標より厳しくしない（同じ項目を持ち、目標以上の値）", SCENES.every((scene) => Object.keys(TARGET[scene]).every((key) => GUARD[scene]?.[key] >= TARGET[scene][key])), true);
// 直す前（2026-10-08・同じ条件の CI の台）の数。絶対の線はこれを必ず捕まえる（緩めすぎて見逃さない）
const BEFORE = { "home-open": { shown: 2880 }, "library-open": { shown: 2770 }, "to-library": { shown: 2660 }, "to-home": { shown: 2810 }, "back-home": { shown: 3080 } };
ok("絶対の線は、直す前の遅さ（2.6〜3.1 秒）を必ず捕まえる", Object.keys(BEFORE).filter((scene) => judge(BEFORE, { [scene]: GUARD[scene] }).length === 0), []);
// 画像 1 枚ごとに見てよいかを保存先へ聞いていた頃の、画像 30 枚の資料（2026-10-08・手元の Mac・同じ条件。CI の台はこれより遅い）
ok("絶対の線は、画像を 1 枚ずつ確かめていた頃の遅さ（1.85 秒）を捕まえる", judge({ "open-gallery": { shown: { median: 1851 } } }, { "open-gallery": GUARD["open-gallery"] }).length, 1);
ok("絶対の線は目標の 2.5 倍より緩めない", SCENES.every((scene) => Object.keys(TARGET[scene]).every((key) => GUARD[scene][key] <= TARGET[scene][key] * 2.5)), true);
const BASELINE = JSON.parse(readFileSync(new URL("./browser/app-speed-baseline.json", import.meta.url), "utf8"));
ok("比例の線の控えが全部の場面にある", SCENES.filter((scene) => !BASELINE.medians[scene]), []);
ok("比例の線の控えは CI の結果 2 回分以上の、項目ごとの大きいほう（たまたま速かった 1 回を控えにしない）", BASELINE.runs >= 2, true);
ok("比例の線の控えは、絶対の線の内側（控えのまま歯止めに掛からない）", judge(Object.fromEntries(Object.entries(BASELINE.medians).map(([scene, keys]) => [scene, Object.fromEntries(Object.entries(keys).map(([key, median]) => [key, { median }]))])), GUARD), []);
ok("比例の線は 1.5 倍・+150ms", RATIO, { times: 1.5, slackMs: 150 });
const one = (scene, key, median) => ({ [scene]: { [key]: { median } } });
ok("比例の線: 控えの 2 倍かつ +300ms は外れ", judgeRatio(one("to-library", "shown", 600), { "to-library": { shown: 300 } }).length, 1);
ok("比例の線: 小さい数の揺れ（50→120ms）は外れにしない", judgeRatio(one("to-home", "shown", 120), { "to-home": { shown: 50 } }).length, 0);
ok("比例の線: 1.4 倍は外れにしない", judgeRatio(one("open-document", "toolbox", 1220), { "open-document": { toolbox: 877 } }).length, 0);
ok("比例の線: 控えにある項目が測れなかったら外れ", judgeRatio({}, { "to-home": { shown: 50 } }).length, 1);
ok("比例の線: 控えは目標の項目の中央値だけを残す", baselineFrom({ "to-home": { shown: { median: 40, worst: 90 }, ttfb: { median: 5, worst: 9 } } }), { "to-home": { shown: 40 } });
const BENCH = readFileSync(new URL("./browser/app-speed.mjs", import.meta.url), "utf8");
ok("CI の既定の条件のときだけ比例の線と比べる（保存先の混み合いの条件も控えと同じとき）", /const COMPARE_RATIO = BUDGET === GUARD && DWELL_MS === 300 && DB_RTT_MS === BASELINE\.dbRttMs && DB_WORKERS === BASELINE\.dbWorkers && DB_COST_MS === BASELINE\.dbCostMs;/.test(BENCH), true);
ok("測り直しのあとも、絶対の線と比例の線の両方で判定する", (BENCH.match(/misses = (?:measureOnly \? \[\] : )?judgeAll\(summary\)/g) ?? []).length, 2);
ok("測れなかった項目は外れとして数える", judge({}, GUARD).length, Object.values(GUARD).reduce((sum, limits) => sum + Object.keys(limits).length, 0));
ok("中央値で比べる", judge(summarize({ "to-home": [{ shown: 10 }, { shown: 9999 }, { shown: 20 }] }), TARGET).some((miss) => miss.startsWith("to-home")), false);
ok("真偽の項目は回数で数える", summarize({ "back-home": [{ restored: true }, { restored: false }] })["back-home"].restored, { hits: 1, total: 2 });

if (fails > 0) {
  console.log(`\n${fails} 件の外れ`);
  process.exit(1);
}
