import { siteName } from "../settings/site-settings";
import type { SlugVisibility } from "../comments/types";
import { summaryOf, titleOf } from "../html/text";
import { gateCard } from "../access/signin-gate";

/**
 * 共有したときに出る「見出しカード」の指定。
 *
 * ## 社内ページには中身を載せない
 *
 * Slack や X に URL を貼った時点で、向こうは**名乗り無しで**取りに来る。だから
 * 社内ページのカードには、ページ名も要約も渡さない。出すのはサイト名と
 * 「社内限定」だけで、文言は門の紙（src/lib/access/signin-gate.ts）と同じ 1 か所から読む。
 *
 * **書いた人が自分で og: を書いていても、社内では上書きして落とす。** 投稿の道具が
 * 作る HTML には `og:title` にページ名が入っている。名乗った人にしか届かないとはいえ、
 * 「経路のおかげで漏れていない」状態のままにしない——決まりが作りとして成り立つように、
 * 出る手前で必ず取り除く。
 *
 * ## 公開ページには足りないものだけ足す
 *
 * 逆に門なし公開ページでは、書いた人の文言を尊重して**残す**。こちらが足すのは
 * 書いていなかったもの（絵・宛先・サイト名など）だけ。
 * 以前は「1 つでも og: があれば何もしない」形だったので、投稿の道具が作った
 * ページは全部が素通りし、カードの絵（/api/og）が 1 度も使われていなかった。
 */

const HEAD_OPEN = /<head[^>]*>/i;

function escapeAttribute(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function tag(property: string, content: string): string {
  return `<meta property="${property}" content="${escapeAttribute(content)}">`;
}

function nameTag(name: string, content: string): string {
  return `<meta name="${name}" content="${escapeAttribute(content)}">`;
}

/**
 * その札をページが自分で書いているか。
 *
 * `property=` と `name=` の両方を見る。og: は本来 `property` だが `name` で書く道具も
 * 多く、片方だけ見ていると同じ札が 2 枚出る（受け取る側がどちらを採るかは相手任せ）。
 */
function declares(html: string, label: string): boolean {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`<meta[^>]+(?:property|name)=["']${escaped}["']`, "i").test(html);
}

/** 書いていない札だけを足す。 */
function fill(html: string, label: string, make: () => string): string {
  return declares(html, label) ? "" : make();
}

/** 中身が無いときは札そのものを出さない（空の札は「説明が無い」より読みにくい）。 */
function optional(
  label: string,
  content: string | null,
  make: (label: string, content: string) => string,
): string {
  return content === null ? "" : make(label, content);
}

/**
 * 社内ページ用。中身に触れない、いつも同じ文言。
 *
 * 絵も固定の 1 枚（/api/og/locked）。宛先を受け取らないのは、ここへページを指す値を
 * 渡せる形にしないため——渡せなければ、うっかり載せようがない。
 */
function internalTags(organization: string | null): string {
  // 札の文言は門の紙と同じ出どころ。差し込むのは要求の組織の名前だけ（宛先に既に出ている）
  const card = gateCard(organization);
  return [
    tag("og:site_name", siteName()),
    tag("og:type", "website"),
    tag("og:title", card.title),
    tag("og:description", card.description),
    nameTag("robots", "noindex, nofollow"),
  ].join("");
}

/**
 * 社内ページに残っている、中身に触れる札を落とす。
 *
 * 落とすのは `<head>` の中の og: と twitter: と `description` だけ。本文（`<body>`）と
 * ページの `<title>`（タブに出る名前）は触らない——あれは開けた人にだけ見えるもので、
 * カードとして外へ出て行く札ではない。
 */
