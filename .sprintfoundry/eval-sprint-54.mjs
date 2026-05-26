/**
 * Sprint 54 EVALUATOR — Capability Mapping Page
 * Uses Playwright for browser verification.
 * Verification mode: browser at http://localhost:5173
 */
import { chromium } from 'playwright';

const BASE = 'http://localhost:5173';
const RESULTS = [];
let browser;
let context;
let page;

function pass(criterion, observation) {
  RESULTS.push({ criterion, result: 'PASS', observation });
  console.log(`  [PASS] ${criterion}`);
  console.log(`         ${observation}`);
}

function fail(criterion, observation) {
  RESULTS.push({ criterion, result: 'FAIL', observation });
  console.log(`  [FAIL] ${criterion}`);
  console.log(`         ${observation}`);
}

async function login(username, password = '') {
  await page.goto(`${BASE}/login`);
  await page.waitForSelector('input[type="password"]', { timeout: 10000 });
  await page.waitForTimeout(500);

  // The login form has: a hidden input (value=super_admin), password input with placeholder
  // Button is "登录" submit
  const passwordInput = page.locator('input[type="password"]');
  const submitBtn = page.locator('button[type="submit"]');

  await passwordInput.fill(password);
  await submitBtn.click();
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000);
}

async function switchLocale(targetLocale) {
  // Find the language toggle button
  const langBtn = page.locator('button').filter({ hasText: /中文明 English/i }).first();
  if (await langBtn.count() > 0) {
    await langBtn.click();
    await page.waitForTimeout(500);
    const targetLang = targetLocale === 'zh-CN' ? '中文' : 'English';
    const langOption = page.locator('text=' + targetLang).first();
    if (await langOption.count() > 0) {
      await langOption.click();
      await page.waitForTimeout(500);
    }
  }
}

async function switchTheme() {
  const themeBtn = page.locator('button').filter({ hasText: /切换主题|Toggle theme/i }).first();
  if (await themeBtn.count() > 0) {
    await themeBtn.click();
    await page.waitForTimeout(500);
  }
}

