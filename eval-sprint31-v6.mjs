/**
 * Sprint 31 - Navigate to library detail via UI click, not direct URL
 */

import { chromium } from 'playwright';

const BASE = 'http://localhost:5173';

async function main() {
  console.log('Sprint 31 - Navigate via UI click\n');

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

  // Material library list
  await page.goto(`${BASE}/material/library`, { timeout: 15000 });
  await page.waitForTimeout(5000);

  // Find auto-code-enabled library and click its view button
  const bodyText = await page.locator('body').innerText();

  // Look for library cards with "自动编码" badge (auto_code_enabled)
  const autoCodeCards = await page.locator('article').all();
  console.log(`Library cards found: ${autoCodeCards.length}`);

  for (let i = 0; i < Math.min(autoCodeCards.length, 5); i++) {
    const card = autoCodeCards[i];
    const text = await card.innerText();
    const hasAutoCode = text.includes('自动编码') || text.includes('自动编码');
    const hasView = text.includes('查看');
    console.log(`Card ${i}: auto_code=${hasAutoCode}, has_view=${hasView}`);
    if (text.includes('MAT') && text.includes('自动编码')) {
      console.log(`  Found Sprint 26 MAT library`);
    }
  }

  // Find a card with auto_code and click its View button
  const allCards = await page.locator('article').all();
  for (const card of allCards) {
    const text = await card.innerText();
    // Check if this is an auto-code library
    if (text.includes('自动编码') || text.includes('MAT')) {
      // Click the "查看" button
      const viewBtn = card.locator('button:has-text("查看")');
      if (await viewBtn.count() > 0) {
        console.log('\nClicking view button on auto-code library...');
        await viewBtn.click();
        await page.waitForTimeout(3000);

        const detailText = await page.locator('body').innerText();
        console.log(`Detail page text (first 3000 chars):\n${detailText.slice(0, 3000)}`);

        // Check tabs
        const hasBasic = detailText.includes('基础信息');
        const hasCodeRule = detailText.includes('编码规则');
        const hasMaterials = detailText.includes('物料列表');
        const hasMappings = detailText.includes('编码映射');

        console.log(`\n=== Tabs ===`);
        console.log(`基础信息: ${hasBasic}`);
        console.log(`编码规则: ${hasCodeRule}`);
        console.log(`物料列表: ${hasMaterials}`);
        console.log(`编码映射: ${hasMappings}`);

        // Click 编码规则
        if (hasCodeRule) {
          await page.locator('button:has-text("编码规则"), [role="tab"]:has-text("编码规则")').first().click();
          await page.waitForTimeout(2000);
          const crText = await page.locator('body').innerText();
          console.log(`\n编码规则 tab content (first 2000):\n${crText.slice(0, 2000)}`);

          const hasEditRule = crText.includes('编辑规则');
          console.log(`编辑规则 button: ${hasEditRule}`);

          if (hasEditRule) {
            await page.locator('button:has-text("编辑规则")').first().click();
            await page.waitForTimeout(3000);
            const editText = await page.locator('body').innerText();
            console.log(`\nEdit rule content (first 3000):\n${editText.slice(0, 3000)}`);

            const hasAddSeg = editText.includes('添加') || editText.includes('segment') || editText.includes('Segment');
            const hasFixedText = editText.includes('固定文本') || editText.includes('Fixed');
            const hasSerial = editText.includes('流水号') || editText.includes('Serial');
            const hasHelp = editText.includes('说明') || editText.includes('help');
            const hasCSV = editText.includes('CSV') || editText.includes('csv') || editText.includes('导入');

            console.log(`\nSegment builder: add=${hasAddSeg}, fixed=${hasFixedText}, serial=${hasSerial}, help=${hasHelp}, csv=${hasCSV}`);
          }
        }

        // Click 编码映射
        if (hasMappings) {
          await page.locator('button:has-text("编码映射"), [role="tab"]:has-text("编码映射")').first().click();
          await page.waitForTimeout(2000);
          const mapText = await page.locator('body').innerText();
          console.log(`\n编码映射 content (first 2000):\n${mapText.slice(0, 2000)}`);

          const hasSearch = mapText.includes('搜索') || mapText.includes('查询');
          const hasDateFilter = mapText.includes('日期');
          const hasBatchFilter = mapText.includes('批次');
          const hasExport = mapText.includes('导出');
          const hasCSV = mapText.includes('CSV');
          const hasExcel = mapText.includes('Excel');

          console.log(`\nExport features: search=${hasSearch}, date=${hasDateFilter}, batch=${hasBatchFilter}, export=${hasExport}, csv=${hasCSV}, excel=${hasExcel}`);
        }

        // Click 物料列表
        if (hasMaterials) {
          await page.locator('button:has-text("物料列表"), [role="tab"]:has-text("物料列表")').first().click();
          await page.waitForTimeout(3000);
          const matText = await page.locator('body').innerText();

          // Look for 新增物料 or similar
          const hasCreateBtn = matText.includes('新增物料') || matText.includes('新建物料') || matText.includes('AI');
          console.log(`\n物料列表: create_btn=${hasCreateBtn}`);

          if (hasCreateBtn) {
            // Click the primary add button (blue one, not AI buttons)
            const addBtn = page.locator('button:bg-blue-600, .bg-blue-600 button, button:has-text("新增物料"), button:has-text("新建物料")').first();
            await addBtn.click().catch(() => {});
            await page.waitForTimeout(3000);

            const formText = await page.locator('body').innerText();
            const hasCodeField = formText.includes('物料编码') || formText.includes('编码');
            const hasAutoCode = formText.includes('自动编码') || formText.includes('待生成') || formText.includes('preview');

            console.log(`Material form: code_field=${hasCodeField}, auto_code_preview=${hasAutoCode}`);
          }
        }

        // Responsive
        await page.setViewportSize({ width: 390, height: 844 });
        await page.waitForTimeout(1000);
        const narrowText = await page.locator('body').innerText();
        const hasNarrowTabs = narrowText.includes('编码规则') || narrowText.includes('基础信息');
        console.log(`\nResponsive (390x844): tabs=${hasNarrowTabs}`);

        // i18n fallback
        const fallbacks = ['codeRule.', 'recode.', 'mapping.', 'undefined', 'missing'];
        let foundFallback = null;
        for (const f of fallbacks) {
          if (detailText.includes(f)) foundFallback = f;
        }
        console.log(`i18n no fallback: ${foundFallback === null}`);

        break;
      }
    }
  }

  await browser.close();
  console.log('\n=== Done ===');
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });