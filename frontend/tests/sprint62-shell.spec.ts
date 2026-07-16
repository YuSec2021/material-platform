import playwright from "@playwright/test";

const { expect, test } = playwright;

const user = {
  id: 1,
  username: "super_admin",
  display_name: "Super Admin",
  is_super_admin: true,
  permissions: [],
  material_library_scope_ids: null,
  roles: [{ id: 1, name: "Administrator", code: "ADMIN", enabled: true }],
};

test.beforeEach(async ({ page }) => {
  await page.route("**/api/v1/auth/login", async (route) => route.fulfill({ json: user }));
  await page.route("**/api/v1/auth/me", async (route) => route.fulfill({ json: user }));
  await page.route("**/api/v1/workflows/applications**", async (route) => route.fulfill({ json: [] }));
  await page.route("**/api/v1/telemetry/web-vitals", async (route) => route.fulfill({ status: 204 }));
});

test("shadcn login controls preserve the login flow and expose busy state", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByLabel(/用户名|Username/)).toBeVisible();
  await expect(page.getByRole("button", { name: /登录|Log in/ })).toBeVisible();
  await page.getByRole("button", { name: /登录|Log in/ }).click();
  await expect(page.getByRole("heading", { name: /仪表盘|Dashboard/ })).toBeVisible();
});

test("mobile shell uses a keyboard-accessible sheet and persists theme", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/login");
  await page.getByRole("button", { name: /登录|Log in/ }).click();
  await page.locator("header button[aria-label]").first().click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await page.locator("header button:has(.lucide-moon), header button:has(.lucide-sun)").click();
  await page.reload();
  expect(await page.locator("html.dark").count()).toEqual(1);
});
