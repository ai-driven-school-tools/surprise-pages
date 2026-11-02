import {withPageImages} from "../page-images/html";
import { documentPolicy, DOCUMENT_POLICY_STAMP, type ScriptDelivery } from "../html/document-security";
import { withScriptNotice } from "../html/script-notice";
import { isDeckMediaAssetPath } from "../deck/edit/assets";
import { isPersonalEdition } from "../settings/site-settings";
import { requestTranslate, rt } from "../i18n/request";
import { dangerouslyDeleteByTag, getCache } from "@vercel/functions";
import { createHash } from "node:crypto";
import type { RuntimeCache } from "@vercel/functions";
import { shelfOf, type AssetHit, type AssetRange } from "./assets";
import type { OrganizationScope } from "../organization/scope";

import {
  COMMENTS_WIDGET_STAMP,
  HTML_SHELL_STAMP,
  scriptPreloadHeader,
  withSafeAnchorIds,
  withScriptPreload,
} from "./content";

/**
 * ページ配信の控え（配信網・ブラウザ・実行環境）と、直したら落とす処理。
 *
 * ## 公開（`/public/...`）
 *
 * 応答は人によって変わらない。配信網に長く載せて、リンクを押した瞬間に出す。
 * 持たせる長さは「次に誰かが開くまでのあいだ」なので、1 日置く。
 * 古さは投稿・切り替えのときに札で落とす（`dropPageDelivery`）ので、
 * 長く持たせても直した直後に入れ替わる。
 *
 * 公開に切り替えたページだけは 1 分。あれはやめられるので、札が効かない
 * 経路があっても閉じたつもりのページが見え続けない長さにする。
 * 古いものを配りながら裏で取り直す指定も付けない（やめた直後に効いてしまう）。
 *
 * ## 社内（`/internal/...`）
 *
 * 配信網にも共有の控えにも載せない。制限つきも同じ URL を通るので、
 * 公開の `s-maxage` の経路に社内の中身が乗ることはない。
 *
 * 会社の人なら誰でも見られる本文は、ブラウザに持たせてよい。使う前に
 * 照合する（`private, no-cache`）。版の目印と差し込む道具箱の印が同じなら
 * 304 で本文を運ばない。道具箱だけ新しくなったときに版だけで照合すると、
 * 古い印つき URL（immutable）を握ったまま新しい部品が届かない。
 * 名簿で絞った本文は残さない（名簿が変わったあとに手元の古い紙を出させない）。
 *
 * ## 実行環境の本文控え
 *
 * 保管庫の本文は 1 枚で数百 KB ある。版の目印で鍵を切るので、直したら
 * 自然に外れる。配信網の札とは別物（人に配る紙ではなく、門を通ったあと
 * の取り寄せを短くするだけ）。
 */

/** 公開として投稿したページ。配信網に 1 日載せる。ブラウザは毎回照合する。 */
export const PUBLIC_PAGE_CACHE =
  "public, max-age=0, s-maxage=86400, stale-while-revalidate=604800";

/** 公開の素材。本文より長くブラウザにも持たせる（同じ版なら中身は変わらない）。 */
export const PUBLIC_ASSET_CACHE =
  "public, max-age=300, s-maxage=86400, stale-while-revalidate=604800";

/**
 * 公開に切り替えたページ。控えは 1 分。
 *
 * やめたのに配信網が配り続ければ、閉じたつもりのページが見え続ける。
 * 札で落とすが、効かない経路もあるので長さそのものでも約束する。
 */
export const SWITCHED_PAGE_CACHE = "public, max-age=0, s-maxage=60";

/** 切り替えたページの素材。本文と同じ理由で短くする。 */
export const SWITCHED_ASSET_CACHE = "public, max-age=60, s-maxage=60";

/** 社内（会社の人なら誰でも）。配信網には載せない。ブラウザは使う前に照合する。 */
export const INTERNAL_PAGE_CACHE = "private, no-cache";

/** 制限つき本文。名簿が変わったあとに、手元の古い紙を出させない。 */
export const RESTRICTED_PAGE_CACHE = "private, no-store, max-age=0";

