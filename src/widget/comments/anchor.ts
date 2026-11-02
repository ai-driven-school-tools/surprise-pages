import {DECK_YOUTUBE_VIEW} from "../../lib/deck/deck";
import {
  QUOTE_CONTEXT_MAX_LENGTH,
  VERSION_BANNER_MARK,
  type PageComment,
  type QuoteContext,
} from "../../lib/comments/types";
import { DECK_EXIT, DECK_FOCUS_SUPPLEMENT, DECK_FOCUS_SUPPLEMENT_PAGES, DECK_LOGO_VIEW, DECK_TOOLBAR } from "../../lib/deck/deck";
import { locateInText, type TextRange } from "../../lib/html/locate-text";
import { DRAFT_MARK, MARK, bleedShadow } from "../shared/tokens";
import { EXPORT_TAG, HOST_TAG, MARK_ATTRIBUTE, normalizeText } from "../shared/util";

/** 下書き中の印の目印。確定した印（MARK_ATTRIBUTE）とは別物として扱う。 */
export const DRAFT_ATTRIBUTE = "data-surprise-draft";

/**
 * コメントを本文のどこに結び付けるか。
 *
 * 保存するのは「選んだ文言」と「その前後の文字」だけで、DOM の場所は覚えない。
 * ページを書き直しても、同じ文言が残っていれば付け直せる。見つからなければ印は付けず、
 * 一覧にだけ残す（コメントが消えるより、印が消えるほうがましなので）。
 */

export type Anchor = {
  quote: string;
  context: QuoteContext;
};

/** 詰めた本文 1 文字ごとに、それがどの文字ノードの何文字目から来たかを覚えておく。 */
type CharSource = { node: Text; offset: number };
export type TextIndex = { text: string; sources: CharSource[] };

/**
 * 文章として数えないタグ。**ここ 1 か所だけ**に置く。
 *
 * サーバー側（src/lib/html/text.ts の DROP_BLOCKS）が中身ごと落としているものと
 * 1 つずつ同じ顔ぶれにする。片方だけが数えると、画面には出ていない文字のぶんだけ
 * 位置がずれ、別の場所に印が付く。
 *
 * `template` がここに無いのは、その中身が別の入れ物に入っていて、
 * この歩き方ではそもそも辿り着かないため（結果としてサーバー側と一致する）。
 */
export const TEXT_SKIP_TAGS = "script,style,noscript,textarea,select,option,svg";

/**
 * ここで行が変わると読み手が感じるタグ。
 * これも**サーバー側（src/lib/html/text.ts の BLOCK_TAGS）と同じ顔ぶれ**にそろえる。
 */
const BLOCK_TAGS =
  "p,div,section,article,header,footer,main,aside,nav," +
  "h1,h2,h3,h4,h5,h6,ul,ol,li,table,thead,tbody,tr,td,th," +
  "blockquote,pre,figure,figcaption,dl,dt,dd,form,fieldset";

/** それ自体が行を切るタグ。中身を持たないので、入れ物としては数えられない。 */
const BREAK_TAGS = "br,hr";

/**
 * こちらが後から足したもの。**書いた人の文章ではないので、1 文字も数えない。**
 *
 * 数えると、足した文字のぶんだけ本文の位置がそっくりずれ、印が全部よそへ行く。
 *   - 自分の画面（影の中）
 *   - 配信時に差し込む「過去の版です」の帯
 *   - 赤入れで挿し戻した文（del だけ。ins は元からある文字を包んでいるので数える）
 *   - スライドの実行部が読み込み時に足す操作の列と釦（保管庫の HTML には無い字。
 *     数えると、サーバーが数える保管庫の本文と位置がずれる）
 */
export const OWN_CHROME =
  `${HOST_TAG},${EXPORT_TAG},[${VERSION_BANNER_MARK}],del[data-surprise-redline],` +
  `[${DECK_YOUTUBE_VIEW}],[${DECK_TOOLBAR}],[${DECK_EXIT}],[${DECK_LOGO_VIEW}],[${DECK_FOCUS_SUPPLEMENT}],[${DECK_FOCUS_SUPPLEMENT_PAGES}]`;

const MARK_SELECTOR = `mark[${MARK_ATTRIBUTE}]`;

