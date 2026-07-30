"use client";

/**
 * Status + validation pills for the builder header
 * (4.BUILDER-DESIGN-PARITY-1).
 *
 * Extracted out of `BuilderHeader.tsx` so the main header file stays
 * under the project's 400-line ESLint max. Both pills are
 * presentational — no slice reads, no event dispatch beyond the
 * `onOpen` callback wired by the header.
 *
 * Text-content contracts are preserved verbatim from BUILDER-UI-SHELL-1 /
 * BUILDER-VALIDATION-1:
 *   - StatusPill renders "Saved.", "Unsaved changes", "Saving…", or a
 *     `role="alert"` element containing the slice's `saveError`.
 *     idle → null.
 *   - HeaderValidationPill renders "Ready" or "N issue" / "N issues"
 *     with `data-state="ready"|"warning"|"error"` and
 *     `data-error-count` / `data-warning-count` attributes the
 *     BuilderHeader tests assert on.
 */

export type SaveStatus = "saved" | "saving" | "unsaved" | "error" | "idle";

export function HeaderValidationPill({
  counts,
  onOpen,
  compact = false,
}: {
  counts: { errorCount: number; warningCount: number; totalCount: number };
  onOpen: () => void;
  /**
   * BUILDER-RESPONSIVE-LAYOUT-1 — phone-width variant. The issue COUNT must stay
   * visible at every size (it is the entry point to everything blocking a
   * go-live), so the pill drops the word "issues" rather than the number, and
   * keeps the full phrase in `aria-label` + `title` so nothing is lost to
   * assistive tech or to a hover. `data-state` / `data-error-count` /
   * `data-warning-count` are unchanged, so the validation-count contract the
   * header tests assert on holds in both variants.
   */
  compact?: boolean;
}) {
  const { errorCount, warningCount, totalCount } = counts;
  const state: "ready" | "warning" | "error" =
    errorCount > 0 ? "error" : warningCount > 0 ? "warning" : "ready";
  const label =
    state === "ready"
      ? "Ready"
      : `${totalCount} ${totalCount === 1 ? "issue" : "issues"}`;
  const style =
    state === "error"
      ? {
          background: "var(--builder-danger-soft)",
          color: "var(--builder-danger)",
          borderColor: "var(--builder-danger)",
        }
      : state === "warning"
        ? {
            background: "var(--builder-warn-soft)",
            color: "var(--builder-warn)",
            borderColor: "var(--builder-warn)",
          }
        : {
            background: "var(--builder-success-soft)",
            color: "var(--builder-success)",
            borderColor: "var(--builder-success)",
          };
  // BUILDER-HEADER-ACTION-BAR-POLISH — the issue/status control now shares the
  // action group's h-8 / rounded-md geometry (was a rounded-full h-[26px] badge
  // that floated off-baseline and over-emphasized the error state). A small status
  // dot carries the severity colour so the control stays legible without shouting.
  // Text + data-* + aria are unchanged — the validation-count contract is preserved.
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={
        compact ? `Open validation summary — ${label}` : "Open validation summary"
      }
      data-testid="builder-header-validation-pill"
      data-state={state}
      data-error-count={errorCount}
      data-warning-count={warningCount}
      data-compact={compact ? "true" : undefined}
      className={`inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md text-[12px] font-medium ${
        compact ? "px-2" : "px-2.5"
      }`}
      style={{
        border: "1px solid",
        ...style,
      }}
      title={compact ? `${label} — open validation summary` : "Open validation summary"}
    >
      <span
        aria-hidden
        className="inline-block h-1.5 w-1.5 rounded-full"
        style={{ background: "currentColor" }}
      />
      {compact ? (state === "ready" ? "OK" : String(totalCount)) : label}
    </button>
  );
}

export function StatusPill({
  status,
  saveError,
  onRetry,
  compact = false,
}: {
  status: SaveStatus;
  saveError: string | null;
  /**
   * BUILDER-RESPONSIVE-LAYOUT-1 — phone-width variant: the coloured dot alone,
   * with the label moved into `aria-label`/`title`. "Unsaved changes" is ~118px
   * of unshrinkable text sitting next to a workflow name that also needs room;
   * at 390px one of them has to give, and the dot keeps the SIGNAL while the
   * name keeps the space. The error variant is deliberately NOT compacted — a
   * save failure and its Retry are the one thing that must stay legible.
   */
  compact?: boolean;
  /**
   * BUILDER-SAVE-STATUS-UX-AUDIT-1 — retry the save from the error pill itself.
   * The save status renders by the workflow title (left), but the Save button is
   * at the far-right of the header — so on failure the error and its recovery were
   * visually disconnected. Wiring the same `save()` here co-locates retry with the
   * error. Optional → no button when unwired (isolated pill tests).
   */
  onRetry?: () => void;
}) {
  if (status === "idle") return null;
  if (status === "error") {
    return (
      <span
        role="alert"
        data-testid="builder-header-status-pill"
        data-status="error"
        className="builder-mono inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium"
        style={{
          border: "1px solid var(--builder-danger)",
          background: "var(--builder-danger-soft)",
          color: "var(--builder-danger)",
        }}
      >
        <span
          aria-hidden
          className="inline-block h-1.5 w-1.5 rounded-full"
          style={{ background: "var(--builder-danger)" }}
        />
        <span>{saveError ?? "Failed to save."}</span>
        {onRetry ? (
          <button
            type="button"
            onClick={onRetry}
            data-testid="builder-header-save-retry"
            className="font-semibold underline underline-offset-2 hover:no-underline"
          >
            Retry
          </button>
        ) : null}
      </span>
    );
  }
  const cfg =
    status === "saving"
      ? {
          label: "Saving…",
          dot: "var(--builder-accent)",
          fg: "var(--builder-accent)",
          bg: "var(--builder-accent-soft)",
          border: "var(--builder-accent)",
        }
      : status === "unsaved"
        ? {
            label: "Unsaved changes",
            dot: "var(--builder-warn)",
            fg: "var(--builder-warn)",
            bg: "var(--builder-warn-soft)",
            border: "var(--builder-warn)",
          }
        : {
            label: "Saved.",
            dot: "var(--builder-success)",
            fg: "var(--builder-success)",
            bg: "var(--builder-success-soft)",
            border: "var(--builder-success)",
          };
  return (
    <span
      data-testid="builder-header-status-pill"
      data-status={status}
      data-compact={compact ? "true" : undefined}
      {...(compact ? { role: "status", "aria-label": cfg.label, title: cfg.label } : {})}
      className={`builder-mono inline-flex shrink-0 items-center gap-1.5 rounded-full font-medium ${
        compact ? "h-4 w-4 justify-center p-0" : "px-2 py-0.5 text-[11px]"
      }`}
      style={{
        border: `1px solid ${cfg.border}`,
        background: cfg.bg,
        color: cfg.fg,
      }}
    >
      <span
        aria-hidden
        className="inline-block h-1.5 w-1.5 rounded-full"
        style={{ background: cfg.dot }}
      />
      {compact ? null : cfg.label}
    </span>
  );
}
