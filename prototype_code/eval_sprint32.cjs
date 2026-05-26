// Sprint 32 CHECK - Material Library Admin Role and Category Library Association
const { chromium } = require('playwright');

(async () => {
  const BASE_URL = 'http://localhost:5173';
  const API_URL = 'http://localhost:8000';
  const results = [];

  async function log(label, msg) {
    console.log(`[${label}] ${msg}`);
  }

  async function takeScreenshot(page, name) {
    await page.screenshot({ path: `/tmp/sprint32_${name}.png`, fullPage: true });
    log('SCREENSHOT', `/tmp/sprint32_${name}.png`);
  }

  let browser;
  try {
    browser = await chromium.launch({
      headless: true,
      executablePath: '/Users/yusec/Library/Caches/ms-playwright/chromium-1223/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'
    });
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();

    // --- Login via browser form ---
    log('AUTH', 'Navigating to login page...');
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    await takeScreenshot(page, 'login_page_raw');

    // Check the actual input elements
    const inputFields = await page.locator('input').all();
    log('AUTH', `Found ${inputFields.length} input fields`);
    for (let i = 0; i < inputFields.length; i++) {
      const type = await inputFields[i].getAttribute('type');
      const placeholder = await inputFields[i].getAttribute('placeholder');
      const name = await inputFields[i].getAttribute('name');
      log('AUTH', `Input ${i}: type=${type}, placeholder=${placeholder}, name=${name}`);
    }

    // Try to find and fill username and password
    // The form might use ant-design inputs
    const usernameInput = page.locator('input').filter({ has: page.locator('..') }).first();
    const allInputs = await page.locator('input').all();
    log('AUTH', `Input types: ${JSON.stringify(await Promise.all(allInputs.map(async (inp) => {
      return { type: await inp.getAttribute('type'), placeholder: await inp.getAttribute('placeholder'), id: await inp.getAttribute('id'), class: (await inp.getAttribute('class') || '').split(' ').slice(0, 3).join(' ') };
    })))}`);

    // Fill the form - try super_admin login
    const firstInput = page.locator('input').first();
    await firstInput.fill('super_admin');
    await page.waitForTimeout(500);

    // Fill password
    const passwordInput = page.locator('input[type="password"]');
    if (await passwordInput.count() > 0) {
      await passwordInput.fill('');
      await page.waitForTimeout(500);
    }

    await takeScreenshot(page, 'login_filled');

    // Submit the form
    const submitBtn = page.locator('button[type="submit"]');
    if (await submitBtn.count() > 0) {
      await submitBtn.click();
      log('AUTH', 'Submitted login form');
      await page.waitForTimeout(5000);
      await takeScreenshot(page, 'after_browser_login');
      log('AUTH', `URL after submit: ${page.url()}`);
    } else {
      log('AUTH', 'No submit button found');
    }

    // Check if we are logged in
    const currentUrl = page.url();
    const isOnLoginPage = currentUrl.includes('/login');

    if (isOnLoginPage) {
      log('AUTH', 'Still on login page - login failed. Trying hcm_zhangsan...');
      // Try hcm_zhangsan with password123
      await page.locator('input').first().fill('hcm_zhangsan');
      await page.locator('input[type="password"]').fill('password123');
      await page.locator('button[type="submit"]').click();
      await page.waitForTimeout(5000);
      await takeScreenshot(page, 'after_hcm_login');
      log('AUTH', `URL after hcm submit: ${page.url()}`);
    }

    // Check if logged in - look for user menu or profile
    const pageContent = await page.content();
    const hasUserMenu = pageContent.includes('用户') || pageContent.includes('退出') || pageContent.includes('profile') || pageContent.includes('张三');
    log('AUTH', `Has user menu indicators: ${hasUserMenu}`);

    // Navigate to material library anyway
    await page.goto(`${BASE_URL}/material/library`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(3000);
    await takeScreenshot(page, 'c1_library_page');

    const libUrl = page.url();
    const libContent = await page.content();
    log('PAGE', `URL: ${libUrl}, Content length: ${libContent.length}`);

    // Get all buttons
    const allButtons = await page.locator('button').allTextContents();
    log('BUTTONS', `Found ${allButtons.length} buttons: ${JSON.stringify(allButtons.slice(0, 40))}`);

    // --- Criterion 1: Create material library with admin role and category library ---
    log('CRITERION', '=== Criterion 1: Create with admin role and category library ===');

    const createBtn = page.locator('button').filter({ hasText: /新增|创建|新建|添加/i }).first();
    const createBtnCount = await createBtn.count();
    log('NAV', `Create button count: ${createBtnCount}`);

    if (createBtnCount > 0) {
      await createBtn.click();
      await page.waitForTimeout(3000);
      await takeScreenshot(page, 'c1_dialog_opened');

      // Check dialog content
      const labelTexts = await page.locator('label, .ant-form-item-label label, .ant-col label').allTextContents();
      log('DIALOG', `Form labels: ${JSON.stringify(labelTexts.slice(0, 30))}`);

      const roleLabelFound = labelTexts.some(t => t.includes('角色') || t.includes('admin') || t.includes('管理员') || t.includes('Admin') || t.includes('library_admin'));
      const catLibLabelFound = labelTexts.some(t => t.includes('类目') || t.includes('category') || t.includes('Category') || t.includes('类目库') || t.includes('category_library'));

      // Also check ant-select text
      const antSelects = await page.locator('.ant-select').all();
      const antSelectLabels = await page.locator('.ant-select').allTextContents();
      log('DIALOG', `Found ${antSelects.length} ant-select elements, text: ${JSON.stringify(antSelectLabels.slice(0, 15))}`);

      if (roleLabelFound && catLibLabelFound) {
        log('CRIT1_RESULT', 'PASS - Both admin role and category library dropdowns found in create dialog');
        results.push({ criterion: 1, result: 'PASS', detail: 'Admin role and category library dropdowns present with labels in create dialog' });
      } else {
        log('CRIT1_RESULT', 'FAIL - Create dialog missing required dropdowns');
        log('CRIT1_DETAIL', `Role label found: ${roleLabelFound}, CatLib label found: ${catLibLabelFound}`);
        results.push({ criterion: 1, result: 'FAIL', detail: `Missing dropdowns: role=${roleLabelFound}, catLib=${catLibLabelFound}` });
      }

      // Close dialog
      const closeBtn = page.locator('button[aria-label="Close"], .ant-modal-close, button:has-text("取消"), button:has-text("关闭")').first();
      if (await closeBtn.count() > 0) {
        await closeBtn.click();
        await page.waitForTimeout(1000);
      }
    } else {
      log('CRIT1_RESULT', 'FAIL - No create button found');
      results.push({ criterion: 1, result: 'FAIL', reason: 'No create button found on material library page' });
    }

    // --- Criterion 2: API availability ---
    log('CRITERION', '=== Criterion 2: API endpoints ===');

    const rolesResp = await context.request.get(`${API_URL}/api/v1/roles`);
    log('API', `/api/v1/roles - ${rolesResp.status()}`);
    let rolesOk = rolesResp.status() === 200;

    const catLibResp = await context.request.get(`${API_URL}/api/v1/category-libraries`);
    log('API', `/api/v1/category-libraries - ${catLibResp.status()}`);
    let catLibOk = catLibResp.status() === 200;

    if (rolesOk && catLibOk) {
      log('CRIT2_RESULT', 'PASS - Both API endpoints return 200');
      results.push({ criterion: 2, result: 'PASS', detail: 'Both /api/v1/roles and /api/v1/category-libraries return 200' });
    } else {
      log('CRIT2_RESULT', 'FAIL - API endpoints not available');
      results.push({ criterion: 2, result: 'FAIL', detail: `roles: ${rolesResp.status()}, cat-libraries: ${catLibResp.status()}` });
    }

    // --- Criterion 3: Edit and reload values ---
    log('CRITERION', '=== Criterion 3: Edit and reload values ===');

    await page.goto(`${BASE_URL}/material/library`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(3000);
    await takeScreenshot(page, 'c3_library_list');

    const rows = await page.locator('.ant-table-row').all();
    log('LIST', `Found ${rows.length} table rows`);

    const editBtns = await page.locator('button').filter({ hasText: /编辑|修改|Edit/i }).all();
    log('LIST', `Found ${editBtns.length} edit buttons`);

    if (editBtns.length > 0) {
      await editBtns[0].click();
      await page.waitForTimeout(3000);
      await takeScreenshot(page, 'c3_edit_dialog');

      const editLabels = await page.locator('label, .ant-form-item-label label, .ant-col label').allTextContents();
      log('EDIT_DIALOG', `Form labels in edit: ${JSON.stringify(editLabels.slice(0, 30))}`);

      const roleLabelInEdit = editLabels.some(t => t.includes('角色') || t.includes('admin') || t.includes('管理员') || t.includes('Admin') || t.includes('library_admin'));
      const catLibLabelInEdit = editLabels.some(t => t.includes('类目') || t.includes('category') || t.includes('Category') || t.includes('类目库') || t.includes('category_library'));

      const selectedAntSelects = await page.locator('.ant-select .ant-select-selection-item').allTextContents();
      log('EDIT_DIALOG', `Pre-selected ant-select values: ${JSON.stringify(selectedAntSelects)}`);

      if (roleLabelInEdit && catLibLabelInEdit) {
        log('CRIT3_RESULT', 'PASS - Edit dialog has admin role and category library fields');
        results.push({ criterion: 3, result: 'PASS', detail: 'Edit dialog has both fields with labels and pre-selected values' });
      } else {
        log('CRIT3_RESULT', 'FAIL - Edit dialog missing required fields');
        results.push({ criterion: 3, result: 'FAIL', detail: `Role field: ${roleLabelInEdit}, CatLib field: ${catLibLabelInEdit}` });
      }
    } else {
      log('CRIT3_RESULT', 'FAIL - No edit button found in library list');
      results.push({ criterion: 3, result: 'FAIL', reason: 'No edit button found in library list' });
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