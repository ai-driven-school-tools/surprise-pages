import {createHash} from "node:crypto";
import {test,expect} from 'playwright/test';
import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
async function login(context){const v=JSON.parse(await readFile(path.join(process.env.PAGES_TEST_RUNTIME??'.test-runtime','session.json'),'utf8'));await context.addCookies([{name:'authjs.session-token',value:v.sessions.owner,url:v.origin,httpOnly:true,sameSite:'Lax'}]);}
const frame=page=>page.frameLocator('iframe.edit-frame');
const saved=page=>expect(page.locator('.deck-edit-status')).toHaveAttribute('data-state','saved');
async function readyCard(page,id){const card=page.locator(`[data-choice="${id}"]`);await card.scrollIntoViewIfNeeded();await expect(card.locator('.dp-preview')).toHaveAttribute('data-preview-state','ready',{timeout:20000});return card;}
async function add(page,id,first=false){await page.getByRole('button',{name:first?'最初のスライドを追加':'スライドを追加',exact:true}).click();await(await readyCard(page,id)).click();await page.getByRole('button',{name:'このスライドを追加',exact:true}).click();await saved(page);}

test('all templates preview a theme, create zero slides, then add and present three',async({page,context},info)=>{
 await login(context);await page.setViewportSize({width:1280,height:800});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/decks/create');await expect(page.locator('.dp-card')).toHaveCount(64);
 await expect(page.getByText('最初の一枚を選ぶ',{exact:true})).toHaveCount(0);
 await page.getByRole('button',{name:'墨',exact:true}).click();await page.getByRole('textbox',{name:'資料名（任意）'}).fill(`空から作成-${info.project.name}`);
 const card=await readyCard(page,'basic:comparison');
 await expect(card.frameLocator('iframe').locator('section')).toHaveCSS('--dd-bg','#151719');
 await card.click();await expect(page.getByRole('dialog',{name:'見本を拡大'})).toBeVisible();
 await expect(page.locator('.dp-zoom iframe')).toHaveAttribute('sandbox','allow-same-origin');
 await page.getByRole('dialog',{name:'見本を拡大'}).getByRole('button',{name:'閉じる',exact:true}).click();
 await expect(page.getByRole('button',{name:'このテーマで作成',exact:true})).toBeInViewport({ratio:1});
 await page.screenshot({path:info.outputPath('01-theme-gallery.png'),fullPage:true});
 await page.getByRole('button',{name:'このテーマで作成',exact:true}).click();await saved(page);
 await expect(page.locator('.ds-slide')).toHaveCount(0);await expect(page.getByText('テーマ：墨',{exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'発表',exact:true})).toBeHidden();await expect(page.getByRole('button',{name:'挿入',exact:true})).toBeHidden();await expect(page.getByRole('button',{name:'ノートを開く',exact:true})).toHaveCount(0);
 await page.screenshot({path:info.outputPath('02-empty-editor.png'),fullPage:true});
 await add(page,'basic:comparison',true);await expect(frame(page).locator('section[data-studio-active]')).toHaveCSS('--dd-bg','#151719');
 const heading=frame(page).locator('section[data-studio-active] h1');await heading.dblclick();await page.keyboard.press('End');await page.keyboard.insertText(' 動作確認');await page.keyboard.press('Escape');await saved(page);
 await add(page,'basic:text');await add(page,'basic:table');await expect(page.locator('.ds-slide')).toHaveCount(3);
 await page.getByRole('button',{name:'発表',exact:true}).click();await expect(frame(page).locator('html')).toHaveAttribute('data-deck-mode','present');
 await frame(page).getByRole('button',{name:'プレゼンを終える',exact:true}).click();await expect(frame(page).locator('html')).not.toHaveAttribute('data-deck-mode','present');
 await page.reload();await expect(page.locator('section[data-deck-slide]')).toHaveCount(3);await expect(page.locator('main')).toContainText('動作確認');expect(errors).toEqual([]);
});

