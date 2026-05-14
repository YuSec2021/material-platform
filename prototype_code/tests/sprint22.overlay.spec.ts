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
  await page.route("**/api/v1/users/me**", async (route) => {
    await route.fulfill({ json: authUser });
  });
  await page.goto("/login");
  await page.getByRole("button", { name: /登录|Log in/ }).click();
  await (page as any).waitForLoadState("networkidle");
}

function alphaFromBackground(backgroundColor: string) {
  const slashAlpha = backgroundColor.match(/\/\s*([0-9.]+%?)\s*\)/);
  if (slashAlpha) {
    const value = slashAlpha[1]!;
    return value.endsWith("%") ? Number(value.slice(0, -1)) / 100 : Number(value);
  }

  const rgba = backgroundColor.match(/^rgba?\((.+)\)$/);
  if (!rgba) {
    return Number.NaN;
  }

  const parts = rgba[1]!.split(",").map((part) => part.trim());
  return parts.length === 4 ? Number(parts[3]) : 1;
}

async function expectTranslucentOverlay(page: Page) {
  const overlay = page.locator('[data-slot="modal-overlay"]').first();
  await expect(overlay).toBeVisible();
  const backgroundColor = await overlay.evaluate((element) => getComputedStyle(element).backgroundColor);
  const alpha = alphaFromBackground(backgroundColor);
  if (!(alpha > 0 && alpha < 1)) {
    throw new Error(`Expected translucent modal overlay, received ${backgroundColor}`);
  }
}

test("create dialogs use a translucent overlay and remain dismissible", async () => {
  const { page, context } = await pageForTest();
  await login(page);
  await page.route("**/api/v1/brands", async (route) => {
    await route.fulfill({ json: [] });
  });
  await page.route("**/api/v1/material-libraries", async (route) => {
    await route.fulfill({ json: [] });
  });

  await page.goto("/standard/brands");
  await page.getByRole("button", { name: /新增品牌|New Brand/ }).click();
  await expectTranslucentOverlay(page);
  await page.keyboard.press("Escape");
  if (await page.locator('[data-slot="modal-overlay"]').count()) {
    throw new Error("Brand dialog overlay remained after Escape dismissal");
  }

  await page.goto("/material/library");
  await page.getByRole("button", { name: /新建物料库|New Library/ }).click();
  await expectTranslucentOverlay(page);
  await page.getByRole("button", { name: /Close|关闭/ }).click();
  if (await page.locator('[data-slot="modal-overlay"]').count()) {
    throw new Error("Material library dialog overlay remained after close dismissal");
  }
  await context.close();
});
