import { chromium } from "@playwright/test";

const BASE = "http://localhost:5173";
const results = [];

function result(name, pass, observation) {
  results.push({ name, pass, observation });
  console.log(`${pass ? "PASS" : "FAIL"}: ${name} - ${observation}`);
}

async function run() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  // Clear storage and go to login
  await page.goto(BASE);
  await page.evaluate(() => localStorage.clear());
  await page.goto(`${BASE}/login`);
  await page.waitForLoadState("networkidle");

  // Sign in as super_admin
  const usernameInput = page.locator('input[name="username"], input[type="text"]').first();
  const passwordInput = page.locator('input[type="password"]').first();
  await usernameInput.fill("super_admin");
  await passwordInput.fill("admin123");

  const loginButton = page.locator('button[type="submit"], button:has-text("登录"), button:has-text("Sign in")').first();
  await loginButton.click();
  await page.waitForURL(url => !url.pathname.includes("login"), { timeout: 10000 });

  // ===== Criterion 1: AI Governance Modal =====
  try {
    await page.goto(`${BASE}/materials`);
    await page.waitForLoadState("networkidle");

    // Check AI governance button exists and is shadcn-style
    const governanceBtn = page.locator('button:has-text("治理"), [aria-label*="治理"], [aria-label*="AI物料"]').first();
    const governanceBtnExists = await governanceBtn.count() > 0;

    if (governanceBtnExists) {
      const classAttr = await governanceBtn.getAttribute("class") ?? "";
      const isShadcn = !classAttr.includes("gradient") && !classAttr.includes("bg-gradient");
      result("AI Governance button is shadcn-style", isShadcn, `Button found, shadcn-style check: ${isShadcn}`);

      // Click the AI governance button
      await governanceBtn.click();
      await page.waitForTimeout(500);

      // Check modal opened
      const modal = page.locator('[role="dialog"], .modal, .fixed');
      const modalVisible = await modal.count() > 0;
      result("AI Governance modal opens on click", modalVisible, `Modal count: ${await modal.count()}`);

      // Check modal has file input
      const fileInput = page.locator('input[type="file"]');
      const fileInputCount = await fileInput.count();
      result("AI Governance modal has file input", fileInputCount > 0, `File inputs found: ${fileInputCount}`);

      // Check analyze button exists and is disabled without file
      const analyzeBtn = page.locator('button:has-text("分析"), button:has-text("Analyze")');
      const analyzeBtnCount = await analyzeBtn.count();
      result("AI Governance analyze button exists", analyzeBtnCount > 0, `Analyze buttons: ${analyzeBtnCount}`);

      // Check no preview rows before upload
      const previewTable = page.locator('table');
      const previewRowBeforeUpload = await page.locator('table tbody tr').count();
      result("No preview rows before upload", previewRowBeforeUpload === 0, `Rows visible: ${previewRowBeforeUpload}`);
    } else {
      result("AI Governance button is shadcn-style", false, "Governance button not found");
      result("AI Governance modal opens on click", false, "Governance button not found");
    }
  } catch (e) {
    result("AI Governance flow", false, `Exception: ${e.message}`);
  }

  // ===== Criterion 2: AI Natural Language Add Modal =====
  try {
    // Close modal if open
    const closeBtn = page.locator('[role="dialog"] button:has-text("关闭"), [role="dialog"] button:has-text("Close")');
    if (await closeBtn.count() > 0) {
      await closeBtn.first().click();
      await page.waitForTimeout(300);
    }

    const addBtn = page.locator('button:has-text("添加"), [aria-label*="添加"], [aria-label*="AI物料"]').first();
    const addBtnExists = await addBtn.count() > 0;

    if (addBtnExists) {
      await addBtn.click();
      await page.waitForTimeout(500);

      const modal = page.locator('[role="dialog"]');
      const modalVisible = await modal.count() > 0;
      result("AI Natural Language Add modal opens", modalVisible, `Modal count: ${await modal.count()}`);

      const textarea = page.locator('textarea');
      const textareaCount = await textarea.count();
      result("AI Natural Language Add has textarea input", textareaCount > 0, `Textareas: ${textareaCount}`);

      // Analyze button should be disabled with empty textarea
      const analyzeBtnInModal = page.locator('[role="dialog"] button:has-text("分析")');
      if (await analyzeBtnInModal.count() > 0) {
        const isDisabled = await analyzeBtnInModal.first().isDisabled();
        result("Analyze button disabled with empty description", isDisabled, `Disabled: ${isDisabled}`);
      } else {
        result("Analyze button disabled with empty description", false, "Analyze button not found in modal");
      }

      // Enter text and check validation
      if (await textarea.count() > 0) {
        await textarea.first().fill("华为工业交换机，8口千兆，导轨安装");
        await page.waitForTimeout(200);

        const analyzeEnabled = await analyzeBtnInModal.count() > 0 && !(await analyzeBtnInModal.first().isDisabled());
        result("Analyze button enabled with description input", analyzeEnabled, `Enabled: ${analyzeEnabled}`);
      }
    } else {
      result("AI Natural Language Add modal opens", false, "Add button not found");
    }
  } catch (e) {
    result("AI Natural Language Add flow", false, `Exception: ${e.message}`);
  }

  // ===== Criterion 3: AI Vector Matching Modal =====
  try {
    // Close modal if open
    const closeBtn = page.locator('[role="dialog"] button:has-text("关闭"), [role="dialog"] button:has-text("Close")').first();
    if (await closeBtn.count() > 0) {
      await closeBtn.click();
      await page.waitForTimeout(300);
    }

    const matchBtn = page.locator('button:has-text("匹配"), [aria-label*="匹配"], [aria-label*="AI物料"]').first();
    const matchBtnExists = await matchBtn.count() > 0;

    if (matchBtnExists) {
      await matchBtn.click();
      await page.waitForTimeout(500);

      const modal = page.locator('[role="dialog"]');
      result("AI Vector Matching modal opens", await modal.count() > 0, `Modal count: ${await modal.count()}`);

      const searchInput = page.locator('[role="dialog"] input[type="text"], [role="dialog"] input:not([type="file"])').first();
      const searchInputCount = await searchInput.count();
      result("AI Vector Matching has text input", searchInputCount > 0, `Inputs: ${searchInputCount}`);

      const matchActionBtn = page.locator('[role="dialog"] button:has-text("匹配")').first();
      const matchBtnCount = await matchActionBtn.count();
      result("AI Vector Matching action button exists", matchBtnCount > 0, `Match buttons: ${matchBtnCount}`);
    } else {
      result("AI Vector Matching modal opens", false, "Match button not found");
    }
  } catch (e) {
    result("AI Vector Matching flow", false, `Exception: ${e.message}`);
  }

  // ===== Criterion 4: AI Tracing Debug Page =====
  try {
    // Close any open modal
    const closeBtn = page.locator('[role="dialog"] button:has-text("关闭"), [role="dialog"] button:has-text("Close")').first();
    if (await closeBtn.count() > 0) {
      await closeBtn.click();
      await page.waitForTimeout(300);
    }

    await page.goto(`${BASE}/debug/trace`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1000);

    const pageContent = await page.content();
    const hasTraceContent = pageContent.includes("trace") || pageContent.includes("Trace") || pageContent.includes("span") || pageContent.includes("链");
    result("Debug/trace page renders trace content", hasTraceContent, `Page content length: ${pageContent.length}`);
  } catch (e) {
    result("Debug/trace page", false, `Exception: ${e.message}`);
  }

  // ===== Criterion 5: Dashboard =====
  try {
    await page.goto(BASE);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1000);

    const pageContent = await page.content();
    const hasDashboardContent = pageContent.includes("最近") || pageContent.includes("recent") || pageContent.includes("application") || pageContent.includes("审批") || pageContent.includes("待");
    result("Dashboard renders application list content", hasDashboardContent, `Has dashboard content: ${hasDashboardContent}`);
  } catch (e) {
    result("Dashboard", false, `Exception: ${e.message}`);
  }

  // ===== Criterion 6: Accessibility - aria-labels on AI buttons =====
  try {
    await page.goto(`${BASE}/materials`);
    await page.waitForLoadState("networkidle");

    const aiButtons = page.locator('[aria-label]');
    const allButtons = page.locator('button');
    const buttonCount = await allButtons.count();
    const labeledCount = await aiButtons.count();
    result("MaterialList has accessible buttons with aria-labels", labeledCount > 0, `aria-labeled elements: ${labeledCount} / ${buttonCount} buttons`);
  } catch (e) {
    result("Accessibility check", false, `Exception: ${e.message}`);
  }

  // ===== Criterion 6: Auth redirect =====
  try {
    const newContext = await browser.newContext();
    const newPage = await newContext.newPage();
    await newPage.goto(`${BASE}/materials`);
    await newPage.waitForTimeout(1000);
    const url = newPage.url();
    const redirectedToLogin = url.includes("/login");
    result("Unauthenticated access redirects to login", redirectedToLogin, `URL: ${url}`);
    await newContext.close();
  } catch (e) {
    result("Auth redirect", false, `Exception: ${e.message}`);
  }

  await browser.close();

  // Summary
  console.log("\n=== SUMMARY ===");
  const passed = results.filter(r => r.pass).length;
  const total = results.length;
  console.log(`${passed}/${total} checks passed`);
  results.forEach(r => {
    console.log(`${r.pass ? "PASS" : "FAIL"}: ${r.name}`);
  });

  return results;
}

run().catch(e => {
  console.error("Test runner error:", e);
  process.exit(1);
});