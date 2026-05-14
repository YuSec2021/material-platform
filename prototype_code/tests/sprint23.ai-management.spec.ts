import playwright, { type Browser, type Page } from "@playwright/test";

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

const regularUser = {
  id: 2,
  username: "material_user",
  display_name: "Material User",
  is_super_admin: false,
  permissions: [],
  material_library_scope_ids: null,
  roles: [{ id: 2, name: "User", code: "USER", enabled: true }],
};

type ProviderRecord = {
  id: number;
  display_name: string;
  provider: string;
  model: string;
  model_name: string;
  endpoint: string;
  base_url: string;
  api_key_masked: string;
  capabilities: string[];
  active: boolean;
  enabled: boolean;
  timeout_seconds: number;
  fallback_model_id: number | null;
  connection_status: string;
  last_test_message: string;
  last_test_at: string | null;
  updated_at: string;
};

type MappingRecord = {
  id: number;
  capability: string;
  primary_model_id: number;
  primary_model_name: string;
  fallback_model_id: number | null;
  fallback_model_name: string;
  enabled: boolean;
  updated_at: string;
};

const defaultProvider: ProviderRecord = {
  id: 1,
  display_name: "Default Mock",
  provider: "mock",
  model: "mock-material-governance-v1",
  model_name: "mock-material-governance-v1",
  endpoint: "local://mock",
  base_url: "local://mock",
  api_key_masked: "********",
  capabilities: ["material_add", "material_match", "category_match", "material_analysis", "attr_recommend", "material_governance"],
  active: true,
  enabled: true,
  timeout_seconds: 10,
  fallback_model_id: null,
  connection_status: "untested",
  last_test_message: "",
  last_test_at: null,
  updated_at: "2026-05-14T00:00:00Z",
};

const fallbackProvider: ProviderRecord = {
  ...defaultProvider,
  id: 2,
  display_name: "Fallback Mock",
  model: "mock-fallback-v1",
  model_name: "mock-fallback-v1",
};

const capabilityNames = [
  "material_add",
  "material_match",
  "category_match",
  "material_analysis",
  "attr_recommend",
  "material_governance",
];

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

async function pageForTest(user = superAdminUser, language = "zh-CN") {
  test.skip(Boolean(browserUnavailable), `Chromium launch unavailable in this sandbox: ${browserUnavailable}`);
  const context = await browser!.newContext({ baseURL: "http://localhost:5173" });
  await (context as any).addInitScript(
    ({ currentUser, lng }: { currentUser: typeof superAdminUser; lng: string }) => {
      window.localStorage.setItem(
        "ai-material-auth-session",
        JSON.stringify({ username: currentUser.username, role: currentUser.is_super_admin ? "super_admin" : "user" }),
      );
      window.localStorage.setItem("language", lng);
    },
    { currentUser: user, lng: language },
  );
  const page = await context.newPage();
  await page.route("**/api/v1/auth/me", async (route) => route.fulfill({ json: user }));
  return { page, context };
}

async function mockAiApis(page: Page) {
  let providers: ProviderRecord[] = [defaultProvider, fallbackProvider];
  let mappings: MappingRecord[] = capabilityNames.map((capability, index) => ({
    id: index + 1,
    capability,
    primary_model_id: 1,
    primary_model_name: "Default Mock",
    fallback_model_id: null,
    fallback_model_name: "",
    enabled: true,
    updated_at: "2026-05-14T00:00:00Z",
  }));

  await page.route("**/api/v1/ai/providers", async (route) => {
    const request = route.request() as any;
    if (request.method() === "POST") {
      const body = request.postDataJSON() as Record<string, unknown>;
      const provider: ProviderRecord = {
        ...defaultProvider,
        id: providers.length + 1,
        display_name: String(body.display_name),
        provider: String(body.provider),
        model: String(body.model_name),
        model_name: String(body.model_name),
        endpoint: String(body.base_url ?? ""),
        base_url: String(body.base_url ?? ""),
        api_key_masked: "ra********2345",
        enabled: Boolean(body.enabled),
        active: Boolean(body.enabled),
        connection_status: "ok",
        last_test_message: "Connection test succeeded",
      };
      providers = [provider, ...providers];
      await route.fulfill({ json: provider });
      return;
    }
    await route.fulfill({ json: providers });
  });

  await page.route("**/api/v1/ai/providers/*/test", async (route) => {
    const request = route.request() as any;
    const providerId = Number(request.url().match(/providers\/(\d+)\/test/)?.[1] ?? 0);
    providers = providers.map((provider) =>
      provider.id === providerId
        ? { ...provider, connection_status: "ok", last_test_message: "Connection test succeeded" }
        : provider,
    );
    await route.fulfill({
      json: { ok: true, provider: "mock", model: "mock-material-governance-v1", status: "ok", message: "Connection test succeeded" },
    });
  });

  await page.route("**/api/v1/ai/providers/test", async (route) => {
    await route.fulfill({
      json: { ok: true, provider: "mock", model: "mock-material-governance-v1", status: "ok", message: "Draft connection succeeded" },
    });
  });

  await page.route("**/api/v1/ai/capability-mappings", async (route) => {
    await route.fulfill({ json: mappings });
  });

  await page.route("**/api/v1/ai/capability-mappings/*", async (route) => {
    const request = route.request() as any;
    const capability = decodeURIComponent(request.url().split("/").pop() ?? "");
    const body = request.postDataJSON() as Record<string, unknown>;
    const primary = providers.find((provider) => provider.id === Number(body.primary_model_id));
    const fallback = providers.find((provider) => provider.id === Number(body.fallback_model_id));
    mappings = mappings.map((mapping) =>
      mapping.capability === capability
        ? {
            ...mapping,
            primary_model_id: primary?.id ?? mapping.primary_model_id,
            primary_model_name: primary?.display_name ?? mapping.primary_model_name,
            fallback_model_id: fallback?.id ?? null,
            fallback_model_name: fallback?.display_name ?? "",
            enabled: Boolean(body.enabled),
          }
        : mapping,
    );
    await route.fulfill({ json: mappings.find((mapping) => mapping.capability === capability) });
  });

  await page.route("**/api/v1/debug/trace", async (route) => {
    await route.fulfill({
      json: [
        {
          trace_id: "trace-1",
          operation_name: "gateway.material_add",
          capability: "material_add",
          status: "ok",
          start_time: "2026-05-14T00:00:00Z",
          duration_ms: 42,
          span_count: 2,
        },
      ],
    });
  });

  await page.route("**/api/v1/debug/trace/trace-1", async (route) => {
    await route.fulfill({
      json: {
        trace_id: "trace-1",
        storage_table: "tracer.spans",
        spans: [{ span_id: "span-1", operation_name: "llm.provider.chat", status: "ok", model: "mock-material-governance-v1" }],
      },
    });
  });
}

