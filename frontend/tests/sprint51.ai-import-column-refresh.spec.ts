import playwright, { type Browser } from "@playwright/test";

const { test, expect, chromium } = playwright;

let browser: Browser | null = null;

test.beforeAll(async () => {
  browser = await chromium.launch();
});

test.afterAll(async () => {
  await browser?.close();
});

test("AI import preview column headers refresh after each recognition", async () => {
  const context = await browser!.newContext({ baseURL: "http://localhost:24333" });

  await (context as any).addInitScript(
    () => {
      window.localStorage.setItem("language", "zh-CN");
      window.localStorage.setItem(
        "ai-material-auth-session",
        JSON.stringify({ username: "super_admin", role: "super_admin" }),
      );
    },
  );

  const page = await context.newPage();

  await page.route("**/api/v1/auth/me", (route) =>
    route.fulfill({
      json: {
        id: 1, username: "super_admin", display_name: "Super Admin",
        is_super_admin: true, permissions: [], material_library_scope_ids: null,
        roles: [{ id: 1, name: "Administrator", code: "ADMIN", enabled: true }],
      },
    }),
  );

  await page.route("**/api/v1/auth/login", (route) =>
    route.fulfill({
      json: {
        id: 1, username: "super_admin", display_name: "Super Admin",
        is_super_admin: true, permissions: [], material_library_scope_ids: null,
        roles: [{ id: 1, name: "Administrator", code: "ADMIN", enabled: true }],
      },
    }),
  );

  await page.route("**/api/v1/category-libraries", (route) =>
    route.fulfill({
      json: [{ id: 1, name: "Test Lib", code: "TEST001", description: "test", enabled: true }],
    }),
  );

  await page.route("**/api/v1/categories", (route) =>
    route.fulfill({
      json: [{ id: 1, name: "Test", code: "T1", parent_category_id: null, category_library_id: 1, category_library: "Test Lib", description: "" }],
    }),
  );

  await page.route("**/api/v1/ai/category-recognition/recognize", (route) => {
    const body = (route.request() as any).postDataJSON();
    const text: string = body?.text ?? "";
    console.log("AI recognition called with text:", text);
    if (text.includes("A4纸") || text.includes("80g")) {
      route.fulfill({ json: { categories: [{ level1: "办公用品", level2: "纸张", level3: "复印纸", level4: "A4纸", level5: "80g", confidence: 0.92 }], suggestions: [] } });
    } else if (text.includes("设备") && !text.includes("办公设备")) {
      route.fulfill({ json: { categories: [{ level1: "设备", level2: "打印设备", confidence: 0.88 }], suggestions: [] } });
    } else {
      route.fulfill({ json: { categories: [{ level1: "办公设备", level2: "打印设备", level3: "激光打印机", confidence: 0.95 }], suggestions: [] } });
    }
  });

  await page.goto("/standard/category");
  await expect(page.getByRole("heading", { name: /类目管理|Category Management/ })).toBeVisible();

  // Open AI import dialog
  const aiBtn = page.getByRole("button", { name: /AI一键导入/i });
  await expect(aiBtn).toBeVisible();
  await aiBtn.click();
  await page.waitForTimeout(500);

  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("heading", { name: /AI一键导入/i })).toBeVisible();

  // Now the textarea should be visible since the modal is open
  // But actually the textarea only shows when aiText.trim() is non-empty
  // Let me check if there's a textarea immediately
  let textareaCount = await page.locator('textarea').count();
  console.log(`Initial textarea count: ${textareaCount}`);

  // If no textarea, we need to type something first to trigger React state
  // Let's try focusing on the select (category library) and typing there to see if textarea appears
  const selectInDialog = page.getByRole("dialog").locator("select");
  await selectInDialog.waitFor({ state: "visible", timeout: 3000 });

  // Type directly - React should capture the input
  // Actually the issue is React state doesn't update from Playwright fill until you interact
  // Let's try clicking on the page body first then typing

  // Actually looking at the working test, they just do textarea.fill() and it works
  // The difference might be how the modal is opened
  // Let me try using page.keyboard to type in the dialog area

  // Try filling textarea directly (the working test does this)
  if (textareaCount === 0) {
    // No textarea yet - let's wait and check again
    await page.waitForTimeout(500);
    textareaCount = await page.locator('textarea').count();
    console.log(`After wait textarea count: ${textareaCount}`);
  }

  // Get textarea - use first() like the working test
  const textarea = page.locator('textarea').first();

  // --- Recognition 1: 3-level ---
  await textarea.fill("办公设备 / 打印设备 / 激光打印机");

  // Click send button
  const sendBtn = page.getByRole("dialog").locator('button').filter({ hasText: /发送/ });
  await expect(sendBtn).toBeEnabled();
  await sendBtn.click();
  await page.waitForTimeout(1000);
  await page.screenshot({ path: "/tmp/ai-3level-result.png" });

  // Check the header columns
  let levelThs = page.locator("table thead th").filter({ hasText: /一级类目|二级类目|三级类目|四级类目|五级类目/i });
  let levelCount = await levelThs.count();
  console.log(`After 3-level recognition: ${levelCount} level headers`);
  expect(levelCount).toBe(3);

  // --- Recognition 2: 5-level ---
  await textarea.fill("办公用品 / 纸张 / 复印纸 / A4纸 / 80g");
  await sendBtn.click();
  await page.waitForTimeout(1000);
  await page.screenshot({ path: "/tmp/ai-5level-result.png" });

  levelThs = page.locator("table thead th").filter({ hasText: /一级类目|二级类目|三级类目|四级类目|五级类目/i });
  levelCount = await levelThs.count();
  console.log(`After 5-level recognition: ${levelCount} level headers`);
  expect(levelCount).toBe(5);

  // --- Recognition 3: 2-level ---
  await textarea.fill("打印设备");
  await sendBtn.click();
  await page.waitForTimeout(1000);
  await page.screenshot({ path: "/tmp/ai-2level-result.png" });

  levelThs = page.locator("table thead th").filter({ hasText: /一级类目|二级类目|三级类目|四级类目|五级类目/i });
  levelCount = await levelThs.count();
  console.log(`After 2-level recognition: ${levelCount} level headers`);
  expect(levelCount).toBe(2);

  await context.close();
});
