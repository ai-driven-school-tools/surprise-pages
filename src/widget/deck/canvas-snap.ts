/**
 * スライドの編集画面で、動かす・大きさを変えるときの吸い付き（配置ガイド）。
 * - 動かしている箱の端・中央が、スライドの端・中央、ほかの部品の端・中央に近づいたら、そこへ合わせる
 * - 大きさを変えるときは、引いている辺を同じ線に合わせ、幅・高さがほかの部品と近ければ同じ大きさにする（相手を枠で示す）
 *   両方が近いときは同じ大きさを先にする（同じ大きさの部品にそろえ直せるように）
 * - 合わせた線は、何に合わせたかで描き分ける。スライドの端・中央はスライドいっぱいの破線、
 *   ほかの部品の端・中央は動かしている部品と相手をつなぐ長さの実線にし、相手を枠で示す
 * 値は画面の px で受け取り、画面の px で返す（近さの 5px は画面の上の距離）。⌥ を押している間は合わせない（呼ぶ側）。
 */
import { DECK_CANVAS, DECK_SLIDE } from "../../lib/deck/deck";
import { DECK_NODE_MARK } from "../../lib/deck/edit/model";

export type SnapBox = { left: number; top: number; width: number; height: number };
/** 合わせる先。xs・ys はスライドとほかの部品の端・中央の線、boxes は同じ大きさにそろえる相手、stage・peers は線の持ち主を引くための元の箱。 */
export type SnapTargets = { xs: number[]; ys: number[]; boxes: SnapBox[]; stage: SnapBox; peers: SnapBox[] };
/** 描く線。slide はスライドの端・中央（スライドいっぱいの破線）、part はほかの部品の端・中央（自分と相手をつなぐ実線）。from・to は線の両端。 */
export type SnapLine = { axis: "x" | "y"; at: number; kind: "slide" | "part"; from: number; to: number };
/** 描くもの。x・y は合わせた位置、lines は描く線、refs は線を合わせた相手、same は同じ大きさにそろえた相手。 */
export type SnapGuides = { x?: number; y?: number; lines?: SnapLine[]; refs?: SnapBox[]; same: SnapBox[] };
/** 辺の向き（-1 左・上、1 右・下、0 その軸は引かない）。 */
export type SnapSides = { x: -1 | 0 | 1; y: -1 | 0 | 1 };

export const SNAP_DISTANCE = 5;

const box = (rect: SnapBox): SnapBox => ({ left: rect.left, top: rect.top, width: rect.width, height: rect.height }); // DOMRect は広げると値が消えるので項目を書き出す

/** スライドの箱と、ほかの部品の箱から、合わせる先を作る。 */
export function snapTargets(stage: SnapBox, peers: readonly SnapBox[]): SnapTargets {
  const xs = [stage.left, stage.left + stage.width / 2, stage.left + stage.width], ys = [stage.top, stage.top + stage.height / 2, stage.top + stage.height];
  for (const peer of peers) { xs.push(peer.left, peer.left + peer.width / 2, peer.left + peer.width); ys.push(peer.top, peer.top + peer.height / 2, peer.top + peer.height); }
  return { xs, ys, boxes: peers.filter((peer) => peer.width > 0 && peer.height > 0), stage: box(stage), peers: peers.map(box) };
}

const marks = (one: SnapBox, axis: "x" | "y") => axis === "x" ? [one.left, one.left + one.width / 2, one.left + one.width] : [one.top, one.top + one.height / 2, one.top + one.height];
const along = (one: SnapBox, axis: "x" | "y") => axis === "x" ? [one.top, one.top + one.height] : [one.left, one.left + one.width];

/** 位置 at に合わせた線を、その位置に端か中央が乗るもの（スライド・ほかの部品）ごとに作る。self は合わせたあとの自分の箱。 */
export function snapLines(axis: "x" | "y", at: number, self: SnapBox, targets: SnapTargets): { lines: SnapLine[]; refs: SnapBox[] } {
  const on = (one: SnapBox) => marks(one, axis).some((mark) => Math.abs(mark - at) < 0.5);
  const refs = targets.peers.filter(on), lines: SnapLine[] = [];
  if (on(targets.stage)) { const [from, to] = along(targets.stage, axis); lines.push({ axis, at, kind: "slide", from, to }); }
  if (refs.length) { const spans = [self, ...refs].flatMap((one) => along(one, axis)); lines.push({ axis, at, kind: "part", from: Math.min(...spans), to: Math.max(...spans) }); }
  return { lines, refs };
}

