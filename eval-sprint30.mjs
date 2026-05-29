/**
 * Sprint 30 Evaluation - Browser E2E via Playwright
 * Evaluates: Batch Recoding Preview, Execution, and Code Mapping
 */

const BASE_URL = "http://localhost:5173";
const API_BASE = "http://localhost:8000/api/v1";

// Helper to make authenticated API calls
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
  if (text) {
    try { data = JSON.parse(text); } catch { data = text; }
  }
  return { status: response.status, data };
}

// Setup: create test data
async function setup() {
  const pnRes = await apiCall("/product-names");
  const productNames = pnRes.status === 200 && Array.isArray(pnRes.data) ? pnRes.data : [];
  const productName = productNames.length > 0 ? productNames[0] : null;

  const catRes = await apiCall("/categories");
  const categories = catRes.status === 200 && Array.isArray(catRes.data) ? catRes.data : [];
  const category = categories.length > 0 ? categories[0] : null;

  const libRes = await apiCall("/material-libraries", "POST", {
    name: `Sprint30_Eval_${Date.now()}`,
    description: "Sprint 30 evaluation library",
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

  const library = libRes.status >= 200 && libRes.status < 300 ? libRes.data : null;
  if (!library) {
    return { library: null, productName, category, material: null };
  }

  let material = null;
  if (productName && category) {
    const matRes = await apiCall("/materials", "POST", {
      name: "Sprint 30 Preview Material",
      product_name_id: productName.id,
      material_library_id: library.id,
      category_id: category.id,
      unit: "个",
      brand_id: null,
      status: "normal",
      description: "Sprint 30 test material",
      attributes: {}
    });
    if (matRes.status >= 200 && matRes.status < 300) {
      material = matRes.data;
    }
  }

  return { library, productName, category, material };
}

async function teardown(libraryId) {
  if (libraryId) {
    await apiCall(`/material-libraries/${libraryId}`, "DELETE");
  }
}

async function main() {
  console.log("Starting Sprint 30 Browser Evaluation...\n");

  const results = {};
  let testLibraryId = null;
  let testMaterial = null;
  let testLibrary = null;

  const { chromium } = await import("playwright");

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  // Capture console messages
  page.on("console", msg => {
    if (msg.type() === "error") console.log("  [browser-error]", msg.text());
  });

  try {
    // Login via API and inject session
    const loginRes = await apiCall("/auth/login", "POST", { username: "super_admin" });
    console.log("Auth login:", loginRes.status, loginRes.data?.username ?? "?");
    if (loginRes.status !== 200) throw new Error("Login failed: " + loginRes.status);

    await page.goto(BASE_URL);
    await page.evaluate((authData) => {
      localStorage.setItem("ai-material-auth-session", JSON.stringify({
        username: authData.username,
        role: authData.is_super_admin ? "super_admin" : "user"
      }));
    }, loginRes.data);

    // Navigate to material library page
    await page.goto(`${BASE_URL}/material/library`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(3000);
    console.log("Navigated to material library page");

    // Setup test data
    const setupData = await setup();
    testLibrary = setupData.library;
    testMaterial = setupData.material;
    testLibraryId = setupData.library?.id;
    console.log("Setup:", JSON.stringify({ libId: testLibraryId, matId: testMaterial?.id }));

    if (!testLibrary) {
      results.setup = { pass: false, reason: "Could not create test library via API" };
      console.log("FAIL:", results.setup.reason);
      return results;
    }
    results.setup = { pass: true, libraryId: testLibraryId };

    // Reload to see new library
    await page.reload();
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(3000);

    // Navigate to library detail
    console.log("\n--- Navigating to library detail ---");
    const libLink = page.locator(`a:has-text("${testLibrary.name}"), td:has-text("${testLibrary.name}"), button:has-text("${testLibrary.name}")`).first();
    console.log("Library link visible:", await libLink.isVisible({ timeout: 5000 }).catch(() => false));
    await libLink.click();
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(3000);
    console.log("Current URL:", page.url());

    // Get page content for debugging
    const pageTitle = await page.locator("h1, h2").first().textContent({ timeout: 3000 }).catch(() => "no title");
    console.log("Page title:", pageTitle);

    // Navigate to code rule tab
    const ruleTab = page.locator('button:has-text("编码规则"), a:has-text("编码规则")').first();
    console.log("编码规则 tab visible:", await ruleTab.isVisible({ timeout: 3000 }).catch(() => false));
    if (await ruleTab.isVisible({ timeout: 3000 }).catch(() => false)) {
      await ruleTab.click();
      await page.waitForTimeout(2000);
    }

    // Look for edit button
    const editBtn = page.locator('button:has-text("编辑规则"), button:has-text("编辑"), button:has-text("编辑编码规则")').first();
    console.log("Edit rule button visible:", await editBtn.isVisible({ timeout: 5000 }).catch(() => false));

    // Try to click edit rule
    if (await editBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await editBtn.click();
      await page.waitForTimeout(2000);
      console.log("After edit click, URL:", page.url());
    }

    // Look for separator input
    const sepInput = page.locator('input[name="separator"], input[placeholder*="分隔符"]').first();
    if (await sepInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      const currentVal = await sepInput.inputValue();
      console.log("Current separator:", currentVal);
      await sepInput.fill("_");
      await page.waitForTimeout(500);
    }

    // Enter change reason
    const reasonInput = page.locator('textarea[name="changeReason"], textarea[placeholder*="原因"], textarea[placeholder*="变更"]').first();
    if (await reasonInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      await reasonInput.fill("Sprint 30 all recode preview");
      await page.waitForTimeout(500);
    }

    // Look for effective mode selector
    const allRecodeRadio = page.locator('input[value="all_recode"], input[value="all"], label:has-text("全部物料重编码"), button:has-text("全部物料重编码")').first();
    console.log("All recode option visible:", await allRecodeRadio.isVisible({ timeout: 3000 }).catch(() => false));
    if (await allRecodeRadio.isVisible({ timeout: 3000 }).catch(() => false)) {
      await allRecodeRadio.click();
      await page.waitForTimeout(500);
    }

    // Find and click save button
    const saveBtn = page.locator('button:has-text("保存"), button:has-text("确认"), button[type="submit"]').first();
    console.log("Save button visible:", await saveBtn.isVisible({ timeout: 3000 }).catch(() => false));
    if (await saveBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await saveBtn.click();
      await page.waitForTimeout(5000);
      console.log("After save, URL:", page.url());
    }

    // Check if preview modal opened
    console.log("\n--- Checking for preview modal ---");
    const previewModal = page.locator('text=重编码预览').first();
    const previewVisible = await previewModal.isVisible({ timeout: 5000 }).catch(() => false);
    console.log("重编码预览 visible:", previewVisible);

    if (previewVisible) {
      // Criterion 1 PASS
      results.criterion1 = { pass: true, evidence: "重编码预览 modal opened" };

      // Check summary header
      const summaryCards = await page.locator('.rounded-md.border, [class*="SummaryCard"]').count();
      console.log("Summary cards count:", summaryCards);

      // Check loading feedback
      const loadingEl = page.locator('[role="status"], text=生成中, text=执行中, .animate-spin').first();
      const hasLoading = await loadingEl.isVisible({ timeout: 3000 }).catch(() => false);
      console.log("Loading feedback:", hasLoading);

      // Check table columns
      const tableHeaders = await page.locator("table thead th").allTextContents();
      console.log("Table headers:", tableHeaders);

      // Check for pass/fail status in table
      const passCell = page.locator('text=通过').first();
      const failCell = page.locator('text=失败').first();
      const passVisible = await passCell.isVisible({ timeout: 3000 }).catch(() => false);
      const failVisible = await failCell.isVisible({ timeout: 3000 }).catch(() => false);
      console.log("Status cells - 通过:", passVisible, ", 失败:", failVisible);

      // Criterion 2: Check table columns and status styling
      if (tableHeaders.length > 0 && passVisible) {
        results.criterion2 = { pass: true, note: `Headers: ${tableHeaders.join(", ")}, 通过 visible: ${passVisible}, 失败 visible: ${failVisible}` };
      } else {
        results.criterion2 = { pass: false, reason: `Table headers missing or pass status not visible: headers=${tableHeaders.length}, pass=${passVisible}` };
      }

      // Check CSV download button
      const csvBtn = page.locator('button:has-text("下载CSV"), button:has-text("导出CSV"), button:has-text("下载")').first();
      const csvVisible = await csvBtn.isVisible({ timeout: 3000 }).catch(() => false);
      console.log("CSV download button:", csvVisible);

      // Check pagination
      const paginationEl = page.locator('.pagination, [class*="pagination"], button:has-text("下一页"), .ant-pagination').first();
      const paginationVisible = await paginationEl.isVisible({ timeout: 2000 }).catch(() => false);
      console.log("Pagination:", paginationVisible);

      // Criterion 3: Execute button and confirmation dialog
      console.log("\n--- Checking execute/confirmation ---");
      const executeBtn = page.locator('button:has-text("执行重编码"), button:has-text("执行"), button:has-text("执行编码"), button:has-text("执行重编码")').first();
      const execVisible = await executeBtn.isVisible({ timeout: 3000 }).catch(() => false);
      console.log("Execute button visible:", execVisible);

      if (execVisible) {
        await executeBtn.click();
        await page.waitForTimeout(2000);

        // Check for confirmation dialog
        const dialog = page.locator('[role="dialog"], .ant-modal, .dialog, [class*="Modal"]').filter({ hasText: /重编码|确认|执行|警告|影响/ }).first();
        const dialogVisible = await dialog.isVisible({ timeout: 3000 }).catch(() => false);
        console.log("Confirmation dialog visible:", dialogVisible);

        // Check for library name in dialog
        const libNameInDialog = await dialog.locator(`text=${testLibrary.name}`).isVisible({ timeout: 1000 }).catch(() => false);
        console.log("Library name in dialog:", libNameInDialog);

        // Check for external system warning
        const warningEl = page.locator('text=外部, text=系统, text=影响, text=warning, text=WARNING').first();
        const hasWarning = await warningEl.isVisible({ timeout: 2000 }).catch(() => false);
        console.log("External system warning:", hasWarning);

        results.criterion3 = {
          pass: dialogVisible && libNameInDialog,
          note: `Dialog: ${dialogVisible}, library name: ${libNameInDialog}, warning: ${hasWarning}`
        };

        // Cancel the dialog
        const cancelBtn = page.locator('button:has-text("取消"), button:has-text("Close")').first();
        if (await cancelBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
          await cancelBtn.click();
          await page.waitForTimeout(1000);
        }
      } else {
        results.criterion3 = { pass: false, reason: "Execute button not visible in preview" };
      }
    } else {
      // Preview modal did not open
      results.criterion1 = { pass: false, reason: "重编码预览 modal did not open after save" };

      // Screenshot for debugging
      await page.screenshot({ path: "eval-sprint30-debug.png" });
      console.log("Saved debug screenshot to eval-sprint30-debug.png");
    }

    // Navigate to recode records tab
    console.log("\n--- Checking recode records tab ---");
    await page.keyboard.press("Escape");
    await page.waitForTimeout(1000);

    const recordsTab = page.locator('button:has-text("重编码记录"), a:has-text("重编码记录")').first();
    const recordsTabVisible = await recordsTab.isVisible({ timeout: 5000 }).catch(() => false);
    console.log("重编码记录 tab visible:", recordsTabVisible);

    if (recordsTabVisible) {
      await recordsTab.click();
      await page.waitForTimeout(3000);

      // Check batch list
      const tableRows = await page.locator("table tbody tr").count();
      console.log("Batch table rows:", tableRows);

      if (tableRows > 0) {
        // Click first batch row
        await page.locator("table tbody tr").first().click();
        await page.waitForTimeout(2000);

        // Check for batch detail
        const detailDrawer = page.locator('[role="dialog"], .ant-drawer, .drawer, .ant-modal').filter({ hasText: /批次|batch|重编码/ }).first();
        const detailVisible = await detailDrawer.isVisible({ timeout: 3000 }).catch(() => false);
        console.log("Batch detail visible:", detailVisible);

        results.criterion4 = { pass: detailVisible, note: `Rows: ${tableRows}, detail opened: ${detailVisible}` };
      } else {
        // No batches yet - check via API if we can create one
        results.criterion4 = { pass: false, reason: "No batch rows in recode records table" };
      }
    } else {
      results.criterion4 = { pass: false, reason: "重编码记录 tab not visible" };
    }

    // Code mapping tab
    console.log("\n--- Checking code mapping tab ---");
    const mappingsTab = page.locator('button:has-text("编码映射"), a:has-text("编码映射")').first();
    const mappingsTabVisible = await mappingsTab.isVisible({ timeout: 5000 }).catch(() => false);
    console.log("编码映射 tab visible:", mappingsTabVisible);

    if (mappingsTabVisible) {
      await mappingsTab.click();
      await page.waitForTimeout(3000);

      const mappingHeaders = await page.locator("table thead th").allTextContents();
      console.log("Mapping table headers:", mappingHeaders);

      const searchInput = page.locator('input[placeholder*="搜索"], input[placeholder*="查询"]').first();
      const hasSearch = await searchInput.isVisible({ timeout: 2000 }).catch(() => false);

      const exportBtn = page.locator('button:has-text("导出"), button:has-text("Excel")').first();
      const hasExport = await exportBtn.isVisible({ timeout: 2000 }).catch(() => false);

      results.criterion5 = {
        pass: mappingHeaders.length > 0,
        note: `Headers: ${mappingHeaders.join(", ")}, search: ${hasSearch}, export: ${hasExport}`
      };
    } else {
      results.criterion5 = { pass: false, reason: "编码映射 tab not visible" };
    }

    // Criterion 7: Rollback
    console.log("\n--- Checking rollback ---");
    const recTab = page.locator('button:has-text("重编码记录"), a:has-text("重编码记录")').first();
    if (await recTab.isVisible({ timeout: 3000 }).catch(() => false)) {
      await recTab.click();
      await page.waitForTimeout(2000);

      const rollbackBtn = page.locator('button:has-text("回滚"), button:has-text("rollback"), button:has-text("回滚")').first();
      const rollbackVisible = await rollbackBtn.isVisible({ timeout: 3000 }).catch(() => false);
      console.log("Rollback button visible:", rollbackVisible);

      if (rollbackVisible) {
        await rollbackBtn.click();
        await page.waitForTimeout(2000);

        const rollbackDialog = page.locator('[role="dialog"], .ant-modal, .ant-drawer').filter({ hasText: /回滚|警告|风险|影响/ }).first();
        const dialogVisible = await rollbackDialog.isVisible({ timeout: 3000 }).catch(() => false);
        const warningText = await page.locator('text=外部, text=系统, text=影响, text=warning').first().isVisible({ timeout: 2000 }).catch(() => false);

        results.criterion7 = {
          pass: dialogVisible && warningText,
          note: `Dialog: ${dialogVisible}, warning: ${warningText}`
        };

        const cancelBtn = page.locator('button:has-text("取消"), button:has-text("Close")').first();
        if (await cancelBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
          await cancelBtn.click();
          await page.waitForTimeout(500);
        }
      } else {
        results.criterion7 = { pass: false, reason: "Rollback button not visible - no executed batch with rollback available" };
      }
    } else {
      results.criterion7 = { pass: false, reason: "重编码记录 tab not visible for rollback check" };
    }

  } catch (err) {
    console.error("Evaluation error:", err.message);
    results.error = { message: err.message };
    await page.screenshot({ path: "eval-sprint30-error.png" }).catch(() => {});
  } finally {
    await browser.close();
    if (testLibraryId) {
      await teardown(testLibraryId);
    }
  }

  console.log("\n=== FINAL RESULTS ===");
  console.log(JSON.stringify(results, null, 2));
  return results;
}

main().catch(err => {
  console.error("Fatal:", err);
  process.exit(1);
});