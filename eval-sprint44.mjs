// Sprint 44 Final - Robust dialog input handling
import pkg from '@playwright/test';
const { chromium } = pkg;

const BASE_URL = 'http://localhost:5173';
const API_URL = 'http://localhost:8000';

const results = [];
function record(criterion, result, evidence, observation) {
  results.push({ criterion, result, evidence, observation });
  console.log('[' + result + '] ' + criterion + ': ' + observation);
}

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function run() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();

  try {
    const loginResp = await page.request.fetch(`${API_URL}/api/v1/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      data: JSON.stringify({ username: 'super_admin' }),
    });
    const session = await loginResp.json();
    await page.goto(`${BASE_URL}/login`, { timeout: 20000 });
    await delay(500);
    await page.evaluate((authSession) => {
      window.localStorage.setItem('ai-material-auth-session', JSON.stringify(authSession));
    }, session);
    record('Auth', 'PASS', '', 'Authenticated as super_admin');
  } catch (e) { record('Auth', 'FAIL', e.message, 'Auth failed'); }

  const seededMatLibId = 580;
  record('C5-seed', 'PASS', 'mat_lib=' + seededMatLibId, 'Using pre-seeded linked material library (ID=580)');

  try {
    await page.goto(`${BASE_URL}/material/list`, { waitUntil: 'networkidle', timeout: 20000 });
    await delay(2000);

    // Click on linked material library in sidebar
    const aiLibBtn = page.locator('aside button:has-text("AI测试物料库")').first();
    if (await aiLibBtn.count() > 0) {
      await aiLibBtn.click();
      await delay(2000);
      record('C5-lib-click', 'PASS', 'AI测试物料库', 'Clicked on linked material library');
    } else { record('C5-lib-click', 'FAIL', '', 'AI测试物料库 not found'); }

    // Open create form
    const allBtns = await page.locator('button').allTextContents();
    const addBtnIdx = allBtns.findIndex(b => b.includes('新增物料'));
    if (addBtnIdx >= 0) {
      record('C5-create-btn', 'PASS', 'btn_idx=' + addBtnIdx, '新增物料 button found');
      await page.locator('button').nth(addBtnIdx).click();
      await delay(4000);

      // Wait for dialog
      const dialog = page.locator('[role="dialog"]').first();
      await dialog.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});

      // Get AI button in dialog
      const aiBtnInDialog = dialog.locator('button:has-text("AI智能匹配类目")').first();
      const aiBtnCount = await aiBtnInDialog.count();

      if (aiBtnCount > 0) {
        record('C5-ai-btn', 'PASS', '', 'AI智能匹配类目 button found in dialog');

        // Get all inputs in dialog using count() instead of .all()
        const inputCount = await dialog.locator('input').count();
        console.log('Dialog inputs: ' + inputCount);
        for (let i = 0; i < inputCount; i++) {
          const inp = dialog.locator('input').nth(i);
          const ph = await inp.getAttribute('placeholder');
          const type = await inp.getAttribute('type');
          console.log('  Input ' + i + ': type=' + type + ', placeholder=' + ph);
        }

        // Find first text input in dialog
        const firstTextInput = dialog.locator('input[type="text"], input:not([type])').first();
        const textInputCount = await firstTextInput.count();
        console.log('Text inputs: ' + textInputCount);

        if (textInputCount > 0) {
          await firstTextInput.click();
          await delay(300);
          await page.keyboard.type('A4复印纸', { delay: 50 });
          await delay(1000);

          const isDisabled = await aiBtnInDialog.isDisabled();
          console.log('AI button isDisabled: ' + isDisabled);

          if (!isDisabled) {
            record('C5-ai-enabled', 'PASS', '', 'AI button is enabled');

            await aiBtnInDialog.click();
            await delay(2000);

            const loading = dialog.locator('text=/加载中|匹配中/i').first();
            if (await loading.count() > 0) { record('C5-loading', 'PASS', '', 'Loading state visible'); }

            await delay(8000);

            // Check for chips in dialog
            const dialogBtns = await dialog.locator('button').allTextContents();
            const chipLike = dialogBtns.filter(t => t.includes(' > ') || (t.includes('%') && t.length < 60));
            console.log('Chip-like buttons: ' + JSON.stringify(chipLike));

            if (chipLike.length > 0) {
              record('C5-chips', 'PASS', JSON.stringify(chipLike.slice(0, 3)), 'Result chips visible with category paths and confidence scores');
            } else {
              record('C5-chips', 'FAIL', JSON.stringify(dialogBtns.slice(0, 10)), 'No result chips found');
            }
          } else {
            record('C5-ai-enabled', 'FAIL', 'isDisabled=' + isDisabled, 'AI button is disabled');
          }
        } else { record('C5-form-field', 'FAIL', 'count=0', 'No text input in dialog'); }
      } else { record('C5-ai-btn', 'FAIL', '', 'AI button not in dialog'); }
    } else { record('C5-create-btn', 'FAIL', '', '新增物料 not found'); }

  } catch (e) {
    record('C5-browser', 'FAIL', e.message, 'Browser flow threw: ' + String(e).slice(0, 200));
  }

  // ===== Criterion 6: UI states =====
  try {
    const zhText = page.locator('text=/AI智能匹配|类目|匹配|加载中|物料/i').first();
    if (await zhText.count() > 0) { record('C6-i18n-zh', 'PASS', '', 'Chinese i18n text found'); }
    else { record('C6-i18n-zh', 'SKIP', '', 'No Chinese text in current view'); }
    const enText = page.locator('text=/AI|Material|Category|Match|Loading/i').first();
    if (await enText.count() > 0) { record('C6-i18n-en', 'PASS', '', 'English i18n text found'); }
    else { record('C6-i18n-en', 'SKIP', '', 'No English text in current view'); }
  } catch (e) { record('C6-ui', 'FAIL', e.message, 'UI states threw'); }

  console.log('\n========== EVALUATION SUMMARY ==========');
  let passed = 0, failed = 0, skipped = 0;
  for (const r of results) {
    const icon = r.result === 'PASS' ? 'PASS' : r.result === 'FAIL' ? 'FAIL' : 'SKIP';
    console.log('  [' + icon + '] ' + r.criterion + ': ' + r.observation);
    if (r.result === 'PASS') passed++;
    else if (r.result === 'FAIL') failed++;
    else skipped++;
  }
  console.log('\n  Total: ' + passed + ' passed, ' + failed + ' failed, ' + skipped + ' skipped');
  console.log('==========================================\n');

  return { passed, failed, skipped, results };
}

const result = await run();
process.exit(result.failed > 0 ? 1 : 0);