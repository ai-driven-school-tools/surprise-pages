import { SOURCE_NOTE_ELEMENT } from "../html/source-note";
import pageImageStamp from "../../widget/dist/page-images-stamp.json";
import { CLEAN_COPY_LOOK_STAMP } from "../settings/clean-copy-look";
export {withAssetBase,withSafeAnchorIds,PAGE_TOP_ID,PAGE_TO_TOP_ID} from "./preview";
export { VENDOR_BASE, VENDOR_STAMPS, vendorSrc, withVendorScripts } from "../html/vendor-scripts";
import { isPersonalEdition } from "../settings/site-settings";
import { featureAvailable } from "../settings/features";
export { widgetOrganizationStamp, type WidgetOrganization } from "../organization/look";
import type { WidgetOrganization } from "../organization/look";
import { ICON_HREF } from "../settings/brand";
import { ORGANIZATION_LOGO_ATTR, ORGANIZATION_NAME_ATTR, VERSION_BANNER_MARK, type SlugVisibility } from "../comments/types";
import { DECK_NOTES } from "../deck/deck";
import { defaultTranslate } from "../i18n/default";
import type { Translate } from "../i18n/translate";
import widgetStamp from "../../widget/dist/stamp.json";

/**
 * ページの見せ方・呼び名の決まりと、配信のときに本文へ差し込むもの。
 *
 * **ここには外の世界に触る部品を置かない**（ファイル読み・保管庫への接続・通信）。
 * 検査表（tests/checks/check-inject.mjs）がこのファイルだけを組み立てて
 * 実際に呼ぶので、保管庫への接ぎ口が混ざると**検査のたびに本番の鍵が要る**ようになる。
 * 本文の読み出しは src/lib/pages/store.ts、履歴は src/lib/revisions/revisions.ts が持つ。
 */

/**
 * ページの見せ方（台帳の `pages.visibility` 列）。**3 通り**。
 *
 *   internal   … 会社の人なら誰でも見られる（既定）
 *   public     … 門なし公開。誰でも見られる
 *   restricted … 会社の人のうち、名簿に載っている人だけ
 *
 * 呼び名の頭に付く文字（src/lib/comments/types.ts の `SlugVisibility`）**とは別の概念**。
 * あちらは 2 通りしかなく、restricted のページも呼び名は `internal/...` のまま。
 * 制限つきは **URL も素材の置き場所も internal と同じ棚**に置く（`/internal/...`）。
 *
 * 「見てよいか」をこの値だけで決めない。可否の判定は src/lib/access/access.ts の
 * `canViewPage` ただ 1 つが持つ（名簿を引かないと restricted は決まらない）。
 */
export const VISIBILITIES = ["internal", "public", "restricted"] as const;
export type Visibility = (typeof VISIBILITIES)[number];

/**
 * 見せ方 → 呼び名の頭に付く文字。
 *
 * 制限つきは internal と同じ棚に置くので、ここで 3 通りを 2 通りへ畳む。
 * 畳む場所をここ 1 つに集めてあるのは、入口ごとに `=== "public" ? ... : ...` と
 * 書き比べると、片方だけ restricted を取りこぼすため。
 */
export function slugVisibilityOf(visibility: Visibility): SlugVisibility {
  return visibility === "public" ? "public" : "internal";
}

export type PageEntry = {
  visibility: Visibility;
  /** 見せ方より下の呼び名（`example/hello` なら `["example", "hello"]`） */
  slug: string[];
  /** ブラウザで開く URL */
  href: string;
  title: string;
  /** 最終更新（ISO 文字列） */
  updatedAt: string;
};

/** URL に出せる安全な文字だけ許す。`..` や日本語・空白はここで落ちる。 */
const SAFE_SEGMENT = /^[a-z0-9][a-z0-9._-]*$/;
const MAX_DEPTH = 8;

export function isSafeSlug(slug: readonly string[]): boolean {
  if (slug.length === 0 || slug.length > MAX_DEPTH) return false;
  return slug.every((segment) => SAFE_SEGMENT.test(segment) && !segment.includes(".."));
}

/** 呼び名の頭 → URL の頭。 */
export function urlPrefixFor(slugPrefix: SlugVisibility): string {
  return slugPrefix === "internal" ? "/internal" : "/public";
}

