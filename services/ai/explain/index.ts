/**
 * Read-only workflow explainer (Slice 4.AI-4).
 *
 * Deterministic, grounded explanations composed over the AI-2 context tools.
 * No model calls, no mutation, no DB writes. See
 * docs/slices/phase-4/ai-architecture-react-agent-plan.md §2/§3.
 */

export { explainWorkflowForAI } from "./explainWorkflow";
export { explainNodeForAI } from "./explainNode";

export type {
  WorkflowExplanation,
  WorkflowExplanationTrigger,
  WorkflowExplanationStep,
  WorkflowExplanationEdge,
  WorkflowExplanationValidation,
  NodeExplanation,
  NodeConfigFieldExplanation,
  ConfigFieldStatus,
} from "./types";
