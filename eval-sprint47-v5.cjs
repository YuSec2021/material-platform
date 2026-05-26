const { chromium } = require('@playwright/test');

const BASE = 'http://localhost:5173';
const errors = [];

function log(msg) { console.log(`[EVAL] ${msg}`); }

async function run() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  page.setDefaultTimeout(20000);

  async function safeClick(locator) {
    try {
      const count = await locator.count();
      if (count > 0) {
        await locator.first().click();
        return true;
      }
    } catch(e) {
      log(`  Click failed: ${e.message.substring(0, 100)}`);
    }
    return false;
  }

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

    // CRITERION 1
    log('\n===== CRITERION 1 =====');
    await page.goto(`${BASE}/standard/category`);
    await page.waitForTimeout(3000);

    await safeClick(page.locator('.ant-tree-treenode').filter({ has: page.locator('text=Default Category Library') }));
    await page.waitForTimeout(2000);

    await safeClick(page.locator('.ant-tree-treenode').filter({ has: page.locator('text=办公设备') }));
    await page.waitForTimeout(2000);

    const catText = await page.evaluate(() => document.body.innerText.substring(0, 6000));

    const c1_hasPanel = catText.includes('类目属性');
    const c1_hasInherited = catText.includes('继承属性');
    const c1_hasOwn = catText.includes('自有属性');
    const c1_hasLock = (await page.$$('svg[class*="lock"], [class*="lock"]')).length > 0;
    const c1_hasSourceLabel = catText.includes('继承自') || catText.includes('来源');

    log(`Panel: ${c1_hasPanel}, Inherited: ${c1_hasInherited}, Own: ${c1_hasOwn}, Lock: ${c1_hasLock}, SourceLabel: ${c1_hasSourceLabel}`);
    log(`Text: ${catText.substring(0, 1500)}`);

    await page.screenshot({ path: '/tmp/sprint47-c1-v5.png', fullPage: false });

    // CRITERION 2
    log('\n===== CRITERION 2 =====');
    const addAttrLoc = page.locator('button:has-text("新增属性")');
    if (await addAttrLoc.count() > 0) {
      await addAttrLoc.first().click();
      await page.waitForTimeout(2000);
    }

    const formText = await page.evaluate(() => document.body.innerText.substring(0, 3000));
    log(`attrName: ${formText.includes('属性名')}, attrType: ${formText.includes('类型')}, displayZh: ${formText.includes('中文')}, displayEn: ${formText.includes('英文')}, default: ${formText.includes('默认')}, required: ${formText.includes('必填')}, allowEmpty: ${formText.includes('允许为空')}`);
    log(`Form: ${formText.substring(0, 800)}`);

    const editCount = await page.locator('button:has-text("编辑")').count();
    const delCount = await page.locator('button:has-text("删除")').count();
    const dragCount = await page.locator('[class*="drag"], [class*="grip"]').count();
    log(`Edit: ${editCount}, Delete: ${delCount}, Drag: ${dragCount}`);

    await page.screenshot({ path: '/tmp/sprint47-c2-v5.png', fullPage: false });

    // CRITERION 3
    log('\n===== CRITERION 3 =====');
    await safeClick(page.locator('.ant-modal-close'));
    await page.waitForTimeout(1000);
    if (await addAttrLoc.count() > 0) {
      await addAttrLoc.first().click();
      await page.waitForTimeout(2000);
    }

    const typeSel = await page.$('.ant-select, select');
    if (typeSel) {
      await typeSel.click();
      await page.waitForTimeout(1000);
      const typeOpts = await page.$$('.ant-select-item-option, .ant-select-item');
      log(`Type options: ${typeOpts.length}`);

      await safeClick(page.locator('.ant-select-item-option').filter({ hasText: '文本' }));
      await page.waitForTimeout(300);
      const hasTextInput = !!(await page.$('input[type="text"]'));
      log(`String text input: ${hasTextInput}`);

      await safeClick(page.locator('.ant-select-item-option').filter({ hasText: '数字' }));
      await page.waitForTimeout(300);
      const hasNumInput = !!(await page.$('input[type="number"]'));
      log(`Number number input: ${hasNumInput}`);

      await safeClick(page.locator('.ant-select-item-option').filter({ hasText: '枚举' }));
      await page.waitForTimeout(500);
      const enumFormText = await page.evaluate(() => document.body.innerText.substring(0, 500));
      const hasEnumOpts = enumFormText.includes('选项') || enumFormText.includes('options');
      log(`Enum options field: ${hasEnumOpts}`);

      await safeClick(page.locator('.ant-select-item-option').filter({ hasText: '日期' }));
      await page.waitForTimeout(300);
      const hasDateInput = !!(await page.$('input[type="date"]'));
      log(`Date date picker: ${hasDateInput}`);
    }

    await page.screenshot({ path: '/tmp/sprint47-c3-v5.png', fullPage: false });

    // CRITERION 4
    log('\n===== CRITERION 4 =====');
    await safeClick(page.locator('.ant-modal-close'));
    await page.waitForTimeout(1000);

    await page.goto(`${BASE}/materials`);
    await page.waitForTimeout(3000);

    const addMatLoc = page.locator('button:has-text("新增物料")');
    if (await addMatLoc.count() > 0) {
      await addMatLoc.first().click();
    } else {
      await safeClick(page.locator('button:has-text("新建")'));
    }
    await page.waitForTimeout(3000);

    const catSelects = await page.$$('.ant-select');
    log(`Category selects: ${catSelects.length}`);

    if (catSelects.length > 0) {
      await catSelects[0].click();
      await page.waitForTimeout(2000);

      const opts = await page.$$('.ant-select-item-option, .ant-select-item');
      log(`Options: ${opts.length}`);
      for (let i = 0; i < Math.min(opts.length, 20); i++) {
        const txt = await opts[i].innerText();
        log(`  Opt ${i}: ${txt.substring(0, 80)}`);
      }

      for (const opt of opts) {
        const txt = await opt.innerText();
        if (txt.includes('打印机') || txt.includes('办公设备')) {
          await opt.click();
          await page.waitForTimeout(3000);
          log(`Selected: ${txt}`);
          break;
        }
      }
    }

    const matText = await page.evaluate(() => document.body.innerText.substring(0, 5000));

    const c4 = {
      inherited: matText.includes('继承属性'),
      own: matText.includes('自有属性'),
      asterisk: matText.includes('*'),
      weight: matText.includes('重量') || matText.includes('Weight'),
      spec: matText.includes('规格') || matText.includes('spec'),
      color: matText.includes('颜色'),
      paper: matText.includes('纸张') || matText.includes('A4') || matText.includes('Paper'),
      specDefault: matText.includes('标准规格'),
      blueColor: matText.includes('蓝色'),
      inheritedFrom: matText.includes('继承自') || matText.includes('办公')
    };

    log(`C4: inherited=${c4.inherited}, own=${c4.own}, asterisk=${c4.asterisk}, weight=${c4.weight}, spec=${c4.spec}, color=${c4.color}, paper=${c4.paper}, specDefault=${c4.specDefault}, blueColor=${c4.blueColor}, from=${c4.inheritedFrom}`);
    log(`MatText: ${matText.substring(0, 2500)}`);

    const redElems = await page.evaluate(() => {
      const reds = document.querySelectorAll('[class*="text-red"], [class*="text-rose"]');
      return Array.from(reds).map(e => e.innerText || '').filter(t => t.trim()).join(' | ');
    });
    log(`Red elements: ${redElems}`);

    const formLocks = await page.$$('[class*="lock"]');
    log(`Lock icons in form: ${formLocks.length}`);

    await page.screenshot({ path: '/tmp/sprint47-c4-v5.png', fullPage: false });

    // CRITERION 5
    log('\n===== CRITERION 5 =====');
    const inputVals = await page.evaluate(() => Array.from(document.querySelectorAll('input')).map(i => i.value).filter(v => v).slice(0, 15));
    log(`Input vals: ${JSON.stringify(inputVals)}`);
    log(`std规格 pre-filled: ${inputVals.includes('标准规格')}`);
    log(`蓝色 pre-filled: ${inputVals.includes('蓝色')}`);

    // CRITERION 6
    log('\n===== CRITERION 6 =====');
    const enBtn = page.locator('button:has-text("English")');
    if (await enBtn.count() > 0) {
      await enBtn.click();
    }
    await page.waitForTimeout(2000);

    const enText = await page.evaluate(() => document.body.innerText.substring(0, 3000));
    log(`en catProps: ${enText.includes('Category Properties') || enText.includes('Category Attributes')}`);
    log(`en Inherited: ${enText.includes('Inherited')}`);
    log(`en Own: ${enText.includes('Own')}`);
    log(`en Lock: ${enText.includes('Lock')}`);
    log(`EN text: ${enText.substring(0, 500)}`);

    await page.screenshot({ path: '/tmp/sprint47-c6-en-v5.png', fullPage: false });

    // CRITERION 7
    log('\n===== CRITERION 7 =====');
    const logoutBtn = page.locator('button:has-text("退出")');
    if (await logoutBtn.count() > 0) await logoutBtn.click();
    await page.waitForTimeout(1000);

    await page.goto(`${BASE}/login`);
    await page.waitForTimeout(2000);

    const ru = await page.$('input[placeholder="super_admin"]');
    const rp = await page.$('input[type="password"]');
    if (ru) await ru.fill('test_user');
    if (rp) await rp.fill('user123');
    const rl = await page.$('button[type="submit"]');
    if (rl) await rl.click();
    await page.waitForTimeout(3000);

    await page.goto(`${BASE}/standard/category`);
    await page.waitForTimeout(3000);

    await safeClick(page.locator('.ant-tree-treenode').filter({ has: page.locator('text=Default Category Library') }));
    await page.waitForTimeout(2000);

    await safeClick(page.locator('.ant-tree-treenode').filter({ has: page.locator('text=办公设备') }));
    await page.waitForTimeout(2000);

    const regText = await page.evaluate(() => document.body.innerText.substring(0, 2000));
    log(`reg add: ${regText.includes('新增属性')}, edit: ${regText.includes('编辑') && regText.includes('属性')}, delete: ${regText.includes('删除')}, lock: ${regText.includes('lock') || regText.includes('锁')}`);
    log(`Reg text: ${regText.substring(0, 500)}`);

    await page.screenshot({ path: '/tmp/sprint47-c7-user-v5.png', fullPage: false });

    // CRITERION 8
    log('\n===== CRITERION 8 =====');
    await page.goto(`${BASE}/login`);
    await page.waitForTimeout(2000);
    const au = await page.$('input[placeholder="super_admin"]');
    if (au) await au.fill('super_admin');
    const al = await page.$('button[type="submit"]');
    if (al) await al.click();
    await page.waitForTimeout(3000);

    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto(`${BASE}/standard/category`);
    await page.waitForTimeout(2000);

    const d768 = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
    log(`768px: sw=${d768.sw} cw=${d768.cw} noOverflow=${d768.sw <= d768.cw + 5}`);

    await page.setViewportSize({ width: 480, height: 800 });
    await page.waitForTimeout(1000);

    const d480 = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
    log(`480px: sw=${d480.sw} cw=${d480.cw} noOverflow=${d480.sw <= d480.cw + 5}`);

    const vsCount = await page.evaluate(() => document.querySelectorAll('[class*="max-h-"]').length);
    log(`Virtual scrolling elements: ${vsCount}`);

    await page.screenshot({ path: '/tmp/sprint47-c8-480-v5.png', fullPage: false });

  } catch (err) {
    log(`ERROR: ${err.message}`);
    errors.push(err.message);
  } finally {
    await browser.close();
  }

  log('\n=== ERRORS ===');
  for (const e of errors) log(`ERROR: ${e}`);
}

run().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});