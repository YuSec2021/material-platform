import { chromium } from "playwright";

const BASE = "http://localhost:5173";
let browser, context, page;

async function setup() {
  browser = await chromium.launch({ headless: true });
  context = await browser.newContext();
  page = await context.newPage();
}

async function login() {
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.click('button[type="submit"]');
  await page.waitForURL("**/", { timeout: 10000 }).catch(() => {});
  console.log("Logged in:", page.url());
}

async function main() {
  await setup();
  await login();

  await page.goto(`${BASE}/system/users`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1000);

  await page.locator("button").filter({ hasText: /新增用户/i }).first().click();
  await page.waitForTimeout(2000);

  const modal = page.locator(".fixed.inset-0").filter({ hasText: /新增本地用户|编辑本地用户/i });
  console.log("Modal count:", await modal.count());

  // Approach 1: Use label >> input (following sibling) CSS selector
  const usernameInput1 = modal.locator("span:text('用户名'):visible ~ input, span:text('用户名') + input").first();
  console.log("Approach 1 - username input:", await usernameInput1.count());

  // Approach 2: Use page.locator with chain
  const usernameInput2 = modal.locator("span").filter({ hasText: /^用户名$/ }).locator("..").locator("input").first();
  console.log("Approach 2 - username input:", await usernameInput2.count());

  // Approach 3: Use getByLabel
  const usernameInput3 = modal.getByLabel("用户名").first();
  console.log("Approach 3 - username input:", await usernameInput3.count());

  // Approach 4: Find the first input that is NOT readonly (since username is readOnly when editing)
  // In create mode, username is NOT readonly
  const allInputs = modal.locator("input:not([readonly])");
  console.log("Non-readonly inputs:", await allInputs.count());
  if (await allInputs.count() > 0) {
    console.log("First non-readonly input value:", await allInputs.first().inputValue());
  }

  // Approach 5: Get inputs by position - username is first input
  const input0 = modal.locator("input").nth(0);
  const input1 = modal.locator("input").nth(1);
  console.log("Input 0 value:", await input0.inputValue().catch(() => "N/A"));
  console.log("Input 1 value:", await input1.inputValue().catch(() => "N/A"));

  // Try filling with locators
  console.log("\n--- Testing fill approach ---");

  // Use type instead of fill
  await input0.fill("testuser_debug123");
  await page.waitForTimeout(300);
  console.log("After fill(0), input 0 value:", await input0.inputValue());
  console.log("After fill(0), input 1 value:", await input1.inputValue());

  await input1.fill("Test User Name");
  await page.waitForTimeout(300);
  console.log("After fill(1), input 1 value:", await input1.inputValue());

  // Check save button
  const saveBtn = modal.locator("button").filter({ hasText: /保存/i }).first();
  console.log("Save button disabled:", await saveBtn.isDisabled().catch(() => "N/A"));

  // Print all spans in modal to understand structure
  const spans = await modal.locator("span").allTextContents();
  console.log("Modal spans:", spans.filter(s => s.trim()).slice(0, 15));

  // Check the inputs in the modal after fills
  const inputs = await modal.locator("input").evaluateAll(el => el.map(e => ({ type: e.type, value: e.value, readOnly: e.readOnly })));
  console.log("Modal inputs after fill:", JSON.stringify(inputs, null, 2));

  await browser.close();
}

main().catch(e => { console.error(e); browser.close(); });
