/**
 * WorkflowPatch module (Slice 4.AI-3) — public surface.
 *
 * Deterministic schema + validator for AI-proposed workflow changes. No model
 * calls, no DB writes, no workflow mutation, no apply-to-database (that is a
 * later slice). The validator grounds every claim in the real discovery
 * registry and reuses the COST-2 estimator for task-cost.
 */

export {
  WorkflowPatchSchema,
  PatchOperationSchema,
  SUPPORTED_OPERATION_KINDS,
} from "./workflowPatchSchema";
export {
  applyPatchToDefinition,
  type ApplyPatchResult,
} from "./applyPatchToDefinition";
export { validateWorkflowPatch } from "./validateWorkflowPatch";
export type {
  WorkflowPatch,
  PatchOperation,
  PatchOperationKind,
  PatchValidationResult,
  PatchValidationError,
  PatchValidationWarning,
  PatchErrorCode,
  PatchWarningCode,
  RiskReason,
  RiskReasonCode,
  ValidateWorkflowPatchOptions,
} from "./types";
