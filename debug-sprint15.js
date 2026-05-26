const { chromium } = require('playwright');

const BASE = 'http://localhost:5173';

async function run() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  console.log('=== DEBUG: Attribute Page ===');

  // Login
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle', timeout: 15000 });
  await page.waitForTimeout(1000);

  // Check what inputs exist
  const inputs = await page.locator('input').all();
  console.log(`Inputs on login page: ${inputs.length}`);
  for (const inp of inputs) {
    const type = await inp.getAttribute('type');
    const placeholder = await inp.getAttribute('placeholder');
    console.log(`  input type="${type}" placeholder="${placeholder}"`);
  }

  if (inputs.length >= 2) {
    await inputs[0].fill('super_admin');
    await inputs[1].fill('admin123');
    await page.click('button[type="submit"]');
    await page.waitForTimeout(2000);
  }

  // Check if we're on login or not
  const currentUrl = page.url();
  console.log(`After login attempt URL: ${currentUrl}`);

  if (currentUrl.includes('/login')) {
    console.log('Still on login page - checking for auth issues');
    const errorMsg = await page.locator('[class*="error"], [class*="red"]').textContent().catch(() => 'no error');
    console.log(`Error: ${errorMsg}`);
    await browser.close();
    return;
  }

  console.log('Logged in successfully');

  // Navigate directly to attribute page
  await page.goto(`${BASE}/standard/attribute`, { waitUntil: 'networkidle', timeout: 15000 });
  await page.waitForTimeout(2000);

  console.log(`Current URL: ${page.url()}`);

  const h1Elements = await page.locator('h1').all();
  for (const h1 of h1Elements) {
    const text = await h1.textContent();
    console.log(`H1: "${text}"`);
  }

  const h2Elements = await page.locator('h2').all();
  for (const h2 of h2Elements) {
    const text = await h2.textContent();
    console.log(`H2: "${text}"`);
  }

  // Check for create button
  const createBtn = page.locator('button:has-text("新增属性")').first();
  const btnVisible = await createBtn.isVisible({ timeout: 3000 }).catch(() => false);
  const btnEnabled = await createBtn.isEnabled({ timeout: 3000 }).catch(() => false);
  console.log(`Create button visible=${btnVisible}, enabled=${btnEnabled}`);

  if (btnVisible && btnEnabled) {
    const box = await createBtn.boundingBox();
    console.log(`Button bounding box: ${JSON.stringify(box)}`);

    // Force click
    await createBtn.click({ force: true });
    console.log('Clicked (force)');
    await page.waitForTimeout(2000);

    // Check body text
    const bodyText = await page.textContent('body');
    const hasNewAttr = bodyText.includes('新增属性') || bodyText.includes('新增属性');
    const hasModalH2 = bodyText.includes('新增属性');
    console.log(`Body contains "新增属性": ${bodyText.includes('新增属性')}`);
    console.log(`Body (500 chars): ${bodyText.substring(0, 500)}`);
  }

  await page.screenshot({ path: '/tmp/attr-page.png', fullPage: false });
  console.log('Screenshot: /tmp/attr-page.png');

  await browser.close();
}

run().catch(e => {
  console.error('Fatal error:', e);
  process.exit(1);
});
