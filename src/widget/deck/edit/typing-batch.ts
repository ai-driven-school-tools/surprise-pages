import type {DeckEditOperation} from "../../../lib/deck/edit/model";
import {applyTextChange,DeckTextReplica,mergeTextUpdates,textSeedIdentity,type TextState,type TextChange} from "../../../lib/deck/edit/text-sync";

type SyncedText=Extract<DeckEditOperation,{kind:"text"}>&{sync:TextChange;commandId:string};

/** One checkpoint for the current never-sent typing batch. Restored drafts start
 * a new batch, so no extra checkpoint or alternate body is persisted. */
export function createDeckTypingBatch(){
  let batchId="",baseline:Record<string,TextState>={};
  return (id:string,operations:readonly DeckEditOperation[],before:Record<string,TextState>,latest:Record<string,TextState>):{operations:DeckEditOperation[];inverse:DeckEditOperation[]}|null=>{
    if(batchId!==id){batchId=id;baseline=before;}
    if(operations.length<2)return null;
    const groups=new Map<string,SyncedText[]>();
    for(const op of operations){if(op.kind!=="text"||!op.sync||!op.commandId||op.reverts)return null;const key=`${op.target}/${op.run}`;const group=groups.get(key)??[];group.push({...op,sync:op.sync,commandId:op.commandId});groups.set(key,group);}
    const compacted:DeckEditOperation[]=[],inverse:DeckEditOperation[]=[];
    try{
      for(const [key,group] of groups){
        const first=group[0],state=baseline[key];if(!state||group.some(op=>op.sync.epoch!==state.epoch))return null;
        const replica=new DeckTextReplica(state);
        try{
          // Include newly received peer dependencies without applying this
          // never-sent batch as part of the undo baseline.
          if(latest[key])replica.merge(latest[key]);
          const sync={epoch:state.epoch,update:mergeTextUpdates(group.map(op=>op.sync.update))};
          const merged=applyTextChange(replica.snapshot(),sync);
          compacted.push({...first,before:replica.value,after:merged.value,sync:{...sync,undo:merged.inverse.update}});
          inverse.unshift({...first,before:merged.value,after:replica.value,sync:merged.inverse,commandId:textSeedIdentity("undo-command:"+first.commandId),reverts:first.commandId});
        }finally{replica.destroy();}
      }
      return {operations:compacted,inverse};
    }catch{return null;}
  };
}
