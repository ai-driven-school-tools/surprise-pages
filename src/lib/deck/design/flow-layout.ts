/** A transient projection of the authored Mermaid source, never a saved document model. */
export type DeckFlowNode = { id: string; label: string; shape: "box" | "round" | "decision" };
export type DeckFlowEdge = { id: string; from: string; to: string; label: string };
export type DeckFlowGroup = { id: string; label: string; nodeIds: string[] };
export type DeckFlowGraph = { nodes: DeckFlowNode[]; edges: DeckFlowEdge[]; groups: DeckFlowGroup[]; direction?: "LR" | "RL" | "TB" | "BT" };
export type DeckFlowPoint = { x: number; y: number };
type Box = { x: number; y: number; width: number; height: number };
export type DeckFlowPlacedNode = DeckFlowNode & Box & { lines: string[]; detailLines: string[]; titleLineSlots: number; detailLineSlots: number };
export type DeckFlowPlacedEdge = DeckFlowEdge & { points: DeckFlowPoint[]; lines: string[]; labelX: number; labelY: number; labelWidth: number; labelHeight: number };
export type DeckFlowPlacedGroup = DeckFlowGroup & Box & { labelX: number; labelY: number };
export type DeckFlowLayout = { width: number; height: number; nodes: DeckFlowPlacedNode[]; edges: DeckFlowPlacedEdge[]; groups: DeckFlowPlacedGroup[]; typographic: boolean };
export type DeckFlowLayoutOptions = { width: number; height: number; measureText?: (text: string, fontSize: number) => number };

export const DECK_FLOW_METRICS = {
  nodeFontSize: 32, nodeLineHeight: 42, detailFontSize: 20, detailLineHeight: 28, detailGap: 8,
  edgeFontSize: 20, edgeLineHeight: 26, nodePaddingX: 24, nodePaddingY: 16,
  minNodeWidth: 176, maxNodeWidth: 264, minNodeHeight: 76,
  gap: 48, margin: 32, routeClearance: 24, labelClearance: 24,
  orderFontSize: 48, orderLineHeight: 56, orderGap: 24, typographicDetailGap: 16,
  typographicPadding: 32, typographicColumnWidth: 336, typographicGap: 80,
};
const M = DECK_FLOW_METRICS;
const supported = new Set(["flow-sequence", "flow-state", "flow-input-output", "flow-causal", "flow-branch", "flow-converge", "flow-parallel", "flow-cycle", "flow-swimlane", "flow-hierarchy", "flow-network"]);
const fallbackMeasure = (text: string, size: number) => [...text].reduce((width, char) => width + (/^[\x20-\x7e]$/.test(char) ? size * .62 : size), 0);
const center = (box: Box): DeckFlowPoint => ({ x: box.x + box.width / 2, y: box.y + box.height / 2 });
const overlaps = (a: Box, b: Box) => Math.min(a.x + a.width, b.x + b.width) > Math.max(a.x, b.x) + .01 && Math.min(a.y + a.height, b.y + b.height) > Math.max(a.y, b.y) + .01;
const inside = (point: DeckFlowPoint, box: Box) => point.x > box.x + .01 && point.x < box.x + box.width - .01 && point.y > box.y + .01 && point.y < box.y + box.height - .01;
const words = new Intl.Segmenter("ja", { granularity: "word" });
const characters = new Intl.Segmenter("ja", { granularity: "grapheme" });

/** Keep Japanese particles and closing punctuation with their word. Break inside
 * a word only when that word itself is wider than the available text region. */
export function wrapDeckFlowText(text: string, width: number, size: number, measure: NonNullable<DeckFlowLayoutOptions["measureText"]> = fallbackMeasure): string[] | null {
  if (width <= 0 || !Number.isFinite(width)) return null;
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    const units: string[] = [];
    for (const { segment } of words.segment(paragraph)) {
      if (units.length && (/^[ぁ-ん]$/.test(segment) || /^[、。，．？！?!：:；;）)」』】〕〉》\s]+$/.test(segment))) units[units.length - 1] += segment; // i18n-keep: 日本語の文を区切る正規表現（入力の字を見る）
      else units.push(segment);
    }
    const pieces = units.flatMap(unit => measure(unit.trimEnd(), size) > width ? [...characters.segment(unit)].map(item => item.segment) : [unit]);
    const wrapped: string[][] = [];
    let line: string[] = [];
    for (const piece of pieces) {
      if (measure(piece.trimEnd(), size) > width) return null;
      if (line.length && measure((line.join("") + piece).trimEnd(), size) > width) { wrapped.push(line); line = []; }
      line.push(piece);
    }
    wrapped.push(line);
    const last = wrapped.at(-1), previous = wrapped.at(-2);
    if (last && previous && [...characters.segment(last.join("").trim())].length === 1 && previous.length > 1) {
      const unit = previous.at(-1);
      if (unit && measure((unit + last.join("")).trimEnd(), size) <= width) { previous.pop(); last.unshift(unit); }
    }
    lines.push(...wrapped.map(items => items.join("")));
  }
  return lines;
}

