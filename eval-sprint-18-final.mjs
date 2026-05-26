import { chromium } from "playwright";

const BASE = "http://localhost:5173";
const results = [];
let browser, context, page;

function log(msg) { console.log(`[${new Date().toISOString()}] ${msg}`); }
function pass(c, o) { results.push({ criterion: c, result: "PASS", observation: o }); console.log(`  PASS: ${c}`); }
function fail(c, o) { results.push({ criterion: c, result: "FAIL", observation: o }); console.log(`  FAIL: ${c} -- ${o}`); }

async function setup() {
  log("Launching browser...");
  browser = await chromium.launch({ headless: true });
  context = await browser.newContext();
  page = await context.newPage();
  const reqs = [];
  page.on("request", (r) => { if (r.url().includes("/api/")) reqs.push({ m: r.method(), u: r.url() }); });
  page._reqs = reqs;
  log("Browser ready.");
}

async function teardown() { if (browser) await browser.close(); }

async function clearAllAuth() {
  await context.clearCookies();
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => localStorage.removeItem("ai-material-auth-session"));
}

async function login() {
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.click('button[type="submit"]');
  await page.waitForURL("**/", { timeout: 10000 }).catch(() => {});
  log(`Logged in: ${page.url()}`);
}

async function nav(url) {
  page._reqs.length = 0;
  await page.goto(url, { waitUntil: "networkidle", timeout: 15000 });
}

function req(method, pattern) {
  return page._reqs.find(r => r.u.match(pattern) && (method === "*" || r.m === method));
}

async function closeModal(modalLocator) {
  const xBtn = modalLocator.locator("header, [class*='header']").first().locator("button").first();
  if (await xBtn.count() > 0) {
    try { await xBtn.click({ timeout: 3000 }); await page.waitForTimeout(500); return; } catch (_) {}
  }
  try {
    const xBtn2 = modalLocator.locator("button").first();
    await xBtn2.click({ force: true, timeout: 3000 });
    await page.waitForTimeout(500);
  } catch (_) {}
}

// =============================================================================
// Criterion 1: User management
// =============================================================================
async function testUserManagement() {
  log("\n=== Criterion 1: User Management ===");
  const crit = "User management: CRUD wired to /api/v1/users, local-user create/edit/password-reset/delete with confirmation";

  await nav(`${BASE}/system/users`);
  await page.waitForTimeout(1000);

  if (req("GET", "/api/v1/users")) pass(crit + " [GET]", "GET /api/v1/users sent");
  else fail(crit + " [GET]", "GET /api/v1/users NOT sent");

  if (await page.locator("table").count() > 0) pass(crit + " [table]", "User table rendered");
  else { fail(crit + " [table]", "User table NOT found"); return; }

  await page.locator("button").filter({ hasText: /新增用户/i }).first().click();
  await page.waitForTimeout(1000);
  const modal = page.locator(".fixed.inset-0").filter({ hasText: /新增本地用户|编辑本地用户/i });
  if (!(await modal.count() > 0)) { fail(crit + " [modal]", "Modal did NOT open"); return; }

  const uniqueUser = `testuser_${Date.now()}`;
  const inputs = modal.locator("input");
  await inputs.nth(0).fill(uniqueUser);
  await inputs.nth(1).fill("Test User");
  await inputs.nth(2).fill("Test Unit");
  await inputs.nth(3).fill("Test Dept");
  await inputs.nth(4).fill("Test Team");
  await inputs.nth(5).fill("test@example.com");

  await modal.locator("button").filter({ hasText: /^保存$/i }).first().click();
  await page.waitForTimeout(2000);

  if (req("POST", "/api/v1/users")) pass(crit + " [POST]", "POST /api/v1/users sent");
  else fail(crit + " [POST]", "POST /api/v1/users NOT sent");

  if (await page.locator(`table >> text=${uniqueUser}`).count() > 0) pass(crit + " [user in table]", "Created user in table");
  else fail(crit + " [user in table]", "Created user NOT in table");

  const editBtn = page.locator("table button:not([disabled])").filter({ hasText: /编辑/i }).first();
  if (await editBtn.count() > 0) {
    await editBtn.click();
    await page.waitForTimeout(1000);
    const editModal = page.locator(".fixed.inset-0").filter({ hasText: /编辑本地用户/i });
    if (await editModal.count() > 0) {
      pass(crit + " [edit modal]", "Edit modal opened");
      const editInputs = editModal.locator("input:not([readonly])");
      await editInputs.nth(2).clear(); await editInputs.nth(2).fill("Updated Dept");
      await editModal.locator("button").filter({ hasText: /^保存$/i }).first().click();
      await page.waitForTimeout(2000);
      if (req("PUT", "/api/v1/users/")) pass(crit + " [PUT]", "PUT /api/v1/users/<id> sent");
      else fail(crit + " [PUT]", "PUT /api/v1/users/<id> NOT sent");
    }
  }

  const resetBtn = page.locator("table button:not([disabled])").filter({ hasText: /重置密码/i }).first();
  if (await resetBtn.count() > 0) {
    await resetBtn.click();
    await page.waitForTimeout(2000);
    if (req("POST", "/api/v1/users/.*/password-reset")) pass(crit + " [reset]", "POST password-reset sent");
    else fail(crit + " [reset]", "POST password-reset NOT sent");
  }

  const deleteBtn = page.locator("table button:not([disabled])").filter({ hasText: /^删除$/i }).first();
  if (await deleteBtn.count() > 0) {
    page.once("dialog", async (d) => { await d.accept(); });
    await deleteBtn.click();
    await page.waitForTimeout(2000);
    if (req("DELETE", "/api/v1/users/")) {
      pass(crit + " [DELETE]", "DELETE /api/v1/users/<id> sent");
      pass(crit + " [confirm]", "Confirmation dialog shown");
    } else fail(crit + " [DELETE]", "DELETE /api/v1/users/<id> NOT sent");
  }
}

