/**
 * 動きの決まり（DESIGN.md 11 章）を確かめる。
 *
 * 起きていたのはこれ。個人設定のオン/オフが、サーバーの返事を待ってから切り替わり、待っている間は部品が
 * 薄くなっていた（`disabled={busy}`）。押してから 0.5 秒ほど何も起きず、起きたと思ったら薄い部品が戻る——
 * 「重い・安っぽい」の正体は、動きの速さではなく**返事を待つ作り**と**待ちの見せ方**だった。
 *
 * だから見張るのは 4 つ。
 *   1. 正本と写しが同じ数字か（src/lib/settings/ui-motion.ts ⇄ src/app/globals.css ⇄ src/widget/shared/tokens.ts）
 *   2. 画面（src/app/**・src/app/_components）と道具箱（src/widget/**）が、数字とカーブを直に書いていないか。
 *      動かしてよい性質（透明度・位置・色）の外を動かしていないか（免除台帳は減る方向だけ）
 *   3. 押した結果を返事を待たずに映しているか（設定・星・解決）。選んだ状態を持つ部品を待ちで無効にしていないか
 *   4. 開くものの出入りと、動きを減らす設定の受け皿があるか。正本（DESIGN.md）が名前を全部載せているか
 *
 * 保管庫にもネットワークにも繋がない。
 */
import { readdir, readFile } from "node:fs/promises";

import { root } from "./paths.mjs";

/** 説明書き（コメント）を落としてから見る。説明文の中の数字を拾わないため（改行は残し、行番号を保つ）。 */
const strip = (text) =>
  text
    .replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, ""))
    .replace(/^[ \t]*\/\/.*$/gm, "");

const read = async (path) => readFile(`${root}/${path}`, "utf8");

let fails = 0;
const ok = (label, actual, expected) => {
  const pass = JSON.stringify(actual) === JSON.stringify(expected);
  if (!pass) fails += 1;
  console.log(`${pass ? "OK  " : "NG  "} ${label}: ${JSON.stringify(actual)}（期待: ${JSON.stringify(expected)}）`);
};

/** 行番号（1 始まり）。直す先を指すため。 */
const lineOf = (text, index) => text.slice(0, index).split("\n").length;

// ---------------------------------------------------------------------------
console.log("--- 1. 正本と写し（src/lib/settings/ui-motion.ts ⇄ globals.css ⇄ src/widget/shared/tokens.ts）---");

const MOTION_SOURCE = strip(await read("src/lib/settings/ui-motion.ts"));
const number = (name) => Number(new RegExp(`\\b${name}: (\\d+),`).exec(MOTION_SOURCE)?.[1] ?? NaN);
const motion = { quick: number("quick"), base: number("base"), exit: number("exit"), swipe: number("swipe"), wait: number("wait") };
const ease = /export const EASE = "([^"]+)";/.exec(MOTION_SOURCE)?.[1] ?? "";
const easeSwipe = /export const EASE_SWIPE = "([^"]+)";/.exec(MOTION_SOURCE)?.[1] ?? "";
ok("正本に 5 つの長さがある", Object.values(motion).every((value) => Number.isInteger(value) && value > 0), true);
ok("正本に減速のカーブが 2 つある", [ease.startsWith("cubic-bezier("), easeSwipe.startsWith("cubic-bezier(")], [true, true]);
ok("色の変化 < 状態の変化 < 横に送る（短いものほど速い）", motion.quick < motion.base && motion.base < motion.swipe, true);
ok("閉じるのは出すより速い", motion.exit < motion.base, true);
ok("待ちを見せるのは状態の変化より後", motion.wait > motion.base, true);
ok("跳ね返りの無いカーブ（終点を越えない）", [ease, easeSwipe].every((curve) => (curve.match(/-?\d*\.?\d+/g) ?? []).map(Number).every((v) => v >= 0 && v <= 1)), true);

