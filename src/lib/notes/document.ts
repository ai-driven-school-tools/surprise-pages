/**
 * メモ帳の本文を、清書の HTML 1 枚に組む（サーバーだけ）。
 *
 * 編集の部品が送ってくるのは**クラスを持たない素の本文**（下の「受け取る形」）。サーバーがそれを 1 つずつ確かめ、
 * 清書の変換器と同じ形・同じクラスに組み直して、**直す前のページの額縁**（head・main の外・main の属性）にそのまま流し込む。だから:
 *
 *   - main の印（`data-clean-copy-document`・`data-clean-copy-look`）は残り、メモの印（`data-note-document`）が足される。
 *     配信の見た目の付け替え・目次・コメント・書き出しが、清書のページとまったく同じに効く
 *   - クラスの値は写しの表（src/lib/settings/clean-copy-look.generated.json）から引く。値を書き写さない。表に役目の無い形
 *     （区切り線・トグル）の値はブロックの台帳（src/lib/notes/blocks.ts の NOTE_OWN_LOOK）の 1 か所から引く
 *   - 書ける形はブロックの台帳のものだけ。ほかの形・仕掛けは受け取らない（断る）。ブラウザの送ったクラス・属性は 1 つも通さない
 *   - 本文の末尾の出典の札（`data-source-note`）は、直す前のページのものをそのまま引き継ぐ（編集の部品は札に触らない）
 *
 * 受け取る形（ブロック）:
 *   <p>行の中</p> / <h2>行の中</h2> / <h3>行の中</h3>
 *   <p data-note>行の中</p>（注記。清書の「※ で始まる段落」と同じ見た目）
 *   <ul><li>行の中 [入れ子の ul|ol]</li></ul> / <ol>…</ol>（入れ子は NOTE_LIST_DEPTH 段まで）
 *   <ul data-tasks><li data-checked="true|false">行の中</li></ul>
 *   <blockquote>行の中</blockquote> / <pre>文字だけ</pre> / <hr>
 *   <table><tr><th|td>行の中</th|td>…</tr>…</table>（1 行目が見出しの行。清書の変換器の表と同じ形に組む）
 *   <details [open]><summary>行の中</summary><div>中のブロック</div></details>（トグル。中に見出し・トグル・絵は置けない）
 *   <figure data-embed="youtube" data-id="動画の id">添え書き（行の中）</figure>（埋め込み。許可した相手だけ。本文にはリンクの箱で残す）
 *   <figure data-kind="image|video" data-src="_deck/media-… か、ページの中の相対の道筋" data-alt="…">添え書き（行の中）</figure>
 * 行の中: 文字 / <strong> / <em> / <code>文字だけ</code> / <a href="https:|http:|mailto:"> / <br>
 */
import { parseFragment, type DefaultTreeAdapterTypes } from "parse5";
import { z } from "zod";
import generated from "../settings/clean-copy-look.generated.json";
import { isDeckMediaAssetPath } from "../deck/edit/assets";
import { isYouTubeId } from "../deck/media/youtube-id";
import { defaultTranslate } from "../i18n/default";
import { LocalizedError } from "../i18n/errors";
import { escapeAttribute as escapeAttr, escapeText } from "../html/escape";
import { sourceNoteOf } from "../html/source-note";
import { NOTE_EMBED_FRAME_ATTR, NOTE_EMBED_PROVIDERS, NOTE_EMBED_STYLE, NOTE_OWN_LOOK, NOTE_TABLE_MAX_COLUMNS, NOTE_TABLE_MAX_ROWS, noteEmbedHref } from "./blocks";
import { isNoteMediaKind, NOTE_DOCUMENT_ATTR, NOTE_LIST_DEPTH, noteNameFromText } from "./model";

type Node = DefaultTreeAdapterTypes.Node;
type Element = DefaultTreeAdapterTypes.Element;

