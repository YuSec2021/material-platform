import { chromium } from 'playwright';

const BASE = 'http://localhost:5173';

async function loginAsSuperAdmin(browser) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(BASE + '/login');
  await page.evaluate(() => {
    localStorage.setItem('ai-material-auth-session', JSON.stringify({
      username: 'super_admin',
      role: 'super_admin'
    }));
  });
  return { context, page };
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const results = [];

  function log(name, pass, detail) {
    results.push({ name, pass, detail });
    console.log(`${pass ? 'PASS' : 'FAIL'} | ${name} | ${detail}`);
  }

  // ===== Criterion 1: ApplicationList 4 types =====
  try {
    const { context: ctx1, page: page1 } = await loginAsSuperAdmin(browser);

    const apiReqs = [];
    page1.on('request', (req) => {
      if (req.url().includes('/api/v1/workflows/applications')) {
        apiReqs.push(req.url());
      }
    });

    await page1.goto(BASE + '/application/category');
    await page1.waitForLoadState('networkidle');
    await page1.waitForTimeout(1500);
    const hasNewCategory = apiReqs.some(u => u.includes('new_category'));
    log('Criterion 1 - Category route maps to new_category API', hasNewCategory,
      `API calls: ${JSON.stringify(apiReqs)}`);

    const apiReqs2 = [];
    page1.on('request', (req) => {
      if (req.url().includes('/api/v1/workflows/applications')) {
        apiReqs2.push(req.url());
      }
    });
    await page1.goto(BASE + '/application/material-code');
    await page1.waitForLoadState('networkidle');
    await page1.waitForTimeout(1000);
    const hasNewMaterialCode = apiReqs2.some(u => u.includes('new_material_code'));
    log('Criterion 1 - Material-code maps to new_material_code', hasNewMaterialCode,
      `API calls: ${JSON.stringify(apiReqs2)}`);

    await page1.goto(BASE + '/application/stop-purchase');
    await page1.waitForLoadState('networkidle');
    await page1.waitForTimeout(500);
    const stopPurchaseLoaded = page1.url().includes('stop-purchase');
    log('Criterion 1 - Stop-purchase page accessible', stopPurchaseLoaded,
      `URL: ${page1.url()}`);

    await page1.goto(BASE + '/application/stop-use');
    await page1.waitForLoadState('networkidle');
    await page1.waitForTimeout(500);
    const stopUseLoaded = page1.url().includes('stop-use');
    log('Criterion 1 - Stop-use page accessible', stopUseLoaded,
      `URL: ${page1.url()}`);

    const tableRows = await page1.locator('tbody tr').count();
    const emptyEl = await page1.locator('text="暂无", text="暂无数据", text="没有找到", text="No data"').count();
    log('Criterion 1 - Real rows or empty state', tableRows > 0 || emptyEl > 0,
      `Rows: ${tableRows}, Empty elements: ${emptyEl}`);

    const navLinks = await page1.locator('nav a, [role="tab"]').all();
    let filterBtnFound = false;
    for (const btn of navLinks) {
      const txt = await btn.innerText().catch(() => '');
      if (txt.includes('类目') || txt.includes('编码') || txt.includes('停采') || txt.includes('停用')) {
        filterBtnFound = true;
        break;
      }
    }
    log('Criterion 1 - Nav/tab elements for type switching', filterBtnFound,
      `Found ${navLinks.length} nav/tab elements`);

    const selectEl = await page1.locator('select').count();
    log('Criterion 1 - Status filter select element', selectEl > 0,
      `Select elements: ${selectEl}`);

    await ctx1.close();
  } catch (e) {
    log('Criterion 1 - ApplicationList', false, `Error: ${e.message}`);
  }

  // ===== Criterion 2: CategoryApplication =====
  try {
    const { context: ctx2, page: page2 } = await loginAsSuperAdmin(browser);

    await page2.goto(BASE + '/application/category/detail/new');
    await page2.waitForLoadState('networkidle');
    await page2.waitForTimeout(2000);
    const bodyText2 = await page2.evaluate(() => document.body.innerText);

    const hasAppCode = bodyText2.includes('申请编号') || bodyText2.includes('申请单号') || bodyText2.includes('单据编码');
    const hasApplicant = bodyText2.includes('申请人') || bodyText2.includes('super_admin') || bodyText2.includes('Seeded');
    const hasDept = bodyText2.includes('部门') || bodyText2.includes('Department');
    log('Criterion 2 - Application info block (code, applicant, dept)', hasAppCode && hasApplicant && hasDept,
      `Code:${hasAppCode}, Applicant:${hasApplicant}, Dept:${hasDept}`);

    const selectors = await page2.locator('select').count();
    log('Criterion 2 - Category selectors (L1/L2/L3)', selectors >= 2,
      `${selectors} select elements`);

    const fileInputs = await page2.locator('input[type="file"]').count();
    log('Criterion 2 - File/image upload', fileInputs >= 1,
      `${fileInputs} file input(s)`);

    const approvalTimelineEl = await page2.locator('[class*="timeline"], [class*="step"], .step').count();
    const hasApprovalSteps = bodyText2.includes('申请人提交') || bodyText2.includes('部门审批') || bodyText2.includes('资产管理') || bodyText2.includes('完结');
    const hasApprovalTimeline = approvalTimelineEl > 0 || hasApprovalSteps;
    log('Criterion 2 - ApprovalTimeline visible', hasApprovalTimeline,
      `Timeline elements: ${approvalTimelineEl}, Steps visible: ${hasApprovalSteps}`);

    const saveDraft = await page2.locator('button:has-text("保存"), button:has-text("草稿")').count();
    log('Criterion 2 - Save Draft button', saveDraft > 0,
      `Save Draft buttons: ${saveDraft}`);

    const submit = await page2.locator('button:has-text("提交"), button:has-text("提交审批")').count();
    log('Criterion 2 - Submit button', submit > 0,
      `Submit buttons: ${submit}`);

    await ctx2.close();
  } catch (e) {
    log('Criterion 2 - CategoryApplication', false, `Error: ${e.message}`);
  }

  // ===== Criterion 3: MaterialCodeApplication =====
  try {
    const { context: ctx3, page: page3 } = await loginAsSuperAdmin(browser);

    await page3.goto(BASE + '/application/material-code/detail/new');
    await page3.waitForLoadState('networkidle');
    await page3.waitForTimeout(2000);
    const bodyText3 = await page3.evaluate(() => document.body.innerText);

    const hasMaterialName = bodyText3.includes('物料名称') || bodyText3.includes('Material Name');
    log('Criterion 3 - Material name display', hasMaterialName,
      `Body includes material name: ${hasMaterialName}`);

    const redMarkers = await page3.locator('.text-red-500').count();
    const fileInputCount = await page3.locator('input[type="file"]').count();
    log('Criterion 3 - Required image markers (red asterisk)', redMarkers >= 3 || fileInputCount >= 3,
      `Red markers: ${redMarkers}, File inputs: ${fileInputCount}`);

    const hasSteps3 = bodyText3.includes('申请人提交') || bodyText3.includes('部门审批') || bodyText3.includes('资产管理');
    log('Criterion 3 - Approval timeline steps', hasSteps3,
      `Approval steps visible: ${hasSteps3}`);

    const submit3 = await page3.locator('button:has-text("提交"), button:has-text("提交审批")').count();
    log('Criterion 3 - Submit button', submit3 > 0,
      `Submit button: ${submit3}`);

    await ctx3.close();
  } catch (e) {
    log('Criterion 3 - MaterialCodeApplication', false, `Error: ${e.message}`);
  }

  // ===== Criterion 4: StopPurchaseApplication =====
  try {
    const { context: ctx4, page: page4 } = await loginAsSuperAdmin(browser);

    await page4.goto(BASE + '/application/stop-purchase/detail/new');
    await page4.waitForLoadState('networkidle');
    await page4.waitForTimeout(2000);
    const bodyText4 = await page4.evaluate(() => document.body.innerText);

    const hasReason = bodyText4.includes('停采原因') || bodyText4.includes('原因');
    const hasTimeline4 = bodyText4.includes('申请人提交') || bodyText4.includes('部门审批') || bodyText4.includes('资产管理');
    const hasSaveDraft4 = bodyText4.includes('保存') || bodyText4.includes('草稿');
    const hasSubmit4 = bodyText4.includes('提交');
    log('Criterion 4 - Stop-purchase form elements', hasReason && hasTimeline4 && hasSaveDraft4 && hasSubmit4,
      `Reason:${hasReason}, Timeline:${hasTimeline4}, SaveDraft:${hasSaveDraft4}, Submit:${hasSubmit4}`);

    const materialSelect = await page4.locator('button:has-text("添加物料"), button:has-text("选择")').count();
    log('Criterion 4 - Material selection control', materialSelect > 0,
      `Material selection buttons: ${materialSelect}`);

    const submitBtn4 = await page4.locator('button:has-text("提交")').count();
    log('Criterion 4 - Submit button present', submitBtn4 > 0,
      `Submit button: ${submitBtn4}`);

    await ctx4.close();
  } catch (e) {
    log('Criterion 4 - StopPurchaseApplication', false, `Error: ${e.message}`);
  }

  // ===== Criterion 5: StopUseApplication =====
  try {
    const { context: ctx5, page: page5 } = await loginAsSuperAdmin(browser);

    await page5.goto(BASE + '/application/stop-use/detail/new');
    await page5.waitForLoadState('networkidle');
    await page5.waitForTimeout(2000);
    const bodyText5 = await page5.evaluate(() => document.body.innerText);

    const hasReason5 = bodyText5.includes('停用原因') || bodyText5.includes('原因');
    const hasTimeline5 = bodyText5.includes('申请人提交') || bodyText5.includes('部门审批') || bodyText5.includes('资产管理');
    const hasSaveDraft5 = bodyText5.includes('保存') || bodyText5.includes('草稿');
    const hasSubmit5 = bodyText5.includes('提交');
    log('Criterion 5 - Stop-use form elements', hasReason5 && hasTimeline5 && hasSaveDraft5 && hasSubmit5,
      `Reason:${hasReason5}, Timeline:${hasTimeline5}, SaveDraft:${hasSaveDraft5}, Submit:${hasSubmit5}`);

    const hasPreconditionLabel = bodyText5.includes('停用申请仅允许') || bodyText5.includes('已停采物料');
    log('Criterion 5 - Stop-use precondition label visible', hasPreconditionLabel,
      `Precondition label: ${hasPreconditionLabel}`);

    const submitBtn5 = await page5.locator('button:has-text("提交")').count();
    log('Criterion 5 - Submit button present', submitBtn5 > 0,
      `Submit button: ${submitBtn5}`);

    const addBtn = page5.locator('button:has-text("添加物料")').first();
    if (await addBtn.count() > 0) {
      await addBtn.click();
      await page5.waitForTimeout(1500);
      const modalText = await page5.evaluate(() => document.body.innerText);
      const hasStopPurchaseModal = modalText.includes('已停采物料') || modalText.includes('选择已停采');
      log('Criterion 5 - Stop-use material modal filtered to stop_purchase', hasStopPurchaseModal,
        `Modal shows stop_purchase materials: ${hasStopPurchaseModal}`);
    }

    await ctx5.close();
  } catch (e) {
    log('Criterion 5 - StopUseApplication', false, `Error: ${e.message}`);
  }

  // ===== Criterion 6: Quality gates =====
  try {
    // Auth guard test - unauthenticated access via fresh context (no localStorage)
    const freshCtx = await browser.newContext();
    const freshPage = await freshCtx.newPage();
    await freshPage.goto(BASE + '/application/category');
    await freshPage.waitForLoadState('networkidle');
    await freshPage.waitForTimeout(2000);
    const redirectedToLogin = freshPage.url().includes('/login');
    log('Criterion 6 - Auth guard redirects unauthenticated', redirectedToLogin,
      `URL: ${freshPage.url()}`);
    await freshCtx.close();

    // Error state test with HTTP 500
    const { context: ctx7, page: page7 } = await loginAsSuperAdmin(browser);
    ctx7.route(/\/api\/v1\/workflows\/applications\?type=new_category/, (route) =>
      route.fulfill({ status: 500, contentType: 'application/json', body: '{"detail":"Internal server error"}' })
    );
    await page7.goto(BASE + '/application/category');
    await page7.waitForLoadState('networkidle');
    await page7.waitForTimeout(2000);
    const bodyText7 = await page7.evaluate(() => document.body.innerText);
    const errorState = bodyText7.includes('错误') || bodyText7.includes('Error') || bodyText7.includes('失败') || bodyText7.includes('retry') || bodyText7.includes('重试');
    const retryBtn = await page7.locator('button:has-text("重试"), button:has-text("刷新")').count();
    log('Criterion 6 - Error state with retry control', errorState || retryBtn > 0,
      `Error state: ${errorState}, Retry buttons: ${retryBtn}`);

    // Empty state test
    ctx7.route(/\/api\/v1\/workflows\/applications\?type=new_category/, (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
    );
    await page7.goto(BASE + '/application/category');
    await page7.waitForLoadState('networkidle');
    await page7.waitForTimeout(1000);
    const bodyText8 = await page7.evaluate(() => document.body.innerText);
    const emptyState = bodyText8.includes('暂无') || bodyText8.includes('暂无数据') || bodyText8.includes('没有数据') || bodyText8.includes('No data');
    log('Criterion 6 - Real empty state (not mock rows)', emptyState,
      `Empty state detected: ${emptyState}`);

    await ctx7.close();
  } catch (e) {
    log('Criterion 6 - Quality gates', false, `Error: ${e.message}`);
  }

  await browser.close();

  console.log('\n===== SUMMARY =====');
  const passed = results.filter(r => r.pass).length;
  const failed = results.filter(r => !r.pass).length;
  console.log(`Passed: ${passed}, Failed: ${failed}`);
  results.filter(r => !r.pass).forEach(r => {
    console.log(`  FAILED: ${r.name} - ${r.detail}`);
  });

  const allPassed = failed === 0;
  console.log(`\nOverall: ${allPassed ? 'SPRINT PASS' : 'SPRINT FAIL'}`);
  process.exit(allPassed ? 0 : 1);
}

main().catch(e => {
  console.error('Fatal:', e);
  process.exit(1);
});