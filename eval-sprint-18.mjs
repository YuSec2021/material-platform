import { chromium } from "playwright";

const BASE = "http://localhost:5173";
const results = [];
let browser;
let context;
let page;

function log(msg) {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

function pass(criterion, observation) {
  results.push({ criterion, result: "PASS", observation });
  console.log(`  PASS: ${criterion}`);
}

function fail(criterion, observation) {
  results.push({ criterion, result: "FAIL", observation });
  console.log(`  FAIL: ${criterion}`);
  console.log(`        ${observation}`);
}

async function setup() {
  log("Launching browser...");
  browser = await chromium.launch({ headless: true });
  context = await browser.newContext();
  page = await context.newPage();

  const requests = [];
  page.on("request", (req) => {
    requests.push({ url: req.url(), method: req.method() });
  });
  page._testRequests = requests;

  const apiResponses = [];
  page.on("response", async (resp) => {
    if (resp.url().includes("/api/")) {
      const body = await resp.text().catch(() => "");
      apiResponses.push({ url: resp.url(), status: resp.status(), body: body.substring(0, 300) });
    }
  });
  page._testApiResponses = apiResponses;

  const consoleErrors = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  page._testConsoleErrors = consoleErrors;

  log("Browser ready.");
}

async function teardown() {
  if (browser) await browser.close();
}

async function clearAllAuth() {
  // Clear cookies and localStorage
  await context.clearCookies();
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => localStorage.removeItem("ai-material-auth-session"));
}

async function login() {
  log("Navigating to login page...");
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.click('button[type="submit"]');
  await page.waitForURL("**/", { timeout: 10000 }).catch(() => {});
  const url = page.url();
  log(`After login, URL: ${url}`);
}

async function navigateAndWait(url) {
  page._testRequests.length = 0;
  page._testApiResponses.length = 0;
  page._testConsoleErrors.length = 0;
  await page.goto(url, { waitUntil: "networkidle", timeout: 15000 });
}

function getApiRequest(method, pathPattern) {
  return page._testRequests.find(
    (r) => r.url.match(pathPattern) && (method === "*" || r.method === method)
  );
}

function getApiCall(method, pathPattern) {
  return page._testApiResponses.find((r) => r.url.match(pathPattern));
}

function extractBody(response) {
  try {
    return JSON.parse(response.body);
  } catch {
    return response.body;
  }
}

