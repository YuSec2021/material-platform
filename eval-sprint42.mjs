import pkg from "@playwright/test";
const { chromium } = pkg;
import { readFileSync, writeFileSync } from "fs";

const BASE = "http://localhost:5173";
const API_BASE = "http://localhost:8000";
const TS = Date.now();
const results = [];

function log(msg) { console.log(`[${new Date().toISOString()}] ${msg}`); }
function pass(c, o) { results.push({ criterion: c, result: "PASS", observation: o }); log(`PASS: ${c}`); }
function fail(c, o) { results.push({ criterion: c, result: "FAIL", observation: o }); log(`FAIL: ${c} - ${o}`); }

async function apiRequest(method, path, username, body) {
  const opts = { method, headers: { "Content-Type": "application/json" } };
  if (username) opts.headers["X-Username"] = username;
  if (body) opts.body = JSON.stringify(body);
  const resp = await fetch(`${API_BASE}${path}`, opts);
  let data; try { data = await resp.json(); } catch { data = null; }
  return { status: resp.status, data };
}

// ============================================================
// CRITERION 2: Material list, detail, sidebar filtering (RETRY)
// ============================================================
async function testCriterion2() {
  log("=== CRITERION 2 (RETRY) ===");
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    // Create roles and libraries (using fresh unique names)
    const allowedRoleName = `sprint42-r2-allow-${TS}`;
    const r1 = await apiRequest("POST", "/api/v1/roles", "super_admin", { name: allowedRoleName, code: `ROLE_R2A_${TS}`, enabled: true });
    const allowedRoleId = r1.data?.id;

    const deniedRoleName = `sprint42-r2-deny-${TS}`;
    const r2 = await apiRequest("POST", "/api/v1/roles", "super_admin", { name: deniedRoleName, code: `ROLE_R2D_${TS}`, enabled: true });
    const deniedRoleId = r2.data?.id;

    await apiRequest("POST", `/api/v1/roles/${allowedRoleId}/users`, "super_admin", { user_id: 1 });

    const allowedLibName = `sprint42-r2-allow-lib-${TS}`;
    const l1 = await apiRequest("POST", "/api/v1/material-libraries", "super_admin", { name: allowedLibName, material_library_admin_id: allowedRoleId });
    const allowedLibId = l1.data?.id;

    const deniedLibName = `sprint42-r2-deny-lib-${TS}`;
    const l2 = await apiRequest("POST", "/api/v1/material-libraries", "super_admin", { name: deniedLibName, material_library_admin_id: deniedRoleId });
    const deniedLibId = l2.data?.id;

    if (!allowedLibId || !deniedLibId) { fail("Criterion 2", "Could not create libraries"); return; }

    // Create materials - include category_id
    const allowedMatName = `sprint42-r2-allow-mat-${TS}`;
    const m1 = await apiRequest("POST", "/api/v1/materials", "super_admin", { name: allowedMatName, material_library_id: allowedLibId, product_name_id: 1, unit: "台", category_id: 1 });
    log(`  Create allowed material: ${m1.status}`);
    const allowedMatId = m1.data?.id;

    const deniedMatName = `sprint42-r2-deny-mat-${TS}`;
    const m2 = await apiRequest("POST", "/api/v1/materials", "super_admin", { name: deniedMatName, material_library_id: deniedLibId, product_name_id: 1, unit: "台", category_id: 1 });
    log(`  Create denied material: ${m2.status}`);
    const deniedMatId = m2.data?.id;
    log(`  Materials: allowed=${allowedMatId}, denied=${deniedMatId}`);

    // Login as hcm_zhangsan
    await page.goto(`${BASE}/login`);
    await page.locator("#username").fill("hcm_zhangsan");
    await page.locator("#password").fill("admin123");
    await page.locator("button[type=submit]").click();
    await page.waitForURL(url => !url.pathname.includes("/login"), { timeout: 15000 });

    // Material list - check if our created material is visible
    log("Step 1: Check material list");
    await page.goto(`${BASE}/materials`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1000);
    const matListText = await page.textContent("body");
    const zhangSeesAllowedMat = matListText.includes(allowedMatName);
    const zhangSeesDeniedMat = matListText.includes(deniedMatName);
    log(`  Material list: allowed=${zhangSeesAllowedMat}, denied=${zhangSeesDeniedMat}`);

    // API materials
    const apiMats = await apiRequest("GET", "/api/v1/materials", "hcm_zhangsan", null);
    const matItems = Array.isArray(apiMats.data) ? apiMats.data : (apiMats.data?.items || []);
    const matNames = matItems.map(m => m.name);
    const apiHasAllowedMat = matNames.includes(allowedMatName);
    const apiHasDeniedMat = matNames.includes(deniedMatName);
    log(`  API materials: ${matItems.length} total, has allowed=${apiHasAllowedMat}, has denied=${apiHasDeniedMat}`);

    // Sidebar
    log("Step 2: Check sidebar");
    const sidebar = await page.locator("aside, nav, [class*=sidebar]").first().textContent().catch(() => "");
    const sidebarHasAllowed = sidebar.includes(allowedLibName);
    const sidebarHasDenied = sidebar.includes(deniedLibName);
    log(`  Sidebar: allowed=${sidebarHasAllowed}, denied=${sidebarHasDenied}`);

    // Direct denied material access
    log("Step 3: Try direct access to denied material");
    let deniedAccessStatus = "not_tested";
    if (deniedMatId) {
      const resp = await apiRequest("GET", `/api/v1/materials/${deniedMatId}`, "hcm_zhangsan", null);
      deniedAccessStatus = resp.status;
      log(`  Denied material access: status ${resp.status}`);
    }

    // super_admin sees both
    log("Step 4: Verify super_admin sees both materials");
    const saApiMats = await apiRequest("GET", "/api/v1/materials", "super_admin", null);
    const saMatItems = Array.isArray(saApiMats.data) ? saApiMats.data : (saApiMats.data?.items || []);
    const saMatNames = saMatItems.map(m => m.name);
    const saHasAllowed = saMatNames.includes(allowedMatName);
    const saHasDenied = saMatNames.includes(deniedMatName);
    log(`  super_admin API: ${saMatItems.length} total, allowed=${saHasAllowed}, denied=${saHasDenied}`);

    if (zhangSeesAllowedMat && !zhangSeesDeniedMat && apiHasAllowedMat && !apiHasDeniedMat && deniedAccessStatus === 403 && saHasAllowed && saHasDenied) {
      pass("Criterion 2", `Material list filtered: sees allowed=${allowedMatName}, hides denied=${deniedMatName}, API confirms, denied detail=403, super_admin sees both`);
    } else {
      fail("Criterion 2", `UI: allowed=${zhangSeesAllowedMat} denied=${zhangSeesDeniedMat}, API: allowed=${apiHasAllowedMat} denied=${apiHasDeniedMat}, denied_access=${deniedAccessStatus}, sa: allowed=${saHasAllowed} denied=${saHasDenied}`);
    }
  } catch (e) {
    fail("Criterion 2", `Exception: ${e.message}`);
  } finally {
    await browser.close();
  }
}

