/**
 * スライドの編集画面の右下の「レイヤー」の一覧（./layer-panel.ts）が見せる木と、行を落としたときの段取り。
 * 木は「上ほど前面」。並びは描かれる順（重なりの土俵の中の z-index・位置指定・DOM の順）で決め、HTML の順序は変えない
 * （HTML の順序を動かすと、流れて並ぶ字の位置が変わるため）。
 * 親子は 2 種類: HTML の入れ物（その中の要素。グループ化した `data-deck-group="true"` の包みもここ）と、
 * 包まないグループ（`data-deck-group="<内側の ID> … <外側の ID>"`）。この配布版のグループ化は包む形なので、後者はいまは出てこないが、
 * 保存済みの資料に残っていても読めるように同じ木で扱う。
 * 並べ替えは同じ入れ物の中の重なり順（z-index）だけを変える。別の入れ物へ移すとレイアウトが崩れるので断る。描く・保存するのは呼ぶ側。
 */

export type LayerKind = "text" | "image" | "video" | "audio" | "chart" | "table" | "shape" | "icon" | "box" | "group";
export type LayerNode = {
  id: string;
  /** いちばん近い、ID を持つ祖先（スライドの直下なら null） */
  parent: string | null;
  /** 包まないグループの ID（内側 → 外側） */
  groups: string[];
  kind: LayerKind;
  label: string;
  locked: boolean;
  /** 一覧に出すか（字を持たない飾りの入れ物などは出さない。重なり順の計算には入れる） */
  listed: boolean;
  /** 描く順の段: 0 は z-index が負、1 は位置指定の無い要素、2 は位置指定・変形の z:0、3 は z-index が正 */
  band: number;
  z: number;
  /** z-index が効くか（位置指定がある・flex か grid の子） */
  applies: boolean;
  dom: number;
};
export type LayerRow = {
  key: string;
  parentKey: string | null;
  depth: number;
  kind: LayerKind;
  label: string;
  locked: boolean;
  /** 行が指す要素（包まないグループは全員） */
  members: string[];
  /** 子の行の数（開閉を出すか） */
  children: number;
};
export type LayerPlacement = "before" | "after" | "inside";
export type LayerStyle = { id: string; property: "z-index" | "position"; value: string };
export type LayerGroupMark = { id: string; before: string | null; after: string | null };
export type LayerDropError = "deckEditor.layers.cannotMove" | "deckEditor.layers.otherBox" | "deckEditor.layers.unchanged";
export type LayerDrop = { styles: LayerStyle[]; groups: LayerGroupMark[] } | { error: LayerDropError };

const GROUP = "group:";
export const layerGroupKey = (id: string) => GROUP + id;
const groupOf = (key: string | null) => (key?.startsWith(GROUP) ? key.slice(GROUP.length) : null);
/** 包むグループ（グループ化で作る `display:contents` の包み）。 */
export const GROUP_WRAPPER = '[data-deck-group="true"]';
/** 包まないグループの ID の並び（内側から外側の順）。包むグループ・グループでない要素は空。 */
export function groupPath(node: Element): string[] {
  const value = node.getAttribute("data-deck-group");
  return !value || value === "true" ? [] : value.split(/\s+/).filter(Boolean);
}
/** 中を一覧に出さない部品（グラフ・表・絵記号・見本の画像・動画の枠） */
const ATOMIC = "[data-dd-chart],[data-deck-chart],table,svg,[data-deck-sample-image],[data-deck-media-slot],[data-deck-youtube],audio,video";
/** 字の一部を囲んだ span など（文字の箱の一部） */
const INLINE = new Set(["SPAN", "B", "STRONG", "I", "EM", "U", "S", "A", "SMALL", "SUP", "SUB", "MARK", "CODE", "BR"]);

function kindOf(node: Element): LayerKind {
  if (node.matches("img,[data-deck-media-slot=image],[data-deck-sample-image]")) return "image";
  if (node.matches("video,[data-deck-media-slot=video],[data-deck-youtube]")) return "video";
  if (node.matches("audio,[data-deck-media-slot=audio]")) return "audio";
  if (node.matches("[data-dd-chart],[data-deck-chart]")) return "chart";
  if (node.matches("table")) return "table";
  if (node.matches("[data-deck-shape]")) return "shape";
  if (node.localName === "svg") return "icon";
  return "text";
}

