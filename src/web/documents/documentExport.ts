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
 * JPEG quality for the rasterised pages. High enough that text edges and the
 * certificate's gold rule stay clean at 3x, low enough that the file is a
 * fraction of the PNG's size. The capture is opaque white (see the
 * backgroundColor below), so JPEG's lack of an alpha channel costs nothing.
 */
const PAGE_JPEG_QUALITY = 0.95;

/** Let the browser paint between pages so the button's busy state is visible. */
function yieldToBrowser(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * Encode a canvas as JPEG bytes.
 *
 * toBlob rather than toDataURL: it hands back binary instead of building a
 * multi-megabyte base64 string on the main thread, and browsers are free to do
 * the encode off it.
 */
async function pageJpegBytes(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", PAGE_JPEG_QUALITY),
  );
  if (!blob) throw new Error("Could not encode the page image");
  return new Uint8Array(await blob.arrayBuffer());
}

/**
 * Rasterise the exact preview DOM to a PDF. Because the pages are the same
 * point-sized `.doc-page` elements shown in the editor, the PDF is a faithful
 * capture of what the user sees — fonts, positions, logos and all — rather than
 * a re-render that could drift. Each page becomes one full-bleed image on a
 * correctly-sized PDF page.
 *
 * The pages go in as JPEG, not PNG, and that is a performance decision rather
 * than a cosmetic one: jsPDF cannot pass a PNG through, so it re-compresses one
 * with a JavaScript zlib — measured at ~2s of blocked main thread for a single
 * A4 landscape page at 3x, which is most of a "Page Unresponsive" freeze. A
 * JPEG is embedded as-is (DCTDecode) in single-digit milliseconds. Same
 * resolution, same pixels out of html2canvas; only the container changes.
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
    if (i > 0) await yieldToBrowser();
    const canvas = await html2canvas(pageEls[i], {
      scale: 3,
      backgroundColor: "#ffffff",
      useCORS: true,
      logging: false,
    });
    const jpeg = await pageJpegBytes(canvas);
    if (i > 0) pdf.addPage([page.widthPt, page.heightPt], orientation);
    pdf.addImage(jpeg, "JPEG", 0, 0, pw, ph);
    // html2canvas keeps the backing store alive until the element is dropped;
    // an 8-megapixel page is ~32MB, which matters across a multi-page export.
    canvas.width = 0;
    canvas.height = 0;
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