// ============================================================
// CRITERION 3: Create/update constraints (RETRY)
// ============================================================
async function testCriterion3() {
  log("=== CRITERION 3 (RETRY) ===");
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    // Setup
    const allowedRoleName = `sprint42-r3-allow-${TS}`;
    const r1 = await apiRequest("POST", "/api/v1/roles", "super_admin", { name: allowedRoleName, code: `ROLE_R3A_${TS}`, enabled: true });
    const allowedRoleId = r1.data?.id;

    const deniedRoleName = `sprint42-r3-deny-${TS}`;
    const r2 = await apiRequest("POST", "/api/v1/roles", "super_admin", { name: deniedRoleName, code: `ROLE_R3D_${TS}`, enabled: true });
    const deniedRoleId = r2.data?.id;

    await apiRequest("POST", `/api/v1/roles/${allowedRoleId}/users`, "super_admin", { user_id: 1 });

    const allowedLibName = `sprint42-r3-allow-lib-${TS}`;
    const l1 = await apiRequest("POST", "/api/v1/material-libraries", "super_admin", { name: allowedLibName, material_library_admin_id: allowedRoleId });
    const allowedLibId = l1.data?.id;

    const deniedLibName = `sprint42-r3-deny-lib-${TS}`;
    const l2 = await apiRequest("POST", "/api/v1/material-libraries", "super_admin", { name: deniedLibName, material_library_admin_id: deniedRoleId });
    const deniedLibId = l2.data?.id;

    if (!allowedLibId || !deniedLibId) { fail("Criterion 3", "Could not create libraries"); return; }

    // Login as hcm_zhangsan
    await page.goto(`${BASE}/login`);
    await page.locator("#username").fill("hcm_zhangsan");
    await page.locator("#password").fill("admin123");
    await page.locator("button[type=submit]").click();
    await page.waitForURL(url => !url.pathname.includes("/login"), { timeout: 15000 });

    // Check library selector in create material dialog
    log("Step 1: Check library selector in create material dialog");
    await page.goto(`${BASE}/materials`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(500);

    const newBtn = page.locator("button").filter({ hasText: /新增物料|New Material/i });
    const btnCount = await newBtn.count();
    log(`  New Material buttons found: ${btnCount}`);
    if (btnCount > 0) {
      await newBtn.first().click();
      await page.waitForTimeout(2000);
    }
    const dialogText = await page.locator("[role=dialog], .ant-modal, .ant-drawer, form").first().textContent().catch(() => "");
    const hasAllowedInSelector = dialogText.includes(allowedLibName);
    const hasDeniedInSelector = dialogText.includes(deniedLibName);
    log(`  Dialog has allowed=${hasAllowedInSelector}, denied=${hasDeniedInSelector}`);

    // Create material in allowed library (with category_id)
    log("Step 2: Create material in allowed library via API");
    const userCreatedMatName = `sprint42-r3-user-created-${TS}`;
    const createResp = await apiRequest("POST", "/api/v1/materials", "hcm_zhangsan", { name: userCreatedMatName, material_library_id: allowedLibId, product_name_id: 1, unit: "台", category_id: 1 });
    log(`  Create in allowed lib: ${createResp.status} - ${JSON.stringify(createResp.data?.detail || createResp.data)}`);
    const createInAllowedOK = createResp.status === 200 || createResp.status === 201;

    // Try to create in denied library
    log("Step 3: Try creating material in denied library");
    const deniedCreateResp = await apiRequest("POST", "/api/v1/materials", "hcm_zhangsan", { name: `sprint42-r3-denied-create-${TS}`, material_library_id: deniedLibId, product_name_id: 1, unit: "台", category_id: 1 });
    log(`  Create in denied lib: ${deniedCreateResp.status} - ${JSON.stringify(deniedCreateResp.data?.detail || deniedCreateResp.data)}`);
    const createInDeniedBlocked = deniedCreateResp.status === 403;

    // Try to update denied library
    log("Step 4: Try updating denied library");
    const deniedUpdateResp = await apiRequest("PUT", `/api/v1/material-libraries/${deniedLibId}`, "hcm_zhangsan", { name: deniedLibName, description: "hacked" });
    log(`  Update denied lib: ${deniedUpdateResp.status}`);
    const updateDeniedBlocked = deniedUpdateResp.status === 403;

    // Check UI for denied library
    log("Step 5: Check UI for denied library visibility");
    await page.goto(`${BASE}/material/library`);
    await page.waitForLoadState("networkidle");
    const libPageText = await page.textContent("body");
    const hasDeniedOnPage = libPageText.includes(deniedLibName);
    log(`  Denied library visible: ${hasDeniedOnPage}`);

    if (createInAllowedOK && createInDeniedBlocked && updateDeniedBlocked && !hasDeniedOnPage) {
      pass("Criterion 3", `Create in allowed=${createInAllowedOK}(${createResp.status}), blocked denied create(${deniedCreateResp.status}), blocked denied update(${deniedUpdateResp.status}), denied lib hidden in UI`);
    } else {
      fail("Criterion 3", `create_allowed=${createInAllowedOK}(${createResp.status}), create_denied=${createInDeniedBlocked}(${deniedCreateResp.status}), update_denied=${updateDeniedBlocked}(${deniedUpdateResp.status}), denied_visible=${hasDeniedOnPage}`);
    }
  } catch (e) {
    fail("Criterion 3", `Exception: ${e.message}`);
  } finally {
    await browser.close();
  }
}

