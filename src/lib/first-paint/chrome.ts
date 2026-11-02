import { createHash } from "node:crypto";

import { parse, type DefaultTreeAdapterMap } from "parse5";

import { isDeckHtml } from "../deck/deck";
import { featureAvailable } from "../settings/features";
import { FIRST_PAINT_CHROME, FIRST_PAINT_MARK } from "./mark";
import { DEFAULT_LOCALE, localeFromCookies, type Locale } from "../i18n/locales";
import { messagesFor } from "../i18n/messages";
import { translator, type Translate } from "../i18n/translate";
import { TITLEBAR_HEIGHT } from "../workspace/window-titlebar";
import { escapeMarkup, iconMarkup } from "../../widget/shared/markup";
import { readingPageRules, READING_STYLES, READING_TRIGGER_HEIGHT } from "../../widget/reading/nav-styles";
import { CLEAN_COPY_MARK, READING_TAG, withoutReadingNumber } from "../../widget/reading/outline";
import { ICON_SIZE, READING_LAYOUT } from "../../widget/shared/tokens";
import { ICON_CHEVRON_DOWN } from "../../widget/shared/util";

/**
 * 道具箱が後から足す「場所を取る部品」を、配信のときに先に描いておく（docs/design/page-loading.md の「部品を先に描く」）。
 *
 * 本文は配信の直後に出るが、道具箱（`/comments-widget.js`）はそのあとに届く。届いてから部品を足すと、
 * 足した瞬間に本文が押されて動く:
 *
 *   上端の現在地の行（src/widget/reading/location-bar.ts） … 本文が 44px 下がる
 *   清書の目次（src/widget/reading/nav.ts）       … 本文が右へ 304px ずれ、幅も変わる
 *
 * だから配信のときに、(1) 部品が取る場所を指定で先に空け（`<style data-sp-first-paint="chrome">`）、
 * (2) 目次は**同じ見た目・同じ場所の写し**を宣言型の Shadow DOM で先に描く。
 * 道具箱は、本物を置く同じ処理の中で写しと空けた指定を外す——間に描画が挟まらないので、入れ替わりは目に見えない。
 *
 * **保管庫の HTML は 1 バイトも変えない。** 写しはスクリプトを持たず、中の字は影の中なので本文の文字数
 * （コメントの位置）にも書き出しにも数えられない。差し込んだものには目印（`data-sp-first-paint`）を付け、
 * 保存される本文に焼き付いたら断る（src/lib/html/check.ts）。
 *
 * **確かめられる形だけ描く。** 目次の章の組み方は道具箱（src/widget/reading/outline.ts の readOutline）と同じ決まりを
 * サーバーの木で読み直したもの（食い違いは tests/checks/check-first-paint-chrome.mjs が同じ本文で突き合わせる）。
 *
 * 目次の写しの字は、道具箱と同じく開いた人の言語で書く（言語は cookie の写しだけで決める・src/widget/shared/i18n.ts と同じ）。
 *
 * 手を出さないもの: スライド・個人用の配布版（src/lib/first-paint/delivery.ts と同じ）。
 */

type Node = DefaultTreeAdapterMap["node"];
type Element = DefaultTreeAdapterMap["element"];

/** これより大きい本文は読みに行かない（src/lib/first-paint/delivery.ts と同じ上限）。 */
const HTML_MAX = 1_800_000;
const BODY_OPEN = /<body\b[^>]*>/i;
const HEAD_CLOSE = /<\/head\s*>/i;
const FIRST_PAINT_CHROME_STYLE = `<style ${FIRST_PAINT_MARK}="${FIRST_PAINT_CHROME}">`;

/**
 * 写しに書く字の言語。道具箱（src/widget/shared/i18n.ts）と同じく、外枠が書き写した言語の cookie だけで決める
 * （個人設定や Accept-Language を見ると、道具箱と食い違って入れ替わる瞬間に字が変わる）。
 */
export function firstPaintLocale(cookieHeader: string | null): Locale {
  return localeFromCookies(cookieHeader) ?? DEFAULT_LOCALE;
}

