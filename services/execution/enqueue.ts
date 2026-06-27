import { randomUUID } from "node:crypto";
import type { TriggerEvent } from "@/contracts/triggerEvent";
import * as workflowsRepo from "@/repositories/workflows";
import * as workflowRunsRepo from "@/repositories/workflowRuns";
import type { RunTriggerSource } from "./engine";

/**
 * Webhook / run-now / cron → execution handoff (the durable-queue boundary).
 *
 * Per docs/rules/webhook-receipt-routes.md §"Async dispatch only":
 *   - Dispatchers enqueue and return; execution runs asynchronously.
 *   - The route MUST return 200/202 once the run is DURABLY enqueued.
 *
 * Slice 6 durable run queue: `enqueueRun` persists a `workflow_runs` row in the
 * non-terminal 'queued' state and returns — it does NOT execute the engine
 * inline. A queued run is a committed row, so it survives a serverless/request
 * termination (the prior in-process "fire-and-forget + after()" interim could
 * drop an in-flight run on a node restart). Execution happens when the processor
 * (`services/execution/runQueueProcessor`) claims the row queued -> running:
 *   - the run-now route best-effort drains its own run immediately via `after()`
 *     for responsiveness;
 *   - the `/api/cron/process-run-queue` cron drains anything that survived a
 *     crash before it was claimed.
 *
 * The boundary is unchanged for callers: still `enqueueRun(input)` -> `{ runId,
 * enqueuedAt }`. The trigger_event lives on the run row (its designed home); no
 * separate queue table copies the raw provider payload.
 */

export interface EnqueueRunInput {
  workflowId: string;
  triggerNodeId: string;
  event: TriggerEvent;
  /**
   * Owning account for the durable run row. Optional: callers that already
   * loaded the workflow (run-now, webhook dispatch) pass it to avoid a redundant
   * lookup; otherwise `enqueueRun` resolves it from the workflow.
   */
  accountId?: string;
  /**
   * Slice 3.SEC-2 — forwarded to the engine's testMode flag (persisted to
   * `workflow_runs.is_test`). Default `false` (real execution).
   */
  testMode?: boolean;
  /**
   * Slice 3.SEC-2 — caller-supplied source label, written to
   * `workflow_runs.triggered_by`. Webhook → `"webhook"`, cron → `"scheduled"`,
   * run-now → `"manual"` / `"test"`.
   */
  triggeredBy?: RunTriggerSource;
  /**
   * 4.ACCOUNT-MODEL-8 — the human ACTOR's userId. Manual run-now + retry pass
   * the caller; webhook / cron omit it (→ NULL: no human actor).
   */
  triggeredByUserId?: string | null;
  /**
   * RH-2 — public API-key provenance. Set ONLY by the public API-key trigger
   * route; every other dispatcher omits them (→ NULL). The prefix is a
   * non-secret snapshot; the raw key/hash never reach the run path.
   */
  triggeredByApiKeyId?: string | null;
  triggeredByApiKeyPrefix?: string | null;
}

export interface EnqueueRunResult {
  runId: string;
  enqueuedAt: string;
}

/**
 * Persist a durable 'queued' run row and return its id. Does NOT run the engine
 * — the processor claims and executes the row out of band.
 *
 * Fail-open: if the durable INSERT fails unexpectedly (or the workflow vanished
 * between the caller's check and here), the run is logged and a `{runId}` is
 * still returned so the caller's 200/202 contract holds. The cron processor only
 * acts on committed 'queued' rows, so a failed persist simply means no run — it
 * never silently double-executes.
 */
export async function enqueueRun(input: EnqueueRunInput): Promise<EnqueueRunResult> {
  const runId = randomUUID();
  const enqueuedAt = new Date().toISOString();

  // Resolve the owning account if the caller didn't supply it. The durable run
  // row requires account_id (NOT NULL).
  let accountId = input.accountId;
  if (!accountId) {
    const workflow = await workflowsRepo.getByIdServiceRole(input.workflowId);
    accountId = workflow?.accountId;
  }

  if (accountId) {
    try {
      await workflowRunsRepo.createQueuedWorkflowRun({
        runId,
        workflowId: input.workflowId,
        accountId,
        triggeredByUserId: input.triggeredByUserId ?? null,
        triggerNodeId: input.triggerNodeId,
        triggerEvent: input.event,
        enqueuedAt,
        isTest: input.testMode === true,
        triggeredBy: input.triggeredBy ?? "unknown",
        triggeredByApiKeyId: input.triggeredByApiKeyId ?? null,
        triggeredByApiKeyPrefix: input.triggeredByApiKeyPrefix ?? null,
      });
      console.info(
        JSON.stringify({
          event: "execution.run.enqueued",
          runId,
          workflowId: input.workflowId,
          triggerNodeId: input.triggerNodeId,
          provider: input.event.provider,
          eventType: input.event.eventType,
          eventId: input.event.eventId,
          isTest: input.testMode === true,
          triggeredBy: input.triggeredBy ?? "unknown",
        }),
      );
    } catch (err) {
      // Fail-open: log loudly, do not throw into the caller's 200/202 path.
      console.error(
        JSON.stringify({
          event: "execution.run.enqueue_persist_failed",
          runId,
          workflowId: input.workflowId,
          error: (err as Error).message,
        }),
      );
    }
  } else {
    console.error(
      JSON.stringify({
        event: "execution.run.enqueue_workflow_missing",
        runId,
        workflowId: input.workflowId,
      }),
    );
  }

  return { runId, enqueuedAt };
}
