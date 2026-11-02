import {DeckEditConflictError} from "./source";
import {deckRequestFingerprint,prepareDeckRequest,DeckEditRequestError,DeckEditBusyError,type DeckEditStore,type DeckEditSnapshot,type SaveRequest,type DeckSaveResult} from "./request";
export {DeckEditRequestError,DeckEditBusyError,validateDeckRequestBase} from "./request";
export type {DeckEditStore,DeckEditSnapshot,SaveRequest} from "./request";
export type {DeckEditReceipt} from "./receipts";
import type {DeckEditOperation} from "./model";
type SaveLane={tail:Promise<void>;head?:DeckEditSnapshot;versions:Map<string,DeckEditSnapshot>;bytes:number};
const saves=new Map<string,SaveLane>();

/** Avoid a retry stampede inside one server instance. The database compare-and-
 * commit remains authoritative across different instances and process restarts. */
export async function saveDeckOperations(store:DeckEditStore,request:SaveRequest):Promise<DeckSaveResult>{
  if(!store.key)return save(store,request);
  const key=store.key,lane=saves.get(key)??{tail:Promise.resolve(),versions:new Map<string,DeckEditSnapshot>(),bytes:0};
  const previous=lane.tail;
  let release=()=>{};
  const current=new Promise<void>(resolve=>{release=resolve;});
  const tail=previous.then(()=>current);lane.tail=tail;saves.set(key,lane);
  // This read does not depend on the preceding save. A concurrently committed
  // duplicate still hits the database uniqueness guard and is reread on retry.
  // Capture rejection now so waiting in the lane cannot produce an unhandled one.
  const pendingReceipt=store.receipt(request.id).then(receipt=>({receipt}),error=>({error}));
  await previous;
  let firstReceipt=true;
  const size=(snapshot:DeckEditSnapshot)=>snapshot.html.length+Object.entries(snapshot.collaboration?.fields??{}).reduce((sum,[key,value])=>sum+key.length+value.epoch.length+value.state.length,0)+Object.entries(snapshot.collaboration?.owners??{}).reduce((sum,[key,value])=>sum+key.length+value.length,0);
  function remember(snapshot:DeckEditSnapshot):DeckEditSnapshot{
    const length=size(snapshot),old=lane.versions.get(snapshot.versionId);if(old){lane.bytes-=size(old);lane.versions.delete(snapshot.versionId);}
    if(length<=4*1024*1024){
      while(lane.versions.size>=8||lane.bytes+length>4*1024*1024){const first=lane.versions.keys().next().value;if(first===undefined)break;lane.bytes-=size(lane.versions.get(first)!);lane.versions.delete(first);}
      lane.versions.set(snapshot.versionId,snapshot);lane.bytes+=length;
    }
    return snapshot;
  }
  const queued:DeckEditStore={key:store.key,receipt:async id=>{
    if(id===request.id&&firstReceipt){firstReceipt=false;const result=await pendingReceipt;if("error" in result)throw result.error;return result.receipt;}
    return store.receipt(id);
  },recover:()=>store.recover(),commit:input=>store.commit(input),read:async()=>remember(await store.read()),readVersion:store.readVersion?async id=>{
    const known=lane.versions.get(id);if(known)return remember(known);
    const found=await store.readVersion?.(id);return found?remember(found):null;
  }:undefined};
  try{
    let result:Awaited<ReturnType<typeof save>>;
    try{result=await save(queued,request,lane.head);}
    catch(error){
      // Either the cached head or the early "not received" answer can be stale.
      // In particular, a preceding save may have committed then lost its reply,
      // clearing the cached head. Recheck its receipt before rejecting a retry.
      if(!(error instanceof DeckEditConflictError||error instanceof DeckEditRequestError))throw error;
      result=await save(queued,request);
    }
    lane.head=size(result)<=4*1024*1024?remember(result):undefined;return result;
  }
  catch(error){lane.head=undefined;throw error;}
  finally{release();if(lane.tail===tail)saves.delete(key);}
}

async function save(
  store: DeckEditStore,
  request: SaveRequest,
  initial?:DeckEditSnapshot,
): Promise<DeckEditSnapshot & { inverse: DeckEditOperation[]; replayed: boolean }> {
  const started=performance.now();let receiptMs=0,headMs=0,baseMs=0,commitMs=0;
  const fingerprint=deckRequestFingerprint(request);
  for (let attempt = 0; attempt < (request.protocol===2?12:4); attempt++) {
    if(attempt>0&&request.protocol===2)await new Promise(resolve=>setTimeout(resolve,Math.floor(Math.random()*20)));
    let clock=performance.now();const receipt = await store.receipt(request.id);receiptMs+=performance.now()-clock;
    if (receipt) {
      if (receipt.fingerprint !== fingerprint) throw new DeckEditRequestError("deckEditor.save.operationReused");
      return { ...await store.recover(), inverse: receipt.inverse, replayed: true };
    }
    clock=performance.now();const head = attempt===0&&initial?initial:await store.read();headMs+=performance.now()-clock;
    if(request.activate&&head.collaboration&&request.operations.length===0)return {...head,inverse:[],replayed:false};
    clock=performance.now();const change=await prepareDeckRequest(head,request,store.readVersion);baseMs+=performance.now()-clock;
    clock=performance.now();const saved = await store.commit({
      html: change.html, expectedHead: head.versionId,base:head,
      collaboration:change.collaboration,
      receipt:change.receipt,
    });
    commitMs+=performance.now()-clock;
    if (saved){
      if(process.env.PAGES_DECK_DIAGNOSTICS==="on")console.info(JSON.stringify({event:"deck_collaboration_work",pageId:store.key,revision:saved.versionNumber,attempts:attempt+1,totalMs:performance.now()-started,receiptMs,headMs,baseMs,commitMs}));
      return { ...saved, inverse: change.receipt.inverse, replayed: false };
    }
  }
  throw new DeckEditBusyError("deckEditor.save.overlap");
}
