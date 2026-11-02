/**
 * スライド（deck）の共有カードの絵（src/lib/deck/card/card.ts・src/lib/deck/card/card-image.ts・src/app/api/og）が、
 * 決まりどおりに組まれているか。
 *
 *   1. URL の読み方（`#7` を枚と読む・コメントの深いリンクは読まない）
 *   2. 枚の切り出しと見出し（script の中の雛形に惑わされない・枚数を超えた番号の丸め）
 *   3. 絵の在り処の組み立て（版の目印で控えを分ける・1 枚目には slide を付けない・文字を載せる口にしない）
 *   4. 入口（src/app/api/og）の作り（門は今までどおり・スライドだけ描く・描けなければ文字のカードへ落ちる・控えの長さ）
 *   5. 描く側（src/lib/deck/card/card-image.ts）の作り（文書はネットワークへ出さない・読む表示で撮る・操作の列を隠す・
 *      Vercel では写した Chromium と書体・落ちたら null）
 *   6. 入口（公開ページの配信）の結び（この版には Slack の見出しが無い）
 *   7. 組み立て（scripts/build/deck-card.mjs・next.config.ts・package.json・.gitignore）
 *
 * ブラウザは起こさない（起こすのは tests/checks/browser/deck-card-image.mjs）。
 */
import { readFile } from "node:fs/promises";

import { dir, root } from "./paths.mjs";

const { build } = await import(`${root}/node_modules/esbuild/lib/main.js`);

const read = (path) => readFile(`${root}/${path}`, "utf8");
const strip = (text) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");

let failed = 0;
const ok = (label, actual, expected) => {
  const good = actual === expected;
  if (!good) failed += 1;
  console.log(`${good ? "OK  " : "NG  "} ${label}: ${actual}（期待: ${expected}）`);
};

await build({
  entryPoints: [`${root}/src/lib/deck/card/card.ts`],
  outdir: dir,
  entryNames: "deck-card-[name]",
  outExtension: { ".js": ".mjs" },
  bundle: true,
  format: "esm",
  platform: "node",
  external: ["node:*"],
});
const { clampDeckSlide, deckCardImageUrl, deckSlideFromUrl, deckSlideHeading, deckSlideHtmls, deckSlideNote, deckSlideParam, DECK_CARD_SIZE } =
  await import(`${dir}/deck-card-card.mjs`);

const OG = strip(await read("src/app/api/og/route.tsx"));
const IMAGE = strip(await read("src/lib/deck/card/card-image.ts"));
const CARD = strip(await read("src/lib/deck/card/card.ts"));
const ROUTE_P = strip(await read("src/app/public/[...slug]/route.ts"));
const NEXT_CONFIG = await read("next.config.ts");
const PACKAGE = await read("package.json");
const GITIGNORE = await read(".gitignore");
const BUILD = await read("scripts/build/deck-card.mjs");
const AGENTS = await read("AGENTS.md");
const QUALITY = await read(".github/workflows/quality.yml");

// ---------------------------------------------------------------------------
console.log("--- 1. URL の読み方 ---");
const HERE = "https://pages.example.com";
ok("`#7` は 7 枚目", deckSlideFromUrl(`${HERE}/internal/decks/x#7`), 7);
ok("公開の URL でも同じ", deckSlideFromUrl(`${HERE}/public/decks/x#12`), 12);
ok("ハッシュが無ければ null", deckSlideFromUrl(`${HERE}/internal/decks/x`), null);
ok("コメントの深いリンクは枚ではない", deckSlideFromUrl(`${HERE}/internal/decks/x#c=0f3b2d1a-1111-2222-3333-444444444444`), null);
ok("見出しへのリンクは枚ではない", deckSlideFromUrl(`${HERE}/internal/decks/x#summary`), null);
ok("`#0` は枚として読まない（枚は 1 から）", deckSlideFromUrl(`${HERE}/internal/decks/x#0`), null);
ok("`#07` も 7 枚目（実行部と同じ読み方）", deckSlideFromUrl(`${HERE}/internal/decks/x#07`), 7);
ok("URL として読めなければ null", deckSlideFromUrl("これは URL ではない"), null);
ok("入口の `?slide=3`", deckSlideParam("3"), 3);
ok("入口の形違いは null", deckSlideParam("3; drop"), null);
ok("入口の 0 は null", deckSlideParam("0"), null);
ok("入口の無指定は null", deckSlideParam(null), null);