/** その言語の辞書（道具箱と同じ辞書・同じ引き方）。 */
export function firstPaintTranslate(locale: Locale): Translate {
  return translator(locale, messagesFor(locale));
}

export type FirstPaintChromeInput = {
  /** 開かれた URL（目次のリンクの行き先に使う。道具箱は `location.href` から作る）。 */
  url: string;
  /** 上端の現在地の行を、道具箱が答えを待たずに出す画面か（社内の入口をブラウザで開いたとき）。 */
  locationBar: boolean;
  /** 目次の写しに書く字の言語（道具箱と同じ・firstPaintLocale）。 */
  locale: Locale;
};

// ---------------------------------------------------------------------------
// 木を読む小さな道具（parse5 の木に、道具箱が使う DOM の問い合わせと同じ意味を持たせる）
// ---------------------------------------------------------------------------

function isElement(node: Node): node is Element {
  return "tagName" in node;
}

function attr(element: Element, name: string): string | null {
  return element.attrs.find((one) => one.name === name)?.value ?? null;
}

function hasClass(element: Element, name: string): boolean {
  return (attr(element, "class") ?? "").split(/\s+/).includes(name);
}

/**
 * 子孫の要素を文書の順に。template の中身は文書の外なので入らない（DOM と同じ）。
 * 呼び出しを重ねずに手元の積み上げで歩く——本文の入れ子に上限は無く（ブラウザは 512 段で打ち切る）、
 * 再帰だと深い本文でスタックが尽きる。
 */
function descendants(root: Node): Element[] {
  const out: Element[] = [];
  const stack: Node[] = "childNodes" in root ? [...root.childNodes].reverse() : [];
  for (let node = stack.pop(); node !== undefined; node = stack.pop()) {
    if (!isElement(node)) continue;
    out.push(node);
    for (let i = node.childNodes.length - 1; i >= 0; i--) stack.push(node.childNodes[i]);
  }
  return out;
}

/** src/widget/reading/outline.ts の EXCLUDED と同じ集まり。 */
function isExcluded(element: Element): boolean {
  const tag = element.tagName;
  if (["blockquote", "pre", "code", "figure", "svg", "nav", "aside"].includes(tag)) return true;
  if (hasClass(element, "lecture-cue")) return true;
  if (attr(element, "data-ads-figure") !== null || attr(element, "data-source-note") !== null || attr(element, "data-clean-copy-ui") !== null) return true;
  return tag === "del" && attr(element, "data-surprise-redline") !== null;
}

/** `element.closest(EXCLUDED)` と同じ。 */
function insideExcluded(element: Element): boolean {
  let node: Element | null = element;
  while (node !== null) {
    if (isExcluded(node)) return true;
    const parent: Node | null = node.parentNode;
    node = parent !== null && isElement(parent) ? parent : null;
  }
  return false;
}

function rawText(root: Node): string {
  let text = "";
  const stack: Node[] = [root];
  for (let node = stack.pop(); node !== undefined; node = stack.pop()) {
    if (node.nodeName === "#text" && "value" in node) { text += node.value; continue; }
    if (isElement(node) && node.tagName === "del" && attr(node, "data-surprise-redline") !== null) continue;
    if ("childNodes" in node) for (let i = node.childNodes.length - 1; i >= 0; i--) stack.push(node.childNodes[i]);
  }
  return text;
}

/** src/widget/reading/outline.ts の titleOf と同じ（赤入れで消した字は数えず、空白を詰める）。 */
function titleOf(element: Element): string {
  return rawText(element).replace(/\s+/g, " ").trim();
}

function headings(root: Element, tags: readonly string[]): Element[] {
  return descendants(root).filter((node) => tags.includes(node.tagName) && !insideExcluded(node) && titleOf(node).length > 0);
}

function samePage(a: URL, b: URL): boolean {
  return a.origin === b.origin && a.pathname.replace(/\/+$/, "") === b.pathname.replace(/\/+$/, "");
}

