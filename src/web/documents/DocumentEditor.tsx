import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../api";
import { confirmDialog } from "../confirm";
import type { DocumentRow, DocumentStatus } from "../types";
import type { DocumentTemplate } from "./templates/types";
import { DocumentPreview, PX_PER_PT } from "./DocumentPreview";
import { exportDocumentPdf, exportDocumentDocx, safeFilename } from "./documentExport";

interface Props {
  doc: DocumentRow;
  template: DocumentTemplate;
  onSaved: (updated: DocumentRow) => void;
  onBack: () => void;
}

type SaveState = "saved" | "saving" | "unsaved";

const SAVE_LABEL: Record<SaveState, string> = { saved: "Saved", saving: "Saving…", unsaved: "Unsaved changes" };

export function DocumentEditor({ doc, template, onSaved, onBack }: Props) {
  const [data, setData] = useState<Record<string, string>>(() => ({ ...template.defaults, ...doc.data }));
  const [title, setTitle] = useState<string>(doc.title || template.titleOf({ ...template.defaults, ...doc.data }));
  const [status, setStatus] = useState<DocumentStatus>(doc.status);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [zoom, setZoom] = useState(0.5);
  const [attempted, setAttempted] = useState(false);
  const [busy, setBusy] = useState<null | "pdf" | "docx">(null);
  const [mobileTab, setMobileTab] = useState<"form" | "preview">("form");

  const scrollRef = useRef<HTMLDivElement>(null);
  const exportEls = useRef<HTMLElement[]>([]);
  const pageWraps = useRef<(HTMLDivElement | null)[]>([]);
  const firstRun = useRef(true);
  const latest = useRef({ data, title, status });
  latest.current = { data, title, status };

  const missing = template.fields.filter((f) => f.required && !(data[f.id] ?? "").trim());

  // Single source of truth: both the form inputs and the preview's editable
  // fields write here, so the two panels can never disagree.
  const setField = useCallback((id: string, value: string) => {
    setData((prev) => (prev[id] === value ? prev : { ...prev, [id]: value }));
  }, []);

  const persist = useCallback(
    async (overrides: { status?: DocumentStatus } = {}) => {
      const { data: d, title: t } = latest.current;
      const nextStatus = overrides.status ?? latest.current.status;
      setSaveState("saving");
      try {
        const updated = await api.put<DocumentRow>(`/admin/documents/${doc.id}`, {
          data: d,
          title: t,
          recipient_name: template.recipientOf(d),
          status: nextStatus,
        });
        setSaveState("saved");
        onSaved(updated);
        return true;
      } catch {
        setSaveState("unsaved");
        return false;
      }
    },
    [doc.id, onSaved, template],
  );

  // Debounced autosave whenever the document changes.
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    setSaveState("unsaved");
    const t = setTimeout(() => void persist(), 900);
    return () => clearTimeout(t);
  }, [data, title, persist]);

  // Fit-to-width on mount and when the window resizes.
  const fit = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const avail = el.clientWidth - 36;
    const pageW = template.page.widthPt * PX_PER_PT;
    setZoom(Math.min(1.5, Math.max(0.2, avail / pageW)));
  }, [template]);

  useEffect(() => {
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [fit]);

  const scrollToPage = (i: number) => pageWraps.current[i]?.scrollIntoView({ behavior: "smooth", block: "start" });

  async function generate() {
    if (missing.length) {
      setAttempted(true);
      const ok = await confirmDialog(
        `${missing.length} required field${missing.length === 1 ? "" : "s"} still empty: ${missing
          .map((m) => m.label)
          .join(", ")}. Generate anyway?`,
        { confirmLabel: "Generate anyway" },
      );
      if (!ok) return;
    }
    setStatus("generated");
    latest.current = { ...latest.current, status: "generated" };
    await persist({ status: "generated" });
  }

  async function downloadPdf() {
    setBusy("pdf");
    try {
      const els = exportEls.current.filter(Boolean);
      await exportDocumentPdf(els, template.page, `${safeFilename(title)}.pdf`);
    } catch (err) {
      await confirmDialog(err instanceof Error ? err.message : "PDF export failed", { confirmLabel: "OK" });
    } finally {
      setBusy(null);
    }
  }

  async function downloadDocx() {
    setBusy("docx");
    try {
      await exportDocumentDocx(template, data, `${safeFilename(title)}.docx`);
    } catch (err) {
      await confirmDialog(err instanceof Error ? err.message : "DOCX export failed", { confirmLabel: "OK" });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="doc-editor">
      <div className="doc-editor-bar">
        <button type="button" className="link-btn" onClick={onBack}>
          ← All documents
        </button>
        <input
          className="doc-title-input"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          aria-label="Document name"
        />
        <span className={`doc-save-state doc-save-${saveState}`}>{SAVE_LABEL[saveState]}</span>
        <span className="doc-bar-spacer" />
        <div className="doc-mobile-tabs">
          <button type="button" className={mobileTab === "form" ? "active" : ""} onClick={() => setMobileTab("form")}>
            Edit
          </button>
          <button
            type="button"
            className={mobileTab === "preview" ? "active" : ""}
            onClick={() => {
              setMobileTab("preview");
              setTimeout(fit, 0);
            }}
          >
            Preview
          </button>
        </div>
        <button type="button" className="btn" disabled={busy !== null} onClick={downloadDocx}>
          {busy === "docx" ? "…" : "Download DOCX"}
        </button>
        <button type="button" className="btn" disabled={busy !== null} onClick={downloadPdf}>
          {busy === "pdf" ? "…" : "Download PDF"}
        </button>
        <button type="button" className="btn btn-primary" onClick={generate}>
          {status === "generated" ? "Re-generate" : "Generate Document"}
        </button>
      </div>

      <div className={`doc-editor-main mobile-${mobileTab}`}>
        <div className="doc-form">
          <div className="doc-form-inner">
            {template.category && <div className="doc-form-badge">{template.name}</div>}
            {template.fields.map((f) => {
              const val = data[f.id] ?? "";
              const invalid = attempted && f.required && !val.trim();
              return (
                <div className="field" key={f.id}>
                  <label>
                    {f.label}
                    {f.required && <span className="doc-req"> *</span>}
                  </label>
                  {f.type === "multiline" ? (
                    <textarea
                      value={val}
                      rows={4}
                      placeholder={f.placeholder}
                      className={invalid ? "invalid" : undefined}
                      onChange={(e) => setField(f.id, e.target.value)}
                    />
                  ) : (
                    <input
                      value={val}
                      placeholder={f.placeholder}
                      className={invalid ? "invalid" : undefined}
                      onChange={(e) => setField(f.id, e.target.value)}
                    />
                  )}
                  {f.hint && <div className="field-hint">{f.hint}</div>}
                  {invalid && <div className="error-text">This field is required.</div>}
                </div>
              );
            })}
          </div>
        </div>

        <div className="doc-preview-col">
          <div className="doc-preview-toolbar">
            <div className="doc-zoom">
              <button type="button" className="btn-icon" title="Zoom out" onClick={() => setZoom((z) => Math.max(0.2, +(z - 0.1).toFixed(2)))}>
                −
              </button>
              <span className="doc-zoom-val">{Math.round(zoom * 100)}%</span>
              <button type="button" className="btn-icon" title="Zoom in" onClick={() => setZoom((z) => Math.min(2, +(z + 0.1).toFixed(2)))}>
                +
              </button>
              <button type="button" className="btn-icon doc-fit" title="Fit to page" onClick={fit}>
                Fit
              </button>
            </div>
            {template.pageCount > 1 && (
              <div className="doc-page-tabs">
                {Array.from({ length: template.pageCount }, (_, i) => (
                  <button type="button" key={i} onClick={() => scrollToPage(i)}>
                    {i + 1}
                  </button>
                ))}
              </div>
            )}
            <span className="doc-preview-hint">Tip: you can edit text directly on the document.</span>
          </div>

          <div className="doc-preview-scroll" ref={scrollRef}>
            <DocumentPreview
              template={template}
              data={data}
              editable
              onChange={setField}
              zoom={zoom}
              pageWrapRef={(p, el) => {
                pageWraps.current[p] = el;
              }}
            />
          </div>
        </div>
      </div>

      {/* Off-screen, non-editable copy captured for the pixel-perfect PDF export. */}
      <div aria-hidden className="doc-export-stage">
        <DocumentPreview
          template={template}
          data={data}
          editable={false}
          onChange={() => {}}
          zoom={1}
          onPageRef={(p, el) => {
            if (el) exportEls.current[p] = el;
          }}
        />
      </div>
    </div>
  );
}
