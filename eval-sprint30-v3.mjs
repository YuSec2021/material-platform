/**
 * Sprint 30 Evaluation v3 - Focused on select element interaction
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
  if (!library) return { library: null, material: null };

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

  return { library, material };
}

async function teardown(id) {
  if (id) await apiCall(`/material-libraries/${id}`, "DELETE");
}

async function main() {
  console.log("Sprint 30 Evaluation v3\n");

  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await context.newPage();

  const results = {};
  let testLibId = null;

  try {
    const loginRes = await apiCall("/auth/login", "POST", { username: "super_admin" });
    console.log("Auth:", loginRes.status, loginRes.data?.username ?? "?");
    if (loginRes.status !== 200) throw new Error("Login failed");

    await page.goto(BASE_URL);
    await page.evaluate((u) => {
      localStorage.setItem("ai-material-auth-session", JSON.stringify({ username: u.username, role: u.is_super_admin ? "super_admin" : "user" }));
    }, loginRes.data);

    const { library: lib } = await setup();
    testLibId = lib?.id;
    if (!lib) { console.log("FAIL: no library"); return; }
    console.log("Library ID:", testLibId);

    await page.goto(`${BASE_URL}/material/library`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    // Navigate to detail
    const link = page.locator(`td:has-text("${lib.name}"), a:has-text("${lib.name}")`).first();
    await link.click();
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);
    console.log("Detail URL:", page.url());

    // Go to rule tab
    const ruleTab = page.locator('button:has-text("编码规则")').first();
    await ruleTab.click();
    await page.waitForTimeout(1500);

    // Check current effective mode
    const selectEl = page.locator('select[aria-label], select').filter({ hasText: /新增|重编码|生效/ }).first();
    console.log("Effective mode select visible:", await selectEl.isVisible({ timeout: 3000 }).catch(() => false));

    // Get all select elements
    const selectCount = await page.locator("select").count();
    console.log("Number of select elements:", selectCount);

    // Try all selects
    for (let i = 0; i < selectCount; i++) {
      const sel = page.locator("select").nth(i);
      const options = await sel.locator("option").allTextContents();
      console.log(`  Select ${i}:`, options.join(" | "));
    }

    // Open edit rule
    const editBtn = page.locator('button:has-text("编辑规则")').first();
    await editBtn.click();
    await page.waitForTimeout(1500);

    // Get select elements in the modal
    const modalSelectCount = await page.locator('[role="dialog"] select, .ant-modal select').count();
    console.log("Modal select count:", modalSelectCount);

    for (let i = 0; i < modalSelectCount; i++) {
      const sel = page.locator('[role="dialog"] select, .ant-modal select').nth(i);
      const visible = await sel.isVisible({ timeout: 2000 }).catch(() => false);
      if (visible) {
        const options = await sel.locator("option").allTextContents();
        console.log(`  Modal select ${i}:`, options.join(" | "));
      }
    }

    // Find the effective mode select by looking for "全部物料重编码" text
    // First, let's look at all text content in the modal
    const modalText = await page.locator('[role="dialog"]').first().textContent().catch(() => "");
    console.log("\nModal text (first 500 chars):", modalText.slice(0, 500));

    // Now try to select all_recode using selectOption
    const allRecodeSelect = page.locator('select').filter({ hasOption: /全部物料重编码|all_recode/ }).first();
    console.log("\nAll recode select visible:", await allRecodeSelect.isVisible({ timeout: 2000 }).catch(() => false));

    if (await allRecodeSelect.isVisible({ timeout: 2000 }).catch(() => false)) {
      await allRecodeSelect.selectOption("all_recode");
      console.log("Selected all_recode");
      await page.waitForTimeout(500);
    } else {
      // Try getting the visible selects and selecting by visible text
      const allSelects = await page.locator("select").all();
      for (const sel of allSelects) {
        const visible = await sel.isVisible({ timeout: 1000 }).catch(() => false);
        if (visible) {
          const opts = await sel.locator("option").allTextContents();
          if (opts.some(o => o.includes("重编码"))) {
            console.log("Found select with recode option:", opts.join(" | "));
            await sel.selectOption({ label: /全部物料重编码/ });
            await page.waitForTimeout(500);
            break;
          }
        }
      }
    }

    // Fill change reason
    const reasonTextarea = page.locator('[role="dialog"] textarea').first();
    if (await reasonTextarea.isVisible({ timeout: 2000 }).catch(() => false)) {
      await reasonTextarea.fill("Sprint 30 eval test");
      await page.waitForTimeout(300);
    }

    // Click save
    const saveBtn = page.locator('[role="dialog"] button:has-text("保存"), [role="dialog"] button[type="submit"]').first();
    console.log("Save button visible:", await saveBtn.isVisible({ timeout: 2000 }).catch(() => false));
    await saveBtn.click();
    await page.waitForTimeout(6000);

    console.log("After save, URL:", page.url());

    // Check if preview modal opened
    const previewModal = page.locator('[role="dialog"]:has-text("重编码预览"), .ant-modal:has-text("重编码预览")').first();
    const previewVisible = await previewModal.isVisible({ timeout: 3000 }).catch(() => false);
    console.log("重编码预览 modal visible:", previewVisible);

    if (previewVisible) {
      // Criterion 1: PASS
      results.criterion1 = { pass: true, evidence: "重编码预览 modal opened" };

      // Check summary
      const tableHeaders = await page.locator("table thead th").allTextContents();
      console.log("Table headers:", tableHeaders);

      const passStatus = await page.locator('text=通过').first().isVisible({ timeout: 2000 }).catch(() => false);
      const failStatus = await page.locator('text=失败').first().isVisible({ timeout: 2000 }).catch(() => false);
      console.log("Status - 通过:", passStatus, ", 失败:", failStatus);

      // Criterion 2
      if (tableHeaders.length > 0) {
        results.criterion2 = { pass: true, note: `Headers: ${tableHeaders.join(", ")}` };
      }

      // Criterion 3: Execute button and confirmation
      const executeBtn = page.locator('button:has-text("执行"), button:has-text("执行重编码")').first();
      const execVisible = await executeBtn.isVisible({ timeout: 3000 }).catch(() => false);
      console.log("Execute button visible:", execVisible);

      if (execVisible) {
        await executeBtn.click();
        await page.waitForTimeout(2000);

        const dialog = page.locator('[role="dialog"]').filter({ hasText: /确认|执行|警告|重编码/ }).first();
        const dialogVisible = await dialog.isVisible({ timeout: 3000 }).catch(() => false);
        const libInDialog = await dialog.locator(`text=${lib.name}`).isVisible({ timeout: 1000 }).catch(() => false);

        results.criterion3 = { pass: dialogVisible && libInDialog, note: `Dialog: ${dialogVisible}, lib name: ${libInDialog}` };

        const cancelBtn = page.locator('button:has-text("取消")').first();
        await cancelBtn.click();
        await page.waitForTimeout(1000);
      }
    } else {
      results.criterion1 = { pass: false, reason: "重编码预览 modal did not open after saving edit rule with all-material recode" };

      // Check if there's a toast or error
      const toastText = await page.locator('[data-sonner-toast], .toast, [class*="toast"]').first().textContent({ timeout: 2000 }).catch(() => null);
      console.log("Toast:", toastText);

      await page.screenshot({ path: "sprint30-v3-c1.png" });
      console.log("Screenshot saved");
    }

  } catch (err) {
    console.error("Error:", err.message);
    results.error = err.message;
    await page.screenshot({ path: "sprint30-v3-error.png" }).catch(() => {});
  } finally {
    await browser.close();
    if (testLibId) await teardown(testLibId);
  }

  console.log("\n=== RESULTS ===");
  console.log(JSON.stringify(results, null, 2));
}

main().catch(err => { console.error("Fatal:", err); process.exit(1); });