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

  // Create a role
  await page.locator("button").filter({ hasText: /新增角色/i }).first().click();
  await page.waitForTimeout(1000);
  const createModal = page.locator(".fixed.inset-0").filter({ hasText: /新增角色|编辑角色/i });
  const inputs = createModal.locator("input");
  await inputs.nth(0).fill("Test Role");
  await inputs.nth(1).fill(`tr${Date.now()}`);
  await createModal.locator("textarea").first().fill("Test");
  await createModal.locator("button").filter({ hasText: /^保存$/i }).first().click();
  await page.waitForTimeout(2000);
  console.log("Role created");

  // Try to close bind modal with backdrop
  const bindBtn = page.locator("table button").filter({ hasText: /绑定用户/i }).first();
  if (await bindBtn.count() > 0) {
    await bindBtn.click();
    await page.waitForTimeout(1500);
    const bindModal = page.locator(".fixed.inset-0").filter({ hasText: /绑定用户/i });
    console.log("Bind modal visible:", await bindModal.count() > 0);

    // Try Escape key
    await page.keyboard.press("Escape");
    await page.waitForTimeout(1000);
    console.log("After Escape, bind modal visible:", await bindModal.count() > 0);

    // Try X button
    if (await bindModal.count() > 0) {
      const xBtn = bindModal.locator("button").first();
      await xBtn.click({ force: true });
      await page.waitForTimeout(1000);
      console.log("After X click, bind modal visible:", await bindModal.count() > 0);
    }

    // Try backdrop click with { force: true }
    if (await bindModal.count() > 0) {
      const backdrop = bindModal.locator(".absolute.inset-0");
      await backdrop.click({ force: true, timeout: 2000 });
      await page.waitForTimeout(1000);
      console.log("After backdrop click, bind modal visible:", await bindModal.count() > 0);
    }

    // Try the fixed backdrop
    if (await bindModal.count() > 0) {
      // Try clicking the fixed div that contains the modal
      await page.locator(".fixed.inset-0.z-50").first().locator(".absolute.inset-0").first().click({ force: true, timeout: 2000 });
      await page.waitForTimeout(1000);
      console.log("After fixed backdrop click, bind modal visible:", await bindModal.count() > 0);
    }

    // Just wait longer
    if (await bindModal.count() > 0) {
      await page.waitForTimeout(2000);
      console.log("After waiting, bind modal visible:", await bindModal.count() > 0);
    }

    // Try scrolling the table to bring edit button into view
    if (await bindModal.count() > 0) {
      // Force close by evaluating JS
      await page.evaluate(() => {
        const modals = document.querySelectorAll(".fixed.inset-0.z-50");
        modals.forEach(m => m.remove());
      });
      await page.waitForTimeout(1000);
      console.log("After JS remove, bind modal visible:", await bindModal.count() > 0);
    }

    // Try edit button
    const editBtn = page.locator("table button").filter({ hasText: /编辑/i }).first();
    console.log("Edit button count:", await editBtn.count());
    if (await editBtn.count() > 0) {
      try {
        await editBtn.click({ timeout: 5000 });
        console.log("Edit button clicked successfully");
      } catch (e) {
        console.log("Edit button click failed:", e.message.substring(0, 200));
        // Try with force
        await editBtn.click({ force: true, timeout: 5000 });
        console.log("Edit button clicked with force");
      }
    }
  }

  await browser.close();
}

main().catch(e => { console.error(e); browser.close(); });