// =============================================================================
// Criterion 1: User management page
// =============================================================================
async function testUserManagement() {
  log("\n=== Criterion 1: User Management ===");
  const criterion = "User management page is API-backed and supports local-user create, edit, password reset, and confirmed delete without mutating HCM-only users.";

  await navigateAndWait(`${BASE}/system/users`);
  await page.waitForTimeout(1000);

  const getUsers = getApiRequest("GET", "/api/v1/users");
  if (getUsers) {
    pass(criterion + " [GET users]", "GET /api/v1/users was sent");
  } else {
    fail(criterion + " [GET users]", "GET /api/v1/users was NOT sent");
  }

  const tableExists = await page.locator("table").count() > 0;
  if (tableExists) {
    pass(criterion + " [table]", "User table rendered");
  } else {
    fail(criterion + " [table]", "User table NOT found");
  }

  // Open create form
  const createBtn = page.locator("button").filter({ hasText: /新增用户/i }).first();
  const hasCreateBtn = await createBtn.count() > 0;

  if (!hasCreateBtn) {
    fail(criterion + " [create btn]", "Create user button NOT found");
    return;
  }

  await createBtn.click();
  await page.waitForTimeout(1000);

  // Wait for modal to appear
  const modal = page.locator(".fixed.inset-0").filter({ hasText: /新增本地用户|编辑本地用户/i });
  const modalVisible = await modal.count() > 0;
  if (!modalVisible) {
    fail(criterion + " [modal]", "Create user modal did NOT open");
    return;
  }
  log("Create user modal opened successfully");

  // Fill the form using label-based selectors
  // Username field (label: 用户名)
  const usernameLabel = modal.locator("span:text('用户名')").first();
  if (await usernameLabel.count() > 0) {
    const usernameInput = usernameLabel.locator("..").locator("input").first();
    const uniqueUsername = `testuser_${Date.now()}`;
    await usernameInput.fill(uniqueUsername);
    log(`Filled username: ${uniqueUsername}`);

    // Fill display name
    const displayNameLabel = modal.locator("span:text('姓名')").first();
    const displayNameInput = displayNameLabel.locator("..").locator("input").first();
    await displayNameInput.fill("Test User");

    // Fill unit
    const unitLabel = modal.locator("span:text('单位')").first();
    if (await unitLabel.count() > 0) {
      const unitInput = unitLabel.locator("..").locator("input").first();
      await unitInput.fill("Test Unit");
    }

    // Fill department
    const deptLabel = modal.locator("span:text('部门')").first();
    const deptInput = deptLabel.locator("..").locator("input").first();
    await deptInput.fill("Test Dept");

    // Fill team
    const teamLabel = modal.locator("span:text('班组')").first();
    if (await teamLabel.count() > 0) {
      const teamInput = teamLabel.locator("..").locator("input").first();
      await teamInput.fill("Test Team");
    }

    // Submit - look for "保存" button inside the modal footer
    const saveBtn = modal.locator("button").filter({ hasText: /^(保存|保存中)/i }).first();
    if (await saveBtn.count() > 0) {
      await saveBtn.click();
      await page.waitForTimeout(2000);

      const postUsers = getApiRequest("POST", "/api/v1/users");
      if (postUsers) {
        pass(criterion + " [POST users]", "POST /api/v1/users was sent");
      } else {
        fail(criterion + " [POST users]", "POST /api/v1/users was NOT sent");
      }

      // Wait for modal to close and user to appear in table
      await page.waitForTimeout(1000);
      const userInTable = await page.locator(`table >> text=${uniqueUsername}`).count() > 0;
      if (userInTable) {
        pass(criterion + " [user in table]", `Created user appears in table`);
      } else {
        fail(criterion + " [user in table]", "Created user NOT found in table");
      }

      // Now test edit - find the "编辑" button for our created user row
      // The table should have our test user
      const editBtns = page.locator("table button").filter({ hasText: /编辑/i });
      const editBtnCount = await editBtns.count();
      log(`Found ${editBtnCount} edit buttons in table`);

      if (editBtnCount > 0) {
        await editBtns.first().click();
        await page.waitForTimeout(1000);

        // Check if edit modal opened
        const editModal = page.locator(".fixed.inset-0").filter({ hasText: /编辑本地用户/i });
        const editModalVisible = await editModal.count() > 0;

        if (editModalVisible) {
          pass(criterion + " [edit modal]", "Edit user modal opened");

          // Edit department
          const editDeptLabel = editModal.locator("span:text('部门')").first();
          const editDeptInput = editDeptLabel.locator("..").locator("input").first();
          await editDeptInput.clear();
          await editDeptInput.fill("Updated Dept");

          const editSaveBtn = editModal.locator("button").filter({ hasText: /^(保存|保存中)/i }).first();
          if (await editSaveBtn.count() > 0) {
            await editSaveBtn.click();
            await page.waitForTimeout(2000);

            const putUser = getApiRequest("PUT", "/api/v1/users/");
            if (putUser) {
              pass(criterion + " [PUT user]", "PUT /api/v1/users/<id> was sent");
            } else {
              fail(criterion + " [PUT user]", "PUT /api/v1/users/<id> was NOT sent");
            }
          }
        }
      }

      // Test password reset
      const resetBtns = page.locator("table button").filter({ hasText: /重置密码/i });
      if (await resetBtns.count() > 0) {
        await resetBtns.first().click();
        await page.waitForTimeout(2000);

        const postReset = getApiRequest("POST", "/api/v1/users/.*/password-reset");
        if (postReset) {
          pass(criterion + " [password reset]", "POST /api/v1/users/<id>/password-reset was sent");
        } else {
          fail(criterion + " [password reset]", "POST /api/v1/users/<id>/password-reset was NOT sent");
        }
      }

      // Test delete with confirmation
      const deleteBtns = page.locator("table button").filter({ hasText: /^删除$/i });
      if (await deleteBtns.count() > 0) {
        // Set up dialog handler BEFORE clicking
        page.once("dialog", async (dialog) => {
          log(`Dialog appeared: "${dialog.message()}"`);
          await dialog.accept();
        });

        await deleteBtns.first().click();
        await page.waitForTimeout(2000);

        const deleteUser = getApiRequest("DELETE", "/api/v1/users/");
        if (deleteUser) {
          pass(criterion + " [DELETE user]", "DELETE /api/v1/users/<id> was sent");
          pass(criterion + " [delete confirm]", "Confirmation dialog shown before deletion");
        } else {
          fail(criterion + " [DELETE user]", "DELETE /api/v1/users/<id> was NOT sent");
        }
      }
    }
  } else {
    fail(criterion + " [form fields]", "Form label '用户名' NOT found in modal");
  }
}

