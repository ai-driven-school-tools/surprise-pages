// i18n-keep-file: Markdown の書き出しは利用者が持ち出す文書（見出し・ノート・コメントの節を言語で変えない）
import {DECK_YOUTUBE_VIEW} from "../deck/deck";
import {authoredMediaSource} from "../deck/media/video-source";
/**
 * ページ本文を、AI に渡せるマークダウンへ落とす。
 *
 * HTML / CSS の見た目はそのまま渡すと重く、階層も消える。
 * ここでやるのは **読める文章と、図解の並びだけを残す** こと。
 * 図の空間関係はコードブロックに載せ、文は見出し・段・表として出す。
 *
 * ブラウザ（書き出しの口）も検査表も、ここだけを通す。
 * DOM の歩き方は nodeType の数値で見る（jsdom とブラウザで `instanceof` が
 * 別世界になると、要素なのに要素でない扱いになるため）。
 */

import {
  COMMENT_PRIORITIES,
  VERSION_BANNER_MARK,
  type CommentPriority,
  type PageComment,
} from "../comments/types";
import { DECK_EXIT, DECK_FOCUS_SUPPLEMENT, DECK_FOCUS_SUPPLEMENT_PAGES, DECK_LOGO_VIEW, DECK_NOTES, DECK_SLIDE, DECK_TOOLBAR } from "../deck/deck";
import { ensureDeckPublicSupplements } from "../deck/edit/customization-dom";
import { MERMAID_DONE_MARK, MERMAID_SOURCE_MARK, isMermaid, keepMermaidSource } from "../html/mermaid-source";

/** 図の元の文の控え（正本は ./mermaid-source。今までの読み手のために同じ名前で渡す）。 */
export { MERMAID_SOURCE_MARK, keepMermaidSource };

const ELEMENT = 1;
const TEXT = 3;

const SKIP_TAGS = new Set([
  "script",
  "style",
  "noscript",
  "template",
  "svg",
  "textarea",
  "select",
  "option",
  "head",
]);

/** 配信側や道具箱が足したもの。書いた人の文章ではない。 */
const OWN_TAGS = new Set(["surprise-comments", "surprise-page-export"]);

const HEADING_LEVEL: Readonly<Record<string, number>> = {
  h1: 1,
  h2: 2,
  h3: 3,
  h4: 4,
  h5: 5,
  h6: 6,
};

const PRIORITY_HEADING: Readonly<Record<CommentPriority, string>> = {
  must: "must（必ず直す）",
  better: "better（直したほうがよい）",
  want: "want（できれば）",
  good: "いいね",
};

export type PageMarkdownInput = {
  title: string | null;
  url: string;
  root: ParentNode;
  /** 渡したときだけ末尾に付ける。空配列なら「まだ無い」と書く */
  comments?: readonly PageComment[] | null;
};

function isElement(node: { nodeType: number }): node is Element {
  return node.nodeType === ELEMENT;
}

function tagOf(el: Element): string {
  return el.tagName.toLowerCase();
}

function classOf(el: Element): string {
  return el.getAttribute("class") ?? "";
}

function hasToken(cls: string, token: string): boolean {
  return new RegExp(`(^|\\s)${token}(\\s|$)`).test(cls);
}

/**
 * 画面に出ていない（または携帯だけの写し）として落とすか。
 *
 * 図解ページは矢印を `hidden md:block` と `md:hidden` の 2 本持っている。
 * 両方残すと「→」が二重になるので、狭い画面用だけを落とす。
 */
function isVisuallyDuplicate(el: Element): boolean {
  const cls = classOf(el);
  if (hasToken(cls, "md:hidden") || hasToken(cls, "sm:hidden") || hasToken(cls, "lg:hidden")) {
    return true;
  }
  if (!hasToken(cls, "hidden")) return false;
  return !(
    hasToken(cls, "sm:block") ||
    hasToken(cls, "md:block") ||
    hasToken(cls, "lg:block") ||
    hasToken(cls, "sm:flex") ||
    hasToken(cls, "md:flex") ||
    hasToken(cls, "lg:flex")
  );
}

