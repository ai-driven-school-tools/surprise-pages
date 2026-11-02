/**
 * コメント機能の部品を「縮めて・名前に印を入れて・長く持たせる」仕掛けを確かめる。
 *
 * 全ページが読み込む 1 本なので、ここが壊れると全ページのコメントが黙って死ぬ。
 * とくに危ないのは **差し込む行き先と、配る側が受け付ける行き先がずれる**こと。
 * 片方だけ直しても手元では気づけない（手元は同じ 1 本を読むだけで済んでしまう）ので、
 * ここでは文字列を書き写さずに、
 *
 *   1. 本文に実際に差し込ませて、そこから行き先を取り出し
 *   2. app 以下を歩いて「部品を配っている受け口」を見つけ、その受け持ち範囲と突き合わせ
 *   3. 見つけた受け口を本当に呼んで、返ってきた指定を見る
 *
 * という順で、両側を実物どうしで突き合わせる。行き先の形を片方だけ変えたら、ここで落ちる。
 */
import { mkdirSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname } from "node:path";

import { root, dir } from "./paths.mjs";

const { build } = await import(`${root}/node_modules/esbuild/lib/main.js`);
const { stampOf, buildWidget, chunkPrefix, WIDGET_FILE, STAMP_FILE } = await import(`${root}/scripts/build/widget.mjs`);

// 配る側は「いまいる場所」から部品のファイルを数える。検査のときも同じ場所から数えさせる
process.chdir(root);

const ok = (label, actual, expected) =>
  console.log(`${String(actual) === String(expected) ? "OK  " : "NG  "} ${label}: ${actual}（期待: ${expected}）`);

// ---------------------------------------------------------------- 材料をそろえる

await build({
  entryPoints: [`${root}/src/lib/pages/content.ts`],
  outfile: `${dir}/wc-content.mjs`,
  bundle: true,
  format: "esm",
  platform: "node",
  external: ["node:*"],
});
const { withCommentsWidget, COMMENTS_WIDGET_STAMP, COMMENTS_WIDGET_BASE } = await import(
  `${dir}/wc-content.mjs`
);

const shipped = readFileSync(WIDGET_FILE);
const stampFile = JSON.parse(readFileSync(STAMP_FILE, "utf8"));

/** 本文に実際に差し込ませて、そこから行き先を取り出す（文字列を書き写さない）。 */
const served = withCommentsWidget("<html><body><p>本文</p></body></html>");
const injected = /<script[^>]+src="([^"]+)"/.exec(served)?.[1] ?? "";

console.log("\n--- 縮めて作っているか ---");

// 同じ設定で「縮めない版」を作り、配っているものと見比べる
// 分けた部品の名前（中身の印）が入口に書かれるので、配っているものと同じ名前（comments-widget.js）で別の置き場に作る
mkdirSync(`${dir}/plain`, { recursive: true });
mkdirSync(`${dir}/rebuilt`, { recursive: true });
const plain = await buildWidget({ outfile: `${dir}/plain/comments-widget.js`, minify: false });
const ratio = shipped.length / plain.length;
ok("縮めない版より小さい", shipped.length < plain.length, true);
ok("縮めない版の 8 割以下", ratio <= 0.8, true);
console.log(
  `     （縮めない ${(plain.length / 1024).toFixed(1)} KB → 配っている ${(shipped.length / 1024).toFixed(1)} KB・${Math.round(ratio * 100)}%）`,
);
// 縮めた印: 折り返しと字下げが落ちている（残る改行は文字列の中のものだけ）
const lines = (value) => value.toString("utf8").split("\n").length;
ok("行数が縮めない版の半分未満", lines(shipped) < lines(plain) / 2, true);
// ソースマップは出さない決め（出すなら配る行き先も要る）
ok("ソースマップの案内を付けていない", shipped.toString("utf8").includes("sourceMappingURL"), false);

console.log("\n--- 印が中身から決まるか ---");