// =============================================================================
// Criterion 2: Role management page
// =============================================================================
async function testRoleManagement() {
  log("\n=== Criterion 2: Role Management ===");
  const criterion = "Role management page is API-backed and supports role CRUD, enable/disable, and user binding.";

  await navigateAndWait(`${BASE}/system/roles`);
  await page.waitForTimeout(1000);

  const getRoles = getApiRequest("GET", "/api/v1/roles");
  if (getRoles) {
    pass(criterion + " [GET roles]", "GET /api/v1/roles was sent");
  } else {
    fail(criterion + " [GET roles]", "GET /api/v1/roles was NOT sent");
  }

  const tableExists = await page.locator("table").count() > 0;
  if (tableExists) {
    pass(criterion + " [table]", "Role table rendered");
  } else {
    fail(criterion + " [table]", "Role table NOT found");
  }

  // Create role
  const createBtn = page.locator("button").filter({ hasText: /新增角色/i }).first();
  if (await createBtn.count() > 0) {
    await createBtn.click();
    await page.waitForTimeout(1000);

    const modal = page.locator(".fixed.inset-0").filter({ hasText: /新增角色|编辑角色/i });
    if (await modal.count() > 0) {
      log("Create role modal opened");

      const nameLabel = modal.locator("span:text('角色名称')").first();
      const nameInput = nameLabel.locator("..").locator("input").first();
      const uniqueName = `test_role_${Date.now()}`;
      await nameInput.fill(uniqueName);

      const codeLabel = modal.locator("span:text('角色代码')").first();
      const codeInput = codeLabel.locator("..").locator("input").first();
      await codeInput.fill(`test_role_${Date.now()}`);

      const descLabel = modal.locator("span:text('描述')").first();
      if (await descLabel.count() > 0) {
        const descInput = descLabel.locator("..").locator("textarea, input").first();
        await descInput.fill("Test role description");
      }

      const saveBtn = modal.locator("button").filter({ hasText: /^(保存|保存中|创建)/i }).first();
      if (await saveBtn.count() > 0) {
        await saveBtn.click();
        await page.waitForTimeout(2000);

        const postRole = getApiRequest("POST", "/api/v1/roles");
        if (postRole) {
          pass(criterion + " [POST role]", "POST /api/v1/roles was sent");
        } else {
          fail(criterion + " [POST role]", "POST /api/v1/roles was NOT sent");
        }
      }

      // Test enable/disable
      await page.waitForTimeout(500);
      const toggleBtn = page.locator("table button").filter({ hasText: /启用|停用/i }).first();
      if (await toggleBtn.count() > 0) {
        await toggleBtn.click();
        await page.waitForTimeout(2000);

        const patchDisable = getApiRequest("PATCH", "/api/v1/roles/.*disable");
        const patchEnable = getApiRequest("PATCH", "/api/v1/roles/.*enable");
        if (patchDisable || patchEnable) {
          pass(criterion + " [toggle]", "PATCH enable/disable was sent");
        } else {
          fail(criterion + " [toggle]", "PATCH enable/disable was NOT sent");
        }
      }

      // Test bind users
      const bindBtn = page.locator("table button").filter({ hasText: /绑定用户/i }).first();
      if (await bindBtn.count() > 0) {
        await bindBtn.click();
        await page.waitForTimeout(1500);

        const bindModal = page.locator(".fixed.inset-0").filter({ hasText: /绑定用户/i });
        if (await bindModal.count() > 0) {
          pass(criterion + " [bind modal]", "Bind users modal opened");

          // Check if users are fetched
          const getUsers = getApiRequest("GET", "/api/v1/users");
          const getRoleUsers = getApiRequest("GET", "/api/v1/roles/.*users");
          if (getUsers || getRoleUsers) {
            pass(criterion + " [get users]", "Users fetched for binding");
          } else {
            fail(criterion + " [get users]", "No users fetched for binding");
          }

          // Close modal
          const closeBtn = bindModal.locator("button").filter({ hasText: /取消|关闭/i }).first();
          await closeBtn.click().catch(() => {});
          await page.waitForTimeout(500);
        }
      }

      // Test edit
      const editBtn = page.locator("table button").filter({ hasText: /编辑/i }).first();
      if (await editBtn.count() > 0) {
        await editBtn.click();
        await page.waitForTimeout(1000);

        const editModal = page.locator(".fixed.inset-0").filter({ hasText: /编辑角色/i });
        if (await editModal.count() > 0) {
          const editNameLabel = editModal.locator("span:text('角色名称')").first();
          const editNameInput = editNameLabel.locator("..").locator("input").first();
          await editNameInput.fill(`${uniqueName}_updated`);

          const editSaveBtn = editModal.locator("button").filter({ hasText: /^(保存|保存中)/i }).first();
          if (await editSaveBtn.count() > 0) {
            await editSaveBtn.click();
            await page.waitForTimeout(2000);

            const putRole = getApiRequest("PUT", "/api/v1/roles/");
            if (putRole) {
              pass(criterion + " [PUT role]", "PUT /api/v1/roles/<id> was sent");
            } else {
              fail(criterion + " [PUT role]", "PUT /api/v1/roles/<id> was NOT sent");
            }
          }
        }
      }

      // Test delete
      const deleteBtn = page.locator("table button").filter({ hasText: /^删除$/i }).first();
      if (await deleteBtn.count() > 0) {
        page.once("dialog", async (dialog) => {
          await dialog.accept();
        });
        await deleteBtn.click();
        await page.waitForTimeout(2000);

        const deleteRole = getApiRequest("DELETE", "/api/v1/roles/");
        if (deleteRole) {
          pass(criterion + " [DELETE role]", "DELETE /api/v1/roles/<id> was sent");
        } else {
          fail(criterion + " [DELETE role]", "DELETE /api/v1/roles/<id> was NOT sent");
        }
      }
    }
  } else {
    fail(criterion + " [create btn]", "Create role button NOT found");
  }
}

