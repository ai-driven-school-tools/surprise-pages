import { DECK_CANVAS, DECK_HASH, DECK_SLIDE } from "../deck";
import { htmlToLines } from "../../html/text";
import { isVersionId } from "../../revisions/version-id";

/**
 * スライド（deck）を共有したときに出るカードの、**ブラウザを使わない**部品。
 *
 * ## 何を解くか
 *
 * 公開のスライドを Slack や X に貼ると、カードの絵は「白地に題名の文字だけ」だった
 * （src/app/api/og/card.tsx の額縁）。スライドは 1 枚目が表紙として作られているので、
 * **1 枚目をそのまま絵にすれば**、何の資料かが貼られた場所で分かる。URL が枚を指して
 * いれば（`#7`）、その枚を絵にし、見出しを添える——「7 枚目を見て」と貼ったときに、
 * 開かなくても何の枚か分かるように。
 *
 * ここに置くのは、URL と HTML の文字だけで決まるもの。実際に描くのは src/lib/deck/card/card-image.ts
 * （本物のブラウザを起こす側）で、そちらは入口（src/app/api/og）からしか呼ばれない。
 * Slack の見出し（src/lib/link-unfurl.ts）はここだけを使い、ブラウザを起こさない。
 *
 * ## 絵の大きさは枚の構図そのもの
 *
 * 1280×720（`DECK_CANVAS`）で、縮めも伸ばしもしない。見出しカードの額縁（1200×630）に
 * 合わせて切ると、枚の構図（上下の余白・足元の出典）が欠ける。Slack は 16:9 をそのまま出す。
 */
export const DECK_CARD_SIZE = DECK_CANVAS;

/**
 * 貼られた URL が枚を指しているか（`#7`）。指していなければ null。
 *
 * 読むのは deck の深いリンクの形（`DECK_HASH`）だけ。コメントの深いリンク（`#c=<uuid>`）や
 * 本文の見出しへのリンクは枚ではないので null。`#0` は枚の番号として読まない（枚は 1 から数える）。
 * 枚数より大きい番号はここでは落とさない——実行部も最後の枚へ丸めるので、同じ向きに
 * `clampDeckSlide` で丸める（本文を読んでから）。
 */
export function deckSlideFromUrl(raw: string): number | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  const found = DECK_HASH.exec(url.hash);
  if (found === null) return null;
  const n = Number.parseInt(found[1], 10);
  return Number.isSafeInteger(n) && n >= 1 ? n : null;
}

/** 入口の `?slide=7` を枚の番号として読む。形が違えば null（1 枚目として扱う側へ倒す）。 */
export function deckSlideParam(raw: string | null): number | null {
  if (raw === null || !/^[1-9]\d{0,3}$/.test(raw)) return null;
  return Number.parseInt(raw, 10);
}

const SECTION_TAG = /<(\/?)section\b[^>]*>/gi;
const SLIDE_MARK = new RegExp(`\\s${DECK_SLIDE}(?:[\\s=>/]|$)`, "i");
/** 印の中に `<section` の字面を持ちうるもの（実行部の script が枚の雛形を文字で持つ・注釈）。 */
const NOT_MARKUP = /<!--[\s\S]*?-->|<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi;

/** script・style・注釈の中身を同じ長さの空白にする。位置を変えずに、字面だけを見えなくする。 */
function maskNonMarkup(html: string): string {
  return html.replace(NOT_MARKUP, (found) => " ".repeat(found.length));
}

/**
 * 各枚の HTML（`<section data-deck-slide>` の開きから閉じまで）。文書の順。
 *
 * 枚の入れ子は契約で禁止しているが、枚の**中**に素の `<section>` が入ることはありうるので、
 * 開きと閉じを数えて対応する閉じまで取る。発表者のメモ（aside）は呼ぶ側が先に取り除いている
 * 前提（src/lib/pages/content.ts の `withoutDeckNotes`）。
 *
 * 位置は script・style・注釈を空白にした写しで探し、切り出しは元の文字から行う。
 * 新しい実行部は枚の雛形（`<section data-deck-slide …>`）を script の文字列として持っていて、
 * そのまま数えると開きと閉じの対応が崩れる（枚が 1 つも取れなくなる）。
 */
export function deckSlideHtmls(html: string): string[] {
  const out: string[] = [];
  const masked = maskNonMarkup(html);
  let depth = 0;
  let start = -1;
  for (const match of masked.matchAll(SECTION_TAG)) {
    const at = match.index ?? 0;
    if (match[1] !== "/") {
      if (depth === 0) {
        if (SLIDE_MARK.test(match[0])) {
          start = at;
          depth = 1;
        }
      } else {
        depth += 1;
      }
      continue;
    }
    if (depth === 0) continue;
    depth -= 1;
    if (depth === 0 && start >= 0) {
      out.push(html.slice(start, at + match[0].length));
      start = -1;
    }
  }
  return out;
}

/** 枚数より大きい番号を最後の枚へ丸める（実行部の `clamp` と同じ向き）。枚が無ければ 1。 */
export function clampDeckSlide(slide: number, count: number): number {
  if (count <= 0) return 1;
  return Math.min(Math.max(1, slide), count);
}

const HEADING_TAG = /<h[1-3]\b[^>]*>[\s\S]*?<\/h[1-3]\s*>/i;
const HEADING_MAX = 60;

/**
 * その枚の見出し。最初の h1〜h3 の文字、無ければ枚の最初の 1 行。何も無ければ null。
 *
 * 長い見出しは末尾を「…」にする。Slack の 1 行に収める長さで、カードの絵には触れない。
 */
export function deckSlideHeading(slideHtml: string): string | null {
  const heading = HEADING_TAG.exec(slideHtml);
  // 見出しがあればその字、見出しが空なら枚の最初の 1 行へ落ちる
  const candidates = heading === null ? htmlToLines(slideHtml) : [...htmlToLines(heading[0]), ...htmlToLines(slideHtml)];
  const text = candidates.find((line) => line.length > 0) ?? null;
  if (text === null) return null;
  return text.length > HEADING_MAX ? `${text.slice(0, HEADING_MAX - 1)}…` : text;
}

/**
 * 枚を指して貼られたときの、カードの 1 行。「7枚目 — 見出し」。
 *
 * 題名は台帳の列のまま（src/lib/link-unfurl.ts）で、どの枚かはこの行で言う。
 */
export function deckSlideNote(slide: number, heading: string | null): string {
  return heading === null ? `${slide}枚目` : `${slide}枚目 — ${heading}`; // i18n-keep: Slack の見出しにだけ出す（Slack の知らせは訳さない）
}

/**
 * カードの絵の在り処。
 *
 * 版の目印（`v`）を付けるのは**配信網と Slack の控えを版ごとに分ける**ため。絵は保存した
 * 本文から描くので、直して版が変わればこの在り処も変わり、古い絵が残らない。
 * 枚を指すときだけ `slide` を付ける。1 枚目は付けない（同じ絵に 2 つの在り処を作らない）。
 *
 * 絵の中身は入口（src/app/api/og）が本文から描く。ここで渡すのは呼び名と版の目印だけで、
 * 文字を載せる口にはしない（URL の文字をそのまま絵にする道具にならないため）。
 */
export function deckCardImageUrl(
  origin: string,
  pageSlug: string,
  versionId: string | null,
  slide: number | null,
): string {
  let url = `${origin}/api/og?page=${encodeURIComponent(pageSlug)}`;
  if (isVersionId(versionId)) url += `&v=${versionId}`;
  if (slide !== null && slide > 1) url += `&slide=${slide}`;
  return url;
}
