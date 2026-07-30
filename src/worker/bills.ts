import type { Context } from "hono";
import type { AppEnv } from "./auth";

/**
 * Reimbursement bill attachments.
 *
 * Bills live in R2 rather than D1: D1 caps a row — and any single BLOB — at
 * 2 MB, below the 3 MB we accept. The reimbursements row keeps only the object
 * key plus enough metadata to serve the file back under its original name.
 *
 * The limits and validation here are shared with the browser (see BillPicker),
 * so a bad file is rejected before it is uploaded. The browser check is a
 * courtesy; this module is the authority, since a client can skip its own.
 */

export const MAX_BILL_BYTES = 3 * 1024 * 1024;

/** Accepted formats, mapped to the extension used for the R2 key. */
export const ALLOWED_BILL_TYPES: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/heif": "heif",
};

/** Value for an <input type="file"> accept attribute. */
export const BILL_ACCEPT = Object.keys(ALLOWED_BILL_TYPES).join(",");

/** The subset of File this module needs, so the browser can validate too. */
export interface BillLike {
  name: string;
  type: string;
  size: number;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Browsers sometimes hand over an empty or unhelpful MIME type — notably for
 * HEIC photos straight off an iPhone — so fall back to the file extension
 * before writing the upload off as an unsupported format.
 */
export function resolveBillType(file: BillLike): string {
  if (ALLOWED_BILL_TYPES[file.type]) return file.type;
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "jpeg") return "image/jpeg";
  const known = Object.entries(ALLOWED_BILL_TYPES).find(([, e]) => e === ext);
  return known ? known[0] : file.type;
}

/** Returns a human-readable reason the file is unacceptable, or null if it's fine. */
export function billError(file: BillLike): string | null {
  if (!ALLOWED_BILL_TYPES[resolveBillType(file)]) {
    return "Bill must be a PDF or an image (JPG, PNG, WEBP, HEIC)";
  }
  if (file.size === 0) return "That file is empty";
  if (file.size > MAX_BILL_BYTES) {
    return `Bill must be ${formatBytes(MAX_BILL_BYTES)} or smaller (that one is ${formatBytes(file.size)})`;
  }
  return null;
}

export interface ReimbursementInput {
  amount: number;
  note: string;
  bill: File | null;
}

/**
 * Reads the reimbursement form as multipart/form-data — the only shape that can
 * carry a bill — or as plain JSON, so JSON callers written before attachments
 * existed keep working unchanged.
 */
export async function readReimbursementInput(
  c: Context<AppEnv>,
): Promise<ReimbursementInput | { error: string }> {
  let amount: unknown;
  let note: unknown;
  let bill: File | null = null;

  if ((c.req.header("content-type") ?? "").includes("multipart/form-data")) {
    const form = await c.req.formData().catch(() => null);
    if (!form) return { error: "Malformed form data" };
    // Every form field arrives as a string, so amount needs converting back.
    amount = Number(form.get("amount"));
    note = form.get("note");
    const picked = form.get("bill");
    if (picked instanceof File && picked.size > 0) bill = picked;
  } else {
    const body = await c.req
      .json<{ amount?: number; note?: string }>()
      .catch(() => ({}) as { amount?: number; note?: string });
    amount = body.amount;
    note = body.note;
  }

  if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) {
    return { error: "amount must be a positive number" };
  }
  if (bill) {
    const problem = billError(bill);
    if (problem) return { error: problem };
  }

  return {
    amount: Math.round(amount),
    note: typeof note === "string" ? note.trim() : "",
    bill,
  };
}

export interface StoredBill {
  key: string;
  name: string;
  type: string;
  size: number;
}

/**
 * Strip any directory part and control characters: the stored name is echoed
 * back in a Content-Disposition header, where a stray quote or newline would
 * let an upload rewrite the response headers.
 */
function safeName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "";
  // eslint-disable-next-line no-control-regex
  const cleaned = base.replace(/[\u0000-\u001f\u007f"\\]/g, "").trim();
  return (cleaned || "bill").slice(0, 120);
}

export async function putBill(c: Context<AppEnv>, employeeId: number, bill: File): Promise<StoredBill> {
  const type = resolveBillType(bill);
  const key = `reimbursements/${employeeId}/${crypto.randomUUID()}.${ALLOWED_BILL_TYPES[type]}`;
  await c.env.BILLS.put(key, await bill.arrayBuffer(), { httpMetadata: { contentType: type } });
  return { key, name: safeName(bill.name), type, size: bill.size };
}

/**
 * Best-effort cleanup. A missed object only wastes storage, whereas failing the
 * request would leave the caller unable to delete the reimbursement at all.
 */
export async function deleteBills(c: Context<AppEnv>, keys: (string | null)[]): Promise<void> {
  const present = keys.filter((k): k is string => Boolean(k));
  if (present.length === 0) return;
  await c.env.BILLS.delete(present).catch(() => {});
}
