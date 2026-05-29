/**
 * Sprint 31 Evaluation - Click through to detail page
 */

import { chromium } from 'playwright';

const BASE = 'http://localhost:5173';
const API_BASE = 'http://localhost:8000';

async function waitForReact(page, timeout = 15000) {
  try {
    await page.waitForFunction(() => document.querySelector('#root')?.children.length > 0, { timeout });
  } catch { /* ignore */ }
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1000);
}

async function main() {
  console.log('Sprint 31 - Click through to library detail\n');

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

  // Find the Sprint 26 library with auto_code_enabled
  // From earlier: Sprint 26 Library MAT 1778825487899583000 (ID: 63)
  // Navigate directly to its detail page
  await page.goto(`${BASE}/material/library/63`, { timeout: 15000 });
  await waitForReact(page);
  await page.waitForTimeout(5000);

  const bodyText = await page.locator('body').innerText();
  console.log(`Library detail page text (first 3000 chars):\n${bodyText.slice(0, 3000)}`);

  // Check tabs
  const hasBasic = bodyText.includes('基础信息');
  const hasCodeRule = bodyText.includes('编码规则');
  const hasVersions = bodyText.includes('规则版本') || bodyText.includes('版本');
  const hasMaterials = bodyText.includes('物料列表');
  const hasRecodes = bodyText.includes('重编码记录') || bodyText.includes('重编码');
  const hasMappings = bodyText.includes('编码映射');

  console.log(`\n=== Tabs ===`);
  console.log(`基础信息: ${hasBasic}`);
  console.log(`编码规则: ${hasCodeRule}`);
  console.log(`规则版本: ${hasVersions}`);
  console.log(`物料列表: ${hasMaterials}`);
  console.log(`重编码记录: ${hasRecodes}`);
  console.log(`编码映射: ${hasMappings}`);

  // Navigate to 编码规则 tab
  console.log(`\n=== Clicking 编码规则 tab ===`);
  const codeRuleTab = page.locator('button:has-text("编码规则"), [role="tab"]:has-text("编码规则")').first();
  if (await codeRuleTab.count() > 0) {
    await codeRuleTab.click();
    await page.waitForTimeout(2000);
    const codeRuleText = await page.locator('body').innerText();
    console.log(`Code rule tab content (first 2000 chars):\n${codeRuleText.slice(0, 2000)}`);

    // Check for segment builder UI elements
    const hasSegment = codeRuleText.includes('片段') || codeRuleText.includes('segment');
    const hasDrag = codeRuleText.includes('GripVertical') || codeRuleText.includes('drag');
    const hasFixedText = codeRuleText.includes('固定文本');
    const hasSerial = codeRuleText.includes('流水号');
    const hasDate = codeRuleText.includes('日期');
    const hasAttrCode = codeRuleText.includes('属性编码');
    const hasEditBtn = codeRuleText.includes('编辑规则');

    console.log(`\nSegment builder elements:`);
    console.log(`  Segment UI: ${hasSegment}`);
    console.log(`  Drag handles: ${hasDrag}`);
    console.log(`  Fixed text: ${hasFixedText}`);
    console.log(`  Serial: ${hasSerial}`);
    console.log(`  Date: ${hasDate}`);
    console.log(`  Attribute code: ${hasAttrCode}`);
    console.log(`  Edit button: ${hasEditBtn}`);

    // Click 编辑规则
    if (codeRuleText.includes('编辑规则')) {
      const editBtn = page.locator('button:has-text("编辑规则")').first();
      if (await editBtn.count() > 0) {
        await editBtn.click();
        await page.waitForTimeout(3000);
        const editText = await page.locator('body').innerText();
        console.log(`\nEdit rule page content (first 3000 chars):\n${editText.slice(0, 3000)}`);

        const hasAddSegment = editText.includes('添加片段') || editText.includes('Add Segment');
        const hasHelpTooltips = editText.includes('说明') || editText.includes('help');
        const hasCSVImport = editText.includes('CSV') || editText.includes('csv') || editText.includes('导入');
        const hasSerialPreview = editText.includes('预览') || editText.includes('preview') || editText.includes('当前值');

        console.log(`\nSegment builder in edit mode:`);
        console.log(`  Add segment: ${hasAddSegment}`);
        console.log(`  Help tooltips: ${hasHelpTooltips}`);
        console.log(`  CSV import: ${hasCSVImport}`);
        console.log(`  Serial preview: ${hasSerialPreview}`);
      }
    }
  } else {
    console.log('编码规则 tab not found, looking for tabs...');
    const tabs = await page.locator('[role="tab"], button:has-text("基础"), button:has-text("规则")').all();
    for (const tab of tabs.slice(0, 10)) {
      const text = await tab.innerText().catch(() => '');
      console.log(`  Tab: "${text.trim()}"`);
    }
  }

  // Navigate to 编码映射 tab
  console.log(`\n=== Code Mappings Tab ===`);
  await page.goto(`${BASE}/material/library/63`, { timeout: 15000 });
  await waitForReact(page);
  await page.waitForTimeout(3000);

  const mappingsTab = page.locator('button:has-text("编码映射"), [role="tab"]:has-text("编码映射")').first();
  if (await mappingsTab.count() > 0) {
    await mappingsTab.click();
    await page.waitForTimeout(3000);
    const mappingsText = await page.locator('body').innerText();
    console.log(`Mappings content (first 2000 chars):\n${mappingsText.slice(0, 2000)}`);

    const hasSearch = mappingsText.includes('搜索') || mappingsText.includes('查询') || mappingsText.includes('search');
    const hasDateFilter = mappingsText.includes('日期') || mappingsText.includes('date') || mappingsText.includes('from');
    const hasBatchFilter = mappingsText.includes('批次') || mappingsText.includes('batch');
    const hasExport = mappingsText.includes('导出');
    const hasCSV = mappingsText.includes('CSV');
    const hasExcel = mappingsText.includes('Excel');

    console.log(`\nExport features:`);
    console.log(`  Search: ${hasSearch}`);
    console.log(`  Date filter: ${hasDateFilter}`);
    console.log(`  Batch filter: ${hasBatchFilter}`);
    console.log(`  Export: ${hasExport}`);
    console.log(`  CSV: ${hasCSV}`);
    console.log(`  Excel: ${hasExcel}`);
  }

  // Responsive check
  console.log(`\n=== Responsive (390x844) ===`);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(1000);
  const narrowText = await page.locator('body').innerText();
  const hasNarrowTabs = narrowText.includes('编码规则') || narrowText.includes('基础信息');
  const hasNarrowCRUD = narrowText.includes('查看') || narrowText.includes('编辑');
  console.log(`  Tabs visible: ${hasNarrowTabs}`);
  console.log(`  CRUD buttons: ${hasNarrowCRUD}`);

  // i18n check
  console.log(`\n=== i18n Fallback Check ===`);
  const fallbacks = ['codeRule.', 'recode.', 'mapping.', 'undefined', 'missing'];
  let foundFallback = null;
  for (const f of fallbacks) {
    if (bodyText.includes(f)) {
      foundFallback = f;
      break;
    }
  }
  console.log(`  No fallback keys: ${foundFallback === null} (${foundFallback})`);

  await browser.close();
  console.log('\n=== Done ===');
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });