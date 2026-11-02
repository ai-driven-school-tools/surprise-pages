import assert from 'node:assert/strict';
import {createDeckEditHarness} from '../checks/deck-edit-harness.mjs';
const h=await createDeckEditHarness({extra:`export {deckEditStore} from './src/lib/deck/edit/store';export {saveDeckOperations} from './src/lib/deck/edit/service';export {deckSourceFragment} from './src/lib/deck/edit/source';`});
try{
 const html='<!doctype html><html><head><title>保存列</title></head><body data-deck><main data-deck-slides><section data-deck-slide data-deck-node="one"><p data-deck-node="paragraph" data-deck-created>本文</p></section></main></body></html>';
 const page=(await h.seed(html)).page,store=h.api.deckEditStore(page,h.owner);
 const base=await h.api.saveDeckOperations(store,{id:crypto.randomUUID(),author:h.owner.email,client:'browser',protocol:2,activate:true,operations:[]});
 let release,committed;const waiting=new Promise(resolve=>{release=resolve;}),deleted=new Promise(resolve=>{committed=resolve;});
 let reads=0;
 const a={...store,read:async()=>{reads++;return store.read();},commit:async input=>{const result=await store.commit(input);if(result&&input.receipt.operations.some(op=>op.kind==='remove')){committed({result,inverse:input.receipt.inverse});await waiting;}return result;}};
 const b={...store,key:undefined};
 const request=(head,operations)=>({id:crypto.randomUUID(),author:h.owner.email,client:'browser',protocol:2,epoch:head.collaboration.epoch,baseVersionId:head.versionId,operations});
 const deletion=h.api.saveDeckOperations(a,request(base,[{kind:'remove',target:'paragraph',before:h.api.deckSourceFragment(base.html,'paragraph').html,textSeed:crypto.randomUUID()}]));
 const removed=await deleted;
 const restored=await h.api.saveDeckOperations(b,request(removed.result,removed.inverse));
 const edit=request(restored,[{kind:'text',target:'paragraph',run:0,before:'本文',after:'復元された本文への入力'}]);
 const queued=h.api.saveDeckOperations(a,edit);release();
 const [,saved]=await Promise.all([deletion,queued]);assert.match(saved.html,/復元された本文への入力/);assert.equal(reads,2);
 const replay=await h.api.saveDeckOperations(a,edit);assert.equal(replay.replayed,true);assert.equal(replay.versionId,saved.versionId);
 console.log('OK  別サーバーで復元された対象を古い控えだけで拒否せず再送も一度だけ反映');
 const before=await store.read();let afterFirst;
 const raced={...store,commit:async input=>{if(!afterFirst){afterFirst=true;await h.api.saveDeckOperations(b,request(before,[{kind:'style',target:'paragraph',property:'color',before:null,after:'red'}]));}return store.commit(input);}};
 const merged=await h.api.saveDeckOperations(raced,request(before,[{kind:'style',target:'paragraph',property:'font-size',before:null,after:'24px'}]));
 assert.match(merged.html,/color:red/);assert.match(merged.html,/font-size:24px/);
 console.log('OK  控えを使った保存でも別サーバーの先行保存をDBで検出して取り込む');
 const current=await store.read(),duplicate=request(current,[{kind:'style',target:'paragraph',property:'color',before:'red',after:'blue'}]);
 // Force both initial receipt reads to see "not received", even though one
 // request will wait behind the other before attempting its commit.
 let receiptReads=0,releaseReceipts;const receiptsReady=new Promise(resolve=>{releaseReceipts=resolve;});
 const simultaneous={...store,receipt:async id=>{if(id===duplicate.id&&receiptReads++<2){const result=await store.receipt(id);if(receiptReads===2)releaseReceipts();await receiptsReady;return result;}return store.receipt(id);}};
 const results=await Promise.all([h.api.saveDeckOperations(simultaneous,duplicate),h.api.saveDeckOperations(simultaneous,duplicate)]);
 assert.equal(results[0].versionId,results[1].versionId);assert.equal(results[1].replayed,true);
 assert.equal((await store.read()).versionNumber,current.versionNumber+1);
 console.log('OK  順番待ちの前に受領確認しても同時再送は一度だけ確定する');
}finally{await h.close();}