/** 写しの表のうち、メモが使う役目（清書の変換器の役目の名前と同じ）。 */
const lookSchema = z.object({
  current: z.object({
    stamp: z.string(),
    styles: z.object({ default: z.record(z.string(), z.string()) }),
  }),
});
const LOOK = lookSchema.parse(generated).current;
const ROLES = ["p", "h1", "h2", "h3", "ul", "ol", "task_ul", "task_icon", "quote_box", "quote_long", "pre", "code_block", "code_inline", "strong", "em", "img", "note", "section", "table", "th", "td"] as const;
type Role = (typeof ROLES)[number];
function style(role: Role): string {
  const value = LOOK.styles.default[role];
  if (value === undefined) throw new Error(`clean-copy look has no ${role} role`);
  return value;
}
// 読み込みの時点で全部の役目を確かめる（写しを上げて役目が消えたら、ここで止まる）
for (const role of ROLES) style(role);

/** 本文がメモで書けない形を含んでいた。窓口は 400 で返す（待っても直らない）。 */
export class NoteBodyError extends LocalizedError {
  constructor() {
    super("notes.server.badBody");
    this.name = "NoteBodyError";
  }
}

function isElement(node: Node): node is Element {
  return "tagName" in node;
}
function attr(element: Element, name: string): string | null {
  return element.attrs.find((one) => one.name === name)?.value ?? null;
}
/** 受け取る属性は決まった名前だけ。ほかの属性が 1 つでもあれば断る（仕掛けの属性を黙って落とさない）。 */
function onlyAttrs(element: Element, allowed: readonly string[]): void {
  for (const one of element.attrs) if (!allowed.includes(one.name)) throw new NoteBodyError();
}
/** 要素の間の空白（改行・字下げ）だけは読み飛ばす。それ以外の文字はブロックの外に置けない。 */
function blockChildren(node: Element | DefaultTreeAdapterTypes.DocumentFragment): Element[] {
  const out: Element[] = [];
  for (const child of node.childNodes) {
    if (isElement(child)) out.push(child);
    else if (child.nodeName === "#text" && "value" in child && child.value.trim() === "") continue;
    else if (child.nodeName === "#comment") continue;
    else throw new NoteBodyError();
  }
  return out;
}

