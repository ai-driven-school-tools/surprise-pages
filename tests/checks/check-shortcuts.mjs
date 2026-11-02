/**
 * キーボードの近道（台帳 `src/lib/workspace/keyboard-shortcuts.ts`・画面 `src/app/_components/shortcut-provider.tsx`）。手引きは `docs/guides/keyboard-shortcuts.md`。
 * 配布版にはデスクトップアプリ（OS のメニュー）が無いので、アプリの近道（surface: app）はいま台帳に無い。
 *
 *   1. 台帳の形: 名前が 1 つずつ・押し方が読める・同じ押し方を 2 つの操作に当てていない
 *   2. 衝突: 画面の近道が、ブラウザ・OS・アプリのメニューが先に取るキーに当たっていない
 *   3. 照合: 入力中・変換中・余計な修飾キー・配列の違い・続けて押す形の待ち時間
 *   4. 見せ方: ⌘ と Ctrl の出し分け・読み上げの値・メニューの accelerator
 *   5. つなぎ: 画面に keydown を書き足していない・台帳の近道は全部どこかで結ばれている
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { build } from "esbuild";
import { root, dir } from "./paths.mjs";

await build({ entryPoints: [`${root}/src/lib/workspace/keyboard-shortcuts.ts`], outfile: `${dir}/keyboard-shortcuts.mjs`, bundle: true, format: "esm", platform: "node", logLevel: "silent" });
const api = await import(`${dir}/keyboard-shortcuts.mjs`);
const { SHORTCUTS, SHORTCUT_GROUPS, shortcutLabel, parseKeys, bindingsOf, advance, IDLE, SEQUENCE_TIMEOUT_MS, keyCaps, ariaKeyShortcuts, electronAccelerator, isTypingElement, isApplePlatform, resolveStroke, hasModifier } = api;

let failures = 0;
function ok(label, actual, expected = true) {
  const pass = JSON.stringify(actual) === JSON.stringify(expected);
  if (!pass) failures++;
  console.log(`${pass ? "OK  " : "NG  "} ${label}: ${JSON.stringify(actual)}${pass ? "" : `（期待: ${JSON.stringify(expected)}）`}`);
}
const read = (file) => readFileSync(`${root}/${file}`, "utf8");

/** 押し方を、環境ごとの本当の組み合わせの文字にする（重なりの比較に使う）。 */
const realKeys = (keys, apple) => parseKeys(keys).map((stroke) => {
  const real = resolveStroke(stroke, apple);
  return [real.ctrl && "ctrl", real.meta && "meta", real.alt && "alt", real.shift && "shift", real.key.toLowerCase()].filter(Boolean).join("+");
}).join(" ");

console.log("--- 1. 台帳の形 ---");
const ids = SHORTCUTS.map((definition) => definition.id);
ok("名前は 1 つずつ", ids.length === new Set(ids).size);
ok("押し方は全部読める", SHORTCUTS.every((definition) => definition.keys.length > 0 && definition.keys.every((keys) => { try { parseKeys(keys); return true; } catch { return false; } })));
ok("まとまりは台帳の 3 つのどれか", SHORTCUTS.every((definition) => SHORTCUT_GROUPS.some((group) => group.id === definition.group)));
ok("名前（辞書の鍵）は辞書にあり、空でない（まとまりも）", [...SHORTCUTS, ...SHORTCUT_GROUPS].every((definition) => { const label = shortcutLabel(definition); return label.trim().length > 0 && label !== definition.labelKey; }));
ok("書き損じは起動時に断る", ["mod+K", "hyper+k", "shift+?", "g h j", "mod+g h", "mod+meta+k", "xx"].map((keys) => { try { parseKeys(keys); return "通った"; } catch { return "断った"; } }), Array(7).fill("断った"));
for (const apple of [true, false]) {
  const seen = new Map();
  const clashes = [];
  for (const definition of SHORTCUTS) for (const keys of definition.keys) {
    const real = realKeys(keys, apple);
    if (seen.has(real) && seen.get(real) !== definition.id) clashes.push(`${real}: ${seen.get(real)} と ${definition.id}`);
    seen.set(real, definition.id);
  }
  ok(`同じ押し方を 2 つの操作に当てていない（${apple ? "Mac" : "Windows・Linux"}）`, clashes, []);
}
// 「g」そのものを近道にすると、「g のあと h」の頭で必ず先に当たってしまう
const firsts = new Set(SHORTCUTS.flatMap((definition) => definition.keys.map(parseKeys).filter((strokes) => strokes.length === 2).map(([first]) => realKeys(first.key, true))));
ok("続けて押す形の 1 打めは、単独の近道になっていない", SHORTCUTS.flatMap((definition) => definition.keys).filter((keys) => parseKeys(keys).length === 1 && firsts.has(realKeys(keys, true))), []);

