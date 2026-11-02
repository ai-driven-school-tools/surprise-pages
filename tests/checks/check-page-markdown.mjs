import { readWidgetSource } from "./widget-source.mjs";
/**
 * ページ本文を AI 向けマークダウンに落とす口が、階層と文字を残すかを確かめる。
 *
 * 見るのは 6 つ。
 *   1. 見出し・段・表・引用がマークダウンの形になるか
 *   2. 図解（矢印の並び）がコードブロックに載るか
 *   3. PDF ボタンや script など、渡す筋合いの無いものが落ちるか
 *   4. 画像はファイルではなく代替テキストが残るか
 *   5. コメントは、頼んだときだけ末尾に付くか
 *   6. 図（mermaid）は、描かれたあとでも元の文が残るか
 *
 * 保管庫には繋がない。材料は検査用の写しと、この場で組んだ HTML。
 */
import { readFile } from "node:fs/promises";

import { root, dir } from "./paths.mjs";
const { JSDOM } = await import("jsdom");
const { build } = await import(`${root}/node_modules/esbuild/lib/main.js`);

await build({
  entryPoints: [`${root}/src/lib/pages/markdown.ts`],
  outfile: `${dir}/page-markdown.mjs`,
  bundle: true,
  format: "esm",
  platform: "neutral",
});
const { pageToMarkdown, keepMermaidSource, MERMAID_SOURCE_MARK } = await import(`${dir}/page-markdown.mjs`);

let fails = 0;
const ok = (label, actual, expected) => {
  const pass = String(actual) === String(expected);
  if (!pass) fails += 1;
  console.log(`${pass ? "OK  " : "NG  "} ${label}: ${actual}（期待: ${expected}）`);
};

const convert = (html, extra = {}) => {
  const dom = new JSDOM(html, { url: extra.url ?? "https://example.com/public/sample" });
  return pageToMarkdown({
    title: extra.title ?? dom.window.document.title,
    url: extra.url ?? "https://example.com/public/sample",
    root: extra.root ?? dom.window.document.body,
    comments: extra.comments ?? null,
  });
};

const sampleComment = (over) => ({
  id: "11111111-1111-4111-8111-111111111111",
  pageSlug: "public/sample",
  parentId: null,
  quote: "引用の文",
  quoteContext: null,
  body: "ここを直してほしい",
  kind: "comment",
  priority: "must",
  author: { kind: "member", name: "山田", image: null },
  mine: false,
  pageVersion: null,
  resolvedAt: null,
  resolvedBy: null,
  createdAt: "2026-08-27T00:00:00.000Z",
  updatedAt: "2026-08-27T00:00:00.000Z",
  ...over,
});

// ---------------------------------------------------------------------------
console.log("--- 1. 見出しと段と表 ---");

const basic = convert(`<!doctype html><html><head><title>案内</title></head><body>
  <h1>案内</h1>
  <p>最初の段です。</p>
  <h2>次の節</h2>
  <p>強調は<strong>太い</strong>です。</p>
  <ul><li>一つ</li><li>二つ</li></ul>
  <table>
    <tr><th>種類</th><th>読む</th></tr>
    <tr><td>社内</td><td>会社の人</td></tr>
  </table>
</body></html>`);

