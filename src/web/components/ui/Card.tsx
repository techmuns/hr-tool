import type { PropsWithChildren, ReactNode } from "react";

export function Card({ title, children, actions }: PropsWithChildren<{ title?: string; actions?: ReactNode }>) {
  return (
    <div className="card">
      {(title || actions) && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          {title && <h2>{title}</h2>}
          {actions}
        </div>
      )}
      {children}
    </div>
  );
}