ok("書き出した印と、いまの中身の印が同じ", stampFile.stamp, stampOf(shipped));
const rebuilt = await buildWidget({ outfile: `${dir}/rebuilt/comments-widget.js` });
ok("同じ原本を組み立て直しても中身と印が変わらない", rebuilt.equals(shipped), true);
ok("差し込む側も同じ印を見ている", COMMENTS_WIDGET_STAMP, stampFile.stamp);
ok("中身が変われば印も変わる", stampOf("あ") === stampOf("い"), false);
ok("中身が同じなら印も同じ", stampOf("あ") === stampOf("あ"), true);
ok("印は URL に出せる短い文字だけ", /^[0-9a-f]{8,16}$/.test(stampFile.stamp), true);

console.log("\n--- 差し込む行き先と、配る受け口が一致するか ---");

/** app 以下を歩いて、部品を配っている受け口（route.ts）を探す。 */
function findWidgetRoutes(from, segments = []) {
  const found = [];
  for (const name of readdirSync(from).sort()) {
    const full = `${from}/${name}`;
    if (statSync(full).isDirectory()) {
      // 束ね用の括弧つきフォルダは URL に出ない
      found.push(...findWidgetRoutes(full, name.startsWith("(") ? segments : [...segments, name]));
    } else if (name === "route.ts" && readFileSync(full, "utf8").includes("comments-widget.js")) {
      found.push({ file: full, segments });
    }
  }
  return found;
}

/** 受け口の受け持ち範囲に、この行き先が入るか。入るなら受け取る値を返す。 */
function matchRoute(segments, wanted) {
  const params = {};
  let at = 0;
  for (let i = 0; i < segments.length; i += 1) {
    const segment = segments[i];
    const optionalRest = /^\[\[\.\.\.(.+)\]\]$/.exec(segment);
    const rest = /^\[\.\.\.(.+)\]$/.exec(segment);
    const one = /^\[(.+)\]$/.exec(segment);
    if (optionalRest !== null || rest !== null) {
      const taken = wanted.slice(at);
      if (rest !== null && taken.length === 0) return null;
      if (i !== segments.length - 1) return null;
      const key = (optionalRest ?? rest)[1];
      if (taken.length > 0) params[key] = taken;
      return params;
    }
    if (one !== null) {
      if (at >= wanted.length) return null;
      params[one[1]] = wanted[at];
      at += 1;
      continue;
    }
    if (wanted[at] !== segment) return null;
    at += 1;
  }
  return at === wanted.length ? params : null;
}

const routes = findWidgetRoutes(`${root}/src/app`);
ok("部品を配っている受け口はちょうど 1 つ", routes.length, 1);

const route = routes[0];
const toSegments = (href) => href.split("/").filter((part) => part.length > 0);
const injectedParams = route === undefined ? null : matchRoute(route.segments, toSegments(injected));
const legacyParams = route === undefined ? null : matchRoute(route.segments, toSegments(COMMENTS_WIDGET_BASE));

ok("差し込む行き先が 1 つ取り出せる", injected.length > 0, true);
ok("差し込む行き先に印が入っている", injected.includes(COMMENTS_WIDGET_STAMP), true);
ok("差し込む行き先が受け口の受け持ちに入る", injectedParams !== null, true);
ok("古い名前も同じ受け口の受け持ちに入る", legacyParams !== null, true);
ok("行き先はスラッシュ始まり（<base> に引きずられない）", injected.startsWith("/"), true);

console.log("\n--- 配るときの持たせ方 ---");

await build({
  entryPoints: [route.file],
  outfile: `${dir}/wc-route.mjs`,
  bundle: true,
  format: "esm",
  platform: "node",
  external: ["node:*"],
  alias: { "@": `${root}/src` },
});
const { GET } = await import(`${dir}/wc-route.mjs`);

const call = async (href, params) =>
  GET(new Request(`https://example.test${href}`), { params: Promise.resolve(params ?? {}) });

const stamped = await call(injected, injectedParams);
const legacy = await call(COMMENTS_WIDGET_BASE, legacyParams);
const wrong = await call(`${COMMENTS_WIDGET_BASE}/deadbeef0000`, { stamp: ["deadbeef0000"] });

const cache = (response) => response.headers.get("cache-control") ?? "";
const maxAge = (response) => Number(/max-age=(\d+)/.exec(cache(response))?.[1] ?? -1);

