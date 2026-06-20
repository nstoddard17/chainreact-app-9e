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
export type ReactAgentCapabilityId = "diagnosis_qa";

/**
 * How a capability affects workflow state. Drives later approval/audit policy. CS-3 wires
 * only a `read_only` capability; `proposes_change` / `requires_approval` are declared for
 * the repair-proposal/apply capabilities that land in later slices.
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
 * The allow-list. `diagnosis_qa` is the only wired capability (CS-2/CS-3) — read-only,
 * credit-gated upstream as `workflow_qa` by the Q&A route.
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
});

/** Look up a capability by id. Accepts an arbitrary string so a cast/untyped caller still
 *  fails closed (returns `undefined` → `unknown_capability`) at runtime. */
export function getReactAgentCapability(
  id: string,
): ReactAgentCapabilityDefinition | undefined {
  return (REACT_AGENT_CAPABILITIES as Record<string, ReactAgentCapabilityDefinition>)[id];
}
