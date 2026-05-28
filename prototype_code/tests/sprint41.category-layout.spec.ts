import playwright, { type Page } from "@playwright/test";

const { expect, test } = playwright;

const authUser = {
  id: 1,
  username: "super_admin",
  display_name: "Super Admin",
  is_super_admin: true,
  permissions: [],
  material_library_scope_ids: null,
  roles: [{ id: 1, name: "Administrator", code: "ADMIN", enabled: true }],
};

const categoryLibraries = [
  { id: 1, name: "Default Category Library", code: "CL001", description: "Default", enabled: true },
];

const categories = [
  {
    id: 1,
    code: "CAT001",
    name: "Office Equipment",
    category_library_id: 1,
    category_library: "Default Category Library",
    parent_category_id: null,
    description: "Office equipment root category",
    enabled: true,
  },
  {
    id: 2,
    code: "CAT002",
    name: "Printer",
    category_library_id: 1,
    category_library: "Default Category Library",
    parent_category_id: 1,
    description: "Printing devices",
    enabled: true,
  },
];

async function mockBackend(page: Page) {
  await page.route("**/api/v1/auth/login", async (route) => {
    await route.fulfill({ json: { access_token: "sprint41-token", token_type: "bearer", user: authUser } });
  });
  await page.route("**/api/v1/auth/me", async (route) => route.fulfill({ json: authUser }));
  await page.route("**/api/v1/users/me**", async (route) => route.fulfill({ json: authUser }));
  await page.route("**/api/v1/category-libraries", async (route) => route.fulfill({ json: categoryLibraries }));
  await page.route("**/api/v1/categories", async (route) => {
    if (route.request().method() === "POST") {
      await route.fulfill({ json: { ...categories[0], id: 3, code: "CAT003", name: "Sprint 41 Category" } });
      return;
    }
    await route.fulfill({ json: categories });
  });
}

async function login(page: Page) {
  await page.goto("/login");
  await page.getByRole("button", { name: /登录|Log in/ }).click();
}

test("category management renders material-style table layout and modal", async ({ page }) => {
  await mockBackend(page);
  await login(page);
  await page.goto("/standard/category");

  await expect(page.getByRole("heading", { name: /类目管理|Categories/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /新增类目|New Category/ })).toBeVisible();
  await expect(page.getByPlaceholder(/搜索类目名称|Search category name/)).toBeVisible();
  await expect(page.getByText(/全部类目库|All Category Libraries/)).toBeVisible();
  await expect(page.getByText(/全部层级|All Levels/)).toBeVisible();

  await expect(page.getByText(/类目名称|Category Name/)).toBeVisible();
  await expect(page.getByText(/编码|Code/)).toBeVisible();
  await expect(page.getByText(/上级类目|Parent Category/)).toBeVisible();
  await expect(page.getByText(/类目库|Category Library/)).toBeVisible();
  await expect(page.getByText("Office Equipment")).toBeVisible();
  await expect(page.getByText(/第 1 \/ 1 页|Page 1 \/ 1/)).toBeVisible();

  await page.getByPlaceholder(/搜索类目名称|Search category name/).fill("zz-no-category-sprint41");
  await expect(page.getByText(/后端暂无类目数据|No category data from backend/)).toBeVisible();
  await expect(page.getByRole("button", { name: /重置筛选|Reset filters/ })).toBeVisible();

  await page.getByRole("button", { name: /重置筛选|Reset filters/ }).click();
  await page.getByRole("button", { name: /新增类目|New Category/ }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("button", { name: /取消|Cancel/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /保存|Save/ })).toBeVisible();
});
