import { Hono } from "hono";
import type { AppEnv } from "./auth";
import authRoutes from "./routes/auth";
import employeeRoutes from "./routes/employees";
import attendanceRoutes from "./routes/attendance";
import leaveRoutes from "./routes/leave";
import feedbackRoutes from "./routes/feedback";
import chatRoutes from "./routes/chat";
import payrollRoutes from "./routes/payroll";
import teamRoutes from "./routes/teams";
import roleRoutes from "./routes/roles";
import extensionRoutes from "./routes/extension";

const app = new Hono<AppEnv>();

app.route("/api", authRoutes);
app.route("/api", extensionRoutes);
app.route("/api", employeeRoutes);
app.route("/api", attendanceRoutes);
app.route("/api", leaveRoutes);
app.route("/api", feedbackRoutes);
app.route("/api", chatRoutes);
app.route("/api", payrollRoutes);
app.route("/api", teamRoutes);
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

export default app;
