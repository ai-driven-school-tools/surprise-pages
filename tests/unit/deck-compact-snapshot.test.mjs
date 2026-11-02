import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createDeckEditHarness} from '../checks/deck-edit-harness.mjs';

test('compact editor snapshots preserve authored bytes, preview transforms, revisions and authorization',async()=>{
 const h=await createDeckEditHarness({extra:"export {deckSourcePreview,DECK_SNAPSHOT_HEADER} from './src/lib/pages/preview';"});
 try{
  const text='検査用の文章'.repeat(1000);
  const source=`<!doctype html><html><head><title>Snapshot</title></head><body data-deck id="ads-top"><main data-deck-slides><section data-deck-slide data-deck-node="slide"><p data-deck-node="text">${text}</p></section></main></body></html>`;
  await h.seed(source);const sessionId=randomUUID(),url='https://example.test/api/pages/deck-edit';
  const read=compact=>h.as(h.owner,()=>h.api.GET(new Request(url+'?page=internal/example/design&sessionId='+sessionId,{headers:compact?{[h.api.DECK_SNAPSHOT_HEADER]:'compact'}:{}})));
  const full=await(await read(false)).json(),compact=await(await read(true)).json();
  assert.ok(Array.isArray(full.nodes));assert.equal(compact.nodes,undefined);assert.equal(compact.previewHtml,undefined);
  assert.equal(compact.html,full.html);assert.equal(compact.versionId,full.versionId);
  assert.equal(h.api.deckSourcePreview(compact.html,compact.previewHref),full.previewHtml);
  assert.ok(Buffer.byteLength(JSON.stringify(compact))<Buffer.byteLength(JSON.stringify(full))*.7);
  const open=await h.as(h.owner,()=>h.api.POST(new Request(url,{method:'POST',headers:{'content-type':'application/json',[h.api.DECK_SNAPSHOT_HEADER]:'compact'},body:JSON.stringify({page:'internal/example/design',sessionId,action:'open',protocol:2})})));
  assert.equal(open.status,200);assert.equal((await open.json()).nodes,undefined);
  const save=await h.as(h.owner,()=>h.api.PATCH(new Request(url,{method:'PATCH',headers:{'content-type':'application/json',[h.api.DECK_SNAPSHOT_HEADER]:'compact'},body:JSON.stringify({page:'internal/example/design',sessionId,baseVersionId:full.versionId,operationId:randomUUID(),operations:[{kind:'text',target:'text',run:0,before:text,after:text+'保存'}]})})));
  assert.equal(save.status,200);const changed=await save.json();assert.ok(changed.html.includes(text+'保存'));assert.equal(changed.nodes,undefined);assert.ok(changed.inverse.length);
  const reread=await(await read(false)).json();assert.equal(reread.versionId,changed.versionId);assert.equal(reread.previewHtml,h.api.deckSourcePreview(changed.html,changed.previewHref));
  const denied=await h.as({kind:'anonymous'},()=>h.api.GET(new Request(url+'?page=internal/example/design&sessionId='+sessionId,{headers:{[h.api.DECK_SNAPSHOT_HEADER]:'compact'}})));
  assert.equal(denied.status,401);
 }finally{await h.close();}
});
