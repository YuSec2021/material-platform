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

const category = {
  id: 1,
  name: "网络设备",
  code: "NET",
  level: 1,
  parent_id: null,
  enabled: true,
  description: "Network equipment",
};

const library = {
  id: 1,
  code: "LIB-001",
  name: "默认物料库",
  description: "Default library",
  enabled: true,
  auto_code_enabled: true,
  recode_enabled: true,
  current_rule_version_id: 1,
  material_count: 1,
};

const productName = {
  id: 1,
  name: "交换机",
  code: "SW",
  category_id: 1,
  category: "网络设备",
  unit: "台",
  aliases: [],
  definition: "Network switch",
  description: "",
  enabled: true,
};

const brand = { id: 1, name: "Demo", code: "DEMO", description: "", logo: null, enabled: true };
const attribute = {
  id: 1,
  product_name_id: 1,
  product_name: "交换机",
  name: "端口",
  code: "PORT",
  type: "text",
  required: true,
  options: [],
  description: "",
  enabled: true,
};
const material = {
  id: 1,
  code: "MAT-001",
  name: "核心交换机",
  product_name_id: 1,
  product_name: "交换机",
  material_library_id: 1,
  material_library: "默认物料库",
  category_id: 1,
  category: "网络设备",
  unit: "台",
  brand_id: 1,
  brand: "Demo",
  status: "normal",
  description: "",
  attributes: { 端口: "24" },
  lifecycle_history: [],
  enabled: true,
  created_at: "2026-05-19T00:00:00Z",
  updated_at: "2026-05-19T00:00:00Z",
};

const role = {
  id: 1,
  name: "Administrator",
  code: "ADMIN",
  description: "Admin role",
  enabled: true,
  users: [],
  user_count: 0,
  permissions: [],
  created_at: "2026-05-19T00:00:00Z",
  updated_at: "2026-05-19T00:00:00Z",
};

const systemConfig = {
  system_name: "智料通",
  icon: { filename: "", content_type: "", data_url: "" },
  stop_purchase_reasons: [{ name: "停采原因", enabled: true }],
  stop_use_reasons: [{ name: "停用原因", enabled: true }],
  approval_mode: "simple",
  updated_by: "super_admin",
  updated_at: "2026-05-19T00:00:00Z",
};

const ruleCategory = {
  id: 1,
  slug: "unit_normalization",
  display_name_zh: "单位标准化",
  display_name_en: "Unit Normalization",
  description_zh: "统一单位写法",
  description_en: "Normalize units",
  icon: "shield",
  sort_order: 1,
  created_at: "2026-05-19T00:00:00Z",
  rule_count: 1,
};

const rule = {
  id: 1,
  category_id: 1,
  category_slug: "unit_normalization",
  category: ruleCategory,
  name: "KG 转 kg",
  description: "Normalize KG",
  pattern: "KG",
  value: "kg",
  options: {},
  priority: 10,
  enabled: true,
  created_at: "2026-05-19T00:00:00Z",
  updated_at: "2026-05-19T00:00:00Z",
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
  const context = await browser!.newContext({ baseURL: "http://localhost:5173", viewport: { width: 1440, height: 900 } });
  await (context as any).addInitScript(() => {
    window.localStorage.setItem("ai-material-auth-session", JSON.stringify({ username: "super_admin", role: "super_admin" }));
    window.localStorage.setItem("theme", "dark");
    document.documentElement.classList.add("dark");
  });
  const page = await context.newPage();
  await page.route("**/api/v1/**", async (route) => route.fulfill({ json: [] }));
  await mockApis(page);
  return { page, context };
}

