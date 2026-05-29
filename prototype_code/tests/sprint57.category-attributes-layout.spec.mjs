import playwright from "@playwright/test";

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
  { id: 1, name: "Sprint 57 Library", code: "S57", description: "Layout test library", enabled: true },
];

const categories = [
  {
    id: 101,
    code: "ROOT",
    name: "Layout Root",
    category_library_id: 1,
    category_library: "Sprint 57 Library",
    parent_category_id: null,
    description: "Root category",
    enabled: true,
  },
  {
    id: 102,
    code: "CHILD",
    name: "Layout Child",
    category_library_id: 1,
    category_library: "Sprint 57 Library",
    parent_category_id: 101,
    description: "Child category",
    enabled: true,
  },
];

const propertiesByCategory = {
  101: {
    own: [
      {
        id: 1,
        name: "root_width",
        display_name_zh: "根宽度",
        display_name_en: "Root width",
        attr_type: "number",
        data_type: "number",
        options: [],
        required: true,
        allow_empty: false,
        default_value: null,
        sort_order: 10,
        source_category_id: 101,
        source_category_name: "Layout Root",
      },
    ],
    inherited: [],
    attributes: [],
    properties: [],
  },
  102: {
    own: [
      {
        id: 2,
        name: "child_color",
        display_name_zh: "子颜色",
        display_name_en: "Child color",
        attr_type: "string",
        data_type: "string",
        options: [],
        required: false,
        allow_empty: true,
        default_value: null,
        sort_order: 10,
        source_category_id: 102,
        source_category_name: "Layout Child",
      },
    ],
    inherited: [
      {
        id: 1,
        name: "root_width",
        display_name_zh: "根宽度",
        display_name_en: "Root width",
        attr_type: "number",
        data_type: "number",
        options: [],
        required: true,
        allow_empty: false,
        default_value: null,
        sort_order: 10,
        source_category_id: 101,
        source_category_name: "Layout Root",
        inherited_from_category_name: "Layout Root",
      },
    ],
    attributes: [],
    properties: [],
  },
};

async function mockBackend(page) {
  await page.route("**/api/v1/auth/login", async (route) => {
    await route.fulfill({ json: { access_token: "sprint57-token", token_type: "bearer", user: authUser } });
  });
  await page.route("**/api/v1/auth/me", async (route) => route.fulfill({ json: authUser }));
  await page.route("**/api/v1/users/me**", async (route) => route.fulfill({ json: authUser }));
  await page.route("**/api/v1/category-libraries", async (route) => route.fulfill({ json: categoryLibraries }));
  await page.route("**/api/v1/categories**", async (route) => {
    const requestUrl = route.request().url();
    const propertyCategoryId = Number(requestUrl.match(/\/categories\/(\d+)\/properties/)?.[1]);
    if (propertyCategoryId) {
      await route.fulfill({
        json: propertiesByCategory[propertyCategoryId] ?? {
          own: [],
          inherited: [],
          attributes: [],
          properties: [],
        },
      });
      return;
    }

    const url = new URL(requestUrl);
    const parentId = url.searchParams.get("parent_id");
    const level = url.searchParams.get("level");
    const categoryLibraryId = url.searchParams.get("category_library_id");

    let result = categories;
    if (parentId) {
      result = categories.filter((category) => category.parent_category_id === Number(parentId));
    } else if (level === "1") {
      result = categories.filter((category) => category.parent_category_id === null);
    }
    if (categoryLibraryId) {
      result = result.filter((category) => category.category_library_id === Number(categoryLibraryId));
    }
    await route.fulfill({ json: result });
  });
}

async function openCategoryPage(page) {
  await mockBackend(page);
  await page.goto("/login");
  await page.getByRole("button", { name: /登录|Log in/ }).click();
  await page.goto("/standard/category");
  await page.getByRole("button", { name: /Sprint 57 Library/ }).click();
}

test("category attributes panel renders below right-side category content", async ({ page }) => {
  await openCategoryPage(page);

  const treeNodeSelector = '[data-testid="category-tree-container"] [data-testid="category-tree-node"][data-node-type="category"]';
  await page.locator(treeNodeSelector).first().click();

  const panel = page.locator('[data-testid="category-attributes-panel"]');
  await expect(panel).toBeVisible();
  expect(await page.locator('[data-testid="category-content-container"] [data-testid="category-attributes-panel"]').count()).toEqual(1);
  expect(await page.locator('[data-testid="category-tree-container"] [data-testid="category-attributes-panel"]').count()).toEqual(0);

  const parentIsContent = await panel.evaluate((node) => node.parentElement?.getAttribute("data-testid"));
  expect(parentIsContent).toEqual("category-content-container");

  const panelBox = await panel.boundingBox();
  const contentMainBox = await page.locator('[data-testid="category-content-main"]').boundingBox();
  expect(panelBox.y >= contentMainBox.y + contentMainBox.height - 1).toBeTruthy();
});

test("category tree remains dedicated to hierarchy navigation", async ({ page }) => {
  await openCategoryPage(page);

  const treeSelector = '[data-testid="category-tree-container"]';
  expect(await page.locator(`${treeSelector} [data-testid="category-attributes-panel"]`).count()).toEqual(0);

  const expandableNode = page.locator(`${treeSelector} [data-testid="category-tree-node"][aria-expanded="false"]`).first();
  await expandableNode.click();
  expect(await expandableNode.getAttribute("aria-expanded")).toEqual("true");
  await expandableNode.click();
  expect(await expandableNode.getAttribute("aria-expanded")).toEqual("false");

  await page.locator(`${treeSelector} [data-testid="category-tree-node"][data-node-type="category"]`).first().click();
  const contentText = await page.locator('[data-testid="category-content-container"]').textContent();
  expect(contentText).toContain("Layout Root");
  expect(await page.locator(`${treeSelector} [data-testid="category-attributes-panel"]`).count()).toEqual(0);
});

test("category attributes panel follows the selected category without duplication", async ({ page }) => {
  await openCategoryPage(page);

  const treeSelector = '[data-testid="category-tree-container"]';
  await page.locator(`${treeSelector} [data-testid="category-tree-node"][data-node-type="category"]`).first().click();

  const panel = page.locator('[data-testid="category-attributes-panel"]');
  const categoryAId = await panel.getAttribute("data-selected-category-id");
  const summaryA = await panel.locator('[data-testid="category-attributes-summary"]').innerText();

  await page.locator(`${treeSelector} [data-testid="category-tree-node"][aria-expanded="false"]`).first().click();
  await page.locator(`${treeSelector} [data-testid="category-tree-node"][data-node-type="category"]`).nth(1).click();

  expect(await panel.getAttribute("data-selected-category-id")).not.toEqual(categoryAId);
  expect(await panel.locator('[data-testid="category-attributes-summary"]').innerText()).not.toEqual(summaryA);
  expect(await page.locator(`${treeSelector} [data-testid="category-attributes-panel"]`).count()).toEqual(0);
  expect(await page.locator('[data-testid="category-attributes-panel"]').count()).toEqual(1);
});
