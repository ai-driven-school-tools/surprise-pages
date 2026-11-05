/** Actual new-document authoring, saves and reading parity on an isolated editor harness. */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
const { chromium, webkit } = await import(
  process.env.PLAYWRIGHT_MODULE ?? "playwright"
);
let localServer = null;
let url = process.env.DECK_QA_URL;
if (!url) {
  localServer = spawn(process.execPath, ["scripts/dev/preview-deck-editor.mjs"], {
    env: { ...process.env, PORT: "0", DECK_EDIT_NEW: "1" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  url = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      localServer.kill();
      reject(new Error("Preview timed out"));
    }, 20000);
    localServer.stdout.on("data", (data) => {
      const match = String(data).match(/http:\/\/127\.0\.0\.1:\d+/);
      if (match) {
        clearTimeout(timer);
        resolve(match[0]);
      }
    });
    localServer.once("exit", (code) => {
      clearTimeout(timer);
      reject(new Error("Preview exited " + code));
    });
  });
}
const out = process.env.DECK_QA_OUTPUT ?? "/tmp/deck-studio-qa",
  engine = process.env.DECK_BROWSER ?? "chromium";
if (!url?.startsWith("http://127.0.0.1:"))
  throw Error("A local, isolated editor preview is required");
await mkdir(out, { recursive: true });
const browser = await (engine === "webkit" ? webkit : chromium).launch({
    headless: true,
    ...(engine === "chromium" && process.env.PAGES_TEST_CHROME_CHANNEL ? {channel: process.env.PAGES_TEST_CHROME_CHANNEL} : {}),
    ...(engine === "webkit" && process.env.PAGES_TEST_WEBKIT_EXECUTABLE ? {executablePath: process.env.PAGES_TEST_WEBKIT_EXECUTABLE} : {}),
  }),
  page = await browser.newPage({ viewport: { width: 1280, height: 800 } }),
  errors = [],
  results = [];
