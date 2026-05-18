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
  username: "regular_user",
  display_name: "Regular User",
  is_super_admin: false,
  permissions: [],
  material_library_scope_ids: null,
  roles: [{ id: 2, name: "User", code: "USER", enabled: true }],
};

type LocatorControl = {
  selectOption(value: string): Promise<void>;
  inputValue(): Promise<string>;
};

function control(locator: unknown): LocatorControl {
  return locator as LocatorControl;
}

const library = {
  id: 101,
  code: "MLIB-029",
  name: "Sprint 29 Auto Library",
  description: "automatic code rule detail",
  enabled: true,
  auto_code_enabled: true,
  recode_enabled: true,
  current_rule_version_id: 1001,
  material_count: 0,
  code_rule_summary: {
    id: 1001,
    version: 1,
    version_no: 1,
    version_label: "V1",
    rule_name: "Sprint 29 V1",
    status: "active",
    created_by: "super_admin",
    effective_time: "2026-05-18T00:00:00",
  },
};

function activeRule(version = 1, fixed = "S29") {
  return {
    id: 1000 + version,
    library_id: 101,
    version_no: version,
    version,
    version_label: `V${version}`,
    rule_name: `Sprint 29 V${version}`,
    rule_config: {
      separator: "-",
      segments: [
        { type: "fixed", order: 1, value: fixed },
        { type: "serial", order: 2, length: version === 1 ? 3 : 4, start: 1, step: 1, scope: "global" },
      ],
    },
    segments: [
      { type: "fixed", order: 1, value: fixed },
      { type: "serial", order: 2, length: version === 1 ? 3 : 4, start: 1, step: 1, scope: "global" },
    ],
    separator: "-",
    status: "active",
    change_reason: version === 1 ? "Initial" : "Sprint 29 new materials only",
    created_by: "super_admin",
    effective_time: "2026-05-18T00:00:00",
    created_at: "2026-05-18T00:00:00",
    updated_at: "2026-05-18T00:00:00",
  };
}

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
  await mockMaterialLibraryApis(page);
  return { page, context };
}

async function mockMaterialLibraryApis(page: Page) {
  let currentRule: Record<string, unknown> = activeRule();
  const versions: Record<string, unknown>[] = [currentRule];

  await page.route("**/api/v1/material-libraries/101/code-rules/current", async (route) => {
    await route.fulfill({ json: currentRule });
  });
  await page.route("**/api/v1/material-libraries/101/code-rules/versions**", async (route) => {
    const request = route.request() as any;
    if (request.method() === "POST") {
      const body = request.postDataJSON() as {
        rule_config: { separator?: string; segments: Record<string, unknown>[] };
        activate?: boolean;
        change_reason: string;
      };
      const fixed = String(body.rule_config.segments.find((segment) => segment.type === "fixed")?.value ?? "S29");
      const created = {
        ...activeRule(versions.length + 1, fixed),
        id: 1000 + versions.length + 1,
        status: body.activate ? "active" : "draft",
        effective_time: body.activate ? "2026-05-18T01:00:00" : null,
        change_reason: body.change_reason,
        segments: body.rule_config.segments,
        rule_config: { separator: body.rule_config.separator ?? "-", segments: body.rule_config.segments },
      };
      versions.unshift(created);
      if (body.activate) {
        currentRule = created;
      }
      await route.fulfill({ json: created });
      return;
    }
    await route.fulfill({ json: { items: versions, total: versions.length, page: 1, page_size: 10 } });
  });
  await page.route("**/api/v1/material-libraries/101", async (route) => {
    await route.fulfill({ json: { ...library, current_rule_version_id: currentRule.id } });
  });
  await page.route("**/api/v1/material-libraries", async (route) => {
    await route.fulfill({ json: [{ ...library, current_rule_version_id: currentRule.id }] });
  });
}

