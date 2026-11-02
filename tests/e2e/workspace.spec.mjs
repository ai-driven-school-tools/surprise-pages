import { test, expect } from "playwright/test";
import { readFile } from "node:fs/promises";
import path from "node:path";
async function login(context, role = "owner") {
  const v = JSON.parse(
    await readFile(
      path.join(
        process.env.PAGES_TEST_RUNTIME ?? ".test-runtime",
        "session.json",
      ),
      "utf8",
    ),
  );
  await context.addCookies([
    {
      name: "authjs.session-token",
      value: v.sessions[role],
      url: v.origin,
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
}
test("workspace navigation keeps the document and sidebar mounted", async ({ page, context }) => {
  await login(context);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "ホーム", exact: true })).toBeVisible();
  await page.evaluate(() => {
    document.documentElement.dataset.navigationProbe = "preserved";
    document.querySelector(".ws-sidebar").dataset.navigationProbe = "preserved";
  });
  for (const [label, href] of [["owner の資料", "/library"], ["自分の資料", "/mine"], ["個人設定", "/settings"], ["ホーム", "/"]]) {
    await page.getByRole("link", { name: label, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(href === "/" ? "/$" : href + "$"));
    await expect(page.getByRole("heading", { name: label, exact: true })).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("data-navigation-probe", "preserved");
    await expect(page.locator(".ws-sidebar")).toHaveAttribute("data-navigation-probe", "preserved");
  }
  await page.goBack();
  await expect(page.getByRole("heading", { name: "個人設定", exact: true })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "メニューを開く" }).click();
  await page.getByRole("dialog").getByRole("link", { name: "owner の資料", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "owner の資料", exact: true })).toBeVisible();
});

