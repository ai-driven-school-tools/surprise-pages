import * as Y from "yjs";
import { diffChars } from "diff";
import type { TextChange,TextState } from "./text-model";
import { MAX_TEXT_UPDATE_ENCODED } from "./text-model";
import { LocalizedError } from "../../i18n/errors";
export { textChangeSchema,textStateSchema,type TextChange,type TextState } from "./text-model";

function encode(bytes: Uint8Array): string {
  let binary = "";
  for (let start = 0; start < bytes.length; start += 8192) binary += String.fromCharCode(...bytes.subarray(start, start + 8192));
  return btoa(binary);
}
function decode(value: string): Uint8Array { return Uint8Array.from(atob(value), character => character.charCodeAt(0)); }

/** Combine forward CRDT updates, never independently generated undo updates. */
export function mergeTextUpdates(updates:readonly string[]):string {
  const merged=encode(Y.mergeUpdates(updates.map(decode)));
  if(merged.length>MAX_TEXT_UPDATE_ENCODED)throw new LocalizedError("deckEditor.structure.text.changeTooLarge");
  return merged;
}

/** One plain-text run per document: arbitrary HTML/formatting never enters the CRDT. */
export class DeckTextReplica {
  private readonly document = new Y.Doc();
  private readonly origin = {};
  private readonly text = this.document.getText("text");
  private readonly history = new Y.UndoManager(this.text, { trackedOrigins: new Set([this.origin]), captureTimeout: 500 });
  readonly epoch: string;

  constructor(snapshot: TextState) {
    this.epoch = snapshot.epoch;
    Y.applyUpdate(this.document, decode(snapshot.state));
    this.validate();
  }
  private validate(): void {
    if (this.document.share.size !== 1 || !this.document.share.has("text") || this.text.length > 100_000 || this.text.toDelta().some((part: { insert?: unknown; attributes?: unknown }) => typeof part.insert !== "string" || part.attributes !== undefined)) {
      throw new LocalizedError("deckEditor.structure.text.invalidShared");
    }
  }
  get value(): string { return this.text.toString(); }
  get canUndo(): boolean { return this.history.canUndo(); }
  get canRedo(): boolean { return this.history.canRedo(); }
  snapshot(): TextState {
    const state=encode(Y.encodeStateAsUpdate(this.document));
    if(state.length>MAX_TEXT_UPDATE_ENCODED)throw new LocalizedError("deckEditor.structure.text.historyFull");
    return {epoch:this.epoch,state};
  }
  receive(change: TextChange, local = false): void {
    if (change.epoch !== this.epoch) throw new LocalizedError("deckEditor.structure.text.structureUpdated");
    Y.applyUpdate(this.document, decode(change.update), local ? this.origin : null);
    this.validate();
  }
  merge(snapshot: TextState): void { this.receive({ epoch: snapshot.epoch, update: snapshot.state }); }
  private capture(action: () => void): TextChange {
    const vector = Y.encodeStateVector(this.document);
    action();
    this.validate();
    return { epoch: this.epoch, update: encode(Y.encodeStateAsUpdate(this.document, vector)) };
  }
  replace(value: string): TextChange {
    if (value.length > 100_000) throw new LocalizedError("deckEditor.structure.text.tooLong");
    const parts = diffChars(this.value, value, { timeout: 100, maxEditLength: 100_000 });
    if (!parts) throw new LocalizedError("deckEditor.structure.text.splitEdit");
    return this.capture(() => this.document.transact(() => {
      let at = 0;
      for (const part of parts) {
        if (part.added) { this.text.insert(at, part.value); at += part.value.length; }
        else if (part.removed) this.text.delete(at, part.value.length);
        else at += part.value.length;
      }
    }, this.origin));
  }
  undo(): TextChange { return this.capture(() => { this.history.undo(); }); }
  redo(): TextChange { return this.capture(() => { this.history.redo(); }); }
  stopCapturing(): void { this.history.stopCapturing(); }
  anchor(index: number): string { return encode(Y.encodeRelativePosition(Y.createRelativePositionFromTypeIndex(this.text, index))); }
  position(anchor: string): number | null {
    return Y.createAbsolutePositionFromRelativePosition(Y.decodeRelativePosition(decode(anchor)), this.document)?.index ?? null;
  }
  destroy(): void { this.history.destroy(); this.document.destroy(); }
  assertComplete(): void {
    if (this.document.store.pendingStructs || this.document.store.pendingDs) throw new LocalizedError("deckEditor.structure.text.missingUpdates");
  }
}

export function textSeedIdentity(seed:string):string {
  const words=[2166136261,2246822507,3266489909,668265263].map(initial=>{
    let hash=initial;for(let at=0;at<seed.length;at++)hash=Math.imul(hash^seed.charCodeAt(at),16777619);
    return (hash>>>0).toString(16).padStart(8,"0");
  }).join("");
  return `${words.slice(0,8)}-${words.slice(8,12)}-4${words.slice(13,16)}-8${words.slice(17,20)}-${words.slice(20)}`;
}
export function createTextState(value: string, seed?: string): TextState {
  const document = new Y.Doc();
  const epoch=seed===undefined?crypto.randomUUID():textSeedIdentity(seed);
  // Only the immutable seed uses this deterministic clock. Live replicas always
  // retain Yjs's randomly generated client IDs for subsequent user edits.
  if(seed!==undefined)document.clientID=parseInt(epoch.slice(0,8),16);
  document.getText("text").insert(0, value);
  const state = { epoch, state: encode(Y.encodeStateAsUpdate(document)) };
  document.destroy();
  return state;
}

/** Validate on an isolated copy: a rejected update can never poison a live replica. */
export function applyTextChange(state: TextState, change: TextChange): { state: TextState; value: string; inverse: TextChange } {
  const replica = new DeckTextReplica(state);
  try {
    replica.receive(change, true); replica.assertComplete();
    const snapshot = replica.snapshot(), value = replica.value;
    const calculated=replica.undo();
    const inverse=change.undo && snapshot.state!==state.state ? {epoch:change.epoch,update:change.undo} : calculated;
    if(change.undo){const probe=new DeckTextReplica(snapshot);try{probe.receive(inverse);probe.assertComplete();}finally{probe.destroy();}}
    return { state: snapshot, value, inverse };
  }
  finally { replica.destroy(); }
}
