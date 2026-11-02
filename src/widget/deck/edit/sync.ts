/** Ordered, idempotent edit batches. Transport and rendering are deliberately outside this state machine. */
import { DECK_EDIT_BATCH_LIMIT } from "../../../lib/deck/edit/model";
import { LocalizedError } from "../../../lib/i18n/errors";
export type EditBatch<T> = {
  operationId: string;
  operations: T[];
  intent: "edit" | "undo" | "redo";
  baseVersionId?: string;
  inverse?: T[];
  undone?: boolean;
  undoOf?: string;
};
export type EditQueueDraft<T> = {
  versionId: string;
  batches: EditBatch<T>[];
  savedAt: number;
  blocked: boolean;
  rejected?: {batch:EditBatch<T>;reason:string}[];
};
export type EditQueueStatus = "saved" | "pending" | "saving" | "offline" | "paused" | "conflict" | "attention";
const MAX_FAILURES = 5;
export const DECK_DRAFT_TTL = 3 * 86400000;

export class DeckEditQueue<T> {
  versionId: string;
  revision = 0;
  generation = 0;
  status: EditQueueStatus = "saved";
  private batches: EditBatch<T>[] = [];
  private sending = false;
  private failures = 0;
  private undoStack: T[][] = [];
  private redoStack: T[][] = [];
  private typingBatchId: string | null = null;
  private rejected: {batch:EditBatch<T>;reason:string}[]=[];

  constructor(versionId: string) { this.versionId = versionId; }
  get pending(): boolean { return this.batches.length > 0; }
  get dirty(): boolean { return this.pending || this.rejected.length>0; }
  get needsReview():boolean { return this.rejected.length>0; }
  get busy(): boolean { return this.sending; }
  get canUndo(): boolean { const last = this.batches.at(-1); return this.status !== "conflict" && this.status !== "paused" && (Boolean(last?.inverse?.length && !last.undone && last.intent !== "undo") || !this.pending && this.undoStack.length > 0); }
  get canRedo(): boolean { return !this.pending && this.redoStack.length > 0; }
  private idleStatus():EditQueueStatus{return this.sending?"saving":this.pending?"pending":this.needsReview?"attention":"saved";}

