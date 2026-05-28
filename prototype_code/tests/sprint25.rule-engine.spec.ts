import playwright, { type Browser, type Page } from "@playwright/test";

const { chromium, expect, test } = playwright;
let browser: Browser | null = null;
let browserUnavailable = "";

const superAdminUser = {
  id: 1,
  username: "super_admin",
  display_name: "Super Admin",
  is_super_admin: true,
  permissions: [],
  material_library_scope_ids: null,
  roles: [{ id: 1, name: "Administrator", code: "ADMIN", enabled: true }],
};

const regularUser = {
  id: 2,
  username: "hcm_zhangsan",
  display_name: "张三",
  is_super_admin: false,
  permissions: [],
  material_library_scope_ids: null,
  roles: [{ id: 2, name: "User", code: "USER", enabled: true }],
};

const categories = [
  ["unit_normalization", "单位标准化", "Unit Normalization"],
  ["brand_alias", "品牌别名", "Brand Alias"],
  ["title_cleaning", "标题清洗", "Title Cleaning"],
  ["enum_validation", "枚举校验", "Enum Validation"],
  ["required_field_check", "必填字段检查", "Required Field Check"],
  ["blackwhite_list", "黑白名单", "Blacklist / Whitelist"],
].map(([slug, zh, en], index) => ({
  id: index + 1,
  slug,
  display_name_zh: zh,
  display_name_en: en,
  description_zh: `${zh}描述`,
  description_en: `${en} description`,
  icon: "shield",
  sort_order: index + 1,
  created_at: "2026-05-14T00:00:00Z",
  rule_count: 2,
}));

const rules = [
  {
    id: 101,
    category_id: 1,
    category_slug: "unit_normalization",
    category: categories[0],
    name: "Normalize KG",
    description: "Convert KG to kg",
    pattern: "KG|公斤",
    value: "kg",
    options: { examples: ["KG"] },
    priority: 10,
    enabled: true,
    created_at: "2026-05-14T00:00:00Z",
    updated_at: "2026-05-14T00:00:00Z",
  },
  {
    id: 102,
    category_id: 2,
    category_slug: "brand_alias",
    category: categories[1],
    name: "Apple aliases",
    description: "Normalize Apple aliases",
    pattern: "苹果|APPLE",
    value: "Apple",
    options: { aliases: ["苹果"] },
    priority: 20,
    enabled: false,
    created_at: "2026-05-14T00:00:00Z",
    updated_at: "2026-05-14T00:00:00Z",
  },
];

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

async function pageForTest(user = superAdminUser, language = "zh-CN") {
  test.skip(Boolean(browserUnavailable), `Chromium launch unavailable in this sandbox: ${browserUnavailable}`);
  const context = await browser!.newContext({ baseURL: "http://localhost:5173" });
  await (context as any).addInitScript(
    ({ currentUser, lng }: { currentUser: typeof superAdminUser; lng: string }) => {
      window.localStorage.setItem(
        "ai-material-auth-session",
        JSON.stringify({ username: currentUser.username, role: currentUser.is_super_admin ? "super_admin" : "user" }),
      );
      window.localStorage.setItem("language", lng);
    },
    { currentUser: user, lng: language },
  );
  const page = await context.newPage();
  await page.route("**/api/v1/auth/me", async (route) => route.fulfill({ json: user }));
  await page.route("**/api/v1/workflows/applications", async (route) => route.fulfill({ json: [] }));
  await mockRuleApis(page);
  return { page, context };
}

async function mockRuleApis(page: Page) {
  await page.route("**/api/v1/rules/categories", async (route) => route.fulfill({ json: categories }));
  await page.route("**/api/v1/rules/101", async (route) => route.fulfill({ json: rules[0] }));
  await page.route("**/api/v1/rules/101/toggle", async (route) => {
    const body = (route.request() as any).postDataJSON() as { enabled: boolean };
    await route.fulfill({ json: { ...rules[0], enabled: body.enabled } });
  });
  await page.route("**/api/v1/rules", async (route) => {
    const request = route.request() as any;
    if (request.method() === "POST") {
      const body = request.postDataJSON() as Record<string, unknown>;
      await route.fulfill({
        json: {
          ...rules[0],
          id: 201,
          name: String(body.name),
          description: String(body.description),
          pattern: String(body.pattern),
          value: String(body.value),
          options: body.options,
        },
      });
      return;
    }
    await route.fulfill({ json: { items: rules, total: rules.length, page: 1, page_size: 5, pages: 1 } });
  });
}

test("super_admin can navigate categories and see rule management controls", async () => {
  const { page, context } = await pageForTest();
  await page.goto("/");

  await expect(page.getByText("规则引擎")).toBeVisible();
  await page.getByText("规则分类").click();
  await expect(page.getByText("单位标准化")).toBeVisible();
  await expect(page.getByText("unit_normalization")).toBeVisible();

  await page.getByText("单位标准化").click();
  await expect(page.getByRole("columnheader", { name: "模式 / 取值预览" })).toBeVisible();
  await expect(page.getByRole("button", { name: "新建规则" })).toBeVisible();
  await expect(page.getByRole("switch", { name: /Normalize KG/ })).toBeVisible();

  await context.close();
});

test("regular users can view rules but do not get write controls", async () => {
  const { page, context } = await pageForTest(regularUser);
  await page.goto("/rules");

  await expect(page.getByText("Normalize KG")).toBeVisible();
  expect(await page.getByRole("button", { name: "新建规则" }).count()).toEqual(0);
  expect(await page.getByRole("link", { name: "编辑" }).count()).toEqual(0);
  expect(await page.getByRole("switch").count()).toEqual(0);

  await page.goto("/rules/new");
  await expect(page.getByText("欢迎使用 AI 物料中台管理系统")).toBeVisible();

  await context.close();
});

test("create form validates required fields before posting", async () => {
  const { page, context } = await pageForTest();
  let postCount = 0;
  await page.route("**/api/v1/rules", async (route) => {
    if ((route.request() as any).method() === "POST") {
      postCount += 1;
    }
    await route.fulfill({ json: { items: rules, total: rules.length, page: 1, page_size: 5, pages: 1 } });
  });

  await page.goto("/rules/new");
  await page.getByRole("button", { name: "保存" }).click();

  await expect(page.getByText("请填写必填字段").first()).toBeVisible();
  expect(postCount).toEqual(0);

  await context.close();
});
