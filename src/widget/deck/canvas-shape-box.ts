/**
 * スライドの編集画面で、図形（四角・丸・線・矢印）の大きさを変える 8 つの持ち手（Keynote・PowerPoint と同じ動き）。
 * - 4 つの角と 4 つの辺に持ち手を出し、引いた辺だけを動かす。反対の辺は止め、縦横は別々に変わる（細長くできる）。
 *   前は右下の 1 つだけで縦横同じ比の scale にしていたので、一方向にしか伸びず細長くできなかった。
 * - Shift を押している間は縦横の比を保つ。矢印キーでも 1px（Shift で 10px）ずつ変えられる。
 * - 大きさは width・height に書き、左・上の辺の動きは translate に足す。前に scale で大きくした図形は、見えている大きさを width・height に移して scale を外す。
 * 前半は描かずに確かめられる計算、後半はキャンバスが呼ぶ持ち手。座標は枚の px（1280×720）。
 */
import type { CanvasPoint, CanvasSize } from "./canvas-geometry";

/** 持ち手の向き（-1 左・上、1 右・下、0 その軸は引かない）。 */
export type ResizeHandle = { x: -1 | 0 | 1; y: -1 | 0 | 1 };

export const CANVAS_SHAPE_BOX_CSS = `
.grip { position: absolute; width: var(--size-control); height: var(--size-control); margin: calc(-.5 * var(--size-control)) 0 0 calc(-.5 * var(--size-control)); border: 0; padding: 0; background: transparent; pointer-events: auto; touch-action: none; }
.grip::after { content: ''; display: block; width: var(--size-grip); height: var(--size-grip); margin: auto; background: var(--surface); border: var(--rule-thin) solid var(--accent); }
`;

export const SHAPE_GRIPS = ["n", "ne", "e", "se", "s", "sw", "w", "nw"] as const;
export type ShapeGrip = (typeof SHAPE_GRIPS)[number];
export const GRIP_HANDLES: Record<ShapeGrip, ResizeHandle> = { n: { x: 0, y: -1 }, ne: { x: 1, y: -1 }, e: { x: 1, y: 0 }, se: { x: 1, y: 1 }, s: { x: 0, y: 1 }, sw: { x: -1, y: 1 }, w: { x: -1, y: 0 }, nw: { x: -1, y: -1 } };
const CURSOR: Record<ShapeGrip, string> = { n: "ns-resize", s: "ns-resize", e: "ew-resize", w: "ew-resize", ne: "nesw-resize", sw: "nesw-resize", nw: "nwse-resize", se: "nwse-resize" };

/**
 * 持ち手を `delta`（枚の px）動かしたときの大きさと、左上のずれ（左・上の辺を引いたときに translate へ足す分）。
 * 反対の辺は止まったまま。`keep` は縦横の比を保つ（角は大きく動いた方の比、辺はもう一方の軸も同じ比で変える）。短い辺は 16px で止める。
 */
export function resizeFromHandle(size: CanvasSize, handle: ResizeHandle, delta: CanvasPoint, keep: boolean): CanvasSize & { shift: CanvasPoint } {
  const minimum = 16;
  let width = handle.x ? size.width + handle.x * delta.x : size.width;
  let height = handle.y ? size.height + handle.y * delta.y : size.height;
  if (keep && size.width > 0 && size.height > 0) {
    const ratio = handle.x && handle.y
      ? (Math.abs(width / size.width - 1) >= Math.abs(height / size.height - 1) ? width / size.width : height / size.height)
      : handle.x ? width / size.width : height / size.height;
    const factor = Math.max(ratio, minimum / size.width, minimum / size.height);
    width = size.width * factor; height = size.height * factor;
  } else {
    width = Math.max(minimum, width); height = Math.max(minimum, height);
  }
  return { width, height, shift: { x: handle.x < 0 ? size.width - width : 0, y: handle.y < 0 ? size.height - height : 0 } };
}

/** 選んだ図形の枠に付ける持ち手。線のように一方の軸が細い図形は、その軸を引く持ち手を出さない（重なって押せない）。 */
export function shapeGrips(rect: { width: number; height: number }, make: () => HTMLButtonElement, label: string, press: (event: PointerEvent, grip: ShapeGrip) => void, key: (event: KeyboardEvent, grip: ShapeGrip) => void): HTMLButtonElement[] {
  const thin = { x: rect.width < 24, y: rect.height < 24 };
  const grips = SHAPE_GRIPS.filter((grip) => thin.x && thin.y ? grip === "se" : !(thin.x && GRIP_HANDLES[grip].x) && !(thin.y && GRIP_HANDLES[grip].y));
  return grips.map((grip) => {
    const handle = make(), { x, y } = GRIP_HANDLES[grip];
    handle.className = "grip"; handle.dataset.grip = grip; handle.setAttribute("aria-label", label);
    Object.assign(handle.style, { left: `${(x + 1) * 50}%`, top: `${(y + 1) * 50}%`, cursor: CURSOR[grip] });
    handle.addEventListener("pointerdown", (event) => press(event, grip));
    handle.addEventListener("keydown", (event) => key(event, grip));
    return handle;
  });
}
