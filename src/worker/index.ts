import { Hono } from "hono";
import type { AppEnv, Bindings } from "./auth";
import { runAttendanceReminders } from "./attendanceReminders";
import authRoutes from "./routes/auth";
import employeeRoutes from "./routes/employees";
import attendanceRoutes from "./routes/attendance";
import leaveRoutes from "./routes/leave";
import feedbackRoutes from "./routes/feedback";
import chatRoutes from "./routes/chat";
import payrollRoutes from "./routes/payroll";
import adjustmentRoutes from "./routes/adjustments";
import documentRoutes from "./routes/documents";
import roleRoutes from "./routes/roles";
import extensionRoutes from "./routes/extension";
import appVersionRoutes from "./routes/appVersion";
import holidayRoutes from "./routes/holidays";

const app = new Hono<AppEnv>();

app.route("/api", authRoutes);
// Public, no-auth routes must be mounted BEFORE the sub-apps below that do
// `app.use("*", requireEmployee)`. A mounted sub-app's wildcard middleware also
// matches /api/* paths that belong to later sub-apps, so mounting a public
// route after them lets requireEmployee short-circuit it with 401 before its
// handler ever runs. extensionRoutes and appVersionRoutes are both public.
app.route("/api", extensionRoutes);
app.route("/api", appVersionRoutes);
app.route("/api", employeeRoutes);
app.route("/api", attendanceRoutes);
app.route("/api", holidayRoutes);
app.route("/api", leaveRoutes);
app.route("/api", feedbackRoutes);
app.route("/api", chatRoutes);
app.route("/api", payrollRoutes);
app.route("/api", adjustmentRoutes);
app.route("/api", documentRoutes);
app.route("/api", roleRoutes);

app.get("/api/*", (c) => c.json({ error: "Not found" }, 404));

/**
 * Anything that escapes a route handler would otherwise reach the browser as a
 * bare "Internal Server Error" with no clue what broke — which is exactly what a
 * D1 table missing because remote migrations were never applied looks like.
 * Surface the real message instead: this is an internal tool, and being able to
 * read the failure is worth far more than hiding it.
 */
app.onError((err, c) => {
  console.error("Unhandled error:", err);
  const message = err instanceof Error ? err.message : "Unexpected server error";
  if (c.req.path.startsWith("/api/")) return c.json({ error: message }, 500);
  return c.text(message, 500);
});

app.all("*", (c) => c.env.ASSETS.fetch(c.req.raw));

/**
 * Module-format export so the Worker can serve HTTP (fetch) AND run on a
 * schedule (scheduled). The cron in wrangler.jsonc fires `scheduled` on
 * weekdays around noon IST to send attendance reminders; waitUntil keeps the
 * invocation alive until every email has been attempted.
 */
export default {
  fetch: app.fetch,
  async scheduled(_controller: ScheduledController, env: Bindings, ctx: ExecutionContext) {
    ctx.waitUntil(runAttendanceReminders(env));
  },
} satisfies ExportedHandler<Bindings>;
