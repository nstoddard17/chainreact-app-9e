import {
  humanizeActionError,
  type HumanizedError,
} from "@/core/errors/humanizeActionError";
import * as workflowRunsRepo from "@/repositories/workflowRuns";
import { notifyWorkflowFailure } from "@/services/notifications/notifyWorkflowFailure";
import type { RunTaskUsage } from "@/services/billing/taskUsageRecorder";
import type { RunResult, RunWorkflowInput } from "./engineTypes";

/**
 * Run persistence + failure-notification fan-out helpers. Extracted from
 * `engine.ts` (max-lines lint cleanup, AI-28 follow-up).
 *
 * Pure module — does not import or instantiate `WorkflowEngine`. The engine
 * calls these helpers at finalize-time. No behavior change versus the
 * pre-extraction inline versions.
 */

type LogFn = (event: string, extra?: Record<string, unknown>) => void;

/**
 * Write the run row + humanized error_classification. Logs and swallows
 * persistence errors — the engine has done the work; a recordRun crash
 * shouldn't take down the dispatcher.
 *
 * The classification picks the first failed step's error (or the fatal
 * error when there are no steps). One classification per run is enough for
 * the UI's "show what went wrong" surface; per-step error details remain
 * available inside the steps[] payload for deeper diagnostics.
 */
export async function persistRun(
  result: RunResult,
  accountId: string,
  createdByUserId: string,
  workflowName: string,
  input: RunWorkflowInput,
  log: LogFn,
  usage?: RunTaskUsage | null,
): Promise<void> {
  const errorClassification = classifyForPersistence(result);
  try {
    await workflowRunsRepo.recordRun({
      runId: result.runId,
      workflowId: result.workflowId,
      // 4.ACCOUNT-MODEL-8: run row owned by the workflow's account; actor is
      // the human caller (manual/retry) or NULL (webhook/polling/cron/scheduled).
      accountId,
      triggeredByUserId: input.triggeredByUserId ?? null,
      status: result.status,
      triggerNodeId: input.triggerNodeId,
      triggerEvent: input.triggerEvent,
      steps: result.steps,
      fatalError: result.fatalError ?? null,
      errorClassification,
      startedAt: result.startedAt,
      finishedAt: result.finishedAt,
      isTest: result.isTest,
      triggeredBy: result.triggeredBy,
      // COST-3 — null for test runs + fatal-before-execution paths.
      estimatedTaskCost: usage ? usage.estimatedTaskCost : null,
      actualTaskCost: usage ? usage.actualTaskCost : null,
      taskCostPolicyVersion: usage ? usage.policyVersion : null,
    });
  } catch (err) {
    log("execution.run.persist_failed", { error: (err as Error).message });
  }

  // Notification recipient is the workflow's creator (user-delivered in Phase B).
  await notifyOnFailure(result, createdByUserId, workflowName, log, errorClassification);
}

/**
 * COST-15C — finalize a run by UPDATING the pre-run row created at start.
 * Falls back to a `recordRun` INSERT when the pre-run row was never created
 * (createWorkflowRunStart failed earlier) or has unexpectedly vanished, so a
 * run record is never lost. Never writes billing_status / reservation columns
 * (RPC-owned). Then runs the failure-notification fan-out. Fail-open: a
 * persistence error is logged and swallowed.
 */
export async function finalizeRun(
  result: RunResult,
  accountId: string,
  createdByUserId: string,
  workflowName: string,
  input: RunWorkflowInput,
  log: LogFn,
  usage: RunTaskUsage | null,
  preRunRowCreated: boolean,
): Promise<void> {
  const errorClassification = classifyForPersistence(result);
  try {
    let finalized = false;
    if (preRunRowCreated) {
      const outcome = await workflowRunsRepo.finalizeWorkflowRun({
        runId: result.runId,
        status: result.status,
        steps: result.steps,
        fatalError: result.fatalError ?? null,
        errorClassification,
        finishedAt: result.finishedAt,
        // Only real runs have usage → cost columns. Test runs leave them as the
        // create-time NULL (omitted ⇒ finalize does not overwrite).
        ...(usage
          ? {
              estimatedTaskCost: usage.estimatedTaskCost,
              actualTaskCost: usage.actualTaskCost,
              taskCostPolicyVersion: usage.policyVersion,
            }
          : {}),
      });
      finalized = outcome.finalized;
      if (!finalized) {
        log("execution.run.finalize_no_row", { runId: result.runId });
      }
    }
    if (!finalized) {
      // No pre-run row (create failed) or it vanished — INSERT so the record
      // isn't lost. This is the only path that can also INSERT at finalize.
      await workflowRunsRepo.recordRun({
        runId: result.runId,
        workflowId: result.workflowId,
        accountId,
        triggeredByUserId: input.triggeredByUserId ?? null,
        status: result.status,
        triggerNodeId: input.triggerNodeId,
        triggerEvent: input.triggerEvent,
        steps: result.steps,
        fatalError: result.fatalError ?? null,
        errorClassification,
        startedAt: result.startedAt,
        finishedAt: result.finishedAt,
        isTest: result.isTest,
        triggeredBy: result.triggeredBy,
        estimatedTaskCost: usage ? usage.estimatedTaskCost : null,
        actualTaskCost: usage ? usage.actualTaskCost : null,
        taskCostPolicyVersion: usage ? usage.policyVersion : null,
      });
    }
  } catch (err) {
    log("execution.run.persist_failed", { error: (err as Error).message });
  }
  await notifyOnFailure(result, createdByUserId, workflowName, log, errorClassification);
}

/**
 * Workflow-failure notification fan-out — shared by the INSERT (persistRun),
 * UPDATE (finalizeRun), and mark-failed (BILLING_EXHAUSTED) paths. One
 * classified event → atomic dedup claim → enabled channels. Best-effort:
 * orchestrator failures are logged, never propagated (the run already persisted;
 * the user can still see it on the workflow detail page).
 */
export async function notifyOnFailure(
  result: RunResult,
  userId: string,
  workflowName: string,
  log: LogFn,
  errorClassification: HumanizedError | null,
): Promise<void> {
  if (result.status === "failed" && errorClassification) {
    try {
      const outcome = await notifyWorkflowFailure({
        userId,
        workflowId: result.workflowId,
        workflowName,
        runId: result.runId,
        errorClassification,
      });
      if (!outcome.claimed) {
        log("execution.run.notify_skipped", { reason: outcome.reason });
      }
    } catch (err) {
      log("execution.run.notify_failed", { error: (err as Error).message });
    }
  }
}

export function classifyForPersistence(result: RunResult): HumanizedError | null {
  if (result.status === "succeeded") return null;

  // Prefer the first failed step (per-node specificity); fall back to the
  // run-level fatal when no step ran.
  const firstFailed = result.steps.find((s) => s.status === "failed");
  if (firstFailed?.error) {
    return humanizeActionError({
      code: firstFailed.error.code,
      message: firstFailed.error.message,
      ...(firstFailed.error.details !== undefined
        ? { details: firstFailed.error.details }
        : {}),
    });
  }
  if (result.fatalError) {
    return humanizeActionError({
      code: result.fatalError.code,
      message: result.fatalError.message,
    });
  }
  return null;
}
