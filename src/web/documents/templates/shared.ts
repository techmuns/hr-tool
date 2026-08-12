/** Brand colours pulled from the source templates (exact hex from the PDFs). */
export const NAVY = "#284b70"; // LOR title + bottom bar
export const CERT_INK = "#545454"; // certificate text grey
export const GOLD = "#e8a33d";

/** Convert a base64 `data:` PNG URI to raw bytes for docx ImageRun. */
export function pngBytesFromDataUri(uri: string): Uint8Array {
  const base64 = uri.slice(uri.indexOf(",") + 1);
  const bin = atob(base64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Points → twips (1/20 pt), the unit docx uses for spacing and page geometry. */
export function twip(pt: number): number {
  return Math.round(pt * 20);
}

/** Points → half-points, the unit docx uses for font size. */
export function halfPt(pt: number): number {
  return Math.round(pt * 2);
}
