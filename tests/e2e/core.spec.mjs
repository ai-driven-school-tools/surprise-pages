import {trackReadingLayoutObservers} from './reading-layout-observers.mjs';
import {test, expect} from 'playwright/test';
import {readFile} from 'node:fs/promises';
import path from 'node:path';

async function session(context, role) {
  const value = JSON.parse(await readFile(path.join(process.env.PAGES_TEST_RUNTIME ?? '.test-runtime','session.json'),'utf8'));
  await context.setExtraHTTPHeaders({origin:value.origin});
  await context.clearCookies();
  if (role) await context.addCookies([{name:'authjs.session-token',value:value.sessions[role],url:value.origin,httpOnly:true,sameSite:'Lax'}]);
  return value;
}

test('anonymous readers see public articles but no private content or tools', async ({page,context}) => {
  await session(context,null);
  const denied = await page.request.get('/internal/test/private',{maxRedirects:0});
  expect(await denied.text()).not.toContain('最初の本文');
  await page.goto('/internal/test/private');
  await expect(page.getByRole('button',{name:'ログインして開く'})).toBeVisible();
  await page.goto('/public/test/public');
  await expect(page.locator('h1')).toHaveText('検査用の記事');
  const tools = await page.request.get('/api/comments?page=internal/test/public');
  expect(tools.ok()).toBeTruthy();
  const value = await tools.json();
  expect(value.features.tools).toBe(false);
  expect(value.comments).toEqual([]);
  for (const url of ['/api/history?page=internal/test/private','/api/pages/edit?page=internal/test/private']) {
    const response = await page.request.get(url);
    expect(response.ok()).toBe(false);
    expect(await response.text()).not.toContain('最初の本文');
  }
});

test('restricted page and edit permission are enforced at the server', async ({page,context}) => {
  await session(context,'reader');
  expect((await page.request.get('/internal/test/private',{maxRedirects:0})).status()).toBe(403);
  expect((await page.request.get('/api/pages/edit?page=internal/test/article')).ok()).toBe(false);
  await page.goto('/internal/test/article');
  await expect(page.locator('h1')).toHaveText('検査用の記事');
  const data = await (await page.request.get('/api/comments?page=internal/test/article')).json();
  expect(data.features.edit).toBe(false);
  await session(context,'admin');
  expect((await page.request.get('/api/pages/edit?page=internal/test/private')).ok()).toBe(true);
});

test('article save survives reload and stale saves cannot overwrite it', async ({page,context},info) => {
  await session(context,'owner');
  const url = '/api/pages/edit?page=internal/test/article';
  const source = await (await page.request.get(url)).json();
  expect(source.html).not.toContain('<base');
  expect(source.previewHtml).toContain('<base');
  const marker = `保存確認-${info.project.name}`;
  const html = source.html.replace('最初の本文',marker);
  const payload = {page:'internal/test/article',html,baseVersionId:source.baseVersionId};
  const saved = await page.request.put('/api/pages/edit',{data:payload});
  expect(saved.ok(),await saved.text()).toBeTruthy();
  const stale = await page.request.put('/api/pages/edit',{data:{...payload,html:html.replace(marker,'上書きしてはいけない')}});
  expect(stale.status()).toBe(409);
  await page.goto('/internal/test/article');
  await expect(page.locator('p').filter({hasText:marker})).toBeVisible();
  await expect(page.locator('strong')).toHaveText('装飾を残す');
  await page.reload();
  await expect(page.locator('p').filter({hasText:marker})).toBeVisible();
  const latest = await (await page.request.get(url)).json();
  expect(latest.html).toBe(html);
  // Restore for independent browser projects using the latest base, never an old snapshot.
  expect((await page.request.put('/api/pages/edit',{data:{page:'internal/test/article',html:source.html,baseVersionId:latest.baseVersionId}})).ok()).toBe(true);
});

test('comments are persisted without exposing email addresses', async ({page,context},info) => {
  await session(context,'owner');
  const body = `検査用コメント-${info.project.name}`;
  const response = await page.request.post('/api/comments',{data:{pageSlug:'internal/test/article',body,kind:'comment',priority:'want'}});
  expect(response.ok(),await response.text()).toBeTruthy();
  const list = await page.request.get('/api/comments?page=internal/test/article');
  const value = await list.json();
  expect(value.comments.some(comment => comment.body === body)).toBe(true);
  expect(JSON.stringify(value.comments)).not.toContain('@example.com');
  await page.goto('/internal/test/article');
  await page.reload();
  const again = await (await page.request.get('/api/comments?page=internal/test/article')).json();
  expect(again.comments.some(comment => comment.body === body)).toBe(true);
});

test('a comment written by someone else appears without reloading', async ({page,context,browser},info) => {
  await session(context,'owner');
  await page.goto('/internal/test/article');
  await page.getByRole('button',{name:/^コメント/}).first().waitFor();
  const other=await browser.newContext();
  try {
    await session(other,'admin');
    const body=`自動反映の検査-${info.project.name}-${crypto.randomUUID().slice(0,8)}`;
    const posted=await other.request.post('/api/comments',{data:{pageSlug:'internal/test/article',body,kind:'comment',priority:'want'}});
    expect(posted.ok(),await posted.text()).toBeTruthy();
    // リロードもクリックもせず、見ている間の定期の読み直しだけで一覧に出る（間隔 5 秒 + 往復）
    await expect.poll(() => page.evaluate(() => document.querySelector('surprise-comments')?.shadowRoot?.textContent ?? ''),{timeout:20_000}).toContain(body);
  } finally {await other.close();}
});

