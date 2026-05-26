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

  // Test error state
  await page.route("**/api/v1/users", async (r) => {
    await r.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ detail: "Error" }) });
  });
  await page.goto(`${BASE}/system/users`, { waitUntil: "networkidle", timeout: 15000 });
  await page.waitForTimeout(2000);

  // Check what's on the page
  const allText = await page.locator("body").textContent();
  console.log("Body text (filtered):", allText.replace(/\s+/g, ' ').substring(0, 500));

  // Check for error indicators
  const redBg = await page.locator("[class*='red']").count();
  const errorText = await page.locator("text=/失败|错误|出错了/i").count();
  const redDiv = await page.locator("[class*='bg-red']").count();
  const retryBtn = await page.locator("text=/重试/i").count();

  console.log("red classes:", redBg);
  console.log("error text:", errorText);
  console.log("bg-red:", redDiv);
  console.log("retry button:", retryBtn);

  await browser.close();
}

main().catch(e => { console.error(e); browser.close(); });