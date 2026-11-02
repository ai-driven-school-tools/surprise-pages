import sharp from "sharp";
import { createHash } from "node:crypto";
import { getCache, waitUntil } from "@vercel/functions";
import { z } from "zod";
import { ARCHIVE_MARK, assetHitOf, shelfOf, type AssetHit } from "../pages/assets";
import type { OrganizationScope } from "../organization/scope";
import { isDeckMediaAssetPath } from "../deck/edit/assets";
import { DECK_LOGO_ASSET_PREFIX } from "../deck/media/logo";
import { onCacheTagExpired } from "../pages/cache";
import { rt } from "../i18n/request";
import { PAGE_IMAGE_WIDTHS, PAGE_IMAGE_BLUR_WIDTH, PAGE_IMAGE_QUALITY, PAGE_IMAGE_BLUR_QUALITY, PAGE_IMAGE_MAX_BYTES, PAGE_IMAGE_WIDTH_PARAM, PAGE_IMAGE_QUALITY_PARAM, PAGE_IMAGE_REVISION } from "./contract";

/**
 * 社内・公開切替・過去版の画像を、門の内側で軽くして配る。
 *
 * ## 控えの 3 段（docs/design/page-images.md）
 *
 *   1. この実行環境のメモリ（同じ実行環境に来た次の要求）
 *   2. 実行環境の控え（Runtime Cache。同じ地域の実行環境が共有する。30 日・容量で押し出される）
 *   3. 原画像（保管庫から取り寄せて変換する）
 *
 * **原画像は 1 度しか開かない。** 1 つの幅が無ければ、その画像の全部の幅を一括で作って控える
 * （一覧・縦並び・発表で違う幅を要るたびに、同じ原画像を取り寄せて開き直さない）。
 *
 * **保管庫への問い合わせ（HEAD）も毎回しない。** 素材の目印（etag・大きさ・種類）を呼び名ごとに控え、
 * 次からはその目印で変換の控えを引く。中身のハッシュが名前になった素材と凍結した過去版の写しは
 * 変わらないので長く、上書きされうる素材は短く持ち、上げ直した口（`expirePageAssets`）と
 * 投稿（`dropPageDelivery`）が札で落とす。控えから開くときも `If-Match` を添えるので、
 * 万一古い目印で開けば失敗して取り直す（古い中身が出ることはない）。
 *
 * **権限の確認は省かない。** `peekPageImage` は控えを読むだけで、保管庫には触れない。
 * 門と並べて走らせてよいが、返すかどうかを決めるのは門（呼び出し側）で、門を通らなければ捨てる。
 */

export type ImageVariant = { width: number; quality: number };

const variantSchema = z.object({
  width: z.coerce.number().int().refine(value => [...PAGE_IMAGE_WIDTHS, PAGE_IMAGE_BLUR_WIDTH, 0].includes(value)),
  quality: z.coerce.number().int().refine(value => [PAGE_IMAGE_QUALITY, PAGE_IMAGE_BLUR_QUALITY].includes(value)),
});

/** 要求が指す幅と画質。幅の指定が無ければ null（原画像のまま）、形が違えば "invalid"。 */
export function imageVariantOf(request: Request): ImageVariant | null | "invalid" {
  const url = new URL(request.url);
  if (!url.searchParams.has(PAGE_IMAGE_WIDTH_PARAM)) return null;
  const parsed = variantSchema.safeParse({ width: url.searchParams.get(PAGE_IMAGE_WIDTH_PARAM), quality: url.searchParams.get(PAGE_IMAGE_QUALITY_PARAM) ?? PAGE_IMAGE_QUALITY });
  return parsed.success ? parsed.data : "invalid";
}

/** 1 つの原画像から一括で作る幅の並び。HTML が書く組み合わせ（`pageImageUrl`）と同じ。 */
const LADDER: readonly ImageVariant[] = [
  { width: 0, quality: PAGE_IMAGE_QUALITY },
  { width: PAGE_IMAGE_BLUR_WIDTH, quality: PAGE_IMAGE_BLUR_QUALITY },
  ...PAGE_IMAGE_WIDTHS.map(width => ({ width, quality: PAGE_IMAGE_QUALITY })),
];

