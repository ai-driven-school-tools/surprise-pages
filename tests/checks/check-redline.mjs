import { readWidgetSource } from "./widget-source.mjs";
// 道具箱の文言は辞書（日本語が正本）。画面はその鍵を引き、字そのものは辞書で見る
import { readFileSync as readDictionary } from "node:fs";
const TOOLBOX_JA = readDictionary(new URL("../../src/lib/i18n/messages/ja/toolbox.ts", import.meta.url), "utf8");
/**
 * 場所の手がかりが、本当に効くかを確かめる。
 *
 * 赤入れは「本文の何文字目」ではなく「この文言＋その前後の文字」で場所を指す。
 * この手がかりが新しい版の本文に見つからないと、**件数だけ出て印が 1 つも付かない**
 * という壊れ方をする。目で見つけにくいので、ここに番人を置く。
 *
 * 見るのは 4 つ。
 *   1. どの変更の head も、新しい版の本文（htmlBodyText）に必ず現れる
 *   2. tail があるときは head の終わり以降に現れる（範囲が裏返らない）
 *   3. 同じ文言が何度も出るときは、前後の文字で 1 つに絞れる
 *   4. 本物の DOM（jsdom）の上で、実際に印が付く
 *
 * 3 は探し方の正本（src/lib/html/locate-text.ts）で、同じ手続きで確かめる。
 * 探す側と手がかりを作る側が食い違っていないことを見たいので、
 * ここで別の探し方を書き起こさない。
 */
import { root, dir } from "./paths.mjs";
const { build } = await import(`${root}/node_modules/esbuild/lib/main.js`);

await build({
  entryPoints: [`${root}/src/lib/html/diff.ts`],
  outfile: `${dir}/rl-diff.mjs`,
  bundle: true,
  format: "esm",
  platform: "node",
  external: ["node:*"],
});
await build({
  entryPoints: [`${root}/src/lib/html/text.ts`],
  outfile: `${dir}/rl-text.mjs`,
  bundle: true,
  format: "esm",
  platform: "node",
});
await build({
  entryPoints: [`${root}/src/lib/html/locate-text.ts`],
  outfile: `${dir}/rl-locate.mjs`,
  bundle: true,
  format: "esm",
  platform: "node",
});
const { redlineDiff } = await import(`${dir}/rl-diff.mjs`);
const { htmlBodyText } = await import(`${dir}/rl-text.mjs`);
const { locateInText } = await import(`${dir}/rl-locate.mjs`);

const ok = (label, actual, expected) =>
  console.log(
    `${String(actual) === String(expected) ? "OK  " : "NG  "} ${label}: ${actual}（期待: ${expected}）`,
  );
ok("headの仕掛けにあるbody文字列を本文と混同しない", htmlBodyText('<html><head><script>const sample="<body>偽物</body>";</script></head><body><p>本物の本文</p></body></html>'), "本物の本文");

/** ブラウザ側が読み取る形（空白を 1 つに詰めた 1 本の文字列）にそろえる。 */
const condense = (value) => value.replace(/\s+/g, " ").trim();

/** 探し方の正本。前後の名前だけ、この検査が使っている形に合わせる。 */
function locateText(text, head, tail, context) {
  return locateInText(text, head, tail, {
    beforeText: context.before,
    afterText: context.after,
  });
}

/** 1 組の版を、手がかりの効き方の面から丸ごと調べる。 */
function inspect(label, beforeHtml, afterHtml) {
  const diff = redlineDiff(beforeHtml, afterHtml);
  const text = condense(htmlBodyText(afterHtml));

  let missing = 0;
  let reversed = 0;
  let located = 0;

  for (const change of diff.changes) {
    const head = condense(change.anchor.head);
    if (head.length === 0 || !text.includes(head)) {
      missing += 1;
      continue;
    }
    if (change.anchor.tail !== null) {
      const tail = condense(change.anchor.tail);
      const headAt = text.indexOf(head);
      if (!text.includes(tail) || text.indexOf(tail, headAt) < 0) reversed += 1;
    }
    const found = locateText(text, change.anchor.head, change.anchor.tail, {
      before: condense(change.anchor.before),
      after: condense(change.anchor.after),
    });
    if (found !== null) located += 1;
  }

  console.log(`--- ${label}（変更 ${diff.changes.length} 件）---`);
  ok("本文に見つからない手がかり", missing, 0);
  ok("終わりが頭より前にある手がかり", reversed, 0);
  ok("場所を 1 つに絞れた件数", located, diff.changes.length);
  return diff;
}

const page = (body) => `<!doctype html><html><head><title>案内</title></head><body>${body}</body></html>`;