/** その文字を抱えている、いちばん近いブロックの入れ物。行の境目を見分けるのに使う。 */
function blockOwner(node: Text): Element | null {
  const parent = node.parentElement;
  return parent === null ? null : parent.closest(BLOCK_TAGS);
}

/**
 * スライドの公開の補足を本文に並べる口（src/lib/deck/edit/customization-dom.ts）。スライドのページでだけ読む——記事では何もしない部品で、
 * スライドの設定と入力の確かめの部品を連れてくるので、最初の読み込みに入れない（docs/design/app-speed.md）。
 * 読み終えたら `onReady` を呼ぶ（読み終える前に組んだ印を、補足を並べた本文で組み直す）。
 */
let ensureSupplements: ((doc: Document) => void) | null = null;
export function prepareDeckSupplements(onReady: () => void): Promise<void> {
  if (!document.body.hasAttribute("data-deck")) return Promise.resolve();
  return import("../../lib/deck/edit/customization-dom").then((deck) => {
    ensureSupplements = deck.ensureDeckPublicSupplements;
    onReady();
  }, () => undefined);
}

/**
 * ページ全体の文字を「空白を 1 つに詰めた 1 本の文字列」にする。
 *
 * 要素の境目でも区切りの空白を 1 つ立てる。ここが要で、
 * `<td>あ</td><td>い</td>` のように**空白を挟まずに書かれた表や `<br>`** を、
 * サーバー側は「あ / い」と行を分けて数えるのに、こちらが「あい」と続けて読むと、
 * 境目をまたぐ手がかりが永久に当たらなくなる（件数だけ出て印が付かない）。
 *
 * 【読み方を変えたときの申し送り】
 * この区切りを入れたことで、**それ以前に保存された引用**のうち境目をまたぐものは、
 * 空白の有無が食い違って当たらなくなる。入れた時点で保存されていた引用を数えたところ
 * 2 件で、どちらも段落の中の短い文言（境目をまたぐものは 0 件）だったため、
 * そのまま切り替えた。
 *
 * このとき「空白を取り払った形でもう一度探す」逃げ道を作る案が出たが、**入れていない**。
 * 空白を無視した照合は、別の場所に誤って当たる危険を持ち込む。
 * 直す相手が 0 件のうちは、危険だけが残る。
 * 今後また読み方を変えるときは、まず保存済みの引用を数えてから決めること。
 */
export function buildTextIndex(): TextIndex {
  ensureSupplements?.(document);
  const chars: string[] = [];
  const sources: CharSource[] = [];
  let pendingSpace = false;
  /** 直前に見た文字ノード。行の境目をまたいだかの判断に使う */
  let previous: Text | null = null;
  /** 前の文字ノードとの間に <br> / <hr> があったか */
  let crossedBreak = false;

  const walker = document.createTreeWalker(
    document.body,
    NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT,
    {
      acceptNode(node: Node): number {
        const element = node instanceof Element ? node : node.parentElement;
        if (element === null) return NodeFilter.FILTER_REJECT;
        // 数えないタグは、中身ごと飛ばす
        if (element.closest(TEXT_SKIP_TAGS) !== null) return NodeFilter.FILTER_REJECT;
        if (element.closest(OWN_CHROME) !== null) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      },
    },
  );

  for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
    if (node instanceof Element) {
      if (node.matches(BREAK_TAGS)) crossedBreak = true;
      continue;
    }
    if (!(node instanceof Text)) continue;

    // 抱えている入れ物が変わった＝段落や升目をまたいだ、ということ
    if (previous !== null && (crossedBreak || blockOwner(previous) !== blockOwner(node))) {
      if (chars.length > 0) pendingSpace = true;
    }
    crossedBreak = false;
    previous = node;

    const value = node.data;
    for (let i = 0; i < value.length; i += 1) {
      const char = value.charAt(i);
      if (char.trim().length === 0) {
        if (chars.length > 0) pendingSpace = true;
        continue;
      }
      if (pendingSpace) {
        chars.push(" ");
        sources.push({ node, offset: i });
        pendingSpace = false;
      }
      chars.push(char);
      sources.push({ node, offset: i });
    }
  }

  return { text: chars.join(""), sources };
}