/**
 * ブラウザで開く URL の頭。制限つきは社内限定と同じ `/internal`。
 *
 * **ページを指す URL は、見せ方ではなく呼び名から作る**（`pageHrefOf`）。
 * ここを使うのは、まだ呼び名が決まっていない場面（投稿の指定から URL を組む、
 * 制限つきの一覧の行き先を組む）だけ。社内として投稿したページを公開に切り替えても
 * 呼び名は動かないので、見せ方から作ると URL が実際と食い違う。
 */
export function urlPrefix(visibility: Visibility): string {
  return urlPrefixFor(slugVisibilityOf(visibility));
}

const HEAD_OPEN = /<head[^>]*>/i;

/** 印を名乗っている `<link>` があるか。`rel` は空白区切りの並びなので、語として見る。 */
const LINK_REL = /<link\b[^>]*\brel\s*=\s*["']([^"']*)["'][^>]*>/gi;

function declaresIcon(html: string): boolean {
  for (const found of html.matchAll(LINK_REL)) {
    const roles = found[1].toLowerCase().split(/\s+/);
    // `apple-touch-icon`（ホーム画面用）は別の役目なので数に入れない。
    // 語として突き合わせないと、あれを「印はもうある」と見なして差し込みが止まる
    if (roles.includes("icon") || roles.includes("shortcut")) return true;
  }
  return false;
}

const ICON_LINK = `<link rel="icon" href="${ICON_HREF}">`;

/**
 * タブに出る印を差し込む。
 *
 * 投稿の道具が作るページは自分で印を書いてくるので、そのときは触らない
 * （`<base>` の差し込みと同じ流儀。書いた人の指定が勝つ）。何も書いていないページには
 * この置き場の印を入れる——入れないとブラウザが `/favicon.ico` を探しに行き、
 * 社内のページと公開のページで別の絵が出たり、既定の紙のままになったりする。
 */
export function withPageIcon(html: string): string {
  if (declaresIcon(html)) return html;
  const head = HEAD_OPEN.exec(html);
  if (head === null) return `${ICON_LINK}${html}`;
  const at = head.index + head[0].length;
  return `${html.slice(0, at)}${ICON_LINK}${html.slice(at)}`;
}

const BODY_CLOSE = /<\/body\s*>/i;

/**
 * コメント機能の部品の「印」。中身から決まる短い文字で、`pnpm build:widget` が書き出す。
 *
 * **印の出どころはこの 1 か所**（src/widget/dist/stamp.json）。差し込む側のここと、
 * 配る側（src/app/comments-widget.js）が、そろって同じものを読む。
 * 読み込みの形にしてあるのは、このファイルに外の世界へ触る部品を置かないため
 * （読み込みは組み立てのときに済み、動いている最中にファイルを開きに行かない）。
 */
export const COMMENTS_WIDGET_STAMP: string = widgetStamp.stamp;

/** 印が付く前からある行き先。すでに配られたページがここを読みに来るので、配る側は残してある。 */
export const COMMENTS_WIDGET_BASE = "/comments-widget.js";

/** 入口と同時に頼ませる部品の名前（src/widget/dist/stamp.json の preload。組み立てが静的な import をたどって書く）。 */
export const COMMENTS_WIDGET_PRELOAD: readonly string[] = widgetStamp.preload.filter((name) => /^comments-widget-chunk-[A-Z0-9]+\.js$/.test(name));

/**
 * いま差し込む行き先。中身が変われば名前ごと変わるので、長く持たせても古いものが残らない。
 *
 * 印を「ファイル名の途中」ではなく 1 つ下の階層に置いているのは、Next の受け口が
 * `名前.<印>.js` のような**途中だけ変わる名前**を扱えないため（区切りまるごとでしか変えられない）。
 */
export const COMMENTS_WIDGET_SRC = `${COMMENTS_WIDGET_BASE}/${COMMENTS_WIDGET_STAMP}`;

/** すでに部品が入っているか。印が違う版が入っていても 1 つと数える。 */
const HAS_COMMENTS_SCRIPT = /<script[^>]+src="\/comments-widget\.js(?:\/[^"]*)?"/i;

/**
 * 清書ページの末尾に convert が付ける git 出典。
 *
 * 3 つ（repo / path / commit）が揃って初めて出典とみなす。作業中の内容や
 * 社外公開（パスを出さない）の行には commit が無いので、ここは null になる。
 * 配信が札へ写し、鮮度の口が GitHub を叩く材料。形が崩れていたら無いものとして扱う。
 */
