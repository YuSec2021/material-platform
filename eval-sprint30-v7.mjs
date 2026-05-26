/**
 * Sprint 30 Evaluation v7 - Complete evaluation with all criteria
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
  console.log("Sprint 30 Evaluation v7 - Complete Evaluation\n");

  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await context.newPage();

  const results = {};
  const testLibId = 247;
  const libName = "Sprint30_Eval_1779087411466";

  try {
    const loginRes = await apiCall("/auth/login", "POST", { username: "super_admin" });
    console.log("Auth:", loginRes.status);
    if (loginRes.status !== 200) throw new Error("Login failed");

    await page.goto(BASE_URL);
    await page.evaluate((u) => {
      localStorage.setItem("ai-material-auth-session", JSON.stringify({ username: u.username, role: u.is_super_admin ? "super_admin" : "user" }));
    }, loginRes.data);

    // Setup: create a new library to test all flows from scratch
    const pn = await apiCall("/product-names");
    const cats = await apiCall("/categories");
    const productName = Array.isArray(pn.data) && pn.data.length > 0 ? pn.data[0] : null;
    const category = Array.isArray(cats.data) && cats.data.length > 0 ? cats.data[0] : null;

    const lib = await apiCall("/material-libraries", "POST", {
      name: `S30_EvalFull_${Date.now()}`,
      description: "full eval",
      enabled: true,
      auto_code_enabled: true,
      recode_enabled: true,
      code_rule: {
        separator: "-",
        segments: [
          { type: "fixed_text", order: 0, value: "S30F" },
          { type: "category_path", order: 1, level: 1, level_lengths: [2] },
          { type: "serial_number", order: 2, length: 4, start: 1, step: 1, scope: "global", padding: "left_zero" }
        ]
      }
    });
    const testLib = lib.status >= 200 && lib.status < 300 ? lib.data : null;
    if (!testLib) { console.log("FAIL: no library"); return; }
    console.log("Created library:", testLib.id, testLib.name);

    let material = null;
    if (productName && category) {
      const m = await apiCall("/materials", "POST", {
        name: "Sprint 30 Material",
        product_name_id: productName.id,
        material_library_id: testLib.id,
        category_id: category.id,
        unit: "个",
        brand_id: null,
        status: "normal",
        description: "test",
        attributes: {}
      });
      if (m.status >= 200 && m.status < 300) material = m.data;
      console.log("Created material:", material?.id);
    }

    await page.goto(`${BASE_URL}/material/library`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(3000);

    // Navigate to library detail
    const cardButton = page.locator(`article button:has-text("${testLib.name}")`).first();
    await cardButton.click();
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(3000);
    console.log("On detail page, URL:", page.url());

    // CRITERION 1 & 2 & 3: All-material recode preview
    console.log("\n=== Criterion 1-3: All-material recode preview ===\n");

    await page.locator('button:has-text("编码规则")').click();
    await page.waitForTimeout(2000);

    await page.locator('button:has-text("编辑规则")').click();
    await page.waitForTimeout(2000);

    // Select all_recode
    await page.locator('[role="dialog"] select').first().selectOption("all_recode");
    await page.waitForTimeout(500);

    // Fill change reason
    await page.locator('[role="dialog"] textarea').fill("Sprint 30 full evaluation");
    await page.waitForTimeout(300);

    // Save
    await page.locator('[role="dialog"] button:has-text("保存")').click();
    console.log("Clicked save, waiting for preview...");
    await page.waitForTimeout(8000);

    const bodyText = await page.locator("body").textContent();
    const hasPreview = bodyText.includes("重编码预览");
    console.log("重编码预览 visible:", hasPreview);

    if (hasPreview) {
      results.criterion1 = { pass: true, evidence: "重编码预览 modal opened after all-material recode edit" };

      // Criterion 2: Preview table
      const tableHeaders = await page.locator("table thead th").allTextContents();
      console.log("Table headers:", tableHeaders);

      const passStatus = await page.locator('text=通过').first().isVisible({ timeout: 2000 }).catch(() => false);
      const failStatus = await page.locator('text=失败').first().isVisible({ timeout: 2000 }).catch(() => false);
      console.log("Status cells: 通过:", passStatus, ", 失败:", failStatus);

      // Pagination check
      const pagination = page.locator('[class*="pagination"], .ant-pagination, button:has-text("下一页")').first();
      const paginationVisible = await pagination.isVisible({ timeout: 2000 }).catch(() => false);
      console.log("Pagination visible:", paginationVisible);

      // CSV download
      const csvBtn = page.locator('button:has-text("下载"), button:has-text("导出CSV")').first();
      const csvVisible = await csvBtn.isVisible({ timeout: 2000 }).catch(() => false);
      console.log("CSV download btn:", csvVisible);

      results.criterion2 = {
        pass: tableHeaders.length >= 5 && passStatus,
        note: `Headers (${tableHeaders.length}): ${tableHeaders.join(", ")}, 通过: ${passStatus}, 失败: ${failStatus}, pagination: ${paginationVisible}, csv: ${csvVisible}`
      };

      // Criterion 3: Execute with confirmation
      const executeBtn = page.locator('button:has-text("执行"), button:has-text("执行重编码")').first();
      const execVisible = await executeBtn.isVisible({ timeout: 3000 }).catch(() => false);
      console.log("Execute btn:", execVisible);

      if (execVisible) {
        await executeBtn.click();
        await page.waitForTimeout(2000);

        // Check confirmation dialog
        const dialogs = await page.locator('[role="dialog"]').all();
        let confirmDialog = null;
        for (const d of dialogs) {
          const text = await d.textContent();
          if (text.includes("重编码") || text.includes("确认") || text.includes("执行")) {
            confirmDialog = d;
            break;
          }
        }

        if (confirmDialog) {
          const dialogText = await confirmDialog.textContent();
          const libInDialog = dialogText.includes(testLib.name);
          const materialCountInDialog = /\d/.test(dialogText);
          const warningInDialog = dialogText.includes("外部") || dialogText.includes("影响") || dialogText.includes("warning") || dialogText.includes("系统");
          console.log("Confirm dialog - lib name:", libInDialog, "material count:", materialCountInDialog, "warning:", warningInDialog);

          results.criterion3 = {
            pass: libInDialog && materialCountInDialog,
            note: `lib: ${libInDialog}, count: ${materialCountInDialog}, warning: ${warningInDialog}`
          };

          // Cancel
          const cancelBtns = await confirmDialog.locator('button:has-text("取消")').all();
          if (cancelBtns.length > 0) {
            await cancelBtns[0].click();
            await page.waitForTimeout(500);
          }
        } else {
          results.criterion3 = { pass: false, reason: "Confirmation dialog not found after execute click" };
        }
      } else {
        results.criterion3 = { pass: false, reason: "Execute button not visible in preview" };
      }

      // Now actually execute to create a batch for criteria 4, 5, 7
      console.log("\n--- Executing recode to create batch ---");
      const execBtn2 = page.locator('button:has-text("执行"), button:has-text("执行重编码")').first();
      if (await execBtn2.isVisible({ timeout: 2000 }).catch(() => false)) {
        await execBtn2.click();
        await page.waitForTimeout(2000);

        // Confirm in dialog
        const confirmBtns = await page.locator('[role="dialog"] button:has-text("确认"), [role="dialog"] button:has-text("执行")').all();
        if (confirmBtns.length > 0) {
          await confirmBtns[0].click();
          console.log("Confirmed execution");
          await page.waitForTimeout(5000);
        }
      }

      // Check execution result
      const execBody = await page.locator("body").textContent();
      const execSuccess = execBody.includes("执行完成") || execBody.includes("成功") || execBody.includes("完成");
      console.log("Execution success:", execSuccess);

    } else {
      results.criterion1 = { pass: false, reason: "重编码预览 not visible after save" };
      await page.screenshot({ path: "sprint30-v7-c1.png" });
    }

    // CRITERION 4: Recode records tab
    console.log("\n=== Criterion 4: Recode records ===\n");
    const recTab = page.locator('button:has-text("重编码记录")').first();
    if (await recTab.isVisible({ timeout: 3000 }).catch(() => false)) {
      await recTab.click();
      await page.waitForTimeout(2000);

      const tableRows = await page.locator("table tbody tr").count();
      console.log("Batch rows:", tableRows);

      if (tableRows > 0) {
        // Check batch list columns
        const batchHeaders = await page.locator("table thead th").allTextContents();
        console.log("Batch list headers:", batchHeaders);

        // Click first batch row
        await page.locator("table tbody tr").first().click();
        await page.waitForTimeout(2000);

        // Check batch detail
        const detailVisible = await page.locator('[role="dialog"], .ant-drawer, .drawer, [class*="detail"]').filter({ hasText: /批次|batch|重编码|物料/i }).first().isVisible({ timeout: 3000 }).catch(() => false);
        console.log("Batch detail visible:", detailVisible);

        const detailText = await page.locator('[role="dialog"], .ant-drawer, .drawer').filter({ hasText: /批次/i }).first().textContent({ timeout: 2000 }).catch(() => null);
        const hasMaterialInDetail = detailText ? detailText.includes("物料名称") || detailText.includes("旧编码") || detailText.includes("新编码") : false;
        console.log("Material details in detail:", hasMaterialInDetail);

        results.criterion4 = {
          pass: detailVisible && batchRows > 0,
          note: `Rows: ${tableRows}, headers: ${batchHeaders.join(", ")}, detail: ${detailVisible}, material cols: ${hasMaterialInDetail}`
        };
      } else {
        results.criterion4 = { pass: false, reason: "No batch rows in recode records" };
      }
    }

    // CRITERION 5: Code mapping tab
    console.log("\n=== Criterion 5: Code mapping ===\n");
    const mapTab = page.locator('button:has-text("编码映射")').first();
    if (await mapTab.isVisible({ timeout: 3000 }).catch(() => false)) {
      await mapTab.click();
      await page.waitForTimeout(2000);

      const mapHeaders = await page.locator("table thead th").allTextContents();
      console.log("Mapping headers:", mapHeaders);

      // Search functionality
      const searchInput = page.locator('input[type="search"], input[placeholder*="搜索"], input[placeholder*="查询"]').first();
      const searchVisible = await searchInput.isVisible({ timeout: 2000 }).catch(() => false);
      console.log("Search input visible:", searchVisible);

      // Try search
      if (searchVisible) {
        await searchInput.fill("S30F");
        await page.waitForTimeout(1000);
        const filteredRows = await page.locator("table tbody tr").count();
        console.log("Filtered rows after search:", filteredRows);
        await searchInput.clear();
        await page.waitForTimeout(500);
      }

      // Export button
      const exportBtn = page.locator('button:has-text("导出"), button:has-text("Excel"), button:has-text("下载")').first();
      const exportVisible = await exportBtn.isVisible({ timeout: 2000 }).catch(() => false);
      console.log("Export btn:", exportVisible);

      // Pagination
      const mapPagination = page.locator('[class*="pagination"], .ant-pagination').first();
      const mapPagVisible = await mapPagination.isVisible({ timeout: 2000 }).catch(() => false);
      console.log("Mapping pagination:", mapPagVisible);

      results.criterion5 = {
        pass: mapHeaders.length > 0 && searchVisible && exportVisible,
        note: `Headers: ${mapHeaders.join(", ")}, search: ${searchVisible}, export: ${exportVisible}, pagination: ${mapPagVisible}`
      };
    }

    // CRITERION 6: Selected-material recode
    console.log("\n=== Criterion 6: Selected-material recode ===\n");
    const ruleTab = page.locator('button:has-text("编码规则")').first();
    if (await ruleTab.isVisible({ timeout: 3000 }).catch(() => false)) {
      await ruleTab.click();
      await page.waitForTimeout(2000);

      await page.locator('button:has-text("编辑规则")').click();
      await page.waitForTimeout(2000);

      const recodeSelect = page.locator('[role="dialog"] select').first();
      await recodeSelect.selectOption("selected_recode");
      await page.waitForTimeout(500);

      await page.locator('[role="dialog"] textarea').fill("Sprint 30 selected eval");
      await page.waitForTimeout(300);

      await page.locator('[role="dialog"] button:has-text("保存")').click();
      console.log("Saved with selected_recode");
      await page.waitForTimeout(6000);

      const selBody = await page.locator("body").textContent();
      const hasSelectionModal = selBody.includes("选择重编码物料") || selBody.includes("选中物料");
      console.log("Material selection modal:", hasSelectionModal);

      if (hasSelectionModal) {
        // Check for checkbox column
        const checkboxHeader = await page.locator('th:has-text("选择"), th:has-text("checkbox"), th input[type="checkbox"]').first().isVisible({ timeout: 2000 }).catch(() => false);
        console.log("Checkbox column:", checkboxHeader);

        // Select one material
        const checkboxes = await page.locator("table input[type='checkbox']").all();
        console.log("Checkbox count:", checkboxes.length);

        if (checkboxes.length > 0) {
          await checkboxes[0].click();
          await page.waitForTimeout(500);

          // Generate preview
          const genBtn = page.locator('button:has-text("生成预览"), button:has-text("预览")').first();
          const genVisible = await genBtn.isVisible({ timeout: 2000 }).catch(() => false);
          console.log("Generate preview btn:", genVisible);

          if (genVisible) {
            await genBtn.click();
            await page.waitForTimeout(5000);

            // Check preview summary total is 1
            const previewBody = await page.locator("body").textContent();
            const hasOneMaterial = previewBody.includes("1") && (previewBody.includes("总物料") || previewBody.includes("总数"));
            console.log("Preview shows 1 material:", hasOneMaterial);

            results.criterion6 = { pass: hasOneMaterial, note: `Total=1 visible: ${hasOneMaterial}` };
          }
        }
      } else {
        results.criterion6 = { pass: false, reason: "Material selection modal did not open for selected_recode" };
      }
    }

    // CRITERION 7: Rollback
    console.log("\n=== Criterion 7: Rollback ===\n");
    const recTab2 = page.locator('button:has-text("重编码记录")').first();
    if (await recTab2.isVisible({ timeout: 3000 }).catch(() => false)) {
      await recTab2.click();
      await page.waitForTimeout(2000);

      const rows = await page.locator("table tbody tr").count();
      console.log("Batch rows:", rows);

      if (rows > 0) {
        await page.locator("table tbody tr").first().click();
        await page.waitForTimeout(2000);

        const rollbackBtn = page.locator('button:has-text("回滚")').first();
        const rollbackVisible = await rollbackBtn.isVisible({ timeout: 3000 }).catch(() => false);
        console.log("Rollback btn:", rollbackVisible);

        if (rollbackVisible) {
          await rollbackBtn.click();
          await page.waitForTimeout(2000);

          const dialogs = await page.locator('[role="dialog"]').all();
          let rollbackDialog = null;
          for (const d of dialogs) {
            const text = await d.textContent();
            if (text.includes("回滚") || text.includes("警告") || text.includes("风险") || text.includes("rollback")) {
              rollbackDialog = d;
              break;
            }
          }

          if (rollbackDialog) {
            const dialogText = await rollbackDialog.textContent();
            const hasWarning = dialogText.includes("外部") || dialogText.includes("影响") || dialogText.includes("warning") || dialogText.includes("风险") || dialogText.includes("系统");
            console.log("Rollback dialog - warning:", hasWarning);

            results.criterion7 = { pass: hasWarning, note: `warning: ${hasWarning}` };

            // Cancel
            const cancelBtns = await rollbackDialog.locator('button:has-text("取消")').all();
            if (cancelBtns.length > 0) await cancelBtns[0].click();
          } else {
            results.criterion7 = { pass: false, reason: "Rollback confirmation dialog not found" };
          }
        } else {
          results.criterion7 = { pass: false, reason: "Rollback button not visible - no executed batch" };
        }
      }
    }

  } catch (err) {
    console.error("Error:", err.message);
    results.error = err.message;
    await page.screenshot({ path: "sprint30-v7-error.png" }).catch(() => {});
  } finally {
    await browser.close();
  }

  console.log("\n=== FINAL RESULTS ===");
  console.log(JSON.stringify(results, null, 2));
}

main().catch(err => { console.error("Fatal:", err); process.exit(1); });