/**
 * スライドの編集画面の画像パレットを、使い捨ての保存先と本物のブラウザで通す。
 * 配布版のパレットは「この資料」「最近」のタブとアップロード・リンクだけ（サーバーから有料の検索 API を呼ばない）。
 * 実行: node tests/checks/browser/deck-image-palette.mjs
 */
import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {mkdir} from "node:fs/promises";
import sharp from "sharp";
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE??"playwright");
const server=spawn(process.execPath,["scripts/dev/preview-deck-editor.mjs"],{env:{...process.env,PORT:"0",DECK_EDIT_NEW:"1"},stdio:["ignore","pipe","pipe"]});
const url=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>{server.kill();reject(new Error("Preview timed out"));},20000);server.stdout.on("data",data=>{const match=String(data).match(/http:\/\/127\.0\.0\.1:\d+/);if(match){clearTimeout(timer);resolve(match[0]);}});server.once("exit",code=>{clearTimeout(timer);reject(new Error(`Preview exited ${code}`));});});
const output=process.env.DECK_QA_OUTPUT??"/tmp/deck-image-palette-qa";await mkdir(output,{recursive:true});
const png=`${output}/palette.png`;
await sharp({create:{width:320,height:180,channels:3,background:{r:40,g:110,b:170}}}).png().toFile(png);
const browser=await chromium.launch({headless:true,...(process.env.PAGES_TEST_CHROME_CHANNEL?{channel:process.env.PAGES_TEST_CHROME_CHANNEL}:{})}),page=await browser.newPage({viewport:{width:1280,height:800}}),errors=[];
page.on("pageerror",error=>errors.push(error.message));
try{
  await page.goto(url);await page.getByRole("button",{name:"この資料を編集",exact:true}).click();
  await page.waitForFunction(()=>{const frame=document.querySelector("surprise-comments")?.shadowRoot?.querySelector("iframe.edit-frame");return Boolean(frame?.contentDocument?.querySelector("[data-studio-active]"));});
  const frame=page.frameLocator("iframe.edit-frame"),saved=()=>page.locator(".deck-edit-status").filter({hasText:"保存済み"}).waitFor();
  const placed=()=>frame.locator(`img[src*="_deck/"]`).count();
  await page.getByRole("button",{name:"画像",exact:true}).click();const panel=page.getByRole("complementary",{name:"画像パレット"});await panel.waitFor();
  for(const name of ["この資料","最近"])await panel.getByRole("tab",{name,exact:true}).waitFor();
  assert.equal(await panel.getByRole("tab",{name:"Web検索",exact:true}).count(),0);
  assert.ok(await panel.getByRole("button",{name:"アップロード"}).isVisible());assert.ok(await panel.getByRole("button",{name:"リンク",exact:true}).isVisible());
  console.log("OK  画像パレットに「この資料」「最近」とアップロード・リンクが出て、Web 検索は出ない");
  const before=await placed();
  await page.locator('input[type=file][accept^="image/"]').first().setInputFiles(png);
  await page.waitForFunction(count=>{const doc=document.querySelector("surprise-comments")?.shadowRoot?.querySelector("iframe.edit-frame")?.contentDocument;return (doc?.querySelectorAll('img[src*="_deck/"]').length??0)>count;},before,{timeout:30000});await saved();
  console.log("OK  アップロードした画像がスライドに入り、保存される");
  if(!await panel.isVisible())await page.getByRole("button",{name:"画像",exact:true}).click();
  await panel.getByRole("tab",{name:"この資料",exact:true}).click();
  const pick=panel.getByRole("tabpanel",{name:"この資料"}).locator(".ds-image-pick").first();await pick.waitFor();
  const afterUpload=await placed();await pick.click();
  await page.waitForFunction(count=>{const doc=document.querySelector("surprise-comments")?.shadowRoot?.querySelector("iframe.edit-frame")?.contentDocument;return (doc?.querySelectorAll('img[src*="_deck/"]').length??0)>count;},afterUpload,{timeout:20000});await saved();
  console.log("OK  「この資料」の画像を選ぶと、同じ画像をもう一枚置ける");
  await panel.getByRole("tab",{name:"最近",exact:true}).click();await panel.getByRole("tabpanel",{name:"最近"}).waitFor();
  console.log("OK  「最近」のタブに切り替えられる");
  if(!await panel.isVisible())await page.getByRole("button",{name:"画像",exact:true}).click();
  await page.screenshot({path:`${output}/wide.png`});
  await page.setViewportSize({width:850,height:800});await page.waitForTimeout(150);const medium=await panel.boundingBox();assert.ok(medium&&medium.width===320&&medium.x+medium.width<=850);await page.screenshot({path:`${output}/medium.png`});
  await page.setViewportSize({width:600,height:800});await page.waitForTimeout(150);const box=await panel.boundingBox();assert.ok(box&&box.width>=590&&box.y>200&&box.y+box.height<=801);await page.screenshot({path:`${output}/narrow.png`});
  console.log("OK  中間幅と狭い画面でも画像パレットがはみ出さない");
  await panel.getByRole("button",{name:"画像パレットを閉じる"}).click();assert.ok(await panel.isHidden());console.log("OK  画像パレットを閉じられる");
  assert.deepEqual(errors,[]);console.log("OK  画像パレットを開いても画面内の実行エラーがない");
  const expected=await placed();
  const reader=await browser.newPage();await reader.goto(`${url}/reader`);
  await reader.waitForFunction(count=>{const images=[...document.querySelectorAll('img[src*="_deck/"]')];return images.length>=count&&images.every(img=>img.complete&&img.naturalWidth>0);},expected,{timeout:20000});await reader.close();
  console.log("OK  保存後に資料を開き直しても追加した画像が表示される");
}finally{await browser.close();server.kill();}
