import type { CSSProperties } from "react";
import { Editable } from "../EditableField";
import { MUNSHOT_M_LOGO } from "../assets";
import type { DocumentTemplate, RenderCtx } from "./types";
import { NAVY, pngBytesFromDataUri, twip, halfPt } from "./shared";

// Coordinates, fonts, sizes and colours below are taken verbatim from the
// source PDF (Janhvi_LOR.pdf): A4 portrait, Radley 26pt navy title, Open Sans
// 12pt justified body, a hairline rule at 159pt and a navy bar along the foot.

const abs = (left: number, top: number, extra: CSSProperties = {}): CSSProperties => ({
  position: "absolute",
  left: `${left}pt`,
  top: `${top}pt`,
  ...extra,
});

const OPEN_SANS = '"Open Sans", "Segoe UI", sans-serif';

function render(_page: number, ctx: RenderCtx) {
  return (
    <>
      {/* Header title — fixed */}
      <div
        style={abs(59.4, 45, {
          fontFamily: '"Radley", Georgia, serif',
          fontSize: "26pt",
          lineHeight: "28.5pt",
          color: NAVY,
        })}
      >
        Letter of
        <br />
        Recommendation
      </div>

      {/* Date — dynamic */}
      <Editable
        ctx={ctx}
        id="letter_date"
        placeholder="Date"
        style={abs(59.4, 115, { fontFamily: OPEN_SANS, fontSize: "11.3pt", color: NAVY })}
      />

      {/* Logo top-right — fixed */}
      <img src={MUNSHOT_M_LOGO} alt="Munshot" style={abs(414, 38, { width: "107pt", height: "auto" })} />

      {/* Divider rule — fixed */}
      <div style={abs(59, 159, { width: "477pt", borderTop: "1px solid #000" })} />

      {/* Body column */}
      <div
        style={abs(59.4, 176, {
          width: "477pt",
          fontFamily: OPEN_SANS,
          fontSize: "12pt",
          color: "#000",
          textAlign: "justify",
          lineHeight: "20.3pt",
        })}
      >
        <div style={{ fontWeight: 700, marginBottom: "16pt" }}>To Whom It May Concern:</div>

        <div style={{ marginBottom: "16pt" }}>
          It is with great pleasure that I write this letter of recommendation for{" "}
          <b>
            <Editable ctx={ctx} id="honorific" placeholder="Ms." /> <Editable ctx={ctx} id="recipient_name" placeholder="Full name" />,
          </b>{" "}
          who served as a <b><Editable ctx={ctx} id="role" placeholder="Role" /></b> at{" "}
          <Editable ctx={ctx} id="company" placeholder="Company" /> from{" "}
          <Editable ctx={ctx} id="start_date" placeholder="start date" /> to{" "}
          <Editable ctx={ctx} id="end_date" placeholder="end date" />.
        </div>

        <Editable ctx={ctx} id="body1" as="div" multiline style={{ marginBottom: "16pt" }} />
        <Editable ctx={ctx} id="body2" as="div" multiline style={{ marginBottom: "2pt" }} />
        <Editable ctx={ctx} id="closing" as="div" multiline style={{ marginBottom: "16pt" }} />

        <div style={{ fontWeight: 700 }}>Sincerely,</div>

        <div style={{ marginTop: "52pt", lineHeight: "18pt" }}>
          <Editable ctx={ctx} id="signer_name" as="div" placeholder="Signatory" />
          <Editable ctx={ctx} id="signer_title" as="div" placeholder="Designation" />
          <Editable ctx={ctx} id="company" as="div" placeholder="Company" />
        </div>
      </div>

      {/* Navy footer bar — fixed */}
      <div style={{ position: "absolute", left: 0, bottom: 0, width: "100%", height: "14pt", background: NAVY }} />
    </>
  );
}

const DEFAULTS: Record<string, string> = {
  letter_date: "21 May, 2026",
  honorific: "Ms.",
  recipient_name: "Janhvi Deshmukh",
  role: "Junior AI Intern",
  company: "Munshot",
  start_date: "29th August 2025",
  end_date: "21st May 2026",
  body1:
    "During her tenure with us, Ms. Deshmukh demonstrated a strong aptitude for artificial intelligence and a commendable willingness to learn. She consistently approached her responsibilities with professionalism, dedication, and a positive attitude. Her contributions to the team were valued, and she proved to be a reliable and enthusiastic member of the organization.",
  body2:
    "We found her to be a technically capable individual with good communication skills and the ability to collaborate effectively within a team environment. She has shown genuine potential in the field of AI, and we have no doubt that she will bring the same commitment and enthusiasm to her future endeavors.",
  closing:
    "We wish Ms. Janhvi Deshmukh the very best in all her future pursuits and recommend her without reservation for any role or opportunity she chooses to pursue.",
  signer_name: "Chiraag Kapil",
  signer_title: "CEO & Founder",
};

