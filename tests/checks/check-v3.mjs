import { readWidgetSource } from "./widget-source.mjs";
/**
 * v3 の 3 つの決まりを確かめる。
 *   1. 知らせの重なり方
 *   2. 一覧シートの段のスナップ
 *   3. 送信 1 件ごとの独立（送信中に次を書き始めても混ざらない）
 */

import { root, dir } from "./paths.mjs";
const { build } = await import(`${root}/node_modules/esbuild/lib/main.js`);

for (const [name, file] of [["toast", "shared/toast"], ["dock", "comments/dock"]]) {
  await build({
    entryPoints: [`${root}/src/widget/${file}.ts`],
    outfile: `${dir}/v3-${name}.mjs`,
    bundle: true,
    format: "esm",
    platform: "neutral",
  });
}
const { addToast, settleToast, dismissToast, autoDismissMs, findToast, MAX_TOASTS, SUCCESS_LIFE_MS } =
  await import(`${dir}/v3-toast.mjs`);
const { detentTops, nearestDetent, toggledDetent } = await import(`${dir}/v3-dock.mjs`);

const ok = (label, actual, expected) =>
  console.log(`${actual === expected ? "OK  " : "NG  "} ${label}: ${actual}（期待: ${expected}）`);

// ---------------------------------------------------------------------------
console.log("--- 1. 知らせの重なり方 ---");

const t = (id, state) => ({ id, state, text: id });

let list = [];
list = addToast(list, t("a", "pending"));
list = addToast(list, t("b", "pending"));
ok("新しいものが上", list[0].id, "b");
ok("2 枚ある", list.length, 2);

list = settleToast(list, "a", "success", "投稿しました");
ok("同じ 1 枚の中身が変わる", findToast(list, "a").text, "投稿しました");
ok("並びは動かない", list.map((x) => x.id).join(","), "b,a");
ok("枚数は増えない（カードを作り直さない）", list.length, 2);

console.log("\n--- 消えるものと消えないもの ---");
ok("うまくいった知らせは自分で消える", autoDismissMs("success"), SUCCESS_LIFE_MS);
ok("進行中は自分で消えない", autoDismissMs("pending"), null);
ok("失敗は自分で消えない", autoDismissMs("failure"), null);
ok("消えるまでの長さ", SUCCESS_LIFE_MS, 2400);

console.log("\n--- 溢れたときに片付けるもの ---");
// 失敗ばかり 5 枚 → 6 枚目を足す
let onlyFailures = [];
for (const id of ["f1", "f2", "f3", "f4", "f5"]) onlyFailures = addToast(onlyFailures, t(id, "failure"));
onlyFailures = addToast(onlyFailures, t("new", "pending"));
ok("失敗は勝手に消さない（上限を超えても残す）", onlyFailures.length, 6);
ok("失敗が 5 枚とも残っている", onlyFailures.filter((x) => x.state === "failure").length, 5);

// 成功が混ざっていれば、いちばん古い成功を落とす
let mixed = [];
for (const [id, s] of [["old-success", "success"], ["f1", "failure"], ["p1", "pending"], ["s2", "success"], ["f2", "failure"]]) {
  mixed = addToast(mixed, t(id, s));
}
ok("足す前は 5 枚", mixed.length, 5);
mixed = addToast(mixed, t("newest", "pending"));
ok("上限に収まる", mixed.length, MAX_TOASTS);
ok("落ちたのはいちばん古い成功", findToast(mixed, "old-success"), null);
ok("新しい成功は残る", findToast(mixed, "s2") !== null, true);
ok("失敗は両方残る", mixed.filter((x) => x.state === "failure").length, 2);

list = dismissToast(list, "b");
ok("×で閉じられる", findToast(list, "b"), null);

// ---------------------------------------------------------------------------
console.log("\n--- 2. 一覧シートの段 ---");

const tops = detentTops(852, 47, 40); // iPhone 15 / 安全域 47 / 余白 40
console.log(`   上げきり=${tops.expanded}  半分=${tops.half}  閉じる=${tops.closed}`);
ok("上げきっても画面の最上部までは行かない", tops.expanded > 0, true);
ok("半分は画面の真ん中", tops.half, 426);
ok("閉じるは画面の下", tops.closed, 852);

