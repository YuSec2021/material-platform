/**
 * Sprint 30 Evaluation v2 - Deep inspection
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

async function setup() {
  const pn = await apiCall("/product-names");
  const cats = await apiCall("/categories");
  const productName = Array.isArray(pn.data) && pn.data.length > 0 ? pn.data[0] : null;
  const category = Array.isArray(cats.data) && cats.data.length > 0 ? cats.data[0] : null;

  const lib = await apiCall("/material-libraries", "POST", {
    name: `S30_Eval_${Date.now()}`,
    description: "eval",
    enabled: true,
    auto_code_enabled: true,
    recode_enabled: true,
    code_rule: {
      separator: "-",
      segments: [
        { type: "fixed_text", order: 0, value: "S30" },
        { type: "category_path", order: 1, level: 1, level_lengths: [2] },
        { type: "serial_number", order: 2, length: 4, start: 1, step: 1, scope: "global", padding: "left_zero" }
      ]
    }
  });

  const library = lib.status >= 200 && lib.status < 300 ? lib.data : null;
  if (!library) return { library: null, productName, category };

  let material = null;
  if (productName && category) {
    const m = await apiCall("/materials", "POST", {
      name: "Sprint 30 Material",
      product_name_id: productName.id,
      material_library_id: library.id,
      category_id: category.id,
      unit: "个",
      brand_id: null,
      status: "normal",
      description: "test",
      attributes: {}
    });
    if (m.status >= 200 && m.status < 300) material = m.data;
  }

  return { library, productName, category, material };
}

async function teardown(id) {
  if (id) await apiCall(`/material-libraries/${id}`, "DELETE");
}

async function main() {
  console.log("Sprint 30 Evaluation v2\n");

  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  const results = {};
  let testLibId = null;

  try {
    // Login
    const loginRes = await apiCall("/auth/login", "POST", { username: "super_admin" });
    console.log("Auth:", loginRes.status, loginRes.data?.username ?? "?");
    if (loginRes.status !== 200) throw new Error("Login failed");

    await page.goto(BASE_URL);
    await page.evaluate((u) => {
      localStorage.setItem("ai-material-auth-session", JSON.stringify({ username: u.username, role: u.is_super_admin ? "super_admin" : "user" }));
    }, loginRes.data);

    // Setup data
    const { library: lib } = await setup();
    testLibId = lib?.id;
    if (!lib) { console.log("FAIL: no library"); return; }
    console.log("Library ID:", testLibId);

    await page.goto(`${BASE_URL}/material/library`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    // Navigate to detail
    const link = page.locator(`a:has-text("${lib.name}"), td:has-text("${lib.name}"), button:has-text("${lib.name}")`).first();
    console.log("Library visible:", await link.isVisible({ timeout: 5000 }).catch(() => false));
    await link.click();
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);
    console.log("Detail URL:", page.url());

    // CRITERION 1: edit rule with all-material recode
    console.log("\n--- Criterion 1: All-material recode preview ---\n");

    // Go to rule tab
    const ruleTab = page.locator('button:has-text("编码规则")').first();
    console.log("Rule tab visible:", await ruleTab.isVisible({ timeout: 3000 }).catch(() => false));
    if (await ruleTab.isVisible({ timeout: 3000 }).catch(() => false)) {
      await ruleTab.click();
      await page.waitForTimeout(1500);
    }

    // Open edit rule
    const editBtn = page.locator('button:has-text("编辑规则")').first();
    console.log("Edit button visible:", await editBtn.isVisible({ timeout: 3000 }).catch(() => false));
    if (await editBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await editBtn.click();
      await page.waitForTimeout(1500);
    }

    // Check edit form is open
    const ruleNameInput = page.locator('input[placeholder*="规则名称"], input[type="text"]').first();
    console.log("Rule name input visible:", await ruleNameInput.isVisible({ timeout: 3000 }).catch(() => false));

    // Change separator
    const sepInput = page.locator('input[maxlength="1"]').first();
    if (await sepInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      await sepInput.fill("_");
      await page.waitForTimeout(300);
    }

    // Fill change reason
    const reasonTextarea = page.locator('textarea').first();
    console.log("Textarea visible:", await reasonTextarea.isVisible({ timeout: 2000 }).catch(() => false));
    if (await reasonTextarea.isVisible({ timeout: 2000 }).catch(() => false)) {
      await reasonTextarea.fill("Sprint 30 eval test");
      await page.waitForTimeout(300);
    }

    // Select all-material recode
    const allRecodeOption = page.locator('option[value="all_recode"]').first();
    console.log("All recode option visible:", await allRecodeOption.isVisible({ timeout: 2000 }).catch(() => false));
    if (await allRecodeOption.isVisible({ timeout: 2000 }).catch(() => false)) {
      await allRecodeOption.selectOption("all_recode");
      await page.waitForTimeout(300);
    }

    // Click save
    const saveBtn = page.locator('button:has-text("保存")').first();
    console.log("Save button visible:", await saveBtn.isVisible({ timeout: 2000 }).catch(() => false));
    if (await saveBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await saveBtn.click();
      // Wait for API response and modal
      await page.waitForTimeout(5000);
    }

    console.log("After save URL:", page.url());

    // Check what's on screen now
    const bodyText = await page.locator("body").textContent();
    const hasPreviewTitle = bodyText.includes("重编码预览");
    const hasDraftCreated = bodyText.includes("草稿已创建") || bodyText.includes("draftCreated") || bodyText.includes("版本");
    const hasError = bodyText.includes("error") || bodyText.includes("Error") || bodyText.includes("失败");

    console.log("Screen contains 重编码预览:", hasPreviewTitle);
    console.log("Screen contains draft/版本:", hasDraftCreated);
    console.log("Screen contains error:", hasError);

    // Check for modals
    const modalCount = await page.locator('[role="dialog"]').count();
    const drawerCount = await page.locator('.ant-drawer').count();
    console.log("Dialog count:", modalCount, "Drawer count:", drawerCount);

    // Get all visible modal titles
    const modalTitles = await page.locator('[role="dialog"] h2, [role="dialog"] [class*="title"], .ant-modal-title').allTextContents();
    console.log("Modal titles:", modalTitles);

    // Check for the preview modal specifically - look for specific elements
    const summaryCards = await page.locator('text=总物料数, text=成功数, text=失败数').count();
    const tableElement = await page.locator('table').count();
    console.log("Summary label count:", summaryCards);
    console.log("Table count:", tableElement);

    // Look for the specific preview content
    const hasMaterialName = await page.locator('text=物料名称, th:has-text("物料")').first().isVisible({ timeout: 2000 }).catch(() => false);
    const hasOldCode = await page.locator('text=旧编码, th:has-text("旧编码")').first().isVisible({ timeout: 2000 }).catch(() => false);
    const hasNewCode = await page.locator('text=新编码, th:has-text("新编码")').first().isVisible({ timeout: 2000 }).catch(() => false);
    const hasStatus = await page.locator('th:has-text("状态")').first().isVisible({ timeout: 2000 }).catch(() => false);
    const hasDownloadBtn = await page.locator('button:has-text("下载")').first().isVisible({ timeout: 2000 }).catch(() => false);

    console.log("Preview headers - 物料名称:", hasMaterialName, "旧编码:", hasOldCode, "新编码:", hasNewCode, "状态:", hasStatus, "下载按钮:", hasDownloadBtn);

    if (hasPreviewTitle) {
      results.criterion1 = {
        pass: true,
        note: `重编码预览 modal visible, summary labels: ${summaryCards}, table: ${tableElement}, cols: mat=${hasMaterialName} old=${hasOldCode} new=${hasNewCode} status=${hasStatus}`
      };
    } else {
      // Try to get more diagnostic info
      const alertText = await page.locator('[role="alert"], .text-red-600, .text-red-800').first().textContent({ timeout: 2000 }).catch(() => null);
      console.log("Alert/error text:", alertText);

      // Check if the edit modal is still open
      const editModalStillOpen = await ruleNameInput.isVisible({ timeout: 1000 }).catch(() => false);
      console.log("Edit modal still open:", editModalStillOpen);

      results.criterion1 = {
        pass: false,
        reason: "重编码预览 modal did not open after save. The preview batch mutation may have failed silently or the modal state is not being set correctly."
      };

      // Screenshot
      await page.screenshot({ path: "sprint30-c1-debug.png" });
      console.log("Screenshot saved to sprint30-c1-debug.png");
    }

    // Get page source for debugging
    const html = await page.content();
    const match = html.match(/重编码预览|recode.*preview|preview.*recode/i);
    console.log("HTML contains preview:", match ? "YES - " + match[0] : "NO");

  } catch (err) {
    console.error("Error:", err.message);
    results.error = err.message;
    await page.screenshot({ path: "sprint30-error.png" }).catch(() => {});
  } finally {
    await browser.close();
    if (testLibId) await teardown(testLibId);
  }

  console.log("\n=== RESULTS ===");
  console.log(JSON.stringify(results, null, 2));
}

main().catch(err => { console.error("Fatal:", err); process.exit(1); });