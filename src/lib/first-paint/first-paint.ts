/**
 * 本文を描く前の待ちを外す、配信時の差し込み（純粋な計算だけ）。
 *
 * 実在ページの計測（docs/design/page-loading.md）で、本文が出るのを止めていたのは
 * サーバーではなく 2 つの読み込みだった。
 *
 *   1. 見た目の指定を作る道具（Tailwind）… 読んで実行し終わるまで字の形が決まらない
 *   2. 書体の指定（Google Fonts の CSS）… 展開後 400KB 台。届くまで描画が止まる
 *
 * どちらも**保管庫の HTML は 1 バイトも変えず**、配るときだけ付け替える。
 *
 * **道具は消さない。** 先に出来上がった指定（CSS）を置き、道具本体は描画のあとで読む。
 * 「使う分だけ書き出して削ると、新しいクラスを使った瞬間に黙って崩れる」（AGENTS.md）を
 * 避けるため——あとからスクリプトが足したクラスは、今までどおり道具が拾う。
 *
 * **ここには外の世界に触る部品を置かない**（src/lib/pages/content.ts と同じ理由）。
 * 指定を実際に作るのは src/lib/first-paint/delivery.ts。
 */

import { FIRST_PAINT_MARK } from "./mark";

/** 差し込んだ要素の目印。保存される本文に焼き付いたら断る（src/lib/html/check.ts）。 */
export { FIRST_PAINT_MARK };

/** 差し込みの形を変えたら上げる。指定の控えの鍵に入る。 */
export const FIRST_PAINT_STAMP = "fp1";

const BODY_OPEN = /<body\b/i;

// ---------------------------------------------------------------------------
// 設定の読み取り（実行しない）
// ---------------------------------------------------------------------------

export type LiteralValue = string | number | boolean | null | LiteralValue[] | { [key: string]: LiteralValue };

const MAX_CONFIG_CHARS = 20_000;
const MAX_DEPTH = 12;
/** 継承の仕組みに触れる名前。設定の鍵として受けない。 */
const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);

/**
 * 値だけでできた JavaScript の書き方（オブジェクト・配列・文字列・数・真偽・null）を読む。
 *
 * **ページの中のコードをサーバーで実行しない**ための読み取り器。関数・変数・式・
 * テンプレート文字列など、値でないものが 1 つでも出たら null（呼び出し側は今までどおり配る）。
 * 注釈と末尾のカンマは読み飛ばす。
 */
