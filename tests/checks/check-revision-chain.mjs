/**
 * 版の目印が「数珠つなぎ」になっていることを確かめる。
 *
 * git を使っていた間は、履歴が後から書き換えられていないことを git が見てくれていた。
 * 保管庫（Supabase）に移すと、その番人が居なくなる。代わりを務めるのが版の目印で、
 * **1 つ前の版の目印も材料に混ぜて**作ってあるので、途中の 1 枚を差し替えると
 * その先の目印が全部合わなくなる。
 *
 * ここで見るのは 4 つ。
 *   1. 同じ材料なら必ず同じ目印（＝後から計算し直して突き合わせられる）
 *   2. 材料のどれを変えても目印が変わる（＝黙って書き換えられない）
 *   3. 親の目印だけ変えても目印が変わる（＝連鎖している）
 *   4. 目印の形が git のコミット sha と同じ 40 桁（＝既存の URL がそのまま生きる）
 *
 * 実際に呼んで確かめる。式を書き写して比べると、写し間違いに気づけない。
 */
import { root, dir } from "./paths.mjs";
const { build } = await import(`${root}/node_modules/esbuild/lib/main.js`);

await build({
  entryPoints: [`${root}/src/lib/revisions/version-id.ts`],
  outfile: `${dir}/version-id.mjs`,
  bundle: true,
  format: "esm",
  platform: "node",
  external: ["node:*"],
});
const { computeVersionId, isVersionId, VERSION_ID_LENGTH } = await import(
  `${dir}/version-id.mjs`
);

let fails = 0;
const ok = (label, actual, expected) => {
  const pass = String(actual) === String(expected);
  if (!pass) fails += 1;
  console.log(`${pass ? "OK  " : "NG  "} ${label}: ${actual}（期待: ${expected}）`);
};

/** 版 1 つぶんの材料。ここから 1 つずつ変えて、目印が動くかを見る。 */
const seed = {
  parentVersionId: "1111111111111111111111111111111111111111",
  pageSlug: "internal/example/hello",
  versionNumber: 2,
  authorEmail: "owner@example.com",
  createdAt: "2026-08-10T01:02:03.000Z",
  html: "<!doctype html><html><head><title>ごあいさつ</title></head><body><p>こんにちは。</p></body></html>",
};

const base = computeVersionId(seed);

// ---------------------------------------------------------------------------
console.log("--- 1. 同じ材料なら同じ目印（あとから突き合わせられる）---");
ok("2 回計算しても同じ", computeVersionId(seed), base);
ok("材料の並べ方を変えて渡しても同じ", computeVersionId({ ...seed }), base);
console.log(`      目印: ${base}`);

// ---------------------------------------------------------------------------
console.log("\n--- 2. 形は git のコミット sha と同じ（既存の URL がそのまま生きる）---");
ok("桁数", base.length, 40);
ok("桁数は部品側の決めと一致", base.length, VERSION_ID_LENGTH);
ok("16 進の小文字だけ", /^[0-9a-f]+$/.test(base), true);
ok("大文字が混ざっていない", /[A-Z]/.test(base), false);
ok("短縮表示（先頭 7 桁）が取れる", base.slice(0, 7).length, 7);
ok("版の指定として通る形", isVersionId(base), true);

// ---------------------------------------------------------------------------
console.log("\n--- 3. 材料を 1 つ変えると目印が変わる（黙って書き換えられない）---");
const variants = [
  ["本文を 1 文字だけ変える", { html: seed.html.replace("こんにちは。", "こんにちは！") }],
  ["本文の末尾に空白を足す", { html: `${seed.html} ` }],
  ["親の目印を変える", { parentVersionId: "2222222222222222222222222222222222222222" }],
  ["親を消す（最初の版に見せかける）", { parentVersionId: null }],
  ["版番号を変える", { versionNumber: 3 }],
  ["書いた人を変える", { authorEmail: "someone@example.com" }],
  ["時刻を 1 ミリ秒ずらす", { createdAt: "2026-08-10T01:02:03.001Z" }],
  ["呼び名を変える", { pageSlug: "public/example/hello" }],
];

const seen = new Map([[base, "元の材料"]]);
for (const [label, patch] of variants) {
  const changed = computeVersionId({ ...seed, ...patch });
  ok(label, changed === base, false);
  const already = seen.get(changed);
  ok(`  ${label} → 他の版と重ならない`, already ?? "重なりなし", "重なりなし");
  seen.set(changed, label);
}
ok("変えた数だけ違う目印が出た", seen.size, variants.length + 1);

// ---------------------------------------------------------------------------
console.log("\n--- 4. 連鎖しているので、途中の 1 枚だけ差し替えられない ---");
// 3 つ続けて積んだ版。真ん中を書き換えると、その先が合わなくなることを見る
function chain(bodies, { rewriteAt = -1, rewritten = "" } = {}) {
  const ids = [];
  let parent = null;
  for (let i = 0; i < bodies.length; i += 1) {
    const html = i === rewriteAt ? rewritten : bodies[i];
    const id = computeVersionId({
      parentVersionId: parent,
      pageSlug: seed.pageSlug,
      versionNumber: i + 1,
      authorEmail: seed.authorEmail,
      createdAt: `2026-08-1${i}T00:00:00.000Z`,
      html,
    });
    ids.push(id);
    parent = id;
  }
  return ids;
}

const bodies = ["<p>1 版</p>", "<p>2 版</p>", "<p>3 版</p>"];
const honest = chain(bodies);
const tampered = chain(bodies, { rewriteAt: 1, rewritten: "<p>2 版（こっそり差し替え）</p>" });

