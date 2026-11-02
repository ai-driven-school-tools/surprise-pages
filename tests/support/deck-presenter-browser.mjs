import assert from 'node:assert/strict';
import {chromium,webkit} from 'playwright';
import {startDeckTestServer} from './deck-test-server.mjs';
import {root} from '../checks/paths.mjs';

const server=await startDeckTestServer(`${root}/tests/checks/fixtures/internal/example/deck-design-presentation.html`);
try {
  for (const [name,engine] of [['chromium',chromium],['webkit',webkit]]) {
    if(process.env.PAGES_TEST_BROWSER && process.env.PAGES_TEST_BROWSER!==name)continue;
    const executablePath=name==='webkit'?process.env.PAGES_TEST_WEBKIT_EXECUTABLE:process.env.PAGES_TEST_CHROMIUM_EXECUTABLE;
    const browser=await engine.launch(executablePath?{executablePath}:{}),context=await browser.newContext({viewport:{width:1280,height:600}}),peerContext=await browser.newContext();
    const page=await context.newPage(),peer=await peerContext.newPage(),errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    const ui=page.locator('surprise-comments'),other=peer.locator('surprise-comments');
    const waitFor=async(test,message)=>{const end=Date.now()+15000;while(!await test()){if(Date.now()>end)throw Error(message);await new Promise(r=>setTimeout(r,100));}};
    try {
      await page.goto(server.url+'?edit=1');
      await ui.getByRole('button',{name:'発表者画面',exact:true}).click({timeout:20000});
      await ui.locator('.dp-screen[data-ready=true]').waitFor();
      // A deck with notes opens notes-first. The note size is remembered on this device only.
      assert.equal(await ui.locator('.dp-screen').getAttribute('data-layout'),'notes');
      const noteSize=()=>ui.getByRole('textbox',{name:'発表者ノート',exact:true}).evaluate(node=>parseFloat(getComputedStyle(node).fontSize));
      assert.equal(await noteSize(),24);
      await ui.getByRole('button',{name:'ノートの字を大きく',exact:true}).click();
      assert.equal(await noteSize(),28);
      await ui.getByRole('button',{name:'編集へ戻る',exact:true}).click();
      await ui.getByRole('button',{name:'発表者画面',exact:true}).click();
      await ui.locator('.dp-screen[data-ready=true]').waitFor();
      assert.equal(await noteSize(),28,`${name}: note size not remembered`);
      await ui.getByRole('button',{name:'ノートの字を小さく',exact:true}).click();
      assert.equal(await noteSize(),24);
      await ui.getByRole('spinbutton',{name:'持ち時間（分）'}).fill('5');
      // Before starting, the presenter may browse to choose where to begin; nothing reaches an audience yet.
      await ui.getByRole('button',{name:'次へ',exact:true}).click();
      await waitFor(()=>ui.locator('.dp-position').innerText().then(text=>text.startsWith('2 /')),'could not browse before starting');
      await ui.getByRole('button',{name:'前へ',exact:true}).click();
      await waitFor(()=>ui.locator('.dp-position').innerText().then(text=>text.startsWith('1 /')),'could not browse back before starting');
      await ui.locator('.dp-screen[data-ready=true]').waitFor();
      // Previews are sized to the slide: no desk-coloured band may remain beside the paper.
      const fit=await ui.locator('iframe[title="現在のスライド"]').evaluate(frame=>{const paper=frame.contentDocument.querySelector('[data-deck-current] [data-deck-stage]').getBoundingClientRect();return {frame:frame.clientWidth,paper:paper.width,left:paper.left};});
      assert.ok(Math.abs(fit.frame-fit.paper)<=1&&Math.abs(fit.left)<=1,`${name}: preview letterboxed ${JSON.stringify(fit)}`);
      const [audience]=await Promise.all([page.waitForEvent('popup'),ui.getByRole('button',{name:'観客用を開く',exact:true}).click()]);
      await ui.getByRole('button',{name:'発表を開始',exact:true}).click();
      await audience.frameLocator('iframe:not([data-back])').locator('html[data-deck-mode=present]').waitFor();
      await waitFor(()=>ui.locator('.dp-clock').innerText().then(value=>value.includes('残り')),'timer did not start');
      // Escape also leaves browser fullscreen. It must never end a running presentation.
      await audience.frameLocator('iframe:not([data-back])').locator('body').press('Escape');
      await ui.getByRole('button',{name:'発表を終える',exact:true}).press('Escape');
      assert.equal(await ui.locator('.dp-screen').count(),1,`${name}: Escape ended the presentation`);
      assert.equal(await audience.locator('iframe:not([data-back])').evaluate(frame=>frame.contentDocument.querySelector('[data-deck-current]')!==null),true);
      await ui.getByRole('button',{name:'計時を止める',exact:true}).click();
      const pausedTime=await ui.locator('.dp-clock').innerText();
      await new Promise(resolve=>setTimeout(resolve,1100));
      assert.equal(await ui.locator('.dp-clock').innerText(),pausedTime);
      await ui.getByRole('button',{name:'計時を再開',exact:true}).click();
      const notes=ui.getByRole('textbox',{name:'発表者ノート',exact:true});
      // While presenting, notes are read, large, and arrow keys still move the slides.
      const reading=ui.getByRole('document',{name:'発表者ノート（読む表示）',exact:true});
      await reading.waitFor();
      assert.ok(await notes.isHidden());
      assert.ok(await reading.evaluate(node=>parseFloat(getComputedStyle(node).fontSize))>=20);
      await reading.press('ArrowRight');
      await waitFor(()=>ui.locator('.dp-position').innerText().then(text=>text.startsWith('2 /')),'reading view did not forward arrows');
      await reading.press('ArrowLeft');
      await waitFor(()=>ui.locator('.dp-position').innerText().then(text=>text.startsWith('1 /')),'reading view did not return');
      await ui.locator('.dp-screen[data-ready=true]').waitFor();
      // Clicking the text opens it for editing; Escape returns to reading without ending the talk.
      await reading.click();
      assert.ok(await notes.evaluate(node=>node.getRootNode().activeElement===node),`${name}: clicking the notes did not open the editor`);
      await notes.press('Escape');
      await reading.waitFor();
      const edit=async()=>{if(await notes.isHidden())await ui.getByRole('button',{name:'ノートを編集',exact:true}).click();};
      const marker=`発表ノート保存検査-${name}`;
      await edit();
      await notes.fill(marker);
      await waitFor(()=>ui.locator('.dp-notes').innerText().then(text=>text.includes('保存済み')),'notes not saved');
      assert.ok(!(await audience.frameLocator('iframe:not([data-back])').locator('body').innerText()).includes(marker));
      assert.equal(await audience.frameLocator('iframe:not([data-back])').locator('aside[data-deck-notes]').count(),0);
      await peer.goto(server.url+'?who=second&edit=1');
      await other.getByRole('button',{name:'ノートを開く',exact:true}).click({timeout:20000});
      const peerNotes=other.getByLabel('発表者ノート — 公開・印刷には含まれません',{exact:true});
      await waitFor(()=>peerNotes.inputValue().then(value=>value===marker),'saved notes not received by peer');
      await peerNotes.fill(marker+' / 別の人から追記');await other.locator('.edit-title').click();await peer.keyboard.press('Escape');
      await waitFor(()=>notes.inputValue().then(value=>value.includes('別の人から追記')),'remote notes not received');
      await peerNotes.fill(marker+' / 別の人からもう一度追記');await other.locator('.edit-title').click();await peer.keyboard.press('Escape');
      await waitFor(()=>notes.inputValue().then(value=>value.includes('もう一度追記')),'sequential note edit used a stale base');
      // Hold a real composition while another participant saves the same note.
      // The stale draft must require an explicit choice, never overwrite silently.
      for(const choice of ['自分の入力で上書き','最新のノートを使う']) {
        const sharedBase=await notes.inputValue();
        await waitFor(()=>peerNotes.inputValue().then(value=>value===sharedBase),'peer did not receive the common base');
        await waitFor(()=>other.locator('.deck-edit-status').getAttribute('data-state').then(state=>state==='saved'),'peer base is not saved');
        await notes.evaluate(node=>node.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true})));
        const own=`未確定の入力-${name}-${choice}`,remote=`別の担当者の入力-${name}-${choice}`;
        await notes.fill(own);
        // Wait for the exact revision the server gave the competing save. "Any newer number"
        // is not enough: the displayed number refreshes every 250ms, so the owner's own
        // previous save can appear late and pass for the competing one.
        const revision=async()=>Number(await ui.locator('.dp-saved').getAttribute('data-version'));
        const competing=peer.waitForResponse(response=>response.url().includes('/api/pages/deck-edit')&&response.request().method()==='PATCH'&&response.ok()&&(response.request().postData()??'').includes(remote));
        await peerNotes.fill(remote);await other.locator('.edit-title').click();await peer.keyboard.press('Escape');
        const competingRevision=(await (await competing).json()).versionNumber;
        assert.ok(Number.isInteger(competingRevision),`${name}: competing save returned no revision`);
        await waitFor(()=>other.locator('.deck-edit-status').getAttribute('data-state').then(state=>state==='saved'),'peer note not saved');
        await waitFor(async()=>await revision()>=competingRevision,'owner did not receive the competing revision');
        assert.equal(await notes.inputValue(),own);
        await notes.evaluate(node=>node.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true})));
        await ui.getByRole('button',{name:'ノートの変更を確認',exact:true}).click();
        assert.equal(await ui.locator('.dp-conflict [data-latest]').innerText(),remote);
        await ui.getByRole('button',{name:'入力に戻る',exact:true}).click();
        assert.equal(await notes.inputValue(),own);
        await ui.getByRole('button',{name:'ノートの変更を確認',exact:true}).click();
        await ui.getByRole('button',{name:choice,exact:true}).click();
        await waitFor(()=>notes.inputValue().then(value=>value===(choice==='最新のノートを使う'?remote:own)),'conflict choice lost input');
        await waitFor(()=>ui.locator('.deck-edit-status').getAttribute('data-state').then(state=>state==='saved'),'resolved note not saved');
      }
      const peerFrame=peer.frameLocator('iframe.edit-frame');
      const heading=peerFrame.locator('section[data-studio-active] h1').first();
      await heading.dblclick();await peer.keyboard.press('End');await peer.keyboard.insertText(` 本文更新-${name}`);await peer.keyboard.press('Escape');
      await waitFor(()=>ui.locator('.dp-notice').innerText().then(text=>text.includes('更新があります')),'live slide update not held');
      assert.ok(!(await audience.frameLocator('iframe:not([data-back])').locator('h1').innerText()).includes(`本文更新-${name}`));
      await ui.getByRole('button',{name:'更新を反映',exact:true}).click();
      await waitFor(()=>audience.frameLocator('iframe:not([data-back])').locator('h1').innerText().then(text=>text.includes(`本文更新-${name}`)),'adoption not reflected');
      await waitFor(()=>ui.locator('.dp-saved').innerText().then(text=>/\d{1,2}:\d{2} .+が更新/.test(text)),'server revision time not received');
      await page.route('**/api/pages/deck-edit',route=>route.request().method()==='PATCH'?route.abort('internetdisconnected'):route.continue());
      await edit();
      await notes.fill(marker+' / 通信断中の入力');
      await waitFor(()=>ui.locator('.deck-edit-status').innerText().then(text=>text.includes('通信')||text.includes('下書き')),'offline draft not retained');
      await notes.press('ArrowRight');
      assert.ok((await ui.locator('.dp-position').innerText()).startsWith('1 /'));
      assert.equal(await notes.inputValue(),marker+' / 通信断中の入力');
      await page.unroute('**/api/pages/deck-edit');
      await page.evaluate(()=>dispatchEvent(new Event('online')));
      await waitFor(()=>ui.locator('.deck-edit-status').getAttribute('data-state').then(state=>state==='saved'),'offline notes not recovered');
      // Escape leaves the editor for the large reading view and keeps presenting.
      await notes.press('Escape');
      await reading.waitFor();
      assert.equal(await ui.locator('.dp-screen').count(),1);
      await audience.reload();await audience.frameLocator('iframe:not([data-back])').locator('html[data-deck-mode=present]').waitFor();
      await ui.getByRole('button',{name:'次へ',exact:true}).press('ArrowRight');
      await waitFor(()=>ui.locator('.dp-position').innerText().then(text=>text.startsWith('2 /')),'slide did not advance');
      await audience.frameLocator('iframe:not([data-back])').locator('body').press('ArrowLeft');
      await waitFor(()=>ui.locator('.dp-position').innerText().then(text=>text.startsWith('1 /')),'slide did not return');
      for(const [width,height,layout] of [[1024,600,'notes'],[1280,600,'notes'],[1366,650,'notes'],[1024,600,'slides'],[1366,650,'slides']]) {
        await page.setViewportSize({width,height});
        if(await ui.locator('.dp-screen').getAttribute('data-layout')!==layout)await ui.getByRole('button',{name:layout==='notes'?'ノートを表示':'ノートを隠す',exact:true}).click();
        const clipped=await ui.locator('.dp-screen').evaluate(root=>[...root.querySelectorAll('button,textarea,iframe')].some(node=>{const r=node.getBoundingClientRect();return r.width>0&&(r.right>innerWidth+1||r.bottom>innerHeight+1||r.left<0||r.top<0);}));
        assert.equal(clipped,false,`${name}: ${width}x${height} ${layout} overflow`);
      }
      await ui.getByRole('button',{name:'ノートを表示',exact:true}).click();
      await audience.close();
      const [reopened]=await Promise.all([page.waitForEvent('popup'),ui.getByRole('button',{name:'観客用を開く',exact:true}).click()]);
      await reopened.frameLocator('iframe:not([data-back])').locator('html[data-deck-mode=present]').waitFor();
      await page.route('**/api/pages/deck-edit?*',route=>route.request().method()==='GET'?route.fulfill({status:403,contentType:'application/json',body:JSON.stringify({error:'権限を変更しました'})}):route.continue());
      await waitFor(()=>ui.locator('.dp-notice').innerText().then(text=>text.includes('権限')),'permission revocation did not stop presentation');
      await reopened.frameLocator('iframe:not([data-back])').getByText('発表を停止しました',{exact:true}).waitFor();
      assert.deepEqual(errors,[]);
      console.log(`PASS ${name}: saved/remote/offline notes, held/adopted body, revision metadata, reload, reopen, viewport, permission revocation`);
    } finally { await browser.close(); }
  }
} finally { await server.close(); }