function isOwnChrome(el: Element): boolean {
  if (OWN_TAGS.has(tagOf(el))) return true;
  if (el.hasAttribute(VERSION_BANNER_MARK)) return true;
  if (hasToken(classOf(el), "no-print")) return true;
  // スライドの実行部が足す操作の列と釦。書いた人の文章ではない
  if (el.hasAttribute(DECK_YOUTUBE_VIEW) || el.hasAttribute(DECK_TOOLBAR) || el.hasAttribute(DECK_EXIT) || el.hasAttribute(DECK_LOGO_VIEW) ||
      el.hasAttribute(DECK_FOCUS_SUPPLEMENT) || el.hasAttribute(DECK_FOCUS_SUPPLEMENT_PAGES)) return true;
  return false;
}

function shouldSkip(el: Element): boolean {
  const tag = tagOf(el);
  if (SKIP_TAGS.has(tag)) return true;
  if (tag === "i" && el.hasAttribute("data-lucide")) return true;
  if (isOwnChrome(el)) return true;
  if (isVisuallyDuplicate(el)) return true;
  return false;
}

function collapse(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

/** 題の照合用。改行つきの h1 と document.title の空白の差を無視する。 */
function folded(value: string): string {
  return collapse(value).replace(/\s+/g, "");
}

function lucideName(el: Element): string {
  const named = el.getAttribute("data-lucide");
  if (named !== null && named.length > 0) return named;
  const found = /(?:^|\s)lucide-([a-z0-9-]+)/.exec(classOf(el));
  return found?.[1] ?? "";
}

function isArrowIcon(el: Element): boolean {
  return /^(arrow|chevron)-(right|left|up|down)(-[a-z]+)?$/.test(lucideName(el));
}

function descendantElements(el: Element, skip = true): Element[] {
  const found: Element[] = [];
  const walk = (node: Element): void => {
    for (const child of node.childNodes) {
      if (!isElement(child)) continue;
      if (skip && shouldSkip(child)) continue;
      found.push(child);
      walk(child);
    }
  };
  walk(el);
  return found;
}

function childElements(el: Element): Element[] {
  const found: Element[] = [];
  for (const child of el.childNodes) {
    if (isElement(child) && !shouldSkip(child)) found.push(child);
  }
  return found;
}

/** 矢印のかたまり（「読み込み」＋ →）。セル本体とは分ける。 */
function isArrowCluster(el: Element): boolean {
  if (isArrowIcon(el)) return true;
  // 矢印の絵記号は本文としては落とすが、並びの検出では見る
  const arrows = descendantElements(el, false).filter(isArrowIcon);
  if (arrows.length === 0) return false;
  if (el.querySelector("h1,h2,h3,h4,h5,h6") !== null) return false;
  return collapse(plainText(el)).length <= 24;
}

function looksLikeCard(el: Element): boolean {
  const cls = classOf(el);
  return /rounded-/.test(cls) || hasToken(cls, "border") || /border-/.test(cls);
}

function rawChildren(el: Element): Element[] {
  const found: Element[] = [];
  for (const child of el.childNodes) {
    if (isElement(child)) found.push(child);
  }
  return found;
}

/**
 * 流れ図の子。lucide の矢印は本文としては落とすが、並びを読むときは残す。
 * 携帯用の写し（md:hidden）は二重になるので、ここでも落とす。
 */
function flowKids(el: Element): Element[] {
  return rawChildren(el).filter((kid) => {
    if (isVisuallyDuplicate(kid)) return false;
    if (isArrowIcon(kid)) return true;
    return !shouldSkip(kid);
  });
}

function isFlow(el: Element): boolean {
  const cls = classOf(el);
  if (!hasToken(cls, "flex")) return false;
  if (hasToken(cls, "flex-wrap")) return false;
  const kids = flowKids(el);
  let arrows = 0;
  let cells = 0;
  for (const kid of kids) {
    if (isArrowCluster(kid) || isArrowIcon(kid)) arrows += 1;
    else if (collapse(plainText(kid)).length > 0) cells += 1;
  }
  return arrows >= 1 && cells >= 2;
}

function isChipRow(el: Element): boolean {
  const cls = classOf(el);
  if (!hasToken(cls, "flex") || !/flex-wrap/.test(cls)) return false;
  const kids = childElements(el);
  if (kids.length < 2) return false;
  if (kids.some(isArrowCluster)) return false;
  return kids.every((kid) => {
    const text = collapse(plainText(kid));
    return text.length > 0 && text.length < 80;
  });
}

function isCardGrid(el: Element): boolean {
  const cls = classOf(el);
  if (!hasToken(cls, "grid")) return false;
  const kids = childElements(el);
  return kids.length >= 2 && kids.every(looksLikeCard);
}

function isStepRow(el: Element): boolean {
  const kids = childElements(el);
  if (kids.length !== 2) return false;
  if (!/^[0-9０-９]+$/.test(collapse(plainText(kids[0])))) return false;
  return kids[1].querySelector("h1,h2,h3,h4,h5,h6") !== null;
}

function isChromeFooter(el: Element): boolean {
  if (tagOf(el) !== "footer") return false;
  const text = collapse(plainText(el));
  // 雛形（src/templates/page.html）の下端の札（製品名）か空の footer は本文ではない
  return text === "Pages" || text === "Pages" || text.length === 0;
}

function isDividerLabel(el: Element): boolean {
  const cls = classOf(el);
  if (!hasToken(cls, "flex") || !hasToken(cls, "items-center")) return false;
  const kids = childElements(el);
  if (kids.length < 3) return false;
  const labeled = kids.filter((kid) => collapse(plainText(kid)).length > 0);
  const rules = kids.filter((kid) => /border-t/.test(classOf(kid)) && collapse(plainText(kid)).length === 0);
  return labeled.length === 1 && rules.length >= 1;
}

function fence(body: string): string {
  const text = body.replace(/\s+$/g, "");
  const ticks = text.includes("```") ? "````" : "```";
  return `${ticks}\n${text}\n${ticks}`;
}

function plainText(el: Element): string {
  const parts: string[] = [];
  const walk = (node: Node): void => {
    if (node.nodeType === TEXT) {
      parts.push(node.textContent ?? "");
      return;
    }
    if (!isElement(node) || shouldSkip(node)) return;
    if (tagOf(node) === "br") {
      parts.push("\n");
      return;
    }
    for (const child of node.childNodes) walk(child);
  };
  walk(el);
  return parts.join("");
}

function inline(node: Node): string {
  if (node.nodeType === TEXT) return (node.textContent ?? "").replace(/\s+/g, " ");
  if (!isElement(node) || shouldSkip(node)) return "";
  const tag = tagOf(node);
  if (tag === "br") return "\n";
  if (tag === "img") return imageMarkdown(node);
  if (tag === "a") {
    const href = node.getAttribute("href") ?? "";
    const text = collapse(inlineChildren(node));
    if (text.length === 0) return "";
    if (href.length === 0 || href.startsWith("javascript:") || href === text) return text;
    return `[${text}](${href})`;
  }
  if (tag === "strong" || tag === "b") {
    const inner = collapse(inlineChildren(node));
    return inner.length === 0 ? "" : `**${inner}**`;
  }
  if (tag === "em" || tag === "i") {
    if (node.hasAttribute("data-lucide")) return "";
    const inner = collapse(inlineChildren(node));
    return inner.length === 0 ? "" : `*${inner}*`;
  }
  if (tag === "code") {
    const inner = (node.textContent ?? "").trim();
    return inner.length === 0 ? "" : `\`${inner.replace(/`/g, "\\`")}\``;
  }
  return inlineChildren(node);
}