// ---------------------------------------------------------------------------
console.log("\n--- 2. 枚の切り出しと見出し ---");
const deck = (sections) =>
  `<html><head><title>題</title></head><body data-deck><main data-deck-slides>${sections}</main>
<script>var tmpl = '<section data-deck-slide data-deck-id="x"><h2>雛形</h2></section>'; var only = "</section>";</script>
<!-- 1 枚ごとに <section data-deck-slide> を書く --></body></html>`;
const three = deck(
  `<section data-deck-slide><h1>表紙</h1><p>副題</p></section>` +
    `<section data-deck-slide><section class="inner"><p>入れ子の素の section</p></section><h2>二枚目の見出し</h2></section>` +
    `<section data-deck-slide data-deck-skip="true"><p>見出しの無い枚。最初の行が見出しの代わり</p><aside data-deck-notes>メモ</aside></section>`,
);
const slides = deckSlideHtmls(three);
ok("枚の数（script の雛形と注釈の字面は数えない）", slides.length, 3);
ok("1 枚目の切り出し", slides[0], `<section data-deck-slide><h1>表紙</h1><p>副題</p></section>`);
ok("枚の中の素の section は対応する閉じまで含める", slides[1]?.endsWith("<h2>二枚目の見出し</h2></section>"), true);
ok("1 枚目の見出し", deckSlideHeading(slides[0]), "表紙");
ok("2 枚目の見出し（入れ子の中の p より h2 を採る）", deckSlideHeading(slides[1]), "二枚目の見出し");
ok("見出しの無い枚は最初の行", deckSlideHeading(slides[2]), "見出しの無い枚。最初の行が見出しの代わり");
ok("空の枚は null", deckSlideHeading(`<section data-deck-slide></section>`), null);
ok("長い見出しは末尾を「…」", deckSlideHeading(`<section data-deck-slide><h1>${"あ".repeat(80)}</h1></section>`)?.length, 60);
ok("枚が無い本文は空", deckSlideHtmls(`<html><body data-deck><main data-deck-slides></main></body></html>`).length, 0);
ok("枚数を超えた番号は最後の枚へ", clampDeckSlide(99, 3), 3);
ok("0 以下は 1 枚目へ", clampDeckSlide(0, 3), 1);
ok("枚が無ければ 1", clampDeckSlide(5, 0), 1);
ok("1 行の言い方", deckSlideNote(7, "次の一手"), "7枚目 — 次の一手");
ok("見出しが無いときの 1 行", deckSlideNote(7, null), "7枚目");

const FIXTURE = await read("tests/checks/fixtures/internal/example/deck-format-catalog.html");
ok("実行部の雛形を script に持つ見本でも、枚が全部取れる", deckSlideHtmls(FIXTURE).length, 63);

// ---------------------------------------------------------------------------
console.log("\n--- 3. 絵の在り処 ---");
const V = "a".repeat(40);
ok("版の目印で控えを分ける", deckCardImageUrl(HERE, "internal/decks/x", V, null), `${HERE}/api/og?page=internal%2Fdecks%2Fx&v=${V}`);
ok("枚を指すときだけ slide を付ける", deckCardImageUrl(HERE, "public/guide", V, 7), `${HERE}/api/og?page=public%2Fguide&v=${V}&slide=7`);
ok("1 枚目には slide を付けない（同じ絵に 2 つの在り処を作らない）", deckCardImageUrl(HERE, "public/guide", V, 1), `${HERE}/api/og?page=public%2Fguide&v=${V}`);
ok("版の目印が無ければ付けない", deckCardImageUrl(HERE, "public/guide", null, null), `${HERE}/api/og?page=public%2Fguide`);
ok("版の目印の形が違えば付けない", deckCardImageUrl(HERE, "public/guide", "latest", null), `${HERE}/api/og?page=public%2Fguide`);
ok("絵の寸法は枚の構図そのもの", JSON.stringify(DECK_CARD_SIZE), JSON.stringify({ width: 1280, height: 720 }));
ok("絵の在り処に文字を載せる口が無い", /title=|text=|summary=/.test(CARD.slice(CARD.indexOf("export function deckCardImageUrl"))), false);

// ---------------------------------------------------------------------------
console.log("\n--- 4. 入口（src/app/api/og）---");
ok("門は今までどおり名乗っていない人として通す", /openPage\(organization, null, page\.slug\)/.test(OG), true);
ok("公開ページ以外は今までどおり 404", /!gate\.ok \|\| gate\.page\.visibility !== "public"/.test(OG), true);
ok("スライドのときだけ描く", /isDeckHtml\(html\)/.test(OG), true);
ok("描くのはメモを取り除いた本文（1 度だけ通す）", (OG.match(/withoutDeckNotes\(/g) ?? []).length, 1);
ok("枚の指定は入口の読み方で受ける", /deckSlideParam\(params\.get\("slide"\)\) \?\? 1/.test(OG), true);
ok("描けなければ文字のカードへ落ちる", OG.indexOf("renderDeckSlideImage(") < OG.indexOf("new ImageResponse(<Card"), true);
ok("素材の宛先は呼び名から組む（URL の頭から組まない）", /pageHref: `\$\{origin\}\/public\/\$\{ref\.slug\.join\("\/"\)\}`/.test(OG), true);
ok("控えの長さは素材と同じ決まり（切り替えでやめられるページは短く）", /publicCacheControl\(ref\.slugPrefix === "internal", "asset"\)/.test(OG), true);
ok("ブラウザを起こす時間を見込む", /export const maxDuration = 60;/.test(OG), true);
ok("絵は PNG", /"content-type": "image\/png"/.test(OG), true);

// ---------------------------------------------------------------------------
console.log("\n--- 5. 描く側（src/lib/deck/card/card-image.ts）---");
ok("文書そのものは保管庫の本文で応える（配信網へ出ない）", /route\.fulfill\(\{ status: 200, contentType: "text\/html; charset=utf-8", body \}\)/.test(IMAGE), true);
ok("別の文書への移動は断る", /req\.isNavigationRequest\(\)[\s\S]{0,300}return route\.abort\(\);/.test(IMAGE), true);
ok("素材は自分の宛先と https だけ", /url\.origin === origin \|\| url\.protocol === "https:"/.test(IMAGE), true);
ok("配信と同じ差し込みを通す", /deckSourcePreview\(html, pageHref\)/.test(IMAGE), true);
ok("器の幅を 1280 に固定して倍率 1 で撮る", /main\[\$\{DECK_SLIDES\}\] \{ width: \$\{DECK_CARD_SIZE\.width\}px !important/.test(IMAGE), true);
ok("操作の列と終える釦を隠す", /\[\$\{DECK_TOOLBAR\}\], \[\$\{DECK_EXIT\}\] \{ display: none !important; \}/.test(IMAGE), true);
ok("発表の表示にはしない（段階をたどって 1 段目しか出ない）", /data-deck-mode/.test(IMAGE), false);
ok("明るい側で描く", /colorScheme: "light"/.test(IMAGE), true);
ok("動きは止めて撮る", /reducedMotion: "reduce"/.test(IMAGE) && /animations: "disabled"/.test(IMAGE), true);
ok("書体・描画完了・図・画像の 4 つを待つ", /document\.fonts\.ready/.test(IMAGE) && /whenDrawn/.test(IMAGE) && /data-processed/.test(IMAGE) && /img\.complete/.test(IMAGE), true);
ok("待ちには予算がある", /export const RENDER_BUDGET_MS = 12_000;/.test(IMAGE), true);
ok("Vercel では写した Chromium を起こす", /sparticuz\.executablePath\(path\.join\(runtimeDir\(\), "bin"\)\)/.test(IMAGE), true);
ok("書体は Chromium の展開のあとに写す", IMAGE.indexOf("sparticuz.executablePath(") < IMAGE.indexOf("await installFonts();"), true);
ok("Vercel かどうかは台帳にある印で見る", /process\.env\.VERCEL_REGION \|\| process\.env\.VERCEL_DEPLOYMENT_ID/.test(IMAGE), true);
ok("同時に描く数に上限がある", /const MAX_CONCURRENT = 2;/.test(IMAGE), true);
ok("失敗しても投げない（null を返す）", /catch \(error\) \{\n\s*if \(error instanceof RenderTimeout\) await discardBrowser\(\);\n\s*logEvent\(\{ level: "warn", event: "deck-card\.render-failed", error \}\);\n\s*return null;/.test(IMAGE), true);
ok("1 枚ぶん全体に時間の上限がある（入口の時間切れより短い）", /export const TOTAL_BUDGET_MS = 30_000;/.test(IMAGE) && /withTimeout\(render\(request\), TOTAL_BUDGET_MS, "render"\)/.test(IMAGE), true);
ok("黙ったブラウザは開く呼び出しを時間で区切って起こし直す", /withTimeout\(browser\.newContext\(options\), OPEN_TIMEOUT_MS, "context"\)/.test(IMAGE) && /await discardBrowser\(\);\n\s*if \(attempt >= 1\) throw error;/.test(IMAGE), true);
ok("ログは共通の関数だけ", /console\./.test(IMAGE), false);

// ---------------------------------------------------------------------------
console.log("\n--- 6. 入口の結び ---");
ok("公開ページの配信の絵の在り処も同じ部品（版の目印つき）", /deckCardImageUrl\(sharedOrigin, gate\.page\.pageSlug, gate\.page\.currentVersionId, null\)/.test(ROUTE_P), true);

// ---------------------------------------------------------------------------
console.log("\n--- 7. 組み立て ---");
ok("組み立ての前に Chromium と書体を写す（dev）", /"dev": "[^"]*node scripts\/build\/deck-card\.mjs && next dev"/.test(PACKAGE), true);
ok("組み立ての前に Chromium と書体を写す（build）", /"build": "[^"]*node scripts\/build\/deck-card\.mjs && next build/.test(PACKAGE), true);
ok("写したものは git に入れない", /^\/\.deck-card-runtime\/$/m.test(GITIGNORE), true);
ok("写したものを入口の関数に同梱する", /"\/api\/og": \["\.\/\.deck-card-runtime\/\*\*\/\*", /.test(NEXT_CONFIG), true);
ok("Playwright の本体も丸ごと同梱する（browsers.json を読み込み時に動的に読む）", /"\.\/node_modules\/\.pnpm\/playwright-core@\*\/node_modules\/playwright-core\/\*\*\/\*"\]/.test(NEXT_CONFIG), true);
ok("ブラウザの部品はまとめ直さない", /"playwright",\s*"playwright-core",\s*"@sparticuz\/chromium",/.test(NEXT_CONFIG), true);
ok("書体は vendor の正本（manifest）から戻す", /vendor\/deck-fonts\/manifest\.json/.test(BUILD), true);
ok("組み立てで外から取りに行かない", /https?:\/\//.test(strip(BUILD)), false);
ok("戻す書体はゴシックと明朝の 2 つ", /const FONT_IDS = \["noto-sans-jp", "noto-serif-jp"\];/.test(BUILD), true);
ok("CI でも本物のブラウザで描く", /node tests\/checks\/browser\/deck-card-image\.mjs/.test(QUALITY), true);
ok("決まりが AGENTS.md にある", /src\/lib\/deck\/card\/card-image\.ts/.test(AGENTS), true);

console.log(`\n${failed === 0 ? "すべて合格" : `${failed} 件 不合格`}`);
if (failed > 0) process.exit(1);
