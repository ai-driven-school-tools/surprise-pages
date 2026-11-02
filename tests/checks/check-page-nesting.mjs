/**
 * ページの名前が入れ子になったときに、素材が巻き込まれないことを確かめる。
 *
 * 元の不具合: 素材の置き場所は `<見せ方>/<呼び名>/<相対パス>` という 1 本の文字列で、
 * 片付け（削除）も凍結（写し）も前方一致で数え上げている。
 * `internal/reports/2026-08-10-one-piece-elbaph` があるところへ `internal/reports`
 * というページを投稿すると、その投稿の片付けが `internal/reports/` で始まる素材を
 * 全部数え、**深い側のページの画像まで巻き込んで消す**。凍結も、他のページの素材を
 * 自分の過去の版のフォルダへ写し込む。
 *
 * 歯止めは 2 段。ここでは両方を見る。
 *   (a) 根を塞ぐ … そういう名前を投稿の入口で断る
 *   (b) 帯を締める … 片付けと凍結が、別のページの枝に手を出さない
 *
 * あわせて「中身が変わっていない投稿は版を積まない」も見る。
 * 版を入れた直後に落ちたページが、打ち直しで直る唯一の道がここ。
 *
 * 実物を組み立て直して呼ぶ。式を書き写して比べると、写し間違いに気づけない。
 */
import { createRequire } from "node:module";
import { root, dir } from "./paths.mjs";
const { build } = await import(`${root}/node_modules/esbuild/lib/main.js`);

/**
 * 部品を 1 枚組み立てて読み込む。
 *
 * cjs で組むのは、保管庫の側が next / next-auth を引き込んでいて、
 * esm にすると `__dirname` が無くて読み込めないため。判定そのものには関係ない。
 * データベースへの接ぎ口は呼ばない（つなぎに行かない純粋な判定だけを見る）。
 */
const require2 = createRequire(import.meta.url);
async function load(name) {
  const outfile = `${dir}/${name.replaceAll("/", "-")}.cjs`;
  await build({
    entryPoints: [`${root}/src/lib/${name}.ts`],
    outfile,
    bundle: true,
    format: "cjs",
    platform: "node",
    external: ["node:*"],
  });
  return require2(outfile);
}

const { ancestorPageSlugs, collidingSlug, shouldStackRevision, slugConflictMessage } =
  await load("pages/store");
const { archivePrefix, assetPrefix, outsideNestedBranches } = await load("pages/assets");

let fails = 0;
const ok = (label, actual, expected) => {
  const pass = String(actual) === String(expected);
  if (!pass) fails += 1;
  console.log(`${pass ? "OK  " : "NG  "} ${label}: ${actual}（期待: ${expected}）`);
};

// 素材の置き場は組織の頭から始まる。最初の組織は頭が空なので、置き場所の形は今までと同じ
const ORGANIZATION = { id: "00000000-0000-4000-8000-000000000001", assetPrefix: "" };
const DEEP = "internal/reports/2026-08-10-one-piece-elbaph";
const SHALLOW = "internal/reports";

// ---------------------------------------------------------------------------
console.log("--- 1. ぶつかる名前を見つける ---");
ok("下に別のページが住んでいる名前は断る", collidingSlug(SHALLOW, [DEEP]), DEEP);
ok("別のページの置き場所の中にある名前も断る", collidingSlug(DEEP, [SHALLOW]), SHALLOW);
ok("同じ名前はぶつかりではない（同じページへの投稿）", collidingSlug(DEEP, [DEEP]), null);
ok("関わりの無い名前は通す", collidingSlug(SHALLOW, ["internal/guide/intro"]), null);
ok(
  "区切りをまたがない前方一致は通す（reports と report-2 は別）",
  collidingSlug("internal/report", ["internal/reports"]),
  null,
);
ok("見せ方が違えば置き場所は分かれる", collidingSlug("public/a", ["internal/a/b"]), null);
ok("並びが空なら断らない", collidingSlug(SHALLOW, []), null);
ok(
  "消された印が立っているページも相手に数える（素材は残っている）",
  collidingSlug(SHALLOW, [DEEP]),
  DEEP,
);
ok(
  "下が何枚もあるときは 1 枚を挙げる（名前の順で先のもの）",
  collidingSlug(SHALLOW, [DEEP, "internal/reports/2025-12-01-a"]),
  "internal/reports/2025-12-01-a",
);
ok(
  "上が何枚もあるときは近いほうを挙げる（直す相手が分かりやすい）",
  collidingSlug("internal/a/b/c", ["internal/a", "internal/a/b"]),
  "internal/a/b",
);

// ---------------------------------------------------------------------------
console.log("\n--- 2. 上に来うる名前の候補（深い順）---");
ok("3 段なら 2 枚", ancestorPageSlugs("internal/a/b/c").join(" > "), "internal/a/b > internal/a");
ok("2 段なら 1 枚", ancestorPageSlugs("internal/a/b").join(" > "), "internal/a");
ok("1 段なら無し（見せ方だけでは 1 ページぶんにならない）", ancestorPageSlugs(SHALLOW).length, 0);

