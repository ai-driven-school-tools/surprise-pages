import { z } from "zod";
import { getDb, orgDb } from "../../db/database";
import { DECK_EDIT_BATCH_LIMIT } from "./model";
import {deckEditReceiptSchema as receiptSchema} from "./receipts";
import { commitRevision, readHeadOf, recoverHeadDelivery, RevisionRaceError, StaleBaseError, type StoredPage } from "../../pages/store";
import type { Member } from "../../identity/identity";
import type { DeckEditStore } from "./service";
import {DeckEditRequestError} from "./service";
import { displayNameOf } from "../../identity/member-name";
import { deckCollaborationSchema,applyCollaborativeOperations } from "./collaboration";
import type {DeckEditReceipt} from "./receipts";
import { defaultTranslate } from "../../i18n/default";

export function deckEditStore(page: StoredPage, viewer: Member): DeckEditStore {
  return {
    key:page.id,
    async readVersion(id) {
      const {data,error} = await orgDb(page.organization).from("page_revisions").select("html,version_number,deck_collaboration").eq("page_id",page.id).eq("version_id",id).maybeSingle();
      if (error) throw new Error("編集の土台を取得できません"); // i18n-keep: 内部の失敗。窓口は固定の 500 の文だけを返し、この文は画面に届かない
      if (!data) return null;
      const row=z.object({html:z.string(),version_number:z.number(),deck_collaboration:deckCollaborationSchema.nullable()}).parse(data);
      return {html:row.html,versionId:id,versionNumber:row.version_number,collaboration:row.deck_collaboration??undefined};
    },
    async read() {
      const head = await readHeadOf(page);
      if (!head) throw new Error("スライドの本文が見つかりません"); // i18n-keep: 内部の失敗。窓口は固定の 500 の文だけを返し、この文は画面に届かない
      return {html:head.html,versionId:head.revision.versionId,versionNumber:head.revision.versionNumber,collaboration:head.collaboration};
    },
    async receipt(id) {
      const separate=await orgDb(page.organization).from("deck_edit_receipts").select("receipt,version_id,owner_email").eq("page_id",page.id).eq("operation_id",id).maybeSingle();
      if(separate.error&&!['42P01','PGRST205','42501'].includes(separate.error.code))throw new Error("共同編集の受領を確認できません"); // i18n-keep: 内部の失敗。窓口は固定の 500 の文だけを返し、この文は画面に届かない
      if(separate.data){const row=z.object({receipt:receiptSchema,version_id:z.string(),owner_email:z.string()}).parse(separate.data);return {...row.receipt,versionId:row.version_id,authorEmail:row.owner_email};}
      const {data,error} = await orgDb(page.organization).from("page_revisions").select("edit_receipt,version_id,author_email")
        .eq("page_id",page.id).eq("edit_operation_id",id).maybeSingle();
      if (error) throw new Error("共同編集の保存先を確認できません",{cause:error}); // i18n-keep: 内部の失敗。窓口は固定の 500 の文だけを返し、この文は画面に届かない
      if (data === null) return null;
      const row = z.object({edit_receipt:receiptSchema,version_id:z.string(),author_email:z.string()}).parse(data);
      return {...row.edit_receipt,versionId:row.version_id,authorEmail:row.author_email};
    },
    receipts:ids=>readDeckReceipts(page,ids),
    async recover() {
      const head = await recoverHeadDelivery(page);
      return {html:head.html,versionId:head.revision.versionId,versionNumber:head.revision.versionNumber,collaboration:head.collaboration};
    },
    async commit(input) {
      try {
        const saved = await commitRevision({organization:page.organization,pageSlug:page.pageSlug,html:input.html,
          expectedHead:input.expectedHead,editReceipt:input.receipt,collaboration:input.collaboration,receiptGroup:input.group,
          observedHead:input.collaboration&&input.base?{pageId:page.id,...input.base}:undefined,
          authorizedPage:input.collaboration?page:undefined,
          author:input.group?{email:input.group.receipts[0].author.email,name:input.group.receipts.length>1?defaultTranslate("deckEditor.history.coEditAuthor"):input.group.receipts[0].author.name}:{email:viewer.email,name:viewer.name},message:input.receipt.summary ?? defaultTranslate("deckEditor.history.coEditSummary")});
        return {html:saved.html,versionId:saved.versionId,versionNumber:saved.versionNumber,collaboration:input.collaboration};
      } catch (error) {
        if (error instanceof StaleBaseError || error instanceof RevisionRaceError) return null;
        throw error;
      }
    },
  };
}

