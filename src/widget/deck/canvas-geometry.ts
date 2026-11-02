import { DECK_CANVAS } from "../../lib/deck/deck";

export type CanvasPoint = { x: number; y: number };
export type CanvasSize = { width: number; height: number };

/** Pointer coordinates are viewport pixels; document operations use original slide pixels. */
export function canvasDelta(delta: CanvasPoint, displayedWidth: number): CanvasPoint | null {
  if (!Number.isFinite(displayedWidth) || displayedWidth <= 0) return null;
  const scale = DECK_CANVAS.width / displayedWidth;
  return { x: delta.x * scale, y: delta.y * scale };
}

export function movePoints(points: readonly CanvasPoint[], delta: CanvasPoint): CanvasPoint[] {
  return points.map((point) => ({ x: point.x + delta.x, y: point.y + delta.y }));
}

export function resizeBox(size: CanvasSize, delta: CanvasPoint, keepAspect: boolean): CanvasSize {
  const minimum = 16;
  if (!keepAspect) return { width: Math.max(minimum, size.width + delta.x), height: Math.max(minimum, size.height + delta.y) };
  if (size.width <= 0 || size.height <= 0) return { width: minimum, height: minimum };
  const movement = Math.abs(delta.x / size.width) >= Math.abs(delta.y / size.height)
    ? delta.x / size.width : delta.y / size.height;
  const ratio = Math.max(1 + movement, minimum / size.width, minimum / size.height);
  return { width: size.width * ratio, height: size.height * ratio };
}

export function cropPosition(point: CanvasPoint): CanvasPoint {
  return { x: Math.min(100, Math.max(0, point.x)), y: Math.min(100, Math.max(0, point.y)) };
}

/** In cover mode, percentage positions travel only across the clipped part of the image. */
export function dragCropPosition(position: CanvasPoint, delta: CanvasPoint, box: CanvasSize, image: CanvasSize): CanvasPoint {
  if (image.width <= 0 || image.height <= 0) return position;
  const scale = Math.max(box.width / image.width, box.height / image.height);
  const overflowX = Math.max(0, image.width * scale - box.width);
  const overflowY = Math.max(0, image.height * scale - box.height);
  return cropPosition({
    x: overflowX > 0 ? position.x - delta.x / overflowX * 100 : position.x,
    y: overflowY > 0 ? position.y - delta.y / overflowY * 100 : position.y,
  });
}

/** Keep percentages and CSS calculations in their original coordinate system. */
export function translateBy(value: string, delta: CanvasPoint): string {
  const parts: string[] = [];
  let part = "", depth = 0;
  for (const character of value) {
    if (character === "(") depth++;
    if (character === ")") depth--;
    if (/\s/.test(character) && depth === 0) { if (part) parts.push(part); part = ""; }
    else part += character;
  }
  if (part) parts.push(part);
  function add(component: string | undefined, movement: number): string {
    const original = !component || component === "none" ? "0px" : component;
    if (/^-?[\d.]+(?:px)?$/.test(original)) return `${Number.parseFloat(original) + movement}px`;
    if (!movement) return original;
    return `calc(${original} ${movement < 0 ? "-" : "+"} ${Math.abs(movement)}px)`;
  }
  return `${add(parts[0], delta.x)} ${add(parts[1], delta.y)}${parts[2] ? ` ${parts[2]}` : ""}`;
}

/** Move a clipping window without changing its size or crossing the original image edges. */
export function moveCropWindow(insets: readonly number[], deltaPercent: CanvasPoint): number[] {
  const [top, right, bottom, left] = insets;
  const x = Math.max(-left, Math.min(right, deltaPercent.x));
  const y = Math.max(-top, Math.min(bottom, deltaPercent.y));
  return [top + y, right - x, bottom - y, left + x];
}