/**
 * 社内の素材。本文より長く持たせる。
 *
 * 版の目印が変われば照合で入れ替わる。制限つきの素材は残さない。
 */
export const INTERNAL_ASSET_CACHE = "private, max-age=300, stale-while-revalidate=86400";

/** 中身のハッシュが名前になったスライド画像。同じ名前の中身は変わらない。 */
export const IMMUTABLE_DECK_MEDIA_CACHE = "private, max-age=31536000, immutable";

/** 上書きされる素材と、制限つきの応答は fallback のまま。 */
export function cacheControlForDeckMedia(slug: readonly string[], fallback: string): string {
  if (!fallback.startsWith("private, max-age=")) return fallback;
  const at = slug.lastIndexOf("_deck");
  if (at < 0 || !isDeckMediaAssetPath(slug.slice(at).join("/"))) return fallback;
  return IMMUTABLE_DECK_MEDIA_CACHE;
}

export const RESTRICTED_ASSET_CACHE = "private, no-store, max-age=0";

export type DeliveryKind = "page" | "asset";

/** 公開の URL から配るときの控え。切り替えでやめられるものだけ短くする。 */
export function publicCacheControl(switchable: boolean, kind: DeliveryKind): string {
  if (switchable) return kind === "page" ? SWITCHED_PAGE_CACHE : SWITCHED_ASSET_CACHE;
  return kind === "page" ? PUBLIC_PAGE_CACHE : PUBLIC_ASSET_CACHE;
}

/** 社内の URL から配るときの控え。制限つきは残さない。 */
export function internalCacheControl(restricted: boolean, kind: DeliveryKind): string {
  if (restricted) return kind === "page" ? RESTRICTED_PAGE_CACHE : RESTRICTED_ASSET_CACHE;
  return kind === "page" ? INTERNAL_PAGE_CACHE : INTERNAL_ASSET_CACHE;
}

/** 配信網の札。1 ページ 1 枚。本文も素材も同じ札なので、直したら両方落ちる。 */
export function pageCacheTag(pageId: string): string {
  return `page-${pageId.toLowerCase()}`;
}

/**
 * 素材の目印の控えに付ける、呼び名の札。
 *
 * 素材を上げる口（`src/app/api/pages/upload`・ロゴ）は台帳の行を引かずに置くので、
 * ページの目印（id）が手元に無い。呼び名から作れる札を別に 1 枚持ち、上げた直後にこれで落とす。
 * 札の長さは 256 バイトまでなので、呼び名はそのまま載せずに短い指紋にする。
 */
/**
 * 札で落とすときに、同じ実行環境のメモリの控えも捨てる人たち。
 * 画像の変換（`src/lib/page-images/transform.ts`）が読み込まれたときに名乗りを上げる。
 * ここから変換の部品を読み込まない（変換の部品は画像の道具を連れてくるので、本文だけの入口や検査表が重くなる）。
 */
const memoryForgetters = new Set<(tag: string) => void>();
export function onCacheTagExpired(forget: (tag: string) => void): void {
  memoryForgetters.add(forget);
}
function forgetInMemory(tag: string): void {
  for (const forget of memoryForgetters) forget(tag);
}

export function pageAssetTag(organization: OrganizationScope, pageSlug: string): string {
  // 材料は素材の鍵の頭と同じ（組織の置き場の頭 + 呼び名）。別の組織の同じ呼び名の札と混ざらない。
  // 最初の組織 は頭が空なので、札は今までと同じ
  return `assets-${createHash("sha256").update(`${shelfOf(organization)}${pageSlug}`).digest("hex").slice(0, 24)}`;
}

/**
 * 素材を上げ直したあと、配信が覚えている目印（etag）の控えを落とす。
 *
 * 落とすのは実行環境の控えだけ（配信網には社内の素材を載せていない）。
 * 手元・検査では控えが無いので、呼んでも何もしない。
 */
