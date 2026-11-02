/**
 * 赤入れの指示が、読める形で出るかを確かめる。
 *
 * 見るのは 4 つ。
 *   1. 体裁だけ変えた版は「変化なし」になるか（整形し直しただけで全面が赤くならない）
 *   2. タグやスクリプトを足しただけの版も「変化なし」になるか
 *   3. 1 語だけ直した段落から、足した 1 件と消した 1 件が立つか
 *   4. 段落まるごと消した変更に、段落として挿し戻す印が付くか
 */
import { root, dir } from "./paths.mjs";
const { build } = await import(`${root}/node_modules/esbuild/lib/main.js`);
const out = `${dir}/diff.mjs`;

await build({
  entryPoints: [`${root}/src/lib/html/diff.ts`],
  outfile: out,
  bundle: true,
  format: "esm",
  platform: "node",
  external: ["node:*"],
});
const { redlineDiff } = await import(out);

const ok = (label, actual, expected) =>
  console.log(
    `${String(actual) === String(expected) ? "OK  " : "NG  "} ${label}: ${actual}（期待: ${expected}）`,
  );

const page = (body) =>
  `<!doctype html><html><head><title>四半期レポート</title><style>p{color:red}</style></head><body>${body}</body></html>`;

const before = page(`
  <h1>四半期レポート</h1>
  <p>売上は前年より 12% 伸びました。</p>
  <p>解約率は横ばいです。</p>
  <p>次の四半期は採用を進めます。</p>
  <p>この段落は変わりません。その一。</p>
  <p>この段落は変わりません。その二。</p>
  <p>最後の段落。</p>
`);

const after = page(`
  <h1>四半期レポート</h1>
  <p>売上は前年より 18% 伸びました。</p>
  <p>次の四半期は採用を進めます。</p>
  <p>この段落は変わりません。その一。</p>
  <p>この段落は変わりません。その二。</p>
  <p>最後の段落。</p>
  <p>付け足した段落。</p>
`);

console.log("--- 体裁だけ変えた場合（変化なしであるべき）---");
const reformatted = page(`
     <h1>四半期レポート</h1>

     <p>
       売上は前年より 12% 伸びました。
     </p>
     <p>解約率は横ばいです。</p>
     <p>次の四半期は採用を進めます。</p>
     <p>この段落は変わりません。その一。</p>
     <p>この段落は変わりません。その二。</p>
     <p>最後の段落。</p>
`);
const noop = redlineDiff(before, reformatted);
ok("変化なしと判定", noop.identical, true);
ok("変更の件数", noop.changes.length, 0);

console.log("\n--- タグやスクリプトを足しただけ（変化なしであるべき）---");
const scripted = before.replace("</body>", "<script>console.log('x')</script></body>");
const added = redlineDiff(before, scripted);
ok("変化なしと判定", added.identical, true);
const styled = before.replace("<h1>", '<h1 class="title" data-x="1">');
ok("見出しに指定を足しただけ", redlineDiff(before, styled).identical, true);

console.log("\n--- 1 語だけ直した段落 ---");
const oneWord = redlineDiff(before, page(`
  <h1>四半期レポート</h1>
  <p>売上は前年より 18% 伸びました。</p>
  <p>解約率は横ばいです。</p>
  <p>次の四半期は採用を進めます。</p>
  <p>この段落は変わりません。その一。</p>
  <p>この段落は変わりません。その二。</p>
  <p>最後の段落。</p>
`));
ok("変化ありと判定", oneWord.identical, false);
ok("足した件数", oneWord.addedCount, 1);
ok("消した件数", oneWord.removedCount, 1);
ok("行まるごとではない（足した側）", oneWord.changes.find((c) => c.kind === "add").block, false);
ok("足した文", oneWord.changes.find((c) => c.kind === "add").text.trim(), "18");
ok("消した文", oneWord.changes.find((c) => c.kind === "del").text.trim(), "12");
ok(
  "消した文は直前の文章の後ろへ戻す",
  oneWord.changes.find((c) => c.kind === "del").place,
  "after",
);

console.log("\n--- 段落まるごと消した ---");
const dropped = redlineDiff(before, page(`
  <h1>四半期レポート</h1>
  <p>売上は前年より 12% 伸びました。</p>
  <p>次の四半期は採用を進めます。</p>
  <p>この段落は変わりません。その一。</p>
  <p>この段落は変わりません。その二。</p>
  <p>最後の段落。</p>
`));
ok("変化ありと判定", dropped.identical, false);
ok("変更は 1 件だけ", dropped.changes.length, 1);
const removedBlock = dropped.changes[0];
ok("消した変更である", removedBlock.kind, "del");
ok("段落として挿し戻す", removedBlock.block, true);
ok("消した文", removedBlock.text.trim(), "解約率は横ばいです。");

