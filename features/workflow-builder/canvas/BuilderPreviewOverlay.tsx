"use client";

import type { DraftPreview } from "@/contracts/workflowPlanPreview";

/**
 * Non-applied AI draft preview overlay (HERMES-AGENT-BUILDER-PREVIEW-OVERLAY).
 *
 * Renders a capability-validated {@link DraftPreview} as a SEPARATE, ephemeral visual layer floating
 * over the builder canvas — shimmered/ghost "Suggested" nodes joined by dashed preview edges. It is a
 * pure presentational component: it reads the preview prop and an `onDiscard` callback, and renders.
 *
 * HARD GUARANTEES (this is visual-only):
 *   - It NEVER merges preview nodes/edges into the real React Flow graph or any builder store. The
 *     preview is its own DOM layer; the real canvas underneath is untouched and unchanged.
 *   - It performs no workflow create/mutate/apply/run, writes no persisted definition, marks nothing
 *     dirty, autosaves nothing, and makes no network call. The only action is `onDiscard`, which the
 *     parent uses to drop the overlay state.
 *   - There is intentionally NO Apply / Create / Use-this / Add-nodes / Run control. Applying a plan
 *     is a future, explicit, user-initiated slice handled by the deterministic builder.
 *
 * The container is `pointer-events-none` so the canvas underneath stays interactive; only the discard
 * control opts back into pointer events. Ghost nodes/edges are non-interactive.
 */

export interface BuilderPreviewOverlayProps {
  /** The ephemeral preview to render. The parent renders this overlay only when non-null. */
  readonly preview: DraftPreview;
  /** Drop the overlay (UI state only). Never mutates the workflow. */
  readonly onDiscard: () => void;
}

export function BuilderPreviewOverlay({ preview, onDiscard }: BuilderPreviewOverlayProps) {
  return (
    <div
      data-testid="builder-preview-overlay"
      data-preview="true"
      aria-label="Suggested workflow preview"
      className="pointer-events-none absolute inset-0 z-30 flex flex-col items-center overflow-auto p-4"
    >
      {/* Top control bar — the only interactive part of the overlay. */}
      <div
        className="pointer-events-auto mb-4 flex items-center gap-3 rounded-full px-3 py-1.5 shadow-md"
        style={{
          background: "var(--builder-panel)",
          border: "1px dashed var(--builder-accent)",
        }}
      >
        <span
          data-testid="builder-preview-badge"
          className="builder-preview-badge inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold"
          style={{ background: "var(--builder-accent)", color: "white" }}
        >
          <SparkleIcon /> Suggested
        </span>
        <span
          data-testid="builder-preview-overlay-notice"
          className="text-[11.5px]"
          style={{ color: "var(--builder-muted)" }}
        >
          {preview.notice}
        </span>
        <button
          type="button"
          onClick={onDiscard}
          data-testid="builder-preview-discard"
          className="rounded-full px-2 py-0.5 text-[11.5px] font-medium"
          style={{ color: "var(--builder-text-2)", border: "1px solid var(--builder-border)" }}
          title="Discard preview (your workflow is unchanged)"
        >
          Discard preview
        </button>
      </div>

      {(preview.title.length > 0 || preview.summary.length > 0) && (
        <div className="pointer-events-none mb-3 max-w-[420px] text-center">
          {preview.title.length > 0 && (
            <div className="text-[13px] font-semibold" style={{ color: "var(--builder-text)" }}>
              {preview.title}
            </div>
          )}
          {preview.summary.length > 0 && (
            <div className="mt-0.5 text-[11.5px]" style={{ color: "var(--builder-muted)" }}>
              {preview.summary}
            </div>
          )}
        </div>
      )}

      {/* Ghost node chain. Edges render as dashed connectors between consecutive ghost nodes. */}
      <ol className="pointer-events-none flex flex-col items-center gap-0">
        {preview.nodes.map((node, i) => (
          <li key={node.previewId} className="flex flex-col items-center">
            <div
              data-testid="builder-preview-node"
              data-preview="true"
              className="builder-preview-node-ghost w-[260px] animate-pulse rounded-[8px] border border-dashed p-3 opacity-80"
              style={{
                background: "var(--builder-panel-2)",
                borderColor: "var(--builder-accent)",
                boxShadow: "0 0 0 3px color-mix(in oklab, var(--builder-accent) 18%, transparent)",
              }}
            >
              <div className="flex items-center gap-2">
                <span
                  className="rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                  style={{ background: "var(--builder-panel)", color: "var(--builder-muted)" }}
                >
                  {node.role}
                </span>
                <code className="text-[12px]" style={{ color: "var(--builder-text)" }}>
                  {node.label}
                </code>
              </div>
              {node.purpose.length > 0 && (
                <div className="mt-1 text-[11.5px]" style={{ color: "var(--builder-muted)" }}>
                  {node.purpose}
                </div>
              )}
              {node.missingInputs && node.missingInputs.length > 0 && (
                <div className="mt-1 text-[11px]" style={{ color: "var(--builder-warning, #b45309)" }}>
                  Still needs: {node.missingInputs.join(", ")}
                </div>
              )}
            </div>
            {/* Dashed preview edge to the next ghost node (linear chain). */}
            {i < preview.nodes.length - 1 && (
              <span
                data-testid="builder-preview-edge"
                data-preview="true"
                aria-hidden
                className="builder-preview-edge-dashed my-0 h-6 animate-pulse border-l-2 border-dashed"
                style={{ borderColor: "var(--builder-accent)" }}
              />
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}

const SparkleIcon = () => (
  <svg
    width="11"
    height="11"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    <path d="M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6z" />
  </svg>
);
