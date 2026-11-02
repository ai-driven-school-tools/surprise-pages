import { readWidgetSource } from "./widget-source.mjs";
/**
 * 下書き中の印（書きかけの場所を示す蛍光ペン）を確かめる。
 * 本物の DOM（jsdom）の上で動かす。
 *
 * 見るのは 4 つ。
 *   1〜9 … 要素をまたぐ選択でもちゃんと包めるか。太字・リンク・段落またぎ
 *   10〜18 … 広い画面の小窓でも印が付くか。閉じる・送る・選び直す・
 *            狭い画面をそのままにしてあるか・赤入れと混ざらないか・色を増やしていないか
 *   19〜20 … **印がページの体裁を動かさないこと。**
 *            空白だけの詰め物には入れない・余白と外側の間隔を持たない
 *   21 … 離れかけただけで書きかけの印を失わないこと
 */
import { readFile } from "node:fs/promises";

import { root, dir } from "./paths.mjs";

const { JSDOM } = await import("jsdom");
const { build } = await import(`${root}/node_modules/esbuild/lib/main.js`);

await build({
  entryPoints: [`${root}/src/widget/comments/anchor.ts`],
  outfile: `${dir}/dm-anchor.mjs`,
  bundle: true,
  format: "esm",
  platform: "neutral",
});

const ok = (label, actual, expected) =>
  console.log(`${actual === expected ? "OK  " : "NG  "} ${label}: ${actual}（期待: ${expected}）`);

/**
 * 範囲の幅だけ、作り物で答えられるようにする（jsdom は場所を測らない）。
 *
 * 実装は「空白か」ではなく「見えているか」で詰め物を見分けるので、
 * 幅を測る道が無いとその判断ごと確かめられない。**実機の姿を写す**:
 *   要素と要素の間の改行・字下げ … 描かれない（幅 0）
 *   単語の間の半角スペース 1 個   … 幅を持つ
 * 段落の位置を作り物で答えている赤入れの検査（check-redline.mjs）と同じ作法。
 */
function stubRangeWidth(dom) {
  dom.window.Range.prototype.getBoundingClientRect = function measured() {
    const node = this.startContainer;
    const text = node.nodeType === dom.window.Node.TEXT_NODE ? node.nodeValue : "";
    const drawn = text.trim().length > 0 || !/[\r\n]/.test(text);
    const width = drawn ? text.length * 4 : 0;
    return { width, height: drawn ? 16 : 0, top: 0, left: 0, right: width, bottom: 16, x: 0, y: 0 };
  };
}

/** ページを組んで、選択範囲を作って、印を付ける */
async function run(html, pick) {
  const dom = new JSDOM(`<!doctype html><html><body>${html}</body></html>`);
  // ウィジェットのコードが見る窓口を差し替える
  global.window = dom.window;
  global.document = dom.window.document;
  global.Node = dom.window.Node;
  global.Text = dom.window.Text;
  global.NodeFilter = dom.window.NodeFilter;
  stubRangeWidth(dom);

  const mod = await import(`${dir}/dm-anchor.mjs?v=${Math.random()}`);
  const range = dom.window.document.createRange();
  pick(dom.window.document, range);
  const marks = mod.wrapRangeAsDraft(range);
  return { dom, marks, mod };
}

const textOf = (marks) => marks.map((m) => m.textContent).join("");

console.log("--- 1. 太字をまたぐ選択（実機で印が出なかった形）---");
{
  const { dom, marks } = await run(
    `<p id="p">いちばん大きな違いは、<strong>ページを手で作らない</strong>ことです。</p>`,
    (doc, range) => {
      const p = doc.getElementById("p");
      range.setStart(p.firstChild, 0);
      range.setEnd(p.lastChild, p.lastChild.data.length);
    },
  );
  ok("印が付いた数", marks.length, 3);
  ok("拾えた文言", textOf(marks), "いちばん大きな違いは、ページを手で作らないことです。");
  ok("太字の中にも印が入る", dom.window.document.querySelector("strong mark") !== null, true);
  ok("すべて下書きの印", marks.every((m) => m.hasAttribute("data-surprise-draft")), true);
  ok("太字が壊れていない", dom.window.document.querySelectorAll("strong").length, 1);
}

console.log("\n--- 2. リンクをまたぐ選択 ---");
{
  const { marks } = await run(
    `<p id="p">詳しくは<a href="/x">こちらの手引き</a>を見てください。</p>`,
    (doc, range) => {
      const p = doc.getElementById("p");
      range.setStart(p.firstChild, 0);
      range.setEnd(p.lastChild, p.lastChild.data.length);
    },
  );
  ok("印が付いた数", marks.length, 3);
  ok("拾えた文言", textOf(marks), "詳しくはこちらの手引きを見てください。");
}

console.log("\n--- 3. 複数の段落をまたぐ選択 ---");
{
  const { marks } = await run(
    `<div id="d"><p id="a">最初の段落です。</p><p id="b">次の段落です。</p><p id="c">三つ目です。</p></div>`,
    (doc, range) => {
      range.setStart(doc.getElementById("a").firstChild, 0);
      const c = doc.getElementById("c").firstChild;
      range.setEnd(c, c.data.length);
    },
  );
  ok("段落ごとに印が付く", marks.length, 3);
  ok("拾えた文言", textOf(marks), "最初の段落です。次の段落です。三つ目です。");
}

console.log("\n--- 4. 途中から途中まで（部分選択）---");
{
  const { marks } = await run(
    `<p id="p">前置き<strong>強調部分</strong>後書き</p>`,
    (doc, range) => {
      const p = doc.getElementById("p");
      range.setStart(p.firstChild, 2);            // 「き」から
      range.setEnd(p.lastChild, 2);               // 「後書」まで
    },
  );
  ok("拾えた文言", textOf(marks), "き強調部分後書");
  ok("選んでいない部分は含まない", textOf(marks).includes("前置"), false);
}

console.log("\n--- 5. 1 つのテキストの中だけ ---");
{
  const { dom, marks } = await run(`<p id="p">ここだけを選ぶ。</p>`, (doc, range) => {
    const t = doc.getElementById("p").firstChild;
    range.setStart(t, 2);
    range.setEnd(t, 5);
  });
  ok("印は 1 つ", marks.length, 1);
  // 「ここだけを選ぶ。」の 2 文字目から 5 文字目の手前まで＝「だけを」
  ok("拾えた文言", textOf(marks), "だけを");
  ok("前後の文字は残る", dom.window.document.getElementById("p").textContent, "ここだけを選ぶ。");
}

console.log("\n--- 6. 確定・失敗・取り消しが全部の印に効くこと ---");
{
  const { dom, marks, mod } = await run(
    `<p id="p">あああ<strong>いいい</strong>ううう</p>`,
    (doc, range) => {
      const p = doc.getElementById("p");
      range.setStart(p.firstChild, 0);
      range.setEnd(p.lastChild, p.lastChild.data.length);
    },
  );
  ok("印は 3 つ", marks.length, 3);
  ok("最初は点線", marks.every((m) => m.style.textDecorationStyle === "dotted"), true);

  for (const m of marks) mod.styleDraftMark(m, true);
  ok("失敗の色が全部に効く", marks.every((m) => m.style.textDecorationColor === "rgb(220, 38, 38)"), true);

  for (const m of marks) mod.confirmDraftMark(m);
  ok("確定で点線が消える", marks.every((m) => m.style.textDecorationLine === "none"), true);
  ok("確定の塗りが全部に効く", marks.every((m) => m.style.background !== ""), true);

  mod.unwrapDraftMarks(marks);
  ok("取り消しで印が全部外れる", dom.window.document.querySelectorAll("mark").length, 0);
  ok("本文は元どおり", dom.window.document.getElementById("p").textContent, "あああいいいううう");
  ok("太字も元どおり", dom.window.document.querySelectorAll("strong").length, 1);
}

console.log("\n--- 7. 台本などは巻き込まない ---");
{
  const { marks } = await run(
    `<div id="d"><p id="a">見える文。</p><script>var x = "見えない文";</script><p id="b">次の文。</p></div>`,
    (doc, range) => {
      range.setStart(doc.getElementById("a").firstChild, 0);
      const b = doc.getElementById("b").firstChild;
      range.setEnd(b, b.data.length);
    },
  );
  ok("台本の中身は拾わない", textOf(marks).includes("見えない文"), false);
  ok("拾えた文言", textOf(marks), "見える文。次の文。");
}

console.log("\n--- 8. 付け先の差し替え（本文と強さは残す）---");
{
  const { dom, marks, mod } = await run(
    `<div id="d"><p id="a">最初に選んだ文です。</p><p id="b">あとから選び直した文です。</p></div>`,
    (doc, range) => {
      const t = doc.getElementById("a").firstChild;
      range.setStart(t, 0);
      range.setEnd(t, t.data.length);
    },
  );

  // 書きかけ（実装と同じ形）
  const draft = {
    anchor: { quote: "最初に選んだ文です。", context: { beforeText: "", afterText: "先" } },
    kind: "comment",
    priority: "must",
    body: "ここの根拠が知りたい",
    marks,
  };
  ok("最初の印が付いている", dom.window.document.querySelectorAll("mark").length, 1);
  ok("最初の付け先", draft.anchor.quote, "最初に選んだ文です。");

  // 別の文を選び直す
  const range2 = dom.window.document.createRange();
  const t2 = dom.window.document.getElementById("b").firstChild;
  range2.setStart(t2, 0);
  range2.setEnd(t2, t2.data.length);

  // 実装と同じ手順: 旧の印を外し、引用と文脈を差し替え、新しい場所に印を付ける
  mod.unwrapDraftMarks(draft.marks);
  draft.anchor = { quote: "あとから選び直した文です。", context: { beforeText: "後", afterText: "" } };
  draft.marks = mod.wrapRangeAsDraft(range2);

  ok("**本文はそのまま**", draft.body, "ここの根拠が知りたい");
  ok("**強さもそのまま**", draft.priority, "must");
  ok("**種類もそのまま**", draft.kind, "comment");
  ok("引用が差し替わった", draft.anchor.quote, "あとから選び直した文です。");
  ok("前後の文脈も差し替わった", draft.anchor.context.beforeText, "後");

  ok("印は 1 つだけ（旧は外れた）", dom.window.document.querySelectorAll("mark").length, 1);
  ok("印が新しい文に付いている", dom.window.document.querySelector("#b mark") !== null, true);
  ok("旧の文には印が無い", dom.window.document.querySelector("#a mark"), null);
  ok("旧の文の中身は元どおり", dom.window.document.getElementById("a").textContent, "最初に選んだ文です。");
  ok("新しい印の文言", textOf(draft.marks), "あとから選び直した文です。");
}

console.log("\n--- 9. 送信済みの控えは差し替えの影響を受けない ---");
{
  const { dom, marks, mod } = await run(
    `<div id="d"><p id="a">送った文です。</p><p id="b">あとで選んだ文です。</p></div>`,
    (doc, range) => {
      const t = doc.getElementById("a").firstChild;
      range.setStart(t, 0);
      range.setEnd(t, t.data.length);
    },
  );

  // 送信: 控えへ移し、書きかけ側は空にする
  const job = { quote: "送った文です。", body: "送信済みの本文", priority: "better", marks };
  const draft = { anchor: { quote: "送った文です。" }, body: "送信済みの本文", priority: "better", marks: [] };
  for (const m of job.marks) mod.confirmDraftMark(m);

  // 送信後に別の文を選んで、新しく書き始める
  const range2 = dom.window.document.createRange();
  const t2 = dom.window.document.getElementById("b").firstChild;
  range2.setStart(t2, 0);
  range2.setEnd(t2, t2.data.length);
  draft.anchor = { quote: "あとで選んだ文です。" };
  draft.body = "";
  draft.marks = mod.wrapRangeAsDraft(range2);

  ok("送った控えの引用は変わらない", job.quote, "送った文です。");
  ok("送った控えの本文は変わらない", job.body, "送信済みの本文");
  ok("送った控えの印もそのまま", job.marks.length, 1);
  ok("送った印は確定の見た目のまま", job.marks[0].style.textDecorationLine, "none");
  ok("新しい印は下書きの見た目", draft.marks[0].style.textDecorationStyle, "dotted");
  ok("印は 2 つ並んで存在する", dom.window.document.querySelectorAll("mark").length, 2);
}

// ---------------------------------------------------------------------------
// ここから後半: 広い画面（PC）で、選んだ瞬間に出る小窓のぶん
// ---------------------------------------------------------------------------

/** ページを組んで、選択できる状態にするだけ（印はまだ付けない）。 */
async function stage(html) {
  const dom = new JSDOM(`<!doctype html><html><body>${html}</body></html>`);
  global.window = dom.window;
  global.document = dom.window.document;
  global.Node = dom.window.Node;
  global.Text = dom.window.Text;
  global.NodeFilter = dom.window.NodeFilter;
  stubRangeWidth(dom);
  const mod = await import(`${dir}/dm-anchor.mjs?v=${Math.random()}`);
  return { dom, mod };
}

/**
 * その段落の文字を、まるごと選んだことにする。返すのは選ばれた文言。
 *
 * 中身をまとめて指す（firstChild を掴まない）。すでに印が入っている段落を
 * 選び直す場面があり、そこでは先頭が文字ではなく印の要素になっているため。
 */
function select(dom, id) {
  const holder = dom.window.document.getElementById(id);
  const range = dom.window.document.createRange();
  range.selectNodeContents(holder);
  const selection = dom.window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
  return holder.textContent;
}

/**
 * 広い画面の小窓の流れを、実装（src/widget/comments/comments.ts）と同じ手順で写したもの。
 *
 * 印を付ける・外す・確定させるところは**本物の関数**（src/widget/comments/anchor.ts）を呼ぶ。
 * 写しているのは呼ぶ順番だけ。順番が実装と食い違っていないことは、
 * このあとの「15. 実装がこの手順どおりか」で本文を読んで確かめる。
 */