/** 選択範囲が、詰めた本文の何文字目から何文字目までかを返す。 */
function selectionToIndexes(index: TextIndex, range: Range): { start: number; end: number } | null {
  const head = range.cloneRange();
  head.collapse(true);
  const tail = range.cloneRange();
  tail.collapse(false);

  let start = -1;
  let end = -1;
  for (let i = 0; i < index.sources.length; i += 1) {
    const source = index.sources[i];
    let inside = false;
    try {
      inside =
        head.comparePoint(source.node, source.offset) >= 0 &&
        tail.comparePoint(source.node, source.offset) < 0;
    } catch {
      inside = false;
    }
    if (inside) {
      if (start < 0) start = i;
      end = i;
    } else if (start >= 0) {
      break;
    }
  }

  if (start < 0 || end < start) return null;
  return { start, end };
}

/** いま選ばれている文章から、保存する形の手がかりを作る。 */
export function captureSelection(): Anchor | null {
  const selection = window.getSelection();
  if (selection === null || selection.rangeCount === 0 || selection.isCollapsed) return null;

  const range = selection.getRangeAt(0);
  const raw = normalizeText(selection.toString());
  if (raw.length === 0) return null;

  // 自分の画面（サイドバー等）の中での選択は対象外
  const container = range.commonAncestorContainer;
  const element = container instanceof Element ? container : container.parentElement;
  if (element === null || element.closest(HOST_TAG) !== null) return null;

  const index = buildTextIndex();
  const found = selectionToIndexes(index, range);
  if (found === null) {
    return { quote: raw, context: { beforeText: "", afterText: "" } };
  }

  let start = found.start;
  let end = found.end;
  while (start <= end && index.text.charAt(start) === " ") start += 1;
  while (end >= start && index.text.charAt(end) === " ") end -= 1;
  if (end < start) return null;

  // 引用そのものが復元する範囲。見せる長さに合わせて切ると、投稿後の印も縮む。
  // 保存上限を超えた場合はサーバーが理由を返す。ここでは末尾を失わない。

  return {
    quote: index.text.slice(start, end + 1),
    context: {
      beforeText: index.text.slice(Math.max(0, start - QUOTE_CONTEXT_MAX_LENGTH), start),
      afterText: index.text.slice(end + 1, end + 1 + QUOTE_CONTEXT_MAX_LENGTH),
    },
  };
}

/**
 * 選んだ文言を、選択が消えても失われない形に写し取る。
 *
 * スマホでは、板を開いた瞬間やキーボードが出た瞬間に選択が解除される。
 * 選択そのものを後から読み直す作りだと、書こうとした時点で引用が消えている。
 * そこで押された時点で文字列を複製し、以降はこちらだけを見る。
 */
export function stashSelection(anchor: Anchor): Anchor {
  return {
    quote: anchor.quote,
    context: {
      beforeText: anchor.context.beforeText,
      afterText: anchor.context.afterText,
    },
  };
}

/**
 * 見た目に文字が現れない「詰め物」の空白だけか。
 *
 * HTML の字下げや改行は、そこに文字があるように書かれていても読み手には見えない
 * （横並びの箱――flex / grid――の中では、その空白ごと取り除かれる）。
 * **ここへ印を入れてはいけない。** 印は要素なので、横並びの箱の直下に差し込まれると
 * 新しい「並びの一員」として数えられ、段組みが崩れて後ろの要素が動く。
 * 実測では、節をまたぐ大きな選択で入る印 388 個のうち 286 個がこの詰め物で、
 * うち 125 個が横並びの箱の直下、後ろの要素が最大 372px 動いた。
 *
 * **判定は「空白か」ではなく「見えているか」で決める。** 単語の間の半角スペース 1 個は、
 * 空白でも幅を持って描かれているので、ここでは落ちない（落とすと英文の選択で
 * 印が単語ごとに分断される）。同じ空白でも入れ物次第で見え方が変わるため、
 * 文字だけを見て決められない。幅は必ず**包む前**に測る（包むと測り直しになる）。
 */
function isInvisibleFiller(node: Text): boolean {
  if (node.data.trim().length > 0) return false;
  const probe = document.createRange();
  probe.selectNodeContents(node);
  return probe.getBoundingClientRect().width === 0;
}

