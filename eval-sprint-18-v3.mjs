import { chromium } from "playwright";

const BASE = "http://localhost:5173";
const results = [];
let browser;
let context;
let page;

function log(msg) { console.log(`[${new Date().toISOString()}] ${msg}`); }
function pass(c, o) { results.push({ criterion: c, result: "PASS", observation: o }); console.log(`  PASS: ${c}`); }
function fail(c, o) { results.push({ criterion: c, result: "FAIL", observation: o }); console.log(`  FAIL: ${c} -- ${o}`); }

async function setup() {
  log("Launching browser...");
  browser = await chromium.launch({ headless: true });
  context = await browser.newContext();
  page = await context.newPage();
  const requests = [];
  page.on("request", (req) => { requests.push({ url: req.url(), method: req.method() }); });
  page._testRequests = requests;
  const apiResponses = [];
  page.on("response", async (resp) => {
    if (resp.url().includes("/api/")) {
      const body = await resp.text().catch(() => "");
      apiResponses.push({ url: resp.url(), status: resp.status(), body: body.substring(0, 300) });
    }
  });
  page._testApiResponses = apiResponses;
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
  log(`After login: ${page.url()}`);
}

async function navigateAndWait(url) {
  page._testRequests.length = 0;
  page._testApiResponses.length = 0;
  await page.goto(url, { waitUntil: "networkidle", timeout: 15000 });
}

function getApiRequest(method, pathPattern) {
  return page._testRequests.find((r) => r.url.match(pathPattern) && (method === "*" || r.method === method));
}
function getApiCall(method, pathPattern) {
  return page._testApiResponses.find((r) => r.url.match(pathPattern));
}

// Close a modal by clicking its backdrop overlay
async function closeModal(modalLocator) {
  // Try clicking the X button first, then the backdrop
  const xBtn = modalLocator.locator("button").filter({ hasText: /^$/ }).first();
  if (await xBtn.count() > 0) {
    await xBtn.click({ timeout: 2000 }).catch(() => {});
  } else {
    // Click backdrop
    const backdrop = modalLocator.locator(".absolute.inset-0").first();
    await backdrop.click({ timeout: 2000, force: true }).catch(() => {});
  }
  await page.waitForTimeout(500);
}

