import test from 'node:test';
import assert from 'node:assert/strict';
import {createDeckEditHarness} from '../checks/deck-edit-harness.mjs';

test('image reuse preserves every user, original attribution and current access',async()=>{
 const h=await createDeckEditHarness({extra:`export * from './src/lib/deck/media/image-catalog';`});
 try{
  const original=await h.seed(await h.api.newDeckDocument());
  const image={src:'_deck/media-11111111-1111-4111-8111-111111111111.png',contentType:'image/png',intrinsicWidth:640,intrinsicHeight:360,bytes:100};
  const first=await h.api.recordDeckImage(original.page,h.owner.email,image,'search',{title:'Original title',sourcePageUrl:'https://example.com/photo',sourceName:'Original source'});
  const second=await h.api.recordDeckImage(original.page,'second@example.test',image,'upload');
  assert.equal(first.id,second.id);assert.equal(second.source_page_url,'https://example.com/photo');assert.equal(second.owner_email,h.owner.email);
  const uses=await h.pg.query('select owner_email from deck_image_uses where asset_id=$1',[first.id]);assert.equal(uses.rows.length,2);
  const target=await h.api.commitRevision({organization:h.organization,pageSlug:'internal/another',html:await h.api.newDeckDocument(),message:'test',author:h.owner});
  assert.equal((await h.api.listDeckImages(h.owner,target.page)).recent.length,1);
  const secondViewer={...h.owner,email:'second@example.test'};
  assert.equal((await h.api.listDeckImages(secondViewer,target.page)).recent.length,1);
  await h.pg.query("update pages set visibility='restricted' where id=$1",[original.page.id]);
  assert.equal((await h.api.listDeckImages(secondViewer,target.page)).recent.length,0);
  await assert.rejects(h.api.imageBytes(h.organization,second,secondViewer),/その画像はありません/);
  const paths=[];
  for(let at=0;at<45;at++){const src=`image-${at}.png`;paths.push(src);await h.api.recordDeckImage(original.page,h.owner.email,{...image,src},'existing');}
  assert.equal((await h.api.knownDeckImageSources(original.page,paths)).size,45);
 }finally{await h.close();}
});
