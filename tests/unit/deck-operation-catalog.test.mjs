import {test} from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {deckOperations,operationKinds,assertDeckCoverage,DECK_OPERATION_PARTS,deckOperationPart} from '../support/deck-operation-catalog.mjs';
test('every persisted operation belongs to a required browser outcome',async()=>{
  const bundle=await build({stdin:{contents:"export {deckEditOperationSchema} from './src/lib/deck/edit/model';",resolveDir:process.cwd()},bundle:true,write:false,platform:'node',format:'esm'});
  const {deckEditOperationSchema}=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
  assert.deepEqual(deckEditOperationSchema.options.map(schema=>schema.shape.kind.value).sort(),Object.keys(operationKinds).sort());
  assert.equal(new Set(deckOperations.map(row=>row.id)).size,deckOperations.length);
  for(const id of Object.values(operationKinds))assert.ok(deckOperations.some(row=>row.id===id));
});
test('missing, unverified, unknown and invalid measurements fail closed',()=>{
  const rows=deckOperations.map(row=>({id:row.id,durationMs:10,verified:true}));
  assertDeckCoverage(rows,assert);
  for(const bad of [rows.slice(1),[...rows,{id:'unknown',verified:true,durationMs:1}],rows.map((r,i)=>i?r:{...r,durationMs:NaN}),rows.map((r,i)=>i?r:{...r,verified:false}),rows.map((r,i)=>i?r:{...r,durationMs:60000})])assert.throws(()=>assertDeckCoverage(bad,assert));
});
test('the two speed tests together measure every operation exactly once, and each one fails closed on its own share',()=>{
  assert.deepEqual(Object.keys(DECK_OPERATION_PARTS),['1/2','2/2']);
  const shares=Object.values(DECK_OPERATION_PARTS);
  // どの操作もどちらか一方にだけ入り、合わせると対応表の全部（1 つも減らさない・二重に測らない）
  assert.deepEqual(shares.flat().sort(),deckOperations.map(row=>row.id).sort());
  assert.equal(new Set(shares.flat()).size,deckOperations.length);
  for(const invalid of [undefined,'','1','3/2','0/2','1/3','all'])assert.throws(()=>deckOperationPart(invalid),/分割/);
  const measured=ids=>ids.map(id=>({id,durationMs:10,verified:true}));
  for(const [part,ids] of Object.entries(DECK_OPERATION_PARTS)){
    const other=shares.find(share=>share!==ids);
    assertDeckCoverage(measured(ids),assert,{part});
    // 担当が 1 つ欠けても、相手の操作が混ざっても、全部を 1 本で測った報告でも落ちる
    for(const id of ids)assert.throws(()=>assertDeckCoverage(measured(ids.filter(one=>one!==id)),assert,{part}),/未実行/);
    assert.throws(()=>assertDeckCoverage(measured([...ids,other[0]]),assert,{part}),/担当ではない/);
    assert.throws(()=>assertDeckCoverage(measured(deckOperations.map(row=>row.id)),assert,{part}),/担当ではない/);
    assert.throws(()=>assertDeckCoverage(measured(ids).map((row,i)=>i?row:{...row,verified:false}),assert,{part}));
    assert.throws(()=>assertDeckCoverage(measured(ids).map((row,i)=>i?row:{...row,durationMs:60000}),assert,{part}));
    // 1 本ぶんだけでは、全部を測ったことにならない
    assert.throws(()=>assertDeckCoverage(measured(ids),assert),/未実行/);
  }
  // 閉じたあとに確かめる相手（下書き・画像の差し替え・300 枚・別の人の変更・段階表示・ロゴ）を作る操作は、確かめと同じ 2/2 にある
  for(const id of ['draft','image-replace','duplicate','delete','insert-slide','remote','table','focus','logo'])assert.ok(DECK_OPERATION_PARTS['2/2'].includes(id),id);
  // 開く 3 回の測定と、開く・閉じるは 1/2
  for(const id of ['open','close'])assert.ok(DECK_OPERATION_PARTS['1/2'].includes(id),id);
});
