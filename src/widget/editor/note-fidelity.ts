import type { Node as PMNode } from "prosemirror-model";
import { NOTE_EMBED_FRAME_ATTR } from "../../lib/notes/blocks";
import { LINK_HREF, noteSchema } from "./note-schema";

/**
 * 清書のページを、メモ帳で黙って崩さずに直せるか。**乗せる前に 1 度だけ**確かめる（src/widget/editor/note-editor.ts）。
 *
 * メモ帳は清書の本文を書ける形（src/widget/editor/note-schema.ts）で読み直し、保存のときにサーバーが同じ形に組み直す。
 * 書ける形に無い部分（図・脚注・ページの中のリンク・講義原稿の囲みなど）があると、読み直した時点でその部分が消え、
 * 字を 1 つ直しただけの保存で消えたまま版に積まれてしまう。だから次の 3 つが読み直す前と同じときだけ乗る:
 *
 *   字       … 本文の字（空白を除く）。書ける形に無い要素の字が段落に流れ込んでも字は残るので、下の 2 つと組で見る
 *   絵の数   … 画像と動画の数（段落の中の絵も絵のブロックとして読む）
 *   リンク   … 行き先の一覧。メモ帳が送れるのは http(s)・mailto だけなので、ほかの行き先が 1 つでもあれば乗らない
 *
 * 加えて、書ける形に無いと分かっている要素（下の BLOCKED）が 1 つでもあれば乗らない。
 * 確かめるのは読み込みの外の文書に作った写し（呼ぶ側が出典の札を除いてから渡す）。
 */
const BLOCKED = [
  "article", "aside", "nav", "header", "footer", "form", "input", "select", "textarea", "button", "canvas", "audio", "object", "embed", "math",
  "sup", "sub", "dl", "h4", "h5", "h6", "script", "style", "template",
  ".mermaid", "[data-mermaid]",
].join(",");

function squeeze(text: string): string {
  return text.replace(/\s+/g, "");
}

/** 文書の字（空白を除く・ブロックの境に何も足さない）。 */
function docText(doc: PMNode): string {
  return squeeze(doc.textBetween(0, doc.content.size, "", ""));
}

function docMediaCount(doc: PMNode): number {
  let count = 0;
  doc.descendants((node) => {
    if (node.type === noteSchema.nodes.media) count += 1;
    return true;
  });
  return count;
}

function docLinks(doc: PMNode): string[] {
  const out = new Set<string>();
  doc.descendants((node) => {
    for (const mark of node.marks) if (mark.type === noteSchema.marks.link) out.add(String(mark.attrs.href));
    return true;
  });
  return [...out].sort();
}

export function noteFaithful(copy: HTMLElement, doc: PMNode): boolean {
  if (copy.querySelector(BLOCKED) !== null) return false;
  // 絵記号（Lucide が描いた確認の箱）・埋め込みの枠・トグルは、メモ帳の形のときだけ通す
  for (const svg of copy.querySelectorAll("svg")) if (!svg.classList.contains("lucide")) return false;
  for (const frame of copy.querySelectorAll("iframe")) if (frame.parentElement?.matches("figure[data-note-embed]") !== true) return false;
  for (const details of copy.querySelectorAll("details")) if (!details.hasAttribute("data-note-toggle")) return false;
  if (squeeze(copy.textContent ?? "") !== docText(doc)) return false;
  if (copy.querySelectorAll("img, video").length !== docMediaCount(doc)) return false;
  const links = new Set<string>();
  for (const link of copy.querySelectorAll("a[href]")) {
    if (link.hasAttribute(NOTE_EMBED_FRAME_ATTR)) continue;
    const href = link.getAttribute("href") ?? "";
    if (!LINK_HREF.test(href)) return false;
    links.add(href);
  }
  const found = docLinks(doc);
  return found.length === links.size && found.every((href) => links.has(href));
}
