/** Ephemeral presentation copies only. Never serialize these into saved HTML. */
const slides = "section[data-deck-slide]";
const SETTINGS = 'head>script[type="application/json"][data-deck-design],head>script[type="application/json"][data-deck-appearance],head>script[type="application/json"][data-deck-focus],head>script[type="application/json"][data-deck-focus-overrides],head>script[type="application/json"][data-deck-logo],head>script[type="application/json"][data-deck-logo-overrides]';
const parse = (html: string) => new DOMParser().parseFromString(html, "text/html");
const serialize = (doc: Document) => `<!doctype html>\n${doc.documentElement.outerHTML}`;

/** Headings name a slide; a slide without one stays unnamed rather than borrowing a placeholder. */
const titleOf = (slide: Element) => (slide.querySelector("h1,h2,h3,.dd-statement")?.textContent ?? "").replace(/\s+/g, " ").trim();

type PresenterSlide = { id: string; title: string; notes: string; skip: boolean };
type SlideRecord = PresenterSlide & { authored: string | null; html: string };
type Setting = { raw: string; value: Record<string, unknown>; slides: Record<string, unknown> };
type Part = string | { slide: number } | { setting: number };
/** One parse per document. The serialized document is kept as literal text with
 * holes where each slide and each per-slide settings block sit, so a one-slide
 * copy or a held copy is a string join instead of another multi-megabyte parse. */
type Analysis = { slides: SlideRecord[]; listed: PresenterSlide[]; settings: Setting[]; parts: Part[]; envelope: string };

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const MARK = "dp-hole-";

function analyze(html: string): Analysis {
  const doc = parse(html);
  const nodes = [...doc.querySelectorAll(slides)];
  const records: SlideRecord[] = nodes.map(slide => ({
    id: slide.getAttribute("data-deck-node") ?? "",
    authored: slide.getAttribute("data-deck-id"),
    title: titleOf(slide),
    notes: slide.querySelector("aside[data-deck-notes]")?.textContent ?? "",
    skip: slide.getAttribute("data-deck-skip") === "true",
    html: slide.outerHTML,
  }));
  // Everything except the slide container's contents; a change here cannot be split per slide.
  const main = doc.querySelector("main[data-deck-slides]");
  const kept = main ? [...main.childNodes] : [];
  main?.replaceChildren();
  const envelope = serialize(doc);
  main?.append(...kept);
  // A hole marker that cannot already occur in this document.
  let token = MARK;
  while (html.includes(token)) token += "x";
  const settings: Setting[] = [];
  for (const script of doc.querySelectorAll(SETTINGS)) {
    const raw = script.textContent ?? "";
    try {
      const value: unknown = JSON.parse(raw);
      if (!isRecord(value) || !isRecord(value.slides)) continue;
      script.textContent = `${token}c${settings.length}.`;
      settings.push({ raw, value, slides: value.slides });
    } catch { /* Invalid/custom source remains unchanged and fails visibly. */ }
  }
  nodes.forEach((slide, index) => slide.replaceWith(doc.createComment(`${token}s${index}.`)));
  const parts: Part[] = [];
  const holes = new RegExp(`<!--${token}s(\\d+)\\.-->|${token}c(\\d+)\\.`, "g");
  const text = serialize(doc);
  let at = 0;
  for (const found of text.matchAll(holes)) {
    parts.push(text.slice(at, found.index));
    parts.push(found[1] !== undefined ? { slide: Number(found[1]) } : { setting: Number(found[2]) });
    at = (found.index ?? 0) + found[0].length;
  }
  parts.push(text.slice(at));
  return { slides: records, listed: records.map(({ id, title, notes, skip }) => ({ id, title, notes, skip })).filter(slide => slide.id && !slide.skip), settings, parts, envelope };
}

/** The presenter asks about the same few documents (saved, shown, upcoming) on every
 * update and slide change; keep the latest few analyses instead of re-parsing them. */
