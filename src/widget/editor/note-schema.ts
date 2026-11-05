import { DOMParser as PMDOMParser, Schema, type DOMOutputSpec, type Mark, type Node as PMNode } from "prosemirror-model";
import { current } from "../../lib/settings/clean-copy-look.generated.json";
import { isYouTubeId } from "../../lib/deck/media/youtube-id";
import { escapeAttribute as escapeAttr, escapeText } from "../../lib/html/escape";
import { NOTE_EMBED_FRAME_ATTR, NOTE_EMBED_STYLE, NOTE_OWN_LOOK, noteEmbedHref } from "../../lib/notes/blocks";
import { isNoteMediaKind, type NoteMediaKind } from "../../lib/notes/model";

/**
 * メモ帳の書ける形の決まり（ProseMirror のスキーマ）。**ブロックの台帳（src/lib/notes/blocks.ts）と 1 対 1**:
 *
 *   題（h1）・見出し 2 段（h2・h3）・段落・注記・箇条書き・番号付き・確認の箱・トグル・引用・表・コードの塊・区切り線・埋め込み・
 *   絵（画像／動画＋添え書き）、行の中の太字・斜め・コード・リンク・改行
 *
 * トグルの中に置けるのは `inner` の組のブロックだけ（見出し・トグル・絵は置けない。src/lib/notes/document.ts の innerBlock と同じ）。
 * ここに無い形は入らない。読み込むのは 2 つの形:
 *   配信された清書の本文（クラス付き・節で包まれている・確認の箱は Lucide の絵）
 *   送る形・控えの形（src/lib/notes/document.ts の「受け取る形」）
 * 編集中の見た目は清書と同じクラスで描く（写しの表から引く。値を書き写さない）。サーバーは送られたクラスを使わず組み直す。
 */
const S = current.styles.default;

/** 清書の変換器が出さない形の見た目（ブロックの台帳の 1 か所・src/lib/notes/document.ts も同じものを読む）。 */
const L = NOTE_OWN_LOOK;