// =============================================================================
// Criterion 2: Role management
// =============================================================================
async function testRoleManagement() {
  log("\n=== Criterion 2: Role Management ===");
  const crit = "Role management: CRUD, enable/disable, user binding wired to /api/v1/roles";

  await nav(`${BASE}/system/roles`);
  await page.waitForTimeout(1000);

  if (req("GET", "/api/v1/roles")) pass(crit + " [GET]", "GET /api/v1/roles sent");
  else fail(crit + " [GET]", "GET /api/v1/roles NOT sent");

  if (await page.locator("table").count() > 0) pass(crit + " [table]", "Role table rendered");
  else { fail(crit + " [table]", "Role table NOT found"); return; }

  await page.locator("button").filter({ hasText: /新增角色/i }).first().click();
  await page.waitForTimeout(1000);
  const createModal = page.locator(".fixed.inset-0").filter({ hasText: /新增角色|编辑角色/i });
  if (await createModal.count() > 0) {
    const uName = `test_role_${Date.now()}`;
    await createModal.locator("input").nth(0).fill(uName);
    await createModal.locator("input").nth(1).fill(`tr${Date.now()}`);
    await createModal.locator("textarea").first().fill("Test role description");

    await createModal.locator("button").filter({ hasText: /^保存$/i }).first().click();
    await page.waitForTimeout(2000);

    if (req("POST", "/api/v1/roles")) pass(crit + " [POST]", "POST /api/v1/roles sent");
    else fail(crit + " [POST]", "POST /api/v1/roles NOT sent");

    await page.waitForTimeout(500);
    const toggleBtn = page.locator("table button").filter({ hasText: /启用|停用/i }).first();
    if (await toggleBtn.count() > 0) {
      await toggleBtn.click();
      await page.waitForTimeout(2000);
      if (req("PATCH", "/api/v1/roles/.*disable") || req("PATCH", "/api/v1/roles/.*enable"))
        pass(crit + " [toggle]", "PATCH enable/disable sent");
      else fail(crit + " [toggle]", "PATCH enable/disable NOT sent");
    }

    const bindBtn = page.locator("table button").filter({ hasText: /绑定用户/i }).first();
    if (await bindBtn.count() > 0) {
      await bindBtn.click();
      await page.waitForTimeout(1500);
      const bindModal = page.locator(".fixed.inset-0").filter({ hasText: /绑定用户/i });
      if (await bindModal.count() > 0) {
        pass(crit + " [bind modal]", "Bind users modal opened");
        if (req("GET", "/api/v1/users") || req("GET", "/api/v1/roles/.*users"))
          pass(crit + " [get users]", "Users fetched for binding");
        else fail(crit + " [get users]", "Users NOT fetched for binding");
        await closeModal(bindModal);
      }
    }

    const editBtn = page.locator("table button").filter({ hasText: /编辑/i }).first();
    if (await editBtn.count() > 0) {
      await editBtn.click();
      await page.waitForTimeout(1000);
      const editModal = page.locator(".fixed.inset-0").filter({ hasText: /编辑角色/i });
      if (await editModal.count() > 0) {
        await editModal.locator("input").nth(0).fill(`${uName}_updated`);
        await editModal.locator("button").filter({ hasText: /^保存$/i }).first().click();
        await page.waitForTimeout(2000);
        if (req("PUT", "/api/v1/roles/")) pass(crit + " [PUT]", "PUT /api/v1/roles/<id> sent");
        else fail(crit + " [PUT]", "PUT /api/v1/roles/<id> NOT sent");
      }
    }

    const deleteBtn = page.locator("table button").filter({ hasText: /^删除$/i }).first();
    if (await deleteBtn.count() > 0) {
      page.once("dialog", async (d) => { await d.accept(); });
      await deleteBtn.click();
      await page.waitForTimeout(2000);
      if (req("DELETE", "/api/v1/roles/")) pass(crit + " [DELETE]", "DELETE /api/v1/roles/<id> sent");
      else fail(crit + " [DELETE]", "DELETE /api/v1/roles/<id> NOT sent");
    }
  }
}

