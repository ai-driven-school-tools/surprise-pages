// Run against scripts/dev/preview-deck-editor.mjs; this harness never contacts production.
// PLAYWRIGHT_MODULE may point to an installed playwright/index.mjs.
const {chromium,webkit}=await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
import {writeFile,mkdir} from 'node:fs/promises';
const output=process.env.DECK_QA_OUTPUT ?? '/tmp/deck-editor-interaction';
const base=process.env.DECK_QA_URL ?? 'http://127.0.0.1:4178';
await mkdir(output,{recursive:true});
const engine=process.env.DECK_BROWSER === 'webkit' ? webkit : chromium;
const browser=await engine.launch({headless:true,...(process.env.DECK_BROWSER_EXECUTABLE ? {executablePath:process.env.DECK_BROWSER_EXECUTABLE} : engine===chromium ? {channel:'chrome'} : {})});
const errors=[],results=[];
const firstContext=await browser.newContext({viewport:{width:1440,height:1000}});
const secondContext=await browser.newContext({viewport:{width:1440,height:1000}});
const first=await firstContext.newPage(), second=await secondContext.newPage();
for(const page of [first,second]) {page.on('pageerror',e=>errors.push(e.message));page.on('response',async r=>{if(r.url().includes('/api/')&&r.status()>=400)errors.push(`${r.status()} ${await r.text()}`);});}
async function open(page,url){
  await page.goto(url);
  await page.getByRole('button',{name:'この資料を編集'}).click();
  await page.waitForFunction(() => document.querySelector('surprise-comments')?.shadowRoot?.querySelector('iframe.edit-frame')?.contentDocument?.querySelector('[data-deck-node]'));
  return (await page.locator('iframe.edit-frame').elementHandle()).contentFrame();
}
async function report(label,pass,detail){results.push({label,pass,detail});console.log(pass?'PASS':'FAIL',label,detail??'');}
async function textAt(frame,id){return frame.locator(`[data-deck-node="${id}"]`).textContent();}
async function editEnd(page,frame,id,text){const node=frame.locator(`[data-deck-node="${id}"]`);await node.dblclick();await node.press('End');await page.keyboard.insertText(text);await page.keyboard.press('Escape');}
try{
const one=await open(first,base+'/');const two=await open(second,base+'/?who=second');
const heading=one.locator('h1'); const id=await heading.getAttribute('data-deck-node');const original=await heading.textContent();const before=await heading.evaluate(n=>({html:n.innerHTML,style:n.getAttribute('style'),class:n.className,rect:n.getBoundingClientRect().toJSON()}));
await heading.dblclick();await report('編集開始で構図の大きさを維持',JSON.stringify(await heading.evaluate(n=>n.getBoundingClientRect().toJSON()))===JSON.stringify(before.rect));
await first.keyboard.press('End');await first.keyboard.insertText(' 共同編集');await first.keyboard.press('Escape');await first.waitForTimeout(2300);
const actual=await heading.textContent();await report('その場で文字入力できる',actual.includes('共同編集'),actual);
await report('既存の改行要素を保持',await heading.locator('br').count()===1);
await report('2人目に文字変更が届く',await textAt(two,id)===actual,await textAt(two,id));
await first.screenshot({path:`${output}/01-text.png`});
await first.getByRole('button',{name:'元に戻す',exact:true}).click();await first.waitForTimeout(1800);
await report('元に戻す操作で元の文章へ戻る',await heading.textContent()===original,await heading.textContent());
await first.getByRole('button',{name:'やり直す',exact:true}).click();await first.waitForTimeout(1800);
await report('やり直す操作で文字変更が戻る',(await heading.textContent()).includes('共同編集'));
await firstContext.setOffline(true);await editEnd(first,one,id,' 下書き');await first.waitForTimeout(1400);await report('通信切断中も入力を維持',(await heading.textContent()).includes('下書き'));
await firstContext.setOffline(false);await first.waitForTimeout(4000);await report('再接続後2人目に下書きが届く',(await textAt(two,id)).includes('下書き'),await textAt(two,id));
await first.screenshot({path:`${output}/02-reconnected.png`});
const beforeText=await one.locator('p[data-deck-created]').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('data-deck-node')));await first.getByRole('button',{name:'＋ 挿入',exact:true}).click();await first.getByRole('button',{name:'テキスト',exact:true}).click();await first.waitForTimeout(1500);const addedId=await one.locator('p[data-deck-created]').evaluateAll((nodes,before)=>nodes.find(n=>!before.includes(n.getAttribute('data-deck-node')))?.getAttribute('data-deck-node'),beforeText);const added=one.locator(`[data-deck-node="${addedId}"]`);await report('新しい文字を追加できる',await added.count()===1);
await added.click();const start=await added.boundingBox();await first.keyboard.press('ArrowRight');await first.waitForTimeout(500);const moved=await added.boundingBox();await report('矢印キーで原寸1px移動する',moved.x>start.x&&moved.x-start.x<2,{start,moved});
await added.dblclick();await added.press('ControlOrMeta+A');
await added.evaluate(n=>{const r=document.createRange();r.selectNodeContents(n);const s=document.getSelection();s.removeAllRanges();s.addRange(r);n.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true}));n.textContent='にほんご';n.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertCompositionText',data:'にほんご',isComposing:true}));n.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true,data:'日本語'}));});
await first.keyboard.press('Escape');await first.waitForTimeout(2000);await report('疑似IMEで確定文字だけ保存',await added.textContent()==='日本語',await added.textContent());
await first.screenshot({path:`${output}/03-ime.png`});
const art=await firstContext.newPage();await art.setViewportSize({width:800,height:200});await art.setContent('<body style="margin:0;display:flex;font:48px sans-serif"><div style="background:#ffbcbc;width:267px;height:200px">LEFT</div><div style="background:#bcd9ff;width:267px;height:200px">CENTER</div><div style="background:#caffbc;width:266px;height:200px">RIGHT</div></body>');await art.screenshot({path:`${output}/image.png`});await art.close();
const beforeImages=await one.locator('img[data-deck-created]').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('data-deck-node')));await first.locator('input[type=file][accept^="image/"]').setInputFiles(`${output}/image.png`);await first.waitForTimeout(2200);const imageAddedId=await one.locator('img[data-deck-created]').evaluateAll((nodes,before)=>nodes.find(n=>!before.includes(n.getAttribute('data-deck-node')))?.getAttribute('data-deck-node'),beforeImages);
const image=one.locator(`[data-deck-node="${imageAddedId}"]`);await report('画像を正規のアップロード口から追加',await image.count()===1,await image.getAttribute('src'));
await image.click();const imageId=await image.getAttribute('data-deck-node');const imageStart=await image.boundingBox();
const handle=one.getByRole('button',{name:'画像の大きさを変更（矢印キーでも調整できます）'});const hb=await handle.boundingBox();await first.mouse.move(hb.x+hb.width/2,hb.y+hb.height/2);await first.mouse.down();await first.mouse.move(hb.x+hb.width/2+60,hb.y+hb.height/2+30,{steps:8});await first.mouse.up();await first.waitForTimeout(1700);const imageResized=await image.boundingBox();
await report('画像をドラッグで縦横比を保って拡大',imageResized.width>imageStart.width&&Math.abs(imageStart.width/imageStart.height-imageResized.width/imageResized.height)<0.01,{imageStart,imageResized});
await first.getByRole('button',{name:'切り抜き',exact:true}).click();const slider=first.getByRole('slider',{name:'周囲を切り取る（%）'});const sb=await slider.boundingBox();await slider.click({position:{x:sb.width/3,y:sb.height/2}});await first.waitForTimeout(1300);const ib=await image.boundingBox();await first.mouse.move(ib.x+ib.width/2,ib.y+ib.height/2);await first.mouse.down();await first.mouse.move(ib.x+ib.width/2+30,ib.y+ib.height/2,{steps:8});await first.mouse.up();await first.waitForTimeout(1700);const position=await image.evaluate(n=>getComputedStyle(n).clipPath);await report('画像の切り抜き位置をドラッグで調整',position!=='none'&&position!=='inset(15%)',position);
await report('画像の変更が2人目へ届く',await two.locator(`[data-deck-node="${imageId}"]`).evaluate(n=>getComputedStyle(n).clipPath)===position);
await first.screenshot({path:`${output}/04-image.png`});
await first.locator('.ds-slide').last().click();const lastSlide=one.locator('section[data-deck-slide]').last();await lastSlide.scrollIntoViewIfNeeded();const lastBox=await lastSlide.boundingBox();await first.mouse.click(lastBox.x+lastBox.width-16,lastBox.y+lastBox.height-16);const lastId=await lastSlide.getAttribute('data-deck-node');
await first.getByRole('button',{name:'＋ 挿入',exact:true}).click();await first.getByRole('button',{name:'テキスト',exact:true}).click();await first.waitForTimeout(1300);const lastText=one.locator('p[data-deck-created]').last();
await report('最後の枚の余白を選んで同じ枚へ文字を追加',await lastText.evaluate(n=>n.closest('[data-deck-slide]').getAttribute('data-deck-node'))===lastId);
let releaseUpload;const uploadGate=new Promise(resolve=>{releaseUpload=resolve;});
await first.route('**/api/pages/deck-edit/assets?**',async route=>{await uploadGate;await route.continue();});
await first.locator('input[type=file][accept^="image/"]').setInputFiles(`${output}/image.png`);await first.waitForTimeout(500);
await report('画像の送信中が画面に出る',await first.locator('.deck-edit-status').filter({hasText:'画像を追加中…'}).isVisible());
await report('画像の送信中は完了できない',await first.getByRole('button',{name:'完了',exact:true}).isDisabled());
releaseUpload();await first.waitForTimeout(2300);await first.unroute('**/api/pages/deck-edit/assets?**');
const lastImage=one.locator('img[data-deck-created]').last();await report('最後の枚へ画像も追加できる',await lastImage.evaluate(n=>n.closest('[data-deck-slide]').getAttribute('data-deck-node'))===lastId);
await lastImage.click();await first.keyboard.press('Escape');await report('Escapeで編集の操作欄へ戻れる',await first.getByRole('button',{name:'完了',exact:true}).evaluate(n=>n.getRootNode().activeElement===n));
await lastImage.click();await first.keyboard.press('Tab');await report('最後の要素からTabで操作欄へ戻れる',await first.getByRole('button',{name:'完了',exact:true}).evaluate(n=>n.getRootNode().activeElement===n));
await first.locator('.ds-slide').first().click();const firstTarget=one.locator('section[data-deck-slide]').first().locator('p').first();await firstTarget.click();await first.keyboard.press('Shift+Tab');await report('最初の要素からShiftTabで操作欄へ戻れる',await first.getByRole('button',{name:'完了',exact:true}).evaluate(n=>n.getRootNode().activeElement===n));
await first.screenshot({path:`${output}/05-keyboard-and-upload.png`});
await heading.scrollIntoViewIfNeeded();
const surrounding=()=>heading.evaluate(n=>{const paragraph=n.parentElement.querySelector('p'),footer=n.closest('[data-deck-slide]').querySelector('footer');return {box:n.getBoundingClientRect().toJSON(),paragraph:paragraph.getBoundingClientRect().toJSON(),footer:footer.getBoundingClientRect().toJSON()};});
const surroundingBefore=await surrounding();const previousText=await heading.textContent();
await heading.dblclick();await heading.evaluate(n=>{const r=document.createRange();r.selectNodeContents(n);const selection=document.getSelection();selection.removeAllRanges();selection.addRange(r);});
const longText='長い見出しに変えても、ほかの要素の位置と大きさは保たれるべきです。'.repeat(4);
await first.keyboard.insertText(longText);await first.waitForTimeout(100);
await report('長文の入力中も周囲の配置が1pxも動かない',JSON.stringify(await surrounding())===JSON.stringify(surroundingBefore),{before:surroundingBefore,after:await surrounding()});
await report('入りきらない文字を明確に知らせる',await one.getByRole('button',{name:'文字が入りきりません。文章を短くしてください',exact:true}).isVisible());
await report('長文の全体を残して同じ文字箱内で続きを編集できる',await heading.evaluate(n=>n.textContent.length>100&&n.scrollHeight>n.clientHeight&&n.scrollTop>0),await heading.evaluate(n=>({length:n.textContent.length,scrollTop:n.scrollTop,scrollHeight:n.scrollHeight,clientHeight:n.clientHeight})));
await first.screenshot({path:`${output}/06-long-text-editing.png`});
await first.keyboard.press('Escape');await first.waitForTimeout(1600);
await report('保存後も周囲の配置が1pxも動かない',JSON.stringify(await surrounding())===JSON.stringify(surroundingBefore));
await report('長文が欠けずに共同編集者へ保存される',await textAt(two,id)===longText);
await first.getByRole('button',{name:'元に戻す',exact:true}).click();await first.waitForTimeout(1600);
await report('長文を元に戻すと元の文章と配置へ戻る',await heading.textContent()===previousText&&JSON.stringify(await surrounding())===JSON.stringify(surroundingBefore));



}catch(error){errors.push(error.stack);console.error(error);}
await writeFile(`${output}/results.json`,JSON.stringify({results,errors},null,2));await browser.close();if(results.some(r=>!r.pass)||errors.some(e=>!e.startsWith('409')))process.exitCode=1;