/** A bounded group can share the receipt lookup. A later conflict still reads
 * its individual receipt afresh, because another writer may have just won. */
async function readDeckReceipts(page:StoredPage,ids:readonly string[]):Promise<Map<string,DeckEditReceipt>>{
  if(ids.length>20)throw new Error("一度に確認する操作が多すぎます"); // i18n-keep: 内部の失敗。窓口は固定の 500 の文だけを返し、この文は画面に届かない
  const found=new Map<string,DeckEditReceipt>();if(!ids.length)return found;
  const separate=await orgDb(page.organization).from("deck_edit_receipts").select("receipt,version_id,owner_email").eq("page_id",page.id).in("operation_id",[...ids]);
  if(separate.error&&!['42P01','PGRST205','42501'].includes(separate.error.code))throw new Error("共同編集の受領を確認できません"); // i18n-keep: 内部の失敗。窓口は固定の 500 の文だけを返し、この文は画面に届かない
  if(!separate.error)for(const row of z.array(z.object({receipt:receiptSchema,version_id:z.string(),owner_email:z.string()})).parse(separate.data))found.set(row.receipt.id,{...row.receipt,versionId:row.version_id,authorEmail:row.owner_email});
  const missing=ids.filter(id=>!found.has(id));if(!missing.length)return found;
  const legacy=await orgDb(page.organization).from("page_revisions").select("edit_receipt,version_id,author_email").eq("page_id",page.id).in("edit_operation_id",missing);
  if(legacy.error)throw new Error("共同編集の保存先を確認できません"); // i18n-keep: 内部の失敗。窓口は固定の 500 の文だけを返し、この文は画面に届かない
  for(const row of z.array(z.object({edit_receipt:receiptSchema,version_id:z.string(),author_email:z.string()})).parse(legacy.data))found.set(row.edit_receipt.id,{...row.edit_receipt,versionId:row.version_id,authorEmail:row.author_email});
  return found;
}

/** Reconstruct one operation's immediate before/after within a grouped revision.
 * HTML remains canonical; the recorded operation range is the only extra data. */
export async function deckReceiptWitness(page:StoredPage,viewer:Member,receipt:DeckEditReceipt):Promise<{before:string;after:string}|null>{
  if(!receipt.versionId||!receipt.span)return null;
  const {data,error}=await orgDb(page.organization).from("page_revisions").select("parent_version_id,edit_receipt").eq("page_id",page.id).eq("version_id",receipt.versionId).maybeSingle();
  if(error||!data)throw new Error("操作の履歴を取得できません"); // i18n-keep: 内部の失敗。窓口は固定の 500 の文だけを返し、この文は画面に届かない
  const row=z.object({parent_version_id:z.string(),edit_receipt:receiptSchema}).parse(data);
  const operations=row.edit_receipt.operations;
  if(!row.edit_receipt.batch||!operations||receipt.span.end>operations.length||JSON.stringify(operations.slice(receipt.span.start,receipt.span.end))!==JSON.stringify(receipt.operations))throw new Error("操作の履歴が一致しません"); // i18n-keep: 内部の失敗。窓口は固定の 500 の文だけを返し、この文は画面に届かない
  const parent=await deckEditStore(page,viewer).readVersion?.(row.parent_version_id);
  if(!parent?.collaboration)throw new Error("操作の土台を取得できません"); // i18n-keep: 内部の失敗。窓口は固定の 500 の文だけを返し、この文は画面に届かない
  const before=applyCollaborativeOperations(parent.html,parent.collaboration,operations.slice(0,receipt.span.start));
  const after=applyCollaborativeOperations(before.html,before.collaboration,operations.slice(receipt.span.start,receipt.span.end));
  return {before:before.html,after:after.html};
}

