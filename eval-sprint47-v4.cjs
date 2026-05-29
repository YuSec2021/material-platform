const { chromium } = require('@playwright/test');

const BASE = 'http://localhost:5173';
const errors = [];

function log(msg) { console.log(`[EVAL] ${msg}`); }

async function run() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  page.setDefaultTimeout(20000);

  try {
    // Login
    log('1. Logging in...');
    await page.goto(`${BASE}/login`);
    await page.waitForLoadState('domcontentloaded', { timeout: 10000 });
    await page.waitForTimeout(2000);
    
    const usernameInput = await page.$('input[placeholder="super_admin"]');
    const passwordInput = await page.$('input[type="password"]');
    if (usernameInput) await usernameInput.fill('super_admin');
    if (passwordInput) await passwordInput.fill('');
    const loginBtn = await page.$('button[type="submit"]');
    if (loginBtn) await loginBtn.click();
    await page.waitForTimeout(3000);
    log(`Logged in, URL: ${page.url()}`);

    // =========================================================
    // CRITERION 1: Category properties panel on category page
    // =========================================================
    log('\n===== CRITERION 1: Category properties panel =====');
    await page.goto(`${BASE}/standard/category`);
    await page.waitForLoadState('domcontentloaded', { timeout: 10000 });
    await page.waitForTimeout(3000);
    
    // The tree is showing category libraries - we need to select "Default Category Library"
    // then find 办公设备 inside it
    log('Looking for Default Category Library in tree...');
    
    // Find the tree nodes - use ant-tree-list-holder-inner or similar
    const treeNodes = await page.$$('.ant-tree-node-content-wrapper, .ant-tree-treenode, .ant-tree-list-holder-inner');
    log(`Found ${treeNodes.length} tree elements`);
    
    // Try to find "Default Category Library" 
    const defaultLibLocator = page.locator('text=Default Category Library');
    const defaultLibCount = await defaultLibLocator.count();
    log(`Default Category Library found: ${defaultLibCount > 0}`);
    
    if (defaultLibCount > 0) {
      await defaultLibLocator.click();
      await page.waitForTimeout(2000);
      log('Clicked Default Category Library');
    }
    
    // Now look for 办公设备
    const bwLocator = page.locator('text=办公设备');
    const bwCount = await bwLocator.count();
    log(`办公设备 found count: ${bwCount}`);
    
    if (bwCount > 0) {
      // Get the parent tree node to click (the tree node containing this text)
      const treeNodeLocator = page.locator('.ant-tree-treenode').filter({ has: page.locator('text=办公设备') });
      const tnCount = await treeNodeLocator.count();
      if (tnCount > 0) {
        await treeNodeLocator.first().click();
        await page.waitForTimeout(2000);
        log('Clicked tree node with 办公设备');
      } else {
        await bwLocator.first().click();
        await page.waitForTimeout(2000);
        log('Clicked 办公设备');
      }
    } else {
      log('办公设备 not found, trying to expand first tree node...');
      if (treeNodes.length > 0) {
        await treeNodes[0].click();
        await page.waitForTimeout(2000);
      }
    }
    
    // Get page text after selection
    const catText = await page.evaluate(() => document.body.innerText.substring(0, 6000));
    
    // Check for the category properties panel
    const c1_hasPanel = catText.includes('类目属性');
    const c1_hasInherited = catText.includes('继承属性');
    const c1_hasOwn = catText.includes('自有属性');
    const c1_hasBW = catText.includes('办公设备');
    
    log(`=== C1 Results ===`);
    log(`Has '类目属性' panel heading: ${c1_hasPanel}`);
    log(`Has '继承属性' section: ${c1_hasInherited}`);
    log(`Has '自有属性' section: ${c1_hasOwn}`);
    log(`Page has 办公设备 text: ${c1_hasBW}`);
    log(`Cat text (first 2000): ${catText.substring(0, 2000)}`);
    
    // Check for lock icons
    const lockIcons = await page.$$('[class*="lock"], svg[class*="lock"]');
    log(`Lock icons found: ${lockIcons.length}`);
    
    // Check for source label (继承自)
    const hasSourceLabel = catText.includes('继承自') || catText.includes('继承：') || catText.includes('来源');
    log(`Has source category label: ${hasSourceLabel}`);
    
    await page.screenshot({ path: '/tmp/sprint47-c1-v4.png', fullPage: false });
    log('Screenshot: /tmp/sprint47-c1-v4.png');

    // =========================================================
    // CRITERION 4: Material form integration
    // =========================================================
    log('\n===== CRITERION 4: Material form integration =====');
    
    await page.goto(`${BASE}/materials`);
    await page.waitForTimeout(3000);
    
    // Click 新增物料
    const addMatBtn = page.locator('button:has-text("新增物料")');
    const addMatBtnCount = await addMatBtn.count();
    log(`新增物料 button found: ${addMatBtnCount > 0}`);
    
    if (addMatBtnCount > 0) {
      await addMatBtn.click();
      await page.waitForTimeout(3000);
    } else {
      // Try other button text
      const addBtn2 = page.locator('button:has-text("新建")');
      if (await addBtn2.count() > 0) await addBtn2.click();
      await page.waitForTimeout(3000);
    }
    
    const matFormText = await page.evaluate(() => document.body.innerText.substring(0, 5000));
    log(`Material form text (first 1500): ${matFormText.substring(0, 1500)}`);
    
    // Find category select - look for ant-select elements
    const catSelects = await page.$$('.ant-select');
    log(`Found ${catSelects.length} ant-select elements`);
    
    if (catSelects.length > 0) {
      // Click the first select (likely category library or category selector)
      await catSelects[0].click();
      await page.waitForTimeout(2000);
      
      const catOptions = await page.$$('.ant-select-item-option, .ant-select-item, .ant-select-option');
      log(`Found ${catOptions.length} dropdown options`);
      
      // Print first 20 options
      for (let i = 0; i < Math.min(catOptions.length, 20); i++) {
        const txt = await catOptions[i].innerText();
        log(`  Option ${i}: ${txt.substring(0, 80)}`);
      }
      
      // Select a category that has attributes
      // Look for 打印机子级 (ID 1083) or 办公设备/打印机
      for (const opt of catOptions) {
        const txt = await opt.innerText();
        if (txt.includes('打印机') && txt.length < 200) {
          await opt.click();
          await page.waitForTimeout(3000);
          log(`Selected: ${txt}`);
          break;
        }
      }
    }
    
    const afterCatText = await page.evaluate(() => document.body.innerText.substring(0, 5000));
    
    const c4_hasInherited = afterCatText.includes('继承属性');
    const c4_hasOwn = afterCatText.includes('自有属性');
    const c4_hasAsterisk = afterCatText.includes('*');
    const c4_hasWeight = afterCatText.includes('重量') || afterCatText.includes('Weight');
    const c4_hasSpec = afterCatText.includes('规格') || afterCatText.includes('Specification');
    const c4_hasColor = afterCatText.includes('颜色') || afterCatText.includes('颜色');
    const c4_hasPaper = afterCatText.includes('纸张') || afterCatText.includes('Paper') || afterCatText.includes('A4');
    const c4_hasSpecDefault = afterCatText.includes('标准规格');
    const c4_hasBlueColor = afterCatText.includes('蓝色');
    const c4_hasInheritedFrom = afterCatText.includes('继承自') || afterCatText.includes('办公');
    
    log(`=== C4 Results ===`);
    log(`Has '继承属性' section: ${c4_hasInherited}`);
    log(`Has '自有属性' section: ${c4_hasOwn}`);
    log(`Has asterisk marker: ${c4_hasAsterisk}`);
    log(`Has '重量'/'Weight': ${c4_hasWeight}`);
    log(`Has '规格'/'spec': ${c4_hasSpec}`);
    log(`Has '颜色': ${c4_hasColor}`);
    log(`Has '纸张'/'A4': ${c4_hasPaper}`);
    log(`Has default spec '标准规格': ${c4_hasSpecDefault}`);
    log(`Has default color '蓝色': ${c4_hasBlueColor}`);
    log(`Has '继承自' or '办公': ${c4_hasInheritedFrom}`);
    log(`Form text after select (first 2500): ${afterCatText.substring(0, 2500)}`);
    
    // Check for red asterisk elements
    const redText = await page.evaluate(() => {
      const reds = document.querySelectorAll('[class*="text-red"], [class*="text-rose"]');
      return Array.from(reds).map(el => el.innerText || '').filter(t => t.trim()).join(' | ');
    });
    log(`Red text elements: ${redText}`);
    
    // Check for lock icons in form
    const formLockIcons = await page.$$('.ant-modal [class*="lock"], [class*="lock"]');
    log(`Lock icons in form: ${formLockIcons.length}`);
    
    await page.screenshot({ path: '/tmp/sprint47-c4-v4.png', fullPage: false });
    log('Screenshot: /tmp/sprint47-c4-v4.png');

    // =========================================================
    // CRITERION 5: Pre-fill defaults
    // =========================================================
    log('\n===== CRITERION 5: Pre-fill defaults =====');
    const specDefaultInput = await page.$('input[value="标准规格"]');
    log(`Spec default "标准规格" pre-filled: ${!!specDefaultInput}`);
    
    // Check input values
    const inputVals = await page.evaluate(() => {
      const inputs = Array.from(document.querySelectorAll('input'));
      return inputs.map(i => ({ v: i.value, ph: i.placeholder })).filter(i => i.v).slice(0, 10);
    });
    log(`Input values: ${JSON.stringify(inputVals)}`);

    // =========================================================
    // CRITERION 6: i18n
    // =========================================================
    log('\n===== CRITERION 6: i18n =====');
    
    // Navigate back to category page
    await page.goto(`${BASE}/standard/category`);
    await page.waitForTimeout(2000);
    
    // Find English button in the header
    const enBtn = page.locator('button:has-text("English")');
    if (await enBtn.count() > 0) {
      await enBtn.click();
      await page.waitForTimeout(2000);
      log('Clicked English');
    }
    
    const enText = await page.evaluate(() => document.body.innerText.substring(0, 3000));
    const enCatProps = enText.includes('Category Properties') || enText.includes('Category Attributes');
    const enInherited = enText.includes('Inherited');
    const enOwn = enText.includes('Own');
    const enLock = enText.includes('Lock');
    log(`en-US 'Category Properties/Attributes': ${enCatProps}`);
    log(`en-US 'Inherited': ${enInherited}`);
    log(`en-US 'Own': ${enOwn}`);
    log(`en-US 'Lock': ${enLock}`);
    log(`EN text snippet: ${enText.substring(0, 500)}`);
    
    await page.screenshot({ path: '/tmp/sprint47-c6-en-v4.png', fullPage: false });

    // =========================================================
    // CRITERION 7: Regular user read-only
    // =========================================================
    log('\n===== CRITERION 7: Regular user read-only =====');
    
    // Log out
    const logoutBtn = page.locator('button:has-text("退出")');
    if (await logoutBtn.count() > 0) {
      await logoutBtn.click();
      await page.waitForTimeout(1000);
    }
    
    // Login as regular user
    await page.goto(`${BASE}/login`);
    await page.waitForTimeout(2000);
    
    const regUser = await page.$('input[placeholder="super_admin"]');
    const regPass = await page.$('input[type="password"]');
    if (regUser) await regUser.fill('test_user');
    if (regPass) await regPass.fill('user123');
    const regLogin = await page.$('button[type="submit"]');
    if (regLogin) await regLogin.click();
    await page.waitForTimeout(3000);
    
    // Navigate to categories
    await page.goto(`${BASE}/standard/category`);
    await page.waitForTimeout(3000);
    
    // Click Default Category Library
    const regLib = page.locator('text=Default Category Library');
    if (await regLib.count() > 0) {
      await regLib.click();
      await page.waitForTimeout(2000);
    }
    
    // Click 办公设备
    const regBW = page.locator('text=办公设备');
    if (await regBW.count() > 0) {
      const treeNode = page.locator('.ant-tree-treenode').filter({ has: page.locator('text=办公设备') });
      if (await treeNode.count() > 0) {
        await treeNode.first().click();
      } else {
        await regBW.first().click();
      }
      await page.waitForTimeout(2000);
    }
    
    const regText = await page.evaluate(() => document.body.innerText.substring(0, 2000));
    const regHasAdd = regText.includes('新增属性');
    const regHasEdit = regText.includes('编辑') && regText.includes('属性');
    const regHasDelete = regText.includes('删除');
    const regHasLock = regText.includes('lock') || regText.includes('锁');
    log(`Regular user - has add button: ${regHasAdd}`);
    log(`Regular user - has edit button: ${regHasEdit}`);
    log(`Regular user - has delete: ${regHasDelete}`);
    log(`Regular user - has lock: ${regHasLock}`);
    log(`Regular user text: ${regText.substring(0, 500)}`);
    
    await page.screenshot({ path: '/tmp/sprint47-c7-user-v4.png', fullPage: false });

    // =========================================================
    // CRITERION 8: Responsive layout
    // =========================================================
    log('\n===== CRITERION 8: Responsive layout =====');
    
    // Log back in as super_admin
    await page.goto(`${BASE}/login`);
    await page.waitForTimeout(2000);
    const adminUser = await page.$('input[placeholder="super_admin"]');
    if (adminUser) await adminUser.fill('super_admin');
    const adminSubmit = await page.$('button[type="submit"]');
    if (adminSubmit) await adminSubmit.click();
    await page.waitForTimeout(3000);
    
    // Test at 768px
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto(`${BASE}/standard/category`);
    await page.waitForTimeout(2000);
    
    const dim768 = await page.evaluate(() => ({
      scrollW: document.documentElement.scrollWidth,
      clientW: document.documentElement.clientWidth
    }));
    const c8_768 = dim768.scrollW <= dim768.clientW + 5;
    log(`768px: scrollW=${dim768.scrollW} clientW=${dim768.clientW} noOverflow=${c8_768}`);
    
    // Test at 480px
    await page.setViewportSize({ width: 480, height: 800 });
    await page.waitForTimeout(1000);
    
    const dim480 = await page.evaluate(() => ({
      scrollW: document.documentElement.scrollWidth,
      clientW: document.documentElement.clientWidth
    }));
    const c8_480 = dim480.scrollW <= dim480.clientW + 5;
    log(`480px: scrollW=${dim480.scrollW} clientW=${dim480.clientW} noOverflow=${c8_480}`);
    
    // Check for virtual scrolling class
    const hasVS = await page.evaluate(() => {
      const vs = document.querySelectorAll('[class*="max-h-"], [class*="maxHeight"]');
      return vs.length;
    });
    log(`Virtual scrolling elements: ${hasVS}`);
    
    await page.screenshot({ path: '/tmp/sprint47-c8-480-v4.png', fullPage: false });

  } catch (err) {
    log(`ERROR: ${err.message}`);
    errors.push(err.message);
  } finally {
    await browser.close();
  }

  log('\n=== FINAL ERRORS ===');
  for (const e of errors) {
    log(`ERROR: ${e}`);
  }
}

run().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