function popoverFlow(dom, mod) {
  const state = { draft: null };

  /** pageRange(): ページ本文の中で生きている選択だけ */
  const pageRange = () => {
    const selection = dom.window.getSelection();
    if (selection === null || selection.rangeCount === 0 || selection.isCollapsed) return null;
    return selection.getRangeAt(0);
  };

  /** beginPopoverDraft(): 引用を写し取り、選んだ場所に印を置いてから持つ */
  const begin = (quote) => {
    const previous = state.draft;
    // 使い回してよいかは、印が本文に繋がっているかで見る（数だけでは見ない）
    const staying =
      previous !== null &&
      previous.anchor.quote === quote &&
      previous.marks.length > 0 &&
      previous.marks.every((mark) => mark.isConnected);

    let marks = [];
    if (previous !== null && staying) {
      marks = previous.marks;
    } else {
      if (previous !== null) mod.unwrapDraftMarks(previous.marks);
      const range = pageRange();
      if (range !== null) marks = mod.wrapRangeAsDraft(range);
    }
    state.draft = { anchor: { quote }, kind: "comment", priority: "want", body: "", marks };
  };

  /** hidePopover(): 小窓を閉じる。書きかけの印も一緒に外す */
  const hide = () => {
    if (state.draft !== null) mod.unwrapDraftMarks(state.draft.marks);
    state.draft = null;
  };

  /** submitDraft(): 押した瞬間に控えへ移し、確定の見た目にして閉じる */
  const submit = () => {
    if (state.draft === null) return null;
    const job = { quote: state.draft.anchor.quote, body: state.draft.body, marks: state.draft.marks };
    state.draft.marks = [];
    hide();
    for (const mark of job.marks) mod.confirmDraftMark(mark);
    return job;
  };

  return { state, begin, hide, submit };
}

const draftMarks = (dom) =>
  Array.from(dom.window.document.querySelectorAll("mark[data-surprise-draft]"));

console.log("\n--- 10. 広い画面: 選んで小窓が出たら、本文にも印が付く ---");
{
  const { dom, mod } = await stage(
    `<div id="d"><p id="a">ここが分かりにくい一文です。</p><p id="b">こちらは別の段落です。</p></div>`,
  );
  const flow = popoverFlow(dom, mod);

  ok("選んだだけでは、まだ印は無い", draftMarks(dom).length, 0);
  const quote = select(dom, "a");
  flow.begin(quote);

  ok("印が付いた", draftMarks(dom).length, 1);
  ok("印が選んだ段落に付いている", dom.window.document.querySelector("#a mark") !== null, true);
  ok("印の文言が選んだ文言と同じ", draftMarks(dom)[0].textContent, "ここが分かりにくい一文です。");
  ok("**書きかけが印を持っている**", flow.state.draft.marks.length, 1);
  ok("下書きの見た目（点線）", draftMarks(dom)[0].style.textDecorationStyle, "dotted");
  ok("選んでいない段落には付かない", dom.window.document.querySelector("#b mark"), null);
  ok("本文は元のまま読める", dom.window.document.getElementById("a").textContent, "ここが分かりにくい一文です。");

  // 焦点が入力欄へ移ると、ブラウザの選択は解ける。それでも印は残る
  dom.window.getSelection().removeAllRanges();
  ok("**選択が解けても印は残る（これが直したかったこと）**", draftMarks(dom).length, 1);
}

console.log("\n--- 11. 閉じた・やめたら、印が消える ---");
{
  const { dom, mod } = await stage(`<p id="a">閉じたら消える文です。</p>`);
  const flow = popoverFlow(dom, mod);
  flow.begin(select(dom, "a"));
  ok("開いている間は印がある", draftMarks(dom).length, 1);

  flow.hide();
  ok("閉じたら印が消える", draftMarks(dom).length, 0);
  ok("書きかけも畳まれる", flow.state.draft, null);
  ok("本文は元どおり", dom.window.document.getElementById("a").textContent, "閉じたら消える文です。");
  ok("包みの残骸も無い", dom.window.document.querySelectorAll("mark").length, 0);
}

console.log("\n--- 12. 送ったら、印が確定の見た目に変わる（消し忘れない）---");
{
  const { dom, mod } = await stage(`<p id="a">送ったあとの文です。</p>`);
  const flow = popoverFlow(dom, mod);
  flow.begin(select(dom, "a"));
  flow.state.draft.body = "ここの根拠が知りたい";

  const job = flow.submit();
  ok("控えが印を引き取った", job.marks.length, 1);
  ok("書きかけは畳まれた", flow.state.draft, null);
  ok("印は消えずに残る", dom.window.document.querySelectorAll("mark").length, 1);
  ok("確定の見た目（点線が消える）", job.marks[0].style.textDecorationLine, "none");
  ok("確定の塗りに変わる", job.marks[0].style.background !== "", true);

  // 保存が返ってきたら仮の印は外す（本物はサーバー側の引用から引き直される）
  mod.unwrapDraftMarks(job.marks);
  ok("返事のあとに仮の印は外れる", dom.window.document.querySelectorAll("mark").length, 0);
  ok("本文は元どおり", dom.window.document.getElementById("a").textContent, "送ったあとの文です。");
}

