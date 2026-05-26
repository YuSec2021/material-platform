import { chromium } from '/Users/yusec/projects/material_retrieval/node_modules/playwright/index.mjs';

const BASE = 'http://localhost:5173';

async function run() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  console.log('=== Debug: Material List Page ===');
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle', timeout: 15000 });

  const loginInput = page.locator('input[type="text"], input[name="username"], input[placeholder*="用户"]').first();
  const passwordInput = page.locator('input[type="password"]').first();
  const loginBtn = page.locator('button[type="submit"]').first();

  await loginInput.fill('super_admin');
  await passwordInput.fill('super_admin');
  await loginBtn.click();
  await page.waitForURL(url => !url.toString().includes('/login'), { timeout: 10000 });
  console.log('Logged in');

  await page.goto(`${BASE}/material/list`, { waitUntil: 'networkidle', timeout: 15000 });
  await page.waitForTimeout(2000);

  // Screenshot to see what's there
  await page.screenshot({ path: '/Users/yusec/projects/material_retrieval/eval-sprint44-material-list.png', fullPage: true });
  console.log('Screenshot saved');

  // Get all buttons on the page
  const buttons = await page.locator('button').all();
  console.log('Buttons found on page: ' + buttons.length);
  for (const btn of buttons) {
    const text = await btn.textContent().catch(() => '');
    const cls = await btn.getAttribute('class').catch(() => '');
    console.log('  Button: "' + text.trim() + '" class="' + cls + '"');
  }

  // Get all links
  const links = await page.locator('a').all();
  console.log('Links found: ' + links.length);
  for (const link of links) {
    const text = await link.textContent().catch(() => '');
    const href = await link.getAttribute('href').catch(() => '');
    console.log('  Link: "' + text.trim() + '" href="' + href + '"');
  }

  await browser.close();
}

run().catch(err => {
  console.error('Failed:', err);
  process.exit(1);
});