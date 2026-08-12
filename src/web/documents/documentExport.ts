import type { DocumentTemplate, PageSize } from "./templates/types";

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoke a tick later so the download has definitely started.
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function safeFilename(name: string): string {
  return (name || "document").replace(/[^\w.-]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 80) || "document";
}

/**
 * Rasterise the exact preview DOM to a PDF. Because the pages are the same
 * point-sized `.doc-page` elements shown in the editor, the PDF is a faithful
 * capture of what the user sees — fonts, positions, logos and all — rather than
 * a re-render that could drift. Each page becomes one full-bleed image on a
 * correctly-sized PDF page.
 */
export async function exportDocumentPdf(pageEls: HTMLElement[], page: PageSize, filename: string): Promise<void> {
  const html2canvas = (await import("html2canvas")).default;
  const { jsPDF } = await import("jspdf");

  // Fonts must be fully loaded or html2canvas captures a fallback face.
  if (document.fonts?.ready) await document.fonts.ready;

  const orientation = page.orientation === "landscape" ? "landscape" : "portrait";
  const pdf = new jsPDF({ orientation, unit: "pt", format: [page.widthPt, page.heightPt] });
  const pw = pdf.internal.pageSize.getWidth();
  const ph = pdf.internal.pageSize.getHeight();

  for (let i = 0; i < pageEls.length; i++) {
    const canvas = await html2canvas(pageEls[i], {
      scale: 3,
      backgroundColor: "#ffffff",
      useCORS: true,
      logging: false,
    });
    const img = canvas.toDataURL("image/png");
    if (i > 0) pdf.addPage([page.widthPt, page.heightPt], orientation);
    pdf.addImage(img, "PNG", 0, 0, pw, ph);
  }

  pdf.save(filename);
}

/**
 * Build a real .docx from the template's programmatic layout. This is a true
 * Word document (editable, reflowable), not an image — fidelity is high for the
 * text-based letters and good for the ornamental certificate (see notes in the
 * template). Amounts and fonts follow the template definitions.
 */
export async function exportDocumentDocx(
  template: DocumentTemplate,
  data: Record<string, string>,
  filename: string,
): Promise<void> {
  const docx = await import("docx");
  const doc = template.buildDocx({ ...template.defaults, ...data }, docx);
  const blob = await docx.Packer.toBlob(doc);
  triggerDownload(blob, filename);
}
