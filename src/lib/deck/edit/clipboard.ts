/**
 * スライドの直接編集の「コピーした中身」（要素か枚）の決まり。DOM に触らない部分だけをここに置く（単体検査あり）。
 *
 * - 写しは原稿の断片をそのまま持ち、貼るときに ID だけを付け替える（cloneDeckFragment）。
 * - 別の資料から貼るときは、写しの中の素材（画像・動画・音声）の相対パスを集めてサーバーへ送り
 *   （src/app/api/pages/deck-edit/clipboard）、貼り先へ写した在り処に書き換えてから足す。
 * - 枚の階層（data-deck-parent）は写しの中の親子だけを保ち、写しの外の親は外す（貼り先には無い枚を指さない）。
 *
 * 画面の側（保存領域への出し入れ・サーバーへの問い合わせ）は src/widget/deck/edit/clipboard.ts。
 */
import { z } from "zod";
import type { OutlineEntry } from "../outline";
import type { DeckEditOperation } from "./model";
import { applyDeckEditOperations, cloneDeckFragment, deckSourceFragment, deckSourceOutline } from "./source";

/** 要素の写し 1 つ（原稿の断片そのまま）。 */
export type DeckElementClip = { id: string; html: string };
/** 枚の写し 1 つ。parent は写しの中の親の枚（写しの外の親は null）。 */
export type DeckSlideClip = { id: string; parent: string | null; html: string };
export type DeckClipboard = { page: string; elements: DeckElementClip[] } | { page: string; slides: DeckSlideClip[] };

/** 1 回で写せる枚・要素の数。300 枚の資料を丸ごと写しても足りる。 */
export const DECK_CLIPBOARD_ITEMS_MAX = 500;
/** 1 回の貼り付けで写す素材の数の上限。 */
export const DECK_CLIPBOARD_MEDIA_MAX = 500;

const elementClipSchema = z.object({ id: z.string().min(1).max(200), html: z.string().min(1).max(900_000) }).strict();
const slideClipSchema = z.object({ id: z.string().min(1).max(200), parent: z.string().min(1).max(200).nullable(), html: z.string().min(1).max(900_000) }).strict();
export const deckClipboardSchema = z.union([
  z.object({ page: z.string().min(1).max(400), elements: z.array(elementClipSchema).min(1).max(DECK_CLIPBOARD_ITEMS_MAX) }).strict(),
  z.object({ page: z.string().min(1).max(400), slides: z.array(slideClipSchema).min(1).max(DECK_CLIPBOARD_ITEMS_MAX) }).strict(),
]);