test('last slide deletion, undo, redo, add and reload retain the document theme',async({page,context})=>{
 await login(context);await page.goto('/decks/create');await page.getByRole('button',{name:'森',exact:true}).click();await page.getByRole('button',{name:'このテーマで作成',exact:true}).click();await saved(page);
 await add(page,'basic:title',true);await page.getByRole('button',{name:'スライドの操作',exact:true}).click();await page.getByRole('menuitem',{name:'削除 — スライド'}).click();await saved(page);
 await expect(page.getByRole('button',{name:'最初のスライドを追加',exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'発表',exact:true})).toBeHidden();
 await page.getByRole('button',{name:'元に戻す',exact:true}).click();await saved(page);await expect(page.locator('.ds-slide')).toHaveCount(1);
 await page.getByRole('button',{name:'やり直す',exact:true}).click();await saved(page);await expect(page.locator('.ds-slide')).toHaveCount(0);
 await page.reload();await expect(page.locator('section[data-deck-slide]')).toHaveCount(0);await expect(page.getByRole('button',{name:'プレゼンを始める',exact:true})).toBeHidden();
 await page.goto(new URL(page.url()).pathname+'?edit=1');await saved(page);await expect(page.getByText('テーマ：森',{exact:true})).toBeVisible();
 await add(page,'library:editorial-cover-left',true);await expect(page.getByRole('button',{name:'ノートを開く',exact:true})).toBeVisible();
 await expect(frame(page).locator('section[data-studio-active]')).toHaveCSS('--dd-bg','#f5f8f2');
});

test('uncertain empty creation replays the identical request after reload',async({page,context})=>{
 await login(context);await page.goto('/decks/create');let body,url;
 await page.route('**/api/pages/deck-edit/create',async route=>{body=route.request().postDataJSON();const response=await route.fetch();expect(response.status()).toBe(201);url=(await response.json()).url;await route.fulfill({status:503,contentType:'application/json',body:'{}'});});
 await page.getByRole('button',{name:'このテーマで作成',exact:true}).click();await expect(page.getByRole('button',{name:'同じ内容で再試行',exact:true})).toBeVisible();expect(body.firstSlide).toBe(null);
 await page.unroute('**/api/pages/deck-edit/create');await page.reload();await expect(page.getByRole('textbox',{name:'資料名（任意）'})).toBeDisabled();
 const retry=page.waitForRequest('**/api/pages/deck-edit/create');await page.getByRole('button',{name:'同じ内容で再試行',exact:true}).click();expect((await retry).postDataJSON()).toEqual(body);
 await expect(page).toHaveURL(new RegExp(url.split('?')[0]+'(?:\\?edit=1)?$'));await saved(page);await expect(page.locator('.ds-slide')).toHaveCount(0);
});

test('legacy creation drafts still replay their original first slide',async({page,context})=>{
 await login(context);await page.goto('/decks/create');const request={requestId:crypto.randomUUID(),themeId:'paper',title:'以前の控え',firstSlide:{kind:'basic',id:'comparison'}};
 await page.evaluate(request=>sessionStorage.setItem('surprise-deck-create:'+encodeURIComponent('owner@example.com'),JSON.stringify({createdAt:Date.now(),request})),request);await page.reload();
 const sent=page.waitForRequest('**/api/pages/deck-edit/create');await page.getByRole('button',{name:'同じ内容で再試行',exact:true}).click();expect((await sent).postDataJSON()).toEqual(request);await saved(page);await expect(page.locator('.ds-slide')).toHaveCount(1);
});

test('narrow gallery supports keyboard zoom without choosing a first slide or writing',async({page,context},info)=>{
 await login(context);await page.setViewportSize({width:640,height:900});let writes=0;page.on('request',r=>{if(r.url().includes('/api/pages/deck-edit/create'))writes++;});
 await page.goto('/decks/create');const first=await readyCard(page,'basic:title');await first.focus();await page.keyboard.press('ArrowRight');const second=await readyCard(page,'basic:text');await expect(second).toBeFocused();await page.keyboard.press('Enter');
 await expect(page.getByRole('dialog',{name:'見本を拡大'})).toBeVisible();await page.keyboard.press('Escape');await expect(second).toBeFocused();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:info.outputPath('03-narrow.png'),fullPage:true});await page.getByRole('link',{name:'作成に戻る',exact:true}).click();expect(writes).toBe(0);
});