/** 合わせた位置（x・y）から、描く線と相手を足す。 */
function withLines(guides: SnapGuides, self: SnapBox, targets: SnapTargets): SnapGuides {
  const found = (["x", "y"] as const).flatMap((axis) => { const at = guides[axis]; return at === undefined ? [] : [snapLines(axis, at, self, targets)]; });
  const lines = found.flatMap((one) => one.lines), refs = [...new Set(found.flatMap((one) => one.refs))];
  return { ...guides, ...(lines.length ? { lines } : {}), ...(refs.length ? { refs } : {}) };
}

/** 動かすとき。箱の端・中央を、いちばん近い線に軸ごとに合わせる。lock は残した向き（もう一方の軸は合わせない）。値は画面の px。 */
export function snapMove(rect: SnapBox, targets: SnapTargets, lock: "x" | "y" | null = null): { dx: number; dy: number; guides: SnapGuides } {
  const pick = (axis: "x" | "y") => {
    let best: { to: number; delta: number } | null = null;
    for (const to of axis === "x" ? targets.xs : targets.ys) for (const from of marks(rect, axis)) { const delta = to - from; if (Math.abs(delta) < SNAP_DISTANCE && (!best || Math.abs(delta) < Math.abs(best.delta))) best = { to, delta }; }
    return best;
  };
  const x = lock === "y" ? null : pick("x"), y = lock === "x" ? null : pick("y");
  const dx = x?.delta ?? 0, dy = y?.delta ?? 0, moved = { left: rect.left + dx, top: rect.top + dy, width: rect.width, height: rect.height };
  return { dx, dy, guides: withLines({ ...(x ? { x: x.to } : {}), ...(y ? { y: y.to } : {}), same: [] }, moved, targets) };
}

type Pick = { distance: number; box: SnapBox; guides: SnapGuides };

function nearest(value: number, candidates: readonly number[]): { to: number; distance: number } | null {
  let best: { to: number; distance: number } | null = null;
  for (const to of candidates) { const distance = Math.abs(to - value); if (distance < SNAP_DISTANCE && (!best || distance < best.distance)) best = { to, distance }; }
  return best;
}
const sameAs = (targets: SnapTargets, axis: "width" | "height", value: number) => targets.boxes.filter((one) => Math.abs(one[axis] - value) < 0.5);
const closest = (picks: readonly (Pick | null)[]): Pick | null => picks.reduce<Pick | null>((best, pick) => pick && (!best || pick.distance < best.distance) ? pick : best, null);

/** 角で縦横の比を保って大きさを変えるとき（画像・動画）。左上は止まったまま、いちばん近い 1 つに合わせる。 */
export function snapScaled(rect: SnapBox, targets: SnapTargets): { box: SnapBox; guides: SnapGuides } {
  if (!(rect.width > 0 && rect.height > 0)) return { box: rect, guides: { same: [] } };
  const ratio = rect.width / rect.height, sized = (width: number): SnapBox => ({ ...rect, width, height: width / ratio });
  const right = nearest(rect.left + rect.width, targets.xs), bottom = nearest(rect.top + rect.height, targets.ys);
  const width = nearest(rect.width, targets.boxes.map((one) => one.width)), height = nearest(rect.height, targets.boxes.map((one) => one.height));
  const pick = closest([
    width && { distance: width.distance, box: sized(width.to), guides: { same: sameAs(targets, "width", width.to) } },
    height && { distance: height.distance, box: sized(height.to * ratio), guides: { same: sameAs(targets, "height", height.to) } },
  ]) ?? closest([
    right && { distance: right.distance, box: sized(right.to - rect.left), guides: { x: right.to, same: [] } },
    bottom && { distance: bottom.distance, box: sized((bottom.to - rect.top) * ratio), guides: { y: bottom.to, same: [] } },
  ]);
  return pick ? { box: pick.box, guides: withLines(pick.guides, pick.box, targets) } : { box: rect, guides: { same: [] } };
}

/** 1 つの軸で、引いている辺を合わせる。反対の辺は止まったまま。 */
function snapAxis(start: number, size: number, side: -1 | 0 | 1, lines: readonly number[], sizes: readonly number[]): { start: number; size: number; line?: number; same?: number } | null {
  if (!side) return null;
  const end = start + size, edge = nearest(side > 0 ? end : start, lines), equal = nearest(size, sizes);
  if (edge && !equal) return side > 0 ? { start, size: edge.to - start, line: edge.to } : { start: edge.to, size: end - edge.to, line: edge.to };
  if (equal) return side > 0 ? { start, size: equal.to, same: equal.to } : { start: end - equal.to, size: equal.to, same: equal.to };
  return null;
}