/**
 * いま選ばれているところを、その場で印に包む（下書き中の印）。
 *
 * 保存したあとに文言で探し直す仕組み（applyHighlights）とは別物。
 * 書き始めた瞬間はまだ選択が生きているので、探さずにそのまま包める。
 * 探し直しを挟まないぶん、同じ文言が何度も出るページでも取り違えない。
 *
 * 包む相手は**見えている文字だけ**（isInvisibleFiller の注記）。
 * 何も包めなくても空の配列を返すだけで、書くこと自体は続けられる。
 */
export function wrapRangeAsDraft(range: Range): HTMLElement[] {
  // DOM を触ると範囲がずれるので、境目を先に控える
  const startNode = range.startContainer;
  const startOffset = range.startOffset;
  const endNode = range.endContainer;
  const endOffset = range.endOffset;

  const scope = startNode.nodeType === Node.TEXT_NODE ? startNode.parentNode : startNode;
  const root = range.commonAncestorContainer;
  const from = root.nodeType === Node.TEXT_NODE ? (root.parentNode ?? scope) : root;
  if (from === null) return [];

  const targets: Array<{ node: Text; start: number; end: number }> = [];
  const walker = document.createTreeWalker(from, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
    if (!(node instanceof Text)) continue;
    const parent = node.parentElement;
    if (parent === null) continue;
    if (parent.closest(TEXT_SKIP_TAGS) !== null || parent.closest(HOST_TAG) !== null) continue;
    if (!range.intersectsNode(node)) continue;
    // 選択の始点・終点を含むノードは、範囲の端そのものなので詰め物でも外さない
    const boundary = node === startNode || node === endNode;
    if (!boundary && isInvisibleFiller(node)) continue;

    const start = node === startNode ? startOffset : 0;
    const end = node === endNode ? endOffset : node.data.length;
    if (end <= start) continue;
    targets.push({ node, start, end });
  }

  const marks: HTMLElement[] = [];
  for (const target of targets) {
    let piece = target.node;
    if (target.start > 0) piece = piece.splitText(target.start);
    if (piece.data.length > target.end - target.start) piece.splitText(target.end - target.start);

    const holder = piece.parentNode;
    if (holder === null) continue;

    const mark = document.createElement("mark");
    mark.setAttribute(DRAFT_ATTRIBUTE, "");
    holder.insertBefore(mark, piece);
    mark.appendChild(piece);
    styleDraftMark(mark, false);
    marks.push(mark);
  }
  return marks;
}

/**
 * 塗りを字の左右へわずかにはみ出させる（内側余白の代わり）。
 *
 * **本文に入る印は、字送りを動かす性質のスタイルを一切持ってはいけない。**
 * 印は文字ノードを割って差し込むので、余白・枠線・行間などを持たせると、
 * 印 1 個ごとに行が伸びて文字の位置と折り返しが動く（赤入れが余白を 0 に
 * 固定しているのと同じ理由）。はみ出しは場所を取らない影だけで作る。
 *
 * **余白の値は引数で受け取らない。** 取りうる値が 0 の 1 つだけなら目盛りではないので、
 * ここで固定する。渡せる形にしておくと `"0 2px"` に戻すだけで字送りが伸びる。
 */
function paintBleed(mark: HTMLElement, tint: string): void {
  // 余白・外側の間隔・枠線・並び方をわざわざ書いているのは消すため。
  // ページ側が `mark { padding: … }` のように飾っていると、何も書かなければ
  // その指定がそのまま効いて、こちらが 0 に固定した意味が無くなる（赤入れと同じ作法）
  mark.style.padding = "0";
  mark.style.margin = "0";
  mark.style.border = "0";
  mark.style.display = "inline";
  mark.style.boxShadow = bleedShadow(tint);
  // box-decoration-break: clone は足さない。あれは折り返しの切れ端ごとに端の飾りを
  // 描き直す指定で、切れ目にも左右のはみ出しと角丸が出る（2 行目以降の行頭より
  // 2px 左へ爪が出た）。折り返しの切れ目は印の端ではないので、既定のまま
  // 「1 個として描いてから切る」でよい。
}

