/**
 * コメントが付いたときの文と、そのあと直された文の突き合わせを確かめる。
 *
 * 見るのは 6 つ。
 *   1. 引用した文が別の文になっていれば changed になり、いまの文が取れるか
 *   2. ページは直されても、その引用が残っていれば same のままか
 *   3. 引用した文が消えていれば gone か
 *   4. 当時の本文に引用が無ければ unknown か
 *   5. 版の目印の短い桁・赤入れとの触れ判定・返信を出さないこと
 *   6. 直した人は、いまの版ではなく引用が変わった（または無くなった）版か
 *
 * 保管庫にもネットワークにも繋がない。本文は手元の HTML で渡す。
 */
import { root, dir } from "./paths.mjs";
const { build } = await import(`${root}/node_modules/esbuild/lib/main.js`);
const out = `${dir}/outcome.mjs`;

await build({
  entryPoints: [`${root}/src/lib/comments/outcome.ts`],
  outfile: out,
  bundle: true,
  format: "esm",
  platform: "node",
  external: ["node:*"],
});
const {
  outcomeOfQuote,
  outcomesFromHtml,
  versionMarksMatch,
  commentsOnVersion,
  changeTouchesOutcome,
  isVisibleOutcome,
  versionsAfterComment,
  withChangeAttribution,
} = await import(out);

let fails = 0;
const ok = (label, actual, expected) => {
  const pass = String(actual) === String(expected);
  if (!pass) fails += 1;
  console.log(`${pass ? "OK  " : "NG  "} ${label}: ${actual}（期待: ${expected}）`);
};

const V1 = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const V2 = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const V3 = "cccccccccccccccccccccccccccccccccccccccc";
const V4 = "dddddddddddddddddddddddddddddddddddddddd";

const page = (body) =>
  `<!doctype html><html><head><title>採用</title></head><body>${body}</body></html>`;

const before = page(`
  <h1>採用のご案内</h1>
  <p>採用は通年で行っています。</p>
  <p>解約率は横ばいです。</p>
  <p>次の四半期は採用を進めます。</p>
`);

const afterChanged = page(`
  <h1>採用のご案内</h1>
  <p>採用は毎年4月から6月に行っています。</p>
  <p>解約率は横ばいです。</p>
  <p>次の四半期は採用を進めます。</p>
`);

const afterRemoved = page(`
  <h1>採用のご案内</h1>
  <p>採用は毎年4月から6月に行っています。</p>
  <p>次の四半期は採用を進めます。</p>
`);

const comment = (over) => ({
  id: "11111111-1111-1111-1111-111111111111",
  parentId: null,
  quote: "採用は通年で行っています。",
  quoteContext: { beforeText: "採用のご案内 ", afterText: " 解約率は横ばいです。" },
  pageVersion: V1,
  ...over,
});

console.log("--- 1. 引用した文が別の文になる ---");
const changed = outcomeOfQuote({
  commentId: "c1",
  quote: "採用は通年で行っています。",
  quoteContext: { beforeText: "採用のご案内 ", afterText: " 解約率は横ばいです。" },
  beforeHtml: before,
  afterHtml: afterChanged,
});
ok("状態は changed", changed.state, "changed");
ok("当時の文は引用のまま", changed.thenText, "採用は通年で行っています。");
ok(
  "いまの文に直した先が入る",
  changed.nowText !== null && changed.nowText.includes("毎年4月から6月"),
  true,
);
ok(
  "当時の文はいまに残っていない",
  changed.nowText !== null && changed.nowText.includes("通年"),
  false,
);

console.log("\n--- 2. ページは直されても、その引用は残る ---");
const same = outcomeOfQuote({
  commentId: "c2",
  quote: "解約率は横ばいです。",
  quoteContext: { beforeText: "行っています。 ", afterText: " 次の四半期は" },
  beforeHtml: before,
  afterHtml: afterChanged,
});
ok("状態は same", same.state, "same");
ok("いまの文は当時と同じ", same.nowText, "解約率は横ばいです。");

console.log("\n--- 3. 引用した文が無くなる ---");
const gone = outcomeOfQuote({
  commentId: "c3",
  quote: "解約率は横ばいです。",
  quoteContext: { beforeText: "行っています。 ", afterText: " 次の四半期は" },
  beforeHtml: before,
  afterHtml: afterRemoved,
});
ok("状態は gone", gone.state, "gone");
ok("いまの文は無い", gone.nowText, null);

