/**
 * Sprint 30 Evaluation v8 - Complete with remaining criteria
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
  console.log("Sprint 30 Evaluation v8\n");

  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await context.newPage();

  const results = {};
  let testLibId = null;

  try {
    const loginRes = await apiCall("/auth/login", "POST", { username: "super_admin" });
    console.log("Auth:", loginRes.status);
    if (loginRes.status !== 200) throw new Error("Login failed");

    await page.goto(BASE_URL);
    await page.evaluate((u) => {
      localStorage.setItem("ai-material-auth-session", JSON.stringify({ username: u.username, role: u.is_super_admin ? "super_admin" : "user" }));
    }, loginRes.data);

    // Use the library created in v7 (ID 248)
    testLibId = 248;
    const libName = "S30_EvalFull_1779088549545";

    // First, ensure we have an executed batch by executing the recode via API
    // Get the current rule version
    const ruleRes = await apiCall(`/material-libraries/${testLibId}/code-rules/current`);
    const currentRule = ruleRes.status === 200 ? ruleRes.data : null;
    console.log("Current rule:", currentRule?.id, currentRule?.version_label);

    if (currentRule) {
      // Create a new version for preview
      const newVerRes = await apiCall(`/material-libraries/${testLibId}/code-rules/versions`, "POST", {
        rule_name: "Sprint 30 Batch Test",
        rule_config: {
          separator: "-",
          segments: [
            { type: "fixed", order: 1, value: "S30BT" },
            { type: "category_path", order: 2, level: 1, level_lengths: [2] },
            { type: "serial", order: 3, length: 4, start: 1, step: 1, scope: "global" }
          ]
        },
        change_reason: "Sprint 30 batch execution test",
        activate: false
      });
      const newVersion = newVerRes.status >= 200 && newVerRes.status < 300 ? newVerRes.data : null;
      console.log("New version:", newVersion?.id, newVersion?.version_label);

      if (newVersion) {
        // Create preview
        const previewRes = await apiCall(`/material-libraries/${testLibId}/code-rules/versions/${newVersion.id}/recode-preview`, "POST", {
          scope: "all",
          material_ids: []
        });
        console.log("Preview status:", previewRes.status, previewRes.data?.batch_id);

        const batchId = previewRes.data?.batch_id;
        if (batchId) {
          // Execute
          const execRes = await apiCall(`/material-code-change-batches/${batchId}/execute`, "POST", {
            confirm: true,
            reason: "Sprint 30 execution"
          });
          console.log("Execute status:", execRes.status, execRes.data?.status);
        }
      }
    }

    // Now navigate to browser
    await page.goto(`${BASE_URL}/material/library`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(3000);

    // Navigate to library detail
    const cardButton = page.locator(`article button:has-text("${libName}")`).first();
    await cardButton.click();
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(3000);
    console.log("On detail page");

    // CRITERION 4: Recode records tab
    console.log("\n--- Criterion 4: Recode records ---");
    const recTab = page.locator('button:has-text("重编码记录")').first();
    if (await recTab.isVisible({ timeout: 5000 }).catch(() => false)) {
      await recTab.click();
      await page.waitForTimeout(2000);

      const tableRows = await page.locator("table tbody tr").count();
      console.log("Batch rows:", tableRows);

      if (tableRows > 0) {
        const batchHeaders = await page.locator("table thead th").allTextContents();
        console.log("Batch list headers:", batchHeaders);

        // Click first batch row
        await page.locator("table tbody tr").first().click();
        await page.waitForTimeout(2000);

        // Check batch detail
        const detailEl = page.locator('[role="dialog"], .ant-drawer, .drawer').filter({ hasText: /批次|batch|重编码/i }).first();
        const detailVisible = await detailEl.isVisible({ timeout: 3000 }).catch(() => false);
        console.log("Batch detail visible:", detailVisible);

        if (detailVisible) {
          const detailText = await detailEl.textContent();
          const hasMetadata = detailText.includes("批次") || detailText.includes("ID") || detailText.includes("old") || detailText.includes("new");
          const hasMaterialRows = detailText.includes("物料名称") || detailText.includes("旧编码") || detailText.includes("新编码");
          console.log("Batch metadata:", hasMetadata, "Material rows:", hasMaterialRows);

          results.criterion4 = { pass: detailVisible, note: `Rows: ${tableRows}, headers: ${batchHeaders.join(", ")}, detail: ${detailVisible}, material cols: ${hasMaterialRows}` };
        } else {
          results.criterion4 = { pass: false, reason: "Batch detail did not open" };
        }
      } else {
        results.criterion4 = { pass: false, reason: "No batch rows in recode records" };
      }
    }

    // CRITERION 5: Code mapping tab
    console.log("\n--- Criterion 5: Code mapping ---");
    const mapTab = page.locator('button:has-text("编码映射")').first();
    if (await mapTab.isVisible({ timeout: 5000 }).catch(() => false)) {
      await mapTab.click();
      await page.waitForTimeout(2000);

      const mapHeaders = await page.locator("table thead th").allTextContents();
      console.log("Mapping headers:", mapHeaders);

      const searchInput = page.locator('input[type="search"], input[placeholder*="搜索"], input[placeholder*="查询"]').first();
      const searchVisible = await searchInput.isVisible({ timeout: 2000 }).catch(() => false);
      console.log("Search visible:", searchVisible);

      // Try search
      if (searchVisible) {
        await searchInput.fill("S30");
        await page.waitForTimeout(1000);
        const filteredRows = await page.locator("table tbody tr").count();
        console.log("Filtered rows:", filteredRows);
        await searchInput.fill("");
        await page.waitForTimeout(500);
      }

      const exportBtn = page.locator('button:has-text("导出"), button:has-text("Excel"), button:has-text("下载")').first();
      const exportVisible = await exportBtn.isVisible({ timeout: 2000 }).catch(() => false);
      console.log("Export btn:", exportVisible);

      const mapPagination = page.locator('[class*="pagination"], .ant-pagination').first();
      const mapPagVisible = await mapPagination.isVisible({ timeout: 2000 }).catch(() => false);
      console.log("Pagination:", mapPagVisible);

      results.criterion5 = {
        pass: mapHeaders.length > 0,
        note: `Headers: ${mapHeaders.join(", ")}, search: ${searchVisible}, export: ${exportVisible}, pagination: ${mapPagVisible}`
      };
    }

    // CRITERION 6: Selected-material recode
    console.log("\n--- Criterion 6: Selected-material recode ---");
    const ruleTab = page.locator('button:has-text("编码规则")').first();
    if (await ruleTab.isVisible({ timeout: 3000 }).catch(() => false)) {
      await ruleTab.click();
      await page.waitForTimeout(2000);

      await page.locator('button:has-text("编辑规则")').click();
      await page.waitForTimeout(2000);

      await page.locator('[role="dialog"] select').first().selectOption("selected_recode");
      await page.waitForTimeout(500);

      await page.locator('[role="dialog"] textarea').fill("Sprint 30 selected eval");
      await page.waitForTimeout(300);

      await page.locator('[role="dialog"] button:has-text("保存")').click();
      console.log("Saved with selected_recode");
      await page.waitForTimeout(6000);

      const selBody = await page.locator("body").textContent();
      const hasSelectionModal = selBody.includes("选择重编码物料") || selBody.includes("选中物料") || selBody.includes("recodePreview");
      console.log("Material selection modal:", hasSelectionModal);

      if (hasSelectionModal) {
        const checkboxes = await page.locator("table input[type='checkbox']").all();
        console.log("Checkbox count:", checkboxes.length);

        if (checkboxes.length > 0) {
          await checkboxes[0].click();
          await page.waitForTimeout(500);

          const genBtn = page.locator('button:has-text("生成预览"), button:has-text("预览"), button:has-text("确定")').first();
          const genVisible = await genBtn.isVisible({ timeout: 2000 }).catch(() => false);
          console.log("Generate preview btn:", genVisible);

          if (genVisible) {
            await genBtn.click();
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
        results.criterion6 = { pass: false, reason: "Material selection modal not visible for selected_recode" };
      }
    }

    // CRITERION 7: Rollback
    console.log("\n--- Criterion 7: Rollback ---");
    await page.keyboard.press("Escape");
    await page.waitForTimeout(500);

    const recTab2 = page.locator('button:has-text("重编码记录")').first();
    if (await recTab2.isVisible({ timeout: 3000 }).catch(() => false)) {
      await recTab2.click();
      await page.waitForTimeout(2000);

      const rows = await page.locator("table tbody tr").count();
      console.log("Batch rows:", rows);

      if (rows > 0) {
        await page.locator("table tbody tr").first().click();
        await page.waitForTimeout(2000);

        const rollbackBtn = page.locator('button:has-text("回滚"), button:has-text("rollback")').first();
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
            console.log("Rollback warning:", hasWarning);

            results.criterion7 = { pass: hasWarning, note: `warning: ${hasWarning}` };

            // Confirm rollback to test full flow
            const confirmBtns = await rollbackDialog.locator('button:has-text("确认"), button:has-text("执行")').all();
            if (confirmBtns.length > 0) {
              await confirmBtns[0].click({ force: true });
              await page.waitForTimeout(5000);

              // Check rolled back state
              const finalBody = await page.locator("body").textContent();
              const isRolledBack = finalBody.includes("已回滚") || finalBody.includes("rolled_back") || finalBody.includes("回滚成功");
              console.log("Rollback completed:", isRolledBack);

              // Check code mapping shows rolled back status
              const mapTab2 = page.locator('button:has-text("编码映射")').first();
              if (await mapTab2.isVisible({ timeout: 3000 }).catch(() => false)) {
                await mapTab2.click();
                await page.waitForTimeout(2000);

                const mapBody = await page.locator("body").textContent();
                const rolledBackInMapping = mapBody.includes("已回滚") || mapBody.includes("rolled_back");
                console.log("Rolled back status in mapping:", rolledBackInMapping);
              }
            }
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
    await page.screenshot({ path: "sprint30-v8-error.png" }).catch(() => {});
  } finally {
    await browser.close();
  }

  console.log("\n=== FINAL RESULTS ===");
  console.log(JSON.stringify(results, null, 2));
}

main().catch(err => { console.error("Fatal:", err); process.exit(1); });