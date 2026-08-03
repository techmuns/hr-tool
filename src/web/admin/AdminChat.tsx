import { useEffect, useState } from "react";
import { api } from "../api";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { ChatThread } from "../components/ChatThread";
import type { ChatMessage, Employee } from "../types";

interface BroadcastResult {
  sent: number;
  names: string[];
}

export function AdminChat() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sending, setSending] = useState(false);

  const [composing, setComposing] = useState(false);
  const [broadcastBody, setBroadcastBody] = useState("");
  const [recipients, setRecipients] = useState<Set<number>>(new Set());
  const [broadcastBusy, setBroadcastBusy] = useState(false);
  const [broadcastError, setBroadcastError] = useState<string | null>(null);
  const [result, setResult] = useState<BroadcastResult | null>(null);

  useEffect(() => {
    api.get<Employee[]>("/employees").then((rows) => {
      const staff = rows.filter((e) => e.role === "employee");
      setEmployees(staff);
      if (staff.length > 0) setSelectedId(staff[0].id);
      // A broadcast means everyone by default; untick to narrow it.
      setRecipients(new Set(staff.map((e) => e.id)));
    });
  }, []);

  function loadMessages(employeeId: number) {
    api.get<ChatMessage[]>(`/admin/chat?employee_id=${employeeId}`).then(setMessages);
  }

  useEffect(() => {
    if (selectedId) loadMessages(selectedId);
  }, [selectedId]);

  async function send(body: string) {
    if (!selectedId) return;
    setSending(true);
    try {
      await api.post("/chat", { body, employee_id: selectedId });
      loadMessages(selectedId);
    } finally {
      setSending(false);
    }
  }

  function toggleRecipient(id: number) {
    setRecipients((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const allSelected = employees.length > 0 && recipients.size === employees.length;

  async function sendBroadcast() {
    const body = broadcastBody.trim();
    if (!body || recipients.size === 0) return;
    setBroadcastBusy(true);
    setBroadcastError(null);
    setResult(null);
    try {
      const res = await api.post<BroadcastResult>("/admin/chat/broadcast", {
        body,
        employee_ids: [...recipients],
      });
      setResult(res);
      setBroadcastBody("");
      setComposing(false);
      // The open thread may have just received it.
      if (selectedId) loadMessages(selectedId);
    } catch (err) {
      setBroadcastError(err instanceof Error ? err.message : "Failed to send message");
    } finally {
      setBroadcastBusy(false);
    }
  }

  return (
    <Card
      title="Chat"
      actions={
        <div style={{ display: "flex", gap: 8 }}>
          <Button onClick={() => setComposing((v) => !v)} disabled={employees.length === 0}>
            {composing ? "Cancel" : "Message people"}
          </Button>
          <select
            value={selectedId ?? ""}
            onChange={(e) => setSelectedId(Number(e.target.value))}
            style={{ width: "auto" }}
          >
            {employees.map((emp) => (
              <option key={emp.id} value={emp.id}>
                {emp.name}
              </option>
            ))}
          </select>
        </div>
      }
    >
      {composing && (
        <div className="inline-form" style={{ marginBottom: 14 }}>
          <div className="broadcast-head">
            <strong>Send to {recipients.size === employees.length ? "everyone" : `${recipients.size} selected`}</strong>
            <button
              type="button"
              className="link-btn"
              onClick={() =>
                setRecipients(allSelected ? new Set() : new Set(employees.map((e) => e.id)))
              }
            >
              {allSelected ? "Clear all" : "Select all"}
            </button>
          </div>

          <div className="broadcast-people">
            {employees.map((emp) => (
              <label key={emp.id} className="broadcast-person">
                <input
                  type="checkbox"
                  checked={recipients.has(emp.id)}
                  onChange={() => toggleRecipient(emp.id)}
                />
                {emp.name}
              </label>
            ))}
          </div>

          <div className="field" style={{ marginTop: 10 }}>
            <label>Message</label>
            <textarea
              rows={3}
              placeholder="Goes into each person's own chat thread…"
              value={broadcastBody}
              onChange={(e) => setBroadcastBody(e.target.value)}
            />
          </div>

          {broadcastError && <p className="error-text">{broadcastError}</p>}

          <div className="inline-form-actions">
            <Button onClick={() => setComposing(false)} disabled={broadcastBusy}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={sendBroadcast}
              disabled={broadcastBusy || !broadcastBody.trim() || recipients.size === 0}
            >
              {broadcastBusy ? "Sending…" : `Send to ${recipients.size}`}
            </Button>
          </div>
        </div>
      )}

      {result && (
        <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>
          Sent to {result.sent} {result.sent === 1 ? "person" : "people"}: {result.names.join(", ")}.
        </p>
      )}

      {selectedId ? (
        <ChatThread messages={messages} onSend={send} sending={sending} />
      ) : (
        <p className="muted">No employees to chat with.</p>
      )}
    </Card>
  );
}
