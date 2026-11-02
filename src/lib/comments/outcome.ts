import { diffWordsWithSpace } from "diff";
import {
  OUTCOME_TEXT_MAX_LENGTH,
  type CommentOutcome,
  type OutcomeState,
  type PageVersion,
  type QuoteContext,
} from "./types";
import { htmlBodyText } from "../html/text";
import { condenseNeedle, condenseText, locateInText } from "../html/locate-text";
import { isVisibleOutcome, versionMarksMatch, type OutcomeSource } from "./outcome-rules";

export { changeTouchesOutcome, commentsOnVersion, isVisibleOutcome, versionMarksMatch, type OutcomeSource } from "./outcome-rules";

/**
 * コメントが付いたときの文と、そのあと直された文の突き合わせ。
 *
 * 画面が欲しいのは「当時何が書いてあって、誰がどんなコメントをいつ書いて、
 * 誰がいつ直して、いまどうなったか」。
 * 版の全文を並べても、引用した 1 か所の物語は読めない。ここで出すのは
 * **その引用が指していた箇所だけ**の、当時といま。直した人は、いまの版の
 * 書いた人ではなく、いま見えている状態になった最初の版の書いた人
 * （直されたならその直し、無くなったならその削除）。
 *
 * 計算は保存してある引用と、当時／いまの本文からその場で出す。
 * 直した版の目印をコメントに書き戻さない——書き戻すと、投稿とブラウザ編集の
 * 両方に同じ書き込みを足すことになり、片方を忘れると物語が嘘になる。
 * 本文の履歴は追記専用なので、当時の文はいつでも引き直せる。
 */