async function mockApis(page: Page) {
  await page.route("**/api/v1/auth/me", async (route) => route.fulfill({ json: superAdminUser }));
  await page.route("**/api/v1/material-libraries", async (route) => route.fulfill({ json: [library] }));
  await page.route("**/api/v1/material-libraries/**", async (route) => {
    const url = (route.request() as any).url() as string;
    if (url.includes("/code-mappings")) {
      await route.fulfill({ json: { items: [], total: 0, page: 1, page_size: 10 } });
      return;
    }
    if (url.includes("/versions")) {
      await route.fulfill({ json: { items: [], total: 0, page: 1, page_size: 10 } });
      return;
    }
    await route.fulfill({ json: library });
  });
  await page.route("**/api/v1/categories", async (route) => route.fulfill({ json: [category] }));
  await page.route("**/api/v1/product-names", async (route) => route.fulfill({ json: [productName] }));
  await page.route("**/api/v1/attributes**", async (route) => route.fulfill({ json: [attribute] }));
  await page.route("**/api/v1/brands", async (route) => route.fulfill({ json: [brand] }));
  await page.route("**/api/v1/materials**", async (route) => route.fulfill({ json: [material] }));
  await page.route("**/api/v1/workflows/applications**", async (route) => route.fulfill({ json: [] }));
  await page.route("**/api/v1/users", async (route) => route.fulfill({ json: [superAdminUser] }));
  await page.route("**/api/v1/roles/1/permissions", async (route) =>
    route.fulfill({ json: { role_id: 1, role_name: "Administrator", permissions: [], catalog: [] } }),
  );
  await page.route("**/api/v1/roles", async (route) => route.fulfill({ json: [role] }));
  await page.route("**/api/v1/permissions/catalog", async (route) => route.fulfill({ json: [] }));
  await page.route("**/api/v1/system/config", async (route) => route.fulfill({ json: systemConfig }));
  await page.route("**/api/v1/ai/providers", async (route) => route.fulfill({ json: [] }));
  await page.route("**/api/v1/models**", async (route) => route.fulfill({ json: [] }));
  await page.route("**/api/v1/capability-mappings**", async (route) => route.fulfill({ json: [] }));
  await page.route("**/api/v1/ai/capability-mappings", async (route) => route.fulfill({ json: [] }));
  await page.route("**/api/v1/debug/trace", async (route) => route.fulfill({ json: [] }));
  await page.route("**/api/v1/rules/categories", async (route) => route.fulfill({ json: [ruleCategory] }));
  await page.route(/\/api\/v1\/rules(?:\?.*)?$/, async (route) =>
    route.fulfill({ json: { items: [rule], total: 1, page: 1, page_size: 5, pages: 1 } }),
  );
}

async function primaryWhiteSurfaces(page: Page) {
  return (page as any).evaluate(() => {
    const isVisible = (element: Element) => {
      const rect = element.getBoundingClientRect();
      const style = window.getComputedStyle(element);
      return rect.width > 80 && rect.height > 24 && style.visibility !== "hidden" && style.display !== "none";
    };
    return Array.from(document.querySelectorAll("main, main *"))
      .filter(isVisible)
      .map((element) => {
        const style = window.getComputedStyle(element);
        return {
          tag: element.tagName.toLowerCase(),
          className: element.getAttribute("class") ?? "",
          backgroundColor: style.backgroundColor,
          text: (element.textContent ?? "").trim().slice(0, 40),
        };
      })
      .filter((item) => item.backgroundColor === "rgb(255, 255, 255)");
  });
}

test("covered feature pages avoid pure white primary surfaces in dark theme", async () => {
  test.setTimeout(120_000);
  const { page, context } = await pageForTest();
  const routes = [
    "/standard/category-library",
    "/standard/category",
    "/standard/product-name",
    "/standard/attribute",
    "/standard/brand",
    "/material/library",
    "/material/list",
    "/application/category",
    "/application/material-code",
    "/application/stop-purchase",
    "/application/stop-use",
    "/system/users",
    "/system/roles",
    "/system/permissions",
    "/system/info",
    "/system/reason-options",
    "/system/approval-mode",
    "/ai/providers",
    "/ai/capability-mappings",
    "/ai/token-usage",
    "/rules/categories",
    "/rules",
  ];

  for (const route of routes) {
    await page.goto(route);
    await expect(page.locator("main").first()).toBeVisible();
    await expect(page.locator("h1, h2").first()).toBeVisible();
    expect(await primaryWhiteSurfaces(page)).toEqual([]);
  }

  await context.close();
});
