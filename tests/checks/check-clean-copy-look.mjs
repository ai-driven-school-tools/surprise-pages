/**
 * 清書のページを、開いたときにいまの清書の見た目で出す（src/lib/settings/clean-copy-look.ts）の検査表。
 *
 * 材料は `fixtures/clean-copy/` の 4 枚。どれも同じ原本を、その版の変換器と額縁で組んだもの:
 *   legacy.html           … 印を付ける前・見た目を組み直す前の変換器（2026-09-30 に Pages が写していた版）
 *   unstamped-script.html … 印を付ける前・組み直したあとの変換器の台本（surprise-plugins 47daa14）
 *   current.html / current-script.html … いま写している変換器（印つき）
 * 古い 2 枚を付け替えると、本文の要素のクラスがいまの 2 枚と 1 つずつ同じになり、字は 1 文字も変わらないこと。
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { build } from "esbuild";
import { dir, root } from "./paths.mjs";

await build({ entryPoints: [`${root}/src/lib/settings/clean-copy-look.ts`], outfile: `${dir}/clean-copy-look.mjs`, bundle: true, format: "esm", platform: "node" });
const { withCleanCopyLook, CLEAN_COPY_LOOK_STAMP } = await import(`${dir}/clean-copy-look.mjs`);

let checks = 0;
let failures = 0;
function check(label, fn) {
  checks++;
  try { fn(); console.log(`OK  ${label}`); }
  catch (error) { failures++; console.log(`NG  ${label}: ${error instanceof Error ? error.message : String(error)}`); }
}
const fixture = (name) => readFileSync(`${root}/tests/checks/fixtures/clean-copy/${name}`, "utf8");
const mainOf = (html) => /<main\b[^>]*>([\s\S]*)<\/main>/.exec(html)?.[1] ?? "";
/** 本文の要素のクラスを、出てくる順に。 */
const classes = (html) => [...mainOf(html).matchAll(/<([a-z0-9]+)\b[^>]*?\sclass="([^"]*)"/g)].map((m) => `${m[1]}.${m[2]}`);
/** 読者が字として見る部分（タグを外す）。コメントの引用の位置はこの字数で決まる。 */
const text = (html) => html.replace(/<(script|style)\b[\s\S]*?<\/\1>/g, "").replace(/<[^>]+>/g, "");
const bodyClass = (html) => /<body\b[^>]*\bclass="([^"]*)"/.exec(html)?.[1];
const look = JSON.parse(readFileSync(`${root}/src/lib/settings/clean-copy-look.generated.json`, "utf8"));

