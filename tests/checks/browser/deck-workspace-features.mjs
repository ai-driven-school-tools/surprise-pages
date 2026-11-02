/** Exercise the extracted workspace features against disposable local data. */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
const { chromium, webkit } = await import(process.env.PLAYWRIGHT_MODULE ?? "playwright");
const output = process.env.DECK_QA_OUTPUT ?? "/tmp/deck-workspace-features";
await mkdir(output, { recursive: true });
const results = [];

for (const [name, engine] of [["chrome", chromium], ["webkit", webkit]]) {
  const server = spawn(process.execPath, ["scripts/dev/preview-deck-editor.mjs"], {
    env: { ...process.env, PORT: "0", DECK_EDIT_NEW: "1" }, stdio: ["ignore", "pipe", "pipe"],
  });
  let logs = "";
  server.stderr.on("data", data => { logs += data; });
  let browser;
  try {
    const url = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(Error(logs || "Local preview timed out")), 30000);
      server.stdout.on("data", data => {
        const match = String(data).match(/http:\/\/127\.0\.0\.1:\d+/);
        if (match) { clearTimeout(timer); resolve(match[0]); }
      });
      server.once("exit", () => { clearTimeout(timer); reject(Error(logs)); });
    });
    browser = await engine.launch({ headless: true, ...(name === "chrome" ? { channel: "chrome" } : {}) });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.goto(url + "/?edit=1");
    await page.waitForFunction(() => document.querySelector("surprise-comments")?.shadowRoot?.querySelector("iframe.edit-frame")?.contentDocument?.querySelector("[data-studio-active]"));
    const frame = page.frameLocator("iframe.edit-frame");
    const saved = () => page.locator(".deck-edit-status").filter({ hasText: "保存済み" }).waitFor();
    const insert = async label => {
      await page.getByRole("button", { name: "＋ 挿入", exact: true }).click();
      await page.getByRole("dialog", { name: "挿入", exact: true }).getByRole("button", { name: label, exact: true }).click();
      await saved();
    };
    const report = label => { results.push({ engine: name, label, pass: true }); console.log("PASS", name, label); };

    await page.locator(".ds-slide").last().click();
    assert.equal(await frame.locator("section[data-studio-active]").getAttribute("data-deck-node"), await frame.locator("section[data-deck-slide]").last().getAttribute("data-deck-node"));
    report("一覧から選んだ枚を中央に表示する");
    await insert("表");
    const table = frame.locator("section[data-studio-active] table[data-deck-node]").last();
    const tableId = await table.getAttribute("data-deck-node");
    await page.getByRole("button", { name: "表の内容を編集", exact: true }).click();
    const tableDialog = page.getByRole("dialog", { name: "表の内容を編集", exact: true });
    await tableDialog.getByLabel("2行 1列", { exact: true }).fill("整理後の表");
    await tableDialog.getByRole("button", { name: "反映", exact: true }).click();
    await saved();
    assert.equal(await table.getAttribute("data-deck-node"), tableId);
    assert.ok((await table.textContent()).includes("整理後の表"));
    report("表の内容を変えても同じ編集対象として保存する");
    await page.getByRole("button", { name: "元に戻す", exact: true }).click();
    await saved();
    assert.ok(!(await table.textContent()).includes("整理後の表"));
    await page.getByRole("button", { name: "やり直す", exact: true }).click();
    await saved();
    assert.ok((await table.textContent()).includes("整理後の表"));
    report("表の編集を取り消し・やり直しできる");

    await insert("グラフ");
    const chart = frame.locator("section[data-studio-active] figure[data-dd-chart]").last();
    const chartId = await chart.getAttribute("data-deck-node");
    await page.getByRole("button", { name: "グラフのデータを編集", exact: true }).click();
    const chartDialog = page.getByRole("dialog", { name: "グラフのデータを編集", exact: true });
    await chartDialog.getByLabel("2行 2列", { exact: true }).fill("37");
    await chartDialog.getByRole("button", { name: "反映", exact: true }).click();
    await saved();
    await chart.locator("svg").first().waitFor();
    assert.equal(await chart.getAttribute("data-deck-node"), chartId);
    await page.getByRole("button", { name: "グラフのデータを編集", exact: true }).click();
    assert.equal(await page.getByRole("dialog", { name: "グラフのデータを編集", exact: true }).getByLabel("2行 2列", { exact: true }).inputValue(), "37");
    await page.keyboard.press("Escape");
    report("グラフの数値を保存し、再描画と再編集ができる");
    await page.getByRole("button", { name: "デザイン", exact: true }).click();
    await page.locator(".ds-inspector input[type=color]").first().evaluate(input => {
      input.value = "#eeeeee"; input.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await saved();
    assert.equal(await page.locator(".ds-inspector input[type=color]").first().inputValue(), "#eeeeee");
    report("デザインの設定を既存の保存経路で更新する");
    await page.getByRole("button", { name: "デザイン", exact: true }).click();
    await saved();
    await page.getByRole("button", { name: "完了", exact: true }).click();
    assert.equal(await page.locator(".deck-studio").count(), 0);
    await page.getByRole("button", { name: "この資料を編集", exact: true }).click();
    await page.waitForFunction(() => document.querySelector("surprise-comments")?.shadowRoot?.querySelector("iframe.edit-frame")?.contentDocument?.querySelector("[data-studio-active]"));
    assert.deepEqual(errors, []);
    report("閉じて開き直しても操作の監視が重複しない");
    await page.screenshot({ path: `${output}/${name}.png` });
  } catch (error) {
    results.push({ engine: name, pass: false, error: error.stack });
    process.exitCode = 1;
    console.error(error);
  } finally {
    await browser?.close(); server.kill();
  }
}
await writeFile(`${output}/results.json`, JSON.stringify(results, null, 2));
