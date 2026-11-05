import { getCache } from "@vercel/functions";
import type { Config } from "tailwindcss-v3";

import { isDeckHtml } from "../deck/deck";
import {
  FIRST_PAINT_STAMP,
  tailwindPlan,
  withNonBlockingFonts,
  withPrecompiledTailwind,
  type TailwindConfig,
} from "./first-paint";
import { featureAvailable } from "../settings/features";
import { diagramPrerenderOn } from "./diagrams";
import vendorStamps from "../../../vendor/stamp.json";
import { CLEAN_COPY_LOOK_STAMP } from "../settings/clean-copy-look";

/**
 * 本文を描く前の待ちを外す差し込みの、外の世界に触る側（指定を作る・控える）。
 *
 * 付け替えの形と「手を出してよいページか」の判断は src/lib/first-paint/first-paint.ts。
 * ここは、出来上がりの指定を**ブラウザの道具と同じ版の Tailwind**で作り、
 * 版の目印ごとに実行環境へ控えるだけ。
 *
 * **失敗しても配る。** 作れない・控えられないときは、付け替えずに今までどおりの
 * 本文を返す（遅いだけで、見た目は変わらない）。
 */

const CSS_NS = "page-first-paint";
const CSS_TTL = 60 * 60 * 24 * 7;
/** これより大きい本文は作りに行かない（本文の控えの上限と同じ）。 */
const HTML_MAX = 1_800_000;
const CSS_MAX = 400_000;
const SOURCE = "@tailwind base;@tailwind components;@tailwind utilities;";

/** 値だけの設定は、読み取り器（parseLiteral）と鍵の許可表を通ったものしか来ない。 */
function asConfig(html: string, config: TailwindConfig): Config {
  return Object.assign<Config, TailwindConfig>({ content: [{ raw: html, extension: "html" }] }, config);
}

/**
 * ページ 1 枚ぶんの指定を作る。ブラウザの道具と同じく、本文全体を材料にする
 * （インラインのスクリプトに書かれたクラスも拾う）。
 */
export async function compileTailwind(html: string, config: TailwindConfig): Promise<string | null> {
  try {
    const [{ default: postcss }, { default: tailwind }] = await Promise.all([import("postcss"), import("tailwindcss-v3")]);
    const result = await postcss([tailwind(asConfig(html, config))]).process(SOURCE, { from: undefined });
    return result.css.length > 0 && result.css.length <= CSS_MAX ? result.css : null;
  } catch {
    return null;
  }
}

/** 版の目印・差し込みの形・道具の版のどれが変わっても、別の控えになる。 */
function cssKey(pageId: string, versionId: string): string {
  // 清書は配信のときに見た目を付け替えるので、写しを上げたら作り直す（src/lib/settings/clean-copy-look.ts）
  return `${pageId}:${versionId}:${FIRST_PAINT_STAMP}:${vendorStamps["tailwind.js"].stamp}:${CLEAN_COPY_LOOK_STAMP}`;
}

async function rememberCss(pageId: string, versionId: string, make: () => Promise<string | null>): Promise<string | null> {
  let cache: ReturnType<typeof getCache> | null = null;
  try {
    cache = getCache({ namespace: CSS_NS });
    const hit = await cache.get(cssKey(pageId, versionId));
    if (typeof hit === "string") return hit;
  } catch {
    // 手元・検査では実行環境の控えが無い。毎回作る
  }
  const css = await make();
  if (cache !== null && css !== null) {
    try {
      await cache.set(cssKey(pageId, versionId), css, { name: CSS_NS, ttl: CSS_TTL });
    } catch {
      // 置けなくても配る
    }
  }
  return css;
}

/**
 * 配る直前の本文（道具の行き先を付け替えたあと）に、描画を待たせない差し込みをする。
 *
 * スライドと動画には手を出さない——どちらも書体と図の準備を自分の実行部が測って
 * 進める作りで、読み込みの順を変えると「時間切れで元の書体に落ちる」側に倒れる。
 * 見た目の指定の先回り（Tailwind・書体）は個人用の配布版では対象外（src/lib/settings/features.ts の台帳。本文ごとに実行制限を
 * 計算していて、差し込みの形が合わない）。図の下描きだけは配布版でも当てる（src/lib/first-paint/diagrams.ts）。
 */
export async function withFastFirstPaint(page: string, key: { pageId: string; versionId: string }): Promise<string> {
  if (isDeckHtml(page)) return page;
  const styled = featureAvailable("first-paint") ? await withTailwindFirstPaint(page, key) : page;
  // 図のページは、サーバーで描いておいた図を置き、図の道具を描画のあとで読む（src/lib/first-paint/diagram-prerender.ts）。
  // 配布版でも動く（差し込むスクリプトは決まった 1 本で、実行制限が字の一致で許す）。スイッチが切れている・控えに無ければ今までどおり
  if (!diagramPrerenderOn()) return styled;
  const { withDiagramFirstPaint } = await import("./diagram-prerender");
  return withDiagramFirstPaint(styled, key);
}

async function withTailwindFirstPaint(page: string, key: { pageId: string; versionId: string }): Promise<string> {
  const out = withNonBlockingFonts(page);
  if (out.length > HTML_MAX) return out;
  const plan = tailwindPlan(out);
  if (plan === null) return out;
  const css = await rememberCss(key.pageId, key.versionId, () => compileTailwind(page, plan.config));
  return css === null ? out : withPrecompiledTailwind(out, plan, css);
}
