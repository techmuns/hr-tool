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

// --- Lightweight GET cache ---------------------------------------------------
// The dashboard mounts several components that each fetch the same endpoints
// (e.g. /me three times, /attendance/me twice) on the same render. This cache
// coalesces concurrent identical GETs into one request and serves a short-TTL
// result, so the mount burst collapses to one request per endpoint. Any write
// clears the cache so reads stay fresh. Keyed by user so sessions never mix.

interface Entry {
  at: number;
  data?: unknown;
  promise?: Promise<unknown>;
}

const cache = new Map<string, Entry>();
const DEFAULT_TTL = 20_000; // ms

function userScope(): string {
  const s = getSession();
  return s ? `u${s.employeeId}` : "anon";
}

export function clearApiCache(): void {
  cache.clear();
}

interface GetOptions {
  /** Max age (ms) a cached value is served before refetching. Default 20s. */
  ttl?: number;
  /** Skip the cache and force a fresh request. */
  force?: boolean;
}

function cachedGet<T>(path: string, opts: GetOptions = {}): Promise<T> {
  const ttl = opts.ttl ?? DEFAULT_TTL;
  const key = `${userScope()}:${path}`;
  const now = Date.now();
  const hit = cache.get(key);

  if (!opts.force && hit) {
    if (hit.promise) return hit.promise as Promise<T>; // in-flight: dedupe
    if (hit.data !== undefined && now - hit.at < ttl) {
      return Promise.resolve(hit.data as T); // fresh: serve from cache
    }
  }

  const promise = request<T>(path)
    .then((data) => {
      cache.set(key, { at: Date.now(), data });
      return data;
    })
    .catch((err) => {
      cache.delete(key);
      throw err;
    });

  cache.set(key, { at: now, promise });
  return promise;
}

async function mutate<T>(path: string, method: string, body?: unknown): Promise<T> {
  const data = await request<T>(path, {
    method,
    body: body ? JSON.stringify(body) : undefined,
  });
  clearApiCache(); // a write may invalidate any cached read
  return data;
}

export const api = {
  get: <T>(path: string, opts?: GetOptions) => cachedGet<T>(path, opts),
  post: <T>(path: string, body?: unknown) => mutate<T>(path, "POST", body),
  patch: <T>(path: string, body?: unknown) => mutate<T>(path, "PATCH", body),
  del: <T>(path: string) => mutate<T>(path, "DELETE"),
};
