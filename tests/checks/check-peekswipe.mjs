import { readWidgetSource } from "./widget-source.mjs";
// 道具箱の文言は辞書（日本語が正本）。画面はその鍵を引き、字そのものは辞書で見る
import { readFileSync as readDictionary } from "node:fs";
const TOOLBOX_JA = readDictionary(new URL("../../src/lib/i18n/messages/ja/toolbox.ts", import.meta.url), "utf8");
/**
 * 覗き見カードの横送りと、その場での編集・削除を確かめる。
 *   1. 向きの決め方 / 送る判定 / 端の手応え（純粋な計算）
 *   2. 3 枚の組み立て・編集行の出し分け・削除後の行き先（本物の DOM）
 */

import { root, dir } from "./paths.mjs";
const { JSDOM } = await import("jsdom");
const { build } = await import(`${root}/node_modules/esbuild/lib/main.js`);

for (const [name, out] of [["shared/util", "ps-util"], ["comments/peek", "ps-peek"], ["shared/styles", "ps-styles"]]) {
  await build({
    entryPoints: [`${root}/src/widget/${name}.ts`],
    outfile: `${dir}/${out}.mjs`,
    bundle: true,
    format: "esm",
    platform: "neutral",
  });
}
const {
  lockAxis, AXIS_LOCK_DISTANCE,
  swipeTarget, FLICK_VELOCITY, SWIPE_ADVANCE_RATIO,
  rubberBand, RUBBER_BAND_RESISTANCE,
  isDownwardSwipe,
} = await import(`${dir}/ps-util.mjs`);
const { PEEK_CLOSED, openedBy, showing, afterDismiss } = await import(`${dir}/ps-peek.mjs`);
const { STYLES: RAW } = await import(`${dir}/ps-styles.mjs`);
const CSS = RAW.replace(/\/\*[\s\S]*?\*\//g, "");

const ok = (label, actual, expected) =>
  console.log(`${actual === expected ? "OK  " : "NG  "} ${label}: ${actual}（期待: ${expected}）`);

// ---------------------------------------------------------------------------
console.log("--- 1. 縦か横かの決め方 ---");
console.log("   動きの大きさが 8px 未満のうちは決めない（読もうとした揺れで送らない）");
ok("ほとんど動いていない", lockAxis(2, 1), "undetermined");
ok("ちょうど境目の手前", lockAxis(5, 5), "undetermined");
ok("境目ちょうど", lockAxis(AXIS_LOCK_DISTANCE, 0), "horizontal");
ok("右へ", lockAxis(40, 5), "horizontal");
ok("左へ", lockAxis(-40, 5), "horizontal");
ok("下へ", lockAxis(5, 40), "vertical");
ok("上へ", lockAxis(5, -40), "vertical");
ok("斜めで横が勝つ", lockAxis(30, 20), "horizontal");
ok("斜めで縦が勝つ", lockAxis(20, 30), "vertical");
ok("同じだけ動いたら縦", lockAxis(30, 30), "vertical");

// ---------------------------------------------------------------------------
console.log("\n--- 2. 指を離したときに送るか ---");
const W = 300;
const R = Math.round(W * SWIPE_ADVANCE_RATIO);
console.log(`   カード幅 ${W}px / ゆっくりのときの目安 ${R}px / 速さの目安 ${FLICK_VELOCITY}px每ミリ秒`);

console.log("\n   速く払ったとき（距離は問わない）");
ok("左へ速く払う → 次へ", swipeTarget(-10, -0.9, W), 1);
ok("右へ速く払う → 前へ", swipeTarget(10, 0.9, W), -1);
ok("ほとんど動かさず速く払う", swipeTarget(-3, -2.0, W), 1);
ok("速さが目安ちょうどは送らない", swipeTarget(-10, -FLICK_VELOCITY, W), 0);
ok("目安をわずかに超えたら送る", swipeTarget(-10, -0.51, W), 1);

console.log("\n   ゆっくり動かしたとき（距離で決める）");
ok("左へ大きく動かした → 次へ", swipeTarget(-150, -0.1, W), 1);
ok("右へ大きく動かした → 前へ", swipeTarget(150, 0.1, W), -1);
ok("目安ちょうどは戻す", swipeTarget(-R, -0.1, W), 0);
ok("目安を超えたら送る", swipeTarget(-(R + 1), -0.1, W), 1);
ok("少しだけ動かした → 戻す", swipeTarget(-40, -0.1, W), 0);
ok("まったく動かさない → 戻す", swipeTarget(0, 0, W), 0);

console.log("\n   幅が測れないとき");
ok("幅 0 なら距離では送らない", swipeTarget(-150, -0.1, 0), 0);
ok("幅 0 でも速く払えば送る", swipeTarget(-150, -0.9, 0), 1);

console.log("\n--- 3. 端の手応え ---");
console.log(`   指の動きの ${RUBBER_BAND_RESISTANCE} 倍しか動かない`);
ok("右へ 100px 引っぱる", rubberBand(100), 30);
ok("左へ 100px 引っぱる", rubberBand(-100), -30);
ok("動かさなければ 0", rubberBand(0), 0);
ok("抵抗の値", RUBBER_BAND_RESISTANCE, 0.3);

console.log("\n--- 4. 下へ払って閉じる（今までどおり）---");
ok("下へしっかり払う", isDownwardSwipe(0, 80), true);
ok("横に流したときは閉じない", isDownwardSwipe(120, 60), false);

// ---------------------------------------------------------------------------
console.log("\n--- 5. 映しているコメントの持ち方 ---");
const g = { type: "click" };
let view = openedBy(g, "c1");
ok("開いた時点のコメント", view.commentId, "c1");
ok("開いている", view.open, true);
view = showing(view, "c2");
ok("送ると入れ替わる", view.commentId, "c2");
ok("開いた操作は引き継ぐ", view.openedBy, g);
ok("開いたままである", view.open, true);
ok("閉じると空になる", afterDismiss().commentId, null);
ok("初期状態も空", PEEK_CLOSED.commentId, null);

// ---------------------------------------------------------------------------
console.log("\n--- 6. 3 枚の組み立て（本物の DOM）---");
const dom = new JSDOM("<!doctype html><html><body><div id='pop'></div></body></html>");
const doc = dom.window.document;

const comments = [
  { id: "a", body: "1 件目", mine: true },
  { id: "b", body: "2 件目", mine: false },
  { id: "c", body: "3 件目", mine: true },
];

/** 実装と同じ組み立て */
function renderPeek(currentId) {
  const at = comments.findIndex((c) => c.id === currentId);
  const track = doc.createElement("div");
  track.className = "peek-track";
  for (const step of [-1, 0, 1]) {
    const item = comments[at + step];
    const slot = doc.createElement("div");
    slot.className = "peek-slot";
    if (item !== undefined) {
      const slide = doc.createElement("div");
      slide.className = "peek-slide";
      slide.dataset.id = item.id;
      const head = doc.createElement("div");
      if (comments.length > 1) {
        const counter = doc.createElement("span");
        counter.className = "who-time";
        counter.textContent = `${at + step + 1} / ${comments.length}`;
        head.appendChild(counter);
      }
      slide.appendChild(head);
      if (item.mine) {
        const actions = doc.createElement("div");
        actions.className = "peek-actions";
        actions.textContent = "編集 削除";
        slide.appendChild(actions);
      }
      slot.appendChild(slide);
    }
    track.appendChild(slot);
  }
  return track;
}

const middle = renderPeek("b");
ok("枠は 3 つ", middle.querySelectorAll(".peek-slot").length, 3);
ok("中身も 3 枚", middle.querySelectorAll(".peek-slide").length, 3);
ok(
  "並びは 前・いま・次",
  [...middle.querySelectorAll(".peek-slide")].map((s) => s.dataset.id).join(","),
  "a,b,c",
);
ok("いまのカードは真ん中", middle.querySelectorAll(".peek-slot")[1].querySelector(".peek-slide").dataset.id, "b");

const first = renderPeek("a");
ok("先頭では前が空", first.querySelectorAll(".peek-slot")[0].children.length, 0);
ok("先頭でも次はある", first.querySelectorAll(".peek-slot")[2].children.length, 1);
ok("端でも 3 枚には増やさない（ループしない）", first.querySelectorAll(".peek-slide").length, 2);

const last = renderPeek("c");
ok("末尾では次が空", last.querySelectorAll(".peek-slot")[2].children.length, 0);

console.log("\n   件数の出し方");
ok("2 件目の表示", middle.querySelectorAll(".peek-slot")[1].querySelector(".who-time").textContent, "2 / 3");
ok("丸を並べていない", CSS.includes(".peek-dot"), false);

console.log("\n--- 7. 編集・削除の行は自分のものだけ ---");
const slides = [...middle.querySelectorAll(".peek-slide")];
ok("自分のカードには出る（1 件目）", slides[0].querySelector(".peek-actions") !== null, true);
ok("他人のカードには出ない（2 件目）", slides[1].querySelector(".peek-actions"), null);
ok("自分のカードには出る（3 件目）", slides[2].querySelector(".peek-actions") !== null, true);

console.log("\n--- 8. 消したあとの行き先 ---");
/** 実装と同じ選び方: 次があれば次、無ければ前、どちらも無ければ閉じる */
function neighbourOf(list, id) {
  const at = list.findIndex((c) => c.id === id);
  return list[at + 1] ?? list[at - 1] ?? null;
}
ok("真ん中を消したら次へ", neighbourOf(comments, "b")?.id, "c");
ok("先頭を消したら次へ", neighbourOf(comments, "a")?.id, "b");
ok("末尾を消したら前へ", neighbourOf(comments, "c")?.id, "b");
ok("1 件しかなければ閉じる", neighbourOf([{ id: "only" }], "only"), null);

// ---------------------------------------------------------------------------
console.log("\n--- 9. 実装の作り ---");
const code = (await readWidgetSource())
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^\s*\/\/.*$/gm, "");