const presenceSchema = z.object({session_id:z.string().uuid(),display_name:z.string(),selection:z.string().nullable()});
export type DeckPresence = {sessionId:string;name:string;selection:string|null};
const PRESENCE_LIFETIME_MS = 30_000;

/** Fetch immutable synchronization metadata without transferring the full HTML
 * on every notification. The caller has already passed the shared edit gate. */
export async function readDeckRevisionState(page:StoredPage,versionId:string){
  const {data,error}=await orgDb(page.organization).from("page_revisions").select("deck_collaboration")
    .eq("page_id",page.id).eq("version_id",versionId).maybeSingle();
  if(error)throw new Error("文章の同期状態を取得できません"); // i18n-keep: 内部の失敗。窓口は固定の 500 の文だけを返し、この文は画面に届かない
  if(!data)return null;
  return z.object({deck_collaboration:deckCollaborationSchema.nullable()}).parse(data).deck_collaboration;
}

/** The heartbeat owns presence writes. Typing normally needs only an ownership
 * check, rather than deleting and rewriting participant rows on every batch. */
export async function verifyDeckPresence(page:StoredPage,viewer:Member,sessionId:string):Promise<void>{
  const {data,error}=await orgDb(page.organization).from("deck_edit_sessions").select("owner_email,expires_at").eq("page_id",page.id).eq("session_id",sessionId).maybeSingle();
  if(error)throw new Error("編集の参加情報を確認できません",{cause:error}); // i18n-keep: 内部の失敗。窓口は固定の 500 の文だけを返し、この文は画面に届かない
  if(!data){await touchDeckPresence(page,viewer,sessionId,null);return;}
  const row=z.object({owner_email:z.string(),expires_at:z.string()}).parse(data);
  if(row.owner_email!==viewer.email)throw new DeckEditRequestError("deckEditor.save.loginChanged");
  if(Date.parse(row.expires_at)-Date.now()<10000)await touchDeckPresence(page,viewer,sessionId,null);
}

export async function listDeckPresence(page: StoredPage): Promise<DeckPresence[]> {
  const {data,error} = await orgDb(page.organization).from("deck_edit_sessions")
    .select("session_id,display_name,selection").eq("page_id",page.id)
    .gt("expires_at",new Date().toISOString()).order("session_id", { ascending: true }).limit(100);
  if (error) throw new Error("共同編集の参加者を確認できません",{cause:error}); // i18n-keep: 内部の失敗。窓口は固定の 500 の文だけを返し、この文は画面に届かない
  return z.array(presenceSchema).parse(data).map(row=>({sessionId:row.session_id,name:row.display_name,selection:row.selection}));
}

/** Same permission gate as the older reads; combine their network round trips.
 * Missing migrations or older application-role grants retain the existing
 * authorized snapshot path; its table permissions are still checked. */
export async function readDeckUpdate(page:StoredPage,since:string,until?:string){
  const {data,error}=await getDb().rpc("read_deck_update",{p_page:page.id,p_since:since,p_until:until??null});
  if(error){
    if(error.code==="42883"||error.code==="PGRST202"||error.code==="42501")return null;
    throw new Error("共同編集の変更を取得できません"); // i18n-keep: 内部の失敗。窓口は固定の 500 の文だけを返し、この文は画面に届かない
  }
  const rows=z.array(z.object({version_id:z.string(),version_number:z.number().int(),deck_collaboration:deckCollaborationSchema.nullable(),
    revisions:z.array(z.object({version_id:z.string(),parent_version_id:z.string().nullable(),edit_receipt:z.unknown()})),presence:z.array(presenceSchema)})).parse(data);
  const row=rows[0];if(!row)return null;
  const common={versionId:row.version_id,versionNumber:row.version_number,presence:row.presence.map(value=>({sessionId:value.session_id,name:value.display_name,selection:value.selection}))};
  if(since===row.version_id)return common;
  if(!row.deck_collaboration||row.revisions.length>50)return null;
  const batches=[];let previous=since;
  for(const revision of row.revisions){
    const receipt=receiptSchema.safeParse(revision.edit_receipt);
    if(revision.parent_version_id!==previous||!receipt.success||!receipt.data.operations?.length||receipt.data.operations.length>DECK_EDIT_BATCH_LIMIT)return null;
    batches.push({versionId:revision.version_id,operations:receipt.data.operations});previous=revision.version_id;
  }
  if(previous!==row.version_id)return null;
  return {...common,collaboration:row.deck_collaboration,batches};
}

