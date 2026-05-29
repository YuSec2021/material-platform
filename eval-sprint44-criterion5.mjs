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

  console.log('=== Criterion 5: Full Browser Flow (with seeded Qdrant) ===');

  // Login
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle', timeout: 15000 });
  await page.waitForTimeout(1000);
  const loginInput = page.locator('input[name="username"]').first();
  const passwordInput = page.locator('input[name="password"]').first();
  const loginBtn = page.locator('button[type="submit"]').first();
  await loginInput.fill('super_admin');
  await passwordInput.fill('super_admin');
  await loginBtn.click();
  await page.waitForURL(url => !url.toString().includes('/login'), { timeout: 10000 });
  console.log('Logged in');

  // Navigate to material list
  await page.goto(`${BASE}/material/list`, { waitUntil: 'networkidle', timeout: 15000 });
  await page.waitForTimeout(1000);

  // Click Eval44 MatLib in sidebar
  const eval44Btn = page.locator('button:has-text("Eval44 MatLib")').first();
  await eval44Btn.waitFor({ timeout: 5000 });
  await eval44Btn.click();
  await page.waitForTimeout(500);
  console.log('Selected Eval44 MatLib');

  // Open create form
  const createBtn = page.locator('button:has-text("新增物料")').first();
  await createBtn.waitFor({ timeout: 10000 });
  await createBtn.click();
  await page.waitForTimeout(2000);
  console.log('Create form opened');

  // Enter material details
  const nameInput = page.locator('input[type="text"]').first();
  await nameInput.waitFor({ timeout: 5000 });
  await nameInput.fill('A4复印纸');
  await page.waitForTimeout(500);

  // Check AI button is enabled
  const aiBtn = page.locator('button:has-text("智能匹配"), button:has-text("AI智能")').first();
  const aiEnabled = await aiBtn.isEnabled();
  console.log('AI matching button enabled: ' + aiEnabled);

  // Click AI matching
  await aiBtn.click();
  console.log('Clicked AI matching button');
  await page.waitForTimeout(4000);

  // Check for loading then results
  const bodyText = await page.locator('body').textContent();

  // Check for result chips with category paths
  const chips = page.locator('button:has-text("办公用品"), button:has-text("复印纸"), button:has-text("普通复印纸")');
  const chipCount = await chips.count();
  console.log('Category chips found: ' + chipCount);

  // Check for confidence percentages
  const hasConfidence = bodyText.includes('%') && (bodyText.includes('48') || bodyText.includes('47') || bodyText.includes('18'));
  console.log('Confidence percentages visible: ' + hasConfidence);

  // Check top result is selected
  const selectedChip = page.locator('button[class*="border-blue-500"][class*="bg-white"]').first();
  const selectedChipVisible = await selectedChip.isVisible({ timeout: 2000 }).catch(() => false);
  console.log('Top result selected by default: ' + selectedChipVisible);

  // Select a different chip
  if (chipCount > 1) {
    const secondChip = chips.nth(1);
    await secondChip.click();
    await page.waitForTimeout(500);
    console.log('Clicked second chip');
  }

  // Check that category select is updated
  const catSelect = page.locator('select').first();
  const selectedCatValue = await catSelect.inputValue();
  console.log('Category select value after chip selection: ' + selectedCatValue);

  await page.screenshot({ path: '/Users/yusec/projects/material_retrieval/eval-sprint44-criterion5-final.png', fullPage: false });
  console.log('Screenshot: eval-sprint44-criterion5-final.png');

  // Console errors
  if (errors.length > 0) {
    console.log('\nConsole errors:');
    errors.forEach(e => console.log('  ERROR: ' + e));
  }

  await browser.close();
  console.log('\n=== Criterion 5 test complete ===');
}

run().catch(err => {
  console.error('Playwright test failed:', err);
  process.exit(1);
});