// ---------------------------------------------------------------------------
// 目次の組み方（src/widget/reading/outline.ts の readOutline をサーバーの木で）
// ---------------------------------------------------------------------------

export type EarlyEntry = { id: string; title: string };
export type EarlyChapter = EarlyEntry & { sections: EarlyEntry[] };
export type EarlyOutline = { chapters: EarlyChapter[]; related: { title: string; href: string }[] };

/**
 * 道具箱が組むのと同じ目次。対象でなければ null。
 *
 * 移動先の id が無い見出しには、道具箱が付けるのと同じ名前を数えて書く（本文には付けない。付けるのは道具箱）。
 */
export function readEarlyOutline(document: DefaultTreeAdapterMap["document"], url: string, t: Translate): EarlyOutline | null {
  const all = descendants(document);
  const main = all.find((node) => node.tagName === "main");
  if (main === undefined) return null;
  const sources = descendants(main).filter((node) => node.tagName === "article" && attr(node, "data-clean-copy-source-id") !== null);
  if (attr(main, CLEAN_COPY_MARK) === null && sources.length === 0) return null;
  const oldNavigation = descendants(main).find((node) => attr(node, "data-clean-copy-ui") === "navigation");
  let current: URL;
  try { current = new URL(url); } catch { return null; }
  const related: EarlyOutline["related"] = [];
  const labels = new Map<string, string>();
  for (const link of oldNavigation === undefined ? [] : descendants(oldNavigation).filter((node) => node.tagName === "a" && attr(node, "href") !== null)) {
    const raw = attr(link, "href");
    if (!raw) continue;
    let target: URL;
    try { target = new URL(raw, current); } catch { continue; }
    if (samePage(target, current) && target.hash) {
      try { labels.set(decodeURIComponent(target.hash.slice(1)), titleOf(link)); } catch { /* 不正な目印は採らない */ }
    } else if (!samePage(target, current) && (target.protocol === "https:" || target.protocol === "http:")) {
      related.push({ title: titleOf(link), href: target.href });
    }
  }

  type Found = { target: Element; title: string; sections: { target: Element; title: string }[] };
  const chapters: Found[] = [];
  if (sources.length > 1) {
    for (const source of sources) {
      const allHeadings = headings(source, ["h1", "h2", "h3", "h4", "h5", "h6"]);
      const heading = allHeadings[0];
      const sourceId = attr(source, "data-clean-copy-source-id") ?? "";
      const wrapper = source.parentNode;
      const target = wrapper !== null && isElement(wrapper) && (attr(wrapper, "id") ?? "") === sourceId ? wrapper : heading ?? source;
      const bodyHeadings = allHeadings.filter((node) => node.tagName !== "h1");
      const sectionLevel = Math.min(...bodyHeadings.map((node) => Number(node.tagName.slice(1))));
      chapters.push({
        target,
        title: attr(source, "data-clean-copy-label") || (heading ? titleOf(heading) : labels.get(sourceId)) || t("toolbox.reading.chapterFallback", { number: chapters.length + 1 }),
        sections: bodyHeadings.filter((node) => Number(node.tagName.slice(1)) === sectionLevel).map((node) => ({ target: node, title: titleOf(node) })),
      });
    }
  } else {
    const root = sources[0] ?? main;
    for (const heading of headings(root, ["h2", "h3"])) {
      if (heading.tagName === "h2") chapters.push({ target: heading, title: titleOf(heading), sections: [] });
      else chapters[chapters.length - 1]?.sections.push({ target: heading, title: titleOf(heading) });
    }
  }
  if (chapters.reduce((total, chapter) => total + 1 + chapter.sections.length, 0) <= 1) return null;

  // src/widget/reading/outline.ts の ensureReadingId と同じ順・同じ名前（getElementById は文書のどこかに同じ id があれば当たる）
  const taken = new Set(all.map((node) => attr(node, "id")).filter((id): id is string => id !== null && id !== ""));
  const assigned = new Map<Element, string>();
  const idOf = (target: Element, prefix: string): string => {
    const existing = attr(target, "id") || assigned.get(target);
    if (existing) return existing;
    let candidate = prefix;
    let suffix = 1;
    while (taken.has(candidate)) candidate = `${prefix}-${suffix++}`;
    taken.add(candidate);
    assigned.set(target, candidate);
    return candidate;
  };
  return {
    chapters: chapters.map((chapter, i) => {
      const id = idOf(chapter.target, `clean-copy-chapter-${i + 1}`);
      return {
        id,
        title: chapter.title,
        sections: chapter.sections.map((section, j) => ({ id: idOf(section.target, `clean-copy-chapter-${i + 1}-section-${j + 1}`), title: section.title })),
      };
    }),
    related,
  };
}

