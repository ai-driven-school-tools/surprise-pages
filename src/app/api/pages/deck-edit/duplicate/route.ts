import { createHash } from "node:crypto";
import { copy } from "@vercel/blob";
import { z } from "zod";
import { currentIdentity, isMember } from "@/lib/identity/identity";
import { jsonError, jsonResponse, serverError } from "@/lib/api";
import { commitRevision, nestedPageSlugs, pageRefOf, readHtmlOf, StaleBaseError, RevisionRaceError } from "@/lib/pages/store";
import { archivePrefix, assetKey, assetPrefix, listAssetsUnder, outsideNestedBranches } from "@/lib/pages/assets";
import { loadEditablePage } from "@/lib/access/page-edit-access";
import { sameOriginRequest } from "@/lib/access/request-security";
import { isDeckHtml } from "@/lib/deck/deck";
import { routeLog } from "@/lib/logging/server-log";
import { currentOrganization } from "@/lib/organization/scope";
import { rt } from "@/lib/i18n/request";
import { defaultTranslate } from "@/lib/i18n/default";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const duplicateRequestSchema = z.object({
  requestId: z.uuid(),
  page: z.string().min(1).max(400),
  versionId: z.string().regex(/^[a-f0-9]{40}$/),
}).strict();

function escapeText(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * 道具箱の ⋯ の「この資料を複製」。いまのスライドを、新しい資料（`internal/decks/<id>`）へまるごと写す。
 *
 * - 本文は送らせず、元の資料をサーバーが「直せる人の門」を通して読む（任意の HTML を受け取らない）。写せるのは直せる人だけ。
 * - 画面に出ている版がいまの版のときだけ写す（古い版を写さない）。
 * - 素材は元のいまの素材だけを、同じ相対パスのまま非公開で写す（過去の版の凍結と入れ子のページの素材は除く）。
 *   本文の相対パスは配信時の `<base>` が支えるので、本文は題名のほかは書き換えない。コメントと履歴は写さない。
 * - 置き場所はスライドの作成と同じ決め方（依頼の ID から決まる）。同じ依頼を送り直しても 2 つ作らない。
 */
export async function POST(request: Request): Promise<Response> {
  return routeLog("/api/pages/deck-edit/duplicate", request, async () => {
    const organization = await currentOrganization();
    const origin = request.headers.get("origin");
    if ((origin && !sameOriginRequest(request)) || request.headers.get("sec-fetch-site") === "cross-site")
      return jsonError(rt("deckEditor.api.createHere"), 403);
    const viewer = await currentIdentity();
    if (!isMember(viewer)) return jsonError(rt("deckEditor.api.loginRequired"), 401);
    try {
      const raw = await request.text();
      if (raw.length > 1024) return jsonError(rt("deckEditor.api.createTooLarge"), 413);
      const value = duplicateRequestSchema.safeParse(JSON.parse(raw));
      if (!value.success) return jsonError(rt("deckEditor.api.createCheck"), 400);

      const id = createHash("sha256").update(`${viewer.email.toLowerCase()}\0duplicate\0${value.data.requestId}`).digest("hex").slice(0, 32);
      const pageSlug = `internal/decks/${id}`, url = `/internal/decks/${id}?edit=1`;
      const existing = await loadEditablePage(organization, viewer, pageSlug);
      if (existing.ok) {
        if (existing.page.createdBy?.toLowerCase() !== viewer.email.toLowerCase()) return jsonError(rt("deckEditor.api.createTarget"), 409);
        return jsonResponse({ url }, 200);
      }
      if (existing.response.status !== 404) return existing.response;

      // 元の資料。直せない資料は、無い資料と同じ断り（あるかどうかも教えない）
      const sourceGate = await loadEditablePage(organization, viewer, value.data.page);
      const source = sourceGate.ok ? sourceGate.page : null;
      const ref = source ? pageRefOf(source.pageSlug) : null;
      if (source === null || ref === null) return jsonError(rt("deckEditor.api.duplicateMissing"), 404);
      if (source.currentVersionId !== value.data.versionId) return jsonError(rt("deckEditor.api.duplicateStale"), 409);
      const html = await readHtmlOf(source);
      if (html === null || !isDeckHtml(html)) return jsonError(rt("deckEditor.api.duplicateNotDeck"), 400);

      const prefix = assetPrefix(organization, ref.slugPrefix, ref.slug);
      const frozenRoot = archivePrefix(organization, ref.slugPrefix, ref.slug);
      const outside = outsideNestedBranches(organization, await nestedPageSlugs(organization, source.pageSlug));
      const live = (await listAssetsUnder(prefix)).filter((asset) => !asset.pathname.startsWith(frozenRoot) && outside(asset.pathname));
      for (const asset of live) {
        const rel = asset.pathname.slice(prefix.length).split("/");
        // 写しは常に非公開。置き場所は依頼 ID で決まるので、途中で止まった送り直しは自分の写しを上書きしてよい
        await copy(asset.pathname, assetKey(organization, "internal", ["decks", id, ...rel]), { access: "private", addRandomSuffix: false, allowOverwrite: true });
      }

      const title = defaultTranslate("deckEditor.duplicate.titleCopy", { title: source.title });
      const copied = html.replace(/<title>[\s\S]*?<\/title>/i, () => `<title>${escapeText(title)}</title>`);
      try {
        await commitRevision({
          organization,
          pageSlug,
          html: copied,
          message: defaultTranslate("deckEditor.history.duplicated", { title: source.title }),
          author: { email: viewer.email, name: viewer.name },
          expectedHead: null,
        });
      } catch (error) {
        if (!(error instanceof StaleBaseError || error instanceof RevisionRaceError)) throw error;
        const created = await loadEditablePage(organization, viewer, pageSlug);
        if (!created.ok || created.page.createdBy?.toLowerCase() !== viewer.email.toLowerCase()) throw error;
      }
      return jsonResponse({ url }, 201);
    } catch (error) {
      if (error instanceof SyntaxError) return jsonError(rt("deckEditor.api.createCheck"), 400);
      return serverError(error);
    }
  });
}
