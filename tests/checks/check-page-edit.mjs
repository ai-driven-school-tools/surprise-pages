import { readWidgetSource } from "./widget-source.mjs";
import { databaseStub, readAccessSource, companyDeployment } from "./paths.mjs";
/**
 * 「ページの本文をブラウザから直す」仕組みを確かめる。
 *
 * 直しは 3 つの部品でできている:
 *   可否 … src/lib/access/access.ts の canEditPage（管理者・作った人・共同の作った人）
 *   口   … src/app/api/pages/edit（取り寄せと保存。積み方は投稿と同じ commitRevision）
 *   画面 … src/widget/editor/editor.ts + src/widget/editor/markdown.ts + src/widget/editor/draft.ts
 *         （ブロック単位のマークダウン風編集と、保存し忘れの控え）
 *
 * ここで見るのは 7 つ。
 *   1. 直してよいかを決める部品が 1 つだけか（実際に呼んで総当たり）
 *   2. 口が門と部品を通り、すれ違いを見つけ、見せ方に触らないか
 *   3. ボタンを出す旗（features.edit）も同じ部品から出ているか
 *   4. マークダウン風の往復で、押していない飾りが 1 バイトも変わらないか（実際に変換）
 *   5. 編集の画面が、目印をプレビューにだけ付け、正本の木を保存しているか
 *   6. 下書きの控え（形・失効・版の照合・画面への組み込み）
 *   7. 保存の検査（壊れた HTML と、差し込みの焼き付きを、土台より増えたら断る）
 *
 * 保管庫にもネットワークにも繋がない。判定と変換だけを取り出して、実際に呼んで確かめる。
 */
import { readFile, writeFile } from "node:fs/promises";

import { root, dir } from "./paths.mjs";
const { JSDOM } = await import("jsdom");
const { build } = await import(`${root}/node_modules/esbuild/lib/main.js`);

const read = (path) => readFile(`${root}/${path}`, "utf8");
const strip = (text) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");

let fails = 0;
const ok = (label, actual, expected) => {
  const pass = String(actual) === String(expected);
  if (!pass) fails += 1;
  console.log(`${pass ? "OK  " : "NG  "} ${label}: ${actual}（期待: ${expected}）`);
};

const ACCESS = strip(readAccessSource());
const AUTH = await readFile(`${root}/src/auth.ts`, "utf8");
const ROUTE = strip(await read("src/app/api/pages/edit/route.ts"));
const EDIT_GATE = strip(await read("src/lib/access/page-edit-access.ts"));
const STORE = strip(await read("src/lib/pages/store.ts"));
const PAGES_API = strip(await read("src/app/api/pages/route.ts"));
const COMMENTS_API = strip(await read("src/app/api/comments/route.ts"));
const TYPES = strip(await read("src/lib/comments/types.ts"));
const WIDGET = strip(await readWidgetSource());
const WIDGET_API = strip(await read("src/widget/shared/api.ts"));
const EDITOR = strip(await read("src/widget/editor/editor.ts"));
const EDITOR_RAW = await read("src/widget/editor/editor.ts");
// 断り文と画面の文言は辞書（日本語が正本）。入口と画面はその鍵を引き、字そのものは辞書で見る
const TOOLBOX_JA = await read("src/lib/i18n/messages/ja/toolbox.ts");
const MARKDOWN = strip(await read("src/widget/editor/markdown.ts"));
const HTML_CHECK = strip(await read("src/lib/html/check.ts"));

// ---------------------------------------------------------------------------
console.log("--- 1. 直してよいかを決める部品は 1 つだけか ---");
console.log("   顔ぶれは共有と同じ 3 人。ただし公開として投稿したページでも直せる（条件が 1 つ少ない）");

ok("部品がある", (ACCESS.match(/export function canEditPage/g) ?? []).length, 1);
ok("入口が自分で顔ぶれを数え直していない（route に created_by の比較が無い)", /createdBy|created_by/.test(ROUTE), false);

// ログイン・保管庫への接ぎ口だけ差し替えて、判定を取り出す（check-access と同じやり方）
const DOMAIN = /ALLOWED_DOMAIN = "([^"]+)"/.exec(AUTH)?.[1] ?? "";
await writeFile(
  `${dir}/page-edit-stub.mjs`,
  `export const ALLOWED_DOMAIN = ${JSON.stringify(DOMAIN)};\n` +
    "export const auth = async () => null;\n" +
    "export const cookies = async () => ({ get: () => undefined });\n" +
    "export const headers = async () => ({ get: () => null });\n" +
    'export const createClient = () => { throw new Error("検査では保管庫に繋がない"); };\n',
);
await build({
  entryPoints: [`${root}/src/lib/access/access.ts`],
  outfile: `${dir}/page-edit-access.mjs`,
  bundle: true, plugins: [companyDeployment],
  format: "esm",
  platform: "node",
  external: ["node:*"],
  alias: {
    "@/auth": `${dir}/page-edit-stub.mjs`,
    "next/headers": `${dir}/page-edit-stub.mjs`,
    "@/lib/db/database": databaseStub(`${dir}/page-edit-stub.mjs`),
  },
});
const { canEditPage, canManageSharing } = await import(`${dir}/page-edit-access.mjs`);