// ---------------------------------------------------------------------------
// 目次の写し（src/widget/reading/nav.ts が組むのと同じ形）
// ---------------------------------------------------------------------------

function readingHref(url: string, id: string): string {
  const target = new URL(url);
  target.hash = id;
  return target.href;
}

function entryLink(url: string, entry: EarlyEntry, number: string, current: boolean): string {
  const label = withoutReadingNumber(entry.title, number);
  return `<a class="entry numbered" aria-label="${escapeMarkup(entry.title)}" href="${escapeMarkup(readingHref(url, entry.id))}" data-target="${escapeMarkup(entry.id)}"${current ? ' aria-current="location"' : ""}>` +
    `<span class="entry-number">${escapeMarkup(number)}</span><span class="entry-title">${escapeMarkup(label)}</span></a>`;
}

/**
 * 開いた直後の目次。道具箱は開いた直後、いちばん上の章を「いま読んでいる章」にして、その節を章の行の中に入れる
 * （読む位置が最初の章の見出しより上にあるため）。写しも同じ状態で描く。
 */
function railMarkup(outline: EarlyOutline, url: string, t: Translate): string {
  const rows = outline.chapters.map((chapter, index) => {
    const sections = index === 0 && chapter.sections.length > 0
      ? `<ol class="section-list">${chapter.sections.map((section, j) => `<li>${entryLink(url, section, `${index + 1}.${j + 1}`, false)}</li>`).join("")}</ol>`
      : "";
    return `<li class="chapter">${entryLink(url, chapter, String(index + 1).padStart(2, "0"), index === 0)}${sections}</li>`;
  }).join("");
  const related = outline.related.map((one) => `<a class="" href="${escapeMarkup(one.href)}">${escapeMarkup(`${one.title} ↗`)}</a>`).join("") +
    `<a class="" href="${escapeMarkup(readingHref(url, "sp-top"))}">${escapeMarkup(t("toolbox.reading.top"))}</a>`;
  const title = `<p class="rail-title">${escapeMarkup(t("toolbox.reading.overview"))}<span class="count">${escapeMarkup(t("toolbox.reading.chapterCount", { count: outline.chapters.length }))}</span></p>`;
  return `<nav class="rail" aria-label="${escapeMarkup(t("toolbox.reading.railLabel"))}"><div class="tree">${title}<ol class="chapter-list">${rows}</ol></div><div class="related">${related}</div></nav>`;
}

function triggerMarkup(outline: EarlyOutline, t: Translate): string {
  const first = outline.chapters[0];
  const chapterLine = t("toolbox.reading.chapterLine", { at: "01", total: String(outline.chapters.length).padStart(2, "0"), title: withoutReadingNumber(first.title, "1") });
  const sectionLine = t("toolbox.reading.chapterStart");
  return `<button class="trigger" type="button" aria-haspopup="dialog" aria-expanded="false" title="${escapeMarkup(t("toolbox.reading.triggerTitle", { chapter: first.title, section: sectionLine }))}">` +
    `<span class="trigger-copy"><span class="chapter-line">${escapeMarkup(chapterLine)}</span><span class="section-line">${escapeMarkup(sectionLine)}</span></span>` +
    `<span class="trigger-label">${escapeMarkup(t("toolbox.reading.contents"))}${iconMarkup(ICON_CHEVRON_DOWN, ICON_SIZE.small)}</span></button>`;
}

