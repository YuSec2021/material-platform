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
    // Step 1: Login as super_admin
    log('1. Logging in as super_admin...');
    await page.goto(`${BASE}/login`);
    await page.waitForLoadState('domcontentloaded', { timeout: 10000 });
    await page.waitForTimeout(3000);
    
    // Check if already logged in or redirected
    const url1 = page.url();
    log(`URL after load: ${url1}`);
    
    // Check page content for login form
    const pageText1 = await page.evaluate(() => document.body.innerText.substring(0, 1000));
    log(`Login page text: ${pageText1.substring(0, 500)}`);
    
    // Try to find login form
    const emailInput = await page.$('input[type="email"], input[name="email"], input[placeholder*="邮箱"], input[placeholder*="用户"]');
    const passwordInput = await page.$('input[type="password"]');
    
    if (emailInput && passwordInput) {
      log('Found login form');
      await emailInput.fill('super_admin');
      await passwordInput.fill('admin123');
      const submitBtn = await page.$('button[type="submit"]');
      if (submitBtn) await submitBtn.click();
      await page.waitForTimeout(3000);
    } else if (url1.includes('login')) {
      log('Still on login page but no form found');
      // Try any input fields
      const inputs = await page.$$('input');
      log(`Found ${inputs.length} input fields`);
      for (const inp of inputs) {
        const placeholder = await inp.getAttribute('placeholder');
        const type = await inp.getAttribute('type');
        log(`  Input: type=${type} placeholder=${placeholder}`);
      }
    } else {
      log(`Already logged in (not on login page): ${url1}`);
    }

    // Step 2: Navigate to category management
    log('2. Navigating to category management...');
    await page.goto(`${BASE}/standard/categories`);
    await page.waitForLoadState('domcontentloaded', { timeout: 10000 });
    await page.waitForTimeout(3000);
    
    const catUrl = page.url();
    log(`Category URL: ${catUrl}`);
    
    // Get all text on page
    const catText = await page.evaluate(() => document.body.innerText.substring(0, 5000));
    log(`Category page text: ${catText.substring(0, 3000)}`);
    
    // Check for tree elements
    const treeElements = await page.$$('.ant-tree, [role="tree"], [class*="tree"], .ant-tree-list');
    log(`Found ${treeElements.length} tree elements`);
    
    // Check for category properties panel
    const hasPanel = catText.includes('类目属性');
    const hasInherited = catText.includes('继承属性');
    const hasOwn = catText.includes('自有属性');
    log(`=== C1 Results ===`);
    log(`Has '类目属性': ${hasPanel}`);
    log(`Has '继承属性': ${hasInherited}`);
    log(`Has '自有属性': ${hasOwn}`);
    
    await page.screenshot({ path: '/tmp/sprint47-cat-page.png', fullPage: false });
    log('Screenshot: /tmp/sprint47-cat-page.png');

    // Step 3: Click on 打印设备 or expand tree
    log('3. Finding category tree nodes...');
    const treeNodes = await page.$$('.ant-tree-node-content-wrapper, .ant-tree-treenode, .ant-tree-list-holder-inner');
    log(`Found ${treeNodes.length} tree node elements`);
    
    for (let i = 0; i < Math.min(treeNodes.length, 10); i++) {
      const txt = await treeNodes[i].innerText();
      log(`  Tree node ${i}: ${txt.substring(0, 50)}`);
    }
    
    // Click first tree node to expand
    if (treeNodes.length > 0) {
      await treeNodes[0].click();
      await page.waitForTimeout(2000);
    }
    
    // Get updated page text
    const catText2 = await page.evaluate(() => document.body.innerText.substring(0, 5000));
    
    // Look for 办公设备 in the updated text
    const hasBW = catText2.includes('办公设备');
    const hasDYJ = catText2.includes('打印机');
    log(`After click: has 办公设备: ${hasBW}, has 打印机: ${hasDYJ}`);
    log(`Text: ${catText2.substring(0, 2000)}`);
    
    // Click on 办公设备 if found in text
    if (hasBW) {
      try {
        const bwLocator = page.getByText('办公设备', { exact: false }).first();
        await bwLocator.click();
        await page.waitForTimeout(2000);
      } catch(e) {
        log(`Click 办公设备 failed: ${e.message}`);
      }
    }

    // Step 4: Check panel content
    log('4. Checking panel after selection...');
    const panelText = await page.evaluate(() => {
      const panels = document.querySelectorAll('[class*="border"], [class*="panel"], [class*="card"], .ant-collapse');
      let result = '';
      for (const p of panels) {
        result += p.innerText + '\n---\n';
      }
      return result;
    });
    log(`Panel content: ${panelText.substring(0, 1000)}`);
    
    const finalText = await page.evaluate(() => document.body.innerText.substring(0, 3000));
    const finalHasPanel = finalText.includes('类目属性');
    log(`Final: has 类目属性: ${finalHasPanel}`);
    log(`Final text: ${finalText.substring(0, 2000)}`);

    await page.screenshot({ path: '/tmp/sprint47-cat-final.png', fullPage: false });

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