const OWNER = `taro@${DOMAIN}`;
const OTHER = `hanako@${DOMAIN}`;
const member = (email) => ({ kind: "member", email, name: null, image: null });
const GUEST = { kind: "guest", guestId: "g1", name: "ゲスト" };

const page = (extra = {}) => ({
  id: "p1",
  pageSlug: "internal/example/hello",
  visibility: "internal",
  title: "例",
  currentVersionId: "a".repeat(40),
  createdBy: OWNER,
  deletedAt: null,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
  ...extra,
});

const cases = [
  ["名乗っていない人", null, page(), false, false],
  ["ゲスト（名前だけの人）", GUEST, page(), false, false],
  ["会社の人（作っていない）", member(OTHER), page(), false, false],
  ["作った人", member(OWNER), page(), false, true],
  ["管理者", member(OTHER), page(), true, true],
  ["作った人（大文字・空白違い）", member(` ${OWNER.toUpperCase()} `), page(), false, true],
];
for (const [label, identity, target, admin, expected] of cases) {
  ok(`  ${label} → ${expected ? "直せる" : "直せない"}`, canEditPage(identity, target, admin), expected);
}
ok("  共同の作った人（owner の許可）→ 直せる", canEditPage(member(OTHER), page(), false, true), true);
ok("  渡さなければ owner の許可は効かない（既定 false）", canEditPage(member(OTHER), page(), false), false);
ok("  消したページは作った人でも直せない", canEditPage(member(OWNER), page({ deletedAt: "2026-01-02T00:00:00Z" }), false), false);
ok("  消したページは管理者でも直せない", canEditPage(member(OTHER), page({ deletedAt: "2026-01-02T00:00:00Z" }), true), false);

console.log("\n   共有（canManageSharing）との違いは「見せ方を動かせるページか」の 1 つだけ");
const publicBorn = page({ pageSlug: "public/guide/intro", visibility: "public" });
ok("  公開として投稿したページ: 共有は触れない", canManageSharing(member(OWNER), publicBorn, false), false);
ok("  公開として投稿したページ: 本文は作った人が直せる", canEditPage(member(OWNER), publicBorn, false), true);
ok("  制限つきのページも作った人が直せる", canEditPage(member(OWNER), page({ visibility: "restricted" }), false), true);

// ---------------------------------------------------------------------------
console.log("\n--- 2. 口（/api/pages/edit）の門と作法 ---");
console.log("   門は他の入口と同じ openPage。直してよいかは canEditPage。積むのは commitRevision");

ok("名乗りは currentIdentity（入口に鍵の照合を書き足さない）", /await currentIdentity\(\)/.test(ROUTE), true);
ok("ownerFromRequest を入口に置かない（鍵も currentIdentity が読む）", /ownerFromRequest/.test(ROUTE), false);
ok("取り寄せと保存の両方がある（GET / PUT）", /export async function GET/.test(ROUTE) && /export async function PUT/.test(ROUTE), true);
ok("取り寄せと保存は共通の門を通る", (ROUTE.match(/await loadEditable\(organization, viewer, page.slug\)/g) ?? []).length === 2 && /openPage\(organization, viewer, pageSlug\)/.test(EDIT_GATE), true);
ok("直してよいかは部品に聞く", /canEditPage\(current, gate\.page, admin, ownerGrant\)/.test(EDIT_GATE), true);
// 直す門は保存の途中（共同編集の再確認）でも呼ばれるので、いまの所属を引き直してから決める
ok("直してよいかは、いまの所属で決める（名乗りを作ったときの役割のままにしない）", /const \[current, first\] = await Promise\.all\(\[stillMember\(organization, viewer\), openPage\(organization, viewer, pageSlug\)\]\);/.test(EDIT_GATE), true);
ok(
  "「管理者か」と「共同の作った人か」は同時に投げる",
  /Promise\.all\(\[\s*isAdmin\(organization, current\),\s*gate\.page\.visibility === "restricted" \? hasOwnerGrant\(organization, gate\.page\.id, viewer\.email\) : Promise\.resolve\(false\),\s*\]\)/.test(
    EDIT_GATE,
  ),
  true,
);
ok(
  "共同の作った人を引くのは制限つきだけ",
  /gate\.page\.visibility === "restricted" \? hasOwnerGrant\(organization, gate\.page\.id, viewer\.email\) : Promise\.resolve\(false\)/.test(
    EDIT_GATE,
  ),
  true,
);
ok("直せない人には「無い」と返す（404。403 で持ち主でないことを教えない）", (EDIT_GATE.match(/jsonError\(rt\("toolbox\.server\.pageNotFound"\), 404\)/g) ?? []).length, 2);
ok("無いページの断りは「無い」とだけ言う", /pageNotFound: "そのページはありません"/.test(TOOLBOX_JA), true);

