import { chromium } from 'playwright';
import { writeFileSync, mkdirSync, readFileSync } from 'fs';

const BASE = 'http://localhost:5173';
const results = {
  criterion1_zh: { pass: false, detail: '' },
  criterion1_en: { pass: false, detail: '' },
  criterion2_zh: { pass: false, detail: '' },
  criterion2_en: { pass: false, detail: '' },
  criterion3_dark: { pass: false, detail: '' },
  criterion4_build: { pass: false, detail: '' },
  consoleErrors: [],
};

async function run() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  page.on('console', msg => {
    if (msg.type() === 'error') {
      results.consoleErrors.push(msg.text());
    }
  });

  // ===========================
  // CRITERION 1 & 2: zh-CN mode
  // ===========================
  console.log('=== CRITERIA 1 & 2: zh-CN mode ===');
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await page.fill('input[type="text"], input[name="username"]', 'super_admin');
  await page.fill('input[type="password"]', '');
  await page.click('button[type="submit"]');
  await page.waitForURL(url => !url.pathname.endsWith('/login'), { timeout: 10000 });
  console.log('Login successful');

  await page.goto(`${BASE}/system/permissions`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);

  const zhBodyText = await page.textContent('body');

  // Criterion 1: No raw API paths (api.DELETE, GET /api/v1, etc.)
  const rawApiPatterns = [
    /api\.DELETE/,
    /api\.POST/,
    /api\.GET/,
    /api\.PUT/,
    /api\.PATCH/,
    /GET\s+\/api\/v1/,
    /POST\s+\/api\/v1/,
    /PUT\s+\/api\/v1/,
    /DELETE\s+\/api\/v1/,
    /button\.material_archives\./,
    /api\s*\|\s*material_archives/i,
  ];
  const foundRawAPIs = rawApiPatterns.filter(p => p.test(zhBodyText));
  if (foundRawAPIs.length === 0) {
    results.criterion1_zh.pass = true;
    results.criterion1_zh.detail = 'No raw API paths found';
  } else {
    results.criterion1_zh.detail = `Found raw API patterns: ${foundRawAPIs.map(p => p.toString()).join(', ')}`;
  }

  // Check Chinese operation labels
  const zhOps = ['查看', '新建', '编辑', '删除', '列表', '导出', '导入', '审批', '驳回'];
  const foundZhOps = zhOps.filter(op => zhBodyText.includes(op));
  if (foundZhOps.length > 0) {
    results.criterion1_zh.pass = true;
    results.criterion1_zh.detail += ` | Chinese ops: ${foundZhOps.join(', ')}`;
  }

  // Criterion 2: Chinese catalog/module names
  const zhModules = ['标准管理', '物料管理', '申请流程', '系统管理', '物料库', '类目管理', '属性管理', '品牌', '品名', 'AI管理', '规则引线'];
  const foundZhModules = zhModules.filter(m => zhBodyText.includes(m));
  if (foundZhModules.length > 0) {
    results.criterion2_zh.pass = true;
    results.criterion2_zh.detail = `Chinese modules: ${foundZhModules.join(', ')}`;
  }

  console.log(`Criterion 1 (zh-CN): ${results.criterion1_zh.pass ? 'PASS' : 'FAIL'} - ${results.criterion1_zh.detail}`);
  console.log(`Criterion 2 (zh-CN): ${results.criterion2_zh.pass ? 'PASS' : 'FAIL'} - ${results.criterion2_zh.detail}`);

  // ===========================
  // CRITERIA 1 & 2: en-US mode
  // ===========================
  console.log('\n=== CRITERIA 1 & 2: en-US mode ===');
  // Switch language via localStorage
  await page.evaluate(() => {
    localStorage.setItem('language', 'en-US');
  });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  const enBodyText = await page.textContent('body');

  // No raw API paths in English mode
  const foundRawAPIsEn = rawApiPatterns.filter(p => p.test(enBodyText));
  if (foundRawAPIsEn.length === 0) {
    results.criterion1_en.pass = true;
    results.criterion1_en.detail = 'No raw API paths in English mode';
  } else {
    results.criterion1_en.detail = `Found raw API patterns: ${foundRawAPIsEn.map(p => p.toString()).join(', ')}`;
  }

  // Check English operation labels
  const enOps = ['View', 'Create', 'Edit', 'Delete', 'List', 'Export', 'Import', 'Approve', 'Reject'];
  const foundEnOps = enOps.filter(op => enBodyText.includes(op));
  if (foundEnOps.length > 0) {
    results.criterion1_en.pass = true;
    results.criterion1_en.detail += ` | English ops: ${foundEnOps.join(', ')}`;
  }

  // Check English catalog names
  const enModules = ['Standards', 'Materials', 'Applications', 'System', 'Material Library', 'Category Management', 'Attribute Management', 'Brands'];
  const foundEnModules = enModules.filter(m => enBodyText.includes(m));
  if (foundEnModules.length > 0) {
    results.criterion2_en.pass = true;
    results.criterion2_en.detail = `English modules: ${foundEnModules.join(', ')}`;
  }

  console.log(`Criterion 1 (en-US): ${results.criterion1_en.pass ? 'PASS' : 'FAIL'} - ${results.criterion1_en.detail}`);
  console.log(`Criterion 2 (en-US): ${results.criterion2_en.pass ? 'PASS' : 'FAIL'} - ${results.criterion2_en.detail}`);

  // ===========================
  // CRITERION 3: Dark theme
  // ===========================
  console.log('\n=== CRITERION 3: Dark theme ===');
  await page.evaluate(() => {
    localStorage.setItem('language', 'zh-CN');
    localStorage.setItem('theme', 'dark');
  });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  const darkBg = await page.evaluate(() => {
    const el = document.querySelector('[class*="bg-background"]') || document.body;
    return window.getComputedStyle(el).backgroundColor;
  });
  console.log(`Dark theme background: ${darkBg}`);

  // Check that permission text is visible (not white-on-white)
  const permissionLabels = await page.$$('label[class*="flex"]');
  console.log(`Permission checkboxes found: ${permissionLabels.length}`);

  // Check for illegible white text
  const whiteOnWhite = await page.evaluate(() => {
    const spans = document.querySelectorAll('span');
    let count = 0;
    spans.forEach(s => {
      const color = window.getComputedStyle(s).color;
      const bg = window.getComputedStyle(s).backgroundColor;
      // White text on white background would be rgb(255,255,255) text on rgb(255,255,255) bg
      if (color === 'rgb(255, 255, 255)' && (bg === 'rgb(255, 255, 255)' || bg === 'rgba(0, 0, 0, 0)' || bg === 'transparent')) {
        count++;
      }
    });
    return count;
  });
  console.log(`White-on-white illegible elements: ${whiteOnWhite}`);

  // Check that the page still shows localized content in dark mode
  const darkBodyText = await page.textContent('body');
  const darkHasLocalized = ['查看', '新建', '编辑', '物料管理', '标准管理'].some(k => darkBodyText.includes(k));
  console.log(`Dark mode has localized Chinese content: ${darkHasLocalized}`);

  if (whiteOnWhite < 5 && darkHasLocalized) {
    results.criterion3_dark.pass = true;
    results.criterion3_dark.detail = `Dark theme readable. White-on-white elements: ${whiteOnWhite}`;
  } else {
    results.criterion3_dark.detail = `Issues: white-on-white=${whiteOnWhite}, localized=${darkHasLocalized}`;
  }
  console.log(`Criterion 3 (dark theme): ${results.criterion3_dark.pass ? 'PASS' : 'FAIL'} - ${results.criterion3_dark.detail}`);

  // Screenshot
  await page.screenshot({ path: '/Users/yusec/projects/material_retrieval/test-results/sprint34-eval/dark-theme.png', fullPage: false });

  await browser.close();

  // ===========================
  // CRITERION 4: Build
  // ===========================
  console.log('\n=== CRITERION 4: Build ===');
  const { execSync } = await import('child_process');
  try {
    execSync('cd /Users/yusec/projects/material_retrieval/prototype_code && npm run build 2>&1', { timeout: 120000, stdio: 'pipe' });
    results.criterion4_build.pass = true;
    results.criterion4_build.detail = 'Build succeeded with exit code 0';
    console.log('Build: PASS');
  } catch (e) {
    results.criterion4_build.pass = false;
    results.criterion4_build.detail = e.stdout?.toString().slice(-500) || e.message;
    console.log('Build: FAIL');
    console.log(e.stdout?.toString().slice(-1000));
  }

  // ===========================
  // SUMMARY
  // ===========================
  console.log('\n========================================');
  console.log('EVALUATION SUMMARY');
  console.log('========================================');
  const allCriteria = [
    { name: 'Criterion 1 (zh-CN): Operation labels localized', ...results.criterion1_zh },
    { name: 'Criterion 1 (en-US): Operation labels localized', ...results.criterion1_en },
    { name: 'Criterion 2 (zh-CN): Module names localized', ...results.criterion2_zh },
    { name: 'Criterion 2 (en-US): Module names localized', ...results.criterion2_en },
    { name: 'Criterion 3: Dark theme', ...results.criterion3_dark },
    { name: 'Criterion 4: Build passes', ...results.criterion4_build },
  ];
  for (const c of allCriteria) {
    console.log(`  ${c.pass ? 'PASS' : 'FAIL'}: ${c.name}`);
    console.log(`         ${c.detail}`);
  }
  console.log(`\nConsole errors: ${results.consoleErrors.length}`);
  if (results.consoleErrors.length > 0) {
    results.consoleErrors.slice(0, 5).forEach(e => console.log(`  - ${e}`));
  }

  const allPass = allCriteria.every(c => c.pass);
  console.log(`\nOVERALL: ${allPass ? 'SPRINT PASS' : 'SPRINT FAIL'}`);

  // Save results
  mkdirSync('/Users/yusec/projects/material_retrieval/test-results/sprint34-eval', { recursive: true });
  writeFileSync('/Users/yusec/projects/material_retrieval/eval-sprint34-output.json', JSON.stringify({ allPass, ...results }, null, 2));
}

run().catch(e => {
  console.error('Fatal:', e);
  process.exit(1);
});
