import { DECK_MARK } from "../../lib/deck/deck";
import { REDLINE_ATTRIBUTE } from "../comments/redline";
import { readSession, writeSession } from "../shared/util";

/**
 * このページの表示が「読み込み直し」か「戻る・進む」で開かれたか。どちらもブラウザが前の位置へ戻すので、
 * 前の位置へ戻してよく、URL の印（見出しの #・コメントの #c=）へは連れて行き直さない。
 */
export function reopenedHere(view: Window = window): boolean {
  try {
    const entry = view.performance.getEntriesByType("navigation")[0];
    if (entry === undefined || !("type" in entry)) return false;
    return entry.type === "reload" || entry.type === "back_forward";
  } catch {
    // 測れないブラウザでは戻さない（新しく開いた人に、前の位置を押し付けない）
    return false;
  }
}

/**
 * 「いま読んでいるところ」を測って、保つ・持ち越す、ただ 1 つの部品。
 *
 * 画面の見た目が変わる・表示を切り替える・読み込み直す・版を移るたびに、読む人は「さっき読んでいた所」を見失う。
 * 守り方は 3 つで、どれもここだけが持つ（画面ごとに書き足さない）:
 *
 *   その場で保つ       … 本文の上で何かが増えたり減ったりする（上端の帯・赤入れ・板の押しのけ）。
 *                         変わる前に読んでいるところを測り、変わったぶんだけスクロールで打ち消す（`keepInPlace`・`followPlace`）
 *   またいで保つ       … 読み込み直す・別の版の URL へ移る・目次で飛んで「戻る」。出る前に控え、開き直したら同じ段落へ戻す
 *                         （`carryPlace` → `restoreCarriedPlace`・`rememberPlaceInHistory`）。画素では控えない——版が変わると、
 *                         同じ画素は別の段落を指す。控えるのは段落の書き出しの字と割合、予備に直前の見出しとそこからの距離
 *
 * 読んでいるところ＝見出しへ飛んだときに置かれる線（html の scroll-padding-top。上端の帯の高さとその下の余白を
 * top-inset.ts が書く）に掛かっている、いちばん内側の文のかたまりと、そのかたまりのどこまで来ているか（割合）。
 *
 * **本文の DOM には何も足さない。** 測るのは位置だけで、印も属性も付けない。
 */

/** 読んでいるところとして数えるかたまり。行の単位で、入れ子の内側ほど細かい。 */
export const READING_BLOCKS = "h1,h2,h3,h4,h5,h6,p,li,blockquote,pre,figure,table,tr,dt,dd,figcaption,summary,hr,img,svg";
const HEADINGS = "h1,h2,h3,h4,h5,h6";

/**
 * 読んでいるところを測る線（画面の上からの距離）。見出しへ飛んだときに置かれる高さ（html の scroll-padding-top。
 * 上端の帯の高さと、その下の余白を top-inset.ts が書く）にそろえる——飛んだ直後に測ると、飛んだ先が「読んでいるところ」になる。
 */
export function readingLine(doc: Document = document): number {
  const view = doc.defaultView;
  return view === null ? 0 : Number.parseFloat(view.getComputedStyle(doc.documentElement).scrollPaddingTop) || 0;
}

/** 線の下にこれだけしか残っていないかたまりは、もう読み終えたものとみなす（およそ 1 行）。 */
const PASSED_REMNANT = 24;
/** これより上を読んでいるなら「先頭」とみなす。 */
const TOP_EDGE = 1;
/** 段落を見分ける書き出しの長さ。 */
const KEY_LENGTH = 80;
const CARRY_KEY = "surprise-pages:reading-place";
/** 読み込み直したあと、控えた位置へ戻すのを受け付ける長さ。 */
const CARRY_LIFE_MS = 60 * 1000;
/** 少しずつ変わる動きが予定より遅れて終わるとき、合わせ続けてよい長さ。 */
const FOLLOW_GRACE_MS = 500;
/** 読み込み直して戻したあと、本文の組みが落ち着くまで戻した所を保つ長さ。 */
const RESTORE_HOLD_MS = 1500;