// ============================================================
// CRITERION 4: Empty state, i18n, permission indicators (RETRY)
// ============================================================
async function testCriterion4() {
  log("=== CRITERION 4 (RETRY) ===");
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    // hcm_zhangsan has no library scope initially
    log("Step 1: Check empty state for hcm_zhangsan");
    await page.goto(`${BASE}/login`);
    await page.locator("#username").fill("hcm_zhangsan");
    await page.locator("#password").fill("admin123");
    await page.locator("button[type=submit]").click();
    await page.waitForURL(url => !url.pathname.includes("/login"), { timeout: 15000 });

    await page.goto(`${BASE}/material/library`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(500);
    const libEmptyText = await page.textContent("body");
    const hasRealLibNames = libEmptyText.includes("Default Material Library") || libEmptyText.includes("MLIB-DEFAULT");
    const hasEmptyState = libEmptyText.includes("无") || libEmptyText.includes("没有") || libEmptyText.includes("暂无") || libEmptyText.includes("暂无数据") || libEmptyText.includes("empty") || libEmptyText.includes("No data");
    log(`  Library page: realLibNames=${hasRealLibNames}, emptyState=${hasEmptyState}`);

    await page.goto(`${BASE}/materials`);
    await page.waitForLoadState("networkidle");
    const matEmptyText = await page.textContent("body");
    const matHasEmptyState = matEmptyText.includes("无") || matEmptyText.includes("没有") || matEmptyText.includes("暂无") || matEmptyText.includes("暂无数据") || matEmptyText.includes("empty") || matEmptyText.includes("No data");
    log(`  Material list: emptyState=${matHasEmptyState}`);

    const hasRawI18nKeys = libEmptyText.includes("i18n.") || libEmptyText.includes("{{");
    log(`  Has raw i18n keys: ${hasRawI18nKeys}`);

    // super_admin permission indicators - create new context to avoid stale DOM
    log("Step 2: Check permission indicators for super_admin (fresh browser)");
    const browser2 = await chromium.launch({ headless: true });
    const context2 = await browser2.newContext();
    const page2 = await context2.newPage();

    try {
      await page2.goto(`${BASE}/login`);
      await page2.waitForLoadState("networkidle");
      await page2.waitForTimeout(500);
      // Use evaluate to clear and set state, then navigate
      await page2.evaluate(() => localStorage.clear());
      await page2.goto(`${BASE}/login`);
      await page2.waitForLoadState("domcontentloaded");
      await page2.waitForTimeout(1000);
      // Fill login form
      await page2.locator("#username").fill("super_admin");
      await page2.locator("#password").fill("admin123");
      await page2.locator("button[type=submit]").click();
      await page2.waitForURL(url => !url.pathname.includes("/login"), { timeout: 15000 });

      await page2.goto(`${BASE}/material/library`);
      await page2.waitForLoadState("networkidle");
      await page2.waitForTimeout(500);
      const saLibText = await page2.textContent("body");
      const hasPermissionIndicator = saLibText.includes("管理员") || saLibText.includes("Admin") || saLibText.includes("只读") || saLibText.includes("Read") || saLibText.includes("无权限") || saLibText.includes("No access");
      log(`  super_admin sees permission indicators: ${hasPermissionIndicator}`);

      // Check i18n keys
      log("Step 3: Check i18n keys in i18n.ts");
      const i18nContent = readFileSync("/Users/yusec/projects/material_retrieval/prototype_code/src/app/i18n.ts", "utf8");
      const hasEmptyStateKey = i18nContent.includes("noAccessibleLibrary") || i18nContent.includes("materialLibraryEmpty") || i18nContent.includes("noMaterialLibrary") || (i18nContent.includes("empty") && i18nContent.includes("library"));
      const hasAccessDeniedKey = i18nContent.includes("accessDenied") || i18nContent.includes("noAccess") || i18nContent.includes("permissionDenied");
      const hasAccessRoleLabelKey = i18nContent.includes("accessRole") || (i18nContent.includes("admin") && i18nContent.includes("role"));
      log(`  i18n keys: empty=${hasEmptyStateKey}, denied=${hasAccessDeniedKey}, role=${hasAccessRoleLabelKey}`);

      const emptyStateOK = !hasRealLibNames && (hasEmptyState || matHasEmptyState);
      const i18nOK = !hasRawI18nKeys && hasEmptyStateKey && hasAccessDeniedKey && hasAccessRoleLabelKey;
      const indicatorOK = hasPermissionIndicator;

      if (emptyStateOK && i18nOK && indicatorOK) {
        pass("Criterion 4", `Empty state: noRealLibNames=${!hasRealLibNames}, emptyText=${hasEmptyState || matHasEmptyState}; i18n: empty=${hasEmptyStateKey}, denied=${hasAccessDeniedKey}, role=${hasAccessRoleLabelKey}; indicators=${hasPermissionIndicator}`);
      } else {
        fail("Criterion 4", `emptyState=${emptyStateOK}(realNames=${hasRealLibNames}, emptyText=${hasEmptyState}), i18n=${i18nOK}(rawKeys=${hasRawI18nKeys}), indicators=${indicatorOK}`);
      }
    } finally {
      await browser2.close();
    }
  } catch (e) {
    fail("Criterion 4", `Exception: ${e.message}`);
  } finally {
    await browser.close();
  }
}

