import { chromium } from "playwright";

const BASE = "http://localhost:5173";
let browser, context, page;

async function setup() { browser = await chromium.launch({ headless: true }); context = await browser.newContext(); page = await context.newPage(); }

async function login() {
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.click('button[type="submit"]');
  await page.waitForURL("**/", { timeout: 10000 }).catch(() => {});
}

async function main() {
  await setup();
  await login();
  await page.goto(`${BASE}/system/roles`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1000);
  await page.locator("button").filter({ hasText: /新增角色/i }).first().click();
  await page.waitForTimeout(2000);
  const modal = page.locator(".fixed.inset-0").filter({ hasText: /新增角色|编辑角色/i });
  console.log("Modal count:", await modal.count());

  // Print spans
  const spans = await modal.locator("span").allTextContents();
  console.log("Modal spans:", spans.filter(s => s.trim()));

  // Print inputs
  const inputs = await modal.locator("input, textarea").evaluateAll(el => el.map(e => ({ tag: e.tagName, type: e.type, value: e.value, placeholder: e.placeholder })));
  console.log("Modal inputs:", JSON.stringify(inputs, null, 2));

  // Try filling name and code
  const allInputs = modal.locator("input");
  const cnt = await allInputs.count();
  console.log("Input count:", cnt);
  for (let i = 0; i < cnt; i++) {
    const val = await allInputs.nth(i).inputValue();
    console.log(`  Input ${i} value: "${val}"`);
  }

  // Fill first two inputs
  await allInputs.nth(0).fill("Test Role");
  await allInputs.nth(1).fill("test_role");
  await page.waitForTimeout(500);
  console.log("After fill:");
  for (let i = 0; i < cnt; i++) {
    const val = await allInputs.nth(i).inputValue();
    console.log(`  Input ${i} value: "${val}"`);
  }

  // Check save button
  const saveBtn = modal.locator("button").filter({ hasText: /保存/i }).first();
  console.log("Save button disabled:", await saveBtn.isDisabled().catch(() => "N/A"));
  await browser.close();
}

main().catch(e => { console.error(e); browser.close(); });