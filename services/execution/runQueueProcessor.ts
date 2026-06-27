import * as workflowRunsRepo from "@/repositories/workflowRuns";
import type { QueuedRunDispatch } from "@/repositories/workflowRuns";
import { resolveStrict } from "@/workflow-engine/variables/resolveValue";
import { humanizeActionError } from "@/core/errors/humanizeActionError";
import { WorkflowEngine, type RunResult } from "./engine";

/**
 * Durable run-queue processor (Slice 6.DURABLE-QUEUE-1).
 *
 * Drains 'queued' workflow_runs rows that `enqueueRun` persisted and runs them
 * through the engine. Two entry points share `executeQueuedRun`:
 *   - `processQueuedRun(runId)` — the run-now inline fast path (the route hands
 *     this to `after()` for responsiveness while staying durable).
 *   - `processQueuedRuns({limit})` — the `/api/cron/process-run-queue` cron tick,
 *     the durability safety net for runs whose inline drain never ran or crashed
 *     before claiming.
 *
 * Single-execution guarantee: the engine claims each row via the status-guarded
 * `claimQueuedWorkflowRun` UPDATE (queued -> running), so if the inline drain and
 * the cron (or two cron ticks) race on the same run, only one wins; the loser's
 * engine call refuses as a duplicate dispatch. Provider action execution is
 * unchanged — this layer only decides WHEN a queued run reaches the (unchanged)
 * engine.
 */

export interface ProcessQueuedRunsOptions {
  /** Max queued runs to drain this tick (capped in the repo at 500). */
  limit: number;
}

export interface ProcessQueuedRunsOutcome {
  /** How many queued rows were fetched for this tick. */
  fetched: number;
  /** How many engine runs completed without throwing (incl. duplicate refusals). */
  processed: number;
  /** How many engine runs threw (logged; the row is left for the stale sweep). */
  failed: number;
}

/**
 * Build the engine and run ONE queued dispatch envelope. The engine claims the
 * row (single winner) and finalizes it. If the engine hit a pre-claim fatal
 * (WORKFLOW_NOT_FOUND / TRIGGER_NODE_NOT_FOUND) the row was never transitioned
 * out of 'queued' and would be re-selected forever — `failQueuedRunIfStillQueued`
 * finalizes it failed (race-safe: only acts while still queued).
 */
async function executeQueuedRun(dispatch: QueuedRunDispatch): Promise<void> {
  const engine = new WorkflowEngine({ resolveStrict });
  const result: RunResult = await engine.runWorkflow({
    runId: dispatch.runId,
    workflowId: dispatch.workflowId,
    triggerNodeId: dispatch.triggerNodeId,
    triggerEvent: dispatch.triggerEvent,
    testMode: dispatch.isTest,
    triggeredBy: dispatch.triggeredBy,
    triggeredByUserId: dispatch.triggeredByUserId,
    triggeredByApiKeyId: dispatch.triggeredByApiKeyId,
    triggeredByApiKeyPrefix: dispatch.triggeredByApiKeyPrefix,
    // executionDefinitionMode omitted → the engine derives it from testMode
    // (test → draft, real → live), reproducing exactly what every dispatcher
    // passed before durability (run-now used the same testMode-derived value).
  });

  if (result.status === "failed" && result.fatalError) {
    // No-op unless the engine never claimed the row (still 'queued'): a row the
    // engine claimed is now running/terminal and the WHERE status='queued'
    // predicate matches nothing.
    await workflowRunsRepo.failQueuedRunIfStillQueued({
      runId: dispatch.runId,
      fatalError: result.fatalError,
      errorClassification: humanizeActionError(result.fatalError),
      finishedAt: new Date().toISOString(),
    });
  }
}

/**
 * Drain ONE specific queued run (run-now inline fast path). No-op if the row is
 * absent or no longer queued (already claimed by the cron / another drain).
 * Never throws — safe to hand to `after()`.
 */
export async function processQueuedRun(runId: string): Promise<void> {
  try {
    const dispatch = await workflowRunsRepo.getQueuedRunForDispatch(runId);
    if (!dispatch) return;
    await executeQueuedRun(dispatch);
  } catch (err) {
    console.error(
      JSON.stringify({
        event: "execution.queue.drain_failed",
        runId,
        error: (err as Error).message,
      }),
    );
  }
}

/**
 * Drain up to `limit` oldest queued runs (cron tick). Each run is isolated: one
 * throwing engine run never aborts the batch. Returns counts only.
 */
export async function processQueuedRuns(
  options: ProcessQueuedRunsOptions,
): Promise<ProcessQueuedRunsOutcome> {
  const queued = await workflowRunsRepo.listQueuedWorkflowRunsForDispatch(
    options.limit,
  );

  let processed = 0;
  let failed = 0;
  for (const dispatch of queued) {
    try {
      await executeQueuedRun(dispatch);
      processed += 1;
    } catch (err) {
      failed += 1;
      console.error(
        JSON.stringify({
          event: "execution.queue.run_crashed",
          runId: dispatch.runId,
          workflowId: dispatch.workflowId,
          error: (err as Error).message,
        }),
      );
    }
  }

  return { fetched: queued.length, processed, failed };
}
