import { Hono } from "hono";
import { cors } from "hono/cors";
import type { AppEnv, Bindings } from "./auth";
import authRoutes from "./routes/auth";
import employeeRoutes from "./routes/employees";
import attendanceRoutes from "./routes/attendance";
import leaveRoutes from "./routes/leave";
import feedbackRoutes from "./routes/feedback";
import chatRoutes from "./routes/chat";
import payrollRoutes from "./routes/payroll";
import teamRoutes from "./routes/teams";
import roleRoutes from "./routes/roles";

const app = new Hono<AppEnv>();

// Restrictive CORS: only origins explicitly listed in ALLOWED_ORIGINS may make
// cross-site API calls. Same-origin requests (the served SPA) and the extension
// (host_permissions) are unaffected. Unset => no cross-origin access granted.
app.use("/api/*", (c, next) => {
  const allowed = (c.env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return cors({
    origin: (origin) => (origin && allowed.includes(origin) ? origin : null),
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    maxAge: 600,
  })(c, next);
});

app.route("/api", authRoutes);
app.route("/api", employeeRoutes);
app.route("/api", attendanceRoutes);
app.route("/api", leaveRoutes);
app.route("/api", feedbackRoutes);
app.route("/api", chatRoutes);
app.route("/api", payrollRoutes);
app.route("/api", roleRoutes);
app.route("/api", teamRoutes);

app.get("/api/*", (c) => c.json({ error: "Not found" }, 404));

function contentSecurityPolicy(env: Bindings): string {
  // The Munshot SDK is self-hosted (see index.html), so scripts are same-origin.
  const directives = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self' data:",
    "connect-src 'self' https://*.muns.io",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ];
  // Only constrain framing when the host origin(s) are known, so we don't
  // accidentally break embedding inside the Munshot host.
  if (env.FRAME_ANCESTORS) directives.push(`frame-ancestors ${env.FRAME_ANCESTORS}`);
  return directives.join("; ");
}

// Serve the SPA, adding security headers to HTML documents.
app.all("*", async (c) => {
  const res = await c.env.ASSETS.fetch(c.req.raw);
  const contentType = res.headers.get("content-type") || "";
  if (!contentType.includes("text/html")) return res;

  const headers = new Headers(res.headers);
  headers.set("Content-Security-Policy", contentSecurityPolicy(c.env));
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "no-referrer");
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
});

export default app;
