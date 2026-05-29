import { chromium } from "playwright";

const BASE = "http://localhost:5173";

async function run() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  const consoleErrors = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      consoleErrors.push(msg.text());
    }
  });

  try {
    // Login as super_admin (input pre-filled with "super_admin")
    await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(500);

    // The username input is pre-filled with "super_admin", just click submit
    await page.click('button[type="submit"]');
    await page.waitForURL(`${BASE}/`, { timeout: 10000 }).catch(() => {});
    console.log("Logged in, current URL:", page.url());

    // Navigate to /ai/models
    await page.goto(`${BASE}/ai/models`, { waitUntil: "networkidle", timeout: 15000 });
    await page.waitForTimeout(1000);

    // =========================================================
    // Debug: Find exact broken keys
    // =========================================================
    console.log("\n=== Debug: Checking for broken keys ===");

    const bodyText = await page.textContent("body");

    // Find all occurrences of {{ pattern
    const doubleBraceMatches = [];
    const regex1 = /\{\{[^}]+\}\}/g;
    let match;
    while ((match = regex1.exec(bodyText)) !== null) {
      doubleBraceMatches.push(match[0]);
    }
    console.log(`  Double-brace patterns found: ${doubleBraceMatches.length}`);
    if (doubleBraceMatches.length > 0) {
      doubleBraceMatches.slice(0, 10).forEach((m) => console.log(`    "${m}"`));
      if (doubleBraceMatches.length > 10) console.log(`    ... and ${doubleBraceMatches.length - 10} more`);
    }

    // Find modelGateway. pattern
    const modelGatewayMatches = [];
    const regex2 = /modelGateway\.[a-zA-Z._]+/g;
    while ((match = regex2.exec(bodyText)) !== null) {
      modelGatewayMatches.push(match[0]);
    }
    console.log(`  modelGateway.* patterns found: ${modelGatewayMatches.length}`);
    if (modelGatewayMatches.length > 0) {
      modelGatewayMatches.slice(0, 10).forEach((m) => console.log(`    "${m}"`));
    }

    // Check if these are actual broken keys or legitimate text
    // Check what i18n namespace the page is actually using
    console.log("\n  Checking React/i18n state...");
    const i18nInfo = await page.evaluate(() => {
      // Try to find i18n instance in the page
      const html = document.body.innerHTML;
      // Look for specific broken patterns near visible text
      const brokenPatternRegex = /\{\{[^}]{1,50}\}\}/g;
      const results = [];
      let m;
      while ((m = brokenPatternRegex.exec(html)) !== null) {
        // Get surrounding context
        const start = Math.max(0, m.index - 50);
        const end = Math.min(html.length, m.index + m[0].length + 50);
        const context = html.substring(start, end);
        results.push({ key: m[0], context: context.replace(/<[^>]+>/g, " ").substring(0, 100) });
      }
      return results.slice(0, 10);
    });
    console.log(`  Broken key contexts: ${JSON.stringify(i18nInfo, null, 2)}`);

    // =========================================================
    // zh-CN check
    // =========================================================
    console.log("\n=== zh-CN i18n check ===");
    await page.evaluate(() => localStorage.setItem("language", "zh-CN"));
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForTimeout(1000);

    const zhBody = await page.textContent("body");
    const zhDoubleBraces = (zhBody.match(/\{\{[^}]+\}\}/g) || []).length;
    const zhMGKeys = (zhBody.match(/modelGateway\.[a-zA-Z._]+/g) || []).length;
    console.log(`  zh-CN double-brace patterns: ${zhDoubleBraces}`);
    console.log(`  zh-CN modelGateway.* patterns: ${zhMGKeys}`);

    // =========================================================
    // en-US check
    // =========================================================
    console.log("\n=== en-US i18n check ===");
    await page.evaluate(() => localStorage.setItem("language", "en-US"));
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForTimeout(1000);

    const enBody = await page.textContent("body");
    const enDoubleBraces = (enBody.match(/\{\{[^}]+\}\}/g) || []).length;
    const enMGKeys = (enBody.match(/modelGateway\.[a-zA-Z._]+/g) || []).length;
    console.log(`  en-US double-brace patterns: ${enDoubleBraces}`);
    console.log(`  en-US modelGateway.* patterns: ${enMGKeys}`);

    // =========================================================
    // Role restriction
    // =========================================================
    console.log("\n=== Role restriction check ===");

    // Login as regular user
    await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(500);

    // Clear and set regular username
    await page.locator("#username").fill("regular_user");
    await page.click('button[type="submit"]');
    await page.waitForTimeout(3000);
    await page.waitForURL(`${BASE}/**`, { timeout: 10000 }).catch(() => {});

    const regularUrl = page.url();
    console.log(`  Regular user URL after login: ${regularUrl}`);

    // Try to navigate to /ai/models directly
    await page.goto(`${BASE}/ai/models`, { waitUntil: "networkidle", timeout: 15000 });
    await page.waitForTimeout(1000);

    const afterNavUrl = page.url();
    const redirectedFromModels = !afterNavUrl.includes("/ai/models");
    const redirectedBody = await page.textContent("body");
    console.log(`  Regular user URL after /ai/models nav: ${afterNavUrl}`);
    console.log(`  Redirected away from /ai/models: ${redirectedFromModels ? "YES" : "NO"}`);
    console.log(`  Page has Model Gateway: ${redirectedBody.includes("模型网关") || redirectedBody.includes("Model Gateway") ? "YES (FAIL)" : "NO"}`);

    // Login as super_admin again
    await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(500);
    await page.locator("#username").fill("super_admin");
    await page.click('button[type="submit"]');
    await page.waitForTimeout(3000);

    await page.goto(`${BASE}/ai/models`, { waitUntil: "networkidle", timeout: 15000 });
    await page.waitForTimeout(1000);

    const superAdminUrl = page.url();
    const superAdminBody = await page.textContent("body");
    const superAdminAccess = superAdminUrl.includes("/ai/models") &&
                             (superAdminBody.includes("模型网关") || superAdminBody.includes("Model Gateway"));
    console.log(`  Super admin URL: ${superAdminUrl}`);
    console.log(`  Super admin can access: ${superAdminAccess ? "YES" : "NO"}`);

    console.log("\n=== Console errors ===");
    consoleErrors.forEach((e) => console.log(`  ERROR: ${e}`));
    if (consoleErrors.length === 0) console.log("  None");

  } catch (err) {
    console.error("\nERROR:", err.message);
  } finally {
    await browser.close();
  }
}

run().catch(console.error);