test('preview cache is bounded, reuses rendered cards and follows the last theme',async({page,context},info)=>{
 test.setTimeout(120000);
 await login(context);await page.setViewportSize({width:1280,height:800});await page.goto('/decks/create');
 const root=page.locator('.dp-library');await readyCard(page,'basic:comparison');await expect(root).toHaveAttribute('aria-busy','false',{timeout:20000});
 const before=Number(await root.getAttribute('data-preview-renders'));
 for(let i=0;i<2;i++){await(await readyCard(page,'basic:comparison')).click();await expect(page.locator('.dp-zoom .dp-preview')).toHaveAttribute('data-preview-state','ready');await page.getByRole('dialog',{name:'見本を拡大'}).getByRole('button',{name:'閉じる',exact:true}).click();}
 expect(Number(await root.getAttribute('data-preview-renders'))).toBe(before);
 const times=[];
 for(const theme of ['墨','森','藍','パール','墨','森','藍','パール']){const start=Date.now();await page.getByRole('button',{name:theme,exact:true}).click();await readyCard(page,'basic:comparison');await expect(root).toHaveAttribute('aria-busy','false',{timeout:20000});times.push({theme,ms:Date.now()-start});}
 for(const theme of ['墨','森','藍','墨'])await page.getByRole('button',{name:theme,exact:true}).click();await readyCard(page,'basic:title');await expect(root).toHaveAttribute('aria-busy','false',{timeout:20000});
 const cards=page.locator('.dp-results iframe');for(let i=0;i<await cards.count();i++)await expect(cards.nth(i).contentFrame().locator('section')).toHaveCSS('--dd-bg','#151719');
 await expect(page.locator('iframe[sandbox*="allow-scripts"]')).toHaveCount(1);
 const groups=page.getByRole('combobox',{name:'見本の分類'}).locator('option');
 for(let i=1;i<await groups.count();i++){
  await page.getByRole('combobox',{name:'見本の分類'}).selectOption(await groups.nth(i).getAttribute('value'));
  const choices=await page.locator('.dp-card').evaluateAll(nodes=>nodes.map(n=>n.dataset.choice));
  for(const id of choices){
   const card=await readyCard(page,id);
   const thumbnail=await card.frameLocator('iframe').locator('section[data-deck-slide]').evaluate(node=>node.outerHTML);
   await expect(card.frameLocator('iframe').locator('section')).toHaveCSS('--dd-bg','#151719');
   await card.click();await expect(page.locator('.dp-zoom .dp-preview')).toHaveAttribute('data-preview-state','ready');
   expect(await page.locator('.dp-zoom iframe').contentFrame().locator('section[data-deck-slide]').evaluate(node=>node.outerHTML)).toBe(thumbnail);
   await page.getByRole('dialog',{name:'見本を拡大'}).getByRole('button',{name:'閉じる',exact:true}).click();
   expect(Number(await root.getAttribute('data-preview-cache'))).toBeLessThanOrEqual(24);
  }
 }

 const metrics={times,renders:Number(await root.getAttribute('data-preview-renders')),cache:Number(await root.getAttribute('data-preview-cache')),hits:Number(await root.getAttribute('data-preview-cache-hits'))};await writeFile(info.outputPath('performance.json'),JSON.stringify(metrics,null,2));
});

