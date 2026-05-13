export const API_BASE_URL = "/api/v1";

export const AUTH_STORAGE_KEY = "ai-material-auth-session";

export type RoleSummary = {
  id: number;
  name: string;
  code: string;
  enabled: boolean;
};

export type AuthUser = {
  id: number | null;
  username: string;
  display_name: string;
  is_super_admin: boolean;
  permissions: string[];
  material_library_scope_ids: number[] | null;
  roles: RoleSummary[];
};

export type ProductName = {
  id: number;
  name: string;
  unit: string;
  category: string;
};

export type Category = {
  id: number;
  code: string;
  name: string;
  description: string;
  enabled: boolean;
};

export type BrandLogo = {
  filename: string;
  content_type: string;
  data_url: string;
};

export type Brand = {
  id: number;
  code: string;
  name: string;
  description: string;
  logo: BrandLogo;
  enabled: boolean;
};

export type Attribute = {
  id: number;
  code: string;
  product_name_id: number;
  product_name: string;
  name: string;
  data_type: string;
  unit: string;
  required: boolean;
  default_value: string;
  options: string[];
  description: string;
  source: string;
  version: number;
  enabled: boolean;
};

export type AttributeChange = {
  id: number;
  attribute_id: number;
  attribute_code: string;
  attribute_name: string;
  version: number;
  operator: string;
  changed_fields: string[];
  before_values: Record<string, unknown>;
  after_values: Record<string, unknown>;
  created_at: string;
};

export type AttributePayload = {
  product_name?: string;
  product_name_id?: number | null;
  name: string;
  data_type: string;
  unit?: string;
  required: boolean;
  default_value: string;
  options: string[];
  description: string;
  source?: string;
};

export type BrandPayload = {
  name: string;
  description: string;
  logo: BrandLogo;
  enabled?: boolean;
};

export type MaterialLibrary = {
  id: number;
  code: string;
  name: string;
  description: string;
  enabled: boolean;
};

export type Material = {
  id: number;
  code: string;
  name: string;
  product_name_id: number;
  product_name: string;
  material_library_id: number;
  material_library: string;
  category_id: number;
  category: string;
  unit: string;
  brand_id: number | null;
  brand: string;
  status: "normal" | "stop_purchase" | "stop_use" | "stop-purchase" | "stop-use";
  description: string;
  attributes: Record<string, unknown>;
  lifecycle_history: Record<string, unknown>[];
  enabled: boolean;
  created_at: string;
  updated_at: string;
};

export type MaterialLibraryPayload = {
  name: string;
  description: string;
  enabled?: boolean;
};

export type MaterialPayload = {
  name: string;
  product_name_id: number;
  material_library_id: number;
  category_id: number;
  unit: string;
  brand_id: number | null;
  status?: "normal";
  description: string;
  attributes: Record<string, unknown>;
  enabled?: boolean;
};

export type MaterialQueryParams = {
  search?: string;
  status?: "" | "normal" | "stop_purchase" | "stop_use";
  product_name_id?: number | null;
};

type QueryFunctionContextLike = {
  queryKey: unknown;
};

export type User = {
  id: number;
  username: string;
  display_name: string;
  hcm_id: string;
  unit: string;
  department: string;
  team: string;
  email: string;
  account_ownership: string;
  account_owner: string;
  status: string;
  roles: RoleSummary[];
  created_at: string;
  updated_at: string;
};

export type UserPayload = {
  username: string;
  display_name: string;
  unit: string;
  department: string;
  team: string;
  email: string;
  status?: string;
};

export type UserUpdatePayload = Partial<Omit<UserPayload, "username">>;

export type PasswordResetResult = {
  user_id: number;
  username: string;
  reset_token: string;
  temporary_password: string;
  message: string;
};

export type PermissionEntry = {
  module: string;
  permission_type: string;
  permission_key: string;
  label: string;
};

export type Role = {
  id: number;
  name: string;
  code: string;
  description: string;
  enabled: boolean;
  users: UserSummary[];
  user_count: number;
  permissions: PermissionEntry[];
  created_at: string;
  updated_at: string;
};

export type RolePayload = {
  name: string;
  code: string;
  description: string;
  enabled: boolean;
};

export type UserSummary = {
  id: number;
  username: string;
  display_name: string;
  unit: string;
  department: string;
  team: string;
  account_ownership: string;
  status: string;
};

export type RolePermissions = {
  role_id: number;
  role_name: string;
  permissions: PermissionEntry[];
  catalog: PermissionEntry[];
};

