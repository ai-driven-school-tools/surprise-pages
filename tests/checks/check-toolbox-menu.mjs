import { readWidgetSource } from "./widget-source.mjs";
// 道具箱の文言は辞書（日本語が正本）。画面はその鍵を引き、字そのものは辞書で見る
import { readFileSync as readDictionary } from "node:fs";
const TOOLBOX_JA = readDictionary(new URL("../../src/lib/i18n/messages/ja/toolbox.ts", import.meta.url), "utf8");
/**
 * 右下の道具箱の「絞り方」と、現在地の行の右端の「自分」の決まりを確かめる。
 *
 *   右下   [コメント N] | [直す]（書ける人だけ） [リンク] [⋯]
 *   上端   ◆ 会社の資料 / 題  ☆ 10月3日 更新 · 第12版 (顔)
 *
 * 見るのは 9 点。
 *   1. バーに並ぶのは毎日使うものだけ。残り（履歴・取り込み・共有範囲・読み方）は ⋯ の小窓に畳む
 *   2. ⋯ は押すと何かが開くことを機械にも伝え、畳むものが無い人には出さない
 *   3. 畳み方（Escape / 外を押す / 隣を押す / 焦点戻し）は文章を選んだときの小窓と同じ 1 本
 *   4. 小窓を開いている間を「書いている最中」と誤読しない
 *   5. 幅の総当たり（いちばん混んだ姿でも 320px に収まる）
 *   6. 下端の持ち主に小窓が入り、最優先で、かつ小窓のときだけバーが残る
 *   7. 現在地の行の左端は製品の印（ホーム）、右端は顔。顔のメニューはサイドバーを畳んだもの
 *   8. 顔は名乗りだけから描き、「ログインしていません」もアドレスも言わない。ログアウトはサイドバーと同じ口
 *   9. 本物の DOM で開け閉てする（右下の ⋯ と、上端の顔の両方）
 *
 * 判定そのものは dock.ts の素の関数を**そのまま呼んで**確かめる。
 * 幅は見た目の指定（styles.ts）から積み上げた実測で数える。
 */
import { readFile } from "node:fs/promises";

import { root, dir } from "./paths.mjs";
const { build } = await import(`${root}/node_modules/esbuild/lib/main.js`);

for (const [name, out] of [
  ["comments/dock", "tm-dock"],
  ["shared/util", "tm-util"],
  ["shared/styles", "tm-styles"],
  ["shared/tokens", "tm-tokens"],
  ["reading/location-bar-styles", "tm-location-styles"],
]) {
  await build({
    entryPoints: [`${root}/src/widget/${name}.ts`],
    outfile: `${dir}/${out}.mjs`,
    bundle: true,
    format: "esm",
    platform: "neutral", mainFields: ["module", "main"],
  });
}
const { bottomOwner, toolbarVisible } = await import(`${dir}/tm-dock.mjs`);
const { ICON_MORE, ICON_CIRCLE_USER, ICON_HOME, ICON_FOLDER, ICON_COMPANY, ICON_STAR, ICON_SETTINGS, ICON_LOGOUT, ICON_USERS } = await import(`${dir}/tm-util.mjs`);
const { STYLES: RAW } = await import(`${dir}/tm-styles.mjs`);
const { LOCATION_BAR_STYLES: RAW_LOCATION } = await import(`${dir}/tm-location-styles.mjs`);
const { ICON_SIZE } = await import(`${dir}/tm-tokens.mjs`);
const CSS = RAW.replace(/\/\*[\s\S]*?\*\//g, "");
const LOCATION_CSS = RAW_LOCATION.replace(/\/\*[\s\S]*?\*\//g, "");

const ok = (label, actual, expected) =>
  console.log(`${actual === expected ? "OK  " : "NG  "} ${label}: ${actual}（期待: ${expected}）`);

/** 注記を落として、実際に動くところだけを見る。 */
const strip = (text) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const code = strip(await readWidgetSource());
const API = strip(await readFile(`${root}/src/widget/shared/api.ts`, "utf8"));
const LOCATION = strip(await readFile(`${root}/src/widget/reading/location-bar.ts`, "utf8"));
const PLACES = strip(await readFile(`${root}/src/lib/workspace/places.ts`, "utf8"));
const WORKSPACE_JA = await readFile(`${root}/src/lib/i18n/messages/ja/workspace.ts`, "utf8");

/** 名前で関数の中身を切り出す（引数の並びを読み飛ばしてから、波かっこを数える）。 */
function fnOf(source, name) {
  const at = source.indexOf(`function ${name}(`);
  if (at < 0) return "";
  let cursor = source.indexOf("(", at);
  let paren = 0;
  for (; cursor < source.length; cursor += 1) {
    if (source[cursor] === "(") paren += 1;
    if (source[cursor] === ")") {
      paren -= 1;
      if (paren === 0) break;
    }
  }
  const open = source.indexOf("{", cursor);
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === "{") depth += 1;
    if (source[i] === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(open, i + 1);
    }
  }
  return "";
}
const fn = (name) => fnOf(code, name);
/** クラスの中の処理（`name(...) {`）を切り出す。 */
function methodOf(source, name) {
  const at = source.search(new RegExp(`\\n  (?:private )?${name}\\(`));
  if (at < 0) return "";
  return fnOf(`function ${source.slice(at + 3).replace(/^(?:private )?/, "")}`, name);
}

const ruleIn = (css, sel) => {
  const m = new RegExp(`(?:^|\\})\\s*${sel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\{([^}]*)\\}`, "m").exec(css);
  return m === null ? "" : m[1];
};
const declaredIn = (css, sel, prop) => {
  const m = new RegExp(`(?:^|;|\\{)\\s*${prop}:\\s*([^;]+)`).exec(ruleIn(css, sel));
  return m === null ? null : m[1].trim();
};
const declared = (sel, prop) => declaredIn(CSS, sel, prop);
const declaredLocation = (sel, prop) => declaredIn(LOCATION_CSS, sel, prop);

const token = new Map();
for (const [, key, value] of CSS.matchAll(/(--[a-z0-9-]+):\s*([0-9.]+)px/g)) {
  token.set(key, Number(value));
}
const px = (name) => token.get(name) ?? 0;

