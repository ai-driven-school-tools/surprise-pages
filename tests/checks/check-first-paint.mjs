/**
 * 本文を描く前の待ちを外す差し込み（src/lib/first-paint/first-paint.ts・src/lib/first-paint/delivery.ts）の検査。
 *
 * 見るのは 3 つ。
 *   1. 設定の読み取りが、値だけを通し、コードを 1 つも通さないこと（サーバーで実行しない約束）
 *   2. 確かめられない形のページには手を出さないこと（今までどおり配る）
 *   3. 差し込んだあとも、道具本体が必ず読まれ、ページの設定が道具へ渡ること
 */
import { readFile } from "node:fs/promises";

import { root, dir, companyDeployment } from "./paths.mjs";
import { createRequire } from "node:module";
const { build } = await import(`${root}/node_modules/esbuild/lib/main.js`);
const requireFromRoot = createRequire(`${root}/package.json`);
const out = `${dir}/first-paint.mjs`;
const delivery = `${dir}/first-paint-delivery.mjs`;

await build({ entryPoints: [`${root}/src/lib/first-paint/first-paint.ts`], outfile: out, bundle: true, format: "esm", platform: "node", external: ["node:*"] });
await build({
  entryPoints: [`${root}/src/lib/first-paint/delivery.ts`],
  outfile: delivery,
  bundle: true,
  format: "esm",
  platform: "node",
  external: ["node:*"],
  logLevel: "silent",
  // 作り物は一時の置き場に出るので、指定を作る道具だけはリポジトリの中の実物を指させる。
  // 配信時の差し込みは会社の版で動く（個人用の配布版では閉じる）ので、束ねた中でだけ会社の版にする
  plugins: [companyDeployment, {
    name: "real-tailwind",
    setup(b) {
      b.onResolve({ filter: /^(?:tailwindcss-v3|postcss)$/ }, (args) => ({ path: requireFromRoot.resolve(args.path), external: true }));
    },
  }],
});

const { parseLiteral, tailwindPlan, withPrecompiledTailwind, withNonBlockingFonts, FIRST_PAINT_MARK } = await import(out);

let fails = 0;
const ok = (label, actual, expected) => {
  const pass = JSON.stringify(actual) === JSON.stringify(expected);
  if (!pass) fails += 1;
  console.log(`${pass ? "OK  " : "NG  "} ${label}: ${JSON.stringify(actual)}（期待: ${JSON.stringify(expected)}）`);
};

console.log("--- 1. 設定の読み取り（実行しない） ---");
ok("値だけのオブジェクトを読む", parseLiteral(`{ theme: { extend: { colors: { ads: { bg: 'rgb(var(--ads-bg) / <alpha-value>)', 'surface-2': "x" } } } }, darkMode: 'class', }`), {
  theme: { extend: { colors: { ads: { bg: "rgb(var(--ads-bg) / <alpha-value>)", "surface-2": "x" } } } },
  darkMode: "class",
});
ok("注釈・配列・数・真偽・末尾の ; を読む", parseLiteral(`/* a */ { a: [1, -2.5, true, null,], // b\n b: "c" };`), { a: [1, -2.5, true, null], b: "c" });
ok("引用符の逃がしを読む", parseLiteral(`{ f: ['"Noto Sans JP"', 'it\\'s'] }`), { f: ['"Noto Sans JP"', "it's"] });
for (const [label, source] of [
  ["関数", `{ plugins: [function () {}] }`],
  ["矢印関数", `{ a: () => 1 }`],
  ["変数", `{ a: window }`],
  ["呼び出し", `{ a: require('x') }`],
  ["テンプレート文字列", "{ a: `x` }"],
  ["展開", `{ ...a }`],
  ["計算した鍵", `{ [a]: 1 }`],
  ["式", `{ a: 1 + 1 }`],
  ["続きのコード", `{ a: 1 }; fetch('/x')`],
  ["__proto__", `{ __proto__: { a: 1 } }`],
  ["constructor", `{ a: { constructor: 1 } }`],
  ["閉じていない", `{ a: 1`],
]) ok(`値でないものは読まない（${label}）`, parseLiteral(source), undefined);
ok("長すぎる設定は読まない", parseLiteral(`{ a: "${"x".repeat(20_001)}" }`), undefined);

