// @ts-nocheck
import playwright, { type Browser, type Page, type Route } from "@playwright/test";

const { test, expect, chromium } = playwright;

let browser: Browser | null = null;

type MockModel = {
  id: number;
  display_name: string;
  provider: string;
  model_name: string;
  base_url: string;
  timeout: number;
  temperature: number | null;
  max_tokens: number | null;
  enabled: boolean;
  connection_status: string;
  last_tested_at: string | null;
  created_at: string;
  updated_at: string;
};

const superAdmin = {
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
  username: "regular_user",
  display_name: "Regular User",
  is_super_admin: false,
  permissions: [],
  material_library_scope_ids: [],
  roles: [{ id: 2, name: "Viewer", code: "VIEWER", enabled: true }],
};

function nowIso() {
  return new Date("2026-05-26T08:00:00.000Z").toISOString();
}

async function installModelGatewayMocks(page: Page, user: typeof superAdmin | typeof regularUser) {
  let nextId = 100;
  let models: MockModel[] = [
    {
      id: 10,
      display_name: "Referenced DeepSeek",
      provider: "deepseek",
      model_name: "deepseek-chat",
      base_url: "https://api.deepseek.com",
      timeout: 30,
      temperature: 0.7,
      max_tokens: 2048,
      enabled: true,
      connection_status: "untested",
      last_tested_at: null,
      created_at: nowIso(),
      updated_at: nowIso(),
    },
  ];

  await page.route("**/api/v1/auth/me", (route) => route.fulfill({ json: user }));
  await page.route("**/api/v1/auth/login", (route) => route.fulfill({ json: user }));
  await page.route("**/api/v1/capability-mappings**", (route) => route.fulfill({ json: [] }));

  await page.route("**/api/v1/models**", async (route: Route) => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    const idMatch = url.pathname.match(/\/api\/v1\/models\/(\d+)(?:\/(?:test|toggle))?$/);
    const id = idMatch ? Number(idMatch[1]) : null;

    if (method === "GET" && url.pathname.endsWith("/test") && id !== null) {
      models = models.map((model) =>
        model.id === id
          ? { ...model, connection_status: "ok", last_tested_at: nowIso(), updated_at: nowIso() }
          : model,
      );
      await route.fulfill({
        json: {
          ok: true,
          status: "ok",
          message: "ok",
          latency_ms: 42,
          provider: "deepseek",
          model_name: "deepseek-chat",
          tested_at: nowIso(),
          last_tested_at: nowIso(),
        },
      });
      return;
    }

    if (method === "GET") {
      await route.fulfill({ json: models });
      return;
    }

    if (method === "POST") {
      const payload = request.postDataJSON() as Partial<MockModel>;
      const model: MockModel = {
        id: nextId++,
        display_name: payload.display_name ?? "",
        provider: payload.provider ?? "custom",
        model_name: payload.model_name ?? "",
        base_url: payload.base_url ?? "",
        timeout: payload.timeout ?? 30,
        temperature: payload.temperature ?? 0.7,
        max_tokens: payload.max_tokens ?? 2048,
        enabled: payload.enabled ?? true,
        connection_status: "untested",
        last_tested_at: null,
        created_at: nowIso(),
        updated_at: nowIso(),
      };
      models = [model, ...models];
      await route.fulfill({ json: model });
      return;
    }

    if (method === "PUT" && id !== null) {
      const payload = request.postDataJSON() as Partial<MockModel>;
      models = models.map((model) => (model.id === id ? { ...model, ...payload, id, updated_at: nowIso() } : model));
      await route.fulfill({ json: models.find((model) => model.id === id) });
      return;
    }

    if (method === "PATCH" && id !== null) {
      models = models.map((model) => (model.id === id ? { ...model, enabled: !model.enabled, updated_at: nowIso() } : model));
      await route.fulfill({ json: models.find((model) => model.id === id) });
      return;
    }

    if (method === "DELETE" && id !== null) {
      if (id === 10) {
        await route.fulfill({
          status: 409,
          json: { detail: "Model is referenced by a capability mapping; remove the mapping before deleting" },
        });
        return;
      }
      models = models.filter((model) => model.id !== id);
      await route.fulfill({ json: { deleted: true, id } });
      return;
    }

    await route.fallback();
  });
}

test.beforeAll(async () => {
  browser = await chromium.launch();
});

test.afterAll(async () => {
  await browser?.close();
});

