import { jsPDF } from "jspdf";
import { formatDate } from "./date";
import { formatRupeesPlain } from "./money";
import { COMPANY_NAME, PAYSLIP_COLORS, cycleLabel, payDueDate } from "../worker/payslip";
import { MUNSHOT_LOGO_DATA_URI } from "../worker/munshotLogo";
import type { PayslipRow } from "../worker/payslip";

const { NAVY, GOLD, GOLD_DEEP, GOLD_TINT, INK, MUTED, BORDER, DEDUCT } = PAYSLIP_COLORS;

const MARGIN = 20;
const CARD_W = 210 - 2 * MARGIN; // A4 width minus both margins
const INSET = 6; // left/right padding inside the card, mirroring the email card's own gutter

/**
 * "Download PDF" for a single payslip — the same card that goes out by email
 * (payslipHtml in ../worker/payslip.ts), redrawn with jsPDF's vector drawing
 * calls instead of HTML, since jsPDF has no HTML renderer of its own. Same
 * content, same order, same colors (PAYSLIP_COLORS is the one place those are
 * defined) and the same conditional lines — reimbursements only if any,
 * leave/manual deductions only if any, "No deductions this period" otherwise —
 * so a downloaded copy never disagrees with what was emailed.
 *
 * Laid out on a full A4 page with generous margins rather than packed
 * edge-to-edge: this is meant to be printed or attached to a loan/visa
 * application, and corners this simple (flat rectangles, no rounding) print
 * cleanly on plain paper where the emailed HTML card's rounded corners and
 * translucent badge fill would not survive rendering, let alone add anything.
 */
export function exportPayslipPdf(r: PayslipRow): void {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  doc.setFont("helvetica", "normal");
  let y = MARGIN;

  // --- Header --------------------------------------------------------------
  const headerH = 34;
  doc.setFillColor(NAVY);
  doc.rect(MARGIN, y, CARD_W, headerH, "F");

  doc.addImage(MUNSHOT_LOGO_DATA_URI, "PNG", MARGIN + INSET, y + 7, 13, 13);

  const textX = MARGIN + INSET + 18;
  doc.setTextColor(GOLD);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text(COMPANY_NAME, textX, y + 13);

  doc.setTextColor("#c9bfa3");
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(`Monthly Payslip · ${cycleLabel(r.period)}`, textX, y + 19);

  const badgeText = (r.paid_at ? `PAID ${formatDate(r.paid_at)}` : `DUE ${formatDate(payDueDate(r.period))}`).toUpperCase();
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  const badgeW = doc.getTextWidth(badgeText) + 8;
  const badgeY = y + 23;
  doc.setFillColor(GOLD_DEEP);
  doc.roundedRect(textX, badgeY, badgeW, 6.5, 3.25, 3.25, "F");
  doc.setTextColor(GOLD_TINT);
  doc.text(badgeText, textX + 4, badgeY + 4.5);

  y += headerH + 8;

  // --- Employee meta ---------------------------------------------------------
  function metaRow(label: string, value: string) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(MUTED);
    doc.text(label.toUpperCase(), MARGIN + INSET, y);
    doc.setFontSize(10);
    doc.setTextColor(INK);
    doc.text(value, MARGIN + CARD_W - INSET, y, { align: "right" });
    y += 6.5;
  }
  metaRow("Employee", r.employee_name);
  metaRow("Designation", r.job_title || "—");
  metaRow("Worked Days", String(r.paid_days));
  y += 3;

  // --- Earnings / Deductions tables ------------------------------------------
  function sectionHeader(title: string) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(MUTED);
    doc.text(title.toUpperCase(), MARGIN + INSET, y);
    doc.setFontSize(8);
    doc.text("AMOUNT", MARGIN + CARD_W - INSET, y, { align: "right" });
    y += 2;
    doc.setDrawColor(BORDER);
    doc.setLineWidth(0.5);
    doc.line(MARGIN + INSET, y, MARGIN + CARD_W - INSET, y);
    y += 6;
  }

  function lineRow(label: string, amount: number, opts: { total?: boolean; color?: string } = {}) {
    if (opts.total) {
      doc.setDrawColor(BORDER);
      doc.setLineWidth(0.3);
      doc.line(MARGIN + INSET, y - 4, MARGIN + CARD_W - INSET, y - 4);
    }
    doc.setFont("helvetica", opts.total ? "bold" : "normal");
    doc.setFontSize(10);
    doc.setTextColor(opts.color ?? INK);
    doc.text(label, MARGIN + INSET, y);
    doc.text(formatRupeesPlain(amount), MARGIN + CARD_W - INSET, y, { align: "right" });
    y += 7;
  }

  sectionHeader("Earnings");
  lineRow("Basic Pay", r.base_salary);
  // Only list reimbursements when there are any — an empty ₹0.00 line is noise.
  if (r.reimbursements > 0) lineRow("Reimbursements", r.reimbursements);
  lineRow("Total Earnings", r.base_salary + r.reimbursements, { total: true });
  y += 4;

  sectionHeader("Deductions");
  // Leave and manually-booked deductions are listed apart: seeing one lump sum
  // labelled "unpaid leave" when half of it was an advance recovery is exactly
  // the sort of thing that turns into a payroll query.
  if (r.deductions > 0) {
    if (r.leave_deductions > 0) {
      lineRow(`Unpaid Leave (${r.unpaid_days} day${r.unpaid_days === 1 ? "" : "s"})`, r.leave_deductions, {
        color: DEDUCT,
      });
    }
    if (r.other_deductions > 0) lineRow("Other Deductions", r.other_deductions, { color: DEDUCT });
    lineRow("Total Deductions", r.deductions, { total: true, color: DEDUCT });
  } else {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(MUTED);
    doc.text("No deductions this period.", MARGIN + INSET, y);
    y += 7;
  }
  y += 6;

  // --- Net pay band ------------------------------------------------------
  const bandH = 18;
  doc.setFillColor(GOLD_TINT);
  doc.rect(MARGIN, y, CARD_W, bandH, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(GOLD_DEEP);
  doc.text("NET PAY", MARGIN + INSET, y + bandH / 2 + 1.2, { baseline: "middle" });
  doc.setFontSize(15);
  doc.text(formatRupeesPlain(r.net_pay), MARGIN + CARD_W - INSET, y + bandH / 2 + 1.5, { align: "right", baseline: "middle" });
  y += bandH + 10;

  // --- Footer ------------------------------------------------------------
  doc.setDrawColor(BORDER);
  doc.setLineWidth(0.3);
  doc.line(MARGIN + INSET, y, MARGIN + CARD_W - INSET, y);
  y += 6;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(MUTED);
  doc.text("This is a system generated payslip.", MARGIN + INSET, y);

  doc.save(`payslip-${r.employee_name.replace(/[^\w-]+/g, "_")}-${r.period}.pdf`);
}
