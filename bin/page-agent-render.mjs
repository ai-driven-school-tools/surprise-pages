import { chromium } from "playwright";
import { fileURLToPath } from "node:url";
import { mkdir, mkdtemp, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  pageAgentRequest,
  pageAgentOrigin,
  pageAgentAsset,
} from "./pages-publish.mjs";

const prebuilt = new URL("./page-agent-inspection.js", import.meta.url);
const inspectionScript = existsSync(prebuilt)
  ? await readFile(prebuilt, "utf8")
  : (
      await (
        await import("esbuild")
      ).build({
        entryPoints: [
          fileURLToPath(
            new URL("../src/lib/deck/render-inspection.ts", import.meta.url),
          ),
        ],
        bundle: true,
        write: false,
        format: "iife",
        globalName: "DeckLayoutQA",
        platform: "browser",
      })
    ).outputFiles[0].text;

/** Render privately in an isolated browser. Return measurements; HTML stays in the tool. */
export async function inspectAgentPreview(
  preview,
  pageSlug,
  {
    transport = pageAgentAsset,
    origin = pageAgentOrigin(),
    output,
    browserType = chromium,
    capture = true,
    viewport = {width:1280,height:900},
    sides = ["before", "after"],
  } = {},
) {
  const directory =
    output ?? (await mkdtemp(join(tmpdir(), "pages-edit-review-")));
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const browser = await browserType.launch({
    headless: true,
    ...(browserType === chromium && !existsSync(chromium.executablePath())
      ? { channel: "chrome" }
      : {}),
  });
  let imageDensity=0;
  const evidence = [],
    images = [];
  const measurements = { before: [], after: [] };
  try {
    for (const side of sides) {
      const context = await browser.newContext({
        viewport,
        deviceScaleFactor: 1,
        serviceWorkers: "block",
      });
      await context.routeWebSocket("**/*", (socket) => socket.close());
      const tab = await context.newPage();
      const runtime = [];
      tab.on("pageerror", (error) => runtime.push(error.message));
      await context.route("**/*", async (route) => {
        const request = route.request();
        if (request.method() !== "GET") {
          await route.abort();
          return;
        }
        const url = new URL(request.url());
        if (url.origin !== origin) {
          await route.abort();
          return;
        }
        try {
          const response = await transport(url.href, pageSlug);
          await route.fulfill({
            status: response.status,
            contentType:
              response.headers.get("content-type") ??
              "application/octet-stream",
            body: Buffer.from(await response.arrayBuffer()),
          });
        } catch {
          await route.abort();
        }
      });
      // Set an absolute asset base without putting credentials in the document or browser.
      const html = preview[`${side}Html`].replace(
        /<base\s+href="([^"]*)"[^>]*>/i,
        (_, href) => `<base href="${new URL(href, origin).href}">`,
      );
      await tab.setContent(
        html.replace(
          /<head([^>]*)>/i,
          `<head$1><meta http-equiv="Content-Security-Policy" content="connect-src 'none'; frame-src 'none'; object-src 'none'; form-action 'none'">`,
        ),
        { waitUntil: "networkidle", timeout: 30000 },
      );
      await tab.addScriptTag({ content: inspectionScript });
      imageDensity=await tab.evaluate("DeckLayoutQA.DECK_IMAGE_DENSITY");
      if(!Number.isFinite(imageDensity)||imageDensity<1)throw new Error("画像検査の道具が古いため停止しました。配布物を更新してください");
      await tab.evaluate("DeckLayoutQA.waitDeckRender(document)");
      const found = await tab.evaluate(
        `DeckLayoutQA.inspectDeckLayout(${JSON.stringify(preview.slides)})`,
      );
      measurements[side] = found;
      if (runtime.length)
        for (const slideId of preview.slides)
          evidence.push({
            slideId,
            kind: "runtime",
            message: runtime[0].slice(0, 500),
          });
      for (const slide of capture ? found : []) {
        if (slide.missing) continue;
        const locator = tab.locator(`section[data-deck-node="${slide.id}"]`);
        const path = join(directory, `${side}-${slide.id}.png`);
        await locator.screenshot({ path, animations: "disabled" });
        images.push({ slideId: slide.id, side, path });
      }
      await context.close();
    }
  } finally {
    await browser.close();
  }
  const old = new Set(
    measurements.before
      .flatMap((slide) => slide.issues)
      .map((issue) => JSON.stringify(issue)),
  );
  const issues = [
    ...evidence,
    ...measurements.after
      .flatMap((slide) => slide.issues)
      .filter((issue) => issue.kind === "asset" || !old.has(JSON.stringify(issue))),
  ];
  return {
    report: {
      digest: preview.digest,
      baseVersionId: preview.baseVersionId,
      status: issues.length || preview.issues?.length ? "failed" : "passed",
      slides: preview.slides,
      issues,
      assessment: "",
      unresolved: [],
    },
    images,
    layouts: measurements.after,
    imageDensity,
  };
}
export async function verifyAgentRequest(
  page,
  id,
  assessment = "",
  unresolved = [],
) {
  if (assessment) {
    const history = await pageAgentRequest({ action: "history", page, id });
    const cached = history.verification;
    if (cached?.status === "passed")
      try {
        const verification = { ...cached, assessment, unresolved };
        const result = await pageAgentRequest({
          action: "verify",
          page,
          id,
          verification,
        });
        return { ...result, report: verification, images: [], reused: true };
      } catch (error) {
        if (!["recheck_required", "conflict"].includes(error.details?.code))
          throw error;
      }
  }
  const preview = await pageAgentRequest({ action: "preview", page, id });
  const read = await pageAgentRequest({ action: "read", page });
  const inspected = await inspectAgentPreview(preview, read.page);
  inspected.report.assessment = assessment;
  inspected.report.unresolved = unresolved;
  const result = await pageAgentRequest({
    action: "verify",
    page: read.page,
    id,
    verification: inspected.report,
  });
  return { ...result, report: inspected.report, images: inspected.images };
}

export async function inspectAgentLayout(args) {
  const input = await pageAgentRequest({
    ...args,
    action: "read",
    view: "layout",
  });
  const result = await inspectAgentPreview(
    {
      beforeHtml: input.previewHtml,
      afterHtml: input.previewHtml,
      baseVersionId: input.versionId,
      digest: "",
      slides: input.slides,
      issues: [],
    },
    input.page,
    { capture: false, sides: ["after"] },
  );
  return {
    page: input.page,
    versionId: input.versionId,
    canvas: { width: 1280, height: 720 },
    slides: result.layouts.map((slide) => ({
      ...slide,
      nodes: slide.nodes?.filter((node) => input.targets.includes(node.id)),
    })),
  };
}
