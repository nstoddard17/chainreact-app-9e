import type { GuidanceConversationTurn, GuidanceUnavailableCode, WorkflowGuidanceRequest } from "@/contracts/aiGuidance";
import type { WorkflowPlan } from "@/contracts/guidanceSession";
import {
  requestHermesAgentGuidanceNormalized,
  type GatewayFetch,
} from "./gateway/hermesAgentGatewayClient";
import { getHermesAgentGatewayConfig, isHermesAgentEnabled } from "./gateway/gatewayConfig";

/**
 * REACT-LIVE-SKELETON-3 — anonymous (logged-out) workflow PLANNING.
 *
 * The server-only seam that runs the SAME model-backed guidance the authenticated rail uses, but with
 * NO account scope, NO governance/audit, NO credit gate, and NO account/workflow/credential context —
 * because an anonymous visitor has none. It reuses the gateway client + its plan validation directly
 * (the normalizer only surfaces a `workflowPlan` after `validateWorkflowPlan` passes → fail closed).
 *
 * STRICTLY ADVISORY / PLANNING-ONLY:
 *   - gated by `HERMES_AGENT_ENABLED` + gateway config (disabled/unconfigured → typed unavailable, NO
 *     network call);
 *   - sends ONLY the bounded goal text + bounded recent turns — never a workflow definition, account
 *     id, user id, credential list, or any private context (the request shape is the empty workflow);
 *   - creates / saves / connects / runs / activates NOTHING; returns validated advisory guidance only;
 *   - the gateway token lives only inside the gateway client — never here, never echoed.
 *
 * The per-attempt cap + abuse controls live in the route ([app/api/ai/anonymous-workflow-guidance]).
 */

export type AnonymousGuidanceResult =
  | {
      readonly ok: true;
      readonly guidanceText: string;
      readonly workflowPlan: WorkflowPlan | null;
      readonly warnings?: readonly string[];
    }
  | { readonly ok: false; readonly code: GuidanceUnavailableCode; readonly message: string };

/** Static, leak-safe copy. No ids / tokens / config / raw model text. */
const UNAVAILABLE_MESSAGE =
  "Workflow planning isn't available right now. Nothing has been saved, connected, or run.";

/** Anonymous requests carry NO workflow context — always the empty, de-identified shape. */
const EMPTY_REQUEST: WorkflowGuidanceRequest = {
  schemaVersion: 1,
  guidanceKind: "workflow_design",
  workflow: { nodeCount: 0, edgeCount: 0, nodes: [], edges: [] },
};

export async function runAnonymousWorkflowGuidance(input: {
  goalText: string;
  recentTurns?: readonly GuidanceConversationTurn[];
  /** Test seam — injected mock gateway fetch (no live call in CI). */
  fetchImpl?: GatewayFetch;
}): Promise<AnonymousGuidanceResult> {
  // Gate BEFORE any network: disabled / unconfigured → unavailable, no fetch.
  if (!isHermesAgentEnabled()) return { ok: false, code: "PROVIDER_DISABLED", message: UNAVAILABLE_MESSAGE };
  const config = getHermesAgentGatewayConfig();
  if (!config) return { ok: false, code: "PROVIDER_NOT_CONFIGURED", message: UNAVAILABLE_MESSAGE };

  const guidance = await requestHermesAgentGuidanceNormalized({
    request: EMPTY_REQUEST,
    config,
    goalText: input.goalText,
    ...(input.recentTurns && input.recentTurns.length ? { recentTurns: input.recentTurns } : {}),
    // No `context` and no `capabilityCatalog` — anonymous gets no account/credential context. The
    // gateway/Hermes side owns capability knowledge; ChainReact still validates the returned plan.
    ...(input.fetchImpl ? { fetchImpl: input.fetchImpl } : {}),
  });

  if (!guidance.ok) return { ok: false, code: guidance.code, message: UNAVAILABLE_MESSAGE };

  return {
    ok: true,
    guidanceText: guidance.guidanceText,
    workflowPlan: guidance.workflowPlan,
    ...(guidance.warnings ? { warnings: guidance.warnings } : {}),
  };
}