test("super_admin can open AI management pages and create masked provider records", async () => {
  const { page, context } = await pageForTest();
  await mockAiApis(page);

  await page.goto("/");
  await expect(page.getByText("AI管理")).toBeVisible();

  await page.goto("/ai/providers");
  await expect(page.getByRole("heading", { name: "模型提供商管理" })).toBeVisible();
  await expect(page.getByText("模型提供商表格")).toBeVisible();

  await page.getByRole("button", { name: "新增模型" }).click();
  const providerInputs = page.locator("input") as any;
  await providerInputs.nth(1).fill("E2E Mock");
  await providerInputs.nth(2).fill("mock-e2e-v1");
  await providerInputs.nth(5).fill("raw-secret-12345");
  await page.getByRole("button", { name: "保存模型" }).click();
  await expect(page.getByText("E2E Mock")).toBeVisible();

  await page.getByRole("button", { name: "编辑" }).first().click();
  const apiKeyInput = page.locator('input[type="password"]').first();
  const apiKeyValue = await (apiKeyInput as any).inputValue();
  expect(apiKeyValue).toEqual("ra********2345");
  if (apiKeyValue === "raw-secret-12345") {
    throw new Error("Saved API key was displayed as raw text");
  }

  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "测试连接" }).first().click();
  await expect(page.getByText(/连接测试已完成|Connection test succeeded/)).toBeVisible();

  await page.goto("/ai/capability-mappings");
  await expect(page.getByRole("heading", { name: "AI能力映射" })).toBeVisible();
  await expect(page.getByText("material_governance")).toBeVisible();

  await page.goto("/ai/token-usage");
  await expect(page.getByRole("heading", { name: "Token用量统计" })).toBeVisible();
  await expect(page.getByText("material_add")).toBeVisible();
  await expect(page.getByText("mock-material-governance-v1")).toBeVisible();
  await context.close();
});

test("capability mappings persist selected primary and fallback models after reload", async () => {
  const { page, context } = await pageForTest();
  await mockAiApis(page);

  await page.goto("/ai/capability-mappings");
  await expect(page.getByText("material_add")).toBeVisible();
  await (page.locator('[data-slot="select-trigger"]') as any).nth(1).click();
  await page.getByRole("option", { name: "Fallback Mock" }).click();
  await page.getByRole("button", { name: "保存映射" }).first().click();
  await expect(page.getByText("已保存")).toBeVisible();

  await page.reload();
  await expect(page.getByText("Fallback Mock")).toBeVisible();
  await context.close();
});

test("AI management routes are localized and blocked for non-super_admin users", async () => {
  const english = await pageForTest(superAdminUser, "en-US");
  await mockAiApis(english.page);
  await english.page.goto("/ai/providers");
  await expect(english.page.getByRole("heading", { name: "Model Provider Management" })).toBeVisible();
  await expect(english.page.getByText("AI Management")).toBeVisible();
  await english.context.close();

  const regular = await pageForTest(regularUser);
  await mockAiApis(regular.page);
  await regular.page.goto("/");
  expect(await (regular.page.getByText("AI管理") as any).count()).toEqual(0);
  await regular.page.goto("/ai/providers");
  expect((regular.page as any).url()).toEqual("http://localhost:5173/");
  expect(await (regular.page.getByRole("heading", { name: "模型提供商管理" }) as any).count()).toEqual(0);
  await regular.context.close();
});