test('font and renderer failures do not freeze theme switching or other previews',async({page,context})=>{
 test.setTimeout(90000);await login(context);await page.goto('/decks/create');await readyCard(page,'basic:title');
 await page.route('**/vendor/deck-fonts/*',route=>route.abort('failed'));
 await page.getByRole('button',{name:'森',exact:true}).click();await expect(page.locator('.dp-preview[data-preview-state="error"]').first()).toBeVisible({timeout:20000});
 await page.unroute('**/vendor/deck-fonts/*');await page.getByRole('button',{name:'墨',exact:true}).click();await readyCard(page,'basic:title');
 await expect(page.locator('.dp-library')).toHaveAttribute('aria-busy','false',{timeout:20000});
 await page.locator('.dp-renderer').evaluate(iframe=>{iframe.contentDocument.deckRenderer.update=()=>new Promise(()=>{});});
 await page.getByRole('combobox',{name:'見本の分類'}).selectOption({label:'表・比較・行動計画'});
 const error=page.locator('.dp-results [data-preview-state="error"]');await expect(error.first()).toBeVisible({timeout:20000});
 await expect(page.locator('.dp-results [data-preview-state="ready"]').first()).toBeVisible({timeout:20000});
 const key=await error.first().locator('..').getAttribute('data-choice');const retry=page.locator(`[data-choice="${key}"]`);await retry.click();await expect(retry.locator('.dp-preview')).toHaveAttribute('data-preview-state','ready',{timeout:20000});
 await expect(page.getByRole('button',{name:'このテーマで作成',exact:true})).toBeEnabled();
});


test('sample images match between gallery and insertion, remain editable and survive reload',async({page,context},info)=>{
 await login(context);await page.setViewportSize({width:1280,height:800});const imageRequests=[];
 page.on('request',request=>{if(request.resourceType()==='image')imageRequests.push(request.url());});
 await page.goto('/decks/create');
 await page.getByRole('combobox',{name:'見本の分類'}).selectOption({label:'画像・製品紹介'});
 const card=await readyCard(page,'library:image-two');
 const images=card.frameLocator('iframe').locator('[data-deck-sample-image] svg');await expect(images).toHaveCount(2);
 const artwork=await images.evaluateAll(nodes=>nodes.map(n=>n.outerHTML));expect(artwork[0]).not.toBe(artwork[1]);
 await card.click();await expect(page.locator('.dp-zoom .dp-preview')).toHaveAttribute('data-preview-state','ready');
 expect(await page.locator('.dp-zoom iframe').contentFrame().locator('[data-deck-sample-image] svg').evaluateAll(nodes=>nodes.map(n=>n.outerHTML))).toEqual(artwork);
 await page.screenshot({path:info.outputPath('sample-comparison.png'),fullPage:true});
 await page.getByRole('dialog',{name:'見本を拡大'}).getByRole('button',{name:'閉じる',exact:true}).click();
 // Firefox also reports the tab icons declared in <head> as image requests (Chromium and WebKit do not).
 // Exclude exactly those URLs; every other image request is still a failure because the samples are inline SVG.
 const tabIcons=await page.locator('link[rel~="icon"],link[rel="apple-touch-icon"]').evaluateAll(links=>links.map(link=>link.href));
 expect(imageRequests.filter(url=>!tabIcons.includes(url))).toEqual([]);
 await page.getByRole('button',{name:'このテーマで作成',exact:true}).click();await saved(page);
 await page.getByRole('button',{name:'最初のスライドを追加',exact:true}).click();
 await page.getByRole('navigation',{name:'見本の分類'}).getByRole('button',{name:'画像・製品紹介',exact:true}).click();
 const insertion=await readyCard(page,'library:image-two');
 expect(await insertion.frameLocator('iframe').locator('[data-deck-sample-image] svg').evaluateAll(nodes=>nodes.map(n=>n.outerHTML))).toEqual(artwork);
 await insertion.click();await page.getByRole('button',{name:'このスライドを追加',exact:true}).click();await saved(page);
 expect(await frame(page).locator('[data-deck-sample-image] svg').evaluateAll(nodes=>nodes.map(n=>n.outerHTML))).toEqual(artwork);
 await page.screenshot({path:info.outputPath('sample-editor.png'),fullPage:true});
 await page.getByRole('button',{name:'要素一覧',exact:true}).click();
 const items=page.locator('.ds-nav').getByRole('button',{name:'サンプル画像',exact:true});await expect(items).toHaveCount(2);
 await items.first().click();await expect(page.getByRole('button',{name:'画像を差し替え',exact:true})).toBeVisible();
 // Keyboard movement must include the artwork even though it has no editable text.
 await frame(page).locator('[data-deck-sample-image]').first().click();await page.keyboard.press('Tab');await page.keyboard.press('Shift+Tab');
 await expect(page.getByRole('button',{name:'画像を差し替え',exact:true})).toBeVisible();
 // Only file storage is stubbed. The real edit/save endpoint persists the replacement.
 const {default:sharp}=await import('sharp');const bytes=await sharp({create:{width:400,height:300,channels:3,background:'#486b59'}}).png().toBuffer();
 const src='_deck/media-'+crypto.randomUUID()+'.png';
 const uploadMethods=[];
 await page.route('**/api/pages/deck-edit/media/upload?*',async route=>{
  const request=route.request(),method=request.method();uploadMethods.push(method);
  if(method==='POST'){
   expect(request.postDataJSON()).toEqual({size:bytes.length,type:'image/png'});
   return route.fulfill({status:201,json:{upload:'test-image-upload',chunkBytes:2*1024*1024}});
  }
  expect(request.headers()['x-deck-upload']).toBe('test-image-upload');
  if(method==='PUT'){
   // WebKit's interception protocol omits Blob bodies; the declared chunk hash is portable.
   expect(new URL(request.url()).searchParams.get('hash')).toBe(createHash('sha256').update(bytes).digest('hex'));
   expect(request.headers()['content-type']).toBe('application/octet-stream');
   return route.fulfill({status:200,json:{ok:true}});
  }
  expect(method).toBe('PATCH');expect(request.postDataJSON().hashes).toHaveLength(1);
  return route.fulfill({status:201,json:{src,intrinsicWidth:400,intrinsicHeight:300,bytes:bytes.length,originalBytes:bytes.length}});
 });
 await page.route('**/'+src,route=>route.fulfill({status:200,contentType:'image/png',body:bytes}));
 const choosing=page.waitForEvent('filechooser');
 await page.getByRole('button',{name:'画像を差し替え',exact:true}).click();
 const palette=page.getByRole('complementary',{name:'画像パレット'});
 await expect(palette.getByRole('heading',{name:'画像を変更',exact:true})).toBeVisible();
 await palette.getByRole('button',{name:'アップロード',exact:true}).click();
 await (await choosing).setFiles({name:'example.png',mimeType:'image/png',buffer:bytes});
 await expect(frame(page).locator('img')).toHaveCount(1);await saved(page);
 expect(uploadMethods).toEqual(['POST','PUT','PATCH']);
 await expect(frame(page).locator('[data-deck-sample-image]')).toHaveCount(1);
 await page.getByRole('button',{name:'元に戻す',exact:true}).click();await saved(page);
 await expect(frame(page).locator('[data-deck-sample-image]')).toHaveCount(2);
 await page.reload();await expect(page.locator('[data-deck-sample-image]')).toHaveCount(2);
 expect(await page.locator('[data-deck-sample-image] svg').evaluateAll(nodes=>nodes.map(n=>n.outerHTML))).toEqual(artwork);
});

