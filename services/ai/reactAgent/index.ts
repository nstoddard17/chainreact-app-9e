/**
 * React Agent service boundary — entry (REACT-AGENT-CS-1-SERVICE-BOUNDARY).
 *
 * Exposes the boundary types plus a SAFE, SIDE-EFFECT-FREE dispatcher. CS-1's dispatcher
 * validates the request scope and returns a safe rejection for every intent — it calls no
 * model, runs no tool, mutates no workflow, reads no DB, and imports no route/auth/gating/
 * telemetry, no MCP, no fs, no child_process, no service-role client. CS-2+ replace the
 * `not_yet_available` branches with delegation to the EXISTING gated AI routes/brains
 * (`answerWorkflowQuestion`, `explainWorkflowDiagnosis`, the repair preview) — never
 * bypassing the route-level auth / account-membership / credit-gating those own.
 */

import {
  RECOGNIZED_REACT_AGENT_INTENTS,
  type ReactAgentAuditOutcome,
  type ReactAgentAuditRecorder,
  type ReactAgentAuditRecorderInput,
  type ReactAgentCapabilityOutcome,
  type ReactAgentIntent,
  type ReactAgentRequest,
  type ReactAgentResponse,
  type ReactAgentScope,
  type ReactAgentService,
} from "./types";
import {
  getReactAgentCapability,
  type ReactAgentCapabilityDefinition,
  type ReactAgentCapabilityId,
} from "./capabilities";

export type {
  ReactAgentScope,
  ReactAgentIntent,
  ReactAgentInput,
  ReactAgentRequest,
  ReactAgentResponse,
  ReactAgentNextAction,
  ReactAgentRejectionReason,
  ReactAgentCapabilityOutcome,
  ReactAgentAuditOutcome,
  ReactAgentAuditRecorder,
  ReactAgentAuditRecorderInput,
  ReactAgentService,
} from "./types";
export { RECOGNIZED_REACT_AGENT_INTENTS } from "./types";
export {
  REACT_AGENT_CAPABILITIES,
  getReactAgentCapability,
  type ReactAgentCapabilityId,
  type ReactAgentCapabilityMode,
  type ReactAgentCapabilityDefinition,
} from "./capabilities";

