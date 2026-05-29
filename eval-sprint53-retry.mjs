import { chromium } from "playwright";

const BASE = "http://localhost:5173";

async function run() {
  const browser = await chromium.launch({ headless: true });

  const consoleErrors = [];
  let allPass = false;

  try {
    // =========================================================
    // Criterion 1: Page render
    // =========================================================
    console.log("=== Criterion 1: Page Render (spot check) ===");

    let context = await browser.newContext();
    let page = await context.newPage();
    page.on("console", (msg) => { if (msg.type() === "error") consoleErrors.push(msg.text()); });

    // Login as super_admin
    await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 15000 });
    await page.waitForTimeout(500);
    await page.click('button[type="submit"]');
    await page.waitForURL(`${BASE}/`, { timeout: 10000 }).catch(() => {});
    console.log(`  Logged in as super_admin, URL: ${page.url()}`);

    // Navigate to /ai/models
    await page.goto(`${BASE}/ai/models`, { waitUntil: "networkidle", timeout: 15000 });
    await page.waitForTimeout(1000);

    const bodyText = await page.textContent("body");
    const pageHasContent = bodyText.length > 100;
    const pageTitle = bodyText.includes("模型网关") || bodyText.includes("Model Gateway");
    console.log(`  Page has content: ${pageHasContent ? "PASS" : "FAIL"}`);
    console.log(`  Page title present: ${pageTitle ? "PASS" : "FAIL"}`);
    const criterion1Pass = pageHasContent && pageTitle;

    // =========================================================
    // Criterion 6: zh-CN and en-US i18n
    // =========================================================
    console.log("\n=== Criterion 6: zh-CN / en-US i18n ===");

    // --- zh-CN check ---
    await page.evaluate(() => localStorage.setItem("language", "zh-CN"));
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForTimeout(1000);

    const zhBody = await page.textContent("body");
    const zhBrokenMock = zhBody.includes("modelGateway.provider.mock");
    const zhHasModelGateway = zhBody.includes("模型网关");
    console.log(`  zh-CN page title: ${zhHasModelGateway ? "PASS" : "FAIL"}`);
    console.log(`  zh-CN modelGateway.provider.mock rendered as text: ${zhBrokenMock ? "FAIL (broken)" : "PASS"}`);

    // --- en-US check ---
    await page.evaluate(() => localStorage.setItem("language", "en-US"));
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForTimeout(1000);

    const enBody = await page.textContent("body");
    const enBrokenMock = enBody.includes("modelGateway.provider.mock");
    const enHasModelGateway = enBody.includes("Model Gateway");
    console.log(`  en-US page title: ${enHasModelGateway ? "PASS" : "FAIL"}`);
    console.log(`  en-US modelGateway.provider.mock rendered as text: ${enBrokenMock ? "FAIL (broken)" : "PASS"}`);

    const criterion6Pass = !zhBrokenMock && !enBrokenMock && zhHasModelGateway && enHasModelGateway;
    console.log(`  i18n OVERALL: ${criterion6Pass ? "PASS" : "FAIL"}`);

    // =========================================================
    // Criterion 7: Role restriction
    // =========================================================
    console.log("\n=== Criterion 7: Role Restriction ===");

    // Clear localStorage and login fresh as regular user
    await context.close();
    context = await browser.newContext();
    page = await context.newPage();
    page.on("console", (msg) => { if (msg.type() === "error") consoleErrors.push(msg.text()); });

    await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 15000 });
    await page.waitForTimeout(500);

    // Fill username and submit
    const usernameInput = page.locator("#username");
    const inputVisible = await usernameInput.isVisible().catch(() => false);
    console.log(`  Login page input visible: ${inputVisible ? "YES" : "NO"}`);

    if (inputVisible) {
      await usernameInput.fill("regular_user");
      await page.click('button[type="submit"]');
      await page.waitForTimeout(3000);
      console.log(`  Regular user login URL: ${page.url()}`);

      // Try to navigate to /ai/models
      await page.goto(`${BASE}/ai/models`, { waitUntil: "networkidle", timeout: 15000 });
      await page.waitForTimeout(1000);

      const regularUrl = page.url();
      const redirectedAway = !regularUrl.includes("/ai/models");
      const regularBody = await page.textContent("body");
      const showsModelGateway = regularBody.includes("模型网关") || regularBody.includes("Model Gateway");

      console.log(`  Non-super-admin redirected from /ai/models: ${redirectedAway ? "PASS" : "FAIL"}`);
      console.log(`  Final URL: ${regularUrl}`);
      console.log(`  Shows Model Gateway content: ${showsModelGateway ? "FAIL" : "PASS (correctly blocked)"}`);

      // Verify super admin access (fresh context)
      const context2 = await browser.newContext();
      const page2 = await context2.newPage();
      page2.on("console", (msg) => { if (msg.type() === "error") consoleErrors.push(msg.text()); });

      await page2.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 15000 });
      await page2.waitForTimeout(500);
      await page2.click('button[type="submit"]');
      await page2.waitForTimeout(3000);

      await page2.goto(`${BASE}/ai/models`, { waitUntil: "networkidle", timeout: 15000 });
      await page2.waitForTimeout(1000);

      const superAdminUrl = page2.url();
      const superAdminBody = await page2.textContent("body");
      const superAdminAccess = superAdminUrl.includes("/ai/models") && (superAdminBody.includes("模型网关") || superAdminBody.includes("Model Gateway"));
      console.log(`  Super admin can access /ai/models: ${superAdminAccess ? "PASS" : "FAIL"}`);
      console.log(`  Super admin sees Model Gateway: ${superAdminBody.includes("模型网关") || superAdminBody.includes("Model Gateway") ? "PASS" : "FAIL"}`);

      await context2.close();

      const criterion7Pass = redirectedAway && !showsModelGateway && superAdminAccess;
      console.log(`  Role restriction OVERALL: ${criterion7Pass ? "PASS" : "FAIL"}`);

      // =========================================================
      // Console errors
      // =========================================================
      console.log("\n=== Console Errors ===");
      if (consoleErrors.length > 0) {
        console.log(`  ERRORS (${consoleErrors.length}):`);
        consoleErrors.slice(0, 5).forEach((e) => console.log(`    - ${e}`));
      } else {
        console.log("  None: PASS");
      }

      // =========================================================
      // Final verdict
      // =========================================================
      console.log("\n=== FINAL VERDICT ===");
      allPass = criterion1Pass && criterion6Pass && criterion7Pass;
      console.log(`  Criterion 1 (Page Render): ${criterion1Pass ? "PASS" : "FAIL"}`);
      console.log(`  Criterion 6 (i18n): ${criterion6Pass ? "PASS" : "FAIL"}`);
      console.log(`  Criterion 7 (Role restriction): ${criterion7Pass ? "PASS" : "FAIL"}`);
      console.log(`\n  SPRINT ${allPass ? "PASS" : "FAIL"}`);
    } else {
      console.log("  ERROR: Could not find username input on login page");
      console.log("  SPRINT FAIL (test script error)");
    }

    await context.close();

  } catch (err) {
    console.error("\nERROR during evaluation:", err.message);
    console.log("\nSPRINT FAIL (exception)");
    allPass = false;
  } finally {
    await browser.close();
  }

  process.exit(allPass ? 0 : 1);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