// ---------------------------------------------------------------------------
console.log("\n--- 3. 断り方に「何が起きているか」と「どうすればよいか」が入る ---");
const below = slugConflictMessage(SHALLOW, DEEP);
console.log(`      ${below}`);
ok("断った名前が出る", below.includes("`reports`"), true);
ok("ぶつかった相手が出る", below.includes("2026-08-10-one-piece-elbaph"), true);
ok("理由（置き場所がぶつかる）が出る", below.includes("置き場所がぶつかります"), true);
ok("次に打つ形が出る", below.includes("reports/index"), true);
ok("見せ方（internal）は混ぜない", below.includes("internal"), false);

const above = slugConflictMessage(DEEP, SHALLOW);
console.log(`      ${above}`);
ok("上にぶつかったときも相手が出る", above.includes("`reports`"), true);
ok("上にぶつかったときも直し方が出る", above.includes("reports/index"), true);
ok("言い方は 2 通りで、同じ文にならない", below === above, false);

// ---------------------------------------------------------------------------
console.log("\n--- 4. 片付けが別のページの枝に手を出さない ---");
/**
 * 片付けの振り分けをそのまま写した模型。
 * 置き場所の作り方（assetPrefix / archivePrefix）と除け方（outsideNestedBranches）は
 * 実物をそのまま呼ぶので、片方だけ直したときにここが落ちる。
 */
function sweep(pageSlug, keep, nested, found) {
  const parts = pageSlug.split("/");
  const prefix = assetPrefix(ORGANIZATION, parts[0], parts.slice(1));
  const frozen = archivePrefix(ORGANIZATION, parts[0], parts.slice(1));
  const wanted = new Set(keep.map((rel) => `${prefix}${rel}`));
  const outside = outsideNestedBranches(ORGANIZATION, nested);
  return found.filter(
    (pathname) => !wanted.has(pathname) && !pathname.startsWith(frozen) && outside(pathname),
  );
}

const found = [
  `${SHALLOW}/index.png`,
  `${SHALLOW}/old.png`,
  `${SHALLOW}/@archive/1234567/index.png`,
  `${DEEP}/hero.png`,
  `${DEEP}/@archive/89abcde/hero.png`,
];

console.log("   歯止めが無かったとき（保管庫にあるもの全部を自分のものとして数える）");
const reckless = sweep(SHALLOW, ["index.png"], [], found);
console.log(`      消される: ${reckless.length} 件`);
ok("深いページの画像まで消えていた", reckless.some((p) => p.startsWith(`${DEEP}/`)), true);
ok("深いページの過去の版の写しまで消えていた", reckless.includes(`${DEEP}/@archive/89abcde/hero.png`), true);

console.log("\n   歯止めを入れたあと");
const stale = sweep(SHALLOW, ["index.png"], [DEEP], found);
console.log(`      消される: ${stale.join(", ") || "（無し）"}`);
ok("消すのは自分の使わない素材だけ", stale.join(","), `${SHALLOW}/old.png`);
ok("いま使う素材は残る", stale.includes(`${SHALLOW}/index.png`), false);
ok("自分の過去の版の写しは残る", stale.some((p) => p.includes("@archive")), false);
ok("深いページの画像は残る", stale.some((p) => p.startsWith(`${DEEP}/`)), false);

console.log("\n   除ける網そのもの");
const outside = outsideNestedBranches(ORGANIZATION, [DEEP]);
ok("別のページの枝に入るものは触らない", outside(`${DEEP}/hero.png`), false);
ok("自分の素材は触る", outside(`${SHALLOW}/old.png`), true);
ok("名前が途中まで同じだけのものは触る", outside(`${SHALLOW}/2026-08-10-one-piece-elbaph.png`), true);
ok("除ける相手が無ければ全部通す", outsideNestedBranches(ORGANIZATION, [])(`${DEEP}/hero.png`), true);

// ---------------------------------------------------------------------------
console.log("\n--- 5. 中身が変わっていない投稿は、新しい版を積まない ---");
const HTML = "<!doctype html><html><head><title>報告</title></head><body><p>本文</p></body></html>";
ok("1 文字も違わないなら積まない", shouldStackRevision(HTML, HTML), false);
ok("1 文字違えば積む", shouldStackRevision(HTML, HTML.replace("本文", "本文。")), true);
ok("末尾に空白が付いただけでも積む", shouldStackRevision(HTML, `${HTML} `), true);
ok("頭の版が無いなら積む（最初の版）", shouldStackRevision(null, HTML), true);
ok("空の本文どうしも同じ扱い", shouldStackRevision("", ""), false);

console.log("\n   同じものを 3 回続けて投げたときに積まれる版の数（模型）");
// 積むかどうかだけを回す。ページ側の目印の貼り替えは、積まなかった回も通す
function stack(bodies) {
  let head = null;
  let stacked = 0;
  for (const html of bodies) {
    if (shouldStackRevision(head, html)) {
      stacked += 1;
      head = html;
    }
  }
  return stacked;
}
ok("同じ本文を 3 回", stack([HTML, HTML, HTML]), 1);
ok("途中で 1 度だけ直した", stack([HTML, HTML, `${HTML}<p>追記</p>`, `${HTML}<p>追記</p>`]), 2);
ok("毎回違う本文", stack([HTML, `${HTML}a`, `${HTML}ab`]), 3);

console.log(`\n${fails === 0 ? "すべて合格" : `${fails} 件 不合格`}`);