console.log("\n--- 2. 手を出してよいページか ---");
const TAG = '<script src="/vendor/tailwind.js/176e894661aa"></script>';
const page = (head, body = "<p class=\"text-ads-text\">本文</p>") => `<!doctype html><html><head><meta charset="utf-8">${head}</head><body>${body}</body></html>`;
const CONFIG = `<script>\n  /* 色の決まり */\n  tailwind.config = { theme: { extend: { colors: { ads: { text: 'rgb(var(--ads-text) / <alpha-value>)' } } } } }\n</script>`;

const plain = tailwindPlan(page(TAG));
ok("設定なしのページは通す", plain === null ? null : [plain.src, plain.config], ["/vendor/tailwind.js/176e894661aa", {}]);
const configured = tailwindPlan(page(TAG + CONFIG));
ok("値だけの設定があるページは通す", configured?.config, { theme: { extend: { colors: { ads: { text: "rgb(var(--ads-text) / <alpha-value>)" } } } } });
ok("JSON の入れ物は道具に触れないものとして読み飛ばす", tailwindPlan(page(`${TAG}<script type="application/json">{"tailwind":1}</script>`)) !== null, true);
for (const [label, html] of [
  ["道具が無い", page("")],
  ["外の行き先のまま（版つきなど）", page('<script src="https://cdn.tailwindcss.com/3.4.1"></script>')],
  ["道具が 2 つ", page(TAG + TAG)],
  ["defer つき", page('<script defer src="/vendor/tailwind.js/176e894661aa"></script>')],
  ["道具が body の中", page("", `${TAG}<p>本文</p>`)],
  ["独自の CSS を渡している", page(`${TAG}<style type="text/tailwindcss">.a{@apply p-2}</style>`)],
  ["plugins を使う設定", page(`${TAG}<script>tailwind.config = { plugins: [] }</script>`)],
  ["関数の入った設定", page(`${TAG}<script>tailwind.config = { theme: { x: () => 1 } }</script>`)],
  ["設定のあとに別のコード", page(`${TAG}<script>tailwind.config = { theme: {} }; document.title = 'x'</script>`)],
  ["設定をあとから書き換える", page(`${TAG}<script>tailwind.config = { theme: {} }</script><script>tailwind.config.theme.x = 1</script>`)],
  ["道具に触れる別のスクリプト", page(`${TAG}<script>console.log(window.tailwind)</script>`)],
]) ok(`手を出さない（${label}）`, tailwindPlan(html), null);

console.log("\n--- 3. 差し込みの形 ---");
const source = page(TAG + CONFIG);
const css = ".text-ads-text{color:rgb(var(--ads-text) / 1)}";
const served = withPrecompiledTailwind(source, tailwindPlan(source), css);
ok("出来上がりの指定が head に入る", served.includes(`<style ${FIRST_PAINT_MARK}>${css}</style>`), true);
ok("描画を止める script タグは残らない", served.includes(TAG), false);
ok("道具本体は必ず読む（行き先が読み込みの中に残る）", served.includes('s.src="/vendor/tailwind.js/176e894661aa"'), true);
ok("ページの設定のスクリプトは 1 字も変えない", served.includes(CONFIG), true);
ok("指定は設定のスクリプトより前", served.indexOf(`<style ${FIRST_PAINT_MARK}>`) < served.indexOf(CONFIG), true);
ok("差し込みは body の外", served.indexOf(FIRST_PAINT_MARK) < served.indexOf("<body>") && !served.slice(served.indexOf("<body>")).includes(FIRST_PAINT_MARK), true);
ok("本文は変わらない", served.slice(served.indexOf("<body>")), source.slice(source.indexOf("<body>")));
ok("</style を含む指定は入れない", withPrecompiledTailwind(source, tailwindPlan(source), "a{}</style><script>x</script>"), source);
ok("空の指定は入れない", withPrecompiledTailwind(source, tailwindPlan(source), ""), source);

// 読み込みのスクリプトを実際に動かし、設定が道具へ渡ることを確かめる
const loader = /<script data-sp-first-paint>([\s\S]*?)<\/script>/.exec(served)?.[1] ?? "";
function runLoader(order) {
  const appended = [];
  const window = {};
  const document = { createElement: () => ({}), head: { appendChild: (s) => appended.push(s) } };
  new Function("window", "document", loader)(window, document);
  const real = { config: {} };
  const config = { theme: { marker: 1 } };
  const arrive = () => { window.tailwind = real; appended[0].onload(); };
  const pageScript = () => { window.tailwind.config = config; };
  for (const step of order) (step === "arrive" ? arrive : pageScript)();
  return { src: appended[0]?.src, passed: real.config === config };
}
ok("設定が先・道具があと → 道具へ同じ設定を渡す", runLoader(["page", "arrive"]), { src: "/vendor/tailwind.js/176e894661aa", passed: true });
ok("道具が先・設定があと → ページが直に書いた設定を空で上書きしない", runLoader(["arrive", "page"]), { src: "/vendor/tailwind.js/176e894661aa", passed: true });

