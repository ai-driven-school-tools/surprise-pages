import { RestoredAssetError } from "@/lib/page-agent/assets";
import { jsonResponse, jsonError, serverError } from "@/lib/api";
import { currentIdentity, isMember } from "@/lib/identity/identity";
import { openPublicPage, openToolsPage } from "@/lib/access/access";
import { loadEditablePage } from "@/lib/access/page-edit-access";
import { agentPagePath } from "@/lib/page-agent/feature";
import { featureEnabled } from "@/lib/settings/features";
import {
  readHeadOf,
  RevisionRaceError,
  StaleBaseError,
} from "@/lib/pages/store";
import { readFileAt } from "@/lib/revisions/revisions";
import {
  parseSourceNote,
  withAssetBase,
  withSafeAnchorIds,
  withVendorScripts,
} from "@/lib/pages/content";
import { pageHrefOf } from "@/lib/pages/store";
import {
  agentRequestSchema,
  PAGE_AGENT_PROTOCOL,
} from "@/lib/page-agent/model";
import { readAgentDocument } from "@/lib/page-agent/source";
import {
  prepareAgentDraft,
  previewAgentDraft,
  verifyAgentDraft,
  applyAgentDraft,
  agentHistory,
  AgentEditError,
  agentEditErrorText,
} from "@/lib/page-agent/service";
import { prepareDeckEdit } from "@/lib/deck/edit/source";
import { listComments } from "@/lib/comments/comments";
import { DeckEditConflictError } from "@/lib/deck/edit/model";
import { z } from "zod";
import { routeLog } from "@/lib/logging/server-log";
import { currentOrganization } from "@/lib/organization/scope";
import { siteOrigin } from "@/lib/settings/site-settings";
import { localizedMessage } from "@/lib/i18n/errors";
import { deckErrorMessage } from "@/lib/deck/edit/message";
import { requestTranslate, rt } from "@/lib/i18n/request";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";
export async function GET(request: Request): Promise<Response> {
  return routeLog("/api/pages/agent", request, () => jsonResponse(
    {
      protocol: PAGE_AGENT_PROTOCOL,
      enabled: featureEnabled("page-agent"),
    },
    200,
  ));
}
export async function POST(request: Request): Promise<Response> {
  return routeLog("/api/pages/agent", request, async () => {
    const organization = await currentOrganization();
    const viewer = await currentIdentity();
    if (!isMember(viewer)) return jsonError(rt("toolbox.server.loginRequired"), 401);
    if (!featureEnabled("page-agent"))
      return jsonError(rt("toolbox.agent.disabled"), 503);
    try {
      if (request.headers.get("sec-fetch-site") === "cross-site")
        return jsonError(rt("toolbox.agent.crossSite"), 403);
      const raw = await request.text();
      if (Buffer.byteLength(raw) > 1024 * 1024)
        return jsonError(rt("toolbox.agent.tooLarge"), 413);
      const decoded:unknown=JSON.parse(raw);
      const input = agentRequestSchema.parse(decoded);
      let slug = input.page;
      if (slug.startsWith("http")) {
        const link = new URL(slug),
          origin = new URL(request.url).origin;
        let configured: string | null = null;
        try { configured = new URL(siteOrigin()).host; } catch { configured = null; }
        // リンクの宛先がこのサイトのときだけ通す（別のサイトのリンクから呼び名だけを取り出して読み書きしない）
        const allowed = link.origin === origin || link.host === configured;
        if (!allowed)
          throw new AgentEditError(
            "toolbox.agent.hostMismatch",
            "host_mismatch",
            400,
          );
        slug = decodeURIComponent(link.pathname).replace(/\/$/, "");
      }
      let gate;
      const target = agentPagePath(slug);
      if (target.kind === "public") {
        const publicGate=await openPublicPage(organization,target.segments);
        gate=publicGate.ok?await openToolsPage(organization,viewer,publicGate.page.pageSlug):publicGate;
      }
      else gate = await openToolsPage(organization, viewer, target.slug);
      if (!gate.ok) return jsonError(rt("toolbox.server.pageNotFound"), 404);
      const editable = await loadEditablePage(organization, viewer, gate.page.pageSlug);
      if (input.action !== "read" && !editable.ok) return editable.response;
      const page = gate.page;
      if (input.action === "read") {
        if (["detail", "source", "layout"].includes(input.view) && !input.target)
          throw new AgentEditError(
            "toolbox.agent.targetRequired",
            "target_required",
            400,
          );
        const head = await readHeadOf(page);
        if (!head) return jsonError(rt("toolbox.agent.noBody"), 404);
        const html = input.versionId
          ? await readFileAt(page, input.versionId)
          : head.html;
        if (html === null) return jsonError(rt("toolbox.agent.versionMissing"), 404);
        if (input.view === "layout") {
          const detail = readAgentDocument(html, { ...input, view: "detail" });
          const nodes = ("nodes" in detail ? detail.nodes : []) ?? [];
          return jsonResponse(
            {
              page: page.pageSlug,
              versionId: input.versionId ?? head.revision.versionId,
              previewHtml: withSafeAnchorIds(
                withVendorScripts(
                  withAssetBase(
                    prepareDeckEdit(html).html,
                    pageHrefOf(page.pageSlug)!,
                  ),
                ),
              ),
              slides: [...new Set(nodes.map((node) => node.slideId))],
              targets: nodes.map((node) => node.id),
            },
            200,
          );
        }
        if (input.view === "comments") {
          const comments = (await listComments(page.organization, page.pageSlug, viewer)).filter(
            (comment) =>
              !comment.resolvedAt &&
              (!input.query ||
                `${comment.quote} ${comment.body}`.includes(input.query)),
          );
          return jsonResponse(
            {
              page: page.pageSlug,
              versionId: input.versionId ?? head.revision.versionId,
              comments: comments.slice(input.offset, input.offset + input.limit),
              nextOffset:
                input.offset + input.limit < comments.length
                  ? input.offset + input.limit
                  : null,
            },
            200,
          );
        }
        return jsonResponse(
          {
            protocol: PAGE_AGENT_PROTOCOL,
            page: page.pageSlug,
            versionId: input.versionId ?? head.revision.versionId,
            visibility: gate.page.visibility,
            canEdit: editable.ok,
            ...(input.view==="overview"?{origin:parseSourceNote(html)}:{}),
            ...readAgentDocument(html, input),
          },
          200,
        );
      }
      if (input.action === "history") {
        const result = await agentHistory(page, viewer, input);
        if (
          "beforeHtml" in result &&
          typeof result.beforeHtml === "string" &&
          typeof result.afterHtml === "string"
        ) {
          const preview = (html: string) =>
            withSafeAnchorIds(
              withVendorScripts(
                withAssetBase(
                  prepareDeckEdit(html).html,
                  pageHrefOf(page.pageSlug)!,
                ),
              ),
            );
          return jsonResponse(
            {
              ...result,
              beforeHtml: preview(result.beforeHtml),
              afterHtml: preview(result.afterHtml),
            },
            200,
          );
        }
        return jsonResponse(result, 200);
      }
      if (["prepare", "revert", "restore", "reimport"].includes(input.action))
        return jsonResponse(await prepareAgentDraft(page, viewer, input), 200);
      if (!input.id)
        throw new AgentEditError(
          "toolbox.agent.idRequired",
          "request_invalid",
          400,
        );
      if (input.action === "preview") {
        const result = await previewAgentDraft(page, viewer, input.id),
          href = pageHrefOf(page.pageSlug)!;
        const preview = (html: string) =>
          withSafeAnchorIds(
            withVendorScripts(withAssetBase(prepareDeckEdit(html).html, href)),
          );
        return jsonResponse(
          {
            ...result,
            beforeHtml: preview(result.beforeHtml),
            afterHtml: preview(result.afterHtml),
          },
          200,
        );
      }
      if (input.action === "verify") {
        if (!input.verification)
          throw new AgentEditError(
            "toolbox.agent.verificationMissing",
            "request_invalid",
            400,
          );
        return jsonResponse(
          await verifyAgentDraft(page, viewer, input.id, input.verification),
          200,
        );
      }
      return jsonResponse(await applyAgentDraft(page, viewer, input.id), 200);
    } catch (error) {
      if (error instanceof RestoredAssetError)
        return jsonResponse(
          { error: localizedMessage(error, requestTranslate()), code: "restore_unavailable" },
          409,
        );
      if (error instanceof AgentEditError)
        return jsonResponse(
          { error: agentEditErrorText(error, requestTranslate()), code: error.code, details: error.details },
          error.status,
        );
      if (
        error instanceof DeckEditConflictError ||
        error instanceof RevisionRaceError ||
        error instanceof StaleBaseError
      )
        // 衝突の文は鍵を持たない日本語の正本で届くものがある（辞書と一致すれば訳す）
        return jsonResponse({ error: deckErrorMessage(error, requestTranslate()), code: "conflict" }, 409);
      if (error instanceof z.ZodError)
        return jsonResponse(
          {
            error: rt("toolbox.agent.invalidInput"),
            code: "invalid_input",
            issues: error.issues
              .slice(0, 20)
              .map((issue) => ({
                path: issue.path.join("."),
                message: issue.message,
              })),
          },
          400,
        );
      if (error instanceof SyntaxError)
        return jsonResponse(
          { error: rt("toolbox.agent.invalidJson"), code: "invalid_input" },
          400,
        );
      return serverError(error);
    }
  });
}