export type PageSource = {
  repo: string;
  path: string;
  commit: string;
  committedAt: string | null;
};

const SOURCE_NOTE_TAG = /<[^>]*\bdata-source-note\b[^>]*>/i;
const GITHUB_REPO = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const GIT_COMMIT = /^[0-9a-f]{7,40}$/i;

function decodeAttr(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function readAttr(tag: string, name: string): string | null {
  const found = new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"`, "i").exec(tag);
  if (found === null) return null;
  const value = decodeAttr(found[1]).trim();
  return value.length === 0 ? null : value;
}

/** 出典のパス。`..` や絶対パスは GitHub へ渡さない。 */
export function isSafeSourcePath(path: string): boolean {
  if (path.length === 0 || path.length > 500) return false;
  if (path.startsWith("/") || path.startsWith("\\")) return false;
  if (path.includes("..") || path.includes("\\") || path.includes("\0")) return false;
  return true;
}

/** 本文から git 出典を拾う。揃っていなければ null（失敗にはしない）。 */
export function parseSourceNote(html: string): PageSource | null {
  const tag = SOURCE_NOTE_TAG.exec(html)?.[0];
  if (tag === undefined) return null;
  const repo = readAttr(tag, "data-source-repo");
  const path = readAttr(tag, "data-source-path");
  const commit = readAttr(tag, "data-source-commit");
  if (repo === null || path === null || commit === null) return null;
  if (!GITHUB_REPO.test(repo) || !GIT_COMMIT.test(commit) || !isSafeSourcePath(path)) {
    return null;
  }
  return { repo, path, commit, committedAt: readAttr(tag, "data-source-committed-at") };
}


/**
 * 出典の札を取り除いた本文。**原本と本文を比べるための形。**
 *
 * deck は HTML そのものが原本で、投稿のときに札を 1 つ足しただけ。だから札を外せば
 * 原本のファイルと同じはずで、違っていれば「投稿のあとにブラウザで直された」と読める。
 * 札は行ごと足されるので、行ごと外す（字下げと改行まで。残すと空行 1 本の差が「直し」に見える）。
 * 配信では使わない（札は道具箱が読む材料なので、配るときは残す）。
 */
export function stripSourceNote(html: string): string {
  return html.replace(SOURCE_NOTE_ELEMENT, "");
}


/**
 * スピーカーノート（`<aside data-deck-notes>`）を全部取り除く。
 *
 * 門なし公開（`/public/`）は「ただの記事」で、発表者のメモは社外の人に見せない
 * （コメントや履歴を出さないのと同じ向き）。見る人が会社の人かで分けないのは、
 * `/public/` の応答が配信網に載る前提で、誰に対しても同じ 1 通りでなければならないため。
 * 会社の人がノートを読むときは `/internal/...` で開く。
 *
 * 入れ子の aside は契約で禁止しているので、非貪欲で最初の閉じまで取れば足りる。
 * deck でない本文には何も起きない。2 度通しても同じ。
 */
const DECK_NOTES_ELEMENT = new RegExp(`<aside\\b[^>]*\\b${DECK_NOTES}\\b[^>]*>[\\s\\S]*?<\\/aside\\s*>`, "gi");

export function withoutDeckNotes(html: string): string {
  return html.replace(DECK_NOTES_ELEMENT, "");
}

/**
 * ページにコメント機能を付ける。
 *
 * ページを書く人が script タグを書かなくてよいように、配信時に差し込む。
 * 行き先をスラッシュ始まりにしてあるのは、`<base>` が入っているとページの下の階層に化けるため。
 *
 * **呼び名は必ずここで教える。** ブラウザ側に URL の頭から組み立てさせない——
 * 公開に切り替えたページは呼び名が `internal/…` のままで、URL（`/public/…`）とは頭が
 * 食い違う。URL から作らせると、コメントが台帳に無い呼び名に付こうとして
 * 機能ごと動かなくなる。呼び名を知っているのは台帳を引いたサーバーだけ。
 *
 * git 出典があるときは、同じ札に `data-source-*` も載せる。道具箱は本文を
 * 掻かずに札だけを見る（本文の末尾行は照合が外す印なので、画面側が
 * そこへ依存すると、印の付け方を変えた瞬間に取り込みが消える）。
 *
 * 呼び名に使えるのは英小文字・数字と `- _ . /` だけ（`isSafeSlug`）なので、
 * 引用符で囲めばそのまま札に書ける。出典のパスは escapeHtml を通す。
 *
 * 要求の組織の名前とロゴの行き先も札に書く（`organization`）。道具箱は保存先を引かないので、
 * 「見本商事の資料」の名前はここで渡す。名前は escapeHtml を通す（組織の管理者が付けた自由な字）。
 */
export function withCommentsWidget(
  html: string,
  pageSlug: string,
  organization: WidgetOrganization | null = null,
): string {
  if (HAS_COMMENTS_SCRIPT.test(html)) return html;
  const attrs = [`src="${COMMENTS_WIDGET_SRC}"`, `data-page="${pageSlug}"`];
  if (organization !== null) {
    attrs.push(`${ORGANIZATION_NAME_ATTR}="${escapeHtml(organization.name)}"`);
    // ロゴの行き先は自分の宛先の道筋だけ（src/lib/organization-logo.ts の organizationLogoHref の形）
    if (organization.logo !== null && /^\/api\/organization\/logo\?v=[0-9a-f]{16}$/.test(organization.logo)) attrs.push(`${ORGANIZATION_LOGO_ATTR}="${escapeHtml(organization.logo)}"`);
  }
  if (isPersonalEdition()) attrs.push('data-edition="personal"');
  // 部品は入口 1 本と、あとから読む部品に分けてある（scripts/build/widget.mjs）。`type="module"` も `defer` と同じく
  // 本文を読み終えた直後・DOMContentLoaded の前に動くので、図の原文を描かれる前に控える順番（keepMermaidSource）は変わらない
  // 入口が最初に必ず取りに行く部品も、入口と同じ時に頼ませる（入口を読み終えてから頼む 1 往復を消す・スマホの 4G で約 0.17 秒）。
  // 置くのは入口のすぐ前（body の末尾）で、head や応答の頭には書かない（本文を描くための読み込みより先に回線を取らない・docs/design/page-loading.md）。
  // 優先度は既定のまま（低くしても本文は速くならず、スライドでは画像の後ろへ回されるだけだった・実測は docs/design/app-speed.md）
  const preload = COMMENTS_WIDGET_PRELOAD.map((name) => `<link rel="modulepreload" href="${COMMENTS_WIDGET_BASE}/${name}">`).join("");
  const script = `${preload}<script type="module" ${attrs.join(" ")} defer></script>`;
  const close = BODY_CLOSE.exec(html);
  if (close === null) return `${html}${script}`;
  return `${html.slice(0, close.index)}${script}${html.slice(close.index)}`;
}

/** 本文 HTML の殻を変えたときの ETag 用の印。道具箱の印とは別。 */
// 清書の見た目は配信のときに付け替えるので、写しを上げたら照合の印も変える（src/lib/settings/clean-copy-look.ts）
export const HTML_SHELL_STAMP = "sp5" + "-images-1-" + pageImageStamp.stamp + "-cc-" + CLEAN_COPY_LOOK_STAMP;


/**
 * 先読みする道具の行き先。差し替えたあと・部品を足したあとの HTML から拾う。
 *
 * 外の行き先は数に入れない（こちらが持っていないものを先に取りに行かせない）。
 * 印つきの階層まで含めた、いま差し込んでいる形。
 *
 * **コメント機能の部品は先読みしない。** あれは `defer` で、本文を描くのに要らない。
 * 先読みは高い優先度で始まるので、数百 KB の部品が、描画を止めている道具（Tailwind）や
 * 書体の指定と回線を取り合う——実測で、電波の弱いスマホの初回表示が 4.0 秒から 3.3 秒に
 * 縮んだ（4G 相当で 1.1 秒 → 0.97 秒）。部品は今までどおり `</body>` の直前の script が読む。
 */
export function scriptPreloadSrcs(html: string): string[] {
  const srcs: string[] = [];
  const seen = new Set<string>();
  const found = html.matchAll(/<script\b[^>]*\bsrc="(\/vendor\/[^"]+)"/gi);
  for (const match of found) {
    const src = match[1];
    if (seen.has(src)) continue;
    seen.add(src);
    srcs.push(src);
  }
  return srcs;
}