/** 下書き中の印。薄く塗って、下に点線を添える。 */
export function styleDraftMark(mark: HTMLElement, failed: boolean): void {
  mark.style.background = DRAFT_MARK.tint;
  mark.style.color = "inherit";
  mark.style.borderRadius = DRAFT_MARK.radius;
  paintBleed(mark, DRAFT_MARK.tint);
  mark.style.textDecorationLine = "underline";
  mark.style.textDecorationStyle = "dotted";
  mark.style.textDecorationThickness = DRAFT_MARK.thickness;
  mark.style.textUnderlineOffset = DRAFT_MARK.offset;
  mark.style.textDecorationColor = failed ? DRAFT_MARK.failedColor : DRAFT_MARK.lineColor;
}

/** 送ったことにして、確定の見た目へ切り替える（返事を待たない）。 */
export function confirmDraftMark(mark: HTMLElement): void {
  mark.style.background = MARK.tint;
  mark.style.borderRadius = MARK.radius;
  paintBleed(mark, MARK.tint);
  mark.style.textDecorationLine = "none";
  mark.style.opacity = "1";
}

/**
 * 印を外して、包んでいた文字を元の場所へ戻す。
 *
 * **何度呼んでも安全**（すでに外れた印は親を持たないので飛ばす）。同じ印に
 * 二度届くことはある（送れなかった知らせを閉じたあとに、ドックを畳むなど）。
 *
 * 外したあとは必ず隣の文字ノードと繋ぎ直す（`normalize`）。割れたまま残すと、
 * 次に選んだ範囲を数えるときに文字の位置がずれる。
 */
function unwrapMarks(marks: Iterable<Element>): void {
  for (const mark of marks) {
    const parent = mark.parentNode;
    if (parent === null) continue;
    while (mark.firstChild !== null) parent.insertBefore(mark.firstChild, mark);
    parent.removeChild(mark);
    parent.normalize();
  }
}

/** 下書きが持っている印を外して、ページを元の形に戻す。 */
export function unwrapDraftMarks(marks: readonly HTMLElement[]): void {
  unwrapMarks(marks);
}

/** 詰めた本文の中での範囲（両端を含む）。正本は src/lib/html/locate-text.ts。 */
export type { TextRange };

/**
 * 覚えておいた文言が、いまのページのどこにあるかを探す。
 *
 * 探し方の正本は src/lib/html/locate-text.ts。ブラウザの本文インデックスを渡す入口。
 */
export function locateText(
  index: TextIndex,
  head: string,
  tail: string | null,
  context: QuoteContext | null,
): TextRange | null {
  return locateInText(index.text, head, tail, context);
}

type Group = { node: Text; start: number; end: number };

/** 文字の並び [from, to] を、文字ノードごとのかたまりに分ける。 */
export function groupsFor(index: TextIndex, from: number, to: number): Group[] {
  const groups: Group[] = [];
  for (let i = from; i <= to && i < index.sources.length; i += 1) {
    const source = index.sources[i];
    const last = groups[groups.length - 1];
    if (last !== undefined && last.node === source.node && source.offset >= last.end) {
      last.end = source.offset;
      continue;
    }
    groups.push({ node: source.node, start: source.offset, end: source.offset });
  }
  return groups;
}

/**
 * 詰めた本文の範囲を、文字ノードごとに要素で包む。
 *
 * 包むたびに文字ノードが割れるので、**後ろから**処理する。
 * 前から包むと、同じ文字ノードの後ろ側の位置がずれる。
 *
 * 触るのは文字ノードの中だけ。表の行や図の入れ物には手を出さないので、
 * 包んだせいで体裁が崩れることはない。
 */
export function wrapRange(
  index: TextIndex,
  range: TextRange,
  make: () => HTMLElement,
): HTMLElement[] {
  const groups = groupsFor(index, range.from, range.to);
  const wrapped: HTMLElement[] = [];

  for (let g = groups.length - 1; g >= 0; g -= 1) {
    const group = groups[g];
    const length = group.end + 1 - group.start;
    if (length <= 0) continue;

    let target = group.node;
    if (group.start > 0) target = target.splitText(group.start);
    if (target.data.length > length) target.splitText(length);

    const holder = target.parentNode;
    if (holder === null) continue;

    const box = make();
    holder.insertBefore(box, target);
    box.appendChild(target);
    wrapped.push(box);
  }

  // 作った順は後ろからなので、本文の並びに戻して返す
  return wrapped.reverse();
}