export interface ReadingSpot {
  element: Element;
  /** かたまりの上端から、線までの割合（`spotAt` は 0〜1。`spotHere` は線がかたまりの上のすき間にあるとき負になる） */
  ratio: number;
}

function sizeOf(element: Element): DOMRect | null {
  const rect = element.getBoundingClientRect();
  return rect.height > 0 ? rect : null;
}

function bodyOf(doc: Document): Element {
  return doc.querySelector("main") ?? doc.body;
}

/**
 * 線（画面の上からの距離）に掛かっている、いちばん内側のかたまり。
 * 線より下から始まる内側のかたまりには乗り換えない（外側の文がまだ上端にある）。
 */
export function spotAt(root: ParentNode, line: number): ReadingSpot | null {
  let best: Element | null = null;
  let bestRect: DOMRect | null = null;
  for (const element of root.querySelectorAll(READING_BLOCKS)) {
    if (best !== null && !best.contains(element)) break;
    const rect = sizeOf(element);
    // 線の下に 1 行ぶんも残っていないかたまりは、読み終えて上へ流れたもの
    if (rect === null || rect.bottom <= line + PASSED_REMNANT) continue;
    if (best === null || rect.top <= line) {
      best = element;
      bestRect = rect;
    }
  }
  if (best === null || bestRect === null) return null;
  return { element: best, ratio: Math.min(1, Math.max(0, (line - bestRect.top) / bestRect.height)) };
}

/** 本文でいま読んでいるところ。先頭を読んでいる（スクロールしていない）なら null——先頭は何もしなくても先頭のまま見える。 */
export function spotHere(line: number = readingLine(), doc: Document = document): ReadingSpot | null {
  if ((doc.defaultView?.scrollY ?? 0) <= TOP_EDGE) return null;
  const spot = spotAt(bodyOf(doc), line);
  if (spot === null) return null;
  // 割合は 0〜1 に丸めない。線が段落のすき間や、読み終えかけた段落の最後の行にあるときも、線の高さそのものを保ち・戻せるように
  const rect = spot.element.getBoundingClientRect();
  return rect.height > 0 ? { element: spot.element, ratio: Math.min(1, Math.max(-1, (line - rect.top) / rect.height)) } : spot;
}

/**
 * かたまりが今の表示で測れないとき（畳んだ中・隠した中）は、測れる外側へ寄せる。
 * 寄せた先では割合を 0 にする（外側の途中の割合は、内側の割合と意味が違う）。
 */
export function measurable(spot: ReadingSpot): ReadingSpot | null {
  for (let node: Element | null = spot.element; node !== null; node = node.parentElement) {
    if (sizeOf(node) !== null) return node === spot.element ? spot : { element: node, ratio: 0 };
  }
  return null;
}

/** そのかたまりの割合の点が、いま画面の上から何 px にあるか。 */
function pointOf(spot: ReadingSpot): number {
  const rect = spot.element.getBoundingClientRect();
  return rect.top + spot.ratio * rect.height;
}

/** そのかたまりの割合の位置が、線の高さに来るまでの距離（正なら下へ送る）。 */
export function distanceTo(spot: ReadingSpot, line: number): number {
  return pointOf(spot) - line;
}

/** ページ全体を送って、読んでいるところを線の高さに置く。 */
export function scrollPageTo(spot: ReadingSpot, line: number): void {
  const reachable = measurable(spot);
  if (reachable === null) return;
  window.scrollTo({ top: Math.max(0, window.scrollY + distanceTo(reachable, line)), behavior: "instant" });
}

/**
 * 変える前と後で、同じものを画面の同じ高さに置き続ける。上にあるものが伸び縮みする操作（上端の帯・赤入れ）で、
 * 読んでいた場所が流れないようにする。置き続けるのは渡したもの——本文なら `spotHere()`。null なら何もしない。
 */
