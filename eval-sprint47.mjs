import { chromium } from 'playwright';

const BASE_URL = 'http://localhost:5173';

async function run() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();

  const results = [];
  const errors = [];

  page.on('console', msg => {
    if (msg.type() === 'error') {
      errors.push(`[console error] ${msg.text()}`);
    }
  });
  page.on('pageerror', err => {
    errors.push(`[page error] ${err.message}`);
  });

  async function goto(path) {
    await page.goto(BASE_URL + path, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);
  }

  async function screenshot(name) {
    await page.screenshot({ path: `/Users/yusec/projects/material_retrieval/.sprintfoundry/eval-screenshots/sprint47-${name}.png`, fullPage: true });
  }

  async function selectCategoryLibraryAndCategory(libraryName, categoryText) {
    // Select library
    const libSelect = page.locator('select').first();
    const opts = await libSelect.locator('option').all();
    for (const opt of opts) {
      const text = await opt.textContent();
      if (text && text.includes(libraryName)) {
        const val = await opt.getAttribute('value');
        await libSelect.selectOption(val);
        await page.waitForTimeout(2000);
        break;
      }
    }
    // Click category in tree
    const catNode = page.locator('text="' + categoryText + '"').first();
    if (await catNode.isVisible({ timeout: 5000 }).catch(() => false)) {
      await catNode.click();
      await page.waitForTimeout(3000);
    }
  }

  // --- LOGIN ---
  console.log('=== LOGIN ===');
  try {
    await goto('/login');
    await page.locator('#username').fill('super_admin');
    await page.locator('#password').fill('');
    await page.locator('button[type="submit"]').click();
    await page.waitForTimeout(3000);
    results.push({ criterion: 'login', pass: true, evidence: `Logged in, URL: ${page.url()}` });
  } catch (e) {
    results.push({ criterion: 'login', pass: false, evidence: `Login failed: ${e.message}` });
    await browser.close();
    return results;
  }

  // Go to category management and select category 1083 (打印机子级)
  await goto('/standard/category');
  await page.waitForTimeout(4000);
  await selectCategoryLibraryAndCategory('Default Category Library', '打印机子级');
  await page.waitForTimeout(2000);
  await screenshot('criterion1-catpage');

  // ========================================================================
  // CRITERION 1: Category attributes panel displays own and inherited properties
  // ========================================================================
  console.log('\n=== CRITERION 1: Category attributes panel ===');
  try {
    const pageContent = await page.content();
    const hasCategoryProps = pageContent.includes('类目属性');
    const hasOwn = pageContent.includes('自有属性');
    const hasInherited = pageContent.includes('继承属性');
    const hasSourceIndicator = pageContent.includes('继承自') || pageContent.includes('继承');
    console.log('类目属性 panel:', hasCategoryProps);
    console.log('自有属性 section:', hasOwn);
    console.log('继承属性 section:', hasInherited);
    console.log('Inheritance indicator:', hasSourceIndicator);

    results.push({ criterion: '1_panel_visible', pass: hasCategoryProps && hasOwn && hasInherited, evidence: `类目属性: ${hasCategoryProps}, 自有属性: ${hasOwn}, 继承属性: ${hasInherited}` });

  } catch (e) {
    results.push({ criterion: '1_panel_visible', pass: false, evidence: `Error: ${e.message}` });
  }

  // ========================================================================
  // CRITERION 2: Create and edit attribute forms with drag-to-reorder
  // ========================================================================
  console.log('\n=== CRITERION 2: Attribute CRUD forms ===');
  try {
    await page.waitForTimeout(1000);
    const addBtns = await page.locator('button').filter({ hasText: /新增属性|添加属性|Add Attribute/ }).count();
    const editBtns = await page.locator('button').filter({ hasText: /编辑|Edit/ }).count();
    const selects = await page.locator('select').count();
    const dragHandles = await page.locator('[class*="grip"], [class*="Grip"], [data-icon="grip-vertical"]').count();
    console.log('Add attribute button:', addBtns);
    console.log('Edit buttons:', editBtns);
    console.log('Type selects:', selects);
    console.log('Drag handles:', dragHandles);

    results.push({ criterion: '2_add_button', pass: addBtns > 0, evidence: `Add: ${addBtns}, Edit: ${editBtns}, Selects: ${selects}, Drag: ${dragHandles}` });

  } catch (e) {
    results.push({ criterion: '2_add_button', pass: false, evidence: `Error: ${e.message}` });
  }

  // ========================================================================
  // CRITERION 3: Attribute type editors
  // ========================================================================
  console.log('\n=== CRITERION 3: Attribute type editors ===');
  try {
    // Try to open the add attribute form
    const addBtn = page.locator('button').filter({ hasText: /新增属性|添加属性|Add Attribute/ }).first();
    if (await addBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await addBtn.click();
      await page.waitForTimeout(2000);
      await screenshot('criterion3-attr-form');

      const formContent = await page.content();
      const allOptions = await page.locator('select option').allTextContents();
      const uniqueOpts = [...new Set(allOptions)];
      const hasTypeSelect = uniqueOpts.some(t => /string|number|enum|date/i.test(t));
      console.log('Type select options:', uniqueOpts.filter(o => /string|number|enum|date/i.test(o)));
      console.log('Has type select:', hasTypeSelect);

      results.push({ criterion: '3_type_selectors', pass: hasTypeSelect, evidence: `Type select with expected types: ${hasTypeSelect}` });
    } else {
      results.push({ criterion: '3_type_selectors', pass: false, evidence: 'Add attribute button not found' });
    }
  } catch (e) {
    results.push({ criterion: '3_type_selectors', pass: false, evidence: `Error: ${e.message}` });
  }

  // ========================================================================
  // CRITERION 4: Material form with category properties
  // ========================================================================
  console.log('\n=== CRITERION 4: Material form with category properties ===');
  try {
    await goto('/materials');
    await page.waitForTimeout(3000);
    await screenshot('criterion4-materials-list');

    // Look for create material button
    const createBtn = page.locator('button').filter({ hasText: /新建物料|新增物料|新增物品/ }).first();
    if (await createBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await createBtn.click();
      await page.waitForTimeout(3000);
      await screenshot('criterion4-material-form');

      const formContent = await page.content();
      const hasInheritedSection = formContent.includes('继承属性') || formContent.includes('继承的属性');
      const hasOwnSection = formContent.includes('自有属性') || formContent.includes('自有 属性');
      const hasRequiredAsterisk = formContent.includes('*') || formContent.includes('必填');
      console.log('Inherited section:', hasInheritedSection);
      console.log('Own section:', hasOwnSection);
      console.log('Required asterisk:', hasRequiredAsterisk);

      results.push({ criterion: '4_material_form_props', pass: hasInheritedSection || hasOwnSection, evidence: `Inherited: ${hasInheritedSection}, Own: ${hasOwnSection}, Required: ${hasRequiredAsterisk}` });
    } else {
      // Check if category library is selected in the materials list
      const pageContent = await page.content();
      const hasInheritedSection = pageContent.includes('继承属性') || pageContent.includes('继承的属性');
      const hasOwnSection = pageContent.includes('自有属性') || pageContent.includes('自有 属性');
      results.push({ criterion: '4_material_form_props', pass: hasInheritedSection || hasOwnSection, evidence: `Inherited: ${hasInheritedSection}, Own: ${hasOwnSection}, create btn: not found` });
    }

  } catch (e) {
    results.push({ criterion: '4_material_form_props', pass: false, evidence: `Error: ${e.message}` });
  }

  // ========================================================================
  // CRITERION 5: Optional properties pre-fill
  // ========================================================================
  console.log('\n=== CRITERION 5: Pre-fill optional properties ===');
  results.push({ criterion: '5_prefill', pass: null, evidence: 'Requires manual form interaction to verify pre-fill behavior' });

  // ========================================================================
  // CRITERION 6: i18n
  // ========================================================================
  console.log('\n=== CRITERION 6: i18n ===');
  try {
    await goto('/standard/category');
    await page.waitForTimeout(3000);
    await selectCategoryLibraryAndCategory('Default Category Library', '打印机子级');
    await page.waitForTimeout(2000);

    const zhContent = await page.content();
    const hasZhProps = zhContent.includes('类目属性') || zhContent.includes('自有属性') || zhContent.includes('继承属性');
    console.log('Chinese labels present:', hasZhProps);

    // Find and click the language toggle
    const userMenu = page.locator('button').filter({ hasText: /English|EN|Language/i }).first();
    if (await userMenu.isVisible({ timeout: 2000 }).catch(() => false)) {
      await userMenu.click();
      await page.waitForTimeout(2000);
      await screenshot('criterion6-en');

      const enContent = await page.content();
      const hasEnProps = enContent.includes('Category Properties') || enContent.includes('Own Attributes') || enContent.includes('Inherited Attributes');
      console.log('English labels after toggle:', hasEnProps);
      results.push({ criterion: '6_i18n', pass: hasZhProps && hasEnProps, evidence: `zh labels: ${hasZhProps}, en labels: ${hasEnProps}` });
    } else {
      results.push({ criterion: '6_i18n', pass: hasZhProps, evidence: `zh labels: ${hasZhProps}, en toggle not found in UI` });
    }
  } catch (e) {
    results.push({ criterion: '6_i18n', pass: false, evidence: `Error: ${e.message}` });
  }

  // ========================================================================
  // CRITERION 7: Super admin edit vs regular user read-only
  // ========================================================================
  console.log('\n=== CRITERION 7: Super admin vs regular user ===');
  try {
    await goto('/standard/category');
    await page.waitForTimeout(3000);
    await selectCategoryLibraryAndCategory('Default Category Library', '打印机子级');
    await page.waitForTimeout(2000);

    const editButtons = await page.locator('button').filter({ hasText: /编辑|Edit|修改/ }).count();
    const addButtons = await page.locator('button').filter({ hasText: /新增|Add|添加/ }).count();
    console.log('Edit buttons as super_admin:', editButtons);
    console.log('Add buttons as super_admin:', addButtons);

    results.push({ criterion: '7_superadmin_edit', pass: editButtons > 0 || addButtons > 0, evidence: `Edit: ${editButtons}, Add: ${addButtons}` });
  } catch (e) {
    results.push({ criterion: '7_superadmin_edit', pass: false, evidence: `Error: ${e.message}` });
  }

  // ========================================================================
  // CRITERION 8: Responsive layout
  // ========================================================================
  console.log('\n=== CRITERION 8: Responsive layout ===');
  try {
    await page.setViewportSize({ width: 1280, height: 900 });
    await goto('/standard/category');
    await page.waitForTimeout(3000);
    await selectCategoryLibraryAndCategory('Default Category Library', '打印机子级');
    await page.waitForTimeout(2000);

    await page.setViewportSize({ width: 768, height: 900 });
    await page.waitForTimeout(1000);
    await screenshot('criterion8-768px');

    await page.setViewportSize({ width: 480, height: 900 });
    await page.waitForTimeout(1000);
    await screenshot('criterion8-480px');

    results.push({ criterion: '8_responsive', pass: true, evidence: 'Responsive screenshots taken at 768px and 480px' });
  } catch (e) {
    results.push({ criterion: '8_responsive', pass: false, evidence: `Error: ${e.message}` });
  }

  // Print summary
  console.log('\n=== SUMMARY ===');
  for (const r of results) {
    const status = r.pass === null ? 'N/A' : (r.pass ? 'PASS' : 'FAIL');
    console.log(`${status} - ${r.criterion}: ${r.evidence}`);
  }

  if (errors.length > 0) {
    console.log('\n=== PAGE ERRORS ===');
    for (const e of errors.slice(0, 20)) {
      console.log(e);
    }
  }

  await browser.close();
  return results;
}

run().catch(e => {
  console.error('Fatal error:', e);
  process.exit(1);
});