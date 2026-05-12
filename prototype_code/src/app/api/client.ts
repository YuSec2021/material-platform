export type ApiResult<T> = {
  ok: boolean;
  status: number;
  url: string;
  data: T | null;
  error: string | null;
};

async function request<T>(path: string, init?: RequestInit): Promise<ApiResult<T>> {
  const response = await fetch(path, {
    headers: {
      Accept: "application/json",
      ...init?.headers,
    },
    ...init,
  });

  let data: T | null = null;
  let error: string | null = null;

  try {
    data = (await response.json()) as T;
  } catch {
    error = response.ok ? null : response.statusText;
  }

  return {
    ok: response.ok,
    status: response.status,
    url: path,
    data,
    error,
  };
}

export const apiClient = {
  get<T>(path: string) {
    return request<T>(path);
  },
  productNames() {
    return request<unknown[]>("/api/v1/product-names");
  },
};