const DAY = 86_400;
/** 変換した写し。鍵に原画像の目印が入るので、長く持っても古いものは引けない。 */
const VARIANT_TTL = 30 * DAY;
/** 上書きされうる素材の目印。札で落とすが、落とし損ねても 1 時間で切れる。 */
const META_TTL_MUTABLE = 3_600;
const META_TTL_IMMUTABLE = 30 * DAY;
/** 上書きされうる素材の目印をメモリに置く長さ。メモリは札で落とせないので短く。 */
const META_MEMORY_MUTABLE_MS = 60_000;
const META_MEMORY_IMMUTABLE_MS = 24 * 3_600_000;
const META_MEMORY_MAX = 1024;
/** 同時に変換する数と、順番を待てる数。待ち切れない分だけ原画像に落とす。 */
const MAX_RUNNING = 4;
const MAX_WAITING = 32;
/** 原画像の取り寄せと変換の上限。要求ごとの中断には結ばない（同じ画像を待つ別の要求が巻き込まれる）。 */
const FAMILY_TIMEOUT_MS = 60_000;
/** まとめて作る幅を 1 度の読み解きで賄える画素数。超える原画像は幅ごとに読み解く（メモリを守る）。 */
const RAW_DECODE_MAX_PIXELS = 16_000_000;
const LIMIT_INPUT_PIXELS = 80_000_000;

const storedVariantSchema = z.union([
  z.object({ data: z.string().max(2_000_000), type: z.literal("image/webp") }),
  z.object({ original: z.literal(true) }),
]);
const storedMetaSchema = z.object({
  key: z.string().min(1),
  etag: z.string().min(1),
  size: z.number().int().nonnegative(),
  contentType: z.string().min(1),
  uploadedAt: z.string(),
  immutable: z.boolean(),
  tags: z.array(z.string()),
});
type StoredMeta = z.infer<typeof storedMetaSchema>;
/** 変換の答え。写し（WebP）か、「この幅は原画像のまま出す」の印。 */
type Variant = Buffer | "original";

function cache() {
  try { return getCache({ namespace: "page-image" }); } catch { return null; }
}

/**
 * 実行環境の控えへの書き込みは応答を待たせない（`waitUntil`。Next の `after` と同じ働きで、関数の寿命の中で
 * 応答のあとも走らせる）。Vercel の外（手元・検査）では待ち受けが無く、約束だけがその場で続く。
 * 書けなくても配る（次に読まれたときに作り直すだけ）。
 */
function later(work: Promise<void>): void {
  const settled = work.catch(() => { /* optional */ });
  try { waitUntil(settled); } catch { /* 待ち受けが無い環境 */ }
}

// ---------------------------------------------------------------------------
// 1 段目: この実行環境のメモリ
// ---------------------------------------------------------------------------

const memory = new Map<string, Variant>();
let memoryBytes = 0;
const MAX_MEMORY = 24 * 1024 * 1024;
function keep(key: string, data: Variant) {
  const length = data === "original" ? 0 : data.length;
  if (length > 1_000_000) return;
  const existing = memory.get(key);
  if (existing !== undefined) memoryBytes -= existing === "original" ? 0 : existing.length;
  memory.delete(key);
  while (memoryBytes + length > MAX_MEMORY || memory.size >= 1024) {
    const first = memory.keys().next().value;
    if (first === undefined) break;
    const gone = memory.get(first);
    memoryBytes -= gone === undefined || gone === "original" ? 0 : gone.length;
    memory.delete(first);
  }
  memory.set(key, data); memoryBytes += length;
}
function recall(key: string): Variant | undefined {
  const hit = memory.get(key);
  if (hit === undefined) return undefined;
  memory.delete(key); memory.set(key, hit);
  return hit;
}

const metaMemory = new Map<string, { meta: StoredMeta; until: number; tags: readonly string[] }>();
function keepMeta(pathname: string, meta: StoredMeta, tags: readonly string[]) {
  metaMemory.delete(pathname);
  while (metaMemory.size >= META_MEMORY_MAX) {
    const first = metaMemory.keys().next().value;
    if (first === undefined) break;
    metaMemory.delete(first);
  }
  metaMemory.set(pathname, { meta, until: Date.now() + (meta.immutable ? META_MEMORY_IMMUTABLE_MS : META_MEMORY_MUTABLE_MS), tags });
}

/**
 * 札で、この実行環境のメモリにある目印を落とす（実行環境の控えは札の持ち主が落とす）。
 * 上げ直した口・投稿と同じ実行環境で配っていたときに、60 秒の窓を待たせない。
 */
