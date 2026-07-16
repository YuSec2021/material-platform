import playwright, { type Page, type Route } from "@playwright/test";

const { expect, test } = playwright;

const superAdmin = {
  id: 1,
  username: "super_admin",
  display_name: "Super Admin",
  is_super_admin: true,
  permissions: [],
  material_library_scope_ids: null,
  roles: [{ id: 1, name: "Administrator", code: "ADMIN", enabled: true }],
};

async function installApiMocks(page: Page) {
  await page.route("**/api/v1/**", async (route: Route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;

    if (path.endsWith("/auth/login") || path.endsWith("/auth/me")) {
      await route.fulfill({ json: superAdmin });
      return;
    }
    if (path.endsWith("/telemetry/web-vitals")) {
      await route.fulfill({ status: 204 });
      return;
    }
    if (request.method() === "GET") {
      await route.fulfill({ json: [] });
      return;
    }
    await route.fulfill({ json: {} });
  });
}

async function signIn(page: Page) {
  await page.goto("/login");
  await page.getByRole("button", { name: /登录|Log in/ }).click();
  await expect(page.getByRole("heading", { name: /仪表盘|Dashboard/ })).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await installApiMocks(page);
  await signIn(page);
});

test("standard and material create dialogs expose keyboard-accessible shadcn controls", async ({ page }) => {
  await page.goto("/standard/brand");
  await expect(page.getByRole("heading", { name: /品牌管理|Brand/ })).toBeVisible();
  await page.getByRole("button", { name: /新增品牌|Add Brand/ }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("dialog").getByRole("button", { name: /取消|Cancel/ })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);

  await page.goto("/material/library");
  await expect(page.getByRole("heading", { name: /物料库|Material Librar/ })).toBeVisible();
  await page.getByRole("button", { name: /新建物料库|Add Library/ }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("dialog").locator("input").first()).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("AI, rules, and trace pages retain their accessible empty and filter states", async ({ page }) => {
  await page.goto("/ai/models");
  await expect(page.getByRole("heading", { name: /模型网关|Model Gateway/ })).toBeVisible();
  await page.getByRole("button", { name: /新增模型|Add Model/ }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("dialog").locator('input[type="password"]')).toBeVisible();
  await page.keyboard.press("Escape");

  await page.goto("/rules/categories");
  await expect(page.getByRole("heading", { name: /规则分类|Rule Categories/ })).toBeVisible();
  await expect(page.getByText(/暂无规则分类|No rule categories/)).toBeVisible();

  await page.goto("/debug/trace");
  await expect(page.getByRole("heading", { name: /AI 链路追踪|AI Trace/ })).toBeVisible();
  await page.getByLabel(/开始日期|Start date/).fill("2099-01-01");
  await page.getByLabel(/结束日期|End date/).fill("2099-01-01");
  await page.getByRole("button", { name: /应用|Apply/ }).click();
  await expect(page.getByText("0 traces")).toBeVisible();
  await expect(page.getByText(/暂无 trace span|No trace/)).toBeVisible();
});