console.log("\n   保存のすれ違い（2 人が同時に直したとき）を黙って上書きしない");
ok("土台にした版を必ず言ってもらう", /rt\("toolbox\.server\.edit\.baseRequired"\)/.test(ROUTE) && /baseRequired: "[^"]*baseVersionId[^"]*の指定がありません"/.test(TOOLBOX_JA), true);
ok("すれ違いは commitRevision に expectedHead を渡して照合する", /expectedHead: baseVersionId\.trim\(\)/.test(ROUTE), true);
ok("事前照合（currentVersionId）は置かない", /currentVersionId !== baseVersionId/.test(ROUTE), false);
ok("すれ違いは StaleBaseError を 409 で止める", /StaleBaseError\) return jsonError\(deckErrorMessage\(error, requestTranslate\(\)\), 409\)/.test(ROUTE), true);
ok("積み方は投稿と同じ 1 つ（commitRevision）", /await commitRevision\(\{/.test(ROUTE), true);
ok(
  "同時に積もうとしたときの断り（RevisionRaceError）も 409",
  /RevisionRaceError/.test(ROUTE) && /jsonError\(\s*rt\("toolbox\.server\.edit\.race"\)/.test(ROUTE) && /race: "ほかの保存と重なりました/.test(TOOLBOX_JA),
  true,
);
ok(
  "RevisionRaceError の文言は保存向けに差し替える（投稿向けの message を出さない）",
  /RevisionRaceError\) return jsonError\(error\.message, 409\)/.test(ROUTE),
  false,
);
ok("書いた人はサーバーの名乗りから採る", /author: \{ email: viewer\.email, name: viewer\.name \}/.test(ROUTE), true);
ok("本文の上限は投稿と同じ 5MB", /MAX_HTML_BYTES = 5 \* MB/.test(ROUTE), true);

console.log("\n   すれ違いの照合は commitRevision の 1 か所（投稿の口は今までどおり）");
ok("CommitInput に expectedHead がある", /expectedHead\?: string \| null/.test(STORE), true);
ok(
  "findHeadRevision の後に照合している",
  /const head = await findHeadRevision\(page\);[\s\S]*?if \(input\.expectedHead !== undefined\)/.test(STORE),
  true,
);
ok("StaleBaseError が export されている", /export class StaleBaseError/.test(STORE), true);
ok(
  "照合は「中身が同じなら積まない」より前",
  STORE.indexOf("input.expectedHead !== undefined") !== -1 &&
    STORE.indexOf("shouldStackRevision(head.html, html)") !== -1 &&
    STORE.indexOf("input.expectedHead !== undefined") < STORE.indexOf("shouldStackRevision(head.html, html)"),
  true,
);
ok("スライドの投稿も expectedHead を渡す", /expectedHead/.test(PAGES_API), true);

console.log("\n   ここでは見せ方（visibility）に一切触らない（変える口は共有範囲の画面だけ）");
ok("commitRevision に restricted を渡していない", /restricted:/.test(ROUTE), false);
ok("setPageScope を呼んでいない", /setPageScope/.test(ROUTE), false);

console.log("\n   取り寄せは 2 枚（正本とプレビュー）を別々に返し、差し込みはサーバーが持つ");
ok(
  "プレビューは配信と同じ部品で作る",
  /withVendorScripts\(/.test(ROUTE) && /withAssetBase\(/.test(ROUTE) && /withSafeAnchorIds\(/.test(ROUTE),
  true,
);
ok("道具箱の札（withCommentsWidget）は入れない", /withCommentsWidget/.test(ROUTE), false);
ok("いま出ている版の目印も一緒に返す", /baseVersionId: found\.page\.currentVersionId/.test(ROUTE), true);

// ---------------------------------------------------------------------------
console.log("\n--- 3. ボタンを出す旗（features.edit）も同じ部品から出ているか ---");

ok("旗の形がある", /edit: boolean;/.test(TYPES), true);
ok("配る側は canEditPage から立てる", /let edit = canEditPage\(viewer, gate\.page, admin\);/.test(COMMENTS_API), true);
ok("共同の作った人は 1 回の照会を 2 つの旗で使い回す", /sharing = canManageSharing\(viewer, gate\.page, admin, ownerGrant\);\s*edit = canEditPage\(viewer, gate\.page, admin, ownerGrant\);/.test(COMMENTS_API), true);
// 閉じた答えの末尾は write（の入場券で倒れる旗）。edit はその手前
ok("閉じた答えでは倒れている", /edit: false,\s*write: false,\s*\},\s*\};\s*\}/.test(COMMENTS_API), true);
ok("受け取る側も同じ名前で読む", /edit: record\["edit"\] === true,/.test(WIDGET_API), true);
ok("ボタンは旗が立ったときだけ出す", /state\.features\.edit && (?:historyFeature\.)?loadedVersion === null/.test(WIDGET), true);
console.log("      ※ 過去の版（?v=）を見ている間は出さない（見ているものと直すものが食い違う）");

// ---------------------------------------------------------------------------
console.log("\n--- 4. マークダウン風の往復（実際に変換して確かめる） ---");
console.log("   畳めるのは素の強調・斜め・code・リンクだけ。それ以外の飾りは HTML のまま 1 バイトも変えない");

await build({
  entryPoints: [`${root}/src/widget/editor/markdown.ts`],
  outfile: `${dir}/page-edit-markdown.mjs`,
  bundle: true, plugins: [companyDeployment],
  format: "esm",
  platform: "neutral",
});
const md = await import(`${dir}/page-edit-markdown.mjs`);

const dom = new JSDOM("<!DOCTYPE html><html><body></body></html>");
const win = dom.window;
for (const name of ["Element", "Text", "Comment", "Node", "document"]) {
  Object.defineProperty(globalThis, name, { value: win[name], configurable: true, writable: true });
}

const block = (html, tag = "p") => {
  const node = win.document.createElement(tag);
  node.innerHTML = html;
  return node;
};

/** HTML → マークダウン風 → HTML の往復で、中身が変わらないか。 */
const roundtrip = (label, html, wantMd) => {
  const source = block(html);
  const text = md.blockToMarkdown(source);
  ok(`  ${label}: 文字にする`, text, wantMd);
  const rebuilt = block(md.inlineHtmlOf(text));
  ok(`  ${label}: 戻して同じ`, rebuilt.innerHTML, source.innerHTML);
};

roundtrip("素の文", "おはよう", "おはよう");
roundtrip("強い", "本文の<strong>大事</strong>なところ", "本文の**大事**なところ");
roundtrip("斜め", "<em>こっそり</em>言う", "*こっそり*言う");
roundtrip("code", "鍵は <code>PAGES_TOKEN</code> に入れる", "鍵は `PAGES_TOKEN` に入れる");
roundtrip("リンク", '先に <a href="/internal/guide">手引き</a> を読む', "先に [手引き](/internal/guide) を読む");
roundtrip("改行", "一行目<br>二行目", "一行目\n二行目");
// 入れ子の端が * になるので畳まない（***x*** は戻すと入れ子の向きが変わる）
roundtrip("入れ子", "<strong>とても<em>強い</em></strong>", "<strong>とても<em>強い</em></strong>");

console.log("\n   隣接・入れ子・空の強調は、境界が壊れるので畳まない（往復の HTML は 1 バイトも変わらない）");
console.log("      ※ 先頭の素の強調は畳めるが、直後が * 始まりになると境界を取り違えるので続きは HTML のまま");
roundtrip("隣接する強調と斜め", "<strong>a</strong><em>b</em>", "**a**<em>b</em>");
roundtrip("隣接する強い同士", "<strong>a</strong><strong>b</strong>", "**a**<strong>b</strong>");
roundtrip("入れ子（斜めの中の強い）", "<em><strong>x</strong></em>", "<em><strong>x</strong></em>");
roundtrip("空の強調", "<strong></strong>x", "<strong></strong>x");
roundtrip(
  "コメント内の閉じタグ",
  '<span class="a">前<!-- </span> -->後</span>のこり',
  '<span class="a">前<!-- </span> -->後</span>のこり',
);

console.log("\n   マークダウンで表せない飾りは、HTML のまま通す（消さない・作り替えない）");
roundtrip(
  "class 付きの span",
  '値は <span class="text-emerald-600 font-bold">+12%</span> でした',
  '値は <span class="text-emerald-600 font-bold">+12%</span> でした',
);
roundtrip(
  "アイコン",
  '<i data-lucide="check" class="w-4 h-4"></i> 済んだ',
  '<i data-lucide="check" class="w-4 h-4"></i> 済んだ',
);
roundtrip(
  "span の入れ子（同じタグの深さを数える）",
  '<span class="a">外<span class="b">内</span>外</span>のまま',
  '<span class="a">外<span class="b">内</span>外</span>のまま',
);
roundtrip("class 付きの強調は畳まない", '<strong class="text-lg">大</strong>きい', '<strong class="text-lg">大</strong>きい');

console.log("\n   整形の空白（HTML の改行・字下げ）は 1 つの空白に畳む（描かれる見た目と同じ扱い）");
console.log("      ※ 畳まないと、道具が入れた整形の改行が「意図した改行」に見え、戻すと <br> に化ける");
ok("  改行と字下げが 1 つの空白になる", md.blockToMarkdown(block("一行め\n    二行め")), "一行め 二行め");
ok("  端の空白は落ちる", md.blockToMarkdown(block("\n    文章です\n  ")), "文章です");
ok("  折り返しを止める空白（nbsp）は畳まない", md.blockToMarkdown(block("A&nbsp;B")), "A\u00a0B");
ok("  強調の中の端の空白は残る", md.blockToMarkdown(block("<strong>強い </strong>あと")), "**強い **あと");

console.log("\n   <br> を畳んでよいのは素のものだけ（class 付きは見た目に効いている）");
ok("  class 付きの <br> は HTML のまま", md.blockToMarkdown(block('前<br class="md:hidden">後')), '前<br class="md:hidden">後');
ok("  戻しても属性が残る", block(md.inlineHtmlOf('前<br class="md:hidden">後')).innerHTML, '前<br class="md:hidden">後');

console.log("\n   本文に元からある記号を、開いて閉じただけで飾りに化けさせない");
roundtrip("アスタリスク", "a * b * c", "a \\* b \\* c");
roundtrip("かぎかっこ", "配列は [1, 2] と書く", "配列は \\[1, 2] と書く");
roundtrip("不等号", "x < y のとき", "x \\< y のとき");

console.log("\n   打ちかけの記号は捨てずに、ただの文字として残す");
ok("  閉じていない **", block(md.inlineHtmlOf("閉じない**まま")).textContent, "閉じない**まま");
ok("  リンクの形になっていない [", block(md.inlineHtmlOf("ただの[かっこ")).textContent, "ただの[かっこ");

console.log("\n   ブロックの区切り");
ok("  空行で割れる", JSON.stringify(md.splitBlocks("一つめ\n\n二つめ")), '["一つめ","二つめ"]');
ok("  全部消したら空", JSON.stringify(md.splitBlocks("  \n\n  ")), "[]");
ok("  1 枚ならそのまま", JSON.stringify(md.splitBlocks("そのまま")), '["そのまま"]');

console.log("\n   押して直せるブロックの見分け");
const host = win.document.createElement("div");
host.innerHTML =
  "<h1>題</h1><div class=\"grid\"><p>文章</p></div><ul><li>そのまま</li><li>入れ子<ul><li>下</li></ul></li></ul>" +
  "<table><tbody><tr><td>セル</td></tr></tbody></table><svg><text>絵の中</text></svg><pre><code>code</code></pre>";
win.document.body.appendChild(host);
ok("  h1 は押せる", md.isEditableBlock(host.querySelector("h1")), true);
ok("  div（構え）は押せない", md.EDITABLE_TAGS.includes("div"), false);
ok("  素の li は押せる", md.isEditableBlock(host.querySelector("li")), true);
ok("  一覧を抱えた li は押せない（中の li を押す）", md.isEditableBlock(host.querySelectorAll(":scope > ul > li")[1]), false);
ok("  表のセルは押せる", md.isEditableBlock(host.querySelector("td")), true);
ok("  絵（svg）の中は押せない", md.EDITABLE_TAGS.includes("text"), false);
const blocks = md.collectEditableBlocks(host);
ok("  数え上げは文書の並び順", blocks.map((one) => one.tagName.toLowerCase()).join(","), "h1,p,li,li,td");

console.log("\n   正本とプレビュー（差し込みだけが違う 2 枚）で、数え上げが 1 対 1 に並ぶ");
const pageHtml =
  "<!DOCTYPE html><html><head><script src=\"https://cdn.tailwindcss.com\"></script></head>" +
  "<body><h1>題</h1><p>文章</p><ul><li>行</li></ul></body></html>";
const previewHtml = pageHtml.replace("<head>", '<head><base href="/internal/example/">').replace(
  "https://cdn.tailwindcss.com",
  "/vendor/tailwind.js/abc",
);
const masterTree = new JSDOM(pageHtml).window.document;
const previewTree = new JSDOM(previewHtml).window.document;
const masterList = md.collectEditableBlocks(masterTree.body);
const previewList = md.collectEditableBlocks(previewTree.body);
ok("  数が同じ", masterList.length === previewList.length, true);
ok("  タグの並びも同じ", masterList.map((one) => one.tagName).join(","), previewList.map((one) => one.tagName).join(","));

/*
 * 図（mermaid）は**プレビューの中だけで描かれる**。描かれた絵の中には、札として
 * <p> や <span> が入っている。これを押せるブロックと数えると、プレビューにだけ
 * ブロックが増えて 2 本の木がずれ、押した場所と直る場所が食い違う。
 * 絵（svg）の中は押せない、という決まりがここを支えている。
 */
const diagramHtml =
  "<!DOCTYPE html><html><head></head><body><h1>題</h1>" +
  '<pre class="mermaid">flowchart LR\n  A[受け取る] --> B[配る]</pre>' +
  "<p>あとの文</p></body></html>";
const drawnHtml = diagramHtml.replace(
  /<pre class="mermaid">[\s\S]*?<\/pre>/,
  '<pre class="mermaid" data-processed="true"><svg role="graphics-document document">' +
    '<g class="node"><foreignObject width="80" height="24"><div xmlns="http://www.w3.org/1999/xhtml">' +
    '<span class="nodeLabel"><p>受け取る</p></span></div></foreignObject></g>' +
    '<g class="node"><foreignObject width="80" height="24"><div xmlns="http://www.w3.org/1999/xhtml">' +
    '<span class="nodeLabel"><p>配る</p></span></div></foreignObject></g>' +
    "</svg></pre>",
);
const diagramMaster = md.collectEditableBlocks(new JSDOM(diagramHtml).window.document.body);
const diagramDrawn = md.collectEditableBlocks(new JSDOM(drawnHtml).window.document.body);
ok("  図が描かれてもブロックは増えない", diagramDrawn.length, diagramMaster.length);
ok(
  "  図が描かれてもタグの並びは同じ",
  diagramDrawn.map((one) => one.tagName).join(","),
  diagramMaster.map((one) => one.tagName).join(","),
);
ok("  図の札（絵の中の p）は押せない", diagramDrawn.some((one) => one.closest("svg") !== null), false);

// ---------------------------------------------------------------------------
console.log("\n--- 5. 編集の画面の作り ---");
console.log("   木は 2 本。目印はプレビューにだけ付け、保存は目印の無い正本の木を書き出す");

ok("目印は共通の名前を使う", /EDIT_PREVIEW_MARK/.test(EDITOR), true);
ok("目印を付けるのはプレビューの木だけ", /previewBlocks\.forEach\(\(block, at\) => block\.setAttribute\(PREVIEW_MARK/.test(EDITOR), true);
ok("正本の木に目印を付けていない", /master\w*\.setAttribute\(PREVIEW_MARK/.test(EDITOR), false);
ok("本文編集は正本の木、デザインだけなら元の本文を書き出す", /html: current\.touched\.size === 0 \? current\.sourceHtml : serializeDocument\(current\.masterDoc\)/.test(EDITOR), true);
ok("土台にした版を添えて送る", /baseVersionId: current\.baseVersionId/.test(EDITOR), true);
ok("2 本の木のずれを開く前に確かめる", /alignedBlocks\(masterBlocks, previewBlocks\)/.test(EDITOR), true);
ok("直しの中身はブロック単位で正本に写す", /master\.innerHTML = htmls\[0\]/.test(EDITOR), true);
ok("欠測のブロックは null に落としてから判定する", (EDITOR.match(/masterBlocks\[at\] \?\? null/g) ?? []).length, 3);
ok("保存に失敗しても直しかけを道連れにしない", /showAlert\(result\.message\)/.test(EDITOR), true);
ok("中身が同じなら版を積まなかったことを伝える", /t\("toolbox\.editor\.unchanged"\)/.test(EDITOR) && /unchanged: "中身は前と同じでした/.test(TOOLBOX_JA), true);
ok("保存できたら最新の版を読み込み直す", /window\.location\.reload\(\)/.test(EDITOR), true);
ok("やめるときは 1 度だけ念を押す", /confirmingClose/.test(EDITOR), true);

console.log("\n   変換の部品は 1 か所（markdown.ts）。画面側で書き方を数え直さない");
ok("画面は部品を借りる", /from "\.\/markdown"/.test(EDITOR), true);
ok("画面が自前の変換を持っていない（escapeHtml が無い）", /function escapeHtml/.test(EDITOR), false);
ok("部品は DOM を作らない（createElement が無い）", /createElement/.test(MARKDOWN), false);

console.log("\n   通信は src/widget/shared/api.ts の 2 本だけ");
ok("取り寄せ", /export async function loadEditSource/.test(WIDGET_API), true);
ok("保存", /export async function saveEdit/.test(WIDGET_API), true);
ok("行き先はどちらも /api/pages/edit", (WIDGET_API.match(/\/api\/pages\/edit/g) ?? []).length, 2);
ok("プレビューを保存に使わない（saveEdit に previewHtml が無い）", /previewHtml/.test(/export async function saveEdit[\s\S]*?\n\}/.exec(WIDGET_API)?.[0] ?? ""), false);

// ---------------------------------------------------------------------------
console.log("\n--- 6. 下書きの控え(保存し忘れの保険) ---");
console.log("   形・失効・版の照合は edit-draft.ts が 1 か所で持つ。画面はそれを借りて書く・消す・再生する");

await build({
  entryPoints: [`${root}/src/widget/editor/draft.ts`],
  outfile: `${dir}/page-edit-draft.mjs`,
  bundle: true, plugins: [companyDeployment],
  format: "esm",
  platform: "neutral",
});
const draft = await import(`${dir}/page-edit-draft.mjs`);

const sample = {
  baseVersionId: "a".repeat(40),
  log: [
    { at: 2, markdown: "後から直した" },
    { at: 0, markdown: "先に直した" },
  ],
  message: "言い回し",
  savedAt: "2026-08-27T00:00:00.000Z",
};

const json = draft.serializeDraft(sample);
ok("  往復で同じ", JSON.stringify(draft.parseDraft(json)), json);
ok("  欄が欠けた JSON は null", draft.parseDraft(JSON.stringify({ baseVersionId: sample.baseVersionId })), null);
ok(
  "  型違い（log が文字列）は null",
  draft.parseDraft(JSON.stringify({ ...sample, log: "nope" })),
  null,
);
ok(
  "  log の要素が壊れている（at が文字列）は null",
  draft.parseDraft(JSON.stringify({ ...sample, log: [{ at: "0", markdown: "x" }] })),
  null,
);
ok(
  "  log の要素に markdown が無いものは null",
  draft.parseDraft(JSON.stringify({ ...sample, log: [{ at: 0 }] })),
  null,
);
ok("  空文字は null", draft.parseDraft(""), null);
ok("  null は null", draft.parseDraft(null), null);

const now = new Date("2026-08-27T12:00:00.000Z");
const ttl = draft.EDIT_DRAFT_TTL_MS;
ok("  TTL は 3 日", ttl, 3 * 24 * 60 * 60 * 1000);
const justBefore = { ...sample, savedAt: new Date(now.getTime() - ttl + 1).toISOString() };
const justAfter = { ...sample, savedAt: new Date(now.getTime() - ttl - 1).toISOString() };
ok("  TTL ちょうど手前は生き", draft.draftExpired(justBefore, now), false);
ok("  TTL を過ぎたら死ぬ", draft.draftExpired(justAfter, now), true);

const live = { ...sample, savedAt: now.toISOString() };
ok("  版が同じで生きていれば usable", draft.draftUsable(live, sample.baseVersionId, now), true);
ok("  版が違う控えは usable でない", draft.draftUsable(live, "b".repeat(40), now), false);
ok("  null は usable でない", draft.draftUsable(null, sample.baseVersionId, now), false);

ok("  上限は 256KB", draft.EDIT_DRAFT_MAX_BYTES, 256 * 1024);
ok("  小さい JSON は大きすぎない", draft.draftTooLarge("x"), false);
ok(
  "  上限を超えた JSON は大きすぎる",
  draft.draftTooLarge("x".repeat(draft.EDIT_DRAFT_MAX_BYTES + 1)),
  true,
);
ok("  鍵の接頭辞", draft.EDIT_DRAFT_PREFIX, "surprise-pages:edit-draft:");
ok("  鍵の組み立て", draft.draftKeyOf("internal/guide"), "surprise-pages:edit-draft:internal/guide");

console.log("\n   画面（editor.ts）が控えを借りて、書く・戻す・消す・警告する");
ok("commit のたびに writeDraft している", /log\.push/.test(EDITOR) && /writeDraft\(/.test(EDITOR), true);
ok(
  "復元は log を記録された順に再生している（ソートしていない）",
  /for \(const \{ at, markdown \} of draft\.log\)/.test(EDITOR) && /draft\.log\.sort/.test(EDITOR) === false,
  true,
);
ok(
  "版が一致しないと戻さない（draftUsable を通る）",
  /draftUsable\(draft, source\.value\.baseVersionId/.test(EDITOR),
  true,
);
ok("保存成功と破棄で clearDraft している", (EDITOR.match(/clearDraft\(/g) ?? []).length >= 2, true);
ok("beforeunload を張る", /addEventListener\("beforeunload"/.test(EDITOR), true);
ok("teardown で外す", /removeEventListener\("beforeunload"/.test(EDITOR), true);
ok("鍵の名前を editor.ts に直書きしていない", /surprise-pages:edit-draft/.test(EDITOR), false);

// ---------------------------------------------------------------------------
console.log("\n--- 7. 保存の検査(壊れた HTML と、差し込みの焼き付きを断る) ---");
console.log("   土台より壊れ方が増えたら断る。元から壊れている古いページの編集は封じない");

await build({
  entryPoints: [`${root}/src/lib/html/check.ts`],
  outfile: `${dir}/page-edit-html-check.mjs`,
  bundle: true, plugins: [companyDeployment],
  format: "esm",
  platform: "neutral",
});
const check = await import(`${dir}/page-edit-html-check.mjs`);

const keysOf = (issues) => issues.map((one) => `${one.kind}:${one.detail}`).join(",");

ok("釣り合いの取れた 1 枚", keysOf(check.findHtmlIssues("<div><p>文章</p></div>")), "");
ok("閉じていない div", keysOf(check.findHtmlIssues("<div>")), "unclosed:div");
ok("対応の無い閉じ", keysOf(check.findHtmlIssues("</div>")), "strayClose:div");
ok(
  "入れ違いは閉じ忘れと対応の無い閉じ",
  keysOf(check.findHtmlIssues("<b><i>x</b></i>")),
  "unclosed:i,strayClose:i",
);
ok(
  "</body> の直前の閉じ忘れ div は unclosed",
  keysOf(check.findHtmlIssues("<body><div></body>")),
  "unclosed:div",
);
ok("p の閉じ省略は数えない", keysOf(check.findHtmlIssues("<div><p>一つ<p>二つ</div>")), "");
ok("li の閉じ省略は数えない", keysOf(check.findHtmlIssues("<ul><li>a<li>b</ul>")), "");
ok(
  "script の中のタグは数えない",
  keysOf(check.findHtmlIssues(`<script>const x = "<div>";</script>`)),
  "",
);
ok("コメントの中のタグは数えない", keysOf(check.findHtmlIssues("<!-- </div> --><p>文章</p>")), "");
ok("void の br / img は数えない", keysOf(check.findHtmlIssues("<p>a<br>b<img src='x'></p>")), "");

const oneBroken = check.findHtmlIssues("<div>");
ok("同じ壊れ方が同じ数なら増分 0", keysOf(check.addedIssues(oneBroken, oneBroken)), "");
ok(
  "増えたら増分だけ",
  keysOf(check.addedIssues(oneBroken, check.findHtmlIssues("<div><span>"))),
  "unclosed:span",
);
ok(
  "土台に無い種類が来たらその件数",
  keysOf(check.addedIssues([], check.findHtmlIssues("</div></span>"))),
  "strayClose:div,strayClose:span",
);

const plain = "<div><p>文章</p></div>";
const withBase = "<div><base href='/x/'><p>文章</p></div>";
ok(
  "base を新しく足すと 1 件",
  keysOf(check.addedIssues(check.findHtmlIssues(plain), check.findHtmlIssues(withBase))),
  "artifact:base",
);
ok(
  "土台にも base があれば 0 件",
  keysOf(check.addedIssues(check.findHtmlIssues(withBase), check.findHtmlIssues(withBase))),
  "",
);

const withWidget = `${plain}<script src="/comments-widget.js"></script>`;
ok(
  "道具箱の札を新しく足すと 1 件",
  keysOf(check.addedIssues(check.findHtmlIssues(plain), check.findHtmlIssues(withWidget))),
  "artifact:widget",
);
ok(
  "土台にも札があれば 0 件",
  keysOf(check.addedIssues(check.findHtmlIssues(withWidget), check.findHtmlIssues(withWidget))),
  "",
);

const withBanner = `<div data-surprise-version-banner=""><p>文章</p></div>`;
ok(
  "版の帯を新しく足すと 1 件",
  keysOf(check.addedIssues(check.findHtmlIssues(plain), check.findHtmlIssues(withBanner))),
  "artifact:banner",
);
ok(
  "土台にも帯があれば 0 件",
  keysOf(check.addedIssues(check.findHtmlIssues(withBanner), check.findHtmlIssues(withBanner))),
  "",
);

const withEditMark = `<p data-surprise-edit="0">文章</p>`;
ok(
  "編集の目印を新しく足すと 1 件",
  keysOf(check.addedIssues(check.findHtmlIssues(plain), check.findHtmlIssues(withEditMark))),
  "artifact:editMark",
);
ok(
  "土台にも目印があれば 0 件",
  keysOf(check.addedIssues(check.findHtmlIssues(withEditMark), check.findHtmlIssues(withEditMark))),
  "",
);

const four = [
  { kind: "unclosed", detail: "div" },
  { kind: "unclosed", detail: "span" },
  { kind: "strayClose", detail: "p" },
  { kind: "unclosed", detail: "b" },
];
const described = check.describeIssues(four);
ok("3 件で切ってほかを言う", /ほか 1 件/.test(described), true);
ok("先頭は閉じられていない", described.includes("閉じられていない <div>"), true);
ok("2 件目も並ぶ", described.includes("閉じられていない <span>"), true);
ok("3 件目も並ぶ", described.includes("対応する開きの無い </p>"), true);
ok("4 件目の本文は出さない", described.includes("閉じられていない <b>"), false);

console.log("\n   文字面: 口は土台を引いて比べ、門の後・積み上げの前で断る");
const put = ROUTE.slice(ROUTE.indexOf("export async function PUT"));
ok("PUT が readHtmlOf で土台を引く", /const baseHtml = \(await readHtmlOf\(found\.page\)\) \?\? ""/.test(put), true);
ok(
  "addedIssues で土台と次を比べる",
  /addedIssues\(findHtmlIssues\(baseHtml\), findHtmlIssues\(html\)\)/.test(put),
  true,
);
ok("増えた壊れ方は 400 で断る", /jsonError\(rt\("toolbox\.server\.edit\.htmlIssues", \{ issues: describeIssues\(added, requestTranslate\(\)\) \}\), 400\)/.test(put) && /htmlIssues: "保存できません。\{issues\}"/.test(TOOLBOX_JA), true);
ok(
  "検査は loadEditable の後・commitRevision の前",
  put.indexOf("loadEditable") !== -1 &&
    put.indexOf("addedIssues") !== -1 &&
    put.indexOf("commitRevision") !== -1 &&
    put.indexOf("loadEditable") < put.indexOf("addedIssues") &&
    put.indexOf("addedIssues") < put.indexOf("commitRevision"),
  true,
);

console.log("\n   目印の名前は 1 か所。画面と検査が同じ名前を見る");
ok(
  "EDIT_PREVIEW_MARK の正本は comment-types",
  /export const EDIT_PREVIEW_MARK = "data-surprise-edit"/.test(TYPES),
  true,
);
ok("editor.ts が import している", /EDIT_PREVIEW_MARK/.test(EDITOR), true);
ok("html-check.ts が import している", /EDIT_PREVIEW_MARK/.test(HTML_CHECK), true);
ok("editor.ts に data-surprise-edit の直書きが無い", /data-surprise-edit/.test(EDITOR_RAW), false);

console.log("\n   ブロックの中にかたまり/仕掛けのタグを置かせない");
ok("commit が forbiddenTagIn を通す", /forbiddenTagIn\(inlineHtmlOf\(segment\)\)/.test(EDITOR), true);
ok(
  "だめなら反映しない（エラーを出して return。applyBlockEdit の前）",
  EDITOR.indexOf("forbiddenTagIn") !== -1 &&
    EDITOR.indexOf("applyBlockEdit") !== -1 &&
    EDITOR.lastIndexOf("forbidden !== null") < EDITOR.lastIndexOf("applyBlockEdit") &&
    /if \(forbidden !== null\) \{[\s\S]*?return;[\s\S]*?\}[\s\S]*?applyBlockEdit/.test(EDITOR),
  true,
);
ok("置けないタグの一覧がある", /export const FORBIDDEN_IN_BLOCK/.test(MARKDOWN), true);
ok("エスケープされた div は置ける（生の < だけ見る）", md.forbiddenTagIn("&lt;div&gt;"), null);
ok("生の div は置けない", md.forbiddenTagIn("<div>中</div>"), "div");
ok("仕掛けの script も置けない", md.forbiddenTagIn("<script>x</script>"), "script");
ok("素の強調は置ける", md.forbiddenTagIn("<strong>大事</strong>"), null);

process.exit(fails === 0 ? 0 : 1);
