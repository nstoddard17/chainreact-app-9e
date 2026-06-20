/**
 * AI workflow-guidance ports (HOSTED-HERMES-GUIDANCE-FOUNDATION-1).
 *
 * `WorkflowGuidanceProvider` is the provider-neutral ADAPTER port. A future hosted brain
 * (Nous Hermes) is ONE implementation behind it; the noop provider is the default. This is
 * the concrete first instance of the "`AgentRuntimeAdapter` for Hermes" idea referenced in
 * the React Agent boundary — scoped narrowly to advisory WORKFLOW GUIDANCE.
 */

import type { GuidanceResult, WorkflowGuidanceRequest } from "@/contracts/aiGuidance";

export type {
  GuidanceKind,
  GuidanceResult,
  GuidanceUnavailableCode,
  GeneralizedWorkflow,
  GeneralizedWorkflowNode,
  GeneralizedWorkflowEdge,
  WorkflowGuidanceRequest,
  WorkflowGuidanceResponse,
  WorkflowGuidanceSuggestion,
} from "@/contracts/aiGuidance";
export { AI_GUIDANCE_SCHEMA_VERSION } from "@/contracts/aiGuidance";

/**
 * Provider-neutral guidance adapter. Implementations receive ONLY the already-sanitized,
 * de-identified `WorkflowGuidanceRequest` (the privacy boundary runs before this) and return
 * a safe `GuidanceResult`. A provider MUST NOT mutate a workflow, call ChainReact mutation
 * services, or read the DB — it is an advice source, not an actor.
 */
export interface WorkflowGuidanceProvider {
  readonly providerId: string;
  getWorkflowGuidance(request: WorkflowGuidanceRequest): Promise<GuidanceResult>;
}