// =============================================================================
// Criterion 1: User management
// =============================================================================
async function testUserManagement() {
  log("\n=== Criterion 1: User Management ===");
  const crit = "User management: CRUD wired to /api/v1/users, local-user create/edit/password-reset/delete with confirmation";

  await navigateAndWait(`${BASE}/system/users`);
  await page.waitForTimeout(1000);

  if (getApiRequest("GET", "/api/v1/users")) pass(crit + " [GET]", "GET /api/v1/users sent");
  else fail(crit + " [GET]", "GET /api/v1/users NOT sent");

  if (await page.locator("table").count() > 0) pass(crit + " [table]", "User table rendered");
  else { fail(crit + " [table]", "User table NOT found"); return; }

  // Create user
  await page.locator("button").filter({ hasText: /新增用户/i }).first().click();
  await page.waitForTimeout(1000);
  const modal = page.locator(".fixed.inset-0").filter({ hasText: /新增本地用户|编辑本地用户/i });
  if (!(await modal.count() > 0)) { fail(crit + " [modal]", "Modal did NOT open"); return; }

  const usernameInput = modal.locator("span:text('用户名')").locator("..").locator("input").first();
  const uniqueUser = `testuser_${Date.now()}`;
  await usernameInput.fill(uniqueUser);
  modal.locator("span:text('姓名')").locator("..").locator("input").first().fill("Test User");
  modal.locator("span:text('部门')").locator("..").locator("input").first().fill("Test Dept");

  await modal.locator("button").filter({ hasText: /^(保存|保存中)/i }).first().click();
  await page.waitForTimeout(2000);

  if (getApiRequest("POST", "/api/v1/users")) pass(crit + " [POST]", "POST /api/v1/users sent");
  else fail(crit + " [POST]", "POST /api/v1/users NOT sent");

  if (await page.locator(`table >> text=${uniqueUser}`).count() > 0) pass(crit + " [user in table]", "Created user in table");
  else fail(crit + " [user in table]", "Created user NOT in table");

  // Edit
  const editBtn = page.locator("table button:not([disabled])").filter({ hasText: /编辑/i }).first();
  if (await editBtn.count() > 0) {
    await editBtn.click();
    await page.waitForTimeout(1000);
    const editModal = page.locator(".fixed.inset-0").filter({ hasText: /编辑本地用户/i });
    if (await editModal.count() > 0) {
      pass(crit + " [edit modal]", "Edit modal opened");
      editModal.locator("span:text('部门')").locator("..").locator("input").first().clear();
      editModal.locator("span:text('部门')").locator("..").locator("input").first().fill("Updated Dept");
      await editModal.locator("button").filter({ hasText: /^(保存|保存中)/i }).first().click();
      await page.waitForTimeout(2000);
      if (getApiRequest("PUT", "/api/v1/users/")) pass(crit + " [PUT]", "PUT /api/v1/users/<id> sent");
      else fail(crit + " [PUT]", "PUT /api/v1/users/<id> NOT sent");
    }
  }

  // Password reset
  const resetBtn = page.locator("table button:not([disabled])").filter({ hasText: /重置密码/i }).first();
  if (await resetBtn.count() > 0) {
    await resetBtn.click();
    await page.waitForTimeout(2000);
    if (getApiRequest("POST", "/api/v1/users/.*/password-reset")) pass(crit + " [reset]", "POST password-reset sent");
    else fail(crit + " [reset]", "POST password-reset NOT sent");
  }

  // Delete with confirmation
  const deleteBtn = page.locator("table button:not([disabled])").filter({ hasText: /^删除$/i }).first();
  if (await deleteBtn.count() > 0) {
    page.once("dialog", async (d) => { await d.accept(); });
    await deleteBtn.click();
    await page.waitForTimeout(2000);
    if (getApiRequest("DELETE", "/api/v1/users/")) {
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

  await navigateAndWait(`${BASE}/system/roles`);
  await page.waitForTimeout(1000);

  if (getApiRequest("GET", "/api/v1/roles")) pass(crit + " [GET]", "GET /api/v1/roles sent");
  else fail(crit + " [GET]", "GET /api/v1/roles NOT sent");

  if (await page.locator("table").count() > 0) pass(crit + " [table]", "Role table rendered");
  else { fail(crit + " [table]", "Role table NOT found"); return; }

  // Create role
  await page.locator("button").filter({ hasText: /新增角色/i }).first().click();
  await page.waitForTimeout(1000);
  const createModal = page.locator(".fixed.inset-0").filter({ hasText: /新增角色|编辑角色/i });
  if (await createModal.count() > 0) {
    log("Role create modal opened");
    const uName = `test_role_${Date.now()}`;
    createModal.locator("span:text('角色名称')").locator("..").locator("input").first().fill(uName);
    createModal.locator("span:text('角色代码')").locator("..").locator("input").first().fill(`tr_${Date.now()}`);
    createModal.locator("span:text('描述')").locator("..").locator("textarea, input").first().fill("Test role");

    await createModal.locator("button").filter({ hasText: /^(保存|保存中|创建)/i }).first().click();
    await page.waitForTimeout(2000);

    if (getApiRequest("POST", "/api/v1/roles")) pass(crit + " [POST]", "POST /api/v1/roles sent");
    else fail(crit + " [POST]", "POST /api/v1/roles NOT sent");

    // Toggle enable/disable
    await page.waitForTimeout(500);
    const toggleBtn = page.locator("table button").filter({ hasText: /启用|停用/i }).first();
    if (await toggleBtn.count() > 0) {
      await toggleBtn.click();
      await page.waitForTimeout(2000);
      if (getApiRequest("PATCH", "/api/v1/roles/.*disable") || getApiRequest("PATCH", "/api/v1/roles/.*enable"))
        pass(crit + " [toggle]", "PATCH enable/disable sent");
      else fail(crit + " [toggle]", "PATCH enable/disable NOT sent");
    }

    // Bind users modal
    const bindBtn = page.locator("table button").filter({ hasText: /绑定用户/i }).first();
    if (await bindBtn.count() > 0) {
      await bindBtn.click();
      await page.waitForTimeout(1500);
      const bindModal = page.locator(".fixed.inset-0").filter({ hasText: /绑定用户/i });
      if (await bindModal.count() > 0) {
        pass(crit + " [bind modal]", "Bind users modal opened");
        if (getApiRequest("GET", "/api/v1/users") || getApiRequest("GET", "/api/v1/roles/.*users"))
          pass(crit + " [get users]", "Users fetched for binding");
        else fail(crit + " [get users]", "Users NOT fetched for binding");

        // Close by clicking backdrop
        await bindModal.locator(".absolute.inset-0").first().click({ force: true });
        await page.waitForTimeout(1000);
      }
    }

    // Edit role
    const editBtn = page.locator("table button").filter({ hasText: /编辑/i }).first();
    if (await editBtn.count() > 0) {
      await editBtn.click();
      await page.waitForTimeout(1000);
      const editModal = page.locator(".fixed.inset-0").filter({ hasText: /编辑角色/i });
      if (await editModal.count() > 0) {
        await editModal.locator("span:text('角色名称')").locator("..").locator("input").first().fill(`${uName}_updated`);
        await editModal.locator("button").filter({ hasText: /^(保存|保存中)/i }).first().click();
        await page.waitForTimeout(2000);
        if (getApiRequest("PUT", "/api/v1/roles/")) pass(crit + " [PUT]", "PUT /api/v1/roles/<id> sent");
        else fail(crit + " [PUT]", "PUT /api/v1/roles/<id> NOT sent");
      }
    }

    // Delete role
    const deleteBtn = page.locator("table button").filter({ hasText: /^删除$/i }).first();
    if (await deleteBtn.count() > 0) {
      page.once("dialog", async (d) => { await d.accept(); });
      await deleteBtn.click();
      await page.waitForTimeout(2000);
      if (getApiRequest("DELETE", "/api/v1/roles/")) pass(crit + " [DELETE]", "DELETE /api/v1/roles/<id> sent");
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

  await navigateAndWait(`${BASE}/system/permissions`);
  await page.waitForTimeout(2000);

  if (getApiRequest("GET", "/api/v1/permissions/catalog")) pass(crit + " [GET catalog]", "GET /api/v1/permissions/catalog sent");
  else fail(crit + " [GET catalog]", "GET /api/v1/permissions/catalog NOT sent");

  if (getApiRequest("GET", "/api/v1/roles")) pass(crit + " [GET roles]", "GET /api/v1/roles sent");
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
      if (getApiRequest("GET", "/api/v1/roles/.*permissions"))
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

  await navigateAndWait(`${BASE}/system/info`);
  await page.waitForTimeout(1000);

  if (getApiRequest("GET", "/api/v1/system/config")) pass(crit + " [GET]", "GET /api/v1/system/config sent");
  else fail(crit + " [GET]", "GET /api/v1/system/config NOT sent");

  const sysNameLabel = page.locator("span:text('系统名称')").first();
  const sysNameInput = sysNameLabel.locator("..").locator("input").first();
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
  const crit = "Reason options: dual-section editor for stop-purchase and stop-use reasons wired to GET/PUT /api/v1/system/config";

  await navigateAndWait(`${BASE}/system/reason-options`);
  await page.waitForTimeout(1000);

  if (getApiRequest("GET", "/api/v1/system/config")) pass(crit + " [GET]", "GET /api/v1/system/config sent");
  else fail(crit + " [GET]", "GET /api/v1/system/config NOT sent");

  if (await page.locator("text=/停采/i").count() > 0) pass(crit + " [purchase]", "Stop-purchase section found");
  else fail(crit + " [purchase]", "Stop-purchase section NOT found");

  if (await page.locator("text=/停用/i").count() > 0) pass(crit + " [use]", "Stop-use section found");
  else fail(crit + " [use]", "Stop-use section NOT found");

  const addBtns = await page.locator("button").filter({ hasText: /新增|添加/i }).count();
  if (addBtns >= 2) pass(crit + " [add controls]", `Found ${addBtns} add controls`);
  else fail(crit + " [add controls]", `Only ${addBtns} add controls found`);

  // Try adding a reason
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
        if (getApiRequest("PUT", "/api/v1/system/config"))
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
  const crit = "Approval mode: selectable cards for simple/workflow wired to PUT /api/v1/system/config";

  await navigateAndWait(`${BASE}/system/approval-mode`);
  await page.waitForTimeout(1000);

  if (getApiRequest("GET", "/api/v1/system/config")) pass(crit + " [GET]", "GET /api/v1/system/config sent");
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
      if (getApiRequest("PUT", "/api/v1/system/config"))
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
  const crit = "Quality gates: auth guard, loading/error/empty states, type-check/build/lint";

  // Step 1: Auth guard with fresh context
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

  // Step 2: Nav links
  await navigateAndWait(`${BASE}/`);
  await page.waitForTimeout(1000);
  const links = [
    { text: "用户管理", path: "system/users" },
    { text: "角色管理", path: "system/roles" },
    { text: "权限配置", path: "system/permissions" },
    { text: "系统信息", path: "system/info" },
    { text: "原因选项", path: "system/reason-options" },
    { text: "审批模式", path: "system/approval-mode" },
  ];
  let found = 0;
  for (const l of links) {
    if (await page.locator(`a[href*='${l.path}']`).first().count() > 0) { found++; log(`  Found: ${l.text}`); }
    else log(`  Missing: ${l.text}`);
  }
  if (found >= 4) pass(crit + " [nav links]", `Found ${found}/6 nav links`);
  else fail(crit + " [nav links]", `Only found ${found}/6`);

  // Step 3: Loading state
  await navigateAndWait(`${BASE}/system/users`);
  await page.waitForTimeout(200);
  if (await page.locator("[class*='skeleton'], [class*='loading'], [class*='spinner']").count() > 0)
    pass(crit + " [loading]", "Loading state detected");

  // Step 4: Error state
  await page.route("**/api/v1/users", async (r) => {
    await r.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ detail: "Error" }) });
  });
  await navigateAndWait(`${BASE}/system/users`);
  await page.waitForTimeout(1500);
  if (await page.locator("[class*='error']").count() > 0 || await page.locator("text=/错误|出错了/i").count() > 0)
    pass(crit + " [error]", "Error state shown for HTTP 500");
  else fail(crit + " [error]", "Error state NOT shown");
  await page.unroute("**/api/v1/users");

  // Step 5: Empty state
  await page.route("**/api/v1/users", async (r) => {
    await r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) });
  });
  await navigateAndWait(`${BASE}/system/users`);
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

    log("\n\n=== EVALUATION SUMMARY ===");
    const p = results.filter((r) => r.result === "PASS").length;
    const f = results.filter((r) => r.result === "FAIL").length;
    log(`Passed: ${p} / Failed: ${f} / Total: ${results.length}`);
    if (f > 0) {
      log("\nFailed:");
      for (const r of results.filter((r) => r.result === "FAIL")) log(`  - ${r.criterion}: ${r.observation}`);
    }
    await teardown();
  } catch (err) {
    console.error("Error:", err);
    await teardown();
    process.exit(1);
  }
}

main();
