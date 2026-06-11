import { randomUUID } from "node:crypto";
import type { TriggerEvent } from "@/contracts/triggerEvent";
import { resolveStrict } from "@/workflow-engine/variables/resolveValue";
import { WorkflowEngine, type RunTriggerSource } from "./engine";

/**
 * Webhook → execution handoff.
 *
 * Per docs/rules/webhook-receipt-routes.md §"Async dispatch only":
 *   - Webhook routes enqueue and return; execution runs asynchronously.
 *   - The route MUST return 200 once events are durably enqueued (here:
 *     once we've assigned a runId and kicked off the engine). The engine's
 *     own failures are logged out-of-band and never propagate back to the
 *     provider's webhook delivery.
 *
 * For Slice 1 the "queue" is in-process: we fire-and-forget the engine
 * promise. This trades durability for simplicity — a node restart between
 * enqueue and engine completion drops the run. Real durability lands when
 * the queue (BullMQ / Inngest / equivalent) ships, with no API change to
 * the dispatcher (it still calls enqueueRun and gets back { runId }).
 */

export interface EnqueueRunInput {
  workflowId: string;
  triggerNodeId: string;
  event: TriggerEvent;
  /**
   * Slice 3.SEC-2 — Forward to the engine's testMode flag. When true,
   * the engine consults `decideTestModeBlock` before invoking each
   * handler and short-circuits high-risk / external actions. Default
   * `false` (real execution).
   */
  testMode?: boolean;
  /**
   * Slice 3.SEC-2 — Caller-supplied source label. Engine writes this to
   * `workflow_runs.triggered_by`. Webhook dispatchers should pass
   * `"webhook"`, cron should pass `"scheduled"`, run-now should pass
   * `"manual"` (or `"test"` when the same route is used for a test run).
   */
  triggeredBy?: RunTriggerSource;
  /**
   * 4.ACCOUNT-MODEL-8 — the human ACTOR's userId, forwarded to
   * `workflow_runs.triggered_by_user_id`. Manual run-now + retry pass the
   * caller's id; webhook dispatchers + cron omit it (→ NULL: no human actor).
   */
  triggeredByUserId?: string | null;
  /**
   * RH-2 — public API-key provenance, forwarded to
   * `workflow_runs.triggered_by_api_key_id` / `_prefix`. Set ONLY by the public
   * API-key trigger route; every other dispatcher omits them (→ NULL). The prefix
   * is a non-secret snapshot; the raw key/hash never reach the run path.
   */
  triggeredByApiKeyId?: string | null;
  triggeredByApiKeyPrefix?: string | null;
  /**
   * Serverless lifecycle extender. The background engine promise is
   * fire-and-forget by default, which on a serverless platform can be
   * frozen/recycled the instant the caller's HTTP response is sent — the
   * run then never finalizes and its `workflow_runs` row is left stuck in
   * `status='running'` (hidden by the Runs-page `neq('status','running')`
   * read). Request-scoped callers (the run-now route) pass an extender —
   * Next's `after` (backed by Vercel `waitUntil`) — so the platform keeps
   * the instance alive until the engine reaches a terminal status.
   *
   * Layering: this service stays framework-agnostic; the route owns the
   * `next/server` primitive and hands it in here. Omitted by non-request
   * callers (webhook/cron dispatchers — out of scope for this slice) and
   * unit tests → best-effort fire-and-forget, exactly as before.
   *
   * `runWorkflowInBackground` swallows engine errors, so the promise NEVER
   * rejects — the extender never sees an unhandled rejection.
   */
  keepAlive?: (executionPromise: Promise<void>) => void;
}

export interface EnqueueRunResult {
  runId: string;
  enqueuedAt: string;
}

export async function enqueueRun(input: EnqueueRunInput): Promise<EnqueueRunResult> {
  const runId = randomUUID();
  const enqueuedAt = new Date().toISOString();

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

  // Kick off execution immediately. The promise never rejects
  // (runWorkflowInBackground catches + logs engine errors). When a
  // request-scoped caller supplies `keepAlive`, hand the promise to the
  // platform lifecycle (Next `after` → Vercel `waitUntil`) so the instance
  // is kept alive until the run finalizes; otherwise fall back to the
  // legacy best-effort fire-and-forget.
  const executionPromise = runWorkflowInBackground(input, runId);
  if (input.keepAlive) {
    input.keepAlive(executionPromise);
  } else {
    void executionPromise;
  }

  return { runId, enqueuedAt };
}

async function runWorkflowInBackground(
  input: EnqueueRunInput,
  runId: string,
): Promise<void> {
  try {
    const engine = new WorkflowEngine({ resolveStrict });
    await engine.runWorkflow({
      workflowId: input.workflowId,
      triggerNodeId: input.triggerNodeId,
      triggerEvent: input.event,
      runId,
      testMode: input.testMode === true,
      triggeredBy: input.triggeredBy ?? "unknown",
      triggeredByUserId: input.triggeredByUserId ?? null,
      triggeredByApiKeyId: input.triggeredByApiKeyId ?? null,
      triggeredByApiKeyPrefix: input.triggeredByApiKeyPrefix ?? null,
    });
  } catch (err) {
    console.error(
      JSON.stringify({
        event: "execution.run.crashed",
        runId,
        workflowId: input.workflowId,
        error: (err as Error).message,
      }),
    );
  }
}
