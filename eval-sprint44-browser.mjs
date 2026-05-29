import { chromium } from '/Users/yusec/projects/material_retrieval/node_modules/playwright/index.mjs';

const BASE = 'http://localhost:5173';

async function run() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  const errors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') errors.push(msg.text());
  });

  console.log('=== Criterion 5: Browser Flow ===');

  // Login
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle', timeout: 15000 });
  const loginInput = page.locator('input[type="text"], input[name="username"]').first();
  const passwordInput = page.locator('input[type="password"]').first();
  const loginBtn = page.locator('button[type="submit"]').first();
  await loginInput.fill('super_admin');
  await passwordInput.fill('super_admin');
  await loginBtn.click();
  await page.waitForURL(url => !url.toString().includes('/login'), { timeout: 10000 });
  console.log('Logged in');

  // Navigate to material list
  await page.goto(`${BASE}/material/list`, { waitUntil: 'networkidle', timeout: 15000 });
  await page.waitForTimeout(1000);
  console.log('Material list loaded');

  // Step 1: Click on Eval44 MatLib in the library sidebar
  console.log('Step 1: Clicking Eval44 MatLib in sidebar...');
  const eval44LibBtn = page.locator('button:has-text("Eval44 MatLib")').first();
  const libVisible = await eval44LibBtn.isVisible({ timeout: 5000 }).catch(() => false);
  console.log('Eval44 MatLib button visible: ' + libVisible);

  if (libVisible) {
    await eval44LibBtn.click();
    await page.waitForTimeout(1000);
    console.log('Clicked Eval44 MatLib');
  } else {
    // Try to scroll down in the sidebar
    const sidebar = page.locator('[class*="overflow"], [class*="scroll"]').first();
    await sidebar.evaluate(el => el.scrollTop = 99999);
    await page.waitForTimeout(500);
    const libVisibleAfterScroll = await eval44LibBtn.isVisible({ timeout: 3000 }).catch(() => false);
    console.log('Eval44 MatLib button visible after scroll: ' + libVisibleAfterScroll);
    if (libVisibleAfterScroll) {
      await eval44LibBtn.click();
      await page.waitForTimeout(1000);
    }
  }

  // Step 2: Open create form
  console.log('Step 2: Opening create material form...');
  const createBtn = page.locator('button:has-text("新增物料")').first();
  await createBtn.waitFor({ timeout: 10000 });
  await createBtn.click();
  await page.waitForTimeout(2000);
  console.log('Create form opened');

  // Step 3: Enter material name
  console.log('Step 3: Entering material name...');
  const nameInput = page.locator('input[type="text"]').first();
  await nameInput.waitFor({ timeout: 5000 });
  await nameInput.fill('A4复印纸');
  await page.waitForTimeout(500);

  // Step 4: Check for AI matching section
  console.log('Step 4: Checking for AI matching section...');

  // Look for the specific AI section
  const aiSections = await page.locator('section').all();
  console.log('Total sections: ' + aiSections.length);

  for (const sec of aiSections) {
    const text = await sec.textContent().catch(() => '');
    const classes = await sec.getAttribute('class').catch(() => '');
    if (text.includes('AI')) {
      console.log('  AI Section: class="' + classes + '"');
      console.log('  Text: ' + (text || '').substring(0, 200).replace(/\s+/g, ' '));
    }
  }

  const aiSection = page.locator('section:has-text("智能匹配类目"), section:has-text("AI智能"), section:has-text("AI category")').first();
  const aiSectionVisible = await aiSection.isVisible({ timeout: 3000 }).catch(() => false);
  console.log('AI section visible: ' + aiSectionVisible);

  if (aiSectionVisible) {
    await page.screenshot({ path: '/Users/yusec/projects/material_retrieval/eval-sprint44-criterion5.png', fullPage: false });
    console.log('Screenshot saved: eval-sprint44-criterion5.png');

    // Click AI matching button
    const aiBtn = page.locator('button:has-text("智能匹配"), button:has-text("AI智能")').first();
    const aiBtnVisible = await aiBtn.isVisible({ timeout: 3000 }).catch(() => false);
    console.log('AI button visible: ' + aiBtnVisible);

    if (aiBtnVisible) {
      await aiBtn.click();
      console.log('Clicked AI matching button');
      await page.waitForTimeout(4000);

      const chipCount = await page.locator('button:has-text("办公用品"), button:has-text("复印纸"), button:has-text("普通复印纸")').count();
      console.log('Category chips found: ' + chipCount);

      await page.screenshot({ path: '/Users/yusec/projects/material_retrieval/eval-sprint44-criterion5-results.png', fullPage: false });
      console.log('Results screenshot saved');
    }
  } else {
    console.log('AI section NOT visible');
    await page.screenshot({ path: '/Users/yusec/projects/material_retrieval/eval-sprint44-criterion5-no-section.png', fullPage: false });
    console.log('Screenshot saved');

    // Check which library is selected in the form
    const selectedLib = await page.locator('select option[selected], select').first().inputValue().catch(() => 'unknown');
    console.log('Selected library value in form: ' + selectedLib);
  }

  // Console errors
  if (errors.length > 0) {
    console.log('\nConsole errors:');
    errors.forEach(e => console.log('  ERROR: ' + e));
  }

  await browser.close();
  console.log('\n=== Browser test complete ===');
}

run().catch(err => {
  console.error('Playwright test failed:', err);
  process.exit(1);
});