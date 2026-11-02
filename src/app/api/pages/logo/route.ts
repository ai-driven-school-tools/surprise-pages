import { put } from "@vercel/blob";
import { canEditPage, hasOwnerGrant, isAdmin, openPage } from "@/lib/access/access";
import { jsonError, jsonResponse, serverError } from "@/lib/api";
import { assetContentType, assetKey } from "@/lib/pages/assets";
import { currentIdentity, isMember } from "@/lib/identity/identity";
import { imageDimensions } from "@/lib/html/image-dimensions";
import { DECK_LOGO_ASSET_PREFIX } from "@/lib/deck/media/logo";
import { pageRefOf } from "@/lib/pages/store";
import { expirePageAssets } from "@/lib/pages/cache";
import { routeLog } from "@/lib/logging/server-log";
import { currentOrganization } from "@/lib/organization/scope";
import { rt } from "@/lib/i18n/request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MB = 1024 * 1024;
const MAX_LOGO_BYTES = 10 * MB;
const IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif", "image/svg+xml", "image/avif"]);

function extensionOf(fileName: string): string | null {
  const found = /\.(png|jpe?g|webp|gif|svg|avif)$/i.exec(fileName.trim());
  return found === null ? null : found[1].toLowerCase().replace("jpeg", "jpg");
}

/** Browser-only logo upload. It uses page edit permission and never accepts the publishing credential. */
export async function POST(request: Request): Promise<Response> {
  return routeLog("/api/pages/logo", request, async () => {
    const organization=await currentOrganization();
    const viewer = await currentIdentity();
    if (!isMember(viewer)) return jsonError(rt("decks.server.loginRequired"), 401);

    const params = new URL(request.url).searchParams;
    const page = pageRefOf(params.get("page"));
    if (page === null) return jsonError(rt("decks.server.pageInvalid"), 400);
    const extension = extensionOf(params.get("name") ?? "");
    if (extension === null) return jsonError(rt("decks.server.logoType"), 400);
    const contentType = assetContentType(`logo.${extension}`);
    if (contentType === null || !IMAGE_TYPES.has(contentType)) return jsonError(rt("decks.server.logoType"), 400);

    try {
      const gate = await openPage(organization, viewer, page.pageSlug);
      if (!gate.ok) return jsonError(rt("decks.server.pageNotFound"), 404);
      const [admin, ownerGrant] = await Promise.all([
        isAdmin(gate.page.organization, viewer),
        gate.page.visibility === "restricted" ? hasOwnerGrant(gate.page.organization, gate.page.id, viewer.email) : Promise.resolve(false),
      ]);
      if (!canEditPage(viewer, gate.page, admin, ownerGrant)) {
        return jsonError(rt("decks.server.pageNotFound"), 404);
      }

      const declared = Number(request.headers.get("content-length") ?? "");
      if (Number.isFinite(declared) && declared > MAX_LOGO_BYTES) return jsonError(rt("decks.server.logoTooLarge"), 400);
      if (request.body === null) return jsonError(rt("decks.server.imageMissing"), 400);
      const buffer = await request.arrayBuffer();
      if (buffer.byteLength > MAX_LOGO_BYTES) return jsonError(rt("decks.server.logoTooLarge"), 400);
      const dimensions = imageDimensions(new Uint8Array(buffer), contentType);
      if (dimensions === null) return jsonError(rt("decks.server.imageSize"), 400);
      // 組織の素材の容量の上限
      const relativePath = `${DECK_LOGO_ASSET_PREFIX}${crypto.randomUUID()}.${extension}`;
      await put(assetKey(gate.page.organization, page.slugPrefix, [...page.slug, ...relativePath.split("/")]), buffer, {
        access: "private",
        allowOverwrite: false,
        addRandomSuffix: false,
        multipart: false,
        contentType,
      });
      await expirePageAssets(gate.page.organization, page.pageSlug);

      return jsonResponse({
        asset: { path: relativePath, contentType, intrinsicWidth: dimensions.width, intrinsicHeight: dimensions.height },
        size: buffer.byteLength,
      }, 201);
    } catch (error) {
      return serverError(error);
    }
  });
}
