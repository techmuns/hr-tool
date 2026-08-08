/**
 * Escapes text interpolated into an HTML fragment this app generates — used
 * anywhere a value came from a form field (an employee's name, a certificate
 * body HR typed) rather than from this codebase, so a stray `<` or `&` can't
 * break the surrounding markup.
 */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
