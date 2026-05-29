import { chromium } from "playwright";

const BASE = "http://localhost:5173";
let browser;
let context;
let page;

async function setup() {
  browser = await chromium.launch({ headless: true });
  context = await browser.newContext();
  page = await context.newPage();

  const requests = [];
  page.on("request", (req) => {
    if (req.url().includes("/api/")) {
      requests.push({ url: req.url(), method: req.method() });
    }
  });
  page._testRequests = requests;

  const apiResponses = [];
  page.on("response", async (resp) => {
    if (resp.url().includes("/api/")) {
      const body = await resp.text().catch(() => "");
      apiResponses.push({ url: resp.url(), status: resp.status(), body: body.substring(0, 500) });
    }
  });
  page._testApiResponses = apiResponses;
}

async function login() {
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.click('button[type="submit"]');
  await page.waitForURL("**/", { timeout: 10000 }).catch(() => {});
  console.log("After login:", page.url());
}

async function debugUserPage() {
  console.log("\n=== DEBUG: User Page ===");
  await page.goto(`${BASE}/system/users`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);

  console.log("All buttons:", await page.locator("button").allTextContents());
  console.log("All inputs:", await page.locator("input").allTextContents().catch(() => []));
  console.log("All textareas:", await page.locator("textarea").count());

  const reqs = page._testRequests;
  console.log("API requests:", reqs.map(r => `${r.method} ${r.url}`));

  // Try clicking create button
  const createBtn = page.locator("button").filter({ hasText: /新增|创建|添加/i }).first();
  console.log("Create button count:", await createBtn.count());
  if (await createBtn.count() > 0) {
    await createBtn.click();
    await page.waitForTimeout(1000);

    console.log("After clicking create - buttons:", await page.locator("button").allTextContents());
    console.log("After clicking create - inputs:", await page.locator("input").evaluateAll(el => el.map(e => `${e.id}:${e.name}:${e.placeholder}`)));
    console.log("After clicking create - textareas:", await page.locator("textarea").evaluateAll(el => el.map(e => `${e.id}:${e.name}:${e.placeholder}`)));
    console.log("After clicking create - selects:", await page.locator("select").evaluateAll(el => el.map(e => `${e.id}:${e.name}`)));

    // Try to fill and submit
    const inputs = await page.locator("input").all();
    if (inputs.length > 0) {
      await inputs[0].fill("testuser_debug");
      const submitBtns = page.locator("button[type='submit']");
      console.log("Submit button count:", await submitBtns.count());
      if (await submitBtns.count() > 0) {
        await submitBtns.first().click();
        await page.waitForTimeout(2000);
        console.log("After submit - API requests:", page._testRequests.map(r => `${r.method} ${r.url}`));
        console.log("After submit - API responses:", page._testApiResponses.map(r => `${r.status} ${r.url}: ${r.body.substring(0, 100)}`));
      }
    }
  }
}

async function debugRolePage() {
  console.log("\n=== DEBUG: Role Page ===");
  await page.goto(`${BASE}/system/roles`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);

  console.log("All buttons:", await page.locator("button").allTextContents());
  console.log("API requests:", page._testRequests.map(r => `${r.method} ${r.url}`));

  const createBtn = page.locator("button").filter({ hasText: /新增|创建|添加/i }).first();
  if (await createBtn.count() > 0) {
    await createBtn.click();
    await page.waitForTimeout(1000);
    console.log("After create click - inputs:", await page.locator("input").evaluateAll(el => el.map(e => `${e.id}:${e.name}:${e.placeholder}`)));
    console.log("After create click - textareas:", await page.locator("textarea").evaluateAll(el => el.map(e => `${e.id}:${e.name}`)));

    const inputs = await page.locator("input").all();
    if (inputs.length > 0) {
      await inputs[0].fill("debug_role");
      if (inputs.length > 1) await inputs[1].fill("debug_code");
      const submitBtns = page.locator("button[type='submit']");
      if (await submitBtns.count() > 0) {
        await submitBtns.first().click();
        await page.waitForTimeout(2000);
        console.log("After submit - API requests:", page._testRequests.map(r => `${r.method} ${r.url}`));
        console.log("After submit - responses:", page._testApiResponses.map(r => `${r.status} ${r.url}`));
      }
    }
  }
}

async function debugSystemInfo() {
  console.log("\n=== DEBUG: System Info ===");
  await page.goto(`${BASE}/system/info`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1000);

  console.log("All inputs:", await page.locator("input").evaluateAll(el => el.map(e => `${e.id}:${e.name}:${e.placeholder}:${e.type}`)));
  console.log("All buttons:", await page.locator("button").allTextContents());
  console.log("All labels:", await page.locator("label").allTextContents());
}

async function debugPermissionPage() {
  console.log("\n=== DEBUG: Permission Config ===");
  await page.goto(`${BASE}/system/permissions`, { waitUntil: "networkidle" });
  await page.waitForTimeout(2000);

  console.log("All buttons:", await page.locator("button").allTextContents());
  console.log("All selects:", await page.locator("select").evaluateAll(el => el.map(e => `${e.id}:${e.name}`)));
  console.log("All checkboxes:", await page.locator('input[type="checkbox"]').count());
  console.log("All divs with class:", await page.locator("div").evaluateAll(el => [...new Set(el.map(e => [...e.classList].join(' ')))].filter(c => c.includes('tree') || c.includes('dir') || c.includes('panel') || c.includes('split')).slice(0, 10)));

  // Check for 2-column layout
  const mainContent = await page.locator("main, [class*='content'], [class*='main']").first();
  const count = await mainContent.count();
  if (count > 0) {
    const className = await mainContent.getAttribute("class");
    console.log("Main content class:", className);
  }
}

async function main() {
  try {
    await setup();
    await login();
    await debugUserPage();
    await debugRolePage();
    await debugSystemInfo();
    await debugPermissionPage();
    await browser.close();
  } catch (err) {
    console.error("Error:", err);
    await browser.close();
  }
}

main();
