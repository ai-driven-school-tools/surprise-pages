import { readWidgetSource } from "./widget-source.mjs";
// 道具箱の文言は辞書（日本語が正本）。画面はその鍵を引き、字そのものは辞書で見る
import { readFileSync as readDictionary } from "node:fs";
const TOOLBOX_JA = readDictionary(new URL("../../src/lib/i18n/messages/ja/toolbox.ts", import.meta.url), "utf8");
/**
 * 「PC は選んだ瞬間に書き始める」まわりの決まりを確かめる。
 *
 * 見るのは 6 つ。
 *   1. 広い画面なら（マウスでも指でも）、下端の帯を出さずに選んだそばで書き始める
 *   2. 狭い画面は今までどおり下端の帯（指で触る大きな画面も、マウスと同じく選んだら書き始める）
 *   3. 強さの近道が、画面のボタンと同じ並び（1=must / 2=better / 3=want）で効く
 *   4. 本文が空なら送らない／日本語を変換している最中は反応しない
 *   5. ⌘/Ctrl + Enter で送る道が消えている
 *   6. 空の入力欄での ⌘C が、選んだ文章のコピーに回る
 *
 * 判定そのものは util.ts の素の関数を**そのまま呼んで**確かめる。
 * 画面の組み立てだけは、本体と同じ手順を写して本物の DOM で動かす。
 */

import { root, dir } from "./paths.mjs";
const { JSDOM } = await import("jsdom");
const { build } = await import(`${root}/node_modules/esbuild/lib/main.js`);

await build({
  entryPoints: [`${root}/src/widget/shared/util.ts`],
  outfile: `${dir}/qw-util.mjs`,
  bundle: true,
  format: "esm",
  platform: "neutral",
});
const {
  selectionEntry,
  instantCompose,
  isApplePlatform,
  priorityShortcut,
  priorityFromKey,
  priorityLetters,
  isCopyChord,
  PRIORITY_ORDER,
} = await import(`${dir}/qw-util.mjs`);

const ok = (label, actual, expected) =>
  console.log(`${actual === expected ? "OK  " : "NG  "} ${label}: ${actual}（期待: ${expected}）`);

/** 注記を落として、実際に動くところだけを見る。 */
const code = (await readWidgetSource())
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^\s*\/\/.*$/gm, "");

/**
 * 名前で関数の中身を切り出す（波かっこの数を数える）。
 *
 * 先に引数の並びを読み飛ばす。`keys: TextAreaKeys = {}` のような既定値があると、
 * その `{}` を本体の始まりと取り違えて、中身が空に見えてしまう。
 */
function fn(name) {
  const at = code.indexOf(`function ${name}(`);
  if (at < 0) return "";
  let cursor = code.indexOf("(", at);
  let paren = 0;
  for (; cursor < code.length; cursor += 1) {
    if (code[cursor] === "(") paren += 1;
    if (code[cursor] === ")") {
      paren -= 1;
      if (paren === 0) break;
    }
  }
  const open = code.indexOf("{", cursor);
  let depth = 0;
  for (let i = open; i < code.length; i += 1) {
    if (code[i] === "{") depth += 1;
    if (code[i] === "}") {
      depth -= 1;
      if (depth === 0) return code.slice(open, i + 1);
    }
  }
  return "";
}

/** キーが押された様子。押していないものは押していない、として渡す。 */
const chord = (over) => ({
  code: "",
  key: "",
  metaKey: false,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  isComposing: false,
  ...over,
});

const MAC = true;
const WIN = false;

// ---------------------------------------------------------------------------
console.log("--- 1. どこに入り口を出すか（画面の広さ × 入力装置）---");

const cases = [
  ["ノート PC（マウスあり・1440px）", 1440, true, "popover", true],
  ["外付けの大画面（マウスあり・1920px）", 1920, true, "popover", true],
  ["境目ちょうど（マウスあり・640px）", 640, true, "popover", true],
  ["iPad 横（指・1024px）", 1024, false, "popover", true],
  ["iPad 縦（指・768px）", 768, false, "popover", true],
  ["iPhone（指・393px）", 393, false, "bar", false],
  ["マウスのある狭い窓（500px）", 500, true, "bar", false],
];
for (const [name, viewport, , entry, instant] of cases) {
  const got = selectionEntry(viewport, true);
  ok(`${name}: 入り口`, got, entry);
  ok(`${name}: 選んだ瞬間に書き始める`, instantCompose(got), instant);
}
ok("選んでいなければ何も出さない", instantCompose(selectionEntry(1440, false)), false);

