/**
 * 部品の一覧（読み上げや Codex などの AI の Mac 操作が読むもの）の決まり（DESIGN.md 9 章）。
 *
 * 画面を開いて名前と役割の欠けを見るのは tests/e2e/accessibility.spec.mjs（axe）。ここでは源を読んで、
 * axe では見つからない形——押せるのにボタンでない部品・飾りの絵・名前の無い枠——が戻ってこないかを見る。
 *
 *   1. 画面（src/app/）: 押せる操作はボタンかリンクに持たせる。div や span に onClick を付けない
 *      （例外の台帳は減る方向だけ。直ったのに台帳に残っていても落ちる）
 *   2. 選択欄の共通部品は名前を必須にする（aria-label か、見出しと結ぶ id）
 *   3. 道具箱: 絵記号は一覧から隠す。名前は押す部品の側が持つ
 *   4. 道具箱: コメントの板・小窓は用途の名前を持つ。コメントのカードはキーボードと一覧から押せる
 *   5. 道具箱: 強さのボタンは、見えている字を含む名前と、判定と同じ近道（aria-keyshortcuts）を持つ
 *   6. 画面を開く検査（axe）が主要な画面と道具箱を見ている
 *   7. リポジトリの文書の画面: 左のツリーの行は、見えている名前を読み上げの名前に持つ（子の字をたどらない読み手のため）。
 *      画面を開く確かめ（tests/support/repository-reading-browser.mjs）が axe とツリーの名前を見ている
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { root } from "./paths.mjs";

let fails = 0;
const ok = (label, actual, expected = true) => {
  const pass = String(actual) === String(expected);
  if (!pass) fails += 1;
  console.log(`${pass ? "OK  " : "NG  "} ${label}: ${actual}（期待: ${expected}）`);
};
const read = (file) => readFileSync(path.join(root, file), "utf8");
const code = (text) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
const walk = (dir) =>
  readdirSync(path.join(root, dir)).flatMap((name) => {
    const rel = path.join(dir, name);
    if (name === "node_modules" || name === "dist" || name.startsWith(".")) return [];
    return statSync(path.join(root, rel)).isDirectory() ? walk(rel) : [rel];
  });

// 1. 押せる操作はボタンかリンクに持たせる
/**
 * 例外の台帳（減る方向だけ）。キーは「ファイル: 要素の名前」、値は理由。
 * 足すときは、なぜボタンにできないかと、同じ操作の名前付きの入口がどこにあるかを書く。
 */
const CLICKABLE_EXCEPTIONS = {
};
const NON_INTERACTIVE = /<(div|span|li|p|section|article|td|tr|img|h[1-6])\b[^>]*\bonClick=/g;
const found = new Set();
for (const file of [...walk("src/app")].filter((one) => one.endsWith(".tsx"))) {
  for (const match of read(file).matchAll(NON_INTERACTIVE)) found.add(`${file}: ${match[1]}`);
}
const unlisted = [...found].filter((key) => !(key in CLICKABLE_EXCEPTIONS));
const stale = Object.keys(CLICKABLE_EXCEPTIONS).filter((key) => !found.has(key));
ok("押せる操作を div や span に付けていない（台帳の外）", unlisted.join(", ") || "なし", "なし");
ok("例外の台帳に、もう直った行が残っていない（台帳は減る方向だけ）", stale.join(", ") || "なし", "なし");