inspect(
  "ふつうの直し",
  page(`
    <h1>四半期レポート</h1>
    <p>売上は前年より 12% 伸びました。</p>
    <p>解約率は横ばいです。</p>
    <p>次の四半期は採用を進めます。</p>
    <p>最後の段落。</p>
  `),
  page(`
    <h1>四半期レポート</h1>
    <p>売上は前年より 18% 伸びました。</p>
    <p>次の四半期は採用を進めます。</p>
    <p>最後の段落。</p>
    <p>付け足した段落。</p>
  `),
);

console.log("");
inspect(
  "同じ文言が何度も出るページ",
  page(`
    <h2>手順</h2>
    <p>はじめに 準備 をします。</p>
    <p>つぎに 準備 をします。</p>
    <p>さいごに 準備 をします。</p>
  `),
  page(`
    <h2>手順</h2>
    <p>はじめに 準備 をします。</p>
    <p>つぎに 確認 をします。</p>
    <p>さいごに 準備 をします。</p>
  `),
);

console.log("");
inspect(
  "長い段落を丸ごと入れ替えた（頭と尻の両方を覚える）",
  page(`<p>${"あ".repeat(30)}むかしの文${"い".repeat(90)}</p><p>あとの段落。</p>`),
  page(`<p>${"あ".repeat(30)}あたらしい文${"い".repeat(90)}</p><p>あとの段落。</p>`),
);

console.log("");
inspect(
  "表と図が混じったページ",
  page(`
    <h2>一覧</h2>
    <table><tbody>
      <tr><td>りんご</td><td>100 円</td></tr>
      <tr><td>みかん</td><td>200 円</td></tr>
    </tbody></table>
    <figure><img src="a.png" alt=""><figcaption>図 1</figcaption></figure>
    <pre><code>npm run build</code></pre>
  `),
  page(`
    <h2>一覧</h2>
    <table><tbody>
      <tr><td>りんご</td><td>120 円</td></tr>
      <tr><td>みかん</td><td>200 円</td></tr>
    </tbody></table>
    <figure><img src="a.png" alt=""><figcaption>図 1</figcaption></figure>
    <pre><code>pnpm run build</code></pre>
  `),
);

console.log("\n--- 先頭が消えた場合（直後の文章を手がかりに、その前へ戻す）---");
// 見出し（title）も無い、いちばん先頭が消えた形。直前に手がかりが 1 文字も無い
const headless = redlineDiff(`<p>まえおき。</p><p>本題です。</p>`, `<p>本題です。</p>`);
ok("消した変更が 1 件", headless.changes.length, 1);
ok("直後の文章の前へ戻す", headless.changes[0].place, "before");
ok(
  "手がかりが本文にある",
  condense(htmlBodyText(`<p>本題です。</p>`)).includes(condense(headless.changes[0].anchor.head)),
  true,
);

console.log("\n--- 本物の DOM に置けるか（サーバーの数え方とブラウザの読み取りが合っているか）---");
/*
 * ここが本丸。手がかりが文字列として見つかることと、**実際に印が付くこと**は別の話で、
 * サーバー側の本文取り出しとブラウザ側の読み取りが 1 文字でも食い違うと、
 * 件数だけ出て印が 1 つも付かないという壊れ方をする。
 * jsdom の上で本当に applyRedline を通し、置けた数を数える。
 */
const { JSDOM } = await import("jsdom");
await build({
  entryPoints: [`${root}/src/widget/comments/redline.ts`],
  outfile: `${dir}/rl-widget.mjs`,
  bundle: true,
  format: "esm",
  platform: "neutral",
});
// ページの読み取りだけを取り出して、サーバー側の取り出しと突き合わせるために使う
await build({
  entryPoints: [`${root}/src/widget/comments/anchor.ts`],
  outfile: `${dir}/rl-anchor.mjs`,
  bundle: true,
  format: "esm",
  platform: "neutral",
});
// 見た目は組み立てたあとの文字列で見る（しきい値などが本当に埋まっているかを確かめるため）
await build({
  entryPoints: [`${root}/src/widget/shared/styles.ts`],
  outfile: `${dir}/rl-styles.mjs`,
  bundle: true,
  format: "esm",
  platform: "neutral",
});

async function place(label, beforeHtml, afterHtml) {
  const diff = redlineDiff(beforeHtml, afterHtml);
  const dom = new JSDOM(afterHtml);
  global.window = dom.window;
  global.document = dom.window.document;
  global.Node = dom.window.Node;
  global.Text = dom.window.Text;
  global.NodeFilter = dom.window.NodeFilter;
  global.Element = dom.window.Element;
  global.HTMLElement = dom.window.HTMLElement;
  // jsdom には明暗の問い合わせが無い。明るいほうの色で塗れれば足りる
  dom.window.matchMedia = () => ({ matches: false, addEventListener() {} });

  const mod = await import(`${dir}/rl-widget.mjs?v=${Math.random()}`);
  const placed = mod.applyRedline(diff.changes);
  const marks = dom.window.document.querySelectorAll("[data-surprise-redline]").length;

  console.log(`   ${label}`);
  ok("置けた件数", placed.size, diff.changes.length);
  ok("本文に印が入っている", marks >= diff.changes.length, true);

  // 外したら元の姿へ戻る（比較を抜けたときにページが荒れない）
  const original = dom.window.document.body.innerHTML;
  mod.clearRedline();
  ok(
    "外すと印が残らない",
    dom.window.document.querySelectorAll("[data-surprise-redline]").length,
    0,
  );
  ok("外す前は印が入っていた", original.includes("data-surprise-redline"), true);
  return diff;
}