test("super_admin opens detail tabs and sees the active code rule", async () => {
  const { page, context } = await pageForTest();
  await page.goto("/material/library");
  await page.getByRole("button", { name: "Sprint 29 Auto Library" }).click();

  for (const label of ["基础信息", "编码规则", "规则版本", "物料列表", "重编码记录", "编码映射"]) {
    await expect(page.getByRole("tab", { name: label })).toBeVisible();
  }

  await page.getByRole("tab", { name: "编码规则" }).click();
  await expect(page.getByText("V1 Sprint 29 V1")).toBeVisible();
  await expect(page.getByText("启用")).toBeVisible();
  await expect(page.getByText("固定文本")).toBeVisible();
  await expect(page.getByText("流水号")).toBeVisible();
  await expect(page.getByText(/流水号长度.*3/)).toBeVisible();
  await expect(page.getByRole("button", { name: "编辑规则" })).toBeVisible();
  await expect(page.getByRole("button", { name: "查看历史版本" })).toBeVisible();
  await expect(page.getByRole("button", { name: "导出编码映射" })).toBeVisible();

  await page.getByRole("button", { name: "查看历史版本" }).click();
  await expect(page.getByRole("columnheader", { name: "版本号" })).toBeVisible();
  await page.getByRole("button", { name: "V1" }).click();
  await expect(page.getByText("V1 片段明细")).toBeVisible();
  await context.close();
});

test("edit rule validates change reason, previews, activates, and creates recode drafts", async () => {
  const { page, context } = await pageForTest();
  await page.goto("/material/library");
  await page.getByRole("button", { name: "Sprint 29 Auto Library" }).click();
  await page.getByRole("tab", { name: "编码规则" }).click();
  await page.getByRole("button", { name: "编辑规则" }).click();

  await page.getByRole("textbox", { name: "固定文本" }).fill("EDIT29");
  await page.getByLabel("流水号长度").fill("4");
  await page.getByRole("button", { name: "预览" }).click();
  await expect(page.getByText("EDIT29-0001")).toBeVisible();
  await page.getByRole("button", { name: "保存" }).click();
  await expect(page.getByText("请填写变更原因。")).toBeVisible();

  await page.getByLabel("变更原因").fill("Sprint 29 new materials only");
  await control(page.getByLabel("生效模式")).selectOption("new_materials");
  await page.getByRole("button", { name: "保存" }).click();
  await expect(page.getByText("V2 Sprint 29 V2")).toBeVisible();

  await page.getByRole("button", { name: "编辑规则" }).click();
  await page.getByRole("textbox", { name: "固定文本" }).fill("DRAFT29");
  await page.getByLabel("变更原因").fill("Sprint 29 all recode draft");
  await control(page.getByLabel("生效模式")).selectOption("all_recode");
  await page.getByRole("button", { name: "保存" }).click();
  await expect(page.getByText(/请运行全部物料重编码预览/)).toBeVisible();
  await context.close();
});

test("regular users are read-only and edit form keeps localized state", async () => {
  const { page, context } = await pageForTest(regularUser);
  await page.goto("/material/library");
  await page.getByRole("button", { name: "Sprint 29 Auto Library" }).click();
  await page.getByRole("tab", { name: "编码规则" }).click();
  await expect(page.getByText("V1 Sprint 29 V1")).toBeVisible();
  expect(await page.getByRole("button", { name: "编辑规则" }).count()).toEqual(0);
  await context.close();

  const admin = await pageForTest(superAdminUser);
  await admin.page.goto("/material/library");
  await admin.page.getByRole("button", { name: "Sprint 29 Auto Library" }).click();
  await admin.page.getByRole("tab", { name: "编码规则" }).click();
  await admin.page.getByRole("button", { name: "编辑规则" }).click();
  await admin.page.getByRole("textbox", { name: "固定文本" }).fill("LOC29");
  await admin.page.getByLabel("变更原因").fill("Locale preservation");
  await admin.page.getByRole("button", { name: "语言" }).evaluate((element) => (element as HTMLElement).click());
  await expect(admin.page.getByText("Edit Rule")).toBeVisible();
  expect(await control(admin.page.getByLabel("Change Reason")).inputValue()).toEqual("Locale preservation");
  expect(await control(admin.page.getByRole("textbox", { name: "Fixed Text" })).inputValue()).toEqual("LOC29");
  await admin.context.close();
});
