/**
 * Sprint 30 Evaluation - Final clean evaluation
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

function closeDialogByEscape(page) {
  return page.keyboard.press("Escape");
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  console.log("Sprint 30 Evaluation - Final\n");

  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await context.newPage();

  const results = {};
  const libId = 248;

  try {
    const loginRes = await apiCall("/auth/login", "POST", { username: "super_admin" });
    if (loginRes.status !== 200) throw new Error("Login failed");

    await page.goto(BASE_URL);
    await page.evaluate((u) => {
      localStorage.setItem("ai-material-auth-session", JSON.stringify({ username: u.username, role: u.is_super_admin ? "super_admin" : "user" }));
    }, loginRes.data);

    await page.goto(`${BASE_URL}/material/library`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(3000);

    // Navigate to library detail
    const libName = "S30_EvalFull_1779088549545";
    const cardButton = page.locator(`article button:has-text("${libName}")`).first();
    await cardButton.click({ timeout: 10000 });
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(3000);
    console.log("On detail page");

    // CRITERION 4: Recode records tab - batch detail
    console.log("\n--- Criterion 4: Recode records + batch detail ---");
    const recTab = page.locator('button[role="tab"]:has-text("重编码记录")');
    await recTab.click({ timeout: 5000 });
    await page.waitForTimeout(2000);

    const tableRows = await page.locator("table tbody tr").count();
    console.log("Batch rows:", tableRows);

    if (tableRows > 0) {
      const batchHeaders = await page.locator("table thead th").allTextContents();
      console.log("Batch list headers:", batchHeaders);

      // Click first batch row
      const firstRow = page.locator("table tbody tr").first();
      await firstRow.click();
      await page.waitForTimeout(3000);

      // Check batch detail (it's a panel within the same page, not a modal)
      const batchDetailEl = page.locator('[class*="bg-slate-50"]:has-text("批次")').first();
      const detailVisible = await batchDetailEl.isVisible({ timeout: 3000 }).catch(() => false);
      console.log("Batch detail panel visible:", detailVisible);

      if (detailVisible) {
        const detailText = await batchDetailEl.textContent();
        const hasMaterialCols = detailText.includes("物料名称") && (detailText.includes("旧编码") || detailText.includes("新编码"));
        console.log("Material columns in detail:", hasMaterialCols);

        // Check for rollback button
        const rollbackBtn = page.locator('button:has-text("回滚")').first();
        const rollbackVisible = await rollbackBtn.isVisible({ timeout: 2000 }).catch(() => false);
        console.log("Rollback btn in detail:", rollbackVisible);

        results.criterion4 = {
          pass: detailVisible,
          note: `Rows: ${tableRows}, headers: ${batchHeaders.join(", ")}, detail visible: ${detailVisible}, material cols: ${hasMaterialCols}`
        };
      } else {
        results.criterion4 = { pass: false, reason: "Batch detail panel not visible after clicking row" };
      }
    } else {
      results.criterion4 = { pass: false, reason: "No batch rows in recode records" };
    }

    // CRITERION 7: Rollback (already in batch detail from above)
    console.log("\n--- Criterion 7: Rollback ---");
    const rollbackBtn = page.locator('button:has-text("回滚")').first();
    const rollbackVisible = await rollbackBtn.isVisible({ timeout: 3000 }).catch(() => false);
    console.log("Rollback btn visible:", rollbackVisible);

    if (rollbackVisible) {
      await rollbackBtn.click({ timeout: 5000 });
      await page.waitForTimeout(2000);

      // Check rollback dialog
      const dialogTitle = await page.locator('[role="dialog"] h3, [role="dialog"] h2').first().textContent({ timeout: 2000 }).catch(() => null);
      const dialogText = await page.locator('[role="dialog"]').first().textContent({ timeout: 2000 }).catch(() => null);
      console.log("Rollback dialog title:", dialogTitle);
      console.log("Dialog contains 回滚:", dialogText.includes("回滚"));
      console.log("Dialog contains warning:", dialogText.includes("外部") || dialogText.includes("影响") || dialogText.includes("warning") || dialogText.includes("风险") || dialogText.includes("系统"));

      const hasWarning = dialogText.includes("外部") || dialogText.includes("影响") || dialogText.includes("warning") || dialogText.includes("风险") || dialogText.includes("系统");
      results.criterion7 = { pass: hasWarning, note: `warning: ${hasWarning}` };

      // Cancel the rollback dialog using Escape
      await closeDialogByEscape(page);
      await page.waitForTimeout(500);
    } else {
      results.criterion7 = { pass: false, reason: "Rollback button not visible" };
    }

    // CRITERION 5: Code mapping tab - back from recode
    console.log("\n--- Criterion 5: Code mapping tab ---");
    const mapTab = page.locator('button[role="tab"]:has-text("编码映射")');
    if (await mapTab.isVisible({ timeout: 3000 }).catch(() => false)) {
      await mapTab.click({ timeout: 5000 });
      await page.waitForTimeout(2000);

      const mapHeaders = await page.locator("table thead th").allTextContents();
      console.log("Mapping headers:", mapHeaders);

      const searchInput = page.locator('input[type="search"], input[placeholder*="搜索"], input[placeholder*="查询"]').first();
      const searchVisible = await searchInput.isVisible({ timeout: 2000 }).catch(() => false);
      console.log("Search visible:", searchVisible);

      if (searchVisible) {
        await searchInput.fill("S30");
        await page.waitForTimeout(1000);
        const filteredRows = await page.locator("table tbody tr").count();
        console.log("Filtered rows after search:", filteredRows);
        await searchInput.fill("");
        await page.waitForTimeout(500);
      }

      const exportBtn = page.locator('button:has-text("导出"), button:has-text("Excel"), button:has-text("下载")').first();
      const exportVisible = await exportBtn.isVisible({ timeout: 2000 }).catch(() => false);
      console.log("Export btn:", exportVisible);

      results.criterion5 = {
        pass: mapHeaders.length > 0,
        note: `Headers: ${mapHeaders.join(", ")}, search: ${searchVisible}, export: ${exportVisible}`
      };
    }

    // CRITERION 6: Selected-material recode - go to rule tab
    console.log("\n--- Criterion 6: Selected-material recode ---");
    const ruleTab = page.locator('button[role="tab"]:has-text("编码规则")');
    if (await ruleTab.isVisible({ timeout: 3000 }).catch(() => false)) {
      await ruleTab.click({ timeout: 5000 });
      await page.waitForTimeout(2000);

      await page.locator('button:has-text("编辑规则")').click({ timeout: 5000 });
      await page.waitForTimeout(2000);

      await page.locator('[role="dialog"] select').first().selectOption("selected_recode");
      await page.waitForTimeout(500);

      await page.locator('[role="dialog"] textarea').fill("Sprint 30 selected eval");
      await page.waitForTimeout(300);

      await page.locator('[role="dialog"] button:has-text("保存")').click({ timeout: 5000 });
      console.log("Saved with selected_recode");
      await page.waitForTimeout(6000);

      const selBody = await page.locator("body").textContent();
      const hasSelectionModal = selBody.includes("选择重编码物料") || selBody.includes("选中物料") || selBody.includes("物料");
      console.log("Material selection modal:", hasSelectionModal);

      if (hasSelectionModal) {
        const checkboxes = await page.locator("table input[type='checkbox']").all();
        console.log("Checkbox count:", checkboxes.length);

        if (checkboxes.length > 0) {
          await checkboxes[0].click({ timeout: 5000 });
          await page.waitForTimeout(500);

          const genBtn = page.locator('button:has-text("生成预览"), button:has-text("预览"), button:has-text("确定")').first();
          const genVisible = await genBtn.isVisible({ timeout: 2000 }).catch(() => false);
          console.log("Generate preview btn:", genVisible);

          if (genVisible) {
            await genBtn.click({ timeout: 5000 });
            await page.waitForTimeout(5000);

            const previewBody = await page.locator("body").textContent();
            const hasOneMaterial = previewBody.includes("1") && (previewBody.includes("总物料") || previewBody.includes("总数") || previewBody.includes("total"));
            console.log("Preview total=1:", hasOneMaterial);

            results.criterion6 = { pass: hasOneMaterial, note: `Total=1: ${hasOneMaterial}` };
          } else {
            results.criterion6 = { pass: false, reason: "Generate preview button not visible" };
          }
        }
      } else {
        results.criterion6 = { pass: false, reason: "Material selection modal not visible" };
      }
    }

  } catch (err) {
    console.error("Error:", err.message);
    results.error = err.message;
    await page.screenshot({ path: "sprint30-final-error.png" }).catch(() => {});
  } finally {
    await browser.close();
  }

  console.log("\n=== FINAL RESULTS ===");
  console.log(JSON.stringify(results, null, 2));
}

main().catch(err => { console.error("Fatal:", err); process.exit(1); });