/** Identity comes from the server; knowing another session's ID cannot replace its owner. */
export async function touchDeckPresence(page: StoredPage, viewer: Member, sessionId: string, selection: string|null): Promise<void> {
  const db = orgDb(page.organization);
  const now = new Date();
  const {error:cleanupError} = await db.from("deck_edit_sessions").delete().lt("expires_at",now.toISOString());
  if (cleanupError) throw new Error("共同編集の参加者を更新できません",{cause:cleanupError}); // i18n-keep: 内部の失敗。窓口は固定の 500 の文だけを返し、この文は画面に届かない
  const row = {page_id:page.id,session_id:sessionId,owner_email:viewer.email,
    display_name:displayNameOf(viewer.email,viewer.name),selection,expires_at:new Date(now.getTime()+PRESENCE_LIFETIME_MS).toISOString()};
  const {error:insertError} = await db.from("deck_edit_sessions").insert(row);
  if (insertError && insertError.code !== "23505") throw new Error("共同編集に参加できません",{cause:insertError}); // i18n-keep: 内部の失敗。窓口は固定の 500 の文だけを返し、この文は画面に届かない
  if (insertError) {
    const {data,error} = await db.from("deck_edit_sessions").update({display_name:row.display_name,selection,expires_at:row.expires_at})
      .eq("page_id",page.id).eq("session_id",sessionId).eq("owner_email",viewer.email).select("session_id");
    if (error || !Array.isArray(data) || data.length !== 1) throw new Error("編集の参加情報が一致しません。開き直してください"); // i18n-keep: 内部の失敗。窓口は固定の 500 の文だけを返し、この文は画面に届かない
  }
}

export async function leaveDeckPresence(page: StoredPage, viewer: Member, sessionId: string): Promise<void> {
  const {error} = await orgDb(page.organization).from("deck_edit_sessions").delete().eq("page_id",page.id)
    .eq("session_id",sessionId).eq("owner_email",viewer.email);
  if (error) throw new Error("共同編集を終了できません",{cause:error}); // i18n-keep: 内部の失敗。窓口は固定の 500 の文だけを返し、この文は画面に届かない
}

/** Missing, old, or whole-document revisions require a full snapshot; never skip a gap. */
export async function deckRevisionDelta(page:StoredPage,since:string,until:string){
 const db=orgDb(page.organization);
 const {data:base,error:baseError}=await db.from("page_revisions").select("version_number").eq("page_id",page.id).eq("version_id",since).maybeSingle();
 if(baseError||!base)return null;
 const number=z.object({version_number:z.number()}).parse(base).version_number;
 const {data,error}=await db.from("page_revisions").select("version_id,parent_version_id,edit_receipt").eq("page_id",page.id).gt("version_number",number).order("version_number",{ascending:true}).limit(51);
 if(error)return null;
 const rows=z.array(z.object({version_id:z.string(),parent_version_id:z.string().nullable(),edit_receipt:z.unknown()})).parse(data);
 if(rows.length>50)return null;
 const batches=[];let previous=since;
 for(const row of rows){
  const receipt=receiptSchema.safeParse(row.edit_receipt);
  if(row.parent_version_id!==previous||!receipt.success||!receipt.data.operations?.length)return null;
  if(receipt.data.operations.length>DECK_EDIT_BATCH_LIMIT)return null;
  batches.push({versionId:row.version_id,operations:receipt.data.operations});previous=row.version_id;
  if(previous===until)return batches;
 }
 return null;
}
