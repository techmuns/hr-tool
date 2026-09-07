import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { Button } from "./components/ui/Button";

// In-app confirmation dialog. The app runs inside the Munshot iframe, where the
// browser silently ignores window.confirm(), so any flow relying on it never
// proceeds. This renders a real DOM modal instead and resolves a promise.

interface Options {
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

function ConfirmModal({
  message,
  options,
  onResolve,
}: {
  message: string;
  options: Options;
  onResolve: (value: boolean) => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onResolve(false);
      if (e.key === "Enter") onResolve(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onResolve]);

  return (
    <div className="confirm-backdrop" onClick={() => onResolve(false)}>
      <div className="confirm-card" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <p className="confirm-message">{message}</p>
        <div className="confirm-actions">
          <Button onClick={() => onResolve(false)}>{options.cancelLabel ?? "Cancel"}</Button>
          <Button variant={options.danger ? "danger" : "primary"} autoFocus onClick={() => onResolve(true)}>
            {options.confirmLabel ?? "Confirm"}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function confirmDialog(message: string, options: Options = {}): Promise<boolean> {
  return new Promise((resolve) => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    const finish = (value: boolean) => {
      root.unmount();
      host.remove();
      resolve(value);
    };
    root.render(<ConfirmModal message={message} options={options} onResolve={finish} />);
  });
}

interface PromptOptions {
  confirmLabel?: string;
  cancelLabel?: string;
  placeholder?: string;
  defaultValue?: string;
}

function PromptModal({
  message,
  options,
  onResolve,
}: {
  message: string;
  options: PromptOptions;
  onResolve: (value: string | null) => void;
}) {
  const [value, setValue] = useState(options.defaultValue ?? "");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onResolve(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onResolve]);

  return (
    <div className="confirm-backdrop" onClick={() => onResolve(null)}>
      <div className="confirm-card" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const trimmed = value.trim();
            if (trimmed) onResolve(trimmed);
          }}
        >
          <p className="confirm-message">{message}</p>
          <input
            type="text"
            value={value}
            autoFocus
            placeholder={options.placeholder}
            aria-label={options.placeholder ?? message}
            onChange={(e) => setValue(e.target.value)}
            style={{ marginBottom: 12 }}
          />
          <div className="confirm-actions">
            <Button type="button" onClick={() => onResolve(null)}>
              {options.cancelLabel ?? "Cancel"}
            </Button>
            <Button type="submit" variant="primary" disabled={!value.trim()}>
              {options.confirmLabel ?? "Save"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

/**
 * Same modal as confirmDialog, but asks for one line of text. Resolves the
 * trimmed value, or null if HR cancelled. (window.prompt is ignored inside the
 * Munshot iframe, same as window.confirm.)
 */
export function promptDialog(message: string, options: PromptOptions = {}): Promise<string | null> {
  return new Promise((resolve) => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    const finish = (value: string | null) => {
      root.unmount();
      host.remove();
      resolve(value);
    };
    root.render(<PromptModal message={message} options={options} onResolve={finish} />);
  });
}