export async function expirePageAssets(organization: OrganizationScope, pageSlug: string): Promise<void> {
  forgetInMemory(pageAssetTag(organization, pageSlug));
  try {
    await getCache().expireTag(pageAssetTag(organization, pageSlug));
  } catch {
    // 手元・検査では実行環境の控えが無い
  }
}

/**
 * 版の目印を ETag にする。40 桁の形はそのまま（計算の材料を変えない）。
 *
 * 本文 HTML は差し込む道具箱の印と、額縁の id 付け替えの印も足す。
 * 版が同じでも部品や殻が新しいときは 304 にせず、古い紙を握ったままにしない。
 * 素材の実応答は保管庫のETagを使う（過去版の代替素材も内容で区別する）。
 */
export function pageEtag(versionId: string, shell: "html" | "asset" = "asset", restricted = false, organization = ""): string {
  const id = versionId.toLowerCase();
  // 札に書いた組織の名前とロゴ（src/lib/pages/content.ts の widgetOrganizationStamp・最初の組織 は空）は札の違い
  const variant = organization;
  if (shell === "html" && isPersonalEdition()) return `"${id}-${COMMENTS_WIDGET_STAMP}-${HTML_SHELL_STAMP}-${DOCUMENT_POLICY_STAMP}${variant}"`;
  // 仕掛けを絞る組織の本文は実行制限の頭が付くので、許す組織の紙と別の札にする。304 は頭を運ばないので、
  // 札を分けないと、切り替える前に控えた「制限なし」の紙を 304 で使い続けてしまう。許す組織（最初の組織）の札は今までと同じ
  if (shell === "html" && restricted) return `"${id}-${COMMENTS_WIDGET_STAMP}-${HTML_SHELL_STAMP}-${DOCUMENT_POLICY_STAMP}-r${variant}"`;
  return shell === "html" ? `"${id}-${COMMENTS_WIDGET_STAMP}-${HTML_SHELL_STAMP}${variant}"` : `"${id}"`;
}

/** ブラウザが持っている版と、いま出す版が同じか。 */
export function etagMatches(request: Request, etag: string): boolean {
  const raw = request.headers.get("if-none-match");
  if (raw === null) return false;
  return raw.split(",").some((part) => part.trim() === etag);
}

/**
 * 配信の頭を 1 か所で付ける。
 *
 * 公開の紙にだけ札を書く。社内の応答に札を付けても配信網には載せないが、
 * 付けない方が「社内は載せない」が頭だけ見ても分かる。
 */
export function applyDeliveryHeaders(
  headers: Headers,
  input: {
    cacheControl: string;
    pageId: string | null;
    etag: string | null;
    preload: string | null;
  },
): Headers {
  headers.set("cache-control", input.cacheControl);
  if (input.etag !== null) headers.set("etag", input.etag);
  if (input.pageId !== null && input.cacheControl.includes("s-maxage")) {
    headers.set("Vercel-Cache-Tag", pageCacheTag(input.pageId));
  }
  if (input.preload !== null) headers.set("Link", input.preload);
  return headers;
}

/** 版が同じなら本文も素材も運ばない。門を通したあとで呼ぶこと。 */
export function notModifiedResponse(input: {
  cacheControl: string;
  pageId: string | null;
  etag: string;
}): Response {
  const headers = new Headers();
  applyDeliveryHeaders(headers, {
    cacheControl: input.cacheControl,
    pageId: input.pageId,
    etag: input.etag,
    preload: null,
  });
  return new Response(null, { status: 304, headers });
}

/**
 * 照合して、同じ版なら 304。違う／持っていないときは null。
 *
 * 短い版の指定（先頭 7 桁）では照合しない。ETag はフルの目印なので、
 * 短い指定をそのまま札にすると、当たっても別の版を「同じ」と言ってしまう。
 */
export function ifFresh(
  request: Request,
  cacheControl: string,
  pageId: string | null,
  versionId: string | null,
  shell: "html" | "asset" = "asset",
  restricted = false,
  organization = "",
): Response | null {
  if (versionId === null) return null;
  const etag = pageEtag(versionId, shell, restricted, organization);
  if (!etagMatches(request, etag)) return null;
  return notModifiedResponse({ cacheControl, pageId, etag });
}