function measuredNode(node: DeckFlowNode, width: number, measure: NonNullable<DeckFlowLayoutOptions["measureText"]>, paddingX = M.nodePaddingX): DeckFlowPlacedNode | null {
  const [title, ...detail] = node.label.split("\n");
  const lines = wrapDeckFlowText(title, width - paddingX * 2, M.nodeFontSize, measure);
  const detailLines = detail.length ? wrapDeckFlowText(detail.join("\n"), width - paddingX * 2, M.detailFontSize, measure) : [];
  if (!lines || !detailLines || lines.length > 3 || detailLines.length > 3) return null;
  const height = Math.max(M.minNodeHeight, M.nodePaddingY * 2 + lines.length * M.nodeLineHeight + detailLines.length * M.detailLineHeight + (detailLines.length ? M.detailGap : 0));
  return { ...node, x: 0, y: 0, width, height, lines, detailLines, titleLineSlots: lines.length, detailLineSlots: detailLines.length };
}

function ranksOf(graph: DeckFlowGraph): Map<string, number> | null {
  const rank = new Map(graph.nodes.map(node => [node.id, 0]));
  const counts = new Map(graph.nodes.map(node => [node.id, graph.edges.filter(edge => edge.to === node.id).length]));
  const ready = graph.nodes.filter(node => counts.get(node.id) === 0).map(node => node.id);
  let visited = 0;
  for (let index = 0; index < ready.length; index++) {
    const id = ready[index]; visited++;
    for (const edge of graph.edges.filter(edge => edge.from === id)) {
      rank.set(edge.to, Math.max(rank.get(edge.to) ?? 0, (rank.get(id) ?? 0) + 1));
      const remaining = (counts.get(edge.to) ?? 0) - 1;
      counts.set(edge.to, remaining);
      if (remaining === 0) ready.push(edge.to);
    }
  }
  return visited === graph.nodes.length ? rank : null;
}

/** A sequence uses measured, equally sized stages with a clear reading rail. */
function placeTypographic(graph: DeckFlowGraph, options: DeckFlowLayoutOptions): DeckFlowPlacedNode[] | null {
  const ranks = ranksOf(graph);
  if (!ranks || new Set(ranks.values()).size !== graph.nodes.length) return null;
  const measure = options.measureText ?? fallbackMeasure;
  // Label padding plus the clear space before the following text. Otherwise a
  // four-character condition wraps just because the arrow stops short of it.
  const gap = Math.max(M.typographicGap, ...graph.edges.map(edge => Math.max(...edge.label.split("\n").map(line => measure(line, M.edgeFontSize))) + 32));
  const width = Math.min(M.typographicColumnWidth, (options.width - gap * (graph.nodes.length - 1)) / graph.nodes.length);
  if (width < M.minNodeWidth) return null;
  const nodes = graph.nodes.map(node => measuredNode(node, width, measure, M.typographicPadding));
  if (nodes.some(node => node === null)) return null;
  const complete = nodes.filter(node => node !== null);
  const titleLineSlots = Math.max(...complete.map(node => node.lines.length));
  const detailLineSlots = Math.max(...complete.map(node => node.detailLines.length));
  const height = M.typographicPadding * 2 + M.orderLineHeight + M.orderGap + titleLineSlots * M.nodeLineHeight + (detailLineSlots ? M.typographicDetailGap + detailLineSlots * M.detailLineHeight : 0);
  if (height > options.height - M.margin * 2) return null;
  const left = (options.width - complete.length * width - (complete.length - 1) * gap) / 2;
  for (const node of complete) {
    const rank = ranks.get(node.id) ?? 0;
    node.x = left + (graph.direction === "RL" ? complete.length - 1 - rank : rank) * (width + gap);
    node.y = (options.height - height) / 2; node.height = height;
    node.titleLineSlots = titleLineSlots; node.detailLineSlots = detailLineSlots;
  }
  return complete;
}

function placeRanks(graph: DeckFlowGraph, options: DeckFlowLayoutOptions, vertical: boolean, reverse: boolean, sharedLines: boolean): DeckFlowPlacedNode[] | null {
  const ranks = ranksOf(graph); if (!ranks) return null;
  const count = Math.max(...ranks.values()) + 1;
  const buckets = Array.from({ length: count }, (_, rank) => graph.nodes.filter(node => ranks.get(node.id) === rank));
  const maxPeers = Math.max(...buckets.map(bucket => bucket.length));
  const measure = options.measureText ?? fallbackMeasure;
  const columns = vertical ? maxPeers : count;
  const preferredWidth = !vertical && columns <= 2 && maxPeers >= 3 ? 432 : M.maxNodeWidth;
  const width = Math.min(preferredWidth, (options.width - M.margin * 2 - M.gap * (columns - 1)) / columns);
  if (width < M.minNodeWidth) return null;
  const nodes = graph.nodes.map(node => measuredNode(node, width, measure));
  if (nodes.some(node => node === null)) return null;
  const complete = nodes.filter(node => node !== null);
  if (sharedLines) {
    const titleLineSlots = Math.max(...complete.map(node => node.lines.length));
    const detailLineSlots = Math.max(...complete.map(node => node.detailLines.length));
    const height = Math.max(M.minNodeHeight, M.nodePaddingY * 2 + titleLineSlots * M.nodeLineHeight + detailLineSlots * M.detailLineHeight + (detailLineSlots ? M.detailGap : 0));
    for (const node of complete) { node.height = height; node.titleLineSlots = titleLineSlots; node.detailLineSlots = detailLineSlots; }
  }
  const heights = buckets.map(bucket => Math.max(...complete.filter(node => bucket.some(item => item.id === node.id)).map(node => node.height)));
  const peerGaps = buckets.map(bucket => {
    const sum = complete.filter(node => bucket.some(item => item.id === node.id)).reduce((total, node) => total + node.height, 0);
    return bucket.length > 1 ? Math.min(32, (options.height - M.margin * 2 - sum) / (bucket.length - 1)) : 0;
  });
  if (!vertical && peerGaps.some((gap, index) => buckets[index].length > 1 && gap < 12)) return null;
  const rankGap = M.gap;
  const columnGap = columns > 1 ? Math.max(M.gap, (options.width - M.margin * 2 - width * columns) / (columns - 1)) : M.gap;
  const totalHeight = vertical ? heights.reduce((sum, height) => sum + height, 0) + rankGap * (count - 1) : Math.max(...buckets.map((bucket, index) => bucket.reduce((sum, item) => sum + (complete.find(node => node.id === item.id)?.height ?? 0), 0) + peerGaps[index] * (bucket.length - 1)));
  if (totalHeight > options.height - M.margin * 2) return null;
  let y = (options.height - totalHeight) / 2;
  for (const [rank, bucket] of buckets.entries()) {
    const members = complete.filter(node => bucket.some(item => item.id === node.id));
    const contentWidth = width * (vertical ? members.length : count) + columnGap * ((vertical ? members.length : count) - 1);
    let peerY = (options.height - members.reduce((sum, node) => sum + node.height, 0) - peerGaps[rank] * (members.length - 1)) / 2;
    for (const [peer, node] of members.entries()) {
      node.x = (options.width - contentWidth) / 2 + (vertical ? peer : reverse ? count - 1 - rank : rank) * (width + columnGap);
      node.y = vertical ? reverse ? options.height - y - node.height : y : peerY;
      peerY += node.height + peerGaps[rank];
    }
    y += heights[rank] + rankGap;
  }
  return complete;
}