test('actual slide typing saves and remains after reopening', async ({page,context},info) => {
  await trackReadingLayoutObservers(page);
  await session(context,'owner');
  const errors = [];
  page.on('pageerror',error => errors.push(error.message));
  await page.goto('/internal/test/deck');
  await page.getByRole('button',{name:'このページを直す',exact:true}).click();
  const heading = page.frameLocator('iframe.edit-frame').locator('section[data-studio-active] h1');
  await expect(heading).toBeVisible();
  expect(await page.frameLocator('iframe.edit-frame').locator('body').evaluate(()=>window.readingLayoutObserverCount())).toBe(0);
  const marker = ` 入力検査-${info.project.name}`;
  await heading.dblclick();
  await page.keyboard.press('End');
  await page.keyboard.insertText(marker);
  await expect(page.locator('.deck-edit-status')).toContainText('保存済み');
  await page.keyboard.press('Escape');
  const read = '/api/pages/deck-edit?page=internal/test/deck&sessionId='+crypto.randomUUID();
  await expect.poll(async () => (await (await page.request.get(read)).json()).html).toContain(marker);
  const source = await (await page.request.get(read)).json();
  expect(source.html).not.toContain('contenteditable="true"');
  expect(await page.evaluate(html=>new DOMParser().parseFromString(html,'text/html').querySelector('[data-deck-editor-preview]')===null,source.html)).toBe(true);
  await page.reload();
  await expect(page.locator('h1').filter({hasText:marker.trim()})).toBeVisible();
  expect(errors).toEqual([]);
});

test('reading works at 390px without loading private tools for an anonymous reader', async ({page,context}) => {
  await session(context,null);
  await page.setViewportSize({width:390,height:844});
  await page.goto('/public/test/public');
  await expect(page.locator('h1')).toBeVisible();
  await expect.poll(() => page.evaluate(() => !!document.querySelector('surprise-comments')?.shadowRoot?.querySelector('button'))).toBe(false);
});

test('two editors preserve independent edits and replay does not create a second revision',async ({page,context,browser})=>{
  await session(context,'owner');
  const other=await browser.newContext();
  try {
    await session(other,'admin');
    const one=crypto.randomUUID(),two=crypto.randomUUID();
    const source=await (await page.request.get(`/api/pages/deck-edit?page=internal/test/deck&sessionId=${one}`)).json();
    const protocol=source.collaboration?{protocol:2,epoch:source.collaboration.epoch}:{};
    const nodes=source.nodes.filter(node=>node.textRuns.some(run=>run.text.trim()) && ['h1','p','h2'].includes(node.tag));
    expect(nodes.length).toBeGreaterThanOrEqual(2);
    const batch=(node,sessionId,addition)=>{
      const run=node.textRuns.find(run=>run.text.trim());
      return {page:'internal/test/deck',sessionId,baseVersionId:source.versionId,operationId:crypto.randomUUID(),...protocol,
        operations:[{kind:'text',target:node.id,run:run.run,before:run.text,after:run.text+addition}]};
    };
    const first=batch(nodes[0],one,' 独立した変更A');
    const second=batch(nodes[1],two,' 独立した変更B');
    const responses=await Promise.all([page.request.patch('/api/pages/deck-edit',{data:first}),other.request.patch('/api/pages/deck-edit',{data:second})]);
    for (const response of responses) expect(response.ok(),await response.text()).toBe(true);
    const latest=await (await page.request.get(`/api/pages/deck-edit?page=internal/test/deck&sessionId=${one}`)).json();
    expect(latest.html).toContain('独立した変更A');
    expect(latest.html).toContain('独立した変更B');
    const replay=await (await page.request.patch('/api/pages/deck-edit',{data:first})).json();
    expect(replay.replayed).toBe(true);
    expect(replay.versionId).toBe(latest.versionId);
    const originalColor=nodes[0].style.color??null;
    const colors=['#123456','#234567','#345678'].filter(value=>value!==originalColor);
    const color={page:'internal/test/deck',sessionId:one,baseVersionId:latest.versionId,operationId:crypto.randomUUID(),...protocol,
      operations:[{kind:'style',target:nodes[0].id,property:'color',before:originalColor,after:colors[0]}]};
    const painted=await page.request.patch('/api/pages/deck-edit',{data:color});expect(painted.ok()).toBe(true);
    const firstColor=await painted.json();
    const conflict=await page.request.patch('/api/pages/deck-edit',{data:{...color,operationId:crypto.randomUUID(),
      operations:[{...color.operations[0],after:colors[1]}]}});
    expect(conflict.status()).toBe(source.collaboration?200:409);
    if(source.collaboration){
      const last=await conflict.json();
      const undo=await page.request.patch('/api/pages/deck-edit',{data:{...color,operationId:crypto.randomUUID(),baseVersionId:last.versionId,operations:firstColor.inverse}});
      expect(undo.status()).toBe(409);
      const oldClient=await page.request.patch('/api/pages/deck-edit',{data:{...color,operationId:crypto.randomUUID(),protocol:undefined}});
      expect(oldClient.status()).toBe(409);
    }
  } finally {await other.close();}
});

test('browser-origin protection refuses external writes',async ({page,context})=>{
  await session(context,'owner');
  const response=await page.request.post('/api/comments',{headers:{origin:'https://outside.invalid'},
    data:{pageSlug:'internal/test/article',body:'外からの書き込み',priority:'want'}});
  expect(response.status()).toBe(403);
  const list=await (await page.request.get('/api/comments?page=internal/test/article')).json();
  expect(list.comments.some(comment=>comment.body==='外からの書き込み')).toBe(false);
});
