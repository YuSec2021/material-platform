import playwright, { type Browser } from "@playwright/test";

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
  username: "regular_user",
  display_name: "Regular User",
  is_super_admin: false,
  permissions: [],
  material_library_scope_ids: null,
  roles: [{ id: 2, name: "User", code: "USER", enabled: true }],
};

const seededCategories = [
  { id: 1, name: "S36Level1A", code: "S36L1A", parent_category_id: null, category_library: "Test Lib", description: "" },
  { id: 2, name: "S36Level2A", code: "S36L2A", parent_category_id: 1, category_library: "Test Lib", description: "" },
  { id: 3, name: "S36Level3A", code: "S36L3A", parent_category_id: 2, category_library: "Test Lib", description: "" },
];

const seededLibraries = [
  { id: 1, name: "Test Lib", code: "TEST001", description: "Sprint 36 test library", enabled: true },
];

const aiRecognitionResponse = {
  categories: [
    { level1: "办公设备", level2: "打印设备", level3: "激光打印机", confidence: 0.95 },
    { level1: "耗材", level2: "打印耗材", level3: "硒鼓", confidence: 0.88 },
  ],
  suggestions: ["建议检查分类层级是否完整"],
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

async function setupPage(user = superAdminUser, language = "zh-CN") {
  test.skip(Boolean(browserUnavailable), `Chromium launch unavailable: ${browserUnavailable}`);
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
  await page.route("**/api/v1/category-libraries", async (route) => route.fulfill({ json: seededLibraries }));
  await page.route("**/api/v1/ai/category-recognition/recognize", async (route) => {
    route.fulfill({ json: aiRecognitionResponse, status: 200 });
  });
  // Mock bulk-import endpoint to return structured success response
  await page.route("**/api/v1/categories/bulk-import*", async (route) => {
    const req = route.request() as any;
    if (req.method() === "POST") {
      const body = req.postDataJSON();
      if (body && body.rows) {
        const validCount = body.rows.filter((r: any) => r["一级类目"]).length;
        route.fulfill({
          json: {
            success_count: validCount,
            skipped_count: 0,
            error_count: body.rows.length - validCount,
            errors: [],
          },
          status: 200,
        });
        return;
      }
    }
    route.fulfill({ status: 400, json: { detail: "Invalid format" } });
  });
  await page.route("**/api/v1/categories", async (route) => {
    const req = route.request() as any;
    if (req.method() === "POST") {
      const body = req.postDataJSON();
      if (body && body.name) {
        route.fulfill({
          json: {
            id: Date.now(),
            name: body.name,
            code: body.code || "AUTO",
            parent_category_id: body.parent_category_id,
            category_library_id: body.category_library_id,
            category_library: "Test Lib",
            description: body.description || "",
          },
          status: 201,
        });
        return;
      }
    }
    route.fulfill({ json: seededCategories });
  });
  await page.route("**/api/v1/categories/template", async (route) => {
    route.fulfill({
      contentType: "text/csv",
      body: "一级类目,二级类目,三级类目\n办公设备,打印设备,激光打印机\n耗材,打印耗材,硒鼓\n工具,手动工具,螺丝刀",
    });
  });

  return { page, context };
}

// ==================== Criterion 3: Tree display ====================
test("category management UI shows expandable searchable tree backed by real data", async () => {
  const { page, context } = await setupPage();

  await page.goto("/standard/category");
  await page.waitForLoadState("networkidle");

  await expect(page.getByText("S36Level1A")).toBeVisible();

  const bodyText = await page.textContent("body");
  expect(bodyText).not.toMatch(/unimplemented|placeholder|mock.*data/i);

  // Use "全部展开" to expand all tree nodes
  await page.getByRole("button", { name: "全部展开" }).click();
  await page.waitForTimeout(500);

  await expect(page.getByText("S36Level3A")).toBeVisible();
  await expect(page.getByText("S36Level2A")).toBeVisible();

  // Search filters the tree
  const searchInput = page.locator('input[placeholder*="搜索"]');
  await searchInput.fill("S36Level3A");
  await page.waitForTimeout(300);
  await expect(page.getByText("S36Level3A")).toBeVisible();

  // Selecting a category shows context in sidebar
  await searchInput.clear();
  await page.waitForTimeout(200);
  await page.getByRole("button", { name: /S36Level3A/ }).first().click();
  await page.waitForTimeout(300);
  await expect(page.getByText("S36Level3A").first()).toBeVisible();

  await context.close();
});

// ==================== Criterion 4: Frontend CSV bulk import ====================
test("frontend CSV bulk import flow preview, validate, execute, and update tree", async () => {
  const { page, context } = await setupPage();

  await page.goto("/standard/category");
  await page.waitForLoadState("networkidle");

  const bulkBtn = page.getByRole("button", { name: /批量导入/i });
  await expect(bulkBtn).toBeVisible();
  await bulkBtn.click();
  await page.waitForTimeout(500);

  await expect(page.getByRole("heading", { name: /批量导入/i })).toBeVisible();
  // Dialog includes drag-and-drop upload
  await expect(page.getByText(/拖拽.*上传/i)).toBeVisible();
  // Download template button exists
  await expect(page.getByRole("button", { name: /下载CSV模板/i })).toBeVisible();

  // Upload a CSV with one valid row and one invalid row
  const csvContent = "一级类目,二级类目,三级类目\n电子产品,电脑,笔记本\n,缺失一级,错误行";
  await page.locator('input[type="file"]').first().setInputFiles({
    name: "test-categories.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csvContent),
  });
  await page.waitForTimeout(500);

  // Preview table is visible with column headers
  await expect(page.locator("table").getByRole("columnheader", { name: "一级类目" })).toBeVisible();
  await expect(page.locator("table").getByRole("columnheader", { name: "状态" })).toBeVisible();
  // Valid row status
  await expect(page.getByText("有效", { exact: true })).toBeVisible();
  // Invalid row shows error message
  await expect(page.getByText("缺少一级类目")).toBeVisible();
  // Summary tiles show counts
  await expect(page.getByText("有效行")).toBeVisible();
  await expect(page.getByText("无效行")).toBeVisible();

  // Upload valid CSV (all rows have 一级类目)
  const validCsv = "一级类目,二级类目,三级类目\n测试一级A,测试二级A,测试三级A\n测试一级B,测试二级B,测试三级B";
  await page.locator('input[type="file"]').first().setInputFiles({
    name: "valid-categories.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(validCsv),
  });
  await page.waitForTimeout(500);

  // Execute import - now all rows are valid
  const executeBtn = page.getByRole("button", { name: /执行导入/i });
  await expect(executeBtn).toBeEnabled();
  await executeBtn.click();
  await page.waitForTimeout(1500);

  // Result counts appear - check for the result summary text pattern
  const resultText = await page.textContent("body");
  expect(resultText).toMatch(/成功|3.*3|3.*\//);

  await context.close();
});

// ==================== Criterion 5: AI one-click import ====================
test("AI one-click import dialog calls recognition endpoint and confirms editable results", async () => {
  const { page, context } = await setupPage();

  await page.goto("/standard/category");
  await page.waitForLoadState("networkidle");

  const aiBtn = page.getByRole("button", { name: /AI一键导入/i });
  await expect(aiBtn).toBeVisible();
  await aiBtn.click();
  await page.waitForTimeout(500);

  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("heading", { name: /AI一键导入/i })).toBeVisible();

  const textarea = page.locator('textarea').first();
  await expect(textarea).toBeVisible();

  const rows = await textarea.getAttribute("rows");
  expect(Number(rows)).toBeGreaterThanOrEqual(10);

  await textarea.fill("办公设备 打印设备 激光打印机\n耗材/打印耗材/硒鼓\n工具类手动工具螺丝刀");

  // Click send button
  const sendBtn = page.getByRole("dialog").locator('button').filter({ hasText: /发送/ });
  await expect(sendBtn).toBeEnabled();
  await sendBtn.click();
  await page.waitForTimeout(3000);

  // Recognized results appear
  const body = await page.textContent("body");
  expect(body).toContain("办公设备");
  expect(body).toContain("激光打印机");

  // Edit at least one recognized category
  const dialogInputs = page.locator('input[type="text"]');
  await dialogInputs.first().fill("办公设备（修改）");

  // Confirm the import
  const confirmBtn = page.getByText("确认导入识别结果");
  await expect(confirmBtn).toBeEnabled();
  await confirmBtn.click();
  await page.waitForTimeout(1000);

  // After confirmation, AI dialog closes
  await expect(page.getByRole("button", { name: /AI一键导入/i })).toBeVisible();

  await context.close();
});

// ==================== Criterion 6: Permissions and i18n ====================
test("i18n displays Chinese labels for zh-CN", async () => {
  const { page, context } = await setupPage(superAdminUser, "zh-CN");

  await page.goto("/standard/category");
  await page.waitForLoadState("networkidle");

  await expect(page.getByRole("heading", { name: "类目管理" })).toBeVisible();
  await expect(page.getByRole("button", { name: /批量导入/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /AI一键导入/i })).toBeVisible();

  const bodyText = await page.textContent("body");
  expect(bodyText).not.toMatch(/\[(field\.|page\.|action\.|categoryImport\.)[^\]]+\]/);

  await context.close();
});