console.log("\n--- 2. 先に取られるキーとの衝突 ---");
/**
 * ページより先にブラウザや OS が受け取る（ページ側から止められない・止めると困る）組み合わせ。
 * 画面の近道（surface: web）はここに当ててはいけない。
 */
const RESERVED = {
  "meta+t": "新しいタブ", "meta+w": "タブを閉じる", "meta+n": "新しい窓", "meta+shift+n": "シークレット窓", "meta+shift+t": "閉じたタブを開く",
  "meta+r": "再読み込み", "meta+shift+r": "強制再読み込み", "meta+l": "アドレス欄", "meta+q": "終了", "meta+h": "隠す", "meta+m": "しまう",
  "meta+d": "ブックマーク", "meta+f": "ページ内検索", "meta+g": "次を検索", "meta+p": "印刷", "meta+s": "保存", "meta+o": "開く",
  "meta+[": "戻る", "meta+]": "進む", "meta+=": "拡大", "meta+-": "縮小", "meta+0": "等倍", "meta+,": "設定", "meta+`": "窓の切り替え",
  "meta+z": "取り消し", "meta+shift+z": "やり直し", "meta+x": "切り取り", "meta+c": "コピー", "meta+v": "貼り付け", "meta+a": "すべて選択",
  "meta+e": "選択を検索に使う", "meta+y": "履歴", "meta+j": "ダウンロード", "meta+k": "Safari の検索欄（Firefox も同じ）",
  "ctrl+t": "新しいタブ", "ctrl+w": "タブを閉じる", "ctrl+n": "新しい窓", "ctrl+shift+n": "シークレット窓", "ctrl+shift+t": "閉じたタブを開く",
  "ctrl+r": "再読み込み", "ctrl+shift+r": "強制再読み込み", "ctrl+l": "アドレス欄", "ctrl+d": "ブックマーク", "ctrl+f": "ページ内検索", "ctrl+g": "次を検索",
  "ctrl+p": "印刷", "ctrl+s": "保存", "ctrl+o": "開く", "ctrl+h": "履歴", "ctrl+j": "ダウンロード", "ctrl+e": "検索欄", "ctrl+k": "検索欄", "ctrl+u": "ソース",
  "ctrl+=": "拡大", "ctrl+-": "縮小", "ctrl+0": "等倍", "ctrl+z": "取り消し", "ctrl+y": "やり直し", "ctrl+x": "切り取り", "ctrl+c": "コピー", "ctrl+v": "貼り付け", "ctrl+a": "すべて選択",
  "ctrl+tab": "タブの切り替え", "ctrl+shift+tab": "タブの切り替え", "alt+arrowleft": "戻る", "alt+arrowright": "進む",
  ...Object.fromEntries(Array.from({ length: 9 }, (_, index) => [[`meta+${index + 1}`, "タブの切り替え"], [`ctrl+${index + 1}`, "タブの切り替え"]]).flat()),
  "f5": "再読み込み", "f6": "アドレス欄", "f11": "全画面", "f12": "開発者の道具",
};
const appStrokes = new Map(SHORTCUTS.filter((definition) => definition.surface === "app").flatMap((definition) => [true, false].flatMap((apple) => definition.keys.map((keys) => [realKeys(keys, apple), definition.id]))));
const webHits = [];
for (const definition of SHORTCUTS.filter((one) => one.surface === "web")) for (const keys of definition.keys) for (const apple of [true, false]) {
  const real = realKeys(keys, apple);
  if (RESERVED[real] !== undefined) webHits.push(`${definition.id}（${real}）はブラウザの「${RESERVED[real]}」`);
  if (appStrokes.has(real)) webHits.push(`${definition.id}（${real}）はアプリのメニューの ${appStrokes.get(real)}`);
}
ok("画面の近道は、ブラウザ・OS・アプリのメニューが先に取るキーに当たっていない", webHits, []);
ok("アプリのメニューの近道は修飾キー付きの 1 打（メニューに書ける形）", SHORTCUTS.filter((definition) => definition.surface === "app").every((definition) => definition.keys.every((keys) => { const strokes = parseKeys(keys); return strokes.length === 1 && strokes.every(hasModifier); })));
ok("入力中も効かせるのは修飾キー付きの押し方を持つものだけ", SHORTCUTS.filter((definition) => definition.whileTyping).every((definition) => definition.keys.some((keys) => parseKeys(keys).every(hasModifier))));

