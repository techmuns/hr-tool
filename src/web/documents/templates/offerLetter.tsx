import type { CSSProperties } from "react";
import { Editable } from "../EditableField";
import { MUNSHOT_M_LOGO } from "../assets";
import type { DocumentTemplate, RenderCtx } from "./types";
import { pngBytesFromDataUri, twip, halfPt } from "./shared";

// Coordinates/fonts from Munshot_Internship_Letter_format.pdf: US Letter,
// Questrial throughout (26pt cover titles, 9.5pt body), fill-in underlines for
// the date, candidate, period and the ID block on the final page.

const abs = (left: number, top: number, extra: CSSProperties = {}): CSSProperties => ({
  position: "absolute",
  left: `${left}pt`,
  top: `${top}pt`,
  ...extra,
});

const Q = '"Questrial", "Segoe UI", sans-serif';

const blank = (w: number): CSSProperties => ({
  display: "inline-block",
  minWidth: `${w}pt`,
  borderBottom: "1.4px solid #000",
  lineHeight: 1.1,
});

function cover(ctx: RenderCtx) {
  return (
    <>
      <img src={MUNSHOT_M_LOGO} alt="Munshot" style={abs(228, 176, { width: "158pt", height: "auto" })} />
      <div style={abs(81, 342, { width: "472pt", borderTop: "0.75pt solid #000" })} />
      <Editable ctx={ctx} id="company_name" style={abs(72, 356, { fontFamily: Q, fontSize: "26pt" })} />
      <Editable ctx={ctx} id="doc_title" style={abs(72, 395, { fontFamily: Q, fontSize: "26pt" })} />
      <div style={abs(72, 435, { fontFamily: Q, fontSize: "12pt" })}>From</div>
      <Editable ctx={ctx} id="company_legal" style={abs(72, 459, { fontFamily: Q, fontSize: "12pt" })} />
      <div style={abs(81, 488, { width: "472pt", borderTop: "0.75pt solid #000" })} />
      <Editable
        ctx={ctx}
        id="locations"
        style={abs(0, 605, { width: "100%", textAlign: "center", fontFamily: Q, fontSize: "12pt" })}
      />
    </>
  );
}

function body(ctx: RenderCtx) {
  const col: CSSProperties = { width: "481pt", fontFamily: Q, fontSize: "9.5pt", color: "#000" };
  return (
    <>
      <div style={abs(0, 143, { width: "100%", textAlign: "center", fontFamily: Q, fontSize: "13.6pt" })}>
        Internship Letter
      </div>

      <div style={abs(72, 228, { fontFamily: Q, fontSize: "9.5pt" })}>
        Date: <Editable ctx={ctx} id="letter_date" style={blank(130)} />
      </div>

      <div style={abs(72, 291, { fontFamily: Q, fontSize: "9.5pt" })}>
        Dear <Editable ctx={ctx} id="candidate_name" style={blank(150)} /> ( Candidate),
      </div>

      <div style={abs(72, 313, { ...col, textAlign: "justify", lineHeight: "11.4pt" })}>
        We would like to congratulate you on being selected for the internship at Munshot Technologies Pvt Ltd. Your
        internship is scheduled from the period of <Editable ctx={ctx} id="internship_period" style={blank(150)} /> for a
        period of 6 months (and extended based on performance) if all goes well.
      </div>

      <div style={abs(72, 381, { ...col, textAlign: "justify", lineHeight: "11.4pt" })}>
        You will also be offered a full-time internship and if the internship is successful, you would be awarded with a
        certificate of recognition and experience and a recommendation letter for your job. You may also get a pre
        placement offer.
      </div>

      <div style={abs(72, 428, { ...col, lineHeight: "11.4pt" })}>
        Your present stipend for the internship period would be <Editable ctx={ctx} id="stipend" /> INR monthly and you
        would be reporting directly either <Editable ctx={ctx} id="reporting_line" />.
      </div>

      <div style={abs(72, 460, { ...col, textAlign: "justify", lineHeight: "11.4pt" })}>
        During the course of this internship, we kindly ask that you do not take up any other internship or job at the
        same time. This ensures that you can focus fully on learning and contributing here, and helps us provide you with
        the best possible experience. Please note that if this condition is not respected, the internship will be
        discontinued and any stipend received would need to be returned.
      </div>

      <div style={abs(72, 511, { ...col, textAlign: "justify", lineHeight: "11.4pt" })}>
        During your internship you would be assigned tasks and projects that improve your personal and professional skill
        set and therefore you would be expected to put your best efforts in executing the assignments given to you.
        During the internship you will adhere to all of the companies terms and conditions as stated in the general
        employee handbook/agreement. You may ask for a copy of the same during your internship.
      </div>

      <div style={abs(72, 574, { fontFamily: Q, fontSize: "9.5pt" })}>Congratulations and Best Wishes</div>

      <div style={abs(72, 614, { width: "129pt", borderTop: "1.6px solid #000" })} />
      <div style={abs(72, 616, { fontFamily: Q, fontSize: "9.5pt" })}>Signature of the Candidate</div>
    </>
  );
}

