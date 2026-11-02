import { VERSION_BANNER_MARK } from "../../lib/comments/types";

/**
 * 画面の上端を使う帯の高さを 1 か所で足し合わせ、本文の余白に配る。
 *
 * 上端に固定する帯は 3 つあり、上から順に積む:
 *
 *   location  現在地の行（location-bar.ts）
 *   compare   版を見比べている間の帯（comment-widget-history.ts）
 *   reading   清書の現在地の帯（reading-nav.ts。狭い画面でだけ出る）
 *
 * それぞれが自分で本文の余白（html の padding-top）を書くと、あとから書いたものが前の値を消す
 * ——帯を 1 つ足すたびに「誰かと重なる」が起きる。だから帯は**自分の高さを届けるだけ**にし、
 * 余白・飛び先の余白（scroll-padding-top）・ページ側に渡す値は、ここだけが書く。
 *
 * 帯の置き場所（自分より上にある帯の高さの合計）も、ここに聞く（`above`）。
 */
const ORDER = ["location", "compare", "reading"] as const;
export type TopBand = (typeof ORDER)[number];

/**
 * ページ側（light DOM）に渡す値の名前。上端に貼り付く部品（スライドの操作の列など）が、
 * 帯の下から始めるために読む。
 */
export const TOP_INSET_VAR = "--surprise-top-inset";

class TopInset {
  private readonly heights: Record<TopBand, number> = { location: 0, compare: 0, reading: 0 };
  private readonly listeners = new Set<() => void>();
  private original: { top: string; scroll: string } | null = null;
  private scrollGap = 0;

  /** 帯の高さを届ける。変わったときだけ本文の余白を書き直し、見ている人に知らせる。 */
  set(band: TopBand, height: number): void {
    const next = Math.max(0, Math.round(height));
    if (this.heights[band] === next) return;
    this.heights[band] = next;
    this.apply();
    for (const listener of [...this.listeners]) listener();
  }

  /** その帯より上にある帯の高さの合計（＝その帯を置く位置）。 */
  above(band: TopBand): number {
    let sum = 0;
    for (const name of ORDER) {
      if (name === band) break;
      sum += this.heights[name];
    }
    return sum;
  }

  /** 帯ぜんぶの高さ。 */
  total(): number {
    return ORDER.reduce((sum, name) => sum + this.heights[name], 0);
  }

  /** 見出しへ飛んだとき、帯の下に空けておく余白（清書の目次が使う）。 */
  setScrollGap(gap: number): void {
    if (this.scrollGap === gap) return;
    this.scrollGap = gap;
    this.apply();
  }

  /** 高さが変わるたびに呼ぶ。返すのは、見るのをやめる関数。 */
  watch(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private apply(): void {
    const html = document.documentElement;
    if (this.original === null) {
      this.original = { top: html.style.paddingTop, scroll: html.style.scrollPaddingTop };
      // 紙に刷るときは帯が出ないので、帯のぶんの余白も付けない
      const print = document.createElement("style");
      print.textContent = `@media print { html { padding-top: ${this.original.top || "0"} !important; } }`;
      document.head.append(print);
    }
    const total = this.total();
    // 過去の版の帯は本文の流れの中にあり、上端に貼り付く。ほかの帯の下（清書の帯の上）に貼り付かせる
    const banner = document.querySelector(`[${VERSION_BANNER_MARK}]`);
    if (banner instanceof HTMLElement) banner.style.top = `${this.above("reading")}px`;
    const covered = total + (banner?.getBoundingClientRect().height ?? 0);
    html.style.paddingTop = total === 0 ? this.original.top : `${total}px`;
    html.style.scrollPaddingTop = covered === 0 && this.scrollGap === 0 ? this.original.scroll : `${covered + this.scrollGap}px`;
    html.style.setProperty(TOP_INSET_VAR, `${total}px`);
  }
}

/** 道具箱は 1 つの束で配るので、持ち主もこの 1 つだけ。 */
export const topInset = new TopInset();
