import {findPageIncludingDeleted,readHeadOf} from "../pages/store";
import { rt } from "../i18n/request";
import {isDeckHtml} from "../deck/deck";
import { canEditPage, hasOwnerGrant, isAdmin, openPage } from "./access";
import { type OrganizationScope } from "../organization/scope";
import {stillMember} from "@/lib/identity/identity";
import { jsonError } from "../api";
import type { Member } from "../identity/identity";
import type { StoredPage } from "../pages/store";

/** All browser editing entry points use one permission gate. */
export async function loadEditablePage(organization: OrganizationScope, viewer: Member, pageSlug: string): Promise<
  { ok: true; page: StoredPage } | { ok: false; response: Response }
> {
  /*
   * 直す門は、保存の途中（共同編集の再確認）でも呼ばれる。名乗りの役割は要求の始めに引いたものなので、ここでいまの所属を
   * 引き直す（外した・役割を下げた人を、その要求の中でも通さない）。ページの門と同時に投げ、役割が変わっていた
   * ときだけ、いまの役割で門を通し直す（ふだんは往復を増やさない）。
   */
  const [current, first] = await Promise.all([stillMember(organization, viewer), openPage(organization, viewer, pageSlug)]);
  const gate = current === null ? null : current.organization.role === viewer.organization.role ? first : await openPage(organization, current, pageSlug);
  if (current === null || gate === null || !gate.ok) return { ok: false, response: jsonError(rt("toolbox.server.pageNotFound"), 404) };
  const [admin, ownerGrant] = await Promise.all([
    isAdmin(organization, current),
    gate.page.visibility === "restricted" ? hasOwnerGrant(organization, gate.page.id, viewer.email) : Promise.resolve(false),
  ]);
  if (!canEditPage(current, gate.page, admin, ownerGrant)) {
    return { ok: false, response: jsonError(rt("toolbox.server.pageNotFound"), 404) };
  }
  return { ok: true, page: gate.page };
}

/** Publication and legacy uploads cannot bypass the slide edit gate. */
export async function deckPublicationTarget(organization:OrganizationScope,viewer:Member,pageSlug:string,incomingDeck=false):Promise<
 {ok:true;deck:boolean;versionId:string|null}|{ok:false;response:Response}
>{
 const stored=await findPageIncludingDeleted(organization,pageSlug);
 if(stored?.recordingProtected){
   if(stored.deletedAt!==null)return {ok:false,response:jsonError(rt("toolbox.server.recordingRestore"),409)};
   const gate=await loadEditablePage(organization,viewer,pageSlug);if(!gate.ok)return gate;
 }
 const head=stored?await readHeadOf(stored):null;
 const deck=incomingDeck||Boolean(head&&isDeckHtml(head.html));
 if(deck&&stored){const gate=await loadEditablePage(organization,viewer,pageSlug);if(!gate.ok)return gate;}
 return {ok:true,deck,versionId:head?.revision.versionId??null};
}


/** Recording deletion must also stop its source jobs and all derived results. */
export async function pageDeletionTarget(organization: OrganizationScope, pageSlug: string): Promise<{ ok: true } | { ok: false; response: Response }> {
  const page = await findPageIncludingDeleted(organization, pageSlug);
  return page?.recordingProtected
    ? { ok: false, response: jsonError(rt("toolbox.server.recordingDelete"), 409) }
    : { ok: true };
}
