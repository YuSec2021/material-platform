import playwright from "@playwright/test";

const { expect, test } = playwright;

const admin = {
  id: 1,
  username: "super_admin",
  display_name: "Super Admin",
  is_super_admin: true,
  permissions: [],
  material_library_scope_ids: null,
  roles: [{ id: 1, name: "Administrator", code: "ADMIN", enabled: true }],
};

const localUser = {
  id: 8,
  username: "local_operator",
  display_name: "本地操作员",
  unit: "示例单位",
  department: "物资部",
  team: "一组",
  email: "operator@example.com",
  status: "active",
  account_ownership: "local",
};

test.beforeEach(async ({ page }) => {
  await page.route("**/api/v1/auth/login", (route) => route.fulfill({ json: admin }));
  await page.route("**/api/v1/auth/me", (route) => route.fulfill({ json: admin }));
  await page.route("**/api/v1/users", (route) => route.fulfill({ json: [localUser] }));
  await page.route("**/api/v1/telemetry/web-vitals", (route) => route.fulfill({ status: 204 }));
  await page.goto("/login");
  await page.getByRole("button", { name: /登录|Log in/ }).click();
  await expect(page.getByRole("heading", { name: /仪表盘|Dashboard/ })).toBeVisible();
});

test("user destructive actions use cancellable accessible dialogs", async ({ page }) => {
  let nativeDialogs = 0;
  page.on("dialog", async (dialog) => {
    nativeDialogs += 1;
    await dialog.dismiss();
  });

  await page.goto("/system/users");
  await expect(page.getByText("local_operator")).toBeVisible();

  await page.getByRole("button", { name: "删除" }).click();
  const deleteDialog = page.getByRole("alertdialog");
  await expect(deleteDialog).toContainText("local_operator");
  await deleteDialog.getByRole("button", { name: "取消" }).click();
  await expect(deleteDialog).toBeHidden();

  await page.getByRole("button", { name: "重置密码" }).click();
  const resetDialog = page.getByRole("alertdialog");
  await expect(resetDialog).toContainText("local_operator");
  await page.keyboard.press("Escape");
  await expect(resetDialog).toBeHidden();
  expect(nativeDialogs).toBe(0);
});