// ============================================================
// CRITERION 5: Automated Playwright test coverage
// ============================================================
async function testCriterion5() {
  log("=== CRITERION 5 ===");
  const { exec } = await import("child_process");
  const { promisify } = await import("util");
  const execAsync = promisify(exec);

  try {
    log("Step 1: Check test file exists and content");
    const testContent = readFileSync("/Users/yusec/projects/material_retrieval/prototype_code/tests/sprint42.material-library-permission.spec.ts", "utf8");
    const coversAssignedLib = testContent.includes("allowed") && testContent.includes("denied");
    const coversUnassignedHidden = testContent.includes("denied") && testContent.includes("count") && testContent.includes("0");
    const coversMaterialFlow = testContent.includes("material") && testContent.includes("selector") && testContent.includes("option");
    const hasMockBackend = testContent.includes("mockBackend") || testContent.includes("page.route");
    log(`  Test covers assigned lib=${coversAssignedLib}, unassigned hidden=${coversUnassignedHidden}, material flow=${coversMaterialFlow}, uses mocks=${hasMockBackend}`);

    log("Step 2: Run Playwright tests");
    const { stdout, stderr } = await execAsync(
      "cd /Users/yusec/projects/material_retrieval/prototype_code && npx playwright test tests/sprint42.material-library-permission.spec.ts --reporter=line 2>&1",
      { timeout: 120000 }
    );
    const output = stdout + stderr;
    log(`  Playwright output: ${output.slice(0, 600)}`);

    const passed = output.includes("passed") && !output.includes(" failed") && !output.includes(" 1 failed");
    const hasError = output.includes("Error:") && output.includes("test-failed");
    log(`  Passed: ${passed}, has error: ${hasError}`);

    if (passed) {
      pass("Criterion 5", `Playwright test exists, covers assigned/denied lib filtering (assigned=${coversAssignedLib}, hidden=${coversUnassignedHidden}, materialFlow=${coversMaterialFlow}), test passes with exit 0`);
    } else if (hasError) {
      fail("Criterion 5", `Test exists but fails. Covers: assigned=${coversAssignedLib}, hidden=${coversUnassignedHidden}, materialFlow=${coversMaterialFlow}. Output: ${output.slice(0, 300)}`);
    } else {
      fail("Criterion 5", `Test run unclear. Output: ${output.slice(0, 300)}`);
    }
  } catch (e) {
    fail("Criterion 5", `Exception: ${e.message}`);
  }
}

// ============================================================
// MAIN
// ============================================================
async function main() {
  log("=== SPRINT 42 EVALUATION (RETRY) ===");

  // Run only the failed criteria
  await testCriterion2();
  await testCriterion3();
  await testCriterion4();
  await testCriterion5();

  log("\n=== FINAL RESULTS ===");
  const passed = results.filter(r => r.result === "PASS").length;
  const failed = results.filter(r => r.result === "FAIL").length;
  for (const r of results) {
    log(`  ${r.result}: ${r.criterion}`);
    log(`    ${r.observation}`);
  }
  log(`\nTotal: ${passed} PASS, ${failed} FAIL out of ${results.length}`);

  writeFileSync("/Users/yusec/projects/material_retrieval/eval-sprint42-results.json", JSON.stringify(results, null, 2));
  log("Results written to eval-sprint42-results.json");
}

main().catch(e => { console.error("Fatal:", e); process.exit(1); });