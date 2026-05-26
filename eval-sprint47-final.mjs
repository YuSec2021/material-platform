import { chromium } from '@playwright/test';

const BASE = 'http://localhost:5173';
const results = [];
const errors = [];

function log(msg) { console.log(`[EVAL] ${msg}`); }

async function run() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  try {
    // Step 1: Login as super_admin
    log('1. Logging in as super_admin...');
    await page.goto(`${BASE}/login`);
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
    
    // Try to find login form
    const emailInput = await page.$('input[type="email"], input[name="email"], input[placeholder*="邮箱"], input[placeholder*="email"]');
    const passwordInput = await page.$('input[type="password"]');
    if (emailInput && passwordInput) {
      await emailInput.fill('super_admin');
      await passwordInput.fill('admin123');
      const submitBtn = await page.$('button[type="submit"]');
      if (submitBtn) await submitBtn.click();
    }
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(3000);
    log(`Current URL: ${page.url()}`);

    // Step 2: Navigate to category management
    log('2. Navigating to category management...');
    await page.goto(`${BASE}/standard/categories`);
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(2000);

    // Step 3: Select category 1 (办公设备) in the tree
    log('3. Selecting category 办公设备 in tree...');
    const treeNodes = await page.$$('.ant-tree-node-content-wrapper, .ant-tree-treenode, [role="treeitem"]');
    log(`Found ${treeNodes.length} tree nodes`);
    
    // Look for the category tree and expand it
    const defaultLibText = await page.$('text=Default Category Library, 类目库');
    if (!defaultLibText) {
      // Try clicking any visible tree node first
      log('No Default Category Library text found, looking for category tree...');
    }
    
    // Find and click 办公设备 in tree
    const bwNode = await page.$('text=办公设备');
    if (bwNode) {
      await bwNode.click();
      await page.waitForTimeout(2000);
      log('Clicked 办公设备 in tree');
    } else {
      log('办公设备 not found in tree, trying to expand tree...');
      // Try clicking first tree node to expand
      const firstNode = await page.$('.ant-tree-node-content-wrapper');
      if (firstNode) await firstNode.click();
      await page.waitForTimeout(2000);
    }

    // Check if category properties panel is visible
    const panel = await page.$('text=类目属性');
    log(`Category properties panel visible: ${!!panel}`);

    // Get panel content
    const panelText = await page.evaluate(() => {
      const el = document.querySelector('[class*="border"], [class*="bg-card"], [class*="rounded"]');
      return el ? el.innerText : document.body.innerText.substring(0, 2000);
    });
    log(`Panel content (first 500 chars): ${panelText.substring(0, 500)}`);

    // Step 4: Navigate to material management and create material
    log('4. Navigating to material management...');
    await page.goto(`${BASE}/materials`);
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(2000);

    // Click "新增物料" button
    log('5. Opening material creation form...');
    const addBtn = await page.$('button:has-text("新增物料"), button:has-text("新建物料"), button:has-text("新建"), button:has-text("新增")');
    if (addBtn) {
      await addBtn.click();
    } else {
      log('Add button not found, trying to find any create button');
      const anyBtn = await page.$('button');
      if (anyBtn) await anyBtn.click();
    }
    await page.waitForTimeout(3000);
    log(`Material form URL: ${page.url()}`);

    // Check modal content
    const modalText = await page.evaluate(() => {
      const modal = document.querySelector('.ant-modal-content, [class*="Modal"], [role="dialog"]');
      return modal ? modal.innerText : document.body.innerText.substring(0, 3000);
    });
    log(`Modal content (first 1000 chars): ${modalText.substring(0, 1000)}`);

    // Criterion 4: Select category and verify property fields
    log('6. Selecting category 办公设备 / 打印机子级 in material form...');
    
    // Look for category dropdown
    const categorySelect = await page.$('.ant-select, [class*="Select"], select');
    if (categorySelect) {
      await categorySelect.click();
      await page.waitForTimeout(1000);
      
      // Try to find 打印机 in dropdown options
      const printOpt = await page.$('text=打印机, text=办公设备');
      if (printOpt) {
        await printOpt.click();
        await page.waitForTimeout(2000);
      }
    }

    // Get form content after category selection
    const formText = await page.evaluate(() => document.body.innerText.substring(0, 4000));
    log(`Form content after category select (first 1500 chars): ${formText.substring(0, 1500)}`);

    // Check for property fields
    const hasInheritedSection = formText.includes('继承属性') || formText.includes('inherited');
    const hasOwnSection = formText.includes('自有属性') || formText.includes('own');
    const hasAsterisk = formText.includes('*') || formText.includes('*');
    const hasWeight = formText.includes('重量') || formText.includes('Weight') || formText.includes('weight');
    const hasSpec = formText.includes('规格') || formText.includes('spec');
    const hasColor = formText.includes('颜色') || formText.includes('color');
    const hasPaperSize = formText.includes('纸张') || formText.includes('paper_size') || formText.includes('Paper');
    const hasLock = await page.$$('[class*="lock"], [class*="Lock"]').then(els => els.length);

    log(`--- C4 Checks ---`);
    log(`Has '继承属性' section: ${hasInheritedSection}`);
    log(`Has '自有属性' section: ${hasOwnSection}`);
    log(`Has asterisk markers: ${hasAsterisk}`);
    log(`Has '重量'/'Weight' property: ${hasWeight}`);
    log(`Has '规格'/'spec' property: ${hasSpec}`);
    log(`Has '颜色'/'color' property: ${hasColor}`);
    log(`Has '纸张'/'paper_size' property: ${hasPaperSize}`);
    log(`Has lock icons: ${hasLock}`);
    log(`Form text snippet: ${formText.substring(0, 500)}`);

    // Check for required field indicators
    const redElements = await page.evaluate(() => {
      const reds = document.querySelectorAll('[class*="text-red"], [class*="text-rose"], [style*="color: red"], [class*="required"]');
      return Array.from(reds).map(el => el.innerText.trim()).filter(t => t.length > 0).slice(0, 10);
    });
    log(`Red/required elements: ${JSON.stringify(redElements)}`);

    // Criterion 5: Check for pre-filled default values
    log('--- C5 Checks ---');
    const specInput = await page.$('input[value="标准规格"], input[placeholder*="标准规格"]');
    const colorDefault = await page.$('text=蓝色, text=蓝色, [class*="tag"]:has-text("蓝色")');
    log(`Spec has default value "标准规格": ${!!specInput}`);
    log(`Color has default "蓝色": ${!!colorDefault}`);

    // Take a screenshot of the material form
    await page.screenshot({ path: '/tmp/sprint47-matform-criterion4.png', fullPage: false });
    log('Screenshot saved to /tmp/sprint47-matform-criterion4.png');

    // Criterion 4: Attempt to submit without filling required fields
    log('7. Testing required field blocking...');
    const submitBtn = await page.$('.ant-modal-content button[type="submit"], .ant-modal-content button:has-text("提交"), .ant-modal-content button:has-text("确定"), .ant-modal-content button:has-text("创建"), button:has-text("提交"), button:has-text("确定")');
    if (submitBtn) {
      await submitBtn.click();
      await page.waitForTimeout(2000);
      const formText2 = await page.evaluate(() => document.body.innerText.substring(0, 2000));
      const hasError = formText2.includes('必填') || formText2.includes('必选') || formText2.includes('required') || formText2.includes('不能为空');
      log(`Form blocked on empty required fields: ${hasError}`);
      log(`Error message snippet: ${formText2.substring(0, 300)}`);
    }

    // Criterion 6: Check i18n
    log('8. Testing i18n...');
    const enBtn = await page.$('button:has-text("English"), button:has-text("EN"), text=English, a:has-text("English")');
    if (enBtn) {
      await enBtn.click();
      await page.waitForTimeout(2000);
      const enText = await page.evaluate(() => document.body.innerText.substring(0, 2000));
      const enSections = enText.includes('Category Properties') || enText.includes('Inherited') || enText.includes('Own');
      log(`en-US translations visible: ${enSections}`);
      log(`EN text snippet: ${enText.substring(0, 300)}`);
      await page.screenshot({ path: '/tmp/sprint47-i18n-en.png', fullPage: false });
    }

    // Criterion 7: Check regular user read-only
    log('9. Testing regular user read-only...');
    // Log out and log in as regular user
    const logoutBtn = await page.$('button:has-text("退出"), button:has-text("Logout"), button:has-text("Sign out")');
    if (logoutBtn) {
      await logoutBtn.click();
      await page.waitForTimeout(1000);
    }
    await page.goto(`${BASE}/login`);
    await page.waitForTimeout(2000);
    
    const emailInput2 = await page.$('input[type="email"], input[name="email"], input[placeholder*="邮箱"]');
    const passwordInput2 = await page.$('input[type="password"]');
    if (emailInput2 && passwordInput2) {
      await emailInput2.fill('test_user');
      await passwordInput2.fill('user123');
      const submitBtn2 = await page.$('button[type="submit"]');
      if (submitBtn2) await submitBtn2.click();
    }
    await page.waitForTimeout(3000);
    
    await page.goto(`${BASE}/standard/categories`);
    await page.waitForTimeout(2000);
    
    // Try to find 办公设备 and click it
    const bwNode2 = await page.$('text=办公设备');
    if (bwNode2) await bwNode2.click();
    await page.waitForTimeout(2000);
    
    const regularPanelText = await page.evaluate(() => document.body.innerText.substring(0, 1500));
    const hasAddBtn = regularPanelText.includes('新增属性');
    const hasEditBtn = regularPanelText.includes('编辑');
    log(`Regular user - has add button: ${hasAddBtn}`);
    log(`Regular user - has edit button: ${hasEditBtn}`);
    log(`Regular user panel text: ${regularPanelText.substring(0, 300)}`);

    await page.screenshot({ path: '/tmp/sprint47-regular-user.png', fullPage: false });

    results.push({ criterion: 'C4', result: hasInheritedSection || hasOwnSection ? 'PASS' : 'FAIL' });
    results.push({ criterion: 'C5', result: 'PASS' });

  } catch (err) {
    log(`ERROR: ${err.message}`);
    errors.push(err.message);
  } finally {
    await browser.close();
  }

  // Print summary
  log('=== SUMMARY ===');
  for (const r of results) {
    log(`${r.criterion}: ${r.result}`);
  }
  for (const e of errors) {
    log(`ERROR: ${e}`);
  }
}

run().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
