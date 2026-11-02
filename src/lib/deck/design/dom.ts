import { deckTypography } from "./typography";
import { deckBackground } from "./background";
import {
  appearanceColors, effectiveAppearance, DECK_APPEARANCE_MARK, DECK_DESIGN_MARK, DECK_ID, deckDesignSchema, deckIdSchema,
  deckOverridesSchema, needsExtendedStyle, emptyOverrides, hasOverrides, jsonForHtml, parseDesignJson,
  DECK_SCHOOL_MARK, needsSchool, DECK_DIAGONAL_MARK, needsDiagonal, type DeckDesign, type DeckOverrides,
} from "./design";

export function readDeckDesign(doc: Document): { design: DeckDesign; overrides: DeckOverrides; ids: string[] } | null {
  try {
    const authored = doc.querySelectorAll(`script[${DECK_DESIGN_MARK}]`);
    const saved = doc.querySelectorAll(`script[${DECK_APPEARANCE_MARK}]`);
    if (authored.length !== 1 || saved.length > 1 || !doc.body.hasAttribute("data-deck")) return null;
    for (const node of [...authored, ...saved]) {
      if (node.parentElement !== doc.head || node.getAttribute("type") !== "application/json") return null;
    }
    const design = deckDesignSchema.parse(parseDesignJson(authored[0].textContent ?? ""));
    const overrides = saved[0] ? deckOverridesSchema.parse(parseDesignJson(saved[0].textContent ?? "")) : emptyOverrides();
    if(needsExtendedStyle(design,overrides) && !(doc.querySelector('[data-deck-design-runtime="3"]') && doc.querySelector('[data-deck-design-style="3"]'))) return null;
    if(needsDiagonal(design.document,...Object.values(design.slides),overrides.document,...Object.values(overrides.slides)) && !supportsDiagonal(doc)) return null;
    if(needsSchool(design.document,...Object.values(design.slides),overrides.document,...Object.values(overrides.slides)) && !supportsSchool(doc)) return null;
    const ids = [...doc.querySelectorAll("section[data-deck-slide]")].map((node) => deckIdSchema.parse(node.getAttribute(DECK_ID)));
    if (ids.length !== new Set(ids).size ||
        [...Object.keys(design.slides), ...Object.keys(overrides.slides)].some((id) => !ids.includes(id))) return null;
    return { design, overrides, ids };
  } catch { return null; }
}

export function supportsSchool(doc: Document): boolean {
  return ["style","script"].every(tag => doc.head.querySelector(`${tag}[${DECK_SCHOOL_MARK}]`));
}
export function supportsDiagonal(doc: Document): boolean {
  return ['style','script'].every(tag => doc.head.querySelector(`${tag}[${DECK_DIAGONAL_MARK}]`));
}

export function writeDeckOverrides(doc: Document, value: DeckOverrides): void {
  const overrides = deckOverridesSchema.parse(value);
  const existing = doc.head.querySelector(`script[${DECK_APPEARANCE_MARK}]`);
  if (!hasOverrides(overrides)) { existing?.remove(); return; }
  const element = existing ?? doc.createElement("script");
  element.setAttribute("type", "application/json");
  element.setAttribute(DECK_APPEARANCE_MARK, "");
  element.textContent = jsonForHtml(overrides);
  if (!existing) doc.head.querySelector(`script[${DECK_DESIGN_MARK}]`)?.after(element);
}

/** Rendering mutates only the preview/live document, never the stored master. */
export function paintDeckDesign(doc: Document, design: DeckDesign, overrides: DeckOverrides, only?: ReadonlySet<string>, slides: readonly HTMLElement[] = [...doc.querySelectorAll<HTMLElement>("section[data-deck-slide]")]): void {
  for (const slide of slides) {
    if (only && !only.has(slide.getAttribute(DECK_ID) ?? "")) continue;
    const appearance = effectiveAppearance(design, overrides, slide.getAttribute(DECK_ID) ?? undefined);
    const colors = appearanceColors(appearance);
    const typography = deckTypography(appearance.typography);
    slide.setAttribute("data-deck-typography", appearance.typography ?? "system");
    slide.setAttribute("data-deck-ornament", appearance.ornament ?? "none");
    const background = deckBackground(appearance);
    slide.setAttribute("data-deck-decoration", appearance.decoration);
    slide.setAttribute("data-deck-motion", String(appearance.motion));
    const variables: Record<string, string> = {
      "--dd-font-body": typography.body, "--dd-font-heading": typography.heading,
      "--dd-background-image": background.image, "--dd-background-size": background.size, "--dd-background-repeat": background.repeat,
      "--dd-bg": appearance.background, "--dd-accent": colors.accent, "--dd-secondary": appearance.secondary,
      "--dd-text": `rgb(${colors.text})`, "--dd-muted": `rgb(${colors.muted})`,
      "--dd-border": `rgb(${colors.border})`, "--dd-surface": `rgb(${colors.surface})`,
      "--dd-opacity": String(colors.opacity), "--dd-stage-opacity": String(colors.stageOpacity), "--dd-angle": `${appearance.angle}deg`,
      "--dd-x": `${appearance.x}%`, "--dd-y": `${appearance.y}%`, "--dd-size": `${appearance.scale * 2}%`,
      "--ads-text": colors.text, "--ads-muted": colors.muted, "--ads-border": colors.border,
      "--ads-surface": colors.surface,
    };
    for (const [key, value] of Object.entries(variables)) if (slide.style.getPropertyValue(key) !== value) slide.style.setProperty(key, value);
  }
}