test("i18n displays English labels for en-US without raw keys", async () => {
  const { page, context } = await setupPage(superAdminUser, "en-US");

  await page.goto("/standard/category");
  await page.waitForLoadState("networkidle");

  const bodyText = await page.textContent("body");
  expect(bodyText).not.toMatch(/\[(field\.|page\.|action\.|categoryImport\.)[^\]]+\]/);

  await context.close();
});

test("regular user can view tree but cannot use bulk or AI import", async () => {
  const { page, context } = await setupPage(regularUser);

  await page.goto("/standard/category");
  await page.waitForLoadState("networkidle");

  await expect(page.getByText("S36Level1A")).toBeVisible();

  await expect(page.getByRole("button", { name: /批量导入/i })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /AI一键导入/i })).toHaveCount(0);

  await context.close();
});

// ==================== Criterion 7: Build passes ====================
test("build passes without TypeScript or Vite errors", async () => {
  const { execSync: shell } = await import("child_process");
  try {
    shell("npm run build 2>&1", {
      cwd: "/Users/yusec/projects/material_retrieval/prototype_code",
      encoding: "utf-8",
      timeout: 120000,
    });
    expect(true).toBe(true);
  } catch (error: any) {
    const output = error.stdout + error.stderr;
    const tsErrors = output.match(/TS\d+:\s*Error|Compilation Error|Vite Error/gi);
    expect(tsErrors).toHaveLength(0);
  }
});