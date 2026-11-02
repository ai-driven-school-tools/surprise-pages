/** Real MCP → authenticated API → PostgreSQL → renderer → editor. All data is isolated. */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
const { chromium, webkit } = await import(
  process.env.PLAYWRIGHT_MODULE ?? "playwright"
);
const directory = await mkdtemp(join(tmpdir(), "pages-agent-workflow-"));
const out = process.env.DECK_QA_OUTPUT ?? "/tmp/page-agent-workflow";
await mkdir(out, { recursive: true });
await build({
  stdin: {
    contents:
      "export {newDeckDocument} from './src/lib/deck/new-document';export {authorSlide} from './src/lib/deck/authoring';",
    resolveDir: process.cwd(),
  },
  outfile: join(directory, "author.mjs"),
  bundle: true,
  platform: "node",
  format: "esm",
});
const author = await import(pathToFileURL(join(directory, "author.mjs")));
const html = (await author.newDeckDocument()).replace(
  "</main>",
  author.authorSlide("comparison", "comparison") +
    author.authorSlide("chart", "chart") +
    "</main>",
);
await writeFile(join(directory, "sample.html"), html, { mode: 0o600 });
const server = spawn(process.execPath, ["scripts/dev/preview-deck-editor.mjs"], {
  env: {
    ...process.env,
    PORT: "0",
    DECK_EDIT_SAMPLE: join(directory, "sample.html"),
    DECK_EDIT_NEW: "0",
  },
  stdio: ["ignore", "pipe", "pipe"],
});
let serverErrors = "";
server.stderr.on("data", (data) => (serverErrors += data));
const origin = await new Promise((resolve, reject) => {
  const timer = setTimeout(
    () => reject(new Error("Preview timeout " + serverErrors)),
    20000,
  );
  server.stdout.on("data", (data) => {
    const match = String(data).match(/http:\/\/127\.0\.0\.1:\d+/);
    if (match) {
      clearTimeout(timer);
      resolve(match[0]);
    }
  });
  server.once("exit", () => {
    clearTimeout(timer);
    reject(new Error(serverErrors));
  });
});
const pageRef = "internal/example/design",
  engine = process.env.DECK_BROWSER ?? "chromium";
const browser = await (engine === "webkit" ? webkit : chromium).launch({
  headless: true,
  ...(!process.env.PLAYWRIGHT_MODULE && engine === "chromium"
    ? { channel: "chrome" }
    : {}),
});
const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
  }),
  page = await context.newPage(),
  errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const client = new Client({ name: "workflow-test", version: "1" });