console.log("\n--- 4. 当時の本文に引用が無い ---");
const unknown = outcomeOfQuote({
  commentId: "c4",
  quote: "この文はどこにもありません",
  quoteContext: null,
  beforeHtml: before,
  afterHtml: afterChanged,
});
ok("状態は unknown", unknown.state, "unknown");
ok("いまの文は無い", unknown.nowText, null);

console.log("\n--- 5. 版の目印・一覧・触れ判定 ---");
ok("同じ 40 桁は一致", versionMarksMatch(V1, V1), true);
ok("先頭 7 桁でも一致", versionMarksMatch(V1.slice(0, 7), V1), true);
ok("3 桁では一致しない", versionMarksMatch("aaa", V1), false);
ok("別の版は一致しない", versionMarksMatch(V1, V2), false);
ok("空は一致しない", versionMarksMatch(null, V1), false);

ok("changed は物語に出す", isVisibleOutcome("changed"), true);
ok("gone は物語に出す", isVisibleOutcome("gone"), true);
ok("same は出さない", isVisibleOutcome("same"), false);
ok("unknown は出さない", isVisibleOutcome("unknown"), false);

const htmlAt = new Map([
  [V1, before],
  [V2, afterChanged],
]);
const listed = outcomesFromHtml({
  comments: [
    comment({ id: "parent", pageVersion: V1 }),
    comment({
      id: "reply",
      parentId: "parent",
      quote: "採用は通年で行っています。",
      pageVersion: V1,
    }),
    comment({
      id: "current",
      quote: "採用は毎年4月から6月に行っています。",
      pageVersion: V2,
    }),
    comment({
      id: "no-quote",
      quote: null,
      pageVersion: V1,
    }),
  ],
  toVersion: V2,
  htmlAt,
});
ok("返信は出さない", listed.some((one) => one.commentId === "reply"), false);
ok("引用の無い親は出さない", listed.some((one) => one.commentId === "no-quote"), false);
ok(
  "いまの版に付いたものは same",
  listed.find((one) => one.commentId === "current")?.state,
  "same",
);
ok(
  "古い版の引用は changed",
  listed.find((one) => one.commentId === "parent")?.state,
  "changed",
);

const onV1 = commentsOnVersion(
  [comment({ id: "on-v1", pageVersion: V1 }), comment({ id: "on-v2", pageVersion: V2 })],
  V1,
);
ok("その版に付いたコメントだけ", onV1.map((one) => one.id).join(","), "on-v1");

ok(
  "消した赤入れは当時の引用に触れる",
  changeTouchesOutcome(
    { index: 1, kind: "del", text: "通年で行っています", block: false, place: "after", anchor: { head: "", tail: null, before: "", after: "" } },
    changed,
  ),
  true,
);
ok(
  "足した赤入れはいまの文に触れる",
  changeTouchesOutcome(
    { index: 2, kind: "add", text: "毎年4月から6月に行っています", block: false, place: "wrap", anchor: { head: "", tail: null, before: "", after: "" } },
    changed,
  ),
  true,
);
ok(
  "別の赤入れには触れない",
  changeTouchesOutcome(
    { index: 3, kind: "add", text: "まったく別の段落です", block: false, place: "wrap", anchor: { head: "", tail: null, before: "", after: "" } },
    changed,
  ),
  false,
);

ok("関係ない版の HTML が無くても落ちない", outcomesFromHtml({
  comments: [comment({ id: "missing", pageVersion: V3 })],
  toVersion: V2,
  htmlAt,
})[0]?.state, "unknown");

ok("突き合わせだけでは直した人が空", changed.changedBy, null);
ok("突き合わせだけでは直したときが空", changed.changedAt, null);

console.log("\n--- 6. 直した人ととき ---");
const htmlB = page(`
  <h1>採用のご案内</h1>
  <p>採用は通年で行っています。</p>
  <p>解約率は下がっています。</p>
  <p>次の四半期は採用を進めます。</p>
`);
const htmlC = page(`
  <h1>採用のご案内</h1>
  <p>採用は毎年4月から6月に行っています。</p>
  <p>解約率は下がっています。</p>
  <p>次の四半期は採用を進めます。</p>
`);
const ver = (sha, name, at) => ({
  sha,
  shortSha: sha.slice(0, 7),
  authorName: name,
  committedAt: at,
  message: "直し",
  changeCount: 1,
});
const verA = ver(V1, "作 二郎", "2026-08-01T00:00:00.000Z");
const verB = ver(V2, "別 太郎", "2026-08-10T00:00:00.000Z");
const verC = ver(V3, "直 花子", "2026-08-20T00:00:00.000Z");
const newestFirst = [verC, verB, verA];

