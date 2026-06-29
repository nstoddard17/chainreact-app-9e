/**
 * Types for the failed-run repair proposal service (Slice 4.AI-7).
 *
 * AI-7 inspects a FAILED workflow run, classifies the failure deterministically,
 * and — only when safe — proposes a `WorkflowPatch` that is previewed through
 * AI-5. It NEVER applies, never mutates, never calls a model, and never invents
 * config values / providers / actions / fields. Auth / disconnected-integration
 * failures become recommendations, not patches.
 *
 * Plan reference: docs/slices/phase-4/ai-architecture-react-agent-plan.md §3/§8.
 */

import type { PatchOperation, WorkflowPatch } from "@/services/workflows/patch/types";
import type { PatchPreviewResult } from "@/services/ai/preview/types";

export interface SuggestWorkflowRepairInput {
  readonly userId: string;
  readonly workflowId: string;
  readonly workflowRunId: string;
}

/** Humanized, value-free summary of why the run failed. */
export interface RepairFailureSummary {
  readonly failed: boolean;
  readonly status: "succeeded" | "failed";
  readonly isTest: boolean;
  readonly failedNodeId: string | null;
  /** Engine/handler error code of the first failed step or the fatal error. */
  readonly errorCode: string | null;
  /** The run's stored humanized classification (the same safe text the UI shows). */
  readonly classification: {
    readonly title: string;
    readonly description: string;
    readonly hint?: string;
    // CR-FAILREASON-1 — lockstep with HumanizedError / WorkflowRunErrorClassification.
    readonly action?:
      | "reconnect"
      | "open_node"
      | "retry_later"
      | "upgrade_plan"
      | "contact_support";
    readonly severity: "warning" | "error";
  } | null;
}

export type Repairability = "repairable" | "needsUserInput" | "noSafeRepair";

export type RepairReasonCode =
  | "RUN_NOT_FAILED"
  | "MISSING_REQUIRED_FIELD"
  | "INVALID_VARIABLE_REFERENCE"
  | "DISCONNECTED_INTEGRATION"
  | "UNKNOWN_NODE_METADATA"
  | "INVALID_EDGE"
  | "MISSING_TRIGGER"
  | "MULTIPLE_TRIGGERS"
  | "BILLING_LIMIT"
  | "FAILED_PREVIEW"
  | "NO_DETERMINISTIC_REPAIR";

export type RequiredUserInputKind =
  | "config_value"
  | "select_integration"
  | "choose_trigger"
  | "variable_reference";

export interface RequiredUserInput {
  readonly nodeId: string;
  readonly field?: string;
  readonly label: string;
  readonly kind: RequiredUserInputKind;
}

export type RepairConfidence = "high" | "medium" | "low";

/**
 * What a category strategy produces BEFORE the orchestrator runs preview. The
 * orchestrator turns `operations` into a `WorkflowPatch`, previews it, and may
 * downgrade `repairability` to `noSafeRepair` if the preview rejects it.
 */
export interface StrategyOutcome {
  readonly repairability: Repairability;
  readonly reasonCode: RepairReasonCode;
  /** Empty when the strategy proposes no patch (recommendation-only). */
  readonly operations: readonly PatchOperation[];
  readonly requiredUserInput: readonly RequiredUserInput[];
  readonly recommendations: readonly string[];
  readonly confidence: RepairConfidence;
  readonly safetyNotes: readonly string[];
}

export interface RepairSuggestionSuccess {
  readonly ok: true;
  readonly workflowId: string;
  readonly workflowRunId: string;
  readonly failureSummary: RepairFailureSummary;
  readonly repairability: Repairability;
  readonly reasonCode: RepairReasonCode;
  /** Present only when a safe patch was produced AND it passed AI-5 preview. */
  readonly proposedPatch?: WorkflowPatch;
  /** The AI-5 preview of `proposedPatch`, when one exists and validated. */
  readonly preview?: PatchPreviewResult;
  readonly requiredUserInput: readonly RequiredUserInput[];
  readonly recommendations: readonly string[];
  readonly confidence: RepairConfidence;
  readonly safetyNotes: readonly string[];
  /** Always true — AI-7 is read-only and never applies. */
  readonly noMutation: true;
}

export type RepairErrorCode = "NOT_FOUND" | "READ_FAILED";

export interface RepairSuggestionFailure {
  readonly ok: false;
  readonly code: RepairErrorCode;
  readonly message: string;
  readonly noMutation: true;
}

export type RepairSuggestionResult =
  | RepairSuggestionSuccess
  | RepairSuggestionFailure;
