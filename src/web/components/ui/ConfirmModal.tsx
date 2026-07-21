import { Button } from "./Button";

export function ConfirmModal({
  message,
  confirmLabel = "Delete",
  busy = false,
  onConfirm,
  onCancel,
}: {
  message: string;
  confirmLabel?: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <>
      <div className="modal-backdrop" onClick={busy ? undefined : onCancel} />
      <div className="modal" role="alertdialog" aria-modal="true" aria-label="Confirm">
        <div className="modal-body">
          <p>{message}</p>
          <div className="inline-form-actions">
            <Button type="button" onClick={onCancel} disabled={busy}>
              Cancel
            </Button>
            <Button type="button" variant="danger" onClick={onConfirm} disabled={busy}>
              {busy ? "Working…" : confirmLabel}
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
