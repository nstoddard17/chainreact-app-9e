import Link from "next/link";
import type { RunListItem } from "@/contracts/workflow";
import { RunStatusBadge } from "./RunStatusBadge";
import { RunSourceBadge } from "./RunSourceBadge";
import { formatRunDuration, formatRunStartedAt } from "./formatRunDuration";

/**
 * Single row in the Runs list (Slice 4.RUNS-PAGE-1).
 *
 * Layout: status pill · workflow name (linked) · source badge · test
 * marker (only when isTest) · started-relative · duration · humanized
 * error block (only when present).
 *
 * Linking policy: the workflow-name links to `/workflows/{workflowId}`
 * (the builder — a real V2 route). There is no per-run detail route
 * in V2 yet, so the row itself is NOT a link and there is no
 * "View details" affordance — page-guide §4 forbids fake CTAs.
 *
 * The error block renders the humanized
 * `errorClassification.{title,description,hint}` only; the
 * `action` field is NOT used to render a CTA here, since the action
 * targets (`reconnect` → /apps; `open_node` → builder w/ ?focusNode;
 * `upgrade_plan` → /subscription) span surfaces that aren't all
 * confirmed working from a standalone run-history surface yet.
 */
interface Props {
  run: RunListItem;
}

export function RunRow({ run }: Props) {
  return (
    <li
      data-testid={`runs-row-${run.id}`}
      data-status={run.status}
      data-test={run.isTest ? "true" : "false"}
      className="flex flex-col gap-2 rounded-md border border-border bg-card p-3 transition hover:bg-muted/40"
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <RunStatusBadge status={run.status} />
        <Link
          href={`/workflows/${encodeURIComponent(run.workflowId)}`}
          data-testid={`runs-row-${run.id}-workflow-link`}
          className="truncate text-sm font-semibold text-foreground hover:underline"
        >
          {run.workflowName}
        </Link>
        <RunSourceBadge
          triggeredBy={run.triggeredBy}
          apiKeyPrefix={run.triggeredByApiKeyPrefix}
        />
        {run.isTest && (
          <span
            data-testid={`runs-row-${run.id}-test-marker`}
            className="inline-flex items-center rounded border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-700 dark:text-amber-300"
          >
            Test
          </span>
        )}
        <span className="ml-auto flex items-center gap-3 text-xs text-muted-foreground">
          <span
            data-testid={`runs-row-${run.id}-started`}
            title={new Date(run.startedAt).toISOString()}
          >
            {formatRunStartedAt(run.startedAt)}
          </span>
          <span aria-hidden>·</span>
          <span data-testid={`runs-row-${run.id}-duration`}>
            {formatRunDuration(run.durationMs)}
          </span>
        </span>
      </div>
      {run.errorClassification && (
        <div
          role={run.errorClassification.severity === "error" ? "alert" : "status"}
          data-testid={`runs-row-${run.id}-error`}
          className={
            "rounded border-l-2 bg-muted/30 px-3 py-2 text-xs " +
            (run.errorClassification.severity === "error"
              ? "border-l-destructive text-foreground"
              : "border-l-amber-500 text-foreground dark:border-l-amber-400")
          }
        >
          <p className="font-semibold">{run.errorClassification.title}</p>
          <p className="mt-0.5 text-muted-foreground">
            {run.errorClassification.description}
          </p>
          {run.errorClassification.hint && (
            <p className="mt-0.5 text-muted-foreground">
              {run.errorClassification.hint}
            </p>
          )}
        </div>
      )}
    </li>
  );
}