const LINK = /^(?:https?:\/\/|mailto:)[^\s"<>]+$/i;

/**
 * 絵の置き場。素材の口が作った上書きしない名前（`_deck/media-…`）か、ページの中の相対の道筋（清書のスキルが原本と一緒に上げた絵）だけ。
 * よその URL・別のページの素材・上へ出る道筋・仕掛けの行き先は通さない。
 */
const RELATIVE_MEDIA = /^(?![./])(?!.*(?:^|\/)\.\.?(?:\/|$))[^\s"'<>\\:?#]{1,300}$/u;
const MEDIA_EXTENSION: Record<"image" | "video", RegExp> = {
  image: /\.(?:png|jpe?g|webp|gif|avif|svg)$/i,
  video: /\.(?:mp4|webm)$/i,
};
export function isNoteMediaPath(src: string, kind: "image" | "video"): boolean {
  if (isDeckMediaAssetPath(src)) return MEDIA_EXTENSION[kind].test(src);
  return RELATIVE_MEDIA.test(src) && !src.includes("//") && MEDIA_EXTENSION[kind].test(src);
}

/** 行の中を組み直す。 */
function inline(nodes: readonly Node[]): string {
  let out = "";
  for (const node of nodes) {
    if (!isElement(node)) {
      if (node.nodeName === "#text" && "value" in node) out += escapeText(node.value);
      else if (node.nodeName !== "#comment") throw new NoteBodyError();
      continue;
    }
    switch (node.tagName) {
      case "strong":
        onlyAttrs(node, []);
        out += `<strong class="${style("strong")}">${inline(node.childNodes)}</strong>`;
        break;
      case "em":
        onlyAttrs(node, []);
        out += `<em class="${style("em")}">${inline(node.childNodes)}</em>`;
        break;
      case "code":
        onlyAttrs(node, []);
        out += `<code class="${style("code_inline")}">${escapeText(plainText(node))}</code>`;
        break;
      case "a": {
        onlyAttrs(node, ["href"]);
        const href = attr(node, "href") ?? "";
        if (!LINK.test(href)) throw new NoteBodyError();
        out += `<a href="${escapeAttr(href)}">${inline(node.childNodes)}</a>`;
        break;
      }
      case "br":
        onlyAttrs(node, []);
        out += "<br>";
        break;
      default:
        throw new NoteBodyError();
    }
  }
  return out;
}

/** 文字だけを取り出す（コードの中）。要素が混じっていたら断る。 */
function plainText(element: Element): string {
  let out = "";
  for (const child of element.childNodes) {
    if (child.nodeName === "#text" && "value" in child) out += child.value;
    else throw new NoteBodyError();
  }
  return out;
}

/** 箇条書きの 1 行。行の中のあとに、入れ子の箇条書きを 1 つだけ置ける。 */
function listItem(element: Element, depth: number): string {
  onlyAttrs(element, []);
  const nested = element.childNodes.filter((child) => isElement(child) && (child.tagName === "ul" || child.tagName === "ol"));
  if (nested.length > 1) throw new NoteBodyError();
  const head = element.childNodes.filter((child) => !nested.includes(child));
  let out = `<li>${inline(head)}`;
  const inner = nested[0];
  if (inner !== undefined && isElement(inner)) {
    if (depth >= NOTE_LIST_DEPTH) throw new NoteBodyError();
    out += `\n${list(inner, depth + 1)}`;
  }
  return `${out}</li>`;
}

function list(element: Element, depth: number): string {
  if (element.tagName === "ul" && attr(element, "data-tasks") !== null) {
    onlyAttrs(element, ["data-tasks"]);
    const items = blockChildren(element).map((item) => {
      if (item.tagName !== "li") throw new NoteBodyError();
      onlyAttrs(item, ["data-checked"]);
      const checked = attr(item, "data-checked");
      if (checked !== "true" && checked !== "false") throw new NoteBodyError();
      const icon = checked === "true" ? "check" : "square";
      return `<li data-note-task="${checked === "true" ? "done" : "open"}"><span class="${NOTE_OWN_LOOK.taskRow}"><i data-lucide="${icon}" class="${style("task_icon")}"></i><span>${inline(item.childNodes)}</span></span></li>`;
    });
    if (items.length === 0) throw new NoteBodyError();
    return `<ul class="${style("task_ul")}">\n${items.join("\n")}\n</ul>`;
  }
  onlyAttrs(element, []);
  const items = blockChildren(element).map((item) => {
    if (item.tagName !== "li") throw new NoteBodyError();
    return listItem(item, depth);
  });
  if (items.length === 0) throw new NoteBodyError();
  const tag = element.tagName === "ol" ? "ol" : "ul";
  return `<${tag} class="${style(tag)}">\n${items.join("\n")}\n</${tag}>`;
}

function figure(element: Element): string {
  onlyAttrs(element, ["data-kind", "data-src", "data-alt"]);
  const kind = attr(element, "data-kind");
  const src = attr(element, "data-src") ?? "";
  const alt = attr(element, "data-alt") ?? "";
  if (!isNoteMediaKind(kind) || !isNoteMediaPath(src, kind) || alt.length > 300) throw new NoteBodyError();
  const caption = inline(element.childNodes).trim();
  const media =
    kind === "image"
      ? `<img src="${escapeAttr(src)}" alt="${escapeAttr(alt)}" class="${style("img")}">`
      : `<video src="${escapeAttr(src)}" controls preload="metadata" playsinline class="${style("img")}"></video>`;
  const label = alt.length > 0 && kind !== "image" ? ` aria-label="${escapeAttr(alt)}"` : "";
  return `<figure data-note-media="${kind}"${label}>${media}${caption.length > 0 ? `<figcaption class="${style("note")}">${caption}</figcaption>` : ""}</figure>`;
}

/** 行の中の字だけ（改行は改行のまま）。名前を作るときに使う。形の確かめは inline が先に済ませている。 */
function textOf(nodes: readonly Node[]): string {
  let out = "";
  for (const node of nodes) {
    if (!isElement(node)) {
      if (node.nodeName === "#text" && "value" in node) out += node.value;
    } else if (node.tagName === "br") out += "\n";
    else out += textOf(node.childNodes);
  }
  return out;
}

/** 箇条書きの最初の 1 行の字（入れ子の箇条書きは含めない）。 */
function firstItemText(element: Element): string {
  const first = blockChildren(element)[0];
  if (first === undefined) return "";
  return textOf(first.childNodes.filter((child) => !(isElement(child) && (child.tagName === "ul" || child.tagName === "ol"))));
}

/** 組み直した行の中から字だけ（枠の名前に使う）。 */
function plainOf(html: string): string {
  return html.replace(/<br>/g, " ").replace(/<[^>]*>/g, "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&").trim();
}

function embed(element: Element): string {
  onlyAttrs(element, ["data-embed", "data-id"]);
  const provider = attr(element, "data-embed");
  const id = attr(element, "data-id");
  // 相手は台帳の許可した動画サイトだけ。枠の行き先はサーバーが id から組む（送られた URL を枠に置かない）
  if (!NOTE_EMBED_PROVIDERS.some((one) => one === provider) || !isYouTubeId(id)) throw new NoteBodyError();
  const caption = inline(element.childNodes).trim();
  const title = caption.length > 0 ? plainOf(caption) : defaultTranslate("notes.editor.embedTitle");
  // 本文には枠を書かず、元の動画へのリンクの箱を置く（保存する HTML に iframe を書けない決まり・見るときに道具箱が枠へ差し替える）
  const frame = `<a href="${escapeAttr(noteEmbedHref(id))}" ${NOTE_EMBED_FRAME_ATTR}="" aria-label="${escapeAttr(title)}" class="${style("img")}" style="${NOTE_EMBED_STYLE}"></a>`;
  return `<figure data-note-embed="youtube" data-note-embed-id="${escapeAttr(id)}">${frame}${caption.length > 0 ? `<figcaption class="${style("note")}">${caption}</figcaption>` : ""}</figure>`;
}

/**
 * 表。1 行目を見出しの行（th）に、残りを本文の行（td）に組む。清書の変換器（convert.py の _table）と同じ形・同じ改行で出すので、
 * 配信の付け替え・書き出し（表のまま）がスキルで作った清書の表と同じに効く。行の長さは一番長い行にそろえる。
 */
function table(element: Element): string {
  onlyAttrs(element, []);
  const rows: Element[] = [];
  for (const part of blockChildren(element)) {
    if (part.tagName === "tr") rows.push(part);
    else if (part.tagName === "thead" || part.tagName === "tbody") {
      onlyAttrs(part, []);
      for (const row of blockChildren(part)) {
        if (row.tagName !== "tr") throw new NoteBodyError();
        rows.push(row);
      }
    } else throw new NoteBodyError();
  }
  const cells = rows.map((row) => {
    onlyAttrs(row, []);
    return blockChildren(row).map((cell) => {
      if (cell.tagName !== "th" && cell.tagName !== "td") throw new NoteBodyError();
      onlyAttrs(cell, []);
      return inline(cell.childNodes);
    });
  });
  const width = Math.max(0, ...cells.map((row) => row.length));
  if (cells.length === 0 || width === 0 || width > NOTE_TABLE_MAX_COLUMNS || cells.length > NOTE_TABLE_MAX_ROWS) throw new NoteBodyError();
  const padded = cells.map((row) => [...row, ...Array.from({ length: width - row.length }, () => "")]);
  const [head, ...body] = padded;
  let html = `<table class="${style("table")}">\n<thead>\n<tr>\n${head.map((cell) => `<th class="${style("th")}">${cell}</th>`).join("\n")}\n</tr>\n</thead>`;
  if (body.length > 0) html += `\n<tbody>\n${body.map((row) => `<tr>\n${row.map((cell) => `<td class="${style("td")}">${cell}</td>`).join("\n")}\n</tr>`).join("\n")}\n</tbody>`;
  return `${html}\n</table>`;
}

/** トグル。頭の行（summary）と中のブロック。開いているかは書いた人が決めた見え方として残す（読む人の最初の見え方）。 */
function toggle(element: Element): string {
  onlyAttrs(element, ["open"]);
  const [summary, body, ...rest] = blockChildren(element);
  if (summary === undefined || summary.tagName !== "summary" || body === undefined || body.tagName !== "div" || rest.length > 0) throw new NoteBodyError();
  onlyAttrs(summary, []);
  onlyAttrs(body, []);
  const inner = blockChildren(body).map((child) => innerBlock(child)).filter((html) => html !== null);
  const open = attr(element, "open") !== null ? ' open=""' : "";
  return `<details data-note-toggle=""${open} class="${NOTE_OWN_LOOK.toggle}">\n<summary class="${NOTE_OWN_LOOK.summary}">${inline(summary.childNodes)}</summary>\n<div class="${NOTE_OWN_LOOK.toggleBody}">${inner.length > 0 ? `\n${inner.join("\n")}\n` : ""}</div>\n</details>`;
}

/** 段落と注記。空の段落は落とす（清書は空行を内容として持たない）。 */
function paragraph(element: Element): string | null {
  const note = attr(element, "data-note") !== null;
  onlyAttrs(element, note ? ["data-note"] : []);
  const text = inline(element.childNodes);
  if (text.replace(/<br>/g, "").trim().length === 0) return null;
  return `<p class="${style(note ? "note" : "p")}">${text}</p>`;
}

/** トグルの中にも置けるブロック（見出し・トグル・絵は置けない。見出しは節を割り、絵は落とす場所が本文の行の間だけのため）。 */
function innerBlock(element: Element): string | null {
  switch (element.tagName) {
    case "p":
      return paragraph(element);
    case "ul":
    case "ol":
      return list(element, 1);
    case "blockquote":
      onlyAttrs(element, []);
      return `<figure class="${style("quote_box")}">\n<blockquote class="${style("quote_long")}">\n<p>${inline(element.childNodes)}</p>\n</blockquote>\n</figure>`;
    case "pre":
      onlyAttrs(element, []);
      return `<pre class="${style("pre")}"><code class="${style("code_block")}">${escapeText(plainText(element))}</code></pre>`;
    case "hr":
      onlyAttrs(element, []);
      return `<hr class="${NOTE_OWN_LOOK.rule}">`;
    case "table":
      return table(element);
    case "figure":
      if (attr(element, "data-embed") === null) throw new NoteBodyError();
      return embed(element);
    default:
      throw new NoteBodyError();
  }
}

/** 題の無いメモの名前の元にする、ブロックの字（字の無いブロック・区切り線・表・添え書きの無い絵は空）。 */
function leadOf(element: Element): string {
  switch (element.tagName) {
    case "p":
    case "h2":
    case "h3":
    case "blockquote":
    case "figure":
      return textOf(element.childNodes);
    case "ul":
    case "ol":
      return firstItemText(element);
    case "pre":
      return plainText(element);
    case "details": {
      const summary = blockChildren(element)[0];
      return summary === undefined ? "" : textOf(summary.childNodes);
    }
    default:
      return "";
  }
}

/**
 * 受け取った本文を、清書の形に組み直す。h2 から次の h2 の手前までを section に入れる（清書の変換器の _wrap_sections と同じ）。
 * 空の段落は落とす（清書は空行を内容として持たない）。
 *
 * あわせて、題の無いメモの名前の元（冒頭）を拾う: 最初の、字のある部分（段落・見出し・箇条書きの最初の行・引用・コード・
 * 絵の添え書き）。区切り線と添え書きの無い絵は飛ばす。名前の決め方の正本はここと src/lib/notes/model.ts の noteNameFromText だけ。
 */
function assembleBody(body: string): { html: string; lead: string } {
  const pieces: Array<{ heading: boolean; html: string }> = [];
  let lead = "";
  for (const element of blockChildren(parseFragment(body))) {
    if (element.tagName === "h2" || element.tagName === "h3") {
      onlyAttrs(element, []);
      pieces.push({ heading: element.tagName === "h2", html: `<${element.tagName} class="${style(element.tagName)}">${inline(element.childNodes)}</${element.tagName}>` });
    } else if (element.tagName === "details") pieces.push({ heading: false, html: toggle(element) });
    else if (element.tagName === "figure" && attr(element, "data-embed") === null) pieces.push({ heading: false, html: figure(element) });
    else {
      // 残りはトグルの中にも置けるブロック（埋め込みもここ）
      const html = innerBlock(element);
      if (html !== null) pieces.push({ heading: false, html });
    }
    if (lead.length === 0) lead = noteNameFromText(leadOf(element));
  }
  const out: string[] = [];
  let section: string[] | null = null;
  for (const piece of pieces) {
    if (piece.heading) {
      if (section !== null) out.push(`<section class="${style("section")}">\n${section.join("\n")}\n</section>`);
      section = [piece.html];
    } else if (section === null) out.push(piece.html);
    else section.push(piece.html);
  }
  if (section !== null) out.push(`<section class="${style("section")}">\n${section.join("\n")}\n</section>`);
  return { html: out.join("\n"), lead };
}

/** 送る形の本文を、清書の本文（main の中身）に組み直したもの。検査が往復を見るのに使う。 */
export function canonicalNoteBody(body: string): string {
  return assembleBody(body).html;
}

/** 題（1 行目）。改行と前後の空白を落とす。 */
export function noteTitle(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

/** 直す前のページの main の開きタグ・中身・閉じタグの位置。main が無い（清書でない）ときは null。 */
function mainOf(html: string): { open: string; start: number; end: number } | null {
  const open = /<main\b[^>]*>/i.exec(html);
  if (open === null) return null;
  const start = open.index + open[0].length;
  const end = html.lastIndexOf("</main>");
  if (end < start) return null;
  return { open: open[0], start, end };
}

/** タブの名前と共有の題を書き直す（清書の額縁の <title> と og:title）。 */
function withTitle(html: string, name: string): string {
  const escaped = escapeText(name);
  return html
    .replace(/<title>[\s\S]*?<\/title>/i, `<title>${escaped}</title>`)
    .replace(/(<meta\s+property="og:title"\s+content=")[^"]*(")/i, `$1${escapeAttr(name)}$2`);
}

/**
 * メモの HTML 1 枚と、その名前。直す前のページ（`base`・頭の版の HTML）の額縁はそのまま、main の中身だけを組み直した本文に
 * 差し替え、main にメモの印を付ける。本文の末尾の出典の札は直す前のものを引き継ぐ。
 * 題が空なら本文の h1 は置かず、ページの名前（一覧に出る名前）は本文の冒頭から決める（冒頭も無ければ「無題」）。
 */
export function composeNote(input: { title: string; body: string; base: string }): { html: string; name: string } {
  const main = mainOf(input.base);
  if (main === null) throw new NoteBodyError();
  const title = noteTitle(input.title);
  const { html: body, lead } = assembleBody(input.body);
  const name = title.length > 0 ? title : lead;
  // 版に残る本文の字なので、日本語の正本の語（無題）で積む（一覧で出すときは保存された題のまま）
  const named = name.length > 0 ? name : defaultTranslate("notes.untitled");
  const heading = title.length > 0 ? `<h1 class="${style("h1")}">${escapeText(title)}</h1>\n` : "";
  const sourceNote = sourceNoteOf(input.base.slice(main.start, main.end));
  const content = `\n${heading}${body}${sourceNote === null ? "" : `\n${sourceNote}`}\n`;
  const open = new RegExp(`\\s${NOTE_DOCUMENT_ATTR}(?:=|\\s|>)`).test(main.open) ? main.open : main.open.replace(/^<main\b/i, `<main ${NOTE_DOCUMENT_ATTR}=""`);
  const page = `${input.base.slice(0, main.start - main.open.length)}${open}${content}${input.base.slice(main.end)}`;
  return { html: withTitle(page, named), name };
}
