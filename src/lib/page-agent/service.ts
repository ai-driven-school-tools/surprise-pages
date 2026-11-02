import { freezeRestoredAssets, restoredAssetHtml } from "./assets";
import { defaultTranslate } from "../i18n/default";
import { LocalizedError, localizedMessage } from "../i18n/errors";
import type { Translate } from "../i18n/translate";
import type { MessageKey, MessageParams } from "../i18n/messages/types";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { getDb, orgDb } from "../db/database";
import type { OrganizationScope } from "../organization/scope";
import {
  agentDraftSchema,
  PAGE_AGENT_TTL_MS,
  type AgentDraft,
  type AgentRequest,
  type AgentVerification,
} from "./model";
import {
  agentDigest,
  agentScopeDigest,
  affectedAgentSlides,
  agentConflicts,
  inspectAgentChange,
  agentImportOperations,
  readAgentDocument,
} from "./source";
import {
  applyDeckEditOperations,
  prepareDeckEdit,
  assertDeckTextStructure,
  DeckEditConflictError,
} from "../deck/edit/source";
import { deckEditOperationsSchema,deckEditRecordOperationsSchema } from "../deck/edit/model";
import {applyCollaborativeOperations} from "../deck/edit/collaboration";
import { deckEditStore,deckReceiptWitness } from "../deck/edit/store";
import { saveDeckOperations,validateDeckRequestBase,type DeckEditSnapshot } from "../deck/edit/service";
import {
  readHeadOf,
  pageHrefOf,
  commitRevision,
  type StoredPage,
} from "../pages/store";
import { readFileAt } from "../revisions/revisions";
import type { Member } from "../identity/identity";

/** 依頼者（画面・MCP）に返す断り。文は辞書の鍵で持ち、窓口が要求の言語で訳す。 */
export class AgentEditError extends LocalizedError {
  /** 辞書の鍵を持たない下の例外を包んだときだけ、その文をそのまま返す（`agentEditErrorText`）。 */
  raw: string | null = null;
  constructor(
    key: MessageKey,
    public code: string,
    public status = 409,
    public details: unknown = null,
    params: MessageParams = {},
  ) {
    super(key, params);
  }
  /** 下の例外（編集の食い違いなど）を包む。鍵を持つ例外なら鍵を引き継ぎ、持たなければ文を残す。 */
  static wrap(error: Error, code: string, status: number, details: unknown): AgentEditError {
    if (error instanceof LocalizedError) return new AgentEditError(error.key, code, status, details, error.params);
    const wrapped = new AgentEditError("toolbox.agent.conflict", code, status, details);
    wrapped.raw = error.message;
    return wrapped;
  }
}

