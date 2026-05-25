import * as workflowRunsRepo from "@/repositories/workflowRuns";
import { humanizeActionError } from "@/core/errors/humanizeActionError";

/**
 * Stale 'running' workflow-run sweep (Slice 4.COST-15F).
 *
 * Crash recovery for the COST-15C pre-run-row lifecycle: when the engine
 * process dies between `createWorkflowRunStart` and finalize, the row is left
 * stuck in status='running' (hidden from the UI by the running-row read
 * filter). This service marks such rows failed once they pass a staleness
 * cutoff, so they finalize like any other failed run.
 *
 * Lifecycle cleanup ONLY — it does NOT change billing: no balance mutation, no
 * reserve/reconcile RPC, no task_usage_events. It is intentionally SEPARATE
 * from the COST-12 `release_expired_reservations` sweep, which reclaims reserved
 * BILLING HOLDS (a different concern). Staleness is measured on `started_at`
 * (NOT NULL, set when execution began).
 *
 * NOT scheduled by this slice — wiring to a cron/route is a future deployment
 * decision. Invoke from the guarded ops script (`scripts/sweep-stale-workflow-
 * runs.mjs`) or a future cron.
 */

/** Default staleness threshold: a run still 'running' 60+ min after start. */
export const STALE_RUNNING_RUN_DEFAULT_AGE_MS = 60 * 60 * 1000;

/** Fatal code stamped on swept rows; humanized via core/errors. */
export const STALE_RUNNING_RUN_FAILURE_CODE = "EXECUTION_INTERRUPTED";

export interface SweepStaleRunningOptions {
  /** Rows older than this (by `started_at`) are stale. Default 60 min. */
  olderThanMs?: number;
  /** Injectable clock for deterministic tests. Default `new Date()`. */
  now?: Date;
  /** Optional batch cap per invocation. */
  limit?: number;
}

export interface SweepStaleRunningOutcome {
  sweptCount: number;
  runIds: string[];
  cutoff: string;
  olderThanMs: number;
}

/**
 * Build the failure payload + cutoff and delegate the UPDATE to the repository.
 * Returns the swept count + ids + the cutoff used. Idempotent (the repo
 * predicate stops matching a row once swept).
 */
export async function sweepStaleRunningWorkflowRuns(
  options: SweepStaleRunningOptions = {},
): Promise<SweepStaleRunningOutcome> {
  const olderThanMs = options.olderThanMs ?? STALE_RUNNING_RUN_DEFAULT_AGE_MS;
  const now = options.now ?? new Date();
  const cutoff = new Date(now.getTime() - olderThanMs).toISOString();
  const finishedAt = now.toISOString();

  const minutes = Math.round(olderThanMs / 60_000);
  const message = `Run interrupted: still 'running' with no finish ${minutes}+ minutes after it started — the engine process likely restarted mid-execution.`;
  const fatalError = { code: STALE_RUNNING_RUN_FAILURE_CODE, message };
  const errorClassification = humanizeActionError({
    code: STALE_RUNNING_RUN_FAILURE_CODE,
    message,
  });

  const result = await workflowRunsRepo.sweepStaleRunningWorkflowRuns({
    cutoff,
    fatalError,
    errorClassification,
    finishedAt,
    ...(options.limit !== undefined ? { limit: options.limit } : {}),
  });

  return {
    sweptCount: result.sweptCount,
    runIds: result.runIds,
    cutoff: result.cutoff,
    olderThanMs,
  };
}
