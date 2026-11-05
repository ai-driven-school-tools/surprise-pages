import { createHash, createHmac, timingSafeEqual } from "node:crypto";

import { waitUntil } from "@vercel/functions";
import { z } from "zod";

import { DIAGRAM_STAMP, diagramPlan, diagramPrerenderOn, withPrerenderedDiagrams } from "./diagrams";
import { siteOrigin } from "../settings/site-settings";
import { logEvent } from "../logging/server-log";
import vendorStamps from "../../../vendor/stamp.json";

/**
 * 図のページに、サーバーで描いておいた図を置く（配信の側。描く側は src/lib/first-paint/diagram-render.ts・
 * 差し込みの形は src/lib/first-paint/diagrams.ts）。
 *
 * **描くのは版ごとに 1 回だけ。** 描いた絵は版の目印ごとに画像の置き場（Vercel Blob・必ず非公開）へ 1 つの JSON で控え、
 * 見るたびには描かない。この実行環境のメモリにも写しを持ち、置き場を読むのは実行環境ごとに版ごと 1 回。
 * 控えに無ければ**その回は今までどおり配り**、図を描く API（`DIAGRAM_RENDER_PATH`）に描くのを頼む（応答を待たない）。
 * 投稿の直後に開いた最初の 1 人は今までどおりで、次からは図が先に出る。描けなかった版は「描けなかった」を控え、
 * しばらく（`FAILURE_RETRY_MS`）頼み直さない（ブラウザを起こし続けない）。
 * Chromium を本文の入口（/internal・/public）の関数に同梱しないために、描くのは別の関数（図を描く API）にする。
 *
 * 図を描く API に渡すのは本文そのものと鍵で、**このサーバーが署名した許可**（`AUTH_SECRET` から用途の名前で導いた鍵・
 * 本文の指紋と鍵に結ぶ・1 分）が無ければ描かない（外から好きな HTML を描かせない・控えを書き換えさせない）。
 * 頼む先はサイトの宛先（`PAGES_SITE_URL`）だけ——要求の Host から決めない（よその宛先へ本文を送らせない）。
 *
 * 機能のスイッチ `PAGES_DIAGRAM_PRERENDER=on` のときだけ動く（docs/guides/feature-switches.md）。切れていれば何もしない。
 * 失敗しても配る。控えが読めない・描けない・頼めないときは、今までどおりの本文を返す。
 */

/** 図を描く API の道筋（src/app/api/pages/diagrams/route.ts）。 */
export const DIAGRAM_RENDER_PATH = "/api/pages/diagrams";
/** 頼むときの Authorization の頭。 */
const SCHEME = "PagesDiagram";
const LEASE_PURPOSE = "pages/diagram-render-v1";
const LEASE_MS = 60_000;

/** これより大きい本文は描かない（本文の控えの上限と同じ）。 */
export const DIAGRAM_HTML_MAX = 1_800_000;
/** 同じ実行環境で、描くのを頼んでから次に頼み直すまで（描けなかった・控えに届いていない版に頼み続けない）。 */
const RETRY_MS = 10 * 60 * 1000;
/** 描けなかった版を、もう一度描きに行くまで。 */
export const FAILURE_RETRY_MS = 6 * 60 * 60 * 1000;
/** 置き場に無かった版を、同じ実行環境で読み直すまで（見るたびに置き場を読まない）。 */
const MISS_MEMO_MS = 30_000;
/** 本文を配る側が置き場を待つ上限。遅ければ今までどおり配る。 */
const READ_TIMEOUT_MS = 1_500;
const MEMORY_MAX = 64;
/** 置き場の鍵の頭。ページの素材（`<visibility>/<slug>/…`）とは別の棚。 */
const BLOB_PREFIX = "_diagrams/";

const KEY = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}):([0-9a-f]{40}):([0-9a-z]+):([0-9a-z]+)$/;

/** 版の目印・差し込みの形・図の道具の版のどれが変わっても、別の控えになる。 */
export function diagramKey(pageId: string, versionId: string): string {
  return `${pageId.toLowerCase()}:${versionId.toLowerCase()}:${DIAGRAM_STAMP}:${vendorStamps["mermaid.js"].stamp}`;
}

/** 鍵からページの目印と置き場の鍵を出す。形の違う鍵は null（置き場の鍵を外から作らせない）。 */
function keyParts(key: string): { pageId: string; blob: string } | null {
  const match = KEY.exec(key);
  if (match === null) return null;
  return { pageId: match[1], blob: `${BLOB_PREFIX}${match[1]}/${match[2]}.${match[3]}.${match[4]}.json` };
}

function digestOf(html: string): string {
  return createHash("sha256").update(html).digest("base64url");
}

const leaseSchema = z.object({
  key: z.string().regex(KEY),
  digest: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  created: z.number().int(),
  expires: z.number().int(),
}).strict();
type Lease = z.infer<typeof leaseSchema>;

function sign(body: string): string {
  const secret = process.env["AUTH_SECRET"];
  if (!secret) throw new Error("AUTH_SECRET is not configured");
  return createHmac("sha256", secret).update(`${LEASE_PURPOSE}\0`).update(body).digest("base64url");
}

function issueLease(lease: Lease): string {
  const body = Buffer.from(JSON.stringify(leaseSchema.parse(lease))).toString("base64url");
  return `${body}.${sign(body)}`;
}

function readLease(raw: string, now: number): Lease | null {
  if (raw.length > 4096) return null;
  const parts = raw.split(".");
  if (parts.length !== 2 || !/^[A-Za-z0-9_-]+$/.test(parts[0]) || !/^[A-Za-z0-9_-]{43}$/.test(parts[1])) return null;
  try {
    // 署名は文字のまま比べる。base64url の最後の 1 文字は下 2 ビットが余りで、バイトに戻して比べると余りだけ違う別の書き方も通ってしまう
    const signature = Buffer.from(parts[1]);
    const expected = Buffer.from(sign(parts[0]));
    if (signature.length !== expected.length || !timingSafeEqual(signature, expected)) return null;
    const lease = leaseSchema.parse(JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8")));
    return lease.created <= now + 30_000 && lease.expires > now && lease.expires - lease.created <= LEASE_MS ? lease : null;
  } catch {
    return null;
  }
}

const renderSchema = z.object({ sources: z.array(z.string()), light: z.array(z.string()), dark: z.array(z.string()) }).strict();
const failedSchema = z.object({ failed: z.literal(true), at: z.number().int() }).strict();
const recordSchema = z.union([renderSchema, failedSchema]);
/** 控えの 1 件。描いた絵か、描けなかった印（いつ描けなかったか）。 */
export type DiagramRecord = z.infer<typeof recordSchema>;

// ここ（実行環境のメモリ）に置くのは、版の目印が鍵の図の絵だけ（誰が開いても同じもの・本文の控えと同じ）。
// 入れ物は globalThis に 1 つ。組み立ての道具は入口ごとにこのファイルの写しを持つので、モジュールの変数では、
// 図を描く API が置いた絵を同じ実行環境の本文の入口が読めない
const MEMORY_SLOT = Symbol.for("pages.diagram-renders");
type Memory = { records: Map<string, DiagramRecord>; missed: Map<string, number>; asked: Map<string, number> };
const memory: Memory = (() => {
  const held: unknown = Reflect.get(globalThis, MEMORY_SLOT);
  if (typeof held === "object" && held !== null && "records" in held && held.records instanceof Map
    && "missed" in held && held.missed instanceof Map && "asked" in held && held.asked instanceof Map) {
    return { records: held.records, missed: held.missed, asked: held.asked };
  }
  const made: Memory = { records: new Map(), missed: new Map(), asked: new Map() };
  Reflect.set(globalThis, MEMORY_SLOT, made);
  return made;
})();

function bounded<V>(map: Map<string, V>, key: string, value: V, max: number): void {
  map.delete(key);
  map.set(key, value);
  while (map.size > max) {
    const oldest = map.keys().next().value;
    if (oldest === undefined) break;
    map.delete(oldest);
  }
}

function remember(key: string, record: DiagramRecord): void {
  memory.missed.delete(key);
  bounded(memory.records, key, record, MEMORY_MAX);
}

/** 描けなかった印が、まだ頼み直さない間のものか。 */
function freshFailure(record: DiagramRecord, now: number): boolean {
  return "failed" in record && now - record.at < FAILURE_RETRY_MS;
}

function timeout(ms: number): Promise<null> {
  return new Promise((resolve) => setTimeout(() => resolve(null), ms));
}

/** 置き場から読む。無い・読めない・形が違うときは null。 */
async function readStored(blob: string): Promise<DiagramRecord | null> {
  // 置き場の部品は使うときに読む（本文の入口の読み込みを重くしない・置き場を差し替えた検査でも組み立てられる）
  const { BlobNotFoundError, get } = await import("@vercel/blob");
  try {
    const result = await get(blob, { access: "private", useCache: false });
    if (!result || result.statusCode !== 200) return null;
    const read = recordSchema.safeParse(JSON.parse(await new Response(result.stream).text()));
    return read.success ? read.data : null;
  } catch (error) {
    if (!(error instanceof BlobNotFoundError)) logEvent({ level: "warn", event: "diagram.cache-read-failed", error });
    return null;
  }
}

/**
 * 控え。無ければ null。`fresh` は置き場を必ず読み直す（図を描く API が二重に描かないための確かめ）。
 * 本文を配る側は置き場を `READ_TIMEOUT_MS` までしか待たない。
 */
export async function recallDiagrams(key: string, options: { fresh?: boolean } = {}): Promise<DiagramRecord | null> {
  const held = memory.records.get(key);
  if (held !== undefined && !options.fresh) return held;
  const parts = keyParts(key);
  if (parts === null) return null;
  const now = Date.now();
  const missed = memory.missed.get(key);
  if (!options.fresh && missed !== undefined && now - missed < MISS_MEMO_MS) return null;
  const stored = options.fresh ? await readStored(parts.blob) : await Promise.race([readStored(parts.blob), timeout(READ_TIMEOUT_MS)]);
  if (stored === null) {
    bounded(memory.missed, key, now, 1_000);
    return null;
  }
  remember(key, stored);
  return stored;
}

/** 描いた絵（か、描けなかった印）を控える。置けなくても、この実行環境のメモリには残る。 */
export async function keepDiagrams(key: string, record: DiagramRecord): Promise<void> {
  const parts = keyParts(key);
  if (parts === null) return;
  remember(key, record);
  try {
    const { put } = await import("@vercel/blob");
    await put(parts.blob, JSON.stringify(record), {
      access: "private",
      contentType: "application/json",
      addRandomSuffix: false,
      allowOverwrite: true,
    });
  } catch (error) {
    logEvent({ level: "warn", event: "diagram.cache-write-failed", error });
  }
}

/** 鍵のページの目印（図を描き終えたあと、配信網の古い紙を落とすため）。 */
export function diagramPageId(key: string): string | null {
  return keyParts(key)?.pageId ?? null;
}

/** 頼みの中身（図を描く API が読む形）。 */
export type DiagramRenderRequest = { key: string; html: string };

/** 図を描く API が受けた頼みを確かめる（許可の署名・期限・本文の指紋と鍵への結びつき）。合わなければ null。 */
export function readDiagramRenderRequest(authorization: string | null, body: unknown, now: number = Date.now()): DiagramRenderRequest | null {
  if (authorization === null || !authorization.startsWith(`${SCHEME} `)) return null;
  const granted = readLease(authorization.slice(SCHEME.length + 1), now);
  if (granted === null || typeof body !== "object" || body === null || Array.isArray(body)) return null;
  const key: unknown = Reflect.get(body, "key");
  const html: unknown = Reflect.get(body, "html");
  if (typeof key !== "string" || typeof html !== "string" || html.length > DIAGRAM_HTML_MAX) return null;
  if (key !== granted.key || digestOf(html) !== granted.digest) return null;
  return { key, html };
}

/** 図を描く API に描くのを頼む。応答（202・204）だけを待ち、描き終わりは待たない。頼めたか。 */
export async function requestDiagramRender(origin: string, key: string, html: string, send: typeof fetch = fetch): Promise<boolean> {
  const now = Date.now();
  let token: string;
  try {
    token = issueLease({ key, digest: digestOf(html), created: now, expires: now + LEASE_MS });
  } catch {
    // 鍵（AUTH_SECRET）の無い配置では頼まない
    return false;
  }
  try {
    const response = await send(new URL(DIAGRAM_RENDER_PATH, origin), {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `${SCHEME} ${token}` },
      body: JSON.stringify({ key, html }),
      redirect: "manual",
      signal: AbortSignal.timeout(15_000),
    });
    if (response.status === 202 || response.status === 204) return true;
    logEvent({ level: "warn", event: "diagram.request-refused", fields: { status: response.status } });
    return false;
  } catch (error) {
    logEvent({ level: "warn", event: "diagram.request-failed", error });
    return false;
  }
}

