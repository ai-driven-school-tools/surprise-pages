import { FIRST_PAINT_CHROME, FIRST_PAINT_MARK } from "../../lib/first-paint/mark";

/**
 * 配信のときに空けておいた場所（src/lib/first-paint/chrome.ts の `<style data-sp-first-paint="chrome">`）を外す。
 *
 * 呼ぶのは、上端の現在地の行と目次を置く**同じ処理の中の、置く直前**だけ（src/widget/comments/comments.ts の start）。
 * 間に描画が挟まらないので、空けておいた場所から本物へ移るときに本文は動かない。外してから置くのは、
 * 目次が「ページがもともと持っていた本文の幅」を控えるため（空けておいた指定が残っていると、それを元の幅と読む）。
 */
export function releaseFirstPaintChrome(): void {
  for (const style of document.querySelectorAll(`style[${FIRST_PAINT_MARK}="${FIRST_PAINT_CHROME}"]`)) style.remove();
}