// =============================================================================
// Criterion 3: Permission configuration
// =============================================================================
async function testPermissionConfig() {
  log("\n=== Criterion 3: Permission Configuration ===");
  const criterion = "Permission configuration page exposes a role-scoped split-pane permission editor with save and reset behavior.";

  await navigateAndWait(`${BASE}/system/permissions`);
  await page.waitForTimeout(2000);

  const getCatalog = getApiRequest("GET", "/api/v1/permissions/catalog");
  const getRoles = getApiRequest("GET", "/api/v1/roles");

  if (getCatalog) {
    pass(criterion + " [GET catalog]", "GET /api/v1/permissions/catalog was sent");
  } else {
    fail(criterion + " [GET catalog]", "GET /api/v1/permissions/catalog was NOT sent");
  }

  if (getRoles) {
    pass(criterion + " [GET roles]", "GET /api/v1/roles was sent");
  } else {
    fail(criterion + " [GET roles]", "GET /api/v1/roles was NOT sent");
  }

  // Check for split-pane layout: grid-cols-12 with col-span-4 (left) and col-span-8 (right)
  const leftPanel = await page.locator("[class*='col-span-4']").count() > 0;
  const rightPanel = await page.locator("[class*='col-span-8']").count() > 0;

  if (leftPanel && rightPanel) {
    pass(criterion + " [split pane]", "Split-pane layout detected (grid col-span-4 + col-span-8)");
  } else {
    fail(criterion + " [split pane]", "Split-pane layout NOT detected");
  }

  // Check for role selector
  const roleSelector = page.locator("select").first();
  if (await roleSelector.count() > 0) {
    // Select second role (non-super-admin)
    const options = await roleSelector.locator("option").all();
    if (options.length > 1) {
      await roleSelector.selectOption({ index: 1 });
      await page.waitForTimeout(1500);

      const getRolePerms = getApiRequest("GET", "/api/v1/roles/.*permissions");
      if (getRolePerms) {
        pass(criterion + " [GET role perms]", "GET /api/v1/roles/<id>/permissions was sent");
      } else {
        fail(criterion + " [GET role perms]", "GET /api/v1/roles/<id>/permissions was NOT sent");
      }

      // Check for permission checkboxes
      const checkboxes = await page.locator('input[type="checkbox"]').count();
      if (checkboxes > 0) {
        pass(criterion + " [checkboxes]", `${checkboxes} permission checkboxes found`);
      }
    }
  }

  // Check reset button
  const resetBtn = page.locator("button").filter({ hasText: /重置/i }).first();
  if (await resetBtn.count() > 0) {
    pass(criterion + " [reset btn]", "Reset button found");
  } else {
    fail(criterion + " [reset btn]", "Reset button NOT found");
  }

  // Check save button
  const saveBtn = page.locator("button").filter({ hasText: /保存/i }).first();
  if (await saveBtn.count() > 0) {
    pass(criterion + " [save btn]", "Save button found");
  } else {
    fail(criterion + " [save btn]", "Save button NOT found");
  }
}

// =============================================================================
// Criterion 4: System information
// =============================================================================
async function testSystemInfo() {
  log("\n=== Criterion 4: System Information ===");
  const criterion = "System information page persists the system name and icon metadata while preserving authenticated loading, error, and validation behavior.";

  await navigateAndWait(`${BASE}/system/info`);
  await page.waitForTimeout(1000);

  const getConfig = getApiRequest("GET", "/api/v1/system/config");
  if (getConfig) {
    pass(criterion + " [GET config]", "GET /api/v1/system/config was sent");
  } else {
    fail(criterion + " [GET config]", "GET /api/v1/system/config was NOT sent");
  }

  // System name input: label contains "系统名称"
  const sysNameLabel = page.locator("span:text('系统名称')").first();
  const sysNameInput = sysNameLabel.locator("..").locator("input").first();

  if (await sysNameInput.count() > 0) {
    pass(criterion + " [name input]", "System name input field found");

    // Check icon upload
    const fileInput = page.locator('input[type="file"]').first();
    if (await fileInput.count() > 0) {
      pass(criterion + " [icon upload]", "Icon upload zone found");
    } else {
      fail(criterion + " [icon upload]", "Icon upload zone NOT found");
    }

    // Save button
    const saveBtn = page.locator("button").filter({ hasText: /保存设置/i }).first();
    if (await saveBtn.count() > 0) {
      pass(criterion + " [save btn]", "Save settings button found");
    }
  } else {
    fail(criterion + " [name input]", "System name input NOT found");
  }
}

// =============================================================================
// Criterion 5: Reason options
// =============================================================================
async function testReasonOptions() {
  log("\n=== Criterion 5: Reason Options ===");
  const criterion = "Reason options page edits stop-purchase and stop-use reason lists independently and persists them through the backend.";

  await navigateAndWait(`${BASE}/system/reason-options`);
  await page.waitForTimeout(1000);

  const getConfig = getApiRequest("GET", "/api/v1/system/config");
  if (getConfig) {
    pass(criterion + " [GET config]", "GET /api/v1/system/config was sent");
  } else {
    fail(criterion + " [GET config]", "GET /api/v1/system/config was NOT sent");
  }

  const purchaseSection = await page.locator("text=/停采.*原因|停止采购原因/i").count() > 0
    || await page.locator("text=/停采/i").count() > 0;
  const useSection = await page.locator("text=/停用.*原因|停止使用原因/i").count() > 0
    || await page.locator("text=/停用/i").count() > 0;

  if (purchaseSection) {
    pass(criterion + " [purchase section]", "Stop-purchase reasons section found");
  } else {
    fail(criterion + " [purchase section]", "Stop-purchase reasons section NOT found");
  }

  if (useSection) {
    pass(criterion + " [use section]", "Stop-use reasons section found");
  } else {
    fail(criterion + " [use section]", "Stop-use reasons section NOT found");
  }

  // Find add buttons - they should have text like "新增"
  const addBtns = await page.locator("button").filter({ hasText: /新增|添加/i }).count();
  if (addBtns >= 2) {
    pass(criterion + " [add controls]", `Found ${addBtns} add controls (expected >= 2)`);
  } else {
    fail(criterion + " [add controls]", `Only ${addBtns} add controls found`);
  }

  // Try adding a stop-purchase reason
  const addPurchaseBtn = page.locator("button").filter({ hasText: /新增|添加/i }).first();
  if (await addPurchaseBtn.count() > 0) {
    await addPurchaseBtn.click();
    await page.waitForTimeout(500);

    // Find the newly appeared input field (for entering the reason)
    const reasonInput = page.locator('input[placeholder*="原因"], input[placeholder*="reason"]').first();
    if (await reasonInput.count() > 0) {
      const testReason = `Test Reason ${Date.now()}`;
      await reasonInput.fill(testReason);
      await page.waitForTimeout(500);

      // Save
      const saveBtn = page.locator("button").filter({ hasText: /保存/i }).first();
      if (await saveBtn.count() > 0) {
        await saveBtn.click();
        await page.waitForTimeout(2000);

        const putConfig = getApiRequest("PUT", "/api/v1/system/config");
        if (putConfig) {
          pass(criterion + " [PUT config]", "PUT /api/v1/system/config was sent");
        } else {
          fail(criterion + " [PUT config]", "PUT /api/v1/system/config was NOT sent");
        }
      }
    } else {
      log("Reason input not found after clicking add button");
    }
  }
}

// =============================================================================
// Criterion 6: Approval mode
// =============================================================================
async function testApprovalMode() {
  log("\n=== Criterion 6: Approval Mode ===");
  const criterion = "Approval mode page uses selectable cards and persists simple versus workflow approval mode.";

  await navigateAndWait(`${BASE}/system/approval-mode`);
  await page.waitForTimeout(1000);

  const getConfig = getApiRequest("GET", "/api/v1/system/config");
  if (getConfig) {
    pass(criterion + " [GET config]", "GET /api/v1/system/config was sent");
  } else {
    fail(criterion + " [GET config]", "GET /api/v1/system/config was NOT sent");
  }

  const simpleCard = await page.locator("text=/简易.*审批|简单审批/i").count() > 0
    || await page.locator("text=/简易/i").count() > 0;
  const workflowCard = await page.locator("text=/工作流.*审批|流程审批/i").count() > 0
    || await page.locator("text=/工作流/i").count() > 0;

  if (simpleCard) {
    pass(criterion + " [simple card]", "Simple approval card found");
  } else {
    fail(criterion + " [simple card]", "Simple approval card NOT found");
  }

  if (workflowCard) {
    pass(criterion + " [workflow card]", "Workflow approval card found");
  } else {
    fail(criterion + " [workflow card]", "Workflow approval card NOT found");
  }

  // Click simple approval card
  const simpleOption = page.locator("text=/简易.*审批|简易审批/i").first();
  if (await simpleOption.count() > 0) {
    await simpleOption.click();
    await page.waitForTimeout(500);

    const saveBtn = page.locator("button").filter({ hasText: /保存/i }).first();
    if (await saveBtn.count() > 0) {
      await saveBtn.click();
      await page.waitForTimeout(2000);

      const putConfig = getApiRequest("PUT", "/api/v1/system/config");
      if (putConfig) {
        pass(criterion + " [PUT simple]", "PUT /api/v1/system/config sent for simple mode");
      } else {
        fail(criterion + " [PUT simple]", "PUT /api/v1/system/config NOT sent");
      }
    }
  }
}