test('creation has one scroll area, keeps the chosen preview in place and shows all standard themes',async({page,context},info)=>{
 await login(context);await page.setViewportSize({width:1280,height:800});await page.goto('/decks/create');await readyCard(page,'basic:title');
 const scroll=page.locator('[data-create-scroll]');
 for(const name of ['白','墨','藍','森','夕映え','オーロラ','パール','ライラック','氷青','薄明','霞','海辺'])await expect(page.getByRole('button',{name,exact:true})).toBeInViewport();
 const areas=await page.evaluate(()=>{
  const all=[];function walk(root){for(const node of root.querySelectorAll('*')){if(node.shadowRoot)walk(node.shadowRoot);if(node instanceof HTMLElement){const style=getComputedStyle(node);if(/auto|scroll/.test(style.overflowY)&&node.scrollHeight>node.clientHeight+1)all.push(node.hasAttribute('data-create-scroll')?'main':node.className);}}}walk(document);return all;
 });expect(areas).toEqual(['main']);expect(await page.evaluate(()=>document.documentElement.scrollHeight<=innerHeight+1&&document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 expect(await page.locator('.dp-results iframe').count()).toBeLessThan(32);
 await page.screenshot({path:info.outputPath('single-scroll-desktop.png'),fullPage:true});
 const target=await readyCard(page,'library:composition-split-right');const before=await scroll.evaluate(node=>node.scrollTop);
 await page.getByRole('button',{name:'墨',exact:true}).click();await expect(target.locator('.dp-preview')).toHaveAttribute('data-preview-state','ready');expect(Math.abs(await scroll.evaluate(node=>node.scrollTop)-before)).toBeLessThan(2);
 await target.click();await expect(page.locator('.dp-zoom .dp-preview')).toHaveAttribute('data-preview-state','ready');await page.keyboard.press('Escape');await expect(target).toBeFocused();
 await expect(page.getByRole('button',{name:'このテーマで作成'})).toBeInViewport();
 await page.setViewportSize({width:640,height:900});await scroll.evaluate(node=>{node.scrollTop=0;});await expect(page.getByRole('button',{name:'このテーマで作成'})).toBeInViewport();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth&&document.documentElement.scrollHeight<=innerHeight+1)).toBe(true);await page.screenshot({path:info.outputPath('single-scroll-narrow.png'),fullPage:true});
});