/** 応答の頭に書く先読み。無いときは付けない（空の Link を焼かない）。 */
export function scriptPreloadHeader(html: string): string | null {
  const srcs = scriptPreloadSrcs(html);
  if (srcs.length === 0) return null;
  return srcs.map((src) => `<${src}>; rel=preload; as=script`).join(", ");
}

/**
 * 道具の先読みを `<head>` に足す。
 *
 * 見た目の指定を作る道具（Tailwind）は、読み終わるまで字の形が決まらないので、
 * 先に名前だけ知らせて取りに行かせる。
 * すでに同じ行き先の preload があるときは足さない（2 度通しても増えない）。
 */
export function withScriptPreload(html: string): string {
  const srcs = scriptPreloadSrcs(html);
  if (srcs.length === 0) return html;
  const tags = srcs
    .filter((src) => !html.includes(`rel="preload" href="${src}"`))
    .map((src) => `<link rel="preload" href="${src}" as="script">`)
    .join("");
  if (tags.length === 0) return html;
  const head = HEAD_OPEN.exec(html);
  if (head === null) return `${tags}${html}`;
  const at = head.index + head[0].length;
  return `${html.slice(0, at)}${tags}${html.slice(at)}`;
}

/**
 * URL の中で「ここから先は当時の素材」を表す目印。
 *
 * 例: /internal/report/2026q1/@v/a1b2c3d/chart.png
 * 素の呼び名は英小文字か数字で始まる決まりなので、@ で始まるこの目印とはぶつからない。
 */
