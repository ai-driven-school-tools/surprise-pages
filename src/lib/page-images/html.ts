import type { DefaultTreeAdapterMap } from "parse5";
import { sourceTree } from "../html/source-index";
import { isSafeAssetPath } from "../pages/assets";
import { PAGE_IMAGE_RASTER, PAGE_IMAGE_WIDTHS, PAGE_IMAGE_BLUR_WIDTH, pageImageUrl } from "./contract";
import stamp from "../../widget/dist/page-images-stamp.json";

export const PAGE_IMAGES_SCRIPT = `/page-images.js/${stamp.stamp}`;
type Element = DefaultTreeAdapterMap["element"];
const escape = (text: string) => text.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;");

/** Patch only delivery attributes, never serialize or change the stored document. */
export function withPageImages(html: string, options: {version?: string; origin?: string} = {}): string {
  if (!/<(?:img|source)\b|background(?:-image)?\s*:/i.test(html) || html.includes('data-sp-image-runtime')) return html;
  const nodes: Element[] = [];
  function walk(node: DefaultTreeAdapterMap["node"]) {
    if ("tagName" in node) nodes.push(node);
    if ("childNodes" in node) node.childNodes.forEach(walk);
  }
  walk(sourceTree(html));
  const attribute = (node: Element, name: string) => node.attrs.find(attr => attr.name === name)?.value;
  const baseValue = nodes.find(node => node.tagName === "base");
  let base: URL;
  try { base = new URL(baseValue ? attribute(baseValue, "href") ?? "/" : "/", options.origin ?? "https://page.invalid"); }
  catch { return html; }
  if (!/^\/(?:internal|public|history\/(?:internal|public))\//.test(base.pathname)) return html;
  const version = options.version ?? "current";
  const resolve = (src: string): string | null => {
    try {
      const url = new URL(src, base);
      if (url.origin !== base.origin || (options.origin && url.origin !== options.origin) || url.search || url.hash || !PAGE_IMAGE_RASTER.test(url.pathname)) return null;
      const parts = url.pathname.split("/").filter(Boolean);
      const prefix = parts[0] === "history" && ["public", "internal"].includes(parts[1]) ? 2 : ["internal", "public"].includes(parts[0]) ? 1 : 0;
      if (!prefix) return null;
      const rest = parts.slice(prefix), archive = rest.indexOf("@v");
      const safe = archive < 0 ? isSafeAssetPath(rest) : /^[a-f0-9]{7,40}$/.test(rest[archive + 1] ?? "") && isSafeAssetPath([...rest.slice(0, archive), ...rest.slice(archive + 2)]);
      return safe ? url.pathname : null;
    } catch { return null; }
  };
  const variant = (path: string, width: number) => pageImageUrl(path, width, version);
  const patches: {start: number; end: number; text: string}[] = [];
  const change = (node: Element, values: Record<string, string>) => {
    const at = node.sourceCodeLocation?.startTag;
    if (!at) return;
    const additions: string[] = [];
    for (const [name, value] of Object.entries(values)) {
      const loc = node.sourceCodeLocation?.attrs?.[name];
      if (loc) patches.push({start: loc.startOffset, end: loc.endOffset, text: `${name}="${escape(value)}"`});
      else additions.push(`${name}="${escape(value)}"`);
    }
    if (additions.length) {
      const end = html.slice(at.startOffset, at.endOffset).endsWith("/>") ? at.endOffset - 2 : at.endOffset - 1;
      patches.push({start: end, end, text: ` ${additions.join(" ")}`});
    }
  };
  const srcset = (text: string) => {
    const result: string[] = [];
    for (const item of text.split(",")) {
      const match = /^\s*(\S+)\s+(\d+(?:\.\d+)?)(w|x)\s*$/.exec(item);
      const path = match && resolve(match[1]);
      if (!match || !path) return null;
      // Authored candidates already have a sizing contract. Compress without
      // changing intrinsic pixels or their width/density descriptors.
      result.push(`${pageImageUrl(path, 0, version)} ${match[2]}${match[3]}`);
    }
    return result.join(", ");
  };
  let images = 0;
  for (const node of nodes) {
    if (node.tagName === "img") {
      const original = attribute(node, "src"), path = original && resolve(original);
      if (!path || !original) continue;
      const supplied = attribute(node, "srcset");
      const responsive = supplied ? srcset(supplied) : PAGE_IMAGE_WIDTHS.map(width => `${variant(path, width)} ${width}w`).join(", ");
      if (!responsive) continue;
      const first = images++ === 0;
      const sized = ["width", "height"].some(name => /^\d+(?:\.\d+)?$/.test(attribute(node, name) ?? "") && Number(attribute(node, name)) > 0);
      const picture = node.parentNode?.nodeName === "picture";
      const values: Record<string, string> = {src: sized ? variant(path, 1280) : pageImageUrl(path, 0, version), "data-sp-image": "", "data-sp-image-original": original};
      values.srcset = sized || supplied ? responsive : `${pageImageUrl(path, 0, version)} 1x`;
      if (!sized && !supplied && !picture) values["data-sp-image-candidates"] = responsive;
      if (!picture) values["data-sp-image-blur"] = pageImageUrl(path, PAGE_IMAGE_BLUR_WIDTH, version);
      if (supplied) values["data-sp-image-original-srcset"] = supplied;
      if ((sized || supplied) && !attribute(node, "sizes")) values.sizes = "100vw";
      if (!attribute(node, "loading")) values.loading = first ? "eager" : "lazy";
      if (first && !attribute(node, "fetchpriority")) values.fetchpriority = "high";
      change(node, values);
    } else if (node.tagName === "source" && node.parentNode?.nodeName === "picture") {
      const supplied = attribute(node, "srcset");
      const mapped = supplied && srcset(supplied);
      if (mapped && supplied) change(node, {srcset: mapped, "data-sp-image-original-srcset": supplied});
    }
    // Background photographs keep their authored positioning, sizing and layering.
    const optimizeCss = (css: string) => css.replace(/url\(\s*(["']?)([^\s"'()]+)\1\s*\)/gi, (whole: string, _quote: string, src: string) => {
      const path = resolve(src); return path ? `url("${pageImageUrl(path, 0, version)}")` : whole;
    });
    const style = attribute(node, "style");
    if (style && /background/i.test(style)) { const next = optimizeCss(style); if (next !== style) change(node, {style: next}); }
    if (node.tagName === "style") for (const child of node.childNodes) {
      if (child.nodeName !== "#text" || !("value" in child) || !child.sourceCodeLocation) continue;
      const next = optimizeCss(child.value);
      if (next !== child.value) patches.push({start: child.sourceCodeLocation.startOffset, end: child.sourceCodeLocation.endOffset, text: next});
    }
  }
  if (images) {
    const tag = `<script defer data-sp-image-runtime src="${PAGE_IMAGES_SCRIPT}"></script>`;
    const end = nodes.find(node => node.tagName === "head")?.sourceCodeLocation?.endTag?.startOffset ?? 0;
    patches.push({start: end, end, text: tag});
  }
  for (const patch of patches.sort((a, b) => b.start - a.start)) html = html.slice(0, patch.start) + patch.text + html.slice(patch.end);
  return html;
}