test('a delayed chart library never produces a ready but empty graph preview',async({page,context})=>{
 await login(context);await page.route('**/vendor/echarts.js/**',async route=>{await new Promise(resolve=>setTimeout(resolve,3000));await route.continue();});
 await page.goto('/decks/create');await page.getByRole('searchbox',{name:'見本を検索'}).fill('グラフ');
 const card=await readyCard(page,'basic:chart');await expect(card.frameLocator('iframe').locator('.dd-chart-canvas svg')).toBeVisible();
 await card.click();await expect(page.locator('.dp-zoom .dp-preview')).toHaveAttribute('data-preview-state','ready');await expect(page.locator('.dp-zoom iframe').contentFrame().locator('.dd-chart-canvas svg')).toBeVisible();
});

test('theme rail changes position outside the size notification',async({page,context})=>{
 await page.addInitScript(()=>{
  window.railResizeWrites=0;
  const Native=window.ResizeObserver;
  window.ResizeObserver=class extends Native {
   constructor(callback){super((entries,observer)=>{
    const rail=document.querySelector('section[aria-label="テーマ"]');
    const before=rail?.getAttribute('style');
    callback(entries,observer);
    if(rail&&before!==rail.getAttribute('style'))window.railResizeWrites++;
   });}
  };
 });
 await login(context);await page.setViewportSize({width:1280,height:900});await page.goto('/decks/create');
 await page.getByRole('group',{name:'テーマの分類'}).getByRole('button',{name:'標準',exact:true}).click();
 const rail=page.locator('section[aria-label="テーマ"]');
 await expect(rail).toHaveCSS('position','sticky');
 await page.locator('[data-create-scroll]').evaluate(area=>{area.style.flex='0 0 auto';area.style.height='120px';});
 await expect(rail).toHaveCSS('position','static');
 expect(await page.evaluate(()=>window.railResizeWrites)).toBe(0);
});

test('theme categories preserve selection and show consistent choices on narrow screens',async({page,context},info)=>{
 await login(context);await page.route('**/api/deck-themes',route=>route.fulfill({json:{themes:[]}}));
 await page.setViewportSize({width:1280,height:900});await page.goto('/decks/create');
 const categories=page.getByRole('group',{name:'テーマの分類'});
 await expect(categories.getByRole('button',{name:'標準',exact:true})).toHaveAttribute('aria-pressed','true');
 await expect(page.getByRole('button',{name:'白',exact:true})).toHaveAttribute('aria-pressed','true');
 const ink=page.getByRole('button',{name:'墨',exact:true});await ink.click();
 await expect(ink.locator('span[aria-hidden="true"]')).toHaveCSS('color','rgb(255, 255, 255)');
 await categories.getByRole('button',{name:'マイテーマ',exact:true}).click();
 await expect(page.getByText('保存したテーマはありません',{exact:true})).toBeVisible();
 await categories.getByRole('button',{name:'標準',exact:true}).click();
 await expect(ink).toHaveAttribute('aria-pressed','true');
 for(const width of [390,320]){
  await page.setViewportSize({width,height:844});
  await expect(ink).toBeInViewport();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:info.outputPath(`theme-categories-${width}.png`),fullPage:true});
 }
});