function configuredOrigin(): string | null {
  try { return siteOrigin(); } catch { return null; }
}

/**
 * 配る直前の本文（vendor の付け替えのあと）に、描いておいた図を置く。控えに無ければ描くのを頼んで、今までどおりの本文を返す。
 * `origin` は頼む先（既定はサイトの宛先）。null なら頼まない（検査）。
 */
export async function withDiagramFirstPaint(
  page: string,
  version: { pageId: string; versionId: string },
  options: { origin?: string | null; send?: typeof fetch } = {},
): Promise<string> {
  if (!diagramPrerenderOn() || page.length > DIAGRAM_HTML_MAX) return page;
  const plan = diagramPlan(page);
  if (plan === null) return page;
  const key = diagramKey(version.pageId, version.versionId);
  if (keyParts(key) === null) return page;
  const now = Date.now();
  const record = await recallDiagrams(key);
  if (record !== null && !("failed" in record)) return withPrerenderedDiagrams(page, plan, record);
  if (record !== null && freshFailure(record, now)) return page;
  const origin = options.origin === undefined ? configuredOrigin() : options.origin;
  const last = memory.asked.get(key);
  if (origin !== null && (last === undefined || now - last > RETRY_MS)) {
    bounded(memory.asked, key, now, 1_000);
    // 頼みは投げない（requestDiagramRender は失敗しても false を返す）。待ち受けの無い環境（検査）では約束だけが続く
    const asking = requestDiagramRender(origin, key, page, options.send ?? fetch);
    try { waitUntil(asking); } catch { /* 検査 */ }
  }
  return page;
}
