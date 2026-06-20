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
export {
  getHermesGuidanceConfig,
  describeHermesConfigStatus,
  HERMES_ENV,
  HERMES_REQUIRED_VARS,
  type HermesGuidanceConfig,
  type HermesConfigStatus,
} from "./hermesConfig";

// HOSTED-HERMES-GUIDANCE-BRAIN-2 — session/skill-event contracts, Nous adapter, prompt builder,
// capability validator, private→global boundary, fallback policy skeleton.
export type {
  GuidanceSession,
  GuidanceTurn,
  GuidanceTurnRole,
  GuidanceSessionStatus,
  WorkflowGuidanceIntent,
  WorkflowPlan,
  WorkflowPlanStep,
  WorkflowPlanStepRole,
} from "@/contracts/guidanceSession";
export { WORKFLOW_PLAN_SCHEMA_VERSION } from "@/contracts/guidanceSession";
export type {
  SanitizedSkillEvent,
  GeneralizedSkillStep,
  SkillEventKind,
  SkillEventOutcome,
  GuidancePattern,
} from "@/contracts/guidanceSkillEvents";
export { SKILL_EVENT_SCHEMA_VERSION } from "@/contracts/guidanceSkillEvents";

export { validateWorkflowPlan, isPlanStepKnown, type ValidateWorkflowPlanResult, type InvalidPlanStep } from "./validateWorkflowPlan";
export { buildWorkflowGuidancePrompt, redactSecretsFromText, type GuidanceChatMessage, type BuildGuidancePromptInput } from "./buildWorkflowGuidancePrompt";
export { toSanitizedSkillEvent, type ToSanitizedSkillEventInput } from "./skillEventBoundary";
export {
  createNousHermesGuidanceProvider,
  requestNousWorkflowGuidance,
  defaultCapabilityCatalog,
  type NousGuidanceDeps,
  type HermesFetch,
  type HermesHttpResponse,
} from "./nousHermesAdapter";
export {
  decideGuidanceFallback,
  isHermesOpenAiFallbackEnabled,
  HERMES_OPENAI_FALLBACK_FLAG,
  type GuidanceFallbackDecision,
  type GuidanceFallbackInput,
} from "./guidanceFallbackPolicy";
