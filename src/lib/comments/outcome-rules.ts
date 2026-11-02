import type { CommentOutcome, OutcomeState, PageComment, RedlineChange } from "./types";
import { condenseNeedle } from "../html/locate-text";

/**
 * コメントの成り行きの小さな判定（版の目印の突き合わせ・その版に付いたコメント・赤入れが触れたか・出す相手か）。
 * 本文を読む計算（src/lib/comments/outcome.ts）から切り出してある——道具箱はこの判定だけを使い、本文を読む部品
 * （HTML の読み取り・スライドの見本）を最初の読み込みに連れてこないため（docs/design/app-speed.md の「道具箱の部品を分ける」）。
 * 呼ぶ側はこれまでどおり src/lib/comments/outcome.ts からも読める。
 */

/** 突き合わせに使うコメントの形。画面の PageComment より狭い。 */
export type OutcomeSource = Pick<
  PageComment,
  "id" | "parentId" | "quote" | "quoteContext" | "pageVersion"
>;

/** 版の目印が同じか。短い桁（画面の 7 桁）でも、長いほうの頭と一致すれば同じ。 */
export function versionMarksMatch(held: string | null, sha: string): boolean {
  if (held === null || held.length === 0 || sha.length === 0) return false;
  const a = held.toLowerCase();
  const b = sha.toLowerCase();
  if (a === b) return true;
  const short = a.length <= b.length ? a : b;
  const long = a.length <= b.length ? b : a;
  return short.length >= 7 && long.startsWith(short);
}

/**
 * その版に付いた（＝その版を見て書かれた）親コメント。
 *
 * 履歴で「この版のときに付いていたコメント」を並べるときに使う。
 */
export function commentsOnVersion(
  comments: readonly OutcomeSource[],
  versionSha: string,
): OutcomeSource[] {
  return comments.filter(
    (comment) =>
      comment.parentId === null &&
      comment.quote !== null &&
      comment.quote.length > 0 &&
      versionMarksMatch(comment.pageVersion, versionSha),
  );
}

/**
 * 赤入れ 1 か所が、そのコメントの物語に触れているか。
 *
 * 消した文は当時の引用と、足した文はいまの文と突き合わせる。
 * 片方に含まれていれば、その箇所の直しだとみなす。
 */
export function changeTouchesOutcome(change: RedlineChange, outcome: CommentOutcome): boolean {
  const text = condenseNeedle(change.text);
  if (text.length === 0) return false;
  const thenText = condenseNeedle(outcome.thenText);
  const nowText = outcome.nowText === null ? "" : condenseNeedle(outcome.nowText);

  if (change.kind === "del") {
    return thenText.length > 0 && (thenText.includes(text) || text.includes(thenText));
  }
  if (change.kind === "add") {
    return nowText.length > 0 && (nowText.includes(text) || text.includes(nowText));
  }
  return false;
}

/** 画面が物語を出す相手か。same / unknown は出さない（出しても情報が増えない）。 */
export function isVisibleOutcome(state: OutcomeState): boolean {
  return state === "changed" || state === "gone";
}
