import { t } from "../shared/i18n";

/** 清書の構造だけを読む。見た目や文章の意味から章を推測しない。 */
export const READING_TAG = "surprise-reading-nav";
export const CLEAN_COPY_MARK = "data-clean-copy-document";
const SOURCE = "article[data-clean-copy-source-id]";
const EXCLUDED = "blockquote,pre,code,figure,svg,nav,aside,.lecture-cue,[data-ads-figure],[data-source-note],[data-clean-copy-ui],del[data-surprise-redline]";

export interface ReadingEntry {
  target: HTMLElement;
  title: string;
}
export interface ReadingChapter extends ReadingEntry {
  sections: ReadingEntry[];
}
export interface ReadingOutline {
  main: HTMLElement;
  chapters: ReadingChapter[];
  related: { title: string; href: string }[];
  oldNavigation: HTMLElement | null;
}

/** 原本の題の頭にある章番号（「01｜」「1.2 」など）を外す。番号は目次の固定の列に出すので、二重にしない。 */
export function withoutReadingNumber(title: string, number: string): string {
  const ordinal = number.split(".").map(part => `0*${Number(part)}`).join("\\.");
  return title.replace(new RegExp(`^${ordinal}[｜|.．、\\s]+`), "");
}

function titleOf(node: Element): string {
  const copy = node.cloneNode(true);
  if (copy instanceof Element) {
    for (const removed of copy.querySelectorAll("del[data-surprise-redline]")) removed.remove();
  }
  return (copy.textContent ?? "").replace(/\s+/g, " ").trim();
}

function headings(root: HTMLElement, tag: string): HTMLElement[] {
  return Array.from(root.querySelectorAll(tag)).filter(
    (node): node is HTMLElement => node instanceof HTMLElement && !node.closest(EXCLUDED) && titleOf(node).length > 0,
  );
}

/** 既存の移動先は触らない。単一原本の古い変換器には id がないので決定的に補う。 */
export function ensureReadingId(target: HTMLElement, prefix: string): string {
  if (target.id) return target.id;
  const doc = target.ownerDocument;
  let candidate = prefix;
  let suffix = 1;
  while (doc.getElementById(candidate)) candidate = `${prefix}-${suffix++}`;
  target.id = candidate;
  return candidate;
}

export function readingHref(href: string, id: string): string {
  const url = new URL(href);
  url.hash = id;
  return url.href;
}

function samePage(a: URL, b: URL): boolean {
  return a.origin === b.origin && a.pathname.replace(/\/+$/, "") === b.pathname.replace(/\/+$/, "");
}

/** 清書の本文か（印の付いた本文か、原本ごとの節を持つ本文）。目次と、上端の「新しい版があります」が同じ見分け方を使う。 */
export function isCleanCopyDocument(doc: Document): boolean {
  const main = doc.querySelector("main");
  return main instanceof HTMLElement && (main.hasAttribute(CLEAN_COPY_MARK) || main.querySelector(SOURCE) !== null);
}

export function readOutline(doc: Document): ReadingOutline | null {
  const main = doc.querySelector("main");
  if (!(main instanceof HTMLElement)) return null;
  if (!isCleanCopyDocument(doc)) return null;
  const sources = Array.from(main.querySelectorAll(SOURCE)).filter((node): node is HTMLElement => node instanceof HTMLElement);
  const old = main.querySelector('[data-clean-copy-ui="navigation"]');
  const oldNavigation = old instanceof HTMLElement ? old : null;
  const current = new URL(doc.URL);
  const related: ReadingOutline["related"] = [];
  const labels = new Map<string, string>();
  for (const link of oldNavigation?.querySelectorAll("a[href]") ?? []) {
    const raw = link.getAttribute("href");
    if (!raw) continue;
    let url: URL;
    try { url = new URL(raw, current); } catch { continue; }
    if (samePage(url, current) && url.hash) {
      try { labels.set(decodeURIComponent(url.hash.slice(1)), titleOf(link)); } catch { /* 不正な目印は採らない */ }
    } else if (!samePage(url, current) && (url.protocol === "https:" || url.protocol === "http:")) {
      related.push({ title: titleOf(link), href: url.href });
    }
  }
  const chapters: ReadingChapter[] = [];
  if (sources.length > 1) {
    for (const source of sources) {
      const allHeadings = headings(source, "h1,h2,h3,h4,h5,h6");
      const heading = allHeadings[0];
      const sourceId = source.getAttribute("data-clean-copy-source-id") ?? "";
      const wrapper = source.parentElement;
      const target = wrapper instanceof HTMLElement && wrapper.id === sourceId ? wrapper : heading ?? source;
      const bodyHeadings = allHeadings.filter(node => node.tagName !== "H1");
      const sectionLevel = Math.min(...bodyHeadings.map(node => Number(node.tagName.slice(1))));
      chapters.push({
        target,
        title: source.getAttribute("data-clean-copy-label") || (heading ? titleOf(heading) : labels.get(sourceId)) || t("toolbox.reading.chapterFallback", { number: chapters.length + 1 }),
        sections: bodyHeadings.filter(node => Number(node.tagName.slice(1)) === sectionLevel).map(node => ({ target: node, title: titleOf(node) })),
      });
    }
  } else {
    const root = sources[0] ?? main;
    for (const heading of headings(root, "h2,h3")) {
      if (heading.tagName === "H2") chapters.push({ target: heading, title: titleOf(heading), sections: [] });
      else chapters[chapters.length - 1]?.sections.push({ target: heading, title: titleOf(heading) });
    }
  }
  if (chapters.reduce((total, chapter) => total + 1 + chapter.sections.length, 0) <= 1) return null;
  chapters.forEach((chapter, i) => {
    ensureReadingId(chapter.target, `clean-copy-chapter-${i + 1}`);
    chapter.sections.forEach((section, j) => ensureReadingId(section.target, `clean-copy-chapter-${i + 1}-section-${j + 1}`));
  });
  return { main, chapters, related, oldNavigation };
}

/** 非表示の節は現在地にしない。移動する際は畳まれた祖先を先に開く。 */
export function revealReadingTarget(target: HTMLElement): void {
  for (let node: HTMLElement | null = target; node; node = node.parentElement) {
    if (node instanceof HTMLDetailsElement) node.open = true;
  }
}

export function activeReadingEntry(entries: readonly ReadingEntry[], line: number): number {
  let active = -1;
  entries.forEach((entry, i) => {
    if (entry.target.getClientRects().length > 0 && entry.target.getBoundingClientRect().top <= line) active = i;
  });
  return active;
}
