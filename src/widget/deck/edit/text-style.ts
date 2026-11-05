/**
 * 文字の箱の中の選んだ字だけに見た目を付ける（太字・斜体・色・大きさ。Keynote と同じ）。
 * 選んだ字の位置は「箱の中の字を前から数えた番号」で言う。画面の箱と原稿の箱で同じ数え方をするので、
 * 画面で選んだ範囲を原稿の写しへそのまま当てられる。字の要素ごと選び直せるよう、囲む span にも data-deck-node を付ける。
 * 保存は箱の HTML の置き換え（既存の fragment の操作）1 つなので、取り消し・同期は今の操作のまま。
 */
import { DECK_NODE_MARK, type DeckEditStyleProperty } from "../../../lib/deck/edit/model";

/** 数える字。図・式・実行部の中の字は文字の箱の字ではないので数えない */
export function deckTexts(box: Node): Text[] {
  const doc = box.ownerDocument;
  if (!doc) return [];
  // 原稿の写しは DOMParser の文書なので、instanceof でなく種類の番号で見分ける
  const isText = (node: Node): node is Text => node.nodeType === 3;
  const walker = doc.createTreeWalker(box, 4), nodes: Text[] = [];
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (isText(node) && !node.parentElement?.closest("svg,math,script,style")) nodes.push(node);
  }
  return nodes;
}

/** 選んだ範囲を、箱の中の字の番号（はじめと終わり）にする。範囲が箱の外へ出ていれば null */
export function deckTextOffsets(box: Node, range: Range): { start: number; end: number } | null {
  if (!box.contains(range.startContainer) || !box.contains(range.endContainer)) return null;
  const nodes = deckTexts(box), doc = box.ownerDocument;
  if (!doc) return null;
  const at = (container: Node, offset: number): number => {
    const point = doc.createRange(); point.setStart(container, offset);
    let count = 0;
    for (const node of nodes) {
      if (node === container) return count + offset;
      if (point.comparePoint(node, 0) >= 0) return count; // この字は選んだ位置より後ろ
      count += node.data.length;
    }
    return count;
  };
  const start = at(range.startContainer, range.startOffset), end = at(range.endContainer, range.endOffset);
  return start < end ? { start, end } : null;
}

/** 字だけで中身が埋まっている span（前に囲んだもの）。同じ字をもう一度直すときは入れ子にせず、これに付け直す */
function wholeSpan(node: Text, box: HTMLElement): HTMLElement | null {
  const parent = node.parentElement;
  if (!parent || parent === box || parent.tagName !== "SPAN" || !parent.hasAttribute(DECK_NODE_MARK)) return null;
  return [...parent.childNodes].every((child) => child === node || child.nodeType === 8) ? parent : null;
}

/**
 * box（原稿の箱の写し）の start〜end の字に見た目を付けて、付けた要素の ID を返す。
 * 字の要素をまたぐ範囲は、またいだ所ごとに分けて囲む。並べ方のための空白だけの字は囲まない。
 */
export function styleDeckTextRange(box: HTMLElement, start: number, end: number, styles: readonly (readonly [DeckEditStyleProperty, string | null])[], uid: () => string): string[] {
  const pieces: { node: Text; from: number; to: number }[] = [];
  let count = 0;
  for (const node of deckTexts(box)) {
    const from = Math.max(start, count) - count, to = Math.min(end, count + node.data.length) - count;
    count += node.data.length;
    if (from < to && node.data.slice(from, to).trim()) pieces.push({ node, from, to });
  }
  return pieces.map(({ node, from, to }) => {
    let target = from === 0 && to === node.data.length ? wholeSpan(node, box) : null;
    if (!target) {
      const middle = from > 0 ? node.splitText(from) : node;
      if (to - from < middle.data.length) middle.splitText(to - from);
      target = box.ownerDocument.createElement("span");
      target.setAttribute(DECK_NODE_MARK, uid());
      middle.replaceWith(target);
      target.append(middle);
    }
    for (const [property, value] of styles) {
      if (value === null) target.style.removeProperty(property);
      else target.style.setProperty(property, value);
    }
    return target.getAttribute(DECK_NODE_MARK) ?? "";
  }).filter(Boolean);
}

/** 文字を直していて字を選んでいるときの範囲（箱の中の字の番号）。画面と原稿の字を突き合わせる字と、はじめの字に当たっている見た目も添える */
export function deckTextSelection(box: HTMLElement | null, range: Range | null) {
  const offsets = box && range ? deckTextOffsets(box, range) : null;
  if (!box || !range || !offsets) return null;
  const start = range.startContainer.nodeType === 3 && range.startContainer.parentElement ? range.startContainer.parentElement : box;
  return { id: box.getAttribute(DECK_NODE_MARK) ?? "", ...offsets, text: deckTexts(box).map((node) => node.data).join(""), style: box.ownerDocument.defaultView?.getComputedStyle(start) ?? null };
}
