/**
 * Sprint 31 Evaluation - Deep Browser Check
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
  console.log('Sprint 31 Deep Browser Verification\n');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  // 1. Login
  console.log('1. Login...');
  await page.goto(`${BASE}/login`, { timeout: 15000 });
  await page.waitForTimeout(2000);
  await page.fill('input[placeholder="super_admin"]', 'super_admin');
  await page.fill('input[type="password"]', '');
  await page.click('button[type="submit"]');
  await page.waitForTimeout(5000);

  // 2. Material library list
  console.log('2. Material library list...');
  await page.goto(`${BASE}/material/library`, { timeout: 15000 });
  await page.waitForTimeout(5000);
  await page.waitForLoadState('networkidle');

  // Get full text of page
  const bodyText = await page.locator('body').innerText();
  console.log(`   Page text (first 2000 chars):\n${bodyText.slice(0, 2000)}`);

  // Look for any links or buttons
  const links = await page.locator('a[href]').all();
  console.log(`   Links found: ${links.length}`);
  for (const link of links.slice(0, 10)) {
    const text = await link.innerText().catch(() => '');
    const href = await link.getAttribute('href').catch(() => '');
    if (text.trim()) console.log(`   Link: "${text.trim().slice(0, 50)}" -> ${href}`);
  }

  // Look for table
  const tables = await page.locator('table').all();
  console.log(`   Tables: ${tables.length}`);

  // Check if there's an API error or loading state
  const hasError = bodyText.includes('错误') || bodyText.includes('error') || bodyText.includes('Error');
  const hasLoading = bodyText.includes('加载') || bodyText.includes('loading');
  console.log(`   Has error: ${hasError}, has loading: ${hasLoading}`);

  await browser.close();
  console.log('\nDone.');
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });