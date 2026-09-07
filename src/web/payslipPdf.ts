import { payslipModel, rupeesPlain, PAYSLIP_COLORS } from "../worker/payslip";
import type { PayslipField, PayslipRow } from "../worker/payslip";

const { INK, MUTED } = PAYSLIP_COLORS;
const BORDER = "#c2c6cc";
const FILL = "#f2f3f5";

const MARGIN = 12;
const W = 210 - 2 * MARGIN; // A4 width minus both margins

interface CellOpts {
  bold?: boolean;
  size?: number;
  color?: string;
  align?: "left" | "right" | "center";
  fill?: string;
}

/**
 * "Download PDF" for a single payslip — the same bordered salary slip that goes
 * out by email (payslipHtml in ../worker/payslip.ts), redrawn with jsPDF since
 * it has no HTML renderer. Both consume payslipModel() so the two never drift:
 * the company name/address header, the titled slip line, the employee grid, the
 * earnings/deductions table with A/B/net-pay rows and the amount in words, and
 * the footer note. Amounts use plain numbers (no glyph) under an "Amount (Rs.)"
 * header, since jsPDF's built-in fonts can't render the rupee sign.
 */
export async function exportPayslipPdf(r: PayslipRow): Promise<void> {
  // jsPDF is heavy (~hundreds of KB) and only needed on a download click, so it
  // is code-split out of the main bundle and loaded on demand here.
  const { jsPDF } = await import("jspdf");
  const m = payslipModel(r);
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const X0 = MARGIN;
  doc.setLineWidth(0.2);

  const box = (x: number, y: number, w: number, h: number, fill?: string) => {
    if (fill) {
      doc.setFillColor(fill);
      doc.rect(x, y, w, h, "F");
    }
    doc.setDrawColor(BORDER);
    doc.rect(x, y, w, h, "S");
  };

  // A bordered cell with a single vertically-centred string.
  const cell = (x: number, y: number, w: number, h: number, s: string, o: CellOpts = {}) => {
    box(x, y, w, h, o.fill);
    if (!s) return;
    const p = 2.5;
    doc.setFont("helvetica", o.bold ? "bold" : "normal");
    doc.setFontSize(o.size ?? 9);
    doc.setTextColor(o.color ?? INK);
    const align = o.align ?? "left";
    const tx = align === "right" ? x + w - p : align === "center" ? x + w / 2 : x + p;
    doc.text(s, tx, y + h / 2, { align, baseline: "middle" });
  };

  // A grid cell reading "Label : value" — label muted, value bold.
  const fieldCell = (x: number, y: number, w: number, h: number, f?: PayslipField) => {
    box(x, y, w, h);
    if (!f) return;
    const p = 2.5;
    const cy = y + h / 2;
    const labelStr = `${f.label} : `;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.6);
    doc.setTextColor(MUTED);
    doc.text(labelStr, x + p, cy, { baseline: "middle" });
    const lw = doc.getTextWidth(labelStr);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(INK);
    doc.text(f.value, x + p + lw, cy, { baseline: "middle" });
  };

  let y = 14;

  // --- Header: company name over its address lines ---------------------------
  const subLines = [
    m.company.address ? `Office Address : ${m.company.address}` : "",
    m.company.businessUnit ? `Business Unit : ${m.company.businessUnit}` : "",
  ].filter(Boolean);
  // Sized to the text it actually holds. Both address lines are optional (blank
  // constants in ../worker/brand.ts drop them, as the HTML card does), and the
  // fixed height this band used to have was the logo's — without it, a fixed
  // height would leave the company name floating over empty space.
  const headH = 12 + subLines.length * 5;
  const infoX = X0 + 4;
  box(X0, y, W, headH);

  let infoY = y + 8;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(INK);
  doc.text(m.company.name, infoX, infoY);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(MUTED);
  for (const line of subLines) {
    infoY += 5;
    doc.text(line, infoX, infoY);
  }
  y += headH;

  // --- Title -----------------------------------------------------------------
  const titleH = 9;
  cell(X0, y, W, titleH, m.title, { size: 12, align: "center" });
  y += titleH;

  // --- Employee grid: two label:value pairs per row --------------------------
  const gridH = 8;
  const colW = W / 2;
  for (let i = 0; i < m.fields.length; i += 2) {
    fieldCell(X0, y, colW, gridH, m.fields[i]);
    fieldCell(X0 + colW, y, colW, gridH, m.fields[i + 1]);
    y += gridH;
  }

  // --- Earnings / Deductions table (4 columns) -------------------------------
  const w1 = W * 0.3;
  const w2 = W * 0.2;
  const w3 = W * 0.3;
  const w4 = W * 0.2;
  const cx = [X0, X0 + w1, X0 + w1 + w2, X0 + w1 + w2 + w3];
  const cw = [w1, w2, w3, w4];

  const hdrH = 8;
  cell(cx[0], y, w1 + w2, hdrH, "Earnings", { bold: true, align: "center", fill: FILL });
  cell(cx[2], y, w3 + w4, hdrH, "Deductions", { bold: true, align: "center", fill: FILL });
  y += hdrH;

  const subH = 7;
  cell(cx[0], y, cw[0], subH, "Components", { bold: true, size: 8, color: MUTED, fill: FILL });
  cell(cx[1], y, cw[1], subH, "Amount (Rs.)", { bold: true, size: 8, color: MUTED, align: "right", fill: FILL });
  cell(cx[2], y, cw[2], subH, "Common Deductions", { bold: true, size: 8, color: MUTED, fill: FILL });
  cell(cx[3], y, cw[3], subH, "Amount (Rs.)", { bold: true, size: 8, color: MUTED, align: "right", fill: FILL });
  y += subH;

  const rowH = 7;
  const rows = Math.max(m.earnings.length, m.deductions.length);
  for (let i = 0; i < rows; i++) {
    const e = m.earnings[i];
    const d = m.deductions[i];
    cell(cx[0], y, cw[0], rowH, e ? e.label : "");
    cell(cx[1], y, cw[1], rowH, e ? rupeesPlain(e.amount) : "", { align: "right" });
    cell(cx[2], y, cw[2], rowH, d ? d.label : "");
    cell(cx[3], y, cw[3], rowH, d ? rupeesPlain(d.amount) : "", { align: "right" });
    y += rowH;
  }

  // Gross Earning (A) | Total Deductions (B)
  cell(cx[0], y, cw[0], rowH, "Gross Earning (A)", { bold: true });
  cell(cx[1], y, cw[1], rowH, rupeesPlain(m.gross), { bold: true, align: "right" });
  cell(cx[2], y, cw[2], rowH, "Total Deductions (B)", { bold: true });
  cell(cx[3], y, cw[3], rowH, rupeesPlain(m.totalDeductions), { bold: true, align: "right" });
  y += rowH;

  // Net Pay (A - B) | (empty)
  cell(cx[0], y, cw[0], rowH, "Net Pay (A - B)", { bold: true });
  cell(cx[1], y, cw[1], rowH, rupeesPlain(m.netPay), { bold: true, align: "right" });
  box(cx[2], y, cw[2] + cw[3], rowH);
  y += rowH;

  // Total Pay | amount in words (may wrap, so this row grows to fit)
  const wordsW = cw[2] + cw[3];
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  const wordLines = doc.splitTextToSize(m.amountInWords, wordsW - 5) as string[];
  const wordsH = Math.max(rowH, wordLines.length * 4 + 3);
  cell(cx[0], y, cw[0], wordsH, "Total Pay", { bold: true });
  cell(cx[1], y, cw[1], wordsH, rupeesPlain(m.netPay), { bold: true, align: "right" });
  box(cx[2], y, wordsW, wordsH);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(INK);
  const firstLineY = y + wordsH / 2 - ((wordLines.length - 1) * 4) / 2;
  doc.text(wordLines, cx[2] + wordsW - 2.5, firstLineY, { align: "right", baseline: "middle" });
  y += wordsH;

  // --- Note ------------------------------------------------------------------
  const noteH = 9;
  cell(X0, y, W, noteH, `Note: ${m.note}`, { size: 8.5, color: MUTED, align: "center" });

  doc.save(`payslip-${m.company.name}-${r.employee_name.replace(/[^\w-]+/g, "_")}-${r.period}.pdf`);
}