console.log("\n--- 段落をまるごと足した ---");
const grown = redlineDiff(before, after);
ok("変化ありと判定", grown.identical, false);
const addedBlock = grown.changes.filter((c) => c.kind === "add").pop();
ok("足した段落がある", addedBlock !== undefined, true);
ok("足した文", addedBlock.text.trim(), "付け足した段落。");
ok("包んで見せる", addedBlock.place, "wrap");

console.log("\n--- 図の出入り ---");
const withImage = page(`<h1>図</h1><p>説明。</p><img src="chart.png" alt="">`);
const withTwo = page(`<h1>図</h1><p>説明。</p><img src="chart.png" alt=""><img src="next.png" alt="">`);
const images = redlineDiff(withImage, withTwo);
ok("足した画像", images.images.added.join(","), "next.png");
ok("消した画像", images.images.removed.length, 0);
const gone = redlineDiff(withTwo, withImage);
ok("消した画像（逆向き）", gone.images.removed.join(","), "next.png");
ok("同じパスのままなら何も出さない", redlineDiff(withImage, withImage).images.added.length, 0);

console.log("\n--- 日本語の一文を書き換えたときの粒度 ---");
/*
 * 日本語には単語の区切りが無いので、単語ごとの突き合わせが文字ごとに崩れる。
 * 束ねないと「消 こ / 足 はじめて / 消 段落 / 足 方 …」と 1〜3 文字に砕け、
 * 1 段落の中に十数か所の停留所ができて、件数も移動も一覧も読めなくなる。
 * ここは**人が読める粒度に収まっているか**を数で見張る。
 */
const japanese = redlineDiff(
  page(`
    <p>社外に渡す資料だけを、ここに置くことにします。</p>
    <p>本文をドラッグで選ぶと、その場にコメントを付けられます。この段落はあとで消えます。説明会は 8月 1日に行いました。</p>
  `),
  page(`
    <p>社外に渡す資料だけをここに置きます。</p>
    <p>本文をドラッグで選ぶと、その場にコメントを付けられます。 はじめての方は表示する名前を 1 つだけ聞かれます（登録は要りません）。</p>
  `),
);
for (const change of japanese.changes) {
  console.log(`   ${change.kind === "add" ? "足" : "消"} ${JSON.stringify(change.text.trim())}`);
}
/*
 * 束ねない場合は 16 件に砕ける（素の突き合わせの結果）。
 * 残った 1 文字の 2 件は破片ではなく、本当に 1 文字だけの直し
 * （消えた読点と、送り仮名の「き」）。間に意味のある 4 文字の一致が挟まっているので、
 * ここを束ねると変わっていない字にまで線が掛かる。だから残すのが正しい。
 */
ok("件数が 6 件以下に収まる", japanese.changes.length <= 6, true);
ok("実測の件数", japanese.changes.length, 5);
const longest = Math.max(...japanese.changes.map((change) => change.text.trim().length));
ok("長い書き換えが 1 件にまとまる（30 文字以上）", longest >= 30, true);

console.log("\n--- 束ねるのは短い一致だけ（段落はまたがない）---");
const across = redlineDiff(
  page(`<p>まえの段落です。</p><p>あとの段落です。</p>`),
  page(`<p>まえの文です。</p><p>あとの文です。</p>`),
);
ok("段落ごとに分かれる（4 件）", across.changes.length, 4);
ok("どの変更も改行をまたがない", across.changes.every((c) => !c.text.trim().includes("\n")), true);

const kept = redlineDiff(
  page(`<p>売上は 12% 伸び、解約は 3% 減りました。</p>`),
  page(`<p>売上は 18% 伸び、解約は 9% 減りました。</p>`),
);
ok("離れた 2 か所は別の件として残る", kept.changes.length, 4);