function clip(text: string, max: number): string {
  const trimmed = condenseNeedle(text);
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1)}…`;
}

function indexOfHtml(html: string): string {
  return condenseText(htmlBodyText(html));
}

/**
 * 当時の範囲 [from, to]（両端を含む）が、新しい本文のどこへ移ったか。
 *
 * 単語ごとの突き合わせで、当時の各文字がいまの何文字目に当たるかを追う。
 * 消えて何も残らなければ null（いまの文は無い）。
 */
function mapRange(
  before: string,
  after: string,
  from: number,
  to: number,
): { start: number; end: number } | null | undefined {
  // 長い原稿が大きく変わると、全文比較がサーバーを数分占有する。
  // 計算を打ち切った場合は「消えた」と推測せず、呼び手へ未判定を返す。
  const parts = diffWordsWithSpace(before, after, { timeout: 50, maxEditLength: 2048 });
  if (parts === undefined) return undefined;
  let b = 0;
  let a = 0;
  let mappedStart: number | null = null;
  let mappedEnd: number | null = null;

  const cover = (start: number, end: number): void => {
    if (mappedStart === null || start < mappedStart) mappedStart = start;
    if (mappedEnd === null || end > mappedEnd) mappedEnd = end;
  };

  for (const part of parts) {
    const value = part.value;
    const len = value.length;
    if (len === 0) continue;

    if (part.added === true) {
      // いまにだけある。当時のカーソルが引用の中にあれば、足された文も「いま」に含める
      if (b >= from && b <= to + 1) {
        cover(a, a + len - 1);
      }
      a += len;
      continue;
    }

    if (part.removed === true) {
      b += len;
      continue;
    }

    const segFrom = b;
    const segTo = b + len - 1;
    const overlapFrom = Math.max(segFrom, from);
    const overlapTo = Math.min(segTo, to);
    if (overlapFrom <= overlapTo) {
      const afterStart = a + (overlapFrom - segFrom);
      const afterEnd = a + (overlapTo - segFrom);
      cover(afterStart, afterEnd);
    }
    b += len;
    a += len;
  }

  if (mappedStart === null || mappedEnd === null) return null;
  return { start: mappedStart, end: mappedEnd };
}

function outcomeOfLocated(input: {
  commentId: string;
  quote: string;
  context: QuoteContext | null;
  beforeText: string;
  afterText: string;
  found: { from: number; to: number };
}): CommentOutcome {
  const thenText = clip(input.quote, OUTCOME_TEXT_MAX_LENGTH);

  // 同じ引用が、いまの本文にも同じ手がかりで残っている
  const still = locateInText(input.afterText, input.quote, null, input.context);
  if (still !== null) {
    const slice = input.afterText.slice(still.from, still.to + 1);
    if (condenseNeedle(slice) === condenseNeedle(input.quote)) {
      return bare({ commentId: input.commentId, state: "same", thenText, nowText: thenText });
    }
  }

  const mapped = mapRange(input.beforeText, input.afterText, input.found.from, input.found.to);
  if (mapped === undefined) return unknownOf(input.commentId, input.quote);
  if (mapped === null) {
    return bare({ commentId: input.commentId, state: "gone", thenText, nowText: null });
  }

  const nowRaw = input.afterText.slice(mapped.start, mapped.end + 1);
  const nowText = clip(nowRaw, OUTCOME_TEXT_MAX_LENGTH);
  if (nowText.length === 0) {
    return bare({ commentId: input.commentId, state: "gone", thenText, nowText: null });
  }
  if (nowText === thenText) {
    return bare({ commentId: input.commentId, state: "same", thenText, nowText });
  }
  return bare({ commentId: input.commentId, state: "changed", thenText, nowText });
}

function bare(
  outcome: Omit<CommentOutcome, "changedBy" | "changedAt">,
): CommentOutcome {
  return { ...outcome, changedBy: null, changedAt: null };
}

function unknownOf(commentId: string, quote: string): CommentOutcome {
  return bare({
    commentId,
    state: "unknown",
    thenText: clip(quote, OUTCOME_TEXT_MAX_LENGTH),
    nowText: null,
  });
}

function sameOf(commentId: string, quote: string): CommentOutcome {
  const thenText = clip(quote, OUTCOME_TEXT_MAX_LENGTH);
  return bare({ commentId, state: "same", thenText, nowText: thenText });
}

/**
 * 1 件の引用を、2 つの本文のあいだで突き合わせる。
 *
 * 本文を渡すので、保管庫にもネットワークにも繋がずに確かめられる。
 */
export function outcomeOfQuote(input: {
  commentId: string;
  quote: string;
  quoteContext: QuoteContext | null;
  beforeHtml: string;
  afterHtml: string;
}): CommentOutcome {
  const beforeText = indexOfHtml(input.beforeHtml);
  const afterText = indexOfHtml(input.afterHtml);
  if (beforeText === afterText) return sameOf(input.commentId, input.quote);

  const found = locateInText(beforeText, input.quote, null, input.quoteContext);
  if (found === null) return unknownOf(input.commentId, input.quote);

  return outcomeOfLocated({
    commentId: input.commentId,
    quote: input.quote,
    context: input.quoteContext,
    beforeText,
    afterText,
    found,
  });
}

/**
 * 渡された本文（版の目印 → HTML）から、引用つきコメントの物語を組み立てる。
 *
 * 返信は引用を持たないので出さない。引用の無い親も出さない。
 * 当時の版の本文が無いものは unknown。
 */
export function outcomesFromHtml(input: {
  comments: readonly OutcomeSource[];
  toVersion: string;
  htmlAt: ReadonlyMap<string, string>;
}): CommentOutcome[] {
  const afterHtml = htmlAtVersion(input.htmlAt, input.toVersion);
  const afterText = afterHtml === null ? null : indexOfHtml(afterHtml);
  const outcomes: CommentOutcome[] = [];

  for (const comment of input.comments) {
    if (comment.parentId !== null) continue;
    if (comment.quote === null || comment.quote.length === 0) continue;
    if (comment.pageVersion === null) continue;

    if (versionMarksMatch(comment.pageVersion, input.toVersion)) {
      outcomes.push(sameOf(comment.id, comment.quote));
      continue;
    }

    const beforeHtml = htmlAtVersion(input.htmlAt, comment.pageVersion);
    if (beforeHtml === null || afterHtml === null || afterText === null) {
      outcomes.push(unknownOf(comment.id, comment.quote));
      continue;
    }

    outcomes.push(
      outcomeOfQuote({
        commentId: comment.id,
        quote: comment.quote,
        quoteContext: comment.quoteContext,
        beforeHtml,
        afterHtml,
      }),
    );
  }

  return outcomes;
}

function htmlAtVersion(htmlAt: ReadonlyMap<string, string>, version: string): string | null {
  const exact = htmlAt.get(version);
  if (exact !== undefined) return exact;
  for (const [key, html] of htmlAt) {
    if (versionMarksMatch(key, version)) return html;
  }
  return null;
}

/**
 * コメントの版より新しく、突き合わせ先までの版。古い順。
 *
 * 並びは履歴と同じ新しい順で受け、返すときだけ古い順にする。
 * 当時の版が一覧に無ければ空（窓の外の版まで推測しない）。
 */
export function versionsAfterComment(
  versions: readonly PageVersion[],
  fromSha: string,
  toSha: string,
): PageVersion[] {
  const toIndex = versions.findIndex((version) => versionMarksMatch(version.sha, toSha));
  const fromIndex = versions.findIndex((version) => versionMarksMatch(version.sha, fromSha));
  if (toIndex < 0 || fromIndex < 0 || toIndex >= fromIndex) return [];
  return versions.slice(toIndex, fromIndex).reverse();
}

/**
 * 引用が初めて変わった版の書いた人と時刻を、物語へ載せる。
 *
 * いまの版の書いた人をそのまま使わない。あとに無関係な直しが乗っていると、
 * 指摘へ応えた人ではない名前が「いま」の横に出る。
 * 本文が要る版だけ `readHtml` で取り、一度読んだものは htmlAt に残す。
 */
export async function withChangeAttribution(input: {
  outcomes: readonly CommentOutcome[];
  comments: readonly OutcomeSource[];
  versions: readonly PageVersion[];
  toVersion: string;
  htmlAt: Map<string, string>;
  readHtml: (sha: string) => Promise<string | null>;
}): Promise<CommentOutcome[]> {
  const byId = new Map(input.comments.map((comment) => [comment.id, comment]));
  const next: CommentOutcome[] = [];

  for (const outcome of input.outcomes) {
    if (!isVisibleOutcome(outcome.state)) {
      next.push(outcome);
      continue;
    }
    const comment = byId.get(outcome.commentId);
    if (comment === undefined || comment.pageVersion === null || comment.quote === null) {
      next.push(outcome);
      continue;
    }
    const attributed = await attributeOne({
      outcome,
      comment,
      versions: input.versions,
      toVersion: input.toVersion,
      htmlAt: input.htmlAt,
      readHtml: input.readHtml,
    });
    next.push(attributed);
  }
  return next;
}

async function attributeOne(input: {
  outcome: CommentOutcome;
  comment: OutcomeSource;
  versions: readonly PageVersion[];
  toVersion: string;
  htmlAt: Map<string, string>;
  readHtml: (sha: string) => Promise<string | null>;
}): Promise<CommentOutcome> {
  const fromSha = input.comment.pageVersion;
  const quote = input.comment.quote;
  if (fromSha === null || quote === null) return input.outcome;

  const beforeHtml = await htmlOf(fromSha, input.htmlAt, input.readHtml);
  if (beforeHtml === null) return input.outcome;

  const chain = versionsAfterComment(input.versions, fromSha, input.toVersion);
  if (chain.length === 0) return input.outcome;

  const hit = await firstMatchingVersion({
    commentId: input.comment.id,
    quote,
    quoteContext: input.comment.quoteContext,
    beforeHtml,
    chain,
    target: input.outcome.state,
    htmlAt: input.htmlAt,
    readHtml: input.readHtml,
  });
  if (hit === null) return input.outcome;
  return { ...input.outcome, changedBy: hit.authorName, changedAt: hit.committedAt };
}

/**
 * いま見えている状態（changed / gone）になった最初の版。
 *
 * 「同じでなくなった最初」ではない。一度直したあとに消された文は、
 * 直した人ではなく消した人を「いま」の横に出す。
 *
 * 古い順に歩く。二分探索にしないのは、直して戻してまた直すと
 * 状態が単調にならないため（途中の版を飛ばして、あとの人に付く）。
 * 本文が読めない版は飛ばす（その版で変わったかは分からないので、
 * 分かる範囲の最初を出す）。
 */
async function firstMatchingVersion(input: {
  commentId: string;
  quote: string;
  quoteContext: QuoteContext | null;
  beforeHtml: string;
  chain: readonly PageVersion[];
  target: OutcomeState;
  htmlAt: Map<string, string>;
  readHtml: (sha: string) => Promise<string | null>;
}): Promise<PageVersion | null> {
  for (const version of input.chain) {
    const html = await htmlOf(version.sha, input.htmlAt, input.readHtml);
    if (html === null) continue;
    if (stateAt(input, html) === input.target) return version;
  }
  return null;
}

function stateAt(
  input: {
    commentId: string;
    quote: string;
    quoteContext: QuoteContext | null;
    beforeHtml: string;
  },
  afterHtml: string,
): OutcomeState {
  return outcomeOfQuote({
    commentId: input.commentId,
    quote: input.quote,
    quoteContext: input.quoteContext,
    beforeHtml: input.beforeHtml,
    afterHtml,
  }).state;
}

async function htmlOf(
  sha: string,
  htmlAt: Map<string, string>,
  readHtml: (sha: string) => Promise<string | null>,
): Promise<string | null> {
  const held = htmlAtVersion(htmlAt, sha);
  if (held !== null) return held;
  const fetched = await readHtml(sha);
  if (fetched !== null) htmlAt.set(sha, fetched);
  return fetched;
}