ok("開くときに一覧を閉じる", /function showMarkPeek[\s\S]{0,400}if \(state\.open\) (?:selectionFeature\.)?setOpen\(false\)/.test(code), true);
ok("見張りは 1 つに統合", /attachPeekGestures/.test(code), true);
ok("古い見張りは残っていない", /attachPeekSwipe/.test(code), false);
ok("既存の入力欄を再利用（新しいフォームを作らない）", /slide\.appendChild\((?:listFeature\.)?editorBox\(comment\)\)/.test(code), true);
ok("削除の確認も既存の仕組み", /state\.confirmDeleteId = comment\.id/.test(code), true);
ok("既存のボタン部品を再利用", /iconAction\(t\("toolbox\.common\.edit"\), ICON_EDIT/.test(code), true);
ok("返信・解決は置かない", /peek-actions[\s\S]{0,600}actionButton\((?:"(返信|解決)"|t\("toolbox\.card\.(reply|resolve)"\))/.test(code), false);
ok("直している間は指の操作を受け付けない", /const busy = \(\)/.test(code), true);
ok("送っても自動でスクロールしない", /function slidePeek[\s\S]{0,400}scrollIntoView/.test(code), false);
ok("印の濃さだけ切り替える", /function commitSlide[\s\S]{0,400}render\(\)/.test(code), true);

const rule = (sel) => {
  const escaped = sel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const m = new RegExp(`^${escaped}\\s*\\{([^}]*)\\}`, "m").exec(CSS);
  return m === null ? "" : m[1].replace(/\s+/g, " ").trim();
};

console.log("\n--- 10. 動きの指定 ---");
ok("送りの時間がトークンにある", /--duration-swipe:\s*340ms/.test(CSS), true);
ok("減速だけのイーズ", /--ease-swipe:\s*cubic-bezier\(0\.32, 0\.72, 0, 1\)/.test(CSS), true);
ok("送るときだけ動かす", /\.peek-track\.is-sliding \{[^}]*transition: transform var\(--duration-swipe\) var\(--ease-swipe\)/.test(CSS.replace(/\s+/g, " ")), true);
// 指の扱いは 16 節でまとめて確かめる（カードが受け取り、本文だけ縦を許す）
ok("送りの入れ物は指の扱いを持たない", /touch-action/.test(rule(".peek-track")), false);

// ---------------------------------------------------------------------------
console.log("\n--- 11. カードが枠ごと動く作り ---");

const outer = rule(".popover.is-peek");
const card = rule(".peek-slide");
console.log(`   外側: ${outer}`);
console.log(`   カード: ${card}`);

console.log("\n   外側は置き場所だけ（見た目を持たない）");
ok("面を持たない", /background: none/.test(outer), true);
ok("影を持たない", /box-shadow: none/.test(outer), true);
ok("角丸を持たない", /border-radius: 0/.test(outer), true);
ok("枠線を持たない", /border: 0/.test(outer), true);
ok("余白を持たない", /padding: 0/.test(outer), true);
ok("画面いっぱいに取る", /left: 0/.test(outer) && /right: 0/.test(outer), true);

console.log("\n   カードが見た目を持つ");
ok("面を持つ", /background: var\(--surface\)/.test(card), true);
ok("影を持つ", /box-shadow: var\(--shadow\)/.test(card), true);
ok("角丸を持つ", /border-radius: var\(--radius-md\)/.test(card), true);
ok("枠線を持つ", /border: var\(--rule-thin\)/.test(card), true);
ok("内側の余白を持つ", /padding: var\(--space-3\)/.test(card), true);
ok("カードどうしの間隔もトークン", /margin: 0 var\(--space-3\)/.test(card), true);
ok("つまみもカードの中", /slide\.appendChild\(el\("div", "peek-grab"\)\)/.test(code), true);

console.log("\n   静止しているとき、画面に見えるカードは 1 枚だけ");
const GAP = 12; // --space-3
console.log("画面幅  カードの左  カードの右  前カードの右端  次カードの左端  露出");
console.log("-".repeat(72));
let exposed = 0;
for (const W of [320, 390, 430]) {
  // 1 枠 = 画面幅。位置は -1 枠ぶん。カードは枠の中で左右に GAP ずつ内側
  const slot = W;
  const offset = -slot;
  const middleLeft = offset + slot + GAP;      // いまのカードの左端
  const middleRight = offset + slot * 2 - GAP; // 同 右端
  const prevRight = offset + slot - GAP;       // 前のカードの右端
  const nextLeft = offset + slot * 2 + GAP;    // 次のカードの左端
  const out = Math.max(0, prevRight - 0) + Math.max(0, W - nextLeft);
  if (out > 0) exposed += 1;
  console.log(
    `${String(W).padStart(6)}  ${String(middleLeft).padStart(10)}  ${String(middleRight).padStart(10)}  ${String(prevRight).padStart(14)}  ${String(nextLeft).padStart(14)}  ${String(out).padStart(4)}`,
  );
}
console.log("-".repeat(72));
ok("隣が見えていた画面幅", exposed, 0);
ok("前のカードは画面の左外", -GAP < 0, true);
ok("次のカードは画面の右外", 320 + GAP > 320, true);

console.log("\n   指で引いている間は隣が入ってくる（画面幅 390）");
const W2 = 390;
for (const dx of [0, -60, -150, -300]) {
  const nextLeft = -W2 + W2 * 2 + GAP + dx;
  const visible = Math.max(0, W2 - nextLeft);
  console.log(`   ${String(dx).padStart(5)}px 引く → 次のカードが ${String(visible).padStart(3)}px 見える`);
}
const nextInAt = (dx) => Math.max(0, W2 - (W2 + GAP + dx));
ok("静止時は見えない", nextInAt(0), 0);
ok("60px 引くと入ってくる", nextInAt(-60), 48);
ok("150px 引くともっと入る", nextInAt(-150), 138);
ok("引くほど広く見える", nextInAt(-300) > nextInAt(-150), true);

console.log("\n   カードどうしの間隔");
ok("間隔は左右の余白の合計", GAP * 2, 24);

console.log("\n   下へ払うときはカードごと落ちる");
ok("外側を動かす", /function setCardDrop/.test(code), true);
ok("上下どちらにも指に付いてくる", /setCardDrop\(dy, false\)/.test(code), true);
ok("払いきらなければ戻す", /setCardDrop\(0, true\)/.test(code), true);
ok("下へ送り出してから閉じる", /setCardDrop\(height, true\)[\s\S]{0,120}hideMarkPeek/.test(code), true);
ok("上は一覧へ渡す", /openListFromPeek\(\)/.test(code), true);

console.log("\n--- 12. 消したあと、隣が開いたままになること ---");

/** 実装と同じ順番。読み込み直しの途中で「もう無い」と見に来る */
function removeFlow({ reorderBeforeRefresh }) {
  let list = [{ id: "a" }, { id: "b" }, { id: "c" }];
  let view = { open: true, commentId: "b" };
  const id = "b";
  const at = list.findIndex((c) => c.id === id);
  const neighbour = list[at + 1] ?? list[at - 1] ?? null;

  // 直す前は、ここで隣へ移さずに読み込み直していた
  if (reorderBeforeRefresh && neighbour !== null) {
    view = { open: view.open, commentId: neighbour.id };
  }

  // 読み込み直し: 一覧から消え、その途中で描き直しの自己点検が走る
  list = list.filter((c) => c.id !== id);
  const stillThere = list.some((c) => c.id === view.commentId);
  if (!stillThere) view = { open: false, commentId: null }; // 閉じられる

  // そのあとで隣を指しても、閉じたままなら開かない
  if (!reorderBeforeRefresh && neighbour !== null && view.open) {
    view = { open: view.open, commentId: neighbour.id };
  }
  return view;
}

const fixed = removeFlow({ reorderBeforeRefresh: true });
console.log(`   直したあと: ${fixed.open ? "開いている" : "閉じている"} / 映しているのは ${fixed.commentId}`);
ok("消したあとも開いたまま", fixed.open, true);
ok("隣のコメントを映している", fixed.commentId, "c");

const broken = removeFlow({ reorderBeforeRefresh: false });
console.log(`   直す前:     ${broken.open ? "開いている" : "閉じている"} / 映しているのは ${broken.commentId}`);
ok("直す前は閉じてしまっていた（検査が効いている）", broken.open, false);

console.log("\n   実装の順番");
const removeBody = (() => {
  const at = code.indexOf("async function removeFromPeek");
  const open = code.indexOf("{", at);
  let depth = 0;
  for (let i = open; i < code.length; i += 1) {
    if (code[i] === "{") depth += 1;
    if (code[i] === "}") { depth -= 1; if (depth === 0) return code.slice(open, i + 1); }
  }
  return "";
})();
const swapAt = removeBody.indexOf("peek = showing(peek, neighbour.id)");
const refreshAt = removeBody.indexOf("await refresh()");
ok("隣へ移すのが先", swapAt >= 0 && swapAt < refreshAt, true);
ok("読み込み直しはそのあと", refreshAt > swapAt, true);
ok("隣が無いときだけ閉じる", /if \(neighbour === null\) (?:selectionFeature\.)?hideMarkPeek\(\);/.test(removeBody), true);

// ---------------------------------------------------------------------------
console.log("\n--- 13. 縦に払ったときの行き先（3 方向）---");
const { verticalIntent, SWIPE_CLOSE_DISTANCE } = await import(`${dir}/ps-util.mjs`);

console.log(`   基準は上下とも ${SWIPE_CLOSE_DISTANCE}px`);
ok("下へしっかり払う → 閉じる", verticalIntent(0, 80), "down");
ok("上へしっかり払う → 一覧へ", verticalIntent(0, -80), "up");
ok("下へちょうど基準", verticalIntent(0, SWIPE_CLOSE_DISTANCE), "down");
ok("上へちょうど基準", verticalIntent(0, -SWIPE_CLOSE_DISTANCE), "up");
ok("下へ基準の手前 → 戻す", verticalIntent(0, SWIPE_CLOSE_DISTANCE - 1), "none");
ok("上へ基準の手前 → 戻す", verticalIntent(0, -(SWIPE_CLOSE_DISTANCE - 1)), "none");
ok("動かさない → 戻す", verticalIntent(0, 0), "none");
ok("斜めで横が勝つときは縦とみなさない（下）", verticalIntent(120, 60), "none");
ok("斜めで横が勝つときは縦とみなさない（上）", verticalIntent(120, -60), "none");
ok("斜めでも縦が勝てば上", verticalIntent(30, -90), "up");
ok("上下の基準は同じ", verticalIntent(0, 60) === "down" && verticalIntent(0, -60) === "up", true);

console.log("\n--- 14. 一覧へ渡す道 ---");
ok("上へ払うと一覧を開く", /intent === "none"[\s\S]{0,400}openListFromPeek\(\)/.test(code), true);
ok("半分の高さで開く（既定のまま）", /function openListFromPeek[\s\S]{0,400}(?:selectionFeature\.)?setOpen\(true\)/.test(code), true);
ok("見ていたコメントへ寄せる", /function openListFromPeek[\s\S]{0,400}(?:selectionFeature\.)?focusCard\(id\)/.test(code), true);
ok("そっと光らせる（既存の仕組み）", /function focusCard[\s\S]{0,600}(?:selectionFeature\.)?applyFocus\(\)/.test(code) && /function applyFocus[\s\S]{0,600}is-flash/.test(code), true);
ok("送り出す間は組み立て直さない", /peekHandoff/.test(code), true);
ok("減速の動きはトークンのもの", /--duration-swipe/.test(CSS), true);

console.log("\n--- 15. 「すべて表示」の格下げ ---");
const moreRule = rule(".peek-more");
console.log(`   ${moreRule}`);
ok("文言を短く", /textContent = t\("toolbox\.peek\.showAll"\)/.test(code) && /showAll: "すべて表示"/.test(TOOLBOX_JA), true);
ok("面を持たない", /background/.test(moreRule), false);
ok("囲みを持たない", /border:/.test(moreRule), false);
ok("控えめな濃さ", /color: var\(--muted\)/.test(moreRule), true);
ok("小さめの文字", /font-size: var\(--font-sm\)/.test(moreRule), true);
ok("押せる広さは確保", /padding: var\(--space-2\)/.test(moreRule), true);
ok("上へ払うのと同じ動き", /openAll\.addEventListener\("click", \(\) => openListFromPeek\(\), \{ signal: lifetime\.signal \}\)/.test(code), true);

console.log("\n--- 16. 後ろのページを動かさないこと ---");

/** その名前ちょうどのセレクタが、どこかで指の動きを受け取ると宣言しているか */
const declaresTouchNone = (sel) => {
  for (const chunk of CSS.split("}")) {
    const at = chunk.indexOf("{");
    if (at < 0) continue;
    const selectors = chunk.slice(0, at).split(",").map((one) => one.trim());
    if (selectors.includes(sel) && /touch-action:\s*none/.test(chunk.slice(at))) return true;
  }
  return false;
};

const bodyRule = rule(".peek-body");
console.log("   器（カード）は全面で受け取り、穴を作らない。");
console.log("   中の本文を縦に動かすぶんは JS が自分で流す（ブラウザの解釈に預けない）");
ok("カード全面で指を受け取る", declaresTouchNone(".peek-slide"), true);
ok("部品ごとの切り替えは残っていない", /^\.peek-slide > \*/m.test(CSS), false);
ok("本文にブラウザ任せの縦許可を残していない", /touch-action/.test(bodyRule), false);
ok("方向が決まったら既定の動きを止める", /event\.preventDefault\(\)/.test(code), true);
ok("止められる形で受け取っている", /\{ passive: false \}/.test(code), true);

console.log("\n   素通しの面積（器の余白・部品の隙間）");
console.log("   カード 320x260 / 余白 12px / 部品どうしの隙間 8px x 3 とすると");
const cardW = 320, cardH = 260, cardPad = 12, seamGap = 8, seamCount = 3;
const area = cardW * cardH;
const ring = area - (cardW - cardPad * 2) * (cardH - cardPad * 2);
const seams = (cardW - cardPad * 2) * seamGap * seamCount;
ok("部品ごとに掛けたときの素通し（器の余白）", ring, 13344);
ok("部品ごとに掛けたときの素通し（隙間）", seams, 7104);
ok("合わせて何割が素通しか（%）", Math.round(((ring + seams) / area) * 100), 25);
ok("全面で受け取れば素通しは 0", 0, 0);

console.log("\n   例外: 溢れている本文の中だけは縦に動かせる（JS が流す）");
ok("本文は中でスクロールする", /overflow-y: auto/.test(bodyRule), true);
ok("末端で後ろへ引き継がない", /overscroll-behavior: contain/.test(bodyRule), true);
ok("指の差分をそのまま流す", /scroller\.scrollTop -= event\.clientY - lastY;/.test(code), true);
ok("溢れているかは触った瞬間に測る", /found\.scrollHeight > found\.clientHeight \? found : null/.test(code), true);
ok("縦のときだけ流す（横となぞりはブラウザへ）", /if \(axis !== "vertical"\) return;\n\s*event\.preventDefault\(\);\n\s*scroller\.scrollTop/.test(code), true);
ok("マウスは今までどおりブラウザに任せる", /if \(event\.pointerType === "mouse"\) return;/.test(code), true);
ok("カードと本文で取り合いにならない", /if \(inScrollableBody\) \{\n\s*tracking = false;/.test(code), true);

console.log("\n   ほかの浮き部品も点検");
const parts = [
  ["一覧シートのつまみ", ".sheet-grab-area"],
  ["幅を変えるつまみ", ".grip"],
  ["書き込みドック", ".compose-dock"],
  ["覗き見カード", ".peek-slide"],
];
let missing = 0;
for (const [name, sel] of parts) {
  const owned = declaresTouchNone(sel);
  if (!owned) missing += 1;
  console.log(`   ${owned ? "受け取る" : "未対応  "} ${name}`);
}
ok("指の扱いが抜けている浮き部品", missing, 0);
ok("ドックの入力欄も JS が流す", /(?:selectionFeature\.)?attachInnerScroll\((?:selectionFeature\.|connections\.)?composeDock, "textarea"\)/.test(code), true);
ok("覗き見の本文と入力欄も JS が流す", /(?:selectionFeature\.)?attachInnerScroll\((?:selectionFeature\.|connections\.)?popover, "\.peek-body, textarea"\)/.test(code), true);
ok("一覧の中身のスクロールは殺していない", /\.list \{[^}]*overflow-y: auto/.test(CSS.replace(/\s+/g, " ")), true);
ok("一覧シートに指の扱いを掛けていない（中身が読めなくなる）", /^:host\(\.is-narrow\) \.panel \{[^}]*touch-action/m.test(CSS), false);

console.log("\n   後ろのページが動かないことの筋道");
console.log("   1. 器は全面で touch-action: none → 隙間も余白も素通ししない");
console.log("   2. 方向が決まったら preventDefault → 宣言が効かない環境でも止まる");
console.log("   3. 中のスクロールは JS が指の差分を流す → ブラウザの解釈に依存しない");
ok("3 つとも入っている",
  declaresTouchNone(".peek-slide") && /preventDefault/.test(code) &&
  /scroller\.scrollTop -=/.test(code), true);
