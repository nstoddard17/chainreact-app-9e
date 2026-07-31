import Link from "next/link";
import type { RunListItem } from "@/contracts/workflow";
import { failedRunCta } from "@/core/errors/failedRunCta";
import { resolveHelpLink } from "@/features/marketing/help/contextualHelp";
import { RunStatusBadge } from "./RunStatusBadge";
import { RunSourceBadge } from "./RunSourceBadge";
import { formatRunDuration, formatRunStartedAt } from "./formatRunDuration";
import { isStaleQueued, runStatusHelperCopy } from "./runStatusCopy";

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
 * `errorClassification.{title,description,hint}` plus ONE primary
 * next-action CTA derived from `errorClassification.action` via the
 * shared `failedRunCta` helper (CR-FAILREASON-2): reconnect → /apps,
 * upgrade_plan → /account, open_node → /workflows/{id} ("Fix workflow
 * setup", since a specific node isn't addressable from this list).
 * `retry_later` / `contact_support` have no safe destination yet, so
 * they render as guidance text (not a link). A missing/legacy action
 * renders no CTA.
 */
interface Props {
  run: RunListItem;
}

export function RunRow({ run }: Props) {
  // RUN-VISIBILITY-1 — non-terminal helper copy ("Waiting to start…" /
  // "Workflow is running…", with a gentle stale note for long-queued runs).
  // Computed against render-time `now`; the /runs page is statically rendered, so
  // this evaluates once per load (refreshing the page re-evaluates). Terminal
  // runs return null and render no extra line.
  const nowMs = Date.now();
  const helperCopy = runStatusHelperCopy(run.status, run.startedAt, nowMs);
  const staleQueued = isStaleQueued(run.status, run.startedAt, nowMs);
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
        {run.isTest &&
          (run.isLiveTest ? (
            // WORKFLOW-LIVE-TEST-4 — a consented live test made REAL external
            // calls; the plain "Test" marker (which implies none) would mislead.
            <span
              data-testid={`runs-row-${run.id}-live-test-marker`}
              className="inline-flex items-center rounded border border-rose-500/40 bg-rose-500/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-rose-700 dark:text-rose-300"
            >
              Live test
            </span>
          ) : (
            <span
              data-testid={`runs-row-${run.id}-test-marker`}
              className="inline-flex items-center rounded border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-700 dark:text-amber-300"
            >
              Test
            </span>
          ))}
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
      {helperCopy && (
        <p
          role="status"
          data-testid={`runs-row-${run.id}-pending`}
          className={
            "text-xs " +
            (staleQueued
              ? "text-amber-700 dark:text-amber-300"
              : "text-muted-foreground")
          }
        >
          {helperCopy}
        </p>
      )}
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
          <RunErrorCta
            runId={run.id}
            action={run.errorClassification.action}
            workflowId={run.workflowId}
          />
        </div>
      )}
    </li>
  );
}

/**
 * One primary next-action CTA for a failed run, from the shared `failedRunCta`
 * mapping. Renders an internal-route link for actionable destinations
 * (reconnect / upgrade_plan / open_node) and plain guidance text for actions
 * with no safe destination yet (retry_later / contact_support). Renders nothing
 * for a missing/legacy action — never a misleading CTA.
 *
 * HELP-CENTER-CONTEXTUAL-1 — a SECONDARY Help Center link renders beside the
 * primary CTA, mapped from the same classified action enum via the central
 * contextual-help resolver (general troubleshooting article for unknown/legacy
 * actions; deliberately absent for review_pending, where no user action is
 * needed). It never replaces or restyles the primary CTA.
 */
function RunErrorCta({
  runId,
  action,
  workflowId,
}: {
  runId: string;
  action: NonNullable<RunListItem["errorClassification"]>["action"];
  workflowId: string;
}) {
  const cta = failedRunCta(action, { workflowId });
  const help = resolveHelpLink({ type: "run_error", action });
  if (!cta && !help) return null;
  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
      {cta &&
        (cta.href ? (
          <Link
            href={cta.href}
            data-testid={`runs-row-${runId}-cta`}
            data-cta-action={action}
            className="inline-flex w-fit items-center text-xs font-medium text-foreground underline underline-offset-2 hover:no-underline"
          >
            {cta.label}
          </Link>
        ) : (
          <p
            data-testid={`runs-row-${runId}-cta`}
            data-cta-action={action}
            className="text-xs font-medium text-muted-foreground"
          >
            {cta.label}
          </p>
        ))}
      {help && (
        <Link
          href={help.href}
          data-testid={`runs-row-${runId}-help-link`}
          className="inline-flex w-fit items-center text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground hover:no-underline"
        >
          {help.label}
        </Link>
      )}
    </div>
  );
}