function placeRadial(graph: DeckFlowGraph, options: DeckFlowLayoutOptions, network: boolean): DeckFlowPlacedNode[] | null {
  if (graph.nodes.length < 3 || graph.nodes.length > (network ? 6 : 6)) return null;
  const width = Math.min(240, (options.width - M.margin * 2 - M.gap * 2) / 3);
  if (width < M.minNodeWidth) return null;
  const nodes = graph.nodes.map(node => measuredNode(node, width, options.measureText ?? fallbackMeasure));
  if (nodes.some(node => node === null)) return null;
  const complete = nodes.filter(node => node !== null);
  const height = Math.max(...complete.map(node => node.height));
  if (height * 2 + 48 > options.height - M.margin * 2) return null;
  const hub = network ? [...complete].sort((a, b) => graph.edges.filter(edge => edge.from === b.id || edge.to === b.id).length - graph.edges.filter(edge => edge.from === a.id || edge.to === a.id).length)[0] : null;
  const ring = complete.filter(node => node !== hub);
  const radiusX = (options.width - width) / 2 - M.margin;
  const radiusY = (options.height - height) / 2 - M.margin;
  for (const [index, node] of ring.entries()) {
    const angle = -Math.PI / 2 + index * Math.PI * 2 / ring.length;
    node.x = options.width / 2 + Math.cos(angle) * radiusX - node.width / 2;
    node.y = options.height / 2 + Math.sin(angle) * radiusY - node.height / 2;
  }
  if (hub) { hub.x = (options.width - hub.width) / 2; hub.y = (options.height - hub.height) / 2; }
  return complete;
}

function placeLanes(graph: DeckFlowGraph, options: DeckFlowLayoutOptions): { nodes: DeckFlowPlacedNode[]; groups: DeckFlowPlacedGroup[] } | null {
  if (!graph.groups.length || graph.groups.length > 3) return null;
  const assignments = graph.nodes.map(node => graph.groups.filter(group => group.nodeIds.includes(node.id)));
  if (assignments.some(groups => groups.length !== 1)) return null;
  const ranks = ranksOf(graph); if (!ranks) return null;
  const count = Math.max(...ranks.values()) + 1;
  const measure = options.measureText ?? fallbackMeasure;
  const gutter = Math.max(112, ...graph.groups.map(group => measure(group.label, M.detailFontSize) + 32));
  const width = Math.min(M.maxNodeWidth, (options.width - gutter - M.margin * 2 - M.gap * (count - 1)) / count);
  if (width < M.minNodeWidth) return null;
  const laneHeight = (options.height - M.margin * 2) / graph.groups.length;
  const nodes: DeckFlowPlacedNode[] = [];
  const groups: DeckFlowPlacedGroup[] = [];
  for (const [lane, group] of graph.groups.entries()) {
    const used = new Set<number>();
    for (const id of group.nodeIds) {
      const original = graph.nodes.find(node => node.id === id); if (!original) return null;
      const rank = ranks.get(id) ?? 0;
      if (used.has(rank)) return null;
      used.add(rank);
      const node = measuredNode(original, width, options.measureText ?? fallbackMeasure);
      if (!node || node.height > laneHeight - 32) return null;
      node.x = gutter + M.margin + rank * (width + M.gap);
      node.y = M.margin + lane * laneHeight + (laneHeight - node.height) / 2;
      nodes.push(node);
    }
    groups.push({ ...group, x: M.margin, y: M.margin + lane * laneHeight, width: options.width - M.margin * 2, height: laneHeight, labelX: M.margin + 8, labelY: M.margin + lane * laneHeight + laneHeight / 2 });
  }
  return { nodes: graph.nodes.flatMap(item => nodes.filter(node => node.id === item.id)), groups };
}

