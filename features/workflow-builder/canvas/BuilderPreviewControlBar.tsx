"use client";

/**
 * HERMES-AGENT-PREVIEW-DIFF-GRAPH — the SINGLE primary Apply/Discard control for an AI preview.
 *
 * Replaces the old floating ghost-node overlay (`BuilderPreviewOverlay`) for the EDIT case: the canvas
 * now renders ONE composed diff graph (added/removed/changed marked inline), and this is just a slim,
 * non-overlay control bar pinned to the top of the canvas. It does NOT cover the graph (it is a thin
 * `top-3` bar, not an `inset-0` layer), so no node ever stacks under it.
 *
 * Presentational only: two explicit, user-clicked actions handled by the parent — `onApply` (commit the
 * candidate to the LOCAL draft) and `onDiscard` (drop the preview, graph unchanged). No save/run/activate.
 */

export interface BuilderPreviewControlBarProps {
  /** Safe review copy (e.g. "Preview only — your workflow has not changed."). */
  readonly notice: string;
  /** Commit the candidate to the local draft (the SINGLE primary Apply). */
  readonly onApply: () => void;
  /** Drop the preview — restores the unchanged live draft view. */
  readonly onDiscard: () => void;
}

export function BuilderPreviewControlBar({ notice, onApply, onDiscard }: BuilderPreviewControlBarProps) {
  return (
    <div
      data-testid="builder-preview-control-bar"
      data-preview="true"
      aria-label="Suggested workflow preview controls"
      className="pointer-events-none absolute left-1/2 top-3 z-30 flex -translate-x-1/2 items-center gap-3 rounded-full px-3 py-1.5 shadow-md"
      style={{ background: "var(--builder-panel)", border: "1px dashed var(--builder-accent)" }}
    >
      <span
        data-testid="builder-preview-badge"
        className="pointer-events-auto inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold"
        style={{ background: "var(--builder-accent)", color: "white" }}
      >
        <SparkleIcon /> Suggested
      </span>
      <span data-testid="builder-preview-overlay-notice" className="text-[11.5px]" style={{ color: "var(--builder-muted)" }}>
        {notice}
      </span>
      <button
        type="button"
        onClick={onApply}
        data-testid="builder-preview-apply"
        className="pointer-events-auto rounded-full px-2.5 py-0.5 text-[11.5px] font-semibold text-white"
        style={{ background: "var(--builder-accent)", border: "1px solid var(--builder-accent)" }}
        title="Apply this change to your draft (you still review fields and save)"
      >
        Apply preview
      </button>
      <button
        type="button"
        onClick={onDiscard}
        data-testid="builder-preview-discard"
        className="pointer-events-auto rounded-full px-2 py-0.5 text-[11.5px] font-medium"
        style={{ color: "var(--builder-text-2)", border: "1px solid var(--builder-border)" }}
        title="Discard preview (your workflow is unchanged)"
      >
        Discard preview
      </button>
    </div>
  );
}

const SparkleIcon = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6z" />
  </svg>
);