console.log("\n   離した位置 → 収まる段");
const landings = [
  [0, "expanded"],
  [87, "expanded"],
  [200, "expanded"],
  [280, "half"],
  [426, "half"],
  [600, "half"],
  [640, "closed"],
  [800, "closed"],
  [852, "closed"],
];
let wrong = 0;
for (const [at, want] of landings) {
  const got = nearestDetent(at, tops);
  if (got !== want) wrong += 1;
  console.log(`   ${String(at).padStart(4)}px → ${got}`);
}
ok("狙いどおりに収まらなかった例", wrong, 0);
ok("半分より下へ引き切ると閉じる", nearestDetent(800, tops), "closed");

console.log("\n   つまみを押しただけ");
ok("半分 → 上げきり", toggledDetent("half"), "expanded");
ok("上げきり → 半分", toggledDetent("expanded"), "half");

// ---------------------------------------------------------------------------
console.log("\n--- 3. 送信 1 件ごとの独立 ---");

/** 送信のときに作る控え（実装と同じ形） */
function capture(draft, pageSlug) {
  return {
    pageSlug,
    quote: draft.anchor.quote,
    quoteContext: { ...draft.anchor.context },
    body: draft.body.trim(),
    kind: draft.kind,
    priority: draft.priority,
    marks: draft.marks,
  };
}

// 1 件目を書いて送る
let draft = {
  anchor: { quote: "売上は前年より 12% 伸びました。", context: { beforeText: "前", afterText: "後" } },
  kind: "comment",
  priority: "must",
  body: "この数字の出典は？",
  marks: ["mark-1"],
};
const first = capture(draft, "public/report");
draft.marks = []; // 印の持ち主を控えへ移す

// 返事を待っている間に、次の文を選んで書き始める
draft = {
  anchor: { quote: "解約率は横ばいです。", context: { beforeText: "X", afterText: "Y" } },
  kind: "comment",
  priority: "want",
  body: "ここは消したい",
  marks: ["mark-2"],
};

console.log("   1 件目の返事が来る前に、2 件目を書き始めた");
ok("1 件目の引用が保たれている", first.quote, "売上は前年より 12% 伸びました。");
ok("1 件目の本文が保たれている", first.body, "この数字の出典は？");
ok("1 件目の強さが保たれている", first.priority, "must");
ok("1 件目の種類が保たれている", first.kind, "comment");
ok("1 件目の前後の文脈が保たれている", first.quoteContext.beforeText, "前");
ok("1 件目の印が保たれている", first.marks.join(","), "mark-1");
ok("2 件目とは別物", first.quote === draft.anchor.quote, false);

// さらに 2 件目も送る
const second = capture(draft, "public/report");
draft.marks = [];
ok("2 件目も自分の中身を持つ", second.body, "ここは消したい");
ok("1 件目は影響を受けない", first.body, "この数字の出典は？");

// やり直しは控えから作り直せる
const restored = {
  anchor: { quote: first.quote, context: first.quoteContext },
  kind: first.kind,
  priority: first.priority,
  body: first.body,
  marks: first.marks,
};
ok("やり直しで本文が戻る", restored.body, "この数字の出典は？");
ok("やり直しで強さも戻る", restored.priority, "must");
ok("やり直しで引用も戻る", restored.anchor.quote, "売上は前年より 12% 伸びました。");

// ---------------------------------------------------------------------------
console.log("\n--- 実装が共有の書きかけを覗いていないこと ---");
const code = (await readWidgetSource())
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^\s*\/\/.*$/gm, "");

