import * as notificationsRepo from "@/repositories/notifications";
import type { ConfirmationRequiredAction } from "@/services/workflows/riskConfirmation";
import {
  buildHighRiskAuditPayload,
  type HighRiskAuditEventType,
} from "./buildHighRiskAuditPayload";

/**
 * Slice 3.POSTSEC-8 — emit a high-risk workflow lifecycle audit event
 * into the existing in-app notifications surface.
 *
 * Architecture (per POSTSEC-8 spec — "use existing infra, don't fork a
 * parallel system"):
 *
 *   - The notifications table is the durable in-app feed surface that
 *     workflow owners already see at `/notifications`. POSTSEC-8 adds
 *     two new `notification_type` enum values
 *     (`workflow_high_risk_activated`, `workflow_high_risk_run`) and
 *     writes via the existing `notificationsRepo.create` path.
 *
 *   - The existing `notifyWorkflowFailure` orchestrator is failure-
 *     specific (typed against `WorkflowFailurePayload` /
 *     `HumanizedError`). Repurposing it would force a refactor that
 *     POSTSEC-8 explicitly avoids. Instead, this helper writes
 *     directly to the repo with a tightly-typed audit payload.
 *
 *   - Severity is `warning` — the user typed CONFIRM, so the event is
 *     informational + audit-trail, not an error.
 *
 *   - Best-effort delivery: any failure to insert is caught and
 *     swallowed so an audit-write error never blocks the activation /
 *     run-now route from returning success. The caller's lifecycle
 *     action already succeeded by the time this fires; failing the
 *     route on a downstream audit failure would be wrong UX.
 *
 *   - Future expansion: a cross-user / admin "high-risk events feed"
 *     can be a separate query against this table filtered by
 *     `type IN ('workflow_high_risk_activated', 'workflow_high_risk_run')`
 *     — no schema change needed.
 */

export interface HighRiskActivatedInput {
  workflowId: string;
  workflowName: string;
  actorUserId: string;
  /** Route-safe action descriptors from `findConfirmationRequiredActions`. */
  confirmationRequiredActions: readonly ConfirmationRequiredAction[];
}

export interface HighRiskRunInput extends HighRiskActivatedInput {
  runId: string;
  /** Engine test-mode flag — Run Now sends false. */
  isTest: boolean;
  /** `manual` for real runs; mirrors `workflow_runs.triggered_by`. */
  triggeredBy: string;
}

export type EmitOutcome = "emitted" | "skipped_no_actions" | "skipped_test_mode" | "failed";

export interface EmitResult {
  outcome: EmitOutcome;
  /** Populated only on `outcome === "failed"`. Free-text, no secrets. */
  reason?: string;
}

/**
 * Emit `workflow_high_risk_activated`. Caller is the activate route;
 * it has already confirmed the user typed the correct phrase and the
 * orchestrator returned success.
 *
 * No-op (returns `skipped_no_actions`) when the actions array is
 * empty — defensive: the route should only call this when
 * `risk.requiresConfirmation` was true, but the check costs nothing.
 */
export async function notifyHighRiskActivation(
  input: HighRiskActivatedInput,
): Promise<EmitResult> {
  if (input.confirmationRequiredActions.length === 0) {
    return { outcome: "skipped_no_actions" };
  }
  return emit({
    eventType: "workflow_high_risk_activated",
    workflowId: input.workflowId,
    workflowName: input.workflowName,
    actorUserId: input.actorUserId,
    confirmationRequiredActions: input.confirmationRequiredActions,
  });
}

/**
 * Emit `workflow_high_risk_run`. Caller is the run-now route; it has
 * already confirmed the user typed the correct phrase AND that the
 * run is real-mode (testMode === false). Test-mode runs MUST NOT emit
 * this event — SEC-2 already blocks external handlers, and a test
 * run on a destructive workflow doesn't carry the same audit weight
 * as a real one.
 *
 * Returns `skipped_test_mode` if a caller mistakenly passes
 * `isTest: true` — defense-in-depth, the route layer already filters.
 */
export async function notifyHighRiskRun(
  input: HighRiskRunInput,
): Promise<EmitResult> {
  if (input.isTest) {
    return { outcome: "skipped_test_mode" };
  }
  if (input.confirmationRequiredActions.length === 0) {
    return { outcome: "skipped_no_actions" };
  }
  return emit({
    eventType: "workflow_high_risk_run",
    workflowId: input.workflowId,
    workflowName: input.workflowName,
    actorUserId: input.actorUserId,
    runId: input.runId,
    isTest: input.isTest,
    triggeredBy: input.triggeredBy,
    confirmationRequiredActions: input.confirmationRequiredActions,
  });
}

interface EmitParams {
  eventType: HighRiskAuditEventType;
  workflowId: string;
  workflowName: string;
  actorUserId: string;
  runId?: string;
  isTest?: boolean;
  triggeredBy?: string;
  confirmationRequiredActions: readonly ConfirmationRequiredAction[];
}

async function emit(params: EmitParams): Promise<EmitResult> {
  try {
    const payload = buildHighRiskAuditPayload({
      eventType: params.eventType,
      workflowId: params.workflowId,
      workflowName: params.workflowName,
      actorUserId: params.actorUserId,
      ...(params.runId !== undefined ? { runId: params.runId } : {}),
      ...(params.isTest !== undefined ? { isTest: params.isTest } : {}),
      ...(params.triggeredBy !== undefined
        ? { triggeredBy: params.triggeredBy }
        : {}),
      confirmationRequiredActions: params.confirmationRequiredActions,
      emittedAt: new Date().toISOString(),
    });
    await notificationsRepo.create({
      userId: params.actorUserId,
      type: params.eventType,
      severity: "warning",
      title: payload.title,
      body: payload.body,
      // Action URL points at the workflow detail page. Internal app
      // path only — never a full URL.
      actionUrl: `/workflows/${params.workflowId}`,
      metadata: payload.metadata as unknown as Record<string, unknown>,
    });
    return { outcome: "emitted" };
  } catch (err) {
    // Audit-write failures MUST NOT block the route from returning
    // success — the lifecycle action already succeeded.
    return {
      outcome: "failed",
      reason: err instanceof Error ? err.message : "unknown error",
    };
  }
}
