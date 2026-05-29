/**
 * Sprint 31 Evaluation - Reliable Browser Check
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
  console.log('Sprint 31 Evaluation - Browser Verification\n');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  // 1. Login
  console.log('1. Logging in...');
  try {
    await page.goto(`${BASE}/login`, { timeout: 15000 });
    await waitForReact(page);
    await page.waitForTimeout(2000);

    // Try various login form approaches
    const inputs = await page.locator('input').all();
    console.log(`   Inputs found: ${inputs.length}`);
    for (const input of inputs.slice(0, 5)) {
      const type = await input.getAttribute('type');
      const placeholder = await input.getAttribute('placeholder');
      console.log(`   Input: type=${type}, placeholder=${placeholder}`);
    }

    // Find username and password fields
    const usernameField = page.locator('input[type="text"], input[placeholder*="用户"], input[placeholder*="user"], input[placeholder*="账"]').first();
    const passwordField = page.locator('input[type="password"]').first();

    await usernameField.fill('super_admin', { timeout: 5000 });
    await passwordField.fill('', { timeout: 5000 });
    await page.click('button[type="submit"]', { timeout: 5000 });
    await page.waitForTimeout(3000);
    console.log('   Login submitted');
  } catch (e) {
    console.log(`   Login error: ${e.message.split('\n')[0]}`);
  }

  // 2. Navigate to material library
  console.log('\n2. Navigating to material library...');
  try {
    await page.goto(`${BASE}/material/library`, { timeout: 15000 });
    await waitForReact(page);
    await page.waitForTimeout(3000);

    const content = await page.content();
    console.log(`   Page content length: ${content.length}`);

    // Check for library list
    const hasMaterialLibrary = content.includes('物料库') || content.includes('Material Library');
    console.log(`   Material library page loaded: ${hasMaterialLibrary}`);

    // Check for table rows
    const rows = await page.locator('table tbody tr').count();
    console.log(`   Table rows: ${rows}`);

    // 3. Navigate to library detail (find first auto-code library)
    if (rows > 0) {
      const firstLink = page.locator('table tbody tr:first-child td a').first();
      const linkHref = await firstLink.getAttribute('href').catch(() => null);
      console.log(`   First library link: ${linkHref}`);

      if (linkHref) {
        await page.goto(`${BASE}${linkHref}`, { timeout: 15000 });
        await waitForReact(page);
        await page.waitForTimeout(3000);

        const detailContent = await page.content();

        // Check tabs
        const hasBasic = detailContent.includes('基础信息');
        const hasCodeRule = detailContent.includes('编码规则');
        const hasVersions = detailContent.includes('版本');
        const hasMaterials = detailContent.includes('物料列表');
        const hasRecodes = detailContent.includes('重编码');
        const hasMappings = detailContent.includes('编码映射');

        console.log(`\n3. Library detail tabs:`);
        console.log(`   基础信息: ${hasBasic}`);
        console.log(`   编码规则: ${hasCodeRule}`);
        console.log(`   版本: ${hasVersions}`);
        console.log(`   物料列表: ${hasMaterials}`);
        console.log(`   重编码: ${hasRecodes}`);
        console.log(`   编码映射: ${hasMappings}`);

        // Click 编码规则 tab
        const codeRuleTab = page.locator('text=编码规则').first();
        if (await codeRuleTab.count() > 0) {
          await codeRuleTab.click();
          await page.waitForTimeout(2000);

          const codeRuleContent = await page.content();

          // Check for segment builder
          const hasSegmentBuilder = codeRuleContent.includes('片段') || codeRuleContent.includes('segment') || codeRuleContent.includes('Segment');
          const hasDragHandles = codeRuleContent.includes('GripVertical') || codeRuleContent.includes('drag');
          const hasIcons = codeRuleContent.includes('Type') || codeRuleContent.includes('Layers') || codeRuleContent.includes('Hash');
          const hasHelp = codeRuleContent.includes('HelpCircle') || codeRuleContent.includes('help');

          console.log(`\n4. Code rule segment builder:`);
          console.log(`   Segment builder UI: ${hasSegmentBuilder}`);
          console.log(`   Drag handles: ${hasDragHandles}`);
          console.log(`   Type icons: ${hasIcons}`);
          console.log(`   Help tooltips: ${hasHelp}`);

          // Click 编辑规则
          const editBtn = page.locator('text=编辑规则, text=编辑').first();
          if (await editBtn.count() > 0) {
            await editBtn.click();
            await page.waitForTimeout(2000);

            const editContent = await page.content();
            const hasSegments = editContent.includes('添加片段') || editContent.includes('Add Segment');
            const hasFixedText = editContent.includes('固定文本') || editContent.includes('Fixed');
            const hasSerial = editContent.includes('流水号') || editContent.includes('Serial');
            const hasDate = editContent.includes('日期') || editContent.includes('Date');
            const hasAttrCode = editContent.includes('属性编码') || editContent.includes('Attribute');

            console.log(`   Add segment button: ${hasSegments}`);
            console.log(`   Fixed text type: ${hasFixedText}`);
            console.log(`   Serial type: ${hasSerial}`);
            console.log(`   Date type: ${hasDate}`);
            console.log(`   Attribute code type: ${hasAttrCode}`);
          }
        }

        // Click 编码映射 tab
        const mappingsTab = page.locator('text=编码映射').first();
        if (await mappingsTab.count() > 0) {
          await mappingsTab.click();
          await page.waitForTimeout(2000);

          const mappingContent = await page.content();
          const hasSearch = mappingContent.includes('搜索') || mappingContent.includes('search') || mappingContent.includes('查询');
          const hasDateFilter = mappingContent.includes('日期') || mappingContent.includes('date');
          const hasBatchFilter = mappingContent.includes('批次') || mappingContent.includes('batch');
          const hasExport = mappingContent.includes('导出') || mappingContent.includes('export');
          const hasCSVOption = mappingContent.includes('CSV');
          const hasExcelOption = mappingContent.includes('Excel');

          console.log(`\n5. Code mapping export:`);
          console.log(`   Search: ${hasSearch}`);
          console.log(`   Date filter: ${hasDateFilter}`);
          console.log(`   Batch filter: ${hasBatchFilter}`);
          console.log(`   Export button: ${hasExport}`);
          console.log(`   CSV option: ${hasCSVOption}`);
          console.log(`   Excel option: ${hasExcelOption}`);
        }

        // i18n check - look for fallback keys
        console.log(`\n6. i18n check:`);
        const fallbacks = ['codeRule.', 'recode.', 'mapping.', 'undefined', 'missing', 'i18n.'];
        let fallbackFound = null;
        for (const f of fallbacks) {
          if (detailContent.includes(f)) {
            fallbackFound = f;
            break;
          }
        }
        console.log(`   No fallback keys: ${fallbackFound === null} (found: ${fallbackFound})`);

        // Narrow viewport
        console.log(`\n7. Responsive (390x844):`);
        await page.setViewportSize({ width: 390, height: 844 });
        await page.waitForTimeout(1000);
        const narrowContent = await page.content();
        const hasNarrowTabs = narrowContent.includes('编码规则') || narrowContent.includes('基础信息');
        console.log(`   Tabs visible at narrow width: ${hasNarrowTabs}`);
      }
    }
  } catch (e) {
    console.log(`   Navigation error: ${e.message.split('\n')[0]}`);
  }

  await browser.close();
  console.log('\n=== Verification Complete ===');
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });