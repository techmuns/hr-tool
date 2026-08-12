/**
 * Document Generator storage: offer letters, certificates and letters of
 * recommendation HR builds from a fixed template. The template layout itself
 * lives in the client template registry — this module only persists the dynamic
 * field values (a JSON `data` blob) plus a little metadata for the history list,
 * and hands them back on demand so a document re-opens exactly as it was saved.
 *
 * Like certificates, nothing here is computed; it is storage and retrieval. The
 * two act deliberately differently, though: a certificate is a one-off letter,
 * while a document is an editable, re-openable draft that autosaves as HR types,
 * so this exposes a PUT for in-place updates and a duplicate helper.
 */

import { Hono } from "hono";
import type { AppEnv } from "../auth";
import { requireAdmin, requireEmployee } from "../auth";
import type { DocumentRecord, DocumentRow, DocumentStatus } from "../types";

const app = new Hono<AppEnv>();

app.use("*", requireEmployee, requireAdmin);

const DOC_SELECT = `
  SELECT d.*, u.name AS created_by_name
    FROM documents d
    LEFT JOIN employees u ON u.id = d.created_by`;

type DocQueryRow = DocumentRecord & { created_by_name: string | null };

/** Parse the stored JSON `data` blob defensively — a corrupt row becomes {}. */
function parseData(json: string): Record<string, string> {
  try {
    const parsed = JSON.parse(json);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const out: Record<string, string> = {};
      for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
        out[k] = v == null ? "" : String(v);
      }
      return out;
    }
  } catch {
    /* fall through */
  }
  return {};
}

function toRow(r: DocQueryRow): DocumentRow {
  return {
    id: r.id,
    template_id: r.template_id,
    title: r.title,
    recipient_name: r.recipient_name,
    status: r.status,
    data: parseData(r.data),
    employee_id: r.employee_id,
    created_at: r.created_at,
    updated_at: r.updated_at,
    created_by: r.created_by,
    created_by_name: r.created_by_name,
  };
}

/** Coerce a client-supplied `data` object to a flat string map before storing. */
function normalizeData(input: unknown): Record<string, string> {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (typeof k !== "string") continue;
    out[k] = v == null ? "" : String(v);
  }
  return out;
}

app.get("/admin/documents", async (c) => {
  const rows = await c.env.DB.prepare(`${DOC_SELECT} ORDER BY d.updated_at DESC`).all<DocQueryRow>();
  return c.json((rows.results ?? []).map(toRow));
});

app.get("/admin/documents/:id", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) return c.json({ error: "Invalid document id" }, 400);
  const row = await c.env.DB.prepare(`${DOC_SELECT} WHERE d.id = ?`).bind(id).first<DocQueryRow>();
  if (!row) return c.json({ error: "Document not found" }, 404);
  return c.json(toRow(row));
});

interface CreateBody {
  template_id?: string;
  title?: string;
  recipient_name?: string;
  status?: string;
  data?: unknown;
  employee_id?: number;
}

function cleanStatus(s: unknown): DocumentStatus {
  return s === "generated" ? "generated" : "draft";
}

app.post("/admin/documents", async (c) => {
  const body = await c.req.json<CreateBody>().catch(() => ({}) as CreateBody);

  const templateId = typeof body.template_id === "string" ? body.template_id.trim() : "";
  if (!templateId) return c.json({ error: "template_id is required" }, 400);

  const data = normalizeData(body.data);
  const title = typeof body.title === "string" ? body.title.slice(0, 200) : "";
  const recipient = typeof body.recipient_name === "string" ? body.recipient_name.slice(0, 200) : "";
  const employeeId = Number.isInteger(body.employee_id) ? (body.employee_id as number) : null;

  const result = await c.env.DB.prepare(
    `INSERT INTO documents (template_id, title, recipient_name, status, data, employee_id, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(templateId, title, recipient, cleanStatus(body.status), JSON.stringify(data), employeeId, c.get("employee").id)
    .run();

  const created = await c.env.DB.prepare(`${DOC_SELECT} WHERE d.id = ?`)
    .bind(result.meta.last_row_id)
    .first<DocQueryRow>();
  return c.json(created ? toRow(created) : null, 201);
});

interface UpdateBody {
  title?: string;
  recipient_name?: string;
  status?: string;
  data?: unknown;
}

app.put("/admin/documents/:id", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) return c.json({ error: "Invalid document id" }, 400);

  const existing = await c.env.DB.prepare("SELECT id FROM documents WHERE id = ?").bind(id).first();
  if (!existing) return c.json({ error: "Document not found" }, 404);

  const body = await c.req.json<UpdateBody>().catch(() => ({}) as UpdateBody);

  // Only the fields present in the body are touched, so a lightweight autosave
  // (data only) and a rename (title only) can both use this same endpoint.
  const sets: string[] = [];
  const binds: (string | number)[] = [];
  if (typeof body.title === "string") {
    sets.push("title = ?");
    binds.push(body.title.slice(0, 200));
  }
  if (typeof body.recipient_name === "string") {
    sets.push("recipient_name = ?");
    binds.push(body.recipient_name.slice(0, 200));
  }
  if (body.status !== undefined) {
    sets.push("status = ?");
    binds.push(cleanStatus(body.status));
  }
  if (body.data !== undefined) {
    sets.push("data = ?");
    binds.push(JSON.stringify(normalizeData(body.data)));
  }
  sets.push("updated_at = datetime('now')");

  await c.env.DB.prepare(`UPDATE documents SET ${sets.join(", ")} WHERE id = ?`)
    .bind(...binds, id)
    .run();

  const updated = await c.env.DB.prepare(`${DOC_SELECT} WHERE d.id = ?`).bind(id).first<DocQueryRow>();
  return c.json(updated ? toRow(updated) : null);
});

/** Clone a document into a fresh draft — handy for issuing near-identical letters. */
app.post("/admin/documents/:id/duplicate", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) return c.json({ error: "Invalid document id" }, 400);

  const src = await c.env.DB.prepare("SELECT * FROM documents WHERE id = ?").bind(id).first<DocumentRecord>();
  if (!src) return c.json({ error: "Document not found" }, 404);

  const result = await c.env.DB.prepare(
    `INSERT INTO documents (template_id, title, recipient_name, status, data, employee_id, created_by)
     VALUES (?, ?, ?, 'draft', ?, ?, ?)`,
  )
    .bind(
      src.template_id,
      src.title ? `${src.title} (copy)` : "",
      src.recipient_name,
      src.data,
      src.employee_id,
      c.get("employee").id,
    )
    .run();

  const created = await c.env.DB.prepare(`${DOC_SELECT} WHERE d.id = ?`)
    .bind(result.meta.last_row_id)
    .first<DocQueryRow>();
  return c.json(created ? toRow(created) : null, 201);
});

app.delete("/admin/documents/:id", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) return c.json({ error: "Invalid document id" }, 400);
  const result = await c.env.DB.prepare("DELETE FROM documents WHERE id = ?").bind(id).run();
  if (!result.meta.changes) return c.json({ error: "Document not found" }, 404);
  return c.json({ ok: true });
});

export default app;
