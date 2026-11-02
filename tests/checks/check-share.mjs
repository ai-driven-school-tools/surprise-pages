/**
 * 共有したときの見え方を確かめる。
 *
 *   1. 社内ページのカードに中身が 1 文字も乗らないか（自前の指定ごと落とすか）
 *   2. 公開ページのカードに、足りないものだけが足されるか（絵が実際に付くか）
 *   3. 印（マーク）の形が 1 つに保たれているか
 *   4. 素材 URL の割り方と、過去版の帯
 */
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";

import { root, dir } from "./paths.mjs";
import { jaText } from "./i18n-ja-text.mjs";
const { build } = await import(`${root}/node_modules/esbuild/lib/main.js`);

const read = (path) => readFile(`${root}/${path}`, "utf8");

for (const [name, file] of [["og", "pages/og"], ["content", "pages/content"], ["card-text", "pages/card-text"]]) {
  await build({
    entryPoints: [`${root}/src/lib/${file}.ts`],
    outfile: `${dir}/${name}.mjs`,
    bundle: true,
    format: "esm",
    platform: "node",
    external: ["node:*"],
  });
}

const { withOgTags, publicMetaFor } = await import(`${dir}/og.mjs`);
const { splitVersionedAsset, withPageIcon, withVersionBanner, withCommentsWidget, widgetOrganizationStamp } = await import(`${dir}/content.mjs`);
const { drawableText } = await import(`${dir}/card-text.mjs`);

const ok = (label, actual, expected) =>
  console.log(`${actual === expected ? "OK  " : "NG  "} ${label}: ${actual}（期待: ${expected}）`);

/** 差し込まれたかどうかを見るときは meta タグだけを取り出す。 */
const metaOf = (html) => (html.match(/<meta [^>]+>/g) ?? []).join("\n");

const secret = "極秘の売上見込み";
const internalHtml =
  `<!doctype html><html><head><title>${secret}レポート</title></head>` +
  `<body><h1>${secret}</h1><p>社外秘の中身です。</p></body></html>`;

const injected = metaOf(withOgTags(internalHtml, "internal", "見本商事"));

console.log("--- 社内ページのカード（差し込んだ meta タグだけ）---");
console.log(injected.replace(/^/gm, "      "));
ok("ページ名が漏れていない", injected.includes(secret), false);
ok("本文が漏れていない", injected.includes("社外秘"), false);
ok("サイト名は出る", injected.includes('content="Pages"'), true);
ok("札は「<組織> の限定ページ」で固定（差し込むのは組織の名前だけ）", injected.includes('content="見本商事 の限定ページ"'), true);
ok("組織の名前が分からなければ一般語", metaOf(withOgTags(internalHtml, "internal")).includes('content="この組織 の限定ページ"'), true);
ok("検索よけが付く", injected.includes('name="robots"'), true);
console.log("      ※ 文言の出どころは門の紙（src/lib/access/signin-gate.ts）と同じ 1 か所");
const GATE = await read("src/lib/access/signin-gate.ts");
ok("門の紙と同じ文言を読んでいる", /gateCard\(organization\)/.test(await read("src/lib/pages/og.ts")), true);
ok(
  "その文言の正本が門の紙にある（カードの札は日本語の辞書の値で固定）",
  /title: defaultTranslate\("auth\.gate\.title", params\)/.test(GATE) && jaText("auth.gate.title") === "{organization} の限定ページ",
  true,
);

console.log("\n   書いた人が自分で og を書いていても、社内では落とす");
console.log("      ※ 投稿の道具が作る HTML には本当の題名が入っている。");
console.log("        いまは未ログインに中身を返していないから漏れていないだけで、紙そのものは持っている");
const ownInternal =
  `<!doctype html><html><head><title>${secret}レポート</title>` +
  `<meta property="og:title" content="${secret}レポート">` +
  `<meta property="og:description" content="社外秘の中身です。">` +
  `<meta name="twitter:title" content="${secret}">` +
  `<meta name="description" content="社外秘の中身です。">` +
  `</head><body><h1>${secret}</h1></body></html>`;
const stripped = withOgTags(ownInternal, "internal");
ok("自前の og が残っていない", metaOf(stripped).includes(secret), false);
ok("自前の twitter も残っていない", /twitter:title/.test(metaOf(stripped)), false);
ok("札が 1 組だけになる", (metaOf(stripped).match(/og:title/g) ?? []).length, 1);
ok("ページ自身の題（タブに出る名前）は触らない", stripped.includes(`<title>${secret}レポート</title>`), true);
ok("本文も触らない", stripped.includes(`<h1>${secret}</h1>`), true);

// 念のため: 公開ページ用の作り方を社内に誤って渡しても、中身は出ない
const wrong = withOgTags(internalHtml, "internal", {
  title: `${secret}レポート`,
  description: "社外秘の中身です。",
  pageUrl: "https://example.com/internal/x",
  imageUrl: "https://example.com/api/og",
});
ok("見せ方が社内なら、渡された中身を無視する", metaOf(wrong).includes(secret), false);
ok("社内のカードに絵の在り処を載せない", /og:image/.test(metaOf(wrong)), false);
console.log("      ※ 絵は名乗り無しで取りに来る。中身から作った絵をそこに置けない");

