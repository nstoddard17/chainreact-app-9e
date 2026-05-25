/**
 * Failed-run repair proposal service (Slice 4.AI-7).
 *
 * Deterministic, read-only. Proposes (and previews via AI-5) safe WorkflowPatch
 * repairs for failed runs; never applies, never mutates, no model calls, no UI.
 * See docs/slices/phase-4/ai-architecture-react-agent-plan.md §3/§8.
 */

export { suggestWorkflowRepairForAI } from "./suggestWorkflowRepair";
export type {
  SuggestWorkflowRepairInput,
  RepairSuggestionResult,
  RepairSuggestionSuccess,
  RepairSuggestionFailure,
  RepairFailureSummary,
  Repairability,
  RepairReasonCode,
  RepairConfidence,
  RequiredUserInput,
  RequiredUserInputKind,
} from "./types";
