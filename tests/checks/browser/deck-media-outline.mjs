import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import sharp from 'sharp';
const {chromium,webkit}=await import(process.env.PLAYWRIGHT_MODULE??'playwright');
const output='/tmp/deck-media-outline-qa';await mkdir(output,{recursive:true});
const png=await sharp({create:{width:160,height:90,channels:4,background:{r:20,g:80,b:120,alpha:.5}}}).png().toBuffer();
await writeFile(`${output}/transparent.png`,png);
for(const[name,engine]of[['chromium',chromium],['webkit',webkit]].filter(([name])=>!process.env.ENGINE||name===process.env.ENGINE)){
 const server=spawn(process.execPath,['scripts/dev/preview-deck-editor.mjs'],{env:{...process.env,PORT:'0'},stdio:['ignore','pipe','pipe']});let logs='',browser;
 server.stderr.on('data',data=>logs+=data);
 try{
  const url=await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(Error(logs||'preview timeout')),30000);server.stdout.on('data',data=>{const found=String(data).match(/http:\/\/127\.0\.0\.1:\d+/);if(found){clearTimeout(timeout);resolve(found[0]);}});server.once('exit',()=>{clearTimeout(timeout);reject(Error(logs));});});
  browser=await engine.launch({headless:true,...(name==='chromium'?{channel:'chrome'}:{})});const page=await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce'});page.setDefaultTimeout(30000);const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto(url+'/?edit=1');await page.locator('.ds-slide').first().waitFor();
  const frame=page.frameLocator('iframe.edit-frame');
  const saved=()=>page.locator('.deck-edit-status[data-state=saved]').waitFor();
  const menu=async label=>{await page.getByRole('button',{name:'スライドの操作',exact:true}).click();await page.getByRole('menuitem',{name:label+' — スライド',exact:true}).click();await saved();};
  const outline=()=>frame.locator('section[data-deck-slide]').evaluateAll(nodes=>nodes.map(node=>({id:node.getAttribute('data-deck-node'),parent:node.getAttribute('data-deck-parent')})));
  // 保存の表示は前の保存のまま残っているので、枚の数が変わる操作のあとはその数になるまで待ってから読む
  const outlineOf=async count=>{const end=Date.now()+20000;let rows=await outline();while(rows.length!==count&&Date.now()<end){await page.waitForTimeout(100);rows=await outline();}return rows;};
  const original=await outline();assert.equal(original.length,6);
  await page.locator('.ds-slide').nth(1).click();await menu('前のスライドの子にする');assert.equal((await outline())[1].parent,original[0].id);
  await page.locator('.ds-slide').nth(2).click();await menu('前のスライドの子にする');await menu('前のスライドの子にする');assert.equal((await outline())[2].parent,original[1].id);
  await page.locator('.ds-slide').first().click();await page.locator('.ds-slide').first().press('ArrowLeft');assert.equal(await page.locator('.ds-slide:visible').count(),4);
  await page.locator('.ds-slide').first().press('ArrowRight');assert.equal(await page.locator('.ds-slide:visible').count(),6);
  const fold=page.locator('.ds-slide').first().locator('.ds-fold');
  await fold.click();assert.equal(await page.locator('.ds-slide:visible').count(),4);assert.equal(await fold.locator('.ds-fold-count').textContent(),'2');
  assert.equal(await page.locator('.ds-slide').first().getAttribute('aria-expanded'),'false');
  assert.deepEqual(await page.locator('.ds-slide:visible .ds-slide-number').allTextContents(),['1','4','5','6']);
  await fold.click();assert.equal(await page.locator('.ds-slide:visible').count(),6);assert.equal(await fold.locator('.ds-fold-count').count(),0);
  // 構造は左の溝に：番号は 1 列、絵だけ 1 段 24px 下がり、開閉は自分の絵の左下（8px 手前・下端そろえ）。枝の中 8px、根の間 16px。
  const edges=await page.locator('.ds-slide:visible').evaluateAll(rows=>rows.map(row=>{const number=row.querySelector('.ds-slide-number').getBoundingClientRect();const thumb=row.querySelector('.ds-thumb').getBoundingClientRect();const fold=row.querySelector('.ds-fold')?.getBoundingClientRect();return {number:number.left,thumb:{left:thumb.left,right:thumb.right,top:thumb.top,bottom:thumb.bottom},fold:fold?{left:fold.left,right:fold.right,top:fold.top,bottom:fold.bottom}:null,top:row.getBoundingClientRect().top,bottom:row.getBoundingClientRect().bottom};}));
  const near=(a,b,tolerance=1)=>Math.abs(a-b)<=tolerance;
  assert.equal(new Set(edges.map(edge=>Math.round(edge.number))).size,1);
  assert.ok(near(edges[1].thumb.left-edges[0].thumb.left,24)&&near(edges[2].thumb.left-edges[1].thumb.left,24),'子は 24px、孫はさらに 24px 下がる');
  assert.ok(near(edges[1].top-edges[0].bottom,8)&&near(edges[3].top-edges[2].bottom,16),'枝の中は 8px、根の間は 16px');
  for(const edge of[edges[0],edges[1]]){
    assert.ok(edge.fold,'子を持つ行には開閉がある');
    assert.ok(near(edge.fold.right,edge.thumb.left-8)&&near(edge.fold.bottom,edge.thumb.bottom),'開閉は絵の左 8px・下端そろえ');
    assert.ok(edge.fold.right<=edge.thumb.left,'開閉は絵の上に載らない');
  }
  assert.equal(edges[2].fold,null);
  await menu('後ろへ');assert.deepEqual((await outline()).map(row=>row.id),[original[3].id,original[0].id,original[1].id,original[2].id,original[4].id,original[5].id]);
  await menu('複製');const copied=await outlineOf(9);assert.equal(copied.length,9);assert.equal(copied[5].parent,copied[4].id);assert.equal(copied[6].parent,copied[5].id);
  await page.getByRole('button',{name:'元に戻す',exact:true}).click();await saved();assert.equal((await outlineOf(6)).length,6);
  const from=await page.locator('.ds-slide').last().boundingBox(),to=await page.locator('.ds-slide').first().boundingBox();await page.mouse.move(from.x+50,from.y+40);await page.mouse.down();await page.mouse.move(to.x+50,to.y+8,{steps:12});await page.mouse.move(to.x+51,to.y+9);await page.mouse.up();await page.waitForFunction(id=>document.querySelector('surprise-comments')?.shadowRoot?.querySelector('iframe.edit-frame')?.contentDocument?.querySelector('section[data-deck-slide]')?.getAttribute('data-deck-node')===id,original[5].id);await saved();assert.equal((await outline())[0].id,original[5].id);
  await page.getByRole('button',{name:'元に戻す',exact:true}).click();await saved();
  console.log('PASS',name,'実際のドラッグで順序を変え、取り消せる');
  // 行き先は継ぎ目（行の下半分＝その行の下）と深さ（ポインタの横位置）。線は 1 本だけで、左端が字下げを言う。
  const childFrom=await page.locator('.ds-slide').last().boundingBox(),parentTo=await page.locator('.ds-slide').first().boundingBox();await page.mouse.move(childFrom.x+50,childFrom.y+40);await page.mouse.down();await page.mouse.move(parentTo.x+120,parentTo.y+parentTo.height-8,{steps:12});
  const line=await page.locator('.ds-drop-line').evaluate(node=>node.getBoundingClientRect());const parentThumb=await page.locator('.ds-slide').first().locator('.ds-thumb').evaluate(node=>node.getBoundingClientRect());
  assert.equal(await page.locator('.ds-drop-line').count(),1);assert.ok(near(line.left,parentThumb.left+24)&&line.top>parentThumb.bottom,'挿入線は親の絵の下、1 段字下げの位置');
  await page.mouse.up();
  await page.waitForFunction(({child,parent})=>document.querySelector('surprise-comments')?.shadowRoot?.querySelector('iframe.edit-frame')?.contentDocument?.querySelector(`[data-deck-node="${child}"]`)?.getAttribute('data-deck-parent')===parent,{child:original[5].id,parent:original[3].id});await saved();
  assert.equal(await page.locator('.ds-drop-line').count(),0);
  await page.getByRole('button',{name:'元に戻す',exact:true}).click();await saved();console.log('PASS',name,'下の継ぎ目へ右寄りにドラッグして子にし、一度に取り消せる');
  // 継ぎ目の + はその位置に差し込む。選んでいる枚の下だけ常に見え、ほかはホバーで出る。
  assert.equal(await page.locator('.ds-slide[data-current] .ds-seam-chip').evaluate(node=>getComputedStyle(node).opacity),'1');
  assert.equal(await page.locator('.ds-slide:not([data-current])').first().locator('.ds-seam-chip').evaluate(node=>getComputedStyle(node).opacity),'0');
  const seamAbove=(await outline())[1].id;
  await page.locator(`.ds-slide[data-slide-id="${seamAbove}"] .ds-seam`).hover();await page.locator(`.ds-slide[data-slide-id="${seamAbove}"] .ds-seam`).click();
  await page.getByText('2枚目の後に追加',{exact:true}).waitFor();
  const card=page.locator('[data-choice]').first();await card.locator('iframe').waitFor();await card.frameLocator('iframe').locator('body[data-deck-design-ready]').waitFor();await card.click();
  await page.getByRole('button',{name:'このスライドを追加',exact:true}).click();await saved();
  const inserted=await outlineOf(7);assert.equal(inserted.length,7);assert.equal(inserted[1].id,seamAbove);assert.equal(inserted[2].parent,seamAbove,'2枚目の子が続くので、その子として差し込む');assert.equal(inserted[3].id,original[1].id);
  await page.getByRole('button',{name:'元に戻す',exact:true}).click();await saved();assert.equal((await outlineOf(6)).length,6);console.log('PASS',name,'継ぎ目の + でその位置に差し込み、取り消せる');
  // 試験のページも本物と同じく開いたら ?edit=1 を消すので、読み込み直しは編集を開く URL で行う
  await page.goto(url+'/?edit=1');await page.locator('.ds-slide').first().waitFor();assert.equal((await outline())[2].parent,original[0].id);
  console.log('PASS',name,'親子・孫・折り畳み・まとめて移動・複製・取り消し・再読み込み');
  await page.locator('.ds-slide').nth(1).click();await page.getByRole('button',{name:'スライドの操作',exact:true}).click();await page.getByRole('menuitem',{name:'削除 — スライド',exact:true}).click();
  await page.getByRole('button',{name:'この枚だけ削除',exact:true}).click();await saved();const deleted=await outlineOf(5);assert.equal(deleted.length,5);assert.equal(deleted.find(row=>row.id===original[1].id).parent,null);assert.equal(deleted.find(row=>row.id===original[2].id).parent,original[1].id);
  await page.getByRole('button',{name:'元に戻す',exact:true}).click();await saved();assert.equal((await outlineOf(6)).length,6);console.log('PASS',name,'親だけ削除で子を繰り上げ、一度に取り消せる');
  const beforeImages=await frame.locator('img[data-deck-created]').count();
  await page.locator('input[type=file][accept^="image/"]').setInputFiles([{name:'transparent.png',mimeType:'image/png',buffer:png},{name:'second.png',mimeType:'image/png',buffer:png}]);
  await page.locator('.ds-media-item[data-state=saved]').nth(1).waitFor({state:'attached'});await saved();assert.equal(await frame.locator('img[data-deck-created]').count(),beforeImages+2);console.log('PASS',name,'複数画像を追加し軽量化・保存まで完了');
  // Actual browser DataTransfer and paste events cross the frame boundary.
  const actualFrame=await(await page.locator('iframe.edit-frame').elementHandle()).contentFrame();
  await actualFrame.evaluate(bytes=>{const transfer=new DataTransfer();transfer.items.add(new File([new Uint8Array(bytes)],'dropped.png',{type:'image/png'}));const slide=document.querySelector('section[data-studio-active]');const rect=slide.getBoundingClientRect();slide.dispatchEvent(new DragEvent('dragover',{bubbles:true,cancelable:true,dataTransfer:transfer,clientX:rect.left+50,clientY:rect.top+50}));slide.dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:transfer,clientX:rect.left+50,clientY:rect.top+50}));},[...png]);
  await page.locator('.ds-media-item[data-state=saved]').nth(2).waitFor({state:'attached'});await saved();assert.equal(await frame.locator('img[data-deck-created]').count(),beforeImages+3);console.log('PASS',name,'スライドへドラッグした位置に画像を追加');
  const replacementPng=await sharp({create:{width:300,height:200,channels:4,background:'#146b52'}}).png().toBuffer();
  const originalImage=await actualFrame.locator('img[data-deck-created]').last().evaluate(node=>({id:node.getAttribute('data-deck-node'),src:node.getAttribute('src'),style:node.getAttribute('style'),alt:node.getAttribute('alt')}));
  const imageCount=await frame.locator('img[data-deck-created]').count();
  await actualFrame.evaluate(({bytes,id})=>{
    const transfer=new DataTransfer();transfer.items.add(new File([new Uint8Array(bytes)],'replacement.png',{type:'image/png'}));
    const image=document.querySelector(`[data-deck-node="${id}"]`),rect=image.getBoundingClientRect();
    const init={bubbles:true,cancelable:true,dataTransfer:transfer,clientX:rect.left+rect.width/2,clientY:rect.top+rect.height/2};
    image.dispatchEvent(new DragEvent('dragover',init));
    if(!image.hasAttribute('data-deck-drop-target'))throw Error('Replacement target must be the image');
    image.dispatchEvent(new DragEvent('drop',init));
  },{bytes:[...replacementPng],id:originalImage.id});
  const replacedImage=frame.locator(`[data-deck-node="${originalImage.id}"]`);
  await page.waitForFunction(({id,src})=>document.querySelector('surprise-comments')?.shadowRoot?.querySelector('iframe.edit-frame')?.contentDocument?.querySelector(`[data-deck-node="${id}"]`)?.getAttribute('src')!==src,originalImage);
  await page.locator('.ds-media-item[data-state=saved]').nth(3).waitFor({state:'attached'});await saved();
  const replacementSrc=await replacedImage.getAttribute('src');
  assert.equal(await replacedImage.getAttribute('style'),originalImage.style);assert.equal(await frame.locator('img[data-deck-created]').count(),imageCount);
  await page.getByRole('button',{name:'元に戻す',exact:true}).click();await saved();
  assert.equal(await replacedImage.getAttribute('src'),originalImage.src);assert.equal(await replacedImage.getAttribute('alt'),originalImage.alt);assert.equal(await replacedImage.getAttribute('style'),originalImage.style);
  await page.getByRole('button',{name:'やり直す',exact:true}).click();await saved();assert.equal(await replacedImage.getAttribute('src'),replacementSrc);
  console.log('PASS',name,'画像上のドロップは位置と大きさを保って置き換え、一度の取り消しとやり直しができる');
  await page.locator('input[type=file][accept^="image/"]').setInputFiles({name:'broken.png',mimeType:'image/png',buffer:Buffer.from('not a PNG')});await page.locator('.ds-media-item[data-state=failed]').waitFor({state:'attached'});assert.equal(await page.locator('.ds-media-panel').isVisible(),false);await page.getByRole('button',{name:'素材の状況',exact:true}).click();await page.locator('.ds-media-panel').waitFor();assert.ok((await page.locator('.ds-media-item[data-state=failed]').textContent()).includes('broken.png'));await page.locator('.ds-media-item[data-state=failed]').getByRole('button',{name:'ファイルを選び直す',exact:true}).waitFor();assert.equal(await page.locator('.ds-media-item[data-state=failed]').getByRole('button',{name:'再試行',exact:true}).count(),0);console.log('PASS',name,'壊れたファイルの名前と理由を残し再試行できる');
  let youtubeRequests=0;page.on('request',request=>{if(request.url().includes('youtube'))youtubeRequests++;});
  await page.getByRole('button',{name:'＋ 挿入',exact:true}).click();await page.getByRole('button',{name:'リンクから追加',exact:true}).click();await page.getByLabel('画像・動画・YouTubeのリンク',{exact:true}).fill('https://youtu.be/abcdefghijk');await page.getByRole('button',{name:'追加',exact:true}).click();await page.locator('.ds-media-item[data-state=saved]').nth(4).waitFor({state:'attached'});await saved();await frame.getByRole('button',{name:'YouTubeを再生',exact:true}).waitFor();assert.equal(youtubeRequests,0);console.log('PASS',name,'YouTubeは保存でき、再生するまで通信しない');
  await page.route('https://www.youtube.com/iframe_api',route=>route.fulfill({contentType:'text/javascript',body:`window.YT={Player:class {constructor(element,options){this.frame=document.createElement('iframe');element.replaceWith(this.frame);setTimeout(()=>options.events.onError({data:101}),0);}destroy(){this.frame.remove();}playVideo(){}pauseVideo(){}}};window.onYouTubeIframeAPIReady();`}));
  await frame.getByRole('button',{name:'YouTubeを再生',exact:true}).click();await frame.getByText('投稿者の設定により、このページ内では再生できません。',{exact:true}).waitFor();await frame.getByRole('link',{name:'YouTubeで開く',exact:true}).waitFor();assert.equal(await frame.getByRole('button',{name:'YouTubeを再生',exact:true}).isVisible(),false);
  console.log('PASS',name,'YouTubeの埋め込み禁止を説明し、再試行と元動画への導線を残す');
  await page.screenshot({path:`${output}/${name}-editor.png`});
  await page.setViewportSize({width:640,height:600});await page.screenshot({path:`${output}/${name}-narrow.png`});assert.equal(await page.locator('.ds-stage').isVisible(),false);await page.getByRole('button',{name:'素材の状況を閉じる',exact:true}).click();await page.locator('.ds-stage').waitFor();await page.screenshot({path:`${output}/${name}-narrow-editor.png`});assert.deepEqual(errors,[]);
 }catch(error){console.error(logs.slice(-2000));throw error;}finally{await browser?.close();server.kill('SIGTERM');}
}
