import type { ReactNode } from "react";
import type * as Docx from "docx";

/**
 * The contract every document template implements. A template is the *fixed*
 * part of a document — its page size, layout, fonts, logos and locked prose —
 * expressed as code. Only the values in `fields` are dynamic; everything else
 * the template draws is structural and cannot be edited away by the user.
 *
 * Adding a new document type (experience letter, relieving letter, …) is a
 * matter of writing one more object of this shape and dropping it into the
 * registry — nothing else in the app hard-codes the three built-in types.
 */

/** How a dynamic field is presented in the left-hand form. */
export type FieldType = "text" | "textarea" | "date" | "multiline";

export interface FieldDef {
  /** Stable key; also the key used in the document's `data` blob. */
  id: string;
  label: string;
  type?: FieldType;
  required?: boolean;
  placeholder?: string;
  /** Small helper text under the input. */
  hint?: string;
  /** Rough character budget the template's slot was designed for (advisory). */
  softLimit?: number;
}

/**
 * Everything a template's render function needs, threaded explicitly (no React
 * context) so the same render path serves the live on-screen editor and the
 * off-screen export capture.
 */
export interface RenderCtx {
  /** Current value for a field, falling back to the template default. */
  get: (id: string) => string;
  /** When true the preview is interactive (contentEditable fields). */
  editable: boolean;
  /** Two-way sync hook: a right-side edit writes back to the shared state. */
  onChange: (id: string, value: string) => void;
}

export interface PageSize {
  /** Width in PostScript points (1/72"), matching the source PDF exactly. */
  widthPt: number;
  heightPt: number;
  label: "A4" | "Letter";
  orientation: "portrait" | "landscape";
}

export interface DocumentTemplate {
  /** Registry key, persisted as `documents.template_id`. */
  id: string;
  /** Human name shown in the type picker and history. */
  name: string;
  /** Grouping label, e.g. "Letter", "Certificate", "Recommendation". */
  category: string;
  description: string;
  page: PageSize;
  pageCount: number;
  fields: FieldDef[];
  defaults: Record<string, string>;
  /** Draw one page (0-based) of the live/preview document. */
  renderPage: (page: number, ctx: RenderCtx) => ReactNode;
  /**
   * Build the Word version. Receives the lazily-imported `docx` module so the
   * library stays out of the initial bundle. Returns a ready `Document`.
   */
  buildDocx: (data: Record<string, string>, d: typeof Docx) => Docx.Document;
  /** Recipient name for the history list, derived from the data. */
  recipientOf: (data: Record<string, string>) => string;
  /** Default document title when none was set. */
  titleOf: (data: Record<string, string>) => string;
}

/** Resolve a field value from data, else the template default, else "". */
export function valueOf(t: DocumentTemplate, data: Record<string, string>, id: string): string {
  const v = data[id];
  if (v !== undefined && v !== null && v !== "") return v;
  return t.defaults[id] ?? "";
}
