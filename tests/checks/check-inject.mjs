/**
 * 配信時の差し込みが、本当に `</body>` の直前に 1 回だけ入るかを確かめる。
 *
 * あわせて、**呼び名が札に書き入れられるか**も見る。ブラウザ側は URL の頭から
 * 呼び名を組み立てない（社内として投稿したページを公開に切り替えると、呼び名は
 * `internal/…` のままで URL は `/public/…` になり、頭が食い違う）。だから配信の側が
 * 必ず教える必要があり、教え忘れると道具箱が丸ごと動かなくなる。
 */
import { readFile } from "node:fs/promises";

import { root, dir, companyDeployment } from "./paths.mjs";
const { build } = await import(`${root}/node_modules/esbuild/lib/main.js`);
const out = `${dir}/content.mjs`;

await build({
  entryPoints: [`${root}/src/lib/pages/content.ts`],
  outfile: out,
  bundle: true,
  format: "esm",
  platform: "node",
  external: ["node:*"],
  // 札の形（data-edition の有無・出典の写し）は会社の版で見る。束ねた中でだけ会社の版にする
  plugins: [companyDeployment],
});

const {
  withAssetBase,
  withCommentsWidget,
  withScriptPreload,
  withSafeAnchorIds,
  scriptPreloadHeader,
  parseSourceNote,
  COMMENTS_WIDGET_SRC,
  PAGE_TOP_ID,
  PAGE_TO_TOP_ID,
} = await import(out);

let fails = 0;
const ok = (label, actual, expected) => {
  const pass = String(actual) === String(expected);
  if (!pass) fails += 1;
  console.log(`${pass ? "OK  " : "NG  "} ${label}: ${actual}（期待: ${expected}）`);
};

// 材料は検査用の写し（tests/checks/fixtures）から取る。ページの正本は保管庫にあり、
// そちらを読みに行かせると検査のたびに本番の鍵が要る
const html = await readFile(`${root}/tests/checks/fixtures/internal/example/hello.html`, "utf8");
const served = withCommentsWidget(withAssetBase(html, "/internal/example/hello"), "internal/example/hello");

// 行き先には中身の印が入る（作り直すたびに変わる）ので、文字列を書き写さずに本体から借りる
// 入口 1 本と分けた部品なので module として差し込む（scripts/build/widget.mjs）
const script = `<script type="module" src="${COMMENTS_WIDGET_SRC}" data-page="internal/example/hello" defer></script>`;

console.log("--- 1. 差し込む場所と回数 ---");
ok("script が入った回数", served.split(script).length - 1, 1);
ok("</body> より前か", served.indexOf(script) < served.indexOf("</body>"), true);
ok("2 回通しても増えないか", withCommentsWidget(served, "internal/example/hello").split(script).length - 1, 1);
ok("<base> も入っているか", served.includes('<base href="/internal/example/hello/">'), true);

console.log("\n--- 2. 呼び名を札に書き入れているか ---");
console.log("   ブラウザ側は URL から組み立てない。教え忘れると道具箱ごと動かない");
ok("札に呼び名が入る", /data-page="internal\/example\/hello"/.test(served), true);

/*
 * 公開に切り替えたページ。URL は `/public/…` だが呼び名は `internal/…` のまま。
 * 札に入るのは**呼び名**で、URL の頭ではない。
 */
