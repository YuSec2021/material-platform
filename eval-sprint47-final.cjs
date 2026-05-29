const { chromium } = require('@playwright/test');

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

    // Step 3: Find and select 办公设备 in the tree
    log('3. Looking for 办公设备 in tree...');
    
    // Try to find tree content first
    const treeContent = await page.evaluate(() => {
      const tree = document.querySelector('.ant-tree, [role="tree"], [class*="tree"]');
      return tree ? tree.innerText : '';
    });
    log(`Tree content: ${treeContent.substring(0, 500)}`);
    
    // Click on any tree node to expand, then find 办公设备
    const allTreeNodes = await page.$$('.ant-tree-node-content-wrapper');
    log(`Found ${allTreeNodes.length} tree node wrappers`);
    
    // Click the first node to expand tree if needed
    if (allTreeNodes.length > 0) {
      await allTreeNodes[0].click();
      await page.waitForTimeout(1000);
    }
    
    // Try to find 办公设备 text
    const bwNode = await page.getByText('办公设备').first();
    if (bwNode) {
      await bwNode.click();
      await page.waitForTimeout(2000);
      log('Clicked 办公设备');
    }

    // Get full page text
    const pageText = await page.evaluate(() => document.body.innerText.substring(0, 4000));
    
    // Check for category properties panel
    const hasPanel = pageText.includes('类目属性');
    const hasInheritedSection = pageText.includes('继承属性');
    const hasOwnSection = pageText.includes('自有属性');
    log(`=== C1 Checks ===`);
    log(`Has '类目属性' panel: ${hasPanel}`);
    log(`Has '继承属性' section: ${hasInheritedSection}`);
    log(`Has '自有属性' section: ${hasOwnSection}`);
    log(`Page text (first 1000 chars): ${pageText.substring(0, 1000)}`);

    // Now navigate to material management
    log('4. Navigating to material management...');
    await page.goto(`${BASE}/materials`);
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(2000);
    
    // Get material page text
    const matPageText = await page.evaluate(() => document.body.innerText.substring(0, 2000));
    log(`Material page text: ${matPageText.substring(0, 500)}`);

    // Click 新增物料 button
    log('5. Clicking 新增物料...');
    let addBtn = await page.getByText('新增物料').first();
    if (!addBtn) addBtn = await page.getByText('新建物料').first();
    if (!addBtn) addBtn = await page.getByText('新建').first();
    if (addBtn) {
      await addBtn.click();
      await page.waitForTimeout(3000);
    } else {
      log('Add button not found, trying via button element');
      const btns = await page.$$('button');
      for (const btn of btns) {
        const txt = await btn.innerText();
        if (txt.includes('新增') || txt.includes('新建') || txt.includes('物料')) {
          await btn.click();
          await page.waitForTimeout(3000);
          break;
        }
      }
    }
    log(`After clicking add, URL: ${page.url()}`);
    
    const formText = await page.evaluate(() => document.body.innerText.substring(0, 4000));
    log(`Material form text (first 1500): ${formText.substring(0, 1500)}`);

    // Step: Select category in material form
    log('6. Selecting category in material form...');
    
    // Look for category-related select/select
    const selects = await page.$$('.ant-select, [class*="select"]');
    log(`Found ${selects.length} select elements`);
    
    // Click first ant-select (likely category select)
    if (selects.length > 0) {
      await selects[0].click();
      await page.waitForTimeout(2000);
      
      // Try to find 办公设备 in options
      const options = await page.$$('.ant-select-item, .ant-select-option, [class*="option"]');
      log(`Found ${options.length} options in dropdown`);
      
      // Print options
      for (let i = 0; i < Math.min(options.length, 20); i++) {
        const txt = await options[i].innerText();
        log(`  Option ${i}: ${txt}`);
      }
      
      // Click on 打印机子级 or 办公设备
      for (const opt of options) {
        const txt = await opt.innerText();
        if (txt.includes('打印机') || txt.includes('办公设备')) {
          await opt.click();
          await page.waitForTimeout(3000);
          log(`Selected option: ${txt}`);
          break;
        }
      }
    }

    // Get form text after category selection
    const formText2 = await page.evaluate(() => document.body.innerText.substring(0, 5000));
    log(`=== C4 Checks ===`);
    
    const hasInhSection = formText2.includes('继承属性');
    const hasOwnSec = formText2.includes('自有属性');
    const hasAsterisk = formText2.includes('*');
    const hasWeight = formText2.includes('重量') || formText2.includes('Weight');
    const hasSpec = formText2.includes('规格') || formText2.includes('spec') || formText2.includes('Specification');
    const hasColor = formText2.includes('颜色') || formText2.includes('color') || formText2.includes('颜色');
    const hasPaperSize = formText2.includes('纸张') || formText2.includes('Paper');
    const hasSpecDefault = formText2.includes('标准规格');
    const hasBlueColor = formText2.includes('蓝色');
    const hasLockIcon = (await page.$$('[class*="lock"], [class*="Lock"]')).length > 0;
    const hasRequired = formText2.includes('必填') || formText2.includes('必选') || formText2.includes('required');
    
    log(`Form has '继承属性' section: ${hasInhSection}`);
    log(`Form has '自有属性' section: ${hasOwnSec}`);
    log(`Form has asterisk marker: ${hasAsterisk}`);
    log(`Form has '重量'/'Weight': ${hasWeight}`);
    log(`Form has '规格'/'spec': ${hasSpec}`);
    log(`Form has '颜色'/'color': ${hasColor}`);
    log(`Form has '纸张尺寸'/'Paper': ${hasPaperSize}`);
    log(`Form has default spec "标准规格": ${hasSpecDefault}`);
    log(`Form has default color "蓝色": ${hasBlueColor}`);
    log(`Form has lock icons: ${hasLockIcon}`);
    log(`Form has required indicators: ${hasRequired}`);
    log(`Form text (first 2000): ${formText2.substring(0, 2000)}`);

    // Check for red asterisk on required fields
    const redText = await page.evaluate(() => {
      const red = document.querySelectorAll('[class*="text-red"], [class*="text-red-600"], [class*="required"]');
      return Array.from(red).map(el => el.innerText || el.textContent).filter(t => t && t.trim()).join(' | ');
    });
    log(`Red/required text elements: ${redText}`);

    // Check for property field inputs
    const propInputs = await page.$$('input[placeholder*="属性"], input[placeholder*="property"], input[placeholder*="属性"]');
    log(`Property field inputs found: ${propInputs.length}`);

    await page.screenshot({ path: '/tmp/sprint47-matform-c4.png', fullPage: false });
    log('Screenshot: /tmp/sprint47-matform-c4.png');

    // Try to submit without required fields
    log('7. Testing required field blocking...');
    const submitBtns = await page.$$('button[type="submit"], button:has-text("提交"), button:has-text("确定"), button:has-text("创建"), button:has-text("保存")');
    for (const btn of submitBtns) {
      const txt = await btn.innerText();
      if (txt.includes('提交') || txt.includes('确定') || txt.includes('创建') || txt.includes('保存')) {
        await btn.click();
        await page.waitForTimeout(2000);
        break;
      }
    }
    
    const afterSubmit = await page.evaluate(() => document.body.innerText.substring(0, 2000));
    const hasBlockError = afterSubmit.includes('必填') || afterSubmit.includes('必选') || afterSubmit.includes('required') || afterSubmit.includes('不能为空') || afterSubmit.includes('请选择') || afterSubmit.includes('请填写');
    log(`Form blocked on required fields: ${hasBlockError}`);
    log(`After submit text: ${afterSubmit.substring(0, 500)}`);

    // i18n test
    log('8. Testing i18n...');
    const langBtn = await page.$('button:has-text("English"), a:has-text("English"), [title*="English"], [aria-label*="English"]');
    if (langBtn) {
      await langBtn.click();
      await page.waitForTimeout(2000);
    } else {
      // Try locale dropdown
      const localeBtn = await page.$('.ant-dropdown-trigger, button:has-text("中文"), button:has-text("English")');
      if (localeBtn) await localeBtn.click();
      await page.waitForTimeout(1000);
      const enOption = await page.$('text=English');
      if (enOption) await enOption.click();
      await page.waitForTimeout(2000);
    }
    
    const enText = await page.evaluate(() => document.body.innerText.substring(0, 2000));
    const enPanel = enText.includes('Category Properties') || enText.includes('Inherited') || enText.includes('Own') || enText.includes('Category Attributes');
    const enInherited = enText.includes('Inherited') || enText.includes('inherited');
    const enOwn = enText.includes('Own') || enText.includes('own');
    log(`en-US 'Category Properties': ${enPanel}`);
    log(`en-US 'Inherited': ${enInherited}`);
    log(`en-US 'Own': ${enOwn}`);
    log(`EN text: ${enText.substring(0, 500)}`);
    await page.screenshot({ path: '/tmp/sprint47-i18n-en.png', fullPage: false });

    // Regular user test
    log('9. Testing regular user read-only...');
    // Log out
    const logoutBtn = await page.$('button:has-text("退出"), button:has-text("Logout"), button:has-text("Sign out"), [aria-label*="logout"]');
    if (logoutBtn) {
      await logoutBtn.click();
      await page.waitForTimeout(1000);
    }
    
    // Login as regular user
    await page.goto(`${BASE}/login`);
    await page.waitForTimeout(2000);
    
    const email2 = await page.$('input[type="email"], input[name="email"], input[placeholder*="邮箱"]');
    const pass2 = await page.$('input[type="password"]');
    if (email2 && pass2) {
      await email2.fill('test_user');
      await pass2.fill('user123');
      const sub = await page.$('button[type="submit"]');
      if (sub) await sub.click();
    }
    await page.waitForTimeout(3000);
    
    // Navigate to categories
    await page.goto(`${BASE}/standard/categories`);
    await page.waitForTimeout(2000);
    
    // Click 办公设备
    const bwNode2 = await page.getByText('办公设备').first();
    if (bwNode2) await bwNode2.click();
    await page.waitForTimeout(2000);
    
    const regularText = await page.evaluate(() => document.body.innerText.substring(0, 1500));
    const hasAddReg = regularText.includes('新增属性');
    const hasEditReg = regularText.includes('编辑') && regularText.includes('属性');
    const hasLockReg = regularText.includes('锁定') || regularText.includes('lock') || regularText.includes('锁');
    log(`Regular user - has add button: ${hasAddReg}`);
    log(`Regular user - has edit button: ${hasEditReg}`);
    log(`Regular user - has lock: ${hasLockReg}`);
    log(`Regular user text: ${regularText.substring(0, 300)}`);
    await page.screenshot({ path: '/tmp/sprint47-regular-user.png', fullPage: false });

  } catch (err) {
    log(`ERROR: ${err.message}`);
    log(err.stack);
    errors.push(err.message);
  } finally {
    await browser.close();
  }

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
