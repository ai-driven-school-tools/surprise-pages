import { test, expect } from "playwright/test";
import { readFile } from "node:fs/promises";
import path from "node:path";

/**
 * 英語の画面（多言語対応・docs/guides/i18n.md）。ほかの spec は日本語に固定してある（playwright.config.ts の locale）ので、
 * ここだけ英語のブラウザとして開き、言語の決め方（個人設定 → ブラウザの言語 → 日本語）を画面で確かめる。
 */
test.use({ locale: "en-US" });

async function login(context, role = "owner") {
  const v = JSON.parse(await readFile(path.join(process.env.PAGES_TEST_RUNTIME ?? ".test-runtime", "session.json"), "utf8"));
  await context.addCookies([{ name: "authjs.session-token", value: v.sessions[role], url: v.origin, httpOnly: true, sameSite: "Lax" }]);
}

test("an English browser gets the English workspace and the language follows the setting", async ({ page, context }) => {
  await login(context);
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.getByRole("heading", { name: "Home", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "My files", exact: true })).toBeVisible();
  // 「会社の資料」は組織の名前で言う。英語は所有格を避けて「Files — <組織>」
  await expect(page.getByRole("link", { name: "Files — owner", exact: true })).toBeVisible();

  // 外枠が決まった言語を写しておく（本文ページの道具箱・窓口の断り文はこれで決める）
  await expect.poll(async () => (await context.cookies()).find((cookie) => cookie.name === "sp-locale")?.value).toBe("en");

  await page.getByRole("link", { name: "Settings", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Settings", exact: true })).toBeVisible();
  const language = page.getByRole("group", { name: "Screen language" });
  await language.getByRole("button", { name: "日本語", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "ja");
  await expect(page.getByRole("heading", { name: "個人設定", exact: true })).toBeVisible();
  await expect.poll(async () => (await context.cookies()).find((cookie) => cookie.name === "sp-locale")?.value).toBe("ja");

  // 「自動」に戻すと、またブラウザの言語（英語）に従う。ほかの spec のために必ず戻す
  await page.getByRole("group", { name: "画面の言語" }).getByRole("button", { name: "自動", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.getByRole("heading", { name: "Settings", exact: true })).toBeVisible();
});

test("the not-found screen is English for an English browser", async ({ page, context }) => {
  await login(context);
  await page.goto("/no-such-screen-for-english-check");
  await expect(page.getByRole("heading", { name: "This page doesn't exist", exact: true })).toBeVisible();
});

test("the toolbox on a page follows the copied language", async ({ page, context }) => {
  await login(context);
  await page.goto("/");
  await expect.poll(async () => (await context.cookies()).find((cookie) => cookie.name === "sp-locale")?.value).toBe("en");
  await page.goto("/internal/test/article");
  // 道具箱は描く前に写しの言語で決まる。コメントの札が英語で出る（日本語なら「コメント」）
  const toolbox = page.locator("surprise-comments");
  await expect(toolbox.getByRole("button", { name: /^Comments( \d+)?$/ })).toBeVisible();
  await expect(toolbox.getByRole("button", { name: /^コメント/ })).toHaveCount(0);
});