console.log("\n--- 公開ページのカード ---");
const publicHtml =
  `<!doctype html><html><head><title>使い方ガイド</title></head>` +
  `<body><h1>使い方ガイド</h1><p>ここでは投稿のやり方を説明します。</p></body></html>`;
const meta = publicMetaFor(publicHtml, "https://example.com/public/guide", "https://example.com/api/og");
ok("ページ名を拾う", meta.title, "使い方ガイド");
ok("説明を本文から作る", meta.description, "ここでは投稿のやり方を説明します。");

const plain = withOgTags(publicHtml, "public", meta);
ok("題が付く", plain.includes('content="使い方ガイド"'), true);
ok("絵が付く", plain.includes('property="og:image" content="https://example.com/api/og"'), true);
ok("大きい札で出す", plain.includes('content="summary_large_image"'), true);
ok("宛先が付く", plain.includes('property="og:url"'), true);

console.log("\n   自分の文言は残して、足りないものだけ足す");
console.log("      ※ 以前は「1 つでも og があれば何もしない」だったので、");
console.log("        投稿の道具が作ったページには絵が 1 度も付いていなかった");
const authored =
  `<html><head><meta property="og:title" content="自前の題">` +
  `<meta property="og:description" content="自前の説明"></head><body>x</body></html>`;
const filled = withOgTags(authored, "public", meta);
ok("自前の題はそのまま", filled.includes('content="自前の題"'), true);
ok("自前の説明もそのまま", filled.includes('content="自前の説明"'), true);
ok("題を二重に足さない", (filled.match(/og:title/g) ?? []).length, 1);
ok("説明も二重に足さない", (filled.match(/og:description/g) ?? []).length, 1);
ok("それでも絵は付く", filled.includes('property="og:image"'), true);
ok("本文から作った題を混ぜていない", filled.includes("使い方ガイド"), false);
console.log("      ※ twitter: 側に題や絵を書き足さない（無ければ og を見る決まり）。");
console.log("        書き足すと、書いた人が og だけ直した日に片方だけ古い題が残る");
ok("題を twitter にも書かない", /twitter:title/.test(filled), false);
ok("絵も twitter には書かない", /twitter:image/.test(filled), false);
ok("大きい札の指定だけは足す", filled.includes('name="twitter:card"'), true);

console.log("\n   name= で書く道具の指定も、書いてあるものとして扱う");
const byName = `<html><head><meta name="og:title" content="自前の題"></head><body>x</body></html>`;
ok("同じ札を 2 枚出さない", (withOgTags(byName, "public", meta).match(/og:title/g) ?? []).length, 1);

console.log("\n   検索よけだけは、書いてあっても必ず足す");
const permissive = `<html><head><meta name="robots" content="index, follow"></head><body>x</body></html>`;
ok("緩い指定に遠慮しない", withOgTags(permissive, "public", meta).includes('content="noindex, nofollow"'), true);

console.log("\n--- 印（マーク）は 1 つの形 ---");
console.log("      ※ タブの印・ホーム画面の絵・カードの下段で同じ形を使う。座標の正本は src/lib/settings/brand.ts");
const BRAND = await read("src/lib/settings/brand.ts");
const ICON = await read("src/app/icon.svg");
const valueOf = (name) => new RegExp(`${name} = "([^"]+)"`).exec(BRAND)?.[1] ?? "（無い）";

ok("紙の形が正本にある", valueOf("MARK_SHEET_PATH") !== "（無い）", true);
ok("icon.svg も同じ紙の形", ICON.includes(valueOf("MARK_SHEET_PATH")), true);
ok("icon.svg も同じ折った角", ICON.includes(valueOf("MARK_FOLD_PATH")), true);
ok("暗い側にも対応している", ICON.includes("prefers-color-scheme: dark"), true);
ok("色は正本の墨と同じ", ICON.includes('#171717'), true);
ok("既定のロゴを置いていない", existsSync(`${root}/src/app/favicon.ico`), false);
ok("/favicon.ico は同じ 1 枚へ流す", /source: "\/favicon\.ico", destination: "\/icon\.svg"/.test(await read("next.config.ts")), true);
ok("ホーム画面の絵は正本から読む", /from "@\/lib\/settings\/brand"/.test(await read("src/app/apple-icon.tsx")), true);
ok("カードの下段も正本から読む", /from "@\/lib\/settings\/brand"/.test(await read("src/app/api/og/card.tsx")), true);

