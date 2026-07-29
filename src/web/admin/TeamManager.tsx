import { useState } from "react";
import { api } from "../api";
import { confirmDialog } from "../confirm";
import { Button } from "../components/ui/Button";
import type { Team } from "../types";

export function TeamManager({
  teams,
  onClose,
  onChanged,
}: {
  teams: Team[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [removingId, setRemovingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  function startEdit(t: Team) {
    setError(null);
    setEditingId(t.id);
    setEditName(t.name);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditName("");
  }

  async function saveEdit(t: Team) {
    const trimmed = editName.trim();
    if (!trimmed) return;
    if (trimmed === t.name) {
      cancelEdit();
      return;
    }
    setSavingEdit(true);
    setError(null);
    try {
      await api.patch(`/admin/teams/${t.id}`, { name: trimmed });
      cancelEdit();
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to rename team");
    } finally {
      setSavingEdit(false);
    }
  }

  async function addTeam(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await api.post("/admin/teams", { name: name.trim() });
      setName("");
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add team");
    } finally {
      setBusy(false);
    }
  }

  async function removeTeam(id: number) {
    const ok = await confirmDialog("Delete this team? Employees on it will become unassigned.", {
      confirmLabel: "Delete",
      danger: true,
    });
    if (!ok) return;
    setRemovingId(id);
    setError(null);
    try {
      await api.del(`/admin/teams/${id}`);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete team");
    } finally {
      setRemovingId(null);
    }
  }

  return (
    <>
      <div className="modal-backdrop" onClick={onClose} />
      <div className="modal" role="dialog" aria-label="Manage teams">
        <div className="modal-head">
          <h2>Manage teams</h2>
          <button className="btn icon-btn" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <div className="modal-body">
          {error && <p className="error-text">{error}</p>}
          {teams.length === 0 ? (
            <p className="muted">No teams yet.</p>
          ) : (
            <ul className="team-list">
              {teams.map((t) =>
                editingId === t.id ? (
                  <li key={t.id} className="editing">
                    <input
                      autoFocus
                      type="text"
                      className="edit-name-input"
                      value={editName}
                      disabled={savingEdit}
                      onChange={(e) => setEditName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") saveEdit(t);
                        if (e.key === "Escape") cancelEdit();
                      }}
                    />
                    <div className="row-actions">
                      <button
                        type="button"
                        className="row-edit-btn"
                        title="Save"
                        disabled={savingEdit || !editName.trim()}
                        onClick={() => saveEdit(t)}
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
                  <li key={t.id}>
                    <span>{t.name}</span>
                    <div className="row-actions">
                      <button
                        type="button"
                        className="row-edit-btn"
                        title="Rename team"
                        disabled={removingId === t.id}
                        onClick={() => startEdit(t)}
                      >
                        ✎
                      </button>
                      <button
                        type="button"
                        className="row-remove-btn"
                        title="Delete team"
                        disabled={removingId === t.id}
                        onClick={() => removeTeam(t.id)}
                      >
                        ✕
                      </button>
                    </div>
                  </li>
                ),
              )}
            </ul>
          )}
          <form className="composer" onSubmit={addTeam} style={{ marginTop: 14 }}>
            <input
              type="text"
              placeholder="New team name"
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