function idPage(ctx: RenderCtx) {
  const line: CSSProperties = { fontFamily: Q, fontSize: "9.5pt" };
  return (
    <>
      <div style={abs(72, 167, line)}>
        Adhar number / ID number - <Editable ctx={ctx} id="id_number" style={blank(360)} />
      </div>
      <div style={abs(73, 211, line)}>
        Permanent Address in ID: <Editable ctx={ctx} id="permanent_address" style={blank(360)} />
      </div>
      <div style={abs(73, 263, line)}>
        Mobile Number : <Editable ctx={ctx} id="mobile" style={blank(340)} />
      </div>
      <div style={abs(73, 301, line)}>
        Email ID : <Editable ctx={ctx} id="email" style={blank(340)} />
      </div>
      <div style={abs(73, 382, { width: "129pt", borderTop: "1.6px solid #000" })} />
    </>
  );
}

function render(page: number, ctx: RenderCtx) {
  if (page === 0) return cover(ctx);
  if (page === 1) return body(ctx);
  return idPage(ctx);
}

const DEFAULTS: Record<string, string> = {
  company_name: "MUNSHOT",
  doc_title: "Internship Offer",
  company_legal: "Munshot Technologies Private Limited",
  locations: "India, Singapore",
  letter_date: "",
  candidate_name: "",
  internship_period: "",
  stipend: "10000",
  reporting_line: "Chiraag Kapil, CEO and Founder or Nitish Chhabra, CTO and Founder",
  id_number: "",
  permanent_address: "",
  mobile: "",
  email: "",
};