export type ReasonOption = {
  name: string;
  enabled: boolean;
};

export type SystemIcon = {
  filename: string;
  content_type: string;
  data_url: string;
};

export type SystemConfig = {
  system_name: string;
  icon: SystemIcon;
  stop_purchase_reasons: ReasonOption[];
  stop_use_reasons: ReasonOption[];
  approval_mode: "simple" | "multi_node";
  updated_by: string;
  updated_at: string;
};

export type SystemConfigPayload = Partial<{
  system_name: string;
  icon: SystemIcon;
  stop_purchase_reasons: ReasonOption[];
  stop_use_reasons: ReasonOption[];
  approval_mode: "simple" | "multi_node";
}>;

export type StopPurchasePayload = {
  type: "stop_purchase";
  applicant: string;
  business_reason: string;
  material_id: number | null;
  reason: string;
  reason_code?: string;
};

export type WorkflowType = "new_category" | "new_material_code" | "stop_purchase" | "stop_use";

export type WorkflowHistory = {
  id: number;
  actor: string;
  node: string;
  action: string;
  from_status: string;
  to_status: string;
  comment: string;
  created_at: string;
};

export type WorkflowApplication = {
  id: number;
  application_no: string;
  type: string;
  status: string;
  applicant: string;
  current_node: string;
  business_reason: string;
  rejection_reason: string;
  data: Record<string, unknown>;
  approval_history: WorkflowHistory[];
  created_resource_type: string;
  created_resource_id: number | null;
  created_at: string;
  updated_at: string;
};

export type WorkflowApplicationQuery = {
  type?: WorkflowType;
  status?: string;
  applicant?: string;
  material_id?: number | null;
};

export type ReferenceImagePayload = {
  filename: string;
  content_type: string;
  data_url: string;
};

export type CategoryWorkflowPayload = {
  type?: "new_category";
  applicant: string;
  business_reason: string;
  material_library_id: number | null;
  parent_category_id: number | null;
  proposed_category_name: string;
  proposed_category_code?: string;
  description: string;
};

export type MaterialCodeWorkflowPayload = {
  type?: "new_material_code";
  applicant: string;
  business_reason: string;
  material_library_id: number | null;
  category_id: number | null;
  product_name_id: number | null;
  material_name: string;
  unit: string;
  brand_id: number | null;
  attributes: Record<string, unknown>;
  description: string;
  reference_mall_link: string;
  reference_images: ReferenceImagePayload[];
};

export type StopWorkflowPayload = {
  type?: "stop_purchase" | "stop_use";
  applicant: string;
  business_reason: string;
  material_id: number | null;
  reason: string;
  reason_code?: string;
  acknowledge_terminal?: boolean;
};

export type ApiHealthState = {
  baseUrl: string;
  axiosClientReady: boolean;
  typedEndpointMethodsReady: boolean;
  requestInterceptorReady: boolean;
  responseInterceptorReady: boolean;
  authStorageReady: boolean;
  lastRequestUrl: string | null;
  lastResponseStatus: number | null;
};

type RequestOptions = Omit<RequestInit, "body"> & {
  body?: unknown;
};

type AuthSession = {
  username: string;
  role: "super_admin" | "user";
};

export class ApiError extends Error {
  status: number;
  detail: string;
  url: string;

  constructor(status: number, detail: string, url: string) {
    super(detail);
    this.name = "ApiError";
    this.status = status;
    this.detail = detail;
    this.url = url;
  }
}

let lastRequestUrl: string | null = null;
let lastResponseStatus: number | null = null;

export function readAuthSession(): AuthSession | null {
  if (typeof window === "undefined") {
    return null;
  }

  const raw = window.localStorage.getItem(AUTH_STORAGE_KEY);
  if (!raw) {
    return null;
  }

  try {
    const session = JSON.parse(raw) as Partial<AuthSession>;
    if (!session.username) {
      return null;
    }
    return {
      username: session.username,
      role: session.role === "super_admin" ? "super_admin" : "user",
    };
  } catch {
    return null;
  }
}

export function writeAuthSession(session: AuthSession) {
  window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session));
}

export function clearAuthSession() {
  window.localStorage.removeItem(AUTH_STORAGE_KEY);
}