console.log(`      正しい並び: ${honest.map((id) => id.slice(0, 7)).join(" → ")}`);
console.log(`      差し替え後: ${tampered.map((id) => id.slice(0, 7)).join(" → ")}`);
ok("1 版目は変わらない（前の版に手を入れていない）", tampered[0], honest[0]);
ok("書き換えた 2 版目の目印は変わる", tampered[1] === honest[1], false);
ok("その先の 3 版目まで巻き添えで変わる", tampered[2] === honest[2], false);
console.log("      → 途中だけ差し替えても、最後の目印が合わないので必ず表に出る");

// ---------------------------------------------------------------------------
console.log("\n--- 5. 最初の版（親が無い）も計算できる ---");
const first = computeVersionId({ ...seed, parentVersionId: null, versionNumber: 1 });
ok("計算できる", isVersionId(first), true);
ok("空文字を親として渡したときと同じ扱い", computeVersionId({ ...seed, parentVersionId: "", versionNumber: 1 }), first);

// ---------------------------------------------------------------------------
console.log("\n--- 6. 目印の形の判定（違う形を通さない）---");
const hex40 = "abcdef0123456789abcdef0123456789abcdef01";
ok("40 桁の 16 進小文字は通る", isVersionId(hex40), true);
ok("39 桁は通さない", isVersionId(hex40.slice(0, 39)), false);
ok("41 桁は通さない", isVersionId(`${hex40}a`), false);
ok("大文字は通さない", isVersionId(hex40.toUpperCase()), false);
ok("16 進でない文字は通さない", isVersionId(`${hex40.slice(0, 39)}g`), false);
ok("空文字は通さない", isVersionId(""), false);
ok("文字列でないものは通さない", isVersionId(1234), false);
ok("null は通さない", isVersionId(null), false);
ok("前後に空白が付いていたら通さない", isVersionId(` ${hex40} `), false);

// ---------------------------------------------------------------------------
console.log("\n--- 7. 材料の境目をずらしても、別の組み合わせと同じ目印にならない ---");
/**
 * 材料は項目ごとに「バイト数 + 中身」で並べてある（`8:internal` の形）。
 *
 * 区切り文字（改行など）でつなぐ形だと、隣り合う 2 つの間で中身を寄せるだけで
 * 材料がそっくり同じに化ける（`a` と `b\nc` の組は、`a\nb` と `c` の組と
 * どちらも `a\nb\nc`）。つまり**違う版に同じ目印が付く**。
 * ここでは旧い形（模型）と並べて、いまの形では別になることを見る。
 */
const items = (one) => [
  one.parentVersionId ?? "",
  one.pageSlug,
  String(one.versionNumber),
  one.authorEmail,
  one.createdAt,
  one.html,
];
/** 旧: 区切り文字でつないでいた形。比べるためだけに残した模型。 */
const glued = (one) => items(one).join("\n");

/**
 * 隣り合う 2 つの項目の間で、切れ目だけをずらした 2 通りを作る。
 * 旧い形（区切り文字でつなぐ）では、この 2 通りは同じ材料に化ける。
 */
const straddle = (first, second, head, mid, tail) => [
  { ...seed, [first]: head, [second]: `${mid}\n${tail}` },
  { ...seed, [first]: `${head}\n${mid}`, [second]: tail },
];

const PARENT = "1111111111111111111111111111111111111111";
const shifted = [
  [
    "親の目印と呼び名の切れ目をまたぐ",
    straddle("parentVersionId", "pageSlug", PARENT, "internal", "reports"),
    true,
  ],
  [
    "投稿者と時刻の切れ目をまたぐ",
    straddle("authorEmail", "createdAt", "mako", "example.com", "2026-08-10T01:02:03.000Z"),
    true,
  ],
  [
    "時刻と本文の切れ目をまたぐ",
    straddle("createdAt", "html", "2026-08-10T01:02:03.000Z", "<p>ほんぶん</p>", "<p>つづき</p>"),
    true,
  ],
  [
    // すべての入れ方が旧い形でも化けるわけではない、という念のための 1 本
    "呼び名の中に版番号の並びを埋め込む",
    [
      { ...seed, pageSlug: "internal/reports", versionNumber: 2 },
      { ...seed, pageSlug: "internal/reports\n2", versionNumber: 2 },
    ],
    false,
  ],
];

for (const [label, [a, b], gluedClashes] of shifted) {
  ok(`旧（区切り文字）: 材料が同じに化ける — ${label}`, glued(a) === glued(b), gluedClashes);
  ok(`いまの形: 目印は別になる — ${label}`, computeVersionId(a) === computeVersionId(b), false);
}

console.log("\n   境目をずらす値を総当たりで入れて、目印が 1 つも重ならないか");
// 「区切り文字」「長さの書き方に見える文字」「隣の項目の並び」を混ぜた断片
const pieces = ["", "x", "\n", "\n2\n", "x\n2\n", "a\nb", "5:", "0:"];
const combos = [];
for (const head of pieces) for (const tail of pieces) combos.push([head, tail]);
const mixed = ([head, tail]) => ({
  ...seed,
  pageSlug: `internal/${head}`,
  versionNumber: 2,
  authorEmail: tail,
});

ok("組み合わせの数", combos.length, pieces.length * pieces.length);
ok(
  "旧（区切り文字）では材料が重なる組み合わせがあった",
  new Set(combos.map((combo) => glued(mixed(combo)))).size < combos.length,
  true,
);
ok(
  "いまの形は 1 つも重ならない",
  new Set(combos.map((combo) => computeVersionId(mixed(combo)))).size,
  combos.length,
);

console.log(`\n${fails === 0 ? "すべて合格" : `${fails} 件 不合格`}`);