type Side = "left" | "right" | "top" | "bottom";
type Port = { nodeId: string; point: DeckFlowPoint; stub: DeckFlowPoint };
type PortPair = { from: Port; to: Port };
function allocatePorts(nodes: DeckFlowPlacedNode[], edges: DeckFlowEdge[], typographic = false): Map<string, PortPair> | null {
  type Demand = { edgeId: string; node: DeckFlowPlacedNode; end: "from" | "to"; side: Side; neighbor: DeckFlowPoint };
  const demands: Demand[] = [];
  for (const edge of edges) {
    const from = nodes.find(node => node.id === edge.from), to = nodes.find(node => node.id === edge.to);
    if (!from || !to) return null;
    const a = center(from), b = center(to);
    const horizontal = Math.abs(b.x - a.x) >= Math.abs(b.y - a.y);
    const first: Side = horizontal ? b.x >= a.x ? "right" : "left" : b.y >= a.y ? "bottom" : "top";
    const last: Side = first === "right" ? "left" : first === "left" ? "right" : first === "bottom" ? "top" : "bottom";
    demands.push({ edgeId: edge.id, node: from, end: "from", side: first, neighbor: b }, { edgeId: edge.id, node: to, end: "to", side: last, neighbor: a });
  }
  const endpoints = new Map<string, { from?: Port; to?: Port }>();
  for (const node of nodes) {
    for (const side of ["left", "right", "top", "bottom"] satisfies Side[]) {
      const horizontal = side === "left" || side === "right";
      const members = demands.filter(demand => demand.node.id === node.id && demand.side === side).sort((a, b) => (horizontal ? a.neighbor.y - b.neighbor.y : a.neighbor.x - b.neighbor.x) || a.edgeId.localeCompare(b.edgeId));
      for (const [index, demand] of members.entries()) {
        const fraction = (index + 1) / (members.length + 1);
        const point = { x: horizontal ? side === "left" ? node.x : node.x + node.width : node.x + node.width * fraction, y: horizontal ? node.y + node.height * fraction : side === "top" ? node.y : node.y + node.height };
        if (typographic && side === "left") point.x -= 16;
        const stub = { x: point.x + (side === "left" ? -M.routeClearance : side === "right" ? M.routeClearance : 0), y: point.y + (side === "top" ? -M.routeClearance : side === "bottom" ? M.routeClearance : 0) };
        const pair = endpoints.get(demand.edgeId) ?? {};
        pair[demand.end] = { nodeId: node.id, point, stub };
        endpoints.set(demand.edgeId, pair);
      }
    }
  }
  const pairs = new Map<string, PortPair>();
  for (const [id, pair] of endpoints) { if (!pair.from || !pair.to) return null; pairs.set(id, { from: pair.from, to: pair.to }); }
  // Independent text heights can put two facing ports less than a pixel apart.
  // Align that harmless tangential difference before routing; preserving it would
  // force a microscopic dogleg even though both faces have ample room.
  for (const pair of pairs.values()) {
    const fromHorizontal = pair.from.point.x !== pair.from.stub.x;
    const toHorizontal = pair.to.point.x !== pair.to.stub.x;
    if (fromHorizontal !== toHorizontal) continue;
    const axis = fromHorizontal ? "y" : "x";
    if (Math.abs(pair.from.point[axis] - pair.to.point[axis]) >= 1) continue;
    const aligned = Math.round((pair.from.point[axis] + pair.to.point[axis]) / 2);
    pair.from.point[axis] = aligned; pair.from.stub[axis] = aligned;
    pair.to.point[axis] = aligned; pair.to.stub[axis] = aligned;
  }
  return pairs;
}
function blocked(a: DeckFlowPoint, b: DeckFlowPoint, boxes: Box[]): boolean {
  return boxes.some(box => a.x === b.x
    ? a.x > box.x + .01 && a.x < box.x + box.width - .01 && Math.min(a.y, b.y) < box.y + box.height - .01 && Math.max(a.y, b.y) > box.y + .01
    : a.y > box.y + .01 && a.y < box.y + box.height - .01 && Math.min(a.x, b.x) < box.x + box.width - .01 && Math.max(a.x, b.x) > box.x + .01);
}
function compact(points: DeckFlowPoint[]): DeckFlowPoint[] {
  return points.filter((point, index) => index === 0 || index === points.length - 1 || !((points[index - 1].x === point.x && point.x === points[index + 1].x) || (points[index - 1].y === point.y && point.y === points[index + 1].y)));
}