const CARD_TAG =
  /<meta\b[^>]*\b(?:property|name)\s*=\s*["'](?:og:[^"']*|twitter:[^"']*|description)["'][^>]*>/gi;

function stripCardTags(html: string): string {
  const head = HEAD_OPEN.exec(html);
  if (head === null) return html.replace(CARD_TAG, "");

  const at = head.index + head[0].length;
  const close = /<\/head\s*>/i.exec(html);
  const until = close === null ? html.length : close.index;
  return html.slice(0, at) + html.slice(at, until).replace(CARD_TAG, "") + html.slice(until);
}

export type PublicPageMeta = {
  title: string | null;
  description: string | null;
  pageUrl: string;
  imageUrl: string | null;
};

/**
 * 公開ページ用。書いていない札だけを足す。
 *
 * 渡された文言（`meta.title` / `meta.description`）を読むのは**必ず `fill` の中**。
 * 呼ぶ側はこの 2 つを「読まれたときに初めて本文から切り出す」形で渡してくるので
 * （src/app/public/[...slug]/route.ts）、判断のために外で覗くと、結局使わない要約を毎回
 * 作ることになる。
 */
function publicTags(html: string, meta: PublicPageMeta): string {
  const parts = [
    fill(html, "og:site_name", () => tag("og:site_name", siteName())),
    fill(html, "og:type", () => tag("og:type", "article")),
    fill(html, "og:url", () => tag("og:url", meta.pageUrl)),
    fill(html, "og:title", () => tag("og:title", meta.title ?? siteName())),
    fill(html, "og:description", () => optional("og:description", meta.description, tag)),
    fill(html, "description", () => optional("description", meta.description, nameTag)),
  ];

  const image = meta.imageUrl;
  if (image !== null) {
    parts.push(fill(html, "og:image", () => tag("og:image", image)));
    /*
     * 絵の在り処は og に 1 つ置くだけ。`twitter:image` や `twitter:title` を
     * 書き足さないのは、あちらが**無ければ og を見る**決まりになっているため。
     * 2 通り置くと、書いた人が og だけを直した日に、片方だけ古い題が残る。
     * `twitter:card` にだけ og の代わりが無いので、これは足す（大きい札で出す指定）。
     */
    parts.push(fill(html, "twitter:card", () => nameTag("twitter:card", "summary_large_image")));
  }

  /*
   * 検索よけは**書いてあっても必ず足す**（ここだけ「足りないものだけ」の外に置く）。
   * ページが `index` と書いていたら、こちらが遠慮した瞬間に 3 枚重ねの 1 枚が抜ける。
   * 同じ札が 2 枚並んでも、取り込み役はきつい側を採るので緩くはならない。
   */
  parts.push(nameTag("robots", "noindex, nofollow"));
  return parts.join("");
}

/** 組み立てた札を `<head>` の先頭へ入れる。`<head>` が無ければ頭に置く。 */
function insert(html: string, tags: string): string {
  const head = HEAD_OPEN.exec(html);
  if (head === null) return `${tags}${html}`;
  const at = head.index + head[0].length;
  return `${html.slice(0, at)}${tags}${html.slice(at)}`;
}

/**
 * `<head>` の先頭へ差し込む。配信時に足すので、書く人は何も書かなくてよい
 * （相対パスの基準を差し込むのと同じ流儀）。
 *
 * 見せ方が社内なら、渡された文言は**見ない**（誤って公開ページ用の材料を渡されても、
 * 中身がカードに出ることはない）。社内では文言を受け取る意味が無いので、
 * 呼び方の側でも渡せない形にしてある——公開なら必ず渡す、社内なら渡さない。
 */
export function withOgTags(html: string, visibility: "internal", organization?: string | null): string;
export function withOgTags(html: string, visibility: "public", meta: PublicPageMeta): string;
export function withOgTags(
  html: string,
  visibility: SlugVisibility,
  extra?: PublicPageMeta | string | null,
): string {
  // 社内は上書きして落とす。公開で文言が無いのは呼び方の間違いだが、
  // そのときも中身を出さない側（社内と同じ扱い）へ倒す
  if (visibility === "internal" || extra === undefined || extra === null || typeof extra === "string") {
    return insert(stripCardTags(html), internalTags(typeof extra === "string" ? extra : null));
  }
  return insert(html, publicTags(html, extra));
}

/** 公開ページの HTML から、カードに出す文言を組み立てる。 */
export function publicMetaFor(html: string, pageUrl: string, imageUrl: string): PublicPageMeta {
  return {
    title: titleOf(html),
    description: summaryOf(html),
    pageUrl,
    imageUrl,
  };
}
