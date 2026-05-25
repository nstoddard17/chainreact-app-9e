/**
 * Confirmed WorkflowPatch apply service (Slice 4.AI-6).
 *
 * Deterministic, permission-checked, confirmation-aware apply of a validated
 * WorkflowPatch to a saved workflow. Re-validates at apply time against the
 * unredacted repo definition; never trusts a client preview. No model calls,
 * no UI, no auto-apply, no billing deduction. See
 * docs/slices/phase-4/ai-architecture-react-agent-plan.md §6/§8.
 */

export { applyWorkflowPatchForAI } from "./applyWorkflowPatch";
export type {
  ApplyWorkflowPatchInput,
  ApplyWorkflowPatchResult,
  ApplyWorkflowPatchSuccess,
  ApplyWorkflowPatchFailure,
  ApplyConfirmation,
  ApplyErrorCode,
  AppliedWorkflowSummary,
} from "./types";
