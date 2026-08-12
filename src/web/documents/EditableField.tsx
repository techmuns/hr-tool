import { useEffect, useRef } from "react";
import type { CSSProperties } from "react";
import type { RenderCtx } from "./templates/types";

interface EditableProps {
  ctx: RenderCtx;
  id: string;
  /** Inline field (default) or a block region such as a body paragraph. */
  as?: "span" | "div";
  placeholder?: string;
  style?: CSSProperties;
  className?: string;
  /** Preserve newlines (a multi-line block field). */
  multiline?: boolean;
}

/**
 * A single dynamic slot in a document. It is the *only* editable surface a
 * template exposes — the fixed layout around it is plain, non-editable markup.
 *
 * Two-way sync without caret jumps: the field writes to the shared document
 * state on every keystroke, and only pushes an incoming value back into the DOM
 * when it actually differs from what the element currently shows. So editing the
 * left-hand form updates the field here, editing the field updates the form, and
 * neither fights the other. When `ctx.editable` is false (the export capture)
 * it renders as inert text with no editing affordance at all.
 */
export function Editable({ ctx, id, as = "span", placeholder, style, className, multiline }: EditableProps) {
  const ref = useRef<HTMLElement>(null);
  const value = ctx.get(id);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // innerText is used for both read (onInput) and write so the comparison is
    // apples-to-apples and never clobbers the caret mid-typing.
    if (el.innerText !== value) el.innerText = value;
  }, [value]);

  const Tag = (as ?? "span") as "span";

  if (!ctx.editable) {
    return (
      <Tag className={className} style={multiline ? { whiteSpace: "pre-wrap", ...style } : style} data-doc-field={id}>
        {value}
      </Tag>
    );
  }

  return (
    <Tag
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ref={ref as any}
      className={`doc-editable${className ? ` ${className}` : ""}`}
      style={multiline ? { whiteSpace: "pre-wrap", ...style } : style}
      contentEditable
      suppressContentEditableWarning
      spellCheck={false}
      data-doc-field={id}
      data-placeholder={placeholder ?? ""}
      onInput={(e) => ctx.onChange(id, (e.currentTarget as HTMLElement).innerText)}
      onBlur={(e) => ctx.onChange(id, (e.currentTarget as HTMLElement).innerText)}
    />
  );
}
