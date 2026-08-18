import { clearSession, getSession } from "./session";
import { currentMonth } from "./date";
import type { Attendance, Employee, LeaveRequest, Reimbursement } from "./types";

/** Fired whenever a request comes back 401 so the app can drop the stale
 *  session and send the person back through the OTP login flow, instead of
 *  leaving components stuck showing a raw "Not authenticated" error. */
export const SESSION_EXPIRED_EVENT = "hr:session-expired";

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const session = getSession();
  const headers = new Headers(options.headers);
  // FormData supplies its own multipart Content-Type, including the boundary —
  // overriding it here would make the body unparseable on the other end.
  if (!(options.body instanceof FormData)) headers.set("Content-Type", "application/json");
  if (session) {
    headers.set("x-user-id", String(session.employeeId));
    headers.set("x-role", session.role);
  }

  // The dashboard runs in a third-party (Munshot) iframe, so requests to its
  // own origin still count as cross-site to the browser's cookie policy —
  // "include" is required for the HttpOnly admin_session cookie to be sent.
  const res = await fetch(`/api${path}`, { ...options, headers, credentials: "include" });
  const data: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const errorMessage = data && typeof data === "object" && "error" in data ? (data as { error?: string }).error : undefined;
    const error = new Error(errorMessage || `Request failed (${res.status})`) as Error & { code?: string };
    if (data && typeof data === "object" && "code" in data) error.code = (data as { code?: string }).code;
    if (res.status === 401 && session) {
      // The local session no longer matches a real employee (deleted, or a
      // stale localStorage entry from another deploy) — drop it and tell the
      // app to fall back to login rather than repeatedly hitting this branch.
      clearSession();
      clearApiCache();
      window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
    }
    throw error;
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
    body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
  });
  clearApiCache(); // a write may invalidate any cached read
  return data;
}

/**
 * Reimbursement bills need the session headers, so they can't be plain <a href>
 * links — fetch the bytes here and let the caller hand the blob to the browser.
 */
export async function fetchBill(reimbursementId: number): Promise<Blob> {
  const session = getSession();
  const headers = new Headers();
  if (session) {
    headers.set("x-user-id", String(session.employeeId));
    headers.set("x-role", session.role);
  }
  const res = await fetch(`/api/reimbursements/${reimbursementId}/bill`, { headers, credentials: "include" });
  if (!res.ok) {
    const data: unknown = await res.json().catch(() => null);
    const message = data && typeof data === "object" && "error" in data ? (data as { error?: string }).error : undefined;
    throw new Error(message || "Failed to open bill");
  }
  return res.blob();
}

export const api = {
  get: <T>(path: string, opts?: GetOptions) => cachedGet<T>(path, opts),
  post: <T>(path: string, body?: unknown) => mutate<T>(path, "POST", body),
  put: <T>(path: string, body?: unknown) => mutate<T>(path, "PUT", body),
  patch: <T>(path: string, body?: unknown) => mutate<T>(path, "PATCH", body),
  del: <T>(path: string) => mutate<T>(path, "DELETE"),
};

// --- Admin (privileged) session ---------------------------------------------
// Separate from the api.* helpers above: this is a server-tracked HttpOnly
// cookie session, not the localStorage session, and its "am I unlocked" state
// must never be served from the GET cache — it has to reflect the cookie on
// every check, including right after a login/logout.

export interface AdminPublicEmployee {
  id: number;
  name: string;
  email: string;
  role: string;
  tier: string;
}

export async function adminLogin(password: string): Promise<{ ok: true; employee: AdminPublicEmployee }> {
  return request("/auth/admin-login", { method: "POST", body: JSON.stringify({ password }) });
}

export async function adminLogout(): Promise<void> {
  await request("/auth/admin-logout", { method: "POST" });
}

export async function getAdminSessionStatus(): Promise<
  { authenticated: true; employee: AdminPublicEmployee } | { authenticated: false }
> {
  return request("/auth/admin-session");
}

export async function setAdminPassword(password: string): Promise<void> {
  await request("/auth/admin-password/set", { method: "POST", body: JSON.stringify({ password }) });
}

// --- Employee home bootstrap -------------------------------------------------
// Fetch /me, attendance, leave and reimbursements in ONE request and seed the
// cache under the exact keys the individual components use, so they resolve
// from the single batched call instead of firing four separate ones. If the
// bootstrap request fails, each key transparently falls back to its own
// endpoint — behaviour identical to not having bootstrap at all.

interface BootstrapResponse {
  me: Employee;
  attendance: Attendance[];
  leave: LeaveRequest[];
  reimbursements: Reimbursement[];
}

export function primeEmployeeBootstrap(): void {
  const scope = userScope();
  if (scope === "anon") return;

  // Skip if /me is already warm or in-flight (the four keys are primed together).
  const meHit = cache.get(`${scope}:/me`);
  if (meHit && (meHit.promise || (meHit.data !== undefined && Date.now() - meHit.at < DEFAULT_TTL))) {
    return;
  }

  const month = currentMonth();
  const boot = request<BootstrapResponse>(`/employee/bootstrap?month=${month}`);

  const derive = <T>(path: string, pick: (b: BootstrapResponse) => T): void => {
    const key = `${scope}:${path}`;
    const p = boot
      .then(pick)
      .catch(() => request<T>(path)) // bootstrap failed → fall back to the real endpoint
      .then((data) => {
        cache.set(key, { at: Date.now(), data });
        return data;
      })
      .catch((err) => {
        cache.delete(key);
        throw err;
      });
    cache.set(key, { at: Date.now(), promise: p });
  };

  derive("/me", (b) => b.me);
  derive(`/attendance/me?month=${month}`, (b) => b.attendance);
  derive("/leave/me", (b) => b.leave);
  derive("/reimbursements/me", (b) => b.reimbursements);
}
