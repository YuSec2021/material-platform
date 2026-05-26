/**
 * Sprint 31 Evaluation - Targeted Verification
 * Fixed API calls and better selectors
 */

import { chromium } from 'playwright';

const BASE = 'http://localhost:5173';
const API_BASE = 'http://localhost:8000';

// Quick browser check
async function quickBrowserCheck() {
  console.log('=== Quick Browser Verification ===');
  const ctx = await chromium.launch({ headless: true });
  const page = await ctx.newPage();

  // Login
  await page.goto(`${BASE}/login`);
  await page.waitForLoadState('networkidle');

  const usernameInput = page.locator('input[type="text"]').first();
  await usernameInput.fill('super_admin');
  const pw = page.locator('input[type="password"]').first();
  await pw.fill('');
  await page.click('button[type="submit"]');
  await page.waitForURL('**/material**', { timeout: 10000 }).catch(() => {});

  // Navigate to material library list
  await page.goto(`${BASE}/material/library`);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(3000);

  // Check if the page loaded
  const pageContent = await page.content();
  console.log(`Page loaded, content length: ${pageContent.length}`);

  // Check for library table
  const hasTable = pageContent.includes('物料库') || pageContent.includes('Material Library') || pageContent.includes('table');
  console.log(`Library list visible: ${hasTable}`);

  // Find the auto-code library we created
  const hasTestLib = pageContent.includes('Test_S31_AutoCode') || pageContent.includes('Sprint31');
  console.log(`Test library visible: ${hasTestLib}`);

  // Click on first library link
  const libLinks = page.locator('table tbody tr td a, .library-row a, a[href*="library"]');
  const libCount = await libLinks.count();
  console.log(`Library links found: ${libCount}`);

  if (libCount > 0) {
    await libLinks.first().click();
    await page.waitForTimeout(3000);

    const detailContent = await page.content();
    const hasTabs = detailContent.includes('编码规则') || detailContent.includes('基础信息');
    console.log(`Library detail page with tabs: ${hasTabs}`);

    const hasCodeRuleTab = detailContent.includes('编码规则');
    const hasMaterialsTab = detailContent.includes('物料列表') || detailContent.includes('materials');
    const hasMappingsTab = detailContent.includes('编码映射');
    const hasRecodesTab = detailContent.includes('重编码');

    console.log(`Tabs: 编码规则=${hasCodeRuleTab}, 物料列表=${hasMaterialsTab}, 编码映射=${hasMappingsTab}, 重编码=${hasRecodesTab}`);

    // Check for i18n fallbacks
    const fallbackPatterns = ['codeRule.', 'recode.', 'mapping.', 'undefined', 'missing'];
    let hasFallback = false;
    for (const p of fallbackPatterns) {
      if (detailContent.includes(p)) {
        hasFallback = true;
        console.log(`Fallback found: ${p}`);
      }
    }
    console.log(`No i18n fallbacks: ${!hasFallback}`);

    // Narrow viewport test
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(500);
    const narrowContent = await page.content();
    const hasNarrowTabs = narrowContent.includes('编码规则') || narrowContent.includes('基础信息');
    console.log(`Narrow viewport (390x844) tabs visible: ${hasNarrowTabs}`);
  }

  // Check language switcher
  const langSwitch = page.locator('button:has-text("中"), button:has-text("EN"), button:has-text("English")');
  const langCount = await langSwitch.count();
  console.log(`Language switcher found: ${langCount > 0}`);

  await ctx.close();
  console.log('\nBrowser verification complete.');
}

