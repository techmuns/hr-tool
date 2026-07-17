import { useEffect, useState } from "react";
import { api } from "../api";
import { Card } from "../components/ui/Card";
import { ChatThread } from "../components/ChatThread";
import type { ChatMessage, Employee } from "../types";

export function AdminChat() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    api.get<Employee[]>("/employees").then((rows) => {
      const staff = rows.filter((e) => e.role === "employee");
      setEmployees(staff);
      if (staff.length > 0) setSelectedId(staff[0].id);
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

  return (
    <Card
      title="Chat"
      actions={
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
      }
    >
      {selectedId ? (
        <ChatThread messages={messages} onSend={send} sending={sending} />
      ) : (
        <p className="muted">No employees to chat with.</p>
      )}
    </Card>
  );
}