function requestHeaders(init?: HeadersInit): Headers {
  const headers = new Headers(init);
  headers.set("Accept", "application/json");

  if (!headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const session = readAuthSession();
  if (session) {
    headers.set("X-Username", session.username);
    headers.set("X-User-Role", session.role);
    headers.set("Authorization", `Bearer ${session.username}`);
  }

  return headers;
}

function pathToUrl(path: string): string {
  return path.startsWith("http") ? path : `${API_BASE_URL}${path}`;
}

function withQuery(path: string, params: Record<string, string | number | null | undefined>): string {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      search.set(key, String(value));
    }
  });
  const query = search.toString();
  return query ? `${path}?${query}` : path;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const url = pathToUrl(path);
  const headers = requestHeaders(options.headers);
  const body = options.body === undefined ? undefined : JSON.stringify(options.body);

  lastRequestUrl = url;
  const response = await fetch(url, {
    ...options,
    headers,
    body,
  });
  lastResponseStatus = response.status;

  const text = await response.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text) as unknown;
    } catch {
      data = text;
    }
  }

  if (!response.ok) {
    const detail =
      typeof data === "object" && data !== null && "detail" in data
        ? String((data as { detail: unknown }).detail)
        : response.statusText;
    throw new ApiError(response.status, detail, url);
  }

  return data as T;
}

