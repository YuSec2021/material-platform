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
    
    const usernameInput = await page.$('input[placeholder="super_admin"], input[placeholder*="账号"]');
    const passwordInput = await page.$('input[placeholder*="演示"], input[placeholder*="密码"], input[type="password"]');
    if (usernameInput) await usernameInput.fill('super_admin');
    if (passwordInput) await passwordInput.fill('');
    const loginBtn = await page.$('button[type="submit"], button:has-text("登录")');
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
    
    const catPageText = await page.evaluate(() => document.body.innerText.substring(0, 5000));
    log(`Category page text (first 2000): ${catPageText.substring(0, 2000)}`);
    
    const c1_hasPanel = catPageText.includes('类目属性');
    const c1_hasInherited = catPageText.includes('继承属性');
    const c1_hasOwn = catPageText.includes('自有属性');
    log(`=== C1 Results ===`);
    log(`Has '类目属性' panel heading: ${c1_hasPanel}`);
    log(`Has '继承属性' section: ${c1_hasInherited}`);
    log(`Has '自有属性' section: ${c1_hasOwn}`);
    
    // Check for lock icons
    const lockIcons = await page.$$('[class*="lock"], svg[class*="lock"]');
    log(`Lock icon count: ${lockIcons.length}`);
    
    // Check for visual distinction (muted color, different bg)
    const panelElements = await page.$$('[class*="border"], [class*="bg-muted"], [class*="bg-card"]');
    log(`Panel/border/card elements: ${panelElements.length}`);
    
    // Click on a tree node to select category
    log('Selecting 办公设备 in tree...');
    const treeNodes = await page.$$('.ant-tree-node-content-wrapper');
    log(`Found ${treeNodes.length} tree nodes`);
    
    // Try to click on 办公设备 text anywhere on page
    const bwNode = await page.getByText('办公设备', { exact: false }).first().catch(() => null);
    if (bwNode) {
      await bwNode.click();
      await page.waitForTimeout(2000);
      log('Clicked 办公设备');
    }
    
    // Click through tree nodes to find the right one
    for (const node of treeNodes.slice(0, 10)) {
      const txt = await node.innerText();
      if (txt.includes('办公') || txt.includes('打印')) {
        await node.click();
        await page.waitForTimeout(2000);
        log(`Clicked tree node: ${txt}`);
        break;
      }
    }
    
    const afterSelectText = await page.evaluate(() => document.body.innerText.substring(0, 5000));
    const c1_afterPanel = afterSelectText.includes('类目属性');
    const c1_afterInherited = afterSelectText.includes('继承属性');
    const c1_afterOwn = afterSelectText.includes('自有属性');
    log(`After tree select - Has '类目属性': ${c1_afterPanel}`);
    log(`After tree select - Has '继承属性': ${c1_afterInherited}`);
    log(`After tree select - Has '自有属性': ${c1_afterOwn}`);
    log(`After select text (first 1500): ${afterSelectText.substring(0, 1500)}`);
    
    await page.screenshot({ path: '/tmp/sprint47-c1.png', fullPage: false });
    log('Screenshot: /tmp/sprint47-c1.png');

    // =========================================================
    // CRITERION 2: Create/edit attribute form
    // =========================================================
    log('\n===== CRITERION 2: Attribute form =====');
    const addAttrBtn = await page.getByText('新增属性', { exact: false }).first().catch(() => null);
    if (addAttrBtn) {
      await addAttrBtn.click();
      await page.waitForTimeout(2000);
    } else {
      // Look for create/edit buttons
      const allBtns = await page.$$('button');
      for (const btn of allBtns) {
        const txt = await btn.innerText();
        if (txt.includes('新增') || txt.includes('属性')) {
          await btn.click();
          await page.waitForTimeout(2000);
          break;
        }
      }
    }
    
    const formText = await page.evaluate(() => document.body.innerText.substring(0, 3000));
    const c2_hasNameField = formText.includes('属性名') || formText.includes('名称');
    const c2_hasTypeField = formText.includes('类型') || formText.includes('type');
    const c2_hasDisplayZh = formText.includes('中文') || formText.includes('显示');
    const c2_hasDisplayEn = formText.includes('英文');
    const c2_hasDefault = formText.includes('默认') || formText.includes('default');
    const c2_hasRequired = formText.includes('必填') || formText.includes('required');
    const c2_hasAllowEmpty = formText.includes('允许') || formText.includes('allow');
    
    log(`=== C2 Results ===`);
    log(`Has 属性名 field: ${c2_hasNameField}`);
    log(`Has 类型 field: ${c2_hasTypeField}`);
    log(`Has 中文显示名 field: ${c2_hasDisplayZh}`);
    log(`Has 英文显示名 field: ${c2_hasDisplayEn}`);
    log(`Has 默认值 field: ${c2_hasDefault}`);
    log(`Has 必填 checkbox: ${c2_hasRequired}`);
    log(`Has 允许为空 checkbox: ${c2_hasAllowEmpty}`);
    log(`Form text: ${formText.substring(0, 800)}`);
    
    // Check for edit/delete buttons in attribute list
    const editBtns = await page.getByText('编辑').all();
    const delBtns = await page.getByText('删除').all();
    log(`Edit buttons found: ${editBtns.length}`);
    log(`Delete buttons found: ${delBtns.length}`);
    
    // Check for drag handles
    const dragHandles = await page.$$('[class*="drag"], [class*="handle"], svg[class*="grip"]');
    log(`Drag handles found: ${dragHandles.length}`);
    
    await page.screenshot({ path: '/tmp/sprint47-c2.png', fullPage: false });

    // =========================================================
    // CRITERION 3: Attribute type editors
    // =========================================================
    log('\n===== CRITERION 3: Type editors =====');
    // Close any open modal first
    const closeBtn = await page.$('.ant-modal-close, [class*="close"]');
    if (closeBtn) await closeBtn.click().catch(() => {});
    await page.waitForTimeout(1000);
    
    // Re-open the add attribute form
    const addBtn2 = await page.getByText('新增属性').first().catch(() => null);
    if (addBtn2) {
      await addBtn2.click();
      await page.waitForTimeout(2000);
    }
    
    // Look for type select
    const typeSelect = await page.$('select, .ant-select, [class*="select"]');
    if (typeSelect) {
      await typeSelect.click();
      await page.waitForTimeout(1000);
    }
    
    const typeOptions = await page.$$('.ant-select-item, .ant-select-option, [class*="option"]');
    log(`Type select options: ${typeOptions.length}`);
    for (const opt of typeOptions.slice(0, 10)) {
      const txt = await opt.innerText();
      log(`  Type option: ${txt}`);
    }
    
    // Select each type and verify corresponding field appears
    // String type - check for text input
    const stringInput = await page.$('input[type="text"]');
    log(`String type - has text input: ${!!stringInput}`);
    
    // Select number type if available
    const numberOpt = await page.getByText('数字', { exact: false }).first().catch(() => null);
    if (numberOpt) {
      await numberOpt.click();
      await page.waitForTimeout(1000);
      const numberInput = await page.$('input[type="number"]');
      log(`Number type - has number input: ${!!numberInput}`);
    }
    
    // Select enum type if available  
    const enumOpt = await page.getByText('枚举', { exact: false }).first().catch(() => null);
    if (enumOpt) {
      await enumOpt.click();
      await page.waitForTimeout(1000);
      const enumText = await page.evaluate(() => document.body.innerText.substring(0, 1000));
      const hasOptionsField = enumText.includes('选项') || enumText.includes('options') || enumText.includes('A4') || enumText.includes('枚举值');
      log(`Enum type - has options field: ${hasOptionsField}`);
    }
    
    // Select date type if available
    const dateOpt = await page.getByText('日期', { exact: false }).first().catch(() => null);
    if (dateOpt) {
      await dateOpt.click();
      await page.waitForTimeout(1000);
      const dateInput = await page.$('input[type="date"]');
      log(`Date type - has date picker: ${!!dateInput}`);
    }
    
    await page.screenshot({ path: '/tmp/sprint47-c3.png', fullPage: false });

    // =========================================================
    // CRITERION 4: Material form integration
    // =========================================================
    log('\n===== CRITERION 4: Material form integration =====');
    
    // Close modal if open
    const closeBtn2 = await page.$('.ant-modal-close');
    if (closeBtn2) await closeBtn2.click().catch(() => {});
    await page.waitForTimeout(1000);
    
    await page.goto(`${BASE}/materials`);
    await page.waitForLoadState('domcontentloaded', { timeout: 10000 });
    await page.waitForTimeout(3000);
    
    // Click 新增物料
    let addMatBtn = await page.getByText('新增物料').first().catch(() => null);
    if (!addMatBtn) addMatBtn = await page.getByText('新建物料').first().catch(() => null);
    if (!addMatBtn) addMatBtn = await page.getByText('新建').first().catch(() => null);
    if (addMatBtn) {
      await addMatBtn.click();
      await page.waitForTimeout(3000);
    } else {
      const allBtns = await page.$$('button');
      for (const btn of allBtns) {
        const txt = await btn.innerText();
        if (txt.includes('新增') || txt.includes('物料') || txt.includes('新建')) {
          await btn.click();
          await page.waitForTimeout(3000);
          break;
        }
      }
    }
    
    const matFormText = await page.evaluate(() => document.body.innerText.substring(0, 5000));
    log(`Material form text (first 2000): ${matFormText.substring(0, 2000)}`);
    
    // Look for category select
    const catSelect = await page.$('.ant-select');
    if (catSelect) {
      await catSelect.click();
      await page.waitForTimeout(2000);
      
      // Get all options in dropdown
      const catOptions = await page.$$('.ant-select-item');
      log(`Category options: ${catOptions.length}`);
      for (const opt of catOptions.slice(0, 15)) {
        const txt = await opt.innerText();
        log(`  Cat option: ${txt}`);
      }
      
      // Click on 打印机子级 or 办公设备
      for (const opt of catOptions) {
        const txt = await opt.innerText();
        if (txt.includes('打印机') || txt.includes('办公设备')) {
          await opt.click();
          await page.waitForTimeout(3000);
          log(`Selected category: ${txt}`);
          break;
        }
      }
    }
    
    const afterCatText = await page.evaluate(() => document.body.innerText.substring(0, 5000));
    const c4_hasInherited = afterCatText.includes('继承属性');
    const c4_hasOwn = afterCatText.includes('自有属性');
    const c4_hasAsterisk = afterCatText.includes('*');
    const c4_hasWeight = afterCatText.includes('重量') || afterCatText.includes('Weight') || afterCatText.includes('weight');
    const c4_hasSpec = afterCatText.includes('规格') || afterCatText.includes('spec');
    const c4_hasColor = afterCatText.includes('颜色') || afterCatText.includes('color');
    const c4_hasPaper = afterCatText.includes('纸张') || afterCatText.includes('Paper') || afterCatText.includes('paper');
    const c4_hasSpecDefault = afterCatText.includes('标准规格');
    const c4_hasBlueColor = afterCatText.includes('蓝色');
    
    log(`=== C4 Results ===`);
    log(`Has '继承属性' section: ${c4_hasInherited}`);
    log(`Has '自有属性' section: ${c4_hasOwn}`);
    log(`Has asterisk marker: ${c4_hasAsterisk}`);
    log(`Has '重量'/'Weight': ${c4_hasWeight}`);
    log(`Has '规格'/'spec': ${c4_hasSpec}`);
    log(`Has '颜色'/'color': ${c4_hasColor}`);
    log(`Has '纸张'/'Paper': ${c4_hasPaper}`);
    log(`Has default spec '标准规格': ${c4_hasSpecDefault}`);
    log(`Has default color '蓝色': ${c4_hasBlueColor}`);
    log(`After cat select text: ${afterCatText.substring(0, 2000)}`);
    
    // Check for lock icons in material form
    const matLockIcons = await page.$$('[class*="lock"]');
    log(`Lock icons in material form: ${matLockIcons.length}`);
    
    // Check for red asterisk elements
    const redElems = await page.evaluate(() => {
      const reds = document.querySelectorAll('[class*="text-red"], [class*="text-rose"], [class*="text-red-600"]');
      return Array.from(reds).map(el => el.innerText || el.textContent).filter(t => t && t.trim()).join(' | ');
    });
    log(`Red text elements: ${redElems}`);
    
    // Check for property field inputs
    const propInputs = await page.$$('input[type="text"], input[type="number"], input[type="date"], select, .ant-select');
    log(`Property-related inputs: ${propInputs.length}`);
    
    await page.screenshot({ path: '/tmp/sprint47-c4.png', fullPage: false });
    log('Screenshot: /tmp/sprint47-c4.png');

    // =========================================================
    // CRITERION 5: Pre-fill default values
    // =========================================================
    log('\n===== CRITERION 5: Pre-fill defaults =====');
    // Check if optional property (spec with default "标准规格") is pre-filled
    const specInputWithDefault = await page.$('input[value="标准规格"], input[placeholder*="标准规格"], [class*="tag"]:has-text("标准规格")');
    log(`Spec has default "标准规格": ${!!specInputWithDefault}`);
    
    const colorDefault = await page.$('text=蓝色, [class*="tag"]:has-text("蓝色"), [class*="selected"]:has-text("蓝色")');
    log(`Color has default "蓝色": ${!!colorDefault}`);
    
    // Check inputs for default values
    const inputsWithValues = await page.evaluate(() => {
      const inputs = document.querySelectorAll('input');
      return Array.from(inputs).map(inp => ({
        value: inp.value,
        placeholder: inp.placeholder
      })).filter(i => i.value).slice(0, 20);
    });
    log(`Inputs with values: ${JSON.stringify(inputsWithValues)}`);

    // =========================================================
    // CRITERION 6: i18n
    // =========================================================
    log('\n===== CRITERION 6: i18n =====');
    const langBtn = await page.$('[title*="English"], button:has-text("English"), a:has-text("English")');
    if (langBtn) {
      await langBtn.click();
      await page.waitForTimeout(2000);
    } else {
      // Try locale dropdown
      const localeBtn = await page.$('.ant-dropdown-trigger');
      if (localeBtn) {
        await localeBtn.click();
        await page.waitForTimeout(1000);
        const enOpt = await page.getByText('English').first();
        if (enOpt) await enOpt.click();
        await page.waitForTimeout(2000);
      }
    }
    
    const enText = await page.evaluate(() => document.body.innerText.substring(0, 3000));
    const enPanel = enText.includes('Category Properties') || enText.includes('Category Attributes');
    const enInherited = enText.includes('Inherited') || enText.includes('inherited');
    const enOwn = enText.includes('Own') || enText.includes('own') || enText.includes('Own ');
    const enAttrs = enText.includes('Attributes');
    log(`en-US 'Category Properties/Attributes': ${enPanel}`);
    log(`en-US 'Inherited': ${enInherited}`);
    log(`en-US 'Own': ${enOwn}`);
    log(`en-US 'Attributes': ${enAttrs}`);
    log(`EN text: ${enText.substring(0, 1000)}`);
    await page.screenshot({ path: '/tmp/sprint47-c6-en.png', fullPage: false });
    
    // Switch back to zh-CN
    const zhBtn = await page.$('[title*="中文"], button:has-text("中文"), a:has-text("中文")');
    if (zhBtn) {
      await zhBtn.click();
      await page.waitForTimeout(2000);
    }

    // =========================================================
    // CRITERION 7: Super admin vs regular user
    // =========================================================
    log('\n===== CRITERION 7: Super admin vs regular user =====');
    
    // Log out
    const logoutBtn = await page.$('button:has-text("退出"), button:has-text("Logout")');
    if (logoutBtn) {
      await logoutBtn.click();
      await page.waitForTimeout(1000);
    }
    
    // Login as regular user (test_user)
    await page.goto(`${BASE}/login`);
    await page.waitForTimeout(2000);
    
    const regUserInput = await page.$('input[placeholder="super_admin"], input[placeholder*="账号"]');
    const regPassInput = await page.$('input[type="password"]');
    if (regUserInput) await regUserInput.fill('test_user');
    if (regPassInput) await regPassInput.fill('user123');
    const regLoginBtn = await page.$('button[type="submit"], button:has-text("登录")');
    if (regLoginBtn) await regLoginBtn.click();
    await page.waitForTimeout(3000);
    
    // Navigate to categories
    await page.goto(`${BASE}/standard/category`);
    await page.waitForTimeout(3000);
    
    // Try to find 办公设备 and click it
    const bwNodeReg = await page.getByText('办公设备', { exact: false }).first().catch(() => null);
    if (bwNodeReg) {
      await bwNodeReg.click();
      await page.waitForTimeout(2000);
    }
    
    const regText = await page.evaluate(() => document.body.innerText.substring(0, 2000));
    const regHasAdd = regText.includes('新增属性');
    const regHasEdit = regText.includes('编辑') && regText.includes('属性');
    const regHasDelete = regText.includes('删除') && regText.includes('属性');
    const regHasLock = regText.includes('锁') || regText.includes('lock');
    log(`Regular user - has add button: ${regHasAdd}`);
    log(`Regular user - has edit button: ${regHasEdit}`);
    log(`Regular user - has delete: ${regHasDelete}`);
    log(`Regular user - has lock: ${regHasLock}`);
    log(`Regular user text: ${regText.substring(0, 500)}`);
    await page.screenshot({ path: '/tmp/sprint47-c7-user.png', fullPage: false });

    // =========================================================
    // CRITERION 8: Responsive layout
    // =========================================================
    log('\n===== CRITERION 8: Responsive layout =====');
    
    // Log back in as super_admin
    await page.goto(`${BASE}/login`);
    await page.waitForTimeout(2000);
    const adminUser = await page.$('input[placeholder="super_admin"]');
    if (adminUser) await adminUser.fill('super_admin');
    const loginSubmit = await page.$('button[type="submit"]');
    if (loginSubmit) await loginSubmit.click();
    await page.waitForTimeout(3000);
    
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto(`${BASE}/standard/category`);
    await page.waitForTimeout(2000);
    
    const width768Text = await page.evaluate(() => {
      const body = document.body;
      return { scrollWidth: body.scrollWidth, clientWidth: body.clientWidth };
    });
    const c8_noOverflow768 = width768Text.scrollWidth <= width768Text.clientWidth + 5;
    log(`768px: scrollWidth=${width768Text.scrollWidth} clientWidth=${width768Text.clientWidth} noOverflow=${c8_noOverflow768}`);
    
    await page.setViewportSize({ width: 480, height: 800 });
    await page.waitForTimeout(1000);
    
    const width480Text = await page.evaluate(() => {
      const body = document.body;
      return { scrollWidth: body.scrollWidth, clientWidth: body.clientWidth };
    });
    const c8_noOverflow480 = width480Text.scrollWidth <= width480Text.clientWidth + 5;
    log(`480px: scrollWidth=${width480Text.scrollWidth} clientWidth=${width480Text.clientWidth} noOverflow=${c8_noOverflow480}`);
    
    // Check for virtual scrolling (max-h on overflow-y-auto)
    const hasVirtualScroll = await page.evaluate(() => {
      const els = document.querySelectorAll('[class*="max-h"], [class*="overflow-y-auto"]');
      return els.length > 0;
    });
    log(`Has virtual scrolling setup: ${hasVirtualScroll}`);
    
    await page.screenshot({ path: '/tmp/sprint47-c8-480.png', fullPage: false });

    // =========================================================
    // CRITERION 4-5: Submit blocking (if modal still open)
    // =========================================================
    log('\n===== CRITERION 4-5: Submit blocking =====');
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${BASE}/materials`);
    await page.waitForTimeout(2000);
    
    // Navigate back to materials and try to submit without required fields
    const addBtnFinal = await page.getByText('新增物料').first().catch(() => null);
    if (addBtnFinal) await addBtnFinal.click();
    await page.waitForTimeout(3000);
    
    // Select category first
    const catSel = await page.$('.ant-select');
    if (catSel) {
      await catSel.click();
      await page.waitForTimeout(2000);
      const opts = await page.$$('.ant-select-item');
      for (const opt of opts) {
        const txt = await opt.innerText();
        if (txt.includes('打印机') || txt.includes('办公')) {
          await opt.click();
          await page.waitForTimeout(2000);
          break;
        }
      }
    }
    
    // Try to submit
    const submitBtns = await page.$$('button');
    for (const btn of submitBtns) {
      const txt = await btn.innerText();
      if (txt.includes('提交') || txt.includes('确定') || txt.includes('创建') || txt.includes('保存')) {
        await btn.click();
        await page.waitForTimeout(2000);
        break;
      }
    }
    
    const afterSubmitText = await page.evaluate(() => document.body.innerText.substring(0, 2000));
    const hasBlockError = afterSubmitText.includes('必填') || afterSubmitText.includes('必选') || afterSubmitText.includes('必填') || afterSubmitText.includes('required') || afterSubmitText.includes('不能为空') || afterSubmitText.includes('请选择') || afterSubmitText.includes('请填写');
    log(`Form blocked on empty required fields: ${hasBlockError}`);
    log(`After submit text: ${afterSubmitText.substring(0, 500)}`);
    
    await page.screenshot({ path: '/tmp/sprint47-submit-block.png', fullPage: false });

  } catch (err) {
    log(`ERROR: ${err.message}`);
    log(err.stack);
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
