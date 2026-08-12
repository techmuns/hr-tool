import type { CSSProperties } from "react";
import { Editable } from "../EditableField";
import { MUNSHOT_M_LOGO, CERT_CORNER_TR, CERT_CORNER_BR, CEO_SIGNATURE } from "../assets";
import type { DocumentTemplate, RenderCtx } from "./types";
import { CERT_INK, pngBytesFromDataUri, twip, halfPt } from "./shared";

// Coordinates/fonts/sizes are taken verbatim from Munshot_Internship_Certificate.pdf:
// A4 landscape, Quattrocento Bold for the title/name, Lora Italic for the prose,
// ink #545454, gold corner flourishes + centred M logo + scanned CEO signature.

const abs = (left: number, top: number, extra: CSSProperties = {}): CSSProperties => ({
  position: "absolute",
  left: `${left}pt`,
  top: `${top}pt`,
  ...extra,
});

const SERIF = '"Quattrocento", Georgia, serif';
const ITALIC = '"Lora", Georgia, serif';

function render(_page: number, ctx: RenderCtx) {
  return (
    <>
      {/* Ornamental gold corners — fixed */}
      <img src={CERT_CORNER_TR} alt="" style={abs(560, 0, { width: "282pt", height: "245pt" })} />
      <img src={CERT_CORNER_BR} alt="" style={abs(560, 340, { width: "282pt", height: "256pt" })} />
      {/* Munshot mark — fixed */}
      <img src={MUNSHOT_M_LOGO} alt="Munshot" style={abs(458, 131, { width: "334pt", height: "333pt" })} />

      {/* Title (editable so the same layout serves other certificate types) */}
      <Editable
        ctx={ctx}
        id="title_text"
        placeholder="Certificate title"
        style={abs(64.9, 138, { width: "380pt", fontFamily: SERIF, fontWeight: 700, fontSize: "30.4pt", color: CERT_INK })}
      />

      <div style={abs(64.9, 190, { fontFamily: ITALIC, fontStyle: "italic", fontSize: "16.2pt", color: CERT_INK })}>
        This is presented to
      </div>

      {/* Recipient name — dynamic, wraps within the column like the original */}
      <Editable
        ctx={ctx}
        id="recipient_name"
        placeholder="Recipient name"
        style={abs(64.9, 214, {
          width: "380pt",
          fontFamily: SERIF,
          fontWeight: 700,
          fontSize: "45.2pt",
          lineHeight: "51.9pt",
          color: CERT_INK,
        })}
      />

      {/* Body prose — dynamic */}
      <Editable
        ctx={ctx}
        id="body"
        as="div"
        multiline
        placeholder="Certificate text"
        style={abs(70, 326, {
          width: "390pt",
          fontFamily: ITALIC,
          fontStyle: "italic",
          fontSize: "12pt",
          lineHeight: "18pt",
          color: CERT_INK,
        })}
      />

      {/* Signature graphic — fixed */}
      <img src={CEO_SIGNATURE} alt="" style={abs(59, 427, { width: "177pt", height: "78pt" })} />
      {/* Signature rule — fixed */}
      <div style={abs(65, 475, { width: "122pt", borderTop: "1px solid #545454" })} />

      <Editable
        ctx={ctx}
        id="signer_title"
        placeholder="Designation"
        style={abs(64.9, 481, { fontFamily: ITALIC, fontStyle: "italic", fontSize: "12.2pt", color: CERT_INK })}
      />
      <Editable
        ctx={ctx}
        id="signer_name"
        placeholder="Signatory name"
        style={abs(64.9, 503, { fontFamily: SERIF, fontWeight: 700, fontSize: "15.2pt", color: CERT_INK })}
      />
    </>
  );
}

const DEFAULTS: Record<string, string> = {
  title_text: "Certificate of Internship",
  recipient_name: "Jahnvi Deshmukh",
  body:
    "Have completed the internship program from Munshot and done well. We appreciate your performance and professionalism throughout the internship and wish you great success in all future endeavors.",
  signer_title: "CEO",
  signer_name: "Chiraag Kapil",
};