await place(
  "1 語だけ直した",
  page(`<p>売上は前年より 12% 伸びました。</p><p>次の四半期は採用を進めます。</p>`),
  page(`<p>売上は前年より 18% 伸びました。</p><p>次の四半期は採用を進めます。</p>`),
);
{
  const oldRows = Array.from({ length: 900 }, (_, i) => `<p>以前の記録${i}：確認前の内容をここに残しています。</p>`).join("");
  const newRows = Array.from({ length: 900 }, (_, i) => `<p>新しい記録${i}：根拠を確かめた内容をこちらにまとめています。</p>`).join("");
  const older = page(`<h1>記録の比較</h1>${oldRows}<p>末尾の案内は変わりません。</p>`);
  const newer = page(`<h1>記録の比較</h1>${newRows}<p>末尾の案内は変わりません。</p>`);
  inspect("長文の範囲比較でも位置を特定できる", older, newer);
  await place("長文の範囲比較でも実際の本文へ印を置ける", older, newer);
}
await place(
  "段落まるごと消した",
  page(`<p>一つ目。</p><p>二つ目。</p><p>三つ目。</p>`),
  page(`<p>一つ目。</p><p>三つ目。</p>`),
);
await place(
  "太字やリンクをまたぐ",
  page(`<p>ここは <b>とても</b> <a href="/x">大事</a> な話です。</p>`),
  page(`<p>ここは <b>とても</b> <a href="/x">大切</a> な話です。</p>`),
);
await place(
  "表の中",
  page(`<table><tbody><tr><td>りんご</td><td>100 円</td></tr></tbody></table>`),
  page(`<table><tbody><tr><td>りんご</td><td>120 円</td></tr></tbody></table>`),
);
await place(
  "図の説明だけ変わった",
  page(`<figure><img src="a.png" alt=""><figcaption>図 1 売上</figcaption></figure>`),
  page(`<figure><img src="a.png" alt=""><figcaption>図 1 解約</figcaption></figure>`),
);

/*
 * ここから 2 つが要。要素の境目に空白を 1 つも書かない書き方では、
 * サーバーは「行が変わった」と数え、ブラウザは「続いた文字」と読む。
 * この食い違いは、手がかりをサーバー自身の取り出し結果で探しているかぎり
 * **構造的に出てこない**（どちらも同じずれ方をするので必ず見つかってしまう）。
 * 本物の DOM に置いてはじめて分かるので、ここに置いておく。
 */
/*
 * どれも、**手がかりが境目をまたぐ**ように作ってある。またがない事例だけを置くと、
 * 数え方が食い違っていても偶然そろって通ってしまい、番人にならない。
 */
await place(
  "1 行で書いた表（升目の間に空白が無い）",
  page(`<table><tbody><tr><td>りんご</td><td>100 円</td></tr><tr><td>みかん</td><td>200 円</td></tr></tbody></table><p>以上です。</p>`),
  page(`<table><tbody><tr><td>りんご</td><td>100 ドル</td></tr><tr><td>みかん</td><td>200 円</td></tr></tbody></table><p>以上です。</p>`),
);
await place(
  "1 行で書いた段落（段落の間に空白が無い）",
  page(`<p>一つ目の段落。</p><p>二つ目の段落。</p><p>三つ目の段落。</p>`),
  page(`<p>一つ目の段落。</p><p>二つ目を書き直した。</p><p>三つ目の段落。</p>`),
);
await place(
  "<br> をまたぐ手がかり",
  page(`<p>まず 準備 します。<br>つぎに 確認 します。</p><p>あとがき。</p>`),
  page(`<p>まず 準備 します。<br>つぎに 記録 します。</p><p>あとがき。</p>`),
);
await place(
  "<br> で区切られた行が消えた",
  page(`<p>一行目 です。<br>二行目 です。<br>三行目 です。</p>`),
  page(`<p>一行目 です。<br>三行目 です。</p>`),
);
console.log("\n--- 挿し戻す場所（隣の要素の中に入り込まないか）---");
/*
 * 手がかりの終わりが見出しの末尾に来ると、そのまま差し込めば見出しの中に入る。
 * 見出しを直したように見えてしまうので、入れ物の外へ出さなければならない。
 */
