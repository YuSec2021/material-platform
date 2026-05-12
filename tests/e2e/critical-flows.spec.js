const { test, expect, request } = require("@playwright/test");

function collectPageErrors(page) {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  return errors;
}

async function applyApiBase(page) {
  if (process.env.E2E_BROWSER_API_BASE) {
    await page.addInitScript((apiBase) => {
      window.MATERIAL_API_BASE = apiBase;
    }, process.env.E2E_BROWSER_API_BASE);
  }
}

async function expectHealthyPage(page, path, heading) {
  await applyApiBase(page);
  await page.goto(path);
  await expect(page.locator("h1")).toContainText(/AI Material Management Platform|物料/);
  await expect(page.getByRole("heading", { name: heading })).toBeVisible();
  await expect(page.getByText(/Unable to load|Access denied|Failed to fetch/i)).toHaveCount(0);
}

test("completed platform modules render without browser-visible failures", async ({ page }) => {
  const errors = collectPageErrors(page);
  const modules = [
    ["/standard/product-names", "Product Names"],
    ["/materials", "Material Management"],
    ["/workflows/tasks", "Approver Task List"],
    ["/system/users", "User Management"],
    ["/system/roles", "Role Management"],
    ["/system/config", "System Configuration"],
    ["/audit-logs", "Operational Audit Log"],
    ["/ai/providers", "LLM Gateway Model Management"]
  ];

  for (const [path, heading] of modules) {
    await expectHealthyPage(page, path, heading);
  }

  expect(errors).toEqual([]);
});

test("operator can persist a harmless system reason option through the UI", async ({ page }) => {
  const errors = collectPageErrors(page);
  const reason = `E2E polish reason ${Date.now()}`;

  await applyApiBase(page);
  await page.goto("/system/config");
  await expect(page.getByRole("heading", { name: "System Configuration" })).toBeVisible();
  await page.locator("#stop_purchaseNewReason").fill(reason);
  await page.locator('[data-add-reason="stop_purchase"]').click();
  await page.locator("#saveSystemConfig").click();
  await expect(page.locator("#configStatus")).toContainText("Saved");

  await page.reload();
  await expect(page.locator('[data-reason-name="stop_purchase"]').last()).toHaveValue(reason, { timeout: 10000 });
  expect(errors).toEqual([]);
});

test("OpenAPI keeps completed module routes available", async () => {
  const api = await request.newContext({ baseURL: process.env.E2E_API_URL || "http://localhost:8000" });
  const response = await api.get("/openapi.json");
  expect(response.ok()).toBeTruthy();
  const openapi = await response.json();
  const paths = Object.keys(openapi.paths || {});

  for (const expectedPath of [
    "/api/v1/product-names",
    "/api/v1/materials",
    "/api/v1/workflows/tasks",
    "/api/v1/users",
    "/api/v1/roles",
    "/api/v1/system/config",
    "/api/v1/audit-logs",
    "/api/v1/ai/providers"
  ]) {
    expect(paths).toContain(expectedPath);
  }

  await api.dispose();
});
