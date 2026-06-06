import type { WorkflowRunTriggeredBy } from "@/contracts/workflow";

/**
 * Per-row "how this run started" label (Slice 4.RUNS-PAGE-1).
 *
 * Mirrors the `workflow_runs.triggered_by` CHECK constraint. Renders
 * inline next to the workflow name. The `unknown` value is shown as
 * `"—"` rather than "Unknown" to avoid emphasizing legacy-row noise.
 *
 * RH-3 — `api_key` runs render a fuller, NON-uppercase label so the
 * non-secret prefix stays readable: "Triggered via API key · <prefix>"
 * (or just "Triggered via API key" when the prefix is null). Every other
 * source keeps its existing short uppercase pill. The prefix is the only
 * key material shown — never the raw key or hash.
 */
interface Props {
  triggeredBy: WorkflowRunTriggeredBy;
  /** Non-secret prefix snapshot for `api_key` runs; ignored for other sources. */
  apiKeyPrefix?: string | null;
}

export function RunSourceBadge({ triggeredBy, apiKeyPrefix }: Props) {
  if (triggeredBy === "api_key") {
    const prefix = apiKeyPrefix?.trim();
    const label = prefix ? `Triggered via API key · ${prefix}` : "Triggered via API key";
    return (
      <span
        data-testid="run-source-badge-api_key"
        className="inline-flex items-center rounded border border-border bg-muted/40 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground"
      >
        {label}
      </span>
    );
  }

  const label = SOURCE_LABELS[triggeredBy];
  return (
    <span
      data-testid={`run-source-badge-${triggeredBy}`}
      className="inline-flex items-center rounded border border-border bg-muted/40 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground"
    >
      {label}
    </span>
  );
}

export const SOURCE_LABELS: Readonly<Record<WorkflowRunTriggeredBy, string>> = {
  manual: "Manual",
  test: "Test",
  webhook: "Webhook",
  scheduled: "Scheduled",
  retry: "Retry",
  // RH-1: required to keep this exhaustive map total now that `api_key` is a valid
  // source. Unreachable in the UI until RH-2 threads it (the public trigger route
  // still enqueues `manual`); RH-3 owns the richer run-history attribution display.
  api_key: "API key",
  unknown: "—",
};
