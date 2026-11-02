import { DeckTextReplica, type TextState } from "../../../lib/deck/edit/text-sync";
import type { DeckEditOperation } from "../../../lib/deck/edit/model";
import { LocalizedError } from "../../../lib/i18n/errors";

export function textKey(target: string, run: number): string { return `${target}/${run}`; }

/** Live replicas survive acknowledgements; only a source-generation change replaces them. */
export class DeckTextBindings {
  private readonly replicas = new Map<string, DeckTextReplica>();
  constructor(states: Record<string, TextState>) { this.merge(states); }
  reset(states: Record<string, TextState>): void {
    for (const [key, state] of Object.entries(states)) {
      const current = this.replicas.get(key);
      if (current?.epoch === state.epoch && current.snapshot().state === state.state) continue;
      current?.destroy(); this.replicas.set(key, new DeckTextReplica(state));
    }
    for (const [key, replica] of this.replicas) if (!(key in states)) { replica.destroy(); this.replicas.delete(key); }
  }
  merge(states: Record<string, TextState>): void {
    for (const [key, state] of Object.entries(states)) {
      const current = this.replicas.get(key);
      if (current?.epoch === state.epoch) current.merge(state);
      else { current?.destroy(); this.replicas.set(key, new DeckTextReplica(state)); }
    }
    for (const [key, replica] of this.replicas) if (!(key in states)) { replica.destroy(); this.replicas.delete(key); }
  }
  encode(operations: readonly DeckEditOperation[]): DeckEditOperation[] {
    return operations.map(operation => {
      if (operation.kind !== "text" || operation.sync) return operation;
      const replica = this.replicas.get(textKey(operation.target, operation.run));
      if (!replica) return operation;
      if (replica.value !== operation.before) throw new LocalizedError("deckEditor.view.textSync");
      return { ...operation, sync: replica.replace(operation.after) };
    });
  }
  bookmark(document: Document): () => void {
    const selection = document.getSelection();
    if (!selection?.anchorNode || !selection.focusNode) return () => {};
    const locate = (node: Node, offset: number) => {
      const parent = node.parentElement, target = parent?.getAttribute("data-deck-node");
      if (!parent || !target || node.nodeType !== 3) return null;
      const run = [...parent.childNodes].filter(child => child.nodeType === 3).findIndex(child => child === node);
      const replica = this.replicas.get(textKey(target, run));
      return replica ? { node, key: textKey(target, run), anchor: replica.anchor(offset) } : null;
    };
    const start = locate(selection.anchorNode, selection.anchorOffset), end = locate(selection.focusNode, selection.focusOffset);
    return () => {
      if (!start || !end || !start.node.isConnected || !end.node.isConnected) return;
      const a = this.replicas.get(start.key)?.position(start.anchor), b = this.replicas.get(end.key)?.position(end.anchor);
      if (a != null && b != null) selection.setBaseAndExtent(start.node, Math.min(a, start.node.textContent?.length ?? 0), end.node, Math.min(b, end.node.textContent?.length ?? 0));
    };
  }
  snapshot(): Record<string, TextState> { return Object.fromEntries([...this.replicas].map(([key, replica]) => [key, replica.snapshot()])); }
  checkpoint(operations:readonly DeckEditOperation[]):Record<string,TextState>{
    const states:Record<string,TextState>={};
    for(const op of operations)if(op.kind==="text"){const key=textKey(op.target,op.run),replica=this.replicas.get(key);if(replica)states[key]=replica.snapshot();}
    return states;
  }
  rollback(states:Record<string,TextState>):void{for(const [key,state] of Object.entries(states)){this.replicas.get(key)?.destroy();this.replicas.set(key,new DeckTextReplica(state));}}
  value(key: string): string | undefined { return this.replicas.get(key)?.value; }
  undo(key: string) { return this.replicas.get(key)?.undo(); }
  redo(key: string) { return this.replicas.get(key)?.redo(); }
  destroy(): void { for (const replica of this.replicas.values()) replica.destroy(); this.replicas.clear(); }
}
