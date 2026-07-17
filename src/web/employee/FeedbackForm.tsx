import { useState } from "react";
import { api } from "../api";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";

export function FeedbackForm() {
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!message.trim()) return;
    setSubmitting(true);
    setSent(false);
    setError(null);
    try {
      await api.post("/feedback", { message });
      setMessage("");
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card title="Feedback">
      <p className="muted">Share feedback with HR — it goes straight to their feedback list.</p>
      <form onSubmit={submit}>
        <div className="field">
          <textarea
            rows={4}
            placeholder="What's on your mind?"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
          />
        </div>
        <Button type="submit" variant="primary" disabled={submitting || !message.trim()}>
          {submitting ? "Sending…" : "Send Feedback"}
        </Button>
        {sent && <span className="muted" style={{ marginLeft: 10 }}>Sent, thank you.</span>}
        {error && <p className="error-text">{error}</p>}
      </form>
    </Card>
  );
}