/**
 * 引用に付ける見た目。ページ側に CSS を足さずに済むよう、要素に直接書く。
 *
 * 蛍光ペンで塗った形にする。下線は使わない。書いた人が元から下線を引いている
 * ことがあり、そうすると「これは注釈なのか、元からの強調なのか」が読めなくなる。
 *
 * 塗りは 1 色だけ（優先度では塗り分けない）。いま開いているものだけ半段濃くする。
 */
export function styleMark(mark: HTMLElement, comment: PageComment, active: boolean): void {
  const resolved = comment.resolvedAt !== null;
  const tint = active ? MARK.activeTint : resolved ? MARK.resolvedTint : MARK.tint;

  mark.style.background = tint;
  mark.style.color = "inherit";
  mark.style.borderRadius = MARK.radius;
  paintBleed(mark, tint);
  mark.style.cursor = "pointer";
  mark.style.transition = MARK.transition;
  mark.style.opacity = resolved ? MARK.resolvedOpacity : "1";
  // 消したい箇所の申し送りだけは、線で示す（塗りとは意味が別）
  mark.style.textDecorationLine = "none";
}

/** 指した瞬間だけ半段濃くする。離したら元の濃さへ戻す（戻しは styleMark の役目）。 */
export function hoverMark(mark: HTMLElement): void {
  mark.style.background = MARK.activeTint;
  // 左右のはみ出し（影）も一緒に濃くする。塗りだけ替えると縁の色が取り残される
  mark.style.boxShadow = bleedShadow(MARK.activeTint);
}

/**
 * 付けた目印を外して、ページを元の形に戻す。**外すのは確定した印だけ。**
 *
 * 書きかけの印をここから掃く道は用意しない。確定した印はコメントを読み直すたびに
 * サーバーの引用から引き直されるので、消えても治る。書きかけにはその引き直しが無いので、
 * 持ち主（小窓・ドック）が持っている配列を残したまま本文から消すと、
 * 誰も描き直せない引用がドックに残る。書きかけを畳むのは持ち主の役目
 * （comments.ts の dropDraft）で、そこで印も一緒に外れる。
 */
export function clearHighlights(): void {
  unwrapMarks(Array.from(document.querySelectorAll(MARK_SELECTOR)));
}

/**
 * コメントの引用文に印を付ける。付けられた（＝本文中に見つかった）コメントの id を返す。
 *
 * 印を 1 つ入れるたびに文字ノードが割れるため、コメントごとに数え直している。
 * ページ 1 枚に付くコメントは多くても数十件なので、素直に数え直すほうが事故が少ない。
 */
export function applyHighlights(comments: readonly PageComment[]): Set<string> {
  clearHighlights();
  const anchored = new Set<string>();

  for (const comment of comments) {
    if (comment.parentId !== null) continue;
    if (comment.quote === null || comment.quote.length === 0) continue;

    const index = buildTextIndex();
    const found = locateText(index, comment.quote, null, comment.quoteContext);
    if (found === null) continue;

    const marks = wrapRange(index, found, () => {
      const mark = document.createElement("mark");
      mark.setAttribute(MARK_ATTRIBUTE, "");
      mark.dataset.commentId = comment.id;
      styleMark(mark, comment, false);
      return mark;
    });

    if (marks.length > 0) anchored.add(comment.id);
  }

  return anchored;
}

export function marksFor(commentId: string): HTMLElement[] {
  const found: HTMLElement[] = [];
  for (const node of Array.from(document.querySelectorAll(MARK_SELECTOR))) {
    if (node instanceof HTMLElement && node.dataset.commentId === commentId) found.push(node);
  }
  return found;
}

/** クリックされたところが引用の印かどうか。 */
export function markAt(target: EventTarget | null): HTMLElement | null {
  if (!(target instanceof Element)) return null;
  const mark = target.closest(MARK_SELECTOR);
  return mark instanceof HTMLElement ? mark : null;
}

/** そのコメントが本文の上から何 px の位置にあるか。見つからなければ null。 */
export function verticalPosition(commentId: string): number | null {
  const marks = marksFor(commentId);
  if (marks.length === 0) return null;
  return marks[0].getBoundingClientRect().top + window.scrollY;
}
