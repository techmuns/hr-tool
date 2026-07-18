import { getSession } from "./session";

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const session = getSession();
  const headers = new Headers(options.headers);
  headers.set("Content-Type", "application/json");
  if (session) {
    headers.set("x-user-id", String(session.employeeId));
    headers.set("x-role", session.role);
  }

  const res = await fetch(`/api${path}`, { ...options, headers });
  const data: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const errorMessage = data && typeof data === "object" && "error" in data ? (data as { error?: string }).error : undefined;
    throw new Error(errorMessage || `Request failed (${res.status})`);
  }
  return data as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "POST", body: body ? JSON.stringify(body) : undefined }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "PATCH", body: body ? JSON.stringify(body) : undefined }),
  del: <T>(path: string) => request<T>(path, { method: "DELETE" }),
};
