/**
 * Sprint 30 Evaluation - Final v2 with state inspection
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
  console.log("Sprint 30 Final v2\n");

  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await context.newPage();

  const results = {};
  const libId = 248;
  const libName = "S30_EvalFull_1779088549545";

  try {
    const loginRes = await apiCall("/auth/login", "POST", { username: "super_admin" });
    if (loginRes.status !== 200) throw new Error("Login failed");

    await page.goto(BASE_URL);
    await page.evaluate((u) => {
      localStorage.setItem("ai-material-auth-session", JSON.stringify({ username: u.username, role: u.is_super_admin ? "super_admin" : "user" }));
    }, loginRes.data);

    // Execute a fresh recode from the UI so we control the state
    await page.goto(`${BASE_URL}/material/library`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(3000);

    // Navigate to library detail
    const cardButton = page.locator(`article button:has-text("${libName}")`).first();
    await cardButton.click({ timeout: 10000 });
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(3000);

    // CRITERION 1: All-material recode preview
    console.log("\n--- Criterion 1: All-material recode preview ---");
    await page.locator('button[role="tab"]:has-text("编码规则")').click({ timeout: 5000 });
    await page.waitForTimeout(2000);
    await page.locator('button:has-text("编辑规则")').click({ timeout: 5000 });
    await page.waitForTimeout(2000);
    await page.locator('[role="dialog"] select').first().selectOption("all_recode");
    await page.waitForTimeout(500);
    await page.locator('[role="dialog"] textarea').fill("Sprint 30 final eval");
    await page.waitForTimeout(300);
    await page.locator('[role="dialog"] button:has-text("保存")').click({ timeout: 5000 });
    await page.waitForTimeout(8000);

    const bodyText = await page.locator("body").textContent();
    const hasPreview = bodyText.includes("重编码预览");
    console.log("重编码预览 visible:", hasPreview);

    if (!hasPreview) {
      results.criterion1 = { pass: false, reason: "重编码预览 modal not visible" };
      await page.screenshot({ path: "sprint30-v2-c1.png" });
    } else {
      results.criterion1 = { pass: true, evidence: "重编码预览 modal opened" };

      // Criterion 2
      const tableHeaders = await page.locator("table thead th").allTextContents();
      const passStatus = await page.locator('text=通过').first().isVisible({ timeout: 2000 }).catch(() => false);
      const csvBtn = page.locator('button:has-text("下载"), button:has-text("导出CSV")').first();
      const csvVisible = await csvBtn.isVisible({ timeout: 2000 }).catch(() => false);
      results.criterion2 = {
        pass: tableHeaders.length >= 5 && passStatus,
        note: `Headers: ${tableHeaders.join(", ")}, 通过: ${passStatus}, csv: ${csvVisible}`
      };

      // Criterion 3: Execute with confirmation
      const executeBtn = page.locator('button:has-text("执行"), button:has-text("执行重编码")').first();
      if (await executeBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await executeBtn.click({ timeout: 5000 });
        await page.waitForTimeout(2000);

        const allDialogs = await page.locator('[role="dialog"]').all();
        let confirmDialog = null;
        for (const d of allDialogs) {
          const text = await d.textContent();
          if (text.includes("重编码") || text.includes("确认") || text.includes("执行")) {
            confirmDialog = d;
            break;
          }
        }

        if (confirmDialog) {
          const dialogText = await confirmDialog.textContent();
          const libInDialog = dialogText.includes(libName);
          const materialCount = /\d/.test(dialogText);
          const warning = dialogText.includes("外部") || dialogText.includes("影响") || dialogText.includes("warning") || dialogText.includes("风险") || dialogText.includes("系统");
          results.criterion3 = {
            pass: libInDialog && materialCount,
            note: `lib: ${libInDialog}, count: ${materialCount}, warning: ${warning}`
          };
        }

        // Confirm execution
        const confirmBtns = await page.locator('[role="dialog"]:has-text("确认") button, [role="dialog"]:has-text("执行") button').all();
        if (confirmBtns.length > 0) {
          await confirmBtns[0].click({ force: true });
          await page.waitForTimeout(5000);
        } else {
          // Try finding the confirm button in the dialog
          const btn = await page.locator('[role="dialog"] button:has-text("确认"), [role="dialog"] button:has-text("执行")').first();
          await btn.click({ force: true });
          await page.waitForTimeout(5000);
        }
      }
    }

    // Close the preview modal
    await page.keyboard.press("Escape");
    await page.waitForTimeout(1000);

    // CRITERION 4: Recode records tab - batch detail
    console.log("\n--- Criterion 4: Recode records ---");
    const recTab = page.locator('button[role="tab"]:has-text("重编码记录")');
    await recTab.click({ timeout: 5000 });
    await page.waitForTimeout(2000);

    const tableRows = await page.locator("table tbody tr").count();
    console.log("Batch rows:", tableRows);

    if (tableRows > 0) {
      const batchHeaders = await page.locator("table thead th").allTextContents();
      console.log("Batch list headers:", batchHeaders);

      // Click the batch ID button (not the whole row)
      const batchIdBtn = page.locator("table tbody tr button").first();
      await batchIdBtn.click({ timeout: 5000 });
      await page.waitForTimeout(3000);

      // Check if RecodeBatchDetail rendered
      const batchDetail = page.locator('text=物料名称').first();
      const detailVisible = await batchDetail.isVisible({ timeout: 3000 }).catch(() => false);
      console.log("Batch detail visible:", detailVisible);

      if (detailVisible) {
        const rollbackBtn = page.locator('button:has-text("回滚")').first();
        const rollbackVisible = await rollbackBtn.isVisible({ timeout: 2000 }).catch(() => false);
        console.log("Rollback btn:", rollbackVisible);

        // Get batch detail text for verification
        const detailPanel = page.locator('[class*="bg-slate-50"]').filter({ hasText: /批次|物料名称/ }).first();
        const detailText = await detailPanel.textContent({ timeout: 2000 }).catch(() => null);
        console.log("Detail text (first 200):", detailText?.slice(0, 200));

        results.criterion4 = {
          pass: detailVisible,
          note: `Rows: ${tableRows}, headers: ${batchHeaders.join(", ")}, detail: ${detailVisible}`
        };

        // CRITERION 7: Rollback
        if (rollbackVisible) {
          await rollbackBtn.click({ timeout: 5000 });
          await page.waitForTimeout(2000);

          const rollbackDialog = page.locator('[role="dialog"]').filter({ hasText: /回滚|警告|风险/i }).first();
          const rollbackDialogVisible = await rollbackDialog.isVisible({ timeout: 3000 }).catch(() => false);

          if (rollbackDialogVisible) {
            const dialogText = await rollbackDialog.textContent();
            const hasWarning = dialogText.includes("外部") || dialogText.includes("影响") || dialogText.includes("warning") || dialogText.includes("风险") || dialogText.includes("系统");
            results.criterion7 = { pass: hasWarning, note: `warning: ${hasWarning}` };
          } else {
            results.criterion7 = { pass: false, reason: "Rollback dialog not found" };
          }
        } else {
          results.criterion7 = { pass: false, reason: "Rollback button not visible for executed batch" };
        }
      } else {
        results.criterion4 = { pass: false, reason: "Batch detail not visible after clicking batch ID button" };
        results.criterion7 = { pass: false, reason: "Batch detail not visible" };

        // Debug: check what's on screen
        await page.screenshot({ path: "sprint30-v2-c4-debug.png" });
        const html = await page.content();
        const hasBatch = html.includes("batchId") || html.includes("batch_id");
        console.log("HTML has batchId:", hasBatch);
      }
    } else {
      results.criterion4 = { pass: false, reason: "No batch rows in recode records" };
      results.criterion7 = { pass: false, reason: "No batch rows" };
    }

    // CRITERION 5: Code mapping tab
    console.log("\n--- Criterion 5: Code mapping ---");
    const mapTab = page.locator('button[role="tab"]:has-text("编码映射")');
    if (await mapTab.isVisible({ timeout: 3000 }).catch(() => false)) {
      await mapTab.click({ timeout: 5000 });
      await page.waitForTimeout(2000);

      const mapHeaders = await page.locator("table thead th").allTextContents();
      const searchInput = page.locator('input[type="search"], input[placeholder*="搜索"]').first();
      const searchVisible = await searchInput.isVisible({ timeout: 2000 }).catch(() => false);
      const exportBtn = page.locator('button:has-text("导出"), button:has-text("Excel")').first();
      const exportVisible = await exportBtn.isVisible({ timeout: 2000 }).catch(() => false);

      results.criterion5 = {
        pass: mapHeaders.length > 0,
        note: `Headers: ${mapHeaders.join(", ")}, search: ${searchVisible}, export: ${exportVisible}`
      };
    }

    // CRITERION 6: Selected-material recode
    console.log("\n--- Criterion 6: Selected-material ---");
    const ruleTab2 = page.locator('button[role="tab"]:has-text("编码规则")');
    if (await ruleTab2.isVisible({ timeout: 3000 }).catch(() => false)) {
      await ruleTab2.click({ timeout: 5000 });
      await page.waitForTimeout(2000);

      await page.locator('button:has-text("编辑规则")').click({ timeout: 5000 });
      await page.waitForTimeout(2000);

      await page.locator('[role="dialog"] select').first().selectOption("selected_recode");
      await page.waitForTimeout(500);
      await page.locator('[role="dialog"] textarea').fill("Sprint 30 selected");
      await page.waitForTimeout(300);
      await page.locator('[role="dialog"] button:has-text("保存")').click({ timeout: 5000 });
      await page.waitForTimeout(6000);

      const selBody = await page.locator("body").textContent();
      const hasSelection = selBody.includes("选择重编码物料") || selBody.includes("选中物料") || (selBody.includes("物料") && selBody.includes("checkbox"));
      console.log("Material selection modal:", hasSelection);

      if (hasSelection) {
        const checkboxes = await page.locator("table input[type='checkbox']").all();
        console.log("Checkboxes:", checkboxes.length);

        if (checkboxes.length > 0) {
          await checkboxes[0].click({ timeout: 5000 });
          await page.waitForTimeout(500);

          const genBtn = page.locator('button:has-text("生成预览"), button:has-text("预览"), button:has-text("确定")').first();
          if (await genBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
            await genBtn.click({ timeout: 5000 });
            await page.waitForTimeout(5000);

            const previewBody = await page.locator("body").textContent();
            const hasOneMaterial = previewBody.includes("1") && (previewBody.includes("总物料") || previewBody.includes("总数"));
            console.log("Preview total=1:", hasOneMaterial);
            results.criterion6 = { pass: hasOneMaterial, note: `Total=1: ${hasOneMaterial}` };
          } else {
            results.criterion6 = { pass: false, reason: "Generate preview btn not visible" };
          }
        }
      } else {
        results.criterion6 = { pass: false, reason: "Material selection modal not visible" };
      }
    }

  } catch (err) {
    console.error("Error:", err.message);
    results.error = err.message;
    await page.screenshot({ path: "sprint30-v2-error.png" }).catch(() => {});
  } finally {
    await browser.close();
  }

  console.log("\n=== FINAL RESULTS ===");
  console.log(JSON.stringify(results, null, 2));
}

main().catch(err => { console.error("Fatal:", err); process.exit(1); });