function buildDocx(data: Record<string, string>, d: typeof import("docx")): import("docx").Document {
  const v = (id: string) => data[id] ?? DEFAULTS[id] ?? "";
  const {
    Document,
    Paragraph,
    TextRun,
    ImageRun,
    AlignmentType,
    BorderStyle,
    HeadingLevel,
    Header,
    Footer,
    HorizontalPositionAlign,
    VerticalPositionAlign,
    HorizontalPositionRelativeFrom,
    VerticalPositionRelativeFrom,
  } = d;

  const bodyRun = (text: string, bold = false) =>
    new TextRun({ text, bold, font: "Open Sans", size: halfPt(12) });

  const para = (children: import("docx").TextRun[], spaceAfter = 240) =>
    new Paragraph({ alignment: AlignmentType.JUSTIFIED, spacing: { after: spaceAfter, line: 300 }, children });

  const logo = new Paragraph({
    children: [
      new ImageRun({
        type: "png",
        data: pngBytesFromDataUri(MUNSHOT_M_LOGO),
        transformation: { width: 130, height: 124 },
        floating: {
          horizontalPosition: { relative: HorizontalPositionRelativeFrom.PAGE, align: HorizontalPositionAlign.RIGHT },
          verticalPosition: { relative: VerticalPositionRelativeFrom.PAGE, offset: 12700 * 38 },
          allowOverlap: true,
          behindDocument: false,
        },
      }),
    ],
  });

  return new Document({
    sections: [
      {
        properties: {
          page: {
            size: { width: twip(595.5), height: twip(842) },
            margin: { top: twip(40), bottom: twip(40), left: twip(59), right: twip(59) },
          },
        },
        headers: { default: new Header({ children: [logo] }) },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                shading: { type: d.ShadingType.SOLID, color: "284B70", fill: "284B70" },
                spacing: { before: 0, after: 0 },
                children: [new TextRun({ text: "", size: 6 })],
              }),
            ],
          }),
        },
        children: [
          new Paragraph({
            heading: HeadingLevel.TITLE,
            spacing: { after: 60, line: 320 },
            children: [
              new TextRun({ text: "Letter of", font: "Radley", size: halfPt(26), color: "284B70" }),
              new TextRun({ text: "Recommendation", font: "Radley", size: halfPt(26), color: "284B70", break: 1 }),
            ],
          }),
          new Paragraph({
            spacing: { after: 200 },
            children: [new TextRun({ text: v("letter_date"), font: "Open Sans", size: halfPt(11.3), color: "284B70" })],
            border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "000000", space: 8 } },
          }),
          new Paragraph({ spacing: { after: 200 }, children: [bodyRun("To Whom It May Concern:", true)] }),
          para([
            bodyRun("It is with great pleasure that I write this letter of recommendation for "),
            bodyRun(`${v("honorific")} ${v("recipient_name")},`, true),
            bodyRun(" who served as a "),
            bodyRun(v("role"), true),
            bodyRun(` at ${v("company")} from ${v("start_date")} to ${v("end_date")}.`),
          ]),
          para([bodyRun(v("body1"))]),
          para([bodyRun(v("body2"))], 40),
          para([bodyRun(v("closing"))]),
          new Paragraph({ spacing: { after: 700 }, children: [bodyRun("Sincerely,", true)] }),
          new Paragraph({ spacing: { after: 0, line: 260 }, children: [bodyRun(v("signer_name"))] }),
          new Paragraph({ spacing: { after: 0, line: 260 }, children: [bodyRun(v("signer_title"))] }),
          new Paragraph({ spacing: { after: 0, line: 260 }, children: [bodyRun(v("company"))] }),
        ],
      },
    ],
  });
}

export const lorTemplate: DocumentTemplate = {
  id: "lor",
  name: "Letter of Recommendation",
  category: "Recommendation",
  description: "A4 portrait recommendation letter on the Munshot letterhead.",
  page: { widthPt: 595.5, heightPt: 842, label: "A4", orientation: "portrait" },
  pageCount: 1,
  fields: [
    { id: "letter_date", label: "Letter date", type: "text", placeholder: "21 May, 2026" },
    { id: "honorific", label: "Honorific", type: "text", placeholder: "Ms. / Mr.", softLimit: 6 },
    { id: "recipient_name", label: "Candidate name", type: "text", required: true },
    { id: "role", label: "Role / designation", type: "text", required: true },
    { id: "company", label: "Company", type: "text" },
    { id: "start_date", label: "Start date", type: "text", placeholder: "29th August 2025" },
    { id: "end_date", label: "End date", type: "text", placeholder: "21st May 2026" },
    { id: "body1", label: "Paragraph 1 — conduct & attitude", type: "multiline" },
    { id: "body2", label: "Paragraph 2 — skills & potential", type: "multiline" },
    { id: "closing", label: "Closing paragraph", type: "multiline" },
    { id: "signer_name", label: "Signatory name", type: "text" },
    { id: "signer_title", label: "Signatory designation", type: "text" },
  ],
  defaults: DEFAULTS,
  renderPage: render,
  buildDocx,
  recipientOf: (data) => data.recipient_name || DEFAULTS.recipient_name,
  titleOf: (data) => `LOR — ${data.recipient_name || DEFAULTS.recipient_name}`,
};
