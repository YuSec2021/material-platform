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
  category_library_id: number | null;
  category_library: string;
  parent_category_id: number | null;
  description: string;
  enabled: boolean;
};

export type CategoryLibrary = {
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
  auto_code_enabled?: boolean;
  recode_enabled?: boolean;
  current_rule_version_id?: number | null;
  code_rule_summary?: {
    id?: number;
    version?: number;
    version_no?: number;
    version_label?: string;
    status?: string;
    rule_name?: string;
    created_by?: string;
    effective_time?: string | null;
  } | null;
  material_count?: number;
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
  auto_code_enabled?: boolean;
  recode_enabled?: boolean;
  code_rule?: Record<string, unknown> | null;
};

export type CategoryLibraryPayload = {
  name: string;
  code?: string;
  description: string;
  enabled?: boolean;
};

export type CategoryPayload = {
  name: string;
  code?: string;
  category_library_id: number;
  parent_category_id?: number | null;
  description: string;
  enabled?: boolean;
};

export type CategoryImportRow = {
  "一级类目": string;
  "二级类目"?: string;
  "三级类目"?: string;
};

export type CategoryBulkImportResult = {
  category_library_id: number;
  success_count: number;
  skipped_count: number;
  error_count: number;
  success: Array<Record<string, unknown>>;
  skipped: Array<Record<string, unknown>>;
  errors: Array<{ row_number: number; errors: string[] }>;
};

export type CategoryRecognitionResult = {
  categories: Array<{
    level1: string;
    level2?: string;
    level3?: string;
    confidence?: number;
  }>;
  suggestions?: string[];
};

export type MaterialCodeRuleVersion = {
  id: number;
  library_id: number;
  version_no: number;
  version: number;
  version_label: string;
  rule_name: string;
  rule_config: Record<string, unknown>;
  segments: Record<string, unknown>[];
  separator: string;
  status: string;
  change_reason: string;
  created_by: string;
  effective_time: string | null;
  created_at: string;
  updated_at: string;
};

export type MaterialCodeRuleVersionList = {
  items: MaterialCodeRuleVersion[];
  total: number;
  page: number;
  page_size: number;
};

export type MaterialCodeRuleVersionPayload = {
  rule_name: string;
  rule_config: {
    separator?: string;
    segments: Record<string, unknown>[];
  };
  change_reason: string;
  activate?: boolean;
};

export type RecodeScope = "all" | "selected";

export type RecodePreviewPayload = {
  scope: RecodeScope;
  material_ids?: number[];
};

export type BatchActionPayload = {
  confirm: boolean;
  reason?: string;
};

export type MaterialCodeChangeRow = {
  id: number;
  batch_id: number;
  material_id: number;
  material_name: string;
  old_code: string;
  new_code: string;
  status: string;
  error_message: string;
};

export type MaterialCodeChangeBatch = {
  batch_id: number;
  id: number;
  library_id: number;
  old_rule_version_id: number | null;
  new_rule_version_id: number | null;
  change_mode: RecodeScope | string;
  total_count: number;
  success_count: number;
  failed_count: number;
  status: string;
  rows: MaterialCodeChangeRow[];
  created_at: string;
  updated_at: string;
};

export type MaterialCodeChangePreviewList = {
  items: MaterialCodeChangeRow[];
  total: number;
  page: number;
  page_size: number;
};

export type MaterialCodeMapping = {
  id: number;
  library_id: number;
  material_id: number;
  material_name: string;
  old_code: string;
  new_code: string;
  old_rule_version_id: number | null;
  new_rule_version_id: number | null;
  batch_id: number | null;
  status: string;
  created_at: string;
};

export type MaterialCodeMappingList = {
  items: MaterialCodeMapping[];
  total: number;
  page: number;
  page_size: number;
};

export type CodeMappingQueryParams = {
  page?: number;
  page_size?: number;
  batch_id?: number | null;
  old_code?: string;
  new_code?: string;
  export?: "csv";
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
  material_library_id?: number | null;
};

export type MaterialGovernancePreviewPayload = {
  product_name_id?: number | null;
  product_name?: string | null;
  material_library_id?: number | null;
  category_id?: number | null;
  rows?: string | string[] | Record<string, unknown>[] | null;
  file_name?: string;
  file_content?: string;
};

export type MaterialGovernanceImportPayload = {
  product_name_id?: number | null;
  product_name?: string | null;
  material_library_id?: number | null;
  category_id?: number | null;
  items: Record<string, unknown>[];
};

