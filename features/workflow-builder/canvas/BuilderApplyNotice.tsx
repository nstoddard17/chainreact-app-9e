"use client";

/**
 * Post-apply confirmation toast (HERMES-AGENT-APPLY-PREVIEW-PATCH, reduced by
 * BUILDER-ISSUES-RAIL-1).
 *
 * This used to be a collapsible, canvas-anchored REVIEW TRAY: it carried a status pill, a
 * remaining count, the readiness verdict, and the full "Setup needed" issue list — floating over
 * the workflow while the user tried to fill in the very field it was pointing at. That list was
 * the same set of gaps the right-hand issues rail already reported, from the same deterministic
 * rules, so the builder showed one problem in two places with two different presentations.
 *
 * The issue list now lives ONLY in the issues rail (`ValidationSummary`), which the parent opens
 * automatically after an apply. What remains here is what the rail cannot be: a brief,
 * non-blocking acknowledgement that the apply happened at all. It is one line plus a dismiss —
 * never a panel, never a list, never something that can cover a field.
 *
 * Presentational only: no store reads, no side effects beyond `onDismiss`. The parent owns the
 * notice's lifetime (clears on dismiss / workflow switch / a new preview).
 */

export function BuilderApplyNotice({
  notice,
  onDismiss,
}: {
  readonly notice: string;
  readonly onDismiss: () => void;
}) {
  return (
    <div
      data-testid="builder-apply-notice"
      data-tray="none"
      role="status"
      className="pointer-events-auto absolute bottom-3 left-3 z-30 flex max-w-[calc(100%-1.5rem)] items-center gap-3 rounded-md px-3 py-2 text-[12px] shadow-md"
      style={{
        background: "var(--builder-panel)",
        border: "1px solid var(--builder-border)",
        color: "var(--builder-text)",
      }}
    >
      <span>{notice}</span>
      <button
        type="button"
        onClick={onDismiss}
        data-testid="builder-apply-notice-dismiss"
        aria-label="Dismiss"
        className="rounded px-1 text-[12px]"
        style={{ color: "var(--builder-muted)" }}
      >
        ✕
      </button>
    </div>
  );
}