// 2. 選択欄の名前
const controls = code(read("src/app/_components/controls.tsx"));
ok(
  "選択欄の共通部品は、aria-label か見出しと結ぶ id のどちらかを必須にする",
  /export function Select\([\s\S]*?\}: ComponentProps<"select"> & \(\{ "aria-label": string \} \| \{ id: string \}\)\)/.test(controls),
);
ok("アイコンだけのボタンの共通部品は名前（label）を必須にする", /export function IconButton\(\{[\s\S]{0,200}?\}: Omit<ComponentProps<"button">, "children"> & \{\s*label: string;/.test(controls));

// 3. 絵記号は一覧から隠す
const util = code(read("src/widget/shared/util.ts"));
ok(
  "道具箱の絵記号は一覧から隠す（名前は押す部品の側が持つ）",
  /export function icon\([\s\S]*?const span = el\("span", "icon"\);\s*span\.setAttribute\("aria-hidden", "true"\);/.test(util),
);

// 4. 板・小窓・カード
const comments = code(read("src/widget/comments/comments.ts"));
const selection = code(read("src/widget/comments/selection.ts"));
const list = code(read("src/widget/comments/widget-list.ts"));
ok(
  "コメントの板は見出しから名前を採る",
  /const box = el\("aside", "panel"\);\s*box\.setAttribute\("aria-labelledby", "panel-title"\);/.test(comments) &&
    /panelTitle = el\("h2", "panel-title", [^\n]*\);\s*panelTitle\.id = "panel-title";/.test(comments),
);
const opened = [...selection.matchAll(/popover\.className = "popover[^"]*";/g)].length;
const named = [...selection.matchAll(/popover\.className = "popover[^"]*";\s*nameSurface\(popover, (?:t\("[^"]+"\)|null)\);/g)].length;
const closed = [...selection.matchAll(/popover\.replaceChildren\(\);\s*nameSurface\(popover, null\);\s*popover\.className = "popover";/g)].length;
ok("小窓は、開くたびに用途の名前を付け、畳むときに外す（小窓の形を変える箇所すべて）", `${named + closed}/${opened}`, `${opened}/${opened}`);
ok(
  "⋯ の小窓も名前を持つ（その他）",
  /popover\.className = "popover is-compact is-menu";\s*selectionFeature\.nameSurface\(selectionFeature\.popover, t\("toolbox\.bar\.more"\)\);/.test(comments),
);
// 現在地の行の顔から開くメニュー。行は本物のリンクかボタンで役割は menuitem、顔は開くものがあると伝える
const locationBar = code(read("src/widget/reading/location-bar.ts"));
ok(
  "顔のメニューの行は本物のリンクかボタンで、役割は menuitem",
  /row\.kind === "link" \? el\("a", "menu-item"\) : el\("button", "menu-item"\)/.test(locationBar) && /item\.setAttribute\("role", "menuitem"\)/.test(locationBar) && /this\.menu\.setAttribute\("role", "menu"\)/.test(locationBar),
);
ok("顔と印は読み上げの名前を持つ", /this\.self\.setAttribute\("aria-label", label\)/.test(locationBar) && /this\.mark\.setAttribute\("aria-label", home\)/.test(locationBar));
ok(
  "畳んだカードは、中に押せる部品が無いときだけボタンになり、キーでも開ける",
  /card\.setAttribute\("role", "button"\);\s*card\.setAttribute\("aria-expanded", "false"\);\s*card\.tabIndex = 0;\s*card\.addEventListener\("keydown"/.test(list),
);
ok(
  "開いたカードは、引用の行から本文の該当箇所へ移れる（キーと一覧から）",
  /quote\.setAttribute\("role", "button"\);\s*quote\.setAttribute\("aria-label", t\("toolbox\.card\.jumpToQuote"/.test(list) && /selectFromCard\(comment\.id\);/.test(list),
);

// 5. 強さのボタン
ok(
  "強さのボタンは見えている字を含む名前と、判定と同じ近道を持つ",
  /button\.setAttribute\("aria-label", t\("toolbox\.compose\.sendAsNamed", \{ label: look\.label/.test(comments) &&
    /button\.setAttribute\("aria-keyshortcuts", priorityKeyShortcuts\(priority\)\);/.test(comments),
);
// 判定（priorityShortcut）と同じ組み合わせ: Mac は control、ほかは Ctrl + Alt
ok(
  "近道の書き方は判定と同じ（Mac は Control、ほかは Control+Alt に頭文字）",
  /const held = selectionFeature\.appleKeys\(\) \? "Control" : "Control\+Alt";\s*return `\$\{held\}\+\$\{priority\[0\]\.toUpperCase\(\)\}`;/.test(comments) &&
    /if \(chord\.altKey !== !apple\) return null;/.test(util),
);

// 6. 画面を開く検査
const spec = read("tests/e2e/accessibility.spec.mjs");
ok("axe の検査が主要な画面を見ている", ["/", "/mine", "/library", "/activity", "/settings", "/create"].every((url) => spec.includes(`"${url}"`)));
ok("axe の検査が道具箱の板・小窓・⋯ の小窓を見ている", /complementary", \{ name: "コメント" \}/.test(spec) && /選んだ箇所へのコメント/.test(spec) && /group", \{ name: "その他" \}/.test(spec));
// 現在地の行の右端の顔から開くメニュー（サイドバーを畳んだもの）。役割は menu / menuitem で、サイドバーのものと同じ呼び方で見つかる
ok("axe の検査が現在地の行の顔のメニューを見ている", /location\.getByRole\("button", \{ name: \/\^自分\/ \}\)/.test(spec) && /include\("surprise-location"\)/.test(spec) && /getByRole\("menuitem", \{ name: "ログアウト" \}\)/.test(spec));

// 管理画面の人の面と、招待を受け取る画面

console.log(`\n${fails === 0 ? "すべて合格" : `${fails} 件 不合格`}`);
if (fails > 0) process.exit(1);
