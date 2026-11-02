import {createRequire} from "node:module";
const require=createRequire(import.meta.url);
/**
 * どのページも検索に載らないことを、3 枚とも生きているかで確かめる。
 *
 * 1 枚だけだと必ず穴が残る:
 *   - meta タグ … HTML を読んでもらえる相手にしか効かない（素材や API には無い）
 *   - robots.txt … 「見に来ないでほしい」という頼みでしかない
 *   - X-Robots-Tag … 応答そのものに書いてあるので一番強いが、設定を消しても誰も気づけない
 * そこで 3 枚が同時に生きていることをここで見張る。1 枚でも欠けたら不合格にする。
 */
import { readFile } from "node:fs/promises";

import { root, dir } from "./paths.mjs";
const { build } = await import(`${root}/node_modules/esbuild/lib/main.js`);

/** TypeScript のまま読めないので、その場で組み立て直して本物を呼ぶ。 */
const bundle = async (entry, name) => {
  const out = `${dir}/${name}.mjs`;
  await build({
    entryPoints: [`${root}/${entry}`],
    outfile: out,
    bundle: true,
    format: "esm",
    platform: "node",
    external: ["node:*", "next"],
    plugins:[{name:"native-workflow-config",setup(b){b.onResolve({filter:/^workflow\/next$/},()=>({path:require.resolve("workflow/next"),external:true}));b.onResolve({filter:/^@sentry\/nextjs\/config$/},()=>({path:require.resolve("@sentry/nextjs/config"),external:true}));}}],
  });
  return import(out);
};

const ok = (label, actual, expected) =>
  console.log(`${actual === expected ? "OK  " : "NG  "} ${label}: ${actual}（期待: ${expected}）`);

console.log("--- 応答の頭に付く指定（next.config.ts）---");
const loaded = (await bundle("next.config.ts", "next-config")).default;
const config=typeof loaded==="function"?await loaded("phase-production-server",{defaultConfig:{}}):loaded;
ok("headers() がある", typeof config.headers, "function");

const rules = await config.headers();
const everywhere = rules.find((rule) => rule.source === "/:path*");
ok("すべての道筋（/:path*）に指定がある", everywhere !== undefined, true);

const robotsHeader = everywhere?.headers.find((header) => header.key.toLowerCase() === "x-robots-tag");
const headerValue = robotsHeader?.value ?? "";
console.log(`      X-Robots-Tag: ${headerValue}`);
ok("X-Robots-Tag が付く", robotsHeader !== undefined, true);
ok("載せない（noindex）と書いてある", /\bnoindex\b/.test(headerValue), true);
ok("辿らない（nofollow）と書いてある", /\bnofollow\b/.test(headerValue), true);

// 既にあった設定を消していないこと（検索よけを足すついでに配信が壊れては困る）。
// ページ本体はリポジトリから保管庫へ移ったので、同梱するのはウィジェットだけになった
const included = config.outputFileTracingIncludes?.["/**/*"] ?? [];
ok("ウィジェットの同梱指定が残っている", included.includes("./src/widget/dist/*.js"), true);

console.log("\n--- ページ本体に差し込む meta（src/lib/pages/og.ts）---");
const { withOgTags, publicMetaFor } = await bundle("src/lib/pages/og.ts", "og-noindex");
const metaTagsOf = (html) => (html.match(/<meta [^>]+>/g) ?? []).join("\n");

const publicHtml =
  "<!doctype html><html><head><title>使い方ガイド</title></head>" +
  "<body><h1>使い方ガイド</h1><p>ここでは投稿のやり方を説明します。</p></body></html>";
const publicMeta = publicMetaFor(publicHtml, "https://example.com/public/guide", "https://example.com/api/og");
const publicTags = metaTagsOf(withOgTags(publicHtml, "public", publicMeta));
console.log(publicTags.replace(/^/gm, "      "));
ok("公開ページに検索よけが付く", /<meta name="robots" content="[^"]*noindex/.test(publicTags), true);
ok("公開ページに nofollow も付く", /<meta name="robots" content="[^"]*nofollow/.test(publicTags), true);

// 画像も説明も無い、いちばん素のページでも落ちないこと
const bareTags = metaTagsOf(withOgTags("<html><head></head><body>x</body></html>", "public", {
  title: null,
  description: null,
  pageUrl: "https://example.com/public/x",
  imageUrl: null,
}));
ok("素のページでも検索よけが付く", /name="robots"/.test(bareTags), true);

