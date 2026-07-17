import { useEffect, useState } from "react";
import { api } from "../api";
import { Card } from "../components/ui/Card";
import { ChatThread } from "../components/ChatThread";
import type { ChatMessage } from "../types";

export function Chat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sending, setSending] = useState(false);

  function load() {
    api.get<ChatMessage[]>("/chat/me").then(setMessages).catch(() => {});
  }

  useEffect(load, []);

  async function send(body: string) {
    setSending(true);
    try {
      await api.post("/chat", { body });
      load();
    } finally {
      setSending(false);
    }
  }

  return (
    <Card title="Chat with HR">
      <ChatThread messages={messages} onSend={send} sending={sending} />
    </Card>
  );
}
