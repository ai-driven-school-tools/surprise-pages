/**
 * ページ配信の控え（配信網・ブラウザ・実行環境）が、1 か所の決まりから
 * 出ているか、更新したら落ちるかを確かめる。
 *
 * 速くするために公開を配信網へ載せる。載せる以上、直したあとに古い紙が
 * 残らないことと、社内の中身が同じ経路に乗らないことが同じくらい大事。
 * 入口ごとに Cache-Control を書き比べると、片方だけ長く持たせた日に
 * 公開をやめても見え続ける／社内が素で読める、が起きる。
 *
 * ここで見るのは 6 つ。
 *   1. 控えの値が 1 か所に集まっているか
 *   2. 社内は配信網に載せないか
 *   3. 公開は札付きで、切り替えたページだけ短いか
 *   4. 入口が値を書き写さず、正本の部品を呼んでいるか
 *   5. 直したら落とす／温める口が投稿と同じ道に付いているか
 *   6. 部品そのものが、言っている通りに動くか
 *
 * 保管庫にも配信網にも繋がない。値と呼び出しと、組み立てた関数を見る。
 */
import { readFile } from "node:fs/promises";

import { root, dir, companyDeployment } from "./paths.mjs";
const { build } = await import(`${root}/node_modules/esbuild/lib/main.js`);

const read = (path) => readFile(`${root}/${path}`, "utf8");
const strip = (text) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");

const CACHE = strip(await read("src/lib/pages/cache.ts"));
const CONTENT = strip(await read("src/lib/pages/content.ts"));
const STORE = strip(await read("src/lib/pages/store.ts"));
const PUBLIC_ROUTE = strip(await read("src/app/public/[...slug]/route.ts"));
const INTERNAL_ROUTE = strip(await read("src/lib/pages/private-page.ts"));
const ACCESS_ROUTE = strip(await read("src/app/api/pages/access/route.ts"));

let fails = 0;
const ok = (label, actual, expected) => {
  const pass = String(actual) === String(expected);
  if (!pass) fails += 1;
  console.log(`${pass ? "OK  " : "NG  "} ${label}: ${actual}（期待: ${expected}）`);
};

const quoted = (code, name) => new RegExp(`${name} =\\s*"([^"]+)"`).exec(code)?.[1] ?? "";

// ---------------------------------------------------------------------------
console.log("--- 1. 控えの値は 1 か所 ---");

ok("公開本文の控えが正本にある", /export const PUBLIC_PAGE_CACHE =/.test(CACHE), true);
ok("切り替えた本文の控えが正本にある", /export const SWITCHED_PAGE_CACHE =/.test(CACHE), true);
ok("社内本文の控えが正本にある", /export const INTERNAL_PAGE_CACHE =/.test(CACHE), true);
ok("制限つき本文の控えが正本にある", /export const RESTRICTED_PAGE_CACHE =/.test(CACHE), true);
ok("入口は公開の値を書き写していない", /s-maxage=86400/.test(PUBLIC_ROUTE), false);
ok("入口は切り替えの値を書き写していない", /s-maxage=60/.test(PUBLIC_ROUTE), false);
ok("入口は社内の値を書き写していない", /private, no-cache/.test(INTERNAL_ROUTE), false);
ok("入口は制限つきの値を書き写していない", /private, no-store/.test(INTERNAL_ROUTE), false);

// ---------------------------------------------------------------------------
console.log("\n--- 2. 社内は配信網に載せない ---");

const internalPage = quoted(CACHE, "INTERNAL_PAGE_CACHE");
const restrictedPage = quoted(CACHE, "RESTRICTED_PAGE_CACHE");
const internalAsset = quoted(CACHE, "INTERNAL_ASSET_CACHE");
const restrictedAsset = quoted(CACHE, "RESTRICTED_ASSET_CACHE");