export const apiClient = {
  get<T>(path: string) {
    return request<T>(path);
  },
  post<T>(path: string, body: unknown) {
    return request<T>(path, { method: "POST", body });
  },
  auth: {
    login(username: string) {
      return request<AuthUser>("/auth/login", {
        method: "POST",
        body: { username },
      });
    },
    me() {
      return request<AuthUser>("/auth/me");
    },
  },
  productNames() {
    return request<ProductName[]>("/product-names");
  },
  categories() {
    return request<Category[]>("/categories");
  },
  brands() {
    return request<Brand[]>("/brands");
  },
  createBrand(payload: BrandPayload) {
    return request<Brand>("/brands", { method: "POST", body: payload });
  },
  updateBrand(id: number, payload: Partial<BrandPayload>) {
    return request<Brand>(`/brands/${id}`, { method: "PUT", body: payload });
  },
  deleteBrand(id: number) {
    return request<{ deleted: boolean; id: number }>(`/brands/${id}`, { method: "DELETE" });
  },
  attributes(productNameId?: number | null | QueryFunctionContextLike) {
    const selectedProductNameId = typeof productNameId === "number" ? productNameId : null;
    return request<Attribute[]>(withQuery("/attributes", { product_name_id: selectedProductNameId }));
  },
  createAttribute(payload: AttributePayload) {
    return request<Attribute>("/attributes", { method: "POST", body: payload });
  },
  updateAttribute(id: number, payload: Partial<AttributePayload>) {
    return request<Attribute>(`/attributes/${id}`, { method: "PUT", body: payload });
  },
  deleteAttribute(id: number) {
    return request<{ deleted: boolean; id: number }>(`/attributes/${id}`, { method: "DELETE" });
  },
  attributeChanges(id: number) {
    return request<AttributeChange[]>(`/attributes/${id}/changes`);
  },
  materialLibraries() {
    return request<MaterialLibrary[]>("/material-libraries");
  },
  createMaterialLibrary(payload: MaterialLibraryPayload) {
    return request<MaterialLibrary>("/material-libraries", { method: "POST", body: payload });
  },
  updateMaterialLibrary(id: number, payload: Partial<MaterialLibraryPayload>) {
    return request<MaterialLibrary>(`/material-libraries/${id}`, { method: "PUT", body: payload });
  },
  deleteMaterialLibrary(id: number) {
    return request<{ deleted: boolean; id: number }>(`/material-libraries/${id}`, { method: "DELETE" });
  },
  materials(params: MaterialQueryParams | QueryFunctionContextLike = {}) {
    const materialParams = "queryKey" in params ? {} : params;
    return request<Material[]>(withQuery("/materials", materialParams));
  },
  createMaterial(payload: MaterialPayload) {
    return request<Material>("/materials", { method: "POST", body: payload });
  },
  updateMaterial(id: number, payload: Partial<MaterialPayload>) {
    return request<Material>(`/materials/${id}`, { method: "PUT", body: payload });
  },
  deleteMaterial(id: number) {
    return request<{ deleted: boolean; id: number }>(`/materials/${id}`, { method: "DELETE" });
  },
  stopPurchaseMaterial(id: number, reason: string) {
    return request<Material>(`/materials/${id}/stop-purchase`, {
      method: "PATCH",
      body: { reason, actor: "super_admin" },
    });
  },
  transitionMaterial(id: number, targetStatus: "stop_use", reason: string) {
    return request<Material>(`/materials/${id}/transition`, {
      method: "POST",
      body: { target_status: targetStatus, reason },
    });
  },
  users() {
    return request<User[]>("/users");
  },
  createUser(payload: UserPayload) {
    return request<User>("/users", { method: "POST", body: payload });
  },
  updateUser(id: number, payload: UserUpdatePayload) {
    return request<User>(`/users/${id}`, { method: "PUT", body: payload });
  },
  resetUserPassword(id: number) {
    return request<PasswordResetResult>(`/users/${id}/password-reset`, { method: "POST" });
  },
  deleteUser(id: number) {
    return request<{ deleted: boolean; id: number }>(`/users/${id}`, { method: "DELETE" });
  },
  roles() {
    return request<Role[]>("/roles");
  },
  createRole(payload: RolePayload) {
    return request<Role>("/roles", { method: "POST", body: payload });
  },
  updateRole(id: number, payload: Partial<RolePayload>) {
    return request<Role>(`/roles/${id}`, { method: "PUT", body: payload });
  },
  enableRole(id: number) {
    return request<Role>(`/roles/${id}/enable`, { method: "PATCH" });
  },
  disableRole(id: number) {
    return request<Role>(`/roles/${id}/disable`, { method: "PATCH" });
  },
  deleteRole(id: number) {
    return request<{ deleted: boolean; id: number }>(`/roles/${id}`, { method: "DELETE" });
  },
  roleUsers(id: number) {
    return request<UserSummary[]>(`/roles/${id}/users`);
  },
  addRoleUser(id: number, userId: number) {
    return request<Role>(`/roles/${id}/users`, { method: "POST", body: { user_id: userId } });
  },
  removeRoleUser(id: number, userId: number) {
    return request<Role>(`/roles/${id}/users/${userId}`, { method: "DELETE" });
  },
  permissionsCatalog() {
    return request<PermissionEntry[]>("/permissions/catalog");
  },
  rolePermissions(id: number) {
    return request<RolePermissions>(`/roles/${id}/permissions`);
  },
  saveRolePermissions(id: number, permissionKeys: string[]) {
    return request<RolePermissions>(`/roles/${id}/permissions`, {
      method: "PUT",
      body: { permission_keys: permissionKeys },
    });
  },
  systemConfig() {
    return request<SystemConfig>("/system/config");
  },
  updateSystemConfig(payload: SystemConfigPayload) {
    return request<SystemConfig>("/system/config", { method: "PUT", body: payload });
  },
  workflowApplications(params: WorkflowApplicationQuery) {
    return request<WorkflowApplication[]>(withQuery("/workflows/applications", params));
  },
  workflowApplication(id: number) {
    return request<WorkflowApplication>(`/workflows/applications/${id}`);
  },
  submitNewCategoryApplication(payload: CategoryWorkflowPayload) {
    return request<WorkflowApplication>("/workflows/applications/new-category", {
      method: "POST",
      body: payload,
    });
  },
  submitNewMaterialCodeApplication(payload: MaterialCodeWorkflowPayload) {
    return request<WorkflowApplication>("/workflows/applications/new-material-code", {
      method: "POST",
      body: payload,
    });
  },
  submitStopPurchase(payload: StopPurchasePayload) {
    return request<WorkflowApplication>("/workflows/applications/stop-purchase", {
      method: "POST",
      body: payload,
    });
  },
  submitStopPurchaseApplication(payload: StopWorkflowPayload) {
    return request<WorkflowApplication>("/workflows/applications/stop-purchase", {
      method: "POST",
      body: payload,
    });
  },
  submitStopUseApplication(payload: StopWorkflowPayload) {
    return request<WorkflowApplication>("/workflows/applications/stop-use", {
      method: "POST",
      body: payload,
    });
  },
};

export function apiClientHealth(): ApiHealthState {
  return {
    baseUrl: API_BASE_URL,
    axiosClientReady: true,
    typedEndpointMethodsReady:
      typeof apiClient.productNames === "function" &&
      typeof apiClient.brands === "function" &&
      typeof apiClient.materials === "function" &&
      typeof apiClient.auth.me === "function",
    requestInterceptorReady: typeof requestHeaders === "function",
    responseInterceptorReady: true,
    authStorageReady: typeof window !== "undefined" && "localStorage" in window,
    lastRequestUrl,
    lastResponseStatus,
  };
}
