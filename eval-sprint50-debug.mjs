import { chromium } from 'playwright';

const BASE = 'http://localhost:5173';
const BACKEND = 'http://localhost:8000';

async function run() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 }
  });
  const page = await context.newPage();

  console.log('=== Sprint 50 Browser Evaluation ===\n');

  // Collect console errors
  const errors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') errors.push(msg.text());
  });

  // Login
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await page.waitForTimeout(5000);
  try {
    const inputs = await page.$$('input');
    if (inputs.length >= 2) {
      await inputs[0].fill('admin');
      await inputs[1].fill('admin');
      await page.click('button[type="submit"]');
      await page.waitForTimeout(5000);
    }
  } catch (e) {
    console.log('Login form interaction: ' + e.message);
  }

  console.log('Current URL:', page.url());

  // Check sidebar
  const sidebarText = await page.evaluate(() => {
    const sidebar = document.querySelector('aside, nav, [class*="sidebar"], [class*="side"]');
    return sidebar ? sidebar.innerText : 'No sidebar found';
  });
  console.log('Sidebar text (first 500):', sidebarText.substring(0, 500));

  // Navigate to category management via sidebar
  try {
    // Try to find and click the category management link
    const categoryLink = await page.$('a[href*="category"], [href*="standard"]');
    if (categoryLink) {
      await categoryLink.click();
      await page.waitForTimeout(3000);
    }
  } catch (e) {}

  console.log('\nCurrent URL after nav:', page.url());

  // Get ALL visible text
  const bodyText = await page.evaluate(() => document.body.innerText);
  console.log('\nVisible body text (first 1000 chars):', bodyText.substring(0, 1000));

  // Check what buttons exist
  const allButtons = await page.$$('button');
  console.log(`\nTotal buttons found: ${allButtons.length}`);
  for (const btn of allButtons.slice(0, 20)) {
    try {
      const text = (await btn.innerText()).trim();
      const visible = await btn.isVisible();
      if (text) {
        console.log(`  Button: "${text}" (visible: ${visible})`);
      }
    } catch (e) {}
  }

  // Check for import-related text anywhere
  console.log('\nImport-related text search:');
  console.log(`  "批量": ${bodyText.includes('批量')}`);
  console.log(`  "CSV": ${bodyText.includes('CSV')}`);
  console.log(`  "导入": ${bodyText.includes('导入')}`);
  console.log(`  "AI": ${bodyText.includes('AI')}`);
  console.log(`  "一键": ${bodyText.includes('一键')}`);

  // Console errors
  console.log(`\nConsole errors: ${errors.length}`);
  errors.slice(0, 5).forEach(e => console.log(`  - ${e.substring(0, 200)}`));

  await browser.close();
}

run().catch(e => {
  console.error('Fatal error:', e.message);
  process.exit(1);
});