import assert from 'node:assert/strict';
import {createDeckEditHarness} from '../checks/deck-edit-harness.mjs';

const h=await createDeckEditHarness({extra:"export {deckEditStore} from './src/lib/deck/edit/store';export {saveDeckOperations} from './src/lib/deck/edit/service';"});
try{
 const page=(await h.seed('<!doctype html><html><head><title>差分取得</title></head><body data-deck><main data-deck-slides><section data-deck-slide data-deck-node="slide"><p data-deck-node="text">原稿</p></section></main></body></html>')).page;
 const store=h.api.deckEditStore(page,h.owner),sessionId=crypto.randomUUID();
 const initial=await h.api.saveDeckOperations(store,{id:crypto.randomUUID(),author:h.owner.email,client:'browser',protocol:2,activate:true,operations:[]});
 const request=(method,body,query='',viewer=h.owner)=>h.as(viewer,()=>h.api[method](new Request('http://localhost/api/pages/deck-edit'+query,{method,...(body?{body:JSON.stringify(body)}:{})})));
 const batch={page:page.pageSlug,sessionId,operationId:crypto.randomUUID(),baseVersionId:initial.versionId,protocol:2,epoch:initial.collaboration.epoch,delta:true,operations:[{kind:'text',target:'text',run:0,before:'原稿',after:'原稿の更新'}]};
 const saved=await request('PATCH',batch);assert.equal(saved.status,200,await saved.clone().text());const reply=await saved.json();
 assert.equal(reply.html,undefined);assert.equal(reply.batches.length,1);assert.ok(reply.collaboration);assert.ok(reply.inverse.length);
 const retry=await request('PATCH',{...batch,delta:false});assert.equal(retry.status,200);const full=await retry.json();
 assert.equal(full.replayed,true);assert.equal(full.versionId,reply.versionId);assert.match(full.html,/原稿の更新/);
 console.log('OK  保存の返事を差分だけにでき再送時に全文へ変えても二重反映しない');
 const query='?'+new URLSearchParams({page:page.pageSlug,sessionId,versionId:initial.versionId,protocol:'2',delta:'1'});
 globalThis.__deckQueries=[];
 const delta=await request('GET',null,query);assert.equal(delta.status,200);const value=await delta.json();
 assert.equal(value.html,undefined);assert.equal(value.versionId,reply.versionId);assert.deepEqual(value.batches,reply.batches);assert.deepEqual(value.collaboration,reply.collaboration);
 assert.ok(!globalThis.__deckQueries.some(q=>q.action==='select'&&q.columns.split(/,\s*/).includes('html')));
 delete globalThis.__deckQueries;
 console.log('OK  更新通知後も本文全体を読み出さず対応する版の同期状態と差分を返す');
 assert.equal((await request('GET',null,query,{...h.owner,email:'outside@example.test'})).status,404);
 const replaced=await h.api.commitRevision({organization:h.organization,pageSlug:page.pageSlug,html:full.html.replace('原稿の更新','原稿の差し替え'),expectedHead:full.versionId,author:h.owner,message:'世代変更'});
 const fallback=await request('GET',null,query);assert.equal(fallback.status,200);const next=await fallback.json();
 assert.equal(next.versionId,replaced.versionId);assert.match(next.html,/原稿の差し替え/);assert.notEqual(next.collaboration.epoch,initial.collaboration.epoch);assert.equal(next.batches,undefined);
 console.log('OK  権限のない差分取得を拒否し世代をまたぐ変更は全文へ切り替える');
}finally{delete globalThis.__deckQueries;await h.close();}
