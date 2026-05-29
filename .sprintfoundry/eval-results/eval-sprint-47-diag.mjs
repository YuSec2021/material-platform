#!/usr/bin/env node
/**
 * Sprint 47 Browser Evaluation - Network Intercept Diagnostic
 */
import { chromium } from 'playwright';
import { writeFileSync } from 'fs';

const BASE = 'http://localhost:5173';
const apiCalls = [];

async function login(page) {
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  const loginBtn = page.locator('button:has-text("登录"), button:has-text("Login")');
  if (await loginBtn.count() > 0) {
    await loginBtn.click();
    await page.waitForTimeout(500);
  }
  const emailInput = page.locator('input[type="email"], input[placeholder*="邮箱"], input[placeholder*="email"]').first();
  const passInput = page.locator('input[type="password"]').first();
  if (await emailInput.count() > 0) {
    await emailInput.fill('super_admin@example.com');
    await passInput.fill('admin123');
    const submitBtn = page.locator('button[type="submit"]').first();
    await submitBtn.click();
    await page.waitForTimeout(2000);
  }
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();

  // Track all API calls
  page.on('request', (request) => {
    if (request.url().includes('/api/v1/')) {
      apiCalls.push({ url: request.url(), method: request.method(), timestamp: Date.now() });
    }
  });

  await login(page);
  apiCalls.length = 0; // clear login calls

  await page.goto(BASE + '/standard/category', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  console.log(`API calls on page load: ${apiCalls.length}`);
  apiCalls.slice(-5).forEach(c => console.log(`  ${c.method} ${c.url}`));

  // Intercept responses for properties endpoint
  const propResponses = [];
  page.on('response', async (response) => {
    if (response.url().includes('/categories/') && response.url().includes('/properties')) {
      try {
        const data = await response.json();
        propResponses.push({ url: response.url(), data });
      } catch {}
    }
  });

  // Click on "办公用品库" library
  const libBtn = page.locator('button:has-text("办公用品库")').first();
  await libBtn.click();
  await page.waitForTimeout(2000);

  const apisAfterLibClick = apiCalls.length;
  console.log(`\nAPI calls after library click: ${apisAfterLibClick}`);
  apiCalls.slice(-5).forEach(c => console.log(`  ${c.method} ${c.url}`));

  // Check what categories are in the tree now
  const catBtns = await page.locator('button').allInnerTexts();
  console.log('\nCategory buttons after library click:');
  catBtns.filter(t => /[一-鿿]/.test(t) && t.trim().length > 2 && t.trim().length < 20 && !['标准管理', '物料管理', '申请流程', '系统管理', 'AI管理', '规则引擎', '调试', '关于', '退出登录', '显示全部', '全部展开', '全部收起', '批量导入', 'AI一键导入', '新增类目'].includes(t.trim())).slice(0, 10).forEach(t => console.log(`  "${t.trim()}"`));

  // Click on "办公用品" to expand it (first click = toggle expand)
  const catBtn = page.locator('button:has-text("办公用品")').first();
  if (await catBtn.count() > 0) {
    console.log('\nClicking 办公用品 (toggle expand)...');
    await catBtn.click();
    await page.waitForTimeout(2000);

    const apisAfterFirstClick = apiCalls.length;
    console.log(`API calls after first click: ${apisAfterFirstClick}`);
    apiCalls.slice(-5).forEach(c => console.log(`  ${c.method} ${c.url}`));

    // Click again on "办公用品" (second click = select it)
    console.log('Clicking 办公用品 again (select)...');
    await catBtn.click();
    await page.waitForTimeout(3000);

    const apisAfterSecondClick = apiCalls.length;
    console.log(`API calls after second click: ${apisAfterSecondClick}`);

    const newApis = apiCalls.slice(apisAfterSecondClick - 5 < apisAfterFirstClick ? apisAfterFirstClick : apisAfterSecondClick - 5);
    newApis.forEach(c => console.log(`  ${c.method} ${c.url}`));

    // Check page state
    const pageText = await page.locator('body').innerText();
    console.log('\n--- After second click ---');
    console.log('Has 自有属性:', pageText.includes('自有属性'));
    console.log('Has 继承属性:', pageText.includes('继承属性'));
    console.log('Has 该类目暂无:', pageText.includes('该类目暂无'));

    // Check if "办公用品" is still visible and if there's a different selected state
    const selectedCatText = pageText.match(/已选类目[^：:]*[：:]*([^\n]{2,30})/);
    if (selectedCatText) console.log('Selected category:', selectedCatText[1]);
  }

  // Also check if there's a different way to select categories
  // Maybe there's a click on the category name that should select it
  // Let's check what happens when we click on a category without children
  console.log('\n--- Looking for leaf categories ---');
  // First expand the tree fully
  const expandAllBtn = page.locator('button:has-text("全部展开")').first();
  if (await expandAllBtn.count() > 0) {
    console.log('Clicking 全部展开...');
    await expandAllBtn.click();
    await page.waitForTimeout(3000);
  }

  // Now find leaf categories (categories without children in the tree)
  const allCatBtns = await page.locator('button').allInnerTexts();
  console.log('Total buttons after expand:', allCatBtns.length);

  // Find categories with short names
  const shortCatBtns = allCatBtns.filter(t => {
    const trimmed = t.trim();
    return /[一-鿿]/.test(trimmed) && trimmed.length >= 2 && trimmed.length <= 10 &&
      !['标准管理', '物料管理', '申请流程', '系统管理', 'AI管理', '规则引擎', '调试', '关于', '退出登录', '显示全部', '全部展开', '全部收起', '批量导入', 'AI一键导入', '新增类目', 'English', '上一页', '下一页', '编辑', '删除', '办公用品', '五金工具库', '旅控'].includes(trimmed);
  });
  console.log('Short category buttons:', shortCatBtns.slice(0, 30));

  // Try clicking a leaf category
  if (shortCatBtns.length > 0) {
    const leafCat = shortCatBtns[0];
    console.log(`\nClicking leaf category: "${leafCat}"`);
    const leafBtn = page.locator(`button:has-text("${leafCat}")`).first();
    await leafBtn.click();
    await page.waitForTimeout(3000);

    const apisAfterLeaf = apiCalls.length;
    console.log(`API calls after leaf click: ${apisAfterLeaf}`);
    apiCalls.slice(-5).forEach(c => console.log(`  ${c.method} ${c.url}`));

    const pageText2 = await page.locator('body').innerText();
    console.log('Has 自有属性:', pageText2.includes('自有属性'));
    console.log('Has 继承属性:', pageText2.includes('继承属性'));
    console.log('Has 该类目暂无:', pageText2.includes('该类目暂无'));

    await page.screenshot({ path: '/Users/yusec/projects/material_retrieval/.sprintfoundry/eval-results/sprint-47-leaf.png', fullPage: false });
  }

  console.log('\n--- Properties API responses ---');
  console.log(JSON.stringify(propResponses, null, 2));

  await browser.close();
}

main().catch(console.error);