async function placedIn(label, beforeHtml, afterHtml, check) {
  const diff = redlineDiff(beforeHtml, afterHtml);
  const dom = new JSDOM(afterHtml);
  global.window = dom.window;
  global.document = dom.window.document;
  global.Node = dom.window.Node;
  global.Text = dom.window.Text;
  global.NodeFilter = dom.window.NodeFilter;
  global.Element = dom.window.Element;
  global.HTMLElement = dom.window.HTMLElement;
  dom.window.matchMedia = () => ({ matches: false, addEventListener() {} });

  const mod = await import(`${dir}/rl-widget.mjs?v=${Math.random()}`);
  const placed = mod.applyRedline(diff.changes);
  console.log(`   ${label}`);
  ok("置けた件数", placed.size, diff.changes.length);
  check(dom.window.document);
}

await placedIn(
  "見出しの直後の段落が消えた",
  page(`<h2>見出し</h2><p>消える段落です。</p><p>残る段落です。</p>`),
  page(`<h2>見出し</h2><p>残る段落です。</p>`),
  (doc) => {
    ok("見出しの中に入っていない", doc.querySelector("h2 del") === null, true);
    ok("見出しの文字は元のまま", doc.querySelector("h2").textContent.trim(), "見出し");
    ok("段落として戻っている", doc.querySelector("del").style.display, "block");
  },
);

await placedIn(
  "先頭の段落がまるごと消えた",
  page(`<p>まえおきの段落です。</p><p>本題の段落です。</p>`),
  page(`<p>本題の段落です。</p>`),
  (doc) => {
    const del = doc.querySelector("del");
    ok("段落として戻っている", del.style.display, "block");
    ok("段落の中に押し込まれていない", doc.querySelector("p del") === null, true);
    ok("本題の段落より前にある", del.nextElementSibling?.tagName, "P");
  },
);

await placedIn(
  "表の升目の中で消えた（表の骨組みには差し込まない）",
  page(`<table><tbody><tr><td>りんご 赤 100 円</td><td>みかん</td></tr></tbody></table>`),
  page(`<table><tbody><tr><td>りんご 100 円</td><td>みかん</td></tr></tbody></table>`),
  (doc) => {
    ok("行の直下に増えていない", doc.querySelectorAll("tr > del").length, 0);
    ok("表の直下に増えていない", doc.querySelectorAll("table > del, tbody > del").length, 0);
    ok("升目の数は変わらない", doc.querySelectorAll("td").length, 2);
  },
);

console.log("\n--- 数えない／行を切る、の顔ぶれが両側で揃っているか ---");
/*
 * ずれの元は、たいてい「片方だけが数えるタグ」。顔ぶれが 2 か所に書いてある以上、
 * 片方だけ直されるのは時間の問題なので、ここで突き合わせておく。
 */
const anchorSource = await (await import("node:fs/promises")).readFile(
  `${root}/src/widget/comments/anchor.ts`,
  "utf8",
);
const textSource = await (await import("node:fs/promises")).readFile(
  `${root}/src/lib/html/text.ts`,
  "utf8",
);

const listOf = (source, name) => {
  const found = new RegExp(`${name}[\\s\\S]{0,400}?;`).exec(source);
  if (found === null) return [];
  const words = found[0].match(/[a-z][a-z0-9]*/g) ?? [];
  return words;
};
const setOf = (words, drop) => {
  const kept = words.filter((word) => !drop.has(word));
  return [...new Set(kept)].sort().join(",");
};

// サーバーが中身ごと落とすタグ / ブラウザが数えないタグ
const dropWords = listOf(textSource, "const DROP_BLOCKS");
const skipWords = listOf(anchorSource, "export const TEXT_SKIP_TAGS");
// 正規表現の書き方そのもの（\b や [\s\S] の中の字）を、タグ名と取り違えない
const noise = new Set(["const", "script", "s", "b", "gi", "i", "g"]);
const serverDrops = setOf(dropWords, new Set([...noise, "drop", "blocks"]));
const browserSkips = setOf(skipWords, new Set([...noise, "export", "text", "skip", "tags"]));
console.log(`   サーバーが落とす: ${serverDrops}`);
console.log(`   ブラウザが飛ばす: ${browserSkips}`);
// template だけは差が出てよい（中身が別の入れ物にあり、ブラウザの歩き方では辿り着かない）
ok(
  "数えないタグの顔ぶれが揃っている（template を除く）",
  browserSkips,
  serverDrops.split(",").filter((word) => word !== "template").join(","),
);

const serverBlocks = setOf(listOf(textSource, "const BLOCK_TAGS"), new Set([...noise, "block", "tags", "h", "b", "z", "hr", "br"]));
const browserBlocks = setOf(listOf(anchorSource, "const BLOCK_TAGS"), new Set([...noise, "block", "tags", "h1", "h2", "h3", "h4", "h5", "h6"]));
console.log(`   サーバーの行の境目: ${serverBlocks}`);
console.log(`   ブラウザの行の境目: ${browserBlocks}`);
ok("行を切るタグの顔ぶれが揃っている（見出しと空要素を除く）", browserBlocks, serverBlocks);

console.log("\n--- こちらが足したものを本文として数えないか ---");
/*
 * 「過去の版です」の帯も、挿し戻した文も、書いた人の文章ではない。
 * 数えると、足した文字のぶんだけ本文の位置がそっくりずれ、印が全部よそへ行く。
 */
{
  const body = `<p>一つ目の段落。</p><p>二つ目の段落。</p>`;
  const plain = new JSDOM(page(body));
  const withBanner = new JSDOM(
    page(`<div role="status" data-surprise-version-banner="">過去の版（abc1234）を表示しています 最新の版を見る</div>${body}`),
  );

  const read = async (dom) => {
    global.window = dom.window;
    global.document = dom.window.document;
    global.Node = dom.window.Node;
    global.Text = dom.window.Text;
    global.NodeFilter = dom.window.NodeFilter;
    global.Element = dom.window.Element;
    const reader = await import(`${dir}/rl-anchor.mjs?v=${Math.random()}`);
    return condense(reader.buildTextIndex().text);
  };

  ok("帯があっても本文の読み取りは変わらない", await read(withBanner), await read(plain));

  const withExport = new JSDOM(page(`<surprise-page-export>書き出す</surprise-page-export>${body}`));
  ok("書き出す口があっても本文の読み取りは変わらない", await read(withExport), await read(plain));
}

console.log("\n--- 帯を隠して戻したとき、元の並べ方が保たれるか ---");
/*
 * 帯は要素に直接 display:flex を書いており、その flex が文と文の間隔（gap）を作っている。
 * 空文字で戻すと flex ごと消え、「表示しています最新の版を見る」と字が詰まる。
 * `hidden` 属性でも隠れない（[hidden] の既定は inline の指定に負ける）ので、
 * 元の値を控えて書き戻すしかない。ここはその往復を見張る。
 */
{
  const banner =
    `<div role="status" data-surprise-version-banner="" ` +
    `style="position:sticky;top:0;display:flex;align-items:center;gap:12px">` +
    `<span>過去の版（abc1234）を表示しています</span><a href="/internal/x">最新の版を見る</a></div>`;
  const dom = new JSDOM(page(`${banner}<p>本文です。</p>`));
  global.window = dom.window;
  global.document = dom.window.document;
  global.Node = dom.window.Node;
  global.Text = dom.window.Text;
  global.NodeFilter = dom.window.NodeFilter;
  global.Element = dom.window.Element;
  global.HTMLElement = dom.window.HTMLElement;
  dom.window.matchMedia = () => ({ matches: false, addEventListener() {} });

  const mod = await import(`${dir}/rl-widget.mjs?v=${Math.random()}`);
  const found = dom.window.document.querySelector("[data-surprise-version-banner]");
  const before = found.getAttribute("style");

  mod.setVersionBannerHidden(true);
  ok("隠れている", found.style.display, "none");
  mod.setVersionBannerHidden(false);
  ok("並べ方が戻っている", found.style.display, "flex");
  ok("間隔も戻っている", found.style.gap, "12px");
  /*
   * 素の文字列で比べない。指定に触ると書き方が整えられる（top:0 → top: 0px）ので、
   * 中身が同じでも文字としては変わる。**指定を 1 つずつ**突き合わせる。
   */
  const declarations = (element) => {
    const found = [];
    for (let i = 0; i < element.style.length; i += 1) {
      const name = element.style.item(i);
      found.push(`${name}=${element.style.getPropertyValue(name)}`);
    }
    return found.sort().join(" / ");
  };
  const scratch = dom.window.document.createElement("div");
  scratch.setAttribute("style", before);
  ok("見た目の指定がまるごと元どおり", declarations(found), declarations(scratch));

  // 2 回続けて呼んでも、控えを取り違えて none のまま焼き付かないこと
  mod.setVersionBannerHidden(true);
  mod.setVersionBannerHidden(true);
  mod.setVersionBannerHidden(false);
  ok("二重に隠しても戻る", found.style.display, "flex");
  mod.setVersionBannerHidden(false);
  ok("余分に戻しても壊れない", found.style.display, "flex");

  // 帯が無いページで呼んでも何も起きないこと
  const bare = new JSDOM(page(`<p>本文だけ。</p>`));
  global.document = bare.window.document;
  global.window = bare.window;
  mod.setVersionBannerHidden(true);
  mod.setVersionBannerHidden(false);
  ok("帯が無いページでも落ちない", bare.window.document.querySelectorAll("p").length, 1);
}

console.log("\n--- 実物のページで、両側の数え方が 1 文字も違わないか ---");
/*
 * ここが B1（表や <br> をまたぐ印が付かない）の元栓。
 * 作り物の事例をいくら並べても、実物の書き方の癖までは覆えない。
 * 検査用に写してあるページ（tests/checks/fixtures）を全部通し、**サーバーの取り出し結果と
 * ブラウザの読み取り結果を 1 文字ずつ突き合わせる**。
 * 直す前の how-to-use.html は、ここで 3 文字ずれていた。
 *
 * ページの正本は保管庫（Supabase）だが、そこを読みに行かせると
 * 検査のたびに本番の鍵が要る。材料だけを写して持ち歩く。
 */
const { readdir } = await import("node:fs/promises");

async function pagesUnder(base) {
  const found = [];
  const walk = async (at) => {
    let rows;
    try {
      rows = await readdir(at, { withFileTypes: true });
    } catch {
      return;
    }
    for (const row of rows) {
      if (row.isDirectory()) await walk(`${at}/${row.name}`);
      else if (row.name.endsWith(".html")) found.push(`${at}/${row.name}`);
    }
  };
  await walk(base);
  return found.sort();
}

const files = await pagesUnder(`${root}/tests/checks/fixtures`);
ok("見つかったページの数が 1 枚以上", files.length >= 1, true);

for (const file of files) {
  const html = await (await import("node:fs/promises")).readFile(file, "utf8");
  const dom = new JSDOM(html);
  global.window = dom.window;
  global.document = dom.window.document;
  global.Node = dom.window.Node;
  global.Text = dom.window.Text;
  global.NodeFilter = dom.window.NodeFilter;
  global.Element = dom.window.Element;

  const reader = await import(`${dir}/rl-anchor.mjs?v=${Math.random()}`);
  // スライドの公開の補足を並べる部品は、スライドのページでだけ後から読む（道具箱の立ち上げと同じ順で待つ）
  await reader.prepareDeckSupplements(() => undefined);
  const browser = condense(reader.buildTextIndex().text);
  const server = condense(htmlBodyText(html));
  ok(`両側が一致: ${file.slice(root.length + 1)}`, browser === server, true);
  if (browser !== server) {
    let at = 0;
    while (at < server.length && server.charAt(at) === browser.charAt(at)) at += 1;
    console.log(`     最初のずれ ${at} 文字目`);
    console.log(`     サーバー  : ${JSON.stringify(server.slice(Math.max(0, at - 20), at + 30))}`);
    console.log(`     ブラウザ  : ${JSON.stringify(browser.slice(Math.max(0, at - 20), at + 30))}`);
  }
}

console.log("\n--- 本文の赤入れは塗らない（コメントの印と役割を形で分ける）---");
/*
 * コメントの引用は「塗りだけ（蛍光ペン）」、赤入れは「線だけ」。
 * 同じ本文の上に出るもの同士なので、**片方が塗りを使ったら、もう片方は使えない**。
 * 塗りが 1 か所でも残ると「どっちがコメントで、どっちが直しか」が読めなくなるので、
 * いま見ている 1 件の強調も含めて、塗りが無いことを見張る。
 */
{
  const older = page(`<p>売上は 12% 伸びました。</p><p>次の四半期。</p>`);
  const newer = page(`<p>売上は 18% 伸びました。</p><p>次の四半期。</p>`);
  // 印は新しい版の本文の上に置くので、DOM は新しいほう
  const dom = new JSDOM(newer);
  const diff = redlineDiff(older, newer);
  global.window = dom.window;
  global.document = dom.window.document;
  global.Node = dom.window.Node;
  global.Text = dom.window.Text;
  global.NodeFilter = dom.window.NodeFilter;
  global.Element = dom.window.Element;
  global.HTMLElement = dom.window.HTMLElement;
  dom.window.matchMedia = () => ({ matches: false, addEventListener() {} });

  const mod = await import(`${dir}/rl-widget.mjs?v=${Math.random()}`);
  mod.applyRedline(diff.changes);
  const marks = [...dom.window.document.querySelectorAll("ins,del")];
  ok("印が置かれている", marks.length >= 2, true);

  const painted = marks.filter((node) => {
    const fill = node.style.background;
    return fill !== "" && fill !== "transparent" && fill !== "none";
  });
  ok("ふだんの印に塗りが無い", painted.length, 0);
  ok("下線が引かれている", dom.window.document.querySelector("ins").style.textDecorationLine, "underline");
  ok("取り消し線が引かれている", dom.window.document.querySelector("del").style.textDecorationLine, "line-through");
  ok("字送りを動かさない（余白 0）", dom.window.document.querySelector("ins").style.padding, "0px");

  // いま見ている 1 件の強調も、塗りではなく線の太さで示す
  const before = dom.window.document.querySelector("ins").style.textDecorationThickness;
  mod.repaintRedline(diff.changes, diff.changes.find((c) => c.kind === "add").index);
  const active = dom.window.document.querySelector("ins");
  ok("強調しても塗らない", active.style.background, "transparent");
  ok("強調は線を太くして示す", Number.parseFloat(active.style.textDecorationThickness) > Number.parseFloat(before), true);

  mod.repaintRedline(diff.changes, 0);
  ok("強調を解くと太さが戻る", dom.window.document.querySelector("ins").style.textDecorationThickness, before);
}

console.log("\n--- 見た目の値に、塗り用のものが残っていないか ---");
const tokenSource = await (await import("node:fs/promises")).readFile(`${root}/src/widget/shared/tokens.ts`, "utf8");
const redlineBlock = /export const REDLINE = \{[\s\S]*?\} as const;/.exec(tokenSource)[0];
ok("足した文の塗りが無い", /addTint/.test(redlineBlock), false);
ok("消した文の塗りが無い", /delTint/.test(redlineBlock), false);
ok("強調の塗りが無い", /activeAdd|activeDel/.test(redlineBlock), false);
ok("強調の太さがある", /activeThickness/.test(redlineBlock), true);
// 板の一覧に敷く薄い地色は残す（本文ではないので、コメントの印とは混ざらない）
ok("板の一覧の地色は残っている", /--diff-add-soft/.test(tokenSource), true);
ok("板の一覧の地色は残っている（消した側）", /--diff-del-soft/.test(tokenSource), true);

console.log("\n--- 変わった段落の左に引く縦線 ---");
/*
 * 本文の要素には触らない。ページ本体と同じ座標に置いた 1 枚の上へ、
 * 測った位置ぶんだけ線を並べる。要素に枠や余白を足す方式だと、
 * 幅の決まった箱・箇条書きの点・表の骨組みと当たってページの体裁を壊す。
 */
{
  const body = `<p>売上は 12% 伸びました。</p><p>変わらない段落です。</p>`;
  const after = `<p>売上は 18% 伸びました。</p><p>変わらない段落です。</p>`;
  const dom = new JSDOM(page(after));
  global.window = dom.window;
  global.document = dom.window.document;
  global.Node = dom.window.Node;
  global.Text = dom.window.Text;
  global.NodeFilter = dom.window.NodeFilter;
  global.Element = dom.window.Element;
  global.HTMLElement = dom.window.HTMLElement;
  dom.window.matchMedia = () => ({ matches: false, addEventListener() {} });
  // jsdom は場所を測れないので、段落の位置と大きさだけ作り物で答える
  const paragraphs = [...dom.window.document.querySelectorAll("p")];
  paragraphs[0].getBoundingClientRect = () => ({ top: 100, left: 40, width: 600, height: 24 });
  paragraphs[1].getBoundingClientRect = () => ({ top: 140, left: 40, width: 600, height: 24 });

  const mod = await import(`${dir}/rl-widget.mjs?v=${Math.random()}`);
  const diff = redlineDiff(page(body), page(after));
  mod.applyRedline(diff.changes);
  const drawn = mod.drawChangeBars();

  ok("変わった段落にだけ線が引かれる", drawn, 1);
  const bars = [...dom.window.document.querySelectorAll("[data-surprise-redline-bars]")];
  // 1 枚の層と、その中の線
  ok("層は 1 枚だけ", bars.filter((node) => node.style.width === "0px").length, 1);
  const bar = bars.find((node) => node.style.width !== "0px");
  ok("線の太さ", bar.style.width, "2px");
  ok("段落の高さに合わせる", bar.style.height, "24px");
  ok("段落の左の外に出る", Number.parseFloat(bar.style.left) < 40, true);
  ok("段落の上に合わせる", bar.style.top, "100px");

  ok("本文の要素には触っていない", paragraphs[0].style.borderLeft, "");
  ok("本文に余白を足していない", paragraphs[0].style.marginLeft, "");
  ok("線は本文の外に置く（段落の子ではない）", paragraphs[0].querySelector("[data-surprise-redline-bars]"), null);

  mod.clearRedline();
  ok(
    "外すと線も消える",
    dom.window.document.querySelectorAll("[data-surprise-redline-bars]").length,
    0,
  );
}

// 表の升目の中は、段落として取れる入れ物が無い。無理に出さない
{
  const older = page(`<table><tbody><tr><td>りんご 100 円</td></tr></tbody></table>`);
  const newer = page(`<table><tbody><tr><td>りんご 120 円</td></tr></tbody></table>`);
  const dom = new JSDOM(newer);
  global.window = dom.window;
  global.document = dom.window.document;
  global.Node = dom.window.Node;
  global.Text = dom.window.Text;
  global.NodeFilter = dom.window.NodeFilter;
  global.Element = dom.window.Element;
  global.HTMLElement = dom.window.HTMLElement;
  dom.window.matchMedia = () => ({ matches: false, addEventListener() {} });
  dom.window.document.querySelector("td").getBoundingClientRect = () => ({
    top: 10,
    left: 40,
    width: 200,
    height: 20,
  });

  const mod = await import(`${dir}/rl-widget.mjs?v=${Math.random()}`);
  mod.applyRedline(redlineDiff(older, newer).changes);
  ok("表の升目には縦線を出さない", mod.drawChangeBars(), 0);
  ok("表の骨組みに何も足していない", dom.window.document.querySelectorAll("tr > div").length, 0);
}

