import assert from 'node:assert/strict';
import {createDeckEditHarness} from '../checks/deck-edit-harness.mjs';
const h=await createDeckEditHarness({extra:`export {deckEditStore} from './src/lib/deck/edit/store';export {saveDeckOperations} from './src/lib/deck/edit/service';export {DeckTextReplica} from './src/lib/deck/edit/text-sync';export {applyCollaborativeOperations} from './src/lib/deck/edit/collaboration';export {DeckEditQueue} from './src/widget/deck/edit/sync';export {deckSourceFragment} from './src/lib/deck/edit/source';`});
try{
 for(const mode of ['replace-before','replace-delete','remove','fragment']){
  const html='<!doctype html><html><body data-deck><main data-deck-slides><section data-deck-slide data-deck-node="slide"><p data-deck-node="paragraph" data-deck-created>abc</p></section></main></body></html>';
  const page=(await h.seed(html)).page,store=h.api.deckEditStore(page,h.owner);
  let base=await store.read();if(!base.collaboration)base=await h.api.saveDeckOperations(store,{id:crypto.randomUUID(),author:h.owner.email,client:'browser',protocol:2,activate:true,operations:[]});
  const piece=h.api.deckSourceFragment(base.html,'paragraph');
  let initial;
  if(mode.startsWith('replace')){const r=new h.api.DeckTextReplica(base.collaboration.fields['paragraph/0']);initial={kind:'text',target:'paragraph',run:0,before:'abc',after:'axc',sync:r.replace('axc')};r.destroy();}
  else if(mode==='remove')initial={kind:'remove',target:'paragraph',before:piece.html,textSeed:crypto.randomUUID()};
  else initial={kind:'fragment',target:'paragraph',parentId:'slide',beforeId:null,before:piece.html,after:null,textSeed:crypto.randomUUID()};
  const local=h.api.applyCollaborativeOperations(base.html,base.collaboration,[initial]);
  const q=new h.api.DeckEditQueue(base.versionId);q.enqueue(local.operations,crypto.randomUUID(),false,local.inverse);
  const first=q.next();assert.ok(first);assert.equal(q.undo(crypto.randomUUID()),true);
  const restored=h.api.applyCollaborativeOperations(base.html,base.collaboration,q.pendingOperations());
  const typing=new h.api.DeckTextReplica(restored.collaboration.fields['paragraph/0']),after=mode==='replace-delete'?'ac':'aZbc';
  const op={kind:'text',target:'paragraph',run:0,before:'abc',after,sync:typing.replace(after)};typing.destroy();
  const localChild=h.api.applyCollaborativeOperations(restored.html,restored.collaboration,[op]);
  q.enqueue(localChild.operations,crypto.randomUUID(),true,localChild.inverse);
  const request=batch=>({id:batch.operationId,author:h.owner.email,client:'browser',protocol:2,epoch:base.collaboration.epoch,baseVersionId:batch.baseVersionId,operations:batch.operations});
  let server=await h.api.saveDeckOperations(store,request(first));q.acknowledge(server.versionId,server.inverse);
  assert.deepEqual(server.inverse,local.inverse,'受領した逆操作が画面側と一致する');
  const projected=h.api.applyCollaborativeOperations(server.html,server.collaboration,q.pendingOperations());assert.ok(projected.html.includes('>'+after+'</p>'));
  while(q.dirty){const next=q.next();assert.ok(next);server=await h.api.saveDeckOperations(store,request(next));q.acknowledge(server.versionId,server.inverse);}
  const reread=await store.read();assert.ok(reread.html.includes('>'+after+'</p>'));
  const r=new h.api.DeckTextReplica(reread.collaboration.fields['paragraph/0']);assert.equal(r.value,after);r.destroy();
  const replayed=await h.api.saveDeckOperations(store,request(first));assert.equal(replayed.replayed,true);assert.equal(replayed.versionId,reread.versionId);assert.equal(replayed.html,reread.html);
  console.log('OK '+mode+' : 受領後の表示・逐次保存・再読込・元要求の再送が一致');
 }
}finally{await h.close();}