/** Orthogonal visibility grid. Routes never cross a node, including unrelated branch siblings. */
function route(from: Port, to: Port, boxes: Box[], width: number, height: number): DeckFlowPoint[] | null {
  const start = from.stub, finish = to.stub;
  if ([start, finish].some(point => point.x < 0 || point.y < 0 || point.x > width || point.y > height || boxes.some(box => inside(point, box)))) return null;
  const xs = [...new Set([0, width, ...boxes.flatMap(box => [box.x, box.x + box.width]), start.x, finish.x])].filter(x => x >= 0 && x <= width).sort((a, b) => a - b);
  const ys = [...new Set([0, height, ...boxes.flatMap(box => [box.y, box.y + box.height]), start.y, finish.y])].filter(y => y >= 0 && y <= height).sort((a, b) => a - b);
  const points = ys.flatMap(y => xs.map(x => ({ x, y })));
  const target = points.findIndex(point => point.x === finish.x && point.y === finish.y);
  // Arrival direction is part of the state: two equally short paths to the same
  // point can require very different numbers of bends to reach the target.
  const firstAxis = from.point.y === start.y ? 0 : 1;
  const finalAxis = to.point.y === finish.y ? 0 : 1;
  const bendCost = M.routeClearance * 2;
  const distance = new Map<number, number>(), previous = new Map<number, number>();
  const open: number[] = [];
  const first = points.findIndex(point => point.x === start.x && point.y === start.y) * 2 + firstAxis; distance.set(first, 0); open.push(first);
  const closed = new Set<number>();
  let bestTarget: number | null = null, bestCost = Infinity;
  while (open.length) {
    open.sort((a, b) => (distance.get(a) ?? Infinity) - (distance.get(b) ?? Infinity));
    const state = open.shift(); if (state === undefined || closed.has(state)) continue;
    const currentCost = distance.get(state) ?? Infinity;
    if (currentCost > bestCost) break;
    const current = Math.floor(state / 2), axis = state % 2;
    if (target === current) {
      const totalCost = currentCost + (axis === finalAxis ? 0 : bendCost);
      if (totalCost < bestCost) { bestTarget = state; bestCost = totalCost; }
      continue;
    }
    closed.add(state);
    const x = current % xs.length, y = Math.floor(current / xs.length);
    const adjacent = [x > 0 ? current - 1 : -1, x + 1 < xs.length ? current + 1 : -1, y > 0 ? current - xs.length : -1, y + 1 < ys.length ? current + xs.length : -1];
    for (const next of adjacent) {
      if (next < 0) continue;
      const nextAxis = points[next].y === points[current].y ? 0 : 1;
      const nextState = next * 2 + nextAxis;
      if (closed.has(nextState) || boxes.some(box => inside(points[next], box)) || blocked(points[current], points[next], boxes)) continue;
      const cost = currentCost + Math.abs(points[next].x - points[current].x) + Math.abs(points[next].y - points[current].y) + (axis === nextAxis ? 0 : bendCost);
      if (cost < (distance.get(nextState) ?? Infinity)) { distance.set(nextState, cost); previous.set(nextState, state); open.push(nextState); }
    }
  }
  if (bestTarget === null) return null;
  const path = [points[Math.floor(bestTarget / 2)]]; let cursor = bestTarget;
  while (previous.has(cursor)) { cursor = previous.get(cursor) ?? cursor; path.unshift(points[Math.floor(cursor / 2)]); }
  return compact([from.point, ...path, to.point]);
}

function expand(box: Box, amount: number): Box {
  return { x: box.x - amount, y: box.y - amount, width: box.width + amount * 2, height: box.height + amount * 2 };
}
function labelPosition(points: DeckFlowPoint[], label: string, boxes: Box[], previousWires: DeckFlowPoint[][], options: DeckFlowLayoutOptions): { lines: string[]; labelX: number; labelY: number; labelWidth: number; labelHeight: number } | null {
  if (!label) return { lines: [], labelX: 0, labelY: 0, labelWidth: 0, labelHeight: 0 };
  const measure = options.measureText ?? fallbackMeasure;
  const preferredWidth = Math.min(184, Math.max(48, measure(label, M.edgeFontSize) + 16));
  const segments = points.slice(1).map((point, index) => ({ a: points[index], b: point })).sort((left, right) => Math.hypot(right.b.x - right.a.x, right.b.y - right.a.y) - Math.hypot(left.b.x - left.a.x, left.b.y - left.a.y));
  for (const { a, b } of segments) {
    const widths = [preferredWidth];
    if (a.y === b.y && Math.abs(a.x - b.x) > 60) widths.push(Math.min(preferredWidth, Math.abs(a.x - b.x) - 12));
    for (const labelWidth of widths) {
      const lines = wrapDeckFlowText(label, labelWidth - 16, M.edgeFontSize, measure);
      if (!lines || lines.length > 3) continue;
      const labelHeight = lines.length * M.edgeLineHeight + 8;
      for (const offset of [-1, 1]) {
        const box = { x: (a.x + b.x - labelWidth) / 2 + (a.x === b.x ? offset * (labelWidth / 2 + M.labelClearance) : 0), y: (a.y + b.y - labelHeight) / 2 + (a.y === b.y ? offset * (labelHeight / 2 + M.labelClearance) : 0), width: labelWidth, height: labelHeight };
        if (box.x < 0 || box.y < 0 || box.x + box.width > options.width || box.y + box.height > options.height || boxes.some(node => overlaps(box, node))) continue;
        const safety = expand(box, M.labelClearance);
        if ([points, ...previousWires].some(wire => wire.slice(1).some((point, index) => blocked(wire[index], point, [safety])))) continue;
        return { lines, labelX: box.x + box.width / 2, labelY: box.y + box.height / 2, labelWidth, labelHeight };
      }
    }
  }
  return null;
}

