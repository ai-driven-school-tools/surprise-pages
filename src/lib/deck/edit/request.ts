import {createHash} from "node:crypto";
import {ZodError} from "zod";
import {validateOutline} from "../outline";
import {deckSourceOutline,applyDeckEditOperations,prepareDeckSource,validateDeckEditBase,assertDeckTextStructure,DeckEditConflictError} from "./source";
import {applyCollaborativeOperations,createDeckCollaboration,isCollaborativeProperty,type DeckCollaboration} from "./collaboration";
import type {DeckEditOperation} from "./model";
import type {DeckEditReceipt,DeckReceiptGroup} from "./receipts";
import { LocalizedError } from "../../i18n/errors";
import { defaultTranslate } from "../../i18n/default";
export type DeckEditSnapshot = { html: string; versionId: string; versionNumber: number; collaboration?: DeckCollaboration };
export type DeckSaveResult=DeckEditSnapshot&{inverse:DeckEditOperation[];replayed:boolean};
export type DeckSaveAcknowledgement=Pick<DeckSaveResult,"versionId"|"versionNumber"|"inverse"|"replayed">;
export type DeckEditStore = {
  key?:string;
  read(): Promise<DeckEditSnapshot>;
  readVersion?(id: string): Promise<DeckEditSnapshot | null>;
  receipt(id: string): Promise<DeckEditReceipt | null>;
  receipts?(ids:readonly string[]):Promise<Map<string,DeckEditReceipt>>;
  recover(): Promise<DeckEditSnapshot>;
  /** null means another revision won. Receipt and HTML must be inserted atomically. */
  commit(input: { html: string; expectedHead: string; receipt: DeckEditReceipt; collaboration?: DeckCollaboration; base?:DeckEditSnapshot; group?:DeckReceiptGroup }): Promise<DeckEditSnapshot | null>;
};

/** 利用者に届く保存の断り（409）。辞書の鍵を持ち、窓口がその人の言語で出す。 */
export class DeckEditRequestError extends LocalizedError {}
/** 利用者に届く「いま保存できない」（503）。 */
export class DeckEditBusyError extends LocalizedError {}

/** Synchronized text carries its own CRDT witness. If later structural commands
 * depend on that text, replay the complete sequence instead of dropping the text
 * and validating those commands against a state that never existed. */
export function validateDeckRequestBase(base:DeckEditSnapshot,operations:readonly DeckEditOperation[],looseProperties=false):void{
  const ordinary=operations.filter(operation=>!(base.collaboration&&operation.kind==="text"&&operation.sync)&&!(looseProperties&&!operation.reverts&&isCollaborativeProperty(operation)));
  if(!ordinary.length)return;
  const original=prepareDeckSource(base.html);
  if(base.collaboration&&operations.some(operation=>operation.kind==="text"&&operation.sync)){
    applyCollaborativeOperations(original,base.collaboration,operations,base.collaboration,{strict:!looseProperties});
  }else validateDeckEditBase(original,ordinary);
}

/** A retry never reapplies a receipt, even if the original response was lost. */
export type SaveRequest = { id: string; author: string; operations: DeckEditOperation[]; baseVersionId?: string; summary?: string; client?: string; verification?: unknown; expectedCandidate?: string; strictTargets?:boolean; draftFingerprint?:string; protocol?: 2; activate?: boolean; epoch?: string };

export function deckRequestFingerprint(request:SaveRequest):string{
  return createHash("sha256").update(JSON.stringify({author:request.author,operations:request.operations,...(request.baseVersionId?{baseVersionId:request.baseVersionId}:{}),...(request.protocol?{protocol:request.protocol,epoch:request.epoch}:{})})).digest("hex");
}
export async function prepareDeckRequest(head:DeckEditSnapshot,request:SaveRequest,readVersion?:DeckEditStore["readVersion"],originalBase?:DeckEditSnapshot){
  try{return await prepare(head,request,readVersion,originalBase);}
  catch(error){if(error instanceof ZodError||error instanceof SyntaxError)throw new DeckEditRequestError("deckEditor.save.invalidFormat");throw error;}
}
async function prepare(head:DeckEditSnapshot,request:SaveRequest,readVersion?:DeckEditStore["readVersion"],originalBase?:DeckEditSnapshot){
    if (head.collaboration && request.client === "browser" && request.protocol !== 2) throw new DeckEditRequestError("deckEditor.save.editorUpdated");
    if (head.collaboration && request.epoch && request.epoch !== head.collaboration.epoch) throw new DeckEditConflictError(defaultTranslate("deckEditor.conflict.structureChanged"),"generation");
    let base = head;
    if (request.baseVersionId) {
      const found = originalBase??(head.versionId === request.baseVersionId ? head : await readVersion?.(request.baseVersionId));
      if (!found) throw new DeckEditRequestError("deckEditor.save.baseMissing");
      base = found;
      const original=prepareDeckSource(base.html);
      validateDeckRequestBase(base,request.operations,Boolean(head.collaboration&&request.protocol===2));
      assertDeckTextStructure(original,prepareDeckSource(head.html),request.operations);
    }
    const prepared = prepareDeckSource(head.html);
    const collaboration = head.collaboration ?? (request.activate ? createDeckCollaboration(prepared) : undefined);
    const change = collaboration
      ? applyCollaborativeOperations(prepared, collaboration, request.operations, base.collaboration ?? collaboration,{strict:request.client!=="browser"||request.strictTargets})
      : applyDeckEditOperations(prepared, request.operations,request.strictTargets);
    try{validateOutline(deckSourceOutline(change.html));}catch(error){throw error instanceof LocalizedError?new DeckEditRequestError(error.key,error.params):new DeckEditRequestError("deckEditor.conflict.checkHierarchy");}
    if (request.expectedCandidate && createHash("sha256").update(change.html).digest("hex") !== request.expectedCandidate) throw new DeckEditConflictError(defaultTranslate("deckEditor.conflict.changedAfterCheck"));
    if (Buffer.byteLength(change.html, "utf8") > 5 * 1024 * 1024) {
      throw new DeckEditRequestError("deckEditor.save.bodyTooLarge");
    }
    return {html:change.html,collaboration:"collaboration" in change?change.collaboration:undefined,receipt:{id:request.id,fingerprint:deckRequestFingerprint(request),inverse:change.inverse,baseVersionId:head.versionId,operations:"operations" in change?change.operations:request.operations,summary:request.summary,client:request.client??"browser",verification:request.verification,draftFingerprint:request.draftFingerprint}};
}
