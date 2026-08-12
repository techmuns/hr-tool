import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { confirmDialog } from "../confirm";
import { Card } from "../components/ui/Card";
import type { DocumentRow } from "../types";
import { TEMPLATES, getTemplate } from "../documents/templates/registry";
import { DocumentEditor } from "../documents/DocumentEditor";

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso.includes("T") ? iso : `${iso.replace(" ", "T")}Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
}

export function DocumentGenerator() {
  const [docs, setDocs] = useState<DocumentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [picking, setPicking] = useState(false);
  const [creatingId, setCreatingId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const rows = await api.get<DocumentRow[]>("/admin/documents", { force: true });
      setDocs(rows);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load documents");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const selected = useMemo(() => docs.find((d) => d.id === selectedId) ?? null, [docs, selectedId]);
  const selectedTemplate = selected ? getTemplate(selected.template_id) : undefined;

  async function createFrom(templateId: string) {
    const template = getTemplate(templateId);
    if (!template) return;
    setCreatingId(templateId);
    try {
      const created = await api.post<DocumentRow>("/admin/documents", {
        template_id: template.id,
        title: template.titleOf(template.defaults),
        recipient_name: template.recipientOf(template.defaults),
        data: template.defaults,
        status: "draft",
      });
      setDocs((prev) => [created, ...prev]);
      setPicking(false);
      setSelectedId(created.id);
    } catch (err) {
      await confirmDialog(err instanceof Error ? err.message : "Could not create document", { confirmLabel: "OK" });
    } finally {
      setCreatingId(null);
    }
  }

  async function duplicate(id: number) {
    try {
      const copy = await api.post<DocumentRow>(`/admin/documents/${id}/duplicate`);
      setDocs((prev) => [copy, ...prev]);
      setSelectedId(copy.id);
    } catch (err) {
      await confirmDialog(err instanceof Error ? err.message : "Could not duplicate", { confirmLabel: "OK" });
    }
  }

  async function remove(id: number, name: string) {
    const ok = await confirmDialog(`Delete “${name || "this document"}”? This cannot be undone.`, {
      confirmLabel: "Delete",
      danger: true,
    });
    if (!ok) return;
    try {
      await api.del(`/admin/documents/${id}`);
      setDocs((prev) => prev.filter((d) => d.id !== id));
      if (selectedId === id) setSelectedId(null);
    } catch (err) {
      await confirmDialog(err instanceof Error ? err.message : "Could not delete", { confirmLabel: "OK" });
    }
  }

  function onSaved(updated: DocumentRow) {
    setDocs((prev) => prev.map((d) => (d.id === updated.id ? updated : d)));
  }

  if (selected && selectedTemplate) {
    return <DocumentEditor doc={selected} template={selectedTemplate} onSaved={onSaved} onBack={() => setSelectedId(null)} />;
  }

  return (
    <div className="doc-gen">
      <Card
        title="Document Generator"
        actions={
          <button type="button" className="btn btn-primary" onClick={() => setPicking(true)}>
            New document
          </button>
        }
      >
        <p className="muted" style={{ marginTop: 0 }}>
          Generate offer letters, certificates and recommendation letters on the Munshot templates — edit on the left or
          straight on the document, then download a pixel-matched PDF or an editable Word file.
        </p>

        {error && <div className="error-text">{error}</div>}

        {loading ? (
          <p className="muted">Loading…</p>
        ) : docs.length === 0 ? (
          <p className="muted">No documents yet. Click “New document” to start.</p>
        ) : (
          <div className="table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th>Document</th>
                  <th>Type</th>
                  <th>Recipient</th>
                  <th>Created</th>
                  <th>Modified</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {docs.map((d) => {
                  const t = getTemplate(d.template_id);
                  return (
                    <tr key={d.id}>
                      <td>
                        <button type="button" className="link-btn" onClick={() => setSelectedId(d.id)}>
                          {d.title || t?.titleOf(d.data) || "Untitled"}
                        </button>
                      </td>
                      <td>{t?.name ?? d.template_id}</td>
                      <td>{d.recipient_name || "—"}</td>
                      <td>{fmtDate(d.created_at)}</td>
                      <td>{fmtDate(d.updated_at)}</td>
                      <td>
                        <span className={`tag ${d.status === "generated" ? "tag-approved" : "tag-pending"}`}>
                          {d.status === "generated" ? "Generated" : "Draft"}
                        </span>
                      </td>
                      <td className="doc-row-actions">
                        <button type="button" className="link-btn" onClick={() => setSelectedId(d.id)}>
                          Open
                        </button>
                        <button type="button" className="link-btn" onClick={() => duplicate(d.id)}>
                          Duplicate
                        </button>
                        <button
                          type="button"
                          className="link-btn danger"
                          onClick={() => remove(d.id, d.title || d.recipient_name)}
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {picking && (
        <div className="modal-backdrop" onClick={() => setPicking(false)}>
          <div className="modal doc-picker" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h2>Choose a template</h2>
              <button type="button" className="link-btn" onClick={() => setPicking(false)}>
                Close
              </button>
            </div>
            <div className="modal-body doc-picker-grid">
              {TEMPLATES.map((t) => (
                <button
                  type="button"
                  key={t.id}
                  className="doc-picker-card"
                  disabled={creatingId !== null}
                  onClick={() => createFrom(t.id)}
                >
                  <span className="doc-picker-cat">{t.category}</span>
                  <span className="doc-picker-name">{t.name}</span>
                  <span className="doc-picker-desc">{t.description}</span>
                  <span className="doc-picker-meta">
                    {t.page.label} {t.page.orientation} · {t.pageCount} page{t.pageCount === 1 ? "" : "s"}
                  </span>
                  {creatingId === t.id && <span className="doc-picker-loading">Creating…</span>}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
