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
  type ReactAgentRequest,
  type ReactAgentResponse,
  type ReactAgentScope,
  type ReactAgentService,
} from "./types";

export type {
  ReactAgentScope,
  ReactAgentIntent,
  ReactAgentInput,
  ReactAgentRequest,
  ReactAgentResponse,
  ReactAgentNextAction,
  ReactAgentRejectionReason,
  ReactAgentService,
} from "./types";
export { RECOGNIZED_REACT_AGENT_INTENTS } from "./types";

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
 * CS-1 boundary implementation of the `ReactAgentService` contract. A thin object wrapper
 * around the dispatcher so callers can depend on the interface; CS-2+ can swap in a real
 * implementation behind the same seam (and, later, an `AgentRuntimeAdapter` for Hermes).
 */
export const reactAgentService: ReactAgentService = {
  handle: dispatchReactAgentRequest,
};