  historyOperations(direction: "undo" | "redo"): readonly T[] | null {
    if (direction === "redo") return this.canRedo ? this.redoStack.at(-1) ?? null : null;
    if (!this.canUndo) return null;
    const last = this.batches.at(-1);
    return last?.inverse?.length && !last.undone ? last.inverse : this.undoStack.at(-1) ?? null;
  }
  get retryDelay(): number { return Math.min(16000, 1000 * 2 ** Math.max(0, this.failures - 1)); }
  enqueue(operations: T[], operationId: string, typing = false, inverse?: T[]): void {
    if (!operations.length) return;
    this.revision++;this.generation++;
    const last = this.batches.at(-1);
    if (typing && last && last.operationId === this.typingBatchId && last.baseVersionId === undefined &&
      last.operations.length + operations.length <= DECK_EDIT_BATCH_LIMIT) {
      last.operations.push(...operations);
      if (inverse) last.inverse = [...inverse, ...last.inverse ?? []];
    } else {
      this.batches.push({ operationId, operations, intent: "edit", inverse });
      this.typingBatchId = typing ? operationId : null;
    }
    this.redoStack = [];
    if (this.status !== "conflict" && this.status !== "paused" && !this.sending) this.status = "pending";
  }
  /** Only a never-sent typing batch may change its fingerprint or inverse. */
  compactTyping(compact:(id:string,operations:readonly T[])=>{operations:T[];inverse:T[]}|null):void {
    const batch=this.batches.at(-1);
    if(!batch||batch.operationId!==this.typingBatchId||batch.intent!=="edit"||batch.baseVersionId!==undefined)return;
    const result=compact(batch.operationId,batch.operations);if(!result)return;
    batch.operations=result.operations;batch.inverse=result.inverse;this.revision++;this.generation++;
  }
  next(): (EditBatch<T> & { baseVersionId: string }) | null {
    if (this.sending || this.status === "conflict" || this.status === "paused") return null;
    const batch = this.batches[0];
    if (!batch) return null;
    batch.baseVersionId ??= this.versionId;
    this.sending = true;
    this.status = "saving";
    return { ...batch, baseVersionId: batch.baseVersionId };
  }
  acknowledge(versionId: string, inverse: T[]): void {
    if (!this.sending) throw new LocalizedError("deckEditor.sync.unexpectedAck");
    this.revision++;this.generation++;
    const batch = this.batches.shift();
    if (!batch) throw new LocalizedError("deckEditor.sync.nothingToSave");
    if(batch.undone){const pending=this.batches.find(item=>item.undoOf===batch.operationId);if(pending){if(inverse.length)pending.operations=[...inverse];else this.batches.splice(this.batches.indexOf(pending),1);}}
    if (inverse.length && batch.intent === "undo") {
      if (!this.batches.some((pending) => pending.intent === "edit")) this.redoStack.push(inverse);
    } else if (inverse.length && !batch.undone) this.undoStack.push(inverse);
    this.sending = false;
    this.failures = 0;
    this.versionId = versionId;
    this.status = this.idleStatus();
  }
  failed(reason: "network" | "conflict" | "fatal"): void {
    this.sending = false;
    this.failures++;
    this.status = reason === "conflict" ? "conflict" : reason === "fatal" || this.failures >= MAX_FAILURES ? "paused" : "offline";
  }
  retry(): void {
    if (this.status === "conflict") return;
    this.failures = 0;
    this.status = this.idleStatus();
  }
  advance(versionId: string): boolean {
    // A request whose acknowledgement was lost must first be retried unchanged.
    if (this.sending || this.batches[0]?.baseVersionId) return false;
    this.versionId = versionId;
    return true;
  }
  /** Collaborative updates have stable identities. Receiving a new head never rewrites an in-flight request. */
  observe(versionId: string): boolean { if(this.versionId!==versionId)this.revision++;this.versionId = versionId; return true; }
  pendingOperations(): T[] { return this.batches.flatMap((batch) => batch.operations); }
  previewBatches():readonly EditBatch<T>[] { return [...this.batches]; }
  reviewOperations():T[]{return this.rejected.flatMap(item=>item.batch.operations);}
  quarantine(operationId:string,reason:string,confirmed=false):boolean{
    const index=this.batches.findIndex(batch=>batch.operationId===operationId),batch=this.batches[index];
    if(!batch||batch.baseVersionId!==undefined&&!confirmed)return false;
    if(index===0&&this.sending){if(!confirmed)return false;this.sending=false;}
    this.batches.splice(index,1);this.rejected.push({batch,reason});this.revision++;this.generation++;
    if(this.typingBatchId===operationId)this.typingBatchId=null;
    this.failures=0;this.status=this.idleStatus();return true;
  }
  undo(operationId: string): boolean {
    if (!this.canUndo) return false;
    this.revision++;this.generation++;
    const last = this.batches.at(-1);
    if (last?.inverse?.length && !last.undone) {
      if (last.baseVersionId === undefined) { this.batches.pop(); this.redoStack.push(last.operations); }
      else { last.undone = true; this.batches.push({ operationId, operations: last.inverse, intent: "undo", undoOf:last.operationId }); }
      this.typingBatchId = null;
      if (!this.sending) this.status = this.idleStatus();
      return true;
    }
    const operations = this.undoStack.pop();
    if (!operations) return false;
    this.batches.push({ operationId, operations, intent: "undo" });
    this.status = "pending";
    return true;
  }
  redo(operationId: string): boolean {
    if (!this.canRedo) return false;
    this.revision++;this.generation++;
    const operations = this.redoStack.pop();
    if (!operations) return false;
    this.batches.push({ operationId, operations, intent: "redo" });
    this.status = "pending";
    return true;
  }
  exportDraft(savedAt: number): EditQueueDraft<T> {
    return { versionId: this.versionId, batches: this.batches.map((batch) => ({ ...batch, operations: [...batch.operations] })), savedAt, blocked: this.status === "conflict",...(this.rejected.length?{rejected:this.rejected.map(item=>({reason:item.reason,batch:{...item.batch,operations:[...item.batch.operations]}}))}:{}) };
  }
  static restore<T>(draft: EditQueueDraft<T>, now: number): DeckEditQueue<T> | null {
    if (now - draft.savedAt >= DECK_DRAFT_TTL || now < draft.savedAt) return null;
    const queue = new DeckEditQueue<T>(draft.versionId);
    queue.batches = draft.batches.map((batch) => ({ ...batch, operations: [...batch.operations] }));
    queue.rejected=draft.rejected??[];
    queue.status = draft.blocked ? "conflict" : queue.idleStatus();
    return queue;
  }
}
