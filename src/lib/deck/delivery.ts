import { navigationRuntime } from "./preview.generated";
import { withVendorScripts } from "../html/vendor-scripts";
import { DECK_SLIDE, DECK_SLIDES, isDeckHtml } from "./deck";

/**
 * スライド（deck）を配るときに、動画の静止画の取り寄せを後回しにする。**配信のときだけ**で、保存先の HTML は触らない。
 *
 * `<video poster>` には読み込みの遅延が効かず、位置に関係なく最初に全部取ってしまう。3 枚目以降の動画の静止画を
 * `data-deck-poster` へ退避し、実行部（src/templates/deck.html の restorePosters）がいまの枚と次の枚から戻す。
 * 残りも少し待ってから 1 枚ずつ全部戻し、印刷の直前にも全部戻す。
 *
 * 退避するのは、資料が**いまの実行部をそのまま抱えている**ときだけ。前に配った実行部は退避した静止画を戻せないので、
 * 古い資料は今までどおりの形で配る（投稿し直すと、いまの実行部になって後回しが効く）。
 * 枚の入れ子が閉じない・読めない資料もそのまま配る。2 度通しても同じ。
 */

/** 退避した静止画の置き場。実行部と同じ字（検査が突き合わせる）。 */
export const DECK_POSTER = "data-deck-poster";

/** 最初から取る枚の数。深いリンク（#N）はサーバーに届かないので、1 枚目から数える */
const EAGER_SLIDES = 2;

const TAG_OR_COMMENT = /<!--[\s\S]*?-->|<(\/?)([a-zA-Z][\w:-]*)(?:"[^"]*"|'[^']*'|[^'">])*>/g;
const RAW_TEXT = new Set(["script", "style", "textarea", "title", "xmp"]);
const MAIN_OPEN = /<main\b(?:"[^"]*"|'[^']*'|[^'">])*>/gi;
/** 本文の中の video の開始タグだけを書き換える（script・style・textarea の中の字は触らない） */
const MEDIA_TAG = /<(script|style|textarea)\b[\s\S]*?<\/\1\s*>|<video\b(?:"[^"]*"|'[^']*'|[^'">])*>/gi;
/** 属性の値（引用符の中）は飛ばして、属性の名前の poster だけを差し替える */
const QUOTED_OR_POSTER = /("[^"]*"|'[^']*')|\sposter(?=\s*=)/gi;

const hasAttribute = (tag: string, name: string) => new RegExp(`\\s${name}(?=[\\s=>/])`, "i").test(tag);

type Slide = { start: number; end: number };

/** main の中の枚（main 直下の section）を見つける。入れ子が閉じない・読めない形なら null */
function slidesOf(inner: string): Slide[] | null {
  const lower = inner.toLowerCase();
  const slides: Slide[] = [];
  let depth = 0;
  let open: number | null = null;
  const tags = new RegExp(TAG_OR_COMMENT.source, "g");
  for (let match = tags.exec(inner); match !== null; match = tags.exec(inner)) {
    const text = match[0];
    if (text.startsWith("<!--")) continue;
    const closing = match[1] === "/";
    const tag = (match[2] ?? "").toLowerCase();
    if (!closing && RAW_TEXT.has(tag)) {
      const end = lower.indexOf(`</${tag}`, match.index + text.length);
      if (end < 0) return null;
      tags.lastIndex = end;
      continue;
    }
    if (tag !== "section") continue;
    if (!closing) {
      if (depth === 0 && hasAttribute(text, DECK_SLIDE)) open = match.index;
      depth += 1;
      continue;
    }
    depth -= 1;
    if (depth < 0) return null;
    if (depth === 0 && open !== null) {
      slides.push({ start: open, end: match.index + text.length });
      open = null;
    }
  }
  return depth === 0 ? slides : null;
}

function deferredPosters(slide: string): string {
  return slide.replace(MEDIA_TAG, (tag, raw: string | undefined) => {
    if (raw !== undefined) return tag;
    return tag.replace(QUOTED_OR_POSTER, (part, quoted: string | undefined) => quoted ?? ` ${DECK_POSTER}`);
  });
}

/** いまの実行部を抱えた資料か（前に配った実行部は、退避した静止画を戻せない） */
function carriesCurrentRuntime(html: string): boolean {
  return html.includes(navigationRuntime) || html.includes(withVendorScripts(navigationRuntime));
}

export function withDeferredPosters(html: string): string {
  if (!isDeckHtml(html) || !/<video\b/i.test(html) || !carriesCurrentRuntime(html)) return html;
  const mains = new RegExp(MAIN_OPEN.source, "gi");
  let main = mains.exec(html);
  while (main !== null && !hasAttribute(main[0], DECK_SLIDES)) main = mains.exec(html);
  if (main === null) return html;
  const innerStart = main.index + main[0].length;
  const innerEnd = html.indexOf("</main", innerStart);
  if (innerEnd < 0) return html;
  const inner = html.slice(innerStart, innerEnd);
  const slides = slidesOf(inner);
  if (slides === null || slides.length <= EAGER_SLIDES) return html;
  let served = "";
  let cursor = 0;
  slides.forEach((slide, at) => {
    if (at < EAGER_SLIDES) return;
    served += inner.slice(cursor, slide.start) + deferredPosters(inner.slice(slide.start, slide.end));
    cursor = slide.end;
  });
  served += inner.slice(cursor);
  return html.slice(0, innerStart) + served + html.slice(innerEnd);
}
