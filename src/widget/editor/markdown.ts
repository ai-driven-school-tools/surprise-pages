/**
 * ブロック 1 つぶんの「マークダウン風の書き方」と HTML の行き来。
 *
 * ページの正本は任意の HTML（Tailwind のクラス・SVG・独自の飾りを含む）で、
 * マークダウンでは表しきれない。だからここは**ページ全体を変換しない**。
 * 変換するのは、人が押した 1 ブロックの中身（インラインの並び）だけで、
 * 押していないブロックには 1 文字も触らない。
 *
 * マークダウンで表せないインラインの飾り（class 付きの span・アイコン・画像など）は、
 * **HTML のまま文中に置く**。これはマークダウンそのものの決まり（インライン HTML）で、
 * こちらで消したり作り替えたりしない——往復しても 1 バイトも変わらないことが、
 * 「編集した覚えのない飾りが崩れない」ことの根拠になる。
 *
 * 対応する書き方（ブロックの中だけ）:
 *   **強い**    ↔ <strong>強い</strong>
 *   *斜め*      ↔ <em>斜め</em>
 *   `code`      ↔ <code>code</code>
 *   [文](url)   ↔ <a href="url">文</a>
 *   改行        ↔ <br>
 *   空行        …  ブロックの区切り（同じタグ・同じ属性で分かれる）
 *   <span …>…   …  そのまま通す（マークダウンのインライン HTML）
 *
 * ここには DOM を作る処理を置かない（文字列と、渡された要素を読むだけ）。
 * 検査表（tests/checks/check-page-edit.mjs）が jsdom の上で往復を確かめる。
 */

/**
 * 押して直せるブロックのタグ。**文章のかたまり**だけを挙げる。
 *
 * div や section を入れないのは、あれが「文章」ではなく「構え」だから。
 * 構えごと文字列にすると、Tailwind のクラスで組んだ格子や図が
 * マークダウン風の 1 枚のテキストに化けて、直すどころか壊す道具になる。
 */
export const EDITABLE_TAGS = [
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "p",
  "li",
  "blockquote",
  "figcaption",
  "dt",
  "dd",
  "td",
  "th",
] as const;

/**
 * 中に居たら「このブロックは押せない」と判断する、かたまりのタグ。
 *
 * 例: 中に <ul> を抱えた <li> を丸ごとテキストにすると、入れ子の一覧が
 * 1 行に潰れる。そういうブロックは外側を押せなくし、中の <li> を 1 つずつ押させる。
 */
export const CONTAINER_TAGS = [
  "address",
  "article",
  "aside",
  "blockquote",
  "canvas",
  "details",
  "div",
  "dl",
  "fieldset",
  "figure",
  "footer",
  "form",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "header",
  "hr",
  "iframe",
  "main",
  "nav",
  "ol",
  "p",
  "pre",
  "section",
  "table",
  "ul",
  "video",
] as const;

const CONTAINER_SELECTOR = CONTAINER_TAGS.join(",");

/**
 * ブロックの中に置けないタグ。かたまりを作るもの+ページの仕掛けになるもの。
 *
 * div を p の中に入れると、次にページ全体を読んだときにブラウザが木を組み替え、
 * ブロックの数え上げがずれる。script などの仕掛けは、この画面の守備範囲の外
 * （足すなら取り寄せて投稿で）。
 */
export const FORBIDDEN_IN_BLOCK = [
  ...CONTAINER_TAGS,
  "script",
  "style",
  "link",
  "meta",
  "base",
  "object",
  "embed",
] as const;

const FORBIDDEN_IN_BLOCK_RE = new RegExp(`</?\\s*(${FORBIDDEN_IN_BLOCK.join("|")})\\b`, "i");

/**
 * 直した中身（inlineHtmlOf の結果）に、置けないタグが混ざっていないか。
 * 見つけたらタグ名を返す。
 *
 * 判定は生成後の HTML に対する正規表現。エスケープされた `&lt;div` は
 * 引っかからない（生の `<` だけを見る）——人が「div と書いた」だけの文を
 * 仕掛けと取り違えないため。
 */
export function forbiddenTagIn(html: string): string | null {
  const found = FORBIDDEN_IN_BLOCK_RE.exec(html);
  if (found === null) return null;
  const name = found[1];
  if (name === undefined) return null;
  return name.toLowerCase();
}

/** ここの中身には手を出さない（文章ではない）。 */
const OPAQUE_SELECTOR = "script,style,svg,template";

/**
 * その要素は、押して直せるブロックか。
 *
 * 3 つとも満たしたときだけ:
 *   1. タグが文章のかたまり（EDITABLE_TAGS）
 *   2. 中にかたまりを抱えていない（入れ子の一覧・表・図を潰さない）
 *   3. script / style / svg / template の中に居ない
 */
