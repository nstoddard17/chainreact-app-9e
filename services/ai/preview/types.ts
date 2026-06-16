/**
 * Types for the deterministic WorkflowPatch preview service (Slice 4.AI-5).
 *
 * The preview composes the AI-3 validator (`validateWorkflowPatch`) and the
 * AI-4 explainer (`explainWorkflowDefinition`) into a safe, read-only "what
 * would change" view BEFORE any apply/save exists. NO model calls, NO DB
 * writes, NO mutation, NO UI.
 *
 * Plan reference: docs/slices/phase-4/ai-architecture-react-agent-plan.md §6.
 *
 * No-leak contract: every field below is built from ids, registry display
 * labels, field KEY names, edge ids, risk metadata, and cost classification —
 * NEVER from resolved config VALUES. Secret-shaped config keys are filtered
 * out of change summaries entirely.
 */

import type { RiskLevel } from "@/contracts/actionMeta";
import type { WorkflowDefinition } from "@/contracts/workflow";
import type { WorkflowCostEstimate } from "@/services/billing/workflowCostEstimator";
import type {
  PatchErrorCode,
  PatchOperation,
  PatchOperationKind,
  PatchValidationError,
  PatchValidationWarning,
  RiskReason,
  WorkflowPatch,
} from "@/services/workflows/patch/types";
import type { WorkflowDefinitionExplanation } from "@/services/ai/explain/explainDefinition";

export interface PreviewWorkflowPatchInput {
  readonly userId: string;
  readonly workflowId: string;
  readonly patch: WorkflowPatch;
  /**
   * Slice 4.AI-REPAIR-2b — OPTIONAL trusted, already-validated current-draft
   * definition (the unsaved builder canvas the user sees). When provided, the
   * patch is validated/previewed against THIS instead of the saved definition, so
   * the preview matches what the diagnosis used. Ownership + name + revision still
   * come from the saved record load. Secrets are redacted before use; the draft is
   * NEVER persisted. Absent → the saved definition is the validation target.
   */
  readonly draftDefinition?: WorkflowDefinition;
}

/** One deterministic, value-free description of a single patch operation. */
export interface PatchChangeSummary {
  readonly op: PatchOperationKind;
  /** Human-readable; never contains config VALUES. */
  readonly description: string;
  readonly nodeId?: string;
  readonly edgeId?: string;
  /** For config edits: the NON-secret field KEY names touched (no values). */
  readonly fields?: readonly string[];
}

export interface PreviewValidation {
  readonly ok: boolean;
  readonly errors: readonly PatchValidationError[];
  readonly warnings: readonly PatchValidationWarning[];
}

export interface PatchPreviewResult {
  /** True iff the patch is valid and could be applied later. */
  readonly ok: boolean;
  readonly workflowId: string;
  /**
   * The workflow's current revision token (its `updatedAt`). Safe metadata.
   * Callers MUST set `patch.baseRevision = currentRevision` before applying via
   * AI-6 — apply rejects (`STALE_PATCH`) when they differ. Always present when
   * the workflow loaded (a NOT_FOUND surfaces as an AiToolError, not here).
   */
  readonly currentRevision: string;
  readonly patchId: string;
  readonly patchSummary: string;
  readonly validation: PreviewValidation;
  readonly changes: readonly PatchChangeSummary[];
  readonly affectedNodeIds: readonly string[];
  readonly affectedEdgeIds: readonly string[];
  /** Deterministic — from the AI-3 validator, never trusted from the patch. */
  readonly riskLevel: RiskLevel;
  readonly requiresConfirmation: boolean;
  readonly riskReasons: readonly RiskReason[];
  /** From the COST-2 estimator over the candidate. Undefined if it failed. */
  readonly taskCostEstimate?: WorkflowCostEstimate;
  /** Explanation of the current (pre-patch) workflow. */
  readonly beforeSummary: WorkflowDefinitionExplanation;
  /** Explanation of the candidate (post-patch) workflow — only when valid. */
  readonly afterSummary?: WorkflowDefinitionExplanation;
  /** One-line compact summary of the candidate — only when valid. */
  readonly candidateSummary?: string;
  /** Deterministic plain-English summary of the whole preview. */
  readonly userFacingSummaryText: string;
  /** Whether a future apply step (AI-6) would be permitted (== validation.ok). */
  readonly canApplyLater: boolean;
  /** Set when `ok` is false — the first blocking error, code + message. */
  readonly blockedReason?: string;
  /**
   * AI-REPAIR-3E — server-computed apply readiness for THIS preview. `applyable` is
   * true ONLY when validation passed AND every operation is apply-eligible (no
   * secret / credential / recipient / destructive / whole-graph / trigger / unknown
   * op — via the shared `classifyOperationSafety`). The typed `operations` +
   * `baseRevision` are included ONLY when applyable, so they are SECRET-FREE by
   * construction (a secret-keyed op would block applyability). They are a
   * NON-RENDERED carrier the client forwards to the apply route — the UI shows the
   * value-free `changes`, never these. Not applyable ⇒ no operations ⇒ no Apply
   * affordance.
   */
  readonly apply: PreviewApplyReadiness;
}

export interface PreviewApplyReadiness {
  readonly applyable: boolean;
  /** Present ONLY when applyable — the typed operations to forward to the apply route. */
  readonly operations?: readonly PatchOperation[];
  /** Present ONLY when applyable — the revision the patch was built against. */
  readonly baseRevision?: string;
}

export type { PatchErrorCode };
