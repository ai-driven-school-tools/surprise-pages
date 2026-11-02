import type {} from "../lib/deck/render-contract";
import { canPlaceDeckLogo, deckLogoRatio, type EffectiveLogo } from "../lib/deck/media/logo";
import { DECK_LOGO_VIEW as DECK_LOGO_VIEW_MARK } from "../lib/deck/deck";

function safePlacements(slide: HTMLElement): ReadonlySet<string> {
  return new Set((slide.getAttribute("data-dd-logo-safe") ?? "").split(/\s+/).filter(Boolean));
}

function clearLogo(slide: HTMLElement): void {
  slide.querySelector(`[${DECK_LOGO_VIEW_MARK}]`)?.remove();
  slide.removeAttribute("data-dd-logo-collision-avoided");
}

/** Paints a presentation-only copy. The source settings remain in the head.
 * The reserved box includes transparent file padding, which is conservative for collision checks. */
function lightInkOf(slide: HTMLElement): boolean {
  const ink = ((slide.ownerDocument.defaultView?.getComputedStyle(slide).getPropertyValue("--dd-text") ?? "").match(/\d+(?:\.\d+)?/g) ?? []).slice(0, 3).map(Number);
  return ink.length === 3 && ink.every(Number.isFinite) && ink.reduce((sum, value) => sum + value, 0) > 384;
}
export function paintDeckLogo(slide: HTMLElement, effective: EffectiveLogo, lightInk?: boolean): HTMLElement | null {
  clearLogo(slide);
  if (effective === null || effective.presentation.placement === "hidden") return null;
  const { asset, presentation } = effective;
  const width = 1280 * presentation.size / 100;
  const ratio = deckLogoRatio(effective);
  if (!canPlaceDeckLogo(safePlacements(slide), slide.getAttribute("data-deck-typography") ?? undefined, effective)) {
    slide.setAttribute("data-dd-logo-collision-avoided", "hidden");
    return null;
  }

  const mark = document.createElement("span");
  mark.className = "dd-brand-mark";
  mark.setAttribute(DECK_LOGO_VIEW_MARK, "");
  mark.setAttribute("aria-hidden", "true");
  mark.setAttribute("data-dd-logo-placement", presentation.placement);
  mark.setAttribute("data-dd-logo-color", presentation.color);
  mark.setAttribute("data-dd-logo-backplate", String(presentation.backplate));

  mark.style.setProperty("--dd-logo-box-width", `${width}px`);
  mark.style.setProperty("--dd-logo-box-height", `${width * ratio}px`);
  mark.style.setProperty("--dd-logo-invert", (lightInk ?? lightInkOf(slide)) ? "1" : "0");
  mark.style.setProperty("--dd-logo-opacity", String(Math.min(presentation.placement === "watermark" ? 18 : 100, presentation.opacity) / 100));
  mark.style.setProperty("--dd-logo-edge-x", `${presentation.offsetX}px`);
  mark.style.setProperty("--dd-logo-edge-y", `${presentation.offsetY}px`);
  mark.style.setProperty("--dd-logo-nudge-x", `${presentation.nudgeX}px`);
  mark.style.setProperty("--dd-logo-nudge-y", `${presentation.nudgeY}px`);

  const image = document.createElement("img");
  const preview=slide.ownerDocument.deckPreviewLogo;
  image.src = preview?.path === asset.path ? preview.url : asset.path;
  if (presentation.variant === "mark" && asset.mark) {
    const crop = asset.mark;
    mark.style.overflow = "hidden";
    image.style.width = `${100 / crop.width}%`;
    image.style.height = `${100 / crop.height}%`;
    image.style.maxWidth = "none";
    image.style.justifySelf = "start";
    image.style.alignSelf = "start";
    image.style.transform = `translate(${-100 * crop.x}%, ${-100 * crop.y}%)`;
  }
  image.alt = "";
  image.decoding = "async";
  mark.append(image);
  slide.append(mark);
  return mark;
}

export function paintDeckLogos(slides: readonly HTMLElement[], values: ReadonlyMap<string, EffectiveLogo>): void {
  // Read computed colours before removing/inserting marks. Alternating those
  // reads and writes forces layout once per slide in a large document.
  const prepared = slides.map(slide => {
    const id = slide.getAttribute("data-deck-id");
    const value = id === null ? null : values.get(id) ?? null;
    return {slide,value,lightInk:value !== null && value.presentation.placement !== "hidden" ? lightInkOf(slide) : false};
  });
  for (const item of prepared) paintDeckLogo(item.slide, item.value, item.lightInk);
}