page.on("pageerror", (e) => errors.push(e.message));
const frame = () => page.frameLocator("iframe.edit-frame");
const saved = async () => {
  await page
    .locator(".deck-edit-status")
    .filter({ hasText: "保存済み" })
    .waitFor({ timeout: 20000 });
};
const ready = async () => {
  await page.locator(".ds-inspector button:visible").first().waitFor();
  await page.waitForFunction(() => {
    const f = document
      .querySelector("surprise-comments")
      ?.shadowRoot?.querySelector("iframe.edit-frame");
    return !!f?.contentDocument?.querySelector("[data-studio-active]");
  });
};
// 「保存済み」は前の保存のまま残っているので、枚の操作のあとは一覧がその枚数になるまで待ってから数える
const slideCount = async (expected) => {
  const end = Date.now() + 20000;
  let count = await page.locator(".ds-slide").count();
  while (count !== expected && Date.now() < end) {
    await page.waitForTimeout(100);
    count = await page.locator(".ds-slide").count();
  }
  return count;
};
const read = async () => {
  const r = await page.request.get(
    `${url}/api/pages/deck-edit?page=internal/example/design&sessionId=${crypto.randomUUID()}`,
  );
  assert.ok(r.ok());
  return r.json();
};
async function slideAction(name) {
  await page
    .getByRole("button", { name: "スライドの操作", exact: true })
    .click();
  await page.getByRole("menuitem", { name, exact: true }).click();
}
async function test(name, fn) {
  try {
    await fn();
    results.push({ name, pass: true });
    console.log("OK " + name);
  } catch (e) {
    results.push({ name, pass: false, error: e.message });
    console.log("NG " + name + ": " + e.message);
    throw e;
  }
}
try {
  await page.goto(url);
  await page
    .getByRole("button", { name: "この資料を編集", exact: true })
    .click();
  await ready();
  await test("1280pxで一枚全体と左右の操作欄が収まる", async () => {
    const rect = await frame()
        .locator("section[data-studio-active]")
        .boundingBox(),
      area = await page.locator(".edit-frame").boundingBox();
    assert.ok(
      rect.width > 600 &&
        rect.x >= area.x &&
        rect.y >= area.y &&
        rect.x + rect.width <= area.x + area.width + 1 &&
        rect.y + rect.height <= area.y + area.height + 1,
    );
    await page.screenshot({ path: out + "/01-editor.png" });
  });
  await test("保存応答をまたいで日本語を連続入力できる", async () => {
    const heading = frame().locator("section[data-studio-active] h1");
    await heading.dblclick();
    await page.keyboard.press("End");
    await page.keyboard.insertText(" 追記A");
    await saved();
    await page.keyboard.insertText(" 続きB");
    await saved();
    await page.keyboard.press("Escape");
    const latest = await read();
    assert.ok(latest.html.includes("追記A 続きB"));
  });
  await test("比較とグラフを追加して三枚を保存できる", async () => {
    for (const label of ["比較", "グラフ"]) {
      await page
        .getByRole("button", { name: "スライドを追加", exact: true })
        .click();
      // 見本の絵は見えてから描くので、押せるようになるのを待つ前に見える所へ動かす（src/widget/deck/edit/template-preview.ts）
      const card = page.getByRole("button", { name: label, exact: true });
      await card.scrollIntoViewIfNeeded();
      await card.click();
      await page.getByRole("button", { name: "このスライドを追加", exact: true }).click();
      await ready();
      await saved();
    }
    assert.equal(await slideCount(3), 3);
  });
  await test("グラフを空欄・ゼロを含むデータで編集し直せる", async () => {
    await frame()
      .locator("section[data-studio-active] [data-dd-chart]")
      .dblclick();
    await page.getByRole("textbox", { name: "2行 2列", exact: true }).fill("");
    await page.getByRole("textbox", { name: "3行 2列", exact: true }).fill("0");
    await page.getByRole("button", { name: "反映", exact: true }).click();
    await ready();
    await saved();
    await frame()
      .locator("section[data-studio-active] [data-dd-chart]")
      .dblclick();
    assert.equal(
      await page
        .getByRole("textbox", { name: "2行 2列", exact: true })
        .inputValue(),
      "",
    );
    assert.equal(
      await page
        .getByRole("textbox", { name: "3行 2列", exact: true })
        .inputValue(),
      "0",
    );
    await page.getByRole("button", { name: "キャンセル", exact: true }).click();
    await page.screenshot({ path: out + "/02-chart.png" });
  });
  await test("デザインを変えても同じ枚で編集を続けられる", async () => {
    await page.getByRole("button", { name: "デザイン", exact: true }).click();
    await page.getByRole("button", { name: "Aa 藍", exact: true }).click();
    await ready();
    await saved();
    assert.match(
      await frame()
        .locator("section[data-studio-active]")
        .getAttribute("data-deck-authoring-layout"),
      /chart/,
    );
  });
  await test("枚を複製・移動・削除し取り消せる", async () => {
    await slideAction("複製 — スライド");
    await ready();
    await saved();
    assert.equal(await slideCount(4), 4);
    await slideAction("前へ — スライド");
    await ready();
    await saved();
    await slideAction("削除 — スライド");
    await ready();
    await saved();
    assert.equal(await slideCount(3), 3);
    await page.getByRole("button", { name: "元に戻す", exact: true }).click();
    await ready();
    await saved();
    assert.equal(await slideCount(4), 4);
  });
  await test("私用ノートと読み手の補足が別々に保存される", async () => {
    await page
      .getByRole("button", { name: "ノートを開く", exact: true })
      .click();
    await page
      .getByRole("textbox", {
        name: "発表者ノート — 公開・印刷には含まれません",
      })
      .fill("発表者だけのメモ");
    await page
      .getByRole("textbox", {
        name: "発表者ノート — 公開・印刷には含まれません",
      })
      .press("Tab");
    await ready();
    await saved();
    await page
      .getByRole("textbox", { name: "読み手への補足 — 閲覧・印刷に含まれます" })
      .fill("読み手に伝える補足");
    await page
      .getByRole("textbox", { name: "読み手への補足 — 閲覧・印刷に含まれます" })
      .press("Tab");
    await ready();
    await saved();
    await page.locator('.ds-slide[aria-selected="false"]').first().click();
    assert.equal(
      await page
        .getByRole("textbox", {
          name: "発表者ノート — 公開・印刷には含まれません",
        })
        .inputValue(),
      "",
    );
    const latest = await read();
    assert.ok(latest.html.includes("発表者だけのメモ"));
    assert.ok(latest.html.includes("読み手に伝える補足"));
    await page
      .getByRole("button", { name: "ノートを閉じる", exact: true })
      .click();
  });
  await test("追加した文字が選択され、削除と取り消しができる", async () => {
    await page.getByRole("button", { name: "＋ 挿入", exact: true }).click();
    await page.getByRole("button", { name: "テキスト", exact: true }).click();
    await ready();
    await saved();
    await page
      .locator(".ds-inspector")
      .getByRole("button", { name: "削除", exact: true })
      .click();
    await ready();
    await saved();
    await page.getByRole("button", { name: "元に戻す", exact: true }).click();
    await ready();
    await saved();
    assert.ok((await read()).html.includes(">テキスト</p>"));
  });
  await test("現在の枚から発表し、編集画面へ戻る", async () => {
    await page.getByRole("button", { name: "発表", exact: true }).click();
    await frame().locator('html[data-deck-mode="present"]').waitFor();
    await frame().locator("[data-deck-exit]").click();
    await frame().locator('html:not([data-deck-mode="present"])').waitFor();
    assert.equal(
      await page.locator(".edit-frame").evaluate((n) => n.style.position),
      "",
    );
  });
  await test("倍率操作へ移したキーボードの焦点を保持する", async () => {
    const plus = page.getByRole("button", { name: "＋", exact: true });
    await plus.focus();
    await page.waitForTimeout(1300);
    assert.ok(await plus.evaluate((n) => n.getRootNode().activeElement === n));
  });
  await test("画像の切り抜きを取消し、差し替えの取消し後も追加できる", async () => {
    const { default: sharp } = await import("sharp");
    const buffer = await sharp({
      create: { width: 400, height: 300, channels: 3, background: "#486b59" },
    })
      .png()
      .toBuffer();
    await page
      .locator('input[type=file][accept^="image/"]')
      .setInputFiles({ name: "photo.png", mimeType: "image/png", buffer });
    await ready();
    await saved();
    await frame().locator("section[data-studio-active] img").last().dblclick();
    await page.getByLabel("周囲を切り取る（%）").focus();
    await page.keyboard.press("ArrowRight");
    await page.getByRole("button", { name: "取消", exact: true }).click();
    await saved();
    assert.ok(!(await read()).html.includes("clip-path:inset(1%)"));
    await page
      .getByRole("button", { name: "画像を差し替え", exact: true })
      .click();
    await page
      .locator('input[type=file][accept^="image/"]')
      .dispatchEvent("cancel");
    await page.getByRole("button",{name:"画像パレットを閉じる",exact:true}).click();
    await page.getByRole("button", { name: "＋ 挿入", exact: true }).click();
    await page.getByRole("button", { name: "テキスト", exact: true }).click();
    await ready();
    await saved();
    assert.ok(
      (await page
        .locator(".ds-inspector")
        .getByRole("heading", { name: "文字", exact: true })
        .count()) ||
        (await page
          .locator(".ds-inspector")
          .getByRole("heading", { name: "テキスト", exact: true })
          .count()),
    );
  });
  await test("二人の変更の衝突を画面内で確認して復帰できる", async () => {
    await page.locator(".ds-slide").first().click();
    const context = await browser.newContext({
        viewport: { width: 1280, height: 800 },
      }),
      other = await context.newPage();
    try {
      await other.goto(url + "/?who=second");
      await other
        .getByRole("button", { name: "この資料を編集", exact: true })
        .click();
      const f = other.frameLocator("iframe.edit-frame");
      await f.locator("section[data-studio-active] h1").waitFor();
      await page.context().setOffline(true);
      const h = frame().locator("section[data-studio-active] h1");
      await h.dblclick();
      await page.keyboard.press("End");
      await page.keyboard.insertText(" 自分の変更");
      await page.keyboard.press("Escape");
      await f.locator("section[data-studio-active] h1").dblclick();
      await other.keyboard.press("End");
      await other.keyboard.insertText(" 相手の変更");
      await other.keyboard.press("Escape");
      await other
        .locator(".deck-edit-status")
        .filter({ hasText: "保存済み" })
        .waitFor({ timeout: 20000 });
      await page.context().setOffline(false);
      await page
        .getByRole("button", { name: "変更を確認", exact: true })
        .waitFor({ timeout: 20000 });
      await page
        .getByRole("button", { name: "変更を確認", exact: true })
        .click();
      await page
        .getByRole("textbox", {
          name: "自分の変更（コピーできます）",
          exact: true,
        })
        .waitFor();
      assert.match(
        await page
          .getByRole("textbox", {
            name: "自分の変更（コピーできます）",
            exact: true,
          })
          .inputValue(),
        /自分の変更/,
      );
      await page.screenshot({ path: out + "/04-conflict.png" });
      await page
        .getByRole("button", { name: "最新版を採用", exact: true })
        .click();
      await ready();
      await saved();
      assert.ok((await read()).html.includes("相手の変更"));
    } finally {
      await context.close();
      await page.context().setOffline(false);
    }
  });
  await test("小さい画面では左右の欄を一つずつ開ける", async () => {
    await page.setViewportSize({ width: 640, height: 400 });
    // 後ろの読む画面にも「一覧」があるので、編集の窓の中のボタンに絞る
    const editor = page.getByRole("dialog", { name: "スライドを編集" });
    await editor.getByRole("button", { name: "一覧", exact: true }).click();
    assert.ok(await page.locator(".ds-nav").isVisible());
    assert.ok(!(await page.locator(".ds-inspector").isVisible()));
    await editor.getByRole("button", { name: "調整", exact: true }).click();
    assert.ok(await page.locator(".ds-inspector").isVisible());
    assert.ok(!(await page.locator(".ds-nav").isVisible()));
    await page.screenshot({ path: out + "/05-compact.png" });
    await page.setViewportSize({ width: 1440, height: 900 });
  });
  await test("倍率を変えた後も選択枠が文字と一致する", async () => {
    await page.locator(".ds-slide").first().click();
    await frame().locator("section[data-studio-active] h1").click();
    await page.getByRole("button", { name: "＋", exact: true }).click();
    await page.waitForTimeout(100);
    const gap = await frame()
      .locator("section[data-studio-active] h1")
      .evaluate((n) => {
        const a = n.getBoundingClientRect(),
          box = n.ownerDocument
            .querySelector("div[data-deck-canvas-chrome]")
            .shadowRoot.querySelector(".box")
            .getBoundingClientRect();
        return Math.max(
          Math.abs(a.x - box.x),
          Math.abs(a.y - box.y),
          Math.abs(a.width - box.width),
          Math.abs(a.height - box.height),
        );
      });
    assert.ok(gap < 1, `選択枠のずれ: ${gap}`);
    await page.getByRole("button", { name: "全体表示", exact: true }).click();
  });
  await test("複数の要素をまとめて動かし、解除できる", async () => {
    await page.getByRole("button", { name: "＋ 挿入", exact: true }).click();
    await page.getByRole("button", { name: "テキスト", exact: true }).click();
    await ready();
    await saved();
    await page.getByRole("button", { name: "＋ 挿入", exact: true }).click();
    await page.getByRole("button", { name: "四角", exact: true }).click();
    await ready();
    await saved();
    await frame()
      .locator("section[data-studio-active] p[data-deck-created]")
      .last()
      .click();
    await frame()
      .locator("section[data-studio-active] [data-deck-shape]")
      .last()
      .click({ modifiers: ["Shift"] });
    await page.getByRole("button", { name: "グループ化", exact: true }).click();
    await ready();
    await saved();
    assert.ok((await read()).html.includes('data-deck-group="true"'));
    await page.keyboard.press("ArrowRight");
    await saved();
    await page
      .getByRole("button", { name: "グループを解除", exact: true })
      .click();
    await ready();
    await saved();
    assert.ok(!(await read()).html.includes('data-deck-group="true"'));
  });
  await test("見出し・縮小画像・操作部品の位置と寸法が揃う", async () => {
    await page.locator(".ds-slide").first().click();
    const positions = await page.locator(".deck-studio").evaluate((root) => {
      const rect = (n) => {
        const r = n.getBoundingClientRect();
        return { x: r.x, y: r.y, w: r.width, h: r.height };
      };
      return {
        left: rect(root.querySelector(".ds-nav-title")),
        right: rect(root.querySelector(".ds-inspector h2")),
        thumbs: [...root.querySelectorAll(".ds-slide .ds-thumb")].map(rect),
        icons: [...root.querySelectorAll(".ds-history-tools button")].map(rect),
        prose: root.querySelectorAll(".ds-inspector .ds-note").length,
        caption: root.querySelectorAll(".ds-slide-label").length,
      };
    });
    assert.ok(
      Math.abs(
        positions.left.y +
          positions.left.h / 2 -
          positions.right.y -
          positions.right.h / 2,
      ) <= 1,
    );
    assert.equal(positions.prose, 0);
    assert.equal(positions.caption, 0);
    assert.ok(
      positions.thumbs.every(
        (r) =>
          Math.abs(r.x - positions.thumbs[0].x) < 0.1 &&
          Math.abs(r.w - positions.thumbs[0].w) < 0.1,
      ),
    );
    assert.ok(positions.icons.every((r) => r.w === 32 && r.h === 32));
    await frame().locator("section[data-studio-active] h1").click();
    const color = await page
      .getByLabel("文字色", { exact: true })
      .boundingBox();
    assert.equal(color.width, 32);
    assert.equal(color.height, 32);
  });
  await test("隠した枚操作へキーボードで入り、説明と焦点を戻せる", async () => {
    const trigger = page.getByRole("button", {
      name: "スライドの操作",
      exact: true,
    });
    await trigger.focus();
    assert.equal(
      await page.locator(".ds-tooltip").innerText(),
      "スライドの操作",
    );
    await trigger.press("Enter");
    await page
      .getByRole("menuitem", { name: "前へ — スライド", exact: true })
      .waitFor();
    await page.keyboard.press("ArrowDown");
    assert.ok(
      await page
        .getByRole("menuitem", { name: "後ろへ — スライド", exact: true })
        .evaluate((n) => n.getRootNode().activeElement === n),
    );
    await page.keyboard.press("Escape");
    assert.ok(
      await trigger.evaluate((n) => n.getRootNode().activeElement === n),
    );
  });
  await page.screenshot({ path: out + "/03-finished.png" });
  await test("読み直しと印刷でも構成を保ち、発表者ノートを紙へ出さない", async () => {
    await saved();
    const count=await page.locator('.ds-slide').count();
    await page.goto(url+'/reader');
    await page.waitForFunction(()=>document.body.hasAttribute('data-deck-design-ready'));
    assert.equal(await page.locator('main[data-deck-slides] section[data-deck-slide]').count(),count);
    await page.emulateMedia({media:'print'});
    const print=await page.evaluate(()=>({
      notes:[...document.querySelectorAll('aside[data-deck-notes]')].every(n=>getComputedStyle(n).display==='none'),
      controls:[...document.querySelectorAll('[data-deck-toolbar],[data-deck-exit]')].every(n=>getComputedStyle(n).display==='none'),
      appendix:document.querySelector('[data-deck-focus-supplement-pages]')?.textContent??'',
    }));
    assert.equal(print.notes,true);assert.equal(print.controls,true);
    assert.ok(!print.appendix.includes('発表者だけのメモ'));
    assert.match(print.appendix,/読み手に伝える補足/);
    await page.emulateMedia({media:'screen'});
  });
  await test("実行エラーがない", async () => assert.deepEqual(errors, []));
} finally {
  await writeFile(
    out + "/results.json",
    JSON.stringify({ engine, results, errors }, null, 2),
  );
  await browser.close();
  localServer?.kill();
}
