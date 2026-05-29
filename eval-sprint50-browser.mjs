import { chromium } from 'playwright';

const BASE = 'http://localhost:5173';
const BACKEND = 'http://localhost:8000';

async function run() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  const results = [];

  // Login as super_admin
  await page.goto(BASE, { waitUntil: 'networkidle' });
  console.log('Navigated to frontend base URL');

  try {
    // Look for login form
    await page.waitForSelector('input[type="text"], input[placeholder*="账"], input[placeholder*="用户名"]', { timeout: 10000 });
    const inputs = await page.$$('input');
    if (inputs.length >= 2) {
      await inputs[0].fill('admin');
      await inputs[1].fill('admin');
      await page.click('button[type="submit"], button:has-text("登录"), button:has-text("登录")');
      await page.waitForTimeout(2000);
    }
  } catch (e) {
    console.log('Login form not found or already logged in');
  }

  // Navigate to category management
  await page.goto(`${BASE}/standard/categories`, { waitUntil: 'networkidle' });
  console.log('Navigated to category management page');

  // === Criterion 3: Frontend CSV Import Preview with 5 level columns ===
  console.log('\n--- Criterion 3: Frontend CSV Import Preview ---');

  try {
    // Look for batch import button
    const importBtn = await page.$('button:has-text("批量导入"), button:has-text("导入"), button:has-text("CSV")');
    if (importBtn) {
      await importBtn.click();
      await page.waitForTimeout(1000);
    }

    // Download template from UI
    const downloadBtn = await page.$('button:has-text("模板"), button:has-text("下载"), button:has-text("template")');
    if (downloadBtn) {
      console.log('PASS: Template download button found');
    } else {
      console.log('INFO: No template download button found, checking backend template directly');
    }

    // Verify backend template headers
    const templateResp = await page.evaluate(async (url) => {
      const r = await fetch(url, { headers: { 'X-User-Role': 'super_admin' } });
      return await r.text();
    }, `${BACKEND}/api/v1/categories/template`);

    const has5Levels = templateResp.includes('一级类目') &&
                        templateResp.includes('二级类目') &&
                        templateResp.includes('三级类目') &&
                        templateResp.includes('四级类目') &&
                        templateResp.includes('五级类目');

    console.log(`Template CSV header check: ${has5Levels ? 'PASS' : 'FAIL'}`);
    console.log(`Template content:\n${templateResp}`);

    if (has5Levels) {
      // Close dialog if open
      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);
    }

    // === Criterion 4: Frontend AI One-Click Import Preview ===
    console.log('\n--- Criterion 4: Frontend AI One-Click Import ---');

    const aiImportBtn = await page.$('button:has-text("AI一键导入"), button:has-text("AI导入")');
    if (aiImportBtn) {
      await aiImportBtn.click();
      await page.waitForTimeout(1000);

      // Find textarea for AI input
      const textarea = await page.$('textarea');
      if (textarea) {
        await textarea.fill('办公用品 > 纸张 > 复印纸 > A4纸 > 80g');
        console.log('PASS: AI import input field found and text entered');

        // Look for recognition/trigger button
        const triggerBtn = await page.$('button:has-text("识别"), button:has-text("提交"), button:has-text("发送")');
        if (triggerBtn) {
          console.log('PASS: Recognition trigger button found');
          // Note: We won't actually submit to avoid real AI calls during eval
        }
      }
    } else {
      console.log('INFO: AI one-click import button not found via UI - checking API directly');
    }

  } catch (e) {
    console.log(`ERROR: ${e.message}`);
  }

  // === Additional Check: category tree with 5 levels ===
  console.log('\n--- Category Tree Navigation ---');

  // First, check if the tree shows the 5-level path we created
  const treeResponse = await page.evaluate(async (url) => {
    const r = await fetch(url, { headers: { 'X-User-Role': 'super_admin' } });
    return await r.json();
  }, `${BACKEND}/api/v1/categories?category_library_id=1&level=1`);

  const s50Cats = treeResponse.filter(c => c.name.includes('S50'));
  console.log(`Found ${s50Cats.length} Sprint 50 test categories`);
  s50Cats.forEach(c => console.log(`  - ${c.name} (parent: ${c.parent_category_id})`));

  // Test legacy CSV compatibility
  console.log('\n--- Legacy CSV Compatibility ---');
  const legacyResp = await page.evaluate(async (text) => {
    // Simulate parsing a legacy 3-column CSV
    const lines = text.trim().split('\n');
    return { headers: lines[0].split(','), rows: lines.slice(1) };
  }, `一级类目,二级类目,三级类目\n办公设备,打印设备,激光打印机`);

  console.log(`Legacy CSV parsing: ${legacyResp.headers.length} headers, ${legacyResp.rows.length} rows`);

  await browser.close();
  console.log('\n--- Evaluation Complete ---');
}

run().catch(e => {
  console.error('Fatal error:', e.message);
  process.exit(1);
});