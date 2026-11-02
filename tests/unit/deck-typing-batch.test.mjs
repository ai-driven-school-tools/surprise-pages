import assert from 'node:assert/strict';
import {createDeckEditHarness} from '../checks/deck-edit-harness.mjs';

const h=await createDeckEditHarness({extra:`export {createDeckTypingBatch} from './src/widget/deck/edit/typing-batch';export {applyCollaborativeOperations,createDeckCollaboration} from './src/lib/deck/edit/collaboration';export {DeckTextReplica} from './src/lib/deck/edit/text-sync';export {DeckEditQueue} from './src/widget/deck/edit/sync';export {saveDeckOperations} from './src/lib/deck/edit/service';export {deckEditStore} from './src/lib/deck/edit/store';export {deckSourceFragment} from './src/lib/deck/edit/source';`});
const html='<body data-deck><main data-deck-slides><section data-deck-slide data-deck-node="slide"><p data-deck-node="paragraph">A</p></section></main></body>';
const value=state=>{const replica=new h.api.DeckTextReplica(state.fields['paragraph/0']);try{return replica.value;}finally{replica.destroy();}};
function edit(current,after){const before=value(current.collaboration),replica=new h.api.DeckTextReplica(current.collaboration.fields['paragraph/0']);try{return h.api.applyCollaborativeOperations(current.html,current.collaboration,[{kind:'text',target:'paragraph',run:0,before,after,sync:replica.replace(after),commandId:crypto.randomUUID()}]);}finally{replica.destroy();}}
function enter(q,compact,current,after,authoritative){const base=current.collaboration.fields,next=edit(current,after);q.enqueue(next.operations,crypto.randomUUID(),true,next.inverse);q.compactTyping((id,ops)=>compact(id,ops,base,authoritative.collaboration.fields));return next;}
try{
 for(const edits of [['B','C'],['AB','A'],['AB','ABC','ABCD'],['','Z'],['日本語','日本語の編集']]){
  const base={html,collaboration:h.api.createDeckCollaboration(html)},q=new h.api.DeckEditQueue('base'),compact=h.api.createDeckTypingBatch();let local=base;
  for(const text of edits)local=enter(q,compact,local,text,base);
  const batch=q.next();assert.equal(batch.operations.length,1);
  const saved=h.api.applyCollaborativeOperations(base.html,base.collaboration,batch.operations);
  assert.equal(value(saved.collaboration),edits.at(-1));assert.equal(saved.inverse[0].sync.update,batch.operations[0].sync.undo);
  q.undo(crypto.randomUUID());q.acknowledge('saved',saved.inverse);
  const undo=q.next(),undone=h.api.applyCollaborativeOperations(saved.html,saved.collaboration,undo.operations);assert.equal(value(undone.collaboration),'A');
  q.acknowledge('undone',undone.inverse);assert.equal(q.redo(crypto.randomUUID()),true);
  const redone=h.api.applyCollaborativeOperations(undone.html,undone.collaboration,q.next().operations);assert.equal(value(redone.collaboration),edits.at(-1));
 }
 console.log('OK  置換・追加後の削除・連続追加・全削除・日本語の入力を1操作にまとめ、途中の文字を復活させず取り消しとやり直し');
 const base={html,collaboration:h.api.createDeckCollaboration(html)},q=new h.api.DeckEditQueue('base'),compact=h.api.createDeckTypingBatch();
 let local=enter(q,compact,base,'AB',base);
 const peer=edit(base,'AX');local=h.api.applyCollaborativeOperations(local.html,local.collaboration,peer.operations);
 local=enter(q,compact,local,value(local.collaboration).replace('X','XY'),peer);
 const batch=q.next(),frozen=JSON.stringify(batch),saved=h.api.applyCollaborativeOperations(peer.html,peer.collaboration,batch.operations);
 assert.equal(batch.operations.length,1);assert.equal(value(saved.collaboration),value(local.collaboration));
 const later=edit(saved,value(saved.collaboration)+'!'),undone=h.api.applyCollaborativeOperations(later.html,later.collaboration,saved.inverse);
 assert.equal(value(undone.collaboration),'AX!','Peers before and after compaction survive own undo');
 local=enter(q,compact,local,value(local.collaboration)+'C',peer);q.failed('network');assert.equal(JSON.stringify(q.next()),frozen,'An uncertain request is never rewritten');
 const restored=h.api.DeckEditQueue.restore(q.exportDraft(Date.now()),Date.now());assert.ok(restored);assert.equal(JSON.stringify(restored.next()),frozen);
 console.log('OK  途中で届いた他人の文字への依存を満たし、後続の他人の編集・送信済み内容・再送・下書き復旧を保つ');
 const empty=html.replace('<p data-deck-node="paragraph">A</p>',''),original={html:empty,collaboration:h.api.createDeckCollaboration(empty)};
 const added=h.api.applyCollaborativeOperations(empty,original.collaboration,[{kind:'insert',target:'slide',node:{id:'paragraph',tag:'p',text:'A'},commandId:crypto.randomUUID(),textSeed:crypto.randomUUID()}]);
 const ownNew=new h.api.DeckEditQueue('base'),foldNew=h.api.createDeckTypingBatch();let pending=added;
 for(const text of ['B','C'])pending=enter(ownNew,foldNew,pending,text,original);
 const newBatch=ownNew.next();assert.equal(newBatch.operations.length,1);
 const newSaved=h.api.applyCollaborativeOperations(added.html,added.collaboration,newBatch.operations);
 assert.equal(value(h.api.applyCollaborativeOperations(newSaved.html,newSaved.collaboration,newSaved.inverse).collaboration),'A');
 const deleted=h.api.applyCollaborativeOperations(added.html,added.collaboration,[{kind:'remove',target:'paragraph',before:h.api.deckSourceFragment(added.html,'paragraph').html,commandId:crypto.randomUUID(),textSeed:crypto.randomUUID()}]);
 assert.throws(()=>h.api.applyCollaborativeOperations(deleted.html,deleted.collaboration,newBatch.operations),/削除/);
 assert.equal(deleted.collaboration.fields['paragraph/0'],undefined);
 console.log('OK  未保存で追加した文章欄でも正しく取り消せ、削除済みの文章欄はまとめた入力から復活しない');
 const page=(await h.seed(html)).page,store=h.api.deckEditStore(page,h.owner);
 const opened=await h.api.saveDeckOperations(store,{id:crypto.randomUUID(),author:h.owner.email,client:'browser',protocol:2,activate:true,operations:[]});
 const durable=new h.api.DeckEditQueue(opened.versionId),fold=h.api.createDeckTypingBatch();let current=opened;
 for(const text of ['B','C'])current=enter(durable,fold,current,text,opened);
 const outgoing=durable.next(),request={id:outgoing.operationId,author:h.owner.email,client:'browser',protocol:2,epoch:opened.collaboration.epoch,baseVersionId:outgoing.baseVersionId,operations:outgoing.operations};
 const result=await h.api.saveDeckOperations(store,request),again=await h.api.saveDeckOperations(store,request);
 assert.equal(again.replayed,true);assert.equal(again.versionId,result.versionId);assert.equal(value(result.collaboration),'C');
 const back=await h.api.saveDeckOperations(store,{...request,id:crypto.randomUUID(),baseVersionId:result.versionId,operations:result.inverse});assert.equal(value(back.collaboration),'A');
 console.log('OK  実際の保存窓口でもまとめた文章の受領・二重送信・取り消しが成立');
}finally{await h.close();}
