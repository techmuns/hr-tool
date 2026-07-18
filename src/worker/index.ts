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

const app = new Hono<AppEnv>();

app.route("/api", authRoutes);
app.route("/api", employeeRoutes);
app.route("/api", attendanceRoutes);
app.route("/api", leaveRoutes);
app.route("/api", feedbackRoutes);
app.route("/api", chatRoutes);
app.route("/api", payrollRoutes);
app.route("/api", teamRoutes);

app.get("/api/*", (c) => c.json({ error: "Not found" }, 404));

app.all("*", (c) => c.env.ASSETS.fetch(c.req.raw));

export default app;
