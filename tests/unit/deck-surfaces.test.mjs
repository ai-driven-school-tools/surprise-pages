import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {interactionSurfaces} from '../support/deck-surfaces.mjs';
import {deckOperations} from '../support/deck-operation-catalog.mjs';

test('every editor control is registered and linked to executed operation outcomes',async()=>{
 const actual=await interactionSurfaces(),expected=JSON.parse(await readFile('tests/support/deck-surfaces.json','utf8'));
 assert.deepEqual(actual,expected.map(({id,owner,control})=>({id,owner,control})),'編集操作の入口が変わっています。検査との対応を確認して登録してください。');
 const ids=new Set(deckOperations.map(row=>row.id));
 assert.equal(new Set(expected.map(row=>row.id)).size,expected.length);
 for(const row of expected){assert.ok(row.covers.length>0,`${row.id}: 検査未登録`);for(const id of row.covers)assert.ok(ids.has(id),`${row.id}: 存在しない検査 ${id}`);}
});
