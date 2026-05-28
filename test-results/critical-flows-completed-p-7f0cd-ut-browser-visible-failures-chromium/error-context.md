# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: critical-flows.spec.js >> completed platform modules render without browser-visible failures
- Location: tests/e2e/critical-flows.spec.js:28:1

# Error details

```
Error: expect(locator).toContainText(expected) failed

Locator: locator('h1')
Expected pattern: /AI Material Management Platform|物料/
Timeout: 10000ms
Error: element(s) not found

Call log:
  - Expect "toContainText" with timeout 10000ms
  - waiting for locator('h1')

```

```yaml
- heading "Unexpected Application Error!" [level=2]
- heading "404 Not Found" [level=3]
- paragraph: 💿 Hey developer 👋
- paragraph:
  - text: You can provide a way better UX than this when your app throws errors by providing your own
  - code: ErrorBoundary
  - text: or
  - code: errorElement
  - text: prop on your route.
- region "Notifications alt+T"
```

# Test source

```ts
  1  | const { test, expect, request } = require("@playwright/test");
  2  | 
  3  | function collectPageErrors(page) {
  4  |   const errors = [];
  5  |   page.on("pageerror", (error) => errors.push(error.message));
  6  |   page.on("console", (message) => {
  7  |     if (message.type() === "error") errors.push(message.text());
  8  |   });
  9  |   return errors;
  10 | }
  11 | 
  12 | async function applyApiBase(page) {
  13 |   if (process.env.E2E_BROWSER_API_BASE) {
  14 |     await page.addInitScript((apiBase) => {
  15 |       window.MATERIAL_API_BASE = apiBase;
  16 |     }, process.env.E2E_BROWSER_API_BASE);
  17 |   }
  18 | }
  19 | 
  20 | async function expectHealthyPage(page, path, heading) {
  21 |   await applyApiBase(page);
  22 |   await page.goto(path);
> 23 |   await expect(page.locator("h1")).toContainText(/AI Material Management Platform|物料/);
     |                                    ^ Error: expect(locator).toContainText(expected) failed
  24 |   await expect(page.getByRole("heading", { name: heading })).toBeVisible();
  25 |   await expect(page.getByText(/Unable to load|Access denied|Failed to fetch/i)).toHaveCount(0);
  26 | }
  27 | 
  28 | test("completed platform modules render without browser-visible failures", async ({ page }) => {
  29 |   const errors = collectPageErrors(page);
  30 |   const modules = [
  31 |     ["/standard/product-names", "Product Names"],
  32 |     ["/materials", "Material Management"],
  33 |     ["/workflows/tasks", "Approver Task List"],
  34 |     ["/system/users", "User Management"],
  35 |     ["/system/roles", "Role Management"],
  36 |     ["/system/config", "System Configuration"],
  37 |     ["/audit-logs", "Operational Audit Log"],
  38 |     ["/ai/providers", "LLM Gateway Model Management"]
  39 |   ];
  40 | 
  41 |   for (const [path, heading] of modules) {
  42 |     await expectHealthyPage(page, path, heading);
  43 |   }
  44 | 
  45 |   expect(errors).toEqual([]);
  46 | });
  47 | 
  48 | test("operator can persist a harmless system reason option through the UI", async ({ page }) => {
  49 |   const errors = collectPageErrors(page);
  50 |   const reason = `E2E polish reason ${Date.now()}`;
  51 | 
  52 |   await applyApiBase(page);
  53 |   await page.goto("/system/config");
  54 |   await expect(page.getByRole("heading", { name: "System Configuration" })).toBeVisible();
  55 |   await page.locator("#stop_purchaseNewReason").fill(reason);
  56 |   await page.locator('[data-add-reason="stop_purchase"]').click();
  57 |   await page.locator("#saveSystemConfig").click();
  58 |   await expect(page.locator("#configStatus")).toContainText("Saved");
  59 | 
  60 |   await page.reload();
  61 |   await expect(page.locator('[data-reason-name="stop_purchase"]').last()).toHaveValue(reason, { timeout: 10000 });
  62 |   expect(errors).toEqual([]);
  63 | });
  64 | 
  65 | test("OpenAPI keeps completed module routes available", async () => {
  66 |   const api = await request.newContext({ baseURL: process.env.E2E_API_URL || "http://localhost:8000" });
  67 |   const response = await api.get("/openapi.json");
  68 |   expect(response.ok()).toBeTruthy();
  69 |   const openapi = await response.json();
  70 |   const paths = Object.keys(openapi.paths || {});
  71 | 
  72 |   for (const expectedPath of [
  73 |     "/api/v1/product-names",
  74 |     "/api/v1/materials",
  75 |     "/api/v1/workflows/tasks",
  76 |     "/api/v1/users",
  77 |     "/api/v1/roles",
  78 |     "/api/v1/system/config",
  79 |     "/api/v1/audit-logs",
  80 |     "/api/v1/ai/providers"
  81 |   ]) {
  82 |     expect(paths).toContain(expectedPath);
  83 |   }
  84 | 
  85 |   await api.dispose();
  86 | });
  87 | 
```