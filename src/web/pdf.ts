import { jsPDF } from "jspdf";
import { formatDate } from "./date";
import { formatRupeesPlain } from "./money";
import { cycleLabel } from "../worker/payslip";
import type { PayrollWithName } from "./types";

interface Column {
  header: string;
  width: number;
  align?: "left" | "right";
  value: (row: PayrollWithName) => string;
}

const COLUMNS: Column[] = [
  { header: "Employee", width: 42, value: (r) => r.employee_name },
  { header: "Base Salary", width: 34, align: "right", value: (r) => formatRupeesPlain(r.base_salary) },
  { header: "Reimbursements", width: 36, align: "right", value: (r) => formatRupeesPlain(r.reimbursements) },
  { header: "Deductions", width: 32, align: "right", value: (r) => formatRupeesPlain(r.deductions) },
  { header: "Net Pay", width: 34, align: "right", value: (r) => formatRupeesPlain(r.net_pay) },
];

const MARGIN = 14;
const ROW_HEIGHT = 8;

export function exportPayrollPdf(period: string, rows: PayrollWithName[]) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageHeight = doc.internal.pageSize.getHeight();

  doc.setFontSize(14);
  // Label the cycle the period actually bills (11th–10th), not the bare month.
  doc.text(`Payroll — ${cycleLabel(period)}`, MARGIN, 18);
  doc.setFontSize(9);
  doc.setTextColor(120);
  doc.text(`Generated ${formatDate(new Date().toISOString())} IST`, MARGIN, 24);
  doc.setTextColor(0);

  let y = 34;
  let x = MARGIN;

  function drawHeaderRow() {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    x = MARGIN;
    for (const col of COLUMNS) {
      const textX = col.align === "right" ? x + col.width - 2 : x;
      doc.text(col.header, textX, y, { align: col.align === "right" ? "right" : "left" });
      x += col.width;
    }
    y += 4;
    doc.setDrawColor(200);
    doc.line(MARGIN, y, MARGIN + COLUMNS.reduce((sum, c) => sum + c.width, 0), y);
    y += 6;
    doc.setFont("helvetica", "normal");
  }

  drawHeaderRow();

  let totalBase = 0;
  let totalReimbursements = 0;
  let totalDeductions = 0;
  let totalNet = 0;

  for (const row of rows) {
    if (y + ROW_HEIGHT > pageHeight - 20) {
      doc.addPage();
      y = 24;
      drawHeaderRow();
    }
    x = MARGIN;
    for (const col of COLUMNS) {
      const textX = col.align === "right" ? x + col.width - 2 : x;
      doc.text(col.value(row), textX, y, { align: col.align === "right" ? "right" : "left" });
      x += col.width;
    }
    y += ROW_HEIGHT;

    totalBase += row.base_salary;
    totalReimbursements += row.reimbursements;
    totalDeductions += row.deductions;
    totalNet += row.net_pay;
  }

  y += 2;
  doc.setDrawColor(200);
  doc.line(MARGIN, y, MARGIN + COLUMNS.reduce((sum, c) => sum + c.width, 0), y);
  y += 6;
  doc.setFont("helvetica", "bold");
  x = MARGIN;
  const totalsRow: Record<string, string> = {
    Employee: "Total",
    "Base Salary": formatRupeesPlain(totalBase),
    Reimbursements: formatRupeesPlain(totalReimbursements),
    Deductions: formatRupeesPlain(totalDeductions),
    "Net Pay": formatRupeesPlain(totalNet),
  };
  for (const col of COLUMNS) {
    const textX = col.align === "right" ? x + col.width - 2 : x;
    doc.text(totalsRow[col.header], textX, y, { align: col.align === "right" ? "right" : "left" });
    x += col.width;
  }

  doc.save(`payroll-${period}.pdf`);
}
