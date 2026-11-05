import { z } from "zod";
import { currentIdentity, isMember } from "@/lib/identity/identity";
import { jsonError, jsonResponse, serverError } from "@/lib/api";
import { loadEditablePage } from "@/lib/access/page-edit-access";
import { sameOriginRequest } from "@/lib/access/request-security";
import { copyClipboardMedia, crossesToPublic, openClipboardSource } from "@/lib/deck/media/clipboard-media";
import { DECK_CLIPBOARD_MEDIA_MAX } from "@/lib/deck/edit/clipboard";
import { routeLog } from "@/lib/logging/server-log";
import { currentOrganization } from "@/lib/organization/scope";
import { rt } from "@/lib/i18n/request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const clipboardRequestSchema = z.object({
  page: z.string().min(1).max(400),
  source: z.string().min(1).max(400),
  /** 写しの中の素材の参照。素材の無い写しでも、元を読めるかを確かめるために送る（空でよい）。 */
  references: z.array(z.string().min(1).max(1000)).max(DECK_CLIPBOARD_MEDIA_MAX),
  /** 招待した人だけの資料の中身を、門なし公開の資料へ入れることを、貼る人が了承した。 */
  acknowledgePublic: z.boolean().optional(),
}).strict();

/**
 * 別の資料からコピーした枚・要素を貼る前の窓口（src/lib/deck/media/clipboard-media.ts）。
 * 貼り先は直せる資料だけ（`loadEditablePage`）、元は見られる資料だけ（`openPage` → `canViewPage`）。
 * 別の資料からの貼り付けは素材の有無に関わらずここを通る。素材（画像・動画・音声）を貼り先へ写して在り処を返す。
 * 本文の保存はいつもの編集の操作が行う（任意の HTML をここで保存しない）。
 * 招待した人だけの資料から門なし公開の資料へは、了承（acknowledgePublic）が無ければ 409 で止め、画面に確かめさせる。
 */
export async function POST(request: Request): Promise<Response> {
  return routeLog("/api/pages/deck-edit/clipboard", request, async () => {
    const organization = await currentOrganization();
    const origin = request.headers.get("origin");
    if ((origin && !sameOriginRequest(request)) || request.headers.get("sec-fetch-site") === "cross-site")
      return jsonError(rt("deckEditor.api.createHere"), 403);
    const viewer = await currentIdentity();
    if (!isMember(viewer)) return jsonError(rt("deckEditor.api.loginRequired"), 401);
    try {
      const raw = await request.text();
      if (raw.length > 600_000) return jsonError(rt("deckStudio.clipboardApi.tooLarge"), 413);
      const value = clipboardRequestSchema.safeParse(JSON.parse(raw));
      if (!value.success) return jsonError(rt("deckStudio.clipboardApi.invalid"), 400);
      const gate = await loadEditablePage(organization, viewer, value.data.page);
      if (!gate.ok) return gate.response;
      // 見られない資料は、無い資料と同じ断り（あるかどうかも教えない）
      const source = await openClipboardSource(organization, viewer, value.data.source);
      if (source === null) return jsonError(rt("deckStudio.clipboardApi.missing"), 404);
      if (crossesToPublic(source, gate.page) && !value.data.acknowledgePublic)
        return jsonResponse({ error: rt("deckStudio.clipboardApi.publicConsent"), code: "publicConsent" }, 409);
      const done = await copyClipboardMedia(organization, source, gate.page, value.data.references);
      if (!done.ok) return jsonError(rt("deckStudio.clipboardApi.missing"), 404);
      return jsonResponse({ sources: done.sources }, 200);
    } catch (error) {
      if (error instanceof SyntaxError) return jsonError(rt("deckStudio.clipboardApi.invalid"), 400);
      return serverError(error);
    }
  });
}
