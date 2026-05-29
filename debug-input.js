const { chromium } = require('playwright');

const BASE = 'http://localhost:5173';

async function run() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  // Login
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle', timeout: 15000 });
  await page.waitForTimeout(1000);
  const inputs = await page.locator('input').all();
  await inputs[0].fill('super_admin');
  await inputs[1].fill('admin123');
  await page.click('button[type="submit"]');
  await page.waitForTimeout(2000);

  // Navigate to attribute page
  await page.goto(`${BASE}/standard/attribute`, { waitUntil: 'networkidle', timeout: 15000 });
  await page.waitForTimeout(2000);

  // Click create
  const createBtn = page.locator('button:has-text("新增属性")').first();
  await createBtn.click({ force: true });
  await page.waitForTimeout(1000);

  // Check modal
  const modalVisible = await page.locator('h3:has-text("新增属性")').isVisible();
  console.log(`Modal visible: ${modalVisible}`);

  // Debug: list all inputs in the fixed overlay
  const fixedDiv = page.locator('[class*="fixed"][class*="inset-0"]');
  const fixedExists = await fixedDiv.count();
  console.log(`Fixed overlay elements: ${fixedExists}`);

  // Try to get all text inputs inside the fixed overlay
  const overlayInputs = await fixedDiv.locator('input').all();
  console.log(`Inputs inside overlay: ${overlayInputs.length}`);
  for (let i = 0; i < overlayInputs.length; i++) {
    const inp = overlayInputs[i];
    const type = await inp.getAttribute('type');
    const placeholder = await inp.getAttribute('placeholder');
    const visible = await inp.isVisible();
    console.log(`  Input ${i}: type=${type}, placeholder="${placeholder}", visible=${visible}`);
  }

  // Check if maybe inputs are in a nested div
  const overlayDivs = await fixedDiv.locator('div').all();
  console.log(`Divs inside overlay: ${overlayDivs.length}`);

  // Try a different approach: use the div structure
  // The modal body div has class "p-6 overflow-y-auto flex-1"
  const modalBody = page.locator('[class*="fixed"][class*="inset-0"] div[class*="flex-1"]');
  const bodyExists = await modalBody.count();
  console.log(`Modal body divs: ${bodyExists}`);

  const bodyInputs = await modalBody.locator('input').all();
  console.log(`Inputs in modal body: ${bodyInputs.length}`);
  for (let i = 0; i < bodyInputs.length; i++) {
    const inp = bodyInputs[i];
    const type = await inp.getAttribute('type');
    const placeholder = await inp.getAttribute('placeholder');
    console.log(`  Body input ${i}: type=${type}, placeholder="${placeholder}"`);
  }

  // Try to find inputs by the label text
  const labelInputs = await page.locator('label:has-text("属性名称") input').all();
  console.log(`Inputs under "属性名称" label: ${labelInputs.length}`);

  const labelInputs2 = await page.locator('label:has-text("属性类型") + select, select').all();
  console.log(`Selects: ${labelInputs2.length}`);

  // Try evaluate to get the modal DOM structure
  const modalHTML = await page.locator('[class*="fixed"][class*="inset-0"]').first().evaluate(el => el.innerHTML.substring(0, 2000));
  console.log(`Modal innerHTML (first 2000):\n${modalHTML}`);

  await browser.close();
}

run().catch(e => {
  console.error('Fatal error:', e);
  process.exit(1);
});