console.log("\n--- 4. 書体の指定 ---");
const FONT = '<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;700&display=swap" rel="stylesheet">';
const fonts = withNonBlockingFonts(page(FONT));
ok("描画を止めない読み方に付け替える", fonts.includes(`rel="stylesheet" media="print" onload="this.media='all'" ${FIRST_PAINT_MARK}>`), true);
ok("スクリプトが動かない相手には元のタグを残す", fonts.includes(`<noscript>${FONT}</noscript>`), true);
ok("2 回通しても増えない", withNonBlockingFonts(fonts), fonts);
for (const [label, tag] of [
  ["display=swap が無い", '<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP" rel="stylesheet">'],
  ["media を書いてある", '<link href="https://fonts.googleapis.com/css2?family=A&display=swap" rel="stylesheet" media="screen">'],
  ["よその stylesheet", '<link href="https://example.com/a.css?display=swap" rel="stylesheet">'],
  ["preconnect", '<link rel="preconnect" href="https://fonts.googleapis.com">'],
]) ok(`触らない（${label}）`, withNonBlockingFonts(page(tag)), page(tag));
ok("body の中の指定は触らない", withNonBlockingFonts(page("", FONT)), page("", FONT));

console.log("\n--- 5. 指定を実際に作る（ブラウザの道具と同じ版） ---");
const { compileTailwind, withFastFirstPaint } = await import(delivery);
const tailwindVersion = requireFromRoot("tailwindcss-v3/package.json").version;
const vendor = JSON.parse(await readFile(`${root}/vendor/stamp.json`, "utf8"));
ok("サーバーの道具とブラウザの道具は同じ版", tailwindVersion, vendor["tailwind.js"].version);

const compiled = await compileTailwind(source, tailwindPlan(source).config);
ok("使ったクラスの指定が出来る", /\.text-ads-text\{[^}]*color:\s*rgb\(var\(--ads-text\) \/ var\(--tw-text-opacity/.test((compiled ?? "").replace(/\s+/g, " ").replace(/ ?\{ ?/g, "{")), true);
ok("土台の指定（preflight）も入る", (compiled ?? "").includes("box-sizing: border-box"), true);
ok("使っていないクラスは作らない", (compiled ?? "").includes(".bg-red-500"), false);
const scripted = page(TAG, `<p>本文</p><script>document.body.classList.add("bg-red-500")</script>`);
ok("インラインのスクリプトに書かれたクラスも拾う", (await compileTailwind(scripted, {}) ?? "").includes(".bg-red-500"), true);

const real = await readFile(`${root}/tests/checks/fixtures/internal/example/hello.html`, "utf8");
ok("道具を使わないページは 1 字も変えない", await withFastFirstPaint(real, { pageId: "p", versionId: "v" }), real);
const fast = await withFastFirstPaint(page(FONT + TAG + CONFIG), { pageId: "p", versionId: "v2" });
ok("通しで: 指定が入り、書体も付け替わる", [fast.includes(`<style ${FIRST_PAINT_MARK}>`), fast.includes('media="print"'), fast.includes(TAG)], [true, true, false]);
const deck = page(FONT + TAG).replace("<body>", "<body data-deck>");
ok("スライドには手を出さない", await withFastFirstPaint(deck, { pageId: "p", versionId: "v" }), deck);
// 動画（HTML 動画）は配布版に無いので、動画の見分けの確かめも無い

console.log("\n--- 6. 保存される本文への焼き付き ---");
const check = `${dir}/html-check.mjs`;
await build({ entryPoints: [`${root}/src/lib/html/check.ts`], outfile: check, bundle: true, format: "esm", platform: "node", external: ["node:*"], logLevel: "silent" });
const htmlCheck = await import(check);
const base = page(TAG + CONFIG);
const added = htmlCheck.addedIssues(htmlCheck.findHtmlIssues(base), htmlCheck.findHtmlIssues(fast));
ok("差し込みつきの本文は保存で断る", added.some((issue) => issue.kind === "artifact" && issue.detail === "firstPaint"), true);
ok("断りの文言がある", htmlCheck.describeIssues(added).includes("先に作った見た目の指定"), true);

console.log(fails === 0 ? "\n全部 OK" : `\nNG ${fails} 件`);
process.exit(fails === 0 ? 0 : 1);
