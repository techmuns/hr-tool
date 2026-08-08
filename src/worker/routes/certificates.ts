/**
 * Leaving certificates and letters of recommendation: HR issues one against
 * an employee, optionally emails it immediately, and can come back later to
 * re-download or re-email any past issue, or delete a mistaken one — the same
 * shape of history the Adjustments tab keeps for reimbursements/deductions.
 *
 * Nothing here is auto-generated the way a payslip is; every certificate is a
 * one-off letter HR writes (starting from a suggested default — see
 * defaultCertificateBody in ../certificate.ts), so this module is mostly
 * storage and delivery, not computation.
 */

import { Hono } from "hono";
import type { AppEnv } from "../auth";
import { requireAdmin, requireEmployee } from "../auth";
import { sendRawEmail } from "../email";
import { certificateHtml, certificateSubject } from "../certificate";
import type { Certificate, CertificateType, CertificateWithCreator, Employee } from "../types";

const app = new Hono<AppEnv>();

app.use("*", requireEmployee, requireAdmin);

const CERT_SELECT = `
  SELECT c.*, u.name AS created_by_name
    FROM certificates c
    LEFT JOIN employees u ON u.id = c.created_by`;

app.get("/admin/certificates", async (c) => {
  const employeeId = c.req.query("employee_id");
  const rows = employeeId
    ? await c.env.DB.prepare(`${CERT_SELECT} WHERE c.employee_id = ? ORDER BY c.created_at DESC`)
        .bind(Number(employeeId))
        .all<CertificateWithCreator>()
    : await c.env.DB.prepare(`${CERT_SELECT} ORDER BY c.created_at DESC`).all<CertificateWithCreator>();
  return c.json(rows.results);
});

interface IssueBody {
  employee_id?: number;
  type?: string;
  last_working_day?: string;
  body?: string;
}

app.post("/admin/certificates", async (c) => {
  const body = await c.req.json<IssueBody>().catch(() => ({}) as IssueBody);

  const employeeId = Number(body.employee_id);
  if (!Number.isInteger(employeeId)) return c.json({ error: "employee_id is required" }, 400);

  if (body.type !== "leaving" && body.type !== "lor") {
    return c.json({ error: "type must be 'leaving' or 'lor'" }, 400);
  }
  const type: CertificateType = body.type;

  const text = typeof body.body === "string" ? body.body.trim() : "";
  if (!text) return c.json({ error: "Letter body is required" }, 400);

  const lastWorkingDay = typeof body.last_working_day === "string" && body.last_working_day ? body.last_working_day : null;
  if (type === "leaving" && !lastWorkingDay) {
    return c.json({ error: "last_working_day is required for a leaving certificate" }, 400);
  }

  // Snapshotted from the live record rather than trusted from the client, the
  // same way deductions/reimbursements resolve names server-side.
  const employee = await c.env.DB.prepare("SELECT * FROM employees WHERE id = ?").bind(employeeId).first<Employee>();
  if (!employee) return c.json({ error: "Employee not found" }, 404);

  const result = await c.env.DB.prepare(
    `INSERT INTO certificates (employee_id, type, employee_name, employee_email, job_title, date_of_joining, last_working_day, body, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      employeeId,
      type,
      employee.name,
      employee.email,
      employee.job_title,
      employee.date_of_joining,
      lastWorkingDay,
      text,
      c.get("employee").id,
    )
    .run();

  const created = await c.env.DB.prepare(`${CERT_SELECT} WHERE c.id = ?`)
    .bind(result.meta.last_row_id)
    .first<CertificateWithCreator>();
  return c.json(created, 201);
});

/**
 * (Re-)email a certificate that already exists. Prefers the employee's
 * current address over the issue-time snapshot — it may have been corrected
 * since — and only falls back to the snapshot once the employee record itself
 * is gone (employee_id null after a deletion).
 */
app.post("/admin/certificates/:id/email", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) return c.json({ error: "Invalid certificate id" }, 400);

  const cert = await c.env.DB.prepare("SELECT * FROM certificates WHERE id = ?").bind(id).first<Certificate>();
  if (!cert) return c.json({ error: "Certificate not found" }, 404);

  let target = cert.employee_email;
  if (cert.employee_id !== null) {
    const employee = await c.env.DB.prepare("SELECT email FROM employees WHERE id = ?")
      .bind(cert.employee_id)
      .first<{ email: string }>();
    if (employee?.email) target = employee.email;
  }
  if (!target) return c.json({ error: "No email address on file for this certificate" }, 400);

  try {
    await sendRawEmail(c.env, {
      email: target,
      subject: certificateSubject(cert.type),
      html: certificateHtml(cert),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Send failed";
    return c.json({ error: message }, 502);
  }

  await c.env.DB.prepare("UPDATE certificates SET emailed_to = ?, emailed_at = datetime('now') WHERE id = ?")
    .bind(target, id)
    .run();

  const updated = await c.env.DB.prepare(`${CERT_SELECT} WHERE c.id = ?`).bind(id).first<CertificateWithCreator>();
  return c.json(updated);
});

app.delete("/admin/certificates/:id", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) return c.json({ error: "Invalid certificate id" }, 400);

  const result = await c.env.DB.prepare("DELETE FROM certificates WHERE id = ?").bind(id).run();
  if (!result.meta.changes) return c.json({ error: "Certificate not found" }, 404);
  return c.json({ ok: true });
});

export default app;
