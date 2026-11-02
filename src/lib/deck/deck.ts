/**
 * スライド形式（deck）の目印。**名前の出どころはここ 1 つ。**
 *
 * deck は台帳に列を持たない。「これはスライドだ」は HTML が自分で語る
 * （`<title>` から題を採るのと同じ向き）。だから配信・書き出し・道具箱・実行部の
 * 4 か所が同じ字を見ていなければならず、ここに集めて検査表（check-deck.mjs）が
 * 雛形（src/templates/deck.html）と突き合わせる。
 *
 * 契約（書く側が守る形）:
 *
 *   <body data-deck>
 *     <main data-deck-slides>
 *       <section data-deck-slide>       … 1 枚。1280×720 の構図
 *         …本文…
 *         <aside data-deck-notes>…</aside>   … 任意。最後の子。文章だけ
 *       </section>
 *     </main>
 *     （src/templates/deck.html を丸ごと貼る）
 *   </body>
 *
 * **ここには外の世界に触る部品を置かない**（src/lib/pages/content.ts と同じ制約）。
 * 検査表がこのファイルだけを組み立てて呼ぶ。
 *
 * 語は deck。「slide」はコメントの覗き見のカルーセル（slidePeek）で使っているので、
 * 属性の中でだけ「1 枚」の意味で使い、機能の名前にはしない。
 */

/** `<body>` に付く印。実行部も道具箱も、これが無ければ何もしない。 */
export const DECK_MARK = "data-deck";

/** 枚を並べる器（`<main>`）。 */
export const DECK_SLIDES = "data-deck-slides";

/** 1 枚（`<section>`）。 */
export const DECK_SLIDE = "data-deck-slide";

/** 発表の順送りから除外する。本文・印刷は残す。値は true のみ。 */
export const DECK_SKIP = "data-deck-skip";

/** スピーカーノート（`<aside>`）。`/public/` の配信では取り除かれる。 */
export const DECK_NOTES = "data-deck-notes";

/**
 * 表示モード。実行部が `<html>` に立て、道具箱はこれ**だけ**を見て隠れる
 * （イベントの取り決めは作らない）。
 */
export const DECK_MODE_ATTR = "data-deck-mode";
export const DECK_MODE_PRESENT = "present";

/** 実行部が各枚を包む器。読み込み時に 1 度だけ作り、以後は DOM を動かさない。 */
export const DECK_FRAME = "data-deck-frame";

/** プレゼン中に出している 1 枚。 */
export const DECK_CURRENT = "data-deck-current";

/**
 * 実行部が足す操作の列（プレゼンを始める・ノートの表示）と、プレゼンを終える釦。
 * 書いた人の文章ではないので、コメントの索引も Markdown の書き出しも数えない。
 */
export const DECK_TOOLBAR = "data-deck-toolbar";
export const DECK_EXIT = "data-deck-exit";
/** Runtime-only logo copy. It is never part of comments or Markdown exports. */
export const DECK_YOUTUBE_VIEW = "data-deck-youtube-view";
export const DECK_LOGO_VIEW = "data-deck-logo-view";
/** Runtime-only public supplement for the current guided step. */
export const DECK_FOCUS_SUPPLEMENT = "data-deck-focus-supplement";
/** Runtime reading copy of every public supplement. Excluded from comment positions, included in Markdown. */
export const DECK_FOCUS_SUPPLEMENTS = "data-deck-focus-supplements";
/** Print-only appendix containing all public supplements with their slide titles. */
export const DECK_FOCUS_SUPPLEMENT_PAGES = "data-deck-focus-supplement-pages";

/** 器（`<main>`）に立つ「ノートを隠している」印。状態は覚えない（開き直せば戻る）。 */
export const DECK_NOTES_HIDDEN = "data-deck-notes-hidden";
/** 一覧（格子）を開いている印。実行部が html に立てる（道具箱の ⋯ はこれを読んで「一覧を閉じる」と言う） */
export const DECK_OVERVIEW = "data-deck-overview";

/** 720px を超えて描かれた枚。見せるだけで、保存は止めない。 */
export const DECK_OVERFLOW = "data-deck-overflow";

/**
 * キャンバスの大きさ。**16:9 の 1 通りだけ**——選べるようにすると、同じ deck を
 * 並べたときに倍率がそろわない。
 */
export const DECK_CANVAS = { width: 1280, height: 720 } as const;

/**
 * 枚を指す URL のハッシュ（`#7`）。コメントの深いリンク（`#c=<uuid>`）と形が違うので
 * 衝突しない。実行部はこれに合わないハッシュを枚と読まない。
 */
export const DECK_HASH = /^#(\d+)$/;

const BODY_WITH_MARK = new RegExp(`<body\\b[^>]*\\s${DECK_MARK}(?:[\\s=>/]|$)`, "i");

/** 本文が deck か（`<body data-deck>` の有無）。台帳を引かずに HTML だけで決める。 */
export function isDeckHtml(html: string): boolean {
  return BODY_WITH_MARK.test(html);
}
