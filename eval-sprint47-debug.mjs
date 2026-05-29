import { chromium } from 'playwright';

const BASE_URL = 'http://localhost:5173';

async function run() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();

  page.on('console', msg => {
    if (msg.type() === 'error') {
      console.log(`[${msg.type()}] ${msg.text()}`);
    }
  });

  // Login
  await page.goto(BASE_URL + '/login', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);
  await page.locator('#username').fill('super_admin');
  await page.locator('#password').fill('');
  await page.locator('button[type="submit"]').click();
  await page.waitForTimeout(3000);

  // Go to materials page and open create form
  await page.goto(BASE_URL + '/materials', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(3000);
  const createBtn = page.locator('button').filter({ hasText: /新建物料|新增物料|新增物品/ }).first();
  if (await createBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await createBtn.click();
    await page.waitForTimeout(4000);
  }

  // Select category 1
  const catSelect = page.locator('select').nth(2);
  await catSelect.selectOption('1');
  await page.waitForTimeout(3000);

  // Get the category properties section HTML
  const propsSection = page.locator('section').filter({ hasText: /类目属性/ }).first();
  const propsHTML = await propsSection.innerHTML();
  console.log('=== Category Properties Section HTML ===');
  console.log(propsHTML.substring(0, 3000));

  // Check what's in the modal (only the form)
  const modalContent = await page.locator('.ant-modal-content').first().innerHTML().catch(() => '');
  console.log('\n=== Modal Content (around 类目属性) ===');
  const idx = modalContent.indexOf('类目属性');
  if (idx >= 0) {
    console.log(modalContent.substring(Math.max(0, idx - 100), idx + 3000));
  } else {
    console.log('类目属性 not found in modal HTML');
  }

  await browser.close();
}

run().catch(e => {
  console.error('Fatal error:', e);
  process.exit(1);
});