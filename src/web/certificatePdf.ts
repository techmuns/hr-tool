import { jsPDF } from "jspdf";
import { formatDate } from "./date";
import { COMPANY_NAME, BRAND_COLORS } from "../worker/brand";
import { CERTIFICATE_TYPE_LABEL } from "../worker/certificate";
import { MUNSHOT_LOGO_DATA_URI } from "../worker/munshotLogo";
import type { Certificate } from "../worker/types";

const { NAVY, GOLD, GOLD_DEEP, GOLD_TINT, INK, MUTED, BORDER } = BRAND_COLORS;

const MARGIN = 20;
const CARD_W = 210 - 2 * MARGIN; // A4 width minus both margins
const INSET = 6;

/**
 * "Download PDF" for a certificate — same visual language and same source of
 * truth as certificateHtml (../worker/certificate.ts): the letter body stored
 * at issue time, split into paragraphs the same way (blank line = new
 * paragraph), so a downloaded copy reads identically to what was emailed.
 *
 * Full A4, flat rectangles, no rounded corners or translucent fills — this is
 * meant to be printed or attached to an application, and those don't survive
 * print anyway. See payslipPdf.ts for the same reasoning applied to payslips.
 */
export function exportCertificatePdf(cert: Certificate): void {
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
  doc.text(CERTIFICATE_TYPE_LABEL[cert.type], textX, y + 19);

  const badgeText = `ISSUED ${formatDate(cert.created_at)}`;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  const badgeW = doc.getTextWidth(badgeText) + 8;
  const badgeY = y + 23;
  doc.setFillColor(GOLD_DEEP);
  doc.roundedRect(textX, badgeY, badgeW, 6.5, 3.25, 3.25, "F");
  doc.setTextColor(GOLD_TINT);
  doc.text(badgeText, textX + 4, badgeY + 4.5);

  y += headerH + 14;

  // --- Letter body -----------------------------------------------------------
  const textW = CARD_W - 2 * INSET;
  const lineHeight = 5.5;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.setTextColor(INK);
  doc.text("To Whomsoever It May Concern,", MARGIN + INSET, y);
  y += lineHeight * 2;

  // A page break floor, well short of the actual page bottom: leaves room for
  // the "Sincerely," / signature / footer that always follows the last
  // paragraph, so an unusually long letter can't run those off the page.
  const BREAK_AT = 250;

  // Same paragraph split as certificateHtml: blank line separates paragraphs.
  const paragraphs = cert.body
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
  for (const para of paragraphs) {
    const lines: string[] = doc.splitTextToSize(para, textW);
    for (const line of lines) {
      if (y > BREAK_AT) {
        doc.addPage();
        y = MARGIN;
      }
      doc.text(line, MARGIN + INSET, y);
      y += lineHeight;
    }
    y += lineHeight * 0.7; // paragraph gap
  }

  y += lineHeight;
  doc.text("Sincerely,", MARGIN + INSET, y);
  y += lineHeight * 3;
  doc.setFont("helvetica", "bold");
  doc.text(COMPANY_NAME, MARGIN + INSET, y);

  // --- Footer, pinned to the bottom of the page rather than following the
  // letter — a short LOR shouldn't leave the footer floating awkwardly high
  // on an otherwise empty page. ------------------------------------------
  const footerY = 297 - MARGIN;
  doc.setDrawColor(BORDER);
  doc.setLineWidth(0.3);
  doc.line(MARGIN + INSET, footerY - 6, MARGIN + CARD_W - INSET, footerY - 6);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(MUTED);
  doc.text("This is a system generated certificate.", MARGIN + INSET, footerY);

  const typeSlug = cert.type === "leaving" ? "leaving-certificate" : "letter-of-recommendation";
  doc.save(`${typeSlug}-${cert.employee_name.replace(/[^\w-]+/g, "_")}.pdf`);
}
