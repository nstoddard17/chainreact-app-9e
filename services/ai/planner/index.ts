/**
 * Workflow planner contract (Slice 4.AI-8A) — public surface.
 *
 * The deterministic prompt/result boundary for future ground-up workflow
 * creation. NO live model calls, NO workflow creation/mutation, NO preview/apply
 * in this slice. AI-8B connects a real model client + runs the parsed patch
 * through the AI-3 validator and AI-5 preview before anything becomes usable.
 *
 * See docs/slices/phase-4/ai-architecture-react-agent-plan.md §4/§6.
 */

export {
  buildWorkflowPlanPrompt,
  PLANNER_CONSTRAINTS,
  TEMPLATE_FUTURE_NOTE,
} from "./buildWorkflowPlanPrompt";
export { buildWorkflowPlanRequest } from "./buildWorkflowPlanRequest";
export { parseWorkflowPlanResponse } from "./parseWorkflowPlanResponse";
export {
  WORKFLOW_PLAN_FEATURE,
  type WorkflowPlanPromptInput,
  type WorkflowPlanRequestInput,
  type WorkflowPlanCostAwareness,
  type WorkflowPlanResponse,
  type PlanConfidence,
  type PlanRequiredUserInput,
  type PlanRequiredUserInputKind,
  type ParseWorkflowPlanResult,
  type ParseWorkflowPlanSuccess,
  type ParseWorkflowPlanFailure,
  type PlanParseErrorCode,
} from "./types";
