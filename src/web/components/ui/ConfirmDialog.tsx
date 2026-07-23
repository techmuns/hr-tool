import { Button } from "./Button";

// In-app replacement for window.confirm(): native confirm() dialogs are
// silently suppressed in a sandboxed iframe (this app runs embedded in the
// Munshot host), so relying on it makes destructive-action buttons look
// dead — the confirm call returns false with no dialog ever shown.
export function ConfirmDialog({
  title = "Are you sure?",
  message,
  confirmLabel = "Remove",
  busy = false,
  onConfirm,
  onCancel,
}: {
  title?: string;
  message: string;
  confirmLabel?: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <>
      <div className="modal-backdrop" onClick={busy ? undefined : onCancel} />
      <div className="modal" role="alertdialog" aria-label={title}>
        <div className="modal-head">
          <h2>{title}</h2>
        </div>
        <div className="modal-body">
          <p style={{ marginTop: 0 }}>{message}</p>
          <div className="inline-form-actions" style={{ marginTop: 14 }}>
            <Button onClick={onCancel} disabled={busy}>
              Cancel
            </Button>
            <Button variant="danger" onClick={onConfirm} disabled={busy}>
              {busy ? "Removing…" : confirmLabel}
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
