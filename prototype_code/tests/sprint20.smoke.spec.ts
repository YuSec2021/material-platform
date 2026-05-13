import playwright, { type Browser, type Page } from "@playwright/test";

const { chromium, expect, test } = playwright;
let browser: Browser | null = null;
let browserUnavailable = "";

const authUser = {
  id: 1,
  username: "super_admin",
  display_name: "Super Admin",
  is_super_admin: true,
  roles: [{ id: 1, name: "Administrator", code: "ADMIN" }],
};

test.beforeAll(async () => {
  try {
    browser = await chromium.launch();
  } catch (error) {
    browserUnavailable = error instanceof Error ? error.message : String(error);
  }
});

test.afterAll(async () => {
  await browser?.close();
});

async function pageForTest() {
  test.skip(Boolean(browserUnavailable), `Chromium launch unavailable in this sandbox: ${browserUnavailable}`);
  const context = await browser!.newContext({ baseURL: "http://localhost:5173" });
  const page = await context.newPage();
  return { page, context };
}

async function login(page: Page) {
  await page.route("**/api/v1/auth/login", async (route) => {
    await route.fulfill({ json: { access_token: "e2e-token", token_type: "bearer", user: authUser } });
  });
  await page.route("**/api/v1/auth/me", async (route) => {
    await route.fulfill({ json: authUser });
  });
  await page.goto("/login");
  await page.getByRole("button", { name: /登录|Log in/ }).click();
}

test("login, navigation, i18n switching, and responsive shell", async () => {
  const { page, context } = await pageForTest();
  await login(page);
  await expect(page.getByRole("heading", { name: /AI物料中台管理系统/ })).toBeVisible();

  await page.getByRole("button", { name: /Language|语言/ }).click();
  await expect(page.getByRole("heading", { name: /AI Material Management System/ })).toBeVisible();
  await page.goto("/materials");
  await expect(page.getByRole("heading", { name: "Materials" })).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole("button", { name: /Open navigation|打开导航/ })).toBeVisible();
  await page.getByRole("button", { name: /Open navigation|打开导航/ }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await context.close();
});

test("materials list exposes skeleton, empty, error, and deterministic AI completion states", async () => {
  const { page, context } = await pageForTest();
  await login(page);
  let releaseMaterials: (() => void) | undefined;
  await page.route("**/api/v1/materials**", async (route) => {
    await new Promise<void>((resolve) => {
      releaseMaterials = resolve;
    });
    await route.fulfill({ json: [] });
  });
  await page.route("**/api/v1/material-libraries", async (route) => {
    await route.fulfill({ json: [{ id: 1, name: "Default Library", code: "LIB-001", description: "", enabled: true }] });
  });
  await page.route("**/api/v1/categories", async (route) => {
    await route.fulfill({ json: [{ id: 1, name: "Network", code: "CAT-001", level: 1 }] });
  });
  await page.route("**/api/v1/product-names", async (route) => route.fulfill({ json: [] }));
  await page.route("**/api/v1/brands", async (route) => route.fulfill({ json: [] }));
  await page.route("**/api/v1/ai/material-match", async (route) => {
    await route.fulfill({
      json: {
        matches: [{ code: "MAT-001", name: "Reference switch", product_name: "Switch", brand: "Demo", confidence: 0.91 }],
      },
    });
  });

  await page.goto("/materials");
  await expect(page.getByRole("status")).toBeVisible();
  releaseMaterials?.();
  await expect(page.getByText(/No material data|后端暂无物料数据/)).toBeVisible();

  await page.unroute("**/api/v1/materials**");
  await page.route("**/api/v1/materials**", async (route) => route.fulfill({ status: 500, json: { detail: "boom" } }));
  await page.reload();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.getByRole("button", { name: /Retry|重试/ })).toBeVisible();

  await page.unroute("**/api/v1/materials**");
  await page.route("**/api/v1/materials**", async (route) => route.fulfill({ json: [] }));
  await page.reload();
  await page.getByRole("button", { name: /AI向量匹配|Match/ }).click();
  await page.getByPlaceholder(/输入物料名称|material name/i).fill("switch");
  await page.getByRole("button", { name: /^匹配$|^Match$/ }).click();
  await expect(page.getByText(/AI 匹配完成|AI matching complete/)).toBeVisible();
  await expect(page.getByText("Reference switch")).toBeVisible();
  await context.close();
});

test("material CRUD busy state and toast feedback are visible", async () => {
  const { page, context } = await pageForTest();
  await login(page);
  await page.route("**/api/v1/material-libraries", async (route) => {
    if (route.request().method() === "POST") {
      await route.fulfill({ json: { id: 2, name: "E2E Library", code: "LIB-002", description: "", enabled: true } });
      return;
    }
    await route.fulfill({ json: [] });
  });

  await page.goto("/material/library");
  await expect(page.getByText(/No material library data|后端暂无物料库数据/)).toBeVisible();
  await page.getByRole("button", { name: /New Library|新建物料库/ }).click();
  await page.getByLabel(/Name|名称/).fill("E2E Library");
  await page.getByRole("button", { name: /Save|保存/ }).click();
  await expect(page.getByText(/Saved successfully|保存成功/)).toBeVisible();
  await context.close();
});

test("workflow submission route and accessible controls are available", async () => {
  const { page, context } = await pageForTest();
  await login(page);
  await page.route("**/api/v1/workflows/applications**", async (route) => route.fulfill({ json: [] }));
  await page.goto("/applications");
  await expect(page.getByRole("heading", { name: /New Category Application|新增物料类目申请/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /New Material|新增物料/ })).toBeVisible();
  await expect(page.getByRole("combobox")).toBeVisible();
  await context.close();
});
