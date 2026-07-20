"use client";

import type { DocumentComplexRegionBlock } from "./projection";

/**
 * Honest read-only "complex region" block (5.DUAL-BUILDER-1 / CS-1, Tier B/C).
 *
 * Rendered when a part of the graph can't be expressed as prose safely
 * (see projectionTiers). Lists the known steps by name and offers the
 * Visual-Builder handoff — it NEVER guesses prose and never mutates anything.
 */
export function DocumentComplexRegion({
  block,
  onOpenInVisual,
}: {
  block: DocumentComplexRegionBlock;
  onOpenInVisual?: ((nodeId: string | null) => void) | undefined;
}) {
  return (
    <div
      data-testid="document-complex-region"
      data-reason={block.reason}
      className="my-2 rounded-xl px-4 py-3"
      style={{
        border: "1.5px dashed var(--builder-border)",
        background: "var(--builder-panel-2)",
      }}
    >
      <p className="m-0 text-[13px] font-medium" style={{ color: "var(--builder-text-2)" }}>
        {block.message}
      </p>
      {block.nodeTitles.length > 0 ? (
        <p className="m-0 mt-1 text-[12px]" style={{ color: "var(--builder-muted)" }}>
          Steps here:{" "}
          {block.nodeTitles.map((title, i) => (
            <span key={block.nodeIds[i] ?? i}>
              {i > 0 ? " · " : ""}
              <span className="font-medium" style={{ color: "var(--builder-text-2)" }}>
                {title}
              </span>
            </span>
          ))}
        </p>
      ) : null}
      {onOpenInVisual ? (
        <button
          type="button"
          data-testid={`document-open-in-visual-${block.focusNodeId ?? "region"}`}
          onClick={() => onOpenInVisual(block.focusNodeId)}
          className="mt-2 inline-flex h-7 items-center rounded-md px-2.5 text-[12px] font-medium"
          style={{
            background: "var(--builder-panel)",
            color: "var(--builder-text)",
            border: "1px solid var(--builder-border)",
          }}
        >
          Open in Visual Builder
        </button>
      ) : null}
    </div>
  );
}