console.log("\n--- 13. 選び直したら、印もそちらへ移る ---");
{
  const { dom, mod } = await stage(
    `<div id="d"><p id="a">はじめに選んだ文です。</p><p id="b">あとから選び直した文です。</p></div>`,
  );
  const flow = popoverFlow(dom, mod);
  flow.begin(select(dom, "a"));
  ok("最初は 1 つ目の段落", dom.window.document.querySelector("#a mark") !== null, true);

  flow.begin(select(dom, "b"));
  ok("印は 1 つだけ（前のは外れた）", draftMarks(dom).length, 1);
  ok("新しい段落へ移った", dom.window.document.querySelector("#b mark") !== null, true);
  ok("前の段落には残っていない", dom.window.document.querySelector("#a mark"), null);
  ok("前の段落の中身は元どおり", dom.window.document.getElementById("a").textContent, "はじめに選んだ文です。");
  ok("引用も差し替わった", flow.state.draft.anchor.quote, "あとから選び直した文です。");

  // 同じところを選び直しただけなら、外して付け直さない（堂々巡りを起こさない）
  const before = flow.state.draft.marks[0];
  flow.begin(select(dom, "b"));
  ok("**同じ場所なら印を作り直さない**", flow.state.draft.marks[0] === before, true);
  ok("印は増えない", draftMarks(dom).length, 1);
}

console.log("\n--- 14. 赤入れ（履歴の差分）と混ざらない ---");
{
  // 印の付け方が違う: コメントの引用と書きかけは <mark> を足す。赤入れは ins / del
  const { dom, mod } = await stage(
    `<p id="a">この段落には<ins data-surprise-redline="0">足した文</ins>があります。</p>`,
  );
  const flow = popoverFlow(dom, mod);
  flow.begin(select(dom, "a"));

  ok("下書きの印は mark に付く", draftMarks(dom).length > 0, true);
  ok(
    "赤入れの印は別の目印",
    dom.window.document.querySelectorAll("[data-surprise-redline]").length,
    1,
  );
  ok(
    "下書きの印は赤入れの目印を持たない",
    draftMarks(dom).some((m) => m.hasAttribute("data-surprise-redline")),
    false,
  );

  mod.unwrapDraftMarks(flow.state.draft.marks);
  ok(
    "下書きの印を外しても赤入れは残る",
    dom.window.document.querySelectorAll("[data-surprise-redline]").length,
    1,
  );
  ok("赤入れの文言も残る", dom.window.document.querySelector("ins").textContent, "足した文");
}

// ---------------------------------------------------------------------------
// 実装そのものを読む。上の写しと手順がずれていたら、ここで落ちる
// ---------------------------------------------------------------------------

/** 注記を落として、実際に動くところだけを見る。 */
const codeOnly = (text) =>
  text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const widget = codeOnly(await readWidgetSource());
const tokens = codeOnly(await readFile(`${root}/src/widget/shared/tokens.ts`, "utf8"));

/** 名前で関数の中身を切り出す（波かっこの数を数える）。 */
function fn(name) {
  const at = widget.indexOf(`function ${name}(`);
  if (at < 0) return "";
  const open = widget.indexOf("{", widget.indexOf(")", at));
  let depth = 0;
  for (let i = open; i < widget.length; i += 1) {
    if (widget[i] === "{") depth += 1;
    if (widget[i] === "}") {
      depth -= 1;
      if (depth === 0) return widget.slice(open, i + 1);
    }
  }
  return "";
}

