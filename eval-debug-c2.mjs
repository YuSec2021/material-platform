import pkg from "@playwright/test";
const { chromium } = pkg;

const BASE = "http://localhost:5173";
const API_BASE = "http://localhost:8000";

async function apiRequest(method, path, username, body) {
  const opts = { method, headers: { "Content-Type": "application/json" } };
  if (username) opts.headers["X-Username"] = username;
  if (body) opts.body = JSON.stringify(body);
  const resp = await fetch(`${API_BASE}${path}`, opts);
  let data; try { data = await resp.json(); } catch { data = null; }
  return { status: resp.status, data };
}

async function main() {
  // Understand the complete picture:
  // 1. hcm_zhangsan has 7 accessible libraries
  const libs = await apiRequest("GET", "/api/v1/material-libraries", "hcm_zhangsan", null);
  console.log("Accessible libraries for hcm_zhangsan:");
  libs.data.forEach(l => console.log(`  ${l.id}: ${l.name}`));

  // 2. Which ones have materials?
  console.log("\nMaterials per library:");
  for (const lib of libs.data) {
    const mats = await apiRequest("GET", `/api/v1/materials?material_library_id=${lib.id}`, "hcm_zhangsan", null);
    console.log(`  Lib ${lib.id} (${lib.name}): ${mats.data.length} materials`);
  }

  // 3. The UI selects the first library (294) by default, which has 0 materials
  // Check what happens when we navigate to the materials page
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto(`${BASE}/login`);
  await page.locator("#username").fill("hcm_zhangsan");
  await page.locator("#password").fill("admin123");
  await page.locator("button[type=submit]").click();
  await page.waitForURL(url => !url.pathname.includes("/login"), { timeout: 15000 });

  await page.goto(`${BASE}/materials`);
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(5000);

  // Check which library is auto-selected in the sidebar
  const sidebarInfo = await page.evaluate(() => {
    // Find the sidebar library selection
    const sidebarLibs = Array.from(document.querySelectorAll("aside a, aside button, aside [class*=library]")).map(el => ({
      tag: el.tagName,
      text: el.textContent?.trim().slice(0, 50),
      class: el.className,
    }));

    // Find the active/selected library in the sidebar
    const activeLibs = Array.from(document.querySelectorAll("a[href='/materials'], a[href*='material'], button")).filter(el => {
      const className = el.className || "";
      return className.includes("bg-") || className.includes("blue") || className.includes("selected");
    });

    return {
      sidebarLibs: sidebarLibs.slice(0, 15),
      activeLibs: activeLibs.map(el => el.textContent?.trim()).slice(0, 10),
    };
  });

  console.log("\nSidebar library items:", sidebarInfo.sidebarLibs);
  console.log("\nActive/selected library items:", sidebarInfo.activeLibs);

  // Now try to interact: click on the library that HAS materials
  // Libraries 304 and 306 have materials. The sidebar should have clickable entries for them.
  // Let's check if we can find and click them
  const clickableLibs = await page.evaluate(() => {
    // Find all links/buttons in the sidebar that might be libraries
    const allLinks = Array.from(document.querySelectorAll("aside a, aside button")).map(el => ({
      href: el.getAttribute("href"),
      text: el.textContent?.trim().slice(0, 50),
      class: el.className,
    }));
    return allLinks.filter(el => el.text.includes("sprint42") || el.text.includes("lib"));
  });
  console.log("\nClickable libs in sidebar:", clickableLibs);

  await browser.close();
}

main().catch(e => { console.error("Fatal:", e); process.exit(1); });