/**
 * React Agent capability registry (REACT-AGENT-CS-3-CAPABILITY-REGISTRY).
 *
 * An explicit ALLOW-LIST of the capabilities that may execute through the server-side
 * `runAuthorizedCapability` seam. CS-2 let a route pass an arbitrary `{ intent, exec }`
 * pair; this registry makes the wired pairs explicit so the boundary can never become a
 * generic "run anything" pipe — only a known `(capabilityId → allowedIntent)` pair runs.
 *
 * What the registry GUARANTEES: only a registered capability, called with its declared
 * intent, reaches `exec`. What it does NOT do: it does NOT authorize, gate credits, or
 * derive DTOs — the ROUTE still owns auth / account-membership / safe-DTO derivation /
 * `aiCreditGate` / telemetry. `creditFeature` here is DOCUMENTATION + the future audit
 * trail, not an enforcement point. This registry is NOT Hermes and NOT MCP.
 *
 * Pure types + a frozen map. Imports only local types (keeps the boundary import-fenced).
 */

import type { ReactAgentIntent } from "./types";

/** Registered capability ids. Add a new id here AND an entry below to wire a capability. */
export type ReactAgentCapabilityId =
  | "diagnosis_qa"
  | "diagnosis_explain"
  | "repair_proposal"
  | "repair_apply"
  | "workflow_guidance_intake";

/**
 * How a capability affects workflow state. Drives later approval/audit policy. CS-3/CS-4
 * wired only `read_only` capabilities; CS-6 wired the first `proposes_change` capability
 * (repair proposal — propose + preview only, NEVER autonomous apply). CS-7c REGISTERS the
 * first `requires_approval` capability (`repair_apply`) — registration only; the apply route
 * is NOT wired through the seam yet (CS-7d), so nothing mutates a workflow via this capability.
 */
export type ReactAgentCapabilityMode =
  | "read_only"
  | "proposes_change"
  | "requires_approval";

export interface ReactAgentCapabilityDefinition {
  readonly id: ReactAgentCapabilityId;
  /** The single `ReactAgentIntent` this capability may run for. */
  readonly allowedIntent: ReactAgentIntent;
  readonly mode: ReactAgentCapabilityMode;
  /**
   * The `ai_cost_events.feature` key the ROUTE gates/charges with, or `null` for a
   * deterministic/0-credit capability. **Documentation + audit only** — the registry does
   * NOT charge credits; the route's `aiCreditGate` remains the single enforcement point.
   */
  readonly creditFeature: string | null;
  /** Placeholder audit-event kind for the CS-4 audit model. Not yet emitted. */
  readonly auditKind: string;
}

/**
 * The allow-list. The two read-only capabilities are credit-gated upstream by their route
 * (`workflow_qa` / `workflow_explanation`); `repair_proposal` is the first `proposes_change`
 * capability (CS-6) and is gated as `workflow_repair`. `creditFeature` here MUST match the
 * `aiCreditGate` feature the corresponding route charges (kept in lockstep by test).
 *
 * `repair_proposal` covers BOTH LLM repair-proposal routes — `…/ai/repair/plan`
 * (natural-language proposal, `planWorkflowRepair`) and `…/ai/repair/preview`
 * (validated-patch preview, `previewWorkflowRepair`) — since both GENERATE an AI repair
 * proposal and charge `workflow_repair`. It is PROPOSE + PREVIEW only.
 *
 * `repair_apply` (CS-7c) is the `requires_approval` APPLY capability — `creditFeature: null`
 * because apply is deterministic and 0-credit (never a model call). REGISTERED ONLY: the
 * guarded persistence route `…/ai/repair/apply` is NOT yet routed through `runAuthorizedCapability`
 * (CS-7d), so registering this id mutates nothing. Until then it is reachable only as a
 * registry entry that `runAuthorizedCapability` would match for the `apply_repair` intent.
 */
export const REACT_AGENT_CAPABILITIES: Readonly<
  Record<ReactAgentCapabilityId, ReactAgentCapabilityDefinition>
> = Object.freeze({
  diagnosis_qa: Object.freeze({
    id: "diagnosis_qa",
    allowedIntent: "answer_diagnosis_question",
    mode: "read_only",
    creditFeature: "workflow_qa",
    auditKind: "react_agent.diagnosis_qa",
  }),
  diagnosis_explain: Object.freeze({
    id: "diagnosis_explain",
    allowedIntent: "explain_diagnosis",
    mode: "read_only",
    creditFeature: "workflow_explanation",
    auditKind: "react_agent.diagnosis_explain",
  }),
  repair_proposal: Object.freeze({
    id: "repair_proposal",
    allowedIntent: "propose_repair",
    mode: "proposes_change",
    creditFeature: "workflow_repair",
    auditKind: "react_agent.repair_proposal",
  }),
  repair_apply: Object.freeze({
    id: "repair_apply",
    allowedIntent: "apply_repair",
    mode: "requires_approval",
    creditFeature: null,
    auditKind: "react_agent.repair_apply",
  }),
  // HERMES-AGENT-CAPABILITY — advisory workflow-guidance intake. `read_only` (never mutates/runs a
  // workflow). `creditFeature: null` — there is NO billing gate for Hermes Agent guidance yet (gap
  // documented in docs/runbooks/hermes-agent-render-prod.md); the capability is gated by
  // `HERMES_AGENT_ENABLED` (default OFF) and is server-only, not wired to any route/UI in this slice.
  workflow_guidance_intake: Object.freeze({
    id: "workflow_guidance_intake",
    allowedIntent: "request_workflow_guidance",
    mode: "read_only",
    creditFeature: null,
    auditKind: "react_agent.workflow_guidance_intake",
  }),
});

/** Look up a capability by id. Accepts an arbitrary string so a cast/untyped caller still
 *  fails closed (returns `undefined` → `unknown_capability`) at runtime. */
export function getReactAgentCapability(
  id: string,
): ReactAgentCapabilityDefinition | undefined {
  return (REACT_AGENT_CAPABILITIES as Record<string, ReactAgentCapabilityDefinition>)[id];
}