const internalTags = metaTagsOf(withOgTags(publicHtml, "internal"));
ok("社内ページにも検索よけが付く（従来どおり）", /name="robots"/.test(internalTags), true);

console.log("\n--- 公開ページのカードに中身を増やしていないか ---");
/*
 * 検索よけを足すついでに本文の情報が増えると、公開ページの体裁が勝手に変わる。
 * 出してよい札の名前をここに書き切っておき、見知らぬ札が増えたら気づけるようにする。
 */
const ALLOWED = new Set([
  "og:site_name",
  "og:type",
  "og:url",
  "og:title",
  "og:description",
  "og:image",
  "description",
  // 大きい札で出す指定だけ。題や絵を twitter: 側にも書かない（無ければ og を見る決まり）
  "twitter:card",
  "robots",
]);
const namesOf = (tags) =>
  (tags.match(/(?:property|name)="([^"]+)"/g) ?? []).map((hit) => hit.replace(/^[^"]+"|"$/g, ""));
const strangers = namesOf(publicTags).filter((name) => !ALLOWED.has(name));
ok("見知らぬ札が増えていない", strangers.join(", ") || "なし", "なし");

console.log("\n--- 門の紙（src/lib/access/signin-gate.ts）---");
/*
 * 名乗っていない人が社内ページを開いたときに返す紙。**取り込み役が実際に読むのはここ**
 * （ページ本体は名乗った人にしか届かない）。だからこの 1 枚に検索よけが無いと、
 * 3 枚重ねのうち meta の層が、いちばん人目に付く経路で抜ける。
 */
const { signInGatePage } = await bundle("src/lib/access/signin-gate.ts", "signin-gate-noindex");
const gate = signInGatePage({ next: "/internal/x", cardUrl: "https://example.com/api/og/locked", organization: "見本商事" });
ok("検索よけが付く", /<meta name="robots" content="noindex, nofollow">/.test(gate), true);
const gateStrangers = namesOf(metaTagsOf(gate)).filter(
  (name) => !ALLOWED.has(name) && name !== "viewport",
);
ok("見知らぬ札が増えていない", gateStrangers.join(", ") || "なし", "なし");

console.log("\n--- 一覧とログイン画面の指定（src/app/layout.tsx）---");
/*
 * ここは CSS の読み込みごと抱えているので、組み立て直さず文字として読む。
 * 見るのは metadata の宣言の中だけ（別の場所に robots と書いてあっても数えない）。
 */
const layoutCode = await readFile(`${root}/src/app/layout.tsx`, "utf8");
// 説明に要求の組織の名前を差し込むので、宣言は関数（generateMetadata）。見るのはその返す中身だけ
const metadataBlock = /export async function generateMetadata\(\): Promise<Metadata> \{([\s\S]*?)\n\}/.exec(layoutCode)?.[1] ?? "";
ok("metadata の宣言が読めた", metadataBlock.length > 0, true);
ok("robots の指定がある", /\brobots\s*:/.test(metadataBlock), true);
ok("載せない（index: false）", /index\s*:\s*false/.test(metadataBlock), true);
ok("辿らない（follow: false）", /follow\s*:\s*false/.test(metadataBlock), true);

console.log("\n--- 門前払いの札（src/app/robots.ts）---");
const robotsRoute = await bundle("src/app/robots.ts", "robots-route");
ok("既定の書き出しが関数", typeof robotsRoute.default, "function");

const result = robotsRoute.default();
const list = Array.isArray(result.rules) ? result.rules : [result.rules];
const agents = list.map((rule) => rule.userAgent);
const disallows = list.flatMap((rule) => (Array.isArray(rule.disallow) ? rule.disallow : [rule.disallow]));
const allows = list.flatMap((rule) => (rule.allow === undefined ? [] : Array.isArray(rule.allow) ? rule.allow : [rule.allow]));
console.log(`      User-Agent: ${agents.join(", ")} / Disallow: ${disallows.join(", ")}`);
ok("相手を選ばない（*）", agents.includes("*"), true);
ok("根っこから全部断る（Disallow: /）", disallows.includes("/"), true);
ok("うっかり許している道筋が無い", allows.join(", ") || "なし", "なし");
ok("道案内（sitemap）を出していない", result.sitemap, undefined);