test("home lists what was opened, and what others published until it is opened", async ({ page, context }) => {
  // 作った人のホーム: 開いた資料が「最近開いたもの」に並び、自分の資料は「ほかの人の新しい資料」に出ない
  await login(context);
  await page.goto("/");
  // 見た記録を積む口は同じサイトからの要求だけ受ける（送り元を付けて叩く）
  const origin = new URL(page.url()).origin;
  expect((await page.request.post("/api/views", { headers: { origin }, data: { page: "internal/test/article" } })).status()).toBe(200);
  await page.reload();
  await expect(page.getByRole("heading", { name: "ホーム", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "作成", exact: true })).toBeVisible();
  // 見本は題が同じ資料が複数あるので、行は行き先で見分ける（ほかの検査が先に積んだ記録が混ざっていてもよい）
  const recent = page.getByRole("region", { name: "最近開いたもの", exact: true });
  await expect(recent.locator('a[href="/internal/test/article"]')).toBeVisible();
  await expect(recent.getByRole("link", { name: "すべて見る", exact: true })).toHaveAttribute("href", "/activity");
  const fresh = page.getByRole("region", { name: "ほかの人の新しい資料", exact: true });
  await expect(fresh.getByText("新しい資料はありません")).toBeVisible();
  // 共有された資料は無い（作った人は名簿に載らない）。コメントの節は、ほかの検査が付けたコメントの有無で変わるので見ない
  await expect(page.getByRole("heading", { name: "共有された資料", exact: true })).toHaveCount(0);

  // 読むだけの人のホーム: ほかの人（作った人）の資料が新しい資料に並び、開いたら消えて「最近開いたもの」へ移る
  await login(context, "reader");
  await page.goto("/");
  const others = page.getByRole("region", { name: "ほかの人の新しい資料", exact: true });
  // 並ぶのは件数の上限まで（新しい順）。先頭の 1 枚で「開いたら消える」を見る
  const first = others.locator(".ws-row-title").first();
  await expect(first).toBeVisible();
  const href = await first.getAttribute("href");
  expect(href).toMatch(/^\/internal\//);
  // 名簿の外の資料（見る人を絞った private）は、どの節にも出ない
  await expect(page.locator('a[href="/internal/test/private"]')).toHaveCount(0);
  const slug = "internal/" + href.slice("/internal/".length);
  expect((await page.request.post("/api/views", { headers: { origin }, data: { page: slug } })).status()).toBe(200);
  await page.reload();
  await expect(page.getByRole("region", { name: "最近開いたもの", exact: true }).locator(`a[href="${href}"]`)).toBeVisible();
  await expect(page.getByRole("region", { name: "ほかの人の新しい資料", exact: true }).locator(`a[href="${href}"]`)).toHaveCount(0);
});

test("activity tabs switch without another server request", async ({ page, context }) => {
  await login(context);
  await page.goto("/activity");
  await expect(page.getByRole("button", { name: "見たページ", exact: true })).toBeVisible();
  const requests = [];
  page.on("request", request => {
    if (new URL(request.url()).pathname === "/activity" && request.url().includes("_rsc=")) requests.push(request);
  });
  await page.getByRole("button", { name: "書いたコメント", exact: true }).click();
  await expect(page.getByRole("button", { name: "書いたコメント", exact: true })).toHaveAttribute("aria-current", "page");
  await page.getByRole("button", { name: "見たページ", exact: true }).click();
  await expect(page.getByRole("button", { name: "見たページ", exact: true })).toHaveAttribute("aria-current", "page");
  // The sidebar link prefetch of /activity may start at any time. WebKit's early
  // request event can omit the prefetch header that is actually sent (CI trace
  // of ff485ba), so judge each request by the headers it really carried.
  const sent = async request => {
    const early = request.headers();
    const actual = await Promise.race([request.allHeaders(), new Promise(resolve => setTimeout(() => resolve(early), 5000))]);
    return actual["next-router-prefetch"] || early["next-router-prefetch"] ? null : request.url();
  };
  expect((await Promise.all(requests.map(sent))).filter(Boolean)).toEqual([]);
});

test("settings always confirms deletion of account viewing history", async ({ page, context }) => {
  await login(context);
  await page.goto("/settings");
  await page.getByRole("button", { name: "見たページの記録を全部消す", exact: true }).click();
  await expect(page.getByText("このブラウザとアカウントに残っている分を消します。", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "やめる", exact: true }).click();
  await page.getByRole("button", { name: "記録を残さない", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "記録を残さない" }).getByRole("button", { name: "消して残さない", exact: true })).toBeVisible();
});
test("personal workspace, formats, search and favorite persistence", async ({
  page,
  context,
}) => {
  await login(context);
  await page.goto("/mine?q=/test/");
  await expect(
    page.getByRole("heading", { name: "自分の資料", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".ws-row-title")).toHaveCount(4);
  await page.getByRole("button", { name: "絞り込み", exact: true }).click();
  await page.getByLabel("形式", { exact: true }).selectOption("deck");
  await expect(page.locator(".ws-row-title")).toHaveCount(1);
  await page
    .getByRole("button", { name: "お気に入りに追加", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "お気に入りから外す", exact: true }),
  ).toBeVisible();
  // 星を付けると、サイドバーに「お気に入り」のまとまりが現れ、その資料の名前が直接並ぶ
  const favoritesNav = page.getByRole("navigation", { name: "お気に入り", exact: true });
  // 見出し（一覧へのリンク）＋ 星を付けた 1 枚
  await expect(favoritesNav.getByRole("link")).toHaveCount(2);
  // 長い題の資料（serve-app.mjs の internal/sidebar/long-title）にも星を付ける。名前は省略され、サイドバーの幅からはみ出さない
  const origin = new URL(page.url()).origin;
  expect((await page.request.post("/api/workspace", { headers: { origin }, data: { action: "favorite", page: "internal/sidebar/long-title", selected: true } })).status()).toBe(200);
  await page.reload();
  await expect(favoritesNav.getByRole("link")).toHaveCount(3);
  // サイドバーから開いたページの現在地の行にも星があり、そこで外せる（戻ったときの一覧とも食い違わない）
  await page.goto("/internal/sidebar/long-title");
  const pageStar = page.locator("surprise-location").getByRole("button", { name: /お気に入り/ });
  await expect(pageStar).toHaveAttribute("aria-pressed", "true");
  await expect(pageStar).toHaveAccessibleName("お気に入りから外す");
  await pageStar.click();
  await expect(pageStar).toHaveAttribute("aria-pressed", "false");
  await expect(pageStar).toHaveAccessibleName("お気に入りに追加");
  await page.reload();
  await expect(pageStar).toHaveAttribute("aria-pressed", "false");
  await pageStar.click();
  await expect(pageStar).toHaveAttribute("aria-pressed", "true");
  await page.goto("/mine?q=/test/");
  await expect(favoritesNav.getByRole("link")).toHaveCount(3);
  const sidebar = page.locator(".ws-sidebar");
  const longRow = sidebar.locator(".ws-nav-favorite").filter({ hasText: "サイドバーの幅を超える長い題" });
  const sidebarBox = await sidebar.boundingBox();
  const rowBox = await longRow.locator(".ws-nav-item").boundingBox();
  expect(rowBox.x + rowBox.width).toBeLessThanOrEqual(sidebarBox.x + sidebarBox.width);
  // 行を右クリックすると「開く」「お気に入りから外す」のメニューが開く
  await longRow.click({ button: "right" });
  await expect(page.getByRole("menuitem", { name: "開く", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menuitem", { name: "開く", exact: true })).toHaveCount(0);
  // 行に指を乗せると右端に星が出て、押すとその場で外せる。外した行だけ消え、まとまりは残る
  const rowStar = longRow.getByRole("button", { name: "サイドバーの幅を超える長い題の検査用の記事 — 請求・実測・削減案・採算の完全版をお気に入りから外す", exact: true });
  await page.mouse.move(0, 0);
  // 消える途中（120ms の遷移）を読まないよう、落ち着くまで待つ
  await expect.poll(() => rowStar.evaluate((node) => getComputedStyle(node).opacity)).toBe("0");
  await longRow.hover();
  await expect.poll(() => rowStar.evaluate((node) => getComputedStyle(node).opacity)).toBe("1");
  await rowStar.click();
  await expect(longRow).toHaveCount(0);
  await expect(favoritesNav.getByRole("link")).toHaveCount(2);
  await page.reload();
  await expect(favoritesNav.getByRole("link")).toHaveCount(2);
  // Follow the app navigation while its favorite refresh settles. A document
  // navigation can race that refresh in WebKit and interrupt the test itself.
  await favoritesNav.getByRole("link", { name: "お気に入り", exact: true }).click();
  await page.waitForURL("**/favorites");
  await expect(page.locator(".ws-row-title")).toHaveCount(1);
  await page.reload();
  await expect(page.locator(".ws-row-title")).toHaveCount(1);
  await page
    .getByRole("button", { name: "お気に入りから外す", exact: true })
    .click();
  await expect(page.getByText("お気に入りはまだありません")).toBeVisible();
  // 星が 0 件になると、サイドバーのまとまりごと消える
  await expect(page.getByRole("navigation", { name: "お気に入り", exact: true })).toHaveCount(0);
  await page.getByRole("link", { name: "owner の資料", exact: true }).click();
  await page.waitForURL("**/library");
  await page.getByRole("textbox", { name: "owner の資料を検索" }).fill("ｹﾝｻｸﾆﾅｲ");
  await expect(page.getByText("条件に合う資料がありません")).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("textbox", { name: "owner の資料を検索" }),
  ).toHaveValue("ｹﾝｻｸﾆﾅｲ");
});
test("reader and admin start with their own empty shelf", async ({
  page,
  context,
}) => {
  await login(context, "reader");
  await page.goto("/mine?q=/test/");
  await expect(page.locator(".ws-row-title")).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "管理", exact: true }),
  ).toHaveCount(0);
  await page.goto("/library?q=/test/");
  await expect(page.locator(".ws-row-title")).toHaveCount(3);
  await expect(page.locator('a[href="/internal/test/private"]')).toHaveCount(0);
  // 配布版の管理者は設置した本人。自分の資料が並び、「管理」（招待の一覧）の入口が出る
  await login(context, "admin");
  await page.goto("/mine?q=/test/");
  await expect(page.locator(".ws-row-title")).toHaveCount(4);
  await expect(
    page.getByRole("link", { name: "管理", exact: true }),
  ).toBeVisible();
});
test("creation guide is explicit and creates no document", async ({
  page,
  context,
}) => {
  await login(context);
  await page.goto("/create");
  await page.getByRole("button", { name: /文書/ }).click();
  await expect(
    page.getByRole("dialog", { name: "AIで文書を作成" }),
  ).toBeVisible();
  await expect(page.getByLabel("AIへの依頼文")).toContainText("社内限定");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: /文書/ })).toBeFocused();
});
test("appearance persists and mobile menu has no overflow", async ({
  page,
  context,
}, info) => {
  await login(context);
  await page.goto("/settings");
  await page.getByRole("button", { name: "ダーク", exact: true }).click();
  await expect(page.locator(".ws-shell")).toHaveAttribute(
    "data-appearance",
    "dark",
  );
  await page.reload();
  await expect(page.locator(".ws-shell")).toHaveAttribute(
    "data-appearance",
    "dark",
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/?q=/test/");
  await expect(
    page.getByRole("button", { name: "メニューを開く" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: info.outputPath("workspace-mobile-dark.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "メニューを開く" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "メニューを開く" }),
  ).toBeFocused();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/settings");
  await page.getByRole("button", { name: "ライト", exact: true }).click();
  await expect(page.locator(".ws-shell")).toHaveAttribute(
    "data-appearance",
    "light",
  );
  await page.goto("/?q=/test/");
  await page.screenshot({
    path: info.outputPath("workspace-desktop.png"),
    fullPage: true,
  });
});
test("anonymous public activity does not receive company navigation", async ({
  page,
}) => {
  await page.goto("/activity");
  await expect(page.locator(".ws-sidebar")).toHaveCount(0);
});

test("row menu supports keyboard return and opens article editing", async ({
  page,
  context,
}) => {
  await login(context);
  await page.goto("/mine?q=/test/article");
  const button = page.getByRole("button", {
    name: "検査用の記事の操作",
    exact: true,
  });
  await button.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("menuitem", { name: "編集", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(button).toBeFocused();
  await button.click();
  await page.getByRole("menuitem", { name: "編集", exact: true }).click();
  await expect(page.locator("iframe.edit-frame")).toBeVisible();
});

test("search asks the server as typing pauses and keeps every typed character", async ({
  page,
  context,
}) => {
  await login(context);
  await page.goto("/mine");
  await expect(page.getByRole("heading", { name: "自分の資料", exact: true })).toBeVisible();
  const search = page.getByRole("textbox", { name: "自分の資料を検索" });
  await search.click();
  // 問い合わせの待ちより長い間をあけて 1 字ずつ打つ。返事が次の打鍵と重なっても字を戻さない
  await page.keyboard.type("/test/", { delay: 320 });
  await expect(search).toHaveValue("/test/");
  await expect(page).toHaveURL(/[?&]q=%2Ftest%2F$/);
  await expect(page.locator(".ws-row-title")).toHaveCount(4);
  await expect(page.getByRole("status").filter({ hasText: /^4件$/ })).toHaveCount(1);
  // 形式を選んだ直後も、選んだ値がそのまま見えていて、検索語も保たれる
  await page.getByRole("button", { name: "絞り込み", exact: true }).click();
  await page.getByLabel("形式", { exact: true }).selectOption("deck");
  await expect(page.getByLabel("形式", { exact: true })).toHaveValue("deck");
  await expect(page.locator(".ws-row-title")).toHaveCount(1);
  await expect(page).toHaveURL(/q=%2Ftest%2F/);
  await expect(search).toHaveValue("/test/");
  // 戻ると、その時の条件の一覧に戻る
  await page.goBack();
  await expect(page.locator(".ws-row-title")).toHaveCount(4);
  await expect(page.getByLabel("形式", { exact: true })).toHaveValue("");
  // 検索の待ちの間に形式を選んでも、どちらの条件も落ちない
  await search.fill("/test/a");
  await page.getByLabel("形式", { exact: true }).selectOption("deck");
  await expect(page).toHaveURL(/q=%2Ftest%2Fa/);
  await expect(page).toHaveURL(/kind=deck/);
  await expect(search).toHaveValue("/test/a");
  await expect(page.getByLabel("形式", { exact: true })).toHaveValue("deck");
});

test("IME input waits for conversion and filters retain their scope", async ({
  page,
  context,
}) => {
  await login(context);
  await page.goto("/mine");
  const search = page.getByRole("textbox", { name: "自分の資料を検索" });
  await search.evaluate((input) => {
    input.dispatchEvent(
      new CompositionEvent("compositionstart", { bubbles: true }),
    );
    const setter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    ).set;
    setter.call(input, "けんさ");
    input.dispatchEvent(
      new InputEvent("input", {
        bubbles: true,
        isComposing: true,
        data: "けんさ",
      }),
    );
  });
  expect(new URL(page.url()).searchParams.get("q")).toBe(null);
  await search.dispatchEvent("compositionend");
  await expect(page).toHaveURL(/q=/);
  await expect(search).toHaveValue("けんさ");
});

test("settings toggles show the press before the server answers, and revert on failure", async ({ page, context }) => {
  await login(context);
  await page.goto("/settings");
  // 外観の切り替え（端末に合わせる ⇄ ダーク）で見る。文字は変わらないので、断りの文の確かめもそのまま効く
  const group = page.getByRole("group", { name: "画面の外観", exact: true });
  const on = group.getByRole("button", { name: "ダーク", exact: true });
  const off = group.getByRole("button", { name: "端末に合わせる", exact: true });
  // 前の検査が外観を変えていても、ここから始める
  if ((await off.getAttribute("aria-pressed")) !== "true") { await off.click(); }
  await expect(off).toHaveAttribute("aria-pressed", "true");
  // 返事を止めておく。押した瞬間に「オン」が立ち、部品は無効にならない
  let release = () => {};
  const held = new Promise((resolve) => { release = resolve; });
  let answered = () => {};
  const answer = new Promise((resolve) => { answered = resolve; });
  await page.route("**/api/workspace", async (route) => { await held; await route.continue(); answered(); });
  await on.click();
  await expect(on).toHaveAttribute("aria-pressed", "true", { timeout: 300 });
  await expect(on).toBeEnabled();
  await expect(off).toBeEnabled();
  // 返事が届いて画面を取り直しても、押した値は 1 度も戻らない
  release();
  await answer;
  await page.unroute("**/api/workspace");
  for (let i = 0; i < 10; i += 1) {
    expect(await on.getAttribute("aria-pressed")).toBe("true");
    await page.waitForTimeout(100);
  }
  await page.reload();
  await expect(on).toHaveAttribute("aria-pressed", "true");
  // 保存に失敗したら、押した値は元に戻り、失敗だけを字で告げる（断りも止めておき、届く前は押した値のまま）
  let fail = () => {};
  const failing = new Promise((resolve) => { fail = resolve; });
  let refused = () => {};
  const refusal = new Promise((resolve) => { refused = resolve; });
  await page.route("**/api/workspace", async (route) => { await failing; await route.fulfill({ status: 500, body: "{}" }); refused(); });
  await off.click();
  await expect(off).toHaveAttribute("aria-pressed", "true", { timeout: 300 });
  fail();
  await refusal;
  await expect(on).toHaveAttribute("aria-pressed", "true");
  await expect(off).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByRole("status").filter({ hasText: "保存できませんでした。もう一度お試しください。" })).toBeVisible();
  await page.unroute("**/api/workspace");
  // 後の検査のために戻しておく。押した瞬間に値は立つが、保存の返事が届く前にリロードすると途中の保存が切れるので、届いてから読み直す
  const restored = page.waitForResponse((response) => response.url().includes("/api/workspace") && response.request().method() === "POST");
  await off.click();
  await expect(off).toHaveAttribute("aria-pressed", "true");
  await restored;
  await page.reload();
  await expect(off).toHaveAttribute("aria-pressed", "true");
});