/** 描かれる順の段と z-index（CSS の重なりの決まりを、同じ親の中で比べられる形に縮めたもの） */
function paintOf(view: Window, node: Element): Pick<LayerNode, "band" | "z" | "applies"> {
  const css = view.getComputedStyle(node), parentCss = node.parentElement ? view.getComputedStyle(node.parentElement) : null;
  const positioned = css.position !== "static";
  const applies = positioned || /flex|grid/.test(parentCss?.display ?? "");
  const z = applies && css.zIndex !== "auto" ? Number(css.zIndex) : null;
  // 変形・半透明・フィルターは z-index:0 の位置指定と同じ段に描かれる
  const transformed = [css.transform, css.translate, css.scale, css.rotate, css.filter].some((value) => value && value !== "none") || Number(css.opacity || 1) < 1;
  if (z !== null) return { band: z < 0 ? 0 : z === 0 ? 2 : 3, z, applies };
  return { band: positioned || transformed ? 2 : 1, z: 0, applies };
}

/** 描いたスライドから、一覧の材料を読む。`selfListed` は字を持つ・画像などの部品か、`boxListed` は入れ物を 1 行として出すか（どちらも呼ぶ側が決める） */
export function readLayerNodes(slide: Element, input: { mark: string; selfListed: (node: Element) => boolean; label: (node: Element) => string; boxListed?: (node: Element) => boolean }): LayerNode[] {
  const view = slide.ownerDocument.defaultView;
  if (!view) return [];
  const nodes: LayerNode[] = [];
  const all = [...slide.querySelectorAll(`[${input.mark}]`)].filter((node) => !INLINE.has(node.tagName) && !node.parentElement?.closest(ATOMIC));
  const listed = new Set(all.filter(input.selfListed));
  all.forEach((node, dom) => {
    const parent = node.parentElement?.closest(`[${input.mark}]`);
    // 字を持たない入れ物は、中に一覧に出す要素があって、見える箱か（並べるためだけの見えない囲みは飛ばし、中の要素を親へ上げる）グループのときだけ出す
    const box = !listed.has(node) && (input.boxListed?.(node) ?? true) && all.some((other) => other !== node && listed.has(other) && node.contains(other));
    nodes.push({
      id: node.getAttribute(input.mark) ?? "",
      parent: parent && parent !== slide && slide.contains(parent) ? parent.getAttribute(input.mark) : null,
      groups: [...groupPath(node)],
      kind: box ? (node.matches(GROUP_WRAPPER) ? "group" : "box") : kindOf(node),
      label: input.label(node),
      locked: node.hasAttribute("data-deck-locked"),
      listed: listed.has(node) || box,
      ...paintOf(view, node),
      dom,
    });
  });
  return nodes;
}

type Entry = { key: string; parentKey: string | null; leaves: string[] };

/** 木の材料。要素の行と、包まないグループの行（`group:<ID>`） */
function entries(nodes: readonly LayerNode[]) {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const chain = (id: string | null): string[] => {
    const out: string[] = [];
    for (let at = id; at && byId.has(at) && !out.includes(at); at = byId.get(at)?.parent ?? null) out.unshift(at);
    return out;
  };
  /** いちばん近い、一覧に出す祖先（無ければ null） */
  const shownParent = (node: LayerNode) => {
    let at = node.parent;
    while (at && !byId.get(at)?.listed) at = byId.get(at)?.parent ?? null;
    return at;
  };
  const members = new Map<string, LayerNode[]>();
  for (const node of nodes) for (const group of node.groups) members.set(group, [...(members.get(group) ?? []), node]);
  /** グループの置き場所: 全員の入れ物に共通する、いちばん深い一覧の祖先 */
  const home = (group: string): string | null => {
    const lists = (members.get(group) ?? []).map((node) => chain(shownParent(node)));
    let depth = 0;
    while (lists.length && lists.every((list) => list[depth] !== undefined && list[depth] === lists[0][depth])) depth++;
    return depth ? lists[0][depth - 1] : null;
  };
  const map = new Map<string, Entry>();
  for (const node of nodes) {
    if (!node.listed) continue;
    const inner = node.groups[0];
    map.set(node.id, { key: node.id, parentKey: inner ? layerGroupKey(inner) : shownParent(node), leaves: [node.id] });
  }
  for (const [group, list] of members) {
    const listedMembers = list.filter((node) => node.listed);
    if (!listedMembers.length) continue;
    const path = listedMembers[0].groups, outer = path[path.indexOf(group) + 1];
    map.set(layerGroupKey(group), { key: layerGroupKey(group), parentKey: outer ? layerGroupKey(outer) : home(group), leaves: listedMembers.map((node) => node.id) });
  }
  return { byId, chain, map, members, home, shownParent };
}

