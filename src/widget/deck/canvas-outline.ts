/**
 * スライドの編集画面で、押す前と押した後に「どこが選ばれるか」を見せる枠。
 * - 乗せたとき: 押したら選ばれる範囲（要素か、グループなら全体）に強調色を半分に薄めた 1px の線（.hover）
 * - グループ（`data-deck-group="true"` の包み）を選んだとき: 全体を少し外へずらした選択の枠と、中の要素ごとに乗せたときと同じ細い線（.part）
 *   前は中の要素ごとに選択の枠が出て、1 つずつ選んだのかグループを選んだのか見分けられなかった。
 * 包み（display:contents）は自分の箱を持たないので、範囲は中の要素を合わせて求める。
 */
export const CANVAS_OUTLINE_CSS = `
.part { position: fixed; box-shadow: 0 0 0 var(--rule-thin) color-mix(in srgb, var(--accent) 50%, transparent); pointer-events: none; }
`;

export type OutlineRect = { left: number; top: number; width: number; height: number };

/** 要素の見えている範囲。包み（display:contents）は自分の箱を持たないので、中の要素（入れ子の包みも中まで）を合わせた範囲。 */
export function outlineRect(node: Element): OutlineRect {
  const own = node.getBoundingClientRect();
  if (own.width || own.height || !node.children.length) return { left: own.left, top: own.top, width: own.width, height: own.height };
  return unionRect([...node.children].map(outlineRect)) ?? { left: own.left, top: own.top, width: own.width, height: own.height };
}

/** 見えている範囲を合わせた範囲（見えている物が無ければ null）。 */
export function unionRect(rects: readonly OutlineRect[]): OutlineRect | null {
  const seen = rects.filter((rect) => rect.width || rect.height);
  if (!seen.length) return null;
  const left = Math.min(...seen.map((rect) => rect.left)), top = Math.min(...seen.map((rect) => rect.top));
  return { left, top, width: Math.max(...seen.map((rect) => rect.left + rect.width)) - left, height: Math.max(...seen.map((rect) => rect.top + rect.height)) - top };
}

/** 枠を 1 つ置く。`grow` は外へずらす量（px）。 */
export function placeOutline(doc: Document, boxes: HTMLElement, className: string, rect: OutlineRect, grow = 0): HTMLDivElement {
  const box = doc.createElement("div"); box.className = className;
  Object.assign(box.style, { left: `${rect.left - grow}px`, top: `${rect.top - grow}px`, width: `${rect.width + grow * 2}px`, height: `${rect.height + grow * 2}px` });
  boxes.append(box);
  return box;
}

/** 選んだグループ: 中の要素ごとに細い線、全体を囲む選択の枠（少し外へ）。 */
export function drawGroupOutline(doc: Document, boxes: HTMLElement, members: readonly Element[]): void {
  const rects = members.map(outlineRect);
  for (const rect of rects) placeOutline(doc, boxes, "part", rect);
  const all = unionRect(rects);
  if (all) placeOutline(doc, boxes, "box", all, 4);
}
