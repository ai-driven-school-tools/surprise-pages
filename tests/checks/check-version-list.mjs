import { readWidgetSource } from "./widget-source.mjs";
// 道具箱と窓口の文言は辞書（日本語が正本）。入口と画面はその鍵を引き、字そのものは辞書で見る
import { readFileSync as readDictionary } from "node:fs";
const TOOLBOX_JA = readDictionary(new URL("../../src/lib/i18n/messages/ja/toolbox.ts", import.meta.url), "utf8");
/**
 * 版の一覧に出す一言が、機械語を落とした形になるかを確かめる。
 *
 * 版の一覧で読ませたいのは「誰が・いつ・どれだけ直したか」で、
 * `feat:` のような書き分けや末尾のチケット番号は、読む人の用事ではない。
 * ただし本文まで削ってしまっては何の版か分からなくなるので、
 * **落とすのは頭と尻の決まった形だけ**であることも一緒に見る。
 */
import { createRequire } from "node:module";

import { root, dir } from "./paths.mjs";
const { build } = await import(`${root}/node_modules/esbuild/lib/main.js`);
const out = `${dir}/version-list.cjs`;

/*
 * cjs で組む。履歴の読み口は保管庫の部品を引き込んでいて、その先が next を連れてくる。
 * esm にすると `__dirname` が無くて読み込めない（check-page-nesting.mjs と同じ事情）。
 * データベースへの接ぎ口は呼ばない（つなぎに行かない純粋な判定だけを見る）。
 */
await build({
  entryPoints: [`${root}/src/lib/revisions/revisions.ts`],
  outfile: out,
  bundle: true,
  format: "cjs",
  platform: "node",
  external: ["node:*"],
});
const { humanMessage } = createRequire(import.meta.url)(out);

const ok = (label, actual, expected) =>
  console.log(`${actual === expected ? "OK  " : "NG  "} ${label}: ${actual}（期待: ${expected}）`);

console.log("--- 頭の書き分けを落とす ---");
ok("feat", humanMessage("feat: 履歴から差分を見られるようにする"), "履歴から差分を見られるようにする");
ok("fix", humanMessage("fix: 光っている間の引き戻しを解消"), "光っている間の引き戻しを解消");
ok("docs", humanMessage("docs: 置き場の分担を書く"), "置き場の分担を書く");
ok("chore", humanMessage("chore: 鍵を反映するため再デプロイ"), "鍵を反映するため再デプロイ");
ok("pages", humanMessage("pages: 社内ページを 1 枚足す"), "社内ページを 1 枚足す");
ok("範囲付き", humanMessage("refactor(widget): 部品をまとめる"), "部品をまとめる");
ok("感嘆符付き", humanMessage("feat!: 版の見せ方を変える"), "版の見せ方を変える");
ok("全角のコロン", humanMessage("fix：帯の高さを測る"), "帯の高さを測る");

console.log("\n--- 尻のチケット番号を落とす ---");
ok(
  "全角の括弧",
  humanMessage("feat: 履歴から差分を見られるようにする（ARURU-4011）"),
  "履歴から差分を見られるようにする",
);
ok(
  "半角の括弧",
  humanMessage("fix: 帯の高さを測る (ARURU-812)"),
  "帯の高さを測る",
);
ok(
  "頭と尻の両方",
  humanMessage("chore(pages): 置き場を分ける (ABC-1)"),
  "置き場を分ける",
);

console.log("\n--- 本文には手を入れない ---");
ok("素の一言", humanMessage("赤入れの見た目を整える"), "赤入れの見た目を整える");
ok("途中のコロン", humanMessage("feat: 名前: 表示のしかたを変える"), "名前: 表示のしかたを変える");
ok(
  "括弧が番号でなければ残す",
  humanMessage("fix: 帯を 2 段にする（狭い画面）"),
  "帯を 2 段にする（狭い画面）",
);
ok(
  "2 行目以降は畳む",
  humanMessage("feat: 赤入れを入れる\n\n本文の説明が続く"),
  "赤入れを入れる",
);
ok(
  "書き分けに似た語で始まる普通の文",
  humanMessage("fixture を差し替える"),
  "fixture を差し替える",
);

