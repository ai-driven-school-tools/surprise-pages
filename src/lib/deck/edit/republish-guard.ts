/**
 * 既にあるスライドを原稿から丸ごと送り直すとき、その後にブラウザや AI が直した分を黙って巻き戻さないための突き合わせ。
 *
 *   S（source）   … 最後に原稿から丸ごと投稿した版。原稿の元になった版
 *   L（current）  … いまの版。S のあとの直しを含む
 *   P（proposed） … 送られてきた原稿
 *
 * S から L で足された・変えられた文を P が持っていない、または S から L で消された文を P が持ち込む、のどちらかが「巻き戻し」。
 * 丸ごと送ると、その直しは消える。投稿の入口（src/app/api/pages/route.ts）は土台の版が L と一致することしか確かめていないので、
 * 原稿が古いまま版の番号だけ最新にすると通ってしまっていた。ここは判定だけを持ち、断るかどうかは呼ぶ側が決める。
 *
 * 比べるのは要素ごとの文の数（並び・ID に頼らない）。要素の ID は、復元で古い版の ID が戻ってくるなど系統が切れるので、
 * 「どの文がどの文に変わったか」を並べて見せるときだけに使う。見るのは文だけで、書式・画像の差し替えはまだ見ない。
 */
import { type DeckEditableNode } from "./model";
import { prepareDeckEdit } from "./source";

export type RepublishConflict = {
  target: string;
  slideId: string;
  /** S のときの文。S に無かった文（人が足した）は null */
  source: string | null;
  /** いまの文。人が消した文は null */
  current: string | null;
  /** 送られてきた原稿の、その箇所の文。原稿に無い・突き合わせられないときは null */
  proposed: string | null;
};

/** 比べる文。要素の間の改行と空白は数えない（並べ方の違いで直しと見なさない）。空の要素は数えない。 */
function textOf(node: DeckEditableNode | undefined): string | null {
  if (node === undefined) return null;
  const text = node.textRuns.map((run) => run.text).join("").replace(/\s+/g, " ").trim();
  return text === "" ? null : text;
}

function counts(nodes: readonly DeckEditableNode[]): Map<string, number> {
  const found = new Map<string, number>();
  for (const node of nodes) {
    const text = textOf(node);
    if (text !== null) found.set(text, (found.get(text) ?? 0) + 1);
  }
  return found;
}

/** 要素が何枚目にあるか（ID の系統が切れていても、枚の並びで同じ場所を指せる）。 */
function slideNumbers(nodes: readonly DeckEditableNode[]): Map<string, number> {
  const order = new Map<string, number>();
  for (const node of nodes) if (!order.has(node.slideId)) order.set(node.slideId, order.size);
  return new Map(nodes.map((node) => [node.id, order.get(node.slideId) ?? -1]));
}

/** S と並びが同じ原稿なら、S の ID でその箇所の文を引ける（見せるときだけに使う）。 */
function proposedAt(source: readonly DeckEditableNode[], proposed: readonly DeckEditableNode[]): (id: string) => string | null {
  const byId = new Map(proposed.map((node) => [node.id, node]));
  const sameShape = proposed.length === source.length && proposed.every((node, index) => node.tag === source[index]?.tag);
  const index = new Map(source.map((node, at) => [node.id, at]));
  return (id) => textOf(byId.get(id) ?? (sameShape ? proposed[index.get(id) ?? -1] : undefined));
}

/**
 * `source` が null（原稿から投稿した版が無い）なら、いまの文を 1 つでも落とす原稿を止める（足す・変える側は見ない）。
 */
export function republishReverts(input: { source: string | null; current: string; proposed: string }): { conflicts: RepublishConflict[] } {
  const source = input.source === null ? [] : prepareDeckEdit(input.source).nodes;
  const current = prepareDeckEdit(input.current).nodes;
  const proposed = prepareDeckEdit(input.proposed).nodes;
  const [inSource, inCurrent, inProposed] = [counts(source), counts(current), counts(proposed)];
  const count = (map: Map<string, number>, text: string) => map.get(text) ?? 0;

  // 人が足した・変えた文のうち、原稿に足りないもの
  const missing = new Set([...inCurrent.keys()].filter((text) => count(inCurrent, text) > count(inSource, text) && count(inProposed, text) < count(inCurrent, text)));
  // 人が消した文のうち、原稿が持ち込むもの
  const restored = new Set([...inSource.keys()].filter((text) => count(inSource, text) > count(inCurrent, text) && count(inProposed, text) > count(inCurrent, text)));
  if (missing.size === 0 && restored.size === 0) return { conflicts: [] };

  const sourceById = new Map(source.map((node) => [node.id, node]));
  const at = proposedAt(source, proposed);
  const [sourceSlide, currentSlide] = [slideNumbers(source), slideNumbers(current)];
  const conflicts: RepublishConflict[] = [];
  const reported = new Set<string>();
  for (const node of current) {
    const text = textOf(node);
    if (text === null || !missing.has(text) || reported.has(text)) continue;
    reported.add(text);
    // 人の直しで消えた S の文と 1 つの直しとして並べる。同じ ID が無ければ（系統が切れていれば）同じ枚の中から採る
    const sameId = textOf(sourceById.get(node.id));
    const before = sameId !== null && restored.has(sameId) ? sameId
      : source.find((candidate) => sourceSlide.get(candidate.id) === currentSlide.get(node.id) && restored.has(textOf(candidate) ?? ""));
    const beforeText = typeof before === "string" ? before : textOf(before) ?? sameId;
    if (beforeText !== null) restored.delete(beforeText);
    const proposedText = typeof before === "object" ? at(before.id) : at(node.id);
    conflicts.push({ target: node.id, slideId: node.slideId, source: beforeText, current: text, proposed: proposedText });
  }
  for (const node of source) {
    const text = textOf(node);
    if (text === null || !restored.has(text)) continue;
    restored.delete(text);
    conflicts.push({ target: node.id, slideId: node.slideId, source: text, current: null, proposed: text });
  }
  return { conflicts };
}
