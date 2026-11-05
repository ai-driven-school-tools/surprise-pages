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
  /** 何も無い所を押して選び直す */
  const clear = () => slide().click({ position: { x: 6, y: 6 } });
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

  // 複数選択: ⇧ で足し、選んだ範囲の角でまとめて拡大。揃え・取り消し
  await goTo(4);
  const kicker = () => slide().locator("p.dd-kicker"), title = () => slide().locator("h2.dd-title");
  await kicker().click();
  await title().click({ modifiers: ["Shift"] });
  await page.locator(".ds-inspector h2").filter({ hasText: "2個を選択" }).waitFor();
  const grips = frame.locator("[data-selection-grip]");
  await until(() => grips.count(), 4, "選んだ範囲の 4 つの角に持ち手");
  report("複数選択: ⇧ で足すと選んだ範囲に 4 つの持ち手");
  const widths = async () => [await kicker().evaluate((node) => node.getBoundingClientRect().width), await title().evaluate((node) => node.getBoundingClientRect().width)];
  const startWidths = await widths();
  const se = await grips.and(frame.locator('[data-selection-grip="se"]')).boundingBox();
  await page.mouse.move(se.x + se.width / 2, se.y + se.height / 2);
  await page.mouse.down();
  await page.mouse.move(se.x + se.width / 2 + 60, se.y + se.height / 2 + 20, { steps: 10 });
  await page.mouse.up();
  await saved();
  const grown = await widths();
  assert.ok(grown[0] > startWidths[0] + 5 && grown[1] > startWidths[1] + 5, "どちらも大きくなる");
  assert.ok(Math.abs(grown[0] / startWidths[0] - grown[1] / startWidths[1]) < 0.02, "同じ比で大きくなる");
  report("複数選択: 角を引くと全員を同じ比で大きくする");
  await undo();
  await saved();
  await until(async () => (await widths()).map(Math.round), startWidths.map(Math.round), "取り消しで大きさが戻る");
  report("複数選択: まとめた拡大を 1 回で取り消せる");
  await clear();
  await kicker().click();
  await title().click({ modifiers: ["Shift"] });
  await page.getByRole("group", { name: "左右" }).getByRole("button", { name: "右端", exact: true }).click();
  await saved();
  await until(async () => Math.round((await kicker().boundingBox()).x + (await kicker().boundingBox()).width) - Math.round((await title().boundingBox()).x + (await title().boundingBox()).width), 0, "右端が揃う");
  report("揃え: 複数の右端を揃える");
  await undo();
  await saved();
  await clear();
  await title().click();
  if (!(await page.locator(".ds-placement").evaluate((node) => node.open))) await page.locator(".ds-placement summary").click();
  await page.getByRole("button", { name: "スライドの中央に揃える", exact: true }).click();
  await saved();
  const centered = async () => { const box = await title().boundingBox(), stage = await slide().boundingBox(); return Math.round(box.x + box.width / 2 - (stage.x + stage.width / 2)); };
  await until(centered, 0, "スライドの左右中央に揃う");
  report("揃え: 1 つならスライドに揃える");
  await undo();
  await saved();

  // 吸い付き: 動かしている間に線を出し、スライドの左右中央に合わせる
  await title().click();
  const box = await title().boundingBox(), stage = await slide().boundingBox();
  const aim = stage.x + stage.width / 2 - (box.x + box.width / 2);
  await page.mouse.move(box.x + 10, box.y + 10);
  await page.mouse.down();
  await page.mouse.move(box.x + 10 + aim / 2, box.y + 14, { steps: 6 });
  await page.mouse.move(box.x + 10 + aim + 2, box.y + 14, { steps: 6 });
  assert.ok(await frame.locator(".snap-line").count() > 0, "動かしている間に揃いの線が出る");
  await page.screenshot({ path: `${output}/snap.png` });
  await page.mouse.up();
  await saved();
  await until(centered, 0, "スライドの中央に吸い付く");
  assert.equal(await frame.locator(".snap-line").count(), 0, "離したら線を消す");
  report("吸い付き: 動かすとスライドの中央に合わせ、線を出す");
  await undo();
  await saved();

  // 図形の 8 つの持ち手: 右の辺だけを引くと幅だけが変わり、読み込み直しても残る
  await page.getByRole("button", { name: "＋ 挿入", exact: true }).click().catch(async () => page.getByRole("button", { name: "挿入", exact: true }).click());
  await page.getByRole("dialog", { name: "挿入", exact: true }).getByRole("button", { name: "四角", exact: true }).click();
  await saved();
  const shape = () => slide().locator("[data-deck-shape]").last();
  const shapeId = await shape().getAttribute("data-deck-node");
  await until(() => frame.locator("[data-grip]").count(), 8, "図形に 8 つの持ち手");
  const before2 = await shape().boundingBox();
  const east = await frame.locator('[data-grip="e"]').boundingBox();
  await page.mouse.move(east.x + east.width / 2, east.y + east.height / 2);
  await page.mouse.down();
  await page.mouse.move(east.x + east.width / 2 + 70, east.y + east.height / 2 + 30, { steps: 10 });
  await page.mouse.up();
  await saved();
  const after2 = await shape().boundingBox();
  assert.ok(after2.width > before2.width + 30, "幅が広がる");
  assert.ok(Math.abs(after2.height - before2.height) < 1, "高さは変わらない");
  assert.ok(Math.abs(after2.x - before2.x) < 1, "左の辺は止まったまま");
  report("図形: 右の辺の持ち手で幅だけを変える");
  await open();
  await goTo(4);
  const reloaded = await slide().locator(`[data-deck-node="${shapeId}"]`).boundingBox();
  assert.ok(Math.abs(reloaded.width - after2.width) < 1, "読み込み直しても幅が残る");
  report("図形: 大きさの変更が読み込み直しても残る");
  await page.screenshot({ path: `${output}/arrange.png` });

  // 右クリック: 押した要素を選んでメニューを出す。複製・固定・固定の解除・レイヤーの一覧からも同じメニュー
  const menu = () => page.getByRole("menu", { name: "要素の操作", exact: true });
  const menuItem = (name) => menu().getByRole("menuitem", { name: `${name} — 要素`, exact: true });
  await clear();
  const count = await slide().locator("h2.dd-title").count();
  await title().click({ button: "right" });
  await menu().waitFor();
  await page.screenshot({ path: `${output}/menu.png` });
  assert.ok(await menuItem("グループを解除").count() === 0, "できない操作は出さない");
  await menuItem("複製").click();
  await saved();
  await until(() => slide().locator("h2.dd-title").count(), count + 1, "複製で 1 つ増える");
  assert.equal(await menu().count(), 0, "選んだらメニューを閉じる");
  report("右クリック: 要素の複製");
  await undo();
  await saved();
  await until(() => slide().locator("h2.dd-title").count(), count, "取り消しで複製が消える");
  await title().click({ button: "right" });
  await menuItem("位置を固定").click();
  await saved();
  assert.equal(await title().getAttribute("data-deck-locked"), "true");
  await title().click({ button: "right" });
  assert.deepEqual(await menu().getByRole("menuitem").allTextContents(), ["コピー⌘C", "固定を解除"], "固定した要素は写す・解除だけ");
  await menuItem("固定を解除").click();
  await saved();
  assert.equal(await title().getAttribute("data-deck-locked"), null);
  report("右クリック: 固定と解除");
  await page.locator(".ds-layer-pick").first().click({ button: "right" });
  await menu().waitFor();
  await page.keyboard.press("Escape");
  assert.equal(await menu().count(), 0, "Esc で閉じる");
  report("右クリック: レイヤーの一覧からも同じメニュー、Esc で閉じる");
  await clear();
  await slide().click({ position: { x: 6, y: 6 }, button: "right" });
  await menuItem("すべて選択").click();
  await page.locator(".ds-inspector h2").filter({ hasText: "個を選択" }).waitFor();
  report("右クリック: 何も無い所ではすべて選択");

  // 選んだ字だけの見た目: 字を直していて一部を選び、太字を押すとその字だけを span で囲む。取り消し・読み込み直し
  await clear();
  const select = (from, to) => kicker().evaluate((node, [start, end]) => {
    const text = [...node.childNodes].find((child) => child.nodeType === 3 && child.data.trim());
    const range = node.ownerDocument.createRange(); range.setStart(text, start); range.setEnd(text, end);
    const selection = node.ownerDocument.getSelection(); selection.removeAllRanges(); selection.addRange(range);
  }, [from, to]);
  const kickerText = await kicker().textContent();
  await kicker().dblclick();
  await until(() => kicker().getAttribute("contenteditable"), "true", "字を直し始める");
  await select(0, 2);
  await page.locator(".ds-inspector").getByRole("button", { name: "太字", exact: true }).click();
  await saved();
  const piece = () => kicker().locator("span[data-deck-node]");
  await until(() => piece().count(), 1, "選んだ字だけを囲む");
  assert.equal(await piece().textContent(), kickerText.slice(0, 2));
  assert.equal(await piece().evaluate((node) => getComputedStyle(node).fontWeight), "700");
  assert.notEqual(await kicker().evaluate((node) => getComputedStyle(node).fontWeight), "700", "残りの字は太字にしない");
  assert.equal(await kicker().textContent(), kickerText, "字は変わらない");
  report("選んだ字: 太字は選んだ字だけに付く");
  // 囲んだ字が選ばれたままなので、続けて色を変えると同じ字に付く
  await page.locator(".ds-inspector .ds-field").filter({ hasText: "文字色" }).locator("input[type=color]").evaluate((input) => { input.value = "#cc3300"; input.dispatchEvent(new Event("input", { bubbles: true })); input.dispatchEvent(new Event("change", { bubbles: true })); });
  await saved();
  await until(() => piece().evaluate((node) => getComputedStyle(node).color), "rgb(204, 51, 0)", "続けた色も同じ字に付く");
  report("選んだ字: 続けて押した色も同じ字に付く");
  await undo();
  await saved();
  await undo();
  await saved();
  await until(() => piece().count(), 0, "取り消しで囲みが消える");
  assert.equal(await kicker().textContent(), kickerText);
  report("選んだ字: 取り消しで元に戻る");
  const redo = () => page.getByRole("button", { name: "やり直す", exact: true }).click();
  await redo();
  await saved();
  await redo();
  await saved();
  await until(() => piece().count(), 1, "やり直しで囲みが戻る");
  await open();
  await goTo(4);
  await until(() => kicker().locator("span[data-deck-node]").count(), 1, "読み込み直しても囲みが残る");
  assert.equal(await kicker().locator("span[data-deck-node]").evaluate((node) => getComputedStyle(node).fontWeight), "700");
  assert.equal(await kicker().locator("span[data-deck-node]").evaluate((node) => getComputedStyle(node).color), "rgb(204, 51, 0)");
  report("選んだ字: やり直して、読み込み直しても残る");
  await page.screenshot({ path: `${output}/text-style.png` });

  assert.deepEqual(errors, []);
  console.log(`${results.length} checks passed`);
} finally {
  await browser.close();
  server?.kill();
}
