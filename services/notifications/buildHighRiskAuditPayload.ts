import type { ConfirmationRequiredAction } from "@/services/workflows/riskConfirmation";

/**
 * Slice 3.POSTSEC-8 — pure builder for high-risk workflow audit
 * notification payloads.
 *
 * The builder is the SINGLE choke point that decides what makes it
 * into the `notifications.metadata` jsonb column for high-risk audit
 * events. It is pure: no DB, no network, no logging. It accepts a
 * tightly typed input (already-safe shape — `ConfirmationRequiredAction`
 * is route-safe by SEC-4B design) and emits a tightly typed output.
 *
 * Safe-payload requirements (from POSTSEC-8 spec):
 *
 *   - INCLUDED:
 *       workflowId, workflowName, runId (when present), actorUserId,
 *       isTest, triggeredBy, eventType, emittedAt, and the
 *       confirmationRequiredActions array — each entry carrying
 *       nodeId / provider / type / displayName / optional
 *       riskDescription (all route-safe).
 *
 *   - EXCLUDED:
 *       node config, resolved variable values, Stripe object IDs,
 *       provider response data, secrets, raw workflow definition.
 *
 * The route-safe shape of `ConfirmationRequiredAction` already
 * enforces the exclusion (riskConfirmation.ts only ever projects
 * displayName + nodeId + provider + type + optional riskDescription —
 * NEVER config or resolved values). The builder additionally:
 *
 *   - Defensively re-projects each action so any future field
 *     accidentally added to the type does not leak into the payload
 *     — only the documented sub-set ships.
 *   - Refuses to embed the workflow name verbatim into the audit
 *     metadata if it is empty / whitespace — falls back to a safe
 *     placeholder. The name is still surfaced via the `title` / `body`
 *     copy where the caller already supplied it.
 *   - Does NOT accept arbitrary metadata — there is no `extras` or
 *     `...rest` field in the input type.
 *
 * Output shape is structured `{ title, body, metadata }` so the
 * caller (notifyHighRiskWorkflowEvent.ts) can pass it straight into
 * `notificationsRepo.create()` without further transformation.
 */

export type HighRiskAuditEventType =
  | "workflow_high_risk_activated"
  | "workflow_high_risk_run";

export interface BuildHighRiskAuditPayloadInput {
  /** Audit event type — drives title / body copy + metadata.eventType. */
  eventType: HighRiskAuditEventType;
  /** Workflow primary key. */
  workflowId: string;
  /**
   * Workflow display name. Surfaced in the notification title / body
   * so the owner can identify which workflow tripped the audit. Empty
   * / whitespace-only is tolerated — the builder falls back to a
   * placeholder.
   */
  workflowName: string;
  /** Auth-resolved user id of whoever triggered the lifecycle action. */
  actorUserId: string;
  /**
   * Run id — present only for `workflow_high_risk_run` events. For
   * activation events this is undefined; the builder enforces the
   * runId/eventType pairing.
   */
  runId?: string;
  /**
   * Run mode for run-now events. Encoded so admins / future
   * cross-workflow queries can filter out test runs without
   * cross-referencing `workflow_runs`. Absent for activation events.
   */
  isTest?: boolean;
  /**
   * Provenance for run-now events — mirrors `workflow_runs.triggered_by`.
   * Absent for activation events.
   */
  triggeredBy?: string;
  /**
   * The route-safe confirmation-required action descriptors
   * (`services/workflows/riskConfirmation.ts:ConfirmationRequiredAction`)
   * that the caller computed at the route layer. Each entry is already
   * route-safe by SEC-4B design; the builder defensively re-projects.
   */
  confirmationRequiredActions: readonly ConfirmationRequiredAction[];
  /**
   * ISO timestamp when the event was emitted. Caller supplies so the
   * builder stays pure (no `new Date()`); tests inject a deterministic
   * value.
   */
  emittedAt: string;
}

/** Shape that goes directly into `notificationsRepo.create()`. */
export interface HighRiskAuditNotification {
  title: string;
  body: string;
  metadata: HighRiskAuditMetadata;
}

