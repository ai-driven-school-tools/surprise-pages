import { QUOTE_CONTEXT_MAX_LENGTH, type QuoteContext } from "../comments/types";

/**
 * 詰めた本文の中から、覚えておいた文言を探し直す。
 *
 * コメントの引用も、版どうしの赤入れも、探し方はまったく同じ。
 * ブラウザ側（src/widget/comments/anchor.ts）もサーバー側（src/lib/comments/outcome.ts）も、
 * **ここ 1 つ**を通す。片方だけ直すと、印の位置が静かにずれる。
 *
 * 渡す本文は、空白を 1 つに詰めた 1 本の文字列であること
 * （ブラウザの読み取りと同じ形。詰める役は `condenseText`）。
 */

/** 詰めた本文の中での範囲（両端を含む）。 */
export type TextRange = { from: number; to: number };

/** 同じ文言が何度も出るときに、候補を 1 つに絞る上限。 */
const MAX_HITS = 50;

/**
 * 空白を 1 つに詰める。前後は落とさない。
 *
 * 本文の先頭に空白が無い前提で位置を数える側とそろえるため、
 * 針（探す文言）だけ前後を落とす。本文そのものを落とすと、
 * 先頭の位置がずれる。
 */
export function condenseText(value: string): string {
  return value.replace(/\s+/g, " ");
}

/** 探す文言。前後の空白は目印にならないので落とす。 */
export function condenseNeedle(value: string): string {
  return condenseText(value).trim();
}

function commonSuffixLength(a: string, b: string): number {
  let count = 0;
  while (
    count < a.length &&
    count < b.length &&
    a.charAt(a.length - 1 - count) === b.charAt(b.length - 1 - count)
  ) {
    count += 1;
  }
  return count;
}

function commonPrefixLength(a: string, b: string): number {
  let count = 0;
  while (count < a.length && count < b.length && a.charAt(count) === b.charAt(count)) count += 1;
  return count;
}

/**
 * 覚えておいた文言が、詰めた本文のどこにあるかを探す。
 *
 * 同じ文言が何度も出るときは、前後の文字がいちばん合う場所を選ぶ。
 * 決めきれなければ諦める（別の場所に印を付けるより、付かないほうがまし）。
 */
export function locateInText(
  text: string,
  head: string,
  tail: string | null,
  context: QuoteContext | null,
): TextRange | null {
  const needle = condenseNeedle(head);
  if (needle.length === 0) return null;
  const closing = tail === null ? null : condenseNeedle(tail);

  const hits: TextRange[] = [];
  for (let at = text.indexOf(needle); at >= 0; at = text.indexOf(needle, at + 1)) {
    const headEnd = at + needle.length - 1;
    if (closing === null || closing.length === 0) {
      hits.push({ from: at, to: headEnd });
    } else {
      // 終わりは頭の内側から探す。範囲が短いと head と tail は重なり合う
      let end = -1;
      for (let t = text.indexOf(closing, at); t >= 0; t = text.indexOf(closing, t + 1)) {
        if (t + closing.length - 1 >= headEnd) {
          end = t + closing.length - 1;
          break;
        }
      }
      if (end >= 0) hits.push({ from: at, to: end });
    }
    if (hits.length > MAX_HITS) break;
  }

  if (hits.length === 0) return null;
  if (hits.length === 1) return hits[0];
  if (context === null) return null;

  let best: TextRange | null = null;
  let bestScore = 0;
  let tied = false;
  for (const hit of hits) {
    const before = text.slice(Math.max(0, hit.from - QUOTE_CONTEXT_MAX_LENGTH), hit.from);
    const after = text.slice(hit.to + 1, hit.to + 1 + QUOTE_CONTEXT_MAX_LENGTH);
    const score =
      commonSuffixLength(context.beforeText, before) + commonPrefixLength(context.afterText, after);
    if (score > bestScore) {
      bestScore = score;
      best = hit;
      tied = false;
    } else if (score === bestScore) {
      tied = true;
    }
  }

  if (bestScore === 0 || tied || best === null) return null;
  return best;
}