const CSS = strip(await read("src/app/globals.css"));
const token = (name) => new RegExp(`--${name}: ([^;]+);`).exec(CSS)?.[1] ?? null;
ok("画面の写し: --ws-motion-quick", token("ws-motion-quick"), `${motion.quick}ms`);
ok("画面の写し: --ws-motion", token("ws-motion"), `${motion.base}ms`);
ok("画面の写し: --ws-motion-exit", token("ws-motion-exit"), `${motion.exit}ms`);
ok("画面の写し: --ws-motion-wait", token("ws-motion-wait"), `${motion.wait}ms`);
ok("画面の写し: --ws-ease", token("ws-ease"), ease);
ok("画面の写し: --ws-ease-swipe", token("ws-ease-swipe"), easeSwipe);
ok("Tailwind の transition-* の既定も同じ目盛り（@theme）", [
  /@theme \{[^}]*--default-transition-duration: var\(--ws-motion-quick\);/.test(CSS),
  /@theme \{[^}]*--default-transition-timing-function: var\(--ws-ease\);/.test(CSS),
], [true, true]);

const TOKENS = strip(await read("src/widget/shared/tokens.ts"));
ok("道具箱の写し: --duration は正本から", /--duration: \$\{MOTION\.quick\}ms;/.test(TOKENS), true);
ok("道具箱の写し: --duration-base は正本から", /--duration-base: \$\{MOTION\.base\}ms;/.test(TOKENS), true);
ok("道具箱の写し: --ease は正本から", /--ease: \$\{EASE\};/.test(TOKENS), true);
ok("道具箱の写し: --ease-swipe は正本から", /--ease-swipe: \$\{EASE_SWIPE\};/.test(TOKENS), true);
ok("道具箱の写し: 横に送る長さ（JS の待ち時間）も正本から", /export const SWIPE_MS: number = MOTION\.swipe;/.test(TOKENS), true);

// ---------------------------------------------------------------------------
console.log("\n--- 2. 数字とカーブの直書き・動かしてはいけない性質 ---");

/** 動かしてよい性質（透明度・位置・色）。幅・高さ・余白・top/left は描き直しが要るので動かさない。 */
const MOVABLE = new Set([
  "opacity", "transform", "translate", "scale", "rotate",
  "color", "background", "background-color", "border-color", "box-shadow", "outline-color", "fill", "stroke",
]);
/**
 * 免除台帳（減る方向だけ）。動かしてはいけない性質を、いまだけ動かしている場所。
 * 消せたら台帳からも消す（台帳に残っているのに実物に無ければ落ちる）。
 */
const LAYOUT_EXEMPT = [
  { file: "src/widget/shared/styles.ts", property: "top", why: "狭い画面の一覧の板。位置を top で持っているので、transform に移すまでの免除" },
  { file: "src/widget/comments/selection.ts", property: "padding-right", why: "本文を右へ押して欄を出す。余白で押しているので、transform に移すまでの免除" },
];