// A deck without any notes opens slides-first; the notes can still be brought back.
const plain=await startDeckTestServer(`${root}/tests/checks/fixtures/internal/example/deck-design-proposal.html`);
try {
  for (const [name,engine] of [['chromium',chromium],['webkit',webkit]]) {
  if(process.env.PAGES_TEST_BROWSER && process.env.PAGES_TEST_BROWSER!==name)continue;
  const executablePath=name==='webkit'?process.env.PAGES_TEST_WEBKIT_EXECUTABLE:process.env.PAGES_TEST_CHROMIUM_EXECUTABLE;
  const browser=await engine.launch(executablePath?{executablePath}:{});
  try {
    const page=await (await browser.newContext({viewport:{width:1280,height:600}})).newPage(),ui=page.locator('surprise-comments');
    await page.goto(plain.url+'?edit=1');
    await ui.getByRole('button',{name:'発表者画面',exact:true}).click({timeout:20000});
    await ui.locator('.dp-screen[data-ready=true]').waitFor();
    assert.equal(await ui.locator('.dp-screen').getAttribute('data-layout'),'slides');
    assert.ok(await ui.getByRole('textbox',{name:'発表者ノート',exact:true}).isHidden());
    await ui.getByRole('button',{name:'ノートを表示',exact:true}).click();
    assert.equal(await ui.locator('.dp-screen').getAttribute('data-layout'),'notes');
    console.log(`PASS ${name}: a deck without notes opens slides-first`);
  } finally { await browser.close(); }
  }
} finally { await plain.close(); }