/** 辺ごとに大きさを変えるとき（図形）。引いている辺だけを、軸ごとに合わせる。 */
export function snapEdges(rect: SnapBox, sides: SnapSides, targets: SnapTargets): { box: SnapBox; guides: SnapGuides } {
  const x = snapAxis(rect.left, rect.width, sides.x, targets.xs, targets.boxes.map((one) => one.width));
  const y = snapAxis(rect.top, rect.height, sides.y, targets.ys, targets.boxes.map((one) => one.height));
  const same = [...(x?.same === undefined ? [] : sameAs(targets, "width", x.same)), ...(y?.same === undefined ? [] : sameAs(targets, "height", y.same))];
  const next = { left: x?.start ?? rect.left, top: y?.start ?? rect.top, width: x?.size ?? rect.width, height: y?.size ?? rect.height };
  return { box: next, guides: withLines({ ...(x?.line === undefined ? {} : { x: x.line }), ...(y?.line === undefined ? {} : { y: y.line }), same: [...new Set(same)] }, next, targets) };
}

/** 合わせた線と、合わせた相手・同じ大きさにそろえた相手の枠（キャンバスの Shadow Root に足す）。
 * 線は強調色に地の色の縁。スライドの線は破線、部品の線は実線。 */
export const CANVAS_SNAP_CSS = `
.same { position: fixed; box-shadow: 0 0 0 var(--rule-thin) var(--accent); pointer-events: none; }
.snap-line { position: fixed; pointer-events: none; box-shadow: 0 0 0 var(--rule-thin) color-mix(in srgb, var(--surface) 70%, transparent); }
.snap-line.part.x { width: var(--rule-thin); background: var(--accent); }
.snap-line.part.y { height: var(--rule-thin); background: var(--accent); }
.snap-line.slide.x { width: 0; border-left: var(--rule-thin) dashed var(--accent); }
.snap-line.slide.y { height: 0; border-top: var(--rule-thin) dashed var(--accent); }
`;

/** 要素の合わせる先（スライドと、その要素たちを含まない・含まれないほかの部品）。スライドの外なら null。 */
export function partTargets(nodes: readonly Element[]): SnapTargets | null {
  const slide = nodes[0]?.closest(`[${DECK_SLIDE}]`);
  if (!slide) return null;
  const peers = [...slide.querySelectorAll(`[${DECK_NODE_MARK}]`)]
    .filter((peer) => !nodes.some((node) => peer === node || node.contains(peer) || peer.contains(node)))
    .map((peer) => peer.getBoundingClientRect()).filter((rect) => rect.width > 0);
  return snapTargets(slide.getBoundingClientRect(), peers);
}

/** 角で比を保って大きさを変える要素（左上は止まったまま）の幅（枚の px）。size は枚の px、snap が false（⌥）なら合わせない。 */
export function snapScaledPart(node: Element, slide: Element, size: { width: number; height: number }, snap: boolean): { width: number; guides: Partial<SnapGuides> } {
  const targets = snap ? partTargets([node]) : null;
  if (!targets) return { width: size.width, guides: {} };
  const rect = node.getBoundingClientRect(), k = slide.getBoundingClientRect().width / DECK_CANVAS.width;
  const snapped = snapScaled({ left: rect.left, top: rect.top, width: size.width * k, height: size.height * k }, targets);
  return { width: snapped.box.width / k, guides: snapped.guides };
}

/** 合わせた線（スライドは破線・部品は実線）と、合わせた相手・同じ大きさにそろえた相手の枠を描く。 */
export function drawSnapGuides(doc: Document, boxes: HTMLElement, guides: Partial<SnapGuides>): void {
  for (const line of [...(guides.lines ?? [])].sort((a, b) => a.kind === b.kind ? 0 : a.kind === "slide" ? -1 : 1)) { // 重なったら部品の実線を上に
    const guide = doc.createElement("div"); guide.className = `snap-line ${line.kind} ${line.axis}`;
    Object.assign(guide.style, line.axis === "x" ? { left: `${line.at}px`, top: `${line.from}px`, height: `${line.to - line.from}px` } : { top: `${line.at}px`, left: `${line.from}px`, width: `${line.to - line.from}px` });
    boxes.append(guide);
  }
  for (const one of new Set([...(guides.refs ?? []), ...(guides.same ?? [])])) {
    const same = doc.createElement("div"); same.className = "same";
    Object.assign(same.style, { left: `${one.left}px`, top: `${one.top}px`, width: `${one.width}px`, height: `${one.height}px` });
    boxes.append(same);
  }
}
