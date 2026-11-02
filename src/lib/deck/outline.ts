import { LocalizedError } from "../i18n/errors";
/** Authored flat order plus stable parent identities. HTML sections stay siblings. */
export type OutlineEntry = { id: string; parent: string | null };
export const DECK_PARENT = "data-deck-parent";
export const DECK_OUTLINE_DEPTH = 3;

export function outlineDepth(entries: readonly OutlineEntry[], id: string): number {
  const parents = new Map(entries.map(entry => [entry.id, entry.parent]));
  let depth = 1, parent = parents.get(id);
  const seen = new Set([id]);
  while (parent) {
    if (seen.has(parent) || !parents.has(parent)) throw new LocalizedError("deckEditor.structure.outline.cycleOrMissing");
    seen.add(parent); depth++; parent = parents.get(parent);
  }
  return depth;
}
export function validateOutline(entries: readonly OutlineEntry[]): void {
  const seen = new Set<string>(), stack: string[] = [];
  for (const entry of entries) {
    if (seen.has(entry.id)) throw new LocalizedError("deckEditor.structure.outline.duplicateIds");
    if (entry.parent !== null && !stack.includes(entry.parent)) throw new LocalizedError("deckEditor.structure.outline.childrenTogether");
    stack.length = entry.parent === null ? 0 : stack.indexOf(entry.parent) + 1;
    stack.push(entry.id); seen.add(entry.id);
    if (stack.length > DECK_OUTLINE_DEPTH) throw new LocalizedError("deckEditor.structure.outline.depth");
  }
}
export function outlineBranch(entries: readonly OutlineEntry[], id: string): string[] {
  const result = new Set([id]);
  for (const entry of entries) if (entry.parent && result.has(entry.parent)) result.add(entry.id);
  return entries.filter(entry => result.has(entry.id)).map(entry => entry.id);
}
export function outlineRoots(entries: readonly OutlineEntry[], selected: readonly string[]): string[] {
  const chosen = new Set(selected),parents=new Map(entries.map(entry=>[entry.id,entry.parent]));
  return entries.filter(entry=>{
    if(!chosen.has(entry.id))return false;let parent=entry.parent;const seen=new Set([entry.id]);
    while(parent){if(chosen.has(parent))return false;if(seen.has(parent))throw new LocalizedError("deckEditor.structure.outline.cycle");seen.add(parent);parent=parents.get(parent)??null;}
    return true;
  }).map(entry=>entry.id);
}
export function moveOutline(entries: readonly OutlineEntry[], selected: readonly string[], target: string | null, placement: "before" | "after" | "inside"): OutlineEntry[] {
  validateOutline(entries);
  const roots = outlineRoots(entries,selected), moving = new Set(roots.flatMap(id => outlineBranch(entries,id)));
  if (!roots.length) return [...entries];
  if (target !== null && moving.has(target)) throw new LocalizedError("deckEditor.structure.outline.intoSelf");
  const anchor = entries.find(entry => entry.id === target);
  if (target !== null && !anchor) throw new LocalizedError("deckEditor.structure.outline.destinationGone");
  const rest = entries.filter(entry => !moving.has(entry.id));
  const parent = placement === "inside" ? target : anchor?.parent ?? null;
  const end = target === null ? null : outlineBranch(rest,target).at(-1);
  const at = target === null ? rest.length : placement === "before" ? rest.findIndex(entry => entry.id === target) : rest.findIndex(entry => entry.id === end) + 1;
  const branch = entries.filter(entry => moving.has(entry.id)).map(entry => ({...entry,parent:roots.includes(entry.id)?parent:entry.parent}));
  const result = [...rest.slice(0,at),...branch,...rest.slice(at)];
  validateOutline(result); return result;
}
