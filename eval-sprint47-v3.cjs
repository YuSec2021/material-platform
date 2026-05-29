const { chromium } = require('@playwright/test');

const BASE = 'http://localhost:5173';
const errors = [];

function log(msg) { console.log(`[EVAL] ${msg}`); }

async function run() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);

  try {
    // Step 1: Login - this is a demo login, just use the username input
    log('1. Logging in as super_admin...');
    await page.goto(`${BASE}/login`);
    await page.waitForLoadState('domcontentloaded', { timeout: 10000 });
    await page.waitForTimeout(2000);
    
    // Find username and password fields - use placeholder text
    const usernameInput = await page.$('input[placeholder="super_admin"], input[placeholder*="账号"]');
    const passwordInput = await page.$('input[placeholder*="演示"], input[placeholder*="密码"], input[type="password"]');
    
    log(`Found inputs: username=${!!usernameInput}, password=${!!passwordInput}`);
    
    if (usernameInput) {
      await usernameInput.fill('super_admin');
    }
    if (passwordInput) {
      // Demo account needs no password
      await passwordInput.fill('');
    }
    
    // Click login button
    const loginBtn = await page.$('button[type="submit"], button:has-text("登录")');
    if (loginBtn) {
      await loginBtn.click();
      await page.waitForTimeout(3000);
    }
    
    log(`After login, URL: ${page.url()}`);
    const homeText = await page.evaluate(() => document.body.innerText.substring(0, 500));
    log(`Home text: ${homeText.substring(0, 300)}`);

    // Check sidebar/nav for available routes
    log('2. Checking navigation...');
    const navText = await page.evaluate(() => {
      const sidebar = document.querySelector('[class*="sidebar"], [class*="nav"], [class*="menu"], aside, nav');
      return sidebar ? sidebar.innerText.substring(0, 1000) : document.body.innerText.substring(0, 2000);
    });
    log(`Nav text: ${navText.substring(0, 1000)}`);
    
    await page.screenshot({ path: '/tmp/sprint47-home.png', fullPage: false });

    // Find available routes - click through nav items
    log('3. Finding available routes...');
    
    // Try different category management routes
    const routes = [
      '/standard/category',
      '/standard/categories',
      '/categories',
      '/category',
      '/materials/categories',
      '/standard',
    ];
    
    for (const route of routes) {
      await page.goto(`${BASE}${route}`);
      await page.waitForLoadState('domcontentloaded', { timeout: 5000 });
      await page.waitForTimeout(2000);
      
      const text = await page.evaluate(() => document.body.innerText.substring(0, 500));
      const is404 = text.includes('404') || text.includes('Not Found');
      log(`${route}: ${is404 ? '404' : 'OK'} - ${text.substring(0, 100)}`);
      
      if (!is404) {
        await page.screenshot({ path: `/tmp/sprint47-route-${route.replace(/\//g, '_')}.png`, fullPage: false });
      }
    }

    // Also check the materials page
    log('4. Checking materials page...');
    await page.goto(`${BASE}/materials`);
    await page.waitForTimeout(2000);
    const matText = await page.evaluate(() => document.body.innerText.substring(0, 500));
    log(`Materials page: ${matText.substring(0, 300)}`);

  } catch (err) {
    log(`ERROR: ${err.message}`);
    errors.push(err.message);
  } finally {
    await browser.close();
  }

  for (const e of errors) {
    log(`ERROR: ${e}`);
  }
}

run().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
