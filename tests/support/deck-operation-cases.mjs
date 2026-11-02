import {expect} from 'playwright/test';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {readFile} from 'node:fs/promises';

const goTo=ui=>async n=>{await ui.locator('.ds-slide').nth(n).click();await expect(ui.locator('.ds-slide').nth(n)).toHaveAttribute('aria-selected','true');};
/**
 * Additional outcomes share the running browser, source and disposable server of their own speed test.
 * The two functions below are the two halves of one list (deck-operation-catalog.mjs DECK_OPERATION_PARTS):
 * operations on the elements of one slide run in test 1/2, right after the image upload they work on.
 */
export async function exerciseElementOperations({page,ui,action,saved,frame,slide,button,inFrame}) {
  const go=goTo(ui);
  await saved();await go(0);
  const image=()=>slide().locator('img').last();
  await action('resize',async()=>{await inFrame.click(image());const before=await image().evaluate(n=>n.getBoundingClientRect().width);const handle=frame().getByRole('button',{name:'画像の大きさを変更（矢印キーでも調整できます）',exact:true});await handle.focus();await page.keyboard.press('ArrowRight');const box=await inFrame.box(handle);await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width/2+30,box.y+box.height/2+20,{steps:20});await page.mouse.up();await expect.poll(()=>image().evaluate(n=>n.getBoundingClientRect().width)).toBeGreaterThan(before);});
  await saved();
  await action('move',async()=>{await inFrame.click(image());const before=await image().getAttribute('style');await page.keyboard.press('ArrowRight');const box=await inFrame.box(image());await page.mouse.move(box.x+20,box.y+20);await page.mouse.down();await page.mouse.move(box.x+45,box.y+30,{steps:20});await page.mouse.up();await expect(image()).not.toHaveAttribute('style',before);});
  await saved();
  await go(30);
  const first=()=>slide().locator('[data-deck-node="detail-30-0"]');
  const second=()=>slide().locator('[data-deck-node="detail-30-1"]');
  await action('multi-select',async()=>{await inFrame.click(first());await inFrame.click(second(),{modifiers:['Shift']});await expect(ui.locator('.ds-inspector')).toContainText('2個を選択');});
  await action('align',async()=>{await button('左端').click();await expect.poll(async()=>Math.abs((await first().boundingBox()).x-(await second().boundingBox()).x)).toBeLessThan(1);});
  await saved();
  await action('group',async()=>{await button('グループ化').click();await expect(slide().locator('[data-deck-group]')).toHaveCount(1);await saved();await button('グループを解除').click();await expect(slide().locator('[data-deck-group]')).toHaveCount(0);});
  await saved();await go(0);
  // The uploaded image must survive closing the editor with its size and position changed.
  return {imageId:await image().getAttribute('data-deck-node'),imageSrc:await image().getAttribute('src')};
}
/** Slide structure, design dialogs, media and recovery: test 2/2, together with the checks of what stays after closing. */
export async function exerciseDocumentOperations({page,ui,action,saved,refreshFrame,slide,button,buffer,directory,inFrame}) {
  const go=goTo(ui);
  const slideAction=async name=>{await button('スライドの操作').click();await ui.getByRole('menuitem',{name:name+' — スライド',exact:true}).click();};
  const image=()=>slide().locator('img').last();
  await go(30);
  await action('duplicate',async()=>{const count=await ui.locator('.ds-slide').count();await slideAction('複製');await expect(ui.locator('.ds-slide')).toHaveCount(count+1);});
  await saved();
  await action('reorder',async()=>{await slideAction('後ろへ');await expect(ui.locator('.ds-slide').nth(32)).toHaveAttribute('aria-selected','true');});
  await saved();
  await action('outline-drag',async()=>{const from=ui.locator('.ds-slide').nth(32),to=ui.locator('.ds-slide').nth(31);await from.scrollIntoViewIfNeeded();const a=await from.boundingBox(),b=await to.boundingBox();await page.mouse.move(a.x+70,a.y+40);await page.mouse.down();await page.mouse.move(b.x+70,b.y+8,{steps:12});await page.mouse.move(b.x+71,b.y+9);await page.mouse.up();await expect(ui.locator('.ds-slide').nth(31)).toHaveAttribute('aria-selected','true');});
  await saved();
  await action('outline',async()=>{await slideAction('前のスライドの子にする');await expect(slide()).toHaveAttribute('data-deck-parent',/.+/);await saved();const parent=ui.locator('.ds-slide').nth(30),child=ui.locator('.ds-slide').nth(31);await parent.locator('.ds-fold').click();await expect(child).toBeHidden();await parent.locator('.ds-fold').press('Enter');await expect(child).toBeVisible();await slideAction('親の階層へ戻す');await expect(slide()).not.toHaveAttribute('data-deck-parent');});
  await saved();
  await action('skip',async()=>{await slideAction('発表でスキップ');await expect(slide()).toHaveAttribute('data-deck-skip','true');await saved();await slideAction('スキップを解除');await expect(slide()).not.toHaveAttribute('data-deck-skip');});
  await saved();
  await action('delete',async()=>{const count=await ui.locator('.ds-slide').count();await slideAction('削除');await expect(ui.locator('.ds-slide')).toHaveCount(count-1);});
  await saved();
  await go(13);
  await action('table',async()=>{await inFrame.dblclick(slide().locator('table'));const dialog=ui.getByRole('dialog',{name:'表の内容を編集',exact:true});await dialog.getByLabel('2行 1列',{exact:true}).fill('変更した項目');await dialog.getByRole('button',{name:'反映',exact:true}).click();await expect(slide().locator('table')).toContainText('変更した項目');});
  await saved();await go(1);
  await action('chart',async()=>{await inFrame.dblclick(slide().locator('figure[data-dd-chart]'));const dialog=ui.getByRole('dialog',{name:'グラフのデータを編集',exact:true});await dialog.getByLabel('2行 2列',{exact:true}).fill('37');await dialog.getByRole('button',{name:'反映',exact:true}).click();await expect(slide().locator('figure[data-dd-chart]')).toContainText('37');});
  await saved();await go(0);
  await button('デザイン').click();
  await action('font',async()=>{await ui.locator('.ds-inspector summary').filter({hasText:'細かく調整'}).click();await ui.locator('.ds-field').filter({hasText:'書体'}).locator('select').selectOption('system');await expect(slide()).toHaveAttribute('data-deck-typography','system');});
  await saved();
  await action('focus',async()=>{await button('段階表示').click();await button('1. 全体を確認').click();await ui.getByLabel('読む人にも残す短い説明',{exact:true}).fill('段階表示の補足を更新');await button('全体を見る').click();await saved();await button('1. 全体を確認').click();await expect(ui.getByLabel('読む人にも残す短い説明',{exact:true})).toHaveValue('段階表示の補足を更新');});
  await action('logo',async()=>{await button('ロゴ').click();const input=ui.locator('.deck-logo-workspace input[type=file]').first();await input.setInputFiles({name:'logo.png',mimeType:'image/png',buffer});await expect(slide().locator('[data-deck-logo-view] img')).toBeVisible();await saved();await ui.getByLabel('置き場所').selectOption('hidden');await expect(slide().locator('[data-deck-logo-view] img')).not.toBeVisible();});
  await saved();await button('デザイン').click();
  await action('image-replace',async()=>{
    const before=await image().getAttribute('src');
    const replacement=await readFile(path.join(directory,'stress-image-7.png'));
    await image().evaluate((n,bytes)=>{const data=new DataTransfer();data.items.add(new File([new Uint8Array(bytes)],'replacement.png',{type:'image/png'}));const r=n.getBoundingClientRect(),init={bubbles:true,cancelable:true,dataTransfer:data,clientX:r.x+r.width/2,clientY:r.y+r.height/2};n.dispatchEvent(new DragEvent('dragover',init));n.dispatchEvent(new DragEvent('drop',init));},[...replacement]);
    await expect(image()).not.toHaveAttribute('src',before);await saved();
  });
  const videoFile=path.join(directory,'test.mp4');
  execFileSync(process.env.TEST_FFMPEG??(process.platform==='darwin'?'/opt/homebrew/bin/ffmpeg':'/usr/bin/ffmpeg'),['-y','-v','error','-f','lavfi','-i','testsrc2=size=320x180:rate=30','-t','1','-c:v','libx264','-crf','5',videoFile]);
  await action('video-upload',async()=>{await ui.locator('input[type=file][accept*="video/mp4"]').first().setInputFiles(videoFile);await expect(slide().locator('video')).toHaveCount(1);await saved();});
  await action('video-convert',async()=>{await button('素材の状況').click();await expect(ui.locator('.ds-media-item').filter({hasText:'test.mp4'})).toHaveAttribute('data-state','saved',{timeout:15000});await expect(slide().locator('video')).toHaveCount(1);const video=slide().locator('video'),id=await video.getAttribute('data-deck-node');const current=await(await page.request.get(serverEndpoint(page.url()))).json();const stored=current.nodes.find(node=>node.id===id);await expect.poll(()=>video.evaluate(n=>n.getAttribute('data-deck-video-src')??n.getAttribute('src'))).toBe(stored.src);await button('素材の状況を閉じる').click();});
  await action('video-playback',async()=>{await inFrame.click(slide().locator('video'));await button('再生を確認').click();await expect.poll(()=>slide().locator('video').evaluate(n=>!n.paused)).toBe(true);await page.keyboard.press('Escape');await expect.poll(()=>slide().locator('video').evaluate(n=>n.paused&&n.buffered.length===0)).toBe(true);});
  const heading=()=>slide().locator('h1');
  await action('offline',async()=>{await page.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true})));await page.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true})));await page.route('**/api/pages/deck-edit',route=>route.request().method()==='PATCH'?route.abort('internetdisconnected'):route.continue());await inFrame.dblclick(heading());await page.keyboard.press('End');await page.keyboard.insertText('通信断でも入力');await expect(heading()).toContainText('通信断でも入力');await expect(ui.locator('.deck-edit-status[data-state=working]')).toBeVisible();await page.unroute('**/api/pages/deck-edit');await page.evaluate(()=>dispatchEvent(new Event('online')));await saved();});
  await page.keyboard.press('Escape');
  await action('draft',async()=>{await page.route('**/api/pages/deck-edit',route=>route.request().method()==='PATCH'?route.abort('internetdisconnected'):route.continue());await inFrame.dblclick(heading());await page.keyboard.press('End');await page.keyboard.insertText('下書きを復元');await page.keyboard.press('Escape');await button('完了').click();await button('下書きを残して閉じる').click();await page.unroute('**/api/pages/deck-edit');await button('この資料を編集').click();await button('下書きを戻す').click();await refreshFrame();await saved();await expect(heading()).toContainText('下書きを復元');});
  await action('remote',async()=>{
    const endpoint=serverEndpoint(page.url());const response=await page.request.get(endpoint);const current=await response.json();const node=current.nodes.find(n=>n.id==='detail-0-2');
    const write=await page.request.patch(endpoint.split('?')[0],{data:{page:'internal/example/design',sessionId:crypto.randomUUID(),operationId:crypto.randomUUID(),baseVersionId:current.versionId,operations:[{kind:'text',target:node.id,run:0,before:node.textRuns[0].text,after:'別の人からの変更'}]}});expect(write.ok()).toBe(true);
    await expect(slide().locator('[data-deck-node="detail-0-2"]')).toHaveText('別の人からの変更');
  });
  await action('template-library',async()=>{
    await ui.locator('.ds-slide').first().locator('.ds-seam').press('Enter');
    const search=ui.getByRole('searchbox',{name:'見本を検索'});
    await search.fill('見つからない見本XYZ');await expect(ui.locator('.dp-card')).toHaveCount(0);
    await search.fill('');await expect(ui.locator('[data-choice="basic:title"]')).toBeVisible();
    expect(await ui.locator('.dp-results iframe').count()).toBeLessThan(30);
  });
  await action('insert-slide',async()=>{
    const card=ui.locator('[data-choice="basic:title"]');await card.scrollIntoViewIfNeeded();await card.frameLocator('iframe').locator('body[data-deck-design-ready]').waitFor();
    await card.click();await button('このスライドを追加').click();await expect(ui.locator('.ds-slide')).toHaveCount(301);await saved();
  });
  await slideAction('削除');await expect(ui.locator('.ds-slide')).toHaveCount(300);await saved();await go(0);
  return {imageId:await image().getAttribute('data-deck-node'),imageSrc:await image().getAttribute('src')};
}
function serverEndpoint(url){return new URL('/api/pages/deck-edit?page=internal/example/design&sessionId='+crypto.randomUUID(),url).href;}