const SVG = "http://www.w3.org/2000/svg";
/** 確認の箱の絵。Lucide の square / check と同じ形（配信のページでは Lucide がこの形に差し替える）。 */
function taskIcon(checked: boolean): DOMOutputSpec {
  const shape: DOMOutputSpec = checked ? [`${SVG} path`, { d: "M20 6 9 17l-5-5" }] : [`${SVG} rect`, { width: "18", height: "18", x: "3", y: "3", rx: "2" }];
  return [
    `${SVG} svg`,
    { class: S.task_icon, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", "stroke-width": "2", "stroke-linecap": "round", "stroke-linejoin": "round", "aria-hidden": "true" },
    shape,
  ];
}

/** 絵の器と添え書きのクラス（編集の部品の絵のブロックも同じ値で描く）。 */
export const NOTE_MEDIA_CLASS = S.img;
export const NOTE_CAPTION_CLASS = S.note;
export function noteHeadingClass(level: 2 | 3): string {
  return level === 3 ? S.h3 : S.h2;
}
/** 埋め込みの枠のクラス（写しの表の img・編集の部品の枠も同じ値で描く）。 */
export const NOTE_EMBED_CLASS = S.img;

/** 編集の部品が本文に持ち込むクラスの全部（開いたときに見た目の道具へ先に見せておく・src/widget/editor/note-chrome.ts）。 */
export function noteEditorClasses(): string[] {
  return [S.img, S.note, S.h2, S.h3, S.ul, S.ol, S.task_ul, S.quote_box, S.quote_long, S.pre, S.code_block, L.rule, L.toggle, L.summary, L.toggleBody, L.taskRow, S.table, S.th, S.td];
}

function isTaskList(dom: HTMLElement): boolean {
  return dom.hasAttribute("data-tasks") || dom.querySelector(":scope > li[data-note-task], :scope > li[data-checked]") !== null || dom.getAttribute("class") === S.task_ul;
}
function isChecked(dom: HTMLElement): boolean {
  const flag = dom.getAttribute("data-checked") ?? dom.getAttribute("data-note-task");
  if (flag !== null) return flag === "true" || flag === "done";
  return dom.querySelector('[data-lucide="check"], .lucide-check') !== null;
}
function mediaKind(value: string | null): NoteMediaKind {
  return isNoteMediaKind(value) ? value : "image";
}
function mediaElementOf(dom: HTMLElement): HTMLElement | null {
  return dom.querySelector(":scope > img, :scope > video");
}
/** 配信は画像の src を軽量版の行き先に差し替え、保存された道筋を data-sp-image-original に残す（src/lib/page-images/html.ts）。 */
function storedSrc(media: HTMLElement): string {
  return media.getAttribute("data-sp-image-original") ?? media.getAttribute("src") ?? "";
}

export const noteSchema = new Schema({
  nodes: {
    doc: { content: "title block*" },
    title: {
      content: "text*",
      marks: "",
      defining: true,
      parseDOM: [{ tag: "h1" }],
      toDOM: () => ["h1", { class: S.h1 }, 0],
    },
    paragraph: {
      group: "block inner",
      content: "inline*",
      parseDOM: [{ tag: "p" }],
      toDOM: () => ["p", { class: S.p }, 0],
    },
    /** 注記。清書の「※ で始まる段落」と同じ見た目（写しの表の note）。読むときは段落の目印か、そのクラスで見分ける。 */
    callout: {
      group: "block inner",
      content: "inline*",
      parseDOM: [{ tag: "p", priority: 60, getAttrs: (dom) => (dom.hasAttribute("data-note") || dom.getAttribute("class") === S.note ? null : false) }],
      toDOM: () => ["p", { class: S.note }, 0],
    },
    heading: {
      group: "block",
      attrs: { level: { default: 2 } },
      content: "inline*",
      defining: true,
      parseDOM: [
        { tag: "h2", attrs: { level: 2 } },
        { tag: "h3", attrs: { level: 3 } },
      ],
      toDOM: (node) => (node.attrs.level === 3 ? ["h3", { class: S.h3 }, 0] : ["h2", { class: S.h2 }, 0]),
    },
    bullet_list: {
      group: "block inner",
      content: "list_item+",
      parseDOM: [{ tag: "ul", getAttrs: (dom) => (isTaskList(dom) ? false : null) }],
      toDOM: () => ["ul", { class: S.ul }, 0],
    },
    ordered_list: {
      group: "block inner",
      content: "list_item+",
      parseDOM: [{ tag: "ol" }],
      toDOM: () => ["ol", { class: S.ol }, 0],
    },
    list_item: {
      content: "item_text (bullet_list | ordered_list)?",
      defining: true,
      // 確認の箱の行（task_item）と取り違えないよう、ふつうの箇条書きの中の li だけを読む
      parseDOM: [{ tag: "li", context: "bullet_list/|ordered_list/" }],
      toDOM: () => ["li", 0],
    },
    /** 箇条書きの 1 行の字。清書では li の中に字が直に入るので、編集中だけ印の無い span で包む（送るときに外す）。 */
    item_text: {
      content: "inline*",
      parseDOM: [{ tag: "span[data-note-item]" }],
      toDOM: () => ["span", { "data-note-item": "" }, 0],
    },
    task_list: {
      group: "block inner",
      content: "task_item+",
      parseDOM: [{ tag: "ul", priority: 60, getAttrs: (dom) => (isTaskList(dom) ? null : false) }],
      toDOM: () => ["ul", { class: S.task_ul }, 0],
    },
    task_item: {
      attrs: { checked: { default: false } },
      content: "item_text",
      defining: true,
      parseDOM: [
        {
          tag: "li",
          context: "task_list/",
          priority: 60,
          getAttrs: (dom) => ({ checked: isChecked(dom) }),
          contentElement: (dom) => dom.querySelector(":scope > span > span") ?? dom,
        },
      ],
      toDOM: (node) => [
        "li",
        { "data-note-task": node.attrs.checked === true ? "done" : "open" },
        ["span", { class: L.taskRow }, ["span", { contenteditable: "false", "data-note-box": "", role: "checkbox", "aria-checked": node.attrs.checked === true ? "true" : "false" }, taskIcon(node.attrs.checked === true)], ["span", 0]],
      ],
    },
    quote: {
      group: "block inner",
      content: "inline*",
      defining: true,
      parseDOM: [
        {
          tag: "figure",
          getAttrs: (dom) => (dom.hasAttribute("data-note-media") || dom.hasAttribute("data-kind") || dom.querySelector(":scope > blockquote") === null ? false : null),
          contentElement: (dom) => dom.querySelector("blockquote > p") ?? dom.querySelector("blockquote") ?? dom,
        },
        { tag: "blockquote", contentElement: (dom) => dom.querySelector(":scope > p") ?? dom },
      ],
      toDOM: () => ["figure", { class: S.quote_box }, ["blockquote", { class: S.quote_long }, ["p", 0]]],
    },
    code_block: {
      group: "block inner",
      content: "text*",
      marks: "",
      code: true,
      defining: true,
      parseDOM: [{ tag: "pre", preserveWhitespace: "full", contentElement: (dom) => dom.querySelector("code") ?? dom }],
      toDOM: () => ["pre", { class: S.pre }, ["code", { class: S.code_block }, 0]],
    },
    rule: {
      group: "block inner",
      parseDOM: [{ tag: "hr" }],
      toDOM: () => ["hr", { class: L.rule }],
    },
    /** トグル（details）。頭の行と中のブロック。開いているかは書いた人の見え方として残す（新しく置いたものは開いている）。 */
    toggle: {
      group: "block",
      attrs: { open: { default: true } },
      content: "toggle_summary toggle_body",
      defining: true,
      parseDOM: [{ tag: "details", getAttrs: (dom) => ({ open: dom.hasAttribute("open") }) }],
      toDOM: (node) => ["details", node.attrs.open === true ? { "data-note-toggle": "", open: "", class: L.toggle } : { "data-note-toggle": "", class: L.toggle }, 0],
    },
    toggle_summary: {
      content: "inline*",
      defining: true,
      parseDOM: [{ tag: "summary" }],
      toDOM: () => ["summary", { class: L.summary }, 0],
    },
    toggle_body: {
      content: "inner+",
      parseDOM: [{ tag: "div", context: "toggle/" }],
      toDOM: () => ["div", { class: L.toggleBody }, 0],
    },
    /**
     * 表。1 行目が見出しの行（th）・残りが本文の行（td）。行の長さをそろえる・1 行目を見出しにするのは編集の部品の後始末
     * （src/widget/editor/note-block-edit.ts の tableShape）が受け持つ。セルの中は行の中だけ（清書の変換器の表と同じ）。
     */
    table: {
      group: "block inner",
      content: "table_row+",
      isolating: true,
      parseDOM: [{ tag: "table" }],
      toDOM: () => ["table", { class: S.table }, ["tbody", 0]],
    },
    table_row: {
      content: "(table_header | table_cell)+",
      parseDOM: [{ tag: "tr" }],
      toDOM: () => ["tr", 0],
    },
    table_header: {
      content: "inline*",
      isolating: true,
      parseDOM: [{ tag: "th" }],
      toDOM: () => ["th", { class: S.th }, 0],
    },
    table_cell: {
      content: "inline*",
      isolating: true,
      parseDOM: [{ tag: "td" }],
      toDOM: () => ["td", { class: S.td }, 0],
    },
    /** 埋め込み（許可した動画サイトだけ・src/lib/notes/blocks.ts）と添え書き。枠は字ではない（打てるのは添え書きだけ）。 */
    embed: {
      group: "block inner",
      attrs: { id: { default: "" } },
      content: "inline*",
      marks: "strong em code link",
      isolating: true,
      draggable: false,
      parseDOM: [
        {
          tag: "figure[data-note-embed]",
          priority: 75,
          getAttrs: (dom) => {
            const id = dom.getAttribute("data-note-embed-id");
            return isYouTubeId(id) ? { id } : false;
          },
          contentElement: (dom) => dom.querySelector(":scope > figcaption") ?? document.createElement("figcaption"),
        },
        {
          tag: "figure[data-embed]",
          priority: 75,
          getAttrs: (dom) => {
            const id = dom.getAttribute("data-id");
            return isYouTubeId(id) ? { id } : false;
          },
        },
      ],
      // 書き出し（コピー）では保存と同じリンクの箱（編集中の見た目は EmbedView が枠で描く）
      toDOM: (node) => ["figure", { "data-note-embed": "youtube", "data-note-embed-id": String(node.attrs.id) }, ["a", { href: noteEmbedHref(String(node.attrs.id)), [NOTE_EMBED_FRAME_ATTR]: "", class: S.img, style: NOTE_EMBED_STYLE, contenteditable: "false" }], ["figcaption", { class: S.note }, 0]],
    },
    /**
     * 絵（画像・動画）と添え書き。`upload` は上げている間だけの目印で、送る形にも清書にも書かない
     * （上げ終わって `src` が保管庫の道筋に替わるまで、送る本文には入れない）。
     * 清書のスキルが組んだ段落の中の絵（`<p><img></p>`）も、この 1 つのブロックとして読む（読み込みが段落を絵の前後で割る）。
     */
    media: {
      group: "block",
      attrs: { kind: { default: "image" }, src: { default: "" }, alt: { default: "" }, upload: { default: null } },
      content: "inline*",
      marks: "strong em code link",
      isolating: true,
      draggable: false,
      parseDOM: [
        {
          tag: "figure[data-note-media]",
          priority: 70,
          getAttrs: (dom) => {
            const media = mediaElementOf(dom);
            if (media === null) return false;
            return { kind: mediaKind(dom.getAttribute("data-note-media")), src: storedSrc(media), alt: media.getAttribute("alt") ?? dom.getAttribute("aria-label") ?? "" };
          },
          contentElement: (dom) => dom.querySelector(":scope > figcaption") ?? document.createElement("figcaption"),
        },
        {
          tag: "figure[data-kind]",
          priority: 70,
          getAttrs: (dom) => ({ kind: mediaKind(dom.getAttribute("data-kind")), src: dom.getAttribute("data-src") ?? "", alt: dom.getAttribute("data-alt") ?? "" }),
        },
        { tag: "img[src]", getAttrs: (dom) => ({ kind: "image", src: storedSrc(dom), alt: dom.getAttribute("alt") ?? "" }) },
        { tag: "video[src]", getAttrs: (dom) => ({ kind: "video", src: storedSrc(dom), alt: dom.getAttribute("aria-label") ?? "" }) },
      ],
      toDOM: (node) => {
        const kind = mediaKind(String(node.attrs.kind));
        const src = String(node.attrs.src);
        const media: DOMOutputSpec =
          kind === "image"
            ? ["img", { src, alt: String(node.attrs.alt), class: S.img, contenteditable: "false" }]
            : ["video", { src, controls: "", preload: "metadata", playsinline: "", class: S.img, contenteditable: "false" }];
        return ["figure", { "data-note-media": kind }, media, ["figcaption", { class: S.note }, 0]];
      },
    },
    text: { group: "inline" },
    hard_break: {
      inline: true,
      group: "inline",
      selectable: false,
      parseDOM: [{ tag: "br" }],
      toDOM: () => ["br"],
    },
  },
  marks: {
    link: {
      attrs: { href: {} },
      inclusive: false,
      parseDOM: [{ tag: "a[href]", getAttrs: (dom) => ({ href: dom.getAttribute("href") ?? "" }) }],
      toDOM: (mark) => ["a", { href: String(mark.attrs.href) }, 0],
    },
    strong: {
      parseDOM: [{ tag: "strong" }, { tag: "b" }],
      toDOM: () => ["strong", { class: S.strong }, 0],
    },
    em: {
      parseDOM: [{ tag: "em" }, { tag: "i", getAttrs: (dom) => (dom.hasAttribute("data-lucide") ? false : null) }],
      toDOM: () => ["em", { class: S.em }, 0],
    },
    code: {
      excludes: "_",
      parseDOM: [{ tag: "code" }],
      toDOM: () => ["code", { class: S.code_inline }, 0],
    },
  },
});

export const NOTE_PARSER = PMDOMParser.fromSchema(noteSchema);

/** 送ってよいリンクの行き先（サーバーの受け取りの決まりと同じ）。 */
export const LINK_HREF = /^(?:https?:\/\/|mailto:)[^\s"<>]+$/i;

/** 行の中を送る形に。印は 1 つの字のかたまりごとに、スキーマの順（リンク → 太字 → 斜め → コード）で包む。 */
function inlineHtml(node: PMNode): string {
  let out = "";
  node.forEach((child) => {
    if (child.type.name === "hard_break") {
      out += "<br>";
      return;
    }
    if (!child.isText || child.text === undefined) return;
    let html = escapeText(child.text);
    const marks: readonly Mark[] = child.marks;
    for (let index = marks.length - 1; index >= 0; index -= 1) {
      const mark = marks[index];
      if (mark.type.name === "code") html = `<code>${html}</code>`;
      else if (mark.type.name === "em") html = `<em>${html}</em>`;
      else if (mark.type.name === "strong") html = `<strong>${html}</strong>`;
      else if (mark.type.name === "link" && LINK_HREF.test(String(mark.attrs.href))) html = `<a href="${escapeAttr(String(mark.attrs.href))}">${html}</a>`;
    }
    out += html;
  });
  return out;
}

/** 上げ終わって保管庫の道筋に替わった絵か（上げている途中・端末の中の絵は送らない）。 */
export function mediaSettled(node: PMNode): boolean {
  const src = String(node.attrs.src);
  return node.attrs.upload === null && src.length > 0 && !/^(?:blob:|data:)/.test(src);
}

function listHtml(node: PMNode): string {
  if (node.type.name === "task_list") {
    let items = "";
    node.forEach((item) => {
      items += `<li data-checked="${item.attrs.checked === true ? "true" : "false"}">${inlineHtml(item.firstChild ?? item)}</li>`;
    });
    return `<ul data-tasks="">${items}</ul>`;
  }
  const tag = node.type.name === "ordered_list" ? "ol" : "ul";
  let items = "";
  node.forEach((item) => {
    let inner = "";
    item.forEach((part) => {
      inner += part.type.name === "item_text" ? inlineHtml(part) : listHtml(part);
    });
    items += `<li>${inner}</li>`;
  });
  return `<${tag}>${items}</${tag}>`;
}

/** 表を送る形に。1 行目は見出しの行（th）として送る（サーバーも 1 行目を見出しに組む）。 */
function tableHtml(node: PMNode): string {
  let rows = "";
  node.forEach((row, _offset, index) => {
    let cells = "";
    row.forEach((cell) => {
      cells += index === 0 ? `<th>${inlineHtml(cell)}</th>` : `<td>${inlineHtml(cell)}</td>`;
    });
    rows += `<tr>${cells}</tr>`;
  });
  return `<table>${rows}</table>`;
}

/** ブロック 1 つを送る形に（トグルの中も同じ関数で）。題と、送らない絵（上げている途中）は空。 */
function blockHtml(node: PMNode): string {
  switch (node.type.name) {
    case "paragraph":
      return `<p>${inlineHtml(node)}</p>`;
    case "callout":
      return `<p data-note="">${inlineHtml(node)}</p>`;
    case "heading":
      return node.attrs.level === 3 ? `<h3>${inlineHtml(node)}</h3>` : `<h2>${inlineHtml(node)}</h2>`;
    case "bullet_list":
    case "ordered_list":
    case "task_list":
      return listHtml(node);
    case "quote":
      return `<blockquote>${inlineHtml(node)}</blockquote>`;
    case "code_block":
      return `<pre>${escapeText(node.textContent)}</pre>`;
    case "rule":
      return "<hr>";
    case "table":
      return tableHtml(node);
    case "toggle": {
      const summary = node.firstChild;
      const body = node.lastChild;
      let inner = "";
      body?.forEach((child) => {
        inner += blockHtml(child);
      });
      return `<details${node.attrs.open === true ? " open" : ""}><summary>${summary === null ? "" : inlineHtml(summary)}</summary><div>${inner}</div></details>`;
    }
    case "embed":
      return `<figure data-embed="youtube" data-id="${escapeAttr(String(node.attrs.id))}">${inlineHtml(node)}</figure>`;
    case "media":
      return mediaSettled(node) ? `<figure data-kind="${escapeAttr(String(node.attrs.kind))}" data-src="${escapeAttr(String(node.attrs.src))}" data-alt="${escapeAttr(String(node.attrs.alt))}">${inlineHtml(node)}</figure>` : "";
    default:
      return "";
  }
}

/** 本文（題を除く）を送る形の HTML に。サーバー（src/lib/notes/document.ts）が確かめて清書の形に組み直す。 */
export function bodyHtml(doc: PMNode): string {
  let out = "";
  doc.forEach((node) => {
    out += blockHtml(node);
  });
  return out;
}

/** 題（1 行目の字）。 */
export function titleText(doc: PMNode): string {
  const first = doc.firstChild;
  return first !== null && first.type.name === "title" ? first.textContent : "";
}

/**
 * 配信された本文（main の写し）から文書を組む。題の無いページは本文に h1 が無いので、空の題を先に置いてから読む
 * （置かないと、文書の形「題が先頭」に合わせて最初の段落が題の枠に吸い込まれる）。
 * 写しは読み込みの外の文書に作る（写しの絵や動画が素材をもう一度取りに行かない）。
 */
export function parseNoteMain(main: HTMLElement): PMNode {
  const inert = document.implementation.createHTMLDocument("");
  const copy = inert.importNode(main, true);
  if (copy.querySelector(":scope > h1") === null) copy.prepend(inert.createElement("h1"));
  return NOTE_PARSER.parse(copy);
}

/** 控えや送る形から、文書を組み直す（題は h1 で先頭に置く）。 */
export function docFromParts(title: string, body: string): PMNode {
  // 読み込みの外の文書で組む（画像の読み込みも仕掛けも動かない）
  const inert = document.implementation.createHTMLDocument("");
  inert.body.innerHTML = body;
  const heading = inert.createElement("h1");
  heading.textContent = title;
  inert.body.prepend(heading);
  return NOTE_PARSER.parse(inert.body);
}
