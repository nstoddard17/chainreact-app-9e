import type { WorkflowRunTriggeredBy } from "@/contracts/workflow";

/**
 * Per-row "how this run started" label (Slice 4.RUNS-PAGE-1).
 *
 * Mirrors the `workflow_runs.triggered_by` CHECK constraint. Renders
 * inline next to the workflow name. The `unknown` value is shown as
 * `"—"` rather than "Unknown" to avoid emphasizing legacy-row noise.
 */
interface Props {
  triggeredBy: WorkflowRunTriggeredBy;
}

export function RunSourceBadge({ triggeredBy }: Props) {
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
  unknown: "—",
};
