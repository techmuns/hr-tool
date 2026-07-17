import { useState } from "react";
import { Button } from "./ui/Button";
import { formatDateTime } from "../date";
import type { ChatMessage } from "../types";

export function ChatThread({
  messages,
  onSend,
  sending,
}: {
  messages: ChatMessage[];
  onSend: (body: string) => Promise<void>;
  sending: boolean;
}) {
  const [text, setText] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    await onSend(text);
    setText("");
  }

  return (
    <>
      <div className="chat-thread">
        {messages.map((m) => (
          <div key={m.id} className={`chat-bubble ${m.sender_role}`}>
            {m.body}
            <span className="meta">{formatDateTime(m.created_at)}</span>
          </div>
        ))}
        {messages.length === 0 && <p className="muted">No messages yet — say hello.</p>}
      </div>
      <form className="composer" onSubmit={submit}>
        <input
          type="text"
          placeholder="Type a message…"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <Button type="submit" variant="primary" disabled={sending || !text.trim()}>
          Send
        </Button>
      </form>
    </>
  );
}