/** 2 つの要素のどちらが前に描かれるか（正なら a が前）。共通の入れ物の直下の 2 つで比べ、祖先は子孫より後ろ */
function paintOrder(byId: Map<string, LayerNode>, chain: (id: string) => string[]) {
  const key = (id: string) => { const node = byId.get(id); return node ? [node.band, node.z, node.dom] : [0, 0, 0]; };
  return (a: string, b: string) => {
    const ca = chain(a), cb = chain(b);
    let split = 0;
    while (ca[split] !== undefined && ca[split] === cb[split]) split++;
    if (ca[split] === undefined) return -1;
    if (cb[split] === undefined) return 1;
    const ka = key(ca[split]), kb = key(cb[split]);
    for (let index = 0; index < ka.length; index++) if (ka[index] !== kb[index]) return ka[index] - kb[index];
    return 0;
  };
}

/** 一覧の行（上ほど前面）。畳むのは呼ぶ側（parentKey をたどる） */
export function layerRows(nodes: readonly LayerNode[]): LayerRow[] {
  const { byId, chain, map } = entries(nodes);
  const compare = paintOrder(byId, chain);
  const front = (entry: Entry) => entry.leaves.reduce((best, id) => (compare(id, best) > 0 ? id : best));
  const children = new Map<string | null, Entry[]>();
  for (const entry of map.values()) {
    const parentKey = entry.parentKey !== null && map.has(entry.parentKey) ? entry.parentKey : null;
    children.set(parentKey, [...(children.get(parentKey) ?? []), { ...entry, parentKey }]);
  }
  const rows: LayerRow[] = [];
  const visit = (parentKey: string | null, depth: number, seen: Set<string>) => {
    const list = [...(children.get(parentKey) ?? [])].sort((a, b) => compare(front(b), front(a)));
    for (const entry of list) {
      if (seen.has(entry.key)) continue;
      seen.add(entry.key);
      const group = groupOf(entry.key), node = byId.get(entry.key);
      const members = group ? entry.leaves : [entry.key];
      rows.push({
        key: entry.key, parentKey, depth,
        kind: node?.kind ?? "group",
        label: node?.label ?? "",
        locked: members.every((id) => byId.get(id)?.locked),
        members,
        children: children.get(entry.key)?.length ?? 0,
      });
      visit(entry.key, depth + 1, seen);
    }
  };
  visit(null, 0, new Set());
  return rows;
}

/** 包まないグループの印の付け替え。動かす行（グループなら全員）を落とした先を囲むグループの並びにし、残りが 1 つになったグループはほどく */
function regroup(nodes: readonly LayerNode[], members: Map<string, LayerNode[]>, moving: string, parentKey: string | null): LayerGroupMark[] {
  const group = groupOf(moving), inside = groupOf(parentKey);
  const sample = inside ? members.get(inside)?.[0]?.groups ?? [] : [];
  const context = inside ? sample.slice(sample.indexOf(inside)) : [];
  const paths = new Map(nodes.map((node) => [node.id, node.groups]));
  for (const id of group ? (members.get(group) ?? []).map((node) => node.id) : [moving]) {
    const before = paths.get(id) ?? [];
    paths.set(id, group ? [...before.slice(0, before.indexOf(group) + 1), ...context] : context);
  }
  const counts = new Map<string, number>();
  for (const path of paths.values()) for (const id of path) counts.set(id, (counts.get(id) ?? 0) + 1);
  return nodes.flatMap((node) => {
    const after = (paths.get(node.id) ?? []).filter((id) => (counts.get(id) ?? 0) > 1);
    return after.join(" ") === node.groups.join(" ") ? [] : [{ id: node.id, before: node.groups.length ? node.groups.join(" ") : null, after: after.length ? after.join(" ") : null }];
  });
}