export function keepInPlace<T>(target: Element | ReadingSpot | null, change: () => T): T {
  const spot = target === null ? null : target instanceof Element ? { element: target, ratio: 0 } : target;
  const before = spot === null ? null : pointOf(spot);
  const result = change();
  const view = spot?.element.ownerDocument.defaultView ?? null;
  if (spot === null || before === null || view === null || !spot.element.isConnected) return result;
  const delta = pointOf(spot) - before;
  if (Math.abs(delta) >= 1) view.scrollBy({ top: delta, behavior: "instant" });
  return result;
}

/** 読む人が自分で送り始めた合図（指・ホイール・キー）。これが来たら、こちらからは動かさない。 */
function onReaderScroll(view: Window, handler: () => void): () => void {
  const events = ["wheel", "touchmove", "keydown", "pointerdown"] as const;
  for (const name of events) view.addEventListener(name, handler, { passive: true, capture: true });
  return () => {
    for (const name of events) view.removeEventListener(name, handler, { capture: true });
  };
}

/**
 * 読んでいるところを、決めた長さの間だけ毎フレーム同じ高さに保つ。読む人が自分で送ったら手を離す。
 * `yields` なら、ほかの処理がスクロールを動かしたときもそちらに任せて手を離す（同時に 2 つが引っ張り合わない）。
 */
function hold(spot: ReadingSpot, at: number | (() => number), durationMs: number, yields: boolean): void {
  const view = spot.element.ownerDocument.defaultView;
  if (view === null) return;
  let stopped = false;
  const release = onReaderScroll(view, () => { stopped = true; });
  const until = view.performance.now() + durationMs;
  let settled = view.scrollY;
  const step = (): void => {
    if (stopped || !spot.element.isConnected || (yields && Math.abs(view.scrollY - settled) >= 1)) {
      release();
      return;
    }
    const drift = pointOf(spot) - (typeof at === "number" ? at : at());
    if (Math.abs(drift) >= 1) view.scrollBy({ top: drift, behavior: "instant" });
    settled = view.scrollY;
    // 動きは描画の都合で予定より遅れて終わることがある。予定の長さを過ぎても、まだ動いていれば合わせ続ける（上限あり）
    const now = view.performance.now();
    if (now <= until || (Math.abs(drift) >= 1 && now <= until + FOLLOW_GRACE_MS)) view.requestAnimationFrame(step);
    else release();
  };
  step();
}

/**
 * 道具箱の立ち上げで 1 回呼ぶ: 読み込み直す・別の履歴へ移る前に控えた所へ戻し（控えが無ければ何もしない）、離れるたびに控え、
 * 窓の幅が変わっても読んでいた段落を保つ。
 */
export function startReadingPlace(): void {
  restoreCarriedPlace();
  carryOnLeave();
  keepPlaceOnResize();
}

/**
 * 窓の幅が変わっても（折りたたみの端末を開く・閉じる・画面を回す・分割表示）、読んでいた段落を同じ高さに保つ。
 * 幅が変わると行の折り返しが変わり、同じ画素は別の段落を指す。読んでいるところは送るたびに控え、幅が変わったら控えた段落へ戻す。
 * 組み直しのあいだにブラウザが自分で送ったぶんは控えない（幅の違う控えは使わない）。道具箱の立ち上げで 1 回呼ぶ。
 */
export function keepPlaceOnResize(view: Window = window): void {
  let width = view.innerWidth;
  let spot: ReadingSpot | null = null;
  let queued = false;
  const remember = (): void => {
    queued = false;
    if (view.innerWidth === width) spot = spotHere(readingLine(view.document), view.document);
  };
  view.addEventListener("scroll", () => {
    if (queued) return;
    queued = true;
    view.requestAnimationFrame(remember);
  }, { passive: true });
  view.addEventListener("resize", () => {
    if (view.innerWidth === width) return;
    width = view.innerWidth;
    const kept = spot;
    if (kept === null || !kept.element.isConnected) return;
    const line = readingLine(view.document);
    scrollPageTo(kept, line);
    // 画像や字の読み込みで組みが少し遅れて落ち着くことがある。その間も同じ高さに保つ（読む人が送ったら手を離す）
    hold(kept, () => readingLine(view.document), RESTORE_HOLD_MS, false);
  });
}

/**
 * 見た目が少しずつ変わる処理（本文を押しのける動きなど）の間、読んでいるところを毎フレーム同じ高さに保つ。
 * 動いている途中に読む人が自分で送ったら、そこで手を離す。
 */
export function followPlace(target: ReadingSpot | null, change: () => void, durationMs: number): void {
  const at = target === null ? 0 : pointOf(target);
  change();
  if (target !== null) hold(target, at, durationMs, true);
}

/**
 * 写した木（cloneNode(true) した直後で、まだ形を変えていないもの）と元の木を同じ順に辿り、
 * かたまりどうしを対応づける。写しの側をあとで削っても、残ったものの対応は保たれる。
 */
export function pairBlocks(original: Node, copy: Node, into: Map<Element, Element>): void {
  if (original instanceof Element && copy instanceof Element && original.matches(READING_BLOCKS)) into.set(original, copy);
  const from = original.childNodes;
  const to = copy.childNodes;
  const count = Math.min(from.length, to.length);
  for (let index = 0; index < count; index++) {
    const a = from[index];
    const b = to[index];
    if (a !== undefined && b !== undefined) pairBlocks(a, b, into);
  }
}

export type ReadingPlace = {
  /** 読んでいた段落。text は書き出し、nth は同じ書き出しの段落の中で何番目か、ratio は段落の中のどこを読んでいたか。 */
  block: { text: string; nth: number; ratio: number } | null;
  /** 段落が見つからないとき（直されて消えた）の戻り先。offset は見出しの上端から読む線までの距離。 */
  heading: { text: string; nth: number; offset: number } | null;
};

/**
 * 見比べで挿し戻した「消した文」（src/widget/comments/redline.ts の印）。段落の書き出しに数えない——読み込み直した先や、
 * 見比べを終えたあとの本文には無いので、数えると同じ段落を探せなくなる。足した文は包むだけで字が増えないので、そのまま。
 */
const REDLINE_DELETION = `del[${REDLINE_ATTRIBUTE}]`;

function textKey(node: Element): string {
  const text = node.querySelector(REDLINE_DELETION) === null ? node.textContent ?? "" : textWithout(node, REDLINE_DELETION);
  return text.replace(/\s+/g, " ").trim().slice(0, KEY_LENGTH);
}

/** その中の字。`skip` に当たる要素の中の字は飛ばす。 */
function textWithout(node: Element, skip: string): string {
  const parts: string[] = [];
  const walker = node.ownerDocument.createTreeWalker(node, NodeFilter.SHOW_TEXT);
  for (let current = walker.nextNode(); current !== null; current = walker.nextNode()) {
    if (current.parentElement?.closest(skip) === null) parts.push(current.nodeValue ?? "");
  }
  return parts.join("");
}

/** 字があり、いまの表示で測れるかたまり。文書の順。 */
function withText(doc: Document, selector: string): Element[] {
  return [...bodyOf(doc).querySelectorAll(selector)].filter((node) => sizeOf(node) !== null && textKey(node).length > 0);
}

function sameText(list: readonly Element[], node: Element): number {
  const key = textKey(node);
  return list.filter((one) => textKey(one) === key).indexOf(node);
}

function pick(list: readonly Element[], text: string, nth: number): Element | null {
  const same = list.filter((one) => textKey(one) === text);
  return same[Math.min(nth, same.length - 1)] ?? null;
}

/** いま読んでいる所を、読み込み直しても版が変わっても探し直せる形で。先頭を読んでいるなら null。 */
export function placeAt(line: number = readingLine(), doc: Document = document): ReadingPlace | null {
  const spot = spotHere(line, doc);
  if (spot === null) return null;
  const key = textKey(spot.element);
  const block = key.length === 0 ? null : { text: key, nth: Math.max(0, sameText(withText(doc, READING_BLOCKS), spot.element)), ratio: spot.ratio };
  const headings = withText(doc, HEADINGS);
  let heading: ReadingPlace["heading"] = null;
  for (const one of headings) {
    const top = one.getBoundingClientRect().top;
    if (top > line) break;
    heading = { text: textKey(one), nth: Math.max(0, sameText(headings, one)), offset: line - top };
  }
  if (block === null && heading === null) return null;
  return { block, heading };
}

/** 控えた所へ戻す。戻せたら true。段落が無ければ見出し、それも無ければ何もしない。 */
export function scrollToPlace(place: ReadingPlace, line: number = readingLine(), doc: Document = document): boolean {
  const view = doc.defaultView;
  if (view === null) return false;
  if (place.block !== null) {
    const node = pick(withText(doc, READING_BLOCKS), place.block.text, place.block.nth);
    if (node !== null) {
      view.scrollBy({ top: distanceTo({ element: node, ratio: place.block.ratio }, line), behavior: "instant" });
      return true;
    }
  }
  if (place.heading !== null) {
    const node = pick(withText(doc, HEADINGS), place.heading.text, place.heading.nth);
    if (node !== null) {
      view.scrollBy({ top: node.getBoundingClientRect().top + place.heading.offset - line, behavior: "instant" });
      return true;
    }
  }
  return false;
}

/** この画面で、移る直前の控えをもう書いたか（離れるときの控えで上書きしない）。 */
let carried = false;

/**
 * 「move」はこちらから読み込み直す・版へ移るときの控えで、開き直したら必ず戻す。
 * 「leave」はページを離れるときに毎回書く控えで、読み込み直した・戻る進むで来たときだけ戻す
 * （リンクから開き直したときは先頭から出す）。
 */
type CarryReason = "move" | "leave";

function writeCarried(place: ReadingPlace | null, reason: CarryReason): void {
  writeSession(CARRY_KEY, place === null ? "" : JSON.stringify({ path: window.location.pathname, at: Date.now(), reason, place }));
}

/** 読み込み直す・別の版へ移る直前に呼ぶ。同じ道筋（版の違いは問わない）で開き直したときだけ戻す。 */
export function carryPlace(): void {
  carried = true;
  writeCarried(placeAt(), "move");
}

/**
 * ページを離れるたびに、読んでいた所を控えておく（ブラウザの読み込み直しのボタン・戻る進むのため）。
 * ブラウザが自分で戻す位置は画素なので、版が変わっていると別の段落になり、見出しへのリンク（#…）付きだと
 * ブラウザによっては見出しへ飛び直す。道具箱の立ち上げで 1 度だけ呼ぶ。
 */
export function carryOnLeave(): void {
  window.addEventListener("pagehide", () => {
    if (!carried) writeCarried(placeAt(), "leave");
  });
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? { ...value } : null;
}

function readPart(value: unknown, offsetName: "ratio" | "offset"): { text: string; nth: number; amount: number } | null {
  const part = record(value);
  if (part === null) return null;
  const text = part["text"];
  const nth = part["nth"];
  const amount = part[offsetName];
  if (typeof text !== "string" || typeof nth !== "number" || typeof amount !== "number" || !Number.isFinite(amount)) return null;
  return { text, nth, amount };
}

