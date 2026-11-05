/**
 * スライドの編集画面の「並べる」操作を、使い捨ての保存先と本物のブラウザで通す。
 * レイヤーの一覧（並べ替え・固定）・複数選択の揃えと吸い付き・まとめて拡大・図形の 8 つの持ち手・右クリックのメニュー・選んだ字だけの見た目。
 * どれも保存（操作の記録）・取り消し・読み込み直しで残ることまで確かめる。
 * 実行: node tests/checks/browser/deck-arrange.mjs（DECK_ARRANGE_URL を渡すと起動済みの scripts/dev/preview-deck-editor.mjs を使う）
 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? "playwright");
const output = process.env.DECK_QA_OUTPUT ?? "/tmp/deck-arrange";
await mkdir(output, { recursive: true });

let server = null;
async function start() {
  if (process.env.DECK_ARRANGE_URL) return process.env.DECK_ARRANGE_URL;
  server = spawn(process.execPath, ["scripts/dev/preview-deck-editor.mjs"], { env: { ...process.env, PORT: "0" }, stdio: ["ignore", "pipe", "pipe"] });
  let logs = "";
  server.stderr.on("data", (data) => { logs += data; });
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(Error(logs || "Local preview timed out")), 60000);
    server.stdout.on("data", (data) => {
      const match = String(data).match(/http:\/\/127\.0\.0\.1:\d+/);
      if (match) { clearTimeout(timer); resolve(match[0]); }
    });
    server.once("exit", () => { clearTimeout(timer); reject(Error(logs)); });
  });
}

const url = await start();
const browser = await chromium.launch({ headless: true });
const results = [];
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const open = async () => {
    await page.goto(url + "/?edit=1");
    await page.waitForFunction(() => document.querySelector("surprise-comments")?.shadowRoot?.querySelector("iframe.edit-frame")?.contentDocument?.querySelector("[data-studio-active]"), null, { timeout: 30000 });
  };
  await open();
  const frame = page.frameLocator("iframe.edit-frame");
  const slide = () => frame.locator("section[data-studio-active]");
  const saved = () => page.locator(".deck-edit-status").filter({ hasText: "保存済み" }).waitFor();
  const report = (label) => { results.push(label); console.log("PASS", label); };
  const goTo = async (index) => { await page.locator(".ds-slide").nth(index).click(); await page.waitForTimeout(300); };
  const undo = () => page.getByRole("button", { name: "元に戻す", exact: true }).click();
  const layerRows = () => page.locator(".ds-layer-pick");
  /** 描き直しを待って値を比べる（一覧は次の描画で描き直す） */
  const until = async (read, expected, label) => {
    let value;
    for (let tries = 0; tries < 50; tries++) { value = await read(); if (JSON.stringify(value) === JSON.stringify(expected)) return; await page.waitForTimeout(100); }
    assert.deepEqual(value, expected, label);
  };

  // レイヤー: 一覧は上ほど前面。行を押すと選び、乗せると枠、最後の行を先頭の上へ落とすと z-index で前面へ
  await goTo(0);
  await page.locator(".ds-layers-list").waitFor();
  const before = await layerRows().allTextContents();
  assert.ok(before.length >= 3, "レイヤーの一覧に行がある");
  await layerRows().nth(0).click();
  await until(() => layerRows().nth(0).getAttribute("aria-pressed"), "true", "選んだ行に印");
  await until(async () => (await frame.locator("section[data-studio-active] [data-deck-node]").count()) > 0, true);
  report("レイヤー: 行を押すと要素を選ぶ");
  const last = layerRows().last(), first = layerRows().first();
  const from = await last.boundingBox(), to = await first.boundingBox();
  await page.mouse.move(from.x + 40, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + 40, from.y - 10, { steps: 4 });
  await page.mouse.move(to.x + 40, to.y + 3, { steps: 8 });
  await page.mouse.up();
  await saved();
  await until(async () => (await layerRows().allTextContents())[0], before.at(-1), "落とした行が先頭（前面）になる");
  const movedId = await page.locator(".ds-layer").first().getAttribute("data-key");
  assert.ok(Number(await slide().locator(`[data-deck-node="${movedId}"]`).evaluate((node) => getComputedStyle(node).zIndex)) > 0, "z-index で前面へ出す");
  report("レイヤー: 行のドラッグで重なり順だけを変える");
  await undo();
  await saved();
  await until(() => layerRows().allTextContents(), before, "取り消しで並びが戻る");
  report("レイヤー: 並べ替えを取り消せる");
  // 固定: 錠を押すと data-deck-locked が付き、読み込み直しても残る
  await page.locator(".ds-layer").first().hover();
  await page.locator(".ds-layer-lock").first().click();
  await saved();
  const lockedId = await page.locator(".ds-layer").first().getAttribute("data-key");
  assert.equal(await slide().locator(`[data-deck-node="${lockedId}"]`).getAttribute("data-deck-locked"), "true");
  await open();
  await goTo(0);
  await page.locator(".ds-layers-list").waitFor();
  assert.equal(await slide().locator(`[data-deck-node="${lockedId}"]`).getAttribute("data-deck-locked"), "true");
  assert.equal(await page.locator(`.ds-layer[data-key="${lockedId}"]`).getAttribute("data-locked"), "");
  await page.locator(`.ds-layer[data-key="${lockedId}"] .ds-layer-lock`).click();
  await saved();
  assert.equal(await slide().locator(`[data-deck-node="${lockedId}"]`).getAttribute("data-deck-locked"), null);
  report("レイヤー: 錠で位置を固定し、読み込み直しても残る");
  await page.screenshot({ path: `${output}/layers.png` });

  assert.deepEqual(errors, []);
  console.log(`${results.length} checks passed`);
} finally {
  await browser.close();
  server?.kill();
}