ok("印つき: 配れる", stamped.status, 200);
ok("印つき: 中身が配っているものと同じ", (await stamped.clone().text()) === shipped.toString("utf8"), true);
ok("印つき: 1 年以上持たせる", maxAge(stamped) >= 31536000, true);
ok("印つき: immutable が付く", cache(stamped).includes("immutable"), true);
ok("印つき: public（配信網に載る）", cache(stamped).includes("public"), true);
ok("印つき: JavaScript として配る", stamped.headers.get("content-type")?.includes("javascript"), true);
ok("印つき: 中身の当てずっぽうを禁じる", stamped.headers.get("x-content-type-options"), "nosniff");

ok("古い名前: いまも配れる", legacy.status, 200);
// 入口は分けた部品を自分の行き先からの相対で読むので、古い名前では入口そのものを返さず、今の印の入口を読みに行かせる
ok("古い名前: 今の印の入口を読みに行かせる", (await legacy.clone().text()).trim(), `import(${JSON.stringify(injected)});`);
ok("古い名前: 持たせるのは 1 時間まで", maxAge(legacy) > 0 && maxAge(legacy) <= 3600, true);
ok("古い名前: immutable は付けない", cache(legacy).includes("immutable"), false);

ok("印違い: 黙って死なせず配る", wrong.status, 200);
ok("印違い: 長期に焼き付けない", cache(wrong).includes("immutable"), false);

console.log("\n--- 分けた部品 ---");
const chunkNames = readdirSync(dirname(WIDGET_FILE)).filter((name) => name.startsWith(chunkPrefix()));
const entryText = shipped.toString("utf8");
ok("分けた部品がある（スライドの直接編集の部品は入口に入れない）", chunkNames.length >= 1, true);
ok("入口は分けた部品を同じ階層の相対で読む", chunkNames.every((name) => !entryText.includes(name) || entryText.includes(`./${name}`)), true);
ok("入口は 1MB 未満（記事を読むだけの人に、スライド編集の部品を送らない）", shipped.length < 1024 * 1024, true);
const firstChunk = chunkNames[0];
const chunk = await call(`${COMMENTS_WIDGET_BASE}/${firstChunk}`, { stamp: [firstChunk] });
ok("分けた部品: 配れる", chunk.status, 200);
ok("分けた部品: 中身が組み立てたものと同じ", (await chunk.clone().text()) === readFileSync(`${dirname(WIDGET_FILE)}/${firstChunk}`, "utf8"), true);
ok("分けた部品: 名前に中身の印が入るので 1 年持たせる", cache(chunk).includes("immutable") && maxAge(chunk) >= 31536000, true);
const stale = await call(`${COMMENTS_WIDGET_BASE}/comments-widget-chunk-ZZZZZZZZ.js`, { stamp: ["comments-widget-chunk-ZZZZZZZZ.js"] });
ok("前の版の部品: 中身の違うものを返さずに断る", [stale.status, cache(stale)], [404, "no-store"]);
const traversal = await call(`${COMMENTS_WIDGET_BASE}/stamp.json`, { stamp: ["stamp.json"] });
ok("部品の形でない名前のファイルは配らない", (await traversal.clone().text()).startsWith("import("), true);

console.log("\n--- モジュールの変数に置いてよいものだけか ---");

const routeSource = readFileSync(route.file, "utf8");
const handlerAt = routeSource.indexOf("export async function GET");
const topLevel = handlerAt < 0 ? routeSource : routeSource.slice(0, handlerAt);

ok("読み込みは 1 度きり（handler の中でファイルを開かない）", /readFile/.test(routeSource.slice(handlerAt)), false);
ok("モジュールの変数に読み込んである", /^const WIDGET_SOURCE/m.test(topLevel), true);
// 利用者ごとに変わるものは、同時に走る別の要求と混ざるのでモジュールの変数に置けない
for (const forbidden of ["cookies(", "headers()", "auth(", "currentIdentity", "getSession"]) {
  ok(`利用者ごとに変わるものを持ち込まない（${forbidden}）`, topLevel.includes(forbidden), false);
}
ok("同時に走ることへの釘刺しが書いてある", /全員に同じもの/.test(routeSource), true);
ok("Fluid Compute の注意が書いてある", /Fluid Compute/.test(routeSource), true);