// ---------------------------------------------------------------------------
console.log("--- 1. バーに並ぶのは毎日使うものだけ ---");
const barBuild = fn("renderBar");
const sections = fn("moreMenuSections");
// ⋯ は buildMoreButton の中で同じ土台（barButton）を通る。並びは呼び出しの位置で読む
const barButtons = [...barBuild.matchAll(/barButton\(t\("toolbox\.(?:bar|common)\.([a-zA-Z]+)"\)|buildMoreButton\(\)/g)].map((m) => m[1] ?? "more");
console.log(`      バーの道具: ${barButtons.join(" / ")}`);
// 配布版には録音（文字起こし）が無いので、バーから抜けた。読み上げを止める口は、読んでいる間だけリンクの前に出る
ok("並びは コメント → プレゼン → 直す →（読んでいる間だけ 止める）→ リンク → その他", barButtons.join(","), "comments,present,edit,stopReading,copyLink,more");
// スライドのプレゼンは、文字起こしと同じ「そのページでいちばん使う道具」。コメントの隣（区切り線の前）に置き、押すのは保存済みの操作列の釦そのもの
ok("プレゼンは区切り線の前（面を開く道具の側）", barBuild.indexOf('t("toolbox.bar.present")') < barBuild.indexOf('el("span", "bar-divider")'), true);
ok("プレゼンは保存済みの操作列の釦を押す（取り決めを足さない）", /const deckPresent = readDeckTools\(\)\?\.present \?\? null;[\s\S]*?\(\) => deckPresent\.click\(\)/.test(barBuild), true);
ok("出すのは向こうの釦が押せるときだけ", /if \(deckPresent !== null\) \{/.test(barBuild), true);
ok("⋯ の読み方に 発表者画面・一覧・ノート（スライドのページだけ）", ['t("decks.presentLaunch.presenter")', 't("toolbox.bar.overviewClose") : t("toolbox.bar.overview")', 't("toolbox.bar.notesShow") : t("toolbox.bar.notesHide")'].every((key) => sections.includes(key)), true);
ok("読み方の行も保存済みの釦を押す", /run: \(\) => overview\.click\(\)/.test(sections) && /run: \(\) => notes\.click\(\)/.test(sections), true);
ok("プレゼンの文言は辞書にある", /present: "プレゼンを始める"/.test(TOOLBOX_JA) && /overview: "一覧で見る"/.test(TOOLBOX_JA) && /notesHide: "ノートを隠す"/.test(TOOLBOX_JA), true);
ok("履歴はバーに無い（上端の「いつ・何版目」が入口）", /toolbox\.bar\.history/.test(barBuild), false);
ok("Slack で共有はバーに無い", /toolbox\.bar\.share/.test(barBuild), false);
ok("共有範囲はバーに無い", /toolbox\.bar\.access/.test(barBuild), false);
ok("取り込みはバーに無い", /toolbox\.bar\.(?:origin|deckOrigin)/.test(barBuild), false);
ok("プロンプターはバーに無い", /toolbox\.bar\.prompter/.test(barBuild), false);
ok("「自分」はバーに無い（現在地の行の右端へ移った）", /toolbox\.self\./.test(barBuild), false);
ok("区切り線は 1 本（面を開く道具と、変える・持ち出す道具の境）", (barBuild.match(/el\("span", "bar-divider"\)/g) ?? []).length, 1);
ok("直すを出すのはサーバーが「直してよい」と言った人だけ", /if \(state\.features\.edit && historyFeature\.loadedVersion === null\) \{\s*const edit = barButton/.test(barBuild), true);
ok("文字起こしの口はバーに無い（配布版に無い機能）", /toolbox\.bar\.transcript/.test(barBuild), false);
ok("読み上げはバーから始めない（入口は ⋯。バーに出すのは読んでいる間の一時停止・停止・速さだけ）", /toolbox\.bar\.readAloud/.test(barBuild) === false && /if \(readAloud\.supported && readsAsArticle\(\) && readAloud\.active\) \{/.test(barBuild), true);

console.log("\n   ⋯ の中身（段と行）");
const menuRows = [...sections.matchAll(/label: (?:readAloud\.active \? t\("toolbox\.bar\.stopReading"\) : )?(?:document\.body\.hasAttribute\("data-deck"\) \? t\("toolbox\.bar\.deckOrigin"\) : )?t\("toolbox\.bar\.([a-zA-Z]+)"\)/g)].map((m) => m[1]).filter((name) => !name.startsWith("menu"));
console.log(`      行: ${menuRows.join(" / ")}`);
// Slack で共有・プロンプターは配布版に無い。読み方の段はスライドの行（発表者画面・一覧・ノート）と読み上げ（端末の声だけ）
// 配布版で足した「この資料を複製」（スライドのいまの版を直せる人だけ）は、共有範囲の次に置く
ok("このページ: 履歴 → 取り込み → 共有範囲 → 複製、読み方: 読み上げ", menuRows.join(","), "history,origin,access,duplicateDeck,readAloud");
ok("読み上げの行は読み方の段で、記事と清書だけ（スライドには出さない）", /if \(readAloud\.supported && readsAsArticle\(\)\) \{\s*if \(readAloud\.active\) reading\.push\(pauseReadingAction\(\)\);\s*reading\.push\(\{/.test(sections), true);
ok("段は 2 つ（このページの道具 / 読み方）", /sections\.push\(\{ id: "page", rows: page \}\)/.test(sections) && /sections\.push\(\{ id: "reading", rows: reading \}\)/.test(sections), true);
ok("段に見出しは置かない（余白で分ける。行が 3〜5 本なので見出しのほうが強く見える）", /label: t\("toolbox\.bar\.menu/.test(sections) || /list-menu-label/.test(fn("moreMenuNodes")), false);
ok("行が 0 の段は出さない", /if \(page\.length > 0\) sections\.push/.test(sections) && /if \(reading\.length > 0\) sections\.push/.test(sections), true);
ok("履歴は上端に入口が出ていないときだけ", /if \(state\.features\.history && !\(locationBar\?\.versionShowing\(\) \?\? false\)\)/.test(sections), true);
ok("上端に入口が出たら描き直す（⋯ の中の履歴を引っ込める）", /bar\.showVersion\(result\.value, \(\) => void historyFeature\.openHistory\(\)\);\s*render\(\);/.test(fn("showCurrentVersion")), true);
ok("共有範囲を出すかはサーバーの答え（canManageAccess）", /if \(sharingFeature\.canManageAccess\(\)\) \{\s*page\.push/.test(sections), true);
ok("Slack で共有の行は無い（配布版に Slack は無い）", /features\.slack|toolbox\.bar\.share/.test(sections), false);
ok("人の絵柄は共有範囲の行", /icon: ICON_USERS, run: \(\) => void sharingFeature\.openAccess\(\)/.test(sections) && Array.isArray(ICON_USERS), true);
ok("行は押すと先に畳んでから動く", /selectionFeature\.hidePopover\(\);\s*row\.run\(\);/.test(fn("moreMenuNodes")), true);
ok("段の印は属性だけ（字を足さない）", /group\.dataset\.section = section\.id;/.test(fn("moreMenuNodes")), true);

// ---------------------------------------------------------------------------
console.log("\n--- 2. ⋯ は押すと何かが開くことを伝え、畳むものが無ければ出ない ---");
const moreBuild = fn("buildMoreButton");
ok("ほかのボタンと同じ土台を通る", /barButton\(t\("toolbox\.bar\.more"\), ICON_MORE, \(\) => toggleMoreMenu\(\)\)/.test(moreBuild), true);
ok("名前は辞書から（その他）", /more: "その他"/.test(TOOLBOX_JA), true);
ok("印は 1 語（MORE_MARK）", /const MORE_MARK = "bar-more";/.test(code) && /button\.classList\.add\(MORE_MARK\);/.test(moreBuild), true);
ok("開くものがあると伝える", /setAttribute\("aria-haspopup", "menu"\)/.test(moreBuild), true);
ok("いま開いているかを伝える", /setAttribute\("aria-expanded", moreMenuOpen \? "true" : "false"\)/.test(moreBuild), true);
ok("畳むものが無い人には ⋯ を出さない", /moreButton = moreMenuSections\(\)\.length > 0 \? buildMoreButton\(\) : null;/.test(barBuild), true);
ok("消えた瞬間に開いていた小窓は畳む", /else if \(moreMenuOpen\) selectionFeature\.hidePopover\(\);/.test(barBuild), true);
ok("絵柄は点 3 つ（丸を道筋に直したもの）", ICON_MORE.length, 3);
ok("ウィジェット本体に絵柄を直書きしていない", /a1 1 0 1 1-2 0/.test(code), false);
ok("原本の知らせは ⋯ の上に置く", /querySelector\("\.bar-more"\)/.test(fn("placeOriginHint")) && /querySelector\("\.bar-more"\) !== null/.test(fn("originHintCanShow")), true);

// ---------------------------------------------------------------------------
console.log("\n--- 3. 畳み方（Escape / 外を押す / 焦点戻し）---");
const page = fn("attachPageEvents");
const hide = fn("hidePopover");
ok("畳む入口は今までどおり 1 か所", (page.match(/closest\(HOST_TAG\)/g) ?? []).length, 1);
ok("⋯ そのもの以外を押されたら畳む", /if \(moreMenuOpen && !onMore\) \{\s*(?:selectionFeature\.)?hidePopover\(\);/.test(page), true);
ok("⋯ かどうかは印で見る（作り直しで別物になるので、同じ物かでは見ない）", /\.some\(\(node\) => node instanceof Element && node\.classList\.contains\(MORE_MARK\)\)/.test(page), true);
ok("その 1 本は「中なら何もしない」より前にある", page.indexOf("if (moreMenuOpen && !onMore)") < page.indexOf("if (insideOurUi) return;"), true);
ok("覗き見カードの振り分けは、さらに前のまま", page.indexOf("if (peek.open) {") < page.indexOf("if (moreMenuOpen && !onMore)"), true);
ok("Escape も同じ畳み方を通る（行を増やしていない）", /const hadPopover = (?:selectionFeature\.|connections\.)?popover !== null && !(?:selectionFeature\.|connections\.)?popover\.hidden;\s*if \(hadPopover\) (?:selectionFeature\.)?hidePopover\(\);/.test(page), true);
ok("畳む処理そのものは 1 つだけ", (code.match(/function hidePopover\(/g) ?? []).length, 1);
console.log("\n   畳んだあとの後始末");
ok("開いている印を下ろす", /const wasMenu = connections\.moreMenuOpen;\s*connections\.moreMenuOpen = false;/.test(hide), true);
ok("見た目の印は丸ごと戻す", /(?:selectionFeature\.|connections\.)?popover\.className = "popover";/.test(hide), true);
ok("焦点は ⋯ へ返す", /if \(wasMenu\) connections\.moreButton\?\.focus\(\{ preventScroll: true \}\);/.test(hide), true);
ok("返すのは描き直したあと（返した先が消えないように）", hide.indexOf("render();") < hide.indexOf("moreButton?.focus"), true);
ok("描き直しの最後で置き直す（縦は器から・横は ⋯ の右端にそろえる）", /if \(moreMenuOpen && moreButton !== null && bar !== null && selectionFeature\.popover !== null\) \{[\s\S]*?placePopover\(\{ left: button\.left, width: button\.width, top: pill\.top, bottom: pill\.bottom \}\);\s*selectionFeature\.popover\.style\.left = `\$\{Math\.max\(POPOVER_PLACEMENT\.edge, Math\.round\(button\.right - selectionFeature\.popover\.offsetWidth\)\)\}px`;/.test(fn("render")), true);
ok("置き場所の決め方は 1 つのまま", (code.match(/function placePopover\(/g) ?? []).length, 1);
ok("開いているかは要素ではなく控えで覚える", /^let moreMenuOpen = false;$/m.test(code), true);
ok("画面の幅が変わったら組み立て直す", /render\(\);/.test(fn("handleResize")), true);

// ---------------------------------------------------------------------------
console.log("\n--- 4. 小窓を開いている間を「書いている最中」と誤読しない ---");
const show = fn("showMoreMenu");
ok("先に畳んでから開く", show.indexOf("hidePopover();") < show.indexOf("moreMenuOpen = true;"), true);
ok("選択の帯も引っ込める", /(?:selectionFeature\.)?hideSelectionBar\(\);/.test(show), true);
ok("入れ物は使い回す（新しく作らない）", /popover\.className = "popover is-compact is-menu";/.test(show), true);
ok("枠には用途の名前（その他）", /nameSurface\((?:selectionFeature\.)?popover, t\("toolbox\.bar\.more"\)\)/.test(show), true);
ok("押すたびに開け閉てする", /if \(moreMenuOpen\) \{\s*(?:selectionFeature\.)?hidePopover\(\);\s*return;\s*\}\s*showMoreMenu\(\);/.test(fn("toggleMoreMenu")), true);
ok("印の一覧に小窓が入っている", /NOT_COMPOSING_MARKS = \["is-compact", "is-peek", "is-menu"\]/.test(code), true);
ok("判定はその一覧だけを見る", /!NOT_COMPOSING_MARKS\.some\(\(mark\) => marks\.contains\(mark\)\)/.test(fn("isComposing")), true);
console.log("\n   見た目");
ok("縦に並べる", declared(".popover.is-menu", "flex-direction"), "column");
ok("段の間は行の間より 1 段広い（space-2）", declared(".popover.is-menu", "gap"), "var(--space-2)");
ok("行は押せる 1 行の語彙（.button）を借りる", /el\("button", "button menu-row"\)/.test(fn("moreMenuNodes")), true);
ok("行は絵柄と名前を横に並べる", declared(".menu-row", "display"), "flex");
ok("行の高さは道具箱のほかの部品と同じ 32px", declared(".menu-row", "height"), "var(--size-control)");
ok("小窓に見出しの見た目は無い", /\.popover\.is-menu \.list-menu-label/.test(CSS), false);
ok("古い「自分」の見た目は残っていない", /\.bar-self|\.popover\.is-self/.test(CSS), false);

// ---------------------------------------------------------------------------
console.log("\n--- 5. 幅の総当たり（いちばん混んだ姿でも収まる）---");
const count = Math.ceil(px("--font-xs") * 0.6); // 件数の 1 桁（読まない字の段）
const gap = px("--space-1");
const pad = px("--space-2");
const iconPx = ICON_SIZE.medium;

const commentButton = pad * 2 + iconPx + gap + count;
const divider = px("--rule-thin") + gap * 2;
const iconButton = pad * 2 + iconPx;
const chrome = pad * 2 + px("--rule-thin") * 2;
/** 絵柄だけのボタンは 4 つ（文字起こし・直す・リンク・⋯）＝議事録を書ける人の姿 */
const barWidth = chrome + commentButton + iconButton + divider + iconButton * 3;
/** バーは右から 24px 内側に置く。左にも同じだけ空けて、本文に貼り付かせない */
const margin = px("--space-5") * 2;

console.log("並べたもの                        幅");
console.log("-".repeat(42));
for (const [name, value] of [
  ["器（内側余白と枠）", chrome],
  ["コメント（絵柄と件数）", commentButton],
  ["文字起こし", iconButton],
  ["区切り線", divider],
  ["絵柄だけのボタン × 3", iconButton * 3],
]) {
  console.log(`${name.padEnd(30)}  ${String(value).padStart(5)}px`);
}
console.log("-".repeat(42));
console.log(`${"バー".padEnd(30)}  ${String(barWidth).padStart(5)}px`);

ok("コメントボタン（件数あり）の幅", commentButton, 43);
ok("絵柄だけのボタンの幅", iconButton, 32);
ok("バーの幅", barWidth, 198);
ok("320 で収まる", barWidth + margin <= 320, true);
let overflow = 0;
for (let width = 320; width <= 480; width += 1) {
  if (barWidth + margin > width) overflow += 1;
}
ok("320px 〜 480px を 1px ずつ総当たりしてはみ出した幅の数", overflow, 0);
ok("件数は残す", /if \(openCount > 0\) \{\s*comments\.appendChild\(el\("span", "bar-count"/.test(barBuild), true);
ok("コメントの文字は出さない", /el\("span", "bar-label"/.test(barBuild), false);

// ---------------------------------------------------------------------------
console.log("\n--- 6. 下端の持ち主と、バーが残るか ---");
const none = { menu: false, dock: false, peek: false, selection: false };
ok("小窓が最優先", bottomOwner({ menu: true, dock: true, peek: true, selection: true }), "menu");
ok("小窓が出ていなければ今までどおり", bottomOwner({ ...none, dock: true }), "dock");
ok("小窓が持ち主でもバーは残る", toolbarVisible({ ...none, menu: true }, false), true);
ok("ドックが持ち主ならしまう", toolbarVisible({ ...none, dock: true }, false), false);
ok("板が覆っていれば小窓でもしまう", toolbarVisible({ ...none, menu: true }, true), false);
ok("調停に小窓を渡している", /menu: moreMenuOpen,/.test(fn("render")), true);

// ---------------------------------------------------------------------------
console.log("\n--- 7. 現在地の行: 左端は製品の印、右端は顔（サイドバーを畳んだメニュー）---");
ok("印の形は正本（src/lib/settings/brand.ts）から", /from "\.\.\/\.\.\/lib\/settings\/brand"/.test(LOCATION) && /MARK_SHEET_PATH|MARK_FOLD_PATH|MARK_TILE_RADIUS|MARK_VIEW_BOX/.test(fnOf(LOCATION, "brandMark")), true);
ok("印の行き先はホーム", /this\.mark\.href = HOME_PLACE\.href;/.test(LOCATION), true);
ok("印の読み上げの名前は場所の名前（ホーム）", /const home = placeLabel\(HOME_PLACE, t\);[\s\S]*?this\.mark\.setAttribute\("aria-label", home\);/.test(LOCATION), true);
ok("並びは 枠 → 印 →（組織のロゴ）→ 場所と題 → 星 → 版 → 顔", /bar\.append\(this\.lead, this\.mark, \.\.\.\(logo === null \? \[\] : \[logo\]\), crumbs, this\.favorite, this\.version, this\.self\);/.test(LOCATION), true);
ok("印はサイドバーの頭と同じ 20px", /svg\.setAttribute\("width", "20"\);\s*svg\.setAttribute\("height", "20"\);/.test(fnOf(LOCATION, "brandMark")), true);
ok("印の面は絵のボタンと同じ 32px", [declaredLocation(".mark", "width"), declaredLocation(".mark", "height")].join(","), "var(--control),var(--control)");
ok("印の色は墨と地の 2 つだけ", [declaredLocation(".mark-tile", "fill"), declaredLocation(".mark-sheet", "fill"), declaredLocation(".mark-fold", "fill")].join(","), "var(--ink),var(--ground),var(--ink)");
ok("行の左右の余白はサイドバーと同じ 12px", declaredLocation(".bar", "padding"), "0 12px");

console.log("\n   顔のメニューはサイドバーを畳んだもの");
const places = [...LOCATION.matchAll(/\{ place: ([A-Z_]+), icon: ([A-Z_]+) \}/g)].map((m) => `${m[1]}:${m[2]}`);
ok("場所はサイドバーと同じ 4 つ、同じ順（ホーム・自分の資料・会社の資料・お気に入り）", places.join(","), "HOME_PLACE:ICON_HOME,MINE_PLACE:ICON_FOLDER,LIBRARY_PLACE:ICON_COMPANY,FAVORITES_PLACE:ICON_STAR");
ok("サイドバーの並びも ホーム → 自分の資料 → 会社の資料", /WORKSPACE_PLACES: readonly WorkspacePlace\[\] = \[\s*HOME_PLACE,\s*MINE_PLACE,\s*LIBRARY_PLACE,\s*\]/.test(PLACES), true);
ok("場所の名前は正本（workspace-places）から引く", /label: placeLabel\(entry\.place, t, sidebarName\(\)\)/.test(LOCATION), true);
ok("「自分の活動」（/activity）は置かない（サイドバーにも無い。入口はホームの「すべて見る」）", /ACTIVITY_PLACE|"\/activity"/.test(LOCATION), false);
ok("その下は個人設定とログアウト（サイドバーの下段と同じ）", /\{ kind: "link", label: t\("workspace\.settings"\), icon: ICON_SETTINGS, href: "\/settings" \},\s*\{ kind: "action", label: t\("workspace\.logout"\), icon: ICON_LOGOUT, run: onSignOut \},/.test(LOCATION), true);
ok("言葉もサイドバーの辞書", /settings: "個人設定"/.test(WORKSPACE_JA) && /logout: "ログアウト"/.test(WORKSPACE_JA), true);
ok("絵はサイドバーと同じ Lucide（house / folder / building-2 / star / settings / log-out）", [ICON_HOME, ICON_FOLDER, ICON_COMPANY, ICON_STAR, ICON_SETTINGS, ICON_LOGOUT].every((paths) => Array.isArray(paths) && paths.length > 0), true);
ok("個人設定の前だけ余白 1 段（線は引かない）", /if \(row\.kind === "link" && row\.href === "\/settings"\) item\.classList\.add\("is-apart"\);/.test(LOCATION) && declaredLocation(".menu-item.is-apart", "margin-top") === "8px" && !/border-top/.test(LOCATION_CSS), true);

console.log("\n   寸法はワークスペースのメニューと同じ");
ok("顔の丸は 24px（サイドバーの名乗りの行と同じ）", [declaredLocation(".avatar", "width"), declaredLocation(".avatar", "height")].join(","), "24px,24px");
ok("丸の地は押した面の濃さ（--press）", declaredLocation(".avatar", "background"), "var(--press)");
ok("顔の面は絵のボタンと同じ 32px", [declaredLocation(".self", "width"), declaredLocation(".self", "height")].join(","), "var(--control),var(--control)");
ok("メニューは顔の真下 4px（44px の行の中の 32px の面の下端 + 4）", declaredLocation(".sheet", "top"), "42px");
ok("右端は顔の面の右端（行の余白と同じ 12px）", declaredLocation(".sheet", "right"), "12px");
ok("幅は 11rem から（.ws-menu と同じ）", declaredLocation(".sheet", "min-width"), "176px");
ok("内側 4px・角 8px", [declaredLocation(".sheet", "padding"), declaredLocation(".sheet", "border-radius")].join(","), "4px,var(--radius-lg)");
ok("行は 32px・内側 8px・角 4px", [declaredLocation(".menu-item", "min-height"), declaredLocation(".menu-item", "padding"), declaredLocation(".menu-item", "border-radius")].join(","), "var(--control),0 8px,var(--radius-sm)");
ok("影は線 1 本と 2 段のぼかし（--ws-shadow と同じ）", /--shadow: 0 0 0 1px var\(--line\), 0 8px 24px -6px rgb\(0 0 0 \/ 0\.14\), 0 2px 6px -2px rgb\(0 0 0 \/ 0\.08\);/.test(LOCATION_CSS), true);
ok("開いている間だけ道具箱の層より上", /:host\(\[data-menu-open\]\) \{ z-index: 2147483100; \}/.test(LOCATION_CSS) && /this\.host\.setAttribute\("data-menu-open", ""\);/.test(LOCATION) && /this\.host\.removeAttribute\("data-menu-open"\);/.test(LOCATION), true);
ok("墨はワークスペースのまま（道具箱の色を使わない）", /var\(--(accent|surface|text)\)/.test(LOCATION_CSS), false);

// ---------------------------------------------------------------------------
console.log("\n--- 8. 顔は名乗りだけから描く。言わないこと。ログアウトの口 ---");
const showSelf = methodOf(LOCATION, "showSelf");
ok("会社の人は頭文字の丸", /el\("span", "avatar", viewer\.name\.slice\(0, 1\)\)/.test(showSelf), true);
ok("名乗っていない人は輪郭（台帳の絵柄）", /icon\(ICON_CIRCLE_USER, 24, STROKE\)/.test(showSelf) && ICON_CIRCLE_USER.length === 3, true);
ok("読み上げる名前は表示名から", /t\("toolbox\.self\.labelNamed", \{ name: viewer\.name \}\) : t\("toolbox\.self\.label"\)/.test(showSelf) && /labelNamed: "自分（\{name\}）"/.test(TOOLBOX_JA), true);
ok("名乗っていない人の行き先は 1 つ（Pages を開く）", /: \[\{ kind: "link", label: t\("toolbox\.self\.openProduct"\), icon: ICON_HOME, href: HOME_PLACE\.href \}\]/.test(showSelf) && /openProduct: "Pages を開く"/.test(TOOLBOX_JA), true);
ok("「ログインしていません」と告げない", /ログインしていません|未ログイン/.test(`${LOCATION}${code}`), false);
ok("アドレスを触っていない", /email/.test(showSelf), false);
ok("押すと何かが開くと伝える", /this\.self\.setAttribute\("aria-haspopup", "menu"\)/.test(LOCATION), true);
ok("道具箱は名乗りが届くたびに顔を描き直す（名乗りを読む口を増やさない）", [/showSelf\(\);/.test(fn("applyLoaded")), /if \(state\.viewer !== null\) showSelf\(\);/.test(fn("showLocationBar")), /state\.viewer = null;\s*showSelf\(\);/.test(fn("handleFailure"))].join(","), "true,true,true");
ok("届く前は顔を出さない（輪郭 → 頭文字のちらつきを作らない）", /this\.self\.hidden = true;/.test(LOCATION) && /this\.self\.hidden = false;/.test(methodOf(LOCATION, "showSelf")), true);
ok("顔に渡すのは名乗りとログアウトだけ", /locationBar\?\.showSelf\(state\.viewer, \(\) => void signOut\(\)\);/.test(fn("showSelf")), true);
console.log("\n   ログアウトはサイドバーと同じ Auth.js の口");
const signOut = fn("signOut");
ok("合言葉を取ってから", /const result = await loadSignOutToken\(\);/.test(signOut), true);
ok("合言葉は Auth.js の口（/api/auth/csrf）から", /send\("\/api\/auth\/csrf", \{ method: "GET", cache: "no-store" \}\)/.test(fnOf(API, "loadSignOutToken")), true);
ok("送るのは form で POST /api/auth/signout", /form\.method = "post";\s*form\.action = "\/api\/auth\/signout";/.test(signOut), true);
ok("戻し先はログインの画面（サイドバーと同じ /signin）", /\["callbackUrl", "\/signin"\]/.test(signOut), true);
ok("合言葉が取れなければ何もしない（半端な状態を作らない）", /if \(!result\.ok\) \{\s*handleFailure\(result\);\s*return;\s*\}/.test(signOut), true);
ok("外へ出る口は 1 つのまま", (API.match(/await fetch\(/g) ?? []).length, 1);
// 名前だけで参加する口（/api/guest）を畳んだので 1 本減り、
// ページ本文をブラウザから直す口（取り寄せ・保存の 2 本）と
// コメントの物語の口と、原本の取り込み（鮮度・開始・成り行き・差分）で増えた。
// まとめて解決は**一覧と同じ口**（/api/comments）を別の作法で叩くので 1 本増える。
// 現在地の行の「いつ・何版目」は**版の一覧と同じ口**（/api/history）を 1 版だけで叩くので 1 本増える。
// 現在地の行の星（お気に入りの付け外し）は**一覧の行の星と同じ口**（/api/workspace）を叩くので 1 本増える。
// 顔のメニューのログアウトの合言葉（/api/auth/csrf）で 1 本増える。
// 自然な声の読み上げ（ベータ機能）の読み方（/api/read-aloud/plan）で 1 本増える。声そのもの（/api/read-aloud/speech）は
// 音を受け取るので send を通さないが、外へ出る口（reach）は同じ 1 つを通る。
// 読み上げの速さを本人の個人設定へ残す口（/api/workspace の readAloudRate）で 1 本増える。
// 配布版では読み上げ（読み方の口・速さを残す口）と Slack の部屋の候補（/api/slack/channels）の 3 本を外したので 19。
ok("行き先の数は 19（読み上げと Slack の口を外したあと）", (API.match(/await send\(/g) ?? []).length, 19);
ok("名乗りを取りに行く口は増えていない", (API.match(/\$\{commentsEndpoint\}\?page=/g) ?? []).length, 1);

console.log("\n   メニューの操作（矢印・Escape・外を押す・焦点戻し）");
const onKey = methodOf(LOCATION, "onMenuKey");
ok("矢印で行を移る（端で折り返す）", /ArrowDown/.test(onKey) && /ArrowUp/.test(onKey) && /\(index \+ items\.length\) % items\.length/.test(onKey), true);
ok("Home / End", /"Home"/.test(onKey) && /"End"/.test(onKey), true);
ok("Escape で畳み、顔へ焦点を返す", /event\.key === "Escape"\) \{\s*event\.preventDefault\(\);\s*this\.closeSelfMenu\(true\);/.test(onKey), true);
ok("開いたら最初の行に焦点", /this\.menuItems\(\)\[0\]\?\.focus\(\);/.test(methodOf(LOCATION, "openSelfMenu")), true);
ok("顔とメニュー以外を押されたら畳む（通り道で見る）", /if \(path\.includes\(this\.self\) \|\| path\.includes\(this\.sheet\)\) return;\s*this\.closeSelfMenu\(false\);/.test(LOCATION), true);
ok("行は本物のリンクかボタンで、役割は menuitem", /row\.kind === "link" \? el\("a", "menu-item"\) : el\("button", "menu-item"\)/.test(LOCATION) && /item\.setAttribute\("role", "menuitem"\)/.test(LOCATION), true);
ok("名乗りの行は menu の枠の外（menu の子は menuitem だけ）", /this\.sheet\.append\(el\("p", "menu-name", this\.selfName\)\)/.test(LOCATION) && /this\.sheet\.append\(this\.menu\);/.test(LOCATION), true);

// ---------------------------------------------------------------------------
console.log("\n--- 9. 本物の DOM で開け閉てする ---");
/*
 * ここまでは字面の検査なので、「押した瞬間に自分で畳んでしまう」たぐいの取り違えは
 * 見つからない。本体を丸ごと jsdom に載せて、実際に押して確かめる。
 * 保管庫にもネットワークにも繋がない（サーバーの応答は手元の作り物）。
 */
const { JSDOM } = await import("jsdom");
await build({
  entryPoints: [`${root}/src/widget/comments/comments.ts`],
  outfile: `${dir}/tm-widget.mjs`,
  bundle: true,
  format: "esm",
  platform: "neutral", mainFields: ["module", "main"],
});

const settle = () => new Promise((done) => setTimeout(done, 40));

/** 本体が見に行く窓まわりの名前を、この画面のものに差し替える。 */
function installGlobals(win) {
  const names = [
    "window", "document", "navigator", "location", "HTMLElement", "HTMLAnchorElement", "HTMLButtonElement", "Element", "Node", "Range",
    "getComputedStyle", "requestAnimationFrame", "cancelAnimationFrame", "matchMedia", "fetch",
    "MutationObserver", "ResizeObserver", "IntersectionObserver", "getSelection", "customElements",
  ];
  for (const name of names) {
    if (!(name in win)) continue;
    const held = win[name];
    const value = typeof held === "function" && !/^[A-Z]/.test(name) ? held.bind(win) : held;
    Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
  }
}

let mounted = 0;

/** 配信側が書き入れる読み込みの札を再現する（src/lib/pages/content.ts の `withCommentsWidget`）。 */
function widgetTag(path, extra = ' data-organization-name="見本商事"') {
  const named = `${path.startsWith("/public/") ? "public" : "internal"}${path.slice(2)}`;
  // 組織の名前（とロゴ）も配信と同じく札に書く。場所の名前は札の名前で言う
  return `<script src="/comments-widget.js/x" data-page="${named}"${extra} defer></script>`;
}

/**
 * 本体を本物の DOM に載せる。名乗り（viewer）と居場所（/i か /p）だけを差し替える。
 * `status` に 401 を渡すと「ログインが切れている」画面になる。
 */
async function mount(path, viewer, { status = 200, comments = [], sharing = false, tag = undefined } = {}) {
  const dom = new JSDOM(`<!doctype html><html><body><p>本文</p>${widgetTag(path, tag)}</body></html>`, {
    url: `https://example.com${path}`,
    pretendToBeVisual: true,
  });
  const win = dom.window;
  win.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  win.scrollTo = () => {};
  win.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  win.IntersectionObserver = win.ResizeObserver;
  const asked = [];
  win.fetch = async (target) => {
    asked.push(String(target));
    return {
      ok: status === 200,
      status,
      json: async () => {
        if (status !== 200) return { error: "ログインが必要です" };
        if (String(target).startsWith("/api/auth/csrf")) return { csrfToken: "token-1" };
        if (!String(target).startsWith("/api/comments")) return {};
        return {
          viewer,
          comments,
          currentVersion: "abc1234",
          // 道具箱を出すのは会社の人だけ（サーバーと同じ決まりで答える）
          features: { tools: viewer?.kind === "member", history: true, slack: false, sharing },
        };
      },
    };
  };

  installGlobals(win);
  mounted += 1;
  await import(`${dir}/tm-widget.mjs?mount=${mounted}`);
  await settle();

  const shadow = win.document.querySelector("surprise-comments")?.shadowRoot ?? null;
  const location = win.document.querySelector("surprise-location")?.shadowRoot ?? null;
  const find = (selector) => shadow?.querySelector(selector) ?? null;
  const findLocation = (selector) => location?.querySelector(selector) ?? null;
  const press = async (node) => {
    installGlobals(win);
    node?.dispatchEvent(new win.MouseEvent("click", { bubbles: true, composed: true }));
    await settle();
  };
  const key = async (node, name) => {
    installGlobals(win);
    (node ?? win.document).dispatchEvent(new win.KeyboardEvent("keydown", { key: name, bubbles: true, composed: true }));
    await settle();
  };
  const menuOpen = () => {
    const pop = find(".popover");
    return pop !== null && !pop.hidden && pop.classList.contains("is-menu");
  };
  const menuRows = () => [...(shadow?.querySelectorAll(".popover.is-menu .menu-row") ?? [])].map((row) => row.textContent);
  const barTitles = () => [...(shadow?.querySelectorAll(".bar button") ?? [])].map((one) => one.title);
  const selfOpen = () => findLocation(".sheet") !== null && !findLocation(".sheet").hidden;
  const selfItems = () => [...(location?.querySelectorAll(".menu-item") ?? [])];
  installGlobals(win);
  return { win, shadow, location, asked, find, findLocation, press, key, menuOpen, menuRows, barTitles, selfOpen, selfItems };
}

const MEMBER = { kind: "member", name: "作 二郎", image: null };
const GUEST = { kind: "guest", name: "はなこ", image: null };

console.log("\n   右下の ⋯（会社の人・社内ページ）");
const member = await mount("/internal/report/2026q1", MEMBER);
const more = () => member.find(".bar .bar-more");
console.log(`      バー: ${member.barTitles().join(" / ")}`);
ok("バーは コメント / リンクをコピー / その他 の 3 つ", member.barTitles().join(","), "コメント,リンクをコピー,その他");
ok("⋯ はバーの右端", member.barTitles().at(-1), "その他");
ok("顔はバーに無い", member.find(".bar .bar-self"), null);
ok("まだ開いていないと伝えている", more()?.getAttribute("aria-expanded"), "false");
await member.press(more());
ok("押すと開く（開いた直後に自分で畳まない）", member.menuOpen(), true);
ok("開いていると伝えている", more()?.getAttribute("aria-expanded"), "true");
ok("枠の名前は「その他」", member.find(".popover.is-menu")?.getAttribute("aria-label"), "その他");
console.log(`      ⋯ の中: ${member.menuRows().join(" / ")}`);
ok("上端に「いつ・何版目」が無い画面なので、履歴が ⋯ に入る", member.menuRows().join(","), "履歴");
ok("小窓の字は行の名前だけ（見出しが無い）", member.find(".popover.is-menu")?.textContent, "履歴");
ok("開いてもバーは出たまま（土台を消さない）", member.find(".bar")?.hidden, false);
await member.press(more());
ok("もう一度押すと畳む", member.menuOpen(), false);
await member.press(more());
await member.press(member.win.document.querySelector("p"));
ok("外を押しても畳む", member.menuOpen(), false);
await member.press(more());
await member.key(null, "Escape");
ok("Escape でも畳む", member.menuOpen(), false);
ok("畳んだら焦点が ⋯ に戻る", member.shadow?.activeElement?.classList.contains("bar-more"), true);
await member.press(more());
await member.press(member.find(".popover.is-menu .menu-row"));
ok("行を押すと畳まれる", member.menuOpen(), false);
ok("そのとき行の用は足りている（履歴の板が開く）", member.find(".panel")?.hidden === false && member.find(".panel-title")?.textContent === "版の一覧", true);
await member.press(member.find(".bar button"));
await member.press(more());
await member.press(member.find(".bar button"));
ok("隣のボタンを押しても畳む", member.menuOpen(), false);

console.log("\n   上端の顔（会社の人）");
const face = () => member.findLocation(".self");
ok("印が左端にある（行き先はホーム）", member.findLocation(".mark")?.getAttribute("href"), "/");
ok("印の読み上げの名前は「ホーム」", member.findLocation(".mark")?.getAttribute("aria-label"), "ホーム");
ok("顔が右端に出ている", face() !== null && face().hidden === false, true);
ok("中身は頭文字の丸", member.findLocation(".self .avatar")?.textContent, "作");
ok("読み上げる名前に表示名が入る", face()?.getAttribute("aria-label"), "自分（作 二郎）");
ok("まだ開いていないと伝えている", face()?.getAttribute("aria-expanded"), "false");
await member.press(face());
ok("押すと開く", member.selfOpen(), true);
ok("開いていると伝えている", face()?.getAttribute("aria-expanded"), "true");
ok("名乗りの行が先頭", member.findLocation(".sheet .menu-name")?.textContent, "作 二郎");
console.log(`      行: ${member.selfItems().map((item) => item.textContent).join(" / ")}`);
ok("行はサイドバーを畳んだもの", member.selfItems().map((item) => item.textContent).join(","), "ホーム,自分の資料,見本商事 の資料,お気に入り,個人設定,ログアウト");
ok("行き先", member.selfItems().filter((item) => item.tagName === "A").map((item) => item.getAttribute("href")).join(","), "/,/mine,/library,/favorites,/settings");
ok("ログアウトは押す操作（ボタン）", member.selfItems().at(-1)?.tagName, "BUTTON");
ok("行の役割は menuitem", member.selfItems().every((item) => item.getAttribute("role") === "menuitem"), true);
ok("menu の枠の子は行だけ", [...member.findLocation(".menu").children].every((child) => child.classList.contains("menu-item")), true);
ok("アドレスは出ていない", /[\w.-]+@[\w.-]+/.test(member.findLocation(".sheet")?.textContent ?? ""), false);
ok("開いたら最初の行に焦点", member.location?.activeElement?.textContent, "ホーム");
await member.key(member.location?.activeElement, "ArrowDown");
ok("矢印で次の行へ", member.location?.activeElement?.textContent, "自分の資料");
await member.key(member.location?.activeElement, "ArrowUp");
await member.key(member.location?.activeElement, "ArrowUp");
ok("上端で折り返す", member.location?.activeElement?.textContent, "ログアウト");
await member.key(member.location?.activeElement, "Escape");
ok("Escape で畳む", member.selfOpen(), false);
ok("畳んだら焦点が顔に戻る", member.location?.activeElement?.classList.contains("self"), true);
await member.press(face());
await member.press(member.win.document.querySelector("p"));
ok("外を押しても畳む", member.selfOpen(), false);
await member.press(face());
await member.press(face());
ok("もう一度押すと畳む", member.selfOpen(), false);
await member.press(face());
await member.press(member.selfItems().at(-1));
ok("ログアウトを押すと畳まれ、合言葉を取りに行く", member.selfOpen() === false && member.asked.some((one) => one.startsWith("/api/auth/csrf")), true);
const form = member.win.document.querySelector("form[action='/api/auth/signout']");
ok("送るのは form（合言葉と戻し先）", form !== null && form.method === "post" && form.querySelector("input[name='csrfToken']")?.value === "token-1" && form.querySelector("input[name='callbackUrl']")?.value === "/signin", true);

console.log("\n   公開ページを社外の人が開いたとき（道具箱ごと出ない）");
const outside = await mount("/public/guide/intro", GUEST);
ok("バーごと出ない", outside.find(".bar"), null);
ok("現在地の行も出ない（顔も印も無い）", outside.location, null);
ok("本文はそのまま残る", outside.win.document.querySelector("p")?.textContent, "本文");

console.log("\n   ログインが切れた画面（顔は輪郭に戻る）");
const nobody = await mount("/internal/report/2026q1", MEMBER, { status: 401 });
const nobodyFace = nobody.findLocation(".self");
ok("中身は丸で囲った人型", nobodyFace?.querySelector(".icon svg") !== null, true);
ok("頭文字の丸は出ていない", nobodyFace?.querySelector(".avatar"), null);
ok("読み上げる名前は「自分」", nobodyFace?.getAttribute("aria-label"), "自分");
await nobody.press(nobodyFace);
ok("行き先だけが並ぶ", nobody.selfItems().map((item) => item.textContent).join(","), "Pages を開く");
ok("名乗りの行は無い", nobody.findLocation(".sheet .menu-name"), null);
ok("身分照会を告げていない", /ログイン/.test(nobody.findLocation(".sheet")?.textContent ?? ""), false);

console.log("\n   組織の名前とロゴ（配信が札に書いたものだけ）");
ok("直に開いたときの戻る先は、札の組織の名前で言う", member.findLocation(".place")?.textContent, "見本商事 の資料");
const logo = await mount("/internal/report/2026q1", MEMBER, { tag: ' data-organization-name="とても長い組織の名前でございます株式会社" data-organization-logo="/api/organization/logo?v=0123456789abcdef"' });
ok("ロゴは印の右に置く（飾りなので読み上げない）", [logo.findLocation(".mark + img.logo")?.getAttribute("src"), logo.findLocation("img.logo")?.getAttribute("alt"), logo.findLocation("img.logo")?.getAttribute("aria-hidden")].join(" | "), "/api/organization/logo?v=0123456789abcdef |  | true");
ok("現在地の行は名前を切らない", logo.findLocation(".place")?.textContent, "とても長い組織の名前でございます株式会社 の資料");
await logo.press(logo.findLocation(".self"));
ok("顔のメニューはサイドバーを畳んだものなので、サイドバーと同じ 12 字で切る", logo.selfItems()[2]?.textContent, "とても長い組織の名前でご… の資料");
const strange = await mount("/internal/report/2026q1", MEMBER, { tag: ' data-organization-logo="https://evil.example/logo.png"' });
ok("自分の宛先のロゴの窓口でない行き先は使わない", strange.findLocation("img.logo"), null);
ok("札に名前が無ければ一般語（字のまま {organization} を出さない）", strange.findLocation(".place")?.textContent, "この組織 の資料");

// 道具箱は見ている間、定期にコメントを読み直す（src/widget/comments/live.ts）。jsdom に載せたままなので、検査が済んだらここで終える
process.exit();