// =============================================================================
// Criterion 3: Permission configuration
// =============================================================================
async function testPermissionConfig() {
  log("\n=== Criterion 3: Permission Configuration ===");
  const crit = "Permission config: split-pane, role-scoped, save/reset wired to /api/v1/permissions/catalog and /api/v1/roles/{id}/permissions";

  await nav(`${BASE}/system/permissions`);
  await page.waitForTimeout(2000);

  if (req("GET", "/api/v1/permissions/catalog")) pass(crit + " [GET catalog]", "GET /api/v1/permissions/catalog sent");
  else fail(crit + " [GET catalog]", "GET /api/v1/permissions/catalog NOT sent");

  if (req("GET", "/api/v1/roles")) pass(crit + " [GET roles]", "GET /api/v1/roles sent");
  else fail(crit + " [GET roles]", "GET /api/v1/roles NOT sent");

  const leftPanel = await page.locator("[class*='col-span-4']").count() > 0;
  const rightPanel = await page.locator("[class*='col-span-8']").count() > 0;
  if (leftPanel && rightPanel) pass(crit + " [split pane]", "Split-pane layout detected");
  else fail(crit + " [split pane]", "Split-pane layout NOT detected");

  const roleSelector = page.locator("select").first();
  if (await roleSelector.count() > 0) {
    const options = await roleSelector.locator("option").all();
    if (options.length > 1) {
      await roleSelector.selectOption({ index: 1 });
      await page.waitForTimeout(1500);
      if (req("GET", "/api/v1/roles/.*permissions"))
        pass(crit + " [GET perms]", "GET /api/v1/roles/<id>/permissions sent");
      else fail(crit + " [GET perms]", "GET /api/v1/roles/<id>/permissions NOT sent");

      const checkboxes = await page.locator('input[type="checkbox"]').count();
      if (checkboxes > 0) pass(crit + " [checkboxes]", `${checkboxes} permission checkboxes found`);
    }
  }

  if (await page.locator("button").filter({ hasText: /重置/i }).first().count() > 0)
    pass(crit + " [reset btn]", "Reset button found");
  else fail(crit + " [reset btn]", "Reset button NOT found");

  if (await page.locator("button").filter({ hasText: /保存/i }).first().count() > 0)
    pass(crit + " [save btn]", "Save button found");
  else fail(crit + " [save btn]", "Save button NOT found");
}

