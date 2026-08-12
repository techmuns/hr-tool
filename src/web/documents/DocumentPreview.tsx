import { useMemo } from "react";
import type { DocumentTemplate, RenderCtx } from "./templates/types";

/** CSS points render at 96dpi in the browser, so 1pt = 1.3333px on screen. */
export const PX_PER_PT = 96 / 72;

interface DocumentPreviewProps {
  template: DocumentTemplate;
  data: Record<string, string>;
  editable: boolean;
  onChange: (id: string, value: string) => void;
  zoom: number;
  /** Collect each page's fixed-size (unscaled) element for export capture. */
  onPageRef?: (page: number, el: HTMLDivElement | null) => void;
  /** Scroll target hooks so the page tabs can jump to a page. */
  pageWrapRef?: (page: number, el: HTMLDivElement | null) => void;
}

/**
 * Renders the fixed template layout at the given zoom. The `.doc-page` box is
 * sized in real points (matching the source PDF's coordinate system 1:1) and
 * only *scaled* for display, so the same DOM drives both the on-screen editor
 * and the export capture — what you see is literally what gets exported.
 */
export function DocumentPreview({ template, data, editable, onChange, zoom, onPageRef, pageWrapRef }: DocumentPreviewProps) {
  const ctx: RenderCtx = useMemo(
    () => ({
      get: (id: string) => (data[id] !== undefined ? data[id] : template.defaults[id] ?? ""),
      editable,
      onChange,
    }),
    [data, editable, onChange, template],
  );

  const { widthPt, heightPt } = template.page;
  const wPx = widthPt * PX_PER_PT;
  const hPx = heightPt * PX_PER_PT;

  const pages = [];
  for (let p = 0; p < template.pageCount; p++) {
    pages.push(
      <div key={p} className="doc-page-slot">
        {template.pageCount > 1 && <div className="doc-page-num">Page {p + 1}</div>}
        <div
          className="doc-page-wrap"
          ref={(el) => pageWrapRef?.(p, el)}
          style={{ width: wPx * zoom, height: hPx * zoom }}
        >
          <div
            className="doc-page"
            ref={(el) => onPageRef?.(p, el)}
            style={{
              width: `${widthPt}pt`,
              height: `${heightPt}pt`,
              transform: `scale(${zoom})`,
              transformOrigin: "top left",
            }}
          >
            {template.renderPage(p, ctx)}
          </div>
        </div>
      </div>,
    );
  }

  return <div className="doc-pages">{pages}</div>;
}
