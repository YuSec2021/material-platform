import playwright, { type Browser } from "@playwright/test";

const { chromium, expect, test } = playwright;
let browser: Browser | null = null;
let browserUnavailable = "";

const superAdminUser = {
  id: 1,
  username: "super_admin",
  display_name: "Super Admin",
  is_super_admin: true,
  permissions: [],
  material_library_scope_ids: null,
  roles: [{ id: 1, name: "Administrator", code: "ADMIN", enabled: true }],
};

const traceSummaries = [
  {
    trace_id: "trace-sprint32-older",
    capability: "category_match",
    status: "ok",
    duration_ms: 28,
    span_count: 2,
    start_time: "2026-05-17T09:00:00+08:00",
  },
  {
    trace_id: "trace-sprint32-newer",
    capability: "category_match",
    status: "ok",
    duration_ms: 41,
    span_count: 2,
    start_time: "2026-05-18T09:00:00+08:00",
  },
];

const traceDetails = {
  "trace-sprint32-older": {
    trace_id: "trace-sprint32-older",
    storage_table: "tracer.spans",
    spans: [
      {
        span_id: "older-root",
        parent_span_id: null,
        operation_name: "older root operation",
        span_type: "chain",
        status: "ok",
        duration_ms: 28,
      },
      {
        span_id: "older-llm",
        parent_span_id: "older-root",
        operation_name: "older llm call",
        span_type: "llm",
        status: "ok",
        duration_ms: 11,
      },
    ],
  },
  "trace-sprint32-newer": {
    trace_id: "trace-sprint32-newer",
    storage_table: "tracer.spans",
    spans: [
      {
        span_id: "newer-root",
        parent_span_id: null,
        operation_name: "newer root operation",
        span_type: "chain",
        status: "ok",
        duration_ms: 41,
      },
      {
        span_id: "newer-llm",
        parent_span_id: "newer-root",
        operation_name: "newer llm call",
        span_type: "llm",
        status: "ok",
        duration_ms: 19,
      },
    ],
  },
};

test.beforeAll(async () => {
  try {
    browser = await chromium.launch();
  } catch (error) {
    browserUnavailable = error instanceof Error ? error.message : String(error);
  }
});

test.afterAll(async () => {
  await browser?.close();
});

async function pageForTest() {
  test.skip(Boolean(browserUnavailable), `Chromium launch unavailable in this sandbox: ${browserUnavailable}`);
  const context = await browser!.newContext({ baseURL: "http://localhost:24434", viewport: { width: 1440, height: 900 } });
  await (context as any).addInitScript(() => {
    window.localStorage.setItem("ai-material-auth-session", JSON.stringify({ username: "super_admin", role: "super_admin" }));
  });
  const page = await context.newPage();
  await page.route("**/api/v1/auth/me", async (route) => route.fulfill({ json: superAdminUser }));
  await page.route("**/api/v1/debug/trace/*", async (route) => {
    const traceId = ((route.request() as any).url() as string).split("/").pop() ?? "";
    await route.fulfill({ json: traceDetails[traceId as keyof typeof traceDetails] });
  });
  await page.route("**/api/v1/debug/trace", async (route) => route.fulfill({ json: traceSummaries }));
  return { page, context };
}

test("trace debug page uses two panels, date filtering, and collapsible span tree", async () => {
  const { page, context } = await pageForTest();
  await page.goto("/debug/trace");

  const listPanel = page.getByLabel("Trace list panel");
  const detailPanel = page.getByLabel("Span detail panel");
  await expect(listPanel).toBeVisible();
  await expect(detailPanel).toBeVisible();

  const traceButtonTexts = async () =>
    ((await (page.locator('[aria-label="Trace list panel"] button[aria-label^="Select trace"]') as any).evaluateAll(
      (items: Element[]) => items.map((item) => item.textContent ?? ""),
    )) as string[]);
  let buttonTexts = await traceButtonTexts();
  expect(buttonTexts[0]).toContain("trace-sprint32-newer");
  expect(buttonTexts[1]).toContain("trace-sprint32-older");
  await expect(detailPanel.getByText("trace-sprint32-newer")).toBeVisible();
  await expect(page.getByText("newer root operation")).toBeVisible();
  await expect(page.getByText("newer llm call")).toBeVisible();

  await page.getByRole("button", { name: "Collapse span newer root operation" }).click();
  expect(await page.getByText("newer llm call").count()).toEqual(0);
  await page.getByRole("button", { name: "Expand span newer root operation" }).click();
  await expect(page.getByText("newer llm call")).toBeVisible();

  await page.getByLabel(/Start date/).fill("2026-05-17");
  await page.getByLabel(/End date/).fill("2026-05-17");
  await page.getByRole("button", { name: /应用/ }).click();
  await expect(detailPanel.getByText("trace-sprint32-older")).toBeVisible();
  expect(await page.getByText("trace-sprint32-newer").count()).toEqual(0);
  await expect(detailPanel.getByText("trace-sprint32-older")).toBeVisible();

  await page.getByRole("button", { name: /清除/ }).click();
  buttonTexts = await traceButtonTexts();
  expect(buttonTexts[0]).toContain("trace-sprint32-newer");
  expect(buttonTexts[1]).toContain("trace-sprint32-older");

  await context.close();
});
