import { Hono } from "hono";
import type { AppEnv } from "../auth";
import { requireAdmin, requireEmployee } from "../auth";

const app = new Hono<AppEnv>();

// The single app_config key backing this route. Shared between the GET and the
// PATCH so the read and the write can never drift apart — a typo in one would
// silently turn admin updates into no-ops while the app kept seeing the seed.
const VERSION_KEY = "munshot_app_version";

/**
 * PUBLIC — no auth. The Munshot Attendance Android app calls this on startup,
 * before anyone logs in, so it must answer without a session. It compares the
 * returned string byte-for-byte against its own bundled version; a mismatch
 * blocks the app. A missing row falls back to "1.0" (the seeded, currently
 * shipped version) rather than 500, so a wiped config can never lock everyone
 * out.
 */
app.get("/app-version", async (c) => {
  const row = await c.env.DB.prepare("SELECT value FROM app_config WHERE key = ?")
    .bind(VERSION_KEY)
    .first<{ value: string }>();
  return c.json({ version: row?.value ?? "1.0" });
});

/**
 * Admin only — how HR bumps the required version when a new APK ships, without
 * a code deploy. Auth is applied per-route (not app.use("*", ...)) because the
 * GET above must stay public.
 */
app.patch("/admin/app-version", requireEmployee, requireAdmin, async (c) => {
  const body = await c.req.json<{ version?: string }>().catch(() => ({}) as { version?: string });
  const version = typeof body.version === "string" ? body.version.trim() : "";
  if (!version) return c.json({ error: "Version is required" }, 400);

  await c.env.DB.prepare(
    "INSERT INTO app_config (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value",
  )
    .bind(VERSION_KEY, version)
    .run();

  return c.json({ version });
});

export default app;
