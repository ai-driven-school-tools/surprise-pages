/**
 * スライドの編集画面の「前面へ」「背面へ」の段取り（右の欄・右クリックのメニューから呼ぶ）。
 * 選んだ要素に z-index を足すだけでは、動かした箱（translate）の中の要素は箱の外へ出られず、背面へは 0 で止まって何も変わらない。
 * 重なっている相手ごとに、両方を含むいちばん近い共通の箱の直下の 2 つ（同じ重なりの土俵にいる箱）で順番を決める。
 * 前面へは選んだ側を、背面へは相手側を、相手の中でいちばん上に描かれるものより 1 つ上へ出す。描く・保存するのは呼ぶ側。
 */
import { DECK_NODE_MARK, type DeckEditOperation } from "../../../lib/deck/edit/model";
import type { LayerStyle } from "./layer-tree";

export type LayerBox = {
  id: string;
  /** スライドの中で、いちばん近い編集できる祖先。スライドそのものは null */
  parentId: string | null;
  /** 書いてある z-index（auto は null） */
  z: number | null;
  /** z-index が効く並び（position が static でない・flex か grid の子） */
  applies: boolean;
  /** 中身の重なりを自分の中で閉じる（z-index が効いて値がある・transform や translate・不透明度・isolation） */
  context: boolean;
  rect: { left: number; top: number; right: number; bottom: number };
};

const overlaps = (a: LayerBox["rect"], b: LayerBox["rect"]) =>
  Math.min(a.right, b.right) > Math.max(a.left, b.left) && Math.min(a.bottom, b.bottom) > Math.max(a.top, b.top);

export function planLayerOrder(boxes: readonly LayerBox[], selected: readonly string[], direction: "front" | "back"): LayerStyle[] {
  const byId = new Map(boxes.map((box) => [box.id, { ...box }]));
  const children = new Map<string, string[]>();
  for (const box of boxes) if (box.parentId) children.set(box.parentId, [...(children.get(box.parentId) ?? []), box.id]);
  const chain = (id: string) => {
    const out: string[] = [];
    for (let at: string | null = id; at && byId.has(at) && !out.includes(at); at = byId.get(at)?.parentId ?? null) out.unshift(at);
    return out;
  };
  /** その箱が、外の土俵でいちばん上に描く高さ。閉じた箱は自分の値、閉じていなければ中身のいちばん上 */
  const level = (id: string): number => {
    const box = byId.get(id);
    if (!box) return 0;
    if (box.context) return box.applies ? box.z ?? 0 : 0;
    const own = box.applies && box.z !== null ? box.z : 0;
    return Math.max(own, ...(children.get(id) ?? []).map(level));
  };
  const changed = new Map<string, { z?: string; position?: string }>();
  const raise = (id: string, over: string) => {
    const box = byId.get(id);
    if (!box) return;
    const target = level(over) + 1;
    if (box.context && box.applies && (box.z ?? 0) >= target) return;
    const entry = changed.get(id) ?? {};
    if (!box.applies) {
      entry.position = "relative";
      box.applies = true;
    }
    box.z = target;
    box.context = true;
    entry.z = String(target);
    changed.set(id, entry);
  };
  const leaves = boxes.filter((box) => box.parentId && !children.has(box.id));
  for (const id of selected) {
    const mine = byId.get(id);
    if (!mine) continue;
    const own = chain(id);
    for (const other of leaves) {
      const theirs = chain(other.id);
      if (theirs.includes(id) || own.includes(other.id) || !overlaps(mine.rect, other.rect)) continue;
      let split = 0;
      while (own[split] !== undefined && own[split] === theirs[split]) split++;
      const [a, b] = [own[split], theirs[split]];
      if (!a || !b || split === 0) continue;
      if (direction === "front") raise(a, b);
      else raise(b, a);
    }
  }
  return [...changed].flatMap(([id, entry]) => [
    ...(entry.position ? [{ id, property: "position" as const, value: entry.position }] : []),
    ...(entry.z ? [{ id, property: "z-index" as const, value: entry.z }] : []),
  ]);
}

/** 描いたスライドから、編集できる要素の重なりの様子を読む */
export function readLayerBoxes(slide: Element): LayerBox[] {
  const view = slide.ownerDocument.defaultView;
  if (!view) return [];
  const nodes = [slide, ...slide.querySelectorAll(`[${DECK_NODE_MARK}]`)].filter((node) => node.hasAttribute(DECK_NODE_MARK));
  return nodes.map((node) => {
    const css = view.getComputedStyle(node);
    const parent = node === slide ? null : node.parentElement?.closest(`[${DECK_NODE_MARK}]`);
    const parentCss = node.parentElement ? view.getComputedStyle(node.parentElement) : null;
    const applies = css.position !== "static" || /flex|grid/.test(parentCss?.display ?? "");
    const z = css.zIndex === "auto" ? null : Number(css.zIndex);
    const rect = node.getBoundingClientRect();
    return {
      id: node.getAttribute(DECK_NODE_MARK) ?? "",
      parentId: parent && slide.contains(parent) ? parent.getAttribute(DECK_NODE_MARK) : null,
      z,
      applies,
      context: node === slide || (applies && z !== null) || css.transform !== "none" || css.translate !== "none" || css.scale !== "none" || Number(css.opacity) < 1 || css.isolation === "isolate",
      rect: { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom },
    };
  });
}

/**
 * 前面へ・背面へを 1 回の保存の操作にする（取り消し 1 回で戻る）。`before` は原稿の側の値。
 * 選んだ要素が重なっている相手が無いとき（並べ替えるものが無いとき）は空。
 */
export function layerOrderOperations(slide: Element, selected: readonly string[], direction: "front" | "back", before: (id: string, property: LayerStyle["property"]) => string | null | undefined): DeckEditOperation[] {
  return planLayerOrder(readLayerBoxes(slide), selected, direction).flatMap(({ id, property, value }): DeckEditOperation[] => {
    const current = before(id, property);
    return current === undefined ? [] : [{ kind: "style", target: id, property, before: current, after: value }];
  });
}
