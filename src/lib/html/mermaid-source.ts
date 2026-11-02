/**
 * 図の元の文を、描かれる前に控える口（**名前も控え方もここが正本**）。
 *
 * 本文の書き出し（`src/lib/pages/markdown.ts`）から分けてあるのは、道具箱がページを開いた直後に控えるのにこの口だけを要るため。
 * 書き出しの部品はスライドの設定（と入力の確かめの部品）を連れてくるので、控えるためだけに最初の読み込みへ入れない
 * （docs/design/app-speed.md）。書き出しは `src/lib/pages/markdown.ts` がここから同じ名前を読み、外へもそのまま渡す。
 */

function classOf(el: Element): string {
  return el.getAttribute("class") ?? "";
}

function hasToken(cls: string, token: string): boolean {
  return new RegExp(`(^|\\s)${token}(\\s|$)`).test(cls);
}

/**
 * 図の元の文字の控え先。**この名前の出どころはここ 1 つ**（控える側も読む側もここを見る）。
 *
 * 図の道具は、描き終えると元の文字を消して SVG に置き換える。SVG は文章ではないので
 * 書き出しでは落としており、そのままだと図が丸ごと消える。だから**描かれる前に**
 * 元の文字をここへ控えて、書き出しはこちらを読む。
 */
export const MERMAID_SOURCE_MARK = "data-surprise-mermaid";

/** 図の道具が「もう描いた」と立てる印。これが立っていたら、中の文字はもう元の文ではない。 */
export const MERMAID_DONE_MARK = "data-processed";

/** 図の道具が拾う目印。あちらの決まりなので、こちらで別名を作らない。 */
export function isMermaid(el: Element): boolean {
  return hasToken(classOf(el), "mermaid");
}

/**
 * 図の元の文字を、描かれる前に控える。
 *
 * **描かれる前でないと間に合わない。** 図の道具はページの読み込みが終わった合図
 * （window の load）で描き始めるので、呼ぶ側はそれより前——道具箱の立ち上げ
 * （DOMContentLoaded）で 1 度だけ通す。遅れて呼んでも、そのときにはもう元の文が無い。
 *
 * すでに控えてあるもの・もう描かれてしまったものには手を出さない（上書きで壊さない）。
 */
export function keepMermaidSource(root: ParentNode): void {
  for (const el of root.querySelectorAll(".mermaid")) {
    if (!isMermaid(el)) continue;
    if (el.hasAttribute(MERMAID_SOURCE_MARK) || el.hasAttribute(MERMAID_DONE_MARK)) continue;
    const source = (el.textContent ?? "").trim();
    if (source.length === 0) continue;
    el.setAttribute(MERMAID_SOURCE_MARK, source);
  }
}