/** 断りを要求の言語の文にする。 */
export function agentEditErrorText(error: AgentEditError, t: Translate): string {
  return error.raw ?? localizedMessage(error, t);
}
async function current(page: StoredPage): Promise<DeckEditSnapshot> {
  const head = await readHeadOf(page);
  if (!head) throw new AgentEditError("toolbox.agent.noBody", "not_found", 404);
  return {
    html: head.html,
    versionId: head.revision.versionId,
    versionNumber: head.revision.versionNumber,
    collaboration:head.collaboration,
  };
}
async function version(page: StoredPage, id: string): Promise<string> {
  const html = await readFileAt(page, id);
  if (html === null)
    throw new AgentEditError("toolbox.agent.versionMissing", "version_missing", 404);
  return html;
}
function reviewLink(page: StoredPage, id: string): string {
  return `${pageHrefOf(page.pageSlug)}?edit=1&change=${encodeURIComponent(id)}`;
}
async function draft(
  page: StoredPage,
  viewer: Member,
  id: string,
): Promise<AgentDraft> {
  const { data, error } = await orgDb(page.organization)
    .from("page_edit_drafts")
    .select("*")
    .eq("id", id)
    .eq("page_id", page.id)
    .eq("owner_email", viewer.email)
    .maybeSingle();
  if (error)
    throw new AgentEditError(
      "toolbox.agent.draftStoreUnavailable",
      "storage_unavailable",
      503,
    );
  if (!data)
    throw new AgentEditError("toolbox.agent.draftMissing", "draft_missing", 404);
  const result = agentDraftSchema.parse(data);
  if (Date.parse(result.expires_at) <= Date.now())
    throw new AgentEditError(
      "toolbox.agent.draftExpired",
      "draft_expired",
      410,
    );
  return result;
}
/** 期限の切れた変更案を消す。夜の掃除が組織ごとに呼ぶ。 */
export async function sweepAgentDrafts(organization: OrganizationScope): Promise<void> {
  const { error } = await orgDb(organization)
    .from("page_edit_drafts")
    .delete()
    .lt("expires_at", new Date().toISOString());
  // 表が無い（PGRST205）など、原因の見分けが付くように符号を添える（中身は含まない）
  if (error) throw new Error(`変更案を整理できませんでした（${error.code || "符号なし"}）`); // i18n-keep: 日次の掃除の内部の失敗（画面に届かない）
}
async function candidate(page: StoredPage, d: AgentDraft,viewer:Member) {
  const head = await current(page);
  let html: string;
  if (d.restore_version_id) {
    if (head.versionId !== d.base_version_id)
      throw new AgentEditError(
        "toolbox.agent.restoreConflict",
        "conflict",
      );
    html = restoredAssetHtml(
      await version(page, d.restore_version_id),
      d.restore_assets,
    );
  } else {
    const baseState=head.collaboration?await deckEditStore(page,viewer).readVersion?.(d.base_version_id):null;
    const base = prepareDeckEdit(baseState?.html??await version(page, d.base_version_id)).html;
    validateDeckRequestBase({html:base,versionId:d.base_version_id,versionNumber:baseState?.versionNumber??0,collaboration:baseState?.collaboration},d.operations);
    try {
      assertDeckTextStructure(
        base,
        prepareDeckEdit(head.html).html,
        d.operations,
      );
      html = head.collaboration?applyCollaborativeOperations(prepareDeckEdit(head.html).html,head.collaboration,d.operations,baseState?.collaboration??head.collaboration,{strict:true}).html:applyDeckEditOperations(
        prepareDeckEdit(head.html).html,
        d.operations,
        true,
      ).html;
    } catch (error) {
      if (error instanceof DeckEditConflictError)
        throw AgentEditError.wrap(error, "conflict", 409, {
          versionId: head.versionId,
          conflicts: agentConflicts(head.html, d.operations),
        });
      throw error;
    }
  }
  const slides = affectedAgentSlides(head.html, html);
  return {
    head,
    html,
    digest: agentDigest(html),
    scopeDigest: agentScopeDigest(head.html, html, slides),
    slides,
  };
}
export async function prepareAgentDraft(
  page: StoredPage,
  viewer: Member,
  request: AgentRequest,
) {
  const head = await current(page);
  let baseVersionId = request.baseVersionId;
  if (!baseVersionId)
    throw new AgentEditError(
      "toolbox.agent.baseRequired",
      "base_required",
      400,
    );
  let base = await version(page, baseVersionId);
  let operations = request.operations ?? [];
  let unresolved: string[] = [];
  let restore: string | null = null;
  if (request.action === "revert") {
    if (!request.undoId)
      throw new AgentEditError(
        "toolbox.agent.undoRequired",
        "request_invalid",
        400,
      );
    const receipt = await deckEditStore(page, viewer).receipt(request.undoId);
    if (!receipt?.operations || !receipt.versionId)
      throw new AgentEditError(
        "toolbox.agent.undoUnavailable",
        "undo_unavailable",
      );
    operations = receipt.inverse;
    baseVersionId=receipt.versionId;
    base=await version(page,baseVersionId);
    if (request.targets?.length) {
      const selected = new Set(request.targets);
      // Structural inverse dependencies are inseparable; offer whole-request undo instead.
      if (
        operations.some((op) =>
          ["fragment", "insert", "restore", "remove", "order", "move", "outline-move"].includes(
            op.kind,
          ),
        )
      )
        throw new AgentEditError(
          "toolbox.agent.dependentOperations",
          "dependent_operations",
        );
      operations = operations.filter((op) => selected.has(op.target));
    }
    // The receipt supplies the inverse witness; concurrent changes are compared with it below.
  } else if (request.action === "restore") {
    if (!request.versionId)
      throw new AgentEditError(
        "toolbox.agent.restoreRequired",
        "request_invalid",
        400,
      );
    await version(page, request.versionId);
    restore = request.versionId;
  } else if (request.action === "reimport") {
    if (!request.html || !request.targets?.length)
      throw new AgentEditError(
        "toolbox.agent.reimportRequired",
        "request_invalid",
        400,
      );
    const result = agentImportOperations(base, request.html, request.targets);
    operations = result.operations;
    unresolved = result.unresolved;
  }
  if (!restore && !operations.length)
    throw new AgentEditError("toolbox.agent.noChanges", "no_changes", 400, {
      unresolved,
    });
  operations = (request.action==="revert"?deckEditRecordOperationsSchema:deckEditOperationsSchema).parse(operations);
  if (!restore){
    const baseState=head.collaboration?await deckEditStore(page,viewer).readVersion?.(baseVersionId):null;
    validateDeckRequestBase({html:base,versionId:baseVersionId,versionNumber:baseState?.versionNumber??0,collaboration:baseState?.collaboration},operations);
  }
  const id = request.id ?? randomUUID(),
    summary =
      request.summary ??
      (restore
        // 保存する要約は日本語の正本の文のまま（出すときに localizeStored で訳す）
        ? defaultTranslate("toolbox.agentHistory.restore")
        : request.action === "revert"
          ? defaultTranslate("toolbox.agentHistory.undo")
          : defaultTranslate("toolbox.agentHistory.update"));
  const fingerprint = agentDigest(
    JSON.stringify({
      baseVersionId,
      operations,
      summary,
      client: request.client,
      restore,
    }),
  );
  const received = await deckEditStore(page, viewer).receipt(id);
  if (received) {
    if (received.draftFingerprint !== fingerprint)
      throw new AgentEditError(
        "toolbox.agent.idReusedSaved",
        "id_reused",
      );
    return {
      id,
      status: "saved",
      versionId: received.versionId,
      reviewUrl: reviewLink(page, id),
    };
  }
  const row: AgentDraft = {
    id,
    page_id: page.id,
    owner_email: viewer.email,
    base_version_id: baseVersionId,
    operations,
    summary,
    client: request.client,
    fingerprint,
    expires_at: new Date(Date.now() + PAGE_AGENT_TTL_MS).toISOString(),
    created_at: new Date().toISOString(),
    unresolved,
    verification: null,
    restore_version_id: restore,
    restore_assets: restore
      ? await freezeRestoredAssets(page, await version(page, restore), restore)
      : {},
  };
  const { error } = await orgDb(page.organization).from("page_edit_drafts").insert(row);
  if (error) {
    if (error.code !== "23505")
      throw new AgentEditError(
        "toolbox.agent.draftSaveFailed",
        "storage_unavailable",
        503,
      );
    const old = await draft(page, viewer, id);
    if (old.fingerprint !== fingerprint)
      throw new AgentEditError(
        "toolbox.agent.idReused",
        "id_reused",
      );
  }
  let result;
  try {
    result = await candidate(page, row,viewer);
  } catch (error) {
    if (error instanceof AgentEditError)
      throw Object.assign(new AgentEditError(error.key, error.code, error.status, {
        id,
        conflict: error.details,
        reviewUrl: reviewLink(page, id),
      }, error.params), { raw: error.raw });
    throw error;
  }
  return {
    id,
    summary,
    baseVersionId,
    latestVersionId: head.versionId,
    affectedSlides: result.slides,
    unresolved,
    reviewUrl: reviewLink(page, id),
    status: "prepared",
  };
}
export async function previewAgentDraft(
  page: StoredPage,
  viewer: Member,
  id: string,
) {
  const d = await draft(page, viewer, id),
    c = await candidate(page, d,viewer);
  return {
    id,
    summary: d.summary,
    baseVersionId: c.head.versionId,
    digest: c.digest,
    scopeDigest: c.scopeDigest,
    slides: c.slides,
    beforeHtml: c.head.html,
    afterHtml: c.html,
    issues: inspectAgentChange(c.head.html, c.html),
  };
}
export async function verifyAgentDraft(
  page: StoredPage,
  viewer: Member,
  id: string,
  report: AgentVerification,
) {
  const d = await draft(page, viewer, id),
    c = await candidate(page, d,viewer);
  if (c.digest !== report.digest || c.head.versionId !== report.baseVersionId)
    throw new AgentEditError(
      "toolbox.agent.recheckDuring",
      "recheck_required",
    );
  if (c.slides.some((slide) => !report.slides.includes(slide)))
    throw new AgentEditError(
      "toolbox.agent.incompleteVerification",
      "incomplete_verification",
      400,
    );
  const issues = inspectAgentChange(c.head.html, c.html);
  const verification: AgentVerification = {
    ...report,
    scopeDigest: c.scopeDigest,
    unresolved: [...new Set([...d.unresolved, ...report.unresolved])],
    status: issues.length || report.issues.length ? "failed" : report.status,
  };
  const { error } = await orgDb(page.organization)
    .from("page_edit_drafts")
    .update({ verification })
    .eq("id", id)
    .eq("owner_email", viewer.email)
    .eq("page_id", page.id);
  if (error)
    throw new AgentEditError(
      "toolbox.agent.verificationSaveFailed",
      "storage_unavailable",
      503,
    );
  return {
    id,
    status: verification.status,
    issues,
    reviewUrl: reviewLink(page, id),
  };
}
export async function applyAgentDraft(
  page: StoredPage,
  viewer: Member,
  id: string,
) {
  const store = deckEditStore(page, viewer),
    receipt = await store.receipt(id);
  if (receipt) {
    // Draft ownership is also checked on retries; a UUID is not an authority to read another task.
    if (receipt.authorEmail !== viewer.email)
      throw new AgentEditError("toolbox.agent.changeMissing", "not_found", 404);
    const latest = await store.recover();
    return {
      id,
      status: "saved",
      versionId: receipt.versionId,
      latestVersionId: latest.versionId,
      replayed: true,
      reviewUrl: reviewLink(page, id),
    };
  }
  const d = await draft(page, viewer, id),
    c = await candidate(page, d,viewer),
    report = d.verification;
  if (!report || report.status !== "passed")
    throw new AgentEditError(
      "toolbox.agent.verificationRequired",
      "verification_required",
    );
  if (c.digest !== report.digest && c.scopeDigest !== report.scopeDigest)
    throw new AgentEditError(
      "toolbox.agent.recheckAfter",
      "recheck_required",
    );
  let saved: DeckEditSnapshot;
  if (d.restore_version_id) {
    const result = await commitRevision({
      organization: page.organization,
      pageSlug: page.pageSlug,
      html: c.html,
      expectedHead: c.head.versionId,
      author: viewer,
      message: d.summary,
      editReceipt: {
        id,
        fingerprint: d.fingerprint,
        inverse: [],
        operations: [],
        baseVersionId: c.head.versionId,
        summary: d.summary,
        client: d.client,
        verification: report,
        draftFingerprint: d.fingerprint,
      },
    });
    saved = {
      html: result.html,
      versionId: result.versionId,
      versionNumber: result.versionNumber,
    };
  } else
    saved = await saveDeckOperations(store, {
      id,
      author: viewer.email,
      operations: d.operations,
      baseVersionId: d.base_version_id,
      summary: d.summary,
      client: d.client,
      verification: {
        ...report,
        digest: c.digest,
        baseVersionId: c.head.versionId,
      },
      expectedCandidate: c.digest,
      strictTargets: true,
      draftFingerprint: d.fingerprint,
    });
  return {
    id,
    status: "saved",
    versionId: saved.versionId,
    versionNumber: saved.versionNumber,
    affectedSlides: c.slides,
    summary: d.summary,
    verification: report,
    reviewUrl: reviewLink(page, id),
  };
}
const historyRow = z.object({
  version_id: z.string(),
  parent_version_id: z.string().nullable(),
  version_number: z.number(),
  message: z.string(),
  author_name: z.string().nullable(),
  created_at: z.string(),
  edit_operation_id: z.string().nullable(),
  edit_receipt: z.unknown().nullable(),
});
export async function agentHistory(
  page: StoredPage,
  viewer: Member,
  request: AgentRequest,
) {
  const grouped=await getDb().rpc("read_deck_edit_history",{p_page:page.id,p_operation:request.id??null,p_offset:request.id?0:request.offset,p_limit:request.id?1:request.limit+1});
  if(grouped.error&&!['42883','PGRST202','42501'].includes(grouped.error.code))throw new AgentEditError("toolbox.agent.historyUnavailable","storage_unavailable",503);
  let source=grouped;
  if(grouped.error){
  const q = orgDb(page.organization)
    .from("page_revisions")
    .select(
      "version_id,parent_version_id,version_number,message,author_name,created_at,edit_operation_id,edit_receipt",
    )
    .eq("page_id", page.id);
  source = request.id
    ? await q.eq("edit_operation_id", request.id).limit(1)
    : await q
        .order("version_number", { ascending: false })
        .limit(request.offset + request.limit + 1);
  }
  const {data,error}=source;
  if (error)
    throw new AgentEditError(
      "toolbox.agent.historyUnavailable",
      "storage_unavailable",
      503,
    );
  const rows = z
    .array(historyRow)
    .parse(data)
    .slice(grouped.error&&!request.id ? request.offset : 0);
  const head = await current(page);
  const currentSlideIds = prepareDeckEdit(head.html)
    .nodes.filter((node) => node.id === node.slideId)
    .map((node) => node.id);
  const items = rows.slice(0, request.limit).map((row) => ({
    id: row.edit_operation_id,
    versionId: row.version_id,
    baseVersionId: row.parent_version_id,
    number: row.version_number,
    summary: row.message,
    author: row.author_name,
    createdAt: row.created_at,
    reviewUrl: row.edit_operation_id
      ? reviewLink(page, row.edit_operation_id)
      : null,
  }));
  if (request.id && rows[0]) {
    const receipt = await deckEditStore(page, viewer).receipt(request.id);
    const witness=receipt?await deckReceiptWitness(page,viewer,receipt):null;
    const row = rows[0],
      before = witness?.before??(row.parent_version_id
        ? await version(page, row.parent_version_id)
        : head.html),
      after = witness?.after??await version(page, row.version_id);
    const slides = affectedAgentSlides(before, after);
    return {
      latestVersionId: head.versionId,
      currentSlideIds,
      item: { ...items[0], canUndo: Boolean(receipt?.inverse.length) },
      verification: receipt?.verification ?? null,
      operations: receipt?.operations ?? [],
      slides: slides.map((id) => ({
        id,
        before: readAgentDocument(before, {
          ...request,
          view: "detail",
          target: id,
          offset: 0,
          limit: 50,
        }),
        after: readAgentDocument(after, {
          ...request,
          view: "detail",
          target: id,
          offset: 0,
          limit: 50,
        }),
      })),
      ...(request.view === "source"
        ? { beforeHtml: before, afterHtml: after }
        : {}),
    };
  }
  if (request.id) {
    const d = await draft(page, viewer, request.id);
    const baseState=await deckEditStore(page,viewer).readVersion?.(d.base_version_id);
    const before = await version(page, d.base_version_id),
      after = d.restore_version_id
        ? restoredAssetHtml(
            await version(page, d.restore_version_id),
            d.restore_assets,
          )
        : baseState?.collaboration?applyCollaborativeOperations(prepareDeckEdit(before).html,baseState.collaboration,d.operations,baseState.collaboration,{strict:true}).html:applyDeckEditOperations(prepareDeckEdit(before).html, d.operations)
            .html;
    return {
      latestVersionId: head.versionId,
      currentSlideIds,
      item: {
        id: d.id,
        summary: d.summary,
        status: "prepared",
        baseVersionId: d.base_version_id,
      },
      verification: d.verification,
      conflicts: agentConflicts(head.html, d.operations),
      slides: affectedAgentSlides(before, after).map((id) => ({
        id,
        before: null,
        after: null,
      })),
      ...(request.view === "source"
        ? { beforeHtml: before, afterHtml: after }
        : {}),
    };
  }

  return {
    latestVersionId: head.versionId,
    currentSlideIds,
    items,
    nextOffset:
      rows.length > request.limit ? request.offset + request.limit : null,
  };
}