/** Layout in the slide's logical pixels. Failure means use the original renderer, never scale down. */
export function layoutDeckFlow(graph: DeckFlowGraph, format: string, layoutName: string, options: DeckFlowLayoutOptions): DeckFlowLayout | null {
  if (!supported.has(format) || !Number.isFinite(options.width) || !Number.isFinite(options.height) || options.width <= 0 || options.height <= 0 || !graph.nodes.length || graph.nodes.length > 16 || graph.edges.length > 32) return null;
  const ids = new Set(graph.nodes.map(node => node.id));
  if (graph.groups.length && format !== "flow-swimlane") return null;
  if (ids.size !== graph.nodes.length || new Set(graph.edges.map(edge => edge.id)).size !== graph.edges.length || graph.edges.some(edge => !ids.has(edge.from) || !ids.has(edge.to) || edge.from === edge.to)) return null;
  let groups: DeckFlowPlacedGroup[] = [];
  let nodes: DeckFlowPlacedNode[] | null;
  let typographic = false;
  if (format === "flow-swimlane") { const lanes = placeLanes(graph, options); nodes = lanes?.nodes ?? null; groups = lanes?.groups ?? []; }
  else if (format === "flow-cycle" || format === "flow-network") nodes = placeRadial(graph, options, format === "flow-network");
  else {
    const vertical = ["vertical", "TB", "BT"].includes(layoutName) || (format !== "flow-hierarchy" && layoutName === "" && (graph.direction === "TB" || graph.direction === "BT"));
    typographic = !vertical && ["flow-sequence", "flow-input-output", "flow-causal"].includes(format);
    nodes = typographic ? placeTypographic(graph, options) : null;
    if (nodes === null) {
      typographic = false;
      nodes = placeRanks(graph, options, vertical, vertical ? graph.direction === "BT" : graph.direction === "RL", !vertical && ["flow-sequence", "flow-state", "flow-input-output", "flow-causal"].includes(format));
    }
  }
  if (!nodes || nodes.some((node, index) => node.x < 0 || node.y < 0 || node.x + node.width > options.width + .01 || node.y + node.height > options.height + .01 || nodes?.some((other, peer) => peer !== index && overlaps(node, other)))) return null;
  const edges: DeckFlowPlacedEdge[] = [];
  const ports = allocatePorts(nodes, graph.edges, typographic);
  if (!ports) return null;
  const labels: Box[] = [];
  for (const edge of graph.edges) {
    const pair = ports.get(edge.id);
    if (!pair) return null;
    for (const port of [pair.from, pair.to]) if (blocked(port.point, port.stub, [...nodes.filter(node => node.id !== port.nodeId).map(node => expand(node, M.routeClearance)), ...labels])) return null;
    const obstacles = [...nodes.map(node => expand(node, M.routeClearance)), ...labels];
    const points = route(pair.from, pair.to, obstacles, options.width, options.height);
    if (!points) return null;
    const label = labelPosition(points, edge.label, [...nodes, ...labels], edges.map(edge => edge.points), options);
    if (!label) return null;
    edges.push({ ...edge, points, ...label });
    if (edge.label) labels.push(expand({ x: label.labelX - label.labelWidth / 2, y: label.labelY - label.labelHeight / 2, width: label.labelWidth, height: label.labelHeight }, M.labelClearance));
  }
  return { width: options.width, height: options.height, nodes, edges, groups, typographic };
}
