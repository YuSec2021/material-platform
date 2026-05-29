#!/usr/bin/env node
/**
 * Sprint 47 - Criterion 4 Deep Debug
 */
import { chromium } from 'playwright';

const BASE = 'http://localhost:5173';

async function login(page) {
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  const loginBtn = page.locator('button:has-text("登录"), button:has-text("Login")');
  if (await loginBtn.count() > 0) { await loginBtn.click(); await page.waitForTimeout(500); }
  const emailInput = page.locator('input[type="email"], input[placeholder*="邮箱"], input[placeholder*="email"]').first();
  const passInput = page.locator('input[type="password"]').first();
  if (await emailInput.count() > 0) {
    await emailInput.fill('super_admin');
    await passInput.fill('admin123');
    await page.locator('button[type="submit"]').first().click();
    await page.waitForTimeout(2000);
  }
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();

  await login(page);
  await page.goto(BASE + '/materials', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  // Intercept ALL responses
  const allResponses = [];
  page.on('response', async (resp) => {
    if (resp.url().includes('/api/v1/')) {
      try {
        const data = await resp.json();
        allResponses.push({ url: resp.url(), status: resp.status(), keys: Object.keys(data).slice(0, 5) });
      } catch {
        allResponses.push({ url: resp.url(), status: resp.status(), keys: [] });
      }
    }
  });

  // Open form
  const allBtns = await page.locator('button').all();
  for (const btn of allBtns) {
    const text = (await btn.innerText()).trim();
    if (text === '新增物料') {
      await btn.click();
      await page.waitForTimeout(3000);
      break;
    }
  }

  console.log('Form opened, checking modal...');
  const modalExists = await page.locator('[role="dialog"]').count() > 0;
  console.log(`Modal exists: ${modalExists}`);

  const modalSelects = page.locator('[role="dialog"] select');
  const selectCount = await modalSelects.count();
  console.log(`Modal selects: ${selectCount}`);

  // Get options for each select
  for (let i = 0; i < selectCount; i++) {
    const opts = await modalSelects.nth(i).locator('option').allInnerTexts();
    console.log(`Select ${i}: ${JSON.stringify(opts.slice(0, 3))}`);
  }

  // Try different approaches to select category
  // Approach 1: Use the selectOption on the visible select
  const catSelect = modalSelects.nth(1);
  const catVisible = await catSelect.isVisible();
  console.log(`Category select visible: ${catVisible}`);

  if (catVisible) {
    // Select the "办公设备 / 打印机" option
    console.log('Selecting category...');
    await catSelect.selectOption({ value: '1' });
    await page.waitForTimeout(4000); // longer wait

    const pageText = await page.locator('body').innerText();
    console.log('\n--- After category selection ---');
    console.log('Has 自有属性:', pageText.includes('自有属性'));
    console.log('Has 继承属性:', pageText.includes('继承属性'));
    console.log('Has 重量:', pageText.includes('重量'));
    console.log('Has 属性 (total):', (pageText.match(/属性/g) || []).length);
    console.log('Has 继承 (total):', (pageText.match(/继承/g) || []).length);

    // Check API responses
    const propCalls = allResponses.filter(r => r.url.includes('/properties'));
    console.log('\nProperties API calls:', propCalls.length);
    propCalls.forEach(c => console.log(`  ${c.url}`));

    // Try scrolling down to see the form sections
    await page.locator('body').evaluate(el => el.scrollTop = el.scrollHeight);
    await page.waitForTimeout(500);

    const pageText2 = await page.locator('body').innerText();
    console.log('\n--- After scrolling ---');
    console.log('Has 自有属性:', pageText2.includes('自有属性'));
    console.log('Has 继承属性:', pageText2.includes('继承属性'));
    console.log('Has 重量:', pageText2.includes('重量'));

    // Get the modal content
    const modalContent = await page.locator('[role="dialog"]').first().innerText();
    console.log('\nModal text (first 2000):', modalContent.slice(0, 2000));

    await page.screenshot({ path: '/Users/yusec/projects/material_retrieval/.sprintfoundry/eval-results/sprint-47-c4-debug.png', fullPage: true });
    console.log('Screenshot saved');
  } else {
    console.log('Category select not visible');
    const modalHTML = await page.locator('[role="dialog"]').first().innerHTML();
    console.log('Modal HTML:', modalHTML.slice(0, 3000));
  }

  await browser.close();
}

main().catch(console.error);