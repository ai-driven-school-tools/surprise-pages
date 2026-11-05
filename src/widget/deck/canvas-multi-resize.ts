/**
 * 複数を選んで、選んだ範囲の角を引いて大きさを変える（Keynote と同じ動き）。
 * 反対の角を止め、全部を同じ比で大きく・小さくし、互いの位置関係も保つ。要素は 1 つだけの大きさ変え
 * （./canvas.ts の resize）と同じく `scale` と `transform-origin: 0 0` と `translate` で表す。
 * 前半は描かずに確かめられる計算、後半はキャンバスが呼ぶ持ち手・引いている途中・保存の操作。座標はすべて枚の px（1280×720）。
 */
import { DECK_CANVAS } from "../../lib/deck/deck";
import { DECK_NODE_MARK, type DeckEditOperation } from "../../lib/deck/edit/model";
import { translateBy, type CanvasPoint } from "./canvas-geometry";

/** 見えている範囲（枚の px）と、いまの scale・transform-origin（要素の中の px）。 */
export type ScalePart = { left: number; top: number; width: number; height: number; scale: number; origin: CanvasPoint };
/** 引く角。x・y は -1 が左・上、1 が右・下。 */
export type ScaleCorner = { x: -1 | 1; y: -1 | 1 };
export type ScaleBox = { left: number; top: number; right: number; bottom: number };

/** 角の並び（持ち手を出す順）。 */
export const SCALE_CORNERS = { nw: { x: -1, y: -1 }, ne: { x: 1, y: -1 }, se: { x: 1, y: 1 }, sw: { x: -1, y: 1 } } as const satisfies Record<string, ScaleCorner>;

/** 持ち手を並べるだけの見えない枠（選んだ物それぞれに枠が出ているので、範囲に線は足さない）。持ち手の見た目は図形と同じ `.grip`。 */
export const SCALE_FRAME_CSS = `
.scale-frame { position: fixed; pointer-events: none; }
`;

const round = (value: number) => Math.round(value * 1000) / 1000;

/** 選んだ物を全部合わせた範囲。 */
export function selectionBox(parts: readonly { left: number; top: number; width: number; height: number }[]): ScaleBox {
  return { left: Math.min(...parts.map((part) => part.left)), top: Math.min(...parts.map((part) => part.top)), right: Math.max(...parts.map((part) => part.left + part.width)), bottom: Math.max(...parts.map((part) => part.top + part.height)) };
}

/** 止める角（引く角の反対）。 */
export function scaleAnchor(box: ScaleBox, corner: ScaleCorner): CanvasPoint {
  return { x: corner.x > 0 ? box.left : box.right, y: corner.y > 0 ? box.top : box.bottom };
}

/** 角を `delta` だけ引いたときの比。縦と横の伸びのうち大きく動いた方に合わせ、短い辺が `minimum` を下回らない。 */
export function scaleFactor(box: ScaleBox, corner: ScaleCorner, delta: CanvasPoint, minimum = 16): number {
  const width = box.right - box.left, height = box.bottom - box.top;
  if (width <= 0 || height <= 0) return 1;
  const along = { x: (width + corner.x * delta.x) / width, y: (height + corner.y * delta.y) / height };
  const ratio = Math.abs(along.x - 1) >= Math.abs(along.y - 1) ? along.x : along.y;
  return Math.max(ratio, Math.min(minimum, width) / width, Math.min(minimum, height) / height);
}

/**
 * それぞれの要素の translate に足すずらしと、新しい scale（transform-origin は 0 0 にする）。
 * 見えている左上は「止める角 + 比 ×（元の左上 − 止める角）」へ動く。原点を 0 0 に変えると、元の原点 O と scale s が
 * 見た目の左上に足していた O × (1 − s) が消えるので、その分もずらしに足す。
 */
export function scaleParts(parts: readonly ScalePart[], anchor: CanvasPoint, factor: number): { shift: CanvasPoint; scale: number }[] {
  return parts.map((part) => ({
    shift: {
      x: round(anchor.x + factor * (part.left - anchor.x) - part.left + part.origin.x * (1 - part.scale)),
      y: round(anchor.y + factor * (part.top - anchor.y) - part.top + part.origin.y * (1 - part.scale)),
    },
    scale: round(part.scale * factor),
  }));
}

const KEYWORDS: Record<string, number> = { left: 0, top: 0, center: 50, right: 100, bottom: 100 };

/** 計算済みの transform-origin（px・%・left などの語）を、要素の中の px に直す。`size` は scale をかける前の大きさ。書いていなければ中央。 */
export function transformOriginPoint(value: string, size: { width: number; height: number }): CanvasPoint {
  let [first = "center", second = "center"] = value.trim().split(/\s+/).filter(Boolean);
  if (first === "top" || first === "bottom" || second === "left" || second === "right") [first, second] = [second, first]; // 「top left」は縦が先
  const read = (token: string, length: number) => token in KEYWORDS ? KEYWORDS[token] / 100 * length : token.endsWith("%") ? Number.parseFloat(token) / 100 * length : Number.parseFloat(token) || 0;
  return { x: read(first, size.width), y: read(second, size.height) };
}

