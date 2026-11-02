import { diffWordsWithSpace } from "diff";
import { assetRefs, htmlBodyText, titleOf } from "./text";
import { rt } from "../i18n/request";
import {
  REDLINE_CONTEXT_MAX,
  REDLINE_HEAD_MAX,
  type RedlineAnchor,
  type RedlineChange,
  type RedlineDiff,
} from "../comments/types";

/**
 * 2 つの版の「文章」を突き合わせ、**新しい版の上に赤入れするための指示**を作る。
 *
 * 出すのは本文の写しではなく、「どこに」「何を」足す／挿し戻すかだけ。
 * 本文そのものはページ本体を使うので、ここで組み直さない
 * （ページ HTML は書いた人のものをそのまま配る、という作りを崩さないため）。
 *
 * 居場所は絶対位置ではなく「文言＋前後の文字」で渡す。理由は comment-types.ts の
 * RedlineAnchor に書いたとおりで、探す側の部品はコメントの引用と共通のものを使う。
 */

/** 空白を 1 つに詰める。ブラウザ側の読み取りと同じ形にそろえるため。 */
function condense(value: string): string {
  return value.replace(/\s+/g, " ");
}

/** 手がかりの文言。前後の空白は落とす（本文の先頭は空白から始まらないため）。 */
function trimmed(value: string): string {
  return condense(value).trim();
}

/** 範囲の両端から空白を削る。空白しか無ければ null。 */
function shrink(text: string, start: number, end: number): { start: number; end: number } | null {
  let from = start;
  let to = end;
  while (from <= to && text.charAt(from).trim().length === 0) from += 1;
  while (to >= from && text.charAt(to).trim().length === 0) to -= 1;
  return to < from ? null : { start: from, end: to };
}

/**
 * 範囲 [start, end]（両端を含む）から、探し直すための手がかりを作る。
 *
 * 長い範囲は頭と尻だけを覚える。まるごと覚えると、途中が 1 文字直されただけで
 * 見つからなくなるうえ、渡す量も膨らむ。
 */
function anchorFor(text: string, start: number, end: number): RedlineAnchor {
  const length = end + 1 - start;
  const head = trimmed(text.slice(start, start + Math.min(length, REDLINE_HEAD_MAX)));
  const tail =
    length > REDLINE_HEAD_MAX ? trimmed(text.slice(end + 1 - REDLINE_HEAD_MAX, end + 1)) : null;

  return {
    head,
    tail,
    before: condense(text.slice(Math.max(0, start - REDLINE_CONTEXT_MAX), start)),
    after: condense(text.slice(end + 1, end + 1 + REDLINE_CONTEXT_MAX)),
  };
}

/**
 * 行まるごとの変化か。
 *
 * 消した文が段落をまたいでいるのに行の中へ挿し戻すと、前の段落に長大な 1 行が
 * 押し込まれて体裁が崩れる。改行を含み、かつ切れ目が行の境目に来ているものを
 * 段落として扱う。改行は消した側／残った側のどちらに寄ることもあるので、
 * **前後のどちらかが行の境目なら**段落とみなす。
 */
function isBlock(text: string, afterText: string, at: number): boolean {
  if (!text.includes("\n")) return false;
  const startsLine = at === 0 || afterText.charAt(at - 1) === "\n";
  const endsLine = at >= afterText.length || afterText.charAt(at) === "\n";
  return startsLine || endsLine;
}

/** 足された範囲を包むための 1 件。両端の空白は印から外す（下線が字の外へはみ出すため）。 */
function addChange(
  index: number,
  afterText: string,
  core: { start: number; end: number },
  text: string,
): RedlineChange {
  return {
    index,
    kind: "add",
    text,
    block: isBlock(text, afterText, core.start),
    place: "wrap",
    anchor: anchorFor(afterText, core.start, core.end),
  };
}

/**
 * 消された文を挿し戻すための 1 件。
 *
 * 手がかりにするのは、消えた場所の**直前に残っている文章**。そこの直後へ差し込めば、
 * 元あった場所に戻る。先頭が消えた場合だけは直前が無いので、直後の文章を手がかりに
 * して、その前へ差し込む。
 */
