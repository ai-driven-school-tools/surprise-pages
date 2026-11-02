import { z } from "zod";
import {DECK_SNAPSHOT_HEADER} from "@/lib/pages/preview";
import { jsonError, jsonResponse, serverError } from "@/lib/api";
import { currentIdentity, isMember } from "@/lib/identity/identity";
import { pageRefOf, pageHrefOf, readHeadVersionOf } from "@/lib/pages/store";
import { loadEditablePage } from "@/lib/access/page-edit-access";
import { deckEditStore, deckRevisionDelta, readDeckRevisionState, readDeckUpdate, listDeckPresence, touchDeckPresence, verifyDeckPresence, leaveDeckPresence } from "@/lib/deck/edit/store";
import { saveDeckOperations, DeckEditBusyError, DeckEditRequestError, type DeckEditSnapshot } from "@/lib/deck/edit/service";
import { deckEditOperationsSchema, deckNodeIdSchema, DeckEditConflictError } from "@/lib/deck/edit/model";
import { prepareDeckEdit } from "@/lib/deck/edit/source";
import { isDeckHtml } from "@/lib/deck/deck";
import { withAssetBase, withSafeAnchorIds, withVendorScripts } from "@/lib/pages/content";
import { routeLog } from "@/lib/logging/server-log";
import { currentOrganization } from "@/lib/organization/scope";
import { rt, requestTranslate } from "@/lib/i18n/request";
import { deckErrorMessage } from "@/lib/deck/edit/message";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const common = z.object({page:z.string().max(400),sessionId:z.string().uuid()});
const postSchema = common.extend({action:z.enum(["open","heartbeat"]),selection:deckNodeIdSchema.nullable().optional(),protocol:z.literal(2).optional()}).strict();
const saveSchema = common.extend({operationId:z.string().uuid(),baseVersionId:z.string().min(1).max(100),operations:deckEditOperationsSchema.min(1),protocol:z.literal(2).optional(),epoch:z.string().uuid().optional(),delta:z.boolean().optional()}).strict();

function payload(snapshot: DeckEditSnapshot, pageSlug: string, compact=false) {
  const href = pageHrefOf(pageSlug);
  const prepared = prepareDeckEdit(snapshot.html);
  snapshot = {...snapshot,html:prepared.html};
  if(compact)return {...snapshot,previewHref:href??null};
  return {...snapshot, nodes:prepared.nodes,
    previewHtml:withSafeAnchorIds(withVendorScripts(href ? withAssetBase(snapshot.html,href) : snapshot.html))};
}