console.log("\n--- 3. 照合 ---");
const bindings = bindingsOf(SHORTCUTS.filter((definition) => definition.surface === "web"));
const press = (key, extra = {}) => ({ key, code: extra.code ?? (/^[a-z]$/i.test(key) ? `Key${key.toUpperCase()}` : ""), metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, isComposing: false, ...extra });
const run = (presses, { apple = true, typing = false, gap = 100 } = {}) => {
  let state = IDLE;
  const out = [];
  presses.forEach((one, index) => {
    const result = advance(state, one, 1000 + index * gap, bindings, { apple, typing });
    state = result.state;
    out.push(result.kind === "matched" ? result.id : result.kind);
  });
  return out;
};
ok("? で一覧（US: Shift と一緒に出る字）", run([press("?", { shiftKey: true, code: "Slash" })]), ["help"]);
ok("? で一覧（JIS: 別の位置でも字で見る）", run([press("?", { shiftKey: true, code: "Slash" })], { apple: false }), ["help"]);
ok("⌘/ で一覧（Mac）・Ctrl+/ で一覧（Windows）", [run([press("/", { metaKey: true, code: "Slash" })]), run([press("/", { ctrlKey: true, code: "Slash" })], { apple: false })], [["help"], ["help"]]);
ok("Mac で Ctrl+/ は当てない（⌘ の役を Ctrl で代わりにしない）", run([press("/", { ctrlKey: true, code: "Slash" })]), ["none"]);
ok("/ で検索欄へ", run([press("/", { code: "Slash" })]), ["search"]);
ok("g のあと h でホームへ", run([press("g"), press("h")]), ["pending", "go-home"]);
ok("g のあと m で自分の資料へ", run([press("g"), press("m")]), ["pending", "go-files"]);
ok("待ち時間を過ぎた h は何にも当てない", run([press("g"), press("h")], { gap: SEQUENCE_TIMEOUT_MS + 1 }), ["pending", "none"]);
ok("g のあと関係の無い ? は、頭から見直して一覧", run([press("g"), press("?", { shiftKey: true })]), ["pending", "help"]);
ok("g のあと g は待ち直す", run([press("g"), press("g"), press("s")]), ["pending", "pending", "go-settings"]);
ok("待っている間の ⇧ の押し下げだけでは待ちを壊さない", run([press("g"), press("Shift", { code: "ShiftLeft", shiftKey: true }), press("f")]), ["pending", "none", "go-favorites"]);
ok("余計な修飾キーが混ざったら当てない（⌘G・⌥G・⇧G）", [run([press("g", { metaKey: true })]), run([press("g", { altKey: true })]), run([press("G", { shiftKey: true })])], [["none"], ["none"], ["none"]]);
ok("入力中は修飾キーの無い近道を見送る（/・?・g h）", run([press("/"), press("?", { shiftKey: true }), press("g"), press("h")], { typing: true }), ["none", "none", "none", "none"]);
ok("入力中でも ⌘/ は一覧", run([press("/", { metaKey: true })], { typing: true }), ["help"]);
ok("日本語の変換の途中は何にも当てない（isComposing・Safari の 229）", [run([press("/", { isComposing: true })]), run([press("/", { keyCode: 229 })])], [["none"], ["none"]]);
ok("配列を入れ替えた人（Dvorak）は、打ち込まれた字で見る", run([press("g", { code: "KeyI" }), press("h", { code: "KeyJ" })]), ["pending", "go-home"]);
ok("ローマ字でない配列（ロシア語）は、キーの位置で見る", run([press("п", { code: "KeyG" }), press("р", { code: "KeyH" })]), ["pending", "go-home"]);
// 結んでいない近道（画面が useShortcut を呼んでいない）の押し方は、台帳にあっても素通りさせる
ok("結ばれていない近道には当てない（g s を結んでいない画面）", advance(IDLE, press("s"), 0, bindings.filter((binding) => binding.id !== "go-settings"), { apple: true, typing: false }).kind === "none" && advance({ pending: [parseKeys("g")[0]], since: 0 }, press("s"), 10, bindings.filter((binding) => binding.id !== "go-settings"), { apple: true, typing: false }).kind, "none");
ok("字を打つ場所の見分け", [
  isTypingElement({ tagName: "INPUT", type: "search" }), isTypingElement({ tagName: "INPUT", type: "checkbox" }), isTypingElement({ tagName: "TEXTAREA" }),
  isTypingElement({ tagName: "DIV", isContentEditable: true }), isTypingElement({ tagName: "BUTTON" }), isTypingElement({ tagName: "SELECT" }), isTypingElement(null),
], [true, false, true, true, false, true, false]);
ok("Apple の機械の見分け（iPad の外付けキーボードも ⌘ の側）", [isApplePlatform("MacIntel", ""), isApplePlatform("macOS", ""), isApplePlatform("", "Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X)"), isApplePlatform("Win32", "Windows NT 10.0"), isApplePlatform("Linux x86_64", "X11; Linux")], [true, true, true, false, false]);

