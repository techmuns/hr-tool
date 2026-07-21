import { useState } from "react";
import { api } from "../api";
import { Button } from "../components/ui/Button";
import { ConfirmModal } from "../components/ui/ConfirmModal";
import type { Role } from "../types";

export function RoleManager({
  roles,
  onClose,
  onChanged,
}: {
  roles: Role[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [removingId, setRemovingId] = useState<number | null>(null);
  const [confirmId, setConfirmId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function addRole(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await api.post("/admin/roles", { name: name.trim() });
      setName("");
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add role");
    } finally {
      setBusy(false);
    }
  }

  async function removeRole() {
    if (confirmId == null) return;
    const id = confirmId;
    setConfirmId(null);
    setRemovingId(id);
    setError(null);
    try {
      await api.del(`/admin/roles/${id}`);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete role");
    } finally {
      setRemovingId(null);
    }
  }

  return (
    <>
      <div className="modal-backdrop" onClick={onClose} />
      <div className="modal" role="dialog" aria-label="Manage roles">
        <div className="modal-head">
          <h2>Manage roles</h2>
          <button className="btn icon-btn" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <div className="modal-body">
          {error && <p className="error-text">{error}</p>}
          {roles.length === 0 ? (
            <p className="muted">No roles yet.</p>
          ) : (
            <ul className="team-list">
              {roles.map((r) => (
                <li key={r.id}>
                  <span>{r.name}</span>
                  <button
                    type="button"
                    className="row-remove-btn"
                    title="Delete role"
                    disabled={removingId === r.id}
                    onClick={() => setConfirmId(r.id)}
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          )}
          <form className="composer" onSubmit={addRole} style={{ marginTop: 14 }}>
            <input
              type="text"
              placeholder="New role name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <Button type="submit" variant="primary" disabled={busy || !name.trim()}>
              Add
            </Button>
          </form>
        </div>
      </div>

      {confirmId != null && (
        <ConfirmModal
          message="Delete this role? Employees currently on it keep their job title."
          busy={removingId === confirmId}
          onConfirm={removeRole}
          onCancel={() => setConfirmId(null)}
        />
      )}
    </>
  );
}
