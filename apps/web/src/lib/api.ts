/**
 * Thin fetch wrapper for the JusticeGrid API. Requests go through Vite's
 * dev proxy (`/api` → the API server, see vite.config.ts), so they're
 * same-origin from the browser's point of view — the httpOnly refresh
 * cookie the API sets on login just works, no CORS dance needed.
 *
 * On a 401 (expired access token) this makes exactly one attempt to
 * refresh via `/auth/refresh` (cookie-authenticated) and retries the
 * original request once; a second 401 means the session is genuinely
 * gone, so it propagates as an ApiError for the caller (usually
 * AuthContext) to react to by logging out.
 */

export interface ApiErrorShape {
  code: string;
  message: string;
  details?: { field: string; issue: string }[];
  requestId: string;
}

export class ApiError extends Error {
  code: string;
  details?: { field: string; issue: string }[];
  status: number;

  constructor(status: number, error: ApiErrorShape) {
    super(error.message);
    this.name = "ApiError";
    this.status = status;
    this.code = error.code;
    this.details = error.details;
  }
}

export interface ApiMeta {
  requestId: string;
  page?: number;
  pageSize?: number;
  total?: number;
  totalPages?: number;
  unreadCount?: number;
}

let accessToken: string | null = null;

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export function getAccessToken(): string | null {
  return accessToken;
}

type QueryValue = string | number | boolean | undefined | null;

function toQueryString(params?: Record<string, QueryValue>): string {
  if (!params) return "";
  const usp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    usp.set(key, String(value));
  }
  const qs = usp.toString();
  return qs ? `?${qs}` : "";
}

let refreshPromise: Promise<boolean> | null = null;

async function attemptRefresh(): Promise<boolean> {
  refreshPromise ??= (async () => {
    try {
      const res = await fetch("/api/v1/auth/refresh", { method: "POST", credentials: "include" });
      if (!res.ok) return false;
      const body = (await res.json()) as { data: { accessToken: string } };
      setAccessToken(body.data.accessToken);
      return true;
    } catch {
      return false;
    } finally {
      refreshPromise = null;
    }
  })();
  return refreshPromise;
}

interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  query?: Record<string, QueryValue>;
  /** Set true for endpoints that return a raw file (CSV export) rather than the JSON envelope. */
  raw?: boolean;
  _retried?: boolean;
}

async function request<T>(
  path: string,
  options: RequestOptions = {},
): Promise<{ data: T; meta?: ApiMeta }> {
  const url = `/api/v1${path}${toQueryString(options.query)}`;
  const headers: Record<string, string> = {};
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

  const res = await fetch(url, {
    method: options.method ?? "GET",
    headers,
    credentials: "include",
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  if (
    res.status === 401 &&
    !options._retried &&
    path !== "/auth/refresh" &&
    path !== "/auth/login"
  ) {
    const refreshed = await attemptRefresh();
    if (refreshed) {
      return request<T>(path, { ...options, _retried: true });
    }
  }

  if (options.raw) {
    if (!res.ok) throw new Error(`Request to ${path} failed (${res.status})`);
    return { data: (await res.text()) as unknown as T };
  }

  const body = (await res.json()) as {
    success: boolean;
    data?: T;
    meta?: ApiMeta;
    error?: ApiErrorShape;
  };
  if (!res.ok || !body.success) {
    throw new ApiError(
      res.status,
      body.error ?? { code: "UNKNOWN", message: "Request failed", requestId: "" },
    );
  }
  return { data: body.data as T, meta: body.meta };
}

export const api = {
  get: <T>(path: string, query?: Record<string, QueryValue>) =>
    request<T>(path, { method: "GET", query }),
  post: <T>(path: string, body?: unknown) => request<T>(path, { method: "POST", body }),
  patch: <T>(path: string, body?: unknown) => request<T>(path, { method: "PATCH", body }),
  put: <T>(path: string, body?: unknown) => request<T>(path, { method: "PUT", body }),
  getCsv: (path: string, query?: Record<string, QueryValue>) =>
    request<string>(path, { method: "GET", query, raw: true }),
};