ok("社内本文は private", internalPage.includes("private"), true);
ok("社内本文に public が無い", internalPage.includes("public"), false);
ok("社内本文に s-maxage が無い", internalPage.includes("s-maxage"), false);
ok("社内本文は使う前に照合する", internalPage.includes("no-cache"), true);
ok("制限つき本文は残さない", restrictedPage, "private, no-store, max-age=0");
ok("社内素材は private", internalAsset.includes("private"), true);
ok("社内素材に s-maxage が無い", internalAsset.includes("s-maxage"), false);
ok("不変のスライド画像は長く残す", quoted(CACHE, "IMMUTABLE_DECK_MEDIA_CACHE"), "private, max-age=31536000, immutable");
ok("社内の素材経路は不変画像の控えを通す", (INTERNAL_ROUTE.match(/cacheControlForDeckMedia\(/g) ?? []).length >= 2, true);
ok("制限つき素材は残さない", restrictedAsset, "private, no-store, max-age=0");
ok("社内の経路に s-maxage を書いていない", /s-maxage/.test(INTERNAL_ROUTE), false);
ok("社内の応答に札を付けない（pageId は null）", (INTERNAL_ROUTE.match(/pageId: null/g) ?? []).length >= 2, true);

// ---------------------------------------------------------------------------
console.log("\n--- 3. 公開は札付きで長く、切り替えだけ短い ---");

const publicPage = quoted(CACHE, "PUBLIC_PAGE_CACHE");
const switchedPage = quoted(CACHE, "SWITCHED_PAGE_CACHE");
const publicAsset = quoted(CACHE, "PUBLIC_ASSET_CACHE");
const switchedAsset = quoted(CACHE, "SWITCHED_ASSET_CACHE");

ok("公開本文は配信網に 1 日載せる", publicPage.includes("s-maxage=86400"), true);
ok("公開本文はブラウザでは照合する", publicPage.includes("max-age=0"), true);
ok("公開本文は裏で取り直せる", publicPage.includes("stale-while-revalidate"), true);
ok("切り替えた本文は 1 分", switchedPage, "public, max-age=0, s-maxage=60");
ok("切り替えた本文に古いまま配る指定が無い", switchedPage.includes("stale-while-revalidate"), false);
ok("公開素材も配信網に 1 日載せる", publicAsset.includes("s-maxage=86400"), true);
ok("切り替えた素材は 1 分", switchedAsset, "public, max-age=60, s-maxage=60");
ok("札の名前はページの目印から作る", /return `page-\$\{pageId\.toLowerCase\(\)\}`/.test(CACHE), true);
ok("公開の紙にだけ札を書く", /cacheControl\.includes\("s-maxage"\)/.test(CACHE), true);

// ---------------------------------------------------------------------------
console.log("\n--- 4. 入口は正本の部品を呼ぶ ---");

ok("公開は publicCacheControl を使う", /publicCacheControl\(/.test(PUBLIC_ROUTE), true);
ok("社内は internalCacheControl を使う", /internalCacheControl\(/.test(INTERNAL_ROUTE), true);
ok("公開は照合して 304 を返す", /ifFresh\(/.test(PUBLIC_ROUTE), true);
ok("社内も照合して 304 を返す", /ifFresh\(/.test(INTERNAL_ROUTE), true);
ok("公開は本文の控えを使う", /rememberPageHtml\(/.test(PUBLIC_ROUTE), true);
ok("社内も本文の控えを使う", /rememberPageHtml\(/.test(INTERNAL_ROUTE), true);
ok("HTML の応答は 1 つの部品", /htmlResponse\(/.test(PUBLIC_ROUTE) && /htmlResponse\(/.test(INTERNAL_ROUTE), true);
ok("素材の応答も 1 つの部品（画像の控えを引く口）", /\bimageAssetResponse\(/.test(PUBLIC_ROUTE) && /\bimageAssetResponse\(/.test(INTERNAL_ROUTE), true);
ok("公開の本文照合は道具箱の印を足す（札に書いた組織の名前の印も）", /ifFresh\(request, pageCache, gate\.page\.id, current, "html", scriptsRestricted\(mode\), widgetOrganizationStamp\(look\)\)/.test(PUBLIC_ROUTE), true);
ok("社内の本文照合は道具箱の印を足す（札に書いた組織の名前とロゴは別に照合する）", /ifFresh\(request, pageCache, null, current, "html", scriptsRestricted\(mode\), widgetOrganizationStamp\(look\)\)/.test(INTERNAL_ROUTE), true);
ok("先読みの差し込みは content が持つ", /export function withScriptPreload\(/.test(CONTENT), true);
ok("本文の応答はブロッカーが隠す id を付け替える", /withSafeAnchorIds\(/.test(CACHE), true);
ok("付け替えの部品は配信と編集の共通実装から公開する", /export \{[^}]*withSafeAnchorIds[^}]*\} from "\.\/preview"/.test(CONTENT), true);

// ---------------------------------------------------------------------------
console.log("\n--- 5. 直したら落とす ---");

ok("投稿が配信網の紙を落とす", /await dropPageDelivery\(page.id\)/.test(STORE), true);
ok("投稿が引き継いだ本文を温める", /await warmPageHtml\(page.id, versionId, html\)/.test(STORE), true);
ok("消したときも落とす", /await dropPageDelivery\(id\)/.test(STORE), true);
ok("見せ方を変えたときも落とす", /await dropPageDelivery\(target.id\)/.test(ACCESS_ROUTE), true);
ok("落とす口は 1 つ", (CACHE.match(/export async function dropPageDelivery/g) ?? []).length, 1);
ok("消すのは札ごと（dangerouslyDeleteByTag）", /dangerouslyDeleteByTag\(pageCacheTag\(pageId\)\)/.test(CACHE), true);
console.log("      ※ invalidate だと直した直後に古い紙が出る。公開をやめたときは残したら漏れる");

// ---------------------------------------------------------------------------
console.log("\n--- 6. 部品が言っている通りに動くか ---");

await build({
  entryPoints: [`${root}/src/lib/pages/cache.ts`],
  outfile: `${dir}/page-cache.mjs`,
  bundle: true,
  format: "esm",
  platform: "node",
  external: ["node:*"],
  // 札の形は会社の版で見る（個人用の配布版は実行方針の印が足され、サイトの URL も要る）。束ねた中でだけ会社の版にする
  plugins: [companyDeployment],
});
const {
  PUBLIC_PAGE_CACHE,
  SWITCHED_PAGE_CACHE,
  INTERNAL_PAGE_CACHE,
  RESTRICTED_PAGE_CACHE,
  publicCacheControl,
  internalCacheControl,
  pageCacheTag,
  pageEtag,
  etagMatches,
  ifFresh,
  rememberPageHtml,
  htmlResponse,
} = await import(`${dir}/page-cache.mjs`);

ok("公開本文の関数が定数と一致", publicCacheControl(false, "page"), PUBLIC_PAGE_CACHE);
ok("切り替えた本文の関数が定数と一致", publicCacheControl(true, "page"), SWITCHED_PAGE_CACHE);
ok("社内本文の関数が定数と一致", internalCacheControl(false, "page"), INTERNAL_PAGE_CACHE);
ok("制限つき本文の関数が定数と一致", internalCacheControl(true, "page"), RESTRICTED_PAGE_CACHE);

ok("札は小文字", pageCacheTag("AbC-123"), "page-abc-123");
ok("素材の ETag は引用符で囲む", pageEtag("AABBCC"), '"aabbcc"');
ok("本文の ETag は版と道具箱の印と額縁の印と清書の見た目の印", /^"aabbcc-[0-9a-f]{8,16}-sp5-images-1-[0-9a-f]{12}-cc-[0-9a-f]{19}"$/.test(pageEtag("AABBCC", "html")), true);
ok("本文の ETag は素材と違う", pageEtag("AABBCC", "html") === pageEtag("AABBCC"), false);
// アプリの中のブラウザに配る紙（-app）は配布版に無い。仕掛けを絞る組織の紙だけが別の札になる
ok("仕掛けを絞る組織の本文は ETag が違う", [pageEtag("AABBCC", "html", true) === pageEtag("AABBCC", "html"), pageEtag("AABBCC", "html", true).endsWith('-r"'), pageEtag("AABBCC", "asset", true)], [false, true, '"aabbcc"']);
ok("札に書いた組織の名前とロゴの印は本文の ETag に混ざり、空なら今までと同じ", [pageEtag("AABBCC", "html", false, "") === pageEtag("AABBCC", "html"), pageEtag("AABBCC", "html", false, "-o0123abcd").endsWith('-o0123abcd"'), pageEtag("AABBCC", "html", true, "-o0123abcd").endsWith('-r-o0123abcd"'), pageEtag("AABBCC", "asset", false, "-o0123abcd")].join("|"), 'true|true|true|"aabbcc"');

const req = (etag) =>
  new Request("https://example.test/public/x", { headers: etag === null ? {} : { "if-none-match": etag } });

ok("持っていないときは照合しない", etagMatches(req(null), '"aa"'), false);
ok("同じ版なら当たる", etagMatches(req('"aa"'), '"aa"'), true);
ok("違う版は外す", etagMatches(req('"bb"'), '"aa"'), false);

const fresh = ifFresh(req('"deadbeef"'), PUBLIC_PAGE_CACHE, "page-1", "DEADBEEF");
ok("同じ版は 304", fresh?.status, 304);
ok("304 に公開の控えが付く", fresh?.headers.get("cache-control"), PUBLIC_PAGE_CACHE);
ok("304 に札が付く", fresh?.headers.get("vercel-cache-tag"), "page-page-1");
ok("持っていないときは 304 にしない", ifFresh(req(null), PUBLIC_PAGE_CACHE, "page-1", "DEADBEEF"), null);
ok(
  "本文は印込みで 304",
  ifFresh(req(pageEtag("DEADBEEF", "html")), PUBLIC_PAGE_CACHE, "page-1", "DEADBEEF", "html")?.status,
  304,
);
ok(
  "古い版だけの照合では本文を 304 しない",
  ifFresh(req('"deadbeef"'), PUBLIC_PAGE_CACHE, "page-1", "DEADBEEF", "html"),
  null,
);

const served = htmlResponse("<html><head></head><body><script src=\"/vendor/tailwind.js/abcd\"></script></body></html>", {
  cacheControl: PUBLIC_PAGE_CACHE,
  pageId: "11111111-1111-1111-1111-111111111111",
  etag: "abc",
});
ok("本文は 200", served.status, 200);
ok("本文に公開の控えが付く", served.headers.get("cache-control"), PUBLIC_PAGE_CACHE);
ok("本文に札が付く", served.headers.get("vercel-cache-tag"), "page-11111111-1111-1111-1111-111111111111");
ok("本文に ETag が付く", /^"abc-[0-9a-f]{8,16}-sp5-images-1-[0-9a-f]{12}-cc-[0-9a-f]{19}"$/.test(served.headers.get("etag") ?? ""), true);
ok("本文に先読みが付く", (served.headers.get("link") ?? "").includes("/vendor/tailwind.js/abcd"), true);
ok(
  "先読みが head にも入る",
  (await served.text()).includes('rel="preload" href="/vendor/tailwind.js/abcd"'),
  true,
);

const rewritten = htmlResponse(
  '<html><head><title>題</title></head><body id="ads-top" class="bg-ads-bg"><p>本文</p><button id="ads-to-top" data-ads-at-top></button></body></html>',
  { cacheControl: PUBLIC_PAGE_CACHE, pageId: null, etag: null },
);
const rewrittenHtml = await rewritten.text();
ok("配信 HTML に旧 body id が残らない", rewrittenHtml.includes('id="ads-top"'), false);
ok("配信 HTML の body は新しい id", /<body id="sp-top"/.test(rewrittenHtml), true);
ok("戻るボタンも新しい id", rewrittenHtml.includes('id="sp-to-top"'), true);
ok("色トークン用のクラスは残る", rewrittenHtml.includes("bg-ads-bg"), true);
ok("隠す印は残る", rewrittenHtml.includes("data-ads-at-top"), true);

const first = await rememberPageHtml("p1", "v1", async () => "本文A");
const second = await rememberPageHtml("p1", "v1", async () => "本文B");
ok("初回は取り寄せ", first, "本文A");
ok("2 回目は控え（取り寄せない）", second, "本文A");
const other = await rememberPageHtml("p1", "v2", async () => "本文C");
ok("版が違えば取り寄せ直す", other, "本文C");

console.log(`\n${fails === 0 ? "すべて合格" : `${fails} 件 不合格`}`);
process.exit(fails === 0 ? 0 : 1);