/** 長さの直書き（120ms・.15s）。var(--…) と ${MOTION.x}ms・${…_MS}ms は通す。 */
const LITERAL_TIME = /(?<![\w$}\-])\d*\.?\d+m?s\b/;
/** カーブの語の直書き。var(--ease…) と ${EASE…} は通す。 */
const LITERAL_EASE = /(?<![\w-{])(?:ease|ease-in|ease-out|ease-in-out|linear|step-start|step-end|steps\(|cubic-bezier\()(?![\w-])/;

/**
 * 1 つの transition / animation の指定を読む。`transition: a 1s, b 2s` の形を「,」で分け、それぞれ先頭の語を性質とする。
 * 返すのは問題の一覧（空なら合格）。
 */
function inspectDeclaration(kind, value, { allowLiteral = false } = {}) {
  const issues = [];
  const trimmed = value.replace(/\s*!important\s*$/, "").trim();
  // none / inherit と、CSS ではなく型の 1 語（`transition: string;`）は見ない
  if (trimmed === "" || (!/\s/.test(trimmed) && !trimmed.includes("("))) return issues;
  for (const part of trimmed.split(/,(?![^(]*\))/)) {
    const words = part.trim().split(/\s+/);
    if (words.length === 0 || words[0] === "") continue;
    if (kind === "transition") {
      const property = words[0];
      if (!MOVABLE.has(property) && property !== "all") issues.push({ layout: property });
      if (property === "all") issues.push({ layout: "all（動かす性質を名指しする）" });
    }
    const rest = kind === "transition" ? words.slice(1).join(" ") : words.slice(1).join(" ");
    if (!allowLiteral && LITERAL_TIME.test(rest) && !/^0s$/.test(rest)) issues.push({ literalTime: part.trim() });
    if (!allowLiteral && LITERAL_EASE.test(rest)) issues.push({ literalEase: part.trim() });
  }
  return issues;
}

/** テキストの中の transition / animation の指定を全部拾う（CSS でも、CSS を入れた文字列でも同じ形）。 */
function* declarations(text) {
  const pattern = /(?<![\w-])(transition|animation|transition-duration|animation-duration|transition-timing-function|animation-timing-function)\s*:\s*([^;{}`]+);/g;
  for (const found of text.matchAll(pattern)) {
    yield { name: found[1], value: found[2].replace(/\s*\n\s*/g, " "), index: found.index };
  }
  // JS から書く transition（`el.style.transition = \`…\``）も同じ決まり
  const assigned = /\.style\.transition\s*=\s*`([^`]+)`/g;
  for (const found of text.matchAll(assigned)) {
    yield { name: "transition", value: found[1], index: found.index };
  }
}

const problems = [];
const exemptFound = [];
function inspectFile(path, text) {
  for (const { name, value, index } of declarations(text)) {
    const kind = name.startsWith("animation") ? "animation" : "transition";
    const bare = value.replace(/\s*!important\s*$/, "").trim();
    const issues = name.endsWith("-duration")
      ? (/^(0s|var\(--[\w-]+\)|\$\{[\w.]+\}ms)$/.test(bare) ? [] : [{ literalTime: bare }])
      : name.endsWith("-timing-function")
        ? (/^(var\(--[\w-]+\)|\$\{EASE[\w]*\})$/.test(bare) ? [] : [{ literalEase: bare }])
        : inspectDeclaration(kind, value);
    for (const issue of issues) {
      const line = `${path}:${lineOf(text, index)}`;
      if (issue.layout !== undefined) {
        const exempt = LAYOUT_EXEMPT.find((one) => one.file === path && one.property === issue.layout);
        if (exempt) {
          exemptFound.push(exempt);
          continue;
        }
        problems.push(`${line} 動かしてはいけない性質 ${issue.layout}`);
      } else if (issue.literalTime !== undefined) {
        problems.push(`${line} 長さの直書き「${issue.literalTime}」`);
      } else {
        problems.push(`${line} カーブの直書き「${issue.literalEase}」`);
      }
    }
  }
}

inspectFile("src/app/globals.css", CSS);
inspectFile("src/lib/pages/plain-page.ts", strip(await read("src/lib/pages/plain-page.ts")));

/** フォルダの下のファイルを集める。 */
async function walk(relative, keep) {
  const found = [];
  for (const entry of await readdir(`${root}/${relative}`, { withFileTypes: true })) {
    const next = `${relative}/${entry.name}`;
    if (entry.isDirectory()) found.push(...(await walk(next, keep)));
    else if (keep(next)) found.push(next);
  }
  return found;
}
const widgetFiles = (await walk("src/widget", (path) => path.endsWith(".ts") && !path.startsWith("src/widget/dist/") && !path.includes(".generated."))).sort();
for (const path of widgetFiles) inspectFile(path, strip(await read(path)));
ok("道具箱のファイルを見た", widgetFiles.length > 50, true);

const screens = (await walk("src/app", (path) => path.endsWith(".tsx"))).sort();
/** 画面の Tailwind の道具のうち、目盛りの外の動きを作るもの。 */
const TAILWIND_MOTION = /(?<![\w-])(?:duration-\d+|ease-(?:linear|in|out|in-out)|animate-(?:spin|ping|pulse|bounce)|transition-all|delay-\d+)(?![\w-])/g;
const tailwindMiss = [];
const pressedDisabled = [];
for (const path of screens) {
  const code = strip(await read(path));
  for (const found of code.matchAll(TAILWIND_MOTION)) tailwindMiss.push(`${path}:${lineOf(code, found.index)} ${found[0]}`);
  // 選んだ状態を持つ部品（aria-pressed）を、待ちで無効にしない（1 つのタグの中に両方があれば落とす）
  for (const tag of code.matchAll(/<[A-Za-z][^>]*aria-pressed[^>]*>/g)) {
    if (/\sdisabled(?:=|\s|>)/.test(tag[0])) pressedDisabled.push(`${path}:${lineOf(code, tag.index)}`);
  }
  inspectFile(path, code);
}
ok("見る画面の数", screens.length > 0, true);
ok("長さ・カーブの直書きと、動かしてはいけない性質", problems.length === 0 ? "なし" : problems.join(" / "), "なし");
ok("Tailwind の目盛りの外の動き（duration-* / ease-* / animate-* / transition-all / delay-*）", tailwindMiss.length === 0 ? "なし" : tailwindMiss.join(" / "), "なし");
ok("選んだ状態を持つ部品（aria-pressed）を待ちで無効にしていない", pressedDisabled.length === 0 ? "なし" : pressedDisabled.join(" / "), "なし");
ok("免除台帳は減る方向だけ（台帳に無い免除が無い）", exemptFound.length <= LAYOUT_EXEMPT.length, true);
ok("免除台帳に残っているものは実物にもある（消せたら台帳からも消す）", LAYOUT_EXEMPT.filter((one) => !exemptFound.includes(one)).map((one) => `${one.file} ${one.property}`), []);

// ---------------------------------------------------------------------------
console.log("\n--- 3. 押した結果を返事を待たずに映す ---");

/** 名前で関数の中身を切り出す（波かっこを数える）。 */
function fnOf(source, name) {
  const at = source.search(new RegExp(`(?:async )?function ${name}\\(`));
  if (at < 0) return "";
  let cursor = source.indexOf("{", source.indexOf(")", at));
  let depth = 0;
  for (; cursor < source.length; cursor += 1) {
    if (source[cursor] === "{") depth += 1;
    else if (source[cursor] === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(at, cursor + 1);
    }
  }
  return source.slice(at);
}
/** `first` が `second` より前に出てくる（＝映してから送っている）。 */
const before = (body, first, second) => body.includes(first) && body.includes(second) && body.indexOf(first) < body.indexOf(second);

const SETTINGS = strip(await read("src/app/settings/settings-screen.tsx"));
const settingsScreen = fnOf(SETTINGS, "SettingsScreen");
// 読み上げの設定は配布版に無いので、映す値は外観・言語・ベータ機能の 3 つ
ok("個人設定は押した値を useOptimistic で映す（外観・言語・ベータ機能）", (settingsScreen.match(/useOptimistic\(/g) ?? []).length >= 3, true);
ok("個人設定は映してから送る（show() が fetch より前）", before(fnOf(settingsScreen, "save"), "show();", "await fetch("), true);
ok("個人設定の送りは transition の中（届いた値に差し替わるまで押した値を保つ）", /startTransition\(async \(\) => \{\s*show\(\);/.test(settingsScreen), true);
ok("個人設定は待ちで部品を無効にしない", /disabled=\{busy\}/.test(settingsScreen), false);
ok("個人設定の切り替えは成功を字で言わない（失敗だけ）", [/settings\.(appearance|language)\.saved/.test(SETTINGS), /settings\.beta\.turned(On|Off)/.test(SETTINGS)], [false, false]);
ok("外観は押した瞬間に <html> へ当てる（外枠の描き直しを待たない）", before(fnOf(settingsScreen, "setAppearance"), "showAppearance(value)", "applyAppearance(value)"), true);
ok("外観を当てる関数は外枠と設定で 1 つ（src/app/_components/appearance.ts）", [
  /applyAppearance\(appearance\)/.test(strip(await read("src/app/_components/workspace-shell.tsx"))),
  /from "\.\.\/_components\/appearance"/.test(SETTINGS),
], [true, true]);

const LIST = strip(await read("src/app/_components/workspace-list.tsx"));
ok("一覧の星は押した瞬間に立てる（setFavorites が fetch より前）", before(fnOf(LIST, "favorite"), "setFavorites(", "await fetch("), true);
ok("一覧の星は失敗したら戻す（catch の中で元の値に）", /catch \{\s*setFavorites\(\(current\) => \(\{ \.\.\.current, \[row\.id\]: row\.favorite \}\)\);/.test(fnOf(LIST, "favorite")), true);
const SHELL = strip(await read("src/app/_components/workspace-shell.tsx"));
ok("サイドバーの星は押した瞬間に行を消す（setRemoved が fetch より前）", before(fnOf(SHELL, "unfavorite"), "setRemoved(", "await fetch("), true);
ok("サイドバーの星は失敗したら行を戻す", /catch \{\s*setRemoved\(/.test(fnOf(SHELL, "unfavorite")), true);
const WIDGET_LIST = strip(await read("src/widget/comments/widget-list.ts"));
ok("道具箱の解決・戻すは押した瞬間に映す（render が patch より前）", before(fnOf(WIDGET_LIST, "setResolved"), "render();", "await patchComment("), true);
ok("道具箱の解決は失敗したら元の姿に戻す", /comment\.resolvedAt = before\.resolvedAt;/.test(fnOf(WIDGET_LIST, "setResolved")), true);
// 録音の場面の扱い（録音の設定）は配布版に無い

// ---------------------------------------------------------------------------
console.log("\n--- 4. 開くものの出入り・動きを減らす設定・正本 ---");

ok("メニューは透明度と拡大だけで入る（位置を動かさない）", /\.ws-menu\[data-state="open"\] \{[^}]*animation: ws-pop-in var\(--ws-motion\) var\(--ws-ease\) both;/.test(CSS), true);
ok("吹き出しも同じ入り方", /\.ws-tooltip\[data-state="delayed-open"\],\s*\.ws-tooltip\[data-state="instant-open"\] \{[^}]*animation: ws-pop-in var\(--ws-motion\)/.test(CSS), true);
ok("ダイアログは真ん中のまま透明度と拡大だけ", /@keyframes ws-dialog-in \{\s*from \{\s*opacity: 0;\s*transform: translate\(-50%, -50%\) scale\(0\.97\);/.test(CSS), true);
ok("引き出しは左端から滑る（場所なので）", /\.ws-drawer\[data-state="open"\] \{[^}]*animation: ws-drawer-in var\(--ws-motion\) var\(--ws-ease-swipe\) both;/.test(CSS), true);
ok("閉じるのは出すより速く、終わりの姿を保つ", /\.ws-dialog\[data-state="closed"\] \{\s*animation: ws-fade-out var\(--ws-motion-exit\) var\(--ws-ease\) both;/.test(CSS), true);
ok("拡大は 3% まで（大げさにしない）", [...CSS.matchAll(/scale\(0\.(\d+)\)/g)].every((found) => Number(`0.${found[1]}`) >= 0.95), true);
ok("押している間は 1 段濃い面で、その瞬間は動きを付けない", /\.ws-segment:active,[\s\S]{0,80}\{\s*background: var\(--ws-active\);\s*transition-duration: 0s;/.test(CSS), true);
ok("切り替え（segment）は地・字・輪を同じ長さで動かす", /\.ws-segment \{[^}]*transition:\s*background-color var\(--ws-motion\) var\(--ws-ease\),\s*color var\(--ws-motion\) var\(--ws-ease\),\s*box-shadow var\(--ws-motion\) var\(--ws-ease\);/.test(CSS), true);
ok("待ちを見せるのは --ws-motion-wait のあと（くるくるは置かない）", [/animation: ws-waiting var\(--ws-motion-quick\) var\(--ws-ease\) var\(--ws-motion-wait\) both;/.test(CSS), /animate-spin|ws-spinner/.test(CSS)], [true, false]);
const reduced = /@media \(prefers-reduced-motion: reduce\) \{([\s\S]*?)\n  \}/.exec(CSS)?.[1] ?? "";
ok("動きを減らす設定は、重なるものの入れ物も止める", [".ws-menu,", ".ws-tooltip,", ".ws-overlay,", ".ws-dialog,", ".ws-drawer,"].every((name) => reduced.includes(name)), true);

const DESIGN = await read("DESIGN.md");
const chapter = /## 11\. 動き([\s\S]*?)(?=\n## |$)/.exec(DESIGN)?.[1] ?? "";
ok("正本に「動き」の章がある", chapter.length > 0, true);
ok("正本が目盛りの名前を全部載せている", ["--ws-motion-quick", "--ws-motion-exit", "--ws-motion-wait", "--ws-ease-swipe", "--ws-ease", "--duration-swipe", "--duration-base", "--ease", "src/lib/settings/ui-motion.ts", "check-ui-motion.mjs", "useOptimistic"].filter((name) => !chapter.includes(name)), []);
ok("正本の数字が実物と同じ", [`${motion.quick}ms`, `${motion.base}ms`, `${motion.exit}ms`, `${motion.swipe}ms`, `${motion.wait}ms`, ease, easeSwipe].filter((value) => !chapter.includes(value)), []);
ok("正本の免除の数が台帳と同じ", new RegExp(`既存の免除は ${LAYOUT_EXEMPT.length} か所`).test(chapter), true);
ok("AGENTS.md がこの決まりを案内している", /check-ui-motion\.mjs/.test(await read("AGENTS.md")), true);

process.exitCode = fails ? 1 : 0;
