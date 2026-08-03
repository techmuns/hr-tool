import { useRef, useState } from "react";
import { fetchBill } from "../api";
import { BILL_ACCEPT, MAX_BILL_BYTES, billError, formatBytes } from "../../worker/bills";
import type { Reimbursement } from "../types";

/**
 * Single switch for the whole bill-attachment feature. Paused for now — it
 * needs an R2 bucket that isn't set up on this account yet (see the comment
 * on r2_buckets in wrangler.jsonc). Flip to true once that bucket exists;
 * ReimbursementRequest.tsx and EmployeePanel.tsx both gate on this constant.
 */
export const BILLS_ENABLED = false;

/**
 * File picker for a reimbursement bill. Validation runs against the same rules
 * the Worker enforces (src/worker/bills.ts), so an oversized or unsupported file
 * is rejected here instead of after a pointless 3 MB upload.
 */
export function BillPicker({
  file,
  onPick,
  disabled,
}: {
  file: File | null;
  onPick: (file: File | null) => void;
  disabled?: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = e.target.files?.[0] ?? null;
    if (!picked) {
      setError(null);
      onPick(null);
      return;
    }
    const problem = billError(picked);
    if (problem) {
      setError(problem);
      onPick(null);
      // Clear the input so re-picking the same file still fires a change event.
      e.target.value = "";
      return;
    }
    setError(null);
    onPick(picked);
  }

  function clear() {
    setError(null);
    onPick(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <div className="field">
      <label>Bill (optional)</label>
      <input
        ref={inputRef}
        type="file"
        accept={BILL_ACCEPT}
        disabled={disabled}
        onChange={handleChange}
      />
      {file ? (
        <p className="field-hint">
          {file.name} · {formatBytes(file.size)}{" "}
          <button type="button" className="link-btn" onClick={clear} disabled={disabled}>
            remove
          </button>
        </p>
      ) : (
        <p className="field-hint">PDF or image, up to {formatBytes(MAX_BILL_BYTES)}.</p>
      )}
      {error && <p className="error-text">{error}</p>}
    </div>
  );
}

/** Table cell that opens a reimbursement's attached bill, or a dash if none. */
export function BillLink({ reimbursement }: { reimbursement: Reimbursement }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const name = reimbursement.bill_name;
  if (!name) return <span className="muted">—</span>;

  async function open() {
    setBusy(true);
    setError(null);
    try {
      const url = URL.createObjectURL(await fetchBill(reimbursement.id));
      // A new tab is the better read for a receipt, but pop-up blockers and the
      // Munshot iframe can refuse it — fall back to downloading the file.
      if (!window.open(url, "_blank", "noopener")) {
        const link = document.createElement("a");
        link.href = url;
        link.download = name!;
        document.body.appendChild(link);
        link.click();
        link.remove();
      }
      // Revoking immediately can cancel the tab still loading it.
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to open bill");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button type="button" className="link-btn" onClick={open} disabled={busy} title={name}>
        {busy ? "Opening…" : "View"}
      </button>
      {error && <span className="error-text">{error}</span>}
    </>
  );
}
