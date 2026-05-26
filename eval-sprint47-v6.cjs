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
      log(`  Click error: ${e.message.substring(0, 80)}`);
    }
    return false;
  }

  async function safeGoto(url) {
    await page.goto(url);
    await page.waitForTimeout(3000);
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
    log(`Logged in: ${page.url()}`);

    // =========================================================
    // CRITERION 1: Category properties panel
    // =========================================================
    log('\n===== CRITERION 1 =====');
    await page.goto(`${BASE}/standard/category`);
    await page.waitForTimeout(3000);

    // The tree is showing category LIBRARIES at the root level. 
    // Default Category Library has a button. Expand it.
    // Use the tree node expand button approach
    const dclTreeNode = page.locator('.ant-tree-treenode').filter({ has: page.locator('text=Default Category Library') }).first();
    if (await dclTreeNode.count() > 0) {
      log('Found Default Category Library tree node');
      // Click the expand toggle (chevron)
      const toggle = dclTreeNode.locator('.ant-tree-switcher');
      if (await toggle.count() > 0) {
        await toggle.click();
        await page.waitForTimeout(2000);
        log('Expanded Default Category Library');
      } else {
        // Node might already be expanded - click the content
        await dclTreeNode.click();
        await page.waitForTimeout(2000);
        log('Clicked Default Category Library node');
      }
    }

    // Now find "办公设备" under Default Category Library
    // It should be in the tree after expansion
    const bwTreeNode = page.locator('.ant-tree-treenode').filter({ has: page.locator('text=办公设备') }).first();
    if (await bwTreeNode.count() > 0) {
      // Try to get the expand button first to see if it's a leaf node
      const bwSwitch = bwTreeNode.locator('.ant-tree-switcher');
      if (await bwSwitch.count() > 0) {
        const isLeaf = await bwSwitch.evaluate(el => el.classList.contains('ant-tree-switcher-noop'));
        if (isLeaf) {
          log('办公设备 is a leaf node - clicking content');
          const nodeContent = bwTreeNode.locator('.ant-tree-node-content-wrapper');
          await nodeContent.click();
        } else {
          log('办公设备 has children - clicking toggle');
          await bwSwitch.click();
        }
      } else {
        log('办公设备 - no switcher, clicking content');
        const nodeContent = bwTreeNode.locator('.ant-tree-node-content-wrapper');
        await nodeContent.click();
      }
      await page.waitForTimeout(2000);
      log('Selected 办公设备');
    } else {
      log('办公设备 not found in tree - looking for categories...');
      // List all tree nodes
      const allNodes = await page.$$('.ant-tree-node-content-wrapper');
      for (const node of allNodes.slice(0, 30)) {
        const txt = await node.innerText();
        log(`  Node: ${txt.substring(0, 60)}`);
      }
    }

    // Check page content
    const catText = await page.evaluate(() => document.body.innerText.substring(0, 6000));

    const c1_hasPanel = catText.includes('类目属性');
    const c1_hasInherited = catText.includes('继承属性');
    const c1_hasOwn = catText.includes('自有属性');

    log(`Panel: ${c1_hasPanel}, Inherited: ${c1_hasInherited}, Own: ${c1_hasOwn}`);
    log(`Text: ${catText.substring(0, 2000)}`);

    // Look specifically at the right-side content area
    const rightContent = await page.evaluate(() => {
      // Find main content area
      const main = document.querySelector('main');
      if (!main) return 'No main element';
      // Look for the properties panel
      const panels = main.querySelectorAll('[class*="border"], [class*="bg-card"]');
      for (const p of panels) {
        if (p.innerText.includes('类目属性') || p.innerText.includes('自有属性')) {
          return `PANEL: ${p.innerText.substring(0, 800)}`;
        }
      }
      return `No panel. Main text: ${main.innerText.substring(0, 1000)}`;
    });
    log(`Right content: ${rightContent}`);

    // Check if the CategoryPropertiesPanel is rendered
    const panelHTML = await page.evaluate(() => {
      const panels = document.querySelectorAll('div[class*="border"]');
      for (const p of panels) {
        if (p.innerText.includes('类目属性')) {
          return p.outerHTML.substring(0, 2000);
        }
      }
      return 'Panel not found';
    });
    log(`Panel HTML: ${panelHTML}`);

    await page.screenshot({ path: '/tmp/sprint47-c1-v6.png', fullPage: false });
    log('Screenshot: /tmp/sprint47-c1-v6.png');

    // CRITERION 2
    log('\n===== CRITERION 2 =====');
    const addAttrBtn = page.locator('button:has-text("新增属性")');
    if (await addAttrBtn.count() > 0) {
      await addAttrBtn.first().click();
      await page.waitForTimeout(2000);
    }

    const formText = await page.evaluate(() => document.body.innerText.substring(0, 3000));
    log(`attrName: ${formText.includes('属性名')}, type: ${formText.includes('类型')}, zh: ${formText.includes('中文')}, en: ${formText.includes('英文')}, default: ${formText.includes('默认')}, required: ${formText.includes('必填')}, empty: ${formText.includes('允许为空')}`);

    const editCount = await page.locator('button:has-text("编辑")').count();
    const delCount = await page.locator('button:has-text("删除")').count();
    log(`Edit: ${editCount}, Delete: ${delCount}`);

    await page.screenshot({ path: '/tmp/sprint47-c2-v6.png', fullPage: false });

    // CRITERION 3
    log('\n===== CRITERION 3 =====');
    await safeClick(page.locator('.ant-modal-close'));
    await page.waitForTimeout(1000);
    if (await addAttrBtn.count() > 0) {
      await addAttrBtn.first().click();
      await page.waitForTimeout(2000);
    }

    // Try type select
    const typeSel = await page.$('.ant-select, select');
    if (typeSel) {
      await typeSel.click();
      await page.waitForTimeout(1000);
      const typeOpts = await page.$$('.ant-select-item-option');
      log(`Type options: ${typeOpts.length}`);
      for (const opt of typeOpts.slice(0, 8)) {
        const txt = await opt.innerText();
        log(`  Type: ${txt}`);
      }

      await safeClick(page.locator('.ant-select-item-option').filter({ hasText: '文本' }));
      await page.waitForTimeout(300);
      const hasText = !!(await page.$('input[type="text"]'));
      log(`String text input: ${hasText}`);

      await safeClick(page.locator('.ant-select-item-option').filter({ hasText: '数字' }));
      await page.waitForTimeout(300);
      const hasNum = !!(await page.$('input[type="number"]'));
      log(`Number number input: ${hasNum}`);

      await safeClick(page.locator('.ant-select-item-option').filter({ hasText: '枚举' }));
      await page.waitForTimeout(500);
      const enumTxt = await page.evaluate(() => document.body.innerText.substring(0, 500));
      log(`Enum options: ${enumTxt.includes('选项') || enumTxt.includes('options')}`);

      await safeClick(page.locator('.ant-select-item-option').filter({ hasText: '日期' }));
      await page.waitForTimeout(300);
      const hasDate = !!(await page.$('input[type="date"]'));
      log(`Date date picker: ${hasDate}`);
    }

    await page.screenshot({ path: '/tmp/sprint47-c3-v6.png', fullPage: false });

    // CRITERION 4
    log('\n===== CRITERION 4 =====');
    await safeClick(page.locator('.ant-modal-close'));
    await page.waitForTimeout(1000);

    await page.goto(`${BASE}/materials`);
    await page.waitForTimeout(3000);

    const addMatBtn = page.locator('button:has-text("新增物料")');
    if (await addMatBtn.count() > 0) {
      await addMatBtn.first().click();
    } else {
      await safeClick(page.locator('button:has-text("新建")'));
    }
    await page.waitForTimeout(3000);

    // Find category dropdowns
    const catSelects = await page.$$('.ant-select');
    log(`ant-select elements: ${catSelects.length}`);

    if (catSelects.length > 0) {
      // Try to find the category selection dropdown
      // Usually the first ant-select is the category library or category selector
      await catSelects[0].click();
      await page.waitForTimeout(2000);

      const opts = await page.$$('.ant-select-item-option, .ant-select-item');
      log(`Options count: ${opts.length}`);

      for (let i = 0; i < Math.min(opts.length, 30); i++) {
        const txt = await opts[i].innerText();
        log(`  Opt ${i}: ${txt.substring(0, 80)}`);
      }

      // Select 打印机子级 or 办公设备/打印机
      for (const opt of opts) {
        const txt = await opt.innerText();
        if (txt.includes('打印机') && txt.length < 200) {
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
      weight: matText.includes('重量') || matText.includes('Weight') || matText.includes('weight'),
      spec: matText.includes('规格') || matText.includes('spec'),
      color: matText.includes('颜色'),
      paper: matText.includes('纸张') || matText.includes('A4') || matText.includes('Paper'),
      specDefault: matText.includes('标准规格'),
      blueColor: matText.includes('蓝色'),
      inheritedFrom: matText.includes('继承自') || matText.includes('办公')
    };

    log(`C4: inherited=${c4.inherited}, own=${c4.own}, asterisk=${c4.asterisk}, weight=${c4.weight}, spec=${c4.spec}, color=${c4.color}, paper=${c4.paper}`);
    log(`C4 defaults: specDefault=${c4.specDefault}, blueColor=${c4.blueColor}`);
    log(`MatText: ${matText.substring(0, 2000)}`);

    // Check for modal content specifically
    const modalText = await page.evaluate(() => {
      const modal = document.querySelector('.ant-modal-content');
      return modal ? modal.innerText.substring(0, 3000) : document.body.innerText.substring(0, 3000);
    });
    log(`Modal text: ${modalText.substring(0, 1500)}`);

    // Check red required elements in modal
    const redInModal = await page.evaluate(() => {
      const modal = document.querySelector('.ant-modal-content');
      if (!modal) return [];
      const reds = modal.querySelectorAll('[class*="text-red"], [class*="text-rose"]');
      return Array.from(reds).map(e => e.innerText || e.textContent).filter(t => t.trim()).join(' | ');
    });
    log(`Red required elements in modal: ${redInModal}`);

    // Lock icons in form
    const formLocks = await page.$$('.ant-modal [class*="lock"]');
    log(`Lock icons in form: ${formLocks.length}`);

    await page.screenshot({ path: '/tmp/sprint47-c4-v6.png', fullPage: false });

    // CRITERION 5
    log('\n===== CRITERION 5 =====');
    const inputVals = await page.evaluate(() => Array.from(document.querySelectorAll('input')).map(i => i.value).filter(v => v).slice(0, 15));
    log(`Input vals: ${JSON.stringify(inputVals)}`);

    // CRITERION 6
    log('\n===== CRITERION 6 =====');
    // Close modal first
    await safeClick(page.locator('.ant-modal-close'));
    await page.waitForTimeout(1000);

    // Navigate to category page for i18n check
    await page.goto(`${BASE}/standard/category`);
    await page.waitForTimeout(3000);

    // Close any open modal
    const closeBtn = await page.$('.ant-modal-close');
    if (closeBtn) await closeBtn.click().catch(() => {});
    await page.waitForTimeout(500);

    // Click language button (aria-label="语言")
    const langBtn = page.locator('[aria-label="语言"]');
    if (await langBtn.count() > 0) {
      await langBtn.click();
      await page.waitForTimeout(1000);
    }

    // Try to find English option in dropdown
    const enOpt = page.locator('text=English').first();
    if (await enOpt.count() > 0) {
      await enOpt.click();
      await page.waitForTimeout(2000);
    }

    const enText = await page.evaluate(() => document.body.innerText.substring(0, 3000));
    log(`en catProps: ${enText.includes('Category Properties') || enText.includes('Category Attributes')}`);
    log(`en Inherited: ${enText.includes('Inherited')}`);
    log(`en Own: ${enText.includes('Own')}`);
    log(`en text: ${enText.substring(0, 500)}`);

    await page.screenshot({ path: '/tmp/sprint47-c6-v6.png', fullPage: false });

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

    // Expand Default Category Library
    const dclReg = page.locator('.ant-tree-treenode').filter({ has: page.locator('text=Default Category Library') }).first();
    if (await dclReg.count() > 0) {
      const regToggle = dclReg.locator('.ant-tree-switcher');
      if (await regToggle.count() > 0) {
        await regToggle.click();
        await page.waitForTimeout(2000);
      }
    }

    // Select 办公设备
    const bwReg = page.locator('.ant-tree-treenode').filter({ has: page.locator('text=办公设备') }).first();
    if (await bwReg.count() > 0) {
      const nodeContent = bwReg.locator('.ant-tree-node-content-wrapper');
      await nodeContent.click();
      await page.waitForTimeout(2000);
    }

    const regText = await page.evaluate(() => document.body.innerText.substring(0, 2000));
    log(`reg add: ${regText.includes('新增属性')}, edit: ${regText.includes('编辑') && regText.includes('属性')}, delete: ${regText.includes('删除')}, lock: ${regText.includes('lock') || regText.includes('锁')}`);
    log(`Reg text: ${regText.substring(0, 500)}`);

    await page.screenshot({ path: '/tmp/sprint47-c7-v6.png', fullPage: false });

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
    log(`Virtual scrolling: ${vsCount}`);

    await page.screenshot({ path: '/tmp/sprint47-c8-v6.png', fullPage: false });

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
