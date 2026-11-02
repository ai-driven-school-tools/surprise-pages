import { z } from "zod";
import { applyTextChange, createTextState, DeckTextReplica, textSeedIdentity, textStateSchema, type TextState } from "./text-sync";
import { applyDeckEditCommand, inspectDeckEdit,prepareDeckSource,assertDeckSourceIdentities, DeckEditConflictError, deckOperationValue, deckSourceOutline, deckSourceDescendants, deckFragmentRootId } from "./source";
import { deckEditOperationSchema,type DeckEditOperation } from "./model";
import { DECK_PARENT, outlineRoots, validateOutline } from "../outline";
import { defaultTranslate } from "../../i18n/default";

export const DECK_COLLABORATION_PROTOCOL = 2;
export const deckCollaborationSchema = z.object({ protocol: z.literal(2), epoch: z.string().uuid(), fields: z.record(z.string().regex(/^[a-z][a-z0-9-]*\/\d+$/), textStateSchema),owners:z.record(z.string(),z.string().uuid()).default({}) }).strict();
export type DeckCollaboration = z.infer<typeof deckCollaborationSchema>;

export function createDeckCollaboration(html: string): DeckCollaboration {
  return reconcileDeckCollaboration(html, { protocol: 2, epoch: crypto.randomUUID(), fields: {},owners:{} });
}

const geometry=new Set(["translate","scale","transform-origin","width","height","left","top","position"]);
export function isCollaborativeProperty(op:DeckEditOperation):boolean{return ["style","attribute","image","video-source","chart-value","setting-field"].includes(op.kind);}
function ownedProperties(html:string,op:DeckEditOperation):string[]{
  const key=(property:string)=>[`${op.target}/${property}`];
  switch(op.kind){
    case "text":return [];
    case "fragment":case "remove":return key("structure");
    case "insert":return [`${op.node.id}/structure`];
    case "restore":{const id=deckFragmentRootId(op.html);return id?[`${id}/structure`]:[];}
    case "style":return key(geometry.has(op.property)?"geometry":`style:${op.property}`);
    case "attribute":return key(op.name===DECK_PARENT?"position":`attribute:${op.name}`);
    case "move":return key("position");
    case "outline-move":return outlineRoots(deckSourceOutline(html),op.ids).map(id=>`${id}/position`);
    case "image":case "video-source":return key("media");
    case "chart-value":return key(`chart:${op.seriesId}:${op.pointId}`);
    case "setting-field":return key(`setting:${op.name}:${JSON.stringify(op.path)}`);
    case "setting":return key(`setting:${op.name}`);
    case "notes":return key("notes");
    default:return [];
  }
}
function relativeOrder(operation:DeckEditOperation,parent:string,before:readonly string[],after:readonly string[]):DeckEditOperation[]{
  const current=[...before],moves:DeckEditOperation[]=[];
  for(let i=after.length-1;i>=0;i--){
    const target=after[i],anchor=after[i+1]??null,at=current.indexOf(target);
    if(at<0)throw new DeckEditConflictError(defaultTranslate("deckEditor.conflict.orderTargetMissing"));
    if((current[at+1]??null)===anchor)continue;
    current.splice(at,1);current.splice(anchor===null?current.length:current.indexOf(anchor),0,target);
    moves.push({kind:"move",target,parentId:parent,beforeId:anchor,commandId:operation.commandId,reverts:operation.reverts});
  }
  return moves;
}
function expandOperations(operations:readonly DeckEditOperation[]):DeckEditOperation[]{
  const commandId=crypto.randomUUID();
  return operations.flatMap((original):DeckEditOperation[]=>{
    const op={...original,commandId:original.commandId??commandId};
    if(op.kind==="order")return relativeOrder(op,op.target,op.before,op.after);
    if(op.kind!=="outline")return [op];
    const before=new Map(op.before.map(entry=>[entry.id,entry.parent]));
    const parents:DeckEditOperation[]=op.after.filter(entry=>before.has(entry.id)&&before.get(entry.id)!==entry.parent).map(entry=>({kind:"attribute",target:entry.id,name:DECK_PARENT,before:before.get(entry.id)??null,after:entry.parent,commandId:op.commandId,reverts:op.reverts}));
    return [...parents,...relativeOrder(op,"deck-root",op.before.map(entry=>entry.id),op.after.map(entry=>entry.id))];
  });
}

/** Unchanged runs keep their CRDT identities. Structural replacements start new run epochs. */
export function reconcileDeckCollaboration(html: string, previous: DeckCollaboration, seed=previous.epoch): DeckCollaboration {
  const fields: Record<string, TextState> = {};
  for (const node of inspectDeckEdit(html).nodes) for (const run of node.textRuns) {
    const key = `${node.id}/${run.run}`, state = previous.fields[key];
    if (state) {
      const replica = new DeckTextReplica(state);
      try { if (replica.value === run.text) { fields[key] = state; continue; } }
      finally { replica.destroy(); }
    }
    fields[key] = createTextState(run.text,`${previous.epoch}:${seed}:${key}:${run.text}`);
  }
  return { ...previous, fields };
}

export function applyCollaborativeOperations(
  html: string, current: DeckCollaboration, operations: readonly DeckEditOperation[],
  base: DeckCollaboration = current,
  options:{strict?:boolean}={},
): { html: string; collaboration: DeckCollaboration; operations: DeckEditOperation[]; inverse: DeckEditOperation[] } {
  if (base.epoch !== current.epoch) throw new DeckEditConflictError(defaultTranslate("deckEditor.conflict.structureChanged"),"generation");
  let result = prepareDeckSource(html);
  let fields = { ...current.fields };
  const owners={...current.owners};
  const sourceFields = { ...base.fields };
  const materialized: DeckEditOperation[] = [], inverse: DeckEditOperation[] = [];
  const starts=new Map<string,Record<string,string>>(),appliedOwnership=new Set<string>();
  for (const operation of expandOperations(operations)) {
    let effective = operation;
    let textInverse: DeckEditOperation | undefined;
    const commandId=operation.commandId??crypto.randomUUID(),keys=ownedProperties(result,operation);
    if(!starts.has(commandId))starts.set(commandId,{...owners});
    const originalOwners=starts.get(commandId)!;
    if(operation.reverts&&keys.some(key=>(owners[key]??null)!==(operation.expects&&key in operation.expects?operation.expects[key]:operation.reverts)&&!appliedOwnership.has(commandId+"/"+key)))throw new DeckEditConflictError(defaultTranslate("deckEditor.conflict.undoBlocked"));
    if (operation.kind === "text") {
      if(options.strict&&!operation.sync&&deckOperationValue(result,operation)!==operation.before&&deckOperationValue(result,operation)!==operation.after)throw new DeckEditConflictError();
      const key = `${operation.target}/${operation.run}`, state = fields[key];
      if (!state) throw new DeckEditConflictError(defaultTranslate("deckEditor.conflict.inputDeleted"));
      let update = operation.sync;
      if (!update) {
        const original = sourceFields[key];
        if (!original || original.epoch !== state.epoch) throw new DeckEditConflictError();
        const replica = new DeckTextReplica(original);
        try {
          if (replica.value !== operation.before) throw new DeckEditConflictError();
          update = replica.replace(operation.after);
          sourceFields[key] = replica.snapshot();
        } finally { replica.destroy(); }
      }
      try {
        const before = new DeckTextReplica(state);
        try {
          const merged = applyTextChange(state, update);
          effective = { ...operation, before: before.value, after: merged.value, sync: {...update,undo:update.undo??merged.inverse.update} };
          fields[key] = merged.state;
          textInverse = { ...operation, before: merged.value, after: before.value, sync: merged.inverse };
        } finally { before.destroy(); }
      } catch (error) { throw new DeckEditConflictError(error instanceof Error ? error.message : defaultTranslate("deckEditor.conflict.collaborativeInput")); }
    }else if(!options.strict&&!operation.reverts&&isCollaborativeProperty(operation)){
      const before=deckOperationValue(result,operation);
      if(before===undefined)throw new DeckEditConflictError(defaultTranslate("deckEditor.conflict.changeTargetGone"));
      effective=deckEditOperationSchema.parse({...operation,before});
    }
    const structural=["insert","remove","restore","fragment"].includes(operation.kind);
    const priorFields=fields;
    const beforeIds=structural?inspectDeckEdit(result).nodes.map(node=>node.id):[];
    const replaced=operation.kind==="fragment"?deckSourceDescendants(result,operation.target):[];
    const applied = applyDeckEditCommand(result, effective);
    const changed=applied.html!==result;
    const touched=new Set(keys);
    let restoredTexts:Record<string,TextState>|undefined;
    result = applied.html; materialized.push({...effective,commandId});
    if(structural){
      const next=reconcileDeckCollaboration(result,{...current,fields},"textSeed" in operation?operation.textSeed:undefined);
      for(const [key,state] of Object.entries(next.fields))if(!fields[key]||fields[key].epoch!==state.epoch)sourceFields[key]=state;
      fields=next.fields;
      const afterIds=inspectDeckEdit(result).nodes.map(node=>node.id);
      const reset=new Set([...replaced,...beforeIds.filter(id=>!afterIds.includes(id)),...afterIds.filter(id=>!beforeIds.includes(id))]);
      restoredTexts=Object.fromEntries(Object.entries(priorFields).filter(([key])=>reset.has(key.split("/")[0])));
      if(operation.reverts&&operation.textStates){
        for(const [key,state] of Object.entries(operation.textStates)){
          if(!reset.has(key.split("/")[0])||!fields[key])continue;
          const restored=new DeckTextReplica(state),expected=new DeckTextReplica(fields[key]);
          try{if(restored.value!==expected.value)throw new DeckEditConflictError(defaultTranslate("deckEditor.conflict.restoreTextMismatch"));fields[key]=state;sourceFields[key]=state;}
          finally{restored.destroy();expected.destroy();}
        }
      }
      if(changed){
        for(const key of new Set([...Object.keys(owners),...Object.keys(operation.restores??{})]))if(reset.has(key.split("/")[0])){touched.add(key);delete owners[key];}
      }
    }
    let ownershipChanged=false;
    if(changed||operation.reverts){
      for(const key of touched){
        const before=owners[key]??null;
        if(operation.reverts&&operation.restores&&key in operation.restores){const previous=operation.restores[key];if(previous===null)delete owners[key];else owners[key]=previous;}
        else if(changed&&keys.includes(key))owners[key]=commandId;
        ownershipChanged ||= before!==(owners[key]??null);
        appliedOwnership.add(commandId+"/"+key);
      }
    }
    const undoSeed="textSeed" in operation && operation.textSeed ? textSeedIdentity("undo:"+operation.textSeed) : crypto.randomUUID();
    const expects=Object.fromEntries([...touched].map(key=>[key,owners[key]??null]));
    const restores=Object.fromEntries([...touched].map(key=>[key,originalOwners[key]??null]));
    // Undo may restore ownership without changing visible HTML (for example one
    // already-positioned member of a moved group). Keep its redo as well.
    let inverseOperations=applied.inverse;
    if(!inverseOperations.length&&ownershipChanged){
      const value="before" in effective&&"after" in effective?deckOperationValue(result,effective):undefined;
      inverseOperations=["before" in effective&&"after" in effective?deckEditOperationSchema.parse({...effective,before:value,after:value}):effective];
    }
    const undo = (textInverse ? [textInverse] : inverseOperations.map(op=>op.kind==="insert"||op.kind==="fragment"||op.kind==="restore"||op.kind==="remove"?{...op,textSeed:undoSeed}:op)).map(op=>({...op,commandId:textSeedIdentity("undo-command:"+commandId),reverts:commandId,...(touched.size?{expects,restores}:{}),...(restoredTexts?{textStates:restoredTexts}:{})}));
    inverse.unshift(...undo);
  }
  assertDeckSourceIdentities(result);
  try{validateOutline(deckSourceOutline(result));}catch(error){throw new DeckEditConflictError(error instanceof Error?error.message:defaultTranslate("deckEditor.conflict.checkHierarchy"));}
  return { html: result, collaboration: { ...current, fields,owners }, operations: materialized, inverse };
}