function buildDocx(data: Record<string, string>, d: typeof import("docx")): import("docx").Document {
  const v = (id: string) => data[id] ?? DEFAULTS[id] ?? "";
  const { Document, Paragraph, TextRun, ImageRun, AlignmentType, BorderStyle } = d;
  const fill = (val: string, n: number) => (val ? `${val} ` : "") + "_".repeat(n);
  const q = (text: string, opts: { size?: number; bold?: boolean } = {}) =>
    new TextRun({ text, font: "Questrial", size: halfPt(opts.size ?? 9.5), bold: opts.bold });
  const para = (children: import("docx").TextRun[], opts: { align?: (typeof AlignmentType)[keyof typeof AlignmentType]; after?: number } = {}) =>
    new Paragraph({ alignment: opts.align ?? AlignmentType.JUSTIFIED, spacing: { after: opts.after ?? 200, line: 240 }, children });
  const rule = () =>
    new Paragraph({ spacing: { after: 200 }, border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "000000", space: 1 } }, children: [q("")] });

  return new Document({
    sections: [
      {
        properties: { page: { size: { width: twip(612), height: twip(792) }, margin: { top: twip(72), bottom: twip(72), left: twip(72), right: twip(72) } } },
        children: [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { before: 1600, after: 200 },
            children: [new ImageRun({ type: "png", data: pngBytesFromDataUri(MUNSHOT_M_LOGO), transformation: { width: 190, height: 181 } })],
          }),
          rule(),
          new Paragraph({ spacing: { after: 40 }, children: [q(v("company_name"), { size: 26 })] }),
          new Paragraph({ spacing: { after: 120 }, children: [q(v("doc_title"), { size: 26 })] }),
          new Paragraph({ spacing: { after: 40 }, children: [q("From", { size: 12 })] }),
          new Paragraph({ spacing: { after: 120 }, children: [q(v("company_legal"), { size: 12 })] }),
          rule(),
          new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 1600 }, children: [q(v("locations"), { size: 12 })] }),

          new Paragraph({ pageBreakBefore: true, alignment: AlignmentType.CENTER, spacing: { after: 500 }, children: [q("Internship Letter", { size: 13.6 })] }),
          new Paragraph({ spacing: { after: 500 }, children: [q(`Date: ${fill(v("letter_date"), 30)}`)] }),
          new Paragraph({ spacing: { after: 200 }, children: [q(`Dear ${fill(v("candidate_name"), 30)}  ( Candidate),`)] }),
          para([
            q("We would like to congratulate you on being selected for the internship at Munshot Technologies Pvt Ltd. Your internship is scheduled from the period of "),
            q(fill(v("internship_period"), 24)),
            q(" for a period of 6 months (and extended based on performance) if all goes well."),
          ]),
          para([q("You will also be offered a full-time internship and if the internship is successful, you would be awarded with a certificate of recognition and experience and a recommendation letter for your job. You may also get a pre placement offer.")]),
          para([q(`Your present stipend for the internship period would be ${v("stipend")} INR monthly and you would be reporting directly either ${v("reporting_line")}.`)], { align: AlignmentType.LEFT }),
          para([q("During the course of this internship, we kindly ask that you do not take up any other internship or job at the same time. This ensures that you can focus fully on learning and contributing here, and helps us provide you with the best possible experience. Please note that if this condition is not respected, the internship will be discontinued and any stipend received would need to be returned.")]),
          para([q("During your internship you would be assigned tasks and projects that improve your personal and professional skill set and therefore you would be expected to put your best efforts in executing the assignments given to you. During the internship you will adhere to all of the companies terms and conditions as stated in the general employee handbook/agreement. You may ask for a copy of the same during your internship.")]),
          new Paragraph({ spacing: { before: 200, after: 700 }, children: [q("Congratulations and Best Wishes")] }),
          new Paragraph({ border: { top: { style: BorderStyle.SINGLE, size: 8, color: "000000", space: 1 } }, spacing: { after: 0 }, children: [q("Signature of the Candidate")] }),

          new Paragraph({ pageBreakBefore: true, spacing: { before: 800, after: 400 }, children: [q(`Adhar number / ID number - ${fill(v("id_number"), 60)}`)] }),
          new Paragraph({ spacing: { after: 400 }, children: [q(`Permanent Address in ID: ${fill(v("permanent_address"), 60)}`)] }),
          new Paragraph({ spacing: { after: 400 }, children: [q(`Mobile Number : ${fill(v("mobile"), 55)}`)] }),
          new Paragraph({ spacing: { after: 400 }, children: [q(`Email ID : ${fill(v("email"), 55)}`)] }),
        ],
      },
    ],
  });
}

export const offerLetterTemplate: DocumentTemplate = {
  id: "offer_letter",
  name: "Internship Offer Letter",
  category: "Letter",
  description: "Three-page Munshot internship offer with a cover page and ID block.",
  page: { widthPt: 612, heightPt: 792, label: "Letter", orientation: "portrait" },
  pageCount: 3,
  fields: [
    { id: "doc_title", label: "Cover title", type: "text" },
    { id: "company_name", label: "Cover company name", type: "text" },
    { id: "company_legal", label: "Legal entity", type: "text" },
    { id: "locations", label: "Locations", type: "text" },
    { id: "letter_date", label: "Date", type: "text", required: true },
    { id: "candidate_name", label: "Candidate name", type: "text", required: true },
    { id: "internship_period", label: "Internship period (from)", type: "text", placeholder: "e.g. 1 Sep 2026", required: true },
    { id: "stipend", label: "Monthly stipend (INR)", type: "text" },
    { id: "reporting_line", label: "Reporting to", type: "multiline" },
    { id: "id_number", label: "Aadhaar / ID number", type: "text" },
    { id: "permanent_address", label: "Permanent address", type: "multiline" },
    { id: "mobile", label: "Mobile number", type: "text" },
    { id: "email", label: "Email ID", type: "text" },
  ],
  defaults: DEFAULTS,
  renderPage: render,
  buildDocx,
  recipientOf: (data) => data.candidate_name || "",
  titleOf: (data) => `Offer Letter — ${data.candidate_name || "Candidate"}`,
};
