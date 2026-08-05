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
  await page.route(/\/api\/v1\/categories(?:\?.*)?$/, async (route) => {
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
    const url = new URL(request.url());
    const parentId = url.searchParams.get("parent_id");
    const libraryId = url.searchParams.get("category_library_id");
    const level = url.searchParams.get("level");
    await route.fulfill({
      json: categories.filter((category) =>
        parentId !== null
          ? category.parent_category_id === Number(parentId)
          : libraryId !== null && level === null
            ? category.category_library_id === Number(libraryId)
            : category.parent_category_id === null && (libraryId === null || category.category_library_id === Number(libraryId)),
      ),
    });
  });
}

async function login(page: Page) {
  await page.goto("/login");
  await page.getByRole("button", { name: /登录|Log in/ }).click();
  await expect(page.getByRole("heading", { name: /仪表盘|Dashboard/ })).toBeVisible();
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
  await expect(page.getByText(/请选择树中的类目|Select a category from the tree/)).toBeVisible();
  await page.getByRole("button", { name: /Office Library/ }).click();
  await expect(page.locator('aside :text("Office Supplies")').first()).toBeVisible();
  expect(await page.locator('aside :text("Hand Tools")').count()).toEqual(0);

  await page.getByRole("button", { name: /Office Supplies/ }).click();
  await page.getByRole("button", { name: /Paper/ }).click();

  await expect(page.locator('main table :text("Copy Paper")').first()).toBeVisible();
  expect(await page.locator('main table :text("Hand Tools")').count()).toEqual(0);
  expect(await page.locator('main table :text("Wrench")').count()).toEqual(0);

  await page.getByPlaceholder(/搜索类目名称|Search category name/).fill("Copy Paper");
  await expect(page.locator('main table :text("Copy Paper")').first()).toBeVisible();
  await expect(page.getByText(/已选类目|Selected category/)).toBeVisible();
});

test("expand all loads and displays category descendants that were not cached", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await mockBackend(page);
  await login(page);
  await page.goto("/standard/category");

  await page.getByRole("button", { name: /全部展开|Expand all/ }).click();

  await expect(page.locator('aside :text("Copy Paper")').first()).toBeVisible();
  await expect(page.locator('aside :text("Wrench")').first()).toBeVisible();
  await expect(page.getByRole("button", { name: /收起 Office Supplies|Collapse Office Supplies/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /收起 Paper|Collapse Paper/ })).toBeVisible();
});

test("category properties support spreadsheet preview and confirmed bulk import", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await mockBackend(page);
  let confirmPayload: Record<string, unknown> | null = null;
  await page.route("**/api/v1/categories/*/properties", async (route) => {
    await route.fulfill({ json: { category_id: 1, own: [], inherited: [], attributes: [], properties: [] } });
  });
  await page.route("**/api/v1/category-attributes/import/preview**", async (route) => {
    await route.fulfill({
      json: {
        category_library_id: 1,
        conflict_strategy: "skip",
        total_count: 1,
        valid_count: 1,
        create_count: 1,
        update_count: 0,
        skipped_count: 0,
        error_count: 0,
        items: [
          {
            row_number: 2,
            category_id: 1,
            category_code: "OFFICE",
            category_name: "Office Supplies",
            category_path: "Office Supplies",
            attribute: {
              name: "paper_size",
              attr_type: "enum",
              display_name_zh: "纸张尺寸",
              display_name_en: "Paper Size",
              options: ["A4", "A3"],
              required: false,
              allow_empty: true,
              default_value: "A4",
              sort_order: 10,
            },
            existing_attribute_id: null,
            action: "create",
            selectable: true,
            errors: [],
          },
        ],
      },
    });
  });
  await page.route("**/api/v1/category-attributes/import/confirm", async (route) => {
    confirmPayload = route.request().postDataJSON() as Record<string, unknown>;
    await route.fulfill({
      json: {
        category_library_id: 1,
        created_count: 1,
        updated_count: 0,
        skipped_count: 0,
        created_ids: [101],
        updated_ids: [],
        skipped: [],
      },
    });
  });
  await login(page);
  await page.goto("/standard/category");
  await page.getByRole("button", { name: /Office Library/ }).click();
  await page.getByRole("button", { name: /Office Supplies/ }).click();

  await page.getByTestId("category-attributes-panel").getByRole("button", { name: /批量导入|Bulk Import/ }).click();
  await expect(page.getByRole("button", { name: /下载模板|Download Template/ })).toBeVisible();
  await page.locator('input[type="file"]').setInputFiles({
    name: "category-attributes.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("类目编码,属性名称,属性类型\nOFFICE,paper_size,enum", "utf-8"),
  });
  await page.getByRole("button", { name: /预览导入|Preview Import/ }).click();

  await expect(page.getByTestId("category-attribute-import-preview")).toContainText("paper_size");
  await page.getByRole("button", { name: /确认导入|Confirm Import/ }).click();
  await expect.poll(() => confirmPayload).not.toBeNull();
  expect(confirmPayload?.conflict_strategy).toBe("skip");
  expect((confirmPayload?.items as unknown[]).length).toBe(1);
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
  await page.getByRole("button", { name: /清除选择|Clear selection/ }).click();
  await expect(page.locator('main table :text("Temporary Root")').first()).toBeVisible();

  await page.locator('main table tbody tr:has-text("Temporary Root") button:has-text("编辑"), main table tbody tr:has-text("Temporary Root") button:has-text("Edit")').first().click();
  await page.locator('[role="dialog"] input').first().fill("Renamed Root");
  await page.getByRole("button", { name: /保存|Save/ }).click();

  await expect(page.locator('aside :text("Renamed Root")').first()).toBeVisible();
  await page.getByRole("button", { name: /清除选择|Clear selection/ }).click();
  await expect(page.locator('main table :text("Renamed Root")').first()).toBeVisible();

  await page.locator('main table tbody tr:has-text("Renamed Root") button:has-text("删除"), main table tbody tr:has-text("Renamed Root") button:has-text("Delete")').first().click();
  await page.getByRole("alertdialog").getByRole("button", { name: /删除|Delete/ }).click();

  await expect(page.locator('aside :text("Renamed Root")')).toHaveCount(0);
  await expect(page.locator('main table :text("Renamed Root")')).toHaveCount(0);
});
