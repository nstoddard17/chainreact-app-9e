import { humanizeActionError } from "@/core/errors/humanizeActionError";
import * as workflowRunsRepo from "@/repositories/workflowRuns";

/**
 * Stale-'queued' workflow-run sweep (durable-queue safety net).
 *
 * The queue counterpart to the stale-'running' sweep. enqueueRun persists a
 * 'queued' row; the processor (run-now inline drain + the every-minute
 * /api/cron/process-run-queue cron) normally claims it within ~a minute. A row
 * still 'queued' long after `started_at` (the enqueue placeholder) means it was
 * never claimed — a wedged worker or a cron outage. This sweep finalizes such
 * rows as 'failed' with a humanized error so a launch never leaves runs hanging
 * 'queued' indefinitely. The backlog ALERT surfaces the live condition to ops;
 * this gives each affected run a real terminal state.
 *
 * Run-lifecycle state ONLY — never touches billing columns. Race-safe with the
 * processor's claim (predicate `status='queued'` stops matching once claimed).
 */

/** Default staleness threshold: a run still 'queued' 30+ min after enqueue. */
export const STALE_QUEUED_RUN_DEFAULT_AGE_MS = 30 * 60 * 1000;

/** Reuses the existing humanized taxonomy entry (run never reached execution). */
export const STALE_QUEUED_RUN_FAILURE_CODE = "EXECUTION_INTERRUPTED";

export interface SweepStaleQueuedOptions {
  /** Rows older than this (by `started_at`/enqueue time) are stale. Default 30 min. */
  olderThanMs?: number;
  /** Injectable clock for deterministic tests. Default `new Date()`. */
  now?: Date;
  /** Optional batch cap per invocation. */
  limit?: number;
}

export interface SweepStaleQueuedOutcome {
  sweptCount: number;
  runIds: string[];
  cutoff: string;
  olderThanMs: number;
}

export async function sweepStaleQueuedWorkflowRuns(
  options: SweepStaleQueuedOptions = {},
): Promise<SweepStaleQueuedOutcome> {
  const olderThanMs = options.olderThanMs ?? STALE_QUEUED_RUN_DEFAULT_AGE_MS;
  const now = options.now ?? new Date();
  const cutoff = new Date(now.getTime() - olderThanMs).toISOString();
  const finishedAt = now.toISOString();

  const minutes = Math.round(olderThanMs / 60_000);
  const message = `Run never started: still 'queued' ${minutes}+ minutes after it was enqueued — the run-queue processor did not claim it (a wedged worker or cron outage).`;
  const fatalError = { code: STALE_QUEUED_RUN_FAILURE_CODE, message };
  const errorClassification = humanizeActionError({
    code: STALE_QUEUED_RUN_FAILURE_CODE,
    message,
  });

  const result = await workflowRunsRepo.sweepStaleQueuedWorkflowRuns({
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
