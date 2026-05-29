import { chromium } from 'playwright';

const BASE = 'http://localhost:5173';

async function run() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    // Login
    await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
    await page.fill('input[type="text"], input[name="username"]', 'super_admin');
    await page.fill('input[type="password"]', '');
    await page.click('button[type="submit"]');
    await page.waitForURL(url => !url.pathname.endsWith('/login'), { timeout: 10000 });

    await page.goto(`${BASE}/system/permissions`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(3000);

    // Get all text content from the permission detail rows
    const detailTexts = await page.evaluate(() => {
      const labels = document.querySelectorAll('label[class*="flex"]');
      return Array.from(labels).map(l => l.textContent?.trim().replace(/\s+/g, ' ')).filter(t => t);
    });

    console.log('Permission detail rows (first 30):');
    for (const text of detailTexts.slice(0, 30)) {
      console.log(`  "${text}"`);
    }

    // Check specifically for raw API paths
    const rawApiPattern = /api\.(GET|POST|PUT|PATCH|DELETE)/;
    const rawInDetails = detailTexts.filter(t => rawApiPattern.test(t));
    console.log(`\nRows containing raw API method: ${rawInDetails.length}`);
    if (rawInDetails.length > 0) {
      console.log('First raw row:', rawInDetails[0]);
    }

    // Check for Chinese operation labels in the detail rows
    const chineseOps = ['查看', '新建', '编辑', '删除', '列表', '导出', '导入', '审批', '驳回'];
    for (const op of chineseOps) {
      const count = detailTexts.filter(t => t.includes(op)).length;
      console.log(`  "${op}" appears in ${count} detail rows`);
    }

    // Check the legend elements
    const legends = await page.evaluate(() => {
      const els = document.querySelectorAll('legend');
      return Array.from(els).map(l => l.textContent?.trim());
    });
    console.log('\nLegend labels:');
    for (const leg of legends) {
      console.log(`  "${leg}"`);
    }

    // Check sidebar module names
    const sidebarButtons = await page.evaluate(() => {
      const btns = document.querySelectorAll('button[class*="w-full"]');
      return Array.from(btns).map(b => b.textContent?.trim().replace(/\s+/g, ' ')).filter(t => t && t.length > 2);
    });
    console.log('\nSidebar module buttons:');
    for (const btn of sidebarButtons) {
      console.log(`  "${btn}"`);
    }

    // Check for raw module keys in sidebar
    const rawModuleKeys = ['material_archives', 'category_management', 'attribute_management'];
    for (const key of rawModuleKeys) {
      const found = sidebarButtons.some(b => b.toLowerCase().includes(key));
      console.log(`  Raw key "${key}" in sidebar: ${found}`);
    }

  } catch (err) {
    console.error(`ERROR: ${err.message}`);
  }

  await browser.close();
}

run().catch(console.error);
