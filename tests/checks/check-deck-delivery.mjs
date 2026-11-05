/**
 * スライドの配信で、動画の静止画を後回しにするか（src/lib/deck/delivery.ts）を確かめる。
 *
 * 見るのは 4 つ。
 *   1. 3 枚目以降の動画の静止画だけを data-deck-poster へ退避し、属性の値・script の中の字は触らないか
 *   2. いまの実行部を抱えていない資料（前に配った実行部・独自の部品）は 1 文字も変えないか。2 度通しても同じか
 *   3. 実行部（src/templates/deck.html）が同じ字で静止画を戻すか（近い枚から・少しずつ全部・印刷の前）
 *   4. 招待した人だけ（/internal/）と門なし公開（/public/）の配信がこれを通すか
 *
 * 保管庫にもネットワークにも繋がない。
 */
import { readFile } from "node:fs/promises";
import { root, dir } from "./paths.mjs";
const { build } = await import(`${root}/node_modules/esbuild/lib/main.js`);

const read = (path) => readFile(`${root}/${path}`, "utf8");
let fails = 0;
const ok = (label, actual, expected) => {
  const pass = String(actual) === String(expected);
  if (!pass) fails += 1;
  console.log(`${pass ? "OK  " : "NG  "} ${label}: ${String(actual).slice(0, 200)}（期待: ${String(expected).slice(0, 200)}）`);
};

await build({
  stdin: { contents: "export * from './src/lib/deck/delivery';export {navigationRuntime} from './src/lib/deck/preview.generated';", resolveDir: root },
  outfile: `${dir}/deck-delivery.mjs`,
  bundle: true,
  format: "esm",
  platform: "node",
  external: ["node:*"],
});
const { withDeferredPosters, DECK_POSTER, navigationRuntime } = await import(`${dir}/deck-delivery.mjs`);

const deck = (slides, runtime = navigationRuntime) =>
  `<!doctype html><html><head><meta charset="utf-8"><title>資料</title></head><body data-deck><main data-deck-slides>${slides}</main>${runtime}</body></html>`;
const slides = (bodies) => bodies.map((body) => `<section data-deck-slide>${body}</section>`).join("");

console.log("\n--- 1. 3 枚目以降の静止画だけを退避する ---");
const media = withDeferredPosters(deck(slides([
  '<video src="a.mp4" poster="a.jpg"></video>',
  '<video src="b.mp4" poster="b.jpg"></video>',
  '<video src="c.mp4" poster="c.jpg" title=" poster=x"></video><script type="application/json">{"t":"<video poster=\\"s.jpg\\">"}</script>',
  '<section><video poster="d.jpg"></video></section>',
])));
ok("1 枚目の静止画は残す", media.includes('<video src="a.mp4" poster="a.jpg">'), true);
ok("2 枚目の静止画も残す", media.includes('<video src="b.mp4" poster="b.jpg">'), true);
ok("3 枚目の静止画は退避する（属性の値の字は触らない）", media.includes(`<video src="c.mp4" ${DECK_POSTER}="c.jpg" title=" poster=x">`), true);
ok("script の中の字は触らない", media.includes('{"t":"<video poster=\\"s.jpg\\">"}'), true);
ok("枚の中の入れ子の section の動画も退避する", media.includes(`<video ${DECK_POSTER}="d.jpg">`), true);
ok("2 度通しても同じ", withDeferredPosters(media), media);
ok("枚が 2 枚までなら触らない", withDeferredPosters(deck(slides(['<p>A</p>', '<video poster="p.jpg"></video>']))).includes('<video poster="p.jpg">'), true);

console.log("\n--- 2. 戻せない資料は変えない ---");
const legacy = deck(slides(['<p>A</p>', '<p>B</p>', '<video poster="p.jpg"></video>']), "<script>var WIDTH = 1280; /* data-deck-ready 前の版 */</script>");
ok("前に配った実行部の資料は 1 文字も変えない", withDeferredPosters(legacy), legacy);
const custom = deck(slides(['<p>A</p>', '<p>B</p>', '<video poster="p.jpg"></video>']), navigationRuntime.replace("var WIDTH = 1280;", "var WIDTH = 1200;"));
ok("実行部を書き換えた資料も変えない", withDeferredPosters(custom), custom);
const article = `<!doctype html><html><body><main data-deck-slides>${slides(['<p>A</p>', '<p>B</p>', '<video poster="p.jpg"></video>'])}</main>${navigationRuntime}</body></html>`;
ok("スライドでない資料は変えない", withDeferredPosters(article), article);
const broken = deck(`${slides(['<p>A</p>', '<p>B</p>'])}<section data-deck-slide><video poster="p.jpg"></video>`);
ok("枚の入れ子が閉じない資料は変えない", withDeferredPosters(broken), broken);

console.log("\n--- 3. 実行部が同じ字で戻す ---");
const runtime = await read("src/templates/deck.html");
ok("実行部が同じ置き場の名前を読む", runtime.includes(`video.getAttribute("${DECK_POSTER}")`) && runtime.includes(`video[${DECK_POSTER}]`), true);
ok("近い枚（いまの枚と次の枚）から戻す", /var keep = want\.indexOf\(at \+ 1\) >= 0;\s*if \(keep\) restorePosters\(frame\);/.test(runtime), true);
ok("読む人を待たせない間に少しずつ全部戻す", /window\.setTimeout\(drainPosters, \d+\)/.test(runtime), true);
ok("印刷の前に全部戻す", runtime.includes('window.addEventListener("beforeprint", restoreAllPosters);'), true);
ok("編集の画面ではすぐに全部戻す", /function restoreAllImages\(\) \{[\s\S]{0,300}restoreAllPosters\(\);/.test(runtime), true);
ok("配る実行部（組み立て済み）にも入っている", navigationRuntime.includes("function restorePosters(frame)"), true);

console.log("\n--- 4. 配信が通す ---");
const internal = await read("src/lib/pages/private-page.ts");
const shared = await read("src/app/public/[...slug]/route.ts");
ok("招待した人だけの配信が通す（いまの版）", /withDeferredPosters\(withPageIcon\(withOgTags\(withAssetBase\(withCleanCopyLook\(html\), here\)/.test(internal), true);
ok("門なし公開の配信が通す（ノートを取り除いたあと）", /const html = withCleanCopyLook\(withoutDeckNotes\(stored\)\);/.test(shared) && /withDeferredPosters\(withPageIcon\(\s*withOgTags\(\s*withAssetBase\(html, here\)/.test(shared), true);

console.log(`\n${fails === 0 ? "すべて通りました" : `${fails} 件が通りませんでした`}`);
process.exitCode = fails === 0 ? 0 : 1;
