/**
 * 清書をスマホで指でスクロールしている最中に、画面の高さが変わっても（アドレスバーの出入り）
 * 読む場所が後ろへ引き戻されないこと。
 *
 * スマホのブラウザはスクロールに合わせてアドレスバーを畳み、そのたびに resize を出す。
 * 幅は変わらず本文も折り返し直さないので、ここで位置を直す理由は無い。
 * 直してしまうと、指で進めたぶんだけ戻されて「カクッ」と見える（iOS では慣性も止まる）。
 *
 * 広い画面（iPad の横置き）では、ツールバーの出入りで左の目次と上端の帯が入れ替わらないことも見る。
 * Safari はツールバーを出すと見えている高さ（innerHeight）だけを縮め、ページの組みの高さ（100lvh）は変えない。
 * 入れ替わると、上へ戻すたびに左の目次が消えて本文が横へ動く。
 */
import assert from 'node:assert/strict';
import {readdir, readFile} from 'node:fs/promises';
import {chromium, webkit} from 'playwright';

// 道具箱の部品は入口 1 本と分けた部品（scripts/build/widget.mjs）。入口は同じ階層の相対で部品を読むので、全部を同じ階層で配る
const dist = new URL('../../../src/widget/dist/', import.meta.url);
const widgetFiles = Object.fromEntries(await Promise.all((await readdir(dist)).filter(name => name.startsWith('comments-widget')).map(async name => [name, await readFile(new URL(name, dist), 'utf8')])));
const chapters = Array.from({length: 8}, (_, c) => `<h1 id="c${c}">第${c + 1}章 見出し</h1>` +
  Array.from({length: 4}, (_, s) => `<h2 id="c${c}s${s}">節 ${c + 1}.${s + 1}</h2>` + '<p>清書の本文。指で上下に送りながら読む。</p>'.repeat(6)).join('')).join('');
// 章（h2）と節（h3）に分かれた清書。左の目次の判断に使う（8 章 × 4 節）
const outlined = Array.from({length: 8}, (_, c) => `<h2 id="c${c}">第${c + 1}章 見出し</h2>` +
  Array.from({length: 4}, (_, s) => `<h3 id="c${c}s${s}">節 ${c + 1}.${s + 1}</h3>` + '<p>清書の本文。指で上下に送りながら読む。</p>'.repeat(6)).join('')).join('');
const readingHtml = body => `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><main data-clean-copy-document>${body}</main><script type="module" src="/comments-widget.js/comments-widget.js" data-page="internal/test/reading"></script>`;
const html = readingHtml(chapters);

// iPhone と同じ WebKit が要。CI はブラウザごとに分けて走らせる（PAGES_TEST_BROWSER）。
const requested = process.env.PAGES_TEST_BROWSER;
const engines = [chromium, webkit];
assert.ok(!requested || engines.some(engine => engine.name() === requested), 'Unknown test browser');
let failures = 0;
for (const engine of engines.filter(engine => !requested || engine.name() === requested)) {
  const executablePath = engine === chromium ? process.env.PAGES_TEST_CHROMIUM_EXECUTABLE : process.env.PAGES_TEST_WEBKIT_EXECUTABLE;
  const browser = await engine.launch({headless: true, ...(executablePath ? {executablePath} : {})});
  try {
    const page = await browser.newPage({viewport: {width: 390, height: 664}});
    page.on('pageerror', error => console.error(error.message));
    await page.route('**/*', route => {
      const path = new URL(route.request().url()).pathname;
      if (path === '/internal/test/reading') return route.fulfill({contentType: 'text/html; charset=utf-8', body: html});
      if (path.startsWith('/comments-widget.js/') && widgetFiles[path.split('/').pop()] !== undefined) return route.fulfill({contentType: 'text/javascript; charset=utf-8', body: widgetFiles[path.split('/').pop()]});
      return route.fulfill({json: {comments: [], versions: [], viewer: {name: '検査ユーザー'}, features: {tools: true, history: true}}});
    });
    await page.goto('https://tools.test/internal/test/reading');
    await page.waitForSelector('html[data-surprise-reading]');
    await page.evaluate(() => window.scrollTo(0, 1200));
    await page.waitForTimeout(200);

    // アドレスバーが畳まれて 664 → 744、また出て 744 → 664。指で 30px 進めた直後に高さが変わる。
    const before = await page.evaluate(() => window.scrollY);
    const moved = [];
    for (const height of [744, 664, 744, 664, 744, 664, 744, 664]) {
      await page.evaluate(() => window.scrollBy(0, 30));
      await page.setViewportSize({width: 390, height});
      await page.waitForTimeout(100);
      moved.push(await page.evaluate(() => window.scrollY));
    }
    try {
      assert.deepEqual(moved, moved.map((_, i) => before + 30 * (i + 1)), `${engine.name()}: 高さが変わったときに、指で進めたぶんを引き戻した`);
      console.log(`OK   ${engine.name()}: 画面の高さが変わってもスクロールは引き戻されない`);
    } catch (error) {
      failures++;
      console.log(`NG   ${error.message}`);
    }

    // iPad Air 11 インチの横置き（幅 1180）。ツールバーを畳んだ高さ 764 で開き、上へ戻してツールバーが出ると
    // 見えている高さだけが 693 に縮む（Playwright では組みの高さごと変わるので、見えている高さだけを縮めて写す）
    const tablet = await browser.newPage({viewport: {width: 1180, height: 764}});
    tablet.on('pageerror', error => console.error(error.message));
    await tablet.route('**/*', route => {
      const path = new URL(route.request().url()).pathname;
      if (path === '/internal/test/reading') return route.fulfill({contentType: 'text/html; charset=utf-8', body: readingHtml(outlined)});
      if (path.startsWith('/comments-widget.js/') && widgetFiles[path.split('/').pop()] !== undefined) return route.fulfill({contentType: 'text/javascript; charset=utf-8', body: widgetFiles[path.split('/').pop()]});
      return route.fulfill({json: {comments: [], versions: [], viewer: {name: '検査ユーザー'}, features: {tools: true, history: true}}});
    });
    await tablet.goto('https://tools.test/internal/test/reading');
    await tablet.waitForSelector('html[data-surprise-reading]');
    await tablet.evaluate(() => window.scrollTo(0, 1200));
    await tablet.waitForTimeout(200);
    const mode = () => tablet.evaluate(() => {
      const root = document.querySelector('surprise-reading-nav:not([data-sp-first-paint])').shadowRoot;
      return {rail: !root.querySelector('.rail').hidden, trigger: !root.querySelector('.trigger').hidden, padding: getComputedStyle(document.documentElement).paddingLeft};
    });
    const opened = await mode();
    const seen = [];
    for (const visible of [693, 764, 693, 764]) {
      await tablet.evaluate(height => {
        Object.defineProperty(window, 'innerHeight', {configurable: true, get: () => height});
        window.dispatchEvent(new Event('resize'));
      }, visible);
      await tablet.waitForTimeout(100);
      seen.push(await mode());
    }
    try {
      assert.ok(opened.rail && !opened.trigger, `${engine.name()}: 幅 1180・高さ 764 の画面で左の目次が出ていない`);
      assert.deepEqual(seen, seen.map(() => opened), `${engine.name()}: ツールバーの出入りで左の目次と上端の帯が入れ替わった`);
      console.log(`OK   ${engine.name()}: ツールバーの出入りで左の目次が消えない`);
    } catch (error) {
      failures++;
      console.log(`NG   ${error.message}`);
    }
  } finally { await browser.close(); }
}
if (failures) process.exit(1);
