import { useState } from "react";
import { api } from "../api";
import { Button } from "../components/ui/Button";
import { ConfirmModal } from "../components/ui/ConfirmModal";
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
  const [confirmId, setConfirmId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  async function removeTeam() {
    if (confirmId == null) return;
    const id = confirmId;
    setConfirmId(null);
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
              {teams.map((t) => (
                <li key={t.id}>
                  <span>{t.name}</span>
                  <button
                    type="button"
                    className="row-remove-btn"
                    title="Delete team"
                    disabled={removingId === t.id}
                    onClick={() => setConfirmId(t.id)}
                  >
                    ✕
                  </button>
                </li>
              ))}
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

      {confirmId != null && (
        <ConfirmModal
          message="Delete this team? Employees on it will become unassigned."
          busy={removingId === confirmId}
          onConfirm={removeTeam}
          onCancel={() => setConfirmId(null)}
        />
      )}
    </>
  );
}