export function isEditableBlock(element: Element): boolean {
  const tag = element.tagName.toLowerCase();
  if (!EDITABLE_TAGS.some((known) => known === tag)) return false;
  if (element.querySelector(CONTAINER_SELECTOR) !== null) return false;
  if (element.closest(OPAQUE_SELECTOR) !== null) return false;
  return true;
}

/**
 * 本文（body）の中の、押して直せるブロックを文書の並び順で全部挙げる。
 *
 * **正本の木とプレビューの木の両方が、同じこの関数で数える。** 2 つの木は同じ
 * 本文から作られるので、同じ数え方をすれば 1 対 1 に並ぶ（並びで対応を取る）。
 */
export function collectEditableBlocks(body: Element): Element[] {
  const found: Element[] = [];
  for (const element of body.querySelectorAll(EDITABLE_TAGS.join(","))) {
    if (isEditableBlock(element)) found.push(element);
  }
  return found;
}

// ---------------------------------------------------------------------------
// HTML → マークダウン風（ブロックの中身を、人が直せる文字列にする）
// ---------------------------------------------------------------------------

/**
 * 文中の文字を、マークダウン風の記号と取り違えられない形にする。
 *
 * 逃がすのは書き方に使う 5 つだけ（\ ` * [ <）。逃がさないと、本文に元から
 * ある `*印*` が、一度開いて閉じただけで斜体に化ける。
 */