function bodyOf(name) {
  const at = code.indexOf(`function ${name}(`);
  if (at < 0) return "";
  const open = code.indexOf("{", at);
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

const send = bodyOf("sendSubmission");
ok("送信の本体がある", send.length > 0, true);
ok("送信の本体は共有の書きかけを読まない", /\bdraft\b/.test(send), false);
ok("送信の本体は自分の控えだけを見る", /\bjob\./.test(send), true);

// ---------------------------------------------------------------------------
console.log("\n--- 4. 上端の知らせと、上げきった一覧の取り合い ---");

const SAFE = 47;   // 端末の安全域
const GAP = 40;    // --space-7
const SCREEN = 852;

console.log("知らせの高さ  上げきりの上端  知らせの下端  ページの帯  重なり");
console.log("-".repeat(62));
let covered = 0;
// 知らせは最大 5 枚（1 枚およそ 44px）。実際に起こりうる範囲を並べる
for (const lane of [0, 44, 88, 132, 176, 220, 264]) {
  const t = detentTops(SCREEN, SAFE, GAP + lane);
  const toastBottom = SAFE + 12 + lane; // スタックは safe + --space-3 から始まる
  const strip = t.expanded - toastBottom;
  if (strip < 0) covered += 1;
  console.log(
    `${String(lane).padStart(10)}  ${String(t.expanded).padStart(12)}  ${String(toastBottom).padStart(11)}  ${String(strip).padStart(9)}  ${strip < 0 ? "あり" : "なし"}`,
  );
}
console.log("-".repeat(62));
ok("知らせが帯を隠した例", covered, 0);

const noToast = detentTops(SCREEN, SAFE, GAP);
ok("知らせが無いときの上げきり", noToast.expanded, 87);
const withToast = detentTops(SCREEN, SAFE, GAP + 44);
ok("知らせ 1 枚ぶん下がる", withToast.expanded, 131);
ok("下がっても半分より上", withToast.expanded < withToast.half, true);

console.log("\n   桁違いに積み上がっても、順番だけは崩れない");
// 通信が落ちて失敗が延々と積まれた場合。ここまで来たら知らせのほうが先に片付ける対象なので、
// 帯より知らせを優先する。ただし一覧が半分より低くなることはない
const many = detentTops(SCREEN, SAFE, GAP + 600);
ok("上げきりは半分で頭打ち", many.expanded, many.half);
ok("その値", many.expanded, 426);
ok("順番が入れ替わらない", many.expanded <= many.half && many.half < many.closed, true);

console.log("\n--- 5. 生の数値を書いていないこと ---");
const widget = await readWidgetSource();
const logic = widget.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const gapBody = (() => {
  const at = logic.indexOf("function gapForExpanded");
  return at < 0 ? "" : logic.slice(at, logic.indexOf("}", at) + 1);
})();
const safeBody = (() => {
  const at = logic.indexOf("function safeAreaTop");
  return at < 0 ? "" : logic.slice(at, logic.indexOf("}", at) + 1);
})();
console.log(`   余白: ${gapBody.replace(/\s+/g, " ").trim()}`);
console.log(`   安全域: ${safeBody.replace(/\s+/g, " ").trim()}`);
ok("余白は生の数値を返していない", /return\s+\d+\s*;/.test(gapBody), false);
ok("余白はトークンから読む", /(?:selectionFeature\.)?tokenPx\("--space-7"\)/.test(gapBody), true);
ok("知らせのぶんも足す", /(?:selectionFeature\.)?tokenPx\("--toast-lane"\)/.test(gapBody), true);
ok("安全域もトークンから読む", /(?:selectionFeature\.)?tokenPx\("--safe-top"\)/.test(safeBody), true);

// ---------------------------------------------------------------------------
console.log("\n--- 6. 置いた結果を測って直す（閉ループ）---");
const { correctedShift, needsCorrection } = await import(`${dir}/v3-dock.mjs`);

/** 1 コマぶんの当て直し。ドックの底は「持ち上げ量」ぶんだけ動く */
function oneFrame(shift, restingBottom, visibleBottom) {
  const dockBottom = restingBottom + shift;
  if (!needsCorrection(dockBottom, visibleBottom)) return { shift, dockBottom, corrected: false };
  const next = correctedShift(shift, dockBottom, visibleBottom);
  return { shift: next, dockBottom: restingBottom + next, corrected: true };
}

console.log("ずれの原因                 前の底  狙い  1コマ後の底  残りのずれ");
console.log("-".repeat(68));
const drifts = [
  ["計算どおり（ずれなし）", 0],
  ["知らせを取りこぼした", 30],
  ["逆向きにずれた", -30],
  ["端末の癖で大きくずれた", 120],
  ["わずかなにじみ", 0.3],
];
let unresolved = 0;
for (const [name, drift] of drifts) {
  const resting = 852;         // 貼り付いている位置（画面の底）
  const visible = 516;         // キーボードで見えている底
  // 計算で置いた結果、drift ぶんずれてしまった状態を注入する
  const injected = -(resting - visible) + drift;
  const before = resting + injected;
  const after = oneFrame(injected, resting, visible);
  const left = Math.abs(after.dockBottom - visible);
  if (left >= 0.5) unresolved += 1;
  console.log(
    `${name.padEnd(24)}  ${String(before).padStart(6)}  ${String(visible).padStart(4)}  ${String(after.dockBottom).padStart(10)}  ${left.toFixed(1).padStart(9)}`,
  );
}
console.log("-".repeat(68));
ok("1 コマで直りきらなかった例", unresolved, 0);

ok("30px ずれても 1 コマで合う", oneFrame(-306, 852, 516).dockBottom, 516);
ok("逆向きでも 1 コマで合う", oneFrame(-366, 852, 516).dockBottom, 516);
ok("にじみ程度は当て直さない", needsCorrection(516.3, 516), false);
ok("0.5px 以上なら当て直す", needsCorrection(516.5, 516), true);
ok("合っていれば持ち上げ量を変えない", correctedShift(-336, 516, 516), -336);

console.log("\n--- 7. 下書きの印は、選択が消えても付けられること ---");
const code2 = (await readWidgetSource())
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^\s*\/\/.*$/gm, "");
const wrapBody = (() => {
  const at = code2.indexOf("function wrapLiveSelection");
  const open = code2.indexOf("{", at);
  let depth = 0;
  for (let i = open; i < code2.length; i += 1) {
    if (code2[i] === "{") depth += 1;
    if (code2[i] === "}") { depth -= 1; if (depth === 0) return code2.slice(open, i + 1); }
  }
  return "";
})();
ok("生きている選択が無くても控えへ落ちる", /currentRange\(\)\s*\?\?\s*pendingRange/.test(wrapBody), true);
ok("帯を出すときに範囲を控える", /pendingRange = currentRange\(\)\?\.cloneRange\(\)/.test(code2), true);
ok("帯を引っ込めたら控えも捨てる", /pendingRange = null/.test(code2), true);
ok("要素ごと包む方式は使っていない", /surroundContents/.test(code2), false);

