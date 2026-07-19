/**
 * Types for the confirmed WorkflowPatch apply service (Slice 4.AI-6).
 *
 * AI-6 is the FIRST AI slice that may mutate a saved workflow, so it is strict:
 * it re-validates at apply time against the UNREDACTED repo definition, never
 * trusts a client-supplied preview, and refuses to apply invalid or
 * unconfirmed-high-risk patches. No model calls, no agent loop, no UI, no
 * auto-apply, no billing deduction.
 *
 * Plan reference: docs/slices/phase-4/ai-architecture-react-agent-plan.md §6/§8.
 */

import type { RiskLevel } from "@/contracts/actionMeta";
import type { WorkflowState } from "@/contracts/workflow";
import type { WorkflowCostEstimate } from "@/services/billing/workflowCostEstimator";
import type {
  PatchValidationError,
  RiskReason,
  WorkflowPatch,
} from "@/services/workflows/patch/types";

/**
 * Caller confirmation. Kept intentionally small (no token infrastructure yet):
 * an explicit `confirmed: true` is required whenever deterministic validation
 * says `requiresConfirmation`. When `acceptedRiskLevel` is supplied it MUST
 * match the validator's recomputed risk level — a stale low-risk confirmation
 * can never authorize a high-risk patch.
 */
export interface ApplyConfirmation {
  readonly confirmed: boolean;
  readonly confirmationToken?: string;
  readonly acceptedRiskLevel?: string;
  readonly acceptedAt?: string;
}

export interface ApplyWorkflowPatchInput {
  readonly userId: string;
  readonly workflowId: string;
  readonly patch: WorkflowPatch;
  readonly confirmation?: ApplyConfirmation;
}

export type ApplyErrorCode =
  | "NOT_FOUND" // workflow missing OR not owned (existence never leaked)
  | "PATCH_INVALID" // envelope/structural failure (Zod / missing baseRevision)
  | "UNSUPPORTED_OPERATION" // unknown op discriminator
  | "VALIDATION_FAILED" // semantic validation failed (registry/config/variable/edge)
  | "CONFIRMATION_REQUIRED" // high-risk/destructive patch needs explicit confirm
  | "STALE_PATCH" // baseRevision != current workflow revision (updatedAt)
  | "PLAN_FEATURE_REQUIRED" // BRANCH-ENT-1: advanced branching needs Pro+; nothing persisted
  | "UPDATE_FAILED"; // the repository persist call failed

/** Safe, value-free summary of the workflow after apply. */
export interface AppliedWorkflowSummary {
  readonly id: string;
  readonly name: string;
  readonly state: WorkflowState;
  readonly nodeCount: number;
  readonly edgeCount: number;
}

export interface ApplyWorkflowPatchSuccess {
  readonly ok: true;
  readonly workflowId: string;
  readonly appliedPatchId: string;
  readonly appliedOperationCount: number;
  readonly affectedNodeIds: readonly string[];
  readonly affectedEdgeIds: readonly string[];
  /** Deterministic — from the validator, never trusted from the patch. */
  readonly riskLevel: RiskLevel;
  readonly requiresConfirmation: boolean;
  readonly riskReasons: readonly RiskReason[];
  /** COST-2 estimate over the applied definition (no deduction occurs). */
  readonly taskCostEstimate?: WorkflowCostEstimate;
  /** Safe summary — never the definition / config. */
  readonly workflow: AppliedWorkflowSummary;
  /** New revision token (the workflow's updatedAt after persist). */
  readonly updatedAt: string;
  readonly summaryText: string;
}

export interface ApplyWorkflowPatchFailure {
  readonly ok: false;
  readonly code: ApplyErrorCode;
  /** User-explainable; never contains secrets / config values. */
  readonly message: string;
  /** Sanitized validation errors when the failure is validation-related. */
  readonly errors?: readonly PatchValidationError[];
}

export type ApplyWorkflowPatchResult =
  | ApplyWorkflowPatchSuccess
  | ApplyWorkflowPatchFailure;