export type MaterialGovernancePreviewResult = {
  capability?: string;
  items?: Record<string, unknown>[];
  rows?: Record<string, unknown>[];
  changes?: Record<string, unknown>[];
  count?: number;
};

export type MaterialAddPreviewPayload = {
  input_text: string;
  material_library_id: number;
  category_id?: number | null;
  product_name_id?: number | null;
  brand_id?: number | null;
  unit?: string | null;
  attachments?: Record<string, unknown>[];
};

export type MaterialAddPreviewResult = Record<string, unknown> & {
  category?: string;
  category_path?: string | string[];
  product_name?: string;
  attributes?: Record<string, unknown>;
  recommended_attributes?: Record<string, unknown> | { name: string; value: unknown }[];
  proposed_material?: Record<string, unknown>;
};

export type MaterialAddConfirmPayload = {
  preview: MaterialAddPreviewResult;
  allow_duplicate?: boolean;
};

export type MaterialMatchPayload = {
  material_library_id: number;
  query?: string | null;
  name?: string | null;
  brand?: string | null;
  brand_id?: number | null;
  attributes?: Record<string, unknown>;
  description?: string;
  top_k?: number;
};

export type MaterialMatch = Record<string, unknown> & {
  material_id?: number;
  id?: number;
  code?: string;
  material_code?: string;
  name?: string;
  material_name?: string;
  product_name?: string;
  brand?: string;
  score?: number;
  confidence?: number;
};

