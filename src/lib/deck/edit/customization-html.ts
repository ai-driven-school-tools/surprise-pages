import {type DefaultTreeAdapterMap} from "parse5";
import {sourceTree} from "../../html/source-index";
import { z } from "zod";
import { DECK_ID, deckIdSchema, deckOverridesSchema, jsonForHtml, type DeckOverrides } from "../design/design";
import {
  DECK_FOCUS_MARK,
  DECK_FOCUS_OVERRIDES_MARK,
  DECK_TARGET_MARKS,
  deckFocusOverridesSchema,
  deckFocusSchema,
  effectiveDeckFocus,
  emptyFocusOverrides,
  hasFocusOverrides,
  inventoryKey,
  stepPublicSupplement,
  type DeckFocus,
  type DeckFocusOverrides,
  type EffectiveDeckFocus,
  type FocusTargetInventory,
} from "../design/focus";
import {
  DECK_LOGO_MARK,
  DECK_LOGO_OVERRIDES_MARK,
  deckLogoOverridesSchema,
  deckLogoSchema,
  emptyLogoOverrides,
  hasLogoOverrides,
  type DeckLogo,
  type DeckLogoOverrides,
} from "../media/logo";

type Node = DefaultTreeAdapterMap["node"];
type Element = DefaultTreeAdapterMap["element"];
type Region = { from: number; to: number; textFrom: number; textTo: number };

export const DECK_CUSTOMIZATION_VERSION = 1;
export const deckCustomizationSchema = z.object({
  version: z.literal(DECK_CUSTOMIZATION_VERSION),
  appearance: deckOverridesSchema.optional(),
  focus: deckFocusOverridesSchema.optional(),
  logo: deckLogoOverridesSchema.optional(),
}).strict();
export type DeckCustomization = z.infer<typeof deckCustomizationSchema>;

export class DeckCustomizationError extends Error {
  constructor(message = "スライドの保存設定を引き継げません。原稿を確認してください") { // i18n-keep: 配布する検査（bin/deck-design-check.mjs）に束ねられる。画面では同じ文の辞書（decks.saveErrors）を localizeStored で訳す
    super(message);
    this.name = "DeckCustomizationError";
  }
}

function attr(node: Element, name: string): string | undefined {
  return node.attrs.find((item) => item.name === name)?.value;
}

function allElements(root: Node): Element[] {
  const result: Element[] = [];
  const walk = (node: Node) => {
    if ("tagName" in node) result.push(node);
    if ("childNodes" in node) node.childNodes.forEach(walk);
  };
  walk(root);
  return result;
}

function markedRegion(nodes: readonly Element[], mark: string): Region | null {
  const found = nodes.filter((node) => attr(node, mark) !== undefined);
  if (found.length === 0) return null;
  const node = found[0];
  const location = node.sourceCodeLocation;
  if (found.length !== 1 || node.tagName !== "script" || attr(node, "type") !== "application/json" ||
      !location?.startTag || !location.endTag || !node.parentNode || !("tagName" in node.parentNode) ||
      node.parentNode.tagName !== "head") {
    throw new DeckCustomizationError("スライド設定の置き方が正しくありません。原稿を確認してください"); // i18n-keep: 配布する検査（bin/deck-design-check.mjs）に束ねられる。画面では同じ文の辞書（decks.saveErrors）を localizeStored で訳す
  }
  return {
    from: location.startOffset,
    to: location.endOffset,
    textFrom: location.startTag.endOffset,
    textTo: location.endTag.startOffset,
  };
}

function parseJson(text: string): unknown {
  if (new TextEncoder().encode(text).length > 512 * 1024) {
    throw new DeckCustomizationError("スライド設定が大きすぎます"); // i18n-keep: 配布する検査（bin/deck-design-check.mjs）に束ねられる。画面では同じ文の辞書（decks.saveErrors）を localizeStored で訳す
  }
  return JSON.parse(text);
}

function parsedScript<T>(
  html: string,
  nodes: readonly Element[],
  mark: string,
  schema: z.ZodType<T>,
): { value: T; region: Region } | null {
  const found = markedRegion(nodes, mark);
  if (found === null) return null;
  return { value: schema.parse(parseJson(html.slice(found.textFrom, found.textTo))), region: found };
}

function childElements(root: Element): Element[] {
  return allElements(root).filter((element) => element !== root);
}

function targetInventory(slides: readonly Element[]): FocusTargetInventory {
  const inventory = new Map<string, ReadonlySet<string>>();
  for (const slide of slides) {
    const slideId = deckIdSchema.parse(attr(slide, DECK_ID));
    for (const [kindText, mark] of Object.entries(DECK_TARGET_MARKS)) {
      const kind = z.enum([
        "element", "row", "column", "cell", "series", "point", "range", "region", "node", "edge",
      ]).parse(kindText);
      const ids = childElements(slide)
        .map((element) => attr(element, mark))
        .filter((value) => value !== undefined)
        .map((value) => deckIdSchema.parse(value));
      if (new Set(ids).size !== ids.length) {
        throw new DeckCustomizationError(`スライド「${slideId}」の対象の目印が重複しています`); // i18n-keep: 配布する検査（bin/deck-design-check.mjs）に束ねられる。画面では同じ文の辞書（decks.saveErrors）を localizeStored で訳す
      }
      inventory.set(inventoryKey(slideId, kind), new Set(ids));
    }
  }
  return inventory;
}

