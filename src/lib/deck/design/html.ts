import {type DefaultTreeAdapterMap} from "parse5";
import {sourceTree} from "../../html/source-index";
import {
  DECK_APPEARANCE_MARK, DECK_DESIGN_MARK, DECK_ID, deckDesignSchema, deckIdSchema,
  deckOverridesSchema, needsExtendedStyle, hasExtendedStyle, emptyOverrides, hasOverrides, jsonForHtml, parseDesignJson,
  DECK_SCHOOL_MARK, needsSchool, DECK_DIAGONAL_MARK, needsDiagonal, type DeckDesign, type DeckOverrides,
} from "./design";

type Node = DefaultTreeAdapterMap["node"];
type Element = DefaultTreeAdapterMap["element"];
type Region = { from: number; to: number; textFrom: number; textTo: number };
export class DeckDesignError extends Error {
  constructor(message = "デザイン設定を引き継げません。新しいスライド作成スキルで原稿を確認してください") { // i18n-keep: 配布する検査（bin/deck-design-check.mjs）に束ねられる。画面では同じ文の辞書（decks.saveErrors）を localizeStored で訳す
    super(message); this.name = "DeckDesignError";
  }
}
function elements(html: string): Element[] {
  const result: Element[] = [];
  const walk = (node: Node) => {
    if ("tagName" in node) result.push(node);
    if ("childNodes" in node) node.childNodes.forEach(walk);
  };
  walk(sourceTree(html));
  return result;
}
function attr(node: Element, name: string): string | undefined {
  return node.attrs.find((item) => item.name === name)?.value;
}
function region(nodes: Element[], mark: string): Region | null {
  const found = nodes.filter((node) => attr(node, mark) !== undefined);
  if (found.length === 0) return null;
  const node = found[0], loc = node.sourceCodeLocation;
  if (found.length !== 1 || node.tagName !== "script" || attr(node, "type") !== "application/json" ||
      !loc?.startTag || !loc.endTag || (!node.parentNode || !("tagName" in node.parentNode)) || node.parentNode.tagName !== "head") {
    throw new DeckDesignError("デザイン設定の置き方が正しくありません。原稿を確認してください"); // i18n-keep: 配布する検査（bin/deck-design-check.mjs）に束ねられる。画面では同じ文の辞書（decks.saveErrors）を localizeStored で訳す
  }
  return { from: loc.startOffset, to: loc.endOffset, textFrom: loc.startTag.endOffset, textTo: loc.endTag.startOffset };
}
export function readDeckDesignHtml(html: string): {
  design: DeckDesign; overrides: DeckOverrides; ids: string[]; saved: Region | null; authored: Region; supportsStyles: boolean; supportsDiagonal: boolean; supportsSchool: boolean;
} | null {
  const nodes = elements(html);
  const authored = region(nodes, DECK_DESIGN_MARK);
  const saved = region(nodes, DECK_APPEARANCE_MARK);
  if (!authored) {
    if (saved) throw new DeckDesignError();
    return null;
  }
  try {
    if (!nodes.some((node) => node.tagName === "body" && attr(node, "data-deck") !== undefined)) throw new Error();
    const design = deckDesignSchema.parse(parseDesignJson(html.slice(authored.textFrom, authored.textTo)));
    const overrides = saved ? deckOverridesSchema.parse(parseDesignJson(html.slice(saved.textFrom, saved.textTo))) : emptyOverrides();
    const supportsStyles = nodes.some(node=>attr(node,"data-deck-design-runtime")==="3") && nodes.some(node=>attr(node,"data-deck-design-style")==="3");
    if(needsExtendedStyle(design,overrides) && !supportsStyles) throw new Error();
    const supportsDiagonal = ['style','script'].every(tag => nodes.some(node => node.tagName === tag && attr(node, DECK_DIAGONAL_MARK) !== undefined));
    if(needsDiagonal(design.document,...Object.values(design.slides),overrides.document,...Object.values(overrides.slides)) && !supportsDiagonal) throw new Error();
    const supportsSchool = ["style","script"].every(tag => nodes.some(node => node.tagName === tag && attr(node, DECK_SCHOOL_MARK) !== undefined));
    if(needsSchool(design.document,...Object.values(design.slides),overrides.document,...Object.values(overrides.slides)) && !supportsSchool) throw new Error();
    const slides = nodes.filter((node) => node.tagName === "section" && attr(node, "data-deck-slide") !== undefined);
    const ids = slides.map((node) => deckIdSchema.parse(attr(node, DECK_ID)));
    if (new Set(ids).size !== ids.length) throw new Error();
    if ([...Object.keys(design.slides), ...Object.keys(overrides.slides)].some((id) => !ids.includes(id))) throw new Error();
    return { design, overrides, ids, saved, authored, supportsStyles, supportsDiagonal, supportsSchool };
  } catch {
    throw new DeckDesignError("デザイン設定かスライドの目印が正しくありません。原稿を確認してください"); // i18n-keep: 配布する検査（bin/deck-design-check.mjs）に束ねられる。画面では同じ文の辞書（decks.saveErrors）を localizeStored で訳す
  }
}