async function handle(request: Request, method: "GET"|"POST"|"PATCH"|"DELETE"): Promise<Response> {
  const organization=await currentOrganization();
  const compact=request.headers.get(DECK_SNAPSHOT_HEADER)==="compact";
  const viewer = await currentIdentity();
  if (!isMember(viewer)) return jsonError(rt("deckEditor.api.loginRequired"),401);
  try {
    let input: unknown;
    if (method === "GET" || method === "DELETE") {
      input = Object.fromEntries(new URL(request.url).searchParams);
    } else {
      const raw = await request.text();
      if (Buffer.byteLength(raw,"utf8") > 2*1024*1024) return jsonError(rt("deckEditor.api.changeTooLarge"),413);
      try { input = JSON.parse(raw); } catch { return jsonError(rt("deckEditor.api.unreadableBody"),400); }
    }
    const parsed = common.safeParse(input);
    if (!parsed.success) return jsonError(rt("deckEditor.api.invalidEdit"),400);
    const ref = pageRefOf(parsed.data.page);
    if (!ref) return jsonError(rt("deckEditor.api.invalidPage"),400);
    const gate = await loadEditablePage(organization,viewer,ref.pageSlug);
    if (!gate.ok) return gate.response;
    const {page} = gate;
    const store = deckEditStore(page,viewer);
    const receiptId=method==="GET"?new URL(request.url).searchParams.get("operationId"):null;
    if(receiptId!==null){
      const id=z.string().uuid().safeParse(receiptId);if(!id.success)return jsonError(rt("deckEditor.api.invalidOperation"),400);
      const receipt=await store.receipt(id.data);
      return jsonResponse({received:receipt!==null,versionId:receipt?.versionId??null},200);
    }
    if (method === "DELETE") {
      await leaveDeckPresence(page,viewer,parsed.data.sessionId);
      return jsonResponse({ok:true},200);
    }
    if (method === "GET") {
      const known=new URL(request.url).searchParams.get("versionId");
      const presentation=new URL(request.url).searchParams.get("presentation")==="1";
      if(known&&!presentation&&new URL(request.url).searchParams.get("delta")==="1"){
        const update=await readDeckUpdate(page,known);
        if(update)return jsonResponse(update,200);
      }
      const version = await readHeadVersionOf(page,presentation);
      if (version && known === version.versionId) {
        return jsonResponse({...version,presence:await listDeckPresence(page)},200);
      }
      if(version&&known&&new URL(request.url).searchParams.get("delta")==="1") {
        const [collaboration,batches]=await Promise.all([readDeckRevisionState(page,version.versionId),deckRevisionDelta(page,known,version.versionId)]);
        if(collaboration&&batches)return jsonResponse({...version,batches,collaboration,presence:await listDeckPresence(page)},200);
      }
      const head=await store.read();
      if (!isDeckHtml(head.html)) return jsonError(rt("deckEditor.api.decksOnly"),400);
      return jsonResponse({...(known === head.versionId
        ? {versionId:head.versionId,versionNumber:head.versionNumber} : payload(head,page.pageSlug,compact)),
        presence:await listDeckPresence(page),...(presentation&&version?.versionId===head.versionId?{updatedAt:version.updatedAt,updatedBy:version.updatedBy}:{})},200);
    }
    if (method === "POST") {
      const head=await store.read();
      if (!isDeckHtml(head.html)) return jsonError(rt("deckEditor.api.decksOnly"),400);
      const body = postSchema.safeParse(input);
      if (!body.success) return jsonError(rt("deckEditor.api.invalidEdit"),400);
      // Check presence storage before upgrading the source, so an unapplied migration changes no HTML.
      await touchDeckPresence(page,viewer,body.data.sessionId,body.data.selection ?? null);
      if (body.data.action === "heartbeat") return jsonResponse({presence:await listDeckPresence(page)},200);
      if (head.collaboration && body.data.protocol !== 2) return jsonError(rt("deckEditor.api.editorUpdated"),409);
      return jsonResponse({...payload(head,page.pageSlug,compact),pageId:page.id,viewerId:viewer.email,presence:await listDeckPresence(page)},200);
    }
    const body = saveSchema.safeParse(input);
    if (!body.success) return jsonError(rt("deckEditor.api.invalidChange"),400);
    await verifyDeckPresence(page,viewer,body.data.sessionId);
    const saved = await saveDeckOperations(store,{id:body.data.operationId,author:viewer.email,operations:body.data.operations,baseVersionId:body.data.baseVersionId,client:"browser",protocol:body.data.protocol,epoch:body.data.epoch});
    const document="html" in saved?saved:null;
    if((!document||document.collaboration)&&body.data.delta){
      const update=await readDeckUpdate(page,body.data.baseVersionId,saved.versionId);
      if(update&&"batches" in update)return jsonResponse({...update,inverse:saved.inverse,replayed:saved.replayed},200);
      if(document){
        const batches=await deckRevisionDelta(page,body.data.baseVersionId,saved.versionId);
        if(batches)return jsonResponse({versionId:saved.versionId,versionNumber:saved.versionNumber,collaboration:document.collaboration,batches,inverse:saved.inverse,replayed:saved.replayed,presence:await listDeckPresence(page)},200);
      }
    }
    // A missing delta requires one coherent snapshot, never an empty placeholder
    // or a body paired with the earlier acknowledgement's version/state.
    const current=document??await store.read();
    if(!document){
      const refreshed=await loadEditablePage(organization,viewer,ref.pageSlug);
      if(!refreshed.ok||refreshed.page.id!==page.id)throw new DeckEditRequestError("deckEditor.save.permissionChanged");
    }
    if(current.versionNumber<saved.versionNumber)throw new DeckEditBusyError("deckEditor.save.verifying");
    return jsonResponse({...payload(current,page.pageSlug,compact),inverse:saved.inverse,replayed:saved.replayed,presence:await listDeckPresence(page)},200);
  } catch (error) {
    if (error instanceof DeckEditConflictError) return jsonResponse({error:deckErrorMessage(error,requestTranslate()),conflict:error.category},409);
    if (error instanceof DeckEditRequestError) return jsonResponse({error:deckErrorMessage(error,requestTranslate()),conflict:"generation"},409);
    if (error instanceof DeckEditBusyError) return jsonError(deckErrorMessage(error,requestTranslate()),503);
    return serverError(error);
  }
}

async function timed(request:Request,method:Parameters<typeof handle>[1]):Promise<Response>{
  return routeLog("/api/pages/deck-edit", request, async () => {
    const start=performance.now(),response=await handle(request,method);
    if(process.env.PAGES_DECK_DIAGNOSTICS==="on")response.headers.append("Server-Timing",`deck;dur=${(performance.now()-start).toFixed(1)}`);
    return response;
  });
}
export const GET = (request:Request) => timed(request,"GET");
export const POST = (request:Request) => timed(request,"POST");
export const PATCH = (request:Request) => timed(request,"PATCH");
export const DELETE = (request:Request) => timed(request,"DELETE");