export type MaterialMatchResult = {
  matches?: MaterialMatch[];
  top_matches?: MaterialMatch[];
  results?: MaterialMatch[];
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

export type TraceSpan = Record<string, unknown> & {
  span_id?: string;
  id?: string;
  parent_span_id?: string | null;
  parent_id?: string | null;
  operation_name?: string;
  name?: string;
  span_type?: string;
  type?: string;
  status?: string;
  duration_ms?: number;
  children?: TraceSpan[];
};

export type TraceSummary = Record<string, unknown> & {
  trace_id: string;
  operation_name?: string;
  name?: string;
  capability?: string;
  status?: string;
  duration_ms?: number;
  span_count?: number;
  spans?: TraceSpan[];
  children?: TraceSpan[];
};

export type TraceDetail = {
  trace_id: string;
  spans: TraceSpan[];
  storage_table: string;
};

export type AiCapability =
  | "material_add"
  | "material_match"
  | "category_match"
  | "material_analysis"
  | "attr_recommend"
  | "material_governance";

export type AiProviderConfig = {
  id: number;
  display_name: string;
  provider: string;
  model: string;
  model_name: string;
  endpoint: string;
  base_url: string;
  api_key_masked: string;
  capabilities: AiCapability[];
  active: boolean;
  enabled: boolean;
  timeout_seconds: number;
  fallback_model_id: number | null;
  connection_status: "ok" | "error" | "untested" | string;
  last_test_message: string;
  last_test_at: string | null;
  updated_at: string;
};

export type AiProviderPayload = {
  display_name: string;
  provider: string;
  model_name: string;
  base_url: string;
  api_key?: string;
  timeout_seconds: number;
  enabled: boolean;
  capabilities?: AiCapability[];
  fallback_model_id?: number | null;
};

export type AiProviderTestResult = {
  ok: boolean;
  provider: string;
  model: string;
  capabilities?: AiCapability[];
  status: "ok" | "error" | "untested" | string;
  message: string;
};

export type AiCapabilityMapping = {
  id: number;
  capability: AiCapability;
  primary_model_id: number;
  primary_model_name: string;
  fallback_model_id: number | null;
  fallback_model_name: string;
  enabled: boolean;
  updated_at: string;
};

export type AiCapabilityMappingPayload = {
  capability: AiCapability;
  primary_model_id: number;
  fallback_model_id: number | null;
  enabled: boolean;
};

export type RuleCategory = {
  id: number;
  slug: string;
  display_name_zh: string;
  display_name_en: string;
  description_zh: string;
  description_en: string;
  icon: string;
  sort_order: number;
  created_at: string;
  rule_count: number;
};

export type Rule = {
  id: number;
  category_id: number;
  category_slug: string;
  category: RuleCategory;
  name: string;
  description: string;
  pattern: string;
  value: string;
  options: Record<string, unknown> | unknown[];
  priority: number;
  enabled: boolean;
  created_at: string;
  updated_at: string;
};

export type RuleListResponse = {
  items: Rule[];
  total: number;
  page: number;
  page_size: number;
  pages: number;
};

export type RuleQueryParams = {
  category_id?: number | null;
  search?: string;
  enabled?: boolean | null;
  page?: number;
  page_size?: number;
};

export type RulePayload = {
  category_id: number;
  name: string;
  description: string;
  pattern: string;
  value: string;
  options: Record<string, unknown> | unknown[];
  priority: number;
  enabled: boolean;
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

function withQuery(path: string, params: Record<string, string | number | boolean | null | undefined>): string {
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
  const isFormData = typeof FormData !== "undefined" && options.body instanceof FormData;
  if (isFormData) {
    headers.delete("Content-Type");
  }
  const body = options.body === undefined || isFormData ? options.body : JSON.stringify(options.body);

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

async function download(path: string, options: RequestOptions = {}): Promise<Blob> {
  const url = pathToUrl(path);
  const headers = requestHeaders(options.headers);
  headers.delete("Accept");
  headers.delete("Content-Type");
  const { body: _body, ...fetchOptions } = options;

  lastRequestUrl = url;
  const response = await fetch(url, {
    ...fetchOptions,
    headers,
  });
  lastResponseStatus = response.status;

  if (!response.ok) {
    const text = await response.text();
    throw new ApiError(response.status, text || response.statusText, url);
  }

  return response.blob();
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
  createCategory(payload: CategoryPayload) {
    return request<Category>("/categories", { method: "POST", body: payload });
  },
  updateCategory(id: number, payload: Partial<CategoryPayload>) {
    return request<Category>(`/categories/${id}`, { method: "PUT", body: payload });
  },
  deleteCategory(id: number) {
    return request<{ deleted: boolean; id: number }>(`/categories/${id}`, { method: "DELETE" });
  },
  downloadCategoryTemplate() {
    return download("/categories/template");
  },
  bulkImportCategories(categoryLibraryId: number, rows: CategoryImportRow[]) {
    return request<CategoryBulkImportResult>(withQuery("/categories/bulk-import", { category_library_id: categoryLibraryId }), {
      method: "POST",
      body: { rows },
    });
  },
  bulkImportCategoriesFile(categoryLibraryId: number, file: File) {
    const formData = new FormData();
    formData.set("file", file);
    return request<CategoryBulkImportResult>(withQuery("/categories/bulk-import", { category_library_id: categoryLibraryId }), {
      method: "POST",
      body: formData,
    });
  },
  recognizeCategories(text: string, categoryLibraryId?: number | null) {
    return request<CategoryRecognitionResult>("/ai/category-recognition/recognize", {
      method: "POST",
      body: { text, category_library_id: categoryLibraryId ?? undefined },
    });
  },
  categoryLibraries() {
    return request<CategoryLibrary[]>("/category-libraries");
  },
  categoryLibrary(id: number) {
    return request<CategoryLibrary>(`/category-libraries/${id}`);
  },
  createCategoryLibrary(payload: CategoryLibraryPayload) {
    return request<CategoryLibrary>("/category-libraries", { method: "POST", body: payload });
  },
  updateCategoryLibrary(id: number, payload: Partial<CategoryLibraryPayload>) {
    return request<CategoryLibrary>(`/category-libraries/${id}`, { method: "PUT", body: payload });
  },
  deleteCategoryLibrary(id: number) {
    return request<{ deleted: boolean; id: number }>(`/category-libraries/${id}`, { method: "DELETE" });
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
  materialLibrary(id: number) {
    return request<MaterialLibrary>(`/material-libraries/${id}`);
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
  currentCodeRule(libraryId: number) {
    return request<MaterialCodeRuleVersion>(`/material-libraries/${libraryId}/code-rules/current`);
  },
  codeRuleVersions(libraryId: number, page = 1, pageSize = 10) {
    return request<MaterialCodeRuleVersionList>(
      withQuery(`/material-libraries/${libraryId}/code-rules/versions`, { page, page_size: pageSize }),
    );
  },
  createCodeRuleVersion(libraryId: number, payload: MaterialCodeRuleVersionPayload) {
    return request<MaterialCodeRuleVersion>(`/material-libraries/${libraryId}/code-rules/versions`, {
      method: "POST",
      body: payload,
    });
  },
  recodePreview(libraryId: number, versionId: number, payload: RecodePreviewPayload) {
    return request<MaterialCodeChangeBatch>(
      `/material-libraries/${libraryId}/code-rules/versions/${versionId}/recode-preview`,
      {
        method: "POST",
        body: payload,
      },
    );
  },
  recodeBatch(batchId: number) {
    return request<MaterialCodeChangeBatch>(`/material-code-change-batches/${batchId}`);
  },
  recodePreviewRows(batchId: number, page = 1, pageSize = 50) {
    return request<MaterialCodeChangePreviewList>(
      withQuery(`/material-code-change-batches/${batchId}/preview`, { page, page_size: pageSize }),
    );
  },
  executeRecodeBatch(batchId: number, payload: BatchActionPayload) {
    return request<MaterialCodeChangeBatch>(`/material-code-change-batches/${batchId}/execute`, {
      method: "POST",
      body: payload,
    });
  },
  rollbackRecodeBatch(batchId: number, payload: BatchActionPayload) {
    return request<MaterialCodeChangeBatch>(`/material-code-change-batches/${batchId}/rollback`, {
      method: "POST",
      body: payload,
    });
  },
  codeMappings(libraryId: number, params: CodeMappingQueryParams = {}) {
    return request<MaterialCodeMappingList>(withQuery(`/material-libraries/${libraryId}/code-mappings`, params));
  },
  downloadCodeMappings(libraryId: number, params: CodeMappingQueryParams = {}) {
    return download(withQuery(`/material-libraries/${libraryId}/code-mappings`, { ...params, export: "csv" }));
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
  previewMaterialGovernance(payload: MaterialGovernancePreviewPayload) {
    return request<MaterialGovernancePreviewResult>("/ai/material-governance/preview", {
      method: "POST",
      body: payload,
    });
  },
  importMaterialGovernance(payload: MaterialGovernanceImportPayload) {
    return request<Material[] | Record<string, unknown>>("/ai/material-governance/import", {
      method: "POST",
      body: payload,
    });
  },
  previewMaterialAdd(payload: MaterialAddPreviewPayload) {
    return request<MaterialAddPreviewResult>("/ai/material-add/preview", {
      method: "POST",
      body: payload,
    });
  },
  confirmMaterialAdd(payload: MaterialAddConfirmPayload) {
    return request<Record<string, unknown>>("/ai/material-add/confirm", {
      method: "POST",
      body: payload,
    });
  },
  matchMaterials(payload: MaterialMatchPayload) {
    return request<MaterialMatchResult>("/ai/material-match", {
      method: "POST",
      body: payload,
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
  workflowApplications(params: WorkflowApplicationQuery = {}) {
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
  aiProviders() {
    return request<AiProviderConfig[]>("/ai/providers");
  },
  createAiProvider(payload: AiProviderPayload) {
    return request<AiProviderConfig>("/ai/providers", { method: "POST", body: payload });
  },
  updateAiProvider(id: number, payload: AiProviderPayload) {
    return request<AiProviderConfig>(`/ai/providers/${id}`, { method: "PUT", body: payload });
  },
  deleteAiProvider(id: number) {
    return request<{ deleted: boolean; id: number }>(`/ai/providers/${id}`, { method: "DELETE" });
  },
  disableAiProvider(id: number) {
    return request<AiProviderConfig>(`/ai/providers/${id}/disable`, { method: "PATCH" });
  },
  testAiProviderDraft(payload: AiProviderPayload) {
    return request<AiProviderTestResult>("/ai/providers/test", { method: "POST", body: payload });
  },
  testAiProvider(id: number) {
    return request<AiProviderTestResult>(`/ai/providers/${id}/test`, { method: "POST" });
  },
  aiCapabilityMappings() {
    return request<AiCapabilityMapping[]>("/ai/capability-mappings");
  },
  updateAiCapabilityMapping(capability: AiCapability, payload: AiCapabilityMappingPayload) {
    return request<AiCapabilityMapping>(`/ai/capability-mappings/${capability}`, { method: "PUT", body: payload });
  },
  ruleCategories() {
    return request<RuleCategory[]>("/rules/categories");
  },
  rules(params: RuleQueryParams = {}) {
    return request<RuleListResponse>(withQuery("/rules", params));
  },
  rule(id: number) {
    return request<Rule>(`/rules/${id}`);
  },
  createRule(payload: RulePayload) {
    return request<Rule>("/rules", { method: "POST", body: payload });
  },
  updateRule(id: number, payload: Partial<RulePayload>) {
    return request<Rule>(`/rules/${id}`, { method: "PUT", body: payload });
  },
  toggleRule(id: number, enabled: boolean) {
    return request<Rule>(`/rules/${id}/toggle`, { method: "PATCH", body: { enabled } });
  },
  deleteRule(id: number) {
    return request<{ deleted: boolean; id: number }>(`/rules/${id}`, { method: "DELETE" });
  },
  debugTrace() {
    return request<TraceSummary[]>("/debug/trace");
  },
  debugTraceDetail(traceId: string) {
    return request<TraceDetail>(`/debug/trace/${encodeURIComponent(traceId)}`);
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
