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
  { id: 1, name: "Office Library", code: "CL-OFFICE", description: "Office categories", enabled: true },
  { id: 2, name: "Hardware Library", code: "CL-HARDWARE", description: "Hardware categories", enabled: true },
];

const initialCategories = [
  {
    id: 1,
    code: "OFFICE",
    name: "Office Supplies",
    category_library_id: 1,
    category_library: "Office Library",
    parent_category_id: null,
    description: "",
    enabled: true,
  },
  {
    id: 2,
    code: "PAPER",
    name: "Paper",
    category_library_id: 1,
    category_library: "Office Library",
    parent_category_id: 1,
    description: "",
    enabled: true,
  },
  {
    id: 3,
    code: "COPY",
    name: "Copy Paper",
    category_library_id: 1,
    category_library: "Office Library",
    parent_category_id: 2,
    description: "",
    enabled: true,
  },
  {
    id: 4,
    code: "TOOLS",
    name: "Hand Tools",
    category_library_id: 2,
    category_library: "Hardware Library",
    parent_category_id: null,
    description: "",
    enabled: true,
  },
  {
    id: 5,
    code: "WRENCH",
    name: "Wrench",
    category_library_id: 2,
    category_library: "Hardware Library",
    parent_category_id: 4,
    description: "",
    enabled: true,
  },
];

async function mockBackend(page: Page) {
  let categories = [...initialCategories];
  let nextCategoryId = 100;

  await page.route("**/api/v1/auth/login", async (route) => {
    await route.fulfill({ json: { access_token: "sprint45-token", token_type: "bearer", user: authUser } });
  });
  await page.route("**/api/v1/auth/me", async (route) => route.fulfill({ json: authUser }));
  await page.route("**/api/v1/users/me**", async (route) => route.fulfill({ json: authUser }));
  await page.route("**/api/v1/category-libraries", async (route) => route.fulfill({ json: categoryLibraries }));
  await page.route("**/api/v1/categories/*", async (route) => {
    const request = route.request() as any;
    const id = Number(request.url().split("/").pop());
    if (request.method() === "PUT") {
      const body = request.postDataJSON();
      categories = categories.map((category) =>
        category.id === id
          ? {
              ...category,
              ...body,
              category_library: categoryLibraries.find((library) => library.id === body.category_library_id)?.name ?? category.category_library,
            }
          : category,
      );
      await route.fulfill({ json: categories.find((category) => category.id === id) });
      return;
    }
    if (request.method() === "DELETE") {
      categories = categories.filter((category) => category.id !== id && category.parent_category_id !== id);
      await route.fulfill({ json: { deleted: true, id } });
      return;
    }
    await route.fulfill({ status: 404, json: { detail: "Not found" } });
  });
  await page.route("**/api/v1/categories", async (route) => {
    const request = route.request() as any;
    if (request.method() === "POST") {
      const body = request.postDataJSON();
      const library = categoryLibraries.find((item) => item.id === Number(body.category_library_id)) ?? categoryLibraries[0]!;
      const category = {
        id: nextCategoryId++,
        code: body.code || `CAT${nextCategoryId}`,
        name: body.name,
        category_library_id: library.id,
        category_library: library.name,
        parent_category_id: body.parent_category_id ?? null,
        description: body.description ?? "",
        enabled: true,
      };
      categories = [...categories, category];
      await route.fulfill({ json: category });
      return;
    }
    await route.fulfill({ json: categories });
  });
}

async function login(page: Page) {
  await page.goto("/login");
  await page.getByRole("button", { name: /登录|Log in/ }).click();
}

test("category page shows a MaterialList-style sidebar and filters table by selected branch", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await mockBackend(page);
  await login(page);
  await page.goto("/standard/category");

  await expect(page.getByRole("heading", { name: /类目树|Category Tree/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: /类目管理|Categories/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /新增类目|New Category/ })).toBeVisible();
  await expect(page.getByPlaceholder(/搜索类目名称|Search category name/)).toBeVisible();
  await expect(page.getByText(/全部类目库|All Category Libraries/)).toBeVisible();
  await expect(page.getByText(/全部层级|All Levels/)).toBeVisible();

  await page.getByRole("button", { name: /Office Library/ }).click();
  await expect(page.locator('aside :text("Office Supplies")').first()).toBeVisible();
  expect(await page.locator('aside :text("Hand Tools")').count()).toEqual(0);

  await page.getByRole("button", { name: /Office Supplies/ }).click();
  await page.getByRole("button", { name: /Paper/ }).click();

  await expect(page.locator('main table :text("Office Supplies")').first()).toBeVisible();
  await expect(page.locator('main table :text("Paper")').first()).toBeVisible();
  await expect(page.locator('main table :text("Copy Paper")').first()).toBeVisible();
  expect(await page.locator('main table :text("Hand Tools")').count()).toEqual(0);
  expect(await page.locator('main table :text("Wrench")').count()).toEqual(0);

  await page.getByPlaceholder(/搜索类目名称|Search category name/).fill("Copy Paper");
  await expect(page.locator('main table :text("Copy Paper")').first()).toBeVisible();
  expect(await page.locator('main table :text("Office Supplies")').count()).toEqual(0);
  await expect(page.getByText(/已选类目|Selected category/)).toBeVisible();
});

test("category create, edit, and delete refresh the sidebar tree and table together", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await mockBackend(page);
  await login(page);
  await page.goto("/standard/category");

  await page.getByRole("button", { name: /新增类目|New Category/ }).click();
  await page.locator('[role="dialog"] input').first().fill("Temporary Root");
  await page.getByRole("button", { name: /保存|Save/ }).click();

  await expect(page.locator('aside :text("Temporary Root")').first()).toBeVisible();
  await expect(page.locator('main table :text("Temporary Root")').first()).toBeVisible();

  await page.locator('main table tbody tr:has-text("Temporary Root") button:has-text("编辑"), main table tbody tr:has-text("Temporary Root") button:has-text("Edit")').first().click();
  await page.locator('[role="dialog"] input').first().fill("Renamed Root");
  await page.getByRole("button", { name: /保存|Save/ }).click();

  await expect(page.locator('aside :text("Renamed Root")').first()).toBeVisible();
  await expect(page.locator('main table :text("Renamed Root")').first()).toBeVisible();

  (page as any).once("dialog", async (confirmDialog: any) => confirmDialog.accept());
  await page.locator('main table tbody tr:has-text("Renamed Root") button:has-text("删除"), main table tbody tr:has-text("Renamed Root") button:has-text("Delete")').first().click();

  expect(await page.locator('aside :text("Renamed Root")').count()).toEqual(0);
  expect(await page.locator('main table :text("Renamed Root")').count()).toEqual(0);
});
