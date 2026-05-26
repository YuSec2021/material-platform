// Sprint 44 Final Debug - Check form modal content
import pkg from '@playwright/test';
const { chromium } = pkg;

const BASE_URL = 'http://localhost:5173';
const API_URL = 'http://localhost:8000';

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

    const libsResp = await page.request.fetch(`${API_URL}/api/v1/material-libraries`, {
      method: 'GET', headers: { 'X-User-Role': 'super_admin' },
    });
    const libs = await libsResp.json();
    const linkedLibs = libs.filter(l => l.category_library_ids?.length > 0 || l.category_library_id);
    console.log('Found ' + linkedLibs.length + ' material libraries with category links:');
    for (const lib of linkedLibs.slice(-5)) {
      console.log('  ID=' + lib.id + ' name=' + lib.name + ' cat_lib_ids=' + JSON.stringify(lib.category_library_ids) + ' cat_lib_id=' + lib.category_library_id);
    }

    await page.goto(`${BASE_URL}/material/list`, { waitUntil: 'networkidle', timeout: 20000 });
    await delay(3000);

    const body = await page.locator('body').innerText();
    const hasAiSection = body.includes('AI智能匹配');
    const hasAiTitle = body.includes('AI类别匹配') || body.includes('智能匹配类目');
    console.log('Body has AI section: ' + hasAiSection);
    console.log('Body has AI title: ' + hasAiTitle);

    const allBtns = await page.locator('button').allTextContents();
    const addBtnIdx = allBtns.findIndex(b => b.includes('新增物料'));
    console.log('新增物料 button index: ' + addBtnIdx);

    if (addBtnIdx >= 0) {
      await page.locator('button').nth(addBtnIdx).click();
      await delay(4000);

      const formBody = await page.locator('body').innerText();
      console.log('\nForm body (1500 chars): ' + formBody.slice(0, 1500));

      const formBtns = await page.locator('button').allTextContents();
      console.log('\nAll buttons in form: ' + JSON.stringify(formBtns.slice(0, 30)));

      const hasAiInForm = formBody.includes('AI智能匹配');
      const hasMatchInForm = formBody.includes('智能匹配');
      const hasConfidenceInForm = formBody.includes('置信') || formBody.includes('%');
      console.log('\nAI text in form: ' + hasAiInForm + ', Match text: ' + hasMatchInForm + ', Confidence: ' + hasConfidenceInForm);

      const inputs = await page.locator('input').count();
      console.log('Input count in form: ' + inputs);

      // Check if the modal is present - look for close button and form title
      const closeBtns = await page.locator('button[aria-label*="Close"], button[aria-label*="关闭"], [class*="x"]').count();
      console.log('Close-like buttons: ' + closeBtns);

      // Check the form for the "物料名称" label
      const hasNameField = formBody.includes('物料名称') || formBody.includes('material name') || formBody.includes('名称');
      console.log('Name field present: ' + hasNameField);
    }

  } catch (e) {
    console.error('Error:', e.message);
  } finally {
    await browser.close();
  }
}

await run();