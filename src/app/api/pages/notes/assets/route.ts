import { z } from "zod";
import { jsonError, jsonResponse, serverError } from "@/lib/api";
import { loadEditablePage } from "@/lib/access/page-edit-access";
import { sameOriginRequest } from "@/lib/access/request-security";
import { isDeckHtml } from "@/lib/deck/deck";
import { DECK_EDIT_IMAGE_MAX_BYTES } from "@/lib/deck/edit/assets";
import { DeckImageInputError, saveOptimizedImage } from "@/lib/deck/media/image-optimize";
import { issueVideoLease, readVideoLease } from "@/lib/deck/media/video-lease";
import { cancelVideoUpload, finishVideoUpload, readUploadBytes, storeVideoChunk, VideoUploadConflictError, VideoUploadFormatError } from "@/lib/deck/media/video-storage";
import { DECK_VIDEO_CHUNK_BYTES, DECK_VIDEO_LEASE_MS, DECK_VIDEO_MAX_BYTES, videoChunkCount, videoUploadFinishSchema } from "@/lib/deck/media/video-upload";
import { imageDimensions } from "@/lib/html/image-dimensions";
import { rt } from "@/lib/i18n/request";
import { currentIdentity, isMember } from "@/lib/identity/identity";
import { routeLog } from "@/lib/logging/server-log";
import { isCleanCopyHtml, NOTE_IMAGE_NAME, NOTE_VIDEO_TYPES } from "@/lib/notes/model";
import { currentOrganization } from "@/lib/organization/scope";
import { assetContentType } from "@/lib/pages/assets";
import { pageRefOf, readHeadOf } from "@/lib/pages/store";
import { featureEnabled } from "@/lib/settings/features";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * メモ帳に落とした・貼った素材を受け取る口。**サーバーが中身を受け取って、必ず非公開で置く**
 * （ブラウザから保管庫へ直に上げさせない）。契約はスライドの素材の口と同じ部品を借りる:
 *
 *   画像 … 1 回で送る（POST・10MB まで）。軽量化して `_deck/media-<中身の指紋>.<形式>` に置く（src/app/api/pages/deck-edit/assets と同じ saveOptimizedImage）
 *   動画 … 2MB ずつ分けて最大 100MB（POST で受け取りの許可 → PUT で 1 片ずつ → PATCH で組み立て・DELETE でやめる）。
 *          置き場は `_deck/media-<uuid>.<形式>`（src/app/api/pages/deck-edit/media/upload と同じ）。サーバーで変換しない
 *
 * 置き場はどちらもそのページの下の上書きしない名前で、履歴の版からも同じ道筋で読める。
 * 門は本文の保存と同じ（loadEditablePage → canEditPage）。頭の版が清書の本文であるページにだけ置く。
 */
const streamStartSchema = z.object({ size: z.number().int().positive().max(DECK_VIDEO_MAX_BYTES), type: z.enum(NOTE_VIDEO_TYPES) }).strict();

const handle = (request: Request) => routeLog("/api/pages/notes/assets", request, () => run(request));

async function run(request: Request): Promise<Response> {
  if (!featureEnabled("notes")) return jsonError(rt("notes.server.notFound"), 404);
  const origin = request.headers.get("origin");
  if ((origin !== null && !sameOriginRequest(request)) || request.headers.get("sec-fetch-site") === "cross-site") {
    return jsonError(rt("notes.server.sendHere"), 403);
  }
  const organization = await currentOrganization();
  const viewer = await currentIdentity();
  if (!isMember(viewer)) return jsonError(rt("notes.server.loginRequired"), 401);
  const params = new URL(request.url).searchParams;
  const ref = pageRefOf(params.get("page"));
  if (ref === null) return jsonError(rt("notes.server.notFound"), 404);
  try {
    const gate = await loadEditablePage(organization, viewer, ref.pageSlug);
    if (!gate.ok) return gate.response;
    const head = await readHeadOf(gate.page);
    if (head === null || !isCleanCopyHtml(head.html) || isDeckHtml(head.html)) return jsonError(rt("notes.server.notFound"), 404);

    // 画像は 1 回で受け取る
    if (request.method === "POST" && params.has("name")) {
      const match = NOTE_IMAGE_NAME.exec(params.get("name") ?? "");
      if (match === null) return jsonError(rt("notes.server.unsupported"), 400);
      const contentType = assetContentType(`image.${match[1].toLowerCase().replace("jpeg", "jpg")}`);
      if (contentType === null) return jsonError(rt("notes.server.unsupported"), 400);
      const bytes = await readUploadBytes(request, DECK_EDIT_IMAGE_MAX_BYTES);
      if (imageDimensions(Buffer.from(bytes), contentType) === null) return jsonError(rt("notes.server.unreadableImage"), 400);
      const saved = await saveOptimizedImage(gate.page.organization, ref.pageSlug, bytes, contentType);
      return jsonResponse({ src: saved.src }, 201);
    }

    // 動画は分けて受け取る（受け取りの許可を出す）
    if (request.method === "POST") {
      const parsed = streamStartSchema.safeParse(JSON.parse(new TextDecoder().decode(await readUploadBytes(request, 4096))));
      if (!parsed.success) return jsonError(rt("notes.server.unsupported"), 400);
      const created = Date.now();
      const upload = issueVideoLease({ version: 1, id: crypto.randomUUID(), page: ref.pageSlug, owner: viewer.email, size: parsed.data.size, type: parsed.data.type, created, expires: created + DECK_VIDEO_LEASE_MS });
      return jsonResponse({ upload, chunkBytes: DECK_VIDEO_CHUNK_BYTES }, 201);
    }
    const lease = readVideoLease(request.headers.get("x-deck-upload"));
    if (lease === null || lease.page !== ref.pageSlug || lease.owner !== viewer.email) return jsonError(rt("notes.server.uploadExpired"), 403);
    if (request.method === "PUT") {
      const raw = params.get("chunk") ?? "";
      const index = Number(raw);
      const hash = params.get("hash") ?? "";
      if (!/^\d{1,3}$/.test(raw) || !Number.isInteger(index) || index < 0 || index >= videoChunkCount(lease) || !/^[a-f0-9]{64}$/.test(hash)) return jsonError(rt("notes.server.badRequest"), 400);
      await storeVideoChunk(gate.page.organization, lease, index, hash, await readUploadBytes(request, DECK_VIDEO_CHUNK_BYTES), request.signal);
      return jsonResponse({ received: index }, 200);
    }
    if (request.method === "DELETE") {
      await cancelVideoUpload(gate.page.organization, lease);
      return jsonResponse({ cancelled: true }, 200);
    }
    const finish = videoUploadFinishSchema.safeParse(JSON.parse(new TextDecoder().decode(await readUploadBytes(request, 16384))));
    if (!finish.success || finish.data.hashes.length !== videoChunkCount(lease)) return jsonError(rt("notes.server.badRequest"), 400);
    return jsonResponse({ src: await finishVideoUpload(gate.page.organization, lease, finish.data.hashes, request.signal) }, 201);
  } catch (error) {
    if (error instanceof VideoUploadConflictError) return jsonError(error.message, 409);
    if (error instanceof VideoUploadFormatError || error instanceof DeckImageInputError) return jsonError(error.message, 400);
    if (error instanceof RangeError) return jsonError(error.message, 413);
    if (error instanceof SyntaxError) return jsonError(rt("notes.server.badRequest"), 400);
    return serverError(error);
  }
}

export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