/** Only replace our settings region. Never reserialize the author's HTML. */
export function withDeckOverrides(html: string, value: DeckOverrides): string {
  const source = readDeckDesignHtml(html);
  if (!source) throw new DeckDesignError();
  const overrides = deckOverridesSchema.parse(value);
  if(!source.supportsStyles && [overrides.document,...Object.values(overrides.slides)].some(hasExtendedStyle)) throw new DeckDesignError("書体とあしらいに対応する新しい共通部品で、原稿を更新してください"); // i18n-keep: 配布する検査（bin/deck-design-check.mjs）に束ねられる。画面では同じ文の辞書（decks.saveErrors）を localizeStored で訳す
  if(!source.supportsDiagonal && needsDiagonal(overrides.document,...Object.values(overrides.slides))) throw new DeckDesignError("斜めのあしらいに対応する新しい共通部品で、原稿を更新してください"); // i18n-keep: 配布する検査（bin/deck-design-check.mjs）に束ねられる。画面では同じ文の辞書（decks.saveErrors）を localizeStored で訳す
  if(!source.supportsSchool && needsSchool(overrides.document,...Object.values(overrides.slides))) throw new DeckDesignError("AI-Driven Schoolに対応する新しい共通部品で、原稿を更新してください"); // i18n-keep: 配布する検査（bin/deck-design-check.mjs）に束ねられる。画面では同じ文の辞書（decks.saveErrors）を localizeStored で訳す
  if (Object.keys(overrides.slides).some((id) => !source.ids.includes(id))) throw new DeckDesignError();
  const block = hasOverrides(overrides)
    ? `<script type="application/json" ${DECK_APPEARANCE_MARK}>${jsonForHtml(overrides)}</script>` : "";
  if (source.saved) return html.slice(0, source.saved.from) + block + html.slice(source.saved.to);
  return html.slice(0, source.authored.to) + block + html.slice(source.authored.to);
}

/** Publication only. Browser saves already contain the user's intended settings. */
export function inheritDeckOverrides(previous: string | null, incoming: string): string {
  const next = readDeckDesignHtml(incoming);
  const before = previous ? readDeckDesignHtml(previous) : null;
  if (!before || !hasOverrides(before.overrides)) return incoming;
  if (!next) throw new DeckDesignError();
  const slides = Object.fromEntries(Object.entries(before.overrides.slides).filter(([id]) => next.ids.includes(id)));
  return withDeckOverrides(incoming, { ...before.overrides, slides });
}

/** The source comparison ignores saved appearance, never authored styles/content.
 * Invalid/unknown settings remain visible in the comparison, not silently stripped. */
export function withoutDeckOverrides(html: string): string {
  try {
    const source = readDeckDesignHtml(html);
    if (!source?.saved) return html;
    return html.slice(0, source.saved.from) + html.slice(source.saved.to);
  } catch { return html; }
}
