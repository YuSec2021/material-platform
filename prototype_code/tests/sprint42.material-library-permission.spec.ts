import playwright, { type Page } from "@playwright/test";

const { expect, test } = playwright;
test.use({ baseURL: 'http://localhost:5173' });

const API_BASE_URL = process.env.BACKEND_URL ?? "http://localhost:8000/api/v1";
const SUPER_ADMIN_HEADERS = {
  "Content-Type": "application/json",
  "X-User-Role": "super_admin",
};

type RoleOut = {
  id: number;
  name: string;
};

type UserOut = {
  id: number;
  username: string;
};

type MaterialLibraryOut = {
  id: number;
  name: string;
  material_count?: number;
};

type CategoryOut = {
  id: number;
};

type ProductNameOut = {
  id: number;
  unit: string;
};

type MaterialOut = {
  id: number;
  name: string;
  material_library_id: number;
};

type Sprint42Fixture = {
  user: UserOut;
  emptyLibrary: MaterialLibraryOut;
  allowedLibrary: MaterialLibraryOut;
  deniedLibrary: MaterialLibraryOut;
  allowedMaterial: MaterialOut;
  deniedMaterial: MaterialOut;
  category: CategoryOut;
  productName: ProductNameOut;
};

async function apiRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      ...SUPER_ADMIN_HEADERS,
      ...options.headers,
    },
  });
  const body = await response.text();
  const data = body ? JSON.parse(body) as T : null as T;
  if (!response.ok) {
    throw new Error(`${options.method ?? "GET"} ${path} failed with ${response.status}: ${body}`);
  }
  return data;
}

function postJson<T>(path: string, body: unknown): Promise<T> {
  return apiRequest<T>(path, { method: "POST", body: JSON.stringify(body) });
}

async function setupSprint42Fixture(): Promise<Sprint42Fixture> {
  const token = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const emptyRole = await postJson<RoleOut>("/roles", {
    name: `sprint42-role-empty-${token}`,
    description: "Sprint 42 empty accessible library role",
    enabled: true,
  });
  const allowedRole = await postJson<RoleOut>("/roles", {
    name: `sprint42-role-allowed-${token}`,
    description: "Sprint 42 populated accessible library role",
    enabled: true,
  });
  const deniedRole = await postJson<RoleOut>("/roles", {
    name: `sprint42-role-denied-${token}`,
    description: "Sprint 42 denied library role",
    enabled: true,
  });
  const user = await postJson<UserOut>("/users", {
    username: `sprint42-user-${token}`,
    display_name: `Sprint 42 User ${token}`,
    unit: "QA",
    department: "Isolation",
    team: "Browser",
    email: `sprint42-${token}@example.test`,
    status: "active",
  });

  await postJson<RoleOut>(`/roles/${emptyRole.id}/users`, { user_id: user.id });
  await postJson<RoleOut>(`/roles/${allowedRole.id}/users`, { user_id: user.id });

  const emptyLibrary = await postJson<MaterialLibraryOut>("/material-libraries", {
    name: `sprint42-empty-lib-${token}`,
    description: "Accessible library with no materials; it is created first to catch bad default selection.",
    enabled: true,
    material_library_admin_id: emptyRole.id,
  });
  const allowedLibrary = await postJson<MaterialLibraryOut>("/material-libraries", {
    name: `sprint42-allowed-lib-${token}`,
    description: "Accessible library with material data",
    enabled: true,
    material_library_admin_id: allowedRole.id,
  });
  const deniedLibrary = await postJson<MaterialLibraryOut>("/material-libraries", {
    name: `sprint42-denied-lib-${token}`,
    description: "Inaccessible library with material data",
    enabled: true,
    material_library_admin_id: deniedRole.id,
  });

  const [category] = await apiRequest<CategoryOut[]>("/categories");
  const [productName] = await apiRequest<ProductNameOut[]>("/product-names");
  if (!category || !productName) {
    throw new Error("Sprint 42 Playwright setup requires seeded category and product name data.");
  }

  const materialBase = {
    product_name_id: productName.id,
    category_id: category.id,
    unit: productName.unit,
    status: "normal",
    attributes: { color: "red" },
    enabled: true,
  };
  const allowedMaterial = await postJson<MaterialOut>("/materials", {
    ...materialBase,
    name: `sprint42-allowed-material-${token}`,
    material_library_id: allowedLibrary.id,
    description: "Visible Sprint 42 material",
  });
  const deniedMaterial = await postJson<MaterialOut>("/materials", {
    ...materialBase,
    name: `sprint42-denied-material-${token}`,
    material_library_id: deniedLibrary.id,
    description: "Hidden Sprint 42 material",
  });

  return {
    user,
    emptyLibrary,
    allowedLibrary,
    deniedLibrary,
    allowedMaterial,
    deniedMaterial,
    category,
    productName,
  };
}

async function login(page: Page, username: string) {
  await page.goto("/login");
  await page.getByLabel(/用户名|Username/).fill(username);
  await page.getByRole("button", { name: /登录|Log in/ }).click();
  await page.waitForURL(url => !url.pathname.includes('/login'), { timeout: 15000 });
}

test("sprint 42 non-super admin sees assigned library data from the real backend", async ({ page }) => {
  const fixture = await setupSprint42Fixture();
  const scopedHeaders = {
    "Content-Type": "application/json",
    "X-Username": fixture.user.username,
    "X-User-Role": "user",
  };

  const scopedLibraries = await apiRequest<MaterialLibraryOut[]>("/material-libraries", { headers: scopedHeaders });
  expect(scopedLibraries.map((library) => library.id)).toContain(fixture.emptyLibrary.id);
  expect(scopedLibraries.map((library) => library.id)).toContain(fixture.allowedLibrary.id);
  expect(scopedLibraries.map((library) => library.id).includes(fixture.deniedLibrary.id)).toEqual(false);

  const scopedMaterials = await apiRequest<MaterialOut[]>("/materials", { headers: scopedHeaders });
  expect(scopedMaterials.map((material) => material.id)).toContain(fixture.allowedMaterial.id);
  expect(scopedMaterials.map((material) => material.id).includes(fixture.deniedMaterial.id)).toEqual(false);

  const deniedDetail = await fetch(`${API_BASE_URL}/materials/${fixture.deniedMaterial.id}`, { headers: scopedHeaders });
  expect(deniedDetail.status).toEqual(403);

  await login(page, fixture.user.username);

  await page.goto("/material/library");
  await expect(page.getByText(fixture.allowedLibrary.name).first()).toBeVisible();
  expect(await page.getByText(fixture.deniedLibrary.name).count()).toEqual(0);
  await expect(page.getByText(/管理员|Admin/).first()).toBeVisible();

  await page.goto("/material/list");
  await expect(page.getByText(fixture.emptyLibrary.name)).toBeVisible();
  await expect(page.getByText(fixture.allowedLibrary.name).first()).toBeVisible();
  expect(await page.getByText(fixture.deniedLibrary.name).count()).toEqual(0);
  await expect(page.getByText(fixture.allowedMaterial.name)).toBeVisible();
  expect(await page.getByText(fixture.deniedMaterial.name).count()).toEqual(0);

  await page.getByRole("button", { name: /新增物料|New Material/ }).click();
  const optionTexts = await page.locator("body").evaluate(() =>
    Array.from(document.querySelectorAll("select option")).map((option) => option.textContent ?? ""),
  );
  expect(optionTexts).toContain(fixture.emptyLibrary.name);
  expect(optionTexts).toContain(fixture.allowedLibrary.name);
  expect(optionTexts.includes(fixture.deniedLibrary.name)).toEqual(false);
});