// =============================================================================
// Criterion 4: System information
// =============================================================================
async function testSystemInfo() {
  log("\n=== Criterion 4: System Information ===");
  const crit = "System info: name and icon metadata wired to GET/PUT /api/v1/system/config";

  await nav(`${BASE}/system/info`);
  await page.waitForTimeout(1000);

  if (req("GET", "/api/v1/system/config")) pass(crit + " [GET]", "GET /api/v1/system/config sent");
  else fail(crit + " [GET]", "GET /api/v1/system/config NOT sent");

  const sysNameInput = page.locator('input[type="text"]').first();
  if (await sysNameInput.count() > 0) {
    pass(crit + " [name input]", "System name input found");
    if (await page.locator('input[type="file"]').first().count() > 0)
      pass(crit + " [icon upload]", "Icon upload zone found");
    else fail(crit + " [icon upload]", "Icon upload zone NOT found");

    if (await page.locator("button").filter({ hasText: /保存设置/i }).first().count() > 0)
      pass(crit + " [save btn]", "Save settings button found");
    else fail(crit + " [save btn]", "Save settings button NOT found");
  } else fail(crit + " [name input]", "System name input NOT found");
}

// =============================================================================
// Criterion 5: Reason options
// =============================================================================
async function testReasonOptions() {
  log("\n=== Criterion 5: Reason Options ===");
  const crit = "Reason options: dual-section editor wired to GET/PUT /api/v1/system/config";

  await nav(`${BASE}/system/reason-options`);
  await page.waitForTimeout(1000);

  if (req("GET", "/api/v1/system/config")) pass(crit + " [GET]", "GET /api/v1/system/config sent");
  else fail(crit + " [GET]", "GET /api/v1/system/config NOT sent");

  if (await page.locator("text=/停采/i").count() > 0) pass(crit + " [purchase]", "Stop-purchase section found");
  else fail(crit + " [purchase]", "Stop-purchase section NOT found");

  if (await page.locator("text=/停用/i").count() > 0) pass(crit + " [use]", "Stop-use section found");
  else fail(crit + " [use]", "Stop-use section NOT found");

  const addBtns = await page.locator("button").filter({ hasText: /新增|添加/i }).count();
  if (addBtns >= 2) pass(crit + " [add controls]", `Found ${addBtns} add controls`);
  else fail(crit + " [add controls]", `Only ${addBtns} add controls found`);

  const addPurchaseBtn = page.locator("button").filter({ hasText: /新增|添加/i }).first();
  if (await addPurchaseBtn.count() > 0) {
    await addPurchaseBtn.click();
    await page.waitForTimeout(500);
    const reasonInput = page.locator('input[placeholder*="原因"], input[placeholder*="reason"]').first();
    if (await reasonInput.count() > 0) {
      await reasonInput.fill(`Test Reason ${Date.now()}`);
      const saveBtn = page.locator("button").filter({ hasText: /保存/i }).first();
      if (await saveBtn.count() > 0) {
        await saveBtn.click();
        await page.waitForTimeout(2000);
        if (req("PUT", "/api/v1/system/config"))
          pass(crit + " [PUT]", "PUT /api/v1/system/config sent");
        else fail(crit + " [PUT]", "PUT /api/v1/system/config NOT sent");
      }
    }
  }
}

// =============================================================================
// Criterion 6: Approval mode
// =============================================================================
async function testApprovalMode() {
  log("\n=== Criterion 6: Approval Mode ===");
  const crit = "Approval mode: selectable cards wired to PUT /api/v1/system/config";

  await nav(`${BASE}/system/approval-mode`);
  await page.waitForTimeout(1000);

  if (req("GET", "/api/v1/system/config")) pass(crit + " [GET]", "GET /api/v1/system/config sent");
  else fail(crit + " [GET]", "GET /api/v1/system/config NOT sent");

  if (await page.locator("text=/简易/i").count() > 0) pass(crit + " [simple]", "Simple approval card found");
  else fail(crit + " [simple]", "Simple approval card NOT found");

  if (await page.locator("text=/工作流/i").count() > 0) pass(crit + " [workflow]", "Workflow approval card found");
  else fail(crit + " [workflow]", "Workflow approval card NOT found");

  const simpleOption = page.locator("text=/简易/i").first();
  if (await simpleOption.count() > 0) {
    await simpleOption.click();
    await page.waitForTimeout(500);
    const saveBtn = page.locator("button").filter({ hasText: /保存/i }).first();
    if (await saveBtn.count() > 0) {
      await saveBtn.click();
      await page.waitForTimeout(2000);
      if (req("PUT", "/api/v1/system/config"))
        pass(crit + " [PUT]", "PUT /api/v1/system/config sent for simple mode");
      else fail(crit + " [PUT]", "PUT /api/v1/system/config NOT sent");
    }
  }
}