/** 本文の応答。id の付け替えと道具の先読みもここで付ける（差し込みのあとで呼ぶ）。 */
export function htmlResponse(
  html: string,
  input: {
    cacheControl: string;
    pageId: string | null;
    etag: string | null;
    origin?: string;
    /** 仕掛けの扱い（組織の設定・src/lib/html/document-security.ts の scriptDeliveryFor）。渡さなければ配布版だけ制限（今までどおり） */
    scripts?: ScriptDelivery;
    /** 札に書いた組織の名前とロゴの印（src/lib/pages/content.ts の widgetOrganizationStamp）。照合の印に混ぜる */
    organization?: string;
  },
): Response {
  const t = requestTranslate();
  const cacheControl = input.cacheControl;
  const scripts = input.scripts ?? { restricted: isPersonalEdition(), blocked: false };
  // 組織の設定で仕掛けを止めたページには、上端に 1 行（src/lib/html/script-notice.ts）
  const page = withScriptPreload(withSafeAnchorIds(withPageImages(scripts.blocked ? withScriptNotice(html, t) : html, {version: input.etag ?? undefined, origin: input.origin})));
  const headers = new Headers({ "content-type": "text/html; charset=utf-8" });
  if (scripts.restricted) {
    headers.set("content-security-policy", documentPolicy(page, scripts.origin ?? input.origin));
    headers.set("referrer-policy", "no-referrer");
    headers.set("x-content-type-options", "nosniff");
  }
  applyDeliveryHeaders(headers, {
    cacheControl,
    pageId: input.pageId,
    etag: input.etag === null ? null : pageEtag(input.etag, "html", scripts.restricted, input.organization),
    preload: scriptPreloadHeader(page),
  });
  return new Response(page, { headers });
}

/** A single range is sufficient for browser media. Multi-range and unknown units
 * deliberately receive the complete 200 representation, never a fake 206. */
function assetRange(raw: string | null, size: number): AssetRange | null | "unsatisfiable" {
  if (raw === null || !/^bytes=/i.test(raw.trim()) || raw.includes(",")) return null;
  const match = /^bytes=(\d*)-(\d*)$/i.exec(raw.trim());
  if (!match || (!match[1] && !match[2]) || size === 0) return "unsatisfiable";
  if (!match[1]) {
    const suffix = Number(match[2]);
    return suffix > 0 ? { start: Math.max(0, size - suffix), end: size - 1 } : "unsatisfiable";
  }
  const start = Number(match[1]);
  const end = match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
  return start < size && end >= start ? { start, end } : "unsatisfiable";
}

/** Called only after the same view gate as the owning page. The body remains an
 * upstream stream; no range is implemented by buffering or skipping a full file. */