/** 控えの形を確かめて読む。形が違えば null。 */
function readPlace(value: unknown): ReadingPlace | null {
  const place = record(value);
  if (place === null) return null;
  const block = readPart(place["block"], "ratio");
  const heading = readPart(place["heading"], "offset");
  if (block === null && heading === null) return null;
  return {
    block: block === null ? null : { text: block.text, nth: block.nth, ratio: block.amount },
    heading: heading === null ? null : { text: heading.text, nth: heading.nth, offset: heading.amount },
  };
}

/** 履歴の 1 つに付ける、そこで読んでいた所の印の名前。 */
const HISTORY_PLACE = "surpriseReadingPlace";

/**
 * 同じページの中で別の場所へ飛ぶ（履歴を 1 つ積む）直前に、いまの履歴に「ここまで読んでいた」を書き添える。
 * 「戻る」でこの履歴へ来たら `placeInHistory` で読んで戻す。ブラウザが戻す位置は、飛んだ直後の位置のことがある
 * （読み進めたぶんを覚えていない）ので、こちらで控える。
 */
export function rememberPlaceInHistory(): void {
  const current = record(history.state) ?? {};
  history.replaceState({ ...current, [HISTORY_PLACE]: placeAt() }, "");
}

/** 履歴に書き添えた「ここまで読んでいた」。無ければ null。 */
export function placeInHistory(state: unknown): ReadingPlace | null {
  return readPlace(record(state)?.[HISTORY_PLACE]);
}

/** 控えを読んで消す（1 度だけ使う）。違う道筋・古すぎる・形が違うものは捨てる。 */
function takeCarried(): ReadingPlace | null {
  const raw = readSession(CARRY_KEY);
  if (raw === null || raw.length === 0) return null;
  writeSession(CARRY_KEY, "");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  const saved = record(parsed);
  if (saved === null || saved["path"] !== window.location.pathname) return null;
  const at = saved["at"];
  if (typeof at !== "number" || Date.now() - at > CARRY_LIFE_MS) return null;
  if (saved["reason"] === "leave" && !reopenedHere()) return null;
  return readPlace(saved["place"]);
}

/**
 * 開き直したページで、控えた所へ戻す（道具箱の立ち上げで 1 度だけ呼ぶ）。
 * 画像が届いて本文の高さが決まってから合わせる。それまでに読む人が自分で送ったら、戻さない
 * （あとから引き戻すと、読み始めた所を奪う）。
 */
export function restoreCarriedPlace(options: { ready?: Promise<unknown> } = {}): void {
  const place = takeCarried();
  // スライドの枚は `#N` が持ち、実行部（src/templates/deck.html）が送る。段落の控えで送り直すと、
  // 別の段落（次の枚のノート）を拾って 1 枚先へずれる
  if (place === null || document.body.hasAttribute(DECK_MARK)) return;
  // ブラウザが前の画素へ戻すのは読み込みが終わったあと（こちらの戻しより後のことがある）。今回だけ止めて、こちらが戻す
  const restoration = history.scrollRestoration;
  history.scrollRestoration = "manual";
  let moved = false;
  const release = onReaderScroll(window, () => { moved = true; });
  const settle = (): void => {
    window.requestAnimationFrame(() => {
      release();
      history.scrollRestoration = restoration;
      if (moved || !scrollToPlace(place)) return;
      // 開いた直後は、道具箱の板が本文を押しのけるなど、本文の組みがまだ動く。しばらくは戻した所を保つ
      const spot = spotHere();
      // 保つ高さは読む線そのもの（毎フレーム測り直す）。上端の帯（現在地の行など）が戻したあとに出ると読む線が下がるので、
      // 戻した時点の高さに留めると、読んでいた段落の頭が帯の下に隠れる（WebKit で帯が戻しより後に出た）
      if (spot !== null) hold(spot, () => readingLine(), RESTORE_HOLD_MS, false);
    });
  };
  if (options.ready !== undefined) void options.ready.then(settle);
  else if (document.readyState === "complete") settle();
  else window.addEventListener("load", settle, { once: true });
}

