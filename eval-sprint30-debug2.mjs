/**
 * Sprint 30 Evaluation - Targeted batch detail debug
 */

const BASE_URL = "http://localhost:5173";
const API_BASE = "http://localhost:8000/api/v1";

async function apiCall(path, method = "GET", body = null) {
  const headers = {
    "Content-Type": "application/json",
    "X-Username": "super_admin",
    "X-User-Role": "super_admin",
    "Authorization": "Bearer super_admin",
  };
  const opts = { method, headers };
  if (body) opts.body = JSON.stringify(body);
  const response = await fetch(`${API_BASE}${path}`, opts);
  const text = await response.text();
  let data = null;
  if (text) { try { data = JSON.parse(text); } catch { data = text; } }
  return { status: response.status, data };
}

async function main() {
  console.log("Sprint 30 - Batch Detail Debug\n");

  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await context.newPage();

  try {
    const loginRes = await apiCall("/auth/login", "POST", { username: "super_admin" });
    if (loginRes.status !== 200) throw new Error("Login failed");

    await page.goto(BASE_URL);
    await page.evaluate((u) => {
      localStorage.setItem("ai-material-auth-session", JSON.stringify({ username: u.username, role: u.is_super_admin ? "super_admin" : "user" }));
    }, loginRes.data);

    await page.goto(`${BASE_URL}/material/library`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(3000);

    const libName = "S30_EvalFull_1779088549545";
    const cardButton = page.locator(`article button:has-text("${libName}")`).first();
    await cardButton.click({ timeout: 10000 });
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(3000);

    // Go to recode records tab
    await page.locator('button[role="tab"]:has-text("重编码记录")').click({ timeout: 5000 });
    await page.waitForTimeout(2000);

    const tableRows = await page.locator("table tbody tr").count();
    console.log("Batch rows:", tableRows);

    // Get info about the first row before clicking
    const firstRow = page.locator("table tbody tr").first();
    const rowText = await firstRow.textContent();
    console.log("First row text:", rowText?.slice(0, 200));

    // Check if there are any expandable/clickable elements
    const rowRole = await firstRow.getAttribute("role").catch(() => null);
    console.log("Row role:", rowRole);

    // Check for buttons or links in the row
    const buttons = await firstRow.locator("button, a, [role='button']").all();
    console.log("Buttons in row:", buttons.length);
    for (let i = 0; i < buttons.length; i++) {
      const text = await buttons[i].textContent();
      console.log(`  Button ${i}:`, text?.trim().slice(0, 50));
    }

    // Click the row
    console.log("\n--- Clicking row ---");
    await firstRow.click();
    await page.waitForTimeout(3000);

    // Check what happened
    const bodyText = await page.locator("body").textContent();

    // Look for "批次" in the content more carefully
    const allDivs = await page.locator("div").all();
    console.log("Total divs:", allDivs.length);

    // Find divs containing "批次"
    for (const div of allDivs.slice(0, 200)) {
      const text = await div.textContent().catch(() => "");
      if (text.includes("批次") && text.includes("物料名称")) {
        console.log("\nFound batch detail div:");
        console.log("Text:", text.slice(0, 300));
        const classes = await div.getAttribute("class");
        console.log("Classes:", classes);
        break;
      }
    }

    // Check for any element with "回滚" text
    const rollbackVisible = await page.locator('button:has-text("回滚")').isVisible({ timeout: 2000 }).catch(() => false);
    console.log("\n回滚 button visible:", rollbackVisible);

    // Check for "物料名称" outside the table
    const materialNameOutside = await page.locator('text=物料名称').count();
    console.log("物料名称 occurrences:", materialNameOutside);

    // Check what the table looks like after click
    const tableHtml = await page.locator("table").first().innerHTML().catch(() => "no table");
    console.log("\nTable HTML (first 500):", tableHtml.slice(0, 500));

    // Check all sections
    const sections = await page.locator("section, article").all();
    console.log("\nSections/articles:", sections.length);
    for (let i = 0; i < sections.length; i++) {
      const text = await sections[i].textContent().catch(() => "");
      const classes = await sections[i].getAttribute("class").catch(() => "");
      if (text.includes("批次") || text.includes("回滚")) {
        console.log(`  Section ${i}:`, classes, "|", text.slice(0, 100));
      }
    }

  } catch (err) {
    console.error("Error:", err.message);
  } finally {
    await browser.close();
  }
}

main().catch(err => { console.error("Fatal:", err); process.exit(1); });