/** 写しの中の素材の参照（ページの中の相対パス）。外の URL・ページの外を指すもの・データは数えない。 */
function isLocalReference(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length <= 1000 && !/^[a-z][a-z0-9+.-]*:/i.test(trimmed) && !trimmed.startsWith("/") && !trimmed.startsWith("#") && !trimmed.startsWith("data:");
}
const decodeEntities = (value: string) => value.replace(/&quot;/g, "\"").replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
/** 素材を指す属性（src・poster・止めている間の動画の在り処）。 */
const MEDIA_ATTRIBUTE = /\s(src|poster|data-deck-video-src)\s*=\s*(?:"([^"]*)"|'([^']*)')/gi;
/** style の中の url(…)。属性の中では引用符が字の参照になっていることがある。 */
const STYLE_URL = /url\(\s*(?:&quot;|&#39;|["'])?([^"')&]+?)(?:&quot;|&#39;|["'])?\s*\)/gi;

/** 写し（HTML の並び）が指す素材の相対パスを、重ねずに集める。 */
export function deckClipHtmlReferences(htmls: readonly string[]): string[] {
  const found = new Set<string>();
  for (const html of htmls) {
    for (const match of html.matchAll(MEDIA_ATTRIBUTE)) {
      const value = decodeEntities(match[2] ?? match[3] ?? "");
      if (isLocalReference(value)) found.add(value.trim());
    }
    for (const match of html.matchAll(STYLE_URL)) {
      const value = decodeEntities(match[1] ?? "");
      if (isLocalReference(value)) found.add(value.trim());
    }
  }
  return [...found].slice(0, DECK_CLIPBOARD_MEDIA_MAX);
}
export function deckClipReferences(clip: DeckClipboard): string[] {
  return deckClipHtmlReferences("slides" in clip ? clip.slides.map(slide => slide.html) : clip.elements.map(item => item.html));
}

const escapeAttribute = (value: string) => value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
/** 素材の参照を、貼り先での在り処（sources）に書き換える。表に無い参照はそのまま。 */
export function rewriteDeckAssetReferences(html: string, sources: Readonly<Record<string, string>>): string {
  if (!Object.keys(sources).length) return html;
  const swap = (value: string) => { const key = decodeEntities(value).trim(); return Object.hasOwn(sources, key) ? sources[key] : null; };
  return html
    .replace(MEDIA_ATTRIBUTE, (whole: string, name: string, double: string | undefined, single: string | undefined) => {
      const next = swap(double ?? single ?? "");
      return next === null ? whole : ` ${name}="${escapeAttribute(next)}"`;
    })
    .replace(STYLE_URL, (whole: string, value: string) => {
      const next = swap(value);
      return next === null ? whole : whole.replace(value, escapeAttribute(next));
    });
}

/** 枚の開きタグから階層の印を外す（貼り先で親を付け直す）。 */
function withoutParent(html: string): string {
  return html.replace(/^(<section\b[^>]*?)\s+data-deck-parent\s*=\s*(?:"[^"]*"|'[^']*')/i, "$1");
}

/**
 * 枚の目印（data-deck-id）が無ければ付ける。見た目を持つ資料は全部の枚に目印が要る（src/lib/deck/design/html.ts）ので、
 * 目印の無い資料の枚を貼っても保存を断られないようにする。ノードの ID は目印の形（英小文字・数字・-）と同じ。
 */
function withDeckId(html: string, id: string): string {
  return /^<section\b[^>]*\sdata-deck-id\s*=/i.test(html) ? html : html.replace(/^<section\b/i, `<section data-deck-id="${id}"`);
}

/** 選んだ要素の写し。原稿に無いもの・描けない形のものは飛ばす。 */
export function deckElementClips(source: string, ids: readonly string[]): DeckElementClip[] {
  return ids.flatMap(id => { const part = deckSourceFragment(source, id); return part ? [{ id, html: part.html }] : []; });
}

/** 選んだ枚の写し（並びは資料の順）。写しの中の親子だけを parent に残す。 */
export function deckSlideClips(source: string, ids: readonly string[]): DeckSlideClip[] {
  const outline = deckSourceOutline(source), chosen = new Set(ids);
  return outline.flatMap(entry => {
    if (!chosen.has(entry.id)) return [];
    const part = deckSourceFragment(source, entry.id);
    if (!part) return [];
    return [{ id: entry.id, parent: entry.parent && chosen.has(entry.parent) ? entry.parent : null, html: withoutParent(part.html) }];
  });
}

/** 要素を枚（slide）の末尾へ貼る操作。返す ids は貼った写しの ID（選び直す）。 */
export function deckElementPasteOperations(elements: readonly DeckElementClip[], slide: string, uid: () => string): { operations: DeckEditOperation[]; ids: string[] } {
  const operations: DeckEditOperation[] = [], ids: string[] = [];
  for (const item of elements) {
    const cloned = cloneDeckFragment(item.html, uid()), id = cloned.ids[item.id];
    if (!id) continue;
    operations.push({ kind: "fragment", target: id, parentId: slide, beforeId: null, before: null, after: cloned.html });
    ids.push(id);
  }
  return { operations, ids };
}

/**
 * 枚を、いま選んでいる枚（after）の枝の後ろへ貼る操作。after が無ければ資料の末尾。
 * 貼った枚は after と同じ親のもとに並び、写しの中の親子は保つ。
 */
export function deckSlidePasteOperations(source: string, slides: readonly DeckSlideClip[], after: string | null, uid: () => string): { operations: DeckEditOperation[]; ids: string[] } {
  const inserts: DeckEditOperation[] = [], mapping = new Map<string, string>(), ids: string[] = [];
  for (const slide of slides) {
    const cloned = cloneDeckFragment(slide.html, uid()), id = cloned.ids[slide.id];
    if (!id) continue;
    mapping.set(slide.id, id); ids.push(id);
    inserts.push({ kind: "fragment", target: id, parentId: "deck-root", beforeId: null, before: null, after: withDeckId(cloned.html, id) });
  }
  if (!ids.length) return { operations: [], ids: [] };
  const placed = applyDeckEditOperations(source, inserts, false, true).html;
  const before = deckSourceOutline(placed), original = deckSourceOutline(source);
  const anchor = after ? original.find(entry => entry.id === after) ?? null : null;
  const parent = anchor?.parent ?? null;
  const pasted: OutlineEntry[] = slides.flatMap(slide => {
    const id = mapping.get(slide.id);
    if (!id) return [];
    return [{ id, parent: slide.parent ? mapping.get(slide.parent) ?? parent : parent }];
  });
  // 選んでいる枚の枝（子・孫）の最後の枚の後ろ
  let end = anchor ? original.findIndex(entry => entry.id === anchor.id) : original.length - 1;
  if (anchor) {
    const branch = new Set([anchor.id]);
    for (let index = end + 1; index < original.length; index++) {
      const entry = original[index];
      if (!entry.parent || !branch.has(entry.parent)) break;
      branch.add(entry.id); end = index;
    }
  }
  const afterOutline = [...original.slice(0, end + 1), ...pasted, ...original.slice(end + 1)];
  return { operations: [...inserts, { kind: "outline", target: "deck-root", before, after: afterOutline }], ids };
}

