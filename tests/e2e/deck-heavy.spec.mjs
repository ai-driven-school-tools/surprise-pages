import {test,expect} from 'playwright/test';
import {readFile} from 'node:fs/promises';
import path from 'node:path';

test('large deck uses the actual edit button, cancels delayed opening and saves after reopening',async({page,context},info)=>{
  const session=JSON.parse(await readFile(path.join(process.env.PAGES_TEST_RUNTIME??'.test-runtime','session.json'),'utf8'));
  await context.addCookies([{name:'authjs.session-token',value:session.sessions.owner,url:session.origin,httpOnly:true,sameSite:'Lax'}]);
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/internal/performance/large-deck');
  let opened=0,legacyReads=0,release,cancelledSession=null,presence=null;
  const gate=new Promise(resolve=>{release=resolve;});
  page.on('request',r=>{if(r.method()==='GET'&&new URL(r.url()).pathname==='/api/pages/edit')legacyReads++;});
  page.on('response',response=>{
    if(response.request().method()!=='GET'||new URL(response.url()).pathname!=='/api/pages/deck-edit')return;
    void response.json().then(value=>{if(Array.isArray(value?.presence))presence=value.presence.map(item=>item.sessionId);}).catch(()=>{});
  });
  await page.route('**/api/pages/deck-edit',async route=>{
    if(route.request().method()==='POST'&&route.request().postDataJSON()?.action==='open'){opened++;cancelledSession=route.request().postDataJSON().sessionId;await gate;}
    await route.continue().catch(()=>{});
  });
  await page.getByRole('button',{name:'このページを直す',exact:true}).evaluate(n=>{n.click();n.click();});
  await expect(page.getByRole('button',{name:'閲覧に戻る',exact:true})).toBeVisible();
  await expect.poll(()=>opened).toBe(1);
  await page.getByRole('button',{name:'閲覧に戻る',exact:true}).click();release();
  await expect(page.locator('[data-editor-opening]')).toHaveCount(0);
  await expect(page.getByRole('button',{name:'このページを直す',exact:true})).toBeFocused();
  await page.unroute('**/api/pages/deck-edit');
  const opening=Date.now();
  await page.getByRole('button',{name:'このページを直す',exact:true}).click();
  const frame=page.frameLocator('iframe.edit-frame');
  // Playwright 1.63 の expect は、対象がまだ無い間の問い合わせのたびに文書全体（300 枚）の読み上げ用の写しを作り、
  // その重さで開く処理そのものを遅らせる（遅い台では上限を超える）。待つ条件と上限はそのまま、写しを作らない待ち方にする。
  await frame.locator('section[data-studio-active]').waitFor({state:'visible',timeout:15000});
  // 上限との余裕を実行記録（ジョブのログ）に残す。上限そのものは変えない。
  console.log(`editor-open-ms ${info.project.name} ${Date.now()-opening}`);
  // 取り消した開きかけの参加が残らない。残ると自分しかいないのに「2 人が編集中」が出続ける。
  // 同じ人の別の回の参加と見分けるため、人数ではなく取り消した回の目印で見る。
  await expect.poll(()=>presence!==null&&!presence.includes(cancelledSession),{timeout:10000}).toBe(true);
  expect(legacyReads).toBe(0);expect(opened).toBe(1);
  const heading=frame.locator('section[data-studio-active] h1'),marker=` 保存検査${info.project.name}`;
  await heading.dblclick();await page.keyboard.press('End');await page.keyboard.insertText(marker);await page.keyboard.press('Escape');
  await page.locator('.deck-edit-status[data-state=saved]').waitFor({state:'visible',timeout:15000});
  let leaving=false,readsAfterLeave=0;
  page.on('request',request=>{if(leaving&&request.method()==='GET'&&new URL(request.url()).pathname==='/api/pages/deck-edit')readsAfterLeave++;});
  // Hold the old document alive after beforeunload, as a slow navigation does.
  // The reader must not restart a poll that WebKit will abort on replacement.
  await page.evaluate(()=>window.dispatchEvent(new Event('beforeunload',{cancelable:true})));
  leaving=true;
  await page.waitForTimeout(1300);
  expect(readsAfterLeave).toBe(0);
  // A different editor can cancel leaving. The current editing session resumes.
  await page.evaluate(()=>{
    window.addEventListener('beforeunload',event=>event.preventDefault(),{once:true});
  });
  const confirmation=page.waitForEvent('dialog');
  await page.evaluate(()=>{setTimeout(()=>location.reload(),0);});
  const dialog=await confirmation;expect(dialog.type()).toBe('beforeunload');await dialog.dismiss();
  await expect.poll(()=>readsAfterLeave,{timeout:10000}).toBeGreaterThan(0);
  leaving=false;
  await page.reload();await expect(page.locator('h1').first()).toContainText(marker);
  expect(errors).toEqual([]);
});
