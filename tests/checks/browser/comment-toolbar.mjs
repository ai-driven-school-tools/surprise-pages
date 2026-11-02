/** The floating tools stay reachable beside an open, resized comment panel. */
import assert from 'node:assert/strict';
import {readdir, readFile} from 'node:fs/promises';
import {chromium, webkit} from 'playwright';
// 道具箱の部品は入口 1 本と分けた部品（scripts/build/widget.mjs）。入口は同じ階層の相対で部品を読むので、全部を同じ階層で配る
const dist = new URL('../../../src/widget/dist/', import.meta.url);
const widgetFiles = Object.fromEntries(await Promise.all((await readdir(dist)).filter(name => name.startsWith('comments-widget')).map(async name => [name, await readFile(new URL(name, dist), 'utf8')])));
for (const engine of [chromium, webkit]) {
  const executablePath = engine === chromium ? process.env.PAGES_TEST_CHROMIUM_EXECUTABLE : process.env.PAGES_TEST_WEBKIT_EXECUTABLE;
  const browser = await engine.launch({headless:true,...(executablePath ? {executablePath} : {})});
  try {
    const page = await browser.newPage({viewport:{width:1440,height:900}});
    page.on('pageerror', error => console.error(error.message));
    await page.route('**/*', route => {
      const path = new URL(route.request().url()).pathname;
      if (path === '/internal/test/tools') return route.fulfill({contentType:'text/html; charset=utf-8',body:'<!doctype html><meta charset="utf-8"><h1>本文</h1><p>コメントを読みながら操作する</p><script type="module" src="/comments-widget.js/comments-widget.js" data-page="internal/test/tools"></script>'});
      if (path.startsWith('/comments-widget.js/') && widgetFiles[path.split('/').pop()] !== undefined) return route.fulfill({contentType: 'text/javascript; charset=utf-8', body: widgetFiles[path.split('/').pop()]});
      return route.fulfill({json:{comments:[],versions:[],viewer:{name:'検査ユーザー'},features:{tools:true,history:true}}});
    });
    await page.addInitScript(() => {
      window.copiedText = null;
      Object.defineProperty(navigator, 'clipboard', {value:{writeText:async text => {window.copiedText = text;}}});
    });
    await page.goto('https://tools.test/internal/test/tools');
    // 道具箱の帯（上端の現在地の行も .bar を持つので、道具箱の影の中に絞る）
    const bar = page.locator('surprise-comments').locator('.bar');
    const panel = page.locator('.panel');
    await bar.getByRole('button',{name:'コメント',exact:true}).click();
    for (const width of [1440,1100,1800]) {
      await page.setViewportSize({width,height:900});
      await page.waitForTimeout(100);
      const tools = await bar.boundingBox();
      const sheet = await panel.boundingBox();
      assert(tools && sheet && tools.x >= 0 && tools.x + tools.width < sheet.x, 'tools must fit beside the panel');
      // 履歴は ⋯ の小窓の中（版の一覧が空で、上端に「いつ・何版目」が出ない画面）
      await bar.getByRole('button',{name:'その他',exact:true}).click();
      await page.locator('.popover').getByRole('button',{name:'履歴',exact:true}).click();
      await bar.getByRole('button',{name:'コメント',exact:true}).click();
    }
    await bar.getByRole('button',{name:'コメント',exact:true}).click();
    assert(await panel.isHidden());
    assert((await bar.boundingBox()).x > 1200, 'closed panel restores tools to the right edge');
    await page.setViewportSize({width:390,height:844});
    await bar.getByRole('button',{name:'コメント',exact:true}).click();
    assert(await bar.isHidden(), 'mobile sheet keeps its existing unobstructed layout');
    for (const width of [1440,390]) {
      await page.setViewportSize({width,height:900});
      if (await panel.isVisible()) await panel.getByRole('button',{name:'閉じる',exact:true}).click();
      const selected = 'コピー対象  空白を残す\n' + '長い文章'.repeat(400);
      await page.locator('body > p').evaluate((element,text) => {
        element.textContent = text;
        element.style.whiteSpace = 'pre-wrap';
        const range = document.createRange();
        range.selectNodeContents(element);
        window.getSelection().removeAllRanges();
        window.getSelection().addRange(range);
      },selected);
      const copy = page.getByRole('button',{name:'選択した文字をコピー',exact:true});
      await copy.click();
      assert.equal(await page.evaluate(() => window.copiedText),selected,'copy keeps the full selection including whitespace');
      assert.equal(await copy.textContent(),'','copy control is icon only');
      await page.mouse.click(5,5);
    }
    console.log(`${engine.name()}: comment tools remain clickable, resize and close correctly`);
  } finally { await browser.close(); }
}
