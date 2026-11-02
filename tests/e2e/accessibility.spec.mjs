// 部品の一覧（読み上げや Codex などの AI の Mac 操作が読むもの）に、名前と役割の無い部品を出さない。
// 見るのは axe の WCAG 2.x A の規則。主要な画面と、本文ページの道具箱（開いた板・文字を選んだときの小窓・⋯ の小窓）と、現在地の行の顔のメニュー。
// 部品を足したらここにも足す。違反は規則の名前と場所だけを出す（本文の文字は出さない）。
import { test, expect } from "playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { readFile } from "node:fs/promises";
import path from "node:path";

async function login(context, role = "owner") {
  const v = JSON.parse(await readFile(path.join(process.env.PAGES_TEST_RUNTIME ?? ".test-runtime", "session.json"), "utf8"));
  await context.setExtraHTTPHeaders({ origin: v.origin });
  await context.addCookies([{ name: "authjs.session-token", value: v.sessions[role], url: v.origin, httpOnly: true, sameSite: "Lax" }]);
}

const TAGS = ["wcag2a", "wcag21a"];
const violations = (result) => result.violations.map((v) => `${v.id}: ${v.nodes.map((node) => node.target.join(" ")).join(" | ")}`);
const toolbox = (page) => page.locator("surprise-comments");
const scanToolbox = async (page) => violations(await new AxeBuilder({ page }).include("surprise-comments").withTags(TAGS).analyze());

// 走査の前に、画面が出来上がったことを画面そのもので確かめる: 1 段目の見出しが見えていて、React がそれを受け持ち終えている
// （hydration が済むと要素に React の印が付く）。通信が静かになるのを待つ形（networkidle）は使わない——CI の Linux 版 WebKit では、
// 新しく立ち上げたブラウザの 1 本目で、通信が全部終わり画面も止まっているのに「静か」と判定されないまま 1 分の時間切れになることがあった。
async function ready(page) {
  const heading = page.locator("h1").first();
  await expect(heading).toBeVisible();
  await expect.poll(() => heading.evaluate((element) => Object.keys(element).some((key) => key.startsWith("__reactFiber$")))).toBe(true);
}

for (const url of ["/", "/mine", "/library", "/activity", "/settings", "/create"]) {
  test(`${url} の部品は名前と役割を持つ`, async ({ page, context }) => {
    await login(context);
    await page.goto(url);
    await ready(page);
    expect(violations(await new AxeBuilder({ page }).withTags(TAGS).analyze())).toEqual([]);
  });
}

// 管理画面の人の面。招待のリンクを作ったあとに出るコピーの口まで見る
test("サイドバーの名乗りのメニュー（キーボードショートカット・ログアウト）は名前と役割を持つ", async ({ page, context }) => {
  await login(context);
  await page.goto("/");
  // ふだんは名前だけ。たまにしか使わない操作は、名前を押して開くメニューに畳んである
  const sidebar = page.locator(".ws-sidebar");
  await expect(sidebar.getByRole("button", { name: "ログアウト" })).toHaveCount(0);
  await sidebar.locator(".ws-account-trigger").click();
  const menu = page.getByRole("menu");
  await expect(menu.getByRole("menuitem", { name: "ログアウト" })).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: /^キーボードショートカット/ })).toBeVisible();
  // 開いている間、メニューの部品は外の画面を読み上げから隠す（ほかのメニューと同じ）。見るのは開いたメニューの中
  expect(violations(await new AxeBuilder({ page }).include("[role=menu]").withTags(TAGS).analyze())).toEqual([]);
  // メニューのログアウトは、今までの「ログアウト」ボタンと同じくログインの画面へ戻す
  await menu.getByRole("menuitem", { name: "ログアウト" }).click();
  await expect(page).toHaveURL(/\/signin/);
});

