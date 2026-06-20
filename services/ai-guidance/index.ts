/**
 * AI workflow-guidance — public surface (provider-neutral, Hermes-Agent-ready).
 *
 * After the HERMES-AGENT pivot (2026-06-20) this module keeps ONLY the generic, transport-neutral
 * guidance primitives that any guidance brain can sit behind — it no longer contains the direct
 * Nous hosted-model adapter, its HERMES_* config/flag, the model prompt builder, or the OpenAI
 * fallback policy (all removed). The future Hermes Agent client will implement
 * `WorkflowGuidanceProvider` and plug in behind this same port; the noop provider is the default.
 *
 * What lives here (all generic):
 *   - provider-neutral guidance contracts + the `WorkflowGuidanceProvider` port,
 *   - the privacy-boundary sanitizer (safe DTO — the only shape that may leave ChainReact),
 *   - the intake seam (sanitize → ask a provider; never mutates / never calls a model directly),
 *   - the deterministic WorkflowPlan capability validator (ChainReact is the source of truth),
 *   - the private→global sanitized skill-event boundary (generalized skills only, no raw user data).
 *
 * See docs/slices/phase-5/hermes-agent-chainreact-architecture-spike.md for the target shape.
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

// Conversational guidance + global-learning contracts (generic; not tied to any model API).
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
export { toSanitizedSkillEvent, type ToSanitizedSkillEventInput } from "./skillEventBoundary";
