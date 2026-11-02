/**
 * 保存される HTML が「明らかに壊れていないか」を、土台の版と比べて見る。
 * ブラウザ編集の保存（src/app/api/pages/edit）が使う。
 *
 * 厳密な HTML 検証ではない——ブラウザは多少の崩れを直して描くので、
 * ここで見るのは、直しによって**新しく増えた**壊れ方だけ。
 *
 * ページは任意の HTML（script 入りも設計上あり得る）なので、script を漉すことはしない。
 * 書ける人の境界は canEditPage が担う。
 *
 * 配信時に差し込むもの（道具箱の札・版の帯・編集の目印・`<base>`）は
 * 保管庫の正本に焼き付いてはいけない。これも「土台に無かったのに増えたら断る」。
 * 昔のページに万一入っていても、編集を封じない。
 *
 * DOM・保管庫・通信には触れない（文字列だけを見る）。
 */

import { FIRST_PAINT_MARK } from "../first-paint/first-paint";
import { defaultTranslate } from "../i18n/default";
import type { Translate } from "../i18n/translate";
import { EDIT_PREVIEW_MARK, SCRIPT_NOTICE_TAG, VERSION_BANNER_MARK } from "../comments/types";

/**
 * 壊れ方の種類は 3 つだけ。
 *
 * - unclosed … 閉じ省略できないタグが閉じていない。閉じタグで祖先まで下ろす途中で
 *   外れたものも、走査の終わりにスタックへ残ったものも同じ。
 *   `<b><i>x</b></i>` の `<i>` も、`</body>` 直前の閉じ忘れ `<div>` もここ。
 *   入れ違いも閉じ忘れも、人への言い方は「<i> が閉じていない」で通じる。
 * - strayClose … 対応する開きの無い閉じタグ（上の例なら `</i>`）
 * - artifact … 配信時の差し込みが正本に焼き付いている
 */
export type HtmlIssue = {
  kind: "unclosed" | "strayClose" | "artifact";
  /** タグの名前、または差し込みの名前 */
  detail: string;
};

/**
 * 閉じタグを書かなくてもよい要素。
 *
 * HTML の決まりで、後ろに来る要素や親の閉じで暗黙に閉じる。
 * ここに居るタグの閉じ忘れは「壊れ方」に数えない——書いてあるページの
 * ほとんどが、この決まりに頼っているため（`<p>` や `<li>` を毎回閉じていない）。
 */
const OMITTABLE_CLOSE = new Set([
  "html",
  "head",
  "body",
  "p",
  "li",
  "dt",
  "dd",
  "option",
  "optgroup",
  "thead",
  "tbody",
  "tfoot",
  "tr",
  "td",
  "th",
  "caption",
  "colgroup",
  "rp",
  "rt",
]);

/** 閉じの要らないタグ。積むと「閉じていない」と誤る。 */
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
 * タグ 1 つ。属性内の `>` は、src/widget/editor/markdown.ts の TAG_OPEN と同じ形で読み飛ばす。
 * ここで形を変えると、`<div title="a>b">` を途中で切って壊れ方を捏造する。
 */
