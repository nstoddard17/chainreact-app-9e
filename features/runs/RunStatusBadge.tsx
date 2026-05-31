import type { WorkflowRunStatus } from "@/contracts/workflow";

/**
 * Status pill for a single run row (Slice 4.RUNS-PAGE-1).
 *
 * Two terminal values only — `succeeded` / `failed` — matching the
 * display contract (`workflow_runs.status != 'running'` filter in the
 * repository). A future running/canceled state would land here as a
 * new entry once the schema supports terminal-canceled rows; for now
 * the badge is closed-set.
 */
interface Props {
  status: WorkflowRunStatus;
}

export function RunStatusBadge({ status }: Props) {
  const { label, className } = STATUS_STYLES[status];
  return (
    <span
      data-testid={`run-status-badge-${status}`}
      className={
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium " +
        className
      }
    >
      <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full bg-current" />
      {label}
    </span>
  );
}

const STATUS_STYLES: Readonly<Record<WorkflowRunStatus, { label: string; className: string }>> = {
  succeeded: {
    label: "Succeeded",
    className:
      "bg-emerald-500/10 text-emerald-600 dark:bg-emerald-400/10 dark:text-emerald-300",
  },
  failed: {
    label: "Failed",
    className:
      "bg-destructive/10 text-destructive dark:bg-destructive/15 dark:text-destructive",
  },
};