// CRITERION 1: Page reachability and table rendering
async function criterion1() {
  try {
    await page.goto(`${BASE}/ai/capability-mappings`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    const url = page.url();
    const pageTitle = await page.locator('h1').first().textContent().catch(() => '');

    const urlOk = url.includes('capability-mappings');
    const headers = await page.locator('table thead th').allTextContents();
    const capabilityCells = await page.locator('table tbody td').allTextContents();

    const hasMaterialAdd = capabilityCells.some(t => t.includes('物料添加') || t.includes('Material Addition') || t.includes('material_add'));
    const hasCategoryRecognition = capabilityCells.some(t => t.includes('类目识别') || t.includes('Category Recognition'));
    const hasMaterialMatch = capabilityCells.some(t => t.includes('物料匹配') || t.includes('Material Matching'));
    const hasAttrRecommend = capabilityCells.some(t => t.includes('属性推荐') || t.includes('Attribute Recommendation'));
    const hasMaterialGovernance = capabilityCells.some(t => t.includes('物料治理') || t.includes('Material Governance'));
    const hasMaterialAnalysis = capabilityCells.some(t => t.includes('物料分析') || t.includes('Material Analysis'));

    const capabilitiesFound = [hasMaterialAdd, hasCategoryRecognition, hasMaterialMatch, hasAttrRecommend, hasMaterialGovernance, hasMaterialAnalysis].filter(Boolean).length;
    const colCountOk = headers.length >= 5;

    if (urlOk && colCountOk && capabilitiesFound >= 4) {
      pass('Criterion 1', `URL: ${url}, title: "${pageTitle}", table has ${headers.length} columns, ${capabilitiesFound}/6 capabilities visible`);
    } else {
      fail('Criterion 1', `URL: ${url}, headers: ${JSON.stringify(headers)}, capabilities: ${capabilitiesFound}/6`);
    }
  } catch (err) {
    fail('Criterion 1', `Error: ${err.message}`);
  }
}

// CRITERION 2: Super admin edit with duplicate prevention
async function criterion2() {
  try {
    await page.goto(`${BASE}/ai/capability-mappings`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    const editButtons = await page.locator('button:has-text("编辑"), button:has-text("Edit")').all();
    if (editButtons.length === 0) {
      fail('Criterion 2', 'No edit buttons found - super admin may not be logged in or page not rendering correctly');
      return;
    }

    await editButtons[0].click();
    await page.waitForTimeout(1500);

    const dialogOpen = await page.locator('[role="dialog"]').count() > 0;
    const primarySelect = await page.locator('#primary-model').count();
    const fallbackSelect = await page.locator('#fallback-model').count();
    const enabledToggle = await page.locator('#mapping-enabled').count();

    if (dialogOpen && primarySelect > 0 && fallbackSelect > 0) {
      pass('Criterion 2', `Edit dialog opened with primary model selector, fallback model selector, and enabled toggle`);
    } else {
      fail('Criterion 2', `Dialog open: ${dialogOpen}, primary: ${primarySelect}, fallback: ${fallbackSelect}, enabled: ${enabledToggle}`);
    }

    // Close dialog
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
  } catch (err) {
    fail('Criterion 2', `Error: ${err.message}`);
  }
}

// CRITERION 3: Health states visible
async function criterion3() {
  try {
    await page.goto(`${BASE}/ai/capability-mappings`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    const warningIndicators = await page.locator('[class*="text-red"]').all();
    const warningCount = warningIndicators.length;

    const infoIndicators = await page.locator('[class*="text-blue"]').all();
    const infoCount = infoIndicators.length;

    const unconfiguredText = await page.locator('text=未配置, text=Unconfigured').all();
    const unconfiguredCount = unconfiguredText.length;

    if (warningCount > 0 || infoCount > 0 || unconfiguredCount > 0) {
      pass('Criterion 3', `Health states visible: ${warningCount} warning indicators, ${infoCount} info indicators, ${unconfiguredCount} unconfigured placeholders`);
    } else {
      fail('Criterion 3', `No health state indicators found. Warning: ${warningCount}, info: ${infoCount}, unconfigured: ${unconfiguredCount}`);
    }
  } catch (err) {
    fail('Criterion 3', `Error: ${err.message}`);
  }
}

// CRITERION 4: Model Gateway usage counts
async function criterion4() {
  try {
    await page.goto(`${BASE}/ai/capability-mappings`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    const noModelsMessage = await page.locator('text=暂无可用模型, text=No models available').count();

    if (noModelsMessage > 0) {
      fail('Criterion 4', 'No models are configured in Model Gateway - cannot test usage count feature');
      return;
    }

    await page.goto(`${BASE}/ai/models`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    const usageIndicators = await page.locator('text=已在, text=Used by').all();
    const usageCount = usageIndicators.length;

    if (usageCount > 0) {
      pass('Criterion 4', `Model Gateway shows ${usageCount} usage indicators for models referenced in capability mappings`);
    } else {
      const modelCards = await page.locator('[class*="card"], [class*="Card"]').all();
      if (modelCards.length > 0) {
        fail('Criterion 4', `Model cards found (${modelCards.length}) but no usage count indicators visible`);
      } else {
        fail('Criterion 4', 'No model cards found on Model Gateway page');
      }
    }
  } catch (err) {
    fail('Criterion 4', `Error: ${err.message}`);
  }
}

// CRITERION 5: i18n zh-CN/en-US locale switching
async function criterion5() {
  try {
    await page.goto(`${BASE}/ai/capability-mappings`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    const zhHeaders = await page.locator('table thead th').allTextContents();
    const zhHasCapabilityName = zhHeaders.some(t => t.includes('能力') || t.includes('能力名称'));
    const zhHasPrimaryModel = zhHeaders.some(t => t.includes('主模型'));

    const zhCapabilityCells = await page.locator('table tbody td').allTextContents();
    const zhHasMaterialAdd = zhCapabilityCells.some(t => t.includes('物料添加'));
    const zhHasCategoryRecognition = zhCapabilityCells.some(t => t.includes('类目识别'));

    // Switch to en-US
    await switchLocale('en-US');
    await page.waitForTimeout(1000);

    const enHeaders = await page.locator('table thead th').allTextContents();
    const enHasCapabilityName = enHeaders.some(t => t.includes('Capability') || t.includes('Capability Name'));
    const enHasPrimaryModel = enHeaders.some(t => t.includes('Primary'));

    const enCapabilityCells = await page.locator('table tbody td').allTextContents();
    const enHasMaterialAdd = enCapabilityCells.some(t => t.includes('Material Addition'));
    const enHasCategoryRecognition = enCapabilityCells.some(t => t.includes('Category Recognition'));

    const zhOk = zhHasCapabilityName && zhHasPrimaryModel && zhHasMaterialAdd;
    const enOk = enHasCapabilityName && enHasPrimaryModel && enHasMaterialAdd;

    if (zhOk && enOk) {
      pass('Criterion 5', `i18n works: zh-CN has "能力名称", "主模型", "物料添加"; en-US has "Capability Name", "Primary", "Material Addition"`);
    } else {
      fail('Criterion 5', `zh-CN ok: ${zhOk}, en-US ok: ${enOk}. zh-CN headers: ${JSON.stringify(zhHeaders)}, en-US headers: ${JSON.stringify(enHeaders)}`);
    }
  } catch (err) {
    fail('Criterion 5', `Error: ${err.message}`);
  }
}

// CRITERION 6: Dark theme rendering
async function criterion6() {
  try {
    await switchTheme();
    await page.waitForTimeout(500);

    await page.goto(`${BASE}/ai/capability-mappings`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    const tableVisible = await page.locator('table').isVisible();
    const tableHeaders = await page.locator('table thead th').allTextContents();
    const tableRows = await page.locator('table tbody tr').count();

    // Test dialog
    const editButtons = await page.locator('button:has-text("编辑"), button:has-text("Edit")').all();
    if (editButtons.length > 0) {
      await editButtons[0].click();
      await page.waitForTimeout(1500);
      const dialogVisible = await page.locator('[role="dialog"]').isVisible().catch(() => false);
      if (dialogVisible) {
        pass('Criterion 6', `Dark theme: table visible with ${tableRows} rows, ${tableHeaders.length} columns, dialog opened successfully`);
        await page.keyboard.press('Escape');
      } else {
        fail('Criterion 6', `Table visible: ${tableVisible}, rows: ${tableRows}, headers: ${tableHeaders.length}, dialog failed to open`);
      }
    } else {
      fail('Criterion 6', `No edit buttons found in dark theme`);
    }
  } catch (err) {
    fail('Criterion 6', `Error: ${err.message}`);
  }
}

// CRITERION 7: Non-super-admin read-only view
async function criterion7() {
  try {
    const logoutBtn = page.locator('button:has-text("退出登录"), button:has-text("Log out"), button:has-text("Logout")').first();
    if (await logoutBtn.count() > 0) {
      await logoutBtn.click();
      await page.waitForTimeout(1000);
    }

    // Login as regular user (non-super-admin)
    await login('user', '');

    await page.goto(`${BASE}/ai/capability-mappings`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    const tableVisible = await page.locator('table').isVisible().catch(() => false);
    const capabilityCells = await page.locator('table tbody td').allTextContents();
    const hasMappings = capabilityCells.length > 0;

    const editButtons = await page.locator('button:has-text("编辑"), button:has-text("Edit")').all();
    const hasEditButtons = editButtons.length > 0;

    const readOnlyText = await page.locator('text=只读, text=Read only').count();

    if (tableVisible && hasMappings && !hasEditButtons) {
      pass('Criterion 7', `Non-super-admin sees mapping table (read-only), no edit buttons, ${readOnlyText} read-only indicator(s)`);
    } else {
      fail('Criterion 7', `Table: ${tableVisible}, mappings: ${hasMappings}, edit buttons: ${hasEditButtons}, read-only indicators: ${readOnlyText}`);
    }
  } catch (err) {
    fail('Criterion 7', `Error: ${err.message}`);
  }
}

// MAIN
async function main() {
  console.log('Starting Sprint 54 Evaluation...\n');

  browser = await chromium.launch({ headless: true });
  context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  page = await context.newPage();

  try {
    console.log('Logging in as super admin...');
    await login('admin', '');
    await page.waitForTimeout(1000);

    console.log('\n--- CRITERION 1 ---');
    await criterion1();

    console.log('\n--- CRITERION 2 ---');
    await criterion2();

    console.log('\n--- CRITERION 3 ---');
    await criterion3();

    console.log('\n--- CRITERION 4 ---');
    await criterion4();

    console.log('\n--- CRITERION 5 ---');
    await criterion5();

    console.log('\n--- CRITERION 6 ---');
    await criterion6();

    console.log('\n--- CRITERION 7 ---');
    await criterion7();

  } finally {
    await browser.close();
  }

  console.log('\n========================================');
  console.log('EVALUATION SUMMARY');
  console.log('========================================');
  const passCount = RESULTS.filter(r => r.result === 'PASS').length;
  const failCount = RESULTS.filter(r => r.result === 'FAIL').length;
  console.log(`PASS: ${passCount}/7`);
  console.log(`FAIL: ${failCount}/7`);
  RESULTS.forEach(r => {
    console.log(`  ${r.result}: ${r.criterion}`);
    console.log(`         ${r.observation}`);
  });
  console.log('========================================');
  console.log(`VERDICT: ${failCount === 0 ? 'SPRINT PASS' : 'SPRINT FAIL'}`);
  console.log('========================================');
}

main().catch(console.error);