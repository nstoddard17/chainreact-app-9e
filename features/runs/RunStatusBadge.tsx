import type { WorkflowRunDisplayStatus } from "@/contracts/workflow";

/**
 * Status pill for a single run row (Slice 4.RUNS-PAGE-1).
 *
 * RUN-VISIBILITY-1 — closed-set over the 4 display statuses: the durable-queue
 * non-terminal states `queued` / `running` plus the terminal `succeeded` /
 * `failed`. The helper copy for the non-terminal states lives in
 * `runStatusCopy.ts` and renders below the badge in `RunRow`.
 */
interface Props {
  status: WorkflowRunDisplayStatus;
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

const STATUS_STYLES: Readonly<
  Record<WorkflowRunDisplayStatus, { label: string; className: string }>
> = {
  queued: {
    label: "Queued",
    className:
      "bg-amber-500/10 text-amber-700 dark:bg-amber-400/10 dark:text-amber-300",
  },
  running: {
    label: "Running",
    className:
      "bg-sky-500/10 text-sky-700 dark:bg-sky-400/10 dark:text-sky-300",
  },
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