await client.connect(
  new StdioClientTransport({
    command: process.execPath,
    args: ["bin/pages-agent.mjs"],
    env: {
      ...process.env,
      PAGES_HOST: origin,
      PAGES_TOKEN_ORIGIN: origin,
      PAGES_TOKEN: "local-test-only",
    },
  }),
);
let bytes = 0;
const results = [];
const call = async (name, args) => {
  const response = await client.callTool({
    name,
    arguments: { page: pageRef, ...args },
  });
  const text = response.content
    .filter((c) => c.type === "text")
    .map((c) => c.text)
    .join("");
  bytes += Buffer.byteLength(text);
  const result = JSON.parse(text);
  if (response.isError) {
    const error = new Error(result.error);
    error.details = result;
    throw error;
  }
  return result;
};
const test = async (name, fn) => {
  const start = Date.now();
  await fn();
  results.push({ name, ms: Date.now() - start });
  console.log("OK " + name);
};
let overview, heading, chart, id, paragraph;
try {
  await test("リンクから概要だけを取得", async () => {
    overview = await call("page_read", {});
    assert.equal(overview.total, 3);
    assert.equal(overview.html, undefined);
  });
  await test("文字とグラフを必要な枚から取得", async () => {
    const a = await call("page_read", {
      view: "detail",
      target: "opening",
      versionId: overview.versionId,
    });
    const b = await call("page_read", {
      view: "detail",
      target: "chart",
      versionId: overview.versionId,
    });
    const c = await call("page_read", {
      view: "detail",
      target: "comparison",
      versionId: overview.versionId,
    });
    heading = a.nodes.find((n) => n.tag === "h1");
    chart = b.nodes.find((n) => n.chart);
    paragraph = c.nodes.find(
      (n) => n.tag === "p" && n.textRuns.some((t) => t.text.trim()),
    );
    assert.ok(heading && chart && paragraph);
  });
  await test("画像を取らずに実寸と書体を読む", async () => {
    const layout = await call("page_read", {
      view: "layout",
      target: "opening",
      versionId: overview.versionId,
    });
    assert.equal(layout.previewHtml, undefined);
    assert.ok(
      layout.slides[0].nodes.some(
        (node) =>
          node.id === heading.id &&
          node.width > 0 &&
          parseFloat(node.fontSize) > 0,
      ),
    );
  });
  await test("人間の編集画面を開く", async () => {
    await page.goto(`${origin}/?edit=1`);
    await page
      .locator(".deck-edit-status")
      .filter({ hasText: "保存済み" })
      .waitFor();
  });
  await test("見出し・グラフ・枚順を一つの依頼にまとめる", async () => {
    const point = chart.chart.data.series[0].data[0];
    const result = await call("page_prepare", {
      baseVersionId: overview.versionId,
      summary: "提案を分かりやすく更新",
      client: "Codex",
      operations: [
        {
          kind: "text",
          target: heading.id,
          run: 0,
          before: heading.textRuns[0].text,
          after: "伝わる資料を、もっと簡単に。",
        },
        {
          kind: "chart-value",
          target: chart.id,
          seriesId: chart.chart.data.series[0].id,
          pointId: point.id,
          before: point.value,
          after: 42,
        },
        {
          kind: "order",
          target: "deck-root",
          before: overview.rootOrder,
          after: ["opening", "chart", "comparison"],
        },
      ],
    });
    id = result.id;
    assert.equal(result.status, "prepared");
  });
  await test("別の人が別箇所を先に保存", async () => {
    const r = await fetch(`${origin}/api/pages/deck-edit`, {
      method: "PATCH",
      headers: {
        cookie: "deck-test-user=second",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        page: pageRef,
        sessionId: crypto.randomUUID(),
        operationId: crypto.randomUUID(),
        baseVersionId: overview.versionId,
        operations: [
          {
            kind: "text",
            target: paragraph.id,
            run: 0,
            before: paragraph.textRuns[0].text,
            after: "共同編集の追記",
          },
        ],
      }),
    });
    assert.equal(r.status, 200, await r.text());
  });
  await test("MCPが別のブラウザで描画を検査", async () => {
    const result = await call("page_verify", {
      id,
      assessment: "見出しと数字の対応を確認",
    });
    assert.equal(result.status, "passed", JSON.stringify(result));
    assert.ok(result.images.length);
  });
  await test("他の人の追記を残して反映・再送", async () => {
    assert.equal((await call("page_apply", { id })).status, "saved");
    assert.equal((await call("page_apply", { id })).replayed, true);
    const c = await call("page_read", { view: "detail", target: "comparison" });
    assert.ok(
      c.nodes.some((n) => n.textRuns.some((t) => t.text === "共同編集の追記")),
    );
  });
  await test("開いたままの編集画面へ変更が届く", async () => {
    await page
      .frameLocator("iframe.edit-frame")
      .getByText("伝わる資料を、もっと簡単に。", { exact: true })
      .waitFor({ timeout: 15000 });
  });
  await test("依頼の前後と追加指示を確認", async () => {
    await page.goto(`${origin}/?edit=1&change=${id}`);
    const dialog = page.locator("dialog.agent-review");
    await dialog.getByRole("button", { name: "変更前", exact: true }).waitFor();
    await page.evaluate(()=>Object.defineProperty(navigator,"clipboard",{configurable:true,value:{writeText:async value=>{window.copiedReviewInstruction=value;}}}));
    await dialog.getByRole("button", { name: "変更前", exact: true }).click();
    await page.waitForTimeout(300);
    await dialog.getByRole("button",{name:"追加指示をコピー",exact:true}).click();
    let instruction=await page.evaluate(()=>window.copiedReviewInstruction);
    assert.ok(instruction.includes(`change=${id}`)&&instruction.includes(`保存した操作: ${id}`));
    assert.ok(instruction.includes("この操作の変更前"));
    await dialog.getByRole("button", { name: "変更後", exact: true }).click();
    await page.waitForTimeout(500);
    await dialog.getByRole("button",{name:"追加指示をコピー",exact:true}).click();
    instruction=await page.evaluate(()=>window.copiedReviewInstruction);
    assert.ok(instruction.includes(`change=${id}`)&&instruction.includes("この操作の変更後"));
    assert.ok(await dialog.getByText("確認済み", { exact: true }).count());
    // The paper stays beside the changes, with actions reachable at desktop and zoomed sizes.
    for (const viewport of [{ width: 1440, height: 900 }, { width: 1280, height: 800 }, { width: 640, height: 400 }, { width: 390, height: 844 }]) {
      await page.setViewportSize(viewport);
      await page.waitForTimeout(200);
      const bounds = await dialog.evaluate((element) => {
        const rect = (selector) => {
          const node = element.querySelector(selector);
          const box = node.getBoundingClientRect();
          return { x: box.x, y: box.y, width: box.width, height: box.height, right: box.right, bottom: box.bottom };
        };
        return { modal: rect("header"), sidebar: rect(".review-sidebar"), preview: rect("main"), frame: rect("iframe.review-slide"), footer: rect("footer"), width: element.clientWidth, scrollWidth: element.scrollWidth };
      });
      assert.ok(bounds.footer.bottom <= viewport.height, JSON.stringify(bounds));
      assert.ok(bounds.scrollWidth <= bounds.width, "dialog must not overflow horizontally");
      assert.ok(Math.abs(bounds.frame.width / bounds.frame.height - 16 / 9) < 0.02, "preview retains the complete slide ratio");
      if (viewport.width > 600) {
        assert.ok(bounds.frame.bottom <= bounds.footer.y, "slide must fit above actions");
        assert.ok(bounds.preview.right <= bounds.sidebar.x + 1, "details must not cover the slide");
      }
      await page.screenshot({ path: join(out, `${engine}-review-${viewport.width}.png`) });
    }
    await page.setViewportSize({ width: 1280, height: 800 });
    assert.deepEqual(await dialog.locator(".review-slide-number").allTextContents(), ["1", "2", "3"]);
    assert.ok(!(await dialog.locator(".review-text-pair").innerText()).includes("現状を共有"), "unchanged paragraphs should not crowd the difference");
    await dialog.getByText("自動検査", { exact: true }).click();
    await dialog.getByText("見出しと数字の対応を確認", { exact: true }).waitFor();
    await dialog.getByText("自動検査", { exact: true }).click();
    await page.screenshot({ path: join(out, `${engine}-review.png`) });
    await dialog.getByRole("button", { name: "閉じる", exact: true }).click();
  });
  await test("今回の依頼だけを取り消す", async () => {
    const head = await call("page_read", {});
    const undo = await call("page_revert", {
      baseVersionId: head.versionId,
      undoId: id,
    });
    assert.equal((await call("page_verify", { id: undo.id })).status, "passed");
    assert.equal((await call("page_apply", { id: undo.id })).status, "saved");
    const next = await call("page_read", {});
    assert.deepEqual(next.rootOrder, overview.rootOrder);
    const c = await call("page_read", { view: "detail", target: "comparison" });
    assert.ok(
      c.nodes.some((n) => n.textRuns.some((t) => t.text === "共同編集の追記")),
    );
  });
  await test("開いていたグラフ入力で他者の値を巻き戻さない", async () => {
    await page.goto(`${origin}/?edit=1&target=chart`);
    await page
      .frameLocator("iframe.edit-frame")
      .locator("section[data-studio-active] [data-dd-chart]")
      .waitFor();
    await page
      .frameLocator("iframe.edit-frame")
      .locator("section[data-studio-active] [data-dd-chart]")
      .dblclick();
    await page
      .getByRole("textbox", { name: "2行 2列", exact: true })
      .fill("53");
    const head = await call("page_read", {}),
      detail = await call("page_read", {
        view: "detail",
        target: "chart",
        versionId: head.versionId,
      }),
      chart = detail.nodes.find((node) => node.chart),
      series = chart.chart.data.series[0];
    const remote = await call("page_prepare", {
      baseVersionId: head.versionId,
      summary: "別の値を更新",
      operations: [
        {
          kind: "chart-value",
          target: chart.id,
          seriesId: series.id,
          pointId: series.data[1].id,
          before: series.data[1].value,
          after: 72,
        },
      ],
    });
    await call("page_verify", { id: remote.id });
    await call("page_apply", { id: remote.id });
    await page.waitForTimeout(1500);
    await page.getByRole("button", { name: "反映", exact: true }).click();
    await page
      .locator(".deck-edit-status")
      .filter({ hasText: "保存済み" })
      .waitFor();
    const next = await call("page_read", { view: "detail", target: chart.id });
    assert.deepEqual(
      next.nodes[0].chart.data.series[0].data
        .slice(0, 2)
        .map((point) => point.value),
      [53, 72],
    );
  });
  await test("はみ出す変更は検査で止まり保存しない", async () => {
    const head = await call("page_read", {});
    const detail = await call("page_read", {
      view: "detail",
      target: "opening",
      versionId: head.versionId,
    });
    const text = detail.nodes.find((n) => n.tag === "h1");
    const bad = await call("page_prepare", {
      baseVersionId: head.versionId,
      summary: "はみ出し検査",
      operations: [
        {
          kind: "style",
          target: text.id,
          property: "translate",
          before: text.style.translate ?? null,
          after: "5000px 0px",
        },
      ],
    });
    const report = await call("page_verify", { id: bad.id });
    assert.equal(report.status, "failed");
    await assert.rejects(call("page_apply", { id: bad.id }));
    assert.equal((await call("page_read", {})).versionId, head.versionId);
  });
  await test("透明な要素が文字を覆う配置を検出する", async () => {
    const { inspectAgentPreview } = await import(
      "../../../bin/page-agent-render.mjs"
    );
    const before =
      '<html><head></head><body style="margin:0"><section data-deck-slide data-deck-node="one" style="width:1280px;height:720px;position:relative"><h1 data-deck-node="title" style="position:absolute;left:40px;top:20px;width:600px;height:60px">見出し</h1><div data-deck-node="cover" style="position:absolute;left:0;top:120px;width:1000px;height:400px"></div></section></body></html>';
    const result = await inspectAgentPreview(
      {
        beforeHtml: before,
        afterHtml: before.replace("top:20px", "top:180px"),
        digest: "x",
        baseVersionId: "v",
        slides: ["one"],
        issues: [],
      },
      pageRef,
      {
        origin,
        browserType: engine === "webkit" ? webkit : chromium,
        capture: false,
      },
    );
    assert.equal(result.report.status, "failed");
    assert.ok(
      result.report.issues.some((issue) => issue.message.includes("直接選択")),
    );
  });
  await test("表示中に予期しない例外がない", async () =>
    assert.deepEqual(errors, []));
  await writeFile(
    join(out, `${engine}-results.json`),
    JSON.stringify(
      {
        results,
        modelTextBytes: bytes,
        fullHtmlBytes: Buffer.byteLength(html),
      },
      null,
      2,
    ),
  );
} finally {
  await client.close();
  await browser.close();
  server.kill();
}