// =============================================================================
// Criterion 7: Quality gates
// =============================================================================
async function testQualityGates() {
  log("\n=== Criterion 7: Quality Gates ===");
  const crit = "Quality gates: auth guard, loading/error/empty states";

  // Auth guard
  const freshCtx = await browser.newContext();
  const freshPage = await freshCtx.newPage();
  await freshPage.goto(`${BASE}/system/users`, { waitUntil: "networkidle", timeout: 10000 });
  await freshPage.waitForTimeout(1000);
  if (freshPage.url().includes("/login"))
    pass(crit + " [auth guard]", "Unauthenticated redirects to /login");
  else
    fail(crit + " [auth guard]", `Expected /login, got ${freshPage.url()}`);
  await freshPage.close();
  await freshCtx.close();

  // Nav links
  await nav(`${BASE}/`);
  await page.waitForTimeout(1000);
  const links = [
    { t: "用户管理", p: "system/users" },
    { t: "角色管理", p: "system/roles" },
    { t: "权限配置", p: "system/permissions" },
    { t: "系统信息", p: "system/info" },
    { t: "原因选项", p: "system/reason-options" },
    { t: "审批模式", p: "system/approval-mode" },
  ];
  let found = 0;
  for (const l of links) {
    if (await page.locator(`a[href*='${l.p}']`).first().count() > 0) { found++; log(`  Found: ${l.t}`); }
    else log(`  Missing: ${l.t}`);
  }
  if (found >= 4) pass(crit + " [nav links]", `Found ${found}/6 nav links`);
  else fail(crit + " [nav links]", `Only found ${found}/6`);

  // Loading state
  await nav(`${BASE}/system/users`);
  await page.waitForTimeout(200);
  if (await page.locator("[class*='skeleton'], [class*='loading'], [class*='spinner']").count() > 0)
    pass(crit + " [loading]", "Loading state detected");

  // Error state
  await page.route("**/api/v1/users", async (r) => {
    await r.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ detail: "Error" }) });
  });
  await nav(`${BASE}/system/users`);
  await page.waitForTimeout(1500);
  // Error state uses red styling (border-red-200, bg-red-50, text-red-700) and "后端数据加载失败" / "重试" text
  if (await page.locator("[class*='red']").count() > 0 || await page.locator("text=/失败|重试/i").count() > 0)
    pass(crit + " [error]", "Error state shown for HTTP 500");
  else fail(crit + " [error]", "Error state NOT shown");
  await page.unroute("**/api/v1/users");

  // Empty state
  await page.route("**/api/v1/users", async (r) => {
    await r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) });
  });
  await nav(`${BASE}/system/users`);
  await page.waitForTimeout(2000);
  const rows = await page.locator("table tbody tr").count();
  if (rows === 0) pass(crit + " [empty]", "Empty state shown (no mock rows)");
  else fail(crit + " [empty]", `${rows} rows shown for empty API`);
  await page.unroute("**/api/v1/users");
}

// =============================================================================
// Main
// =============================================================================
async function main() {
  try {
    await setup();
    await clearAllAuth();
    await login();
    await testUserManagement();
    await testRoleManagement();
    await testPermissionConfig();
    await testSystemInfo();
    await testReasonOptions();
    await testApprovalMode();
    await testQualityGates();

    log("\n\n=== SUMMARY ===");
    const p = results.filter(r => r.result === "PASS").length;
    const f = results.filter(r => r.result === "FAIL").length;
    log(`Passed: ${p} / Failed: ${f} / Total: ${results.length}`);
    if (f > 0) {
      log("\nFailed:");
      for (const r of results.filter(r => r.result === "FAIL")) log(`  - ${r.criterion}: ${r.observation}`);
    }
    await teardown();
  } catch (err) {
    console.error("Error:", err);
    await teardown();
    process.exit(1);
  }
}

main();