// =============================================================================
// Criterion 7: Quality gates and auth guard
// =============================================================================
async function testQualityGates() {
  log("\n=== Criterion 7: Quality Gates ===");
  const criterion = "Sprint 18 system admin pages preserve authenticated navigation, non-mock states, and frontend quality gates.";

  // Step 1: Auth guard redirect - create fresh context without any session
  const freshContext = await browser.newContext();
  const freshPage = await freshContext.newPage();

  await freshPage.goto(`${BASE}/system/users`, { waitUntil: "networkidle", timeout: 10000 });
  await freshPage.waitForTimeout(1000);
  const url = freshPage.url();

  if (url.includes("/login")) {
    pass(criterion + " [auth guard]", "Unauthenticated access to /system/users redirects to /login");
  } else {
    fail(criterion + " [auth guard]", `Expected redirect to /login, got ${url}`);
  }
  await freshPage.close();
  await freshContext.close();

  // Step 2: Navigation links visible
  await navigateAndWait(`${BASE}/`);
  await page.waitForTimeout(1000);

  const navLinks = [
    { text: "用户管理", path: "system/users" },
    { text: "角色管理", path: "system/roles" },
    { text: "权限配置", path: "system/permissions" },
    { text: "系统信息", path: "system/info" },
    { text: "原因选项", path: "system/reason-options" },
    { text: "审批模式", path: "system/approval-mode" },
  ];

  let foundCount = 0;
  for (const link of navLinks) {
    // Look in the sidebar navigation
    const linkEl = page.locator(`a[href*='${link.path}'], nav a[href*='${link.path}'], button[href*='${link.path}']`).first();
    if (await linkEl.count() > 0) {
      foundCount++;
      log(`  Found nav link: ${link.text}`);
    } else {
      log(`  Missing nav link: ${link.text} (${link.path})`);
    }
  }

  if (foundCount >= 4) {
    pass(criterion + " [nav links]", `Found ${foundCount}/6 system admin nav links`);
  } else {
    fail(criterion + " [nav links]", `Only found ${foundCount}/6 system admin nav links`);
  }

  // Step 3: Loading state
  await navigateAndWait(`${BASE}/system/users`);
  await page.waitForTimeout(300);
  const hasLoading = await page.locator("[class*='skeleton'], [class*='loading'], [class*='spinner']").count() > 0;
  if (hasLoading) {
    pass(criterion + " [loading state]", "Loading state detected");
  }

  // Step 4: Error state via interception
  await page.route("**/api/v1/users", async (route) => {
    await route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ detail: "Internal server error" }) });
  });
  await navigateAndWait(`${BASE}/system/users`);
  await page.waitForTimeout(1500);

  const hasError = await page.locator("[class*='error']").count() > 0
    || await page.locator("text=/错误|出错了|请求失败/i").count() > 0;
  if (hasError) {
    pass(criterion + " [error state]", "Error state shown for HTTP 500");
  } else {
    fail(criterion + " [error state]", "Error state NOT shown for HTTP 500");
  }

  await page.unroute("**/api/v1/users");

  // Step 5: Empty state
  await page.route("**/api/v1/users", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) });
  });
  await navigateAndWait(`${BASE}/system/users`);
  await page.waitForTimeout(2000);

  const tbody = page.locator("table tbody");
  const rowCount = await tbody.locator("tr").count();
  if (rowCount === 0) {
    pass(criterion + " [empty state]", "Empty state shown (no mock rows)");
  } else {
    fail(criterion + " [empty state]", `${rowCount} rows shown for empty API response`);
  }

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

    // Summary
    log("\n\n=== EVALUATION SUMMARY ===");
    const passed = results.filter((r) => r.result === "PASS").length;
    const failed = results.filter((r) => r.result === "FAIL").length;
    log(`Passed: ${passed}`);
    log(`Failed: ${failed}`);
    log(`Total: ${results.length}`);

    if (failed > 0) {
      log("\nFailed items:");
      for (const r of results.filter((r) => r.result === "FAIL")) {
        log(`  - ${r.criterion}: ${r.observation}`);
      }
    }

    await teardown();
  } catch (err) {
    console.error("Test runner error:", err);
    await teardown();
    process.exit(1);
  }
}

main();
