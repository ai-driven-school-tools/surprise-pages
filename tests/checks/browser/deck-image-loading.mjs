/** Stable image sources must survive scrolling, presentation and slow responses. */
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {chromium, webkit} from 'playwright';
import sharp from 'sharp';
const navigation = await readFile(new URL('../../../src/templates/deck.html', import.meta.url), 'utf8');
const bytes = await sharp({create:{width:640,height:360,channels:3,background:'#405060'}}).webp().toBuffer();
const html = `<!doctype html><html><head><meta charset="utf-8">${navigation}</head><body data-deck><main data-deck-slides>${Array.from({length:24},(_,at)=>`<section data-deck-slide><h1>画像 ${at+1}</h1><picture><source srcset="/picture-${at}.webp" type="image/webp"><img src="/fallback-${at}.webp" loading="lazy" width="640" height="360" alt="読み込み検査"></picture></section>`).join('')}</main></body></html>`;
const safari = process.env.PAGES_TEST_BROWSER === 'webkit';
const browser = await (safari ? webkit : chromium).launch({headless:true,...(safari && process.env.PAGES_TEST_WEBKIT_EXECUTABLE ? {executablePath:process.env.PAGES_TEST_WEBKIT_EXECUTABLE} : !safari && process.env.PAGES_TEST_CHROME_CHANNEL ? {channel:process.env.PAGES_TEST_CHROME_CHANNEL} : {})});
try {
  const page = await browser.newPage({viewport:{width:1280,height:800}});
  const requests = new Map();
  await page.route('**/*', async route => {
    const path = new URL(route.request().url()).pathname;
    if(path === '/') return route.fulfill({contentType:'text/html',body:html});
    if(path.endsWith('.webp')) {
      requests.set(path,(requests.get(path)??0)+1);
      await new Promise(resolve=>setTimeout(resolve,200));
      return route.fulfill({contentType:'image/webp',headers:{'cache-control':'public,max-age=3600'},body:bytes}).catch(()=>{});
    }
    return route.abort();
  });
  await page.addInitScript(()=>{
    window.removedImageSources=0;
    new MutationObserver(records=>{
      for(const r of records)if(r.type==='attributes' && r.attributeName==='src' && r.target.tagName==='IMG' && !r.target.hasAttribute('src'))window.removedImageSources++;
    }).observe(document,{subtree:true,attributes:true,attributeFilter:['src']});
  });
  await page.goto('http://127.0.0.1/',{waitUntil:'networkidle'});
  assert.ok(requests.size<24,'distant lazy images do not all download on opening');
  await page.waitForFunction(()=>document.querySelector('img').naturalWidth===640);
  // Scroll away and return while other images are still being delivered.
  await page.locator('[data-deck-slide]').nth(12).scrollIntoViewIfNeeded();
  await page.locator('[data-deck-slide]').first().scrollIntoViewIfNeeded();
  assert.equal(await page.locator('img').first().evaluate(img=>img.complete && img.naturalWidth===640),true,'returning image remains ready');
  await page.getByRole('button',{name:'プレゼンを始める',exact:true}).click();
  await page.keyboard.press('End');
  await page.waitForFunction(()=>document.querySelector('[data-deck-current] img')?.naturalWidth===640);
  await page.keyboard.press('Home');
  assert.equal(await page.locator('img').first().evaluate(img=>img.naturalWidth),640);
  await page.keyboard.press('Escape');
  await page.evaluate(()=>document.deckLayout.setEditing(true));
  await page.evaluate(()=>document.deckLayout.setEditing(false));
  assert.equal(await page.evaluate(()=>window.removedImageSources),0,'navigation never clears an image source');
  assert.equal(await page.locator('img[src]').count(),24,'every image retains its source');
  assert.equal(requests.get('/picture-0.webp'),1,'returning does not request the loaded image again');
  assert.ok([...requests.keys()].every(path=>path.startsWith('/picture-')),'responsive picture selection is preserved');
  console.log('PASS: lazy loading, slow responses, return navigation, presentation, editor transition and responsive images');
} finally {await browser.close();}
