import { useState } from "react";
import { api } from "../api";
import { confirmDialog } from "../confirm";
import { Button } from "../components/ui/Button";
import type { Role } from "../types";

export function RoleManager({
  roles,
  onClose,
  onChanged,
}: {
  roles: Role[];
  onClose: () => void;
  onChanged: (renamed?: { from: string; to: string }) => void;
}) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [removingId, setRemovingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  function startEdit(r: Role) {
    setError(null);
    setEditingId(r.id);
    setEditName(r.name);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditName("");
  }

  async function saveEdit(r: Role) {
    const trimmed = editName.trim();
    if (!trimmed) return;
    if (trimmed === r.name) {
      cancelEdit();
      return;
    }
    setSavingEdit(true);
    setError(null);
    try {
      await api.patch(`/admin/roles/${r.id}`, { name: trimmed });
      cancelEdit();
      onChanged({ from: r.name, to: trimmed });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to rename role");
    } finally {
      setSavingEdit(false);
    }
  }

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

  async function removeRole(id: number) {
    const ok = await confirmDialog("Delete this role? Employees currently on it keep their job title.", {
      confirmLabel: "Delete",
      danger: true,
    });
    if (!ok) return;
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
              {roles.map((r) =>
                editingId === r.id ? (
                  <li key={r.id} className="editing">
                    <input
                      autoFocus
                      type="text"
                      className="edit-name-input"
                      value={editName}
                      disabled={savingEdit}
                      onChange={(e) => setEditName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") saveEdit(r);
                        if (e.key === "Escape") cancelEdit();
                      }}
                    />
                    <div className="row-actions">
                      <button
                        type="button"
                        className="row-edit-btn"
                        title="Save"
                        disabled={savingEdit || !editName.trim()}
                        onClick={() => saveEdit(r)}
                      >
                        ✓
                      </button>
                      <button
                        type="button"
                        className="row-remove-btn"
                        title="Cancel"
                        disabled={savingEdit}
                        onClick={cancelEdit}
                      >
                        ✕
                      </button>
                    </div>
                  </li>
                ) : (
                  <li key={r.id}>
                    <span>{r.name}</span>
                    <div className="row-actions">
                      <button
                        type="button"
                        className="row-edit-btn"
                        title="Rename role"
                        disabled={removingId === r.id}
                        onClick={() => startEdit(r)}
                      >
                        ✎
                      </button>
                      <button
                        type="button"
                        className="row-remove-btn"
                        title="Delete role"
                        disabled={removingId === r.id}
                        onClick={() => removeRole(r.id)}
                      >
                        ✕
                      </button>
                    </div>
                  </li>
                ),
              )}
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
    </>
  );
}