function buildDocx(data: Record<string, string>, d: typeof import("docx")): import("docx").Document {
  const v = (id: string) => data[id] ?? DEFAULTS[id] ?? "";
  const {
    Document,
    Paragraph,
    TextRun,
    ImageRun,
    PageOrientation,
    HorizontalPositionRelativeFrom,
    VerticalPositionRelativeFrom,
  } = d;
  const EMU = 12700; // per point

  const floatImg = (uri: string, leftPt: number, topPt: number, wPx: number, hPx: number) =>
    new ImageRun({
      type: "png",
      data: pngBytesFromDataUri(uri),
      transformation: { width: wPx, height: hPx },
      floating: {
        horizontalPosition: { relative: HorizontalPositionRelativeFrom.PAGE, offset: EMU * leftPt },
        verticalPosition: { relative: VerticalPositionRelativeFrom.PAGE, offset: EMU * topPt },
        allowOverlap: true,
        behindDocument: true,
      },
    });

  const decor = new Paragraph({
    children: [
      floatImg(CERT_CORNER_TR, 560, 0, 376, 327),
      floatImg(CERT_CORNER_BR, 560, 340, 376, 341),
      floatImg(MUNSHOT_M_LOGO, 458, 131, 445, 444),
      floatImg(CEO_SIGNATURE, 59, 427, 236, 104),
    ],
  });

  const ink = "545454";
  return new Document({
    sections: [
      {
        properties: {
          page: {
            size: { orientation: PageOrientation.LANDSCAPE, width: twip(842), height: twip(595.5) },
            margin: { top: twip(130), bottom: twip(60), left: twip(65), right: twip(65) },
          },
        },
        children: [
          decor,
          new Paragraph({
            spacing: { after: 120 },
            children: [new TextRun({ text: v("title_text"), font: "Quattrocento", bold: true, size: halfPt(30.4), color: ink })],
          }),
          new Paragraph({
            spacing: { after: 60 },
            children: [new TextRun({ text: "This is presented to", font: "Lora", italics: true, size: halfPt(16.2), color: ink })],
          }),
          new Paragraph({
            spacing: { after: 160, line: 620 },
            children: [new TextRun({ text: v("recipient_name"), font: "Quattrocento", bold: true, size: halfPt(45.2), color: ink })],
          }),
          new Paragraph({
            spacing: { after: 600, line: 300 },
            children: [new TextRun({ text: v("body"), font: "Lora", italics: true, size: halfPt(12), color: ink })],
          }),
          new Paragraph({
            spacing: { after: 0 },
            children: [new TextRun({ text: v("signer_title"), font: "Lora", italics: true, size: halfPt(12.2), color: ink })],
          }),
          new Paragraph({
            children: [new TextRun({ text: v("signer_name"), font: "Quattrocento", bold: true, size: halfPt(15.2), color: ink })],
          }),
        ],
      },
    ],
  });
}

export const certificateTemplate: DocumentTemplate = {
  id: "internship_certificate",
  name: "Certificate of Internship",
  category: "Certificate",
  description: "A4 landscape certificate with the gold Munshot border and signature.",
  page: { widthPt: 842, heightPt: 595.5, label: "A4", orientation: "landscape" },
  pageCount: 1,
  fields: [
    { id: "title_text", label: "Certificate title", type: "text" },
    { id: "recipient_name", label: "Recipient name", type: "text", required: true, softLimit: 24 },
    { id: "body", label: "Certificate text", type: "multiline" },
    { id: "signer_title", label: "Signatory designation", type: "text" },
    { id: "signer_name", label: "Signatory name", type: "text" },
  ],
  defaults: DEFAULTS,
  renderPage: render,
  buildDocx,
  recipientOf: (data) => data.recipient_name || DEFAULTS.recipient_name,
  titleOf: (data) => `Certificate — ${data.recipient_name || DEFAULTS.recipient_name}`,
};
