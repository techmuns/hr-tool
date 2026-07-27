// Simple D1-backed fixed-window rate limiter. One row per (scope, key); the row
// is updated in place, so storage is bounded by the number of distinct keys.
//
// Returns true when the request is allowed (count within limit for the current
// window), false when it should be throttled.
import type { Bindings } from "./auth";

export async function rateLimit(
  env: Bindings,
  scope: string,
  key: string,
  limit: number,
  windowMs: number,
): Promise<boolean> {
  const now = Date.now();
  const windowStart = Math.floor(now / windowMs) * windowMs;
  const rlKey = key.toLowerCase();

  // Increment within the current window, or reset to 1 when a new window starts.
  await env.DB.prepare(
    `INSERT INTO rate_limits (scope, rl_key, window_start, count)
     VALUES (?, ?, ?, 1)
     ON CONFLICT (scope, rl_key)
     DO UPDATE SET
       count = CASE WHEN rate_limits.window_start = excluded.window_start
                    THEN rate_limits.count + 1 ELSE 1 END,
       window_start = excluded.window_start`,
  )
    .bind(scope, rlKey, windowStart)
    .run();

  const row = await env.DB.prepare(
    "SELECT count FROM rate_limits WHERE scope = ? AND rl_key = ?",
  )
    .bind(scope, rlKey)
    .first<{ count: number }>();

  return (row?.count ?? 0) <= limit;
}
