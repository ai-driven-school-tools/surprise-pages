import {trackReadingLayoutObservers} from './reading-layout-observers.mjs';
import {test,expect} from 'playwright/test';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
async function login(context,role='owner'){const v=JSON.parse(await readFile(path.join(process.env.PAGES_TEST_RUNTIME??'.test-runtime','session.json'),'utf8'));await context.addCookies([{name:'authjs.session-token',value:v.sessions[role],url:v.origin,httpOnly:true,sameSite:'Lax'}]);}
async function design(page){const button=page.getByRole('button',{name:'デザイン',exact:true});if(await button.getAttribute('aria-pressed')!=='true')await button.click();}
const saved=page=>expect(page.locator('.deck-edit-status')).toHaveAttribute('data-state','saved');
const edit=page=>page.frameLocator('iframe.edit-frame');
// Follow the visible exit flow before changing documents, so pending WebKit
// polling is disposed before navigation tears down the browsing context.
async function leaveEditor(page,reloads=true,press=done=>done.click()){
 // Wait for the expected reader response, not global network silence: detached
 // iframe requests and polling must not turn this persistence check into a wait.
 const endpoint=reloads?'/api/comments/outcomes':'/api/comments';
 const loaded=page.waitForResponse(response=>new URL(response.url()).pathname===endpoint&&response.request().method()==='GET',{timeout:10000});
 const navigated=reloads?page.waitForEvent('domcontentloaded'):Promise.resolve();
 await press(page.getByRole('button',{name:'完了',exact:true}));
 const response=await loaded;expect(response.status()).toBe(200);expect(await response.finished()).toBeNull();
 await navigated;await expect(page.locator('iframe.edit-frame')).toHaveCount(0);
}
// The editor redraws its toolbar after every poll (about once a second). Hold 完了 down across one redraw:
// WebKit drops a click whose pressed text is replaced before release, so this is how a Safari user loses it.
const redrawn=page=>page.locator('.deck-edit-status').evaluate(status=>new Promise(resolve=>new MutationObserver(()=>resolve()).observe(status,{childList:true})));
async function pressAcrossRedraw(done){
 const box=await done.boundingBox();const page=done.page();
 await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await redrawn(page);await page.mouse.up();
}
const logo=Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="200" height="80"><rect width="200" height="80" rx="10" fill="#245b49"/><path d="M20 20H50V60H20Z" fill="white"/><text x="65" y="52" fill="white" font-size="28">ASTER</text></svg>');
async function add(page,id,first=false){await page.getByRole('button',{name:first?'最初のスライドを追加':'スライドを追加',exact:true}).click();const card=page.locator(`[data-choice="${id}"]`);await card.scrollIntoViewIfNeeded();await expect(card.locator('.dp-preview')).toHaveAttribute('data-preview-state','ready');await card.click();await page.getByRole('button',{name:'このスライドを追加',exact:true}).click();await saved(page);}

test('save a personal logo theme from zero slides, reuse and keep documents independent',async({page,context},info)=>{
 test.setTimeout(120000);let readerRequests=0;page.on('request',request=>{if(new URL(request.url()).pathname.startsWith('/api/comments'))readerRequests++;});await trackReadingLayoutObservers(page);await login(context);await page.setViewportSize({width:1280,height:800});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/decks/create');await page.getByRole('button',{name:'森',exact:true}).click();await page.getByRole('button',{name:'このテーマで作成',exact:true}).click();await saved(page);
 await design(page);await page.getByRole('button',{name:'ロゴ',exact:true}).click();
 await expect(page.getByRole('option',{name:'この1枚',exact:true})).toHaveCount(0);
 // Hold the logo in transit: until it arrives the editor must not report the document as saved, even after
 // the toolbar is redrawn by the next poll (the old status said 保存済み here, and saving the theme was refused).
 let release;const arrived=new Promise(resolve=>{release=resolve;});
 const logoUpload=url=>url.pathname==='/api/pages/logo';await page.route(logoUpload,async route=>{await arrived;await route.continue();});
 const choosing=page.waitForEvent('filechooser');await page.getByRole('button',{name:'ロゴを選ぶ',exact:true}).click();await(await choosing).setFiles({name:'brand.svg',mimeType:'image/svg+xml',buffer:logo});
 await redrawn(page);expect(await page.locator('.deck-edit-status').getAttribute('data-state')).toBe('working');
 release();await saved(page);await page.unroute(logoUpload);
 await page.getByRole('button',{name:'マイテーマとして保存',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'マイテーマとして保存',exact:true});await expect(dialog.locator('[data-preview-state]')).toHaveAttribute('data-preview-state','ready');
 const logoPreview=dialog.frameLocator('iframe[sandbox="allow-same-origin"]').locator('[data-deck-logo-view] img');await expect(logoPreview).toBeVisible();expect(await logoPreview.evaluate(img=>img.naturalWidth)).toBe(200);
 const name='会社テーマ-'+info.project.name;await dialog.getByRole('textbox',{name:'テーマ名',exact:true}).fill(name);await page.screenshot({path:info.outputPath('01-save-theme.png'),fullPage:true});
 await dialog.getByRole('button',{name:'保存する',exact:true}).click();await expect(dialog).toHaveCount(0);
 await leaveEditor(page);await page.goto('/decks/create');await page.getByRole('group',{name:'テーマの分類'}).getByRole('button',{name:'マイテーマ',exact:true}).click();await page.getByRole('button',{name,exact:true}).click();
 const card=page.locator('[data-choice="basic:title"]');await expect(card.locator('.dp-preview')).toHaveAttribute('data-preview-state','ready');await expect(card.frameLocator('iframe').locator('[data-deck-logo-view] img')).toBeVisible();
 await page.screenshot({path:info.outputPath('02-theme-gallery.png'),fullPage:true});
 await page.getByRole('button',{name:'このテーマで作成',exact:true}).click();await saved(page);await expect(page.getByText('テーマ：'+name,{exact:true})).toBeVisible();
 await add(page,'basic:title',true);await expect(edit(page).locator('[data-deck-logo-view] img')).toBeVisible();
 const beforePresent=readerRequests;
 const created=page.url();const existingLogo=await edit(page).locator('[data-deck-logo-view] img').getAttribute('src');
 await page.getByRole('button',{name:'発表',exact:true}).click();await expect(edit(page).locator('[data-deck-logo-view] img')).toBeVisible();expect(await edit(page).locator('body').evaluate(()=>window.readingLayoutObserverCount())).toBeGreaterThan(0);await edit(page).getByRole('button',{name:'プレゼンを終える',exact:true}).click();expect(await edit(page).locator('body').evaluate(()=>window.readingLayoutObserverCount())).toBe(0);expect(readerRequests,'editor focus changes do not reload background comments').toBe(beforePresent);
 await leaveEditor(page);await page.goto('/decks/create');await page.getByRole('group',{name:'テーマの分類'}).getByRole('button',{name:'マイテーマ',exact:true}).click();await page.getByRole('button',{name,exact:true}).click();await page.getByRole('button',{name:name+'を管理',exact:true}).click();const manage=page.getByRole('dialog',{name:'マイテーマの管理'});await manage.getByRole('button',{name:'削除',exact:true}).click();await manage.getByRole('button',{name:'テーマを削除',exact:true}).click();await expect(manage).toHaveCount(0);
 await expect(page.getByRole('button',{name:name+'を管理',exact:true})).toHaveCount(0);
 await page.goto(new URL(created).pathname+'?edit=1');await saved(page);await expect(edit(page).locator('[data-deck-logo-view] img')).toHaveAttribute('src',existingLogo);expect(await edit(page).locator('[data-deck-logo-view] img').evaluate(img=>img.naturalWidth)).toBe(200);
 const beforeClose=readerRequests;await leaveEditor(page,false,pressAcrossRedraw);expect(readerRequests,'reader refresh resumes after an unchanged close').toBeGreaterThan(beforeClose);
 expect(errors).toEqual([]);
});

test('theme without logo applies once and undo restores the existing logo',async({page,context},info)=>{
 await login(context);await page.goto('/decks/create');await page.getByRole('button',{name:'墨',exact:true}).click();await page.getByRole('button',{name:'このテーマで作成',exact:true}).click();await saved(page);
 await design(page);await page.getByRole('button',{name:'マイテーマとして保存',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'マイテーマとして保存'});await dialog.getByRole('textbox',{name:'テーマ名',exact:true}).fill('ロゴなし-'+info.project.name);await dialog.getByRole('button',{name:'保存する',exact:true}).click();await expect(dialog).toHaveCount(0);
 await page.getByRole('button',{name:'ロゴ',exact:true}).click();const choosing=page.waitForEvent('filechooser');await page.getByRole('button',{name:'ロゴを選ぶ',exact:true}).click();await(await choosing).setFiles({name:'brand.svg',mimeType:'image/svg+xml',buffer:logo});await saved(page);await add(page,'basic:title',true);
 await design(page);await page.getByRole('button',{name:'マイテーマを使う',exact:true}).click();const apply=page.getByRole('dialog',{name:'マイテーマを使う'});await expect(apply.getByText(/現在のロゴも外します/)).toBeVisible();await apply.getByRole('button',{name:'このテーマを適用',exact:true}).click();await expect(apply).toHaveCount(0);await saved(page);await expect(edit(page).locator('[data-deck-logo-view]')).toHaveCount(0);
 await page.getByRole('button',{name:'元に戻す',exact:true}).click();await saved(page);await expect(edit(page).locator('[data-deck-logo-view] img')).toBeVisible();
});

test('uncertain save and rename replay the same request, and another account sees no themes',async({page,context,browser},info)=>{
 await login(context);await page.goto('/decks/create');await page.getByRole('button',{name:'このテーマで作成',exact:true}).click();await saved(page);await design(page);
 await page.getByText('細かく調整',{exact:true}).click();await page.getByRole('combobox',{name:'書体',exact:true}).selectOption('editorial');await saved(page);
 await page.getByRole('button',{name:'マイテーマとして保存',exact:true}).click();const dialog=page.getByRole('dialog',{name:'マイテーマとして保存'});
 const name='再試行-'+crypto.randomUUID();await dialog.getByRole('textbox',{name:'テーマ名',exact:true}).fill(name);
 let original,rename;
 await page.route('**/api/deck-themes',async route=>{
  if(route.request().method()!=='POST')return route.continue();
  const body=route.request().postDataJSON();
  if(body.action==='save'&&!original){original=body;const response=await route.fetch();expect(response.status()).toBe(201);return route.fulfill({status:503,contentType:'application/json',body:'{"error":"確認できませんでした"}'});}
  if(body.action==='rename'&&!rename){rename=body;const response=await route.fetch();expect(response.status()).toBe(200);return route.fulfill({status:503,contentType:'application/json',body:'{"error":"確認できませんでした"}'});}
  if(body.action==='save')expect(body).toEqual(original);if(body.action==='rename')expect(body).toEqual(rename);return route.continue();
 });
 await dialog.getByRole('button',{name:'保存する',exact:true}).click();await expect(dialog.getByRole('button',{name:'同じ操作を再試行',exact:true})).toBeVisible();await expect(dialog.getByRole('textbox',{name:'テーマ名'})).toBeDisabled();await dialog.getByRole('button',{name:'同じ操作を再試行',exact:true}).click();await expect(dialog).toHaveCount(0);
 await page.goto('/decks/create');await page.setViewportSize({width:640,height:900});await page.getByRole('group',{name:'テーマの分類'}).getByRole('button',{name:'マイテーマ',exact:true}).click();await page.getByRole('button',{name,exact:true}).click();await page.getByRole('button',{name:name+'を管理',exact:true}).click();const manage=page.getByRole('dialog',{name:'マイテーマの管理'});
 await manage.getByRole('textbox',{name:'テーマ名'}).fill(name+'-改');await manage.getByRole('button',{name:'名前を変更',exact:true}).click();await expect(manage.getByRole('button',{name:'同じ操作を再試行'})).toBeVisible();await expect(manage.getByRole('button',{name:'削除',exact:true})).toHaveCount(0);
 await manage.getByRole('button',{name:'同じ操作を再試行'}).click();await expect(manage).toHaveCount(0);await expect(page.getByRole('button',{name:name+'-改を管理',exact:true})).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:info.outputPath('03-narrow-themes.png'),fullPage:true});
 const themes=(await(await page.request.get('/api/deck-themes')).json()).themes;const found=themes.filter(theme=>theme.name===name+'-改');expect(found).toHaveLength(1);expect(found[0].snapshot.appearance.typography).toBe('editorial');
 const separate=await browser.newContext({baseURL:new URL(page.url()).origin});try{await login(separate,'reader');expect((await separate.request.get('/api/deck-themes')).ok()).toBe(false);}finally{await separate.close();}
});