export function parseLiteral(source: string): LiteralValue | undefined {
  if (source.length > MAX_CONFIG_CHARS) return undefined;
  let at = 0;
  const fail = new Error("not a literal");

  const skip = (): void => {
    for (;;) {
      while (at < source.length && /\s/.test(source[at])) at += 1;
      if (source.startsWith("//", at)) {
        const end = source.indexOf("\n", at);
        at = end < 0 ? source.length : end + 1;
      } else if (source.startsWith("/*", at)) {
        const end = source.indexOf("*/", at + 2);
        if (end < 0) throw fail;
        at = end + 2;
      } else return;
    }
  };

  const string = (): string => {
    const quote = source[at];
    at += 1;
    let out = "";
    for (;;) {
      if (at >= source.length) throw fail;
      const ch = source[at];
      if (ch === quote) { at += 1; return out; }
      if (ch === "\n") throw fail;
      if (ch === "\\") {
        const next = source[at + 1];
        // 読めるのは引用符と \\ の素直な逃がしだけ。それ以外の形は値と見なさない
        if (next !== "'" && next !== '"' && next !== "\\") throw fail;
        out += next;
        at += 2;
      } else { out += ch; at += 1; }
    }
  };

  const value = (depth: number): LiteralValue => {
    if (depth > MAX_DEPTH) throw fail;
    skip();
    const ch = source[at];
    if (ch === "'" || ch === '"') return string();
    if (ch === "{") {
      at += 1;
      const out: { [key: string]: LiteralValue } = {};
      for (;;) {
        skip();
        if (source[at] === "}") { at += 1; return out; }
        let key: string;
        if (source[at] === "'" || source[at] === '"') key = string();
        else {
          const found = /^[A-Za-z_$][\w$]*/.exec(source.slice(at, at + 200)) ?? /^\d+/.exec(source.slice(at, at + 40));
          if (found === null) throw fail;
          key = found[0];
          at += key.length;
        }
        if (FORBIDDEN_KEYS.has(key)) throw fail;
        skip();
        if (source[at] !== ":") throw fail;
        at += 1;
        Object.defineProperty(out, key, { value: value(depth + 1), enumerable: true, writable: true, configurable: true });
        skip();
        if (source[at] === ",") at += 1;
        else if (source[at] !== "}") throw fail;
      }
    }
    if (ch === "[") {
      at += 1;
      const out: LiteralValue[] = [];
      for (;;) {
        skip();
        if (source[at] === "]") { at += 1; return out; }
        out.push(value(depth + 1));
        skip();
        if (source[at] === ",") at += 1;
        else if (source[at] !== "]") throw fail;
      }
    }
    const word = /^(?:true|false|null)\b/.exec(source.slice(at, at + 6));
    if (word !== null) {
      at += word[0].length;
      return word[0] === "null" ? null : word[0] === "true";
    }
    const number = /^-?(?:\d+\.?\d*|\.\d+)(?![\w$.])/.exec(source.slice(at, at + 40));
    if (number !== null) {
      at += number[0].length;
      return Number(number[0]);
    }
    throw fail;
  };

  try {
    const out = value(0);
    skip();
    if (source[at] === ";") { at += 1; skip(); }
    return at === source.length ? out : undefined;
  } catch {
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// 見た目の指定を先に作れるページか
// ---------------------------------------------------------------------------

/** 設定のうち、値だけで書けて、指定を作る結果にだけ効くもの。ほか（plugins など）が出たら手を出さない。 */
const CONFIG_KEYS = new Set(["theme", "darkMode", "important", "prefix", "separator", "corePlugins", "safelist", "blocklist"]);

export type TailwindConfig = { [key: string]: LiteralValue };

export type TailwindPlan = {
  /** 付け替える script タグそのもの（配信時に自前の行き先へ付け替えたあとの形） */
  tag: string;
  /** 道具の行き先（印つき） */
  src: string;
  config: TailwindConfig;
};

const VENDOR_TAILWIND_TAG = /<script\b([^>]*?)\bsrc="(\/vendor\/tailwind\.js\/[0-9a-z]+)"([^>]*)><\/script>/gi;
const INLINE_SCRIPT = /<script\b(?![^>]*\bsrc\s*=)([^>]*)>([\s\S]*?)<\/script\s*>/gi;
const CONFIG_ASSIGNMENT = /^tailwind\s*\.\s*config\s*=/;

function stripLeadingComments(source: string): string {
  let rest = source.trimStart();
  for (;;) {
    if (rest.startsWith("//")) {
      const end = rest.indexOf("\n");
      rest = end < 0 ? "" : rest.slice(end + 1).trimStart();
    } else if (rest.startsWith("/*")) {
      const end = rest.indexOf("*/");
      if (end < 0) return rest;
      rest = rest.slice(end + 2).trimStart();
    } else return rest;
  }
}

/**
 * 見た目の指定を先に作ってよいページなら、その材料。だめなら null（今までどおり配る）。
 *
 * **確かめられる形だけを通す。** 通すのは次の全部が成り立つときだけ:
 *   - 自前で配る道具（版の付かない行き先から付け替えたもの）が、head の中にちょうど 1 つ
 *   - その script に src 以外の指定が無い（defer などを書いた人の意図を変えない）
 *   - 道具に渡す独自の CSS（`type="text/tailwindcss"`）が無い
 *   - 道具に触れるインラインのスクリプトは、値だけでできた `tailwind.config = {…}` が
 *     あっても 1 つだけ（関数・plugins・あとからの書き換えがあれば手を出さない）
 */
export function tailwindPlan(html: string): TailwindPlan | null {
  const tags = [...html.matchAll(VENDOR_TAILWIND_TAG)];
  if (tags.length !== 1) return null;
  const [tag, before, src, after] = tags[0];
  if (before.trim() !== "" || after.trim() !== "") return null;
  const body = BODY_OPEN.exec(html);
  if (body !== null && (tags[0].index ?? 0) > body.index) return null;
  if (/text\/tailwindcss/i.test(html)) return null;

  let config: TailwindConfig = {};
  let seen = 0;
  for (const found of html.matchAll(INLINE_SCRIPT)) {
    const code = found[2];
    if (!code.includes("tailwind")) continue;
    // JSON の入れ物など、実行されないものは道具に触れない
    if (/\btype\s*=\s*["']?(?!text\/javascript|module)[^"'\s>]+/i.test(found[1])) continue;
    seen += 1;
    if (seen > 1) return null;
    const rest = stripLeadingComments(code);
    const head = CONFIG_ASSIGNMENT.exec(rest);
    if (head === null) return null;
    const parsed = parseLiteral(rest.slice(head[0].length));
    if (parsed === undefined || parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    if (Object.keys(parsed).some((key) => !CONFIG_KEYS.has(key))) return null;
    config = parsed;
  }
  return { tag, src, config };
}

/**
 * 出来上がった指定を先に置き、道具本体は描画を止めない形で読む。
 *
 * 道具の script があった場所に、(1) 指定の `<style>` と (2) 道具をあとから読む小さな
 * スクリプトを置く。ページ自身の `tailwind.config = {…}` はそのまま動く——先に仮の
 * 入れ物を置いておき、道具が届いたら同じ設定を渡す。道具が先に届いた場合は、
 * ページのスクリプトが本物へ直に書くので、こちらからは渡さない（空で上書きしない）。
 *
 * `</style` を含む指定は受けない（そこで style が閉じ、続きが本文として出てしまう）。
 */
export function withPrecompiledTailwind(html: string, plan: TailwindPlan, css: string): string {
  if (css.length === 0 || /<\/style/i.test(css) || !html.includes(plan.tag)) return html;
  const loader =
    `(function(){var d={},t=window.tailwind={config:d},s=document.createElement("script");` +
    `s.src=${JSON.stringify(plan.src)};` +
    `s.onload=function(){if(t.config!==d&&window.tailwind&&window.tailwind!==t)window.tailwind.config=t.config};` +
    `document.head.appendChild(s)})()`;
  const block = `<style ${FIRST_PAINT_MARK}>${css}</style><script ${FIRST_PAINT_MARK}>${loader}</script>`;
  return html.replace(plan.tag, () => block);
}

// ---------------------------------------------------------------------------
// 書体の指定
// ---------------------------------------------------------------------------

/** noscript の中（こちらが残した元のタグ）は 1 かたまりで読み飛ばす。 */
const LINK_TAG = /<noscript\b[\s\S]*?<\/noscript\s*>|<link\b[^>]*>/gi;
const GOOGLE_FONTS_HREF = /\bhref\s*=\s*"https:\/\/fonts\.googleapis\.com\/css2?\?[^"]*"/i;

/**
 * 書体の指定（Google Fonts）で描画を止めない。
 *
 * 触るのは、書いた人が**すでに「先に端末の書体で出してよい」と指定している**もの
 * （`display=swap`）だけ。あの指定があっても、指定の CSS そのものが届くまでは何も
 * 描かれない——止めているのは書体ではなく、その目録のほう。だから目録を描画の外で読み、
 * 届いたら効かせる。入れ替わり自体は今も起きているので、見え方の約束は変わらない。
 *
 * head の中の、media も onload も書いていない stylesheet だけを対象にする。
 * スクリプトが動かない相手には、元のタグをそのまま残す（noscript）。
 */
export function withNonBlockingFonts(html: string): string {
  const body = BODY_OPEN.exec(html);
  const end = body === null ? html.length : body.index;
  const head = html.slice(0, end).replace(LINK_TAG, (tag) => {
    if (!/^<link\b/i.test(tag) || !GOOGLE_FONTS_HREF.test(tag)) return tag;
    if (!/\brel\s*=\s*"stylesheet"/i.test(tag) || !/[?&]display=swap\b/.test(tag)) return tag;
    if (/\b(?:media|onload)\s*=/i.test(tag) || tag.includes(FIRST_PAINT_MARK)) return tag;
    const open = tag.replace(/\s*\/?>$/, "");
    return `${open} media="print" onload="this.media='all'" ${FIRST_PAINT_MARK}><noscript>${tag}</noscript>`;
  });
  return head + html.slice(end);
}