test("スライドのページの道具箱は、プレゼンを表に・読み方を ⋯ に持ち、保存済みの操作列は出さない", async ({ page, context }) => {
  await login(context);
  await page.goto("/internal/test/deck");
  // 保存済みの操作列（本文の側の「プレゼンを始める」の 1 段）は、道具箱のある画面では出さない——上端の現在地の行と 2 段にしない
  const present = toolbox(page).getByRole("button", { name: "プレゼンを始める" });
  await expect(present).toBeVisible();
  await expect(page.locator("main [data-deck-toolbar]").first()).toBeHidden();
  expect(await scanToolbox(page)).toEqual([]);

  // ⋯ の「読み方」に発表者画面と一覧。行は保存済みの釦を押すので、押せば実行部の印（html の属性）が立つ
  await toolbox(page).getByRole("button", { name: "その他" }).click();
  const menu = toolbox(page).getByRole("group", { name: "その他" });
  await expect(menu.getByRole("button", { name: "発表者画面" })).toBeVisible();
  await expect(menu.getByRole("button", { name: "一覧で見る" })).toBeVisible();
  expect(await scanToolbox(page)).toEqual([]);
  await menu.getByRole("button", { name: "一覧で見る" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-deck-overview", "");
  await toolbox(page).getByRole("button", { name: "その他" }).click();
  await expect(toolbox(page).getByRole("group", { name: "その他" }).getByRole("button", { name: "一覧を閉じる" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(toolbox(page).getByRole("group", { name: "その他" })).toHaveCount(0);
});

test("本文ページの道具箱は、開いた板・小窓・メニューまで名前と役割を持つ", async ({ page, context }, info) => {
  await login(context);
  const body = `部品の一覧の検査-${info.project.name}`;
  const posted = await page.request.post("/api/comments", { data: { pageSlug: "internal/test/article", body, kind: "comment", priority: "want" } });
  expect(posted.ok(), await posted.text()).toBeTruthy();
  const { comment } = await posted.json();
  try {
    await page.goto("/internal/test/article");
    // コメントが届くと板が開く。板は見出しの名前で呼べる
    await expect(toolbox(page).getByRole("complementary", { name: "コメント" })).toBeVisible();
    await expect(toolbox(page).getByText(body)).toBeVisible();
    expect(await scanToolbox(page)).toEqual([]);

    // 文字を選ぶと出る小窓は、用途の名前の枠に入る
    await page.getByText("最初の本文").click({ clickCount: 3 });
    const surface = toolbox(page).getByRole("group", { name: "選んだ箇所へのコメント" });
    await expect(surface).toBeVisible();
    expect(await scanToolbox(page)).toEqual([]);
    await page.keyboard.press("Escape");
    await expect(surface).toHaveCount(0);

    // 右下の ⋯（たまにしか使わない道具を畳んだ小窓）は、用途の名前の枠に入り、段ごとに見出しを持つ
    await toolbox(page).getByRole("button", { name: "その他" }).click();
    await expect(toolbox(page).getByRole("group", { name: "その他" })).toBeVisible();
    expect(await scanToolbox(page)).toEqual([]);
    await page.keyboard.press("Escape");
    await expect(toolbox(page).getByRole("group", { name: "その他" })).toHaveCount(0);

    // 現在地の行の右端の顔から開くメニューは、サイドバーを畳んだもの。役割はサイドバーのメニューと同じ menu / menuitem
    const location = page.locator("surprise-location");
    await location.getByRole("button", { name: /^自分/ }).click();
    const selfMenu = location.getByRole("menu");
    await expect(selfMenu.getByRole("menuitem", { name: "ホーム" })).toBeVisible();
    await expect(selfMenu.getByRole("menuitem", { name: "ログアウト" })).toBeVisible();
    expect(violations(await new AxeBuilder({ page }).include("surprise-location").withTags(TAGS).analyze())).toEqual([]);
    await page.keyboard.press("Escape");
    await expect(selfMenu).toHaveCount(0);
  } finally {
    if (comment?.id) await page.request.delete(`/api/comments/${comment.id}`);
  }
});