function delChange(index: number, afterText: string, at: number, text: string): RedlineChange {
  const block = isBlock(text, afterText, at);
  const ahead = at > 0 ? shrink(afterText, Math.max(0, at - REDLINE_HEAD_MAX), at - 1) : null;

  if (ahead !== null) {
    return {
      index,
      kind: "del",
      text,
      block,
      place: "after",
      anchor: anchorFor(afterText, ahead.start, ahead.end),
    };
  }

  const behind = shrink(afterText, at, Math.min(afterText.length - 1, at + REDLINE_HEAD_MAX - 1));
  if (behind !== null) {
    return {
      index,
      kind: "del",
      text,
      block,
      place: "before",
      anchor: anchorFor(afterText, behind.start, behind.end),
    };
  }

  // 新しい版に文章が 1 文字も残っていない。印は置けないが、一覧には残す
  return {
    index,
    kind: "del",
    text,
    block,
    place: "after",
    anchor: { head: "", tail: null, before: "", after: "" },
  };
}

/**
 * ページの名前（`<title>`）が変わったこと。変わっていなければ null。
 *
 * ページの名前は本文に出ないので、**印を置く先が無い**。
 * だからといって数えないと、名前だけ直した版が「変化なし」と出てしまい、
 * 何も変わっていないように読める。数には入れて、一覧に 1 行だけ出す
 * （押しても飛べないことは、その行に書く）。
 */
function titleChange(
  beforeHtml: string,
  afterHtml: string,
  index: number,
): RedlineChange | null {
  const before = titleOf(beforeHtml);
  const after = titleOf(afterHtml);
  if (before === after) return null;

  return {
    index,
    kind: "title",
    // 名前が無い側は、見ている人の言語で「名前なし」と書く（要求の外では日本語）
    text: `${before ?? rt("common.untitled")} → ${after ?? rt("common.untitled")}`,
    block: false,
    place: "none",
    anchor: { head: "", tail: null, before: "", after: "" },
  };
}

/** 集合の差。並びは元の順のまま。 */
function missingFrom(all: readonly string[], other: readonly string[]): string[] {
  const known = new Set(other);
  return all.filter((value) => !known.has(value));
}

/**
 * 変更のかたまりの間に挟まった「変わっていない部分」が、これ以下の長さなら 1 件にまとめる。
 *
 * 日本語には単語の区切りが無いので、単語ごとの突き合わせが文字ごとに崩れる。
 * 実際に一文を書き換えた版で測ると、変更のかたまりの間に残る「一致」は
 * 「の」「は」「ま」のような **0〜1 文字の偶然**ばかりで、意味のある一致は
 * 4 文字（「ここに置」）まで飛ぶ。この谷の中に置いた値が 3。
 *
 * 大きくしすぎると、変わっていない字にまで下線と取り消し線の両方が掛かって、
 * かえって読めなくなる。だから谷の下側に寄せてある。
 * この 1 つの版で 16 件 → 5 件になる（tests/checks/check-diff.mjs で数えている）。
 */
const REDLINE_MERGE_GAP = 3;

type Piece = { value: string; added: boolean; removed: boolean };

/**
 * 短すぎる「変わっていない部分」を、前後の変更に吸わせる。
 *
 * 吸わせた部分は消した側にも足した側にも入るので、結果として 1 件のかたまりになる。
 * ただし**段落の境目（改行）は越えない**。越えると 1 件が段落をまたいで長くなり、
 * 「どこを直したのか」がまた読めなくなる。
 */
function absorbShortGaps(parts: readonly Piece[]): Piece[] {
  const marked: Piece[] = [];

  for (let i = 0; i < parts.length; i += 1) {
    const part = parts[i];
    if (part.added || part.removed) {
      marked.push(part);
      continue;
    }

    const before = parts[i - 1];
    const after = parts[i + 1];
    const flanked =
      before !== undefined &&
      after !== undefined &&
      (before.added || before.removed) &&
      (after.added || after.removed);

    if (
      !flanked ||
      part.value.includes("\n") ||
      part.value.trim().length > REDLINE_MERGE_GAP
    ) {
      marked.push(part);
      continue;
    }

    marked.push({ value: part.value, removed: true, added: false });
    marked.push({ value: part.value, removed: false, added: true });
  }

  return marked;
}

function toPieces(parts: readonly { value: string; added?: boolean; removed?: boolean }[]): Piece[] {
  const pieces: Piece[] = [];
  for (const part of parts) {
    if (part.value.length === 0) continue;
    pieces.push({ value: part.value, added: part.added === true, removed: part.removed === true });
  }
  return pieces;
}

// A transcript rewrite can make the word diff quadratic. Save the complete text,
// but use paragraph-sized changes when a detailed comparison exceeds this budget.
const DETAILED_DIFF_CHARACTERS = 24_000;
const DETAILED_DIFF_MS = 100;