ok("題が h1", basic.startsWith("# 案内\n"), true);
ok("出典が残る", basic.includes("https://example.com/public/sample"), true);
ok("題を二重にしない", (basic.match(/^# 案内$/gm) ?? []).length, 1);

const withBadge = convert(`<!doctype html><html><head><title>案内</title></head><body>
  <div>社内ツール</div>
  <h1>案内</h1>
  <p>段です。</p>
</body></html>`);
ok("バッジのあとの題も二重にしない", (withBadge.match(/^# 案内$/gm) ?? []).length, 1);
ok("バッジは残る", withBadge.includes("社内ツール"), true);
ok("段が残る", basic.includes("最初の段です。"), true);
ok("節の見出し", basic.includes("## 次の節"), true);
ok("強調", basic.includes("**太い**"), true);
ok("箇条書き", basic.includes("- 一つ"), true);
ok("表の区切り", basic.includes("| --- | --- |"), true);
ok("表の中身", basic.includes("| 社内 | 会社の人 |"), true);
ok("HTML タグが残らない", /<p>|<div>|<h1>/.test(basic), false);

// ---------------------------------------------------------------------------
console.log("\n--- 2. 図解はコードブロックに載るか ---");

const flow = convert(`<!doctype html><html><body>
  <h1>流れ</h1>
  <div class="flex flex-col md:flex-row items-center">
    <div class="flex flex-col items-center">
      <div class="font-bold">原稿</div>
      <div>書いた文章</div>
    </div>
    <div class="flex items-center">
      <span>読み込み</span>
      <i data-lucide="arrow-right" class="hidden md:block"></i>
      <i data-lucide="arrow-down" class="md:hidden"></i>
    </div>
    <div class="flex flex-col items-center">
      <div class="font-bold">Aruru</div>
      <div>声・絵・演出を手配</div>
    </div>
  </div>
</body></html>`);

ok("コードブロックが付く", flow.includes("```\n"), true);
ok("矢印が残る", flow.includes("→"), true);
ok("矢印のラベル", flow.includes("読み込み"), true);
ok("セルの題", flow.includes("原稿"), true);
ok("セルの補足", flow.includes("書いた文章"), true);
ok("携帯用の矢印は落とす", (flow.match(/→/g) ?? []).length, 1);
ok("lucide のタグは残らない", flow.includes("data-lucide"), false);

const chevron = convert(`<!doctype html><html><body>
  <div class="flex flex-col md:flex-row items-center">
    <div>文章を選ぶ</div>
    <div class="flex items-center">
      <i data-lucide="chevron-right" class="hidden md:block"></i>
      <i data-lucide="chevron-down" class="md:hidden"></i>
    </div>
    <div>小窓から選ぶ</div>
  </div>
</body></html>`);
ok("シェブロンも流れとして見る", chevron.includes("```\n"), true);
ok("シェブロンも矢印になる", chevron.includes("→"), true);

const chips = convert(`<!doctype html><html><body>
  <div class="flex flex-wrap justify-center gap-2">
    <div>ナレーション音声</div>
    <div>スライド</div>
    <div>強調テロップ</div>
  </div>
</body></html>`);
ok("ピルは箇条書き", chips.includes("- ナレーション音声"), true);
ok("ピルが全部残る", chips.includes("- 強調テロップ"), true);

const grid = convert(`<!doctype html><html><body>
  <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
    <div class="rounded-xl border">
      <div class="font-bold">参加者の質</div>
      <div>10%以上</div>
    </div>
    <div class="rounded-xl border">
      <div class="font-bold">体験の質</div>
      <div>平均9点以上</div>
    </div>
  </div>
</body></html>`);
ok("カードの題", grid.includes("参加者の質"), true);
ok("カードの数字", grid.includes("10%以上"), true);

const steps = convert(`<!doctype html><html><body>
  <h2>試してみる</h2>
  <div class="flex items-center gap-6">
    <span>1</span>
    <div>
      <h3>右下の「共有範囲」を押す</h3>
      <p>道具の並びが出ています。</p>
    </div>
  </div>
</body></html>`);
ok("番号が見出しに乗る", steps.includes("### 1. 右下の「共有範囲」を押す"), true);
ok("番号だけの行にしない", /^1$/m.test(steps), false);

const directArrows = convert(`<!doctype html><html><body>
  <div class="flex items-center">
    <div>原稿</div>
    <i data-lucide="arrow-right"></i>
    <div>公開</div>
  </div>
</body></html>`);
ok("直下の矢印も流れになる", directArrows.includes("```\n"), true);
ok("直下の矢印も → になる", directArrows.includes("→"), true);
ok("直下の矢印でもセルが残る", directArrows.includes("原稿") && directArrows.includes("公開"), true);

// ---------------------------------------------------------------------------
console.log("\n--- 3. 渡す筋合いの無いものが落ちるか ---");

const chrome = convert(`<!doctype html><html><body>
  <div class="no-print">
    <button onclick="window.print()">PDF</button>
  </div>
  <script>alert(1)</script>
  <style>body{color:red}</style>
  <h1>本文の題</h1>
  <p>残すべき段。</p>
  <footer>Pages</footer>
</body></html>`);
ok("PDF は落ちる", chrome.includes("PDF"), false);
ok("script は落ちる", chrome.includes("alert"), false);
ok("本文は残る", chrome.includes("残すべき段。"), true);
ok("製品のフッタは落ちる", chrome.includes("Pages"), false);

// ---------------------------------------------------------------------------
console.log("\n--- 4. 画像は代替テキストか ---");

const image = convert(`<!doctype html><html><body>
  <h2>何が起きているか</h2>
  <img src="switch.svg" alt="切り替える前は入口が 1 つ。切り替えたあとは入口が 1 つ増える">
</body></html>`);
ok("代替テキストが残る", image.includes("切り替える前は入口が 1 つ"), true);
ok("ファイル名は出さない", image.includes("switch.svg"), false);
ok("図であることは伝える", image.includes("[図]"), true);

// ---------------------------------------------------------------------------
console.log("\n--- 5. コメントは頼んだときだけ付くか ---");

const without = convert(`<!doctype html><html><body><p>本文。</p></body></html>`, {
  comments: null,
});
ok("頼まなければコメント節は無い", without.includes("## コメント"), false);

const empty = convert(`<!doctype html><html><body><p>本文。</p></body></html>`, {
  comments: [],
});
ok("空でも節は付く", empty.includes("## コメント"), true);
ok("無いときはそう書く", empty.includes("コメントはまだありません。"), true);

const withComments = convert(`<!doctype html><html><body><p>本文。</p></body></html>`, {
  comments: [
    sampleComment(),
    sampleComment({
      id: "22222222-2222-4222-8222-222222222222",
      parentId: "11111111-1111-4111-8111-111111111111",
      body: "了解です",
      author: { kind: "member", name: "佐藤", image: null },
    }),
  ],
});
ok("優先度の見出し", withComments.includes("### must（必ず直す） 1 件"), true);
ok("引用が残る", withComments.includes("「引用の文」"), true);
ok("本文が残る", withComments.includes("ここを直してほしい"), true);
ok("返信が残る", withComments.includes("佐藤"), true);
ok("アドレスは載せない", /@/.test(withComments.split("## コメント")[1] ?? ""), false);

// ---------------------------------------------------------------------------
console.log("\n--- 6. 検査用の写しでも文字が残るか ---");

const fixture = await readFile(`${root}/tests/checks/fixtures/public/guide/how-to-use.html`, "utf8");
const guide = convert(fixture, {
  title: "Pages の使い方",
  url: "https://example.com/public/guide/how-to-use",
});
ok("写しの題", guide.includes("# Pages の使い方"), true);
ok("写しの流れ", guide.includes("あなた"), true);
ok("写しの流れの矢印", guide.includes("→"), true);
ok("写しの表", guide.includes("社内限定"), true);
ok("写しから PDF が落ちる", guide.includes("\nPDF\n") || guide.includes("# PDF"), false);
ok("タグが残らない", /<div|<script|<button/.test(guide), false);

const phrases = ["話しかけるだけで", "社内限定", "公開", "コメント", "履歴"];
for (const phrase of phrases) {
  ok(`  写しの文言「${phrase}」`, guide.includes(phrase), true);
}

// ---------------------------------------------------------------------------
console.log("\n--- 7. お試しの図解ページ（見せ方の切り替え）---");

const sample = convert(
  `<!doctype html><html><head><title>見せる相手を切り替える、お試しのページ</title></head><body>
  <div class="no-print"><button onclick="window.print()">PDF</button></div>
  <header>
    <h1>見せる相手を<span>切り替える</span>、<br class="hidden md:block">お試しのページ</h1>
    <p>このページは、社内限定から社外公開へ切り替える操作を試すために置いてあります。</p>
  </header>
  <section>
    <h2>試してみる</h2>
    <div class="flex items-center gap-6">
      <span>1</span>
      <div>
        <h3>右下の「共有範囲」を押す</h3>
        <p>画面の右下に道具の並びが出ています。</p>
      </div>
    </div>
    <div class="flex items-center gap-6">
      <span>2</span>
      <div>
        <h3>「社外の誰でも」を押す</h3>
        <p>選び分けが 3 つ並んでいます。</p>
      </div>
    </div>
  </section>
  <section>
    <h2>何が起きているか</h2>
    <p>ページが引っ越すのではなく、同じ部屋に扉がもう 1 枚付きます。</p>
    <div class="bg-ads-surface rounded-2xl p-8">
      <img src="switch.svg" alt="切り替える前は社内向けの入口が 1 つ。切り替えたあとは社内向けがそのまま残り、社外向けの入口が 1 つ増える">
    </div>
  </section>
  <footer>Pages</footer>
</body></html>`,
  {
    title: "見せる相手を切り替える、お試しのページ",
    url: "https://pages.example.com/public/samples/visibility-switch",
  },
);
ok(
  "改行入りの h1 でも題を二重にしない",
  (sample.match(/^# 見せる相手を切り替える/gm) ?? []).length,
  1,
);
ok("出典", sample.includes("https://pages.example.com/public/samples/visibility-switch"), true);
ok("導入の段", sample.includes("社内限定から社外公開へ切り替える操作"), true);
ok("節", sample.includes("## 試してみる"), true);
ok("手順 1", sample.includes("### 1. 右下の「共有範囲」を押す"), true);
ok("手順 2", sample.includes("### 2. 「社外の誰でも」を押す"), true);
ok("図の文字", sample.includes("切り替える前は社内向けの入口が 1 つ"), true);
ok("図だと分かる", sample.includes("[図]"), true);
ok("ファイル名は出さない", sample.includes("switch.svg"), false);
ok("PDF は落ちる", sample.includes("PDF"), false);
ok("フッタは落ちる", sample.includes("Pages"), false);
ok("タグが残らない", /<h1>|<span>|<img/.test(sample), false);

// ---------------------------------------------------------------------------
console.log("\n--- 8. 図（mermaid）は元の文が残るか ---");

/*
 * 図の道具は、描き終えると元の文を消して SVG に置き換える。SVG は文章ではないので
 * 書き出しでは落としており、控えを取らないと図が丸ごと消える。
 * ここでは「描かれる前に控えて、描かれたあとも元の文が出る」ところまでを実物で確かめる。
 */
const SOURCE = "sequenceDiagram\n  書く人->>保管庫: 版を積む\n  保管庫-->>書く人: 版の目印";
const diagramPage = (tag, inner) =>
  `<!doctype html><html><head><title>図</title></head><body><h1>図</h1><${tag} class="mermaid">${inner}</${tag}></body></html>`;

/** 図の道具が描いたあとの姿にする（元の文を消して SVG を入れ、済みの印を立てる）。 */
const renderMermaid = (dom) => {
  for (const el of dom.window.document.querySelectorAll(".mermaid")) {
    el.innerHTML = '<svg aria-roledescription="sequence"><text>書く人</text></svg>';
    el.setAttribute("data-processed", "true");
  }
};

const stillRaw = convert(diagramPage("pre", SOURCE));
ok("描かれる前でも図として出る", stillRaw.includes("```mermaid"), true);
ok("描かれる前は元の文がそのまま", stillRaw.includes("書く人->>保管庫: 版を積む"), true);

{
  const dom = new JSDOM(diagramPage("pre", SOURCE), { url: "https://example.com/internal/sample" });
  keepMermaidSource(dom.window.document);
  ok("控えたら目印が立つ", dom.window.document.querySelector(".mermaid").hasAttribute(MERMAID_SOURCE_MARK), true);
  renderMermaid(dom);
  const after = pageToMarkdown({
    title: "図",
    url: "https://example.com/internal/sample",
    root: dom.window.document.body,
    comments: null,
  });
  ok("描かれたあとも図として出る", after.includes("```mermaid"), true);
  ok("描かれたあとも元の文が出る", after.includes("保管庫-->>書く人: 版の目印"), true);
  ok("SVG の中の字は拾わない", after.includes("<svg") || after.includes("<text"), false);
}

{
  // 控える前に描かれてしまった図。空のコードブロックを置くくらいなら、何も出さない
  const dom = new JSDOM(diagramPage("pre", SOURCE), { url: "https://example.com/internal/sample" });
  renderMermaid(dom);
  const after = pageToMarkdown({
    title: "図",
    url: "https://example.com/internal/sample",
    root: dom.window.document.body,
    comments: null,
  });
  ok("控えが無いなら空のコードブロックを置かない", after.includes("```"), false);
  ok("題は残る", after.includes("# 図"), true);
}

{
  // 図は <div> でも書ける（道具の側がタグを問わない）
  const dom = new JSDOM(diagramPage("div", SOURCE), { url: "https://example.com/internal/sample" });
  keepMermaidSource(dom.window.document);
  renderMermaid(dom);
  const after = pageToMarkdown({
    title: "図",
    url: "https://example.com/internal/sample",
    root: dom.window.document.body,
    comments: null,
  });
  ok("div で書いた図も出る", after.includes("```mermaid"), true);
}

{
  // 2 度通しても、1 度目の控えを上書きしない（描いたあとの SVG で塗り替えない）
  const dom = new JSDOM(diagramPage("pre", SOURCE), { url: "https://example.com/internal/sample" });
  keepMermaidSource(dom.window.document);
  renderMermaid(dom);
  keepMermaidSource(dom.window.document);
  ok(
    "2 度目は控えを塗り替えない",
    dom.window.document.querySelector(".mermaid").getAttribute(MERMAID_SOURCE_MARK),
    SOURCE,
  );
}

const diagramFixture = await readFile(`${root}/tests/checks/fixtures/internal/guide/diagrams.html`, "utf8");
const diagrams = convert(diagramFixture, { title: "図の入れ方", url: "https://example.com/internal/guide/diagrams" });
// 数は材料から数える。材料に図を 1 枚足したら期待も 1 枚増える（書き写すと足した日に必ず落ちる）
ok(
  "写しの図が材料と同じ数だけ出る",
  (diagrams.match(/```mermaid/g) ?? []).length,
  (diagramFixture.match(/<pre class="mermaid">/g) ?? []).length,
);
ok("写しの順序図の中身", diagrams.includes("CLI-->>書く人: URL"), true);
ok("写しの流れ図の中身", diagrams.includes("B -- 社内 --> C[会社の人だけ]"), true);
ok("写しの日程の中身", diagrams.includes("section 下ごしらえ"), true);
ok("図の道具の読み込みは渡さない", diagrams.includes("mermaid.initialize"), false);

/*
 * 控えるのは**描かれる前の 1 か所**でないと間に合わない。道具箱の立ち上げは
 * 読み込みが終わる前に通るので、そこで呼んでいることを源に当たって見る
 * （呼ぶ場所が後ろへ動くと、手元では気づけないまま図だけが書き出しから消える）。
 */
const widgetSource = await readWidgetSource();
const startAt = widgetSource.indexOf("\nfunction start(): void {");
const keepAt = widgetSource.indexOf("keepMermaidSource(document)", startAt);
const buildAt = widgetSource.indexOf("build();", startAt);
ok("道具箱の立ち上げで控える", keepAt > startAt, true);
ok("道具箱を組み立てるより先に控える", keepAt < buildAt, true);
ok("控える口を書き写していない（正本から取っている）", widgetSource.includes('keepMermaidSource } from "../../lib/html/mermaid-source"'), true);
const MERMAID_SOURCE = await (await import("node:fs/promises")).readFile(`${root}/src/lib/html/mermaid-source.ts`, "utf8");
const PAGE_MARKDOWN = await (await import("node:fs/promises")).readFile(`${root}/src/lib/pages/markdown.ts`, "utf8");
ok("控える口の正本は src/lib/html/mermaid-source.ts（書き出しは同じ名前をそこから読んで渡す）",
  /export function keepMermaidSource\(/.test(MERMAID_SOURCE) && !/export function keepMermaidSource\(/.test(PAGE_MARKDOWN) && /export \{ MERMAID_SOURCE_MARK, keepMermaidSource \};/.test(PAGE_MARKDOWN), true);

console.log(fails === 0 ? "\nぜんぶ通った" : `\n${fails} 件が期待と違う`);
process.exitCode = fails === 0 ? 0 : 1;
