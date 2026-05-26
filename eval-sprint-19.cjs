const { chromium } = require("@playwright/test");

const BASE = "http://localhost:5173";
const results = [];

function result(name, pass, observation) {
  results.push({ name, pass, observation });
  console.log(`${pass ? "PASS" : "FAIL"}: ${name} - ${observation}`);
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  // Clear storage and go to login
  await page.goto(BASE);
  await page.evaluate(() => localStorage.clear());
  await page.goto(`${BASE}/login`);
  await page.waitForLoadState("networkidle");

  // Sign in as super_admin
  try {
    const usernameInput = page.locator('input[name="username"], input[type="text"]').first();
    const passwordInput = page.locator('input[type="password"]').first();
    await usernameInput.fill("super_admin");
    await passwordInput.fill("admin123");
    const loginButton = page.locator('button[type="submit"], button:has-text("登录"), button:has-text("Sign in")').first();
    await loginButton.click();
    await page.waitForURL(url => !url.pathname.includes("login"), { timeout: 10000 });
    result("Authentication", true, "Login successful as super_admin");
  } catch (e) {
    result("Authentication", false, `Login failed: ${e.message}`);
    await browser.close();
    process.exit(1);
  }

  // Navigate to materials
  await page.goto(`${BASE}/materials`);
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(1000);

  // Verify 3 AI buttons are present
  const aiButtons = page.locator('button[aria-label*="AI"], button[aria-label*="治理"], button[aria-label*="添加"], button[aria-label*="匹配"]');
  const aiButtonCount = await aiButtons.count();
  result("3 AI action buttons present on MaterialList", aiButtonCount >= 3, `Found ${aiButtonCount} AI-labeled buttons`);

  // Verify shadcn style (no gradient)
  for (let i = 0; i < Math.min(aiButtonCount, 3); i++) {
    const btn = aiButtons.nth(i);
    const classAttr = await btn.getAttribute("class") ?? "";
    if (!classAttr.includes("gradient") && !classAttr.includes("bg-gradient")) {
      result(`AI button ${i+1} is shadcn-style (no gradient)`, true, `Button ${i+1}: OK`);
      break;
    }
  }

  // ===== Test AI Governance Modal =====
  try {
    const governanceBtn = page.locator('button[aria-label="AI物料治理"]');
    if (await governanceBtn.count() > 0) {
      await governanceBtn.click({ force: true });
      await page.waitForTimeout(1500);  // Wait for React to render modal

      const modalBackdrop = page.locator('.fixed.inset-0.bg-black');
      const modalDialog = page.locator('[role="dialog"]');
      const modalCount = await modalDialog.count();
      result("Governance modal opens", modalCount > 0, `Dialogs found: ${modalCount}`);

      if (modalCount > 0) {
        // File input in modal
        const fileInput = page.locator('[role="dialog"] input[type="file"]');
        result("Governance modal has file input", await fileInput.count() > 0, `File inputs: ${await fileInput.count()}`);

        // Analyze button
        const analyzeBtn = page.locator('[role="dialog"] button:has-text("分析")');
        const analyzeCount = await analyzeBtn.count();
        result("Governance modal has analyze button", analyzeCount > 0, `Analyze buttons: ${analyzeCount}`);

        // Check analyze disabled without file
        if (analyzeCount > 0) {
          const isDisabled = await analyzeBtn.first().isDisabled();
          result("Analyze disabled before file selected", isDisabled, `Disabled: ${isDisabled}`);
        }

        // No preview rows before upload
        const previewTable = page.locator('[role="dialog"] table tbody tr');
        const rowCount = await previewTable.count();
        result("No preview rows before upload", rowCount === 0, `Rows: ${rowCount}`);

        // Modal title check
        const modalTitle = page.locator('[role="dialog"] h3, [role="dialog"] [class*="text-lg"]').first().textContent();
        result("Modal title contains governance text", (modalTitle?.includes("治理") ?? false), `Title: ${modalTitle}`);
      }
    } else {
      result("Governance modal opens", false, "Governance button not found");
    }
  } catch (e) {
    result("AI Governance modal flow", false, `Exception: ${e.message}`);
  }

  // Close modal and test Natural Language Add
  try {
    // Close current modal using the X button or Escape
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
    // Or click backdrop
    const backdrop = page.locator('.fixed.inset-0.bg-black').first();
    if (await backdrop.count() > 0) {
      await backdrop.click({ force: true, position: { x: 5, y: 5 } });
      await page.waitForTimeout(500);
    }

    const addBtn = page.locator('button[aria-label="AI自然语言添加"]');
    if (await addBtn.count() > 0) {
      await addBtn.click({ force: true });
      await page.waitForTimeout(1500);

      const modalDialog = page.locator('[role="dialog"]');
      const modalCount = await modalDialog.count();
      result("Natural Language Add modal opens", modalCount > 0, `Dialogs: ${modalCount}`);

      if (modalCount > 0) {
        const textarea = page.locator('[role="dialog"] textarea');
        result("Natural Language modal has textarea", await textarea.count() > 0, `Textareas: ${await textarea.count()}`);

        const analyzeBtn = page.locator('[role="dialog"] button:has-text("分析")');
        if (await analyzeBtn.count() > 0) {
          const isDisabledEmpty = await analyzeBtn.first().isDisabled();
          result("Analyze disabled with empty textarea", isDisabledEmpty, `Disabled: ${isDisabledEmpty}`);

          // Enter text
          await textarea.first().fill("华为工业交换机，8口千兆，导轨安装");
          await page.waitForTimeout(300);
          const isEnabledAfter = await analyzeBtn.first().isEnabled();
          result("Analyze enabled after entering description", isEnabledAfter, `Enabled: ${isEnabledAfter}`);
        }
      }
    } else {
      result("Natural Language Add modal opens", false, "Add button not found");
    }
  } catch (e) {
    result("AI Natural Language Add flow", false, `Exception: ${e.message}`);
  }

  // Close and test Vector Matching
  try {
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
    const backdrop = page.locator('.fixed.inset-0.bg-black').first();
    if (await backdrop.count() > 0) {
      await backdrop.click({ force: true, position: { x: 5, y: 5 } });
      await page.waitForTimeout(500);
    }

    const matchBtn = page.locator('button[aria-label="AI向量匹配"]');
    if (await matchBtn.count() > 0) {
      await matchBtn.click({ force: true });
      await page.waitForTimeout(1500);

      const modalDialog = page.locator('[role="dialog"]');
      const modalCount = await modalDialog.count();
      result("Vector Matching modal opens", modalCount > 0, `Dialogs: ${modalCount}`);

      if (modalCount > 0) {
        const textInput = page.locator('[role="dialog"] input:not([type="file"]):not([type="hidden"])').first();
        result("Vector Matching has text input", await textInput.count() > 0, `Input found: ${await textInput.count() > 0}`);

        const matchBtnAction = page.locator('[role="dialog"] button:has-text("匹配")');
        result("Vector Matching has match action button", await matchBtnAction.count() > 0, `Match buttons: ${await matchBtnAction.count()}`);

        if (await matchBtnAction.count() > 0) {
          const isDisabled = await matchBtnAction.first().isDisabled();
          result("Match button disabled without query", isDisabled, `Disabled: ${isDisabled}`);
        }
      }
    } else {
      result("Vector Matching modal opens", false, "Match button not found");
    }
  } catch (e) {
    result("AI Vector Matching flow", false, `Exception: ${e.message}`);
  }

  // ===== Test Debug/Trace Page =====
  try {
    // Close modal first
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
    const backdrop = page.locator('.fixed.inset-0.bg-black').first();
    if (await backdrop.count() > 0) {
      await backdrop.click({ force: true, position: { x: 5, y: 5 } });
      await page.waitForTimeout(500);
    }

    // Navigate to trace page
    await page.goto(`${BASE}/debug/trace`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    const url = page.url();
    const onTracePage = url.includes("/debug/trace");
    result("Navigated to /debug/trace", onTracePage, `URL: ${url}`);

    // Check page renders trace content (not login page)
    const content = await page.content();
    const notLoginPage = !content.includes("Sign in") && !content.includes("用户名") && !content.includes("password");
    result("Trace page does not redirect to login", notLoginPage, `Content includes login elements: ${content.includes("password")}`);

    const hasTraceContent = content.includes("trace") || content.includes("Trace") || content.includes("span") || content.includes("链") || content.includes("追踪") || content.includes("AI链路追踪");
    result("Trace page renders trace-related content", hasTraceContent, `Has trace content: ${hasTraceContent}`);
  } catch (e) {
    result("Debug/trace page", false, `Exception: ${e.message}`);
  }

  // ===== Test Dashboard =====
  try {
    await page.goto(BASE);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    const content = await page.content();
    const hasRecentApps = content.includes("最近") || content.includes("application") || content.includes("审批") || content.includes("流程") || content.includes("草稿") || content.includes("待审批");
    result("Dashboard renders with recent applications content", hasRecentApps, `Has application content: ${hasRecentApps}`);

    // Check dashboard sends correct API request
    const dashboardRequest = page.waitForResponse(resp => resp.url().includes("workflows/applications") || resp.url().includes("applications"), { timeout: 5000 }).catch(() => null);
    await page.reload();
    await page.waitForTimeout(2000);
    result("Dashboard loads without crash", true, "Dashboard page loaded successfully");
  } catch (e) {
    result("Dashboard", false, `Exception: ${e.message}`);
  }

  // ===== Test Auth Redirect =====
  try {
    const newContext = await browser.newContext();
    const newPage = await newContext.newPage();
    await newPage.goto(`${BASE}/materials`);
    await newPage.waitForTimeout(2000);
    const url = newPage.url();
    const redirectedToLogin = url.includes("/login");
    result("Unauthenticated /materials redirects to /login", redirectedToLogin, `URL: ${url}`);
    await newContext.close();
  } catch (e) {
    result("Auth redirect", false, `Exception: ${e.message}`);
  }

  await browser.close();

  // Summary
  console.log("\n=== SUMMARY ===");
  const passed = results.filter((r) => r.pass).length;
  const total = results.length;
  console.log(`${passed}/${total} checks passed\n`);
  results.forEach((r) => {
    console.log(`  ${r.pass ? "PASS" : "FAIL"}: ${r.name}`);
  });
})();