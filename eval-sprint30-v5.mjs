/**
 * Sprint 30 Evaluation v5 - Correct navigation to library detail
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
  console.log("Sprint 30 Evaluation v5\n");

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

    await page.goto(BASE_URL);
    await page.evaluate((u) => {
      localStorage.setItem("ai-material-auth-session", JSON.stringify({ username: u.username, role: u.is_super_admin ? "super_admin" : "user" }));
    }, loginRes.data);

    // Go to material library page
    await page.goto(`${BASE_URL}/material/library`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(3000);
    console.log("List page URL:", page.url());

    // Find and click the library card for library 247
    // The name is "Sprint30_Eval_1779087411466"
    const libName = "Sprint30_Eval_1779087411466";

    // Find the card with this name - it's a button inside an article
    const cardButton = page.locator(`article button:has-text("${libName}"), article:has-text("${libName}") button`).first();
    const cardVisible = await cardButton.isVisible({ timeout: 5000 }).catch(() => false);
    console.log("Library card visible:", cardVisible);

    if (cardVisible) {
      await cardButton.click();
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(3000);
      console.log("After click URL:", page.url());

      // Check we're on the detail page
      const h1 = await page.locator("h1").first().textContent({ timeout: 3000 }).catch(() => null);
      console.log("Detail page h1:", h1);

      // Check tabs are visible
      const tabs = await page.locator('[role="tab"], button:has-text("基础信息"), button:has-text("编码规则"), button:has-text("规则版本")').allTextContents();
      console.log("Tab buttons:", tabs.slice(0, 10));

      // Navigate to rule tab
      const ruleTab = page.locator('button:has-text("编码规则")').first();
      const ruleTabVisible = await ruleTab.isVisible({ timeout: 3000 }).catch(() => false);
      console.log("编码规则 tab visible:", ruleTabVisible);

      if (ruleTabVisible) {
        await ruleTab.click();
        await page.waitForTimeout(2000);

        // Check current rule content
        const ruleText = await page.locator("text=V1, text=V2, text=active").first().textContent({ timeout: 2000 }).catch(() => null);
        console.log("Rule version visible:", ruleText);

        // Look for Edit Rule button
        const editBtn = page.locator('button:has-text("编辑规则")').first();
        const editBtnVisible = await editBtn.isVisible({ timeout: 3000 }).catch(() => false);
        console.log("编辑规则 button visible:", editBtnVisible);

        if (editBtnVisible) {
          await editBtn.click();
          await page.waitForTimeout(2000);

          // Check modal
          const modal = page.locator('[role="dialog"]').first();
          const modalVisible = await modal.isVisible({ timeout: 3000 }).catch(() => false);
          console.log("Edit modal visible:", modalVisible);

          if (modalVisible) {
            const modalTitle = await modal.locator("h2").first().textContent({ timeout: 2000 }).catch(() => null);
            console.log("Modal title:", modalTitle);

            // Find the effective mode select
            const selects = await page.locator('[role="dialog"] select').all();
            console.log("Selects in modal:", selects.length);
            for (let i = 0; i < selects.length; i++) {
              const opts = await selects[i].locator("option").allTextContents();
              console.log(`  Select ${i}:`, opts.join(" | "));
            }

            // Select all_recode
            const recodeSelect = page.locator('[role="dialog"] select').filter({ hasOption: /重编码|all_recode/i }).first();
            const recodeVisible = await recodeSelect.isVisible({ timeout: 2000 }).catch(() => false);
            console.log("Recode select visible:", recodeVisible);

            if (recodeVisible) {
              await recodeSelect.selectOption({ label: /全部物料重编码/ });
              await page.waitForTimeout(500);
            }

            // Fill change reason
            const textarea = page.locator('[role="dialog"] textarea').first();
            if (await textarea.isVisible({ timeout: 2000 }).catch(() => false)) {
              await textarea.fill("Sprint 30 evaluation");
              await page.waitForTimeout(300);
            }

            // Click save
            const saveBtn = page.locator('[role="dialog"] button:has-text("保存")').first();
            console.log("Save btn visible:", await saveBtn.isVisible({ timeout: 2000 }).catch(() => false));
            await saveBtn.click();
            await page.waitForTimeout(8000);

            console.log("After save URL:", page.url());

            // Check for preview modal
            const bodyText = await page.locator("body").textContent();
            const hasPreview = bodyText.includes("重编码预览");
            console.log("重编码预览 in body:", hasPreview);
            console.log("Version text in body:", bodyText.includes("版本") || bodyText.includes("V1") || bodyText.includes("V2"));

            if (hasPreview) {
              results.criterion1 = { pass: true, evidence: "重编码预览 modal opened after all-material recode edit" };

              // Criterion 2: Check preview table
              const tableHeaders = await page.locator("table thead th").allTextContents();
              console.log("Table headers:", tableHeaders);

              const passStatus = await page.locator('text=通过').first().isVisible({ timeout: 2000 }).catch(() => false);
              const failStatus = await page.locator('text=失败').first().isVisible({ timeout: 2000 }).catch(() => false);
              console.log("Status: 通过:", passStatus, "失败:", failStatus);

              // Check CSV download
              const csvBtn = page.locator('button:has-text("下载"), button:has-text("导出")').first();
              const csvVisible = await csvBtn.isVisible({ timeout: 2000 }).catch(() => false);
              console.log("CSV download btn:", csvVisible);

              results.criterion2 = {
                pass: tableHeaders.length > 0 && passStatus,
                note: `Headers: ${tableHeaders.join(", ")}, 通过: ${passStatus}, 失败: ${failStatus}`
              };

              // Criterion 3: Execute
              const executeBtn = page.locator('button:has-text("执行")').first();
              const execVisible = await executeBtn.isVisible({ timeout: 3000 }).catch(() => false);
              console.log("Execute btn:", execVisible);

              if (execVisible) {
                await executeBtn.click();
                await page.waitForTimeout(2000);

                const confirmDialog = page.locator('[role="dialog"]').filter({ hasText: /确认|执行|警告/i }).first();
                const dialogVisible = await confirmDialog.isVisible({ timeout: 3000 }).catch(() => false);
                const libInDialog = await confirmDialog.locator(`text=${libName}`).isVisible({ timeout: 1000 }).catch(() => false);

                results.criterion3 = { pass: dialogVisible, note: `Dialog: ${dialogVisible}, lib: ${libInDialog}` };

                const cancelBtn = page.locator('button:has-text("取消")').first();
                if (await cancelBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
                  await cancelBtn.click();
                  await page.waitForTimeout(500);
                }
              }
            } else {
              // Check if there's an error
              const toast = await page.locator('[data-sonner-toast]').first().textContent({ timeout: 2000 }).catch(() => null);
              const alert = await page.locator('[role="alert"], .text-red').first().textContent({ timeout: 2000 }).catch(() => null);
              console.log("Toast:", toast);
              console.log("Alert:", alert);

              results.criterion1 = {
                pass: false,
                reason: `重编码预览 not visible. Toast: ${toast}, Alert: ${alert}`
              };

              await page.screenshot({ path: "sprint30-v5-c1.png" });
            }
          }
        }
      }

      // Criterion 4: Recode records tab
      console.log("\n--- Checking recode records tab ---");
      const recTab = page.locator('button:has-text("重编码记录")').first();
      const recTabVisible = await recTab.isVisible({ timeout: 3000 }).catch(() => false);
      console.log("重编码记录 tab:", recTabVisible);

      if (recTabVisible) {
        await recTab.click();
        await page.waitForTimeout(2000);

        const tableRows = await page.locator("table tbody tr").count();
        console.log("Batch table rows:", tableRows);

        if (tableRows > 0) {
          await page.locator("table tbody tr").first().click();
          await page.waitForTimeout(2000);

          const detailVisible = await page.locator('[role="dialog"], .ant-drawer, .drawer').filter({ hasText: /批次|batch|重编码/i }).first().isVisible({ timeout: 3000 }).catch(() => false);
          results.criterion4 = { pass: detailVisible, note: `Rows: ${tableRows}, detail: ${detailVisible}` };
        }
      }

      // Criterion 5: Code mapping tab
      console.log("\n--- Checking code mapping tab ---");
      const mapTab = page.locator('button:has-text("编码映射")').first();
      const mapTabVisible = await mapTab.isVisible({ timeout: 3000 }).catch(() => false);
      console.log("编码映射 tab:", mapTabVisible);

      if (mapTabVisible) {
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
      console.log("\n--- Checking rollback ---");
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

            const cancelBtn = page.locator('button:has-text("取消")').first();
            if (await cancelBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
              await cancelBtn.click();
            }
          } else {
            results.criterion7 = { pass: false, reason: "Rollback button not visible - no executed batch" };
          }
        }
      }

    } else {
      console.log("Library card not found!");
      // List all articles
      const articles = await page.locator("article").all();
      console.log("Number of articles:", articles.length);
      for (let i = 0; i < Math.min(articles.length, 5); i++) {
        const text = await articles[i].textContent();
        console.log(`  Article ${i}:`, text?.slice(0, 80));
      }
    }

  } catch (err) {
    console.error("Error:", err.message);
    results.error = err.message;
    await page.screenshot({ path: "sprint30-v5-error.png" }).catch(() => {});
  } finally {
    await browser.close();
  }

  console.log("\n=== FINAL RESULTS ===");
  console.log(JSON.stringify(results, null, 2));
}

main().catch(err => { console.error("Fatal:", err); process.exit(1); });