ok(
  "当時よりあとの版だけ古い順",
  versionsAfterComment(newestFirst, V1, V3).map((one) => one.sha).join(","),
  `${V2},${V3}`,
);
ok("当時の版が一覧に無いときは空", versionsAfterComment([verC, verB], V1, V3).length, 0);

const files = new Map([
  [V1, before],
  [V2, htmlB],
  [V3, htmlC],
]);
const sourced = comment({ id: "parent", pageVersion: V1 });
const rawChanged = outcomesFromHtml({
  comments: [sourced],
  toVersion: V3,
  htmlAt: files,
});
const attributed = await withChangeAttribution({
  outcomes: rawChanged,
  comments: [sourced],
  versions: newestFirst,
  toVersion: V3,
  htmlAt: new Map(files),
  readHtml: async (sha) => files.get(sha) ?? null,
});
ok("状態は changed のまま", attributed[0]?.state, "changed");
ok("直した人は引用が変わった版", attributed[0]?.changedBy, "直 花子");
ok("別の段落を直した人ではない", attributed[0]?.changedBy === "別 太郎", false);
ok("直したときはその版の時刻", attributed[0]?.changedAt, "2026-08-20T00:00:00.000Z");

const goneFiles = new Map([
  [V1, before],
  [V2, htmlB],
  [V3, afterRemoved],
]);
const goneSourced = comment({
  id: "gone-parent",
  quote: "解約率は横ばいです。",
  quoteContext: { beforeText: "採用は通年で行っています。 ", afterText: " 次の四半期は採用を進めます。" },
});
const rawGone = outcomesFromHtml({
  comments: [goneSourced],
  toVersion: V3,
  htmlAt: goneFiles,
});
const attributedGone = await withChangeAttribution({
  outcomes: rawGone,
  comments: [goneSourced],
  versions: newestFirst,
  toVersion: V3,
  htmlAt: new Map(goneFiles),
  readHtml: async (sha) => goneFiles.get(sha) ?? null,
});
ok("無くなった状態のまま", attributedGone[0]?.state, "gone");
ok("無くした人は消した版", attributedGone[0]?.changedBy, "直 花子");
ok("先に文を直した人ではない", attributedGone[0]?.changedBy === "別 太郎", false);

const htmlAgain = page(`
  <h1>採用のご案内</h1>
  <p>採用は毎年4月から6月に行っています。期間を明記しました。</p>
  <p>解約率は横ばいです。</p>
  <p>次の四半期は採用を進めます。</p>
`);
const verD = ver(V4, "次 次郎", "2026-08-25T00:00:00.000Z");
const oscillateFiles = new Map([
  [V1, before],
  [V2, afterChanged],
  [V3, before],
  [V4, htmlAgain],
]);
const oscillateSourced = comment({ id: "oscillate", pageVersion: V1 });
const rawOscillate = outcomesFromHtml({
  comments: [oscillateSourced],
  toVersion: V4,
  htmlAt: oscillateFiles,
});
const attributedOscillate = await withChangeAttribution({
  outcomes: rawOscillate,
  comments: [oscillateSourced],
  versions: [verD, verC, verB, verA],
  toVersion: V4,
  htmlAt: new Map(oscillateFiles),
  readHtml: async (sha) => oscillateFiles.get(sha) ?? null,
});
ok("戻してまた直しても changed", attributedOscillate[0]?.state, "changed");
ok("戻しを挟んでも最初に直した人", attributedOscillate[0]?.changedBy, "別 太郎");
ok("あとの直しの人ではない", attributedOscillate[0]?.changedBy === "次 次郎", false);

console.log("\n--- 7. 大きく変わった長文でもサーバーを占有しない ---");
const longBefore = Array.from({ length: 6000 }, (_, i) => `before${i}`).join(" ");
const longAfter = Array.from({ length: 6000 }, (_, i) => `after${i}`).join(" ");
const started = Date.now();
const limited = outcomeOfQuote({ commentId: "large", quote: "before100", quoteContext: null, beforeHtml: page(`<p>${longBefore}</p>`), afterHtml: page(`<p>${longAfter}</p>`) });
ok("計算が重ければ未判定で返す（消えたと断定しない）", limited.state, "unknown");
ok("大幅に異なる長文も短時間で戻る", Date.now() - started < 1500, true);
if (fails > 0) process.exit(1);