/**
 * Structured metadata persisted in `notifications.metadata`. Stays in
 * lockstep with the payload builder's output — every field is
 * route-safe and audit-relevant. `JSON.stringify(metadata)` must
 * NEVER contain `config`, `resolved`, secrets, Stripe object IDs,
 * provider response data, or raw workflow definition.
 */
export interface HighRiskAuditMetadata {
  eventType: HighRiskAuditEventType;
  workflowId: string;
  workflowName: string;
  actorUserId: string;
  runId?: string;
  isTest?: boolean;
  triggeredBy?: string;
  emittedAt: string;
  confirmationRequiredActions: readonly HighRiskAuditAction[];
}

/**
 * The minimum projection of `ConfirmationRequiredAction` the builder
 * is willing to emit. Even if the source type ever gains a config /
 * resolved field, the builder will not let it through.
 */
export interface HighRiskAuditAction {
  nodeId: string;
  provider: string;
  type: string;
  displayName: string;
  riskDescription?: string;
}

const PLACEHOLDER_WORKFLOW_NAME = "(unnamed workflow)";

/**
 * Build a high-risk audit notification payload.
 *
 * Pure. No DB / network / logging. Throws on contract violations
 * (e.g. eventType=workflow_high_risk_run with no runId) — caller is
 * expected to pre-check; the throw is defense-in-depth so a
 * misuse-bug doesn't silently emit a malformed audit row.
 */
export function buildHighRiskAuditPayload(
  input: BuildHighRiskAuditPayloadInput,
): HighRiskAuditNotification {
  // Enforce eventType ↔ field pairing. The route layer guarantees
  // this; the throw exists so a future caller can't drift.
  if (input.eventType === "workflow_high_risk_run" && input.runId === undefined) {
    throw new Error(
      "buildHighRiskAuditPayload: workflow_high_risk_run requires runId.",
    );
  }
  if (
    input.eventType === "workflow_high_risk_activated" &&
    input.runId !== undefined
  ) {
    throw new Error(
      "buildHighRiskAuditPayload: workflow_high_risk_activated must not carry runId.",
    );
  }

  const workflowName = sanitizeName(input.workflowName);
  const actions = input.confirmationRequiredActions.map(projectAction);

  const metadata: HighRiskAuditMetadata = {
    eventType: input.eventType,
    workflowId: input.workflowId,
    workflowName,
    actorUserId: input.actorUserId,
    ...(input.runId !== undefined ? { runId: input.runId } : {}),
    ...(input.isTest !== undefined ? { isTest: input.isTest } : {}),
    ...(input.triggeredBy !== undefined
      ? { triggeredBy: input.triggeredBy }
      : {}),
    emittedAt: input.emittedAt,
    confirmationRequiredActions: actions,
  };

  const { title, body } = buildCopy({ ...input, workflowName, actionCount: actions.length });
  return { title, body, metadata };
}

function sanitizeName(name: string): string {
  const trimmed = name.trim();
  return trimmed.length === 0 ? PLACEHOLDER_WORKFLOW_NAME : trimmed;
}

/**
 * Defensive re-projection. Only the documented sub-set of
 * `ConfirmationRequiredAction` makes it through. If the source type
 * gains fields, this projection stays narrow.
 */
function projectAction(
  action: ConfirmationRequiredAction,
): HighRiskAuditAction {
  return {
    nodeId: action.nodeId,
    provider: action.provider,
    type: action.type,
    displayName: action.displayName,
    ...(action.riskDescription !== undefined
      ? { riskDescription: action.riskDescription }
      : {}),
  };
}

interface CopyInput {
  eventType: HighRiskAuditEventType;
  workflowName: string;
  actionCount: number;
  isTest?: boolean;
}

function buildCopy(input: CopyInput): { title: string; body: string } {
  if (input.eventType === "workflow_high_risk_activated") {
    return {
      title: "High-risk workflow activated",
      body: `Workflow "${input.workflowName}" was activated after typed confirmation. ${pluralActions(input.actionCount)} require confirmation.`,
    };
  }
  // workflow_high_risk_run
  return {
    title: "High-risk workflow run",
    body: `Workflow "${input.workflowName}" ran manually after typed confirmation. ${pluralActions(input.actionCount)} require confirmation.`,
  };
}

function pluralActions(count: number): string {
  if (count === 1) return "1 action";
  return `${count} actions`;
}
