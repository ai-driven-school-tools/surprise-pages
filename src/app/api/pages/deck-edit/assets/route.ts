import { saveOptimizedImage, DeckImageInputError } from "@/lib/deck/media/image-optimize";
import { jsonError, jsonResponse, serverError } from "@/lib/api";
import { currentIdentity, isMember } from "@/lib/identity/identity";
import { loadEditablePage } from "@/lib/access/page-edit-access";
import { pageRefOf } from "@/lib/pages/store";
import { assetContentType } from "@/lib/pages/assets";
import { imageDimensions } from "@/lib/html/image-dimensions";
import { DECK_EDIT_IMAGE_MAX_BYTES } from "@/lib/deck/edit/assets";
import {recordDeckImage} from "@/lib/deck/media/image-catalog";
import { routeLog } from "@/lib/logging/server-log";
import { currentOrganization } from "@/lib/organization/scope";
import { rt } from "@/lib/i18n/request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Browser image upload goes through exactly the same edit gate as text. */
export async function POST(request: Request): Promise<Response> {
  return routeLog("/api/pages/deck-edit/assets", request, async () => {
    const organization=await currentOrganization();
    const viewer = await currentIdentity();
    if (!isMember(viewer)) return jsonError(rt("deckEditor.api.loginRequired"),401);
    const params = new URL(request.url).searchParams;
    const ref = pageRefOf(params.get("page"));
    const match = /\.(png|jpe?g|webp|gif|avif)$/i.exec(params.get("name") ?? "");
    if (!ref) return jsonError(rt("deckEditor.api.invalidPage"),400);
    if (!match) return jsonError(rt("deckEditor.api.imageFormats"),400);
    const extension = match[1].toLowerCase().replace("jpeg","jpg");
    const contentType = assetContentType(`image.${extension}`);
    if (!contentType) return jsonError(rt("deckEditor.api.imageType"),400);
    try {
      const gate = await loadEditablePage(organization,viewer,ref.pageSlug);
      if (!gate.ok) return gate.response;
      if (!request.body) return jsonError(rt("deckEditor.api.imageMissing"),400);
      const chunks: Uint8Array[] = [];
      const reader = request.body.getReader();
      let size = 0;
      while (true) {
        const next = await reader.read();
        if (next.done) break;
        size += next.value.byteLength;
        if (size > DECK_EDIT_IMAGE_MAX_BYTES) { await reader.cancel(); return jsonError(rt("deckEditor.api.imageLimit"),413); }
        chunks.push(next.value);
      }
      const bytes = Buffer.concat(chunks);
      const dimensions = imageDimensions(bytes,contentType);
      if (!dimensions) return jsonError(rt("deckEditor.api.imageUnreadable"),400);
      const saved=await saveOptimizedImage(gate.page.organization,ref.pageSlug,bytes,contentType);
      await recordDeckImage(gate.page,viewer.email,saved,"upload",{title:params.get("name")}).catch(()=>undefined);
      return jsonResponse(saved,201);
    } catch(error) { if(error instanceof DeckImageInputError)return jsonError(error.message,400);return serverError(error); }
  });
}
