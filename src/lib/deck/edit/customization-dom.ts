import { deckIdSchema, jsonForHtml } from "../design/design";
import {
  DECK_FOCUS_MARK,
  DECK_FOCUS_OVERRIDES_MARK,
  DECK_TARGET_MARKS,
  deckFocusOverridesSchema,
  deckFocusSchema,
  effectiveDeckFocus,
  emptyFocusOverrides,
  focusTargetKindSchema,
  hasFocusOverrides,
  inventoryKey,
  stepPublicSupplement,
  type FocusTargetInventory,
} from "../design/focus";
import {
  DECK_LOGO_MARK,
  DECK_LOGO_OVERRIDES_MARK,
  deckLogoOverridesSchema,
  deckLogoSchema,
  emptyLogoOverrides,
  hasLogoOverrides,
  type DeckLogoOverrides,
} from "../media/logo";
import type { DeckFocusOverrides } from "../design/focus";

function scriptText(doc: Document, mark: string): string | null {
  const nodes = doc.querySelectorAll(`head > script[type="application/json"][${mark}]`);
  if (nodes.length === 0) return null;
  if (nodes.length !== 1) throw new Error("スライド設定が重複しています"); // i18n-keep: 保存済みページの実行部に束ねられる内部の失敗（画面には出さない）
  return nodes[0].textContent ?? "";
}

const targetMarks = Object.entries(DECK_TARGET_MARKS).map(([kind, mark]) => ({kind: focusTargetKindSchema.parse(kind), mark}));
const targetSelector = targetMarks.map(({mark}) => `[${mark}]`).join(",");

function inventoryOf(slides: readonly HTMLElement[]): FocusTargetInventory {
  const result = new Map<string, ReadonlySet<string>>();
  for (const slide of slides) {
    const slideId = deckIdSchema.parse(slide.getAttribute("data-deck-id"));
    const groups = targetMarks.map(({kind, mark}) => ({mark, key: inventoryKey(slideId, kind), ids: new Set<string>()}));
    for (const node of slide.querySelectorAll(targetSelector)) {
      for (const group of groups) {
        const value = node.getAttribute(group.mark);
        if (value === null) continue;
        const id = deckIdSchema.parse(value);
        if (group.ids.has(id)) throw new Error("焦点の目印が重複しています"); // i18n-keep: 保存済みページの実行部に束ねられる内部の失敗（画面には出さない）
        group.ids.add(id);
      }
    }
    for (const group of groups) result.set(group.key, group.ids);
  }
  return result;
}

export function readDeckCustomization(doc: Document) {
  try {
    if (!doc.body.hasAttribute("data-deck")) return null;
    const slides = [...doc.querySelectorAll<HTMLElement>("section[data-deck-slide]")];
    const slideIds = slides.map((slide) => deckIdSchema.parse(slide.getAttribute("data-deck-id")));
    if (new Set(slideIds).size !== slideIds.length) return null;
    const focusText = scriptText(doc, DECK_FOCUS_MARK);
    const focusSavedText = scriptText(doc, DECK_FOCUS_OVERRIDES_MARK);
    const logoText = scriptText(doc, DECK_LOGO_MARK);
    const logoSavedText = scriptText(doc, DECK_LOGO_OVERRIDES_MARK);
    const focus = focusText === null ? null : deckFocusSchema.parse(JSON.parse(focusText));
    const focusOverrides = focusSavedText === null
      ? emptyFocusOverrides()
      : deckFocusOverridesSchema.parse(JSON.parse(focusSavedText));
    const logo = logoText === null ? null : deckLogoSchema.parse(JSON.parse(logoText));
    const logoOverrides = logoSavedText === null
      ? emptyLogoOverrides()
      : deckLogoOverridesSchema.parse(JSON.parse(logoSavedText));
    if ((focus === null && focusSavedText !== null) || (logo === null && logoSavedText !== null)) return null;
    const inventory = inventoryOf(slides);
    const slideIdSet = new Set(slideIds);
    if (focus !== null && Object.keys(focus.slides).some((id) => !slideIdSet.has(id))) return null;
    if (logo !== null && Object.keys(logo.slides).some((id) => !slideIdSet.has(id))) return null;
    return {
      slideIds,
      inventory,
      focus: focus === null ? null : {
        authored: focus,
        overrides: focusOverrides,
        effective: effectiveDeckFocus(focus, focusOverrides, slideIdSet, inventory),
      },
      logo: logo === null ? null : {
        authored: logo,
        overrides: logoOverrides,
        invalidSlideIds: Object.keys(logoOverrides.slides).filter((id) => !slideIds.includes(id)),
      },
    };
  } catch {
    return null;
  }
}