const switched = withCommentsWidget(
  withAssetBase(html, "/public/example/hello"),
  "internal/example/hello",
);
ok("公開の入口から配っても、札は呼び名のまま", /data-page="internal\/example\/hello"/.test(switched), true);
ok("URL の頭に引きずられない", /data-page="public\//.test(switched), false);
ok("相対パスの基準は URL のほう", switched.includes('<base href="/public/example/hello/">'), true);
console.log("      ※ 素材は /public/… から読む（棚は配信側が持ち主の呼び名で決める）");

const asPublic = withCommentsWidget(withAssetBase(html, "/public/guide/intro"), "public/guide/intro");
ok("公開として投稿したページはそのまま", /data-page="public\/guide\/intro"/.test(asPublic), true);

// 録音から作ったページの札（data-recordings）は配布版に無い（録音の機能ごと外した）
ok("札に録音の印を書かない", /data-recordings/.test(served), false);

console.log("\n--- 4. git 出典を札に写しているか ---");
console.log("   道具箱は本文を掻かずに札を見る。写し忘れると取り込みの入口が消える");

const withSource =
  html.replace(
    "</body>",
    `<p data-source-note data-source-repo="example-org/handbook" data-source-path="docs/ops.md" data-source-commit="a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0" data-source-committed-at="2026-09-06T18:21:00+09:00">docs/ops.md</p></body>`,
  );
const sourced = withCommentsWidget(withAssetBase(withSource, "/internal/example/hello"), "internal/example/hello");
ok("repo が札に載る", /data-source-repo="example-org\/handbook"/.test(sourced), true);
ok("path が札に載る", /data-source-path="docs\/ops.md"/.test(sourced), true);
ok("commit が札に載る", /data-source-commit="a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0"/.test(sourced), true);
ok("出典の無い見本には載せない", /data-source-repo=/.test(served), false);

const parsed = parseSourceNote(withSource);
ok("出典を本文から拾える", parsed !== null && parsed.repo === "example-org/handbook" && parsed.path === "docs/ops.md", true);
ok("commit が無い行は出典にしない", parseSourceNote('<p data-source-note data-source-path="docs/ops.md">x</p>') === null, true);
ok(".. のパスは捨てる", parseSourceNote('<p data-source-note data-source-repo="a/b" data-source-path="../x" data-source-commit="aaaaaaaa">x</p>') === null, true);

console.log("\n--- 5. 道具の先読み ---");
const VENDOR_SAMPLE = "/vendor/tailwind.js/abcd";
const withTool = served.replace("</head>", `<script src="${VENDOR_SAMPLE}"></script></head>`);
const preloaded = withScriptPreload(withTool);
ok("描画を止める道具の先読みが入る", preloaded.includes(`rel="preload" href="${VENDOR_SAMPLE}"`), true);
ok("2 回通しても増えないか", withScriptPreload(preloaded).split(`rel="preload" href="${VENDOR_SAMPLE}"`).length - 1, 1);
ok(
  "応答の頭にも同じ行き先が付く",
  (scriptPreloadHeader(preloaded) ?? "").includes(`<${VENDOR_SAMPLE}>; rel=preload; as=script`),
  true,
);
// defer の部品を先読みすると、描画を止めている道具と回線を取り合う
ok("コメント機能の部品は先読みしない（head）", preloaded.includes(`rel="preload" href="${COMMENTS_WIDGET_SRC}"`), false);
ok("コメント機能の部品は先読みしない（応答の頭）", (scriptPreloadHeader(preloaded) ?? "").includes(COMMENTS_WIDGET_SRC), false);
ok("部品そのものは今までどおり差し込まれている", preloaded.includes(`src="${COMMENTS_WIDGET_SRC}"`), true);
ok("部品だけの本文には先読みを付けない", scriptPreloadHeader(served), null);
ok("道具が無い本文には先読みを付けない", scriptPreloadHeader("<html><body></body></html>"), null);

console.log("\n--- 6. ブロッカーが隠す id を付け替える ---");
console.log("   EasyList ###ads-top が body ごと消す。題名（head）だけ残る症状の本体");

const { JSDOM } = await import("jsdom");
const stored =
  "<!DOCTYPE html><html><head><title>題名は残る</title>" +
  "<style>#ads-to-top{position:fixed}#ads-to-top[data-ads-at-top]{opacity:0}</style>" +
  "</head><body id=\"ads-top\" class=\"bg-ads-bg\" style=\"--ads-bg: 15 23 42\">" +
  "<p id=\"body-text\">本文が見える</p>" +
  "<button type=\"button\" id=\"ads-to-top\" data-ads-at-top>戻る</button>" +
  "<script>document.getElementById(\"ads-to-top\").onclick=()=>document.getElementById(\"ads-top\").scrollIntoView();</script>" +
  "</body></html>";
const safe = withSafeAnchorIds(stored);
ok("旧 body id が残らない", safe.includes('id="ads-top"'), false);
ok("旧 戻る id が残らない", safe.includes("ads-to-top"), false);
ok("body は新しい id", new RegExp(`<body id="${PAGE_TOP_ID}"`).test(safe), true);
ok("戻るボタンは新しい id", safe.includes(`id="${PAGE_TO_TOP_ID}"`), true);
ok("CSS の戻る先も新しい id", safe.includes(`#${PAGE_TO_TOP_ID}{position:fixed}`), true);
ok("script の戻る先も新しい id", safe.includes(`getElementById("${PAGE_TO_TOP_ID}")`), true);
ok("script の頁の頭も新しい id", safe.includes(`getElementById("${PAGE_TOP_ID}")`), true);
ok("2 回通しても結果が変わらない", withSafeAnchorIds(safe) === safe, true);
ok("何も無い本文でも落ちない", withSafeAnchorIds(""), "");
ok("色の名前は残る", safe.includes("bg-ads-bg") && safe.includes("--ads-bg"), true);
ok("隠す印は残る", safe.includes("data-ads-at-top"), true);

const blocked = new JSDOM(safe);
const easylist = blocked.window.document.createElement("style");
easylist.textContent = "#ads-top { display: none !important; }";
blocked.window.document.head.appendChild(easylist);
ok("EasyList の対象（#ads-top）はもう無い", blocked.window.document.getElementById("ads-top"), null);
ok("本文の節は残る", blocked.window.document.getElementById("body-text")?.textContent, "本文が見える");
ok("先頭へ戻るは新しい id で取れる", blocked.window.document.getElementById(PAGE_TO_TOP_ID)?.tagName, "BUTTON");
ok("頁の頭は新しい id で取れる", blocked.window.document.body.id, PAGE_TOP_ID);

const brand = await readFile(`${root}/src/lib/settings/brand.ts`, "utf8");
const exported = await readFile(`${root}/src/widget/reading/page-export.ts`, "utf8");
ok("印の正本はブロッカーが隠す id を持たない", /ads-top/.test(brand), false);
ok("書き出しは body id を見ていない", /ads-top/.test(exported), false);

console.log("\n--- 末尾 ---");
console.log(served.slice(-200));

console.log(`\n${fails === 0 ? "すべて合格" : `${fails} 件 不合格`}`);
process.exit(fails === 0 ? 0 : 1);
