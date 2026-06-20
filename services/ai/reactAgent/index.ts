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
  type ReactAgentCapabilityOutcome,
  type ReactAgentIntent,
  type ReactAgentRequest,
  type ReactAgentResponse,
  type ReactAgentScope,
  type ReactAgentService,
} from "./types";
import {
  getReactAgentCapability,
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
}): Promise<ReactAgentCapabilityOutcome<T>> {
  if (!isValidReactAgentScope(input.scope)) {
    return { ok: false, reason: "invalid_scope", message: COPY.invalid_scope };
  }
  const capability = getReactAgentCapability(input.capabilityId);
  if (!capability) {
    return { ok: false, reason: "unknown_capability", message: COPY.unknown_capability };
  }
  if (capability.allowedIntent !== input.intent) {
    return { ok: false, reason: "intent_mismatch", message: COPY.intent_mismatch };
  }
  const result = await input.exec();
  return { ok: true, result };
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
