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

export type StopPurchasePayload = {
  type: "stop_purchase";
  applicant: string;
  business_reason: string;
  material_id: number | null;
  reason: string;
  reason_code?: string;
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
  created_resource_type: string;
  created_resource_id: number | null;
  created_at: string;
  updated_at: string;
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
  brands() {
    return request<Brand[]>("/brands");
  },
  attributes() {
    return request<Attribute[]>("/attributes");
  },
  materialLibraries() {
    return request<MaterialLibrary[]>("/material-libraries");
  },
  materials() {
    return request<Material[]>("/materials");
  },
  users() {
    return request<User[]>("/users");
  },
  roles() {
    return request<Role[]>("/roles");
  },
  permissionsCatalog() {
    return request<PermissionEntry[]>("/permissions/catalog");
  },
  submitStopPurchase(payload: StopPurchasePayload) {
    return request<WorkflowApplication>("/workflows/applications/stop-purchase", {
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
