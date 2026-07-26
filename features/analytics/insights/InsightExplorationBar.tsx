"use client";

import { MAX_EXPLORATION_DEPTH } from "./insightRefine";

/**
 * Exploration header for a drilled Custom Insight (CD-5B).
 *
 * Rendered above the chart only while an exploration is active. Shows the
 * path from the saved question through each refinement, a one-sentence
 * description of the newest refinement, Back / Reset, and — for dashboard
 * editors — Save as new insight. Purely presentational; the exploration
 * stack lives in the widget body.
 */
export interface InsightExplorationCrumb {
  label: string;
}

export function InsightExplorationBar({
  rootLabel,
  crumbs,
  description,
  notes,
  atDepthLimit,
  canSave,
  saveDisabledReason,
  onBack,
  onReset,
  onSave,
}: {
  /** The saved question's label ("All Shopify orders"). */
  rootLabel: string;
  crumbs: readonly InsightExplorationCrumb[];
  /** Sentence describing the active refinement ("Exploring: Status is Paid"). */
  description: string | null;
  /** Reconciliation notes from the newest drill. */
  notes: readonly string[];
  atDepthLimit: boolean;
  /** Whether this viewer may save the exploration as a new widget. */
  canSave: boolean;
  /** When set, save renders disabled with this explanation (widget cap). */
  saveDisabledReason: string | null;
  onBack: () => void;
  onReset: () => void;
  onSave: () => void;
}) {
  return (
    <div className="flex flex-col gap-1 rounded-md border border-border bg-muted/60 px-2 py-1.5">
      <nav aria-label="Exploration path" className="min-w-0">
        <ol className="flex flex-wrap items-center gap-1 text-[10.5px] text-muted-foreground">
          <li className="max-w-[160px] truncate" title={rootLabel}>
            {rootLabel}
          </li>
          {crumbs.map((c, i) => (
            <li key={i} className="flex min-w-0 items-center gap-1">
              <span aria-hidden>›</span>
              <span
                className={
                  "max-w-[160px] truncate " +
                  (i === crumbs.length - 1 ? "font-medium text-foreground" : "")
                }
                title={c.label}
                {...(i === crumbs.length - 1 ? { "aria-current": "location" as const } : {})}
              >
                {c.label}
              </span>
            </li>
          ))}
        </ol>
      </nav>

      {description && (
        <p className="text-[10.5px] text-foreground/80" role="status" aria-live="polite">
          {description}
        </p>
      )}
      {notes.map((n, i) => (
        <p key={i} className="text-[10.5px] text-muted-foreground" role="status">
          {n}
        </p>
      ))}
      {atDepthLimit && (
        <p className="text-[10.5px] text-muted-foreground" role="status">
          You've reached the exploration limit ({MAX_EXPLORATION_DEPTH} levels) — go back to
          explore in another direction.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          className="rounded-md border border-border bg-background px-2 py-0.5 text-[11px] text-foreground hover:bg-muted"
          onClick={onBack}
        >
          Back
        </button>
        <button
          type="button"
          className="rounded-md border border-border bg-background px-2 py-0.5 text-[11px] text-foreground hover:bg-muted"
          onClick={onReset}
        >
          Reset
        </button>
        {canSave && (
          <button
            type="button"
            className="rounded-md border border-primary/40 bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary hover:bg-primary/15 disabled:cursor-not-allowed disabled:opacity-50"
            onClick={onSave}
            disabled={saveDisabledReason !== null}
            {...(saveDisabledReason ? { title: saveDisabledReason } : {})}
          >
            Save as new insight
          </button>
        )}
        {canSave && saveDisabledReason && (
          <span className="text-[10.5px] text-muted-foreground" role="status">
            {saveDisabledReason}
          </span>
        )}
      </div>
    </div>
  );
}