// ---------------------------------------------------------------------------
// 左の目次か、上端の帯か（src/widget/reading/nav.ts の layout と同じ判断を、画面の大きさの条件で）
// ---------------------------------------------------------------------------

/** 目次の字の大きさ（--font-md）と行送り（--leading-normal）・1 行の高さ（--size-touch）・章の題の列の幅。 */
const FONT = 14;
const LINE = FONT * 1.6;
const ROW = 44;
const TITLE_COLUMN = READING_LAYOUT.railWidth - 32 - 8;
const RELATED_ROW = 8 * 2 + 12 * 1.6;

/** 題が何行に折れるかの見積もり。全角は 1 字 1em、半角は 0.58em で数える。 */
function estimatedLines(text: string): number {
  let width = 0;
  for (const ch of text) width += /[\u0000-ɏ -⁯]/.test(ch) ? FONT * 0.58 : FONT;
  return Math.max(1, Math.ceil(width / TITLE_COLUMN));
}

/**
 * 左の目次を出す画面の高さの下限。道具箱は「章の行と、節を少なくとも 3 行・関連の行・先頭へ・上下の余白が入るか」で
 * 決める（src/widget/reading/nav.ts の layout）。章の行の高さは題の折り返しで決まるので、字の幅から見積もる。
 * 見積もりが外れて境目の高さの画面だけ食い違っても、道具箱が届いた時点で正しい形に置き直す（いまと同じ動き）。
 * 道具箱が比べるのはツールバーを畳んだときの組みの高さ（`100lvh`・src/widget/reading/nav.ts の layoutHeight）で、
 * ツールバーが畳まれない画面では画面の大きさの条件の高さと同じ値になる。
 */
function railMinHeight(outline: EarlyOutline, top: number): number {
  const chapters = outline.chapters.reduce((sum, chapter, index) =>
    sum + Math.max(ROW, 16 + estimatedLines(withoutReadingNumber(chapter.title, String(index + 1).padStart(2, "0"))) * LINE), 0);
  const related = (outline.related.length + 1) * RELATED_ROW;
  return Math.ceil(top + LINE + chapters + ROW * READING_LAYOUT.minSectionRows + related + ROW + READING_LAYOUT.edge * 4);
}

// ---------------------------------------------------------------------------
// 差し込み
// ---------------------------------------------------------------------------

/** 上端に空ける高さの規則。 */
function topRules(selector: string, pixels: number, gap: number): string {
  // 上端に帯が 1 つも無いときは、ページ自身の上の余白に触らない（top-inset.ts も書かない）
  return pixels === 0
    ? `${selector} { scroll-padding-top: ${gap}px; }`
    : `${selector} { padding-top: ${pixels}px; scroll-padding-top: ${pixels + gap}px; }`;
}

/**
 * 本文を読んで分かること（目次）。開いた URL の目印（#）と表示の言語以外は
 * 本文だけで決まるので、同じ本文を開き直したときは読み直さない（大きな本文では木を作るだけで 10ms 近くかかる）。
 */
type Analysis = { outline: EarlyOutline | null };
const ANALYSIS_LIMIT = 64;
const analyses = new Map<string, Analysis>();

function analyze(html: string, input: { url: string; locale: Locale; t: Translate }): Analysis {
  // 目次の組み方が見るのは URL の宛先と道筋だけ（同じページかの見分け・関連のリンクの解き方）。? 以降と # は
  // 控えの鍵に入れない——入れると、公開ページに ?x=乱数 を付けて叩くだけで控えを押し流し、毎回読み直させられる
  const url = new URL(input.url);
  const key = `${createHash("sha256").update(html).digest("base64")}\n${url.origin}${url.pathname}\n${input.locale}`;
  const known = analyses.get(key);
  if (known !== undefined) {
    analyses.delete(key);
    analyses.set(key, known);
    return known;
  }
  const tree = parse(html, { sourceCodeLocationInfo: true });
  const found = { outline: readEarlyOutline(tree, input.url, input.t) };
  analyses.set(key, found);
  while (analyses.size > ANALYSIS_LIMIT) {
    const oldest = analyses.keys().next().value;
    if (oldest === undefined) break;
    analyses.delete(oldest);
  }
  return found;
}