console.log("\n--- 帯が狭くなったとき、先に削られるもの ---");
/*
 * 「8月7日 さ…」では誰の版か分からない。幅が足りないときに削るのは日付のほうで、
 * 人の名前は残す。どちらの版かは矢印の左右で分かるので、日付が縮んでも用は足りる。
 */
const { readFile } = await import("node:fs/promises");
const styles = await readFile(`${root}/src/widget/shared/styles.ts`, "utf8");
const widget = await readWidgetSource();
const rule = (name) => {
  const found = new RegExp(`\\.${name}\\s*\\{([^}]*)\\}`).exec(styles);
  return found === null ? "" : found[1];
};

ok("日付と名前が別々の字になっている", /compare-when[\s\S]{0,200}compare-who/.test(widget), true);
ok("日付は縮む", /flex:\s*0 1 auto/.test(rule("compare-when")), true);
ok("日付は削られたら … になる", /text-overflow:\s*ellipsis/.test(rule("compare-when")), true);
ok("名前は縮まない", /flex:\s*none/.test(rule("compare-who")), true);
ok("名前は折り返さない", /white-space:\s*nowrap/.test(rule("compare-who")), true);
ok("入れ物が縮める形になっている", /min-width:\s*0/.test(rule("compare-version")), true);

console.log("\n--- 帯の凡例（どちらが足したのか、を形で示す）---");
/*
 * 「下線＝足した / 取り消し線＝消した」を、説明の文ではなく**形そのもの**で見せる。
 * 場所が足りなくなったら、いちばん先に譲るのが凡例（人名 > 件数 > 凡例）。
 */
ok("帯に凡例の場所がある", /grid-template-areas: "pair legend count nav end"/.test(styles), true);
ok("足した側の見本がある", /legend-add/.test(widget), true);
ok("消した側の見本がある", /legend-del/.test(widget), true);
ok(
  "見本は本文と同じ形を使う（下線）",
  /\.change-text\.is-add, \.legend-add/.test(styles),
  true,
);
ok(
  "見本は本文と同じ形を使う（取り消し線）",
  /\.change-text\.is-del, \.legend-del/.test(styles),
  true,
);
ok("印が 1 つも無いときは出さない", /legend\.hidden = /.test(widget), true);

// 幅が足りないときに削られる順。凡例がいちばん先
const built = await import(`${dir}/rl-styles.mjs?v=${Math.random()}`);
const breakpoint = /@media \(max-width: (\d+)px\) \{\s*\.compare-legend \{ display: none; \}/.exec(
  built.STYLES,
);
ok("狭くなったら凡例を隠す指定がある", breakpoint !== null, true);
ok("しきい値が数として入っている", Number(breakpoint[1]) > 640, true);
ok("いちばん狭いときも隠す", /:host\(\.is-narrow\) \.compare-legend \{ display: none; \}/.test(built.STYLES), true);
// 人名と件数は、どの幅でも隠さない
ok("人名は隠さない", /compare-who \{ display: none/.test(built.STYLES), false);
ok("件数は隠さない", /compare-count \{ display: none/.test(built.STYLES), false);

console.log("\n--- 置けない件数の言い方を分ける ---");
ok("探して見つからなかったもの", /t\("toolbox\.history\.changesLost"/.test(widget) && /場所を特定できませんでした/.test(TOOLBOX_JA), true);
ok("そもそも置く先が無いもの", /t\("toolbox\.history\.changesHomeless"/.test(widget) && /本文に印を置けません/.test(TOOLBOX_JA), true);
ok(
  "置く先が無いものを「特定できない」に混ぜない",
  /const homeless[\s\S]{0,200}place === "none"/.test(widget),
  true,
);

console.log("\n--- 長い範囲は頭と尻だけ覚える ---");
const long = redlineDiff(
  page(`<p>まえ。</p>`),
  page(`<p>まえ。</p><p>${"ながい文。".repeat(40)}</p>`),
);
const wide = long.changes.find((change) => change.anchor.tail !== null);
ok("尻も覚えている変更がある", wide !== undefined, true);
ok("頭は 60 文字まで", wide.anchor.head.length <= 60, true);
ok("尻は 60 文字まで", wide.anchor.tail.length <= 60, true);
ok("前後の文脈は 50 文字まで", wide.anchor.before.length <= 50 && wide.anchor.after.length <= 50, true);

console.log("\n--- 広い範囲で比較したことを伝える ---");
ok("帯に通常の変更件数と異なる案内がある", widget.includes('t("toolbox.history.coarse")') && TOOLBOX_JA.includes("広い範囲で比較しています"), true);
ok("変更していない文章も含まれることを伝える", widget.includes('t("toolbox.history.coarseNote")') && TOOLBOX_JA.includes("変更していない文章も含まれます"), true);