console.log("--- 古いページを、いまの見た目にそろえる ---");
for (const [old, now] of [["legacy.html", "current.html"], ["unstamped-script.html", "current-script.html"]]) {
  const before = fixture(old);
  const after = withCleanCopyLook(before);
  const wanted = fixture(now);
  check(`${old}: 本文の要素のクラスが、いまの変換器の出力と 1 つずつ同じ`, () => assert.deepEqual(classes(after), classes(wanted)));
  check(`${old}: 本文の字は 1 文字も変えない`, () => assert.equal(text(mainOf(after)), text(mainOf(before))));
  check(`${old}: 清書の文字組みの指定は、いまのものが 1 枚だけ`, () => {
    assert.equal(after.split('data-clean-copy-style="typography"').length - 1, 1);
    assert.ok(after.includes(look.current.css.typography));
  });
  check(`${old}: 額縁は、いまの額縁（上端の線を引かない・リンクに色を付ける）`, () => {
    assert.equal(bodyClass(after), bodyClass(wanted));
    assert.ok(after.includes(look.frameStyle));
    assert.match(after, /body a \{ color: rgb\(var\(--ads-accent\)\)/);
  });
  check(`${old}: 2 度通しても変わらない`, () => assert.equal(withCleanCopyLook(after), after));
}
check("台本は、台本の表示形式の指定をいまのものにそろえる", () => {
  const after = withCleanCopyLook(fixture("unstamped-script.html"));
  assert.equal(after.split('data-clean-copy-style="script"').length - 1, 1);
  assert.ok(after.includes(look.current.css.script));
});

console.log("--- 触らないもの ---");
check("いまの一式で組んだページは 1 バイトも変えない", () => {
  for (const name of ["current.html", "current-script.html"]) assert.equal(withCleanCopyLook(fixture(name)), fixture(name));
});
check("知らない印（Pages の写しより新しいスキルで組んだページ）は古い見た目へ戻さない", () => {
  const newer = fixture("current.html").replace(/data-clean-copy-look="[0-9a-f]+"/, 'data-clean-copy-look="ffffffffffff"');
  assert.equal(withCleanCopyLook(newer), newer);
});
check("清書でないページ（図解・スライド）は 1 バイトも変えない", () => {
  const page = readFileSync(`${root}/tests/checks/fixtures/internal/example/deck.html`, "utf8");
  assert.equal(withCleanCopyLook(page), page);
  const drawn = '<html><head><style>:root{--ads-bg:255 255 255}</style></head><body class="bg-ads-bg antialiased leading-relaxed border-t-4 border-ads-accent"><main><p class="text-ads-muted mb-6">図解</p></main></body></html>';
  assert.equal(withCleanCopyLook(drawn), drawn);
});
check("本文の中のコードや文章に書かれたタグの字面は触らない", () => {
  const page = fixture("legacy.html").replace("段落がもう 1 つ。", '段落がもう 1 つ。&lt;p class="text-ads-muted mb-6"&gt;');
  assert.ok(withCleanCopyLook(page).includes('&lt;p class="text-ads-muted mb-6"&gt;'));
});

console.log("--- 一式の写し ---");
const sha256 = (file) => createHash("sha256").update(readFileSync(`${root}/${file}`)).digest("hex");
check("一式は、同梱している清書の変換器と額縁（.claude/skills）から書き出したもの", () => {
  assert.equal(look.converter, sha256(".claude/skills/clean-copy/scripts/cleancopy/convert.py"));
  assert.equal(look.frame, sha256(".claude/skills/_shared/references/base.html"));
});
check("材料のいまの 2 枚は、いま写している変換器の印で組んである", () => {
  for (const name of ["current.html", "current-script.html"]) assert.ok(fixture(name).includes(`data-clean-copy-look="${look.current.stamp}"`), name);
});
check("いまの一式は、過去に配った一式の中にも入っている（写しを上げたあとも、いまの印のページを引ける）", () => {
  assert.ok(look.past.some((entry) => entry.stamp === look.current.stamp));
});
check("照合の印と描画前の指定の控えは、写しを上げると変わる", () => {
  assert.match(CLEAN_COPY_LOOK_STAMP, new RegExp(`^${look.current.stamp}${look.revision.slice(0, 7)}$`));
  assert.match(readFileSync(`${root}/src/lib/pages/content.ts`, "utf8"), /HTML_SHELL_STAMP = [^\n]*CLEAN_COPY_LOOK_STAMP/);
  assert.match(readFileSync(`${root}/src/lib/first-paint/delivery.ts`, "utf8"), /cssKey[\s\S]*?CLEAN_COPY_LOOK_STAMP/);
});

console.log("--- 配信の入口 ---");
check("本文を配る入口は、どれも <base> を差し込む前に付け替える（描画前の指定が新しいクラスから作られる）", () => {
  const sites = {
    "src/lib/pages/private-page.ts": [/withAssetBase\(withCleanCopyLook\(past\)/, /withAssetBase\(withCleanCopyLook\(html\), here\)/],
    "src/app/public/[...slug]/route.ts": [/const html = withCleanCopyLook\(withoutDeckNotes\(stored\)\)/],
    "src/app/api/pages/edit/route.ts": [/withAssetBase\(withCleanCopyLook\(html\), href\)/],
  };
  for (const [file, patterns] of Object.entries(sites)) {
    const body = readFileSync(`${root}/${file}`, "utf8");
    for (const pattern of patterns) assert.match(body, pattern, file);
  }
});
check("保管庫へ書く口（投稿・直す・取り寄せ）は付け替えない（保存される本文は組んだときのまま）", () => {
  for (const file of ["src/lib/pages/store.ts", "src/app/api/pages/source/route.ts"]) {
    assert.doesNotMatch(readFileSync(`${root}/${file}`, "utf8"), /withCleanCopyLook/, file);
  }
});

console.log(`\n${checks} 項目 / ${failures} 件失敗`);
if (failures) process.exitCode = 1;
