import { pinTheme, copyThemeToPage, themeFingerprint, ThemeError } from "@/lib/deck/design/theme-store";
import { createHash } from "node:crypto";
import { deckCreateRequestSchema } from "@/lib/deck/create-model";
import { currentIdentity, currentBrowserIdentity, isMember } from "@/lib/identity/identity";
import { jsonError, jsonResponse, serverError } from "@/lib/api";
import {
  commitRevision,
  StaleBaseError,
  RevisionRaceError,
} from "@/lib/pages/store";
import { loadEditablePage } from "@/lib/access/page-edit-access";
import { newDeckDocument } from "@/lib/deck/new-document";
import { sameOriginRequest } from "@/lib/access/request-security";
import { routeLog } from "@/lib/logging/server-log";
import { currentOrganization } from "@/lib/organization/scope";
import { rt, requestTranslate } from "@/lib/i18n/request";
import { localizedMessage } from "@/lib/i18n/errors";
import { defaultTranslate } from "@/lib/i18n/default";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Browser creation is create-only: it cannot choose a path, overwrite, or publish externally. */
export async function POST(request: Request): Promise<Response> {
  return routeLog("/api/pages/deck-edit/create", request, async () => {
    const organization=await currentOrganization();
    const origin = request.headers.get("origin");
    if (
      (origin && !sameOriginRequest(request)) ||
      request.headers.get("sec-fetch-site") === "cross-site"
    )
      return jsonError(rt("deckEditor.api.createHere"), 403);
    const viewer = await currentIdentity();
    if (!isMember(viewer)) return jsonError(rt("deckEditor.api.loginRequired"), 401);
    try {
      const raw = await request.text();
      if (raw.length > 1024) return jsonError(rt("deckEditor.api.createTooLarge"), 413);
      const value = deckCreateRequestSchema.safeParse(JSON.parse(raw));
      if (!value.success) return jsonError(rt("deckEditor.api.createCheck"), 400);
      const id = createHash("sha256")
        .update(`${viewer.email.toLowerCase()}\0${value.data.requestId}`)
        .digest("hex")
        .slice(0, 32);
      const pageSlug = `internal/decks/${id}`,
        url = `/internal/decks/${id}?edit=1`;
      const existing = await loadEditablePage(organization, viewer, pageSlug);
      if (existing.ok) {
        if (existing.page.createdBy?.toLowerCase() !== viewer.email.toLowerCase())
          return jsonError(rt("deckEditor.api.createTarget"), 409);
        return jsonResponse({ url }, 200);
      }
      if (existing.response.status !== 404) return existing.response;
      // 組織の資料の数の上限。テーマの素材を写す前に断る（積む口 commitRevision も同じ判定を通る）
      const theme=value.data.myTheme;
      if(theme){const browser=await currentBrowserIdentity();if(!browser||browser.email.toLowerCase()!==viewer.email.toLowerCase())return jsonError(rt("deckEditor.api.loginRequired"),401);}
      const row=theme?await pinTheme(viewer.email,value.data.requestId,themeFingerprint(value.data),theme):null;
      const resolved=row?{snapshot:await copyThemeToPage(organization,row,pageSlug,value.data.requestId),stamp:{id:row.theme_id,version:row.version,name:row.name}}:undefined;
      try {
        await commitRevision({
          organization,
          pageSlug,
          html: await newDeckDocument({themeId: value.data.themeId, title: value.data.title, firstSlide: value.data.firstSlide, myTheme:value.data.myTheme},resolved),
          message: defaultTranslate("deckEditor.history.created"),
          author: { email: viewer.email, name: viewer.name },
          expectedHead: null,
        });
      } catch (error) {
        if (!(
          error instanceof StaleBaseError || error instanceof RevisionRaceError
        ))
          throw error;
        const created = await loadEditablePage(organization, viewer, pageSlug);
        if (!created.ok || created.page.createdBy?.toLowerCase() !== viewer.email.toLowerCase()) throw error;
      }
      return jsonResponse({ url }, 201);
    } catch (error) {
      if(error instanceof ThemeError)return jsonResponse({error:localizedMessage(error,requestTranslate()),code:error.code},error.status);
      if (error instanceof SyntaxError)
        return jsonError(rt("deckEditor.api.createCheck"), 400);
      return serverError(error);
    }
  });
}