function sharedEdges(before: string, after: string): { prefix: number; suffix: number } {
  let prefix = 0;
  while (prefix < before.length && prefix < after.length && before[prefix] === after[prefix]) prefix++;
  if (prefix > 0 && /[\uDC00-\uDFFF]/.test(before.charAt(prefix))) prefix--;
  let suffix = 0;
  while (
    suffix < before.length - prefix && suffix < after.length - prefix &&
    before[before.length - suffix - 1] === after[after.length - suffix - 1]
  ) suffix++;
  if (suffix > 0 && /[\uDC00-\uDFFF]/.test(before.charAt(before.length - suffix))) suffix--;
  return { prefix, suffix };
}

function textPieces(before: string, after: string): { pieces: Piece[]; coarse: boolean } {
  const edges = sharedEdges(before, after);
  // Expand only the changed middle to paragraph boundaries. Long unchanged
  // prefixes and suffixes never enter the tokenizer.
  const prefix = edges.prefix === 0 ? 0 : before.lastIndexOf("\n", edges.prefix - 1) + 1;
  const end = before.length - edges.suffix;
  const lineEnd = end === 0 || before.charAt(end - 1) === "\n" ? end : before.indexOf("\n", end);
  const suffix = lineEnd < 0 ? 0 : before.length - (lineEnd === end ? end : lineEnd + 1);
  const oldMiddle = before.slice(prefix, before.length - suffix);
  const newMiddle = after.slice(prefix, after.length - suffix);
  const first = { value: before.slice(0, prefix) };
  const last = { value: before.slice(before.length - suffix) };
  if (oldMiddle.length + newMiddle.length <= DETAILED_DIFF_CHARACTERS) {
    const detailed = diffWordsWithSpace(oldMiddle, newMiddle, {
      timeout: DETAILED_DIFF_MS,
      maxEditLength: 1024,
    });
    if (detailed !== undefined) return { pieces: toPieces([first, ...detailed, last]), coarse: false };
  }

  // No text is omitted: unchanged + removed reconstructs before, and unchanged
  // + added reconstructs after. The UI explicitly identifies this coarse result.
  return {
    pieces: toPieces([
      first,
      { value: oldMiddle, removed: true },
      { value: newMiddle, added: true },
      last,
    ]),
    coarse: true,
  };
}

/** 2 つの HTML を突き合わせ、新しい版の上に入れる赤入れを組み立てる。 */
export function redlineDiff(beforeHtml: string, afterHtml: string): RedlineDiff {
  const beforeText = htmlBodyText(beforeHtml);
  const afterText = htmlBodyText(afterHtml);

  const beforeAssets = assetRefs(beforeHtml);
  const afterAssets = assetRefs(afterHtml);
  const images = {
    added: missingFrom(afterAssets, beforeAssets),
    removed: missingFrom(beforeAssets, afterAssets),
  };

  if (beforeText === afterText) {
    const only = titleChange(beforeHtml, afterHtml, 1);
    const changes = only === null ? [] : [only];
    return { changes, identical: changes.length === 0, addedCount: 0, removedCount: 0, images };
  }

  const changes: RedlineChange[] = [];
  let addedCount = 0;
  let removedCount = 0;

  const compared = textPieces(beforeText, afterText);
  const marked = absorbShortGaps(compared.pieces);
  let at = 0;
  let cursor = 0;

  while (cursor < marked.length) {
    const part = marked[cursor];
    if (!part.added && !part.removed) {
      at += part.value.length;
      cursor += 1;
      continue;
    }

    // ひと続きの変更をまとめて 1 つのかたまりとして取り出す
    let removed = "";
    let added = "";
    while (cursor < marked.length && (marked[cursor].added || marked[cursor].removed)) {
      if (marked[cursor].added) added += marked[cursor].value;
      else removed += marked[cursor].value;
      cursor += 1;
    }

    // 消した文が先。元の場所に挿し戻す札は、足した文の前に置く
    if (removed.trim().length > 0) {
      changes.push(delChange(changes.length + 1, afterText, at, removed));
      removedCount += 1;
    }
    if (added.trim().length > 0) {
      // 空白だけの出入りは、行の切れ方が動いただけ。文章としては変わっていない
      const core = shrink(afterText, at, at + added.length - 1);
      if (core !== null) {
        changes.push(addChange(changes.length + 1, afterText, core, added));
        addedCount += 1;
      }
    }
    at += added.length;
  }

  // ページの名前は本文に出ないので印を置けない。数には入れて、一覧に 1 行出す
  const title = titleChange(beforeHtml, afterHtml, changes.length + 1);
  if (title !== null) changes.push(title);

  // 空白の入れ替えだけで、足し引きが 1 件も立たないことがある。それは体裁だけの変更
  const identical = changes.length === 0;
  return { changes, identical, addedCount, removedCount, images, coarse: compared.coarse };
}