export const VERSION_MARK = "@v";

export type VersionedAssetPath = {
  pageSlug: string[];
  sha: string;
  rel: string[];
};

/** 素材の URL を「ページ・版・ファイル」に割る。目印が無ければ null。 */
export function splitVersionedAsset(slug: readonly string[]): VersionedAssetPath | null {
  const at = slug.indexOf(VERSION_MARK);
  if (at <= 0) return null;

  const sha = slug[at + 1];
  const rel = slug.slice(at + 2);
  if (typeof sha !== "string" || sha.length === 0 || rel.length === 0) return null;

  return { pageSlug: slug.slice(0, at), sha, rel };
}

const BODY_OPEN = /<body[^>]*>/i;

/**
 * 「これは過去の版です」と伝える帯。
 *
 * ページ側の CSS と混ざらないよう、見た目は要素に直接書く。
 * 色は敷かず、下の細い線と控えめな文字だけにしてある。読ませたいのは本文のほうなので。
 *
 * 目印を 1 つ付けてあるのは、**版を見比べ始めたときにウィジェット側が
 * この帯を引っ込められるようにする**ため。比べている間は「A → B」の帯が上に出るので、
 * 両方が並ぶと同じことを 2 段で言うことになる。
 *
 * 同じ目印は、本文の文字を数えるときに**この帯を数えない**ためにも使う。
 * 数えてしまうと、こちらが足した文字のぶんだけ印の位置がそっくりずれる。
 *
 * 帯の文は見ている人の言語で書く（渡さなければ日本語）。言語で中身が変わるので、照合の印も言語で分ける
 * （`src/lib/pages/private-page.ts`）。
 */
export function withVersionBanner(
  html: string,
  version: { shortSha: string; number: number | null },
  latestHref: string,
  t: Translate = defaultTranslate,
): string {
  // 人に見せる呼び方は「第N版」（現在地の行・履歴の一覧と同じ）。番号が引けない古い指定だけ目印の 7 桁で言う
  const showing =
    version.number === null
      ? t("app.versionBanner.showing", { sha: version.shortSha })
      : t("app.versionBanner.showingNumber", { version: t("toolbox.history.versionNumber", { number: version.number }) });
  const banner =
    `<div role="status" ${VERSION_BANNER_MARK}="" style="position:sticky;top:0;z-index:2147482000;` +
    `display:flex;align-items:center;gap:12px;padding:8px 16px;` +
    `border-bottom:1px solid rgba(127,127,127,.28);background:Canvas;color:GrayText;` +
    `font:500 13px/1.5 -apple-system,BlinkMacSystemFont,'Hiragino Sans','Noto Sans JP',sans-serif">` +
    `<span>${escapeHtml(showing)}</span>` +
    `<a href="${escapeHtml(latestHref)}" style="color:inherit">${escapeHtml(t("app.versionBanner.latest"))}</a>` +
    `</div>`;

  const open = BODY_OPEN.exec(html);
  if (open === null) return `${banner}${html}`;
  const at = open.index + open[0].length;
  return `${html.slice(0, at)}${banner}${html.slice(at)}`;
}

/** 差し込む文字列に含める値を、タグとして解釈されない形にする。 */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