function escapeText(text: string): string {
  return text.replace(/[\\`*[<]/g, (mark) => `\\${mark}`);
}

/**
 * 整形のための空白（HTML の中の改行・字下げ）を 1 つの空白に畳む。
 *
 * ブラウザが本文を描くときと同じ扱い。畳まずに出すと、書いた道具が入れた
 * 整形の改行が、直す画面では「意図した改行」に見える——そのまま戻すと
 * `<br>` に化けたり、空行と数えられてブロックが割れたりする。
 * 折り返しを止める空白（nbsp）は畳まない（あれは見た目に効いている）。
 */
function collapseWhitespace(text: string): string {
  return text.replace(/[ \t\r\n]+/g, " ");
}

/** 属性を 1 つも持たない要素だけ、マークダウンの記号に畳んでよい。 */
function hasNoAttributes(element: Element): boolean {
  return element.attributes.length === 0;
}

/** <a> をマークダウンに畳んでよいか（href 以外の属性が無く、行き先が壊れない形）。 */
function isPlainLink(element: Element): boolean {
  if (element.attributes.length !== 1) return false;
  const href = element.getAttribute("href");
  // 丸かっこと空白が混ざった行き先は [文](url) の形に安全に入らない。HTML のまま通す
  return href !== null && href.length > 0 && !/[()\s]/.test(href);
}

/** <code> の中身。書き方の記号を含んでいたら畳めない（` で挟めない）。 */
function plainCodeText(element: Element): string | null {
  const text = element.textContent ?? "";
  if (text.includes("`") || text.includes("\n")) return null;
  return text;
}

/**
 * 素の強調・斜めを `**` / `*` に畳んでよいか。
 *
 * 迷ったら HTML のまま。畳むと往復で形が変わるケース:
 *   1. 中身が空（`****` は消える）
 *   2. 中身の端が `*`（入れ子 `<strong><em>x</em></strong>` → `***x***` は戻すと向きが変わる）
 *   3. これまでの出力の末尾が `*`（隣接 `<strong>a</strong><em>b</em>` → `**a***b*`。
 *      jsdom 実測で戻すと `<strong>a*</strong>b*` に化ける）
 */
function foldable(inner: string, before: string): boolean {
  if (inner.length === 0) return false;
  if (inner.startsWith("*") || inner.endsWith("*")) return false;
  if (before.endsWith("*")) return false;
  return true;
}

/**
 * ブロックの中身を、マークダウン風の 1 枚のテキストにする。
 *
 * 畳めるのは**素の**（属性を持たない）strong / b / em / i / code と、
 * href だけの <a>、それに素の <br>（改行になる）。それ以外の要素は outerHTML のまま
 * 文中に置く——消さない・作り替えない（インライン HTML として、そのまま返ってくる）。
 *
 * 端の空白は落として返す（HTML の整形の字下げの名残で、見た目には出ていない）。
 */
export function blockToMarkdown(block: Element): string {
  return inlineMarkdownOf(block).trim();
}

/** 中身を再帰で畳む（端の空白は落とさない。強調の中の空白は意味を持つ）。 */
function inlineMarkdownOf(block: Element): string {
  let out = "";
  for (const node of block.childNodes) {
    if (node instanceof Text) {
      out += escapeText(collapseWhitespace(node.textContent ?? ""));
      continue;
    }
    // 注記（コメント）はそのまま通す
    if (node instanceof Comment) {
      out += `<!--${node.data}-->`;
      continue;
    }
    if (!(node instanceof Element)) continue;

    const element = node;
    const tag = element.tagName.toLowerCase();

    // 畳んでよいのは**素の** <br> だけ。class 付き（md:hidden で畳む折り返し等）を
    // 改行に均すと、属性ごと消えて見た目が変わる。あれは HTML のまま通す
    if (tag === "br" && hasNoAttributes(element)) {
      out += "\n";
      continue;
    }
    if ((tag === "strong" || tag === "b") && hasNoAttributes(element)) {
      const inner = inlineMarkdownOf(element);
      if (foldable(inner, out)) {
        out += `**${inner}**`;
        continue;
      }
    }
    if ((tag === "em" || tag === "i") && hasNoAttributes(element)) {
      const inner = inlineMarkdownOf(element);
      if (foldable(inner, out)) {
        out += `*${inner}*`;
        continue;
      }
    }
    if (tag === "code" && hasNoAttributes(element)) {
      const text = plainCodeText(element);
      if (text !== null) {
        out += `\`${text}\``;
        continue;
      }
    }
    if (tag === "a" && isPlainLink(element)) {
      const inner = inlineMarkdownOf(element);
      // 角かっこが入れ子になる文は [文](url) に安全に入らない。HTML のまま通す
      if (!inner.includes("[") && !inner.includes("]")) {
        out += `[${inner}](${element.getAttribute("href") ?? ""})`;
        continue;
      }
    }

    // 畳めないものは HTML のまま（class 付きの span・アイコン・画像・入れ子の飾り）
    out += element.outerHTML;
  }
  return out;
}

// ---------------------------------------------------------------------------
// マークダウン風 → HTML（直した文字列を、ブロックの中身に戻す）
// ---------------------------------------------------------------------------

/** HTML に混ぜてよい形へ逃がす（テキストとして出す部分に使う）。 */
function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** タグの始まりに見えるか。`<3` のようなただの文字と見分ける。 */
const TAG_OPEN = /^<(\/?)([a-zA-Z][a-zA-Z0-9-]*)((?:"[^"]*"|'[^']*'|[^"'>])*)>/;

/** 閉じタグの要らないタグ（そのまま 1 つで通す）。 */
const VOID_TAGS = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "source",
  "track",
  "wbr",
]);

/**
 * 文中の生の HTML を、開いた位置から丸ごと 1 かたまりで切り出す。
 *
 * 同じタグの入れ子（span の中の span）を数えながら、対の閉じタグまで進む。
 * 対が見つからなければ null（呼び出し側はただの文字として逃がす）。
 * かたまりの**中身には手を出さない**——マークダウンの記号が入っていても解釈しない。
 * ここで解釈すると、往復のたびに飾りの中の文字が化ける。
 */
function rawHtmlAt(text: string, at: number): string | null {
  const open = TAG_OPEN.exec(text.slice(at));
  if (open === null || open[1] === "/") return null;

  const tag = open[2].toLowerCase();
  const selfClosed = /\/\s*>$/.test(open[0]);
  if (VOID_TAGS.has(tag) || selfClosed) return open[0];

  /*
   * コメントの中の同名タグ（`<!-- </span> -->`）は開閉として数えない。
   * 数えると、かたまりを早く閉じて残りがただの文字になる。
   */
  const comments: Array<{ start: number; end: number }> = [];
  let search = 0;
  while (search < text.length) {
    const start = text.indexOf("<!--", search);
    if (start === -1) break;
    const close = text.indexOf("-->", start + 4);
    if (close === -1) break;
    comments.push({ start, end: close + 3 });
    search = close + 3;
  }

  let depth = 1;
  const step = new RegExp(`<(/?)${tag}(?=[\\s>/])((?:"[^"]*"|'[^']*'|[^"'>])*)>`, "gi");
  step.lastIndex = at + open[0].length;
  for (let found = step.exec(text); found !== null; found = step.exec(text)) {
    const insideComment = comments.some((span) => found.index >= span.start && found.index < span.end);
    if (insideComment) continue;
    if (found[1] === "/") depth -= 1;
    else if (!/\/\s*>$/.test(found[0])) depth += 1;
    if (depth === 0) return text.slice(at, found.index + found[0].length);
  }
  return null;
}

/** 注記（<!-- … -->）を丸ごと切り出す。 */
function rawCommentAt(text: string, at: number): string | null {
  if (!text.startsWith("<!--", at)) return null;
  const close = text.indexOf("-->", at + 4);
  if (close === -1) return null;
  return text.slice(at, close + 3);
}

/** その位置から、挟む記号（** または *）で閉じられる中身を探す。 */
function spanUntil(text: string, from: number, mark: string): number {
  let cursor = from;
  while (cursor < text.length) {
    if (text[cursor] === "\\") {
      cursor += 2;
      continue;
    }
    if (text.startsWith(mark, cursor)) {
      /*
       * ** を探している最中に *** が並んでいたら、先頭の 1 つは中身
       * （斜めの閉じ）に譲り、後ろの 2 つを閉じと見る。こうしないと
       * **とても*強い*** が「とても*強」で閉じて、入れ子が割れる。
       */
      if (mark === "**" && text[cursor + 2] === "*") return cursor + 1;
      return cursor;
    }
    if (text[cursor] === "\n") return -1;
    cursor += 1;
  }
  return -1;
}

/** [文](url) の形をその位置から読む。読めなければ null。 */
function linkAt(text: string, at: number): { label: string; href: string; length: number } | null {
  if (text[at] !== "[") return null;
  const close = spanUntil(text, at + 1, "]");
  if (close === -1) return null;
  if (text[close + 1] !== "(") return null;
  const end = text.indexOf(")", close + 2);
  if (end === -1) return null;
  const href = text.slice(close + 2, end);
  if (href.length === 0 || /\s/.test(href)) return null;
  return { label: text.slice(at + 1, close), href, length: end + 1 - at };
}

/** 行き先を属性に入れてよい形へ逃がす。 */
function escapeAttr(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}

/**
 * マークダウン風の 1 枚のテキストを、ブロックの中身（インライン HTML）に戻す。
 *
 * 生の HTML はそのまま通し、それ以外を記号として読む。読み切れない記号
 * （閉じられていない ** など）は、記号ではなくただの文字として出す——
 * 黙って捨てると、打ちかけの文が保存で消える。
 */
export function inlineHtmlOf(markdown: string): string {
  let out = "";
  let at = 0;

  while (at < markdown.length) {
    const char = markdown[at];

    if (char === "\\" && at + 1 < markdown.length) {
      out += escapeHtml(markdown[at + 1]);
      at += 2;
      continue;
    }

    if (char === "\n") {
      out += "<br>";
      at += 1;
      continue;
    }

    if (char === "`") {
      const close = markdown.indexOf("`", at + 1);
      if (close !== -1 && !markdown.slice(at + 1, close).includes("\n")) {
        out += `<code>${escapeHtml(markdown.slice(at + 1, close))}</code>`;
        at = close + 1;
        continue;
      }
    }

    if (markdown.startsWith("**", at)) {
      const close = spanUntil(markdown, at + 2, "**");
      if (close !== -1 && close > at + 2) {
        out += `<strong>${inlineHtmlOf(markdown.slice(at + 2, close))}</strong>`;
        at = close + 2;
        continue;
      }
    }

    if (char === "*") {
      const close = spanUntil(markdown, at + 1, "*");
      if (close !== -1 && close > at + 1) {
        out += `<em>${inlineHtmlOf(markdown.slice(at + 1, close))}</em>`;
        at = close + 1;
        continue;
      }
    }

    if (char === "[") {
      const link = linkAt(markdown, at);
      if (link !== null) {
        out += `<a href="${escapeAttr(link.href)}">${inlineHtmlOf(link.label)}</a>`;
        at += link.length;
        continue;
      }
    }

    if (char === "<") {
      const comment = rawCommentAt(markdown, at);
      if (comment !== null) {
        out += comment;
        at += comment.length;
        continue;
      }
      const raw = rawHtmlAt(markdown, at);
      if (raw !== null) {
        out += raw;
        at += raw.length;
        continue;
      }
    }

    out += escapeHtml(char);
    at += 1;
  }

  return out;
}

/**
 * 直した 1 枚のテキストを、ブロックの並びに割る。
 *
 * 空行（改行 2 つ）が区切り。「段落を書き足す」は、押したブロックの中で
 * 空行を打つだけでよい——足した段落は元のブロックと同じタグ・同じ属性で作られるので、
 * Tailwind で組まれたページでも見た目が揃う（素の <p> を混ぜて浮かせない）。
 *
 * 全部消したら空の並び（＝そのブロックを取り除く合図）。
 */
export function splitBlocks(markdown: string): string[] {
  const parts = markdown
    .split(/\n[ \t]*\n+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  return parts;
}