// ---------------------------------------------------------------------------
console.log("\n--- 8. 付け先の差し替えが働く条件 ---");
const code3 = (await readWidgetSource())
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^\s*\/\/.*$/gm, "");

function block(name) {
  const at = code3.indexOf(`function ${name}(`);
  if (at < 0) return "";
  const open = code3.indexOf("{", at);
  let depth = 0;
  for (let i = open; i < code3.length; i += 1) {
    if (code3[i] === "{") depth += 1;
    if (code3[i] === "}") { depth -= 1; if (depth === 0) return code3.slice(open, i + 1); }
  }
  return "";
}

const retarget = block("retargetDraft");
const settled = block("onSelectionSettled");
const pageOnly = block("pageRange");

ok("ドック表示中に差し替えを試みる", /(?:selectionFeature\.)?isDocked\(\)[\s\S]{0,80}retargetDraft\(\)/.test(settled), true);
ok("自分の画面の中の選択は除く", /closest\(HOST_TAG\)/.test(pageOnly), true);
ok("ページ本文の選択でなければ何もしない", /pageRange\(\)[\s\S]{0,60}return;/.test(retarget), true);
ok("解除されただけなら何もしない", /captureSelection\(\)[\s\S]{0,60}return;/.test(retarget), true);
ok("同じ場所なら動かさない", /fresh\.quote === (?:selectionFeature\.)?draft\.anchor\.quote/.test(retarget), true);
ok("旧の印を外す", /unwrapDraftMarks\((?:selectionFeature\.)?draft\.marks\)/.test(retarget), true);
ok("引用を差し替える", /(?:selectionFeature\.)?draft\.anchor = stashSelection\(fresh\)/.test(retarget), true);
ok("新しい場所に印を付ける", /(?:selectionFeature\.)?draft\.marks = wrapRangeSafely\(range\)/.test(retarget), true);
ok("本文には触れない", /(?:selectionFeature\.)?draft\.body\s*=/.test(retarget), false);
ok("強さには触れない", /(?:selectionFeature\.)?draft\.priority\s*=/.test(retarget), false);
ok("種類には触れない", /(?:selectionFeature\.)?draft\.kind\s*=/.test(retarget), false);
ok("引用の表示も更新する", /showRetargetedQuote/.test(retarget), true);

const swap = block("showRetargetedQuote");
ok("差し替わったことが分かる", /is-swapped/.test(swap), true);
ok("印はひと呼吸で消える", /lifetime\.timeout/.test(swap), true);

// 案内の行は、画面を広く取るために撤去した。
// 付け替えられること自体は、引用が入れ替わって光ることで伝わる
console.log("\n--- 案内の行は置かない（画面を広く取るため）---");
const sheetBody = code3.slice(code3.indexOf("function sheetComposer"), code3.indexOf("function renderPanelBody"));
ok("入力欄に案内の行を置いていない", /"hint"/.test(sheetBody), false);
ok("付け替えの仕組みは残っている", /retargetDraft/.test(code3), true);
ok("入れ替わったことは引用の光りで伝える", /is-swapped/.test(code3), true);