console.log("\n--- ページの名前が変わった ---");
const renamed = redlineDiff(
  `<html><head><title>むかしの名前</title></head><body><p>本文は同じ。</p></body></html>`,
  `<html><head><title>あたらしい名前</title></head><body><p>本文は同じ。</p></body></html>`,
);
ok("変化ありと判定", renamed.identical, false);
ok("1 件だけ立つ", renamed.changes.length, 1);
ok("種類は「ページの名前」", renamed.changes[0].kind, "title");
ok("置く先は無い", renamed.changes[0].place, "none");
ok("前と後がどちらも出る", renamed.changes[0].text, "むかしの名前 → あたらしい名前");
ok(
  "名前も本文も変わっていなければ変化なし",
  redlineDiff(
    `<html><head><title>同じ</title></head><body><p>本文。</p></body></html>`,
    `<html><head><title>同じ</title></head><body><p>本文。</p></body></html>`,
  ).identical,
  true,
);
ok(
  "本文の変更と名前の変更が両方立つ",
  redlineDiff(
    `<html><head><title>むかし</title></head><body><p>いち。</p></body></html>`,
    `<html><head><title>いま</title></head><body><p>に。</p></body></html>`,
  ).changes.filter((c) => c.kind === "title").length,
  1,
);

console.log("\n--- 入力欄の中身は文章として数えない ---");
/* サーバーだけが数えると、画面に出ていない文字のぶんだけ位置がずれる */
const withInput = page(`<p>本文です。</p><textarea>ひな型の文</textarea><select><option>あ</option></select>`);
const withInputChanged = page(`<p>本文です。</p><textarea>べつのひな型</textarea><select><option>い</option></select>`);
ok("入力欄だけ変えても変化なし", redlineDiff(withInput, withInputChanged).identical, true);

console.log("\n--- 番号は 1 から順に並ぶ ---");
const ordered = dropped.changes.every((change, at) => change.index === at + 1);
ok("番号が 1 始まりで連番", ordered, true);

console.log("\n--- 長い記録の大きい書き換えも全文を残して終わる ---");
const oldRows = Array.from({length: 2000}, (_, i) => `旧稿の項目${i}。この発言と元の時刻を保持します。`);
const newRows = Array.from({length: 2000}, (_, i) => `改訂稿の項目${1999-i}。整理後の内容を別の構成で確認します。`);
const longPage = rows => page(`<p>共通のはじめ</p>${rows.map(row => `<p>${row}</p>`).join("")}<p>共通のおわり</p>`);
const started = performance.now();
const large = redlineDiff(longPage(oldRows),longPage(newRows));
const elapsed = performance.now()-started;
ok("大きい変更も5秒以内に終わる",elapsed<5000,true);
console.log(`INFO 長い記録の比較: ${Math.round(elapsed)}ms`);
ok("長文を変化なしにしない",large.identical,false);
ok("削除した全文を切り詰めない",large.changes.filter(change=>change.kind==="del").map(change=>change.text).join("").trim()===oldRows.join("\n"),true);
ok("追加した全文を切り詰めない",large.changes.filter(change=>change.kind==="add").map(change=>change.text).join("").trim()===newRows.join("\n"),true);
ok("変わっていない末尾を変更に混ぜない",large.changes.every(change=>!change.text.includes("共通のおわり")),true);
const sameLong = longPage([...oldRows,"この会議は 17 人です。"]);
const smallInLong = redlineDiff(sameLong,sameLong.replace("17 人です。","19 人です。"));
ok("長い文書でも小さな直しは単語単位",smallInLong.changes.find(change=>change.kind==="add")?.text,"19");
const unicode = redlineDiff(page(`<p>😀${"旧".repeat(30000)}</p>`),page(`<p>😁${"新".repeat(30000)}</p>`));
ok("大きい書き換えで絵文字を分断しない",unicode.changes.every(change=>[...change.text].every(c=>c.length>1||c.charCodeAt(0)<0xd800||c.charCodeAt(0)>0xdfff)),true);
const allAdded = redlineDiff(page(""),longPage(newRows));
ok("空の文書へ大量に足した内容も保持する",allAdded.changes.filter(change=>change.kind==="add").map(change=>change.text).join("").includes(newRows.at(-1)),true);
const allRemoved = redlineDiff(longPage(oldRows),page(""));
ok("大量に削った内容も履歴へ残す",allRemoved.changes.filter(change=>change.kind==="del").map(change=>change.text).join("").includes(oldRows.at(-1)),true);

ok("広い範囲の比較だと明示する", large.coarse, true);
ok("小さな修正は通常の比較", smallInLong.coarse, false);
const distant = redlineDiff(longPage(oldRows), longPage(oldRows).replace("共通のはじめ", "新しいはじめ").replace("共通のおわり", "新しいおわり"));
ok("離れた小修正でも粗い比較であることを隠さない", distant.coarse, true);
