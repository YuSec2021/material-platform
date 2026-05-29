import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  const errors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') errors.push(msg.text());
  });

  // Criterion 7: Role restrictions - use new context to simulate fresh browser
  console.log('\n=== Criterion 7: Role restrictions ===');
  const browser2 = await chromium.launch();
  const context2 = await browser2.newContext();
  const page2 = await context2.newPage();

  // Login as regular_user
  await page2.goto('http://localhost:5173/login');
  await page2.waitForLoadState('networkidle');
  await page2.waitForTimeout(2000);

  const inputs = await page2.locator('input').count();
  console.log('  Login inputs count:', inputs);

  if (inputs > 0) {
    await page2.locator('input').first().fill('regular_user');
    await page2.locator('button[type="submit"]').first().click();
    await page2.waitForLoadState('networkidle');
    await page2.waitForTimeout(3000);
  } else {
    // Try to set session via localStorage / cookies
    await page2.evaluate(async () => {
      // Try API login
      const resp = await fetch('http://localhost:8000/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'regular_user' }),
      });
      return await resp.json();
    }).then(data => console.log('  API login result:', JSON.stringify(data).substring(0, 100)));
  }

  await page2.goto('http://localhost:5173/ai/models');
  await page2.waitForLoadState('networkidle');
  await page2.waitForTimeout(3000);
  console.log('  regular_user URL after /ai/models:', page2.url());
  const bodyTextReg = await page2.textContent('body');
  const redirected = page2.url() === 'http://localhost:5173/' || !bodyTextReg.includes('模型网关');
  console.log('  Redirected from /ai/models:', redirected);
  console.log('  Body snippet:', bodyTextReg.substring(0, 200).replace(/\n/g, ' '));

  await browser2.close();
  await browser.close();

  console.log('\n=== DONE ===');
})();