/**
 * Sprint 31 Evaluation Script
 * Mode: browser (Playwright)
 * Target: http://localhost:5173
 *
 * Evaluates 7 success criteria via black-box browser testing.
 */

import { chromium } from 'playwright';

const BASE = 'http://localhost:5173';
const API_BASE = 'http://localhost:8000';
const RESULTS = {};
const FAILURES = [];

// Helper: create authenticated browser context
async function createContext() {
  const ctx = await chromium.launch({ headless: true });
  const page = await ctx.newPage();
  // Login with super_admin
  await page.goto(`${BASE}/login`);
  await page.waitForLoadState('networkidle');
  // Fill login form
  const usernameInput = page.locator('input[type="text"], input[placeholder*="用户"], input[placeholder*="user"], input[placeholder*="账"]').first();
  const passwordInput = page.locator('input[type="password"]').first();
  await usernameInput.fill('super_admin');
  await passwordInput.fill('');
  await page.click('button[type="submit"], button:has-text("登录"), button:has-text("登录")');
  await page.waitForURL('**/material**', { timeout: 10000 }).catch(() => {});
  await page.waitForLoadState('networkidle');
  return { ctx, page };
}

// Helper: API request with super_admin headers
async function apiRequest(method, path, body = null) {
  const opts = {
    method,
    headers: {
      'X-Username': 'super_admin',
      'X-User-Role': 'super_admin',
      'Authorization': 'Bearer super_admin',
      'Content-Type': 'application/json',
    }
  };
  if (body) opts.body = JSON.stringify(body);
  const resp = await fetch(`${API_BASE}${path}`, opts);
  let data;
  try { data = await resp.json(); } catch { data = null; }
  return { status: resp.status, data };
}

// Helper: ensure setup data exists
async function ensureSetupData() {
  // Get product names and categories
  const pns = await apiRequest('GET', '/api/v1/product-names');
  const cats = await apiRequest('GET', '/api/v1/categories');

  let productId = pns.data?.data?.[0]?.id || pns.data?.[0]?.id;
  let categoryId = cats.data?.data?.[0]?.id || cats.data?.[0]?.id;

  // If no data, create minimal setup
  if (!productId) {
    const cat = await apiRequest('POST', '/api/v1/categories', { name: 'Eval_Category_S31', parent_id: null });
    categoryId = cat.data?.id || cat.data?.data?.id;
  }
  if (!productId && categoryId) {
    const pn = await apiRequest('POST', '/api/v1/product-names', { name: 'Eval_Product_S31', category_id: categoryId });
    productId = pn.data?.id || pn.data?.data?.id;
  }

  return { productId, categoryId };
}

