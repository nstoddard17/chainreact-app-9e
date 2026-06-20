/**
 * AI workflow-guidance — public surface (HOSTED-HERMES-GUIDANCE-FOUNDATION-1).
 *
 * Hermes-READY foundation, not a live Hermes integration: provider-neutral contracts, the
 * `WorkflowGuidanceProvider` port, the privacy-boundary sanitizer, the intake seam, the noop
 * default, and the hosted-Hermes adapter SKELETON (gated, no transport → no live call).
 */

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
  WorkflowGuidanceProvider,
} from "./types";
export { AI_GUIDANCE_SCHEMA_VERSION } from "./types";

export {
  sanitizeWorkflowForGuidance,
  type SanitizeWorkflowForGuidanceInput,
  type SanitizedWorkflowGuidance,
} from "./sanitizeWorkflowForGuidance";
export { requestWorkflowGuidance, type WorkflowGuidanceIntakeInput } from "./workflowGuidanceIntake";
export { noopWorkflowGuidanceProvider } from "./noopGuidanceProvider";
export {
  createHostedHermesGuidanceProvider,
  hostedHermesGuidanceProvider,
  type HermesGuidanceTransport,
  type HostedHermesGuidanceDeps,
} from "./hostedHermesGuidanceProvider";
export { isHostedHermesGuidanceEnabled, HOSTED_HERMES_GUIDANCE_FLAG } from "./flags";
export { getHermesGuidanceConfig, HERMES_ENV, type HermesGuidanceConfig } from "./hermesConfig";
