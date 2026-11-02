/**
 * HTML から「読める文章」だけを取り出す。
 *
 * 差分で見せたいのは書いた文章の変化であって、タグや空白の入れ替わりではない。
 * 整形し直しただけの版で全面真っ赤になると、どこを直したのかが読めなくなる。
 */
import {serialize} from "parse5";
import {sourceTree} from "./source-index";
import { withDeckPublicSupplements } from "../deck/edit/customization-html";

/**
 * 中身を文章として数えないタグ。丸ごと落とす。
 *
 * **この顔ぶれは src/widget/comments/anchor.ts の TEXT_SKIP_TAGS と 1 つずつ揃える。**
 * 片方だけが数えると、画面に出ていない文字のぶんだけ位置がずれ、
 * 赤入れやコメントの印が別の場所に付く。入力欄（textarea / select / option）は
 * 書いた人の文章ではないので、両方で数えないほうへ揃えてある。
 */
const DROP_BLOCKS =
  /<(script|style|noscript|template|svg|textarea|select|option)\b[^>]*>[\s\S]*?<\/\1\s*>/gi;

/** ここで行が変わると読み手が感じるタグ。前後に改行を入れる。 */
const BLOCK_TAGS =
  /<\/?(p|div|section|article|header|footer|main|aside|nav|h[1-6]|ul|ol|li|table|thead|tbody|tr|td|th|blockquote|pre|figure|figcaption|dl|dt|dd|hr|form|fieldset)\b[^>]*>/gi;

const LINE_BREAK = /<br\b[^>]*>/gi;
const ANY_TAG = /<[^>]+>/g;
const COMMENT = /<!--[\s\S]*?-->/g;

/** よく出る文字実体参照だけ戻す。表示上の見分けに関わるものに絞る。 */
const ENTITIES: Readonly<Record<string, string>> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
  "&nbsp;": " ",
};

function decodeEntities(text: string): string {
  return text.replace(/&(?:amp|lt|gt|quot|apos|nbsp|#39);/g, (found) => ENTITIES[found] ?? found);
}

/**
 * 本文を行の並びにする。
 *
 * `<title>` もここでは 1 行として残る（`<head>` を落としていないため）。
 * 共有カードの説明文づくりでは、それで困らない。
 * 赤入れが数えるのは画面に出ている文章だけなので、そちらは `htmlBodyText` を使う。
 */
export function htmlToLines(html: string): string[] {
  const text = withDeckPublicSupplements(html)
    .replace(COMMENT, "")
    .replace(DROP_BLOCKS, "")
    .replace(LINE_BREAK, "\n")
    .replace(BLOCK_TAGS, "\n")
    .replace(ANY_TAG, "");

  return decodeEntities(text)
    .split("\n")
    .map((line) => line.replace(/[ \t\r ]+/g, " ").trim())
    .filter((line) => line.length > 0);
}

/** 差分に渡す 1 本の文字列。行の区切りは残す。 */
export function htmlToText(html: string): string {
  return htmlToLines(html).join("\n");
}


/**
 * **画面に出ている文章だけ**を取り出す。
 *
 * `htmlToText` はページの名前（`<title>`）も 1 行として残す。履歴として見たいからだが、
 * 赤入れはページの上に印を置く仕組みなので、画面に出ていない文字が混ざると
 * ブラウザ側の数え方とずれ、**件数だけ出て印が 1 つも付かない**という壊れ方をする。
 * 数える範囲は、ここでブラウザ側（body の中だけを読む）にそろえる。
 */
export function htmlBodyText(html: string): string {
  const visible = withDeckPublicSupplements(html);
  // A head script can contain the literal "<body>". Match the actual element,
  // just as the browser does, rather than treating script text as document markup.
  const tree = sourceTree(visible);
  const root = tree.childNodes.find(node => node.nodeName === "html");
  const body = root && "childNodes" in root ? root.childNodes.find(node => node.nodeName === "body") : undefined;
  return body && "childNodes" in body ? htmlToText(serialize(body)) : "";
}

/**
 * ページが指している画像・動画の置き場を集める。
 *
 * 見るのは行き先（パス）だけ。中身は見ないので、**同じパスのまま差し替えられた画像は
 * 見分けられない**。見分けられない差を見分けたふりをしないため、ここでは扱わない。
 */
const ASSET_TAG = /<(img|video|source)\b([^>]*)>/gi;

function attribute(attributes: string, name: string): string | null {
  const found = new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s"'>]+))`, "i").exec(
    attributes,
  );
  if (found === null) return null;
  const value = found[2] ?? found[3] ?? found[4] ?? "";
  const text = decodeEntities(value).trim();
  return text.length > 0 ? text : null;
}

export function assetRefs(html: string): string[] {
  const found: string[] = [];
  const seen = new Set<string>();
  const add = (value: string | null): void => {
    if (value === null || seen.has(value)) return;
    seen.add(value);
    found.push(value);
  };

  for (const match of html.matchAll(ASSET_TAG)) {
    const tag = match[1].toLowerCase();
    const attributes = match[2];
    add(attribute(attributes, "src"));
    if (tag === "video") add(attribute(attributes, "poster"));
  }
  return found;
}

/** 見出し（ページの名前）。無ければ null。 */
const TITLE_TAG = /<title[^>]*>([\s\S]*?)<\/title>/i;

export function titleOf(html: string): string | null {
  const found = TITLE_TAG.exec(html);
  if (found === null) return null;
  const text = decodeEntities(found[1].replace(ANY_TAG, "")).replace(/\s+/g, " ").trim();
  return text.length > 0 ? text : null;
}

/** 本文の書き出し。共有カードの説明文に使う。 */
export function summaryOf(html: string, maxLength = 110): string | null {
  const title = titleOf(html);
  for (const line of htmlToLines(html)) {
    // 見出しと同じ 1 行目は説明として役に立たないので飛ばす
    if (title !== null && line === title) continue;
    if (line.length < 8) continue;
    return line.length > maxLength ? `${line.slice(0, maxLength - 1)}…` : line;
  }
  return null;
}
