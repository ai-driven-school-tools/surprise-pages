// スライドの編集画面から画像を足す、小分けの送信（src/lib/deck/media/video-upload.ts・src/lib/deck/media/video-storage.ts・src/lib/deck/media/video-lease.ts）の検査。
// この版は動画を受け取らない。小分けの送信の仕組みは画像の追加（/api/pages/deck-edit/media/upload）がそのまま使うので、
// 動画の口で見ていた守り（編集権限・送信の印・期限・通信量・非公開・再送・掃除）を画像の口で見る。
import assert from 'node:assert/strict';
import {createHash, randomBytes} from 'node:crypto';
import {createRequire} from 'node:module';
import {createDeckEditHarness} from './deck-edit-harness.mjs';
const sharp=createRequire(import.meta.url)('sharp');
const h=await createDeckEditHarness();
const ok=(name,condition)=>{assert.ok(condition,name);console.log('OK  '+name);};
const url='http://localhost/api/pages/deck-edit/media/upload?page=internal/example/design';
const request=(method,body,upload,extra='')=>new Request(url+extra,{method,headers:{...(upload?{'x-deck-upload':upload}:{}),'content-type':body instanceof Uint8Array?'application/octet-stream':'application/json'},...(body!==undefined?{body:body instanceof Uint8Array?body:JSON.stringify(body)}:{})});
const call=(fn,req,who=h.owner)=>h.as(who,()=>fn(req));
const staged=()=>[...globalThis.__deckAssets.keys()].filter(key=>key.startsWith('_deck-uploads/'));
try{
 await h.seed('<body data-deck><main data-deck-slides><section data-deck-slide><h1>画像の例</h1></section></main></body>');
 // 圧縮の効かない模様の PNG（2MB の小分けが 3 つになる大きさ）
 const width=1400,height=1100,file=await sharp(randomBytes(width*height*3),{raw:{width,height,channels:3}}).png({compressionLevel:0}).toBuffer();
 ok('検査の画像が小分けを 3 つ以上に分ける大きさ',file.length>4*1024*1024&&file.length<=10*1024*1024);
 const denied=await call(h.api.mediaStart,request('POST',{size:file.length,type:'image/png'}),null);ok('ログイン前は送信を始めない',denied.status===401&&globalThis.__deckAssets.size===0);
 const tooLarge=await call(h.api.mediaStart,request('POST',{size:10*1024*1024+1,type:'image/png'}));ok('10MBを超える画像を受け付けない',tooLarge.status===400);
 const video=await call(h.api.mediaStart,request('POST',{size:1024,type:'video/mp4'}));ok('動画の形式は受け付けない',video.status===400);
 const begun=await call(h.api.mediaStart,request('POST',{size:file.length,type:'image/png'}));const {upload,chunkBytes}=await begun.json();ok('小分けの送信を編集権限の内側で始める',begun.status===201&&chunkBytes===2*1024*1024);
 const signatureAt=upload.indexOf('.')+1,tampered=upload.slice(0,signatureAt)+(upload[signatureAt]==='A'?'B':'A')+upload.slice(signatureAt+1);
 const wrong=await call(h.api.mediaChunk,request('PUT',file.subarray(0,chunkBytes),tampered,'&chunk=0&hash='+'0'.repeat(64)));ok('書き換えた送信の印では受け付けない',wrong.status===403);
 const other={...h.owner,email:'other@example.test'};await h.pg.query(`insert into organization_members(organization_id,email,role,added_by) values ('00000000-0000-4000-8000-000000000001',$1,'admin',$2) on conflict (organization_id,email) do update set role='admin'`,[other.email,h.owner.email]);
 const stolen=await call(h.api.mediaCancel,request('DELETE',undefined,upload),other);ok('編集権限があっても他人の送信を中止できない',stolen.status===403);
 const lease=h.api.readVideoLease(upload),expired=h.api.issueVideoLease({...lease,created:Date.now()-3*60*60*1000,expires:Date.now()-60*60*1000});
 const late=await call(h.api.mediaCancel,request('DELETE',undefined,expired));ok('期限切れの送信を拒否する',late.status===403);
 const oversized=await call(h.api.mediaChunk,request('PUT',Buffer.alloc(chunkBytes+1),upload,'&chunk=0&hash='+'0'.repeat(64)));ok('宣言に関わらず実際の通信量を制限する',oversized.status===413&&globalThis.__deckAssets.size===0);
 const fake=Buffer.alloc(chunkBytes,7),fakeHash=createHash('sha256').update(fake).digest('hex');
 const notImage=await call(h.api.mediaChunk,request('PUT',fake,upload,`&chunk=0&hash=${fakeHash}`));ok('先頭が画像の形でない送信は受け取らない',notImage.status===400&&globalThis.__deckAssets.size===0);
 const hashes=[];
 for(let at=0,index=0;at<file.length;at+=chunkBytes,index++){
  const bytes=file.subarray(at,at+chunkBytes),hash=createHash('sha256').update(bytes).digest('hex');hashes.push(hash);
  const response=await call(h.api.mediaChunk,request('PUT',bytes,upload,`&chunk=${index}&hash=${hash}`));ok(`部分${index+1}を非公開で受け取る`,response.status===200);
 }
 ok('途中のデータはすべて非公開で保管', staged().length===hashes.length&&[...globalThis.__deckAssets].every(([key,value])=>key.startsWith('_deck-uploads/')&&value.options.access==='private'));
 const same=await call(h.api.mediaChunk,request('PUT',file.subarray(0,chunkBytes),upload,`&chunk=0&hash=${hashes[0]}`));ok('同じ部分の再送で保存量を増やさない',same.status===200&&globalThis.__deckAssets.size===hashes.length);
 const changed=Buffer.from(file.subarray(0,chunkBytes));changed[100]^=1;const changedHash=createHash('sha256').update(changed).digest('hex');
 const conflict=await call(h.api.mediaChunk,request('PUT',changed,upload,`&chunk=0&hash=${changedHash}`));ok('同じ場所へ違う内容を上書きしない',conflict.status===409&&globalThis.__deckAssets.size===hashes.length);
 const badHash=await call(h.api.mediaChunk,request('PUT',file.subarray(0,chunkBytes),upload,'&chunk=0&hash='+'0'.repeat(64)));ok('届いたバイト列と照合してから保存する',badHash.status===413);
 const short=await call(h.api.mediaFinish,request('PATCH',{hashes:hashes.slice(0,2)},upload));ok('届いていない部分を省いて完成させない',short.status===400);
 globalThis.__deckMultipartSizes=[];
 const finished=await call(h.api.mediaFinish,request('PATCH',{hashes},upload));const body=await finished.json();
 const original=globalThis.__deckAssets.get('internal/example/design/'+body.originalSrc);ok('原画像を元のバイト列のまま保管する',finished.status===201&&original.bytes.equals(file));
 ok('全体を一度に溜めず8MBまでの部品で順番に完成させる',globalThis.__deckMultipartSizes.length===1&&globalThis.__deckMultipartSizes[0]===file.length);
 ok('原画像も非公開で、履歴に残る置き場所を使う',body.originalSrc.startsWith('_deck/media-')&&original.options.access==='private'&&original.options.multipart===true);
 const optimized=globalThis.__deckAssets.get('internal/example/design/'+body.src);ok('配信用の画像も非公開で、履歴に残る置き場所に置く',body.src.startsWith('_deck/media-')&&optimized?.options.access==='private'&&body.intrinsicWidth>0&&body.intrinsicHeight>0);
 const delivered=await h.api.readAsset(h.organization,'internal',['example','design',...body.src.split('/')]);ok('保存した画像を本物の素材の読取口から配信できる',delivered?.size===optimized.bytes.length);
 const archived=await h.api.readArchivedAsset(h.organization,'internal',['example','design'],'a'.repeat(40),body.src.split('/'));ok('過去の版でも変更不能な画像を取り出せる',archived?.size===optimized.bytes.length);
 const idForPath='00000000-0000-4000-8000-000000000000';
 ok('素材とロゴは予約された場所から読める',h.api.isSafeAssetPath(['example','design','_deck','media-'+idForPath+'.jpg'])&&h.api.isSafeAssetPath(['_deck','logo-'+idForPath+'.png']));
 ok('一時保管や別の隠し場所を素材のURLへ広げない',!h.api.isSafeAssetPath(['_deck-uploads','2026-09-15',idForPath,'000'])&&!h.api.isSafeAssetPath(['example','_private','secret.png'])&&!h.api.isSafeAssetPath(['example','_deck','../secret.png'])&&!h.api.isSafeAssetPath(['example','_deck','media-unknown.png']));
 ok('完成後は途中のデータを消す',staged().length===0);
 const kept=globalThis.__deckAssets.size;
 const retried=await call(h.api.mediaFinish,request('PATCH',{hashes},upload));const again=await retried.json();ok('完成の返事が失われても同じ結果を返す',retried.status===201&&again.src===body.src&&again.originalSrc===body.originalSrc&&globalThis.__deckAssets.size===kept);
 const cancelled=await call(h.api.mediaCancel,request('DELETE',undefined,upload));ok('中止で完成品や履歴の素材を消さない',cancelled.status===200&&globalThis.__deckAssets.has('internal/example/design/'+body.src)&&globalThis.__deckAssets.has('internal/example/design/'+body.originalSrc));
 const id='00000000-0000-4000-8000-000000000000',old=`_deck-uploads/2020-01-01/${id}/000`,young=`_deck-uploads/2099-01-01/${id}/000`;
 globalThis.__deckAssets.set(old,{bytes:Buffer.from('old'),options:{access:'private'},uploadedAt:new Date(Date.now()-2*24*60*60*1000)});
 globalThis.__deckAssets.set(young,{bytes:Buffer.from('new'),options:{access:'private'},uploadedAt:new Date()});
 const otherId='11111111-1111-4111-8111-111111111111',otherOrganization={id:otherId,assetPrefix:`o/${otherId}/`},otherOld=`o/${otherId}/_deck-uploads/2020-01-01/${id}/000`;
 globalThis.__deckAssets.set(otherOld,{bytes:Buffer.from('old'),options:{access:'private'},uploadedAt:new Date(Date.now()-2*24*60*60*1000)});
 const removed=await h.api.sweepVideoUploads(h.organization);ok('古い一時データだけを自動清掃する',removed===1&&!globalThis.__deckAssets.has(old)&&globalThis.__deckAssets.has(young)&&globalThis.__deckAssets.has('internal/example/design/'+body.src));
 ok('最初の組織の掃除は、別の組織の置き場の一時データに触れない',globalThis.__deckAssets.has(otherOld));
 const otherRemoved=await h.api.sweepVideoUploads(otherOrganization);ok('組織の置き場の頭が付いた古い一時データも、その組織の掃除で片付く',otherRemoved===1&&!globalThis.__deckAssets.has(otherOld)&&globalThis.__deckAssets.has(young));
}finally{await h.close();}
