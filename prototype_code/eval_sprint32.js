// Sprint 32 CHECK - Material Library Admin Role and Category Library Association
const { chromium } = require('playwright');

(async () => {
  const BASE_URL = 'http://localhost:5173';
  const results = [];

  async function log(label, msg) {
    console.log(`[${label}] ${msg}`);
  }

  async function waitForSelector(page, selector, opts = {}) {
    try {
      await page.waitForSelector(selector, { timeout: 10000, ...opts });
      return true;
    } catch (e) {
      return false;
    }
  }

  async function takeScreenshot(page, name) {
    await page.screenshot({ path: `/tmp/sprint32_${name}.png`, fullPage: true });
    log('SCREENSHOT', `/tmp/sprint32_${name}.png`);
  }

  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();

    // --- Criterion 1: Create material library with admin role and category library ---
    log('CRITERION', '=== Criterion 1: Create with admin role and category library ===');

    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    await takeScreenshot(page, 'c1_landing');

    // Navigate to material library
    await page.goto(`${BASE_URL}/material/library`, { waitUntil: 'networkidle' });
    await takeScreenshot(page, 'c1_library_page');

    // Check if page loaded
    const pageContent = await page.content();
    if (pageContent.includes('物料库') || pageContent.includes('Material Library')) {
      log('NAV', 'Material library page loaded');
    }

    // Find and click the create button
    const createBtn = page.locator('button').filter({ hasText: /新增|创建|新建|添加/ }).first();
    const btnExists = await waitForSelector(page, 'button:has-text("新增"), button:has-text("创建"), button:has-text("新建"), button:has-text("添加")');
    if (!btnExists) {
      log('CRIT1_RESULT', 'FAIL - No create button found on material library page');
      results.push({ criterion: 1, result: 'FAIL', reason: 'No create button found' });
    } else {
      log('NAV', 'Found create button');
    }

    // Click create button
    const createButtons = await page.locator('button').filter({ hasText: /新增|创建|新建|添加/ }).all();
    if (createButtons.length > 0) {
      await createButtons[0].click();
      await page.waitForTimeout(2000);
      await takeScreenshot(page, 'c1_dialog_opened');
    }

    // Check for admin role dropdown
    const dialogText = await page.content();
    const hasRole = dialogText.includes('admin') || dialogText.includes('角色') || dialogText.includes('管理员');
    const hasCategoryLib = dialogText.includes('category') || dialogText.includes('类目') || dialogText.includes('类目库');

    log('DIALOG', `Dialog content includes role references: ${hasRole}`);
    log('DIALOG', `Dialog content includes category library references: ${hasCategoryLib}`);

    // Look for dropdowns specifically
    const allSelects = await page.locator('.ant-select, [role="combobox"], select').all();
    log('DIALOG', `Found ${allSelects.length} dropdown/select elements in dialog`);

    // Check if there are dropdowns mentioning "admin" or "role"
    let adminDropdownFound = false;
    let categoryLibDropdownFound = false;

    for (const sel of allSelects) {
      const text = await sel.textContent();
      if (text && (text.toLowerCase().includes('admin') || text.toLowerCase().includes('角色') || text.toLowerCase().includes('管理员'))) {
        adminDropdownFound = true;
        log('DIALOG', `Admin role dropdown found: ${text.trim()}`);
      }
      if (text && (text.toLowerCase().includes('category') || text.toLowerCase().includes('类目') || text.toLowerCase().includes('类目库'))) {
        categoryLibDropdownFound = true;
        log('DIALOG', `Category library dropdown found: ${text.trim()}`);
      }
    }

    if (adminDropdownFound && categoryLibDropdownFound) {
      log('CRIT1_RESULT', 'PASS - Both dropdowns found in create dialog');
      results.push({ criterion: 1, result: 'PASS', detail: 'Admin role and category library dropdowns found' });
    } else {
      log('CRIT1_RESULT', 'FAIL - Missing required dropdowns in create dialog');
      log('CRIT1_DETAIL', `Admin dropdown: ${adminDropdownFound}, Category lib dropdown: ${categoryLibDropdownFound}`);
      results.push({ criterion: 1, result: 'FAIL', detail: `Admin dropdown: ${adminDropdownFound}, Category lib dropdown: ${categoryLibDropdownFound}` });
    }

    await page.waitForTimeout(1000);

    // --- Criterion 2: API availability ---
    log('CRITERION', '=== Criterion 2: API endpoints ===');

    const rolesResp = await context.request.get('http://localhost:8000/api/v1/roles');
    log('API', `/api/v1/roles - ${rolesResp.status()}`);
    const rolesData = await rolesResp.json();
    log('API', `/api/v1/roles response keys: ${Object.keys(rolesData).join(', ')}`);

    const catLibResp = await context.request.get('http://localhost:8000/api/v1/category-libraries');
    log('API', `/api/v1/category-libraries - ${catLibResp.status()}`);
    const catLibData = await catLibResp.json();
    log('API', `/api/v1/category-libraries response keys: ${Object.keys(catLibData).join(', ')}`);

    if (rolesResp.status() === 200 && catLibResp.status() === 200) {
      log('CRIT2_RESULT', 'PASS - Both API endpoints return 200');
      results.push({ criterion: 2, result: 'PASS', detail: 'Both /roles and /category-libraries return 200' });
    } else {
      log('CRIT2_RESULT', 'FAIL - API endpoints not available');
      results.push({ criterion: 2, result: 'FAIL', detail: `roles: ${rolesResp.status()}, cat-libraries: ${catLibResp.status()}` });
    }

    // --- Criterion 3: Edit and reload ===
    log('CRITERION', '=== Criterion 3: Edit and reload values ===');

    // Navigate to library list again
    await page.goto(`${BASE_URL}/material/library`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    await takeScreenshot(page, 'c3_library_list');

    // Try to find an existing material library to edit
    const tableRows = await page.locator('.ant-table-row, tr[data-row-key]').all();
    log('LIST', `Found ${tableRows.length} table rows in library list`);

    if (tableRows.length > 0) {
      // Click the edit/action button for first row
      const editBtns = await page.locator('button').filter({ hasText: /编辑|修改|Edit/ }).all();
      if (editBtns.length > 0) {
        await editBtns[0].click();
        await page.waitForTimeout(2000);
        await takeScreenshot(page, 'c3_edit_dialog');

        const editText = await page.content();
        const hasRoleInEdit = editText.includes('admin') || editText.includes('角色') || editText.includes('管理员');
        const hasCatLibInEdit = editText.includes('category') || editText.includes('类目') || editText.includes('类目库');

        if (hasRoleInEdit && hasCatLibInEdit) {
          log('CRIT3_RESULT', 'PASS - Edit dialog has admin role and category library fields');
          results.push({ criterion: 3, result: 'PASS', detail: 'Edit dialog has both fields' });
        } else {
          log('CRIT3_RESULT', 'FAIL - Edit dialog missing required fields');
          results.push({ criterion: 3, result: 'FAIL', detail: `Role field: ${hasRoleInEdit}, Category lib field: ${hasCatLibInEdit}` });
        }
      } else {
        log('CRIT3_RESULT', 'FAIL - No edit button found in library list');
        results.push({ criterion: 3, result: 'FAIL', reason: 'No edit button found' });
      }
    } else {
      log('CRIT3_RESULT', 'FAIL - No material library rows found to edit');
      results.push({ criterion: 3, result: 'FAIL', reason: 'No material library rows in list' });
    }

  } catch (err) {
    log('ERROR', `Browser evaluation error: ${err.message}`);
    results.push({ criterion: 'ALL', result: 'ERROR', reason: err.message });
  } finally {
    if (browser) await browser.close();
  }

  // Print summary
  console.log('\n=== EVALUATION SUMMARY ===');
  for (const r of results) {
    console.log(`Criterion ${r.criterion}: ${r.result} - ${r.detail || r.reason || ''}`);
  }
  console.log('=== END ===');
})();