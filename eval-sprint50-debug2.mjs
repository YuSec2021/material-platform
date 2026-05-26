import { chromium } from 'playwright';

const BASE = 'http://localhost:5173';

async function run() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 }
  });
  const page = await context.newPage();

  const consoleMessages = [];
  const networkErrors = [];
  page.on('console', msg => consoleMessages.push({ type: msg.type(), text: msg.text() }));
  page.on('response', resp => {
    if (resp.status() >= 400) networkErrors.push(`${resp.status()} ${resp.url()}`);
  });

  console.log('=== Sprint 50 Browser Evaluation ===\n');

  // Login with super_admin
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await page.waitForTimeout(3000);

  try {
    const usernameInput = await page.$('input[type="text"], input[placeholder*="账"], input[placeholder*="用户"]');
    if (usernameInput) {
      await usernameInput.fill('super_admin');
      const loginBtn = await page.$('button[type="submit"]');
      if (loginBtn) {
        await loginBtn.click();
        await page.waitForTimeout(5000);
      }
    }
  } catch (e) {}

  console.log('Current URL:', page.url());

  // Try the standard/categories route
  await page.goto(`${BASE}/standard/categories`, { waitUntil: 'networkidle', timeout: 15000 });
  await page.waitForTimeout(3000);

  console.log('Category page URL:', page.url());

  // Get visible text
  const bodyText = await page.evaluate(() => document.body.innerText);
  console.log('\nBody text (first 500 chars):\n', bodyText.substring(0, 500));

  // Check for error boundary
  const errorBoundary = await page.$('[class*="error"], [class*="Error"]');
  if (errorBoundary) {
    const errorText = await errorBoundary.innerText();
    console.log('\nError boundary content:', errorText.substring(0, 200));
  }

  // Check all elements
  const allButtons = await page.$$('button');
  const allLinks = await page.$$('a');
  console.log(`\nButtons: ${allButtons.length}, Links: ${allLinks.length}`);

  // Try sidebar navigation
  const sidebarLinks = await page.$$('aside a, nav a, [class*="sidebar"] a');
  console.log(`Sidebar links: ${sidebarLinks.length}`);
  for (const link of sidebarLinks) {
    try {
      const text = await link.innerText();
      const href = await link.getAttribute('href');
      if (text) console.log(`  Link: "${text}" -> ${href}`);
    } catch (e) {}
  }

  // Console and network errors
  console.log(`\nConsole messages (${consoleMessages.length}):`);
  consoleMessages.forEach(m => {
    if (m.type === 'error' || m.type === 'warning') {
      console.log(`  [${m.type}] ${m.text.substring(0, 200)}`);
    }
  });
  console.log(`\nNetwork errors (${networkErrors.length}):`);
  networkErrors.forEach(e => console.log(`  ${e}`));

  // Check if sidebar has any category links
  const catLink = await page.$('a[href*="category"], a[href*="standard"]');
  if (catLink) {
    const href = await catLink.getAttribute('href');
    console.log(`\nCategory link found: ${href}`);
  }

  await browser.close();
}

run().catch(e => {
  console.error('Fatal error:', e.message);
  process.exit(1);
});