export async function assetResponse(
  request: Request,
  asset: AssetHit,
  input: {
    cacheControl: string;
    pageId: string | null;
  },
): Promise<Response> {
  const headers = new Headers({
    "content-type": asset.contentType,
    "x-content-type-options": "nosniff",
    "accept-ranges": "bytes",
  });
  headers.set("content-security-policy", "sandbox; default-src 'none'; style-src 'unsafe-inline'");
  if (Number.isFinite(asset.uploadedAt.getTime())) headers.set("last-modified", asset.uploadedAt.toUTCString());
  applyDeliveryHeaders(headers, {
    cacheControl: input.cacheControl,
    pageId: input.pageId,
    etag: asset.etag,
    preload: null,
  });
  const conditional = request.headers.get("if-none-match");
  if (conditional?.split(",").some(value => value.trim() === "*" || value.trim().replace(/^W\//, "") === asset.etag)) {
    return new Response(null, { status: 304, headers });
  }
  const ifRange = request.headers.get("if-range");
  // Mutable assets can change twice within a second. Last-Modified is not a
  // strong validator here: date-only or weak If-Range falls back to a full 200.
  const range = request.method === "GET" && (ifRange === null || (!ifRange.startsWith("W/") && ifRange === asset.etag))
    ? assetRange(request.headers.get("range"), asset.size) : null;
  if (range === "unsatisfiable") {
    headers.set("content-range", `bytes */${asset.size}`);
    headers.set("content-length", "0");
    headers.set("cache-control", "private, no-store");
    headers.delete("vercel-cache-tag");
    return new Response(null, { status: 416, headers });
  }
  headers.set("content-length", String(range ? range.end - range.start + 1 : asset.size));
  if (range) headers.set("content-range", `bytes ${range.start}-${range.end}/${asset.size}`);
  if (request.method === "HEAD" || asset.size === 0) return new Response(null, { headers });
  try {
    const stream = await asset.open(range, request.signal);
    return new Response(stream, { status: range ? 206 : 200, headers });
  } catch {
    return new Response(rt("errors.delivery.assetReadFailed"), {
      status: 502, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "private, no-store" },
    });
  }
}

// ---------------------------------------------------------------------------
// 実行環境の本文控え（門を通ったあとだけ使う）
// ---------------------------------------------------------------------------

const HTML_MAX = 1_800_000;
const HTML_TTL = 60 * 60 * 24;
const HTML_NS = "page-html";

function htmlCache(): RuntimeCache | null {
  try {
    return getCache({ namespace: HTML_NS });
  } catch {
    return null;
  }
}

function htmlKey(pageId: string, versionId: string): string {
  return `${pageId}:${versionId}`;
}

/**
 * いま出す版の本文。版の目印が鍵なので、直したら自然に外れる。
 *
 * 控えが無い／置けないときは、渡された取り寄せをそのまま使う。
 * 手元や検査では実行環境の控えが無いので、いつも取り寄せになる。
 */
export async function rememberPageHtml(
  pageId: string,
  versionId: string,
  load: () => Promise<string | null>,
): Promise<string | null> {
  const cache = htmlCache();
  const key = htmlKey(pageId, versionId);
  if (cache !== null) {
    try {
      const hit = await cache.get(key);
      if (typeof hit === "string") return hit;
    } catch {
      // 読めなくても配る（取り寄せに落とす）
    }
  }

  const html = await load();
  if (cache !== null && html !== null && html.length <= HTML_MAX) {
    try {
      await cache.set(key, html, {
        name: "page-html",
        tags: [pageCacheTag(pageId)],
        ttl: HTML_TTL,
      });
    } catch {
      // 置けなくても配る
    }
  }
  return html;
}

/**
 * 投稿した本文を、読むより先に控える。
 *
 * 直した直後の「最初の 1 人」が保管庫の大きな本文を取りに行かなくて済む。
 * 置けなくても次に読まれたときに取りに行くだけなので、失敗は配信を止めない。
 */
export async function warmPageHtml(
  pageId: string,
  versionId: string,
  html: string,
): Promise<void> {
  if (html.length > HTML_MAX) return;
  const cache = htmlCache();
  if (cache === null) return;
  try {
    await cache.set(htmlKey(pageId, versionId), html, {
      name: "page-html",
      tags: [pageCacheTag(pageId)],
      ttl: HTML_TTL,
    });
  } catch {
    // 温められなくても、次に読まれたときに取りに行く
  }
}

/**
 * 配信網に残っているそのページの紙を落とす。
 *
 * 公開をやめたときも、本文を直したときも、同じ札を消す。
 * 消すのは「古いまま配り続ける」を止めるためで、次の 1 人が取り直す。
 * 手元や検査では配信網が無いので、呼んでも何もしない。
 */
export async function dropPageDelivery(pageId: string): Promise<void> {
  try {
    await dangerouslyDeleteByTag(pageCacheTag(pageId));
  } catch {
    // 手元・検査では配信網が無い
  }
  // 実行環境の控え（素材の目印の控え）も同じ札で落とす。本文の控えは版の目印が鍵なので、落ちても取り直すだけ
  forgetInMemory(pageCacheTag(pageId));
  try {
    await getCache().expireTag(pageCacheTag(pageId));
  } catch {
    // 手元・検査では実行環境の控えが無い
  }
}