/** 角を押したときの元の形。`items` はキャンバスの引く物の並び（translate の元）、ほかは同じ並びの scale・transform-origin の元。 */
export type SelectionScaling = { corner: ScaleCorner; anchor: CanvasPoint; box: ScaleBox; parts: ScalePart[]; scales: (string | null)[]; origins: (string | null)[] };
export type ScaleItem = { node: HTMLElement; before: string | null; translation: string };
type ScaleRead = { view: Window; scale: (node: HTMLElement) => number; original: (node: HTMLElement, property: string) => string | null };

/** 選んだ物の角を押したときに、それぞれの見えている範囲（枚の px）と元の値を読む。 */
export function beginSelectionScale(nodes: readonly HTMLElement[], stage: DOMRect, corner: ScaleCorner, read: ScaleRead): { items: ScaleItem[]; scaling: SelectionScaling } {
  const ratio = DECK_CANVAS.width / stage.width;
  const parts = nodes.map((node): ScalePart => {
    const rect = node.getBoundingClientRect(), scale = read.scale(node), size = { width: rect.width * ratio / scale, height: rect.height * ratio / scale };
    return { left: (rect.left - stage.left) * ratio, top: (rect.top - stage.top) * ratio, width: rect.width * ratio, height: rect.height * ratio, scale, origin: transformOriginPoint(read.view.getComputedStyle(node).transformOrigin, size) };
  });
  const box = selectionBox(parts);
  return {
    items: nodes.map((node) => ({ node, before: read.original(node, "translate"), translation: read.view.getComputedStyle(node).translate })),
    scaling: { corner, anchor: scaleAnchor(box, corner), box, parts, scales: nodes.map((node) => read.original(node, "scale")), origins: nodes.map((node) => read.original(node, "transform-origin")) },
  };
}

/** 角を `delta` だけ引いた形を書く（保存はしない）。ずらさない物は translate を元のままにして、操作を足さない。 */
export function applySelectionScale(scaling: SelectionScaling, items: readonly ScaleItem[], delta: CanvasPoint, write: (node: HTMLElement, property: string, value: string | null) => void): void {
  scaleParts(scaling.parts, scaling.anchor, scaleFactor(scaling.box, scaling.corner, delta)).forEach((next, index) => {
    const item = items[index]; if (!item) return;
    write(item.node, "transform-origin", "0 0"); write(item.node, "scale", String(next.scale));
    write(item.node, "translate", next.shift.x || next.shift.y ? translateBy(item.translation, next.shift) : item.before);
  });
}

/** 離したときに保存する操作。全員の分を 1 回のまとまりにする（取り消し 1 回で戻る）。変わらない値は入れない。 */
export function selectionScaleOperations(scaling: SelectionScaling, items: readonly ScaleItem[]): DeckEditOperation[] {
  return items.flatMap((item, index): DeckEditOperation[] => {
    const target = item.node.getAttribute(DECK_NODE_MARK) ?? "", now = (property: string) => item.node.style.getPropertyValue(property) || null;
    return [
      { kind: "style", target, property: "transform-origin", before: scaling.origins[index] ?? null, after: "0 0" },
      { kind: "style", target, property: "scale", before: scaling.scales[index] ?? null, after: now("scale") },
      { kind: "style", target, property: "translate", before: item.before, after: now("translate") },
    ];
  }).filter((operation) => operation.kind !== "style" || operation.before !== operation.after);
}

/** 選んだ範囲（画面の px）の 4 つの角に持ち手を置く。`make` はキャンバスのボタン、`press` は角を押したとき。 */
export function drawScaleGrips(boxes: HTMLElement, rect: ScaleBox, make: () => HTMLButtonElement, label: string, press: (event: PointerEvent, corner: ScaleCorner) => void): void {
  const frame = boxes.ownerDocument.createElement("div"); frame.className = "scale-frame";
  Object.assign(frame.style, { left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.right - rect.left}px`, height: `${rect.bottom - rect.top}px` });
  for (const [name, corner] of Object.entries(SCALE_CORNERS)) {
    const grip = make(); grip.className = "grip"; grip.dataset.selectionGrip = name; grip.setAttribute("aria-label", label);
    Object.assign(grip.style, { left: `${(corner.x + 1) * 50}%`, top: `${(corner.y + 1) * 50}%`, cursor: corner.x === corner.y ? "nwse-resize" : "nesw-resize" });
    grip.addEventListener("pointerdown", (event) => press(event, corner));
    frame.append(grip);
  }
  boxes.append(frame);
}