test("super admin can create, edit, toggle, test, and delete a model card", async () => {
  const context = await browser!.newContext({ baseURL: "http://localhost:24333" });
  await context.addInitScript(() => {
    window.localStorage.setItem("language", "zh-CN");
    window.localStorage.setItem("ai-material-auth-session", JSON.stringify({ username: "super_admin", role: "super_admin" }));
  });

  const page = await context.newPage();
  await installModelGatewayMocks(page, superAdmin);

  await page.goto("/ai/models");
  await expect(page.getByRole("heading", { name: "模型网关" })).toBeVisible();
  await expect(page.getByText("Referenced DeepSeek")).toBeVisible();
  await expect(page.getByText("DeepSeek").first()).toBeVisible();
  await expect(page.getByText("未测试").first()).toBeVisible();

  await page.getByRole("button", { name: "新增模型" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByLabel("基础地址")).toHaveValue("https://api.deepseek.com");
  await page.getByLabel("显示名称").fill("Sprint 53 Eval Model");
  await page.getByLabel("API Key", { exact: true }).fill("sk-test");
  await page.getByLabel("超时秒数 1-120").fill("35");
  await page.getByLabel("Max Tokens 1-32000").fill("4096");
  await page.getByRole("button", { name: "保存模型" }).click();

  await expect(page.getByText("模型已保存").first()).toBeVisible();
  await expect(page.getByText("Sprint 53 Eval Model")).toBeVisible();
  await expect(page.getByText("deepseek-chat").first()).toBeVisible();

  const card = page.locator('[data-slot="card"]').filter({ hasText: "Sprint 53 Eval Model" }).filter({ hasText: "35 秒" });
  await card.getByRole("button", { name: "编辑" }).click();
  await expect(page.getByLabel("API Key", { exact: true })).toHaveValue("********");
  await page.getByLabel("显示名称").fill("Sprint 53 Edited Model");
  await page.getByLabel("超时秒数 1-120").fill("45");
  await page.getByRole("button", { name: "保存模型" }).click();
  await expect(page.getByText("Sprint 53 Edited Model")).toBeVisible();
  await expect(page.getByText("45 秒")).toBeVisible();

  await page.getByLabel("切换 Sprint 53 Edited Model 的启用状态").click();
  await expect(page.getByText("启用状态已更新").first()).toBeVisible();
  await expect(page.getByText("停用").first()).toBeVisible();

  await page.getByRole("button", { name: "测试连接" }).first().click();
  await expect(page.getByText(/连接测试已完成/).first()).toBeVisible();
  await expect(page.getByText("正常").first()).toBeVisible();

  const editedCard = page.locator('[data-slot="card"]').filter({ hasText: "Sprint 53 Edited Model" });
  await editedCard.getByRole("button", { name: "删除" }).click();
  await expect(page.getByText("确定删除模型 Sprint 53 Edited Model（deepseek-chat）吗？")).toBeVisible();
  await page.getByRole("button", { name: "取消" }).click();
  await expect(page.getByText("Sprint 53 Edited Model")).toBeVisible();

  await editedCard.getByRole("button", { name: "删除" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "删除" }).click();
  await expect(page.getByText("模型已删除").first()).toBeVisible();
  await expect(page.getByText("Sprint 53 Edited Model")).toHaveCount(0);

  const referencedCard = page.locator('[data-slot="card"]').filter({ hasText: "Referenced DeepSeek" });
  await referencedCard.getByRole("button", { name: "删除" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "删除" }).click();
  await expect(page.getByText(/模型删除被阻止/).first()).toBeVisible();
  await expect(page.getByText("Referenced DeepSeek")).toBeVisible();

  await context.close();
});

test("regular user sees localized read-only model cards", async () => {
  const context = await browser!.newContext({ baseURL: "http://localhost:24333" });
  await context.addInitScript(() => {
    window.localStorage.setItem("language", "en-US");
    window.localStorage.setItem("ai-material-auth-session", JSON.stringify({ username: "regular_user", role: "user" }));
  });

  const page = await context.newPage();
  await installModelGatewayMocks(page, regularUser);

  await page.goto("/ai/models");
  await expect(page.getByRole("heading", { name: "Model Gateway" })).toBeVisible();
  await expect(page.getByText("This account is read-only").first()).toBeVisible();
  await expect(page.getByText("Referenced DeepSeek")).toBeVisible();
  await expect(page.getByText("Untested").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "New Model" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Edit" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Delete" })).toHaveCount(0);

  await context.close();
});