console.log("\n--- 何も残らないとき ---");
ok("説明が空", humanMessage(""), "（説明なし）");
ok("書き分けだけ", humanMessage("chore:"), "（説明なし）");
ok("書き分けと番号だけ", humanMessage("chore: (ARURU-1)"), "（説明なし）");
ok("空白だけ", humanMessage("   \n  "), "（説明なし）");

console.log("\n--- 最下段を「最初の版」と言い切ってよいか ---");
/*
 * 一覧に出す数には上限がある。上限に達しているときの最下段は「最初の版」ではなく
 * 「ここまでしか出していない版」。言い切ると嘘になるので、どちらかを見分ける
 * 手がかり（more）がサーバーから届いていることを確かめる。
 */
const { readFile } = await import("node:fs/promises");
const revisionsCode = await readFile(`${root}/src/lib/revisions/revisions.ts`, "utf8");
const routeCode = await readFile(`${root}/src/app/api/history/route.ts`, "utf8");
const widgetCode = await readWidgetSource();
const apiCode = await readFile(`${root}/src/widget/shared/api.ts`, "utf8");
const has = (code, pattern) => new RegExp(pattern).test(code);

// 取りに行く先が GitHub から保管庫に変わったので、書き方も変わった。
// 見張っている性質は同じ（1 つ多く取る → 多ければ more → 返すのは頼まれた数まで）
ok(
  "頼まれた数より 1 つ多く取りに行く",
  has(revisionsCode, "listRevisionsOf\\(page, wanted \\+ 1\\)"),
  true,
);
ok("多く取れたら more を立てる", has(revisionsCode, "const more = found.length > wanted"), true);
ok("返すのは頼まれた数まで", has(revisionsCode, "found.slice\\(0, wanted\\)"), true);
ok("応答に more を載せる", has(routeCode, "more: history.more"), true);
ok("ブラウザ側が more を読む", has(apiCode, 'record\\["more"\\] === true'), true);
ok("上限に達していたら言い方を変える", has(widgetCode, "state.moreVersions"), true);
ok("言い切る文言は more が偽のときだけ", has(widgetCode, 't\\("toolbox\\.history\\.firstVersion"\\)') && TOOLBOX_JA.includes("これが最初の版です"), true);
ok("上限のときの文言がある", has(widgetCode, 't\\("toolbox\\.history\\.moreVersions"\\)') && TOOLBOX_JA.includes("これより前の版は、ここには出していません"), true);

console.log("\n--- 過去の版の帯と、比べる帯を 2 段にしない ---");
const contentCode = await readFile(`${root}/src/lib/pages/content.ts`, "utf8");
const typesCode = await readFile(`${root}/src/lib/comments/types.ts`, "utf8");
const anchorCode = await readFile(`${root}/src/widget/comments/anchor.ts`, "utf8");

// 目印の名前は 1 か所にだけ書く。差し込む側と数えない側で食い違わせない
ok("目印の名前は共通の置き場にある", has(typesCode, 'VERSION_BANNER_MARK = "data-surprise-version-banner"'), true);
ok("配信側は共通の名前を使う", has(contentCode, "VERSION_BANNER_MARK"), true);
ok("本文を数える側も同じ名前を使う", has(anchorCode, "VERSION_BANNER_MARK"), true);
ok("生の文字列を書き足していない", contentCode.split("data-surprise-version-banner").length - 1, 0);
ok("比べ始めたら引っ込める", has(widgetCode, "setVersionBannerHidden\\(true\\)"), true);
ok("抜けたら戻す", has(widgetCode, "setVersionBannerHidden\\(false\\)"), true);