export function forgetImageSourcesTagged(tag: string): void {
  for (const [pathname, held] of metaMemory) if (held.tags.includes(tag)) metaMemory.delete(pathname);
}
onCacheTagExpired(forgetImageSourcesTagged);

// ---------------------------------------------------------------------------
// 鍵
// ---------------------------------------------------------------------------

/**
 * 控えの置き場所の名前。要求の道筋の頭に**組織の置き場の頭**（`shelfOf`・最初の組織 は空）を付ける。
 * 道筋（`/internal/…`）は組織をまたいで同じになりうるので、道筋だけで引くと、別の組織の同じ呼び名の画像の控えに当たる。
 * 最初の組織 は頭が空なので、控えの名前は今までと同じ。
 */
export function imagePlaceOf(organization: OrganizationScope, request: Request): string {
  return `${shelfOf(organization)}${new URL(request.url).pathname}`;
}

const metaKeyOf = (pathname: string) => `meta:${PAGE_IMAGE_REVISION}:${pathname}`;
const familyOf = (pathname: string, etag: string) => createHash("sha256").update(JSON.stringify([PAGE_IMAGE_REVISION, pathname, etag])).digest("hex");
const variantKeyOf = (family: string, variant: ImageVariant) => `${family}:${variant.width}:${variant.quality}`;

/**
 * 置き場所の名前から、中身が変わらない素材かを知る。
 * 中身のハッシュが名前になったスライド画像・1 度しか置かれないロゴ・凍結した過去版の写しは変わらない。
 * 過去版の URL でも、写しが無くていまの素材に落ちたときは**いまの素材の置き場所**で判断する。
 */
export function immutableAssetKey(key: string): boolean {
  if (key.includes(`/${ARCHIVE_MARK}/`)) return true;
  const tail = key.split("/").slice(-2).join("/");
  return isDeckMediaAssetPath(tail) || (tail.startsWith(DECK_LOGO_ASSET_PREFIX) && tail.length > DECK_LOGO_ASSET_PREFIX.length);
}

// ---------------------------------------------------------------------------
// 2 段目: 実行環境の控え
// ---------------------------------------------------------------------------

async function readMeta(pathname: string): Promise<StoredMeta | null> {
  const held = metaMemory.get(pathname);
  if (held !== undefined) {
    if (held.until > Date.now()) return held.meta;
    metaMemory.delete(pathname);
  }
  try {
    const parsed = storedMetaSchema.safeParse(await cache()?.get(metaKeyOf(pathname)));
    if (parsed.success) { keepMeta(pathname, parsed.data, parsed.data.tags); return parsed.data; }
  } catch { /* 読めなくても配る（保管庫に聞き直すだけ） */ }
  return null;
}

/** 保管庫に問い合わせた目印を控える。保管庫から来た実物（置き場所を持つもの）だけ。 */
export function rememberImageSource(pathname: string, asset: AssetHit, tags: readonly string[]): void {
  if (asset.key === undefined) return;
  const meta: StoredMeta = {
    key: asset.key, etag: asset.etag, size: asset.size, contentType: asset.contentType,
    uploadedAt: asset.uploadedAt.toISOString(), immutable: immutableAssetKey(asset.key), tags: [...tags],
  };
  keepMeta(pathname, meta, meta.tags);
  const store = cache();
  if (store !== null) later(store.set(metaKeyOf(pathname), meta, { ttl: meta.immutable ? META_TTL_IMMUTABLE : META_TTL_MUTABLE, tags: meta.tags, name: "page-image-meta" }));
}

/** 控えていた目印が古かった（開けなかった）。捨てて問い合わせ直す。 */
export async function forgetImageSource(pathname: string): Promise<void> {
  metaMemory.delete(pathname);
  try { await cache()?.delete(metaKeyOf(pathname)); } catch { /* optional */ }
}

async function readVariant(key: string): Promise<Variant | null> {
  const held = recall(key);
  if (held !== undefined) return held;
  try {
    const hit = storedVariantSchema.safeParse(await cache()?.get(key));
    if (hit.success) {
      const data: Variant = "original" in hit.data ? "original" : Buffer.from(hit.data.data, "base64");
      keep(key, data);
      return data;
    }
  } catch { /* 控えの不調で絵が読めなくならないように */ }
  return null;
}

function writeVariant(key: string, data: Variant): void {
  keep(key, data);
  if (data !== "original" && data.length > 1_000_000) return;
  const store = cache();
  if (store !== null) later(store.set(key, data === "original" ? { original: true } : { data: data.toString("base64"), type: "image/webp" }, { ttl: VARIANT_TTL, name: "page-image" }));
}

function sourceOf(meta: StoredMeta): AssetHit {
  return assetHitOf(meta.key, { contentType: meta.contentType, size: meta.size, etag: meta.etag, uploadedAt: new Date(meta.uploadedAt) });
}

function variantHit(key: string, data: Buffer, uploadedAt: Date): AssetHit {
  return {
    contentType: "image/webp", size: data.length, etag: `"image-${createHash("sha256").update(key).digest("hex").slice(0, 40)}"`, uploadedAt,
    open: async range => new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(range ? data.subarray(range.start, range.end + 1) : data); controller.close(); } }),
  };
}

export type ImagePeek = {
  /** 控えにあった写し。これを返してよいかは門が決める */
  variant: AssetHit | null;
  /** 控えていた目印から開ける原画像（保管庫に問い合わせずに済む）。無ければ問い合わせる */
  source: AssetHit | null;
};

/**
 * 控えだけを見る（保管庫にも台帳にも触れない）。門より先に始めてよいが、
 * **答えを返すのは門を通ってから**。門が閉じたら捨てる。
 * 幅の指定が無い要求（原画像）や形の違う要求では何も見ない。
 */
export async function peekPageImage(organization: OrganizationScope, request: Request): Promise<ImagePeek | null> {
  const variant = imageVariantOf(request);
  if (variant === null || variant === "invalid") return null;
  const pathname = imagePlaceOf(organization, request);
  const meta = await readMeta(pathname);
  if (meta === null) return { variant: null, source: null };
  const source = sourceOf(meta);
  const key = variantKeyOf(familyOf(pathname, meta.etag), variant);
  const data = await readVariant(key);
  if (data === null) return { variant: null, source };
  if (data === "original") return { variant: variant.width === PAGE_IMAGE_BLUR_WIDTH ? null : source, source };
  return { variant: variantHit(key, data, source.uploadedAt), source };
}

// ---------------------------------------------------------------------------
// 3 段目: 原画像を取り寄せて、全部の幅を一括で作る
// ---------------------------------------------------------------------------

/** libvips does not report APNG frame counts; inspect PNG chunks before decoding. */
function isAnimatedPng(bytes: Buffer): boolean {
  if (!bytes.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex"))) return false;
  for (let at = 8; at + 12 <= bytes.length;) {
    const length = bytes.readUInt32BE(at);
    if (length > bytes.length - at - 12) return false;
    const name = bytes.toString("ascii", at + 4, at + 8);
    if (name === "acTL") return true;
    if (name === "IDAT" || name === "IEND") return false;
    at += length + 12;
  }
  return false;
}

/** 変換の列。同時に動かす数を絞り、あふれた分は順番を待つ。待ち切れない分だけ null。 */
let running = 0;
const waiting: (() => void)[] = [];
function schedule<T>(work: () => Promise<T>): Promise<T | null> | null {
  if (running >= MAX_RUNNING && waiting.length >= MAX_WAITING) return null;
  return new Promise<T | null>(resolve => {
    const start = () => {
      running += 1;
      work().then(resolve, () => resolve(null)).finally(() => { running -= 1; waiting.shift()?.(); });
    };
    if (running < MAX_RUNNING) start(); else waiting.push(start);
  });
}

type FamilyResult = { variants: Map<string, Variant> } | { stale: true } | null;
const flights = new Map<string, Promise<FamilyResult>>();

async function readWhole(asset: AssetHit, signal: AbortSignal): Promise<Buffer | null> {
  const stream = await asset.open(null, signal);
  const reader = stream.getReader();
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    for (;;) {
      const item = await reader.read(); if (item.done) break;
      size += item.value.byteLength;
      if (size > PAGE_IMAGE_MAX_BYTES) { await reader.cancel(); return null; }
      chunks.push(item.value);
    }
  } finally { reader.releaseLock(); }
  return Buffer.concat(chunks);
}

