/**
 * Sprint 30 Evaluation v4 - Use existing library 247
 */

const BASE_URL = "http://localhost:5173";
const API_BASE = "http://localhost:8000/api/v1";

async function apiCall(path, method = "GET", body = null) {
  const headers = {
    "Content-Type": "application/json",
    "X-Username": "super_admin",
    "X-User-Role": "super_admin",
    "Authorization": "Bearer super_admin",
  };
  const opts = { method, headers };
  if (body) opts.body = JSON.stringify(body);
  const response = await fetch(`${API_BASE}${path}`, opts);
  const text = await response.text();
  let data = null;
  if (text) { try { data = JSON.parse(text); } catch { data = text; } }
  return { status: response.status, data };
}

async function main() {
  console.log("Sprint 30 Evaluation v4\n");

  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await context.newPage();

  const results = {};
  const testLibId = 247;

  try {
    const loginRes = await apiCall("/auth/login", "POST", { username: "super_admin" });
    console.log("Auth:", loginRes.status);
    if (loginRes.status !== 200) throw new Error("Login failed");

    // Inject auth
    await page.goto(BASE_URL);
    await page.evaluate((u) => {
      localStorage.setItem("ai-material-auth-session", JSON.stringify({ username: u.username, role: u.is_super_admin ? "super_admin" : "user" }));
    }, loginRes.data);

    // Navigate directly to library detail via URL
    await page.goto(`${BASE_URL}/material/library/${testLibId}`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(3000);
    console.log("Detail URL:", page.url());

    // Get page title/name
    const title = await page.locator("h1").first().textContent({ timeout: 3000 }).catch(() => null);
    console.log("Page title:", title);

    // Check tabs
    const tabs = await page.locator('[role="tab"]').allTextContents();
    console.log("Tabs:", tabs);

    // Check if we're on the right page
    if (title?.includes("Sprint30_Eval")) {
      console.log("SUCCESS: Found the library detail page");
    } else {
      // Try with query param
      await page.goto(`${BASE_URL}/material/library?detail=${testLibId}`);
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(3000);
      console.log("Query param URL:", page.url());
    }

    // Go to rule tab
    const ruleTab = page.locator('[role="tab"]:has-text("编码规则"), button:has-text("编码规则")').first();
    const ruleTabVisible = await ruleTab.isVisible({ timeout: 5000 }).catch(() => false);
    console.log("\nRule tab visible:", ruleTabVisible);

    if (ruleTabVisible) {
      await ruleTab.click();
      await page.waitForTimeout(2000);

      // Check current rule view
      const ruleVersionText = await page.locator("text=V1, text=V2, text=版本").first().textContent({ timeout: 2000 }).catch(() => null);
      console.log("Rule version text:", ruleVersionText);

      // Check for Edit Rule button
      const editBtn = page.locator('button:has-text("编辑规则")').first();
      const editBtnVisible = await editBtn.isVisible({ timeout: 3000 }).catch(() => false);
      console.log("Edit Rule button visible:", editBtnVisible);

      if (editBtnVisible) {
        await editBtn.click();
        await page.waitForTimeout(2000);
        console.log("After edit click, URL:", page.url());

        // Check modal opened
        const editModal = page.locator('[role="dialog"]').first();
        const modalVisible = await editModal.isVisible({ timeout: 3000 }).catch(() => false);
        console.log("Edit modal visible:", modalVisible);

        if (modalVisible) {
          // Get modal content
          const modalTitle = await editModal.locator("h2, [class*='title']").first().textContent({ timeout: 2000 }).catch(() => null);
          console.log("Modal title:", modalTitle);

          // Get all select elements in modal
          const selects = await page.locator('[role="dialog"] select').all();
          console.log("Number of selects in modal:", selects.length);
          for (let i = 0; i < selects.length; i++) {
            const opts = await selects[i].locator("option").allTextContents();
            console.log(`  Select ${i}:`, opts.join(" | "));
          }

          // Select all_recode
          const recodeSelect = page.locator('[role="dialog"] select').filter({ hasOption: /重编码|recode|all_recode/i }).first();
          const recodeSelectVisible = await recodeSelect.isVisible({ timeout: 2000 }).catch(() => false);
          console.log("Recode select visible:", recodeSelectVisible);

          if (recodeSelectVisible) {
            await recodeSelect.selectOption({ label: /全部物料重编码|all_recode/i });
            await page.waitForTimeout(500);
          }

          // Fill change reason
          const textarea = page.locator('[role="dialog"] textarea').first();
          if (await textarea.isVisible({ timeout: 2000 }).catch(() => false)) {
            await textarea.fill("Sprint 30 evaluation test");
            await page.waitForTimeout(300);
          }

          // Find and click save
          const saveBtn = page.locator('[role="dialog"] button:has-text("保存")').first();
          const saveBtnVisible = await saveBtn.isVisible({ timeout: 2000 }).catch(() => false);
          console.log("Save button visible:", saveBtnVisible);

          if (saveBtnVisible) {
            await saveBtn.click();
            await page.waitForTimeout(8000);
            console.log("After save URL:", page.url());

            // Check for preview modal
            const bodyText = await page.locator("body").textContent();
            console.log("重编码预览 in body:", bodyText.includes("重编码预览"));
            console.log("草稿已创建 in body:", bodyText.includes("草稿已创建") || bodyText.includes("draftCreated") || bodyText.includes("版本 V"));

            // Check for any dialogs
            const dialogs = await page.locator('[role="dialog"]').count();
            console.log("Dialog count after save:", dialogs);

            // Check for toast messages
            const toastEl = await page.locator('[data-sonner-toast], .sonner-toast').first().textContent({ timeout: 3000 }).catch(() => null);
            console.log("Toast text:", toastEl);

            // Take screenshot
            await page.screenshot({ path: "sprint30-v4-debug.png" });
            console.log("Screenshot saved");

            if (bodyText.includes("重编码预览")) {
              results.criterion1 = { pass: true, evidence: "重编码预览 visible after save" };
            } else {
              // Try to get more info about why it didn't open
              const alertEl = await page.locator('[role="alert"], [class*="error"], .text-red-600').first().textContent({ timeout: 2000 }).catch(() => null);
              console.log("Alert/error:", alertEl);
              results.criterion1 = { pass: false, reason: `重编码预览 not visible after save. Toast: ${toastEl}, Alert: ${alertEl}` };
            }
          }
        }
      }
    } else {
      results.criterion1 = { pass: false, reason: "编码规则 tab not visible" };
    }

  } catch (err) {
    console.error("Error:", err.message);
    results.error = err.message;
    await page.screenshot({ path: "sprint30-v4-error.png" }).catch(() => {});
  } finally {
    await browser.close();
  }

  console.log("\n=== RESULTS ===");
  console.log(JSON.stringify(results, null, 2));
}

main().catch(err => { console.error("Fatal:", err); process.exit(1); });