/** A non-empty, non-whitespace string. */
function isNonBlank(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * Scope is valid only when the acting user AND the owning account are present. This is
 * the account-scoping floor; nothing cross-account is representable. (Authorization that
 * `userId` may act for `accountId` stays a route/service responsibility — the boundary
 * only enforces shape, it does NOT grant access.)
 */
export function isValidReactAgentScope(scope: ReactAgentScope | undefined): boolean {
  return !!scope && isNonBlank(scope.userId) && isNonBlank(scope.accountId);
}

// Static, leak-safe copy. No ids, tokens, config, `{{...}}`, or raw model text.
const COPY = {
  invalid_scope:
    "I can't help with that yet — this assistant needs a signed-in account context.",
  unsupported_intent:
    "I can't help with that yet. Try asking about why a workflow won't run, or to explain a check.",
  not_yet_available:
    "The in-app assistant isn't available yet. For now, use Check workflow, Explain, and the repair suggestions in the builder.",
  // CS-3 — server-side invariant failures (unreachable on a correctly-wired route). Safe,
  // generic copy; never echoes the capability id / intent.
  unknown_capability: "I can't help with that yet.",
  intent_mismatch: "I can't help with that yet.",
} as const;

/**
 * CS-1 no-op dispatcher. Pure decision logic; no side effects.
 *
 * - invalid scope → `invalid_scope`
 * - `unknown` / unrecognized intent → `unsupported_intent`
 * - recognized intent (explain / answer / propose) → `not_yet_available` (handler lands CS-2+)
 */
export async function dispatchReactAgentRequest(
  request: ReactAgentRequest,
): Promise<ReactAgentResponse> {
  if (!isValidReactAgentScope(request.scope)) {
    return { ok: false, reason: "invalid_scope", message: COPY.invalid_scope };
  }

  const recognized = (RECOGNIZED_REACT_AGENT_INTENTS as readonly string[]).includes(
    request.intent,
  );
  if (!recognized) {
    return {
      ok: false,
      reason: "unsupported_intent",
      message: COPY.unsupported_intent,
    };
  }

  // Recognized but intentionally not wired in CS-1 — no model/tool/mutation happens here.
  return { ok: false, reason: "not_yet_available", message: COPY.not_yet_available };
}

/**
 * Server-side execution seam (CS-2, registry-gated in CS-3). The CALLER (a route) must have
 * ALREADY performed auth + account-membership + safe-DTO derivation + `aiCreditGate` before
 * invoking this. The boundary only:
 *   1. validates the scope SHAPE (it does NOT grant access — the route already did);
 *   2. looks up `capabilityId` in the registry — unknown id → safe failure, no `exec`;
 *   3. checks the request `intent` matches the capability's `allowedIntent` — else safe
 *      failure, no `exec`;
 *   4. runs the injected `exec` and returns its EXACT result.
 *
 * This is an explicit ALLOW-LIST, not a generic exec pipe — only a registered
 * `(capabilityId → allowedIntent)` pair can run. No model/HTTP/gate/mutation here — `exec`
 * is the already-authorized brain call, bound by the route. On a correctly-wired route the
 * result is always `{ ok: true, result }`; the `ok:false` branches guard server-side
 * invariants and never leak the id/intent (a future audit hook lives at this single seam).
 */
export async function runAuthorizedCapability<T>(input: {
  scope: ReactAgentScope;
  intent: ReactAgentIntent;
  capabilityId: ReactAgentCapabilityId;
  exec: () => Promise<T>;
  /** CS-5d — injected fail-open audit recorder (route-bound). Omitted → no emission. */
  auditRecorder?: ReactAgentAuditRecorder;
  /** CS-5d — map a RESOLVED result to an audit outcome (default `success`). */
  classifyResult?: (result: T) => ReactAgentAuditOutcome;
  /**
   * REACT-AGENT-PRODUCTION-TIMEOUT-1 — refine the SAFE audit reason for a non-success resolved
   * result. Default stays the generic `exec_failed`, which made every brain failure (timeout, gateway
   * outage, malformed reply) indistinguishable in `react_agent_audit_events` — the persistent record
   * a production incident is reconstructed from. Return a FIXED, enum-like string built from the
   * capability's own typed failure codes; NEVER raw model text, provider payloads, ids, or messages.
   * Wrapped fail-safe (a throw → the default reason) and capped at 128 chars by the recorder.
   */
  classifyReason?: (result: T) => string | null | undefined;
  /**
   * REACT-AGENT-RETRY-BACKOFF-1 — attach SAFE, aggregate metadata to the single audit row (e.g.
   * `{ attempts: 2, retryReason: "status_503" }`), so one user submission stays ONE governance
   * record even when it made two internal provider attempts.
   *
   * The seam historically attached NO metadata precisely so nothing raw could leak, and that default
   * is unchanged — this is opt-in per call site. What you return MUST be a small, fixed-key object of
   * numbers / booleans / policy enums. NEVER a prompt, model output, provider message, header, id, or
   * anything user-derived. The recorder additionally runs it through the shared `ai_cost_events`
   * denylist sanitizer, but that is defense in depth, not permission to pass raw data.
   * Wrapped fail-safe: a throw or a non-object → no metadata, never a broken user path.
   */
  classifyMetadata?: (result: T) => Record<string, unknown> | null | undefined;
  /**
   * CS-7b — derive an OPAQUE `proposed_patch_ref` from a RESOLVED result (e.g. a
   * deterministic content hash of the previewed operations + baseRevision). Called only
   * on the resolved path; must return a safe, one-way ref or `null`/`undefined` when no
   * deterministic patch identity exists. Wrapped fail-safe — a throw is treated as `null`
   * and never breaks the path. NEVER use this to smuggle raw patch/config/model text.
   */
  deriveProposedPatchRef?: (result: T) => string | null | undefined;
}): Promise<ReactAgentCapabilityOutcome<T>> {
  // Pure registry lookup (no side effect) up front so a denied audit still carries the
  // real mode / creditFeature / auditKind when the capability IS registered.
  const capability = getReactAgentCapability(input.capabilityId);

  // Emit at most one audit row per call. The injected recorder is fail-open (CS-5c), but
  // the seam ALSO swallows here as defense in depth — a misbehaving/rejecting recorder must
  // never throw into, or change the outcome of, the agent/user path. Emission is a pure
  // side effect; metadata defaults to NONE (so nothing raw can leak) and is only ever the
  // small, fixed-key aggregate an opt-in `classifyMetadata` returns (REACT-AGENT-RETRY-BACKOFF-1).
  // The only other result-derived field is the OPAQUE `proposedPatchRef` (CS-7b), never raw content.
  const emit = async (
    outcome: ReactAgentAuditOutcome,
    reason: string | null,
    proposedPatchRef: string | null = null,
    metadata: Record<string, unknown> | null = null,
  ): Promise<void> => {
    if (!input.auditRecorder) return;
    try {
      await input.auditRecorder.record({
        ...buildAuditInput(input.scope, input.intent, input.capabilityId, capability, outcome, reason, proposedPatchRef),
        ...(metadata ? { metadata } : {}),
      });
    } catch {
      // Fail-open at the seam: audit failures never break Q&A / Explain.
    }
  };

  if (!isValidReactAgentScope(input.scope)) {
    await emit("denied", "invalid_scope");
    return { ok: false, reason: "invalid_scope", message: COPY.invalid_scope };
  }
  if (!capability) {
    await emit("denied", "unknown_capability");
    return { ok: false, reason: "unknown_capability", message: COPY.unknown_capability };
  }
  if (capability.allowedIntent !== input.intent) {
    await emit("denied", "intent_mismatch");
    return { ok: false, reason: "intent_mismatch", message: COPY.intent_mismatch };
  }

  let result: T;
  try {
    result = await input.exec();
  } catch (error) {
    // `exec` threw (unexpected) — record `failed`, then RE-THROW so the route's existing
    // error behavior is preserved exactly (the seam does not swallow brain errors).
    await emit("failed", "exec_error");
    throw error;
  }
  // Resolved: `success` unless the route's classifier marks the result a failure
  // (e.g. a brain `{ ok: false }` model failure → `failed`).
  const outcome = input.classifyResult ? input.classifyResult(result) : "success";
  // CS-7b — derive the opaque patch ref from the resolved result, fail-safe (a missing
  // deterministic patch shape, or a throw, → null). Never affects the returned value.
  let proposedPatchRef: string | null = null;
  if (input.deriveProposedPatchRef) {
    try {
      proposedPatchRef = input.deriveProposedPatchRef(result) ?? null;
    } catch {
      proposedPatchRef = null;
    }
  }
  // REACT-AGENT-PRODUCTION-TIMEOUT-1 — a failed outcome may carry a refined, safe reason; a missing
  // classifier or a throw falls back to the original generic `exec_failed` (behavior unchanged).
  let reason: string | null = null;
  if (outcome !== "success") {
    reason = "exec_failed";
    if (input.classifyReason) {
      try {
        reason = input.classifyReason(result) ?? "exec_failed";
      } catch {
        reason = "exec_failed";
      }
    }
  }
  // REACT-AGENT-RETRY-BACKOFF-1 — opt-in safe aggregate metadata, fail-safe like the ref derivation.
  let metadata: Record<string, unknown> | null = null;
  if (input.classifyMetadata) {
    try {
      const candidate = input.classifyMetadata(result);
      metadata = candidate && typeof candidate === "object" && !Array.isArray(candidate) ? candidate : null;
    } catch {
      metadata = null;
    }
  }
  await emit(outcome, reason, proposedPatchRef, metadata);
  return { ok: true, result };
}

/**
 * Build the SAFE audit input from scope + registry metadata. Carries only ids, registry
 * enums, and a safe reason — NO metadata is attached at the seam (the recorder defaults it
 * to `{}`), so no raw question / model output / safe DTO / config / provider payload can
 * leak through this path. For the defensive `unknown_capability` branch the capability is
 * absent, so `mode` falls back to `read_only` (nothing executed) and `auditKind` to a
 * synthetic `react_agent.<id>`; `outcome: denied` + `reason: unknown_capability` carry the
 * real signal. `aiCostEventId` is intentionally NOT linked in CS-5d (see the slice doc).
 * `proposedPatchRef` (CS-7b) is an OPAQUE, one-way content ref or `null` — never raw patch.
 */
function buildAuditInput(
  scope: ReactAgentScope,
  intent: ReactAgentIntent,
  capabilityId: ReactAgentCapabilityId,
  capability: ReactAgentCapabilityDefinition | undefined,
  outcome: ReactAgentAuditOutcome,
  reason: string | null,
  proposedPatchRef: string | null,
): ReactAgentAuditRecorderInput {
  return {
    accountId: scope.accountId,
    actorUserId: scope.userId,
    workflowId: scope.workflowId ?? null,
    conversationId: scope.conversationId ?? null,
    capabilityId,
    intent,
    mode: capability?.mode ?? "read_only",
    creditFeature: capability?.creditFeature ?? null,
    auditKind: capability?.auditKind ?? `react_agent.${capabilityId}`,
    outcome,
    reason,
    ...(proposedPatchRef ? { proposedPatchRef } : {}),
  };
}

/**
 * Boundary implementation of the `ReactAgentService` contract. `handle` is the user-facing
 * text seam (CS-1); `runAuthorizedCapability` is the server-side execution seam (CS-2).
 * CS-3+ can swap in richer implementations behind the same interface (and, later, an
 * `AgentRuntimeAdapter` for Hermes).
 */
export const reactAgentService: ReactAgentService = {
  handle: dispatchReactAgentRequest,
  runAuthorizedCapability,
};
