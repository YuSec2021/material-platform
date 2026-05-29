/**
 * Sprint 31 - Continue verification after modal intercept fix
 */

import { chromium } from 'playwright';

const BASE = 'http://localhost:5173';

async function main() {
  console.log('Sprint 31 - Continue from edit modal\n');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  // Login
  await page.goto(`${BASE}/login`, { timeout: 15000 });
  await page.waitForTimeout(2000);
  await page.fill('input[placeholder="super_admin"]', 'super_admin');
  await page.fill('input[type="password"]', '');
  await page.click('button[type="submit"]');
  await page.waitForTimeout(5000);

  // Navigate to Sprint 26 MAT library
  await page.goto(`${BASE}/material/library`, { timeout: 15000 });
  await page.waitForTimeout(5000);

  // Find and click view on MAT library
  const cards = await page.locator('article').all();
  for (const card of cards) {
    const text = await card.innerText();
    if (text.includes('MAT')) {
      const viewBtn = card.locator('button:has-text("查看")');
      if (await viewBtn.count() > 0) {
        await viewBtn.click();
        await page.waitForTimeout(3000);
        break;
      }
    }
  }

  // Click 编码规则 tab
  await page.locator('[role="tab"]:has-text("编码规则")').first().click();
  await page.waitForTimeout(2000);

  // Click 编辑规则 - this opens the edit modal
  await page.locator('button:has-text("编辑规则")').first().click();
  await page.waitForTimeout(3000);

  // Check for modal with edit form
  const editText = await page.locator('body').innerText();
  const hasModal = editText.includes('编码规则编辑');
  console.log(`Edit modal opened: ${hasModal}`);

  // Check segment builder elements
  const hasAddSeg = editText.includes('添加片段');
  const hasSegTypes = editText.includes('固定文本') && editText.includes('类目路径编码') && editText.includes('属性编码') && editText.includes('日期') && editText.includes('流水号');
  const hasHelp = editText.includes('说明') || editText.includes('help') || editText.includes('?');
  const hasCSV = editText.includes('CSV') || editText.includes('csv') || editText.includes('导入');
  const hasSerialPreview = editText.includes('当前值') || editText.includes('下一个值') || editText.includes('预览');
  const hasMoveUpDown = editText.includes('上移') || editText.includes('下移');
  const hasAutoComplete = editText.includes('autocomplete') || editText.includes('AutoComplete');

  console.log(`\nSegment builder elements:`);
  console.log(`  Add segment: ${hasAddSeg}`);
  console.log(`  All 5 types: ${hasSegTypes}`);
  console.log(`  Help tooltips: ${hasHelp}`);
  console.log(`  CSV import: ${hasCSV}`);
  console.log(`  Serial scope preview: ${hasSerialPreview}`);
  console.log(`  Move up/down: ${hasMoveUpDown}`);
  console.log(`  Attribute autocomplete: ${hasAutoComplete}`);

  // Check for icons in the segment builder
  const pageContent = await page.content();
  const hasIcons = pageContent.includes('Type"') || pageContent.includes('Layers"') || pageContent.includes('Calendar"') || pageContent.includes('Hash"') || pageContent.includes('Tags"');
  const hasGrip = pageContent.includes('GripVertical');
  console.log(`  Icons: ${hasIcons}`);
  console.log(`  Grip handles: ${hasGrip}`);

  // Close the edit modal
  const cancelBtn = page.locator('button:has-text("取消")').first();
  if (await cancelBtn.count() > 0) {
    await cancelBtn.click();
    await page.waitForTimeout(1000);
  }

  // Now navigate to 编码映射 tab
  const mappingsTab = page.locator('[role="tab"]:has-text("编码映射")').first();
  if (await mappingsTab.count() > 0) {
    await mappingsTab.click();
    await page.waitForTimeout(3000);
    const mapText = await page.locator('body').innerText();

    const hasSearch = mapText.includes('搜索') || mapText.includes('查询') || mapText.includes('search');
    const hasDateFilter = mapText.includes('日期');
    const hasBatchFilter = mapText.includes('批次') || mapText.includes('batch');
    const hasExport = mapText.includes('导出');
    const hasCSV = mapText.includes('CSV');
    const hasExcel = mapText.includes('Excel');
    const hasFormatSelect = mapText.includes('导出格式') || mapText.includes('format');

    console.log(`\n编码映射 tab:`);
    console.log(`  Search: ${hasSearch}`);
    console.log(`  Date filter: ${hasDateFilter}`);
    console.log(`  Batch filter: ${hasBatchFilter}`);
    console.log(`  Export: ${hasExport}`);
    console.log(`  CSV: ${hasCSV}`);
    console.log(`  Excel: ${hasExcel}`);
    console.log(`  Format select: ${hasFormatSelect}`);
  }

  // Navigate to 物料列表 tab
  const materialsTab = page.locator('[role="tab"]:has-text("物料列表")').first();
  if (await materialsTab.count() > 0) {
    await materialsTab.click();
    await page.waitForTimeout(3000);
    const matText = await page.locator('body').innerText();

    const hasCreateBtn = matText.includes('新增物料') || matText.includes('新建物料') || matText.includes('添加物料');
    const hasAIBtns = matText.includes('AI') || matText.includes('治理');
    const hasMaterialCode = matText.includes('物料编码') || matText.includes('编码');

    console.log(`\n物料列表 tab:`);
    console.log(`  Create button: ${hasCreateBtn}`);
    console.log(`  AI buttons: ${hasAIBtns}`);
    console.log(`  Material code column: ${hasMaterialCode}`);

    // Check if there are materials with auto-generated codes
    const hasCodeLikeMAT = matText.includes('MAT-');
    console.log(`  Materials with auto-code (MAT-*): ${hasCodeLikeMAT}`);

    // Check for the 新增物料 form
    if (hasCreateBtn) {
      const createBtn = page.locator('button:has-text("新增物料")').first();
      await createBtn.click().catch(() => {});
      await page.waitForTimeout(2000);

      const formText = await page.locator('body').innerText();
      const hasCodeField = formText.includes('物料编码') || formText.includes('编码');
      const hasAutoPreview = formText.includes('待生成') || formText.includes('预览') || formText.includes('auto') || formText.includes('Auto');

      console.log(`\nMaterial create form:`);
      console.log(`  Code field: ${hasCodeField}`);
      console.log(`  Auto preview: ${hasAutoPreview}`);

      // Close modal
      const closeBtn = page.locator('button:has-text("取消"), button:has-text("关闭"), [aria-label="close"], .close').first();
      await closeBtn.click().catch(() => {});
      await page.waitForTimeout(500);
    }
  }

  // Navigate to 重编码记录 tab
  const recodesTab = page.locator('[role="tab"]:has-text("重编码记录")').first();
  if (await recodesTab.count() > 0) {
    await recodesTab.click();
    await page.waitForTimeout(3000);
    const recodeText = await page.locator('body').innerText();
    console.log(`\n重编码记录 tab content (first 1000):\n${recodeText.slice(0, 1000)}`);
  }

  // i18n check across the entire detail page
  const detailContent = await page.content();
  const fallbacks = ['codeRule.', 'recode.', 'mapping.', 'undefined', 'missing', 'i18n.'];
  let foundFallbacks = [];
  for (const f of fallbacks) {
    if (detailContent.includes(f)) foundFallbacks.push(f);
  }
  console.log(`\ni18n fallback check: ${foundFallbacks.length === 0 ? 'PASS - no fallbacks' : 'FAIL - found: ' + foundFallbacks.join(', ')}`);

  // Check en-US translations exist
  const i18nFile = await import('fs').then(fs => fs.readFileSync('/Users/yusec/projects/material_retrieval/prototype_code/src/app/i18n.ts', 'utf8'));
  const enSection = i18nFile.indexOf('"en"');
  console.log(`en-US translations: ${enSection > 0 ? 'present' : 'missing'}`);

  // Responsive test
  console.log(`\nResponsive test (390x844):`);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(1000);

  // Navigate back to library list
  await page.goto(`${BASE}/material/library`, { timeout: 15000 });
  await page.waitForTimeout(3000);

  const narrowText = await page.locator('body').innerText();
  const hasNarrowCards = narrowText.includes('查看') && narrowText.includes('编辑');
  const hasNarrowNav = narrowText.includes('物料管理') || narrowText.includes('标准管理');

  console.log(`  Cards with CRUD visible: ${hasNarrowCards}`);
  console.log(`  Navigation visible: ${hasNarrowNav}`);

  // Click into detail at narrow viewport
  for (const card of await page.locator('article').all()) {
    const text = await card.innerText();
    if (text.includes('MAT')) {
      await card.locator('button:has-text("查看")').click();
      await page.waitForTimeout(3000);
      break;
    }
  }

  const narrowDetailText = await page.locator('body').innerText();
  const hasNarrowTabs = narrowDetailText.includes('编码规则') && narrowDetailText.includes('基础信息');
  const hasNarrowCRUD = narrowDetailText.includes('查看') || narrowDetailText.includes('编辑') || narrowDetailText.includes('版本');

  console.log(`  Tabs at narrow width: ${hasNarrowTabs}`);
  console.log(`  Action buttons at narrow: ${hasNarrowCRUD}`);

  // Final: check back for i18n fallbacks in en-US mode
  // Find and click language switcher
  const enBtn = page.locator('button:has-text("English")').first();
  if (await enBtn.count() > 0) {
    await enBtn.click();
    await page.waitForTimeout(2000);
    const enText = await page.locator('body').innerText();
    console.log(`\nen-US mode content (first 1000):\n${enText.slice(0, 1000)}`);
  }

  await browser.close();
  console.log('\n=== All verifications complete ===');
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });