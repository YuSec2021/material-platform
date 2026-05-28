import playwright, { type Browser, type Page } from "@playwright/test";

const { chromium, expect, test } = playwright;
let browser: Browser | null = null;
let browserUnavailable = "";

const authUser = {
  id: 1,
  username: "super_admin",
  display_name: "Super Admin",
  is_super_admin: true,
  roles: [{ id: 1, name: "Administrator", code: "ADMIN" }],
};

type CapturedLibraryPayload = {
  name: string;
  description: string;
  enabled: boolean;
  auto_code_enabled?: boolean;
  code_rule?: {
    separator?: string;
    segments?: Record<string, unknown>[];
  };
};

type LocatorControl = {
  click(): Promise<void>;
  fill(value: string): Promise<void>;
  check(): Promise<void>;
  selectOption(value: string): Promise<void>;
  nth(index: number): LocatorControl;
  inputValue(): Promise<string>;
  textContent(): Promise<string | null>;
  evaluate<T>(callback: (element: Element) => T): Promise<T>;
};

function control(locator: unknown): LocatorControl {
  return locator as LocatorControl;
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

async function pageForTest() {
  test.skip(Boolean(browserUnavailable), `Chromium launch unavailable in this sandbox: ${browserUnavailable}`);
  const context = await browser!.newContext({ baseURL: "http://localhost:5173" });
  const page = await context.newPage();
  return { page, context };
}

async function login(page: Page) {
  await page.route("**/api/v1/auth/login", async (route) => {
    await route.fulfill({ json: { access_token: "e2e-token", token_type: "bearer", user: authUser } });
  });
  await page.route("**/api/v1/auth/me", async (route) => {
    await route.fulfill({ json: authUser });
  });
  await page.route("**/api/v1/users/me**", async (route) => {
    await route.fulfill({ json: authUser });
  });
  await page.goto("/login");
  await page.getByRole("button", { name: /登录|Log in/ }).click();
  await (page as any).waitForLoadState("networkidle");
}

test("material library create flow builds and saves an automatic code rule", async () => {
  const { page, context } = await pageForTest();
  const libraries: Record<string, unknown>[] = [];
  const capture: { payload: CapturedLibraryPayload | null } = { payload: null };

  await login(page);
  await page.route("**/api/v1/material-libraries", async (route) => {
    if (route.request().method() === "POST") {
      const request = route.request() as unknown as { postData(): string | null };
      capture.payload = JSON.parse(request.postData() ?? "{}") as CapturedLibraryPayload;
      const created = {
        id: 28,
        code: "MLIB-028",
        name: capture.payload.name,
        description: capture.payload.description,
        enabled: capture.payload.enabled,
        auto_code_enabled: capture.payload.auto_code_enabled,
        current_rule_version_id: 2801,
        code_rule_summary: { version: 1, version_label: "V1", status: "active" },
      };
      libraries.push(created);
      await route.fulfill({ status: 201, json: created });
      return;
    }
    await route.fulfill({ json: libraries });
  });

  await page.goto("/material/library");
  await page.getByRole("button", { name: /新建物料库|New Library/ }).click();
  if ((await page.getByText("分隔符").count()) !== 0) {
    throw new Error("Code rule controls should be hidden before automatic coding is enabled");
  }

  await page.getByLabel("名称").fill("Sprint 28 Auto Library");
  await page.getByLabel("描述").fill("created with code rule");
  await control(page.getByLabel("自动编码")).check();
  await expect(page.getByText("编码规则配置")).toBeVisible();
  await expect(page.getByText("实时预览")).toBeVisible();
  await page.getByLabel("分隔符").fill("-");

  await page.getByRole("button", { name: "固定文本" }).click();
  await page.getByRole("textbox", { name: "固定文本" }).fill("MAT");

  await page.getByRole("button", { name: "类目路径编码" }).click();
  await control(page.getByLabel("类目层级")).selectOption("2");
  await page.getByLabel("1级长度").fill("2");
  await page.getByLabel("2级长度").fill("2");

  await page.getByRole("button", { name: "属性编码" }).click();
  await page.getByLabel("属性名称").fill("color");
  await page.getByRole("textbox", { name: "属性值" }).first().fill("red");
  await page.getByRole("textbox", { name: "属性编码" }).first().fill("R");
  await page.getByRole("button", { name: "新增映射行" }).click();
  await control(page.getByRole("textbox", { name: "属性值" })).nth(1).fill("blue");
  await control(page.getByRole("textbox", { name: "属性编码" })).nth(1).fill("B");

  await page.getByRole("button", { name: "日期" }).click();
  await control(page.getByLabel("日期格式")).selectOption("YYMM");

  await page.getByRole("button", { name: "流水号" }).click();
  await page.getByLabel("流水号长度").fill("4");
  await page.getByLabel("起始值").fill("1");
  await control(page.getByLabel("流水号范围")).selectOption("global");
  await expect(page.getByText(/MAT-.+-R-\d{4}-0001/)).toBeVisible();

  await control(page.locator('button[aria-label="上移片段"]')).nth(4).click();
  const fourthSegmentType = await control(page.locator("article select")).nth(3).evaluate((element: Element) => {
    return (element as HTMLSelectElement).value;
  });
  if (fourthSegmentType !== "serial") {
    throw new Error(`Expected serial segment to move before date, received ${fourthSegmentType}`);
  }
  if ((await control(page.getByRole("textbox", { name: "固定文本" })).inputValue()) !== "MAT") {
    throw new Error("Fixed text value was lost after reorder");
  }
  if ((await control(page.getByLabel("属性名称")).inputValue()) !== "color") {
    throw new Error("Attribute name was lost after reorder");
  }

  await control(page.locator('button[aria-label="删除片段"]')).nth(2).click();
  if ((await page.getByLabel("属性名称").count()) !== 0) {
    throw new Error("Attribute segment should be removed");
  }
  if ((await control(page.getByRole("textbox", { name: "固定文本" })).inputValue()) !== "MAT") {
    throw new Error("Fixed text value was lost after remove");
  }
  if ((await control(page.getByLabel("流水号长度")).inputValue()) !== "4") {
    throw new Error("Serial length was lost after remove");
  }

  await page.getByRole("button", { name: "保存" }).click();
  const capturedPayload = capture.payload;
  if (!capturedPayload?.auto_code_enabled) {
    throw new Error("Expected auto_code_enabled true in POST payload");
  }
  if (capturedPayload.code_rule?.separator !== "-") {
    throw new Error("Expected separator in POST payload");
  }
  const segments = capturedPayload.code_rule?.segments ?? [];
  expect(segments.map((segment: Record<string, unknown>) => segment.type)).toEqual(["fixed", "category_path", "serial", "date"]);
  expect(segments.map((segment: Record<string, unknown>) => segment.order)).toEqual([1, 2, 3, 4]);
  expect(segments[0]?.value).toEqual("MAT");
  expect(segments[1]?.level).toEqual(2);
  expect(segments[2]?.length).toEqual(4);
  expect(segments[2]?.start).toEqual(1);
  expect(segments[2]?.scope).toEqual("global");
  expect(segments[3]?.format).toEqual("YYMM");

  await expect(page.getByText("Sprint 28 Auto Library")).toBeVisible();
  await expect(page.getByText("自动编码")).toBeVisible();
  await expect(page.getByText("V1")).toBeVisible();
  await context.close();
});

test("live preview and validation reject missing unique segments, long codes, and missing mappings", async () => {
  const { page, context } = await pageForTest();
  await login(page);
  await page.route("**/api/v1/material-libraries", async (route) => {
    await route.fulfill({ json: [] });
  });

  await page.goto("/material/library");
  await page.getByRole("button", { name: /新建物料库|New Library/ }).click();
  await page.getByLabel("名称").fill("Sprint 28 Invalid Library");
  await control(page.getByLabel("自动编码")).check();
  await page.getByLabel("分隔符").fill("_");

  await page.getByRole("button", { name: "固定文本" }).click();
  await page.getByRole("textbox", { name: "固定文本" }).fill("MAT");
  await page.getByRole("button", { name: "日期" }).click();
  await control(page.getByLabel("日期格式")).selectOption("YYMM");
  await expect(page.getByText(/MAT_\d{4}/)).toBeVisible();
  await page.getByRole("button", { name: "保存" }).click();
  const firstAlert = await control(page.getByRole("alert")).textContent();
  if (!firstAlert?.includes("至少需要一个唯一生成片段")) {
    throw new Error(`Expected unique segment validation, received ${firstAlert}`);
  }

  await page
    .getByRole("textbox", { name: "固定文本" })
    .fill("MATERIALCODETHATISLONGERTHANSIXTYFOURCHARACTERSWHENCOMBINEDWITHSERIAL");
  await page.getByRole("button", { name: "流水号" }).click();
  await page.getByLabel("流水号长度").fill("10");
  await page.getByRole("button", { name: "保存" }).click();
  const secondAlert = await control(page.getByRole("alert")).textContent();
  if (!secondAlert?.includes("生成编码长度不能超过 64 个字符")) {
    throw new Error(`Expected max-length validation, received ${secondAlert}`);
  }

  await page.getByRole("button", { name: "属性编码" }).click();
  await page.getByLabel("属性名称").fill("color");
  await expect(page.getByText("预览缺少 mock 属性值或映射，请为 color=red 添加编码映射。")).toBeVisible();
  await context.close();
});

test("material library code rule create flow switches languages without losing form state", async () => {
  const { page, context } = await pageForTest();
  await login(page);
  await page.route("**/api/v1/material-libraries", async (route) => {
    await route.fulfill({ json: [] });
  });

  await page.goto("/material/library");
  await page.getByRole("button", { name: /新建物料库|New Library/ }).click();
  await control(page.getByLabel("自动编码")).check();

  await expect(page.getByText("编码规则配置")).toBeVisible();
  await expect(page.getByLabel("分隔符")).toBeVisible();
  await expect(page.getByText("实时预览")).toBeVisible();
  await expect(page.getByRole("button", { name: "固定文本" })).toBeVisible();
  await expect(page.getByRole("button", { name: "类目路径编码" })).toBeVisible();
  await expect(page.getByRole("button", { name: "属性编码" })).toBeVisible();
  await expect(page.getByRole("button", { name: "日期" })).toBeVisible();
  await expect(page.getByRole("button", { name: "流水号" })).toBeVisible();
  await expect(page.getByRole("button", { name: "保存" })).toBeVisible();
  await expect(page.getByRole("button", { name: "取消" })).toBeVisible();
  await page.getByRole("button", { name: "固定文本" }).click();
  await page.getByRole("button", { name: "流水号" }).click();
  await expect(page.getByText("片段类型").first()).toBeVisible();
  await expect(page.getByRole("textbox", { name: "固定文本" })).toBeVisible();
  await expect(page.getByLabel("流水号长度")).toBeVisible();

  await page.getByLabel("名称").fill("Sprint 28 Localized Library");
  await page.getByLabel("分隔符").fill("-");
  await page.getByRole("textbox", { name: "固定文本" }).fill("LOC");
  await page.getByLabel("流水号长度").fill("3");
  await page.getByLabel("起始值").fill("1");

  await page.getByRole("button", { name: "语言" }).evaluate((element) => (element as HTMLElement).click());
  await expect(page.getByText("Code Rule Configuration")).toBeVisible();
  await expect(page.getByText("Segment Type").first()).toBeVisible();
  await expect(page.getByLabel("Separator")).toBeVisible();
  await expect(page.getByText("Live Preview")).toBeVisible();
  await expect(page.getByRole("button", { name: "Fixed Text" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Category Path Code" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Attribute Code" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Date" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Serial Number" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Save" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Cancel" })).toBeVisible();

  if ((await control(page.getByLabel("Name")).inputValue()) !== "Sprint 28 Localized Library") {
    throw new Error("Library name was not preserved after switching to English");
  }
  if ((await control(page.getByRole("textbox", { name: "Fixed Text" })).inputValue()) !== "LOC") {
    throw new Error("Fixed text value was not preserved after switching to English");
  }
  if ((await control(page.getByLabel("Separator")).inputValue()) !== "-") {
    throw new Error("Separator was not preserved after switching to English");
  }
  if ((await control(page.getByLabel("Serial Length")).inputValue()) !== "3") {
    throw new Error("Serial length was not preserved after switching to English");
  }
  if ((await control(page.getByLabel("Start Value")).inputValue()) !== "1") {
    throw new Error("Serial start was not preserved after switching to English");
  }

  await control(page.locator('button[aria-label="Remove segment"]')).nth(1).click();
  await page.getByRole("button", { name: "Save" }).click();
  await expect(
    page.getByText("At least one unique-generating segment is required: category path or serial number."),
  ).toBeVisible();

  await page.getByRole("button", { name: "Language" }).evaluate((element) => (element as HTMLElement).click());
  await expect(page.getByText("至少需要一个唯一生成片段：类目路径编码或流水号。")).toBeVisible();
  await context.close();
});