async function generateFamily(family: string, asset: AssetHit, wanted: ImageVariant): Promise<FamilyResult> {
  const signal = AbortSignal.timeout(FAMILY_TIMEOUT_MS);
  let input: Buffer | null;
  // 開けないのは目印が古い（上書きされた）か保管庫の不調。どちらも控えを疑って問い合わせ直す
  try { input = await readWhole(asset, signal); } catch { return { stale: true }; }
  if (input === null) return null;
  const pairs = LADDER.some(item => item.width === wanted.width && item.quality === wanted.quality) ? LADDER : [...LADDER, wanted];
  const variants = new Map<string, Variant>();
  const store = (variant: ImageVariant, data: Variant) => {
    const key = variantKeyOf(family, variant);
    variants.set(key, data);
    writeVariant(key, data);
  };
  // 動く画像は 1 コマも落とさない。どの幅も原画像のまま（待機画像は出さない）
  const animated = isAnimatedPng(input) || ((await sharp(input, { animated: true, limitInputPixels: LIMIT_INPUT_PIXELS }).metadata()).pages ?? 1) > 1;
  if (animated) {
    for (const variant of pairs) store(variant, "original");
    return { variants };
  }
  const probe = await sharp(input, { limitInputPixels: LIMIT_INPUT_PIXELS }).metadata();
  const pixels = (probe.width ?? 0) * (probe.height ?? 0);
  // 1 度だけ読み解いて、そこから全部の幅を作る。大きすぎる原画像だけ幅ごとに読み解く
  const decoded = pixels > 0 && pixels <= RAW_DECODE_MAX_PIXELS
    ? await sharp(input, { limitInputPixels: LIMIT_INPUT_PIXELS }).rotate().raw().toBuffer({ resolveWithObject: true })
    : null;
  const open = () => decoded === null
    ? sharp(input, { limitInputPixels: LIMIT_INPUT_PIXELS }).rotate()
    : sharp(decoded.data, { raw: { width: decoded.info.width, height: decoded.info.height, channels: decoded.info.channels, premultiplied: decoded.info.premultiplied } });
  for (const variant of pairs) {
    const pipeline = open();
    if (variant.width > 0) pipeline.resize({ width: variant.width, withoutEnlargement: true });
    const data = await pipeline.webp({ quality: variant.quality, effort: 4 }).toBuffer();
    // 元から軽い原画像を、ふつうの幅のために重くしない（待機画像だけは小さければよい）
    store(variant, variant.width !== PAGE_IMAGE_BLUR_WIDTH && data.length >= input.length ? "original" : data);
  }
  return { variants };
}

/**
 * 門を通ったあとに呼ぶ（控えに当たるときも、HEAD でも）。
 *
 * 返すのは写し（WebP）か、原画像（変換できない・軽くならない・混み合って待ち切れない）か、
 * 待機画像が作れないときの 204 か、形の違う要求への 400。控えていた目印で原画像を開けなかったときは
 * "stale"——呼び出し側が目印を捨てて問い合わせ直す。
 */
export async function transformPageImage(organization: OrganizationScope, request: Request, asset: AssetHit): Promise<AssetHit | Response | "stale"> {
  const variant = imageVariantOf(request);
  if (variant === null) return asset;
  if (variant === "invalid") return new Response(rt("errors.delivery.imageSizeInvalid"), { status: 400, headers: { "cache-control": "private, no-store" } });
  // A failed tiny preview must not download a second full-size original.
  const fallback = () => variant.width === PAGE_IMAGE_BLUR_WIDTH
    ? new Response(null, { status: 204, headers: { "cache-control": "private, no-store" } }) : asset;
  if (!/^image\/(png|jpeg|webp|avif)$/.test(asset.contentType) || asset.size > PAGE_IMAGE_MAX_BYTES) return fallback();
  const pathname = imagePlaceOf(organization, request);
  const family = familyOf(pathname, asset.etag);
  const key = variantKeyOf(family, variant);
  const held = await readVariant(key);
  if (held === "original") return fallback();
  if (held !== null) return variantHit(key, held, asset.uploadedAt);
  let job = flights.get(family);
  if (job === undefined) {
    const scheduled = schedule(() => generateFamily(family, asset, variant));
    // 待ち切れないほど混み合っている。原画像はそのまま読める
    if (scheduled === null) return fallback();
    job = scheduled.finally(() => { flights.delete(family); });
    flights.set(family, job);
  }
  const result = await job;
  if (result === null) return fallback();
  if ("stale" in result) return "stale";
  const data = result.variants.get(key);
  if (data === undefined || data === "original") return fallback();
  return variantHit(key, data, asset.uploadedAt);
}
