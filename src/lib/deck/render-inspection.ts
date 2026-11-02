import { deckEditor } from "../i18n/messages/ja/deckEditor";
import { imagePixelRequirements, IMAGE_QUALITY_DENSITY } from "../html/image-display-size";
import type { z } from "zod";
import type { agentIssueSchema } from "../page-agent/model";
const deckInspection = deckEditor.inspection;
const imagePixels = new WeakMap<HTMLImageElement, {src: string; width: number; height: number}>();
const vectorImage = (src: string) => /^(?:data:image\/svg\+xml)|\.svg(?:[?#]|$)/i.test(src);
/** Only self-contained vector geometry is exempt from pixel measurement. */
function pureVectorData(src: string, doc: Document): boolean {
  if (!/^data:image\/svg\+xml(?:;[^,]*)?,/i.test(src)) return false;
  try {
    const comma = src.indexOf(",");
    const xml = /;base64/i.test(src.slice(0, comma))
      ? atob(src.slice(comma + 1)) : decodeURIComponent(src.slice(comma + 1));
    const Parser = doc.defaultView?.DOMParser;
    if (!Parser) return false;
    const svg = new Parser().parseFromString(xml, "image/svg+xml");
    const tags = new Set(["svg", "g", "path", "rect", "circle", "ellipse", "line", "polyline", "polygon", "text", "tspan", "defs", "clipPath", "mask", "linearGradient", "radialGradient", "stop", "title", "desc"]);
    return svg.documentElement.localName === "svg" && [...svg.querySelectorAll("*")].every(element =>
      tags.has(element.localName) && [...element.attributes].every(attribute =>
        !/^(?:on|href$|src$)/i.test(attribute.localName) &&
        !/(?:url\s*\(|image-set\s*\(|@import|\\)/i.test(attribute.value)));
  } catch { return false; }
}
/** The 1280×720 canvas must have two source pixels per rendered pixel. */
export const DECK_IMAGE_DENSITY = IMAGE_QUALITY_DENSITY;
type Issue = z.infer<typeof agentIssueSchema>;
type LayoutNode = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: string;
  lineHeight: string;
  fontFamily: string;
  display: string;
  position: string;
  color: string;
  gap: string;
  justifyContent: string;
  alignItems: string;
  flexDirection: string;
  padding: string;
};
export function inspectDeckLayout(
  ids: readonly string[],
  doc: Document = document,
): { id: string; missing: boolean; issues: Issue[]; nodes?: LayoutNode[] }[] {
  return ids.map((id) => {
    const slide = [
      ...doc.querySelectorAll<HTMLElement>("section[data-deck-slide]"),
    ].find((el) => (el.getAttribute("data-deck-node") ?? el.getAttribute("data-deck-id")) === id);
    if (!slide) return { id, missing: true, issues: [] };
    doc.defaultView?.scrollTo(
      0,
      slide.getBoundingClientRect().top + (doc.defaultView?.scrollY ?? 0),
    );
    const bounds = slide.getBoundingClientRect(),
      scale = bounds.width / 1280,
      issues: Issue[] = [];
    const nodes: LayoutNode[] = [];
    const boxes: { el: HTMLElement; target: string; box: DOMRect }[] = [];
    for (const el of [
      slide,
      ...slide.querySelectorAll<HTMLElement>("[data-deck-node]"),
    ]) {
      const box = el.getBoundingClientRect(),
        style = doc.defaultView!.getComputedStyle(el),
        target = el.getAttribute("data-deck-node")!;
      if (
        style.display === "none" ||
        style.visibility === "hidden" ||
        !box.width ||
        !box.height
      )
        continue;
      nodes.push({
        id: target,
        x: Math.round((box.left - bounds.left) / scale),
        y: Math.round((box.top - bounds.top) / scale),
        width: Math.round(box.width / scale),
        height: Math.round(box.height / scale),
        fontSize: style.fontSize,
        lineHeight: style.lineHeight,
        fontFamily: style.fontFamily,
        display: style.display,
        position: style.position,
        color: style.color,
        gap: style.gap,
        justifyContent: style.justifyContent,
        alignItems: style.alignItems,
        flexDirection: style.flexDirection,
        padding: style.padding,
      });
      if (
        box.left < bounds.left - 1 ||
        box.top < bounds.top - 1 ||
        box.right > bounds.right + 1 ||
        box.bottom > bounds.bottom + 1 ||
        (el.scrollWidth > el.clientWidth + 2 && style.overflowX === "hidden") ||
        (el.scrollHeight > el.clientHeight + 2 && style.overflowY === "hidden")
      )
        issues.push({
          slideId: id,
          target,
          kind: "overflow",
          message: deckInspection.overflow,
        });
      if (["P", "H1", "H2", "H3", "H4"].includes(el.tagName)) {
        const x = box.left + box.width / 2,
          y = box.top + box.height / 2;
        if (
          x >= 0 &&
          y >= 0 &&
          x < (doc.defaultView?.innerWidth ?? 0) &&
          y < (doc.defaultView?.innerHeight ?? 0)
        ) {
          const covering = doc.elementFromPoint(x, y);
          if (covering && !el.contains(covering) && !covering.contains(el))
            issues.push({
              slideId: id,
              target,
              kind: "overlap",
              message: deckInspection.covered,
            });
        }
      }
      if (["P", "H1", "H2", "H3", "H4", "IMG", "VIDEO"].includes(el.tagName))
        boxes.push({ el, target, box });
    }
    for (let a = 0; a < boxes.length; a++)
      for (let b = a + 1; b < boxes.length; b++) {
        const first = boxes[a],
          second = boxes[b];
        if (first.el.contains(second.el) || second.el.contains(first.el))
          continue;
        const width =
            Math.min(first.box.right, second.box.right) -
            Math.max(first.box.left, second.box.left),
          height =
            Math.min(first.box.bottom, second.box.bottom) -
            Math.max(first.box.top, second.box.top);
        if (width > 4 * scale && height > 4 * scale)
          issues.push({
            slideId: id,
            target: [first.target, second.target].sort().join(" / "),
            kind: "overlap",
            message: deckInspection.overlap,
          });
      }
    for (const element of [slide, ...slide.querySelectorAll<HTMLElement>("*")]) {
      // Mermaid uses foreignObject for ordinary HTML text labels. Its descendants
      // remain in this traversal and the image measurement below; the container
      // alone is not evidence of unverified raster content.
      if (element.matches("svg image, svg feImage, canvas, object, embed, iframe, video[poster]") ||
          (element.matches("svg use") && [...element.attributes].some(attribute => attribute.localName === "href" && !attribute.value.startsWith("#")))) {
        issues.push({slideId:id, target:element.getAttribute("data-deck-node") ?? id, kind:"asset", message:deckInspection.unsupportedPaint});
      }
      for (const pseudo of [null, "::before", "::after"]) {
        const paint = doc.defaultView!.getComputedStyle(element, pseudo);
        if (paint.display === "none" || paint.visibility === "hidden") continue;
        if (/url\s*\(|image-set\s*\(/i.test(paint.backgroundImage)) {
          issues.push({slideId:id, target:element.getAttribute("data-deck-node") ?? id, kind:"asset", message:deckInspection.backgroundUnknown});
          break;
        }
        if ([paint.content, paint.listStyleImage, paint.borderImageSource, paint.maskImage, paint.getPropertyValue("-webkit-mask-image")].some(value => /url\s*\(|image-set\s*\(/i.test(value))) {
          issues.push({slideId:id, target:element.getAttribute("data-deck-node") ?? id, kind:"asset", message:deckInspection.decorationUnknown});
          break;
        }
      }
    }
    for (const image of slide.querySelectorAll("img")) {
      const box = image.getBoundingClientRect();
      const style = doc.defaultView!.getComputedStyle(image);
      if (style.display === "none" || style.visibility === "hidden") continue;
      const target = image.getAttribute("data-deck-node") ?? image.alt ?? "image";
      if (!image.complete || !image.naturalWidth) {
        issues.push({slideId:id,target,kind:"asset",message:deckInspection.imageFailed});
        continue;
      }
      const src = image.currentSrc || image.src;
      if (vectorImage(src)) {
        if (!pureVectorData(src, doc)) issues.push({slideId:id, target, kind:"asset", message:deckInspection.svgUnknown});
        continue;
      }
      const pixels = imagePixels.get(image);
      if (!pixels || pixels.src !== src || !scale) {
        issues.push({slideId:id, target, kind:"asset", message:deckInspection.pixelsUnknown});
        continue;
      }
      if (!box.width || !box.height) continue;
      const required = imagePixelRequirements(box.width / scale, box.height / scale, pixels.width, pixels.height, style.objectFit);
      const requiredWidth = required.width;
      const requiredHeight = required.height;
      if (pixels.width < requiredWidth || pixels.height < requiredHeight) {
        issues.push({slideId:id, target, kind:"asset", message:deckInspection.pixelsLow.replace("{width}", String(pixels.width)).replace("{height}", String(pixels.height)).replace("{requiredWidth}", String(requiredWidth)).replace("{requiredHeight}", String(requiredHeight))});
      }
    }
    return { id, missing: false, issues, nodes };
  });
}
export async function waitDeckRender(doc: Document): Promise<void> {
  await Promise.race([
    (async () => {
      await doc.fonts.ready;
      await Promise.all([...doc.images].map(async (img) => {
        img.loading = "eager";
        try { await img.decode(); } catch { return; }
        const src = img.currentSrc || img.src;
        if (!src || vectorImage(src)) return;
        // naturalWidth on a srcset image is density-corrected, not the encoded
        // pixel count. Decode the selected file without width descriptors.
        const original = doc.createElement("img");
        original.src = src;
        try {
          await original.decode();
          if (img.currentSrc === src || (!img.currentSrc && img.src === src))
            imagePixels.set(img, {src, width:original.naturalWidth, height:original.naturalHeight});
        } catch { /* Unknown is a failing measurement, never a pass. */ }
      }));
    })(),
    new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error(deckInspection.loadTimeout)),
        15000,
      ),
    ),
  ]);
  await new Promise<void>((resolve) => setTimeout(resolve, 150));
}