function inlineChildren(el: Element): string {
  let out = "";
  for (const child of el.childNodes) out += inline(child);
  return out.replace(/[ \t]+\n/g, "\n").replace(/\n[ \t]+/g, "\n");
}

function imageMarkdown(el: Element): string {
  const alt = collapse(el.getAttribute("alt") ?? "");
  const src = (el.getAttribute("data-sp-image-original") ?? el.getAttribute("src") ?? "").trim();
  if (alt.length > 0) return `[図] ${alt}`;
  if (src.length > 0) return `[図] ${src}`;
  return "[図]";
}

function headingMarkdown(el: Element): string {
  const level = HEADING_LEVEL[tagOf(el)] ?? 1;
  const text = collapse(inlineChildren(el));
  if (text.length === 0) return "";
  return `${"#".repeat(level)} ${text}`;
}

function listMarkdown(el: Element, ordered: boolean): string {
  const items = childElements(el).filter((kid) => tagOf(kid) === "li");
  const lines: string[] = [];
  items.forEach((item, index) => {
    const mark = ordered ? `${index + 1}.` : "-";
    const nested = childElements(item).filter((kid) => tagOf(kid) === "ul" || tagOf(kid) === "ol");
    const own = item.cloneNode(false);
    if (!isElement(own)) return;
    for (const child of item.childNodes) {
      if (isElement(child) && (tagOf(child) === "ul" || tagOf(child) === "ol")) continue;
      own.appendChild(child.cloneNode(true));
    }
    const text = collapse(inlineChildren(own));
    if (text.length > 0) lines.push(`${mark} ${text}`);
    else lines.push(`${mark}`);
    for (const nest of nested) {
      const inner = listMarkdown(nest, tagOf(nest) === "ol");
      for (const line of inner.split("\n")) {
        if (line.length > 0) lines.push(`  ${line}`);
      }
    }
  });
  return lines.join("\n");
}