export type DeckCustomizationSource = {
  slideIds: readonly string[];
  inventory: FocusTargetInventory;
  focus: {
    authored: DeckFocus;
    overrides: DeckFocusOverrides;
    effective: EffectiveDeckFocus;
    authoredRegion: Region;
    savedRegion: Region | null;
  } | null;
  logo: {
    authored: DeckLogo;
    overrides: DeckLogoOverrides;
    authoredRegion: Region;
    savedRegion: Region | null;
    invalidSlideIds: readonly string[];
  } | null;
};

export function readDeckCustomizationHtml(html: string): DeckCustomizationSource | null {
  try {
    const document = sourceTree(html);
    const nodes = allElements(document);
    const focusAuthored = parsedScript(html, nodes, DECK_FOCUS_MARK, deckFocusSchema);
    const focusSaved = parsedScript(html, nodes, DECK_FOCUS_OVERRIDES_MARK, deckFocusOverridesSchema);
    const logoAuthored = parsedScript(html, nodes, DECK_LOGO_MARK, deckLogoSchema);
    const logoSaved = parsedScript(html, nodes, DECK_LOGO_OVERRIDES_MARK, deckLogoOverridesSchema);
    if (focusAuthored === null && focusSaved === null && logoAuthored === null && logoSaved === null) return null;
    if (focusAuthored === null && focusSaved !== null) throw new DeckCustomizationError();
    if (logoAuthored === null && logoSaved !== null) throw new DeckCustomizationError();
    const body = nodes.find((node) => node.tagName === "body" && attr(node, "data-deck") !== undefined);
    if (body === undefined) throw new DeckCustomizationError("スライド設定がありますが、スライド本文が見つかりません"); // i18n-keep: 配布する検査（bin/deck-design-check.mjs）に束ねられる。画面では同じ文の辞書（decks.saveErrors）を localizeStored で訳す
    const slides = nodes.filter((node) => node.tagName === "section" && attr(node, "data-deck-slide") !== undefined);
    const slideIds = slides.map((slide) => deckIdSchema.parse(attr(slide, DECK_ID)));
    if (new Set(slideIds).size !== slideIds.length) {
      throw new DeckCustomizationError("スライドの目印が正しくありません"); // i18n-keep: 配布する検査（bin/deck-design-check.mjs）に束ねられる。画面では同じ文の辞書（decks.saveErrors）を localizeStored で訳す
    }
    const inventory = targetInventory(slides);
    const slideIdSet = new Set(slideIds);
    if (focusAuthored !== null && Object.keys(focusAuthored.value.slides).some((id) => !slideIdSet.has(id))) {
      throw new DeckCustomizationError("原稿側の焦点設定に、見つからないスライドの目印があります"); // i18n-keep: 配布する検査（bin/deck-design-check.mjs）に束ねられる。画面では同じ文の辞書（decks.saveErrors）を localizeStored で訳す
    }
    if (logoAuthored !== null && Object.keys(logoAuthored.value.slides).some((id) => !slideIdSet.has(id))) {
      throw new DeckCustomizationError("原稿側のロゴ設定に、見つからないスライドの目印があります"); // i18n-keep: 配布する検査（bin/deck-design-check.mjs）に束ねられる。画面では同じ文の辞書（decks.saveErrors）を localizeStored で訳す
    }
    const focusOverrides = focusSaved?.value ?? emptyFocusOverrides();
    const logoOverrides = logoSaved?.value ?? emptyLogoOverrides();
    return {
      slideIds,
      inventory,
      focus: focusAuthored === null ? null : {
        authored: focusAuthored.value,
        overrides: focusOverrides,
        effective: effectiveDeckFocus(focusAuthored.value, focusOverrides, slideIdSet, inventory),
        authoredRegion: focusAuthored.region,
        savedRegion: focusSaved?.region ?? null,
      },
      logo: logoAuthored === null ? null : {
        authored: logoAuthored.value,
        overrides: logoOverrides,
        authoredRegion: logoAuthored.region,
        savedRegion: logoSaved?.region ?? null,
        invalidSlideIds: Object.keys(logoOverrides.slides).filter((id) => !slideIdSet.has(id)),
      },
    };
  } catch (error) {
    if (error instanceof DeckCustomizationError) throw error;
    throw new DeckCustomizationError("焦点またはロゴの設定が正しくありません。原稿を確認してください"); // i18n-keep: 配布する検査（bin/deck-design-check.mjs）に束ねられる。画面では同じ文の辞書（decks.saveErrors）を localizeStored で訳す
  }
}

function block(mark: string, value: unknown): string {
  return `<script type="application/json" ${mark}>${jsonForHtml(value)}</script>`;
}