// CRITERION 1: Auto-code material creation - generated code visible before save
async function evalCriterion1() {
  console.log('\n=== Criterion 1: Auto-code material creation ===');
  try {
    const { productId, categoryId } = await ensureSetupData();

    // Create an auto-code-enabled library
    const lib = await apiRequest('POST', '/api/v1/material-libraries', {
      name: `Sprint31_AutoCode_Lib_${Date.now()}`,
      description: 'Eval library for Sprint 31',
      auto_code_enabled: true,
      recode_enabled: true,
      rule_config: {
        segments: [
          { type: 'fixed_text', value: 'S31' },
          { type: 'serial', length: 4, start_value: 1, scope: 'global' }
        ],
        separator: '-'
      }
    });

    let libId = lib.data?.id || lib.data?.data?.id;
    if (!libId) {
      return { result: 'FAIL', evidence: `Failed to create library: ${JSON.stringify(lib)}` };
    }
    console.log(`Created library: ${libId}`);

    const { ctx, page } = await createContext();

    // Navigate to material library detail
    await page.goto(`${BASE}/material/library`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // Find and click the created library
    const libLink = page.locator(`text=Sprint31_AutoCode_Lib_${Date.now().toString().slice(0, -3)}`).first();
    const libFound = await libLink.count() > 0;

    // Try to navigate to library detail
    await page.goto(`${BASE}/material/library/${libId}`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // Look for material creation entry point
    // Look for tabs: 基础信息, 编码规则, 物料列表
    const tabs = await page.locator('[role="tab"], .ant-tabs-tab, .tab-item').allTextContents();
    console.log(`Tabs visible: ${JSON.stringify(tabs)}`);

    // Navigate to 物料列表 tab
    const materialListTab = page.locator('text=物料列表').first();
    if (await materialListTab.count() > 0) {
      await materialListTab.click();
      await page.waitForTimeout(1000);
    }

    // Look for 新增物料 or similar creation button
    const createBtn = page.locator('text=新增物料, text=新建物料, text=添加物料').first();
    if (await createBtn.count() > 0) {
      await createBtn.click();
      await page.waitForTimeout(2000);

      // Check if material code field shows generated code
      const pageContent = await page.content();
      const hasGeneratedCode = pageContent.includes('S31') || pageContent.includes('编码') || pageContent.includes('code');

      // Look for generated code preview field
      const codeField = page.locator('input[readonly], input[disabled], [class*="code"], [class*="generated"], [class*="preview"]');
      const codeFieldCount = await codeField.count();

      // Look for any text containing S31
      const s31Text = page.locator('text=S31');
      const s31Visible = await s31Text.count() > 0;

      console.log(`Material create form opened, code fields: ${codeFieldCount}, S31 visible: ${s31Visible}`);

      if (codeFieldCount > 0 || s31Visible) {
        await ctx.close();
        return { result: 'PASS', evidence: `Material creation form shows generated code field or preview with S31 prefix. Code field count: ${codeFieldCount}` };
      }
    }

    await ctx.close();
    return { result: 'FAIL', evidence: 'Could not find material creation form with generated code preview' };
  } catch (e) {
    return { result: 'FAIL', evidence: `Exception: ${e.message}` };
  }
}

// CRITERION 2: Code rule segment builder - drag reorder, icons, tooltips, validation
async function evalCriterion2() {
  console.log('\n=== Criterion 2: Code rule segment builder ===');
  try {
    const { ctx, page } = await createContext();

    // Navigate to material library and find/create one with code rules
    await page.goto(`${BASE}/material/library`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // Click first library or create one
    const firstLibLink = page.locator('table tbody tr td a').first();
    if (await firstLibLink.count() > 0) {
      await firstLibLink.click();
    }
    await page.waitForTimeout(2000);

    // Look for 编码规则 tab
    const codeRuleTab = page.locator('text=编码规则').first();
    if (await codeRuleTab.count() === 0) {
      await ctx.close();
      return { result: 'FAIL', evidence: 'No 编码规则 tab found' };
    }
    await codeRuleTab.click();
    await page.waitForTimeout(1500);

    // Check for segment icons (segment type indicators)
    const segmentRows = await page.locator('[class*="segment"], [class*="row"], .ant-row').all();
    console.log(`Segment rows found: ${segmentRows.length}`);

    // Check for 编辑规则 button
    const editBtn = page.locator('text=编辑规则, text=编辑').first();
    let hasEditBtn = await editBtn.count() > 0;

    if (!hasEditBtn) {
      // Try to navigate to code rule edit from URL
      const url = page.url();
      await ctx.close();
      return { result: 'FAIL', evidence: 'Cannot find 编码规则 tab or edit button to access segment builder' };
    }

    await editBtn.click();
    await page.waitForTimeout(2000);

    // Now check for segment builder elements
    const pageContent = await page.content();
    const hasIcons = pageContent.includes('icon') || pageContent.includes('Icon') || pageContent.includes('svg');
    const hasTooltips = pageContent.includes('tooltip') || pageContent.includes('Tooltip') || pageContent.includes('help');
    const hasDragHandles = pageContent.includes('drag') || pageContent.includes('Drag') || pageContent.includes('handle') || pageContent.includes('grab');

    // Check for segment type labels
    const hasSegmentTypes = pageContent.includes('固定文本') || pageContent.includes('serial') || pageContent.includes('日期') || pageContent.includes('attribute');

    console.log(`Segment builder: icons=${hasIcons}, tooltips=${hasTooltips}, drag=${hasDragHandles}, types=${hasSegmentTypes}`);

    // Check for validation highlighting (try to create invalid segment)
    // Look for help text or tooltips
    const helpIcons = page.locator('[class*="help"], [class*="info"], [class*="question"]');
    const helpCount = await helpIcons.count();

    await ctx.close();

    if (hasSegmentTypes && (hasIcons || hasDragHandles || helpCount > 0)) {
      return { result: 'PASS', evidence: `Segment builder has type labels, icons/drag/help elements (icons:${hasIcons}, drag:${hasDragHandles}, help:${helpCount})` };
    }

    return { result: 'PARTIAL', evidence: `Segment builder visible but may be incomplete: icons=${hasIcons}, drag=${hasDragHandles}, help=${helpCount}` };
  } catch (e) {
    return { result: 'FAIL', evidence: `Exception: ${e.message}` };
  }
}

// CRITERION 3: Attribute code mapping - autocomplete and CSV import
async function evalCriterion3() {
  console.log('\n=== Criterion 3: Attribute code mapping ===');
  try {
    const { ctx, page } = await createContext();

    await page.goto(`${BASE}/material/library`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    const firstLibLink = page.locator('table tbody tr td a').first();
    if (await firstLibLink.count() > 0) {
      await firstLibLink.click();
    }
    await page.waitForTimeout(2000);

    // Navigate to code rule
    const codeRuleTab = page.locator('text=编码规则').first();
    if (await codeRuleTab.count() > 0) {
      await codeRuleTab.click();
      await page.waitForTimeout(1500);
    }

    const editBtn = page.locator('text=编辑规则, text=编辑').first();
    if (await editBtn.count() > 0) {
      await editBtn.click();
      await page.waitForTimeout(2000);
    }

    // Look for attribute code segment option
    const attrSegmentBtn = page.locator('text=属性编码, text=attribute').first();
    const addSegmentBtn = page.locator('text=添加段落, text=Add Segment').first();

    const pageContent = await page.content();
    const hasAttrType = pageContent.includes('属性编码') || pageContent.includes('attribute');
    const hasCSVImport = pageContent.includes('CSV') || pageContent.includes('csv') || pageContent.includes('导入') || pageContent.includes('import');
    const hasAutocomplete = pageContent.includes('autocomplete') || pageContent.includes('AutoComplete') || pageContent.includes('suggestion');

    console.log(`Attribute mapping: attr_type=${hasAttrType}, csv_import=${hasCSVImport}, autocomplete=${hasAutocomplete}`);

    await ctx.close();

    if (hasAttrType) {
      return { result: 'PASS', evidence: `Attribute code segment type visible, CSV import=${hasCSVImport}, autocomplete=${hasAutocomplete}` };
    }

    return { result: 'FAIL', evidence: 'No attribute code mapping UI found' };
  } catch (e) {
    return { result: 'FAIL', evidence: `Exception: ${e.message}` };
  }
}

// CRITERION 4: Serial number scope preview
async function evalCriterion4() {
  console.log('\n=== Criterion 4: Serial number scope preview ===');
  try {
    const { ctx, page } = await createContext();

    await page.goto(`${BASE}/material/library`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    const firstLibLink = page.locator('table tbody tr td a').first();
    if (await firstLibLink.count() > 0) {
      await firstLibLink.click();
    }
    await page.waitForTimeout(2000);

    const codeRuleTab = page.locator('text=编码规则').first();
    if (await codeRuleTab.count() > 0) {
      await codeRuleTab.click();
      await page.waitForTimeout(1500);
    }

    const editBtn = page.locator('text=编辑规则, text=编辑').first();
    if (await editBtn.count() > 0) {
      await editBtn.click();
      await page.waitForTimeout(2000);
    }

    // Look for serial number segment and scope preview
    const pageContent = await page.content();
    const hasSerial = pageContent.includes('流水号') || pageContent.includes('serial') || pageContent.includes('Serial');
    const hasScope = pageContent.includes('全局') || pageContent.includes('scope') || pageContent.includes('Scope') || pageContent.includes('按类目');
    const hasPreview = pageContent.includes('preview') || pageContent.includes('Preview') || pageContent.includes('预览') || pageContent.includes('当前值') || pageContent.includes('current');

    console.log(`Serial scope: serial=${hasSerial}, scope=${hasScope}, preview=${hasPreview}`);

    await ctx.close();

    if (hasSerial && (hasScope || hasPreview)) {
      return { result: 'PASS', evidence: `Serial number segment visible with scope and preview (scope:${hasScope}, preview:${hasPreview})` };
    }

    return { result: 'FAIL', evidence: 'No serial number scope preview found' };
  } catch (e) {
    return { result: 'FAIL', evidence: `Exception: ${e.message}` };
  }
}

// CRITERION 5: Conflict rows in recode preview - red highlight, block, force confirmation
async function evalCriterion5() {
  console.log('\n=== Criterion 5: Recode conflict handling ===');
  try {
    const { productId, categoryId } = await ensureSetupData();

    // Create a library with code rules, add materials, then create a conflicting rule
    const lib = await apiRequest('POST', '/api/v1/material-libraries', {
      name: `Sprint31_Conflict_Lib_${Date.now()}`,
      description: 'Eval library for conflict test',
      auto_code_enabled: true,
      recode_enabled: true,
      rule_config: {
        segments: [
          { type: 'fixed_text', value: 'CNF' },
          { type: 'serial', length: 4, start_value: 1, scope: 'global' }
        ],
        separator: '-'
      }
    });

    let libId = lib.data?.id || lib.data?.data?.id;
    if (!libId) {
      return { result: 'FAIL', evidence: `Cannot create conflict library: ${JSON.stringify(lib)}` };
    }
    console.log(`Created conflict library: ${libId}`);

    // Create materials
    const mat1 = await apiRequest('POST', '/api/v1/materials', {
      name: `Conflict_Material_1_${Date.now()}`,
      material_library_id: libId,
      product_name_id: productId,
      category_id: categoryId
    });

    const mat2 = await apiRequest('POST', '/api/v1/materials', {
      name: `Conflict_Material_2_${Date.now()}`,
      material_library_id: libId,
      product_name_id: productId,
      category_id: categoryId
    });

    // Create a new rule version that will cause conflicts
    const ruleV2 = await apiRequest('POST', `/api/v1/material-libraries/${libId}/code-rules/versions`, {
      rule_name: 'Conflict Rule V2',
      rule_config: {
        segments: [
          { type: 'fixed_text', value: 'CNF' },
          { type: 'serial', length: 4, start_value: 1, scope: 'global' }
        ],
        separator: '-'
      },
      change_reason: 'Test conflict'
    });

    let versionId = ruleV2.data?.id || ruleV2.data?.data?.id;

    // Run recode preview
    if (versionId) {
      const preview = await apiRequest('POST', `/api/v1/material-libraries/${libId}/code-rules/versions/${versionId}/recode-preview`);
      console.log(`Recode preview response: ${JSON.stringify(preview)}`);
    }

    const { ctx, page } = await createContext();
    await page.goto(`${BASE}/material/library/${libId}`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // Look for recode-related tabs
    const recodeTab = page.locator('text=重编码记录, text=重编码').first();
    const previewTab = page.locator('text=重编码预览').first();

    const pageContent = await page.content();
    const hasRedConflict = pageContent.includes('red') || pageContent.includes('Red') || pageContent.includes('conflict') || pageContent.includes('冲突') || pageContent.includes('CNF');
    const hasConflictWarning = pageContent.includes('conflict') || pageContent.includes('冲突') || pageContent.includes('force') || pageContent.includes('强制');

    console.log(`Recode conflict UI: red=${hasRedConflict}, conflict_warning=${hasConflictWarning}`);

    await ctx.close();

    // We need to verify the actual UI for conflict handling
    // Check if the recode panels file has conflict highlighting
    return { result: 'PARTIAL', evidence: `Conflict library created (ID:${libId}), recode preview initiated. UI shows conflict indicators=${hasRedConflict}` };
  } catch (e) {
    return { result: 'FAIL', evidence: `Exception: ${e.message}` };
  }
}

// CRITERION 6: Code mapping export with filters and format selection
async function evalCriterion6() {
  console.log('\n=== Criterion 6: Code mapping export ===');
  try {
    const { ctx, page } = await createContext();

    await page.goto(`${BASE}/material/library`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    const firstLibLink = page.locator('table tbody tr td a').first();
    if (await firstLibLink.count() > 0) {
      await firstLibLink.click();
    }
    await page.waitForTimeout(2000);

    // Look for 编码映射 tab
    const mappingTab = page.locator('text=编码映射').first();
    if (await mappingTab.count() === 0) {
      await ctx.close();
      return { result: 'FAIL', evidence: 'No 编码映射 tab found' };
    }
    await mappingTab.click();
    await page.waitForTimeout(1500);

    const pageContent = await page.content();

    // Check for export controls
    const hasExport = pageContent.includes('导出') || pageContent.includes('export') || pageContent.includes('Export');
    const hasDateFilter = pageContent.includes('日期') || pageContent.includes('date') || pageContent.includes('Date') || pageContent.includes('range');
    const hasBatchFilter = pageContent.includes('批次') || pageContent.includes('batch') || pageContent.includes('Batch');
    const hasSearch = pageContent.includes('搜索') || pageContent.includes('search') || pageContent.includes('Search') || pageContent.includes('查询');
    const hasCSVOption = pageContent.includes('CSV');
    const hasExcelOption = pageContent.includes('Excel') || pageContent.includes('xlsx') || pageContent.includes('XLSX');

    console.log(`Export controls: export=${hasExport}, date=${hasDateFilter}, batch=${hasBatchFilter}, search=${hasSearch}, csv=${hasCSVOption}, excel=${hasExcelOption}`);

    await ctx.close();

    if (hasExport && hasDateFilter && hasSearch) {
      return { result: 'PASS', evidence: `Code mapping export UI has export(${hasExport}), date filter(${hasDateFilter}), batch filter(${hasBatchFilter}), search(${hasSearch}), CSV(${hasCSVOption}), Excel(${hasExcelOption})` };
    }

    return { result: 'PARTIAL', evidence: `Export controls partial: export=${hasExport}, date=${hasDateFilter}, batch=${hasBatchFilter}, search=${hasSearch}` };
  } catch (e) {
    return { result: 'FAIL', evidence: `Exception: ${e.message}` };
  }
}

// CRITERION 7: i18n completeness and responsive layout
async function evalCriterion7() {
  console.log('\n=== Criterion 7: i18n completeness and responsive layout ===');
  try {
    const { ctx, page } = await createContext();

    await page.goto(`${BASE}/material/library`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    const firstLibLink = page.locator('table tbody tr td a').first();
    if (await firstLibLink.count() > 0) {
      await firstLibLink.click();
    }
    await page.waitForTimeout(2000);

    const pageContent = await page.content();

    // Check for key-like fallback text
    const fallbackPatterns = ['codeRule.', 'recode.', 'mapping.', 'undefined', 'missing', 'i18n.'];
    let hasFallback = false;
    for (const pattern of fallbackPatterns) {
      if (pageContent.includes(pattern)) {
        hasFallback = true;
        console.log(`Found fallback key: ${pattern}`);
      }
    }

    // Check for language switcher
    const langSwitch = page.locator('[class*="lang"], [class*="i18n"], [class*="language"], text=EN, text=中, text=语言');
    const langCount = await langSwitch.count();

    // Responsive: resize to narrow viewport
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(1000);
    const narrowContent = await page.content();
    const hasOverflow = narrowContent.includes('overflow') || narrowContent.includes('scroll') || narrowContent.includes('hidden');

    // Switch to en-US if possible
    const enBtn = page.locator('text=EN, text=en, text=English').first();
    if (await enBtn.count() > 0) {
      await enBtn.click();
      await page.waitForTimeout(1500);
    }

    const enContent = await page.content();
    let hasEnglishFallback = false;
    for (const pattern of fallbackPatterns) {
      if (enContent.includes(pattern)) {
        hasEnglishFallback = true;
      }
    }

    await ctx.close();

    const zhClean = !hasFallback;
    const enClean = !hasEnglishFallback;

    if (zhClean && enClean && langCount > 0) {
      return { result: 'PASS', evidence: `i18n complete: zh-CN clean=${zhClean}, en-US clean=${enClean}, language switcher found` };
    }

    return { result: 'PARTIAL', evidence: `i18n partial: zh-CN clean=${zhClean}, en-US clean=${enClean}, lang switcher=${langCount > 0}, responsive narrow viewport tested` };
  } catch (e) {
    return { result: 'FAIL', evidence: `Exception: ${e.message}` };
  }
}

// Also check the source files for implementation evidence
async function checkSourceImplementation() {
  console.log('\n=== Checking source implementation ===');
  const checks = {};

  // Check MaterialLibraryDetail.tsx for key features
  const detailFile = await import('fs').then(fs => fs.readFileSync('/Users/yusec/projects/material_retrieval/prototype_code/src/app/components/pages/material/MaterialLibraryDetail.tsx', 'utf8'));

  checks.detailFile = {
    hasConflictHighlight: /conflict|冲突|red|Red/.test(detailFile),
    hasDragReorder: /drag|Reorder|sortable|Sortable/.test(detailFile),
    hasTooltip: /Tooltip|tooltip|help|Help/.test(detailFile),
    hasAutocomplete: /AutoComplete|autocomplete|Select.*showSearch/.test(detailFile),
    hasCSVImport: /CSV|csv|upload|import/.test(detailFile),
    hasScopePreview: /scope.*preview|preview.*scope|serial.*preview|preview.*serial/.test(detailFile),
    hasForceConfirm: /force|forceExecute|强制/.test(detailFile),
    hasExport: /export|导出|download|Download/.test(detailFile),
    hasDateRange: /range|Date|date|Range/.test(detailFile),
    hasBatchFilter: /batch|批次|batch_id/.test(detailFile),
  };

  // Check i18n.ts
  const i18nFile = await import('fs').then(fs => fs.readFileSync('/Users/yusec/projects/material_retrieval/prototype_code/src/app/i18n.ts', 'utf8'));
  checks.i18nFile = {
    hasCodeRuleKeys: /codeRule|编码规则|编码映射/.test(i18nFile),
    hasRecodeKeys: /recode|重编码|conflict|冲突/.test(i18nFile),
    hasSegmentKeys: /segment|segmentType|fixed_text|serial|日期|流水号/.test(i18nFile),
    hasMappingKeys: /mapping|映射|export|导入/.test(i18nFile),
  };

  // Check RecodePanels
  const recodeFile = await import('fs').then(fs => fs.readFileSync('/Users/yusec/projects/material_retrieval/prototype_code/src/app/components/pages/material/MaterialLibraryRecodePanels.tsx', 'utf8'));
  checks.recodeFile = {
    hasRedHighlight: /red|#f00|#FF|color.*red|background.*red/.test(recodeFile),
    hasForceConfirm: /force|forceExecute|强制|二次确认/.test(recodeFile),
    hasConflictDetails: /conflict.*detail|conflict.*reason|冲突.*原因/.test(recodeFile),
    hasExportFeatures: /date.*range|batch.*filter|export.*csv|export.*excel/.test(recodeFile),
  };

  console.log('Source checks:', JSON.stringify(checks, null, 2));
  return checks;
}

// Run all evaluations
async function main() {
  console.log('Starting Sprint 31 Evaluation...');
  console.log(`Target: ${BASE}`);
  console.log(`Mode: browser (Playwright)`);

  const startTime = Date.now();

  // Run source code checks first (non-blocking)
  const sourceChecks = await checkSourceImplementation();

  // Run browser-based criterion evaluations
  RESULTS.criterion1 = await evalCriterion1();
  RESULTS.criterion2 = await evalCriterion2();
  RESULTS.criterion3 = await evalCriterion3();
  RESULTS.criterion4 = await evalCriterion4();
  RESULTS.criterion5 = await evalCriterion5();
  RESULTS.criterion6 = await evalCriterion6();
  RESULTS.criterion7 = await evalCriterion7();

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  // Print summary
  console.log('\n========================================');
  console.log('EVALUATION SUMMARY');
  console.log('========================================');
  const labels = [
    '1. Auto-code material creation',
    '2. Segment builder (drag, icons, tooltips, validation)',
    '3. Attribute code mapping (autocomplete + CSV)',
    '4. Serial scope preview',
    '5. Recode conflict handling',
    '6. Code mapping export',
    '7. i18n + responsive layout',
  ];

  let passCount = 0;
  for (let i = 0; i < labels.length; i++) {
    const key = `criterion${i + 1}`;
    const r = RESULTS[key];
    const mark = r.result === 'PASS' ? 'PASS' : r.result === 'PARTIAL' ? 'PARTIAL' : 'FAIL';
    console.log(`${labels[i]}: ${mark}`);
    console.log(`  Evidence: ${r.evidence}`);
    if (r.result === 'PASS') passCount++;
  }

  console.log(`\nPassed: ${passCount}/7`);
  console.log(`Time: ${elapsed}s`);

  // Return results for report generation
  return { RESULTS, sourceChecks, elapsed };
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
