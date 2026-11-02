import assert from 'node:assert/strict';
import {createDeckEditHarness} from '../checks/deck-edit-harness.mjs';

const h=await createDeckEditHarness({extra:`export {deckEditStore} from './src/lib/deck/edit/store';export {saveDeckOperations} from './src/lib/deck/edit/service';export {deckSourceFragment} from './src/lib/deck/edit/source';`});
try{
 const html='<body data-deck><main data-deck-slides><section data-deck-slide data-deck-node="slide"><p data-deck-node="paragraph" data-deck-created>本文</p></section></main></body>';
 const page=(await h.seed(html)).page;
 const store=h.api.deckEditStore(page,h.owner);
 const base=await h.api.saveDeckOperations(store,{id:crypto.randomUUID(),author:h.owner.email,client:'browser',protocol:2,activate:true,operations:[]});
 const duplicate={id:crypto.randomUUID(),author:h.owner.email,client:'browser',protocol:2,epoch:base.collaboration.epoch,baseVersionId:base.versionId,operations:[{kind:'remove',target:'paragraph',before:h.api.deckSourceFragment(base.html,'paragraph').html,textSeed:crypto.randomUUID()}]};

 // Both receipt reads must finish before either request is allowed to save.
 let receiptReads=0,releaseReceipts;
 const receiptsReady=new Promise(resolve=>{releaseReceipts=resolve;});
 let loseFirstReply=true;
 const transport={...store,
  receipt:async id=>{
   if(id===duplicate.id&&receiptReads++<2){
    const result=await store.receipt(id);
    assert.equal(result,null);
    if(receiptReads===2)releaseReceipts();
    await receiptsReady;
    return result;
   }
   return store.receipt(id);
  },
  commit:async input=>{
   const saved=await store.commit(input);
   if(loseFirstReply&&saved){
    loseFirstReply=false;
    throw new Error('response lost after database commit');
   }
   return saved;
  },
 };
 const results=await Promise.allSettled([
  h.api.saveDeckOperations(transport,duplicate),
  h.api.saveDeckOperations(transport,duplicate),
 ]);
 assert.equal(results[0].status,'rejected');
 assert.match(results[0].reason.message,/response lost after database commit/);
 assert.equal(results[1].status,'fulfilled',results[1].status==='rejected'?results[1].reason.message:'');
 assert.equal(results[1].value.replayed,true);
 const head=await store.read();
 assert.equal(head.versionNumber,base.versionNumber+1);
 assert.equal(results[1].value.versionId,head.versionId);
 assert.equal(h.api.deckSourceFragment(head.html,'paragraph'),null);
 const receipt=await store.receipt(duplicate.id);
 assert.ok(receipt);
 assert.deepEqual(results[1].value.inverse,receipt.inverse);
 const count=(await h.pg.query('select count(*)::int as n from page_revisions where page_id=$1 and edit_operation_id=$2',[page.id,duplicate.id])).rows[0].n;
 assert.equal(count,1);
 console.log('PASS 削除確定直後の応答喪失と同時再送: 受領を再照会して復旧し、版と削除は一度だけ確定');
}finally{
 await h.close();
}
