import type { DocumentTemplate } from "./types";
import { offerLetterTemplate } from "./offerLetter";
import { certificateTemplate } from "./certificate";
import { lorTemplate } from "./lor";

/**
 * The single list every part of the Document Generator reads from. To add a new
 * document type (experience letter, relieving letter, warning letter, …) write
 * one more `DocumentTemplate` and append it here — the type picker, the form,
 * the live preview and the DOCX/PDF exporters all pick it up automatically. No
 * other file enumerates the document types.
 */
export const TEMPLATES: DocumentTemplate[] = [offerLetterTemplate, certificateTemplate, lorTemplate];

export function getTemplate(id: string): DocumentTemplate | undefined {
  return TEMPLATES.find((t) => t.id === id);
}

/** Merge a document's stored values over the template defaults. */
export function withDefaults(t: DocumentTemplate, data: Record<string, string>): Record<string, string> {
  return { ...t.defaults, ...data };
}