function replaceSaved(
  html: string,
  authoredMark: string,
  savedMark: string,
  value: unknown,
  keep: boolean,
): string {
  const nodes = allElements(sourceTree(html));
  const authored = markedRegion(nodes, authoredMark);
  const saved = markedRegion(nodes, savedMark);
  if (authored === null) throw new DeckCustomizationError();
  const next = keep ? block(savedMark, value) : "";
  if (saved !== null) return html.slice(0, saved.from) + next + html.slice(saved.to);
  return html.slice(0, authored.to) + next + html.slice(authored.to);
}

/** Replace only saved settings; the author's HTML and authored settings remain byte-for-byte intact. */
export function withDeckCustomization(html: string, value: DeckCustomization): string {
  const customization = deckCustomizationSchema.parse(value);
  let next = html;
  if (customization.focus !== undefined) {
    next = replaceSaved(
      next,
      DECK_FOCUS_MARK,
      DECK_FOCUS_OVERRIDES_MARK,
      customization.focus,
      hasFocusOverrides(customization.focus),
    );
  }
  if (customization.logo !== undefined) {
    next = replaceSaved(
      next,
      DECK_LOGO_MARK,
      DECK_LOGO_OVERRIDES_MARK,
      customization.logo,
      hasLogoOverrides(customization.logo),
    );
  }
  readDeckCustomizationHtml(next);
  return next;
}

/** Source refresh keeps saved settings by stable IDs. Missing IDs stay invalid and are never reassigned. */
export function inheritDeckCustomizations(previous: string | null, incoming: string): string {
  if (previous === null) return incoming;
  const before = readDeckCustomizationHtml(previous);
  if (before === null) return incoming;
  let next = incoming;
  if (before.focus !== null && hasFocusOverrides(before.focus.overrides)) {
    next = withDeckCustomization(next, {
      version: DECK_CUSTOMIZATION_VERSION,
      focus: before.focus.overrides,
    });
  }
  if (before.logo !== null && hasLogoOverrides(before.logo.overrides)) {
    next = withDeckCustomization(next, {
      version: DECK_CUSTOMIZATION_VERSION,
      logo: before.logo.overrides,
    });
  }
  return next;
}

/** Active browser-managed logo assets that publication cleanup must retain. */
export function deckLogoAssetPaths(html: string): readonly string[] {
  const source = readDeckCustomizationHtml(html);
  if (source?.logo === null || source?.logo === undefined) return [];
  const asset = source.logo.overrides.asset === undefined
    ? source.logo.authored.asset
    : source.logo.overrides.asset;
  return asset === null ? [] : [asset.path];
}

/** Source comparison ignores only browser-saved focus/logo settings. Authored data stays significant. */
export function withoutDeckCustomizations(html: string): string {
  try {
    const source = readDeckCustomizationHtml(html);
    if (source === null) return html;
    const regions = [source.focus?.savedRegion, source.logo?.savedRegion]
      .filter((region) => region !== null && region !== undefined)
      .sort((left, right) => right.from - left.from);
    let next = html;
    for (const region of regions) next = next.slice(0, region.from) + next.slice(region.to);
    return next;
  } catch {
    // Malformed settings must remain visible to the comparison instead of hiding an authored change.
    return html;
  }
}

function escapePublicText(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

/** Materialize public focus supplements for server text extraction in the same slide order as the runtime. */
export function withDeckPublicSupplements(html: string): string {
  if (!html.includes(DECK_FOCUS_MARK)) return html;
  try {
    const parsed = allElements(sourceTree(html));
    if (parsed.some((node) => attr(node, "data-deck-focus-supplements") !== undefined)) return html;
    const source = readDeckCustomizationHtml(html);
    if (source?.focus === null || source?.focus === undefined) return html;
    const nodes = allElements(sourceTree(html));
    const insertions: { at: number; text: string }[] = [];
    for (const slide of nodes.filter((node) => node.tagName === "section" && attr(node, "data-deck-slide") !== undefined)) {
      const id = attr(slide, DECK_ID);
      const location = slide.sourceCodeLocation;
      if (id === undefined || location?.endTag === undefined) continue;
      const lines = (source.focus.effective.slides.get(id) ?? []).flatMap((step) => {
        const supplement = stepPublicSupplement(step);
        return supplement === null ? [] : [`<p>${escapePublicText(step.title ? `${step.title}: ${supplement}` : supplement)}</p>`];
      });
      if (lines.length === 0) continue;
      insertions.push({ at: location.endTag.endOffset, text: `<div data-deck-focus-supplements>${lines.join("")}</div>` });
    }
    let next = html;
    for (const insertion of insertions.sort((left, right) => right.at - left.at)) {
      next = next.slice(0, insertion.at) + insertion.text + next.slice(insertion.at);
    }
    return next;
  } catch {
    return html;
  }
}

export function customizationForSave(
  appearance: DeckOverrides | undefined,
  focus: DeckFocusOverrides | undefined,
  logo: DeckLogoOverrides | undefined,
): DeckCustomization {
  return deckCustomizationSchema.parse({
    version: DECK_CUSTOMIZATION_VERSION,
    ...(appearance === undefined ? {} : { appearance }),
    ...(focus === undefined ? {} : { focus }),
    ...(logo === undefined ? {} : { logo }),
  });
}
