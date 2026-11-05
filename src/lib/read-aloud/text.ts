/** 読み上げる本文の境界と、声にしないもの。ブラウザの DOM から字を集めるときの決まり（DOM にも声にも触らない）。 */
export const READ_ALOUD_BLOCK_TAGS: readonly string[] = [
  "h1", "h2", "h3", "h4", "h5", "h6", "p", "li", "blockquote", "td", "th", "dt", "dd", "figcaption", "summary",
  "div", "section", "article", "header", "footer", "main", "aside", "nav", "ul", "ol", "table", "thead", "tbody", "tr", "figure", "dl", "hr", "form", "fieldset",
];
export const READ_ALOUD_BLOCKS = READ_ALOUD_BLOCK_TAGS.join(",");

const SILENT_TAGS = new Set(["pre", "svg", "script", "style", "noscript", "template"]);

/** 絵・コード・非表示の注記・道具の表示・出典・取り消しは、その中の字も声にしない。 */
export function isReadAloudSilent(tagName: string, getAttribute: (name: string) => string | null): boolean {
  return SILENT_TAGS.has(tagName)
    || getAttribute("hidden") !== null
    || getAttribute("aria-hidden") === "true"
    || getAttribute("data-clean-copy-ui") !== null
    || getAttribute("data-source-note") !== null
    || (tagName === "del" && getAttribute("data-surprise-redline") !== null);
}

/** 文字の並びの中の 1 区間。end は含まない。 */
export interface Span { start: number; end: number }

/** 文の終わりに続けて閉じてよい括弧。文末の句点と離さない。 */
const CLOSERS = "」』）)】］]〉》”’";
const ENDERS = "。！？!?";

/**
 * 文ごとの区間に分ける。
 *
 * 読み上げは 1 文ずつ声に渡す（長い 1 本を渡すと途中で切れるブラウザがあり、
 * いま読んでいる場所も 1 文の細かさで示せなくなる）。空白だけの区間は返さない。
 */
export function sentenceSpans(text: string): Span[] {
  const spans: Span[] = [];
  let start = 0;
  const push = (end: number): void => {
    let from = start;
    let to = end;
    while (from < to && /\s/.test(text.charAt(from))) from++;
    while (to > from && /\s/.test(text.charAt(to - 1))) to--;
    if (to > from) spans.push({ start: from, end: to });
    start = end;
  };
  for (let i = 0; i < text.length; i++) {
    const ch = text.charAt(i);
    if (ch === "\n") { push(i + 1); continue; }
    if (!ENDERS.includes(ch)) continue;
    let end = i + 1;
    while (end < text.length && (ENDERS.includes(text.charAt(end)) || CLOSERS.includes(text.charAt(end)))) end++;
    push(end);
    i = end - 1;
  }
  push(text.length);
  return spans;
}
