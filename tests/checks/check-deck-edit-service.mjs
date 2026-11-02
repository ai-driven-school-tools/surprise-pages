import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { root, dir } from './paths.mjs';

await build({ entryPoints: [`${root}/src/lib/deck/edit/service.ts`], outfile: `${dir}/deck-edit-service.mjs`, bundle: true, format: 'esm', platform: 'node' });
const { saveDeckOperations, DeckEditRequestError } = await import(`${dir}/deck-edit-service.mjs`);
await build({entryPoints:[`${root}/src/lib/deck/edit/source.ts`],outfile:`${dir}/deck-edit-source-for-service.mjs`,bundle:true,format:'esm',platform:'node'});
const {prepareDeckEdit,inspectDeckEdit}=await import(`${dir}/deck-edit-source-for-service.mjs`);
let count = 0;
const test = async (label, fn) => { await fn(); count++; console.log(`OK  ${label}`); };
const initial = prepareDeckEdit('<!doctype html><html><head><title>共同作業</title></head><body data-deck><main data-deck-slides><section data-deck-slide data-deck-id="one"><p>甲</p><p>乙</p></section></main></body></html>').html;
function store() {
  let head = { html: initial, versionId:'v1', versionNumber:1 };
  const receipts = new Map();
  let race = null;
  return {
    read: async () => ({...head}),
    recover: async () => ({...head}),
    receipt: async (id) => receipts.get(id) ?? null,
    commit: async (input) => {
      if (race) { const fn = race; race = null; await fn(); }
      if (input.expectedHead !== head.versionId) return null;
      head = {html:input.html,versionNumber:head.versionNumber+1,versionId:`v${head.versionNumber+1}`};
      receipts.set(input.receipt.id, input.receipt);
      return {...head};
    },
    racing(fn) { race = fn; },
  };
}
const paragraphs = inspectDeckEdit(initial).nodes.filter(n=>n.tag==='p');
const operation = (i, after) => ({kind:'text',target:paragraphs[i].id,run:0,before:i===0?'甲':'乙',after});
const request = (id, operations) => ({id,operations,author:'writer@example.test'});
await test('別の人の変更が保存の直前に入っても両方残る', async () => {
  const port=store();
  port.racing(()=>saveDeckOperations(port,request('b',[operation(1,'乙の修正')])));
  const result=await saveDeckOperations(port,request('a',[operation(0,'甲の修正')]));
  assert.match(result.html,/甲の修正/); assert.match(result.html,/乙の修正/); assert.equal(result.versionNumber,3);
});
await test('保存後の応答喪失を再送しても後続の編集を巻き戻さない', async () => {
  const port=store(); const a=request('a',[operation(0,'新しい甲')]);
  await saveDeckOperations(port,a);
  await saveDeckOperations(port,request('b',[{...operation(0,'さらに新しい甲'),before:'新しい甲'}]));
  const result=await saveDeckOperations(port,a);
  assert.match(result.html,/さらに新しい甲/); assert.equal(result.versionNumber,3); assert.equal(result.replayed,true);
});
await test('同じ操作番号へ違う内容・別の名乗りを載せた再送を断る', async () => {
  const port=store(); await saveDeckOperations(port,request('a',[operation(0,'新しい甲')]));
  await assert.rejects(saveDeckOperations(port,request('a',[operation(0,'別の甲')])),DeckEditRequestError);
  await assert.rejects(saveDeckOperations(port,{...request('a',[operation(0,'新しい甲')]),author:'other@example.test'}),DeckEditRequestError);
});
await test('競争が続くと上限で止まり本文を一度も書かない', async () => {
  const port=store(); let attempts=0;
  port.commit=async()=>{attempts++;return null;};
  await assert.rejects(saveDeckOperations(port,request('a',[operation(0,'甲を直す')])));
  assert.equal(attempts,4); assert.equal((await port.read()).html,initial);
});
assert.equal(count,4);
