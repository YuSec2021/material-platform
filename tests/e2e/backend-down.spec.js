const { test, expect } = require("@playwright/test");

test.skip(!process.env.E2E_EXPECT_BACKEND_DOWN, "Run with E2E_EXPECT_BACKEND_DOWN=1 after stopping the backend service.");

test("frontend smoke fails visibly when the backend is unavailable", async ({ page }) => {
  await page.goto("/materials");
  await expect(page.getByText(/Unable to load session|Unable to load page|Failed to fetch/i)).toBeVisible();
});
