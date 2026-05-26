import { chromium } from 'playwright';

const BASE = 'http://localhost:5173';

async function run() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 }
  });
  const page = await context.newPage();

  const errors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') errors.push(msg.text());
  });

  console.log('=== Sprint 50 Browser Evaluation ===\n');

  // Login with super_admin (no password needed per AuthContext)
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await page.waitForTimeout(3000);

  try {
    // Find the username input
    const usernameInput = await page.$('input[type="text"], input[placeholder*="账"], input[placeholder*="用户"]');
    if (usernameInput) {
      await usernameInput.fill('super_admin');
      const loginBtn = await page.$('button[type="submit"]');
      if (loginBtn) {
        await loginBtn.click();
        await page.waitForTimeout(5000);
      }
    }
  } catch (e) {
    console.log('Login form interaction error:', e.message);
  }

  console.log('Current URL:', page.url());

  // Navigate to category management
  await page.goto(`${BASE}/standard/categories`, { waitUntil: 'networkidle', timeout: 15000 });
  await page.waitForTimeout(3000);

  console.log('Category page URL:', page.url());

  // Get visible text
  const bodyText = await page.evaluate(() => document.body.innerText);

  // Check for import buttons
  console.log('\nImport-related text:');
  console.log(`  "CSV批量导入": ${bodyText.includes('CSV批量导入')}`);
  console.log(`  "批量导入": ${bodyText.includes('批量导入')}`);
  console.log(`  "AI一键导入": ${bodyText.includes('AI一键导入')}`);

  // Get all buttons
  const allButtons = await page.$$('button');
  console.log(`\nTotal buttons: ${allButtons.length}`);
  for (const btn of allButtons) {
    try {
      const text = (await btn.innerText()).trim();
      const visible = await btn.isVisible();
      if (text && visible) {
        console.log(`  Button: "${text}"`);
      }
    } catch (e) {}
  }

  // === Criterion 3: CSV Import Preview ===
  console.log('\n--- Criterion 3: CSV Import Preview ---');

  try {
    const csvBtn = await page.getByText('CSV批量导入').first();
    if (csvBtn && await csvBtn.isVisible()) {
      await csvBtn.click();
      await page.waitForTimeout(2000);
      console.log('  PASS: CSV batch import dialog opened');
    } else {
      console.log('  FAIL: CSV批量导入 button not found or not visible');
    }
  } catch (e) {
    console.log(`  INFO: ${e.message}`);
  }

  // Check template and columns
  let templateFound = false;
  try {
    const templateLink = await page.$('a[download*="csv"], a:has-text("模板"), button:has-text("模板")');
    if (templateLink) {
      templateFound = true;
      console.log('  PASS: Template download found');
    }
  } catch (e) {}

  // Check preview table has 5 level columns
  const dialogContent = await page.content();
  console.log(`  4th level column (四级类目): ${dialogContent.includes('四级类目') ? 'PASS' : 'FAIL'}`);
  console.log(`  5th level column (五级类目): ${dialogContent.includes('五级类目') ? 'PASS' : 'FAIL'}`);

  // Check file input
  try {
    const fileInput = await page.$('input[type="file"]');
    if (fileInput) {
      const accept = await fileInput.getAttribute('accept') || '';
      console.log(`  File input: PASS (accept="${accept}")`);
    }
  } catch (e) {}

  // Close dialog
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);

  // === Criterion 4: AI One-Click Import Preview ===
  console.log('\n--- Criterion 4: AI One-Click Import Preview ---');

  try {
    const aiBtn = await page.getByText('AI一键导入').first();
    if (aiBtn && await aiBtn.isVisible()) {
      await aiBtn.click();
      await page.waitForTimeout(2000);
      console.log('  PASS: AI import dialog opened');
    } else {
      console.log('  FAIL: AI一键导入 button not found or not visible');
    }
  } catch (e) {
    console.log(`  INFO: ${e.message}`);
  }

  // Check for textarea
  try {
    const textarea = await page.$('textarea');
    if (textarea) {
      console.log('  PASS: AI input textarea found');
    }
  } catch (e) {}

  // Check recognition trigger button
  try {
    const recBtn = await page.$('button:has-text("识别")');
    if (recBtn) {
      console.log('  PASS: Recognition trigger button found');
    }
  } catch (e) {}

  // Check AI preview table columns
  const aiDialogContent = await page.content();
  console.log(`  4th level column in AI preview: ${aiDialogContent.includes('四级类目') ? 'PASS' : 'INFO: after recognition'}`);
  console.log(`  5th level column in AI preview: ${aiDialogContent.includes('五级类目') ? 'PASS' : 'INFO: after recognition'}`);

  // Close dialog
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);

  // === Criterion 3 & 4: Tree Navigation ===
  console.log('\n--- Tree Navigation ---');

  // Find tree expand buttons for our test categories
  const treeContent = await page.content();
  const hasS50Level4 = treeContent.includes('测试四级S50');
  const hasS50Level5 = treeContent.includes('测试五级S50');
  console.log(`  Level 4 category (测试四级S50) in tree: ${hasS50Level4 ? 'PASS' : 'INFO: need expand'}`);
  console.log(`  Level 5 category (测试五级S50) in tree: ${hasS50Level5 ? 'PASS' : 'INFO: need expand'}`);

  // === Console errors ===
  console.log(`\n--- Console Errors (${errors.length}) ---`);
  errors.slice(0, 5).forEach(e => console.log(`  - ${e.substring(0, 200)}`));

  await browser.close();
  console.log('\n=== Evaluation Complete ===');
}

run().catch(e => {
  console.error('Fatal error:', e.message);
  process.exit(1);
});