/**
 * 重なり順の振り直し。動かす要素の DOM の親（並べるためだけの見えない囲みも含めた本当の親）の直下の要素に、後ろから 1, 2, 3… の z-index を振る。
 * 動かす要素の親が 1 つにそろわない・相手が同じ親の中にいないときは振らない（`anchored` が false）。
 */
function reorder(nodes: readonly LayerNode[], chain: (id: string) => string[], moved: readonly string[], aimed: readonly string[], placement: LayerPlacement): { styles: LayerStyle[]; anchored: boolean } {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const parents = new Set(moved.map((id) => byId.get(id)?.parent ?? null));
  if (parents.size !== 1) return { styles: [], anchored: false };
  const [level] = parents;
  /** その要素の、親の直下にある祖先（自分を含む）。親の外なら null */
  const atLevel = (id: string) => {
    const list = chain(id), index = level === null ? 0 : list.indexOf(level) + 1;
    return (level === null || index > 0) && list[index] ? list[index] : null;
  };
  const siblings = nodes.filter((node) => node.parent === level).sort((a, b) => a.band - b.band || a.z - b.z || a.dom - b.dom).map((node) => node.id);
  const movers = new Set(moved), rest = siblings.filter((id) => !movers.has(id));
  const anchors = aimed.map(atLevel).filter((id): id is string => id !== null && !movers.has(id)).map((id) => rest.indexOf(id)).filter((index) => index >= 0);
  if (!anchors.length && placement !== "inside") return { styles: [], anchored: false };
  const at = !anchors.length ? rest.length : placement === "after" ? Math.min(...anchors) : Math.max(...anchors) + 1;
  const order = [...rest.slice(0, at), ...siblings.filter((id) => movers.has(id)), ...rest.slice(at)];
  if (order.join(" ") === siblings.join(" ")) return { styles: [], anchored: true };
  return {
    anchored: true,
    styles: order.flatMap((id, index): LayerStyle[] => {
      const node = byId.get(id);
      if (!node) return [];
      return [
        ...(node.applies ? [] : [{ id, property: "position" as const, value: "relative" }]),
        ...(node.applies && node.z === index + 1 ? [] : [{ id, property: "z-index" as const, value: String(index + 1) }]),
      ];
    }),
  };
}

/**
 * 行 `moving` を行 `target` の上（before・前面側）・下（after・背面側）・中（inside・包まないグループの先頭）へ落としたときの段取り。
 * 重なり順は同じ親の中の z-index だけ（`reorder`）、包まないグループは印の付け替えだけ（`regroup`）。別の入れ物への移動は断る。
 */
export function planLayerDrop(nodes: readonly LayerNode[], moving: string, target: string, placement: LayerPlacement): LayerDrop {
  const { byId, chain, map, members, home, shownParent } = entries(nodes);
  const moved = map.get(moving), aim = map.get(target);
  if (!moved || !aim || moving === target || (placement === "inside" && !groupOf(target))) return { error: "deckEditor.layers.cannotMove" };
  const parentKey = placement === "inside" ? target : aim.parentKey;
  for (let at = parentKey; at; at = map.get(at)?.parentKey ?? null) if (at === moving) return { error: "deckEditor.layers.cannotMove" };
  // 落とした先の入れ物（グループの中ならグループの置き場所）。行の要素がその入れ物の中にいなければ、別の入れ物への移動なので断る
  const into = groupOf(parentKey), destination = into ? home(into) : parentKey;
  if (moved.leaves.some((id) => { const node = byId.get(id); return !node || shownParent(node) !== destination; })) return { error: "deckEditor.layers.otherBox" };
  const groups = regroup(nodes, members, moving, parentKey);
  const { styles, anchored } = reorder(nodes, chain, moved.leaves, aim.leaves, placement);
  // 相手が別の見えない囲みの中にいて並べ替えられないときは、黙らずに理由を言う
  if (!styles.length && !groups.length) return { error: anchored ? "deckEditor.layers.unchanged" : "deckEditor.layers.otherBox" };
  return { styles, groups };
}
