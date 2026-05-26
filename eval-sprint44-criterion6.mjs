import { chromium } from '/Users/yusec/projects/material_retrieval/node_modules/playwright/index.mjs';

const BASE = 'http://localhost:5173';

async function run() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  console.log('=== Criterion 6: UI State Handling ===');

  // Login
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle', timeout: 15000 });
  await page.waitForTimeout(1000);

  const loginInput = page.locator('input[name="username"]').first();
  const passwordInput = page.locator('input[name="password"]').first();
  const loginBtn = page.locator('button[type="submit"]').first();

  await loginInput.waitFor({ timeout: 10000 });
  await passwordInput.waitFor({ timeout: 5000 });
  await loginBtn.waitFor({ timeout: 5000 });

  await loginInput.fill('super_admin');
  await passwordInput.fill('super_admin');
  await loginBtn.click();
  await page.waitForURL(url => !url.toString().includes('/login'), { timeout: 10000 });
  console.log('Logged in');

  // Navigate to material list
  await page.goto(`${BASE}/material/list`, { waitUntil: 'networkidle', timeout: 15000 });
  await page.waitForTimeout(1000);

  // === Step 2: No linked category library ===
  console.log('\n--- Step 2: No-library state ---');
  // Create a material library with no linked category library
  const newLibRes = await fetch('http://localhost:8000/api/v1/material-libraries', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-User-Role': 'super_admin' },
    body: JSON.stringify({ name: 'Eval44 NoCatLib ' + Date.now(), enabled: true })
  });
  const noCatLib = await newLibRes.json();
  console.log('Created no-cat-lib: id=' + noCatLib.id + ' name="' + noCatLib.name + '"');

  // Find and click the no-cat library in sidebar
  const noCatLibBtn = page.locator(`button:has-text("${noCatLib.name}")`).first();
  const noCatVisible = await noCatLibBtn.isVisible({ timeout: 3000 }).catch(() => false);
  if (noCatVisible) {
    await noCatLibBtn.click();
    await page.waitForTimeout(500);
    console.log('Selected no-cat-lib in sidebar');
  }

  const createBtn = page.locator('button:has-text("新增物料")').first();
  await createBtn.waitFor({ timeout: 10000 });
  await createBtn.click();
  await page.waitForTimeout(2000);
  console.log('Opened create form with no-category library');

  // Check if AI section is hidden
  const aiSection = page.locator('section:has-text("AI")').first();
  const aiVisible = await aiSection.isVisible({ timeout: 3000 }).catch(() => false);
  console.log('AI section visible (should be false): ' + aiVisible);

  // Check that normal category select still works
  const catSelect = page.locator('select').first();
  const catSelectVisible = await catSelect.isVisible({ timeout: 2000 }).catch(() => false);
  console.log('Normal category select visible (should be true): ' + catSelectVisible);

  await page.screenshot({ path: '/Users/yusec/projects/material_retrieval/eval-sprint44-criterion6-nolib.png', fullPage: false });
  console.log('Screenshot saved: eval-sprint44-criterion6-nolib.png');

  // Close form
  const closeBtn = page.locator('button:has-text("取消")').first();
  await closeBtn.click();
  await page.waitForTimeout(500);

  // === Step 3: Empty result state ===
  console.log('\n--- Step 3: Empty result state ---');
  const eval44Btn = page.locator('button:has-text("Eval44 MatLib")').first();
  const eval44Visible = await eval44Btn.isVisible({ timeout: 3000 }).catch(() => false);
  if (eval44Visible) {
    await eval44Btn.click();
    await page.waitForTimeout(500);
  } else {
    // Scroll sidebar
    const sidebar = page.locator('nav, [class*="sidebar"], [class*="Side"]').first();
    if (await sidebar.isVisible({ timeout: 2000 }).catch(() => false)) {
      await sidebar.evaluate(el => el.scrollTop = 99999);
      await page.waitForTimeout(500);
    }
    if (await eval44Btn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await eval44Btn.click();
      await page.waitForTimeout(500);
    }
  }

  await page.locator('button:has-text("新增物料")').first().click();
  await page.waitForTimeout(2000);

  const nameInput = page.locator('input[type="text"]').first();
  await nameInput.waitFor({ timeout: 5000 });
  await nameInput.fill('XYZfoobarxyz9999nonexistent');
  await page.waitForTimeout(500);

  const aiBtn = page.locator('button:has-text("智能匹配"), button:has-text("AI智能")').first();
  await aiBtn.click();
  console.log('Clicked AI with unmatched query');
  await page.waitForTimeout(4000);

  // Check for empty result message
  const bodyText = await page.locator('body').textContent();
  const hasEmpty = bodyText.includes('未找到匹配') || bodyText.includes('暂无匹配') || bodyText.includes('empty') || bodyText.includes('Empty');
  console.log('Empty result message visible: ' + hasEmpty);

  // Check chips are cleared
  const chips = page.locator('button[class*="border-blue"]');
  const chipCount = await chips.count();
  console.log('Stale chips visible: ' + chipCount);

  await page.screenshot({ path: '/Users/yusec/projects/material_retrieval/eval-sprint44-criterion6-empty.png', fullPage: false });
  console.log('Screenshot saved: eval-sprint44-criterion6-empty.png');

  // Close form
  const closeBtn2 = page.locator('button:has-text("取消")').first();
  await closeBtn2.click();
  await page.waitForTimeout(500);

  // === Step 4: Error state (via route interception) ===
  console.log('\n--- Step 4: Error state ---');
  const eval44Btn2 = page.locator('button:has-text("Eval44 MatLib")').first();
  const eval44Visible2 = await eval44Btn2.isVisible({ timeout: 3000 }).catch(() => false);
  if (eval44Visible2) {
    await eval44Btn2.click();
    await page.waitForTimeout(500);
  }

  await page.locator('button:has-text("新增物料")').first().click();
  await page.waitForTimeout(2000);

  const nameInput2 = page.locator('input[type="text"]').first();
  await nameInput2.waitFor({ timeout: 5000 });
  await nameInput2.fill('TestMaterial');
  await page.waitForTimeout(500);

  // Intercept the match endpoint to return 500
  await page.route('**/api/v1/ai/material-category-match', route => {
    route.fulfill({ status: 500, body: JSON.stringify({ detail: 'Internal server error' }) });
  });

  const aiBtn2 = page.locator('button:has-text("智能匹配"), button:has-text("AI智能")').first();
  await aiBtn2.click();
  console.log('Clicked AI with error interception');
  await page.waitForTimeout(3000);

  // Check for error message in body text
  const bodyTextAfterError = await page.locator('body').textContent();
  const hasError = bodyTextAfterError.includes('失败') || bodyTextAfterError.includes('错误') || bodyTextAfterError.includes('Error') || bodyTextAfterError.includes('error');
  console.log('Error message visible: ' + hasError);

  // Check category select still usable
  const catSelect2 = page.locator('select').first();
  const catSelect2Visible = await catSelect2.isVisible({ timeout: 2000 }).catch(() => false);
  console.log('Category select still usable: ' + catSelect2Visible);

  await page.screenshot({ path: '/Users/yusec/projects/material_retrieval/eval-sprint44-criterion6-error.png', fullPage: false });
  console.log('Screenshot saved: eval-sprint44-criterion6-error.png');

  // Close form
  const closeBtn3 = page.locator('button:has-text("取消")').first();
  await closeBtn3.click();
  await page.waitForTimeout(500);

  // === Step 5: i18n ===
  console.log('\n--- Step 5: i18n ---');
  await page.goto(`${BASE}/material/list`, { waitUntil: 'networkidle', timeout: 15000 });
  await page.waitForTimeout(1000);

  // Switch to English
  const enBtn = page.locator('button:has-text("English")').first();
  const enVisible = await enBtn.isVisible({ timeout: 3000 }).catch(() => false);
  console.log('English button visible: ' + enVisible);

  if (enVisible) {
    await enBtn.click();
    await page.waitForTimeout(2000);
    console.log('Switched to English');

    // Open create form with Eval44 MatLib
    const eval44Btn3 = page.locator('button:has-text("Eval44 MatLib")').first();
    const eval44Visible3 = await eval44Btn3.isVisible({ timeout: 3000 }).catch(() => false);
    if (eval44Visible3) {
      await eval44Btn3.click();
      await page.waitForTimeout(500);
    } else {
      const sidebar = page.locator('nav, [class*="sidebar"]').first();
      if (await sidebar.isVisible({ timeout: 2000 }).catch(() => false)) {
        await sidebar.evaluate(el => el.scrollTop = 99999);
        await page.waitForTimeout(500);
      }
      if (await eval44Btn3.isVisible({ timeout: 2000 }).catch(() => false)) {
        await eval44Btn3.click();
        await page.waitForTimeout(500);
      }
    }

    const createBtnEn = page.locator('button:has-text("New Material"), button:has-text("Add Material"), button:has-text("新增物料")').first();
    await createBtnEn.waitFor({ timeout: 10000 });
    await createBtnEn.click();
    await page.waitForTimeout(2000);

    const nameInput3 = page.locator('input[type="text"]').first();
    await nameInput3.waitFor({ timeout: 5000 });
    await nameInput3.fill('Paper');
    await page.waitForTimeout(500);

    // Check for AI button in English mode
    const bodyEn = await page.locator('body').textContent();
    const hasAiBtnEn = bodyEn.includes('AI') || bodyEn.includes('Match');
    console.log('AI button visible in English: ' + hasAiBtnEn);

    // Check i18n text
    const hasEnLabel = bodyEn.includes('Match category') || bodyEn.includes('AI category') || bodyEn.includes('Material category');
    console.log('English label visible: ' + hasEnLabel);

    await page.screenshot({ path: '/Users/yusec/projects/material_retrieval/eval-sprint44-criterion6-i18n.png', fullPage: false });
    console.log('Screenshot saved: eval-sprint44-criterion6-i18n.png');
  } else {
    console.log('Could not find English toggle');
    await page.screenshot({ path: '/Users/yusec/projects/material_retrieval/eval-sprint44-criterion6-i18n.png', fullPage: false });
  }

  await browser.close();
  console.log('\n=== Criterion 6 test complete ===');
}

run().catch(err => {
  console.error('Playwright test failed:', err);
  process.exit(1);
});