function writeSettings(
  doc: Document,
  authoredMark: string,
  savedMark: string,
  value: unknown,
  keep: boolean,
): void {
  const authored = doc.head.querySelector(`script[type="application/json"][${authoredMark}]`);
  if (authored === null) throw new Error("原稿側のスライド設定が見つかりません"); // i18n-keep: 保存済みページの実行部に束ねられる内部の失敗（画面には出さない）
  const saved = doc.head.querySelector(`script[type="application/json"][${savedMark}]`);
  if (!keep) {
    saved?.remove();
    return;
  }
  const target = saved ?? doc.createElement("script");
  target.setAttribute("type", "application/json");
  target.setAttribute(savedMark, "");
  target.textContent = jsonForHtml(value);
  if (saved === null) authored.after(target);
}

export function writeDeckFocusOverrides(doc: Document, value: DeckFocusOverrides): void {
  const parsed = deckFocusOverridesSchema.parse(value);
  writeSettings(doc, DECK_FOCUS_MARK, DECK_FOCUS_OVERRIDES_MARK, parsed, hasFocusOverrides(parsed));
}

export function writeDeckLogoOverrides(doc: Document, value: DeckLogoOverrides): void {
  const parsed = deckLogoOverridesSchema.parse(value);
  writeSettings(doc, DECK_LOGO_MARK, DECK_LOGO_OVERRIDES_MARK, parsed, hasLogoOverrides(parsed));
}

/** Ensure static DOM readers see the same public supplement order as server extraction and the deck runtime. */
export function ensureDeckPublicSupplements(doc: Document): void {
  const source = readDeckCustomization(doc);
  if (source?.focus === null || source?.focus === undefined) return;
  const appendix = doc.querySelector<HTMLElement>("[data-deck-focus-supplement-pages]");
  const pages: HTMLElement[] = [];
  for (const [slideIndex, slideId] of source.slideIds.entries()) {
    // slideId already passed deckIdSchema, so it contains no selector punctuation.
    const slide = doc.querySelector(`section[data-deck-id="${slideId}"]`);
    if (slide === null) continue;
    const lines = (source.focus.effective.slides.get(slideId) ?? []).flatMap((step) => {
      const supplement = stepPublicSupplement(step);
      return supplement === null ? [] : [(step.title ? `${step.title}: ` : "") + supplement];
    });
    const frame = slide.closest("[data-deck-frame]");
    const adjacent = slide.nextElementSibling;
    const existing = frame?.querySelector<HTMLElement>(":scope > [data-deck-focus-supplements]") ??
      (adjacent?.hasAttribute("data-deck-focus-supplements") ? slide.parentElement?.querySelector<HTMLElement>(`section[data-deck-id="${slideId}"] + [data-deck-focus-supplements]`) ?? null : null);
    if (lines.length === 0 && existing === null) continue;
    const holder = existing ?? doc.createElement("div");
    holder.setAttribute("data-deck-focus-supplements", "");
    const current = [...holder.children].map((line) => line.textContent ?? "");
    if (current.length !== lines.length || current.some((line, index) => line !== lines[index])) {
      holder.replaceChildren(...lines.map((text) => { const line = doc.createElement("p"); line.textContent = text; return line; }));
    }
    holder.hidden = lines.length === 0;
    if (frame) frame.toggleAttribute("data-deck-has-focus-supplements", lines.length > 0);
    if (existing === null) { if (frame) frame.append(holder); else slide.after(holder); }
    if (appendix && lines.length > 0) {
      const page = doc.createElement("section"); page.setAttribute("data-deck-focus-supplement-page", "");
      const heading = doc.createElement("h2");
      const title = slide.querySelector("h1,h2,h3")?.textContent?.trim();
      heading.textContent = `補足 — ${slideIndex + 1}枚目${title ? `: ${title}` : ""}`; // i18n-keep: 保存済みページの実行部に束ねられる（印刷の補足の見出しは本文の一部）
      page.append(heading, ...lines.map((text) => { const line = doc.createElement("p"); line.textContent = text; return line; }));
      pages.push(page);
    }
  }
  if (appendix) {
    const current = [...appendix.children].map((page) => page.textContent);
    if (current.length !== pages.length || current.some((text, index) => text !== pages[index].textContent)) appendix.replaceChildren(...pages);
    appendix.hidden = pages.length === 0;
  }
}