console.log("\n--- 4. 見せ方 ---");
ok("札: Mac は OS のメニューと同じ並び（⌃⌥⇧⌘）", keyCaps("mod+shift+r", true), [["⇧", "⌘", "R"]]);
ok("札: Windows・Linux は字で", keyCaps("mod+shift+r", false), [["Ctrl", "Shift", "R"]]);
ok("札: 続けて押す形は打ごとに分ける", keyCaps("g h", true), [["G"], ["H"]]);
ok("札: 記号はそのまま", [keyCaps("?", true), keyCaps("mod+/", false)], [[["?"]], [["Ctrl", "/"]]]);
ok("読み上げ（aria-keyshortcuts）: 続けて押す形は書けないので外す", [ariaKeyShortcuts({ keys: ["?", "mod+/"] }, true), ariaKeyShortcuts({ keys: ["?", "mod+/"] }, false), ariaKeyShortcuts({ keys: ["g h"] }, true)], ["? Meta+/", "? Control+/", null]);
// アプリの近道（新しい窓・録音の取り込み・戻る・進む・再読み込み）は配布版に無い。書き方の変換だけを help で見る
ok("メニューの accelerator は台帳から（help の 2 つ目の押し方）", ["help"].map(electronAccelerator), ["CmdOrCtrl+/"]);
ok("アプリの近道は台帳に無い（配布版にデスクトップアプリは無い）", SHORTCUTS.filter((definition) => definition.surface === "app").map((definition) => definition.id), []);

console.log("\n--- 5. つなぎ ---");
const walk = (folder) => readdirSync(`${root}/${folder}`).flatMap((name) => {
  const path = join(folder, name);
  return statSync(`${root}/${path}`).isDirectory() ? walk(path) : /\.(?:tsx?|mjs)$/.test(name) ? [path] : [];
});
const appFiles = walk("src/app");
// 部品の中だけで使うキー（タブの左右・入力欄の Enter）は部品の持ちもの。止めるのは画面全体で聞く形だけ
ok("画面（src/app/**）でページ全体のキーを聞くのは受け口だけ（画面ごとに近道を書き足さない）", appFiles.filter((file) => /(?:window|document|body)\.addEventListener\(\s*["']key(?:down|up|press)["']/.test(read(file)) && file !== "src/app/_components/shortcut-provider.tsx").map((file) => relative(root, `${root}/${file}`)), []);
const appSource = appFiles.map(read).join("\n");
ok("台帳の画面の近道は、どれもどこかの画面で結ばれている（help は受け口が持つ）", SHORTCUTS.filter((definition) => definition.surface === "web" && definition.id !== "help").filter((definition) => !new RegExp(`(?:useShortcut|useGoShortcut)\\(\\s*"${definition.id}"`).test(appSource)).map((definition) => definition.id), []);
ok("受け口はワークスペースの外枠を包む", /<ShortcutProvider>\s*<Shell \{\.\.\.props\} \/>\s*<\/ShortcutProvider>/.test(read("src/app/_components/workspace-shell.tsx")));
// デスクトップアプリのメニューと、そこから一覧を開かせる合図は配布版に無い
ok("台帳は DOM・React・Electron を読まない（画面と道具の両方から読むため）", /from ["'](?:react|electron|next)/.test(read("src/lib/workspace/keyboard-shortcuts.ts")), false);

console.log(failures === 0 ? "\nすべて合格" : `\n${failures} 件の不合格`);
process.exit(failures === 0 ? 0 : 1);