const cache: { html: string; analysis: Analysis }[] = [];
function analysisOf(html: string): Analysis {
  const index = cache.findIndex(entry => entry.html === html);
  if (index >= 0) { const [entry] = cache.splice(index, 1); cache.unshift(entry); return entry.analysis; }
  const analysis = analyze(html);
  cache.unshift({ html, analysis });
  cache.length = Math.min(cache.length, 4);
  return analysis;
}

function compose(analysis: Analysis, slide: (index: number) => string, setting: (index: number) => string): string {
  return analysis.parts.map(part => typeof part === "string" ? part : "slide" in part ? slide(part.slide) : setting(part.setting)).join("");
}

export function presenterSlides(html: string): readonly PresenterSlide[] {
  return analysisOf(html).listed;
}

export function presenterAudienceSource(html: string): string {
  const doc = parse(html);
  doc.querySelectorAll("aside[data-deck-notes]").forEach(note => note.remove());
  return serialize(doc);
}

/** Keep the normal renderer, but avoid rendering hundreds of offscreen slides
 * three times merely to preview the current and next paper. */
export function presenterSlideSource(html: string, id: string): string {
  const analysis = analysisOf(html);
  let authoredId: string | null = null;
  for (const slide of analysis.slides) if (slide.id === id) authoredId = slide.authored;
  // The stock renderer rejects settings for absent slide IDs. Trim only the
  // ephemeral per-slide settings together with the corresponding preview.
  return compose(analysis,
    index => analysis.slides[index].id === id ? analysis.slides[index].html : "",
    index => {
      const { value, slides: perSlide } = analysis.settings[index];
      return JSON.stringify({ ...value, slides: Object.fromEntries(Object.entries(perSlide).filter(([key]) => key === authoredId)) }).replace(/</g, "\\u003c");
    });
}

/** Preserve the on-air island while allowing upcoming slides to update.
 * Shared scripts/styles/settings cannot be split safely and wait for adoption. */
export function holdPresenterSlide(before: string, after: string, id: string | null): { html: string; pending: boolean; removed: boolean } {
  if (!id) return { html: after, pending: false, removed: false };
  const old = analysisOf(before), next = analysisOf(after);
  const prior = old.slides.find(slide => slide.id === id), upcomingIndex = next.slides.findIndex(slide => slide.id === id);
  const upcoming = next.slides[upcomingIndex];
  if (!upcoming || upcoming.skip) return { html: before, pending: true, removed: true };
  if (!prior) return { html: after, pending: false, removed: false };
  if (old.envelope !== next.envelope) return { html: before, pending: true, removed: false };
  if (prior.html === upcoming.html) return { html: after, pending: false, removed: false };
  return {
    html: compose(next, index => index === upcomingIndex ? prior.html : next.slides[index].html, index => next.settings[index].raw),
    pending: true, removed: false,
  };
}

const WIDGET_SCRIPT = /<script\b[^>]*\bsrc="\/comments-widget\.js[^"]*"[^>]*>\s*<\/script>/gi;
const WIDGET_PRELOAD = /<link\b[^>]*\bhref="\/comments-widget\.js[^"]*"[^>]*>/gi;
const UNNAMED_SLIDE = /<section\b[^>]*\bdata-deck-slide\b(?![^>]*\bdata-deck-node=)[^>]*>/i;

/** 読む画面の配信済み HTML を、発表者画面の材料にする。
 * 配信時に足した道具箱の読み込みだけを外す（残すと、発表者画面の枠の中で道具箱が立ち上がる）。
 * 編集画面を一度も通っていない資料は枚の目印を持たないので、この場かぎりの写しにだけ振る。
 * それ以外の字は 1 字も変えない（標準部品の照合が完全一致で行われるため）。 */
export function readerPresentationSource(served: string): string {
  const html = served.replace(WIDGET_SCRIPT, "").replace(WIDGET_PRELOAD, "");
  if (!UNNAMED_SLIDE.test(html)) return html;
  const doc = parse(html);
  doc.querySelectorAll(slides).forEach((slide, index) => {
    if (!slide.hasAttribute("data-deck-node")) slide.setAttribute("data-deck-node", `present-${index + 1}`);
  });
  return serialize(doc);
}
