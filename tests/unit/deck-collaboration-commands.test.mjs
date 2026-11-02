import assert from 'node:assert/strict';
import {createDeckEditHarness} from '../checks/deck-edit-harness.mjs';
const h=await createDeckEditHarness({extra:`export {deckEditStore} from './src/lib/deck/edit/store';export {saveDeckOperations} from './src/lib/deck/edit/service';export {deckOperationValue,deckSourceOutline,deckSourceFragment} from './src/lib/deck/edit/source';export {DeckEditQueue} from './src/widget/deck/edit/sync';`});
const html='<!doctype html><html><head><title>操作の検証</title></head><body data-deck><main data-deck-slides><section data-deck-slide data-deck-node="one"><p data-deck-node="paragraph" data-deck-created>本文</p><img data-deck-node="picture" src="before.png"></section><section data-deck-slide data-deck-node="child" data-deck-parent="one"><p data-deck-node="child-text">子</p></section><section data-deck-slide data-deck-node="two"><p data-deck-node="second-text">次</p></section><section data-deck-slide data-deck-node="three"><p data-deck-node="third-text">最後</p></section></main></body></html>';
const style=(property,before,after)=>({kind:'style',target:'paragraph',property,before,after});
const check=async(label,run)=>{await run();console.log('OK  '+label);};
try{
 const page=(await h.seed(html)).page,store=h.api.deckEditStore(page,h.owner);
 let initial=await h.api.saveDeckOperations(store,{id:crypto.randomUUID(),author:h.owner.email,client:'browser',protocol:2,activate:true,operations:[]});
 const save=async(operations,base,client='browser')=>h.api.saveDeckOperations(store,{id:crypto.randomUUID(),author:h.owner.email,client,protocol:client==='browser'?2:undefined,epoch:initial.collaboration.epoch,baseVersionId:base??(await store.read()).versionId,operations});
 await check('同じ見た目の変更は確定順に揃い古い取り消しで他者を戻さない',async()=>{
  const base=(await store.read()).versionId;
  const results=await Promise.all([save([style('color',null,'red')],base),save([style('color',null,'blue')],base)]);
  results.sort((a,b)=>a.versionNumber-b.versionNumber);
  const current=await store.read();assert.equal(current.versionId,results[1].versionId);
  await assert.rejects(save(results[0].inverse));assert.equal((await store.read()).versionId,current.versionId);
 });
 await check('位置と寸法の一括取り消しでも別の人の色は保持する',async()=>{
  const resized=await save([style('width',null,'200px'),style('height',null,'100px')]);
  const current=await store.read(),color=h.api.deckOperationValue(current.html,style('color',null,null));
  await save([style('color',color,'purple')]);const undone=await save(resized.inverse);
  assert.equal(h.api.deckOperationValue(undone.html,style('width',null,null)),null);assert.equal(h.api.deckOperationValue(undone.html,style('height',null,null)),null);assert.equal(h.api.deckOperationValue(undone.html,style('color',null,null)),'purple');
 });
 await check('値が元に戻っていても別の人の後続操作を取り消さない',async()=>{
  const first=await save([style('color','purple','red')]);await save([style('color','red','blue')]);await save([style('color','blue','red')]);
  await assert.rejects(save(first.inverse));assert.equal(h.api.deckOperationValue((await store.read()).html,style('color',null,null)),'red');
 });
 await check('遅れて終わった素材処理は利用者の差し替えを上書きしない',async()=>{
  const base=(await store.read()).versionId;await save([{kind:'image',target:'picture',before:'before.png',after:'chosen.png'}],base);
  await assert.rejects(save([{kind:'image',target:'picture',before:'before.png',after:'optimized.png'}],base,'media'));
  assert.match((await store.read()).html,/src="chosen.png"/);
 });
 await check('自分の変更を2回取り消し2回やり直しても他者扱いしない',async()=>{
  const one=await save([style('color','red','orange')]),two=await save([style('color','orange','green')]);
  const undoTwo=await save(two.inverse),undoOne=await save(one.inverse);
  assert.equal(h.api.deckOperationValue(undoOne.html,style('color',null,null)),'red');
  const redoOne=await save(undoOne.inverse);assert.equal(h.api.deckOperationValue(redoOne.html,style('color',null,null)),'orange');
  const redoTwo=await save(undoTwo.inverse);assert.equal(h.api.deckOperationValue(redoTwo.html,style('color',null,null)),'green');
 });
 await check('削除を取り消したあと削除前の文字と色の変更も取り消せる',async()=>{
  const color=await save([style('color','green','orange')]);
  const text=await save([{kind:'text',target:'paragraph',run:0,before:'本文',after:'本文の追記'}]);
  const before=await store.read(),fragment=h.api.deckSourceFragment(before.html,'paragraph');
  const removed=await save([{kind:'remove',target:'paragraph',before:fragment.html,textSeed:crypto.randomUUID()}]);
  await save(removed.inverse);const undoText=await save(text.inverse);assert.match(undoText.html,/>本文<\/p>/);
  const undoColor=await save(color.inverse);assert.equal(h.api.deckOperationValue(undoColor.html,style('color',null,null)),'green');
 });
 await check('親の移動には並行して追加された子も一緒に付いてくる',async()=>{
  const base=(await store.read()).versionId;
  await save([{kind:'fragment',target:'new-child',parentId:'deck-root',beforeId:'two',before:null,after:'<section data-deck-slide data-deck-node="new-child" data-deck-parent="one"><p data-deck-node="new-child-text">追加の子</p></section>',textSeed:crypto.randomUUID()}],base);
  const moved=await save([{kind:'outline-move',target:'deck-root',ids:['one'],anchor:'three',placement:'after'}],base);
  assert.deepEqual(h.api.deckSourceOutline(moved.html).map(item=>item.id),['two','three','one','child','new-child']);
  const undo=await save(moved.inverse);assert.deepEqual(h.api.deckSourceOutline(undo.html).map(item=>item.id),['one','child','new-child','two','three']);
 });
 await check('適用できない操作を保持して別の操作の保存を続ける',async()=>{
  const q=new h.api.DeckEditQueue('v1');q.enqueue([{value:'消された対象への入力'}],'lost');q.next();q.enqueue([{value:'別の箇所'}],'valid');
  assert.equal(q.quarantine('lost','対象がなくなりました',true),true);assert.deepEqual(q.next().operations,[{value:'別の箇所'}]);q.acknowledge('v2',[]);
  assert.equal(q.status,'attention');assert.equal(q.dirty,true);assert.equal(q.pending,false);
  const restored=h.api.DeckEditQueue.restore(q.exportDraft(Date.now()),Date.now());assert.deepEqual(restored.reviewOperations(),[{value:'消された対象への入力'}]);assert.equal(restored.status,'attention');
 });
 await check('複数枚の一部が動かなくても連続して取り消しとやり直しができる',async()=>{
  const move=(ids,anchor,placement)=>({kind:'outline-move',target:'deck-root',ids,anchor,placement});
  await save([move(['three'],'one','before')]);const baseline=h.api.deckSourceOutline((await store.read()).html);
  const first=await save([move(['three'],'two','after')]),second=await save([move(['one','three'],'two','after')]);
  const undoSecond=await save(second.inverse),undoFirst=await save(first.inverse);
  assert.deepEqual(h.api.deckSourceOutline(undoFirst.html),baseline);
  await save(undoFirst.inverse);const redone=await save(undoSecond.inverse);
  assert.deepEqual(h.api.deckSourceOutline(redone.html),h.api.deckSourceOutline(second.html));
 });
 await check('前方へまとめて移動した後も連続取り消しとやり直しができる',async()=>{
  const move=(ids,anchor,placement)=>({kind:'outline-move',target:'deck-root',ids,anchor,placement});
  await save([move(['three'],'one','after')]);await save([move(['two'],'one','before')]);
  const baseline=h.api.deckSourceOutline((await store.read()).html);
  const first=await save([move(['one'],'two','before')]),second=await save([move(['one','three'],'two','before')]);
  const undoSecond=await save(second.inverse),undoFirst=await save(first.inverse);
  assert.deepEqual(h.api.deckSourceOutline(undoFirst.html),baseline);
  await save(undoFirst.inverse);const redone=await save(undoSecond.inverse);
  assert.deepEqual(h.api.deckSourceOutline(redone.html),h.api.deckSourceOutline(second.html));
 });
}finally{await h.close();}