// Check API for auto-code library
async function checkAutoCodeAPI() {
  console.log('\n=== API Verification ===');
  const headers = {
    'X-Username': 'super_admin',
    'X-User-Role': 'super_admin',
    'Authorization': 'Bearer super_admin',
    'Content-Type': 'application/json'
  };

  // Find auto-code-enabled library
  const libs = await fetch(`${API_BASE}/api/v1/material-libraries`, { headers: Object.fromEntries(Object.entries(headers)) })
    .then(r => r.json()).catch(() => []);

  const autoCodeLib = Array.isArray(libs) ? libs.find(l => l.auto_code_enabled && l.current_rule_version_id) : null;

  if (autoCodeLib) {
    console.log(`Auto-code library found: ${autoCodeLib.name} (ID: ${autoCodeLib.id})`);
    console.log(`Code rule version: ${autoCodeLib.current_rule_version_id}`);
    console.log(`Material count: ${autoCodeLib.material_count}`);

    // Get code rule
    const rule = await fetch(`${API_BASE}/api/v1/material-libraries/${autoCodeLib.id}/code-rules/current`, { headers: Object.fromEntries(Object.entries(headers)) })
      .then(r => r.json()).catch(() => null);
    console.log(`Current rule segments: ${JSON.stringify(rule?.segments ?? [])}`);
    console.log(`Separator: ${rule?.separator ?? '-'}`);

    // Check materials in this library
    const mats = await fetch(`${API_BASE}/api/v1/materials?material_library_id=${autoCodeLib.id}`, { headers: Object.fromEntries(Object.entries(headers)) })
      .then(r => r.json()).catch(() => []);

    if (Array.isArray(mats) && mats.length > 0) {
      console.log(`Materials in library: ${mats.length}`);
      const firstMat = mats[0];
      console.log(`First material: ${firstMat.name}, code=${firstMat.code}`);
    } else if (mats?.data) {
      const matList = mats.data;
      console.log(`Materials in library: ${matList.length}`);
      if (matList.length > 0) {
        console.log(`First material: ${matList[0].name}, code=${matList[0].code}`);
      }
    }
  } else {
    console.log('No auto-code-enabled library found');
  }
}

// Check i18n completeness
async function checkI18n() {
  console.log('\n=== i18n Completeness Check ===');
  const i18nFile = await import('fs').then(fs => fs.readFileSync('/Users/yusec/projects/material_retrieval/prototype_code/src/app/i18n.ts', 'utf8'));

  // Check for all required i18n sections
  const sections = [
    'codeRule',
    'codeRuleDetail',
    'codeRuleRecode',
    'material',
    'segment',
    'serial',
    'recode',
    'mapping',
    'conflict',
    'export'
  ];

  for (const section of sections) {
    const count = (i18nFile.match(new RegExp(`"${section}[^"]*":`, 'g')) || []).length;
    console.log(`  ${section}: ${count} keys`);
  }

  // Check en translations
  const enSection = i18nFile.indexOf('"en"');
  const enCount = i18nFile.substring(enSection).split('"').length;
  console.log(`  en translations available: ${enSection > 0}`);
}

// Verify segment builder implementation details
async function checkSegmentBuilder() {
  console.log('\n=== Segment Builder Implementation ===');
  const detailFile = await import('fs').then(fs => fs.readFileSync('/Users/yusec/projects/material_retrieval/prototype_code/src/app/components/pages/material/MaterialLibraryDetail.tsx', 'utf8'));

  const checks = {
    dragReorder: /GripVertical|moveUp|moveDown|drag|reorder/i.test(detailFile),
    segmentIcons: /segmentIconMap|Type|Layers|Tags|Calendar|Hash/.test(detailFile),
    helpTooltips: /helpTooltip|segmentHelp|HelpCircle|tooltip|Info/i.test(detailFile),
    validation: /isInvalid|error|validation|segment.*error|red.*border/i.test(detailFile),
    autocomplete: /AutoComplete|autocomplete|showSearch/i.test(detailFile),
    csvImport: /CSV|csv|import.*csv|Upload/i.test(detailFile),
    serialScope: /serialScope|scope.*preview|nextValue|currentValue/i.test(detailFile),
  };

  for (const [key, val] of Object.entries(checks)) {
    console.log(`  ${key}: ${val}`);
  }

  // Check MaterialList for auto-code integration
  const matListFile = await import('fs').then(fs => fs.readFileSync('/Users/yusec/projects/material_retrieval/prototype_code/src/app/components/pages/material/MaterialList.tsx', 'utf8'));

  const matListChecks = {
    autoCodeEnabled: /auto_code_enabled|autoCodeEnabled/i.test(matListFile),
    codePreview: /materialCodePreview|buildMaterialCodePreview/i.test(matListFile),
    readOnlyCodeField: /readOnly|disabled.*code|code.*auto/i.test(matListFile),
    previewError: /autoCodePending|autoCodeLoading|autoCodePreview/i.test(matListFile),
  };

  console.log('\n=== Material Auto-Code Integration ===');
  for (const [key, val] of Object.entries(matListChecks)) {
    console.log(`  ${key}: ${val}`);
  }
}

async function main() {
  await checkAutoCodeAPI();
  await checkI18n();
  await checkSegmentBuilder();
  await quickBrowserCheck();

  console.log('\n=== All Checks Complete ===');
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });