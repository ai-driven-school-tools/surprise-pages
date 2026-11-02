/** Interaction continuity and failed preparation against disposable local data. */
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {writeFile,mkdir} from 'node:fs/promises';
const {chromium,webkit}=await import(process.env.PLAYWRIGHT_MODULE??'playwright');
const server=spawn(process.execPath,['scripts/dev/preview-deck-editor.mjs'],{env:{...process.env,PORT:'0',DECK_EDIT_NEW:'1'},stdio:['ignore','pipe','pipe']});
let logs='';server.stderr.on('data',d=>logs+=d);
const url=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error(logs||'Preview timed out')),30000);server.stdout.on('data',d=>{const match=String(d).match(/http:\/\/127\.0\.0\.1:\d+/);if(match){clearTimeout(timer);resolve(match[0]);}});server.on('exit',()=>{clearTimeout(timer);reject(Error(logs));});});
const engine=process.env.DECK_BROWSER??'chromium',browser=await(engine==='webkit'?webkit:chromium).launch({headless:true}),page=await browser.newPage({viewport:{width:1440,height:900}}),results=[],errors=[];
page.on('pageerror',e=>errors.push(e.message));
const output=process.env.DECK_QA_OUTPUT??`/tmp/deck-continuity-${engine}`;await mkdir(output,{recursive:true});
const root=()=>page.locator('.deck-studio');
const ready=()=>page.waitForFunction(()=>document.querySelector('surprise-comments')?.shadowRoot?.querySelector('iframe.edit-frame')?.contentDocument?.querySelector('section[data-studio-active]'));
const caretAtEnd=heading=>heading.evaluate(node=>{const range=node.ownerDocument.createRange();range.selectNodeContents(node);range.collapse(false);const selection=node.ownerDocument.getSelection();selection.removeAllRanges();selection.addRange(range);});
const saved=()=>page.locator('.deck-edit-status').filter({hasText:'保存済み'}).waitFor({timeout:45000});
async function test(name,action){await action();results.push({name,pass:true});console.log('OK '+name);}
try {
  await page.goto(url+'/?edit=1');await ready();
  await test('入力中でも取り消しが即座に反映され、そのまま入力を続けられる',async()=>{
    const heading=page.frameLocator('iframe.edit-frame').locator('section[data-studio-active] h1'),before=await heading.textContent();
    await heading.dblclick();await caretAtEnd(heading);await page.keyboard.insertText(' 取り消す');await page.keyboard.press('Control+z');
    await page.waitForFunction(text=>document.querySelector('surprise-comments').shadowRoot.querySelector('iframe.edit-frame').contentDocument.querySelector('h1').textContent===text,before);
    await page.keyboard.insertText(' 続き');await page.keyboard.press('Escape');await saved();
    assert.equal(await heading.textContent(),before+' 続き');await page.locator('.ds-slide').first().click();
  });
  await test('連続配色でも本文・縮小表示・設定入力を保ち、最後の指定を表示する',async()=>{
    await page.getByRole('button',{name:'デザイン',exact:true}).first().click();
    await page.getByText('細かく調整',{exact:true}).click();
    const result=await root().evaluate(async screen=>{
      const frame=screen.querySelector('iframe.edit-frame'),doc=frame.contentDocument,row=screen.querySelector('.ds-slide'),field=screen.querySelector('input[type=color]');field.focus();
      let blanks=0;const sample=()=>{if(!frame.contentDocument.querySelector('section[data-studio-active]'))blanks++;};
      for(const color of ['#eeeeee','#dddddd','#ffffff']){field.value=color;field.dispatchEvent(new Event('change',{bubbles:true}));await new Promise(r=>requestAnimationFrame(()=>{sample();r();}));}
      await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
      return {sameDocument:frame.contentDocument===doc,sameRow:screen.querySelector('.ds-slide')===row,sameField:screen.querySelector('input[type=color]')===field,focused:field.getRootNode().activeElement===field,open:screen.querySelector('details').open,color:doc.defaultView.getComputedStyle(doc.querySelector('section[data-studio-active]')).getPropertyValue('--dd-bg').trim(),blanks};
    });
    assert.deepEqual(result,{sameDocument:true,sameRow:true,sameField:true,focused:true,open:true,color:'#ffffff',blanks:0});await saved();
  });
  await test('書体が失敗しても前の表示を保持し、別の配色へ復帰できる',async()=>{
    await page.evaluate(()=>{const root=document.querySelector('surprise-comments').shadowRoot;window.__oldDeck=root.querySelector('iframe.edit-frame').contentDocument;window.__oldColor=window.__oldDeck.defaultView.getComputedStyle(window.__oldDeck.querySelector('section[data-studio-active]')).getPropertyValue('--dd-bg');});
    await page.route('**/vendor/deck-fonts/**',route=>route.abort());
    await page.locator('.ds-preset').filter({hasText:'森'}).click();
    await page.locator('.edit-alert').filter({hasText:/書体/}).waitFor();
    assert.ok(await page.evaluate(()=>{const d=document.querySelector('surprise-comments').shadowRoot.querySelector('iframe.edit-frame').contentDocument;return d===window.__oldDeck&&d.defaultView.getComputedStyle(d.querySelector('section[data-studio-active]')).getPropertyValue('--dd-bg')===window.__oldColor;}));
    await page.locator('.ds-preset').first().click();await saved();await page.unroute('**/vendor/deck-fonts/**');
    assert.equal(await page.locator('.edit-alert:visible').count(),0);
  });
  await test('描画待ちの途中に入力しても、古い内容や編集対象へ戻らない',async()=>{
    await page.evaluate(()=>{
      const root=document.querySelector('surprise-comments').shadowRoot,doc=root.querySelector('iframe.edit-frame').contentDocument;
      const update=doc.deckRenderer.update;let first=true;
      doc.deckRenderer.update=change=>{const finished=update(change);if(!first)return finished;first=false;return finished.then(()=>new Promise(resolve=>{window.__finishPaint=resolve;}));};
      const field=root.querySelector('input[type=color]');field.value='#dddddd';field.dispatchEvent(new Event('change',{bubbles:true}));
    });
    await page.waitForFunction(()=>typeof window.__finishPaint==='function');
    const heading=page.frameLocator('iframe.edit-frame').locator('section[data-studio-active] h1');
    await heading.dblclick();await caretAtEnd(heading);await page.keyboard.insertText(' 描画中の入力');
    await page.evaluate(()=>window.__finishPaint());await page.keyboard.press('Escape');await saved();
    assert.match(await heading.textContent(),/描画中の入力/);
    await heading.dblclick();await caretAtEnd(heading);await page.keyboard.insertText(' 次の入力');await page.keyboard.press('Escape');await saved();
    assert.match(await heading.textContent(),/描画中の入力 次の入力/);
    await page.getByRole('button',{name:'デザイン',exact:true}).first().click();
  });
  await test('遅れて届いた書体が新しい指定を上書きしない',async()=>{
    await page.route('**/vendor/deck-fonts/**',async route=>{await new Promise(r=>setTimeout(r,600));await route.continue();});
    await page.locator('.ds-preset').filter({hasText:'森'}).click();await page.locator('.ds-preset').first().click();
    await saved();
    await page.waitForLoadState('networkidle');
    assert.equal(await page.locator('iframe.edit-frame').evaluate(f=>f.contentDocument.querySelector('section[data-studio-active]').getAttribute('data-deck-typography')),'modern');
    await page.unroute('**/vendor/deck-fonts/**');
  });
  await test('途中の描画が失敗しても再試行で完成した表示へ復帰する',async()=>{
    await page.evaluate(()=>{const root=document.querySelector('surprise-comments').shadowRoot;window.__oldDeck=root.querySelector('iframe.edit-frame').contentDocument;window.__oldDeck.deckRenderer.update=()=>Promise.reject(Error('描画の試験用失敗'));const field=root.querySelector('input[type=color]');field.value='#eeeeee';field.dispatchEvent(new Event('change',{bubbles:true}));});
    await page.locator('.edit-alert').filter({hasText:'描画の試験用失敗'}).waitFor();
    await page.getByRole('button',{name:'再試行',exact:true}).click();
    await page.waitForFunction(()=>document.querySelector('surprise-comments').shadowRoot.querySelector('iframe.edit-frame').contentDocument!==window.__oldDeck);
    await ready();await saved();
    assert.equal(await page.locator('.edit-alert:visible').count(),0);
    assert.equal(await page.locator('iframe.edit-frame').evaluate(f=>f.contentDocument.defaultView.getComputedStyle(f.contentDocument.querySelector('section[data-studio-active]')).getPropertyValue('--dd-bg').trim()),'#eeeeee');
  });
  await test('構成を読み直す間も前の資料が見え、準備後だけ入れ替わる',async()=>{
    const data=await(await page.request.get(url+'/api/pages/deck-edit?page=internal/example/design&sessionId='+crypto.randomUUID())).json();
    const add=html=>html.replace('</head>','<link rel="stylesheet" href="/slow-deck-style.css"></head>');
    const remote={...data,html:add(data.html),previewHtml:add(data.previewHtml),versionId:crypto.randomUUID(),versionNumber:data.versionNumber+1};
    await page.route('**/slow-deck-style.css',async route=>{await new Promise(r=>setTimeout(r,800));await route.fulfill({contentType:'text/css',body:'.unused {color:inherit}'});});
    await page.route('**/api/pages/deck-edit?*',route=>route.request().method()==='GET'?route.fulfill({json:remote}):route.continue());
    await page.evaluate(()=>window.__oldDeck=document.querySelector('surprise-comments').shadowRoot.querySelector('iframe.edit-frame').contentDocument);
    await page.locator('.deck-preparing-frame').waitFor({state:'attached'});
    assert.ok(await page.locator('iframe.edit-frame').evaluate(f=>f.contentDocument===window.__oldDeck&&f.getBoundingClientRect().width>0));
    await page.waitForFunction(()=>document.querySelector('surprise-comments').shadowRoot.querySelector('iframe.edit-frame').contentDocument!==window.__oldDeck);
    await ready();assert.equal(await page.locator('.deck-preparing-frame').count(),0);
    await page.unroute('**/api/pages/deck-edit?*');
  });
  await test('入力中に届いた別の段落の変更も、入力終了後に中央へ反映する',async()=>{
    // A fresh session keeps the previous synthetic remote revision out of this scenario.
    await page.goto(url+'/?edit=1');await ready();await page.locator('.ds-slide').first().click();
    const data=await(await page.request.get(url+'/api/pages/deck-edit?page=internal/example/design&sessionId='+crypto.randomUUID())).json();
    const after=html=>html.replace('現状を共有し、次の行動を決める。','共同編集で届いた文章');
    const remote={...data,html:after(data.html),previewHtml:after(data.previewHtml),versionId:crypto.randomUUID(),versionNumber:data.versionNumber+1};
    const heading=page.frameLocator('iframe.edit-frame').locator('section[data-studio-active] h1');await heading.dblclick();await caretAtEnd(heading);
    let delivered=false;
    await page.route('**/api/pages/deck-edit?*',async route=>{if(route.request().method()==='GET'){await route.fulfill({json:remote});delivered=true;}else await route.continue();});
    while(!delivered)await new Promise(r=>setTimeout(r,100));
    await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
    await page.route('**/api/pages/deck-edit',route=>route.request().method()==='PATCH'?route.abort():route.continue());
    await page.keyboard.insertText(' 自分の入力');await page.keyboard.press('Escape');
    await page.frameLocator('iframe.edit-frame').getByText('共同編集で届いた文章',{exact:true}).waitFor();
    assert.match(await heading.textContent(),/自分の入力/);
  });
  assert.deepEqual(errors,[]);await page.screenshot({path:output+'/editor.png'});
} catch(error){await page.screenshot({path:output+'/failure.png'});throw error;}
finally{await writeFile(output+'/results.json',JSON.stringify({engine,results,errors},null,2));await browser.close();server.kill();}