console.log("\n--- 15. 実装（src/widget/comments/comments.ts）が、この手順どおりか ---");
{
  const begin = fn("beginPopoverDraft");
  ok("小窓の書きかけも印を包む", /wrapRangeSafely\(range\)/.test(begin), true);
  ok("包む前に、生きている選択を取り出す", /pageRange\(\)/.test(begin), true);
  ok("選び直しでは前の印を先に外す", /unwrapDraftMarks\(previous\.marks\)/.test(begin), true);
  ok("同じ場所なら付け直さない", /previous\.anchor\.quote === anchor\.quote/.test(begin), true);
  ok("印を持たずに書き始める道は残っていない", /marks: \[\]/.test(begin), false);

  ok("小窓を閉じたら印も外す", /unwrapDraftMarks\((?:selectionFeature\.)?draft\.marks\)/.test(fn("hidePopover")), true);

  const submit = fn("submitDraft");
  ok("送るときは先に控えへ移す", submit.indexOf("draft.marks = []") < submit.indexOf("hidePopover()"), true);
  ok("送った印は確定の見た目にする", /confirmDraftMark\(mark\)/.test(submit), true);

  console.log("\n   新しい見た目を作っていないか（既存の部品を使い回しているか）");
  ok("印を作る部品は 1 つ（anchor.ts の wrapRangeAsDraft）", (widget.match(/wrapRangeAsDraft\(/g) ?? []).length, 1);
  ok("包み方の入り口も 1 つ", (widget.match(/function wrapRangeSafely\(/g) ?? []).length, 1);
  ok("小窓の中で mark 要素を自作していない", /createElement\("mark"\)/.test(widget), false);
  ok("印の見た目は anchor.ts から借りている", /styleDraftMark/.test(widget), true);
}

console.log("\n--- 16. 狭い画面（スマホ）の流れは、変えていない ---");
{
  const bar = fn("beginDraftFromBar");
  ok("下端の帯からは今までどおり印を付ける", /wrapLiveSelection\(\)/.test(bar), true);
  ok("帯からは書き込みドックが開く", /(?:selectionFeature\.)?openComposeDock\(\)/.test(bar), true);
  ok("控えた範囲へ落とす道は残っている", /currentRange\(\)\s*\?\?\s*pendingRange/.test(fn("wrapLiveSelection")), true);
  ok("ドックを閉じたら印も外す", /unwrapDraftMarks\((?:selectionFeature\.)?draft\.marks\)/.test(fn("closeComposeDock")), true);
  ok("帯を出した時点では印を付けない", /wrapRangeSafely|wrapLiveSelection/.test(fn("showSelectionBar")), false);
  ok("出し分けの決め方に手を入れていない", /instantCompose\(entry\)/.test(fn("showSelectionPopover")), true);
  ok("見張りの入り口の順番もそのまま", /if \((?:selectionFeature\.)?isDocked\(\)\) \{\s*retargetDraft\(\);/.test(fn("onSelectionSettled")), true);
}

console.log("\n--- 17. 赤入れ（過去の版・版くらべ）と混ざらないこと ---");
{
  const settled = fn("onSelectionSettled");
  ok("比べている間はコメントの入り口を出さない", settled.indexOf("isComparing()") < settled.indexOf("captureSelection()"), true);
  ok("比べ始めるときに小窓を畳む（＝印も外れる）", /(?:selectionFeature\.)?hidePopover\(\);/.test(fn("applyCompare")), true);
  ok("比べ始めるときにコメントの印も外す", /clearHighlights\(\);/.test(fn("applyCompare")), true);

  console.log("\n   見分け方: 目印も見た目も別物");
  const anchorSource = codeOnly(await readFile(`${root}/src/widget/comments/anchor.ts`, "utf8"));
  const redline = codeOnly(await readFile(`${root}/src/widget/comments/redline.ts`, "utf8"));
  ok("下書きの印の目印", /DRAFT_ATTRIBUTE = "data-surprise-draft"/.test(anchorSource), true);
  ok("赤入れの目印", /REDLINE_ATTRIBUTE = "data-surprise-redline"/.test(redline), true);
  // 形で分ける: 書きかけは塗る、赤入れは塗らない
  ok("書きかけは塗る", /mark\.style\.background = DRAFT_MARK\.tint/.test(anchorSource), true);
  ok("赤入れは塗らない", /node\.style\.background = "transparent"/.test(redline), true);
  ok("赤入れの片付けは、下書きの印に触らない", /data-surprise-draft/.test(redline), false);
}

console.log("\n--- 18. 色を増やしていない・素の数を書いていない ---");
{
  ok("下書きの印の塗りは、確定の印と同じ色みのまま", /tint: "rgba\(200, 168, 110, \.16\)"/.test(tokens), true);
  ok("添える点線はアクセントの色（--accent と同じ）", /lineColor: "#c8a86e"/.test(tokens), true);
  ok("失敗のときだけ危険の色（--danger と同じ）", /failedColor: "#dc2626"/.test(tokens), true);
  const draftBlock = tokens.slice(tokens.indexOf("export const DRAFT_MARK"), tokens.indexOf("export const MARK"));
  ok("下書きの印が持つ色は 3 つだけ", (draftBlock.match(/#[0-9a-f]{6}|rgba?\(/g) ?? []).length, 3);
  ok("ウィジェット本体に色の直書きは無い", /#[0-9a-fA-F]{6}\b|rgba?\(/.test(widget), false);

  console.log("\n   小窓の置き方も、決めた値から取る");
  ok("置き方の値はトークンにある", /export const POPOVER_PLACEMENT/.test(tokens), true);
  const place = fn("placePopover");
  ok("小窓の置き方はトークンを読む", /POPOVER_PLACEMENT/.test(place), true);
  ok("置き方に素の数を書いていない", /\b(8|12)\b/.test(place), false);
  ok("入りきらないときも、選んだ場所の上に乗せない", /roomAbove/.test(place), true);
}

// ---------------------------------------------------------------------------
// ここから: 印を入れたせいでページの体裁が動かないこと
//
// 印は要素なので、置き場所と持ち物を間違えると本文の組み方に干渉する。
// 実測（1280px の実ブラウザ・節をまたぐ選択）で出た 2 つの壊れ方を塞いである。
//   1. 空白だけの詰め物に入れた印が、横並びの箱の「並びの一員」に数えられる
//   2. 印が内側余白を持つと、印の数だけ字送りが伸びる
// ---------------------------------------------------------------------------

const anchorCode = codeOnly(await readFile(`${root}/src/widget/comments/anchor.ts`, "utf8"));

console.log("\n--- 19. 空白だけの部分には印を入れない ---");
{
  // 横並びの箱（flex）の中に、字下げと改行だけの文字ノードが挟まっている形。
  // 実際のページはこう書かれている（人が読める HTML はどこもこうなる）
  const { dom, marks } = await run(
    `<div id="d" style="display:flex">\n  <p id="a">左の段落です。</p>\n  <p id="b">右の段落です。</p>\n</div>`,
    (doc, range) => {
      range.setStart(doc.getElementById("a").firstChild, 0);
      const b = doc.getElementById("b").firstChild;
      range.setEnd(b, b.data.length);
    },
  );
  ok("印は見えている文字の数だけ（詰め物には入らない）", marks.length, 2);
  ok("拾えた文言", textOf(marks), "左の段落です。右の段落です。");
  ok("**横並びの箱の直下に印を増やしていない**", dom.window.document.querySelectorAll("#d > mark").length, 0);
  ok("中身が空白だけの印は 1 つも無い", marks.filter((m) => m.textContent.trim().length === 0).length, 0);
  ok("箱の並びの一員の数は元のまま（段落 2 つ）", dom.window.document.querySelectorAll("#d > *").length, 2);
  ok("本文の文字は 1 つも欠けていない", dom.window.document.getElementById("d").textContent.replace(/\s+/g, ""), "左の段落です。右の段落です。");
}

console.log("\n   単語の間の半角スペース 1 個は捨てない（印が単語ごとに分断されない）");
{
  // 空白だけの文字ノードでも、そこに空白が描かれているなら中身の一部
  const { dom, marks } = await run(
    `<p id="p"><b>alpha</b> <b>beta</b></p>`,
    (doc, range) => {
      const p = doc.getElementById("p");
      range.setStart(p.firstChild.firstChild, 0);
      const last = p.lastChild.firstChild;
      range.setEnd(last, last.data.length);
    },
  );
  ok("間の空白も印に含まれる", textOf(marks), "alpha beta");
  ok("空白のところにも印が入っている", marks.length, 3);
  ok("本文は元どおり", dom.window.document.getElementById("p").textContent, "alpha beta");
}

console.log("\n   文の途中の空白（同じ文字ノードの中）はそのまま");
{
  const { marks } = await run(`<p id="p">alpha beta gamma</p>`, (doc, range) => {
    range.selectNodeContents(doc.getElementById("p"));
  });
  ok("印は 1 つ", marks.length, 1);
  ok("空白ごと包まれている", textOf(marks), "alpha beta gamma");
}

console.log("\n   選んだところが空白だけでも落ちない");
{
  const { dom, marks } = await run(`<div id="w">\n  \n</div>`, (doc, range) => {
    range.selectNodeContents(doc.getElementById("w"));
  });
  ok("包めるものが無ければ印は 0 個", marks.length, 0);
  ok("例外で落ちていない（ここまで来た）", true, true);
  ok("本文にも印は入っていない", dom.window.document.querySelectorAll("mark").length, 0);
}

console.log("\n   実装（src/widget/comments/anchor.ts）が、空白の見え方で決めているか");
{
  ok("詰め物を見分ける道具がある", /function isInvisibleFiller\(node: Text\)/.test(anchorCode), true);
  ok("「空白か」だけでは決めない（幅を測る）", /getBoundingClientRect\(\)\.width === 0/.test(anchorCode), true);
  ok("包む前にふるいをかけている", anchorCode.indexOf("isInvisibleFiller(node)") < anchorCode.indexOf("piece.splitText"), true);
  ok("選択の端は詰め物でも外さない", /node === startNode \|\| node === endNode/.test(anchorCode), true);
}

console.log("\n--- 20. 印は字送りを動かさない（余白も外側の間隔も持たない）---");
{
  const { marks, mod } = await run(`<p id="p">ここに印を付けます。</p>`, (doc, range) => {
    range.selectNodeContents(doc.getElementById("p"));
  });
  const mark = marks[0];
  ok("字送りを動かさない（余白 0）", mark.style.padding, "0px");
  ok("外側の間隔も持たない", mark.style.margin, "0px");
  ok("枠線も持たない", mark.style.border, "0px");
  ok("行の中に置く（並びの一員にならない）", mark.style.display, "inline");
  ok("はみ出しは場所を取らない影で描く", /^2px 0 0 0 .+-2px 0 0 0 /.test(mark.style.boxShadow), true);
  ok("折り返しの切れ端ごとには描かない", mark.style.getPropertyValue("box-decoration-break"), "");

  // 送ったあとの見た目（確定）でも同じ約束
  mod.confirmDraftMark(mark);
  ok("確定しても余白 0", mark.style.padding, "0px");
  ok("確定しても外側の間隔 0", mark.style.margin, "0px");
  ok("確定しても切れ端ごとには描かない", mark.style.getPropertyValue("box-decoration-break"), "");
}

console.log("\n   値の持ち方（トークンに余白を置かない・はみ出し幅は置く）");
{
  const draftBlock = tokens.slice(tokens.indexOf("export const DRAFT_MARK"), tokens.indexOf("export const MARK"));
  const markBlock = tokens.slice(tokens.indexOf("export const MARK"), tokens.indexOf("export const REDLINE"));
  ok("下書きの印に余白の値は無い", /padding/.test(draftBlock), false);
  ok("確定の印にも余白の値は無い", /padding/.test(markBlock), false);
  ok("はみ出し幅は 1 か所で持つ", /const BLEED = "2px";/.test(tokens), true);
  ok("はみ出しを作る道具もそこにある", /export function bleedShadow/.test(tokens), true);
  ok("余白を渡せる口が無い", /function paintBleed\(mark: HTMLElement, tint: string\)/.test(anchorCode), true);
  ok("塗りを当てるところは 1 か所だけ", (anchorCode.match(/function paintBleed\(/g) ?? []).length, 1);
  ok("切れ端ごとに描く指定を足していない", /box-decoration-break/.test(anchorCode), false);
}

console.log("\n--- 21. 離れかけただけでは、書きかけの印を失わない ---");
{
  // mailto: や download 付きのリンクを押すと、離脱の合図だけ飛んでページは残る。
  // そのとき本文の印だけを掃くと、記憶（書きかけが持つ配列）とずれる
  const { dom, mod } = await stage(`<p id="a">離れかけても残したい文です。</p>`);
  const flow = popoverFlow(dom, mod);
  flow.begin(select(dom, "a"));
  const orphan = flow.state.draft.marks[0];

  // 本文の印だけが外れた形を作る（記憶側はそのまま生きている）
  mod.unwrapDraftMarks(flow.state.draft.marks);
  ok("本文から印が消えた", draftMarks(dom).length, 0);
  ok("記憶側には印の配列が残っている", flow.state.draft.marks.length, 1);

  // 同じ文を選び直す
  flow.begin(select(dom, "a"));
  ok("**印が描き直される**", draftMarks(dom).length, 1);
  ok("外れた要素を使い回していない", flow.state.draft.marks[0] === orphan, false);
  ok("印が選んだ段落に付いている", dom.window.document.querySelector("#a mark") !== null, true);
  ok("本文は元のまま読める", dom.window.document.getElementById("a").textContent, "離れかけても残したい文です。");
}

console.log("\n   実装（src/widget/comments/comments.ts）が、その形になっているか");
{
  ok("印が生きているかは、本文に繋がっているかで見る", /isConnected/.test(fn("beginPopoverDraft")), true);
  ok("数だけで「まだ有る」と決めていない", /previous\.marks\.length > 0 &&\s*previous\.anchor\.quote/.test(fn("beginPopoverDraft")), false);
  ok("書きかけを畳ませる口がある", /function dropDraft\(\)/.test(widget), true);
  ok("持ち主（ドックか小窓）に手を離させる", /(?:selectionFeature\.)?isDocked\(\) \? |if \((?:selectionFeature\.)?isDocked\(\)\) (?:selectionFeature\.)?discardDraft\(\);/.test(fn("dropDraft")), true);
  ok("離れるときは、まず書きかけを畳む", /(?:selectionFeature\.)?dropDraft\(\);\s*clearHighlights\(\);/.test(fn("attachPageEvents")), true);
  ok("本文の書きかけを直接掃く道は無い", /clearHighlights\("all"\)|clearHighlights\("drafts"\)/.test(widget), false);
  ok("印を外す道は「確定した印だけ」の 1 つ", /export function clearHighlights\(\): void/.test(anchorCode), true);
  ok("書きかけを目印で掃く道も残っていない", /querySelectorAll\(DRAFT_SELECTOR\)/.test(anchorCode), false);
}