function tableMarkdown(el: Element): string {
  const rows: string[][] = [];
  for (const child of descendantElements(el)) {
    if (tagOf(child) !== "tr" || shouldSkip(child)) continue;
    const cells: string[] = [];
    for (const cell of childElements(child)) {
      const tag = tagOf(cell);
      if (tag !== "th" && tag !== "td") continue;
      cells.push(collapse(inlineChildren(cell)).replace(/\|/g, "\\|"));
    }
    if (cells.length > 0) rows.push(cells);
  }
  if (rows.length === 0) return "";
  let width = 0;
  for (const row of rows) if (row.length > width) width = row.length;
  const padded = rows.map((row) => {
    const next = row.slice();
    while (next.length < width) next.push("");
    return next;
  });
  const header = padded[0];
  const body = padded.slice(1);
  const lines = [
    `| ${header.join(" | ")} |`,
    `| ${header.map(() => "---").join(" | ")} |`,
    ...body.map((row) => `| ${row.join(" | ")} |`),
  ];
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// 図（mermaid）
// ---------------------------------------------------------------------------


/**
 * 図を、元の文字のままコードブロックとして出す。
 *
 * 描いたあとの SVG から文字を拾い直さない——線と矢印の意味が消えて、
 * ばらばらの単語だけが並ぶ。読む側（AI も人も）には、元の文のほうが情報が多い。
 * 元の文が手に入らないとき（控える前に描かれた等）は**何も出さない**。
 * 空のコードブロックを置くと、そこに何かがあったことだけが残って読み手を惑わせる。
 */
function mermaidMarkdown(el: Element): string[] {
  const kept = el.getAttribute(MERMAID_SOURCE_MARK);
  const source = (kept ?? (el.hasAttribute(MERMAID_DONE_MARK) ? "" : (el.textContent ?? ""))).trim();
  if (source.length === 0) return [];
  const ticks = source.includes("```") ? "````" : "```";
  return [`${ticks}mermaid\n${source}\n${ticks}`];
}

function preMarkdown(el: Element): string {
  const code = el.querySelector("code") ?? el;
  const langHit = /(?:^|\s)language-([a-z0-9+_-]+)/i.exec(code.getAttribute("class") ?? "");
  const lang = langHit?.[1] ?? "";
  const body = (code.textContent ?? "").replace(/\n$/, "");
  const ticks = body.includes("```") ? "````" : "```";
  return lang.length > 0 ? `${ticks}${lang}\n${body}\n${ticks}` : `${ticks}\n${body}\n${ticks}`;
}

function distinctLines(el: Element): string[] {
  const lines: string[] = [];
  const seen = new Set<string>();
  const push = (value: string): void => {
    const text = collapse(value);
    if (text.length === 0 || seen.has(text)) return;
    seen.add(text);
    lines.push(text);
  };
  const kids = childElements(el);
  if (kids.length === 0) {
    push(inlineChildren(el));
    return lines;
  }
  for (const kid of kids) {
    const tag = tagOf(kid);
    if (HEADING_LEVEL[tag] !== undefined) {
      push(inlineChildren(kid));
      continue;
    }
    if (tag === "p" || tag === "span" || tag === "div") {
      const inner = childElements(kid);
      if (inner.length === 0) {
        push(inlineChildren(kid));
        continue;
      }
      for (const line of distinctLines(kid)) push(line);
      continue;
    }
    push(inlineChildren(kid));
  }
  if (lines.length === 0) push(inlineChildren(el));
  return lines;
}

function flowMarkdown(el: Element): string {
  const lines: string[] = [];
  for (const kid of flowKids(el)) {
    if (isArrowCluster(kid) || isArrowIcon(kid)) {
      const label = isArrowIcon(kid) ? "" : collapse(plainText(kid));
      lines.push(label.length > 0 ? `  → ${label}` : "  →");
      continue;
    }
    const parts = distinctLines(kid);
    if (parts.length === 0) continue;
    lines.push(parts[0]);
    for (const part of parts.slice(1)) lines.push(`  ${part}`);
  }
  return fence(lines.join("\n"));
}

function chipsMarkdown(el: Element): string {
  return childElements(el)
    .map((kid) => collapse(plainText(kid)))
    .filter((text) => text.length > 0)
    .map((text) => `- ${text}`)
    .join("\n");
}

function cardItem(el: Element): string {
  const parts = distinctLines(el);
  if (parts.length === 0) return "";
  if (parts.length === 1) return `- ${parts[0]}`;
  return `- ${parts[0]} — ${parts.slice(1).join(" / ")}`;
}

function gridMarkdown(el: Element): string {
  return childElements(el)
    .map(cardItem)
    .filter((line) => line.length > 0)
    .join("\n");
}

function structureMarkdown(el: Element, depth: number): string[] {
  const lines: string[] = [];
  const indent = "  ".repeat(depth);
  const kids = childElements(el);
  const heading = kids.find((kid) => HEADING_LEVEL[tagOf(kid)] !== undefined);
  const labelKids = kids.filter((kid) => !looksLikeCard(kid) && tagOf(kid) !== "img");
  const cards = kids.filter(looksLikeCard);
  if (heading !== undefined) {
    lines.push(`${indent}${collapse(inlineChildren(heading))}`);
  } else {
    const label = labelKids
      .map((kid) => collapse(plainText(kid)))
      .filter((text) => text.length > 0);
    if (label.length > 0) lines.push(`${indent}${label.join(" — ")}`);
  }
  if (cards.length === 0 && heading === undefined && labelKids.length === 0) {
    const text = collapse(plainText(el));
    if (text.length > 0) lines.push(`${indent}${text}`);
  }
  for (const card of cards) {
    lines.push(...structureMarkdown(card, depth + (lines.length > 0 || depth > 0 ? 1 : 0)));
  }
  return lines;
}

function isStructureFigure(el: Element): boolean {
  if (!looksLikeCard(el)) return false;
  // 矢印の並びを包んでいるだけの面は、流れの図として扱う
  if (childElements(el).some(isFlow) || descendantElements(el).some(isFlow)) return false;
  const kids = childElements(el).filter(looksLikeCard);
  return kids.some((kid) => childElements(kid).some(looksLikeCard));
}

/**
 * スライドの 1 枚。最初の枚でなければ、手前に区切り（`---`）を置く。
 *
 * 「最初か」は文書全体で見る。実行部は枚を器（frame）で包むので、生きている DOM では
 * 枚どうしが兄弟でない——兄弟を見て決めると、保管庫の HTML と画面で数が食い違う。
 */
function deckSlideMarkdown(el: Element): string[] {
  const inner = walkChildren(el);
  const first = el.ownerDocument.querySelector(`section[${DECK_SLIDE}]`);
  return first === el ? inner : ["---", ...inner];
}

/** スピーカーノート。中の段を引用にし、先頭に「ノート:」と書く。空なら何も出さない。 */
function deckNotesMarkdown(el: Element): string[] {
  const blocks = walkChildren(el);
  if (blocks.length === 0) return [];
  const lines: string[] = [];
  blocks.forEach((block, at) => {
    if (at > 0) lines.push("");
    lines.push(...block.split("\n"));
  });
  lines[0] = `ノート: ${lines[0]}`;
  return [lines.map((line) => (line.length === 0 ? ">" : `> ${line}`)).join("\n")];
}

function blocksOf(el: Element): string[] {
  const tag = tagOf(el);
  if (shouldSkip(el) || isChromeFooter(el)) return [];

  // 図はタグを問わない（<pre> でも <div> でも書ける）ので、タグで分ける前に見る
  if (isMermaid(el)) return mermaidMarkdown(el);

  // スライド。枚と枚の間に区切りを置く（Marp の `---` と同じ見え方だが、それ以上は寄せない）
  if (tag === "section" && el.hasAttribute(DECK_SLIDE)) return deckSlideMarkdown(el);
  // スピーカーノート。本文と地続きに読ませず、引用として出す
  if (tag === "aside" && el.hasAttribute(DECK_NOTES)) return deckNotesMarkdown(el);

  if (HEADING_LEVEL[tag] !== undefined) {
    const text = headingMarkdown(el);
    return text.length === 0 ? [] : [text];
  }
  if (tag === "p") {
    const text = collapse(inlineChildren(el).replace(/\n+/g, " "));
    return text.length === 0 ? [] : [text];
  }
  if (tag === "blockquote") {
    const inner = collapse(inlineChildren(el));
    return inner.length === 0 ? [] : [inner.split("\n").map((line) => `> ${line}`).join("\n")];
  }
  if (tag === "pre") return [preMarkdown(el)];
  if (tag === "ul") return [listMarkdown(el, false)];
  if (tag === "ol") return [listMarkdown(el, true)];
  if (tag === "table") return [tableMarkdown(el)];
  if (tag === "hr") return ["---"];
  if (tag === "img") return [imageMarkdown(el)];
  if (tag === "video") { const child=el.querySelector("source");const src=authoredMediaSource(el) ?? (child?authoredMediaSource(child):null);return src?[`[動画] ${src}`]:[]; }
  if (tag === "figure") {
    const parts = walkChildren(el);
    return parts;
  }
  if (tag === "figcaption") {
    const text = collapse(inlineChildren(el));
    return text.length === 0 ? [] : [text];
  }
  if (tag === "br") return [];

  if (isDividerLabel(el)) {
    const text = collapse(plainText(el));
    return text.length === 0 ? [] : [text];
  }
  if (isFlow(el)) return [flowMarkdown(el)];
  if (isChipRow(el)) {
    const chips = chipsMarkdown(el);
    return chips.length === 0 ? [] : [chips];
  }
  if (isCardGrid(el)) {
    const grid = gridMarkdown(el);
    return grid.length === 0 ? [] : [grid];
  }
  if (isStepRow(el)) {
    const kids = childElements(el);
    const number = collapse(plainText(kids[0]));
    const rest = blocksOf(kids[1]);
    if (rest.length === 0) return [];
    const first = rest[0];
    if (first.startsWith("#")) {
      const at = first.indexOf(" ");
      const headed = at < 0 ? first : `${first.slice(0, at)} ${number}. ${first.slice(at + 1)}`;
      return [headed, ...rest.slice(1)];
    }
    return [`${number}. ${first}`, ...rest.slice(1)];
  }
  if (isStructureFigure(el)) {
    const lines = structureMarkdown(el, 0).filter((line) => collapse(line).length > 0);
    return lines.length === 0 ? [] : [fence(lines.join("\n"))];
  }

  if (tag === "li") {
    const text = collapse(inlineChildren(el));
    return text.length === 0 ? walkChildren(el) : [text];
  }

  return walkChildren(el);
}

function walkChildren(el: Element): string[] {
  const out: string[] = [];
  let run = "";
  const flush = (): void => {
    const text = collapse(run);
    if (text.length > 0) out.push(text);
    run = "";
  };
  for (const child of el.childNodes) {
    if (child.nodeType === TEXT) {
      run += child.textContent ?? "";
      continue;
    }
    if (!isElement(child)) continue;
    flush();
    out.push(...blocksOf(child));
  }
  flush();
  return out.filter((block) => block.length > 0);
}

function commentsMarkdown(comments: readonly PageComment[]): string {
  const tops = comments.filter((comment) => comment.parentId === null);
  const repliesOf = (id: string): PageComment[] =>
    comments.filter((comment) => comment.parentId === id);

  const lines: string[] = ["## コメント"];
  if (tops.length === 0) {
    lines.push("", "コメントはまだありません。");
    return lines.join("\n");
  }

  for (const priority of COMMENT_PRIORITIES) {
    const items = tops.filter((comment) => comment.priority === priority);
    if (items.length === 0) continue;
    lines.push("", `### ${PRIORITY_HEADING[priority]} ${items.length} 件`);
    items.forEach((comment, position) => {
      const status = comment.resolvedAt === null ? "未解決" : "解決済";
      const quote = comment.quote === null ? "（引用なし）" : `「${comment.quote}」`;
      lines.push("", `#### ${position + 1}. [${status}] ${quote}`);
      lines.push(`- ${comment.author.name}`);
      if (comment.body.length > 0) lines.push("", comment.body);
      for (const reply of repliesOf(comment.id)) {
        lines.push("", `> **${reply.author.name}**: ${reply.body.replace(/\n/g, " ")}`);
      }
    });
  }
  return lines.join("\n");
}

/**
 * ページ本文（と、必要ならコメント）を 1 本のマークダウンにする。
 *
 * 先頭はページの名前と出典。本文の見出しが同じ名前なら、二重にしない。
 */
function hasNodeType(value: object): value is { nodeType: number } {
  return "nodeType" in value && typeof value.nodeType === "number";
}

function elementRoot(root: ParentNode): Element | null {
  if (isElement(root)) return root;
  if (!("body" in root)) return null;
  const body: unknown = root.body;
  if (typeof body !== "object" || body === null || !hasNodeType(body)) return null;
  return isElement(body) ? body : null;
}

function isDocumentRoot(root: ParentNode): root is Document {
  return root.nodeType === 9 && "body" in root && "createElement" in root;
}

export function pageToMarkdown(input: PageMarkdownInput): string {
  const owner = isDocumentRoot(input.root)
    ? input.root
    : "ownerDocument" in input.root ? input.root.ownerDocument : null;
  if (owner !== null) ensureDeckPublicSupplements(owner);
  const rootEl = elementRoot(input.root);
  const blocks = rootEl === null ? [] : blocksOf(rootEl);

  const title = input.title === null ? "" : collapse(input.title);
  const lines: string[] = [];
  if (title.length > 0) lines.push(`# ${title}`);
  if (input.url.length > 0) {
    if (lines.length > 0) lines.push("");
    lines.push(input.url);
  }

  const rest: string[] = [];
  let skippedTitle = title.length === 0;
  const foldedTitle = folded(title);
  for (const block of blocks) {
    if (
      !skippedTitle &&
      block.startsWith("# ") &&
      !block.startsWith("## ") &&
      folded(block.slice(2)) === foldedTitle
    ) {
      skippedTitle = true;
      continue;
    }
    rest.push(block);
  }

  if (rest.length > 0) {
    if (lines.length > 0) lines.push("");
    lines.push(rest.join("\n\n"));
  }

  if (input.comments !== undefined && input.comments !== null) {
    if (lines.length > 0) lines.push("", "---", "");
    lines.push(commentsMarkdown(input.comments));
  }

  return `${lines.join("\n").replace(/\n{3,}/g, "\n\n").trim()}\n`;
}
