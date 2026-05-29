/**
 * Sprint 30 Evaluation v6 - Fixed select option
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
  console.log("Sprint 30 Evaluation v6\n");

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

    await page.goto(`${BASE_URL}/material/library`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(3000);

    // Click library card
    const cardButton = page.locator(`article button:has-text("${libName}"), article:has-text("${libName}") button`).first();
    await cardButton.click();
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(3000);
    console.log("Detail URL:", page.url());

    const h1 = await page.locator("h1").first().textContent({ timeout: 3000 }).catch(() => null);
    console.log("Page h1:", h1);

    // Go to rule tab
    await page.locator('button:has-text("编码规则")').click();
    await page.waitForTimeout(2000);

    // Open edit modal
    await page.locator('button:has-text("编辑规则")').click();
    await page.waitForTimeout(2000);

    // Select all_recode using value
    const recodeSelect = page.locator('[role="dialog"] select').first();
    await recodeSelect.selectOption("all_recode");
    console.log("Selected all_recode");
    await page.waitForTimeout(500);

    // Fill change reason
    await page.locator('[role="dialog"] textarea').fill("Sprint 30 evaluation");
    await page.waitForTimeout(300);

    // Save
    await page.locator('[role="dialog"] button:has-text("保存")').click();
    console.log("Clicked save");
    await page.waitForTimeout(8000);

    console.log("After save URL:", page.url());

    const bodyText = await page.locator("body").textContent();
    const hasPreview = bodyText.includes("重编码预览");
    console.log("重编码预览 visible:", hasPreview);

    if (hasPreview) {
      results.criterion1 = { pass: true, evidence: "重编码预览 modal opened" };

      // Criterion 2: Preview table
      const tableHeaders = await page.locator("table thead th").allTextContents();
      console.log("Table headers:", tableHeaders);

      const passStatus = await page.locator('text=通过').first().isVisible({ timeout: 2000 }).catch(() => false);
      const failStatus = await page.locator('text=失败').first().isVisible({ timeout: 2000 }).catch(() => false);
      console.log("Status: 通过:", passStatus, "失败:", failStatus);

      const csvBtn = page.locator('button:has-text("下载"), button:has-text("导出CSV")').first();
      const csvVisible = await csvBtn.isVisible({ timeout: 2000 }).catch(() => false);
      console.log("CSV btn:", csvVisible);

      results.criterion2 = {
        pass: tableHeaders.length > 0 && passStatus,
        note: `Headers: ${tableHeaders.join(", ")}, 通过: ${passStatus}, 失败: ${failStatus}, csv: ${csvVisible}`
      };

      // Criterion 3: Execute and confirmation
      const executeBtn = page.locator('button:has-text("执行"), button:has-text("执行重编码")').first();
      const execVisible = await executeBtn.isVisible({ timeout: 3000 }).catch(() => false);
      console.log("Execute btn:", execVisible);

      if (execVisible) {
        await executeBtn.click();
        await page.waitForTimeout(2000);

        const confirmDialog = page.locator('[role="dialog"]').filter({ hasText: /确认|执行|警告/i }).first();
        const dialogVisible = await confirmDialog.isVisible({ timeout: 3000 }).catch(() => false);
        const libInDialog = await confirmDialog.locator(`text=${libName}`).isVisible({ timeout: 1000 }).catch(() => false);

        console.log("Confirmation dialog:", dialogVisible, "library name:", libInDialog);
        results.criterion3 = { pass: dialogVisible, note: `Dialog: ${dialogVisible}, lib: ${libInDialog}` };

        await page.locator('button:has-text("取消")').click();
        await page.waitForTimeout(500);
      } else {
        results.criterion3 = { pass: false, reason: "Execute button not visible" };
      }
    } else {
      // Check error state
      const toast = await page.locator('[data-sonner-toast]').first().textContent({ timeout: 2000 }).catch(() => null);
      const alert = await page.locator('[role="alert"], .text-red').first().textContent({ timeout: 2000 }).catch(() => null);
      console.log("Toast:", toast);
      console.log("Alert:", alert);

      // Check if preview failed to load (API error)
      const previewError = await page.locator('text=预览失败, text=生成失败, text=请求失败').first().isVisible({ timeout: 2000 }).catch(() => false);
      console.log("Preview error visible:", previewError);

      // Check network requests
      const failedReqs = [];
      page.on("response", async (resp) => {
        if (resp.status() >= 400 && resp.url().includes("recode-preview")) {
          failedReqs.push({ url: resp.url(), status: resp.status() });
        }
      });

      results.criterion1 = {
        pass: false,
        reason: `重编码预览 not visible after save. Toast: ${toast}, Alert: ${alert}`
      };

      await page.screenshot({ path: "sprint30-v6-c1.png" });
      console.log("Screenshot saved");
    }

    // Criterion 4: Recode records tab
    console.log("\n--- Recode records tab ---");
    const recTab = page.locator('button:has-text("重编码记录")').first();
    if (await recTab.isVisible({ timeout: 3000 }).catch(() => false)) {
      await recTab.click();
      await page.waitForTimeout(2000);

      const tableRows = await page.locator("table tbody tr").count();
      console.log("Batch rows:", tableRows);

      if (tableRows > 0) {
        await page.locator("table tbody tr").first().click();
        await page.waitForTimeout(2000);

        const detailVisible = await page.locator('[role="dialog"], .ant-drawer, .drawer').filter({ hasText: /批次|batch|重编码/i }).first().isVisible({ timeout: 3000 }).catch(() => false);
        results.criterion4 = { pass: detailVisible, note: `Rows: ${tableRows}, detail: ${detailVisible}` };
      } else {
        results.criterion4 = { pass: false, reason: "No batch rows in recode records" };
      }
    }

    // Criterion 5: Code mapping tab
    console.log("\n--- Code mapping tab ---");
    const mapTab = page.locator('button:has-text("编码映射")').first();
    if (await mapTab.isVisible({ timeout: 3000 }).catch(() => false)) {
      await mapTab.click();
      await page.waitForTimeout(2000);

      const mapHeaders = await page.locator("table thead th").allTextContents();
      console.log("Mapping headers:", mapHeaders);

      const exportBtn = page.locator('button:has-text("导出"), button:has-text("Excel")').first();
      const exportVisible = await exportBtn.isVisible({ timeout: 2000 }).catch(() => false);
      console.log("Export btn:", exportVisible);

      results.criterion5 = { pass: mapHeaders.length > 0, note: `Headers: ${mapHeaders.join(", ")}, export: ${exportVisible}` };
    }

    // Criterion 7: Rollback
    console.log("\n--- Rollback ---");
    const recTab2 = page.locator('button:has-text("重编码记录")').first();
    if (await recTab2.isVisible({ timeout: 3000 }).catch(() => false)) {
      await recTab2.click();
      await page.waitForTimeout(2000);

      if (await page.locator("table tbody tr").count() > 0) {
        await page.locator("table tbody tr").first().click();
        await page.waitForTimeout(2000);

        const rollbackBtn = page.locator('button:has-text("回滚")').first();
        const rollbackVisible = await rollbackBtn.isVisible({ timeout: 3000 }).catch(() => false);
        console.log("Rollback btn:", rollbackVisible);

        if (rollbackVisible) {
          await rollbackBtn.click();
          await page.waitForTimeout(2000);

          const dialog = page.locator('[role="dialog"]').filter({ hasText: /回滚|警告|风险/i }).first();
          const dialogVisible = await dialog.isVisible({ timeout: 3000 }).catch(() => false);

          results.criterion7 = { pass: dialogVisible, note: `Dialog: ${dialogVisible}` };

          await page.locator('button:has-text("取消")').click();
        } else {
          results.criterion7 = { pass: false, reason: "Rollback btn not visible - no executed batch" };
        }
      }
    }

  } catch (err) {
    console.error("Error:", err.message);
    results.error = err.message;
    await page.screenshot({ path: "sprint30-v6-error.png" }).catch(() => {});
  } finally {
    await browser.close();
  }

  console.log("\n=== FINAL RESULTS ===");
  console.log(JSON.stringify(results, null, 2));
}

main().catch(err => { console.error("Fatal:", err); process.exit(1); });