console.log("\n   配信するページにも印を差し込む（自前の指定があるときは触らない）");
const bare = "<html><head><title>x</title></head><body>y</body></html>";
ok("印が無ければ入る", withPageIcon(bare).includes('<link rel="icon" href="/icon.svg">'), true);
const owned = '<html><head><link rel="icon" href="data:image/svg+xml,x"></head><body>y</body></html>';
ok("自前の印があれば触らない", withPageIcon(owned) === owned, true);
const appleOnly = '<html><head><link rel="apple-touch-icon" href="x.png"></head><body>y</body></html>';
ok("ホーム画面用だけなら入る", withPageIcon(appleOnly).includes('rel="icon" href="/icon.svg"'), true);
ok("印を 2 つ入れない", (withPageIcon(bare).match(/rel="icon"/g) ?? []).length, 1);
for (const path of ["src/lib/pages/private-page.ts", "src/app/public/[...slug]/route.ts"]) {
  ok(`  配信が印を通す: ${path}`, /withPageIcon\(/.test(await read(path)), true);
}

console.log("\n--- カードの絵に載せる字 ---");
console.log("      ※ 取り寄せられない記号は黙って「□」になる。描ける形へ寄せてから絵にする");
ok("罫線の連なりは 1 本のダッシュ", drawableText("止まる問題 ── 原因"), "止まる問題 — 原因");
ok("縦の罫線は縦棒", drawableText("採用｜2026年8月"), "採用|2026年8月");
ok("全角チルダは波ダッシュ", drawableText("9月～10月"), "9月〜10月");
ok("二重矢印は矢印", drawableText("案A⇒案B"), "案A→案B");
ok("チェックは描ける側の字", drawableText("✓済み"), "✔済み");
ok("飾りの星は落として間を詰める", drawableText("★ 重要 ★ 会議"), "重要 会議");
ok("日本語はそのまま", drawableText("恵比寿3F 座席表"), "恵比寿3F 座席表");
ok("描ける記号には触らない", drawableText("A — B ・ C → D ※ E"), "A — B ・ C → D ※ E");

const CARD = await read("src/app/api/og/card.tsx");
ok("カードは寄せてから字数を詰める", /const text = drawableText\(value\);/.test(CARD), true);
ok("題も要約も同じ道を通る", (CARD.match(/\{fit\(/g) ?? []).length, 2);
console.log("      ※ 表を足すときは日本語に混ぜて 1 字ずつ描かせて確かめる（src/lib/pages/card-text.ts に手順）");

console.log("\n--- 素材 URL の割り方 ---");
const split = splitVersionedAsset(["report", "2026q1", "@v", "a1b2c3d", "chart.png"]);
ok("ページの部分", split?.pageSlug.join("/"), "report/2026q1");
ok("版の部分", split?.sha, "a1b2c3d");
ok("ファイルの部分", split?.rel.join("/"), "chart.png");
ok("目印なしは null", splitVersionedAsset(["report", "chart.png"]), null);
ok("先頭に目印だけは null", splitVersionedAsset(["@v", "a1b2c3d", "x.png"]), null);
ok("ファイル名が無ければ null", splitVersionedAsset(["a", "@v", "a1b2c3d"]), null);

console.log("\n--- 過去版の帯 ---");
const banner = withVersionBanner("<html><body><h1>本文</h1></body></html>", { shortSha: "a1b2c3d", number: 4 }, "/internal/x");
ok("body の直後に入る", banner.indexOf("過去の版") < banner.indexOf("<h1>"), true);
ok("最新へ戻る導線がある", banner.includes('href="/internal/x"'), true);
ok("版は何版目かで言う（現在地の行・履歴の一覧と同じ呼び方）", banner.includes("過去の版（第4版）") && !banner.includes("a1b2c3d"), true);
const unnumbered = withVersionBanner("<html><body><h1>本文</h1></body></html>", { shortSha: "a1b2c3d", number: null }, "/internal/x");
ok("番号が引けないときだけ目印の 7 桁で言う", unnumbered.includes("a1b2c3d"), true);

const nasty = withVersionBanner("<html><body>x</body></html>", { shortSha: '"><script>alert(1)</script>', number: null }, "/internal/x");
ok("危ない文字はそのまま出さない", nasty.includes("<script>alert"), false);

console.log("\n--- 道具箱の札に書く組織の名前とロゴ---");
const tagged = withCommentsWidget("<html><body><p>本文</p></body></html>", "internal/x", { name: '見本"商事<b>', logo: "/api/organization/logo?v=0123456789abcdef" });
ok("名前は escapeHtml を通して札に書く", tagged.includes('data-organization-name="見本&quot;商事&lt;b&gt;"'), true);
ok("ロゴは自分の宛先のロゴの窓口だけ書く", [tagged.includes('data-organization-logo="/api/organization/logo?v=0123456789abcdef"'), withCommentsWidget("<html><body></body></html>", "internal/x", { name: "見本商事", logo: "https://evil.example/x.png" }).includes("data-organization-logo")].join("|"), "true|false");
ok("組織を渡さない紙は今までの札のまま", withCommentsWidget("<html><body></body></html>", "internal/x").includes("data-organization"), false);
ok("照合の印: 既定の名前（名前そのまま・ロゴ無し）は今までの印のまま、名前やロゴが変われば別の印", [widgetOrganizationStamp({ name: "Pages", logo: null }), widgetOrganizationStamp(null), /^-o[0-9a-f]{8}$/.test(widgetOrganizationStamp({ name: "見本商事", logo: null })), widgetOrganizationStamp({ name: "見本商事", logo: null }) === widgetOrganizationStamp({ name: "見本商事", logo: "/api/organization/logo?v=0123456789abcdef" })].join("|"), "||true|false");