/**
 * 配る直前の本文に、道具箱の部品を先に描く差し込みをする。手を出さないページは、受け取ったまま返す。
 * 道具箱の札（withCommentsWidget）を足したあとで呼ぶ。
 */
export function withFirstPaintChrome(html: string, input: FirstPaintChromeInput): string {
  if (!featureAvailable("first-paint") || html.length > HTML_MAX || isDeckHtml(html)) return html;
  if (html.includes(FIRST_PAINT_CHROME_STYLE) || html.includes(`<${READING_TAG} ${FIRST_PAINT_MARK}`)) return html;
  // 先に描くのは速く見せるためだけ。読めない本文で失敗しても、今までどおりの本文を配る（閲覧を止めない）
  try {
    return firstPaintChrome(html, input);
  } catch {
    return html;
  }
}

function firstPaintChrome(html: string, input: FirstPaintChromeInput): string {
  const body = BODY_OPEN.exec(html);
  const headClose = HEAD_CLOSE.exec(html);
  if (body === null || headClose === null || headClose.index > body.index) return html;
  const locationBar = input.locationBar;
  const cleanCopy = html.includes(CLEAN_COPY_MARK) || html.includes("data-clean-copy-source-id");
  if (!locationBar && !cleanCopy) return html;

  const t = firstPaintTranslate(input.locale);
  const { outline } = cleanCopy
    ? analyze(html, { url: input.url, locale: input.locale, t })
    : { outline: null };
  const location = locationBar ? TITLEBAR_HEIGHT : 0;

  const rules: string[] = [];
  let rail = "";
  if (outline !== null) {
    const gap = READING_LAYOUT.edge;
    const wide = `(min-width: ${READING_LAYOUT.minWidth}px) and (min-height: ${railMinHeight(outline, location)}px)`;
    rules.push(
      `@media screen { ${topRules("html", location, gap)} main { max-width: ${READING_LAYOUT.bodyWidth}px !important; } }`,
      readingPageRules("html"),
      `@media screen and ${wide} { html { padding-left: ${READING_LAYOUT.railWidth + READING_LAYOUT.gap}px; } }`,
      `@media screen { @media not all and ${wide} { ${topRules("html", location + READING_TRIGGER_HEIGHT, gap)} } }`,
      `${READING_TAG}[${FIRST_PAINT_MARK}] { --reading-top: ${location}px; --reading-right: 0px; --reading-left: max(${READING_LAYOUT.edge}px, calc((100% - ${READING_LAYOUT.minWidth}px) / 2 + ${READING_LAYOUT.edge}px)); }`,
    );
    const modes = `@media not all and ${wide} { .rail { display: none; } } @media ${wide} { .trigger { display: none; } }`;
    rail = `<${READING_TAG} ${FIRST_PAINT_MARK}><template shadowrootmode="open"><style>${READING_STYLES}</style><style>${modes}</style>` +
      `${railMarkup(outline, input.url, t)}${triggerMarkup(outline, t)}</template></${READING_TAG}>`;
  } else if (locationBar) {
    rules.push(`@media screen { ${topRules("html", location, 0)} }`);
  }

  let out = html;
  if (rules.length === 0 && rail === "") return html;
  // 目次の写しは本文より前（body の頭）に置く。本文の途中で描画が挟まっても、写しはもう出ている
  const afterBody = body.index + body[0].length;
  out = `${out.slice(0, afterBody)}${rail}${out.slice(afterBody)}`;
  if (rules.length === 0) return out;
  const headAt = HEAD_CLOSE.exec(out);
  if (headAt === null) return html;
  return `${out.slice(0, headAt.index)}<style ${FIRST_PAINT_MARK}="${FIRST_PAINT_CHROME}">${rules.join("\n")}</style>${out.slice(headAt.index)}`;
}