const TAG = /^<(\/?)([a-zA-Z][a-zA-Z0-9-]*)((?:"[^"]*"|'[^']*'|[^"'>])*)>/;

function issueKey(issue: HtmlIssue): string {
  return `${issue.kind}:${issue.detail}`;
}

/** 開きタグの終わりまで進む。属性の引用の中の `>` はタグの終わりにしない。 */
function readTag(html: string, at: number): { close: boolean; name: string; selfClosed: boolean; length: number } | null {
  const found = TAG.exec(html.slice(at));
  if (found === null) return null;
  const name = found[2];
  if (name === undefined) return null;
  return {
    close: found[1] === "/",
    name: name.toLowerCase(),
    selfClosed: /\/\s*>$/.test(found[0]),
    length: found[0].length,
  };
}

/** 対応する閉じタグの直後。無ければ -1。 */
function afterCloseTag(html: string, from: number, name: string): number {
  const found = new RegExp(`</${name}\\s*>`, "i").exec(html.slice(from));
  if (found === null) return -1;
  return from + found.index + found[0].length;
}

export function findHtmlIssues(html: string): HtmlIssue[] {
  const issues: HtmlIssue[] = [];
  const stack: string[] = [];
  let at = 0;

  while (at < html.length) {
    const next = html.indexOf("<", at);
    if (next === -1) break;

    if (html.startsWith("<!--", next)) {
      const end = html.indexOf("-->", next + 4);
      at = end === -1 ? html.length : end + 3;
      continue;
    }

    // DOCTYPE や条件付きコメントの宣言。`<!--` より後に見る（あちらも `<!` で始まる）
    if (html.startsWith("<!", next)) {
      const end = html.indexOf(">", next + 2);
      at = end === -1 ? html.length : end + 1;
      continue;
    }

    const tag = readTag(html, next);
    if (tag === null) {
      at = next + 1;
      continue;
    }

    /*
     * script / style の中身はタグとして読まない。
     * `"<div"` のようなただの文字を、閉じられていない要素と数えないため。
     * 属性内の `>` は上の TAG と同じ形で開きの終わりを決めてから、閉じまで飛ぶ。
     */
    if (!tag.close && (tag.name === "script" || tag.name === "style") && !tag.selfClosed) {
      const afterOpen = next + tag.length;
      const after = afterCloseTag(html, afterOpen, tag.name);
      at = after === -1 ? html.length : after;
      continue;
    }

    if (VOID_TAGS.has(tag.name) || tag.selfClosed) {
      at = next + tag.length;
      continue;
    }

    if (!tag.close) {
      stack.push(tag.name);
      at = next + tag.length;
      continue;
    }

    const matchAt = stack.lastIndexOf(tag.name);
    if (matchAt === -1) {
      issues.push({ kind: "strayClose", detail: tag.name });
    } else {
      // 頭でないがスタックのどこかに居る → 間を下ろす。
      // 閉じ省略できないものは unclosed（入れ違いも、人には閉じ忘れ）。
      while (stack.length > matchAt + 1) {
        const popped = stack.pop();
        if (popped === undefined) break;
        if (!OMITTABLE_CLOSE.has(popped)) {
          issues.push({ kind: "unclosed", detail: popped });
        }
      }
      stack.pop();
    }
    at = next + tag.length;
  }

  for (const name of stack) {
    if (!OMITTABLE_CLOSE.has(name)) {
      issues.push({ kind: "unclosed", detail: name });
    }
  }

  /*
   * 差し込みは 1 種類 1 件。土台にも同じものがあれば addedIssues が増分を 0 にする。
   * 属性の名前そのものを見る。値の有無は問わない（空の目印でも焼き付き）。
   */
  if (/\bdata-sp-image(?:[\s=>-])|\/page-images\.js\//i.test(html)) issues.push({ kind: "artifact", detail: "imageDelivery" });
  if (/<base\b/i.test(html)) issues.push({ kind: "artifact", detail: "base" });
  if (/comments-widget\.js/.test(html)) issues.push({ kind: "artifact", detail: "widget" });
  if (html.includes(VERSION_BANNER_MARK)) issues.push({ kind: "artifact", detail: "banner" });
  if (html.includes(EDIT_PREVIEW_MARK)) issues.push({ kind: "artifact", detail: "editMark" });
  if (html.includes(`<${SCRIPT_NOTICE_TAG}`)) issues.push({ kind: "artifact", detail: "scriptNotice" });
  // 描画を待たせないための差し込み（出来上がりの指定・書体の読み方の付け替え）
  if (html.includes(FIRST_PAINT_MARK)) issues.push({ kind: "artifact", detail: "firstPaint" });

  return issues;
}

/** 土台に無かった壊れ方だけを返す（種類+名前ごとの件数で比べ、増えたぶんだけ）。 */
export function addedIssues(base: readonly HtmlIssue[], next: readonly HtmlIssue[]): HtmlIssue[] {
  const allowed = new Map<string, number>();
  for (const issue of base) {
    const key = issueKey(issue);
    allowed.set(key, (allowed.get(key) ?? 0) + 1);
  }

  const seen = new Map<string, number>();
  const extra: HtmlIssue[] = [];
  for (const issue of next) {
    const key = issueKey(issue);
    const count = (seen.get(key) ?? 0) + 1;
    seen.set(key, count);
    if (count > (allowed.get(key) ?? 0)) extra.push(issue);
  }
  return extra;
}

function artifactPhrase(detail: string, t: Translate): string {
  if (detail === "base") return t("toolbox.htmlCheck.artifact.base");
  if (detail === "widget") return t("toolbox.htmlCheck.artifact.widget");
  if (detail === "banner") return t("toolbox.htmlCheck.artifact.banner");
  if (detail === "editMark") return t("toolbox.htmlCheck.artifact.editMark");
  if (detail === "firstPaint") return t("toolbox.htmlCheck.artifact.firstPaint");
  if (detail === "scriptNotice") return t("toolbox.htmlCheck.artifact.scriptNotice");
  return t("toolbox.htmlCheck.artifact.other");
}

function phraseOf(issue: HtmlIssue, t: Translate): string {
  switch (issue.kind) {
    case "unclosed":
      return t("toolbox.htmlCheck.unclosed", { tag: `<${issue.detail}>` });
    case "strayClose":
      return t("toolbox.htmlCheck.strayClose", { tag: `</${issue.detail}>` });
    case "artifact":
      return artifactPhrase(issue.detail, t);
  }
}

/**
 * 人に見せる 1 行（最大 3 件+「ほか n 件」）。言語は呼ぶ側が渡す（窓口は `requestTranslate()`）。
 * このファイルは純関数のまま保つので、要求の言語をここで読まない。
 */
export function describeIssues(issues: readonly HtmlIssue[], t: Translate = defaultTranslate): string {
  const phrases = issues.map((issue) => phraseOf(issue, t));
  const separator = t("toolbox.htmlCheck.separator");
  if (phrases.length <= 3) return phrases.join(separator);
  return t("toolbox.htmlCheck.more", { list: phrases.slice(0, 3).join(separator), count: phrases.length - 3 });
}