console.log("\n   帯は狭い画面だけ（広い画面では帯を出さない）");
ok("広い画面は帯ではない", selectionEntry(1440, true) === "bar", false);
ok("狭い画面は帯", selectionEntry(375, true), "bar");

console.log("\n   決め方が 1 か所にまとまっているか");
ok("出し分けの入り口は 1 つ", (code.match(/function showSelectionPopover\(/g) ?? []).length, 1);
ok("指の画面にも、書く前の小窓を挟まない", /showQuickPopover/.test(code), false);
ok("その中で instantCompose を見ている", /instantCompose\(entry\)/.test(fn("showSelectionPopover")), true);
ok("見張りは出し分けを自分で書かない", /instantCompose/.test(fn("onSelectionSettled")), false);
// 名乗れない相手（ログインが切れた画面）に入り口を出しても、押した先で断られるだけ。
// 小窓を出す道は「名乗れている」を確かめた 1 本だけにしてある
ok(
  "名乗れているときだけ小窓を出す",
  /if \((?:listFeature\.)?canAct\(\)\) \{\s*showSelectionPopover\(anchor, rect, entry\);/.test(fn("onSelectionSettled")),
  true,
);
ok("入力装置の判定も 1 か所", (code.match(/function hasFinePointer\(/g) ?? []).length, 1);
ok("その判定は pointer: fine を見る", /\(pointer: fine\)/.test(fn("hasFinePointer")), true);

// ---------------------------------------------------------------------------
console.log("\n--- 2. 写し取ってから焦点を当てているか ---");
ok("書きかけは写し取った引用を持つ", /stashSelection\(anchor\)/.test(fn("beginPopoverDraft")), true);
ok("書き始めは「こしらえる → 開く」の順", /beginPopoverDraft\(anchor\);[\s\S]*showComposer\(rect\)/.test(fn("startComposing")), true);
const composer = fn("showComposer");
ok("焦点は場所を決めたあと", composer.indexOf("placePopover(rect)") < composer.indexOf(".focus("), true);
ok("焦点は引用を出したあと", composer.indexOf("pop-quote") < composer.indexOf(".focus("), true);
ok("開いただけの状態は選び直せる", /isComposing\(\) && !isBlankDraft\(\)/.test(fn("onSelectionSettled")), true);
ok("1 文字でも書いてあれば横取りしない", /!canSend\((?:selectionFeature\.)?draft\.body\)/.test(fn("isBlankDraft")), true);

// ---------------------------------------------------------------------------
console.log("\n--- 3. 強さの近道（修飾キー + 1 / 2 / 3）---");
ok("並びは画面のボタンと同じ", PRIORITY_ORDER.join(","), "must,better,want");
ok("m は must", priorityFromKey("m"), "must");
ok("b は better", priorityFromKey("b"), "better");
ok("w は want", priorityFromKey("w"), "want");
ok("大文字でも当たる", priorityFromKey("M"), "must");
ok("割り当ての無い文字", priorityFromKey("a"), null);
ok("g は good に当たらない", priorityFromKey("g"), null);
ok("数字には割り当てが無い", priorityFromKey("1"), null);
ok("修飾キーそのものの名前を拾わない", priorityFromKey("Meta"), null);
ok("空でも落ちない", priorityFromKey(""), null);

console.log("\n   案内に出す文字も、同じ綴りから作る（表を 2 つ持たない）");
ok("M / B / W", priorityLetters(), "M / B / W");

console.log("\n   Mac は control + 文字（⌘ は同じ役目にブラウザが使っているので混ぜない）");
ok("control + M", priorityShortcut(chord({ key: "m", ctrlKey: true }), MAC), "must");
ok("control + B", priorityShortcut(chord({ key: "b", ctrlKey: true }), MAC), "better");
ok("control + W", priorityShortcut(chord({ key: "w", ctrlKey: true }), MAC), "want");

console.log("\n   Mac で受けてはいけない組み合わせ（欠ける / 余る）");
ok("修飾キー無し（ただの m は本文になる）", priorityShortcut(chord({ key: "m" }), MAC), null);
ok("⌘ だけ", priorityShortcut(chord({ key: "m", metaKey: true }), MAC), null);
ok("⌘ が余分に混ざる（⌘ + W は窓を閉じる）", priorityShortcut(chord({ key: "w", ctrlKey: true, metaKey: true }), MAC), null);
ok("option が余分に混ざる", priorityShortcut(chord({ key: "m", ctrlKey: true, altKey: true }), MAC), null);
ok("shift が混ざる", priorityShortcut(chord({ key: "m", ctrlKey: true, shiftKey: true }), MAC), null);
ok("割り当ての無い文字", priorityShortcut(chord({ key: "a", ctrlKey: true }), MAC), null);

console.log("\n   Windows / Linux は Ctrl + Alt + 文字（Ctrl + W はタブが閉じるため）");
ok("Ctrl + Alt + M", priorityShortcut(chord({ key: "m", ctrlKey: true, altKey: true }), WIN), "must");
ok("Ctrl + Alt + B", priorityShortcut(chord({ key: "b", ctrlKey: true, altKey: true }), WIN), "better");
ok("Ctrl + Alt + W", priorityShortcut(chord({ key: "w", ctrlKey: true, altKey: true }), WIN), "want");
ok("Ctrl だけでは効かない（タブが閉じる組み合わせ）", priorityShortcut(chord({ key: "w", ctrlKey: true }), WIN), null);
ok("Mac の組み合わせは Windows では効かない", priorityShortcut(chord({ key: "m", ctrlKey: true }), WIN), null);
ok("shift が混ざったら効かない", priorityShortcut(chord({ key: "m", ctrlKey: true, altKey: true, shiftKey: true }), WIN), null);

console.log("\n   キーの位置ではなく、打ち込まれた文字で見ているか");
// 配列を入れ替えている人（Dvorak 等）が M を押したとき、位置で見ると別の強さになる
ok("位置が違っても、出た文字が m なら当たる", priorityShortcut(chord({ code: "KeyV", key: "m", ctrlKey: true }), MAC), "must");
ok("位置が M でも、出た文字が違えば当たらない", priorityShortcut(chord({ code: "KeyM", key: "v", ctrlKey: true }), MAC), null);

console.log("\n   環境の見分け");
ok("macOS", isApplePlatform("MacIntel", "Mozilla/5.0 (Macintosh)"), true);
ok("iPad（Mac を名乗る）", isApplePlatform("MacIntel", "Mozilla/5.0 (Macintosh) Safari"), true);
ok("Windows", isApplePlatform("Win32", "Mozilla/5.0 (Windows NT 10.0)"), false);
ok("Linux", isApplePlatform("Linux x86_64", "Mozilla/5.0 (X11; Linux)"), false);
ok("見分けは 1 か所だけ", (code.match(/isApplePlatform\(/g) ?? []).length, 1);

// ---------------------------------------------------------------------------
console.log("\n--- 4. 変換中は反応しないか ---");
ok("変換中の ⌘ + option + 1", priorityShortcut(chord({ code: "Digit1", metaKey: true, altKey: true, isComposing: true }), MAC), null);
ok("変換中の Ctrl + Alt + 1", priorityShortcut(chord({ code: "Digit1", ctrlKey: true, altKey: true, isComposing: true }), WIN), null);
ok("変換中の ⌘C", isCopyChord(chord({ key: "c", metaKey: true, isComposing: true }), MAC), false);
ok("実装も変換中を見ている", /isComposing: event\.isComposing/.test(fn("textArea")), true);

// ---------------------------------------------------------------------------
console.log("\n--- 5. 本物の DOM で押してみる ---");

const dom = new JSDOM("<!doctype html><html><body></body></html>");
const canSend = (text) => text.trim().length > 0;

/** 実装（textArea）と同じ手順を写したもの。判定は本物の関数を呼ぶ。 */
function textArea(keys, apple) {
  const area = dom.window.document.createElement("textarea");
  const log = { sent: [], copied: [], prevented: 0 };
  area.addEventListener("keydown", (event) => {
    const hit = {
      code: event.code ?? "",
      key: event.key ?? "",
      metaKey: event.metaKey,
      ctrlKey: event.ctrlKey,
      altKey: event.altKey,
      shiftKey: event.shiftKey,
      isComposing: event.isComposing === true,
    };
    if (keys.onPriority !== undefined) {
      const priority = priorityShortcut(hit, apple);
      if (priority !== null) {
        event.preventDefault();
        log.prevented += 1;
        if (canSend(area.value)) keys.onPriority(priority);
        return;
      }
    }
    if (keys.quoteWhenEmpty === undefined) return;
    if (canSend(area.value)) return;
    if (!isCopyChord(hit, apple)) return;
    const quote = keys.quoteWhenEmpty();
    if (quote === null || quote.length === 0) return;
    event.preventDefault();
    log.prevented += 1;
    log.copied.push(quote);
  });
  return { area, log };
}

const press = (area, over) => {
  const event = new dom.window.KeyboardEvent("keydown", { cancelable: true, ...chord(over) });
  area.dispatchEvent(event);
  return event.defaultPrevented;
};

const sent = [];
const { area, log } = textArea(
  { onPriority: (p) => sent.push(p), quoteWhenEmpty: () => "売上は前年より 12% 伸びました。" },
  MAC,
);

console.log("\n   本文が空のときは送らない");
area.value = "";
press(area, { key: "m", ctrlKey: true });
ok("空で押しても送られない", sent.length, 0);
ok("それでも文字は入力欄に落とさない", log.prevented, 1);
area.value = "   ";
press(area, { key: "b", ctrlKey: true });
ok("空白だけでも送られない", sent.length, 0);

console.log("\n   書いてあれば、押した強さで送る");
area.value = "ここ直したい";
press(area, { key: "m", ctrlKey: true });
press(area, { key: "b", ctrlKey: true });
press(area, { key: "w", ctrlKey: true });
ok("押した順に強さが飛ぶ", sent.join(","), "must,better,want");

console.log("\n   ⌘/Ctrl + Enter では送られない");
area.value = "ここ直したい";
const before = sent.length;
ok("⌘ + Enter は素通り", press(area, { code: "Enter", key: "Enter", metaKey: true }), false);
ok("Ctrl + Enter も素通り", press(area, { code: "Enter", key: "Enter", ctrlKey: true }), false);
ok("送られていない", sent.length, before);

console.log("\n   空の入力欄の ⌘C は引用を写し取る");
area.value = "";
ok("⌘C は既定の動きを止めて引き取る", press(area, { code: "KeyC", key: "c", metaKey: true }), true);
ok("写し取ったのは選んだ文章", log.copied.join(""), "売上は前年より 12% 伸びました。");
area.value = "書きかけ";
const copied = log.copied.length;
press(area, { code: "KeyC", key: "c", metaKey: true });
ok("何か書いてあれば普通のコピーに任せる", log.copied.length, copied);

console.log("\n   近道を渡していない入力欄は反応しない");
const plain = textArea({}, MAC);
plain.area.value = "コメントを直す";
ok("強さは飛ばない", press(plain.area, { code: "Digit1", metaKey: true, altKey: true }), false);
ok("⌘C も既定のまま", press(plain.area, { code: "KeyC", key: "c", metaKey: true }), false);

// ---------------------------------------------------------------------------
console.log("\n--- 6. 実装の配線 ---");
ok("入力欄に Enter で送る受け口が無い", /Enter/.test(fn("textArea")), false);
ok("押したら必ず止める", /event\.preventDefault\(\)/.test(fn("textArea")), true);
ok("空かどうかは送信ボタンと同じ判定", /canSend\(area\.value\)/.test(fn("textArea")), true);
ok("小窓は引用をコピー先に渡す", /quoteWhenEmpty: \(\) => current\.anchor\.quote/.test(fn("showComposer")), true);
ok("狭い画面の入力欄にも渡している", /quoteWhenEmpty: \(\) => current\.anchor\.quote/.test(fn("sheetComposer")), true);
ok("コピーに失敗しても叱らない", /showError/.test(fn("copyQuote")), false);
ok("コピーできたら知らせる", /(?:sharingFeature\.)?showNotice\(/.test(fn("copyQuote")), true);

console.log("\n   案内の出し方");
ok("キーの案内はキーボードのあるところだけ", /if \(!(?:selectionFeature\.)?hasFinePointer\(\)\) return null;/.test(fn("shortcutHint")), true);
ok("Mac には control と書く", /"control"/.test(fn("shortcutHint")), true);
ok("Windows には Ctrl + Alt と書く", /Ctrl \+ Alt/.test(fn("shortcutHint")), true);
ok("古い組み合わせ（⌘ + option）はもう書かない", /⌘ \+ option/.test(code), false);
ok("文字は綴りの頭から作る（案内に直書きしない）", /priority\[0\]\.toUpperCase\(\)/.test(fn("shortcutHint")), true);
ok("M / B / W の一覧文はもう置かない", /must \/ better \/ want として送れます/.test(code), false);

/*
 * 案内は常設の文章をやめ、鍵盤の絵記号 1 つに畳んだ（触れている間だけ出す）。
 * 近道は一度覚えれば済むもので、320px の小窓に 2 行を出し続けると、
 * 覚えた人にも覚える気の無い人にも邪魔なだけになる。
 */
/*
 * 近道は各ボタンの上に出す。鍵盤の絵は、押しても何も起きない席を右端に
 * 占有していたので、いいね（手の絵）に差し替えた。
 */
console.log("\n   近道は各ボタンの上に出す");
ok("鍵盤の案内部品は置かない", /function shortcutBadge\(\)/.test(code), false);
ok("鍵盤の絵を送信行に置かない", /ICON_KEYBOARD/.test(fn("prioritySendRow")), false);
ok("強さの近道は各ボタンが持つ", /shortcutHint\(priority\)/.test(fn("prioritySendRow")), true);
ok("いいねは送信行の右端", /t\("toolbox\.compose\.sendGood"\)/.test(fn("prioritySendRow")) && /sendGood: "いいねとして送る"/.test(TOOLBOX_JA), true);
ok("いいねは手の絵", /ICON_THUMBS/.test(fn("prioritySendRow")), true);
ok("常設の 2 行はもう置かない", /el\("p", "hint", hint\)/.test(code), false);
ok("古い案内文はどこにも残っていない", /Enter は want|Enter で保存/.test(code), false);

// ---------------------------------------------------------------------------
console.log("\n--- 7. 小窓の外を押したら畳む ---");
const page = fn("attachPageEvents");
const pointerdownBlock = /"pointerdown",[\s\S]*?\{ capture: true, signal: lifetime\.signal \},\s*\);/.exec(page)?.[0] ?? "";

ok("外を押したら小窓を畳む", /if \((?:selectionFeature\.|connections\.)?popover !== null && !(?:selectionFeature\.|connections\.)?popover\.hidden\) (?:selectionFeature\.)?hidePopover\(\);/.test(page), true);
ok("自分の画面の中を押したときは何もしない", /if \(insideOurUi\) return;/.test(page), true);
ok(
  "覗き見カードが開いていたら、そちらの決まりへ先に渡す",
  /if \((?:selectionFeature\.)?peek\.open\) \{\s*if \(!afterTap\((?:selectionFeature\.)?peek, event, insideOurUi\)\.open\) (?:selectionFeature\.)?hideMarkPeek\(\);\s*return;\s*\}/.test(page),
  true,
);
ok("中か外かの判定は 1 か所だけ", (page.match(/closest\(HOST_TAG\)/g) ?? []).length, 1);
ok("押した瞬間では畳まない（つまみを掴んだだけで消えないため）", /hidePopover/.test(pointerdownBlock), false);
ok("押した瞬間の受け口は選択の見張り用のまま", /selectionFeature.adjustingSelection = true;/.test(pointerdownBlock), true);
ok("Escape と同じ畳み方を使う", /const hadPopover = (?:selectionFeature\.|connections\.)?popover !== null && !(?:selectionFeature\.|connections\.)?popover\.hidden;\s*if \(hadPopover\) (?:selectionFeature\.)?hidePopover